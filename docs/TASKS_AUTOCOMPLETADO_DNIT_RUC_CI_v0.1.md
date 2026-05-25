# TASKS Autocompletado DNIT RUC CI v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_AUTOCOMPLETADO_DNIT_RUC_CI_v0.1.md`
- `docs/PLAN_AUTOCOMPLETADO_DNIT_RUC_CI_v0.1.md`
- `docs/SPEC_AGENDAS_CLIENTES_CATALOGO_v0.1.md`
- `docs/SPEC_REFINAMIENTO_USABILIDAD_EMISION_v0.1.md`
- `docs/TASKS_IMPLEMENTACION_MVP_v0.1.md`
- `spec/openapi.yaml`

## Matriz

| ID | Area | Tarea | Estado | Criterio de cierre |
|---|---|---|---|---|
| ADR-001 | SDD | Crear cadena SPEC/PLAN/TASKS de autocompletado DNIT | DONE | Existen `SPEC_AUTOCOMPLETADO_DNIT_RUC_CI_v0.1.md`, `PLAN_AUTOCOMPLETADO_DNIT_RUC_CI_v0.1.md` y este TASKS versionados |
| ADR-002 | Loader estructura | Crear proyecto `dnit-ruc-loader` (Node 20) con estructura base (`src`, `sql`, `scripts`, `data`, `README`, `.env.example`) | DONE | Estructura creada y ejecutable via `node src/main.js` y `scripts/run.sh` |
| ADR-003 | Loader descarga | Implementar descarga de HTML DNIT y deteccion dinamica de `ruc*.zip` | DONE | Se listan URLs detectadas y se descargan ZIP en `data/downloads/YYYY-MM/` |
| ADR-004 | Loader extraccion | Implementar descompresion ZIP y deteccion de `.txt` internos | DONE | ZIP extraidos en `data/extracted/YYYY-MM/` y TXT listados para procesamiento |
| ADR-005 | Loader parseo | Implementar lector por stream linea a linea con parseo robusto de formato DNIT | DONE | Se ignoran lineas invalidas sin cortar corrida y se contabilizan errores |
| ADR-006 | SQL modelo | Crear `sql/001_init.sql` con tabla final `dnit_ruc_contribuyentes`, staging e indices | DONE | Script crea tabla final + staging + indices requeridos sin errores |
| ADR-007 | Import snapshot | Implementar carga por batch en staging y refresh final tipo snapshot (`TRUNCATE + INSERT`) | DONE | Tabla final queda sincronizada al ultimo corte DNIT sin duplicados |
| ADR-008 | Normalizacion identidad | Implementar reglas `RUC/CI` para `nombre`, `apellido`, `razon_social` (fisica/juridica) | DONE | Casos `APELLIDO, NOMBRE` y juridicas extensas quedan normalizados segun SPEC |
| ADR-009 | Limpieza artefactos | Implementar limpieza de ZIP/TXT post-exito y remanentes pre-corrida | DONE | No quedan ZIP/TXT historicos luego de corrida exitosa; solo logs |
| ADR-010 | Aislamiento operativo | Asegurar no interferencia con app principal (timeouts, transacciones cortas, rollback) | DONE | Falla del loader no rompe endpoints transaccionales de emision |
| ADR-011 | Scripts operativos | Implementar `scripts/run.sh` y `scripts/install-cron.sh` (dia 2, 03:00) | DONE | Corrida manual y cron configurado producen ejecucion mensual automatizable |
| ADR-012 | API lookup DNIT | Implementar endpoint/servicio lookup por documento para fallback `RUC/CI` | DONE | Busca por `(ruc_sin_dv,dv)` o `ruc_sin_dv` y responde identidad normalizada |
| ADR-013 | UI emision fallback | Integrar fallback DNIT silencioso en `Nueva factura` solo para `RUC/CI` | DONE | Mantiene prioridad agenda->global y autocompleta al `Enter/blur/avance` sin dropdown DNIT |
| ADR-014 | UI tipos no RUC/CI | Preservar carga manual alfanumerica para `pasaporte/otros` sin limpieza automatica | DONE | Para tipos no `RUC/CI` no corre normalizacion DNIT ni autocompletado |
| ADR-015 | Contrato HTTP | Actualizar `spec/openapi.yaml` si cambia contrato de lookup/autocompletado | DONE | Contrato documentado y consumido por frontend sin desalineacion |
| ADR-016 | QA backend | Ejecutar pruebas backend del modulo afectado | DONE | `npm run test`, `npm run typecheck`, `npm run lint` en workspaces tocados en verde |
| ADR-017 | QA frontend | Ejecutar pruebas frontend del flujo de emision | DONE | `npm run typecheck`, `npm run build` web-operacion en verde |
| ADR-018 | QA desplegado | Validar flujo en contenedores desplegados + Playwright mobile-first | PENDING | `bash scripts/deploy.sh` + smoke UI de agenda/global/DNIT/otros documentos exitoso |
| ADR-019 | Documentacion cierre | Registrar evidencia final en task matrix y TASKS implementacion MVP | DONE | Evidencia fechada, comandos y resultados asentados en docs de cierre |

