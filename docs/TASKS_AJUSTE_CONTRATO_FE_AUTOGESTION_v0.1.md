# TASKS Ajuste Contrato FE y Autogestion v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_AJUSTE_CONTRATO_FE_AUTOGESTION_v0.1.md`
- `docs/PLAN_AJUSTE_CONTRATO_FE_AUTOGESTION_v0.1.md`
- `docs/API_FACTURACION_ELECTRONICA/openapi.yaml`
- `spec/openapi.yaml`
- `docs/TASKS_IMPLEMENTACION_MVP_v0.1.md`

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
| --- | --- | --- | --- | --- |
| FCA-001 | SDD | Crear cadena SPEC/PLAN/TASKS de ajuste FE | DONE | Existen estos documentos versionados y referenciados |
| FCA-002 | Ajuste critico contrato | Auditar mapeo actual de emision/eventos/consultas/archivos vs OpenAPI FE | DONE | Existe inventario de endpoints ya integrados y gaps de contrato pendientes |
| FCA-003 | Ajuste critico contrato | Normalizar `delivery_mode` FE incluyendo `AUTO_FALLBACK_BATCH` en tipos/respuesta SaaS | DONE | Modelo y contrato SaaS distinguen `SYNC`, `BATCH` y fallback auto sin ambiguedad |
| FCA-004 | Ajuste critico contrato | Persistir trazabilidad minima de idempotencia FE en respuestas de emision | DONE | Conflictos 409 idempotentes quedan auditables sin inspeccion manual de logs FE |
| FCA-005 | Ajuste critico contrato | Alinear/documentar semantica `emisor_id` en contrato SaaS y contexto operativo | DONE | `spec/openapi.yaml` y docs operativas dejan explicito uso de RUC completo FE |
| FCA-006 | Ajuste critico contrato | Revisar soporte de `env` en consultas FE usadas por SaaS (estado/archivos/eventos) | DONE | El gateway define criterio unico para multi-ambiente y evita consultas ambiguas |
| FCA-007 | Ajuste critico contrato | Endurecer mapping de estados FE->SaaS para eventos/cancelaciones intermedias | DONE | Estados operativos no marcan `ANULADA`/`EMITIDA` prematuramente |
| FCA-008 | Autogestion cliente | Integrar consulta de eventos por CDC (`/consultar/evento/{cdc}`) | DONE | API SaaS expone historial resumido de eventos por documento |
| FCA-009 | Autogestion cliente | Integrar consulta de lotes pendientes (`/consultar/{id}/batch-pendientes`) | DONE | Operador visualiza cola/lote pendiente sin entrar a soporte tecnico |
| FCA-010 | Autogestion soporte | Integrar consulta de listado FE para reconciliacion (`/consultar/{id}/facturalista/{numero}`) | DONE | Soporte puede contrastar documentos FE vs SaaS con filtros basicos |
| FCA-011 | Autogestion interna | Evaluar inutilizacion de rango (`/evento/inutilizacionnumfactura`) solo backoffice | DONE | Decision documentada: no exponer en UI operativa; mantener fuera de alcance y reservar para flujo backoffice con doble confirmacion/auditoria |
| FCA-012 | QA/Documentacion | Registrar evidencias de validacion por cada tarea cerrada | DONE | Este TASKS y `TASKS_IMPLEMENTACION_MVP` incluyen comandos/resultados sin secretos |
| FCA-013 | UI documentos | Implementar bloque `Gestion de documentos` para pantalla final | DONE | Vista `Documentos` muestra bloque con `Estado de mis documentos`, `Historial del documento`, `Documentos en espera de confirmacion` y `Comparar con registro fiscal` |

## Evidencia

