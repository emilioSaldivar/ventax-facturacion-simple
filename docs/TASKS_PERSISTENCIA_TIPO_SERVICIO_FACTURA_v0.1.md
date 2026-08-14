# TASKS Persistencia Tipo Servicio Factura v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_PERSISTENCIA_TIPO_SERVICIO_FACTURA_v0.1.md`
- `docs/PLAN_PERSISTENCIA_TIPO_SERVICIO_FACTURA_v0.1.md`
- `spec/openapi.yaml`

## Estado General

- `SPEC`: DONE
- `PLAN`: DONE
- `TASKS`: DONE — implementacion completa y validada (backend, frontend, tests, Postgres real, navegador real).

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
| --- | --- | --- | --- | --- |
| TSF-001 | SDD | Crear cadena SPEC/PLAN/TASKS de esta iniciativa | DONE | Existen los tres documentos versionados y referenciados entre si |
| TSF-002 | Datos | Crear migracion `0030_tipo_transaccion_default.sql` (columna `tipo_transaccion_default` en `actividad_punto_perfiles`, default `2`, check `in (1,2,3)`) | DONE | Migracion aplicada contra Postgres real (`npm run migrate`, log `"applied":["0030"]`); verificado con `\d actividad_punto_perfiles`: `smallint not null default 2` + check `tipo_transaccion_default = ANY (ARRAY[1,2,3])` |
| TSF-003 | Contexto/API | Exponer `actividad_punto_perfil_id` interno (no publico) en `OperationalContextResponse`, poblado en `context.repository.ts` (`app.id as actividad_punto_perfil_id`) | DONE | `apps/api/src/modules/context/context.types.ts` (campo comentado como interno) y `context.repository.ts` (`select ... app.id as actividad_punto_perfil_id`); verificado end-to-end via `curl /me/context` real, campo presente con el uuid correcto |
| TSF-004 | Contexto/API | Agregar `tipo_transaccion_default` a `context.types.ts` (`fiscal_context`) y al mapeo de `context.repository.ts` (`ContextRow`, query, respuesta) | DONE | Verificado con `curl /me/context` real: `fiscal_context.tipo_transaccion_default` presente y coincide con la columna en DB |
| TSF-005 | Contrato | Actualizar `spec/openapi.yaml` con `tipo_transaccion_default` en el schema de `fiscal_context` | DONE | Schema `FiscalContext` en `spec/openapi.yaml`: propiedad `tipo_transaccion_default` (enum 1/2/3) agregada a `required` y `properties` |
| TSF-006 | Backend | Implementar `updateTipoTransaccionDefault(actividadPuntoPerfilId, valor)` en `context.repository.ts` | DONE | `UPDATE ... WHERE id = $1 AND tipo_transaccion_default IS DISTINCT FROM $2`; probado manualmente contra Postgres real: primera corrida `UPDATE 1`, segunda corrida con mismo valor `UPDATE 0` (confirma que evita escrituras redundantes) |
| TSF-007 | Backend | Invocar `updateTipoTransaccionDefault` dentro de `enqueueFacturaEmission()` tras `createQueuedEmission`, en `try/catch` de mejor esfuerzo | DONE | `apps/api/src/modules/facturas/facturas.service.ts`: helper `persistTipoTransaccionDefault()`; verificado end-to-end real: `POST /facturas` con `tipo_transaccion=1` seguido de `POST /facturas` con `tipo_transaccion=3`, cada vez `GET /me/context` reflejo el nuevo valor inmediatamente |
| TSF-008 | Backend | Resolver inyeccion de dependencia de `ContextRepository`/`updateTipoTransaccionDefault` en `enqueueFacturaEmission()` sin acoplar `facturas.service.ts` a la implementacion Postgres del modulo `context` | DONE | `enqueueFacturaEmission(..., { contextRepository?: OperationalContextRepository })`, mismo patron que `clienteRepository`; conectado en `facturas.routes.ts` (`contextRepository: operationalContextRepository`) |
| TSF-009 | Frontend | Reemplazar `useState<TipoTransaccionServicio>(2)` por inicializacion desde `context?.fiscal_context.tipo_transaccion_default ?? 2` | DONE | `apps/web-operacion/src/main.tsx`; verificado visualmente con Playwright: tras setear `tipo_transaccion_default=3` via API, la pantalla "Nueva factura" cargo con "3 - Mixto (mercaderia + servicios)" preseleccionado, no "2" |
| TSF-010 | Frontend | Reemplazar `setTipoTransaccion(2)` en `createNuevaFactura()` por `setTipoTransaccion(context?.fiscal_context.tipo_transaccion_default ?? 2)` | DONE | `apps/web-operacion/src/main.tsx`, mismo patron que `setCreditoPlazoDias` |
| TSF-011 | QA | Tests unitarios: `updateTipoTransaccionDefault`, integracion de `enqueueFacturaEmission` con la nueva escritura (exito y fallo simulado del `update`) | DONE | `apps/api/tests/facturas.service.test.ts`: `FakeContextRepository` + 4 tests nuevos (persiste al encolar, no persiste sin `contextRepository`, no falla la respuesta si el `update` lanza error, no se revierte si la emision fiscal asincrona falla despues) |
| TSF-012 | QA | Test de integracion: `GET` contexto operativo refleja `tipo_transaccion_default` actualizado tras encolar una factura previa con valor distinto | DONE | Verificado end-to-end contra la implementacion Postgres real (no solo fakes): secuencia `POST /facturas` (`tipo_transaccion=1`) → `GET /me/context` devolvio `tipo_transaccion_default=1`; repetido con `3` → `tipo_transaccion_default=3`. No se agrego un test vitest equivalente porque el repo no tiene infraestructura de integracion contra Postgres real en la suite (los tests existentes usan fakes exclusivamente); se prioriza la verificacion manual real, mas fuerte que un fake |
| TSF-013 | QA visual | Validacion Playwright: confirmar que el selector de tipo de servicio parte del valor persistido, no de `2` fijo | DONE | Script Playwright (viewport 430x900) contra `api` dev + `web-operacion` dev + Postgres real, con `tipo_transaccion_default=3` preexistente en DB (seteado por request previo). Captura: selector "Tipo de servicio" muestra "3 - Mixto (mercaderia + servicios)" al cargar la pantalla. No se probo el flujo completo de submit-por-UI (agregar producto + emitir) por Playwright dado que ya se verifico el mecanismo de escritura end-to-end via API+DB en TSF-007/012; el guion de UI cubre especificamente el camino de lectura (TSF-009/010) |
| TSF-014 | Cierre | Repasar `SPEC`/`PLAN`/`TASKS` contra implementacion real y actualizar estados | DONE | Este documento; `SPEC`/`PLAN` reflejaban correctamente el diseno final implementado, sin cambios adicionales necesarios |

