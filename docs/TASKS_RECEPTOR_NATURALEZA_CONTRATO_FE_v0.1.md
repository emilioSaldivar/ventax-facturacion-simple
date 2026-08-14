# TASKS Receptor Naturaleza y Contrato FE v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_RECEPTOR_NATURALEZA_CONTRATO_FE_v0.1.md`
- `docs/PLAN_RECEPTOR_NATURALEZA_CONTRATO_FE_v0.1.md`
- `spec/openapi.yaml`

## Estado General

- `SPEC`: DONE
- `PLAN`: DONE
- `TASKS`: DONE — implementacion completa y validada (backend, frontend, tests, Postgres real, navegador real).

**Nota post-cierre (2026-08-14)**: el label de UI se renombro de "Naturaleza" a "**Tipo de Persona**" tras verificar contra el Manual Tecnico SIFEN v150 que "Naturaleza" ya designa otro campo (`iNatRec`, contribuyente/no-contribuyente); el campo implementado aqui corresponde a `iTiContRec` ("Tipo de contribuyente" en el manual). Ver "Nota De Terminologia SIFEN" en el `SPEC`. El nombre de campo en codigo/DB/API (`naturaleza`) no cambio — solo el label visible al operador. Las evidencias de RNC-011/RNC-014 mas abajo describen capturas tomadas cuando el label todavia decia "Naturaleza"; el comportamiento funcional verificado (aparicion condicional, sugerencia, valores) es identico con el label actual.

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
| --- | --- | --- | --- | --- |
| RNC-001 | SDD | Crear cadena SPEC/PLAN/TASKS de esta iniciativa | DONE | Existen los tres documentos versionados y referenciados entre si |
| RNC-002 | Investigacion | Verificar si existe fuente SET/SIFEN que exponga tipo de persona | DONE | Documentado en `SPEC` seccion "Investigacion": no existe, ni en Consulta RUC de FE ni en el padron DNIT propio |
| RNC-003 | Datos | Crear migracion `0029_cliente_naturaleza.sql` (columna `naturaleza` en `cliente_identidades` y `facturador_clientes`, default `FISICA`, check enum) | DONE | Migracion aplicada contra Postgres real (`npm run migrate`, log `"applied":["0029"]`); verificado con `\d cliente_identidades` / `\d facturador_clientes`: columna `text not null default 'FISICA'` + check `naturaleza = ANY (ARRAY['FISICA','JURIDICA'])` en ambas tablas |
| RNC-004 | Tipos/API | Extender `clientes.types.ts` con `ClienteNaturaleza` y campo `naturaleza` en `ClienteUpsertInput`/`ClienteSearchResult`/`ClienteResponse` | DONE | `apps/api/src/modules/clientes/clientes.types.ts`; `npm run typecheck --workspace @facturacion-simple/api` en verde |
| RNC-005 | Datos/API | Persistir `naturaleza` en `clientes.repository.ts` (alta, edicion, listado, busqueda) | DONE | `apps/api/src/modules/clientes/clientes.repository.ts`: `SELECT`/`INSERT ... ON CONFLICT DO UPDATE` con `coalesce($n, 'FISICA')` en insert y `coalesce($n, tabla.naturaleza)` en update, en `cliente_identidades` y `facturador_clientes` |
| RNC-006 | API | Validar `naturaleza` con Zod en `clientes.routes.ts` | DONE | `apps/api/src/modules/clientes/clientes.routes.ts`: `naturaleza: z.enum(clienteNaturalezaTipos).optional()` |
| RNC-007 | Contrato | Actualizar `spec/openapi.yaml` con `naturaleza` en schemas de cliente | DONE | Nuevo schema `ClienteNaturaleza`; agregado a `ClienteSearchResult`, `ClienteUpsertRequest`, `DnitClienteData` (como `naturaleza_sugerida`), `FacturaClienteInput` |
| RNC-008 | Gateway fiscal | Extender `FiscalDeliveryMode` con `SYNC_FALLBACK_BATCH` y actualizar `mapDeliveryMode()` | DONE | `fiscal-gateway.types.ts` + `fiscal-gateway.client.ts`; test `"maps SYNC_FALLBACK_BATCH delivery mode without losing it as null"` en verde; tipo tambien actualizado en `apps/web-operacion/src/main.tsx:257` |
| RNC-009 | Gateway fiscal | Enviar `receptor.naturaleza` en `buildReceptor()` solo para `documento_tipo=RUC` | DONE | `buildReceptor()` en `fiscal-gateway.client.ts`; `naturaleza` propagada tambien en `FacturaClienteInput` (`facturas.types.ts`) y `resolveFacturaInputCliente()` (`facturas.service.ts`). **Bug real encontrado y corregido durante validacion en navegador**: el schema Zod de `POST /facturas` (`facturas.routes.ts`) no declaraba `naturaleza` en el sub-objeto `cliente`, por lo que Zod la descartaba silenciosamente antes de llegar a `buildReceptor()`. Verificado end-to-end contra Postgres real: `fiscal_request_snapshot->'cliente'->>'naturaleza'` = `JURIDICA` tras el fix |
| RNC-010 | UI cliente | Agregar campo `naturaleza` (Fisica/Juridica) en formulario de alta/edicion de cliente, visible solo para RUC | DONE | Implementado en **dos** pantallas de `apps/web-operacion/src/main.tsx`: `ClientesAgendaView` (agenda de clientes) y el formulario inline de cliente en `CreateFacturaView` (pantalla "Nueva factura"). Verificado visualmente con Playwright en ambas |
| RNC-010b | Backend | Implementar `sugerirNaturaleza(ruc, razonSocial?)` en `clientes.service.ts` (longitud de RUC + lista cerrada de sufijos societarios) y exponerla como `naturaleza_sugerida` en el payload de autocompletado DNIT existente | DONE | `apps/api/src/modules/clientes/clientes.service.ts`; 5 tests unitarios (`sugerirNaturaleza` describe block) cubriendo RUC largo, RUC corto con/sin sufijo, razon_social vacia, y no-match por substring |
| RNC-011 | UI cliente | Sugerencia no vinculante de Juridica combinando RUC >7 digitos y/o sufijo societario en `razon_social` (fuente unica: backend, `naturaleza_sugerida`) | DONE | Frontend consume `naturaleza_sugerida` del autocompletado DNIT; fallback local (solo longitud de RUC, nunca sufijos) cuando DNIT no encuentra coincidencia (`sugerirNaturalezaPorLongitudRuc` en `main.tsx`); flag `naturalezaTouched`/`clienteNaturalezaTouched` evita sobreescribir una eleccion manual del operador. Copy: "Sugerido segun RUC/razon social, verificar con el cliente." Verificado visualmente: RUC largo -> "Juridica" preseleccionado en ambas pantallas |
| RNC-012 | QA | Tests unitarios: repositorio de clientes, `buildReceptor`, `mapDeliveryMode`, `sugerirNaturaleza` | DONE | `apps/api/tests/clientes.service.test.ts`, `apps/api/tests/fiscal-gateway.test.ts`, `apps/api/tests/facturas.routes.test.ts` (regresion del bug de Zod). Ejecutado: `npm run test --workspace @facturacion-simple/api` |
| RNC-013 | QA | Tests de integracion de rutas de clientes y emision con cliente Juridica (mock gateway) | DONE | `apps/api/tests/facturas.service.test.ts`: tests `"includes receptor naturaleza only when..."`, `"omits receptor naturaleza when..."`, `"keeps explicit naturaleza from the request..."`; validado ademas end-to-end real via curl contra API+Postgres local (no solo mocks) |
| RNC-014 | QA visual | Validacion Playwright del formulario de cliente (mobile-first + desktop) | DONE | Script Playwright (viewport 430x900, mobile-first) contra `api` (dev, `FE_GATEWAY_MODE=mock`) + `web-operacion` (vite dev) + Postgres real. Capturas: selector "Naturaleza" visible con RUC largo -> "Juridica" preseleccionado (agenda y factura), selector ausente al cambiar a CI (ambas pantallas). No se corrio en viewport desktop adicional ni el caso "edicion sin tocar naturaleza" por navegador (cubierto por test unitario `updateForFacturador`/`coalesce` a nivel repositorio) |
| RNC-015 | Cierre | Repasar `SPEC`/`PLAN`/`TASKS` contra implementacion real y actualizar estados | DONE | Este documento; `SPEC`/`PLAN` ya reflejaban el diseno final, sin necesidad de cambios adicionales tras la implementacion (unico ajuste real fue el fix del schema Zod, ya cubierto con test de regresion) |

