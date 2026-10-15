# TASKS Import de Configuración de Facturador v0.3

## Alineación

- `docs/SPEC_IMPORT_CONFIG_FACTURADOR_v0.3.md` (RN-28 a RN-36, CA-1 a CA-15)
- `docs/PLAN_IMPORT_CONFIG_FACTURADOR_v0.3.md` (F0 a F10)
- `docs/TASKS_IMPORT_CONFIG_FACTURADOR_v0.2.md` (22/22 DONE)
- `spec/openapi.yaml`

## Estados

`PENDING` · `PARTIAL` · `DONE` · `BLOCKED`

## Reglas de cierre

- Retrocompatibilidad: los tests del import existentes pasan sin modificarse, salvo los dos de
  `fe-config-sin-perfiles.json` que RN-28 cambia a propósito (PLAN §1.9).
- La API key nunca se escribe en un archivo del repositorio, fixture, test ni log. Los tests usan
  valores sintéticos obviamente falsos.
- Validación visual con Playwright en mobile y desktop.
- Verificación sobre contenedores con `bash scripts/deploy.sh`.

---

## Matriz

| ID | Fase | Tarea | Traza | Estado | Criterio de aceptación | Evidencia |
|---|---|---|---|---|---|---|
| IV3-001 | F0 | PATCH parcial en los seis updates del service | PLAN §1.7 · RN-36 · CA-10 | DONE | Un PATCH sin el campo de texto llega al repositorio sin la clave; con `null` explícito, la clave llega en `null` | 6 reemplazos en `backoffice.service.ts` (`...("campo" in input ? {…} : {})`). Repositorio sin cambios. |
| IV3-002 | F0 | Tests del PATCH parcial | CA-10 | DONE | Un test por entidad (facturador, establecimiento, punto, actividad, perfil, usuario) | `tests/backoffice.patch-parcial.test.ts`: 12 tests en verde. **Sin la corrección fallan los 6 de "campo ausente"** (verificado con `git stash`), es decir, reproducen el bug. |
| IV3-003 | F1 | Readiness cuenta solo usuarios con contexto activo | PLAN §1.8 · RN-35 · CA-11 | DONE | Verificado en base: usuario sobre contexto inactivo → `usuarios_operativos: 0` | CTE `usr` con `join actividad_punto_perfiles … activo`. Integración: con el usuario sobre el centinela → 1; al desactivar el contexto → 0. |
| IV3-004 | F2 | Asignación de usuario rechaza facturador sin API key | PLAN §1.6 · RN-33 · CA-9 | DONE | `createUser` con `operation_config` y `PUT operation-config` → 422 `FACTURADOR_SIN_API_KEY`; el usuario no queda creado | `resolveOperationConfigTarget` lanza 422 `FACTURADOR_SIN_API_KEY`. Integración (`assignOperationConfig`) y HTTP sobre contenedor (`POST /backoffice/users` con `operation_config` → 422, el usuario no quedó creado). |
| IV3-005 | F3 | `ref` y `PERFIL_CENTINELA` en tipos y mapper | PLAN §1.1 | DONE | Contextos de FE con `ref = perfil_codigo`; `typecheck` en verde | `ref` en `PlanContexto`/`ContextoDiff`; `PERFIL_CENTINELA` y `refCentinela` en `import.types.ts`. `typecheck` exit 0. |
| IV3-006 | F3 | Contextos centinela para emisor sin perfiles | RN-28, RN-29, RN-30 · CA-1, CA-3 | DONE | `items:[]` + `requerido:false` → perfil `NO_REQUERIDO`, un contexto por punto, actividad principal, `PERFIL_NO_REQUERIDO`; con `requerido` ausente o `true` → `SIN_CONTEXTOS` como en v0.2; sin actividades → `SIN_CONTEXTOS` | `derivarContextosCentinela` en el mapper. Tests: export real 13:26 → `NO_REQUERIDO@001-001`, actividad 96099, alias `PRESTACION DE SERVICIOS`; 2 puntos × 2 actividades → 2 contextos con actividad editable; sin actividades → `SIN_CONTEXTOS`; `requerido` ausente → `SIN_CONTEXTOS`. |
| IV3-007 | F3 | `requerido` reportado | RN-31 · CA-12 | DONE | En `ignorados` si no se aplicó RN-28 | Ignorado `$.perfiles_emision.requerido` salvo bajo RN-28. Test y HTTP sobre contenedor. |
| IV3-008 | F4 | Diff por `ref`, `texto` y `has_api_key` | PLAN §1.3 · §6.1 del SPEC | DONE | Overrides por `ref`; `texto.editable` solo al crear; `has_api_key` correcto | Overrides por `ref`; `texto` en facturador, establecimientos, puntos y contextos; `has_api_key` en `FacturadorDiff`. Tests de diff en `backoffice.import.v03.test.ts`. |
| IV3-009 | F4 | D-4 en el diff | RN-34 · CA-6 | DONE | Texto existente distinto sin adopción → sin campo, `TEXTO_VISIBLE_DIFIERE`; con adopción → `ACTUALIZAR`; texto existente vacío → se completa | `textoExistente()` en el diff. Re-export de 13:47 sobre el estado de staging → facturador y punto SIN_CAMBIOS + `TEXTO_VISIBLE_DIFIERE` con 2 entradas; con adopción → ACTUALIZAR; texto vacío → se completa sin aviso; `razon_social` sigue actualizándose. |
| IV3-010 | F5 | `textos_overrides` en el service | RN-32 · CA-5 | DONE | Se aplican a entidades nuevas; sobre existentes o inexistentes en el plan → `OVERRIDE_IGNORADO` | `validarTextosOverrides` + `planEfectivo`. Tests: se aplican al crear; sobre existentes o códigos inexistentes → 3 `OVERRIDE_IGNORADO`. |
| IV3-011 | F5 | API key obligatoria en el apply | RN-33 · CA-7 | DONE | Sin clave sobre facturador nuevo o sin clave → 422 `API_KEY_REQUERIDA` sin escribir; existente con clave → opcional | 422 `API_KEY_REQUERIDA` antes de la transacción. Test: `applyImport` no se llama. Integración: 0 facturadores tras el rechazo. HTTP sobre contenedor: 422 y tenant sin facturadores. |
| IV3-012 | F5 | zod de `api_key`, `textos_overrides` y `adoptar_textos_archivo` | §6.2 del SPEC | DONE | Límites de longitud del PLAN §1.3; el preview no recibe la clave | `importApplySchema` con `api_key` (10-200), `textos_overrides` (300/200/200/100) y `adoptar_textos_archivo`. El preview no los recibe. |
| IV3-013 | F6 | Repository del import: `ref`, D-4 y API key | PLAN §1.4, §1.5 | DONE | SQL con el flag como parámetro; clave guardada en la transacción; nunca en la auditoría | SQL con `case when $6::boolean` para los tres textos y `update … fe_consumer_api_key` en la transacción. Integración: clave persistida, ausente de `facturador_import_eventos` (payload + resumen). |
| IV3-014 | F6 | `redact` de `api_key` en el logger | PLAN §1.5 | DONE | `*.api_key` y `*.fe_consumer_api_key` en `redact.paths` | `*.api_key` y `*.fe_consumer_api_key` en `redact.paths`. Logs del contenedor tras 3 apply: 0 apariciones de la clave sintética. |
| IV3-015 | F7 | `spec/openapi.yaml` | CA-13 | DONE | Campos y respuestas nuevas documentados; YAML válido | `ImportTextoVisible`, `ImportFacturadorDiff`, `ref`, campos nuevos del apply, 422 en apply, alta y asignación de usuarios. YAML válido (`yaml.parse`). |
| IV3-016 | F8 | Frontend: `ref`, textos editables, API key, adopción | PLAN F8 · CA-14 | DONE | `typecheck` y `build` del backoffice en verde | `FacturadorImportView`: keys por `ref`, inputs de texto, API key `type=password` obligatoria, casilla de adopción. `typecheck` y `build` del backoffice en verde. |
| IV3-017 | F9 | Fixtures de `4543629-0` y de RN-08 | PLAN F9 | DONE | Derivados de los exports reales, documentados en `fixtures/README.md`, sin secretos | `fe-config-4543629-sin-perfiles.json`, `fe-config-4543629-con-perfil.json` y `fe-config-sin-perfiles-requerido-ausente.json`, documentados en `fixtures/README.md`. Sin claves (verificado con grep). |
| IV3-018 | F9 | Tests unitarios de mapper, diff y service | CA-1 a CA-7, CA-12 | DONE | En verde; solo cambian los dos tests de PLAN §1.9 | `backoffice.import.v03.test.ts`: 25 tests en verde. Cambios en tests existentes: ver desvío D-1. |
| IV3-019 | F9 | Tests de integración con Postgres | CA-1, CA-2, CA-6, CA-8 | DONE | Centinela resoluble, idempotencia, D-4 y API key fuera de la auditoría | `backoffice.import.v03.integration.test.ts`: 8/8 contra Postgres del contenedor (5433), junto con los 9 de v0.1/v0.2 (17/17). |
| IV3-020 | F10 | Suite completa | AGENTS.md | DONE | `typecheck`, `lint`, `test`, `build`, `qa:no-secrets` | `typecheck`, `lint` y `build` exit 0; `qa:no-secrets` OK. `vitest`: 403 pasan, 17 omitidos (integración sin DB), **6 fallos preexistentes** en `entrega.service.test.ts` (2) y `facturas.service.test.ts` (4), idénticos a la línea base previa al cambio. |
| IV3-021 | F10 | Verificación sobre contenedores | CA-8, CA-15 | DONE | `bash scripts/deploy.sh`; circuito HTTP con los dos fixtures; API key ausente de los logs | `bash scripts/deploy.sh` local (api, frontend y postgres en healthy). Circuito HTTP real sobre `127.0.0.1:8091` con los dos exports de `4543629-0`: **20/20** (preview centinela, 422 sin clave, apply con clave y nombre visible, D-4, PATCH parcial, alta de usuario sin clave → 422). Clave ausente de respuestas y de logs. |
| IV3-022 | F10 | Playwright mobile + desktop | CA-14 | DONE | Textos editables, API key obligatoria y `TEXTO_VISIBLE_DIFIERE` | `scripts/playwright-backoffice-import.cjs` contra el frontend del contenedor (`:8096`): **46 verificaciones, 0 fallos**, viewports mobile 390×844 y desktop 1440×900. Escenarios nuevos `h-sin-perfiles` (4 inputs de texto) y `g-textos-difieren` (casilla, API key opcional); en todos, "Aplicar" deshabilitado sin clave y campo `password`; el apply envía el nombre editado y la clave. Capturas en `test-results/import-v03/`. |
| IV3-023 | Cierre | Repaso de SPEC/PLAN/TASKS y runbook | AGENTS.md | DONE | El runbook pasa a describir el camino automático | SPEC, PLAN y runbook repasados (ver desvíos y hallazgos abajo). |

