# PLAN Editor De Factura En Modo Completo (PC) v0.1

**Fecha:** 2026-11-10 · **SPEC:** `docs/SPEC_EDITOR_FACTURA_PC_v0.1.md` · **Estado:** D-1 a D-5 confirmadas (2026-11-10).

Se implementa despues de MON-008 (cantidad decimal en la API y en `tax.ts`), MON-009 (totales de FE) y MON-011 (selector de dos monedas y RN-08), porque la grilla reutiliza `cantidadValida`, `precioValido`, `normalizeDecimalInput(valor, decimales)` y el comportamiento al cambiar de moneda. Sin esas tres, la grilla no puede validar por fila.

## 1. Estado del editor (`main.tsx`, `InvoiceEditor`)

- Un unico estado de factura (cliente, opciones, `lines`, moneda, tipo de cambio) compartido por los dos modos; el modo es solo presentacion (`modoEditor: "simple" | "completo"`).
- `modoEditor` inicial: `completo` si `window.matchMedia("(min-width: 1024px)")` y no hay preferencia guardada; preferencia en `localStorage` (`fs.editor.modo`), leida y escrita con `try/catch`. Un cambio de ancho en vivo (por ejemplo, achicar la ventana) fuerza `simple` por debajo de 1024 px sin tocar la preferencia.
- Las lineas pasan de "linea activa en ventana" a "filas editables": cada fila conserva los campos actuales (`descripcion`, `cantidad`, `precio_unitario`, `iva_tipo`, `codigo`, `catalogo_item_id`, `guardar_en_catalogo`) mas `errores` calculados (`precioValido`, cantidad con hasta 4 decimales, descripcion vacia). El modo simple sigue usando la ventana sobre la misma fila.

## 2. Componentes nuevos

- `EditorCompleto`: banda superior (datos del facturador y opciones de factura en una fila), cliente a la izquierda, `GrillaLineas` en el cuerpo, `TotalesFactura` y acciones al pie. Reusa los subcomponentes de cliente, opciones y totales que ya existen; solo cambia la composicion y los estilos.
- `GrillaLineas`: tabla con una fila por linea y una fila vacia final; celdas con `input` controlados; navegacion por teclado (RN-06); busqueda en catalogo desde Codigo o Descripcion con la misma consulta `GET /catalogo/items?` de hoy, resultados en una lista desplegable bajo la celda; casilla "Guardar en catalogo" por fila (deshabilitada fuera de PYG) que dispara el alta ya existente al agregar.
- Conmutador `ModoEditorToggle` en el encabezado del editor, solo con `min-width: 1024px`.

## 3. Calculo y vista previa

- Totales locales con `calculateDocumentTotalsMoneda` (PYG delega en el calculo entero) recalculados en cada cambio de celda (D-3). La vista previa del servidor (`POST /facturas/preview`) se ejecuta al pulsar "Crear factura", como hoy, y manda si difiere.
- Con A-2 implementado, el total que se muestra tras la aprobacion es el de FE; el editor no cambia por eso.

## 4. Estilos (`styles.css`)

- `.invoice-editor` deja el `max-width: 520px` solo en modo simple; `.invoice-editor.completo` ocupa el ancho del marco (hasta 1440 px) con `grid` de dos columnas (cliente 1fr, totales 360 px) y la grilla a lo ancho; debajo de 1024 px la clase no se aplica.
- Grilla con anchos fijos para Cantidad, Precio, IVA y Subtotal y Descripcion flexible; `overflow-x: auto` en su contenedor entre 1024 y 1279 px (RN-05).

## 5. API y contrato

- Sin cambio en rutas ni esquemas, salvo lo que ya trae la cadena de moneda (`cantidad` decimal, MON-008). `spec/openapi.yaml` no cambia en esta cadena.

## 6. Detalle por archivo para quien implemente

- `apps/web-operacion/src/main.tsx`: `InvoiceEditor` conserva el estado; se extraen `EditorCompleto`, `GrillaLineas` y `ModoEditorToggle` como componentes en el mismo archivo o en `apps/web-operacion/src/editor-completo.tsx` (como ya existe `carga-masiva.tsx`); la ventana "Agregar producto" no se toca.
- `apps/web-operacion/src/styles.css`: `.invoice-editor.completo`, `.grilla-lineas`, `.grilla-lineas td.invalida`, `.modo-editor-toggle`; media query `(min-width: 1024px)`.
- Preferencia: clave `fs.editor.modo` en `localStorage`, valores `simple` | `completo`, lectura y escritura con `try/catch`.
- Sin cambios en `apps/api`, `packages/shared` ni `spec/openapi.yaml`.

## 7. Pruebas

- Unitarias de la vista previa local con cantidades decimales y de la validacion por fila (`precioValido`, cantidad).
- Playwright `scripts/segel-fs/playwright-editor-pc.cjs`: CA-01 a CA-06 en 1440 y 1280, CA-03 en 390, con una emision real en SIFEN test en 1440 (tres lineas en USD, una con cantidad 1,5, tipo de cambio 7350,5) y otra en PYG. Comprobar ademas que el cuerpo enviado a `POST /facturas` desde el modo completo es identico al del modo simple con las mismas lineas (RN-02): interceptar la peticion con `page.route` o `page.waitForRequest` y comparar los JSON. Evidencia en `TASKS_EDITOR_FACTURA_PC_v0.1.md`.
