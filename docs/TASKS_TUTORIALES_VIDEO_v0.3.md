# TASKS — Tutoriales en video para operadores v0.3

**SPEC:** `docs/SPEC_TUTORIALES_VIDEO_v0.3.md` · **PLAN:** `docs/PLAN_TUTORIALES_VIDEO_v0.3.md` · **BACKLOG:** FS-146

## Pendientes del usuario

| Id | Pregunta | Estado |
|---|---|---|
| P-11 | Factura externa para "Traer por CDC" en V11: (a) pedir a la sesion de FE una factura nueva emitida fuera de FS a SEGEL SA (recomendado: muestra el camino real), o (b) mostrar solo la validacion del CDC y emitir sobre la cargada a mano | **Resuelta (2026-11-13):** opcion (a); FE (`facturacion-electronica-a1`) emitio `001-002-9300011` en `fe-van` (SIFEN test) a SEGEL SA |
| P-12 | V3 no se regraba aunque su subtitulo dice "30, 60 o 90" dias (hoy el plazo se escribe de 1 a 365) | **Resuelta (2026-11-13):** se acepta la propuesta (el usuario dio la orden de grabar sin objetarla) |
| P-13 | Orden para grabar (emite en SIFEN test: 1 factura, unas 5 notas de credito) | **Resuelta (2026-11-13):** "Comienza con las grabaciones" |

## Matriz

| Id | Tarea | Verificacion | Estado |
|---|---|---|---|
| TUT3-000 | SPEC, PLAN y TASKS v0.3 | revision del usuario | HECHO (2026-11-13) |
| TUT3-001 | Prueba seca: stack local en la punta (`X-App-Version`); etiquetas de §3.5b y §3.14 releidas; eleccion de facturas con SQL (PLAN §2); `mapa.cjs` actualizado | Playwright 1440 sin emitir; `cobertura.cjs` lista las filas nuevas como pendientes | HECHO (2026-11-13) |
| TUT3-002 | V7 regrabado con el cierre nuevo | 1 factura aprobada; capturas sin "solo admite nota de crédito por el total"; mp4 | HECHO (2026-11-13): factura `1010681`, 2:47 |
| TUT3-003 | V4 reescrito y grabado | 3 NC aprobadas (total, combinada, por monto); mp4 | HECHO (2026-11-13): NC `1010053`, `1010054`, `1010055`; 3:55 |
| TUT3-004 | V11 nuevo | externa por CDC (segun P-11) y a mano; al menos 1 NC aprobada; mp4 | HECHO (2026-11-13): tercera corrida; NC `1010058` sobre `9300014` (por CDC) y `1010059` sobre la impresa `7000001`; 2:50 |
| TUT3-005 | Revision final y cierre | una captura por escena; `cobertura.cjs`; SPEC/PLAN/TASKS y BACKLOG (FS-146) actualizados | HECHO (2026-11-13): cobertura 113/114 |

## Evidencia

### TUT3-000 (2026-11-13)

Exploracion sin emitir con Playwright 1440 sobre el stack local (`X-App-Version 3613087`):
- "Notas de crédito" muestra la pantalla unica con las etiquetas de SPEC §3.5b y la entrada "¿La factura no está en el sistema? Traela por CDC o cargala a mano".
- La ficha de `1010660` (factura de V7 con descuento) → "Crear nota de crédito" abre la pantalla unica con "Devolver" habilitado y la columna "Neto u." (78.000 y 44.000): el cierre de V7 quedo desactualizado.
- Facturas externas de prueba en la base local: `9300006`, `9300007`, `9300008` (de SIFEN) y varias a mano, todas con notas o borradas: no sirven para mostrar "Traer por CDC" desde cero (D-17).
- Hallazgo: la lista de candidatas dice "La factura ya esta acreditada por completo." (sin tilde y con "acreditada", que D-10 de `SPEC_NOTA_CREDITO_UNIFICADA_v0.1` reemplazo por devolver/ajustar). Registrado como FS-145.

### TUT3-001 a TUT3-003 (2026-11-13)

Orden del usuario: "Comienza con las grabaciones" (P-13). Stack local `segel-fs-*` en `3613087` (`X-App-Version`; los commits posteriores no tocan la app), FE local `fe-segel` contra SIFEN test, operador `operador-ensayo`, punto 001-001. FE avisado (`facturacion-electronica-a1`; la sesion `-7c` ya no existe).

**TUT3-001 (prueba seca).** Arbol de accesibilidad de la pantalla unica y de "Traer una factura" leido con Playwright 1440. Facturas elegidas con SQL (aprobadas, PYG, SEGEL SA, sin notas): total `1010655` (450.000), por monto `1010654` (1.000.000), ficha `1010633`; para la combinada no habia una de 2 lineas sin descuento: `preparar-v4.cjs` (nuevo, sin grabar) emitio `1010680` (2 × 100.000 y 1 × 50.000). `mapa.cjs`: 114 filas (§3.5 reemplazada por 11 filas §3.5b; 5 filas §3.14). V4 y V11 en seco (`TUT_SECO=1`): 27 y 12 pasos, guardia sin fallas.

