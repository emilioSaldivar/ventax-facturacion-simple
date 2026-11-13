# TASKS — Tutoriales en video para operadores v0.3

**SPEC:** `docs/SPEC_TUTORIALES_VIDEO_v0.3.md` · **PLAN:** `docs/PLAN_TUTORIALES_VIDEO_v0.3.md` · **BACKLOG:** FS-146

## Pendientes del usuario

| Id | Pregunta | Estado |
|---|---|---|
| P-11 | Factura externa para "Traer por CDC" en V11: (a) pedir a la sesion de FE una factura nueva emitida fuera de FS a SEGEL SA (recomendado: muestra el camino real), o (b) mostrar solo la validacion del CDC y emitir sobre la cargada a mano | Abierta |
| P-12 | V3 no se regraba aunque su subtitulo dice "30, 60 o 90" dias (hoy el plazo se escribe de 1 a 365) | Abierta (propuesta: no regrabar) |
| P-13 | Orden para grabar (emite en SIFEN test: 1 factura, unas 5 notas de credito) | Abierta |

## Matriz

| Id | Tarea | Verificacion | Estado |
|---|---|---|---|
| TUT3-000 | SPEC, PLAN y TASKS v0.3 | revision del usuario | HECHO (borrador 2026-11-13) |
| TUT3-001 | Prueba seca: stack local en la punta (`X-App-Version`); etiquetas de §3.5b y §3.14 releidas; eleccion de facturas con SQL (PLAN §2); `mapa.cjs` actualizado | Playwright 1440 sin emitir; `cobertura.cjs` lista las filas nuevas como pendientes | Pendiente |
| TUT3-002 | V7 regrabado con el cierre nuevo | 1 factura aprobada; capturas sin "solo admite nota de crédito por el total"; mp4 | Pendiente (P-13) |
| TUT3-003 | V4 reescrito y grabado | 3 NC aprobadas (total, combinada, por monto); mp4 | Pendiente (P-13) |
| TUT3-004 | V11 nuevo | externa por CDC (segun P-11) y a mano; al menos 1 NC aprobada; mp4 | Pendiente (P-11, P-13) |
| TUT3-005 | Revision final y cierre | una captura por escena; `cobertura.cjs`; SPEC/PLAN/TASKS y BACKLOG (FS-146) actualizados | Pendiente |

## Evidencia

### TUT3-000 (2026-11-13)

Exploracion sin emitir con Playwright 1440 sobre el stack local (`X-App-Version 3613087`):
- "Notas de crédito" muestra la pantalla unica con las etiquetas de SPEC §3.5b y la entrada "¿La factura no está en el sistema? Traela por CDC o cargala a mano".
- La ficha de `1010660` (factura de V7 con descuento) → "Crear nota de crédito" abre la pantalla unica con "Devolver" habilitado y la columna "Neto u." (78.000 y 44.000): el cierre de V7 quedo desactualizado.
- Facturas externas de prueba en la base local: `9300006`, `9300007`, `9300008` (de SIFEN) y varias a mano, todas con notas o borradas: no sirven para mostrar "Traer por CDC" desde cero (D-17).
- Hallazgo: la lista de candidatas dice "La factura ya esta acreditada por completo." (sin tilde y con "acreditada", que D-10 de `SPEC_NOTA_CREDITO_UNIFICADA_v0.1` reemplazo por devolver/ajustar). Registrado como FS-145.
