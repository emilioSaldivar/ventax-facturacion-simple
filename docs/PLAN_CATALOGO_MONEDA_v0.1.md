# PLAN - Catalogo de productos y servicios con moneda v0.1

SPEC: `docs/SPEC_CATALOGO_MONEDA_v0.1.md`. TASKS: `docs/TASKS_CATALOGO_MONEDA_v0.1.md`.

Orden: base, API y OpenAPI, pantalla del catalogo, editor de factura, pruebas, documentacion. La API y la base salen juntas (la API lee la columna nueva); el frontend se puede empezar en paralelo contra el contrato de OpenAPI.

## Base y despliegue

1. Migracion `db/migrations/0046_catalogo_moneda.sql` (ultima existente: `0045_backfill_perfil_documentos.sql`; verificar que siga libre al implementar, porque otras cadenas de la misma rama tambien agregan migraciones):

   ```sql
   -- SPEC_CATALOGO_MONEDA_v0.1 (RN-01, RN-02): moneda por articulo y precio con 2 decimales fuera de PYG.
   alter table catalogo_items add column if not exists moneda text not null default 'PYG';
   alter table catalogo_items drop constraint if exists catalogo_items_moneda_check;
   alter table catalogo_items add constraint catalogo_items_moneda_check check (moneda ~ '^[A-Z]{3}$');
   alter table catalogo_items alter column precio_unitario type numeric(18, 2);
   alter table catalogo_items drop constraint if exists catalogo_items_precio_moneda_check;
   alter table catalogo_items add constraint catalogo_items_precio_moneda_check
     check (moneda <> 'PYG' or precio_unitario = trunc(precio_unitario));
   create index if not exists catalogo_items_facturador_moneda_idx on catalogo_items (facturador_id, moneda) where deleted_at is null;
   ```

   El cast de `integer` a `numeric(18, 2)` no pierde datos (mismo criterio que `0042`). El check `catalogo_items_precio_unitario_check` (>= 0) se conserva.
2. La migracion corre con el contenedor `migrate` del stack (`bash scripts/deploy.sh` en local; en `segel-fs`, el procedimiento de `docs/TASKS_DESPLIEGUE_SEGEL_FS_v0.2.md` E-6). Es aditiva y reversible (quitar la columna y volver el tipo a `integer` solo si no hay articulos en otra moneda).

## API (`apps/api/src/modules/catalogo`)

1. `catalogo.types.ts`: `monedasCatalogo = ["PYG", "USD"] as const`, `MonedaCatalogo`; `moneda` en `CatalogoItem`, `CatalogoItemUpsertInput` (opcional) y `CatalogoItemPersistInput` (obligatorio); `moneda?` en los `input` de `list` y `search` del `CatalogoRepository`.
2. `catalogo.routes.ts`: en `catalogoItemSchema`, `precio_unitario: z.coerce.number().min(0)` (sin `int()`) y `moneda: z.enum(monedasCatalogo).default("PYG")`; en `listQuerySchema` y `searchQuerySchema`, `moneda: z.enum(monedasCatalogo).optional()`.
3. `catalogo.service.ts`, `normalizeCatalogoInput`: reemplaza la comprobacion de entero por `validarPrecioSegunMoneda(precio, moneda)`: PYG exige `Number.isInteger`; otra moneda exige `Number.isInteger(Math.round(precio * 100))` y `Math.abs(precio * 100 - Math.round(precio * 100)) < 1e-6` (sin flotantes sueltos), ambas con `>= 0`. Mensajes de RN-04 y RN-05. Devuelve `moneda` en el `PersistInput`.
4. `catalogo.repository.ts`: `moneda` en `select`, `insert`, `update` y `returning`; `mapRow` ya hace `Number(row.precio_unitario)`, que sirve para `numeric`. `list`: `and ($7::text is null or moneda = $7)`. `search`: `order by case when $6::text is not null and moneda = $6 then 0 else 1 end, case when codigo_normalizado = $4 then 0 else 1 end, descripcion` (RN-07).
5. `spec/openapi.yaml`: `CatalogoItem.moneda` (string, `^[A-Z]{3}$`, ejemplo `PYG`) y `precio_unitario: number` con la descripcion "Entero en PYG; hasta 2 decimales en otra moneda. Precio con IVA incluido."; `CatalogoItemUpsertRequest.moneda` (enum `[PYG, USD]`, default `PYG`); parametro `moneda` en `GET /catalogo/items` y `GET /catalogo/items/search`; la descripcion de `POST /catalogo/items` deja de decir que solo acepta guaranies.
6. Sin cambios en `facturas`: `POST /facturas` y `/facturas/preview` ya reciben `precio_unitario` con decimales fuera de PYG y `catalogo_item_id` opcional; no validan el precio contra el catalogo (y no deben hacerlo: el operador puede ajustarlo).