Ajustes descubiertos:
- El mensaje de tope es "Supera lo que queda por devolver (N)." (no "Supera lo disponible en este ítem", que es el del ajuste); el guion acepta los dos.
- **CDC real en pantalla:** el CDC lleva el RUC del emisor. `lib.cjs` suma `TUT_CDC="<ejemplo>:<real>"`: en pantalla se escribe un CDC de ejemplo (RUC 80000000-0, mismo resto, digito verificador valido), la ruta lo cambia por el real al ir a la API y el real por el de ejemplo en las respuestas. Verificado: la app trajo `001-002-9300011` de SIFEN mostrando solo el de ejemplo.
- La ayuda del campo CDC es fija, "0105 0570 ..." (comienzo de un CDC real): el guion la cambia por "0180 0000 ..." desde la carga (FS-148).
- El menu "Notas de crédito" no reinicia la seccion desde "Traer una factura" (FS-149); el guion usa "Crear nueva nota de crédito" o sigue en la pantalla.
- "Cargar a mano": columna "Descripción" angosta (FS-150).

| Video | mp4 (`test-results/tutoriales/<video>/`) | Duracion | Pasos | Guardia | SIFEN test |
|---|---|---|---|---|---|
| V7 descuentos (cierre nuevo) | `v7-descuentos.mp4` | 2:47 | 19 | sin fallas | factura `1010681` aprobada; la nota no se emite; cierre con "Neto u." 78.000 / 44.000 |
| V4 notas de credito | `v4-notas-credito.mp4` | 3:55 | 27 | sin fallas | NC `1010053` total sobre `1010655` (450.000), `1010054` combinada sobre `1010680` (devolver 1 × 100.000 + ajuste 10 % 5.000 = 105.000, motivo "Devolución y ajuste de precios"), `1010055` por monto sobre `1010654` (50.000, motivo "Descuento"); todas aprobadas |
| (sin grabar) preparar-v4 | — | — | — | — | factura `1010680` aprobada |

**TUT3-004, primera corrida (fallida por tiempo):** `9300011` traida por CDC y guardada; NC `1010056` (ajuste 20 %, 60.000) emitida a las 14:44:51 UTC; FS la vio aprobada a las 15:23 UTC (38 min), el guion esperaba 10 y fallo antes del tramo a mano (la impresa `7000001` no se guardo). La externa `9300011` ya tiene nota: se pidio a FE otra factura para regrabar; el guion ahora espera hasta 45 min (la espera se corta al montar). Consulta a FE sobre la causa de la demora.

**Causa de la demora (respuesta de FE, 2026-11-13):** FE tuvo `1010056` aprobada a las 14:45:02Z (12 s). La demora fue de FS: un solo reclamo del verificador, que termino a las 15:23:21Z con `UPSTREAM_ERROR` en el refresh contra SIFEN y cerro con el canonico. Registrado como FS-151 y cerrado como "no es defecto": el equipo local se suspendio de 14:48:11Z a 15:22:51Z (kernel "PM: suspend"); la API no registra nada en ese lapso y el verificador consulto a FE al despertar (15:23:20Z). La segunda factura externa (`9300012`) quedo emitida en FE pero esperando SIFEN test (caido entre 15:31Z y 15:51Z); FE avisa cuando este aprobada.

**TUT3-004, segunda corrida (fallida por la misma causa):** con `9300013` (FE, aprobada, CDC de ejemplo calculado igual): traida y guardada; NC `1010057` (ajuste 20 %, 60.000) emitida a las 16:31:14Z; el equipo se suspendio de 16:31:45Z a 17:25:05Z y el guion corto a los 45 min de reloj. `1010057` quedo aprobada. La proxima corrida va con la suspension bloqueada (`systemd-inhibit`, solo mientras corre el guion) y con otra factura externa (`9300013` ya tiene nota).

### TUT3-004 y TUT3-005 (2026-11-13)

Tercera corrida de V11 con `9300014` (FE, aprobada, protocolo 50416217), con la suspension bloqueada (`systemd-inhibit`).

| Video | mp4 | Duracion | Pasos | Guardia | SIFEN test |
|---|---|---|---|---|---|
| V11 nota de credito sobre factura de otro sistema | `v11-nota-credito-externa.mp4` | 2:50 | 16 | sin fallas | `9300014` traida por CDC (en pantalla, CDC de ejemplo); NC `1010058` (ajuste 20 %, 60.000) aprobada; impresa timbrado `12345678` 001-001-`7000001` cargada a mano; NC `1010059` total (200.000) aprobada |

Escenas verificadas en las capturas: validacion del CDC ("el dígito verificador no coincide"), factura leida de SIFEN, ficha con "Externa · traída de SIFEN (protocolo …)" y "Eliminar factura externa", aviso de datos no verificados, referencia impresa, resultado aprobado. Todos los mp4 `h264` 1440x900.

**Cobertura** (`node scripts/tutoriales/cobertura.cjs`): 113/114; falta solo `4-rechazada` en V3 (justificada en la v0.1).

**Emitido en SIFEN test por esta version:** facturas `1010680`, `1010681`; NC `1010053` a `1010059` (`1010056` y `1010057` en corridas fallidas, aprobadas). Externas de FE consumidas: `9300011`, `9300013`, `9300014`.
