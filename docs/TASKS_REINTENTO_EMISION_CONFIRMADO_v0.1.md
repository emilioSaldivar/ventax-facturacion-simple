# TASKS Reintento De Emision Confirmado v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_REINTENTO_EMISION_CONFIRMADO_v0.1.md`
- `docs/PLAN_REINTENTO_EMISION_CONFIRMADO_v0.1.md`

## Estado General

- `SPEC`: DONE (2026-10-14)
- `PLAN`: DONE (2026-10-14)
- `TASKS`: REC-000 a REC-012 DONE. REC-013 con staging DONE y prod pendiente. REC-014 (cierre) PENDIENTE.

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
| --- | --- | --- | --- | --- |
| REC-000 | Operacion | Verificar en FE (staging y prod) que el consumidor de cada facturador activo con `fe_consumer_api_key` tiene el permiso `IDEMPOTENCY_RECONCILE` (SPEC, "Prerrequisito Operativo"). Si falta, pedirlo al administrador de FE | DONE (2026-10-14; llamada real verificada en staging el 2026-10-15) | Listado de facturadores y permiso confirmado por ambiente, registrado en Evidencia sin exponer claves. Una llamada real a `POST /v1/conciliacion/idempotency` desde el contenedor `api` responde 200 en staging |
| REC-001 | SDD | Crear cadena SPEC/PLAN/TASKS de esta iniciativa | DONE | Existen los tres documentos y se referencian entre si |
| REC-002 | Backend | `facturas.accion.ts`: `fiscal_status` opcional en `DeriveAccionInput`; nueva `puedeReintentarEmision()`; `REINTENTAR` en `acciones_sugeridas` solo para candidatos; texto de `buildEnProcesoDetalle` segun RN-08 (PLAN §1) | DONE (2026-10-15) | Tests unitarios: candidato y no candidato (con UUID, con CDC, sin `fiscal_status.code`, estado `EMITIDA`). `backoffice.repository.ts` sin cambios y compila |
| REC-003 | Backend | `facturas.types.ts` y `withAccion()`: campo `puede_reintentar_emision` en `DocumentoResponse` | DONE (2026-10-15) | `GET /facturas/:id` y el listado devuelven el campo. Typecheck limpio |
| REC-004 | Backend | `FacturaRepository.getFacturadorApiKey()` y `adoptarDocumentoFiscalExistente()` (PLAN §2.1 y §2.3) | DONE (2026-10-15) | Test de integracion con Postgres: adopcion deja el outbox `DONE`, `document_uuid`/`cdc`/`numero_fiscal` persistidos, `verificacion_next_at` en +5m, `audit_events` con `factura.retry_emission_adopted`. Segunda llamada devuelve `null` |
| REC-005 | Backend | `retryDocumentoEmission()` con confirmacion por idempotencia, ventanas de 7 dias y ramas `NOT_IMPACTED`/`IMPACTED`/`DUPLICATE_CONFLICT`/`INVALID_KEY`/error (PLAN §2.2) | DONE (2026-10-15) | Tests de servicio de PLAN §5 en verde. Error de gateway nunca invoca `retryPendingEmission` |
| REC-006 | Backend | Ruta `POST /facturas/:id/retry-emission`: gateway de consumidor para la idempotencia, gateway compartido para el refresh, `env.FE_API_ENV` | DONE (2026-10-15) | Test de ruta con fakes: 200 encolado, 200 adoptado, 409 y 503 con `code` y `message` esperados |
| REC-007 | Backend | Actualizar fakes de `FacturaRepository` en los tests existentes por los metodos nuevos | DONE (2026-10-15) | `npm run test`, `npm run typecheck` y `npm run lint` del workspace `api` sin regresiones respecto de la linea base (registrar la linea base antes de empezar) |
| REC-008 | Contrato | `spec/openapi.yaml`: `puede_reintentar_emision` en `DocumentoResponse`; descripcion, `200`, `409` y `503` de `retry-emission` (PLAN §3) | DONE (2026-10-15) | YAML valido y coherente con las respuestas de REC-006 |
| REC-009 | Frontend | `main.tsx`, banner de accion del detalle: "Reintentar emision" condicionado a `puede_reintentar_emision`; boton "Verificar estado fiscal" para `EMITIENDO`/`PENDIENTE_SIFEN` con identidad (PLAN §4) | DONE (2026-10-15) | Cubierto por REC-012 |
| REC-010 | Frontend | `main.tsx`, "Opciones avanzadas": "Volver a verificar" pasa a "Reintentar emision" y solo se renderiza si es candidato; "Verificar estado fiscal" se habilita con `document_uuid \|\| cdc` | DONE (2026-10-15) | Cubierto por REC-012 |
| REC-011 | Frontend | `main.tsx`, pantalla posterior a emitir: "Verificar estado fiscal" y "Reintentar emision" con las mismas reglas; mensajes de resultado del reintento (encolado o adoptado) | DONE (2026-10-15) | `npm run typecheck` y `npm run build` de `web-operacion` limpios. `grep` sin "Volver a verificar", "Reintentar validacion" ni `>Reintentar<` (CA-06) |
| REC-012 | QA visual | Playwright contra el stack de `bash scripts/deploy.sh` (FE mock), en mobile 390x844 y desktop 1280x800: (a) `PENDIENTE_SIFEN` con UUID muestra "Verificar estado fiscal" en el banner y no muestra "Reintentar emision"; al presionarlo, el estado se actualiza. (b) `ERROR_TEMPORAL` sin identidad con fallo registrado muestra "Reintentar emision"; al presionarlo queda `EMITIENDO` | DONE (2026-10-15) | Escenarios, viewports y resultado de Playwright registrados en Evidencia y en `docs/TASKS_IMPLEMENTACION_MVP_v0.1.md` |
| REC-013 | Deploy | Deploy a staging (`APP_ENV_FILE=.env.staging bash scripts/deploy.sh`) y smoke en un documento real `PENDIENTE_SIFEN`; luego prod con autorizacion explicita del usuario | PARTIAL (staging DONE 2026-10-15; prod pendiente de OK del usuario) | Healthcheck OK y escenario (a) de REC-012 reproducido en staging. Prod solo tras OK del usuario |
| REC-014 | Cierre | Repasar SPEC/PLAN/TASKS contra la implementacion real y registrar desvios | PENDIENTE | Documentos actualizados, sin desvios sin documentar |