---

## Dependencias

```
IV3-005 ──▶ IV3-006, IV3-007 ──▶ IV3-008 ──▶ IV3-009 ──▶ IV3-010, IV3-011 ──▶ IV3-013
IV3-012 ──▶ IV3-016
IV3-001, IV3-003, IV3-004, IV3-014 son independientes
todo ──▶ IV3-020 ──▶ IV3-021 ──▶ IV3-022 ──▶ IV3-023
```

## Bloqueos y desvíos

| Fecha | ID | Bloqueo | Impacto | Decisión |
|---|---|---|---|---|
| 2026-10-14 | D-1 (IV3-018) | RN-33 vuelve obligatoria la API key al crear un facturador. 10 tests existentes del import aplicaban sin clave y pasaron a fallar con 422 | Desvío de la regla "solo cambian 2 tests" (PLAN §1.9). El cambio de comportamiento es el que pide el SPEC | Se agregó `api_key` sintética a la entrada del apply en `backoffice.import.service.test.ts`, `backoffice.import.grupo-actividades.test.ts` y `backoffice.import.integration.test.ts`, sin tocar ninguna aserción. Una única aserción cambió a propósito: `proximos_pasos` ya no menciona la API key (PLAN §1.5) |
| 2026-10-14 | D-2 (IV3-022) | Los mocks de `playwright-backoffice-import.cjs` reflejaban el contrato v0.2 (sin `ref`, `texto`, `has_api_key`) | Sin actualizar, la vista v0.3 no renderiza con esos mocks | Mocks llevados al contrato v0.3; las verificaciones de v0.1/v0.2 siguen y pasan |