## Orden de ejecucion recomendado

1. `ADR-002` a `ADR-011` (loader mensual completo y seguro).
2. `ADR-012` a `ADR-015` (integracion app principal API/UI/contrato).
3. `ADR-016` a `ADR-019` (validacion y cierre documental).

## Dependencias y puertas de avance

- No iniciar integracion API/UI (`ADR-012+`) sin tabla DNIT estable (`ADR-006..ADR-010`).
- No cerrar QA (`ADR-016+`) sin cron/scripts y limpieza de artefactos operando (`ADR-009..ADR-011`).
- No cerrar iniciativa sin evidencia en `docs/TASKS_IMPLEMENTACION_MVP_v0.1.md`.

## Evidencia

- 2026-05-25: creada cadena SDD `AUTOCOMPLETADO_DNIT_RUC_CI` con decision de arquitectura `Node` como motor principal y `Bash` como wrapper operativo (run/cron/logs).
- 2026-05-25: se define estrategia de recarga mensual tipo snapshot con staging y limpieza de ZIP/TXT para optimizacion de almacenamiento.
- 2026-05-25: se define regla de no interferencia transaccional con app principal (aislamiento de proceso, transacciones cortas, rollback ante error, timeouts de sesion).
- 2026-05-25: implementado backend y frontend de fallback DNIT. API agrega `GET /clientes/dnit/autocomplete` (solo `RUC/CI`) y lookup por `(ruc_sin_dv,dv)` o `ruc_sin_dv` con respuesta `FOUND/NOT_FOUND/AMBIGUOUS`. UI `Nueva factura` dispara autocompletado silencioso al `Enter`/`blur` solo en `RUC/CI`; para `PASAPORTE`, `CEDULA_EXTRANJERA` y `NO_ESPECIFICADO` conserva entrada manual alfanumerica sin limpieza forzada.
- 2026-05-25: implementado `dnit-ruc-loader/` standalone con descarga dinamica de ZIP DNIT, extraccion TXT, parseo por streams, staging por batch y refresh snapshot (`TRUNCATE + INSERT`) en `dnit_ruc_contribuyentes`, con limpieza de artefactos (ZIP/TXT) post-exito y logs mensuales.
- 2026-05-25: validaciones ejecutadas en verde: `npm run test --workspace @facturacion-simple/api -- clientes.service`, `npm run typecheck --workspace @facturacion-simple/api`, `npm run lint --workspace @facturacion-simple/api`, `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion`.
- 2026-05-25: `bash scripts/deploy.sh` no cerrada por error Docker de red (`invalid config for network bridge: network-scoped aliases are only supported for user-defined networks`). Queda pendiente `ADR-018` (deploy + Playwright en contenedores).
