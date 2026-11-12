# TASKS — Tutoriales en video para operadores v0.2

**SPEC:** `docs/SPEC_TUTORIALES_VIDEO_v0.2.md` · **PLAN:** `docs/PLAN_TUTORIALES_VIDEO_v0.2.md`

## Pendientes del usuario

| Id | Pregunta | Estado |
|---|---|---|
| P-6 | (v0.1) Regrabar V5 | **Resuelta (2026-11-12):** se regraba ("lo que quedo sin grabar") |
| P-7 | (v0.1) Regrabar V1 y V4 | **Resuelta (2026-11-12):** se regraban |
| P-8 | Si se regraba tambien V2 (etiquetas de la remision) y si V3 y V6 quedan como estan. Propuesta: V2 si (dice "Por planilla", que ya no es cierto en el stack); V3 y V6 no (siguen siendo correctas; lo nuevo lo explican V7 y V9) | Abierta (propuesta en SPEC D-14) |
| P-9 | Transportista de V8: SEGEL SA `80026570-0` como empresa transportista (SPEC D-13) | Abierta (propuesta) |
| P-10 | Orden para grabar V7 (descuentos) | Abierta: el usuario la da "en su momento" (SPEC D-11) |

## Matriz

| Id | Tarea | Verificacion | Estado |
|---|---|---|---|
| TUT2-000 | SPEC, PLAN y TASKS v0.2 | revision del usuario | HECHO (borrador 2026-11-12) |
| TUT2-001 | Prueba seca: etiquetas de SPEC §3.10 a §3.12 buscadas en `apps/web-operacion/src`; stack local en la punta de la rama (`X-App-Version`); remision habilitada en 001-001 del FE local (R-9); `prueba-seca.cjs` sin emitir sobre "Nueva nota de remisión", "Catálogo" y "Agregar descuento", con la guardia | Playwright 1440: capturas sin datos prohibidos; la pestaña "Nueva nota de remisión" habilitada | Pendiente |
| TUT2-002 | `mapa.cjs`: filas 3.10-*, 3.11-*, 3.12-*; 3.2-remision con v8 | `cobertura.cjs` lista las filas nuevas como pendientes antes de grabar | Pendiente |
| TUT2-003 | V9 catalogo en dolares | Playwright: escenas de PLAN §3 V9; guardia sin fallas; mp4; nada emitido | Pendiente |
| TUT2-004 | V8 nota de remision | 1 nota "Aprobada" en SIFEN test, numero en `estado.json`; mp4 | Pendiente (aviso a FE antes) |
| TUT2-005 | V1, V4, V5 regrabados (PLAN §4) | V4: 2 NC aprobadas; V5: cargas "Finalizada"; mp4; capturas sin H-11, H-13 ni la actividad real | Pendiente (aviso a FE antes) |
| TUT2-006 | V2 regrabado (si P-8 se acepta) | mp4; escena de remision con las tres pestañas | Pendiente (P-8) |
| TUT2-007 | Revision final de V1, V2, V4, V5, V8, V9 | una captura por escena; `cobertura.cjs` sin filas pendientes salvo las de V7 | Pendiente |
| TUT2-008 | V7 descuentos: guion y prueba seca | Playwright sin emitir: CA-12 de descuentos visible en las escenas 3 a 5 | Pendiente |
| TUT2-009 | V7 descuentos: grabacion | 1 factura aprobada con "Descuento (20 %)"; mp4 | **Espera la orden del usuario (P-10, D-11)** |
| TUT2-010 | Cierre: SPEC/PLAN/TASKS con lo aprendido; `BACKLOG` (hallazgos nuevos y estado de la cadena) | — | Pendiente |

## Antes de cada corrida

Lo de `TASKS_TUTORIALES_VIDEO_v0.1` ("Antes de cada corrida"), mas: confirmar que ninguna otra sesion esta usando `operador-ensayo` para probar descuentos (PLAN §6).

## Evidencia

(vacia)
