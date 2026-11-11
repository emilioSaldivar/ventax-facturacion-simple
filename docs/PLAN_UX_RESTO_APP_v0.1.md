# PLAN UX Del Resto De La App v0.1

## Alineacion

- `docs/SPEC_UX_RESTO_APP_v0.1.md`
- Canvas de diseño: `https://claude.ai/artifact/R7AL4Ajj7oAX9PfydQDYWe`. Tiene nueve pantallas: Informacion y estado, el menu "Nuevo", Notas de credito, Notas de debito y Notas de remision en su estado futuro, Documentos, Elegir punto, Cambiar punto y Celular.
- `docs/PLAN_UX_NUEVA_FACTURA_v0.1.md`: tokens, `Icono`, despliegue local con API y frontend del mismo commit (PLAN 7).
- `docs/PLAN_MULTIPERFIL_USUARIO_v0.1.md`: la fase 3 de este plan va despues de esa cadena.

## Estado

Documentado el 2026-11-10. Sin implementar: espera que el usuario acepte el canvas y dé la indicacion. Las lineas de codigo citadas son de `84fb241`. Hay que releerlas antes de implementar, porque otra sesion trabaja en la misma rama.

## 0. Fases

| Fase | Contenido | Depende de |
|---|---|---|
| 1 | Base (R-1), menu y nombres (A), boton "Nuevo" (A.3), Notas de credito (B.1), Documentos (C), Informacion y estado (R-8) | Aceptacion del canvas |
| 2 | Agenda (R-3), Catalogo (R-4), Presupuestos / Pedidos (R-5), Cobros / Recibos (R-6), carga masiva y paginas publicas (R-9, R-10) | Fase 1 (base y encabezado comun) |
| 3 | Agregados de multiperfil (§F): menu de celular, columna y filtro "Punto", "Se emite por" | `SPEC_MULTIPERFIL_USUARIO_v0.1` implementada |
| — | Emision de nota de debito, nota de remision manual y autofactura | Cadena propia de cada una (FS-55 a FS-57) |

Toda la fase 1 y la 2 son solo de interfaz: no cambian la API, la base ni `spec/openapi.yaml` (SPEC RN-08).

## 1. Base comun (R-1)

- `apps/web-operacion/src/styles.css`:
  - Bajar a 700 las 41 reglas con `font-weight` de 800 o 900, salvo el total grande de los paneles, que queda en 700.
  - Cambiar `#c6d9df` y `#d7e5ea` por `var(--color-line)`.
  - Usar los radios `--radius-control` y `--radius-card`.
  - Quitar el `text-transform: uppercase` de `.eyebrow`. Despues se quita el `.eyebrow` de cada pantalla al pasarla al encabezado comun.
- Componente nuevo `EncabezadoPantalla({ titulo, subtitulo, acciones })` en `main.tsx`, con el mismo marcado que el encabezado de Nueva factura (`.editor-heading`). Lo usan todas las vistas de las fases 1 y 2.
- Componente nuevo `PastillaEstado({ documento })`, que extrae la pastilla de `ResultadoEmision` (clases `.pill` y `.dot`, por estado simple). Reemplaza a `getDocumentoStatusIcon` y `getDocumentoAccionIcon` (`main.tsx:6875`, `:6888`) en la lista, la tabla y la ficha (P-1). Las dos funciones se borran cuando no queden usos.

## 2. Menu, nombres y catalogo de tipos (A.1, A.2, A.4, A.5)

- **Catalogo fijo** `TIPOS_EMISION` en `main.tsx`, junto a `TIPOS_PROXIMAMENTE` (`:1897`), que pasa a derivarse de el. Cada entrada tiene `tipo`, `etiquetaMenu`, `etiquetaSingular`, `descripcion`, `icono`, `vista` y `estado(context, canEmit)`:

  | tipo | etiquetaMenu | estado |
  |---|---|---|
  | `FACTURA` | Nueva factura | Disponible si `canEmit && !numeracionDelCliente`, como hoy (`main.tsx:1586`) |
  | `NOTA_CREDITO` | Notas de credito | Disponible si `canEmit` |
  | `NOTA_REMISION` | Notas de remision | Por planilla si `context.carga_masiva_habilitada`; si no, Proximamente |
  | `NOTA_DEBITO` | Notas de debito | Proximamente |
  | `AUTOFACTURA` | Autofacturas | Proximamente |

- **Menu.** `menuItems` y `menuSections` (`main.tsx:1586-1600`) pasan a los cuatro grupos de SPEC A.1:
  - "Emitir" se arma desde `TIPOS_EMISION`.
  - Un elemento Proximamente es un `<button disabled>` con la etiqueta `<span class="menu-tag">Proximamente</span>` y `aria-disabled`. No llama a `goTo` (RN-02).
  - Un elemento Por planilla abre la vista nueva `remision` (§4).
- **Nombres.**
  - `formatOperationViewTitle` y `getOperationViewHint` (`main.tsx:6991`, `:7005`): `credit-note` pasa a "Notas de credito" y "Devolucion total o parcial de una factura aprobada"; `notas` pasa a "Presupuestos / Pedidos".
  - El boton de Informacion y estado (`main.tsx:1888`) pasa a "Notas de credito".
  - El identificador `credit-note` no cambia (RN-06).