## Evidencia

- **Migraciones**: `npm run migrate --workspace @facturacion-simple/api` contra `postgres:16-alpine` local (`docker compose up -d postgres`), log `"applied":["0029"]`, columnas y checks verificados con `psql \d`.
- **Typecheck**: `npm run typecheck --workspace @facturacion-simple/api` y `npm run typecheck --workspace @facturacion-simple/web-operacion`, ambos sin errores.
- **Tests unitarios/integracion**: `npm run test --workspace @facturacion-simple/api` — 4 archivos nuevos/extendidos (`clientes.service.test.ts`, `fiscal-gateway.test.ts`, `facturas.service.test.ts`, `facturas.routes.test.ts`), todos los tests nuevos en verde. 6 fallas preexistentes en `facturas.service.test.ts`/`entrega.service.test.ts` confirmadas como no relacionadas (reproducidas identicas en `git stash` contra `master` limpio, antes de cualquier cambio de esta iniciativa).
- **Validacion end-to-end real**: login real (`operador-bo004-local-...`) contra API dev + Postgres local; `POST /facturas` con `cliente.naturaleza=JURIDICA` y verificacion directa en `facturas_operativas.fiscal_request_snapshot` de la base real.
- **Validacion visual (Playwright)**: capturas de ambas pantallas (agenda de clientes y formulario de factura) mostrando el selector "Naturaleza" con sugerencia "Juridica" para RUC largo, y su ausencia para documento CI.
