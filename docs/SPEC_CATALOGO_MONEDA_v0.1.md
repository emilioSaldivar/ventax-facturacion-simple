# SPEC - Catalogo de productos y servicios con moneda v0.1

Estado: borrador para implementar. Decisiones (a) a (d) tomadas por el usuario el 2026-11-11 (`docs/BACKLOG.md` FS-59, `docs/HOJA_DE_RUTA_v0.1.md` punto 1). Critico, comprometido para el 2026-11-12.

## Alineacion

- `AGENTS.md` (SDD, validacion con Playwright en 1440/1280/390, `spec/openapi.yaml` al cambiar el contrato).
- `docs/BACKLOG.md` FS-59 y `docs/HOJA_DE_RUTA_v0.1.md` punto 1.
- `docs/SPEC_MONEDA_EXTRANJERA_v0.1.md`: RN-02 (precios con hasta 2 decimales fuera de PYG), RN-04 (formato "Gs. 1.234.567" y "USD 1.234,50"), RN-08 (cambiar la moneda no convierte montos) y su seccion "Fuera de alcance", que dejaba el catalogo en guaranies. Esta SPEC reemplaza ese punto.
- `docs/SPEC_EDITOR_FACTURA_PC_v0.1.md` D-4 y CA-06, y `docs/SPEC_UX_NUEVA_FACTURA_v0.1.md` CA-05 ("guardar en el catalogo no esta disponible" en USD): quedan superados por RN-09 y RN-10.
- `docs/SPEC_UX_RESTO_APP_v0.1.md` R-4 y `docs/TASKS_UX_RESTO_APP_v0.1.md` URA-009: la pantalla del catalogo ya es tabla con panel lateral (`apps/web-operacion/src/views/CatalogView.tsx`).
- `docs/PAUTAS_FRONTEND_v0.1.md` (componentes, tokens, textos, lista §12).
- `docs/SPEC_VALIDACIONES_RECEPTOR_v0.1.md`: las validaciones de los datos del cliente son de esa cadena; esta no las toca.
- Guia de consumidores de FE, paquete v0.49 (`segel-rc4.32`): seccion 50 (moneda y tipo de cambio) y catalogo `MONEDA` de `GET /v1/parametrizaciones/MONEDA`.

## Origen

El catalogo guarda `catalogo_items.precio_unitario integer` sin moneda (`db/migrations/0006_catalogo.sql`); la API exige un entero (`catalogo.routes.ts`, `z.coerce.number().int().min(0)`; `normalizeCatalogoInput`, "Precio unitario debe ser un entero en guaranies.") y la pantalla rotula "Precio (Gs.)". En una factura en USD, elegir un articulo (`applyCatalogItem`, `main.tsx`) completa codigo, descripcion e IVA, deja el precio vacio con el aviso "Item del catálogo: el precio del catálogo está en guaraníes, cargá el precio en USD." y "Guardar en el catálogo" no esta disponible (`puedeGuardar` exige `!enMonedaExtranjera`; el pie de la grilla dice "Guardar en el catálogo no disponible en USD").

Un facturador que vende en dolares vuelve a escribir cada precio en cada factura y no puede armar su lista en esa moneda. El usuario lo marco como critico el 2026-11-11.

## Contrato de FE

No cambia. El precio de cada linea ya viaja a `POST /v1/factura` en la moneda de la factura (`moneda`, `tipoCambio`; guia §50; `SPEC_MONEDA_EXTRANJERA_v0.1`). El catalogo es un dato interno de FS: la moneda del articulo solo sirve para completar el precio en el editor y para mostrarlo. No se consulta a FE para el catalogo. El codigo de moneda sigue el ISO 4217 que acepta FE (catalogo `MONEDA`); en esta version FS admite `PYG` y `USD`.

## Decisiones del usuario (2026-11-11)