- **Iconos.** `NombreIcono` y los trazos de `Icono` (`main.tsx:6336-6390`):
  - `devolver` se renombra `credito`, con el documento y el signo menos;
  - se agregan `debito`, `remision`, `autofactura` y `nuevo`, con los trazos del canvas.
- **Celular.** El menu de celular usa los mismos grupos y etiquetas, porque sale de `menuItems`.

## 3. Boton "Nuevo" (A.3)

- Componente `MenuNuevo` en la barra superior, solo en escritorio (`esEscritorio`), entre el bloque del facturador y el operador.
- Es un boton con `aria-haspopup="menu"` y `aria-expanded` que abre una lista `role="menu"` anclada a la derecha, de 440 px. Se cierra con Escape, con un clic afuera o al elegir.
- El contenido sale de `TIPOS_EMISION` mas dos entradas comerciales: "Presupuesto o pedido", que va a la vista `notas`, y "Recibo de dinero", que va a `recibos`. Si `carga_masiva_habilitada`, se suma "Carga masiva por planilla", que va a Documentos en la pestaña `CARGA_MASIVA`.
- "Nota de remision", cuando esta Por planilla, abre Documentos en `CARGA_MASIVA` con el selector de tipo en `NOTA_REMISION`. El selector ya existe (fase B1, RN-05 de `SPEC_DOCUMENTOS_ESCRITORIO`); hay que exponer el tipo inicial como prop de `carga-masiva.tsx`.
- Al pie va "Se emite por EST-PUNTO titulo", con los datos de `context`, que ya estan en la barra.

## 4. Espacios por tipo (B)

- **Notas de credito (B.1).** `CreditNoteView` (`main.tsx:3943-4127`) se reescribe con el patron de Nueva factura:
  - `EncabezadoPantalla` con el proximo numero. Sale de `getNextFiscalNumber` sobre el ultimo numero de nota de credito del contexto, igual que el editor. Si el contexto no trae la serie de NC, el subtitulo no muestra numero.
  - Pestañas "Nueva nota de credito" y "Emitidas · N". N sale de `GET /facturas?tipo=NOTA_CREDITO&limit=1`, con el total de la respuesta.
  - La tarjeta "Factura a devolver" usa el buscador actual (`/facturas/nce-candidatas`, `main.tsx:3976`) y, al elegir, muestra el resumen y el enlace "Cambiar factura".
  - La tarjeta "Que se devuelve" lleva el conmutador total o parcial y la tabla con cantidades. Reusa el calculo de saldo actual (`/facturas/{id}/nota-credito/saldo`) y el cuerpo `{ motivo, lineas }` que ya se manda (`main.tsx:2213-2220`), **sin cambiarlo**: la linea de base es el cuerpo de hoy (§7).
  - La tarjeta "Motivo" tiene solo el campo de detalle (FS-44).
  - El panel fijo derecho lleva los totales y "Emitir nota de credito", con el motivo de bloqueo.
  - Al emitir, `ResultadoEmision` reemplaza al formulario. La nota de credito usa las mismas props que la factura, porque `DocumentoResponse` ya cubre `NOTA_CREDITO`. Se revisan los textos de `ResultadoEmision` que dicen "factura" y se pasan por `getDocumentoNombreLower`.
- **Notas de remision (B.3).** La vista nueva `remision` (`OperationView`) tiene encabezado y dos pestañas:
  - "Emitidas · N" muestra la tabla de Documentos filtrada por `NOTA_REMISION`, con el mismo componente;
  - "Por planilla" monta `carga-masiva.tsx` con el tipo `NOTA_REMISION`.

  No hay formulario de emision: la pestaña "Nueva" la agrega FS-56.
- **Notas de debito y Autofacturas (B.2, B.4).** No tienen vista hasta su cadena. El catalogo las deja Proximamente.

## 5. Documentos (C) e Informacion y estado (R-8)

- **`DocumentsView`** (`main.tsx:1914`):
  - Pestañas (`:2552`): "Carga masiva" pasa a "Cargas por planilla" y la pestaña activa muestra `totalDocumentos`.
  - La barra de filtros va en una fila, con flex que se envuelve. "Cargando…" pasa a la tabla, como fila de estado, y "Buscar mas documentos" pasa al pie como "Ver mas".
  - En la tabla de escritorio, la columna Estado usa `PastillaEstado`.
  - La ficha lateral pasa a 360 px con los bloques de SPEC C.4: pasos con `pasosPorEstado`, `dl` de datos, una grilla de dos columnas para la entrega y "Desde esta factura" con los estados de `TIPOS_EMISION`.
  - "Nota de credito" en la ficha sigue llamando al flujo actual (`openNuevaNotaCredito`, `emitSelectedNotaCredito`). No cambia que se emite, solo donde esta el boton.
- **`StatusView`** (`main.tsx:1808`): dos columnas de 1fr en escritorio y una en celular; checks con `Icono` en lugar de "✓"; tarjeta "Documentos que podes emitir" desde `TIPOS_EMISION`.

