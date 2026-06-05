# TASKS Autogestion Avanzada Soporte v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_AUTOGESTION_AVANZADA_SOPORTE_v0.1.md`
- `docs/PLAN_AUTOGESTION_AVANZADA_SOPORTE_v0.1.md`
- `docs/API_FACTURACION_ELECTRONICA/OPERACION_RECHAZOS_Y_AUTOGESTION_v0.1.md`
- `spec/openapi.yaml`

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
| --- | --- | --- | --- | --- |
| AGS-001 | SDD | Crear cadena SPEC/PLAN/TASKS soporte | DONE | Documentos creados y alineados |
| AGS-002 | API soporte | Exponer `decision` y `eventos` en SaaS interno | DONE | `GET /facturas/{documentoId}/gestion/decision` y `GET /facturas/{documentoId}/eventos` quedan restringidos a `SOPORTE_INTERNO`/`ADMIN_INTERNO`, normalizados y documentados en OpenAPI |
| AGS-003 | API soporte | Exponer `validate-cdc-impact` + `retry-same-cdc` | DONE | Flujo de reintento CDC controlado |
| AGS-004 | API soporte | Exponer `void-number` + `create-derived` | DONE | Flujo de reemplazo con inutilizacion |
| AGS-005 | API soporte | Exponer `cancel-send` para cola batch | DONE | Solo documentos elegibles |
| AGS-006 | Seguridad | Enforzar permisos y guardrails de ventana | DONE | Operador comercial no accede |
| AGS-007 | Auditoria | Registrar actor/motivo/request/response/resultado | DONE | Trazabilidad completa |
| AGS-008 | UI soporte | Pantalla de autogestion por alerta | DONE | Acciones guiadas y no ambiguas |
| AGS-009 | QA | Validar casos dentro/fuera de ventana | PENDING | Evidencia Playwright + API |

## Evidencia

- 2026-05-28: cerradas `AGS-006` y `AGS-007` en backend. Se agregan guardrails de ventana operativa para autogestion avanzada: `72h` en `validate-cdc-impact`, `retry-same-cdc`, `create-derived`, `cancel-send`; `360h` (15 dias) en `void-number`, con respuesta `409` fuera de ventana. Tambien se agrega auditoria en `audit_events` para acciones de regularizacion (`FACTURA_GESTION_RETRY_SAME_CDC`, `FACTURA_GESTION_CREATE_DERIVED`, `FACTURA_GESTION_CANCEL_SEND`, `FACTURA_GESTION_VOID_NUMBER`) registrando actor, motivo/comentario y resultado resumido. OpenAPI actualizado con `409` para endpoints de gestion avanzada.
- 2026-05-28: validacion backend en flujo unico para tareas `AGS-003..AGS-007`: `npm run test --workspace @facturacion-simple/api -- facturas.service.test.ts fiscal-gateway.test.ts`, `npm run typecheck --workspace @facturacion-simple/api`, `npm run lint --workspace @facturacion-simple/api`. Se confirman casos dentro/fuera de ventana y persistencia de auditoria por accion avanzada. `AGS-009` queda pendiente hasta evidencia Playwright/UI.
- 2026-05-28: cerrada `AGS-008` con UI de soporte interno en `Documentos` (detalle): bloque `Autogestion soporte interno` visible solo para `SOPORTE_INTERNO`/`ADMIN_INTERNO`, mostrando `decision` operativa, prevalidacion `impacto CDC` y acciones guiadas `retry-same-cdc`, `create-derived`, `cancel-send`, `void-number`. Se mantiene oculto para `OPERADOR_FACTURACION`. Validacion frontend ejecutada: `npm run typecheck --workspace @facturacion-simple/web-operacion` y `npm run build --workspace @facturacion-simple/web-operacion`.
- 2026-05-28: cerradas `AGS-003`, `AGS-004` y `AGS-005` con endpoints SaaS internos `POST /facturas/{documentoId}/gestion/validate-cdc-impact`, `POST /facturas/{documentoId}/gestion/retry-same-cdc`, `POST /facturas/{documentoId}/gestion/create-derived`, `POST /facturas/{documentoId}/gestion/cancel-send` y `POST /facturas/{documentoId}/gestion/void-number`, todos restringidos a `SOPORTE_INTERNO`/`ADMIN_INTERNO` y delegados a FE admin (`validate-cdc-impact`, `retry-same-cdc`, `create-derived`, `cancel-send`, `void-number`). Se actualizo `spec/openapi.yaml` con requests/responses de autogestion avanzada. Validacion ejecutada: `npm run test --workspace @facturacion-simple/api -- facturas.service.test.ts`, `npm run typecheck --workspace @facturacion-simple/api`, `npm run lint --workspace @facturacion-simple/api`.
- 2026-05-27: cerrado `AGS-002` con endpoint SaaS interno `GET /facturas/{documentoId}/gestion/decision` (proxy normalizado a FE admin `decision`) y endurecimiento de permisos en `GET /facturas/{documentoId}/eventos` para bloquear `OPERADOR_FACTURACION`. Actualizado `spec/openapi.yaml` con contrato `DocumentoDecisionResponse` y respuestas `403`. Validacion automatizada: `npm run test --workspace @facturacion-simple/api -- facturas.service.test.ts`.