| Id | Decision |
|---|---|
| (a) | Un articulo tiene **una sola moneda**. Si se vende lo mismo en guaranies y en dolares, son dos articulos. |
| (b) | En una factura en USD, los articulos en Gs. **se siguen ofreciendo sin precio**, como hoy. |
| (c) | En una factura en Gs., un articulo en USD **se ofrece sin precio**. No se convierte: la cotizacion es del dia y la decide el operador. |
| (d) | La moneda de un articulo **se puede cambiar** aunque ya se haya usado: las facturas guardan su propio snapshot (`factura_items_snapshot`) y no cambian. |
| Etapa | Primero USD. El diseno admite despues cualquier moneda del catalogo `MONEDA` de FE sin otra migracion. |

## Reglas

### Base

- **RN-01.** `catalogo_items` suma `moneda text not null default 'PYG'` con `check (moneda ~ '^[A-Z]{3}$')`, igual que `facturas_operativas.moneda` (`0042`). Los articulos existentes quedan en `PYG` sin tocar su precio.
- **RN-02.** `catalogo_items.precio_unitario` pasa de `integer` a `numeric(18, 2)`, como ya hizo `0042` con `factura_items_snapshot`. El check `precio_unitario >= 0` se conserva y se agrega `check (moneda <> 'PYG' or precio_unitario = trunc(precio_unitario))`: en guaranies el precio es entero en la base, no solo en la API.

### API (`apps/api`, modulo `catalogo`)

- **RN-03.** `CatalogoItem` devuelve `moneda` (string ISO 4217) y `precio_unitario` como numero (entero en PYG, hasta 2 decimales en otra moneda). `GET /catalogo/items`, `GET /catalogo/items/search`, `POST` y `PATCH /catalogo/items` lo devuelven siempre.
- **RN-04.** `POST` y `PATCH /catalogo/items` aceptan `moneda` opcional, por omision `PYG`. Las monedas admitidas en v0.1 son `PYG` y `USD`, en una constante del modulo (`monedasCatalogo`), para sumar las demas despues sin migracion. Otra moneda responde `400 VALIDATION_ERROR` con "Moneda no admitida. Por ahora el catálogo acepta Gs. y USD.".
- **RN-05.** Validacion del precio segun la moneda, en `normalizeCatalogoInput`: en `PYG`, entero mayor o igual a 0 (mensaje "En guaraníes el precio va sin decimales."); en otra moneda, mayor o igual a 0 con hasta 2 decimales (mensaje "En USD el precio va con hasta 2 decimales."). El esquema Zod de la ruta deja de exigir `int()` y pasa a `z.coerce.number().min(0)`; la regla fina queda en el servicio, que ya tiene las pruebas unitarias (`apps/api/tests/catalogo.service.test.ts`).
- **RN-06.** `GET /catalogo/items` acepta `moneda` opcional (`PYG`, `USD`) y filtra por ella. Sin el parametro, lista todas.
- **RN-07.** `GET /catalogo/items/search` acepta `moneda` opcional. No excluye articulos de otra moneda (decisiones (b) y (c)): ordena primero los de la moneda pedida, despues el criterio de hoy (codigo exacto, descripcion). Ver "Decisiones pendientes" DP-1.
- **RN-08.** El codigo del articulo sigue siendo unico por facturador sin importar la moneda (indice `catalogo_items_codigo_uidx`). Dos articulos "iguales" en distinta moneda llevan codigos distintos; el codigo automatico `AUTO-xxxx` ya lo resuelve.

### Pantalla del catalogo (`views/CatalogView.tsx`)

- **RN-09.** El formulario de alta y edicion suma el campo "Moneda" con las opciones "Guaraníes (Gs.)" y "Dólares (USD)", por omision guaranies, en la misma fila que el precio y el IVA. El rotulo del precio cambia con la moneda: "Precio (Gs.)" o "Precio (USD)". En guaranies el campo acepta enteros (`normalizeIntegerInput`, como hoy); en USD acepta hasta 2 decimales con coma (`normalizeDecimalInput`, `placeholder="0,00"`), con la ayuda "Con hasta 2 decimales (centavos)." Cambiar la moneda con un precio cargado no lo convierte; si el precio deja de ser valido para la nueva moneda, el formulario lo marca al guardar con el mensaje de RN-05.
- **RN-10.** En la tabla de escritorio y en las tarjetas de celular el precio se muestra con `formatMonto(precio, moneda)` ("Gs. 15.000" o "USD 12,50"). No hay columna nueva: la moneda va dentro de la cifra.
- **RN-11.** La barra de filtros suma el grupo "Moneda" con "Todas", "Gs." y "USD" (mismo patron `filter-tabs` que "Estado del catálogo"), que usa el parametro `moneda` de RN-06. Por omision "Todas".
- **RN-12.** Duplicar un articulo conserva su moneda. Editar permite cambiar la moneda (decision (d)); el formulario no avisa de facturas anteriores porque no las altera.

