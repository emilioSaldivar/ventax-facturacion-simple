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
| EST-004 | Receptores | Crear catalogo local de receptores de prueba aprobables | DONE | Existe `docs/RECEPTORES_SIFEN_TEST_v0.1.md` con receptor aprobado `CI 492019` y receptor de rechazo controlado `RUC 80000000-1` |
| EST-005 | Diagnostico | Mejorar resumen de rechazo SIFEN en API/UI | DONE | Documento rechazado muestra codigo, mensaje, CDC/numero si existen y recomendacion operativa; la vista `Documentos` y resultado de emision usan `fiscal_status` resumido |
| EST-006 | Artefactos | Extender smoke operativo para validar KUDE/PDF y XML | PENDING_VALIDATION | `scripts/onboarding-smoke.cjs` valida documento publico, KUDE/PDF y XML con polling, pero FE devolvio 500 al pedir KUDE/PDF; queda pendiente de validacion externa de `fe-api.ventax.app` |
| EST-007 | NCE | Agregar smoke real de NCE total sobre factura aprobada | PENDING_VALIDATION | `scripts/onboarding-smoke.cjs` soporta `ONBOARDING_SMOKE_NCE=YES`; se corrigio payload NCE para enviar `timbrado.documentoNro` string y tests API pasan, pero no se reintenta FE por bloqueo externo |
| EST-008 | Backoffice | Documentar checklist manual de alta de facturador | DONE | Existe `docs/CHECKLIST_ALTA_FACTURADOR_MVP_v0.1.md` con pasos de emisor, timbrado, punto, actividad, operador, readiness y smoke |
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
- 2026-05-19: `EST-004` cerrado con `docs/RECEPTORES_SIFEN_TEST_v0.1.md`, catalogando `CI 492019` como receptor aprobable y `RUC 80000000-1` como rechazo controlado `1306`.
- 2026-05-19: `EST-005` cerrado con diagnostico SIFEN ya expuesto en API/UI desde `fiscal_status`: codigo, mensaje, numero/CDC cuando existen y recomendacion operativa para rechazos como `1306`.
- 2026-05-19: `EST-006` queda `PENDING_VALIDATION`: el smoke fue extendido para leer `public_url`, validar documento publico y fallar si KUDE/PDF o XML no responden. Validacion contra contenedores llego a FE, pero KUDE/PDF devolvio `502` local por `gateway_code: UPSTREAM_ERROR` y `details.status: 500` desde FE.
- 2026-05-19: `EST-007` queda `PENDING_VALIDATION`: el smoke fue extendido con `ONBOARDING_SMOKE_NCE=YES` y se corrigio el payload NCE para enviar `timbrado.documentoNro` string aun con `FE_SERVICE_NUMBERING=true`. Validacion local: `npm run test --workspace @facturacion-simple/api`, `npm run build --workspace @facturacion-simple/api`, `npm run qa:no-secrets` y `bash scripts/deploy.sh`. No se reintenta FE por instruccion operativa ante error externo.
- 2026-05-19: `EST-008` cerrado con `docs/CHECKLIST_ALTA_FACTURADOR_MVP_v0.1.md`.
- 2026-05-19: agregado log estructurado `fiscal_artifact_fetch_failed` para fallos de KUDE/PDF/XML con `requestId`, hora, endpoint, artefacto, CDC, numero fiscal, estado del documento y detalle del gateway. Validacion: `npm run test --workspace @facturacion-simple/api` y `npm run build --workspace @facturacion-simple/api`.

## Pendiente De Validacion Externa

Quedan fuera de DONE hasta que FE responda correctamente:

- `EST-006`: KUDE/PDF y XML para factura aprobada.
- `EST-007`: NCE total real con `ONBOARDING_SMOKE_NCE=YES`.