## Web (`apps/web-operacion`)

1. `src/tipos.ts`: `moneda: string` en `CatalogoItem`. Un helper `nombreMoneda(codigo)` en `src/lib/formato.ts` ("Gs." para PYG; el codigo para el resto) para los textos de RN-14. `formatMonto` ya existe.
2. `views/CatalogView.tsx`:
   - `CatalogoDraft` suma `moneda: "PYG" | "USD"`; `createCatalogoDraft` arranca en `PYG`; `openEdit` y `duplicar` copian la moneda del articulo (RN-12).
   - Formulario: en `.catalogo-form-fila` quedan "Moneda" (select), "Precio (Gs.)" o "Precio (USD)" y "IVA"; si la fila no entra en el panel de 360 px, "Moneda" pasa a una fila propia (verificar en 1280 con Playwright). El campo de precio usa `normalizeIntegerInput`/`formatIntegerInput` en PYG y `normalizeDecimalInput`/coma en USD, con la ayuda de RN-09 como `small.field-hint` (el mismo patron del editor, `main.tsx` ~2551).
   - Envio: `payload.moneda`, `precio_unitario: Number(draft.precio_unitario)`; la validacion local repite RN-05 antes del `POST`/`PATCH` para no ir al servidor por un error evidente, con los mismos mensajes.
   - Tabla y tarjetas: `formatMonto(item.precio_unitario, item.moneda)` en lugar de `formatGuaranies` (RN-10).
   - Filtros: segundo `filter-tabs` "Moneda" ("Todas", "Gs.", "USD") que agrega `moneda` a los `params` de `GET /catalogo/items` (RN-11). La grilla `.catalogo-filtros` (media query de 1024 px en `styles.css`) pasa a tres columnas; revisar que la busqueda siga ocupando el ancho libre.
3. `main.tsx`, `InvoiceEditor`:
   - `applyCatalogItem(lineId, item)`: `const mismaMoneda = item.moneda === moneda;` precio `mismaMoneda ? String(item.precio_unitario) : ""`, `lockedFromCatalog: mismaMoneda`, mensaje segun RN-13/RN-14. En USD el precio del articulo se escribe con punto decimal en el estado (`String(12.5)` → `"12.5"`), que es el formato interno que ya usa la grilla (`normalizeDecimalInput`).
   - `saveQuickCatalogItem(line)`: validacion por moneda (entero en PYG, hasta 2 decimales fuera) y `moneda` en el `POST`. Hay dos funciones con ese nombre (editor de factura ~1986 y `NotasView` ~3398); solo cambia la del editor de factura; la de notas sigue en PYG (RN-17).
   - `GrillaLineas`: `puedeGuardar` quita `!enMonedaExtranjera` y cambia `Number.isInteger(precio)` por la validacion por moneda; se elimina el `span` "Guardar en el catálogo no disponible en {moneda}" del `.grilla-pie` (~3000). Hoja de linea en celular: el boton "AGREGAR Y GUARDAR" (~2626-2636) se deshabilita con `!Number.isInteger(Number(activeLine.precio_unitario))` y lleva `title="El catálogo está en guaraníes"` fuera de PYG; pasa a la validacion por moneda y se quita el `title`.
   - Sugerencias del catalogo, dos lugares: la lista de la hoja de linea (~2558-2562, `formatGuaranies(item.precio_unitario) · formatIva`) y `ul.grilla-sugerencias` de la grilla (~2898-2912, que hoy oculta el precio fuera de PYG con `enMonedaExtranjera ? null : ...`). En los dos, `formatMonto(item.precio_unitario, item.moneda)` siempre visible (RN-15).
   - Busqueda: `GET /catalogo/items/search?q=...&limit=5&moneda=${moneda}` en el editor de factura (RN-07). `NotasView` no manda `moneda`.
