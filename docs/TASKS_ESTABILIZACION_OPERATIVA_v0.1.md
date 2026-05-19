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
| EST-009 | Catalogo UI | Agregar pantalla operativa de catalogo de productos/servicios | DONE | Operador lista, filtra, crea y edita items del catalogo del facturador |
| EST-010 | Documentos UI | Mejorar pantalla de documentos con consulta SIFEN y diagnostico fiscal | DONE | Operador ve codigo/mensaje SIFEN y puede consultar estado FE/SIFEN desde el detalle |
| EST-011 | UX Mobile | Reorganizar navegacion operativa con menu hamburguesa | DONE | Operador navega Inicio, Nueva factura, Catalogo y Documentos desde menu mobile |
| EST-012 | Entorno Local | Configurar `admin/admin` como operador del facturador test | DONE | Login admin muestra readiness listo y permite emitir desde UI contra FE test |

## Evidencia

- 2026-05-19: `EST-001` creado para separar estabilizacion operativa del MVP ya cerrado.
- 2026-05-19: `EST-002` documenta resultados reales: `0002106` aprobado para CI `492019`; `0002104` y `0002105` rechazados para RUC generico `80000000-1` con codigo SIFEN test `1306`.
- 2026-05-19: `EST-003` ya cuenta con `scripts/onboarding-smoke.cjs` y ejecucion exitosa previa: `estado EMITIDA`, numero `0002106`, CDC `01801369681001001000210622026051918996595030`.
- 2026-05-19: `EST-009` implementa vista `Catalogo` en web-operacion con listado, filtros, alta y edicion sobre `/catalogo/items`.
- 2026-05-19: `EST-010` mejora vista `Documentos` y resultado de emision: muestra resumen SIFEN desde `fiscal_status` y expone la accion `Consultar SIFEN` sobre `/facturas/{id}/refresh-status`.
- 2026-05-19: Validacion `EST-009`/`EST-010`: `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run lint --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion`, `npm run qa:no-secrets`, `bash scripts/deploy.sh`, `curl -sS http://127.0.0.1:8092/healthz`, `curl -sS http://127.0.0.1:8092/api/v1/health`, `docker compose ps` y Playwright mobile contra `http://127.0.0.1:8092/app/`.
- 2026-05-19: Regla de validacion actualizada: las validaciones HTTP, smoke y visuales de comportamiento real deben ejecutarse contra contenedores redeployados con `bash scripts/deploy.sh`.
- 2026-05-19: `EST-011` implementa navegacion mobile con menu hamburguesa para Inicio, Nueva factura, Catalogo, Documentos y Salir.
- 2026-05-19: `EST-012` configura localmente `admin/admin` con contexto operativo activo del facturador test `80136968-1`, establecimiento `001`, punto `001`, actividad `82110`, perfil local `SERV`.
- 2026-05-19: Validacion `EST-011`/`EST-012`: `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run lint --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion`, `npm run qa:no-secrets`, `bash scripts/deploy.sh`, healthchecks `frontend`/`api`, Playwright mobile contra contenedores con `admin/admin`, readiness `ready: true`, y `SMOKE_USERNAME=admin SMOKE_PASSWORD=admin npm run ops:onboarding-smoke`.
- 2026-05-19: Smoke operativo real con `admin/admin` emitio factura FE test `0002107`, estado `EMITIDA`, CDC `01801369681001001000210722026051912601909677`, `smokeId` `onboarding-20260519032022114`.

## Siguiente Iteracion Recomendada

Tomar juntas `EST-004`, `EST-005` y `EST-006`.

Motivo:

- las tres giran alrededor de hacer confiable la prueba de alta;
- no requieren cambiar dominio fiscal;
- se verifican con una sola corrida de `npm run ops:onboarding-smoke`.