## Evidencia

- **Migracion**: `npm run migrate --workspace @facturacion-simple/api` contra `postgres:16-alpine` local, log `"applied":["0030"]`.
- **Typecheck**: `npm run typecheck --workspace @facturacion-simple/api` y `npm run typecheck --workspace @facturacion-simple/web-operacion`, ambos sin errores.
- **Tests unitarios**: `npm run test --workspace @facturacion-simple/api`, todos los tests nuevos de `facturas.service.test.ts` relacionados a `tipo_transaccion_default` en verde.
- **Validacion end-to-end real** (la evidencia mas fuerte de esta iniciativa, dado que el mecanismo central es un side-effect en base de datos):
  1. `POST /api/v1/facturas` con `tipo_transaccion=1` → `GET /api/v1/me/context` devuelve `fiscal_context.tipo_transaccion_default=1`.
  2. `POST /api/v1/facturas` con `tipo_transaccion=3` → `GET /api/v1/me/context` devuelve `fiscal_context.tipo_transaccion_default=3`.
  3. Confirmado directamente en `actividad_punto_perfiles.tipo_transaccion_default` via `psql`.
- **Validacion visual (Playwright)**: captura de la pantalla "Nueva factura" mostrando el selector "Tipo de servicio" en "3 - Mixto" (no en el "2" hardcodeado original) tras la persistencia previa.
- **Usuario de prueba usado**: `operador-bo004-local-1779146433481` (credenciales en `.env`, `SMOKE_USERNAME`/`SMOKE_PASSWORD`), unico usuario local con `scope: full` y contexto operativo completo entre los usuarios de smoke existentes.
