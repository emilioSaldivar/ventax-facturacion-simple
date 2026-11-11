# SPEC — Ajustes de textos para el operador v0.1

**Estado:** aprobado para implementar (2026-11-11)
**Rama:** `feat/identidad-segel`
**Origen:** inventario de la interfaz para los tutoriales (`PLAN_TUTORIALES_VIDEO_v0.1` §6). El usuario decidio corregir antes de grabar (2026-11-11).
**Cadena:** este SPEC → `PLAN_AJUSTES_TEXTOS_OPERADOR_v0.1` → `TASKS_AJUSTES_TEXTOS_OPERADOR_v0.1`

## 1. Problemas

| Id | Donde | Hoy | Problema |
|---|---|---|---|
| A-1 | Nueva factura, subtitulo | "Próximo número 001-001-0000002 · fecha · el número final lo asigna el sistema al emitir" | El numero sale de `fiscal_context.documento_nro`, un valor fijo de referencia (`0000001` en todos los contextos, local y `segel-fs`) que FS nunca actualiza. Con numeracion `SERVICIO` el numero lo asigna FE, y FS no lo conoce antes de emitir. **No se corrige con la primera emision:** muestra `0000002` siempre. En RAJ diria 0000002 cuando la factura real es la 745. |
| A-2 | Resultado de una nota de credito | Titulo "Factura 001-001-…" o "Factura creada · número pendiente"; boton "Crear nueva factura" | `ResultadoEmision` fija la palabra "Factura" para cualquier tipo de documento |
| A-3 | Listado de cargas | Titulo "Cargas de facturas" | El listado muestra cargas de todos los tipos (tiene columna "Tipo"), incluso si se entra desde Notas de remision |
| A-4 | Listado de cargas | "Descargar plantilla" baja siempre la de facturas | Desde Notas de remision baja la plantilla equivocada |
| A-5 | Detalle de carga, fila | "Ver factura" | En una carga de remisiones abre una nota de remision |
| A-6 | Presupuestos / Pedidos | Titulo "Presupuestos" | Sigue diciendo "Presupuestos" en la pestaña "Pedidos" |
| A-7 | Nueva factura, "Tipo de cambio" | Sin ayuda (solo el error "Obligatorio al facturar en USD…") | El operador no sabe que cotizacion usar. Regla informada por el usuario: segun la DNIT, la cotizacion del dia anterior |
| A-8 | Documentos, ficha de factura a credito | "Emitir recibo de cobro" | Si falla, no dice nada (`catch` vacio) |

## 2. Comportamiento esperado

- **A-1** Sin numero estimado. Subtitulo: "{fecha} · el número lo asigna el sistema al emitir". Se borra `getNextFiscalNumber`. El numero aparece recien en el resultado, como hoy. `documento_nro` sigue en el contexto: el backoffice lo usa y la app no lo muestra.
- **A-2** El titulo y el boton dicen el tipo del documento: "Nota de crédito 001-001-…", "Nota de crédito creada · número pendiente", "Crear nueva nota de crédito". Para facturas queda todo igual.
- **A-3** Titulo del listado "Cargas subidas". No se repite "Cargas por planilla": ya es el titulo de la pantalla en Documentos (primer intento, corregido en la validacion: quedaban dos titulos iguales). La bajada pasa a voseo: "Subí un archivo con tus ventas, revisá los errores y confirmá para emitir."
- **A-4** El boton baja la plantilla del tipo con el que se entro: "Descargar plantilla de facturas" o "Descargar plantilla de notas de remisión".
- **A-5** "Ver factura" o "Ver nota de remisión" segun el tipo de la carga.
- **A-6** Titulo "Presupuestos" o "Pedidos" segun la pestaña activa.
- **A-7** Ayuda fija bajo el campo, mientras el valor sea valido: "Según la DNIT, va la cotización del día anterior." El error de valor invalido no cambia.
- **A-8** Si falla, se muestra el error en la ficha, con el mismo aviso de error que usan las demas acciones de la ficha.

## 3. Fuera de alcance

- Mostrar el numero real que va a asignar FE (no existe contrato para consultarlo antes de emitir).
- Calcular o sugerir la cotizacion.
- Persona fisica con RUC no activo que pasa a CI sin aviso (`H-8` de los tutoriales): queda en `BACKLOG` (FS-60).

## 4. Criterios de aceptacion

- **CA-1** Nueva factura no muestra "Próximo número" en ningun modo ni ancho.
- **CA-2** El resultado de una nota de credito dice "Nota de crédito" en el titulo y en el boton; el de una factura no cambia.
- **CA-3** El listado de cargas titula "Cargas subidas" (un solo "Cargas por planilla" en la pantalla); desde Notas de remision el boton baja `plantilla-carga-notas-remision.csv`.
- **CA-4** En una carga de remisiones la fila dice "Ver nota de remisión".
- **CA-5** La pestaña Pedidos titula "Pedidos".
- **CA-6** Con USD y un tipo de cambio valido se ve la ayuda de la DNIT.
- **CA-7** Un error al emitir el recibo desde la ficha se muestra.
- **CA-8** Sin regresiones: `typecheck`, `build`, y los guiones de Playwright que usaban los textos viejos, actualizados, pasan.