## 6. Fase 2 (R-3 a R-6, R-9, R-10)

- `ClientesAgendaView` (`:3489`) y `CatalogView` (`:4128`) pasan a tabla en escritorio, con `useEsEscritorio` (`:1902`), y conservan las tarjetas en celular.
- En Catalogo, el alta pasa a un panel lateral (`aside`) con el formulario actual.
- La vista de Presupuestos / Pedidos y la de Cobros / Recibos pasan a tabla. El editor de presupuestos reutiliza `GrillaLineas` (`:6424`) con las mismas props que el editor de factura.
- En `carga-masiva.tsx`, las clases `carga-*` pasan a los tokens, el encabezado a `EncabezadoPantalla` y el estado a `PastillaEstado`.
- En `NotaPublicaView` y `ReciboPublicaView`, los emojis pasan a `Icono`.

## 7. Validacion

- Cada tarea cierra con `npm run typecheck`, `npm run lint` y `npm run build`.
- **Linea de base de la nota de credito.** Antes de tocar `CreditNoteView`, un guion con la API mockeada (`page.route`, como `scripts/playwright-preview-mock.cjs`) guarda el cuerpo de `POST /facturas/{id}/nota-credito` para la nota total y la parcial en `test-results/ux-resto/nc-*.json`. Con la UI nueva el cuerpo debe ser identico, comparado byte a byte.
- **Guion nuevo** `scripts/segel-fs/playwright-ux-resto-app.cjs`. Corre en 1440, 1280 y 390 px contra el stack local (`.local/segel-ensayo`), con `ENSAYO_PASSWORD_FILE` fuera del repositorio, y cubre CA-01 a CA-09 y CA-11:
  - menu y estados;
  - clic en Proximamente sin pedidos a la API (`page.on("request")`);
  - menu "Nuevo";
  - Notas de credito con una **nota de credito real en SIFEN test** sobre una factura aprobada del mismo guion, esperando hasta 10 minutos por el envio por lote;
  - Documentos con su ficha;
  - Informacion y estado;
  - busqueda de emojis en el texto visible con `/\p{Extended_Pictographic}/u`.
- **Guiones que cambian por los nombres** (RN-06):
  - `scripts/playwright-carga-masiva.cjs:374` busca el boton "Devolver factura";
  - `scripts/guia-uso-segel.cjs`, que esta sin versionar y es de otra sesion, usa "Devolver factura" y "Notas / Presupuestos". Se coordina con esa sesion antes de tocarlo (ver `sesiones-paralelas-rama-segel`).
- **Regresion.** Corren `playwright-ux-nueva-factura.cjs`, `playwright-documentos-escritorio.cjs`, `playwright-editor-pc.cjs` y `playwright-carga-masiva.cjs`.
- **Despliegue local.** La API y el frontend se construyen del mismo commit (PLAN 7 de `UX_NUEVA_FACTURA`). En la fase 1 la API no cambia, pero se reconstruye igual para que `X-App-Version` coincida.

## 8. Fase 3 (despues de multiperfil)

- En el menu de celular, "Cambiar punto de expedicion" abre la ventana de `SPEC_MULTIPERFIL_USUARIO` C.3. Solo aparece con `perfiles.length > 1`, de `GET /me/perfiles`.
- **Columna "Punto".**
  - `DocumentoResponse` necesita el punto del documento. Hoy no lo trae: la API lo agrega como `establecimiento` y `punto_expedicion` en la respuesta de `GET /facturas`.
  - Salen del perfil guardado (`actividad_punto_perfil_id`, multiperfil RN-05). Si no hay perfil, salen del CDC, con `cdc.slice(11, 14)` y `cdc.slice(14, 17)`, la misma lectura de `facturas.inutilizacion.ts`. Si no hay ninguno, van en `null`.
  - Es un cambio de contrato: va en `spec/openapi.yaml`.
- **Filtro "Punto".** `GET /facturas?punto=EST-PUNTO` filtra por el perfil o, para documentos sin perfil, por la subcadena del CDC. Necesita la entrada en `spec/openapi.yaml`, pruebas de la ruta y del repositorio, y un indice si el plan de consulta lo pide; ya existe `(facturador_id, actividad_punto_perfil_id, created_at desc)` de `0033`.
- "Se emite por" en el subtitulo de cada espacio usa el `titulo_operativo` del contexto.

## 9. Riesgos

- **Archivos compartidos.** `main.tsx` y `styles.css` son compartidos con la otra sesion de la rama: hay que releer `git log` y el archivo antes de cada tarea.
- **Cambio de comportamiento en Notas de credito.** Rehacer la pantalla puede cambiar sin querer el cuerpo de la nota. Lo cubre la linea de base de §7.
- **Pastilla en lugar de emoji.** Puede romper guiones que buscan los emojis. Al 2026-11-10, el unico guion de `scripts/` que los busca es `playwright-ensayo-documentos.cjs`, que se actualiza en la misma tarea. Hay que repetir la busqueda antes de la tarea.
