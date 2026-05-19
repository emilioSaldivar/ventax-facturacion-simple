# TASKS Estabilizacion Operativa v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_PRODUCTO_MVP_v0.1.md`
- `docs/PLAN_IMPLEMENTACION_MVP_v0.1.md`
- `docs/OPERACION_PRODUCCION_MVP_v0.1.md`
- `docs/SPEC_ESTABILIZACION_OPERATIVA_v0.1.md`
- `docs/PLAN_ESTABILIZACION_OPERATIVA_v0.1.md`

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
| --- | --- | --- | --- | --- |
| EST-001 | SDD | Crear SPEC/PLAN/TASKS de estabilizacion operativa | DONE | Existe esta cadena documental separada del MVP cerrado |
| EST-002 | QA FE | Registrar resultados reales de receptores SIFEN test | DONE | Quedan documentados CI `492019` aprobado y RUC `80000000-1` rechazado `1306` |
| EST-003 | Smoke | Mantener smoke operativo simple por facturador configurado | DONE | `npm run ops:onboarding-smoke` valida cliente, item, preview, emision FE y link publico sin crear facturador |
| EST-004 | Receptores | Crear catalogo local de receptores de prueba aprobables | PENDING | Existe documento/fixture local con receptores test validados y resultado esperado |
| EST-005 | Diagnostico | Mejorar resumen de rechazo SIFEN en API/UI | PENDING | Documento rechazado muestra codigo, mensaje, CDC/numero si existen y recomendacion operativa |
| EST-006 | Artefactos | Extender smoke operativo para validar KUDE/PDF y XML | PENDING | Smoke falla si artefactos de factura aprobada no estan disponibles |
| EST-007 | NCE | Agregar smoke real de NCE total sobre factura aprobada | PENDING | Smoke emite NCE total contra FE test y registra CDC/estado |
| EST-008 | Backoffice | Documentar checklist manual de alta de facturador | PENDING | Soporte tiene pasos claros para configurar emisor, timbrado, punto, actividad, operador y readiness |

## Evidencia

- 2026-05-19: `EST-001` creado para separar estabilizacion operativa del MVP ya cerrado.
- 2026-05-19: `EST-002` documenta resultados reales: `0002106` aprobado para CI `492019`; `0002104` y `0002105` rechazados para RUC generico `80000000-1` con codigo SIFEN test `1306`.
- 2026-05-19: `EST-003` ya cuenta con `scripts/onboarding-smoke.cjs` y ejecucion exitosa previa: `estado EMITIDA`, numero `0002106`, CDC `01801369681001001000210622026051918996595030`.

## Siguiente Iteracion Recomendada

Tomar juntas `EST-004`, `EST-005` y `EST-006`.

Motivo:

- las tres giran alrededor de hacer confiable la prueba de alta;
- no requieren cambiar dominio fiscal;
- se verifican con una sola corrida de `npm run ops:onboarding-smoke`.