- 2026-05-24: creada cadena SDD `AJUSTE_CONTRATO_FE_AUTOGESTION` tras relevar `docs/API_FACTURACION_ELECTRONICA/openapi.yaml` contra integraciones actuales en `apps/api/src/modules/fiscal-gateway/fiscal-gateway.client.ts` y `spec/openapi.yaml`. Se clasificaron tareas en dos tracks: ajuste critico de contrato (FCA-003..FCA-007) y autogestion incremental (FCA-008..FCA-011). No se implementaron cambios de codigo en esta iteracion documental.
- 2026-05-24: cerradas `FCA-003..FCA-007`, `FCA-012` y `FCA-013`. API: `FiscalGateway` normaliza `delivery_mode` (`SYNC`, `BATCH`, `AUTO_FALLBACK_BATCH`), expone `idempotent`, agrega `env` a descargas de artefactos FE y endurece mapping de cancelacion para no marcar `ANULADA` de forma prematura. Contrato SaaS actualizado en `spec/openapi.yaml` (incluye `FiscalDeliveryMode`, `delivery_mode`, `fiscal_idempotent` y semantica de `emisor_id` como RUC completo FE). UI: `Documentos` incluye bloque final `Gestion de documentos` con los 4 accesos operativos. Verificacion ejecutada: `npm run test --workspace @facturacion-simple/api -- fiscal-gateway`, `npm run typecheck --workspace @facturacion-simple/api`, `npm run lint --workspace @facturacion-simple/api`, `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion`. Intento de `bash scripts/deploy.sh` sin cierre por error de Docker network (`invalid config for network bridge`, aliases solo en user-defined network), pendiente validacion sobre contenedores una vez corregida la red.
- 2026-05-24: cerradas `FCA-008`, `FCA-009` y `FCA-010` con nuevas capacidades de autogestion en API/UI. API agrega `GET /facturas/{documentoId}/eventos`, `GET /facturas/gestion/batch-pendientes` y `GET /facturas/gestion/reconciliacion` (solo `SOPORTE_INTERNO`/`ADMIN_INTERNO`) delegando a FE `consultar/evento`, `batch-pendientes` y `facturalista` con `env`. UI `Documentos` conecta los bloques de `Gestion de documentos` con estas consultas. `FCA-011` queda evaluada y documentada como decision de no exponer `inutilizacion` en UI operativa; se reserva para fase backoffice con guardas. Verificacion ejecutada en una sola pasada: `npm run test --workspace @facturacion-simple/api -- fiscal-gateway facturas.service`, `npm run typecheck --workspace @facturacion-simple/api`, `npm run lint --workspace @facturacion-simple/api`, `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion`, y validacion Playwright mock de frontend via `NODE_PATH=/home/s4ldiv/.npm/_npx/a4d0c66fe73b166b/node_modules node /tmp/gestion-documentos-playwright.cjs` con resultado `playwright-gestion-documentos: ok`.

## Nombres UI Cliente Final

Estos nombres reemplazan terminos tecnicos en la pantalla operativa del cliente final.

### Ajustes Criticos (Interno -> Visible UI)

| ID | Nombre interno | Nombre simple para cliente |
| --- | --- | --- |
| FCA-003 | Normalizar delivery_mode FE | Forma de envio de la factura |
| FCA-004 | Trazabilidad de idempotencia FE | Control de reintentos sin duplicados |
| FCA-005 | Semantica emisor_id | Identificacion fiscal del facturador |
| FCA-006 | Soporte de env en consultas FE | Entorno fiscal de consulta |
| FCA-007 | Mapping de estados FE->SaaS | Estado real del documento |

### Autogestion (Interno -> Visible UI)

| ID | Nombre interno | Nombre simple para cliente |
| --- | --- | --- |
| FCA-008 | Eventos por CDC | Historial del documento |
| FCA-009 | Batch pendientes | Documentos en espera de confirmacion |
| FCA-010 | Facturalista FE para reconciliacion | Comparar con registro fiscal |
| FCA-011 | Inutilizacion de rango (backoffice) | Anular rango de numeracion (solo soporte) |

## Apartado UI: Gestion De Documentos

Nombre de seccion recomendado en menu/pantalla: `Gestion de documentos`.

Bloques sugeridos para mantener UX simple:

1. `Estado de mis documentos`
2. `Historial del documento`
3. `Documentos en espera de confirmacion`
4. `Comparar con registro fiscal`
5. `Anular rango de numeracion` (solo soporte/backoffice, no visible para operador comun)