## Hallazgos fuera de alcance

| ID | Hallazgo | Evidencia | Propuesta |
|---|---|---|---|
| H-1 | En mobile (390 px) el backoffice muestra el contenido en una columna angosta y la barra lateral ocupa la mitad izquierda | Igual en la captura de v0.2 del 2026-09-24 (`test-results/import-d-actividad-seleccionable-mobile.png`): preexistente, no lo introduce v0.3 | Iniciativa propia de layout del backoffice |
| H-2 | El `.env` local apunta a `https://fe-api.ventax.app/fcws`: readiness local da `fiscal_backend_available: false` | Circuito HTTP local | Sin impacto en esta iniciativa; actualizar el `.env` local cuando se necesite emitir en local |

## Despliegue

| Fecha | Ambiente | Detalle | Estado |
|---|---|---|---|
| 2026-10-15 | Staging (`ventax-facturacion-simple`) | Commit `a639d07`. Backup previo `facturacion_simple-20261015-202530-pre-import-v03.dump` (62 MB, 36 tablas con datos segun `pg_restore --list`). `APP_ENV_FILE=.env.staging bash scripts/deploy.sh`: api y frontend healthy, migrate sin cambios (v0.3 no trae migraciones), 0 errores en el log de la API. Smoke HTTP sobre `127.0.0.1:8091`: preview sin auth da `401`; con usuario de backoffice, el preview del fixture `fe-config-4543629-sin-perfiles.json` da `200`, genera el centinela `NO_REQUERIDO` y ya no emite `SIN_CONTEXTOS`. El unico bloqueante, `FACTURADOR_EN_OTRO_TENANT`, es correcto porque METAMORFOSIS ya existe en staging. El preview no escribe en la base. | DONE |
| 2026-10-15 | Produccion (`ventax-facturacion-simple-prod`) | Desplegado con autorizacion del usuario, junto con SEG-037 y el reintento confirmado, version `dc97ae4`. Sin migraciones propias. Backup, controles y readiness en `TASKS_SEGMENTACION_PERFIL_EMISION_v0.1.md` (SEG-037). | DONE |

Nota operativa: el 2026-10-15 la red local no llegaba a GitHub ni al puerto SSH de Hetzner. El commit se llevo a la VPS por `hetzner-jump` con un `git bundle` y se aplico como fast-forward (`git pull --ff-only`). Falta `git push` a `origin` desde local cuando vuelva la conectividad. Son los mismos commits, sin divergencia.