### Editor de factura (`InvoiceEditor` en `main.tsx`: `applyCatalogItem`, `saveQuickCatalogItem`, `GrillaLineas`)

- **RN-13a (cierre, 2026-11-11).** En una factura en USD, el precio del articulo se escribe en la linea con dos decimales (`12,50`, no `12,5`), con `toFixed(2)`; en el catalogo, al editar o duplicar un articulo en USD, el precio tambien se muestra con dos decimales.
- **RN-13.** Al elegir un articulo cuya moneda es la de la factura, la linea completa codigo, descripcion, IVA **y precio**, y queda `lockedFromCatalog` con el mensaje "Item seleccionado del catálogo.", en cualquier moneda. Esto reemplaza la condicion `!enMonedaExtranjera` actual.
- **RN-14.** Al elegir un articulo de otra moneda, la linea completa codigo, descripcion e IVA, deja el precio vacio para cargar, no queda `lockedFromCatalog` para el precio (igual que hoy en USD) y el mensaje dice la moneda del articulo: "Item del catálogo en Gs.: cargá el precio en USD." o "Item del catálogo en USD: cargá el precio en Gs.". No se convierte por tipo de cambio (decision (c)).
- **RN-15.** Las sugerencias del catalogo en la celda de descripcion muestran el precio con su moneda (`formatMonto`), para que el operador distinga un articulo en Gs. de uno en USD antes de elegirlo.
- **RN-16.** "Guardar en el catálogo" (casilla de la fila en escritorio, casilla de la hoja de linea en celular) esta disponible en cualquier moneda. Guarda con `moneda` igual a la de la factura y el precio tal como esta en la linea (entero en PYG, hasta 2 decimales en USD). El aviso "Guardar en el catálogo no disponible en USD" del pie de la grilla se elimina. La validacion previa del precio pasa de "entero mayor a cero" a la regla de la moneda; el mensaje de error es el de RN-05.
- **RN-17.** El editor de presupuestos y pedidos (`NotasView`, notas comerciales sin moneda, `0022`) sigue en guaranies: un articulo en USD completa descripcion e IVA y deja el precio vacio con el mensaje de RN-14 ("cargá el precio en Gs."); "Guardar en el catálogo" desde alli guarda en `PYG` como hoy.

### Datos existentes y compatibilidad

- **RN-18.** Las facturas ya emitidas no cambian: `factura_items_snapshot` guarda precio y `catalogo_item_id`; la ficha y el KUDE leen el snapshot, no el catalogo.
- **RN-19.** Un cliente de la API que no mande `moneda` sigue funcionando igual (PYG, entero). Un cliente que lea `precio_unitario` como entero sigue funcionando para articulos en PYG.

## Fuera de alcance

- Precio en dos monedas para el mismo articulo (decision (a)).
- Conversion por tipo de cambio al elegir un articulo de otra moneda (decision (c)).
- Monedas distintas de USD en la interfaz (el modelo las admite; se habilitan sumandolas a `monedasCatalogo` y al selector).
- Moneda en presupuestos y pedidos (`notas_comerciales` no tiene moneda).
- Carga masiva (la planilla trae sus precios y no usa el catalogo) y notas de credito (toman las lineas de la factura).
- Cambios en FE.
- Validaciones de datos del cliente (`SPEC_VALIDACIONES_RECEPTOR_v0.1`).

## Decisiones pendientes