## Orden De Ejecucion Y Agrupacion De Validaciones

1. REC-000 en paralelo con el desarrollo, pero **bloquea** REC-013.
2. Backend (REC-002 a REC-008) en un solo ciclo de `npm run test/typecheck/lint` del workspace `api`.
3. Frontend (REC-009 a REC-011) y luego una corrida unica de Playwright (REC-012) sobre los contenedores.
4. Deploy (REC-013) y cierre (REC-014).

## Evidencia

- 2026-10-14: diagnostico que origina la iniciativa (ver SPEC, "Hallazgo"). El operador confirmo que "Verificar estado fiscal" actualizo correctamente el documento `28751f7b-63dd-4f6d-a620-cc298f14990f`. La lectura directa de la DB de produccion no se realizo, por falta de autorizacion en la sesion.
- 2026-10-14: REC-000. Consultas de solo lectura en la VPS (`ssh hetzner`), sin extraer ni registrar claves:
  - `fe-test-postgres-1`: 17 consumidores. Los 16 activos tienen `IDEMPOTENCY_RECONCILE`. El unico sin ese permiso, `gae-comercial-ibanez-verif`, esta inactivo.
  - `fe-prod-postgres-1`: 8 consumidores, todos activos y todos con `IDEMPOTENCY_RECONCILE`.
  - SaaS staging y prod: los 6 facturadores de cada ambiente tienen `fe_consumer_api_key` propia. Por eso la rama "sin clave propia" de RN-09 no se usa hoy.
  - Que las claves son validas se infiere de emisiones recientes con outbox `DONE`, porque `/factura` usa la misma clave de consumidor. Prod: `4543629-0`, `5057016-1` y `80044279-2` el 2026-10-14, y `4732402-3` el 2026-10-12. Como en FE todo consumidor activo tiene el permiso, la consulta de idempotencia queda habilitada para ellos. No se cruzaron claves con consumidores de FE, porque eso exigiria materializar secretos.
  - Documento del caso en prod: `estado = EMITIDA` (ya corregido con "Verificar estado fiscal"), outbox `DONE` con 1 intento. Esto confirma que el 409 de "Volver a verificar" venia de reencolar un outbox ya `DONE`. El CDC cambio a `...17928512291` y el SaaS lo actualizo por RN-03 de la verificacion. La consulta por UUID funciono correctamente.
  - Observacion fuera de alcance: el documento queda con `fiscal_status_raw = QUEUED_BATCH` aunque esta `EMITIDA`, y con `verificacion_next_at` agendado. El worker lo retira de la agenda en su proxima corrida porque el estado es terminal. Se registra para revisar aparte, sin cambios en esta iniciativa.
