# TASKS Correcciones de FS tras los fixes de FE v0.1

## Alineacion

- `docs/SPEC_CORRECCIONES_TRAS_FIXES_FE_v0.1.md`
- `docs/PLAN_CORRECCIONES_TRAS_FIXES_FE_v0.1.md`

## Matriz

| ID | Error | Tarea | Hecho cuando | Estado |
|---|---|---|---|---|
| CFF-001 | Todos | SPEC, PLAN y TASKS | Documentos en `AGENTS.md` | DONE (2026-11-06) |
| CFF-002 | FS-20, FS-21, FS-23 | Codigo y pruebas unitarias | 480 pruebas pasan, typecheck sin errores | DONE (2026-11-06), E-1 |
| CFF-003 | FS-24 | Bandera `VERIFICACION_LOTE_SIN_REFRESH` y opcion `omitirRefreshEnLote` en el servicio | Pruebas CA-24.1, CA-24.2 y CA-24.6 | TODO |
| CFF-004 | FS-24 | Reprogramacion a 15 min sin gastar intentos, con tope de 48 h | Pruebas CA-24.3, CA-24.4 y CA-24.5 | TODO |
| CFF-005 | FS-25 | Confirmar en local que las 6 acciones responden error de autenticacion | Respuesta de cada ruta registrada en la evidencia | FUERA: FS-25 pasa a la cadena de autogestion del operador |
| CFF-006 | FS-25 | Retirar interfaz, rutas, metodos del gateway y contrato | CA-25.1 a CA-25.3; `spec/openapi.yaml` sin las 6 rutas | FUERA: idem CFF-005 |
| CFF-007 | FS-20, FS-23, FS-25 | Playwright en 390 px y 1280 px: rechazo con su causa, mensaje de `0100`, detalle sin las 6 acciones | Capturas y resultado en la evidencia | TODO |
| CFF-008 | FS-20, FS-24 | Plantillas, `FE_REF` y runbook | PLAN, seccion 5 | BLOCKED: espera el tag de FE |
| CFF-009 | FS-20, FS-21, FS-23, FS-24 | Validacion en stack local con el tag de FE y SIFEN test | PLAN, seccion 6 | BLOCKED: espera el tag de FE |
| CFF-010 | Todos | Despliegue en `segel-fs` | Versiones desplegadas y banderas registradas | BLOCKED: espera CFF-009 y confirmacion directa del usuario |
| CFF-011 | Todos | Cierre: repasar SPEC, PLAN, TASKS y `docs/BACKLOG.md` | Documentos alineados con lo desplegado | TODO |

## Evidencia

### E-1. FS-20, FS-21 y FS-23 (2026-11-06)

Commit `2b1eed9`. `npm run test` de la API: 480 pasan, 0 fallan, 28 omitidas. `npm run typecheck` sin errores. Solo pruebas unitarias: sin validar contra FE real ni SIFEN, y sin Playwright.
