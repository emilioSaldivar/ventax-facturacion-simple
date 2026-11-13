# PLAN — Ajustes visuales del operador v0.1

**SPEC:** `docs/SPEC_AJUSTES_VISUALES_OPERADOR_v0.1.md` · **Backlog:** FS-32, FS-75, FS-76, FS-80 a FS-89, FS-94 (primera parte), FS-97 y FS-79 (H-15)

## 1. Principio

Solo `apps/web-operacion` y guiones de prueba. Sin API, base, contrato con FE ni `spec/openapi.yaml`. Se respeta `PAUTAS_FRONTEND_v0.1` (tokens, catálogo de componentes, textos con tildes y voseo, P-C6: se borra lo reemplazado). Nada se despliega en `segel-fs`.

## 2. Cambios por punto (causa verificada el 2026-11-12)

| Id | Causa | Archivo | Cambio |
|---|---|---|---|
| AV-01 | `submitReasonModal` corta en `motivo.length < 3` para todas las acciones | `views/DocumentsView.tsx` (~337, ventana ~1604) | Constante `MOTIVO_ANULACION_MIN = 5` junto a `MOTIVO_INUTILIZACION_MIN`; para `CANCEL_DETAIL` y `CANCEL_LIST` exige 5 con "El motivo debe tener al menos 5 caracteres."; la nota de crédito sigue con 3. Contador bajo el `textarea` solo en anulación, con el texto de la inutilización |
| AV-02 | El botón de "Desde esta factura" solo mira `tipo !== "NOTA_REMISION"` | `views/DocumentsView.tsx` (~1359) | Condición `muestraCrearNotaCredito(selected)`: tipo FACTURA y estado en `EMITIDA`, `EMITIENDO` o `PENDIENTE_SIFEN`. El bloque de `acciones_sugeridas` `CREAR_NCE` (lo decide la API) no cambia |
| AV-03 | `transportista` se inicia con el facturador y `setTipoTransporte(2)` no lo toca | `views/RemisionNuevaView.tsx` (79, 344-348) | Función `cambiarTipoTransporte(t)` usada por los dos botones, con RN-03 |
| AV-04 | `RemisionView` pide el total una vez al montar | `views/RemisionView.tsx` (39-44), `views/RemisionNuevaView.tsx` (`emitir`) | Prop `onEmitida` en `RemisionNuevaView`, llamada tras `entrega.setDocumento(documento)`; `RemisionView` vuelve a pedir `/facturas?tipo=NOTA_REMISION&limit=1` |
| AV-05 | `previewSubtotalsByLineId` pone `preview?.items[i]?.subtotal ?? 0`: 0 sin vista previa y el subtotal de la API trae el prorrateo del global | `main.tsx` (2126-2137, 2568, 2585, 2782, 3079-3083, totales 2841-2850 y 2873…) | Función `subtotalLinea(line, descuentoModo, moneda)` en `lib/descuentos.ts` con RN-05 (reusa `descuentoDeLinea`); la grilla, la tarjeta de celular y la hoja la usan; se borra `previewSubtotalsByLineId` y la prop `subtotales` de la grilla (P-C6). `TotalRow` acepta `value: number \| null` y muestra "—" con `null`; los totales pasan `preview?.totals.x ?? null` |
| AV-06 | Al aplicar la sugerencia cambia `cliente.documento` y el efecto de búsqueda (300 ms) la vuelve a abrir | `main.tsx` (efecto ~1578, `applyClienteSuggestion` ~1930, autocompletado DNIT; editor de notas ~3418 y ~3468) | Referencia `documentoAplicadoRef` con el documento normalizado aplicado; el efecto no busca si coincide; se limpia cuando el operador cambia el documento. Escape cierra la lista. Tildes en "padrón" (2235, 2457, 2497) |
| AV-07 | `.grilla-lineas .col-codigo { width: 80px }` | `styles.css` (~3095) | 104 px; verificar con un código de 10 caracteres y sin desborde en 1280 |
| AV-08 | La celda imprime `documento.cliente.documento` ("0") | `views/DocumentsView.tsx` (968) | `esClienteInnominado(documento.cliente) ? "Sin nombre" : documento.cliente.documento` |
| AV-09 | `formatEmailStatus` solo mira el estado del envío | `lib/documentos.ts`, usos en `views/DocumentsView.tsx` (1142, 1437) y `components/ResultadoEmision.tsx` (100) | Nueva `textoEstadoCorreo(documento, status)` con RN-09; los tres usos la llaman; `formatEmailStatus` se borra si queda sin uso |
| AV-10 | Fila `document-row` sin control de ancho: el aviso largo de una factura sin nombre comprime el número | `styles.css` (`.nc-candidatas`), `views/CreditNoteView.tsx` (285-294) | En `.nc-candidatas .document-row`: número con `white-space: nowrap`, columna derecha con `max-width` y texto que se ajusta; sin tocar `.document-row` de otras pantallas |
| AV-11 | `.catalogo-form-fila` estira por la ayuda de decimales | `styles.css` (~5096) | `align-items: start` |
| AV-12 | El reseteo de `font: inherit` no incluye `textarea` | `styles.css` (80-84) | Sumar `textarea` al reseteo |
| AV-13 | `loadClientes` pide siempre `limit=30&offset=0` e ignora `total` | `views/AgendaView.tsx` (90-106), `components/Paginador.tsx` (nuevo), `views/DocumentsView.tsx` (713-719) | `Paginador` (props: `pagina`, `totalPaginas`, `total`, `etiqueta`, `cargando`, `onCambiar`; clases `.paginador-*`). Agenda con estado `pagina` y `total`, `offset = (pagina − 1) × 30`, búsqueda en página 1, recarga tras guardar o borrar en la página actual (o la anterior si quedó vacía). Documentos reemplaza su bloque por `Paginador` y se borra `.documents-paginas` (P-C6); `playwright-documentos-escritorio.cjs` pasa a `.paginador` |

## 3. Riesgos

- **AV-05 toca la grilla de Nueva factura**, la pantalla más usada: regresión con `playwright-ux-nueva-factura.cjs`, `playwright-descuentos.cjs` (sin emitir), `playwright-editor-pc.cjs` y `playwright-plazo-credito.cjs pantalla`. CA-07 de descuentos espera "180.000" en una línea con 10 % de descuento por línea: sigue igual (no depende del prorrateo).
- **AV-06** no debe impedir buscar cuando el operador corrige el documento: la referencia se limpia en cuanto el texto cambia.
- **AV-13** cambia la clase del paginador de Documentos: un guion la usa (se actualiza en la misma tarea).
- Ningún cambio de API: si una tarea lo necesitara, se detiene y se documenta.

## 4. Validación

1. `npm run typecheck` y `npm run build` de `apps/web-operacion`.
2. Stack local de ensayo (`segel-fs-*` en 18492 con `fe-segel` en SIFEN test) con la imagen del frontend reconstruida desde el árbol de trabajo y `BUILD_COMMIT_SHA` igual a la versión de su API.
3. Guion nuevo `scripts/segel-fs/playwright-ajustes-visuales.cjs`, un caso por AV-xx, en 1440, 1280 y 390 px cuando corresponde. Sin emitir en SIFEN: los estados que hacen falta (rechazada, sin nombre, remisión) se toman de documentos que ya existen en el stack local, o se simulan interceptando la respuesta de la API cuando no existen.
4. Regresión: los guiones del §3 y `playwright-reconocimiento-ux.cjs` sin subas.