- 2026-10-15: implementacion y validacion local, REC-002 a REC-012:
  - **Backend:** `puedeReintentarEmision()` y `REINTENTAR` condicionado en `facturas.accion.ts`. `puede_reintentar_emision` via `withAccion()`. `retryDocumentoEmission()` reescrito con `confirmarRecepcionFiscal()` y `ventanasIdempotencia()`. `getFacturadorApiKey()` y `adoptarDocumentoFiscalExistente()` en el repositorio. La ruta resuelve el gateway de consumidor (`resolveConsumerGateway`) y pasa el compartido para el refresh. Desvios de codigos de error y de `event_type` registrados en SPEC y PLAN.
  - **Tests:** `npm run typecheck` y `npm run lint` de `api` limpios. `npm run test`: **419 en verde**, contra 403 de la linea base (+16 nuevos). Siguen los mismos 6 fallos preexistentes (`entrega` x2, `facturas` x4), identicos a la linea base del 2026-10-15 tomada antes de empezar. Nuevos: 9 casos de servicio en `facturas.service.test.ts` (NOT_IMPACTED, IMPACTED, refresh fallido tras adoptar, DUPLICATE_CONFLICT, INVALID_KEY, error de gateway sin reencolar, documento ya recibido, estado final, carrera, ventanas de 7 dias) y 9 en `facturas.accion.test.ts`. Integracion con Postgres en `tests/facturas.reintento.integration.test.ts`: 3/3 (adopcion completa con outbox `DONE`, agenda a +5m y audit `FACTURA_EMISION_ADOPTADA`; segunda adopcion `null` sin pisar identidad; `getFacturadorApiKey`).
  - **Contrato:** `spec/openapi.yaml` con `puede_reintentar_emision` y `retry-emission` reescrito (200, 409, 503). YAML valido. Faltante preexistente: `accion` y `accion_detalle` tampoco estan documentados en `DocumentoResponse`; queda fuera de alcance.
  - **Frontend:** `npm run typecheck` y `npm run build` de `web-operacion` limpios. Sin "Volver a verificar", "Reintentar validacion", "Consultar estado fiscal" ni "Reintentar" suelto en `main.tsx`.
  - **Contenedores (desvio de entorno):** `bash scripts/deploy.sh` fallo dos veces en `apk add chromium` porque en esta maquina el DNS de la red bridge de Docker no resuelve (`nslookup` da timeout; con `--network host` funciona). Corregirlo implica cambiar la configuracion del daemon, fuera del repositorio (`AGENTS.md`). Se construyeron las mismas imagenes de compose (`nuevo_repo-api`, `-migrate`, `-frontend`) con `docker build --network host` y los mismos Dockerfiles y `BUILD_COMMIT_SHA`, y se levantaron con `docker compose up -d --no-build` mas un override que fija `FE_GATEWAY_MODE=mock`, `FE_VERIFY_WORKER_ENABLED=false` y el worker de outbox cada 5s. API y frontend healthy.
  - **REC-006 por HTTP:** el listado devuelve `puede_reintentar_emision = true` y `acciones_sugeridas = [REINTENTAR]` para el documento no recibido, y `false` con `[]` para el que tiene UUID. `POST retry-emission` sobre el que tiene UUID devuelve `409` "Este documento ya fue recibido por facturacion electronica. Usa 'Verificar estado fiscal'."
  - **REC-012 Playwright** (`scripts/playwright-reintento-emision.cjs`, UI + API + Postgres reales y FE mock, re-siembra por viewport): **20/20 verificaciones, 0 fallos**, en mobile 390x844 y desktop 1280x800.
    - (a) `PENDIENTE_SIFEN` con UUID: el aviso muestra "Verificar estado fiscal" y el texto "podes verificar ahora"; no aparece "Reintentar emision" ni las etiquetas viejas; al verificar, pasa a "Factura emitida".
    - (b) `ERROR_TEMPORAL` sin identidad: "Reintentar emision" aparece en el aviso y en opciones avanzadas, y no aparece "Verificar estado fiscal" en el aviso; al reintentar, se muestra "Reintento de emision enviado." y el boton desaparece.
    - En base: el documento (b) quedo `EMITIDA` con outbox `DONE` y audit `FACTURA_EMISION_REINTENTO`, emitido por el worker contra el mock.
    - Capturas en `test-results/reintento-*.png`.
  - **Datos de prueba locales:** usuario `e2e-reintento` (operador de 80136968-1, aceptacion de T&C con `otp_email_destino = admin-bypass:e2e-reintento`) y facturas `E2E REC *`. Solo en la base local, no en la VPS.
  - **Hallazgo UX (fuera de alcance):** el mensaje de resultado de las acciones del detalle aparece al pie del documento, lejos del boton del aviso. Es el patron existente de todas las acciones de esa pantalla.
- 2026-10-15: REC-013, staging.
  - Commit `9d4977f` llevado a la VPS por `hetzner-jump` con `git bundle` y `git pull --ff-only`, porque GitHub no era alcanzable desde la red local.
  - Backup previo `facturacion_simple-20261015-204517-pre-reintento.dump` (62 MB).
  - `APP_ENV_FILE=.env.staging bash scripts/deploy.sh`: api healthy con `APP_VERSION=9d4977f` y 0 errores en el log. No hay migraciones.
  - **Llamada real** a `POST /v1/conciliacion/idempotency` desde el contenedor `api`, con el gateway desplegado y la clave de consumidor del facturador (sin imprimirla): la ultima factura de staging con UUID da `IMPACTED` con el mismo `document_uuid` que guarda el SaaS, y una clave inexistente (`fac_000...`) da `NOT_IMPACTED`. Esto confirma el permiso `IDEMPOTENCY_RECONCILE` y el contrato contra el FE real (cierra la parte pendiente de REC-000).
  - **Produccion:** corre `87579b6`. Entre esa version y `9d4977f` estan tambien la segmentacion F0-F3 y las migraciones `0033`/`0034` (backfill), que corresponden a SEG-037 y su runbook. El deploy a prod queda pendiente de decision del usuario.