4. `NotasView` (`main.tsx` ~3189 y ~3398): en `applyCatalogItem` equivalente de notas, si `item.moneda !== "PYG"` dejar el precio vacio con el mensaje "Item del catálogo en USD: cargá el precio en Gs." (RN-17). Cambio minimo.
5. Textos: con tildes y en voseo ("cargá", "Guaraníes", "Dólares"); sin emojis; selects y casillas con etiqueta visible (PAUTAS §7 y §8). Cerrar con la lista §12 de `PAUTAS_FRONTEND_v0.1.md`.

## Pruebas

1. vitest (`apps/api/tests/catalogo.service.test.ts`, hoy 9 casos): alta sin moneda → PYG; USD con 2 decimales OK; USD con 3 decimales 400; PYG con decimales 400; moneda no admitida 400; `list` y `search` pasan `moneda` al repositorio; `update` cambia la moneda. Repositorio en memoria del mismo archivo.
2. Playwright nuevo `scripts/segel-fs/playwright-catalogo-moneda.cjs` (mismo esqueleto que `playwright-ux-resto-app.cjs`: `ENSAYO_PASSWORD_FILE`, `ENSAYO_USER`, `SEGEL_APP_URL`, capturas en `test-results/catalogo-moneda/`), casos `catalogo` (CA-04, CA-05), `editor` (CA-06, CA-07, CA-08, interceptando `POST /catalogo/items` para comprobar el cuerpo y limpiando los articulos creados al final) y `api` (CA-01 a CA-03 por `fetch` con la sesion del operador). Sin emitir.
3. Regresion (CA-09): `playwright-ux-resto-app.cjs` caso `agenda` (usa "Precio (Gs.)", que se conserva en PYG), `playwright-editor-pc.cjs`, `playwright-ux-nueva-factura.cjs` con su CA-05 reescrito (hoy comprueba el texto "no disponible en USD" en `.grilla-pie`; pasa a comprobar que la casilla "Guardar en el catálogo" esta disponible en USD), `playwright-documentos-escritorio.cjs`, reconocimiento. `npm run test`, `typecheck`, `lint` en `apps/api`; `typecheck`, `build` en `apps/web-operacion`.
4. Stack: redeploy local con el script de la sesion (`desplegar.sh` del scratchpad o `bash scripts/deploy.sh`), API y frontend del mismo commit (`X-App-Version`).
5. CA-10: una emision en USD en SIFEN test desde el stack local, con aviso previo a la sesion de FE (`facturacion-electronica-7c`), despues de que todo lo demas este en verde.

## Coordinacion con FE

- No hay cambios de contrato ni pedidos a FE: el precio ya viaja en la moneda de la factura.
- Aviso previo a FE antes de la emision de CA-10 en SIFEN test (regla de la memoria del proyecto: toda emision real se avisa).
- Si en el futuro se habilitan mas monedas, la lista admitida se toma del catalogo `MONEDA` de `GET /v1/parametrizaciones/MONEDA` de FE; no hace falta en v0.1.

## Riesgos

- **Flotantes.** `12.5 * 100` es exacto, pero `1.15 * 100` no; la validacion de 2 decimales usa redondeo con tolerancia (API punto 3). El valor se guarda como `numeric(18, 2)`, asi que la base no acumula error.
- **Guiones existentes.** `playwright-ux-nueva-factura.cjs` CA-05 y `SPEC_UX_NUEVA_FACTURA` CA-05 contradicen RN-16: se actualizan en la misma cadena (TASKS CAM-010). Los textos "Precio (Gs.)" y "Item seleccionado del catálogo." se conservan para no romper `ux-resto-app` ni `editor-pc`.
- **Sesiones paralelas en la rama.** Otras cadenas (descuentos, nota de remision) tocan `main.tsx`, `styles.css`, `spec/openapi.yaml` y pueden tomar el numero `0046`. Releer `git log` y el archivo antes de editar; numerar la migracion al momento de crearla.
- **Hoja de linea en celular.** La casilla de guardado en catalogo en 390 px tiene su propia logica; si quedo deshabilitada por moneda en un lugar no listado, CA-08 en 390 lo detecta.
- **Produccion.** Hay articulos reales en `segel-fs`; la migracion los deja en PYG sin tocar el precio. El despliegue solo con orden directa del usuario.