| Id | Pregunta | Propuesta mientras no se decida |
|---|---|---|
| DP-1 (resuelta 2026-11-11 con la propuesta) | En la busqueda desde el editor, ¿los articulos de otra moneda se muestran mezclados (ordenados despues) o en un grupo aparte "En otra moneda"? | Mezclados, ordenados despues, con el precio y la moneda visibles (RN-07, RN-15). Es lo que menos cambia la grilla. |
| DP-2 (resuelta 2026-11-11 con la propuesta) | ¿El filtro de moneda del catalogo recuerda la ultima eleccion del operador? | No; arranca en "Todas" como los demas filtros de la pantalla. |

## Criterios de aceptacion

Todas las pruebas de interfaz con Playwright contra el stack local de Segel (`.local/segel-ensayo`, API y frontend del mismo commit), en 1440, 1280 y 390 px. Las de API con vitest.

- **CA-01 (API).** `POST /catalogo/items` sin `moneda` crea en `PYG`; con `moneda: "USD"` y `precio_unitario: 12.5` crea y devuelve `moneda: "USD"`, `precio_unitario: 12.5`. Con `USD` y `12.345` responde 400 con "En USD el precio va con hasta 2 decimales."; con `PYG` y `100.5` responde 400 con "En guaraníes el precio va sin decimales."; con `EUR` responde 400 con "Moneda no admitida…".
- **CA-02 (API).** `GET /catalogo/items?moneda=USD` devuelve solo articulos en USD y el `total` correspondiente; sin `moneda`, todos. `GET /catalogo/items/search?q=...&moneda=USD` devuelve articulos de las dos monedas con los de USD primero.
- **CA-03 (API).** `PATCH` de un articulo en `PYG` usado en una factura emitida, cambiandolo a `USD` con precio `9.99`, responde 200; la factura anterior sigue mostrando su precio original (snapshot).
- **CA-04 (Catalogo, 1440 y 1280).** Alta de "Prueba CAM USD" en dolares a `12,50`: la fila muestra "USD 12,50"; alta en guaranies a `15000` muestra "Gs. 15.000". El filtro "USD" deja solo el primero; "Gs." solo el segundo; "Todas" los dos. Editar el de USD y cambiarlo a guaranies con `12,50` muestra el error de RN-05; con `13000` guarda.
- **CA-05 (Catalogo, 390).** Lo mismo que CA-04 con tarjetas y el formulario en `Dialogo`: el precio se ve con su moneda y el selector de moneda es usable con 44 px de alto.
- **CA-06 (Editor, 1440 y 390).** Factura en USD: elegir "Prueba CAM USD" completa el precio `12,50` y bloquea la linea como del catalogo; elegir un articulo en Gs. deja el precio vacio con "Item del catálogo en Gs.: cargá el precio en USD.". La vista previa muestra los totales en USD.
- **CA-07 (Editor, 1440 y 390).** Factura en Gs.: elegir el articulo en USD deja el precio vacio con "Item del catálogo en USD: cargá el precio en Gs."; elegir uno en Gs. completa el precio como hoy.
- **CA-08 (Editor, 1440 y 390).** Factura en USD con una linea manual "Servicio CAM" a `20,00`: la casilla "Guardar en el catálogo" esta disponible; al confirmarla, `POST /catalogo/items` recibe `moneda: "USD"` y `precio_unitario: 20`, y el catalogo lo lista como "USD 20,00". El pie de la grilla ya no dice "no disponible en USD".
- **CA-09 (Regresion).** `playwright-ux-resto-app.cjs` (caso `agenda`, que crea un articulo con "Precio (Gs.)"), `playwright-editor-pc.cjs` CA-06 y `playwright-ux-nueva-factura.cjs` (CA-05 actualizado a RN-16) en verde; `npm run test`, `typecheck` y `lint` de `apps/api`; `typecheck` y `build` de `apps/web-operacion`; reconocimiento (`playwright-reconocimiento-ux.cjs`) sin subir la linea base.
- **CA-10 (SIFEN test, con aviso previo a FE).** Una factura en USD con un articulo del catalogo en USD y una linea guardada en el catalogo desde el editor, emitida desde el stack local contra FE test, aprobada; el KUDE muestra los precios en USD. Es la unica emision real de la cadena.
