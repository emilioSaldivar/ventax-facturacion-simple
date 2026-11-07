# TASKS Carga masiva de facturas por archivo v0.1

## Alineacion

- `docs/SPEC_CARGA_MASIVA_FACTURAS_v0.1.md`
- `docs/PLAN_CARGA_MASIVA_FACTURAS_v0.1.md`

## Estado

**Listo para implementar** (decision del usuario, 2026-11-07, D-8). Orden: fases A, B, C y D contra el mock, validadas en los grupos G1 y G2; luego la fase E contra el stack local de FE (G3). Ningun despliegue sin confirmacion directa del usuario. Nada se prueba en `segel-fs`.

## Matriz

| ID | Fase | Tarea | Hecho cuando | Validacion | Estado |
|---|---|---|---|---|---|
| CMF-001 | — | SPEC, PLAN y TASKS refinados sobre el contrato publicado por FE | Secciones del PLAN nombran archivos, rutas y comportamientos del codigo real | Revisado con el usuario | DONE (2026-11-07) |
| CMF-002 | A | Migracion `db/migrations/0037_carga_masiva.sql` (PLAN 3) | Aplica sobre una base nueva y sobre una copia con datos; una segunda corrida no reporta checksums cambiados; `numeracion_facturas` vale `SERVICIO` en todas las filas existentes | G1: `migrations.test.ts`; `npm run migrate` dos veces contra la base local | TODO |
| CMF-003 | A | Backoffice API: `numeracion_facturas` en `contextoUpdateSchema`, repositorio, tipo `Contexto` y `audit_events` `CONTEXTO_NUMERACION_FACTURAS_CAMBIADA` | `PATCH /backoffice/contextos/:id` cambia el valor y `GET` lo devuelve; un rol no interno recibe `403`; queda el evento con `anterior` y `nuevo` | G1: `backoffice.service.test.ts` ampliado | TODO |
| CMF-004 | A | Contexto operativo: `FiscalContext.numeracion_facturas` y `OperationalContextResponse.carga_masiva_habilitada`; `spec/openapi.yaml` | `GET /me/context` trae ambos; con la bandera apagada `carga_masiva_habilitada` es `false` | G1: `context.service.test.ts` ampliado | TODO |
| CMF-005 | A | `POST /facturas` responde `409 CONFLICT` con `details.reason = NUMERACION_DEL_CLIENTE` en contexto `CLIENTE` | No encola nada; `POST /facturas/preview` y nota de credito siguen funcionando | G1: `facturas.numeracion-cliente.test.ts` | TODO |
| CMF-006 | A | Backoffice web: selector de numeracion con aviso; web-operacion: "Nueva factura" y "convertir en factura" deshabilitados con explicacion en contexto `CLIENTE` | Visible y operable en el backoffice; en la app el boton queda deshabilitado con el texto "Este punto emite por carga masiva" | G2: Playwright, 1280 px y 390 px | TODO |
| CMF-007 | B | Variables `CARGA_*` en `env.ts` (PLAN 5.1) y `.env.example`; bandera `CARGA_MASIVA_ENABLED` | Con la bandera apagada, toda ruta `/cargas` responde `404 NOT_FOUND` | G1: `cargas.service.test.ts` | TODO |
| CMF-008 | B | Tipos `FeCarga*` y nueve metodos en `FiscalGateway`; `RealFiscalGateway` responde `NOT_IMPLEMENTED` | `npm run typecheck` sin errores; el servicio traduce `NOT_IMPLEMENTED` a `501` con `CARGA_MASIVA_NO_DISPONIBLE` | G1 | TODO |
| CMF-009 | B | `MockFiscalGateway`: maquina de estados del PLAN 5.4, con `cargas.mock-data.ts` | Cada fila de la tabla de marcadores y cada transicion de estado tiene una prueba; `409` de accion trae `details.estado` y `details.acciones` | G1: `cargas.mock.test.ts` | TODO |
| CMF-010 | B | Modulo `cargas`: rutas, servicio, repositorio y tipos (PLAN 5.2 y 5.3), montado en `app.ts` | Subida con `express.raw`, sha256 identico al archivo enviado, repetido local sin llamar a FE, `200` de FE reutiliza la fila, tope `413` con `tope_bytes`, `415`, cuerpo vacio `422`, `429` por subidas simultaneas con `Retry-After`, `409` sin clave de consumidor, `409 CONTEXTO_NO_LISTO`, `404` de FE como `409 CARGA_MASIVA_NO_HABILITADA_EN_FE`, errores de FE con su codigo y `details.fe_code`; `lotes` solo roles internos | G1: `cargas.service.test.ts` | TODO |
| CMF-011 | B | Aislamiento y auditoria | Carga de otro facturador o de otro perfil responde `404`, tambien por id; rol interno ve todas las del facturador; `audit_events` registra subida, confirmacion, cancelacion y reintento con `usuario_id` | G1: `cargas.service.test.ts` y `cargas.integration.test.ts` | TODO |
| CMF-012 | B | `spec/openapi.yaml`: tag `Cargas`, diez rutas, esquemas, campos nuevos de contexto y documentos (PLAN 5.5) | El frontend consume exactamente esos nombres; `details.reason` nuevos documentados | Revision cruzada con `carga-masiva.tsx` | TODO |
| CMF-013 | C | Worker `cargas-sync.worker.ts` y `upsertDesdeCarga` en `facturas.repository` (PLAN 6) | Crea documentos solo con `document_uuid` y estados que lo tienen; dos pasadas no duplican; `ANULADA` no se revierte; `EMITIDA` no vuelve a `PENDIENTE_SIFEN`; fallo de FE no cambia estados y guarda `sync_error`; `verificacion_next_at` nulo; no toca `facturador_clientes`, `cliente_identidades` ni `catalogo_items`; cursor en el `actualizado_en` mas nuevo; snapshot inverso con `calculateDocumentTotals`; frecuencias por estado; `sync_next_at` nulo al terminar | G1: `cargas-sync.worker.test.ts`; integracion del upsert y del `claim` con `skip locked` | TODO |
| CMF-014 | C | `GET /facturas`: filtro `carga_id` y `DocumentoResponse.carga` | Una factura de carga trae `carga.id` y `carga.numero_archivo`; las demas traen `null`; el filtro devuelve solo las de esa carga | G1: `facturas.routes.test.ts` ampliado | TODO |
| CMF-015 | D | `carga-masiva.tsx` con las cinco vistas, tercera pestana en `DocumentsView`, refresco cada 15 s, estilos (PLAN 7) | Todos los escenarios de G2 pasan en 1280 px y en 390 px sin desplazamiento horizontal | G2: `scripts/playwright-carga-masiva.cjs` | TODO |
| CMF-016 | D | Marca "Carga" y numero del archivo en Facturas, con enlace a la carga | La factura de carga abre su carga; KuDE, cancelacion y nota de credito disponibles | G2 | TODO |
| CMF-017 | D | `nginx.local.conf`: `client_max_body_size 25m` en `location /api/v1/` | Un CSV de 2 MB sube por el stack de `bash scripts/deploy.sh`; uno de 21 MB recibe `413` de la API, no del nginx | G2 | TODO |
| CMF-018 | E | `RealFiscalGateway`: nueve metodos contra `tecnica/openapi.yaml` de FE | Las diez rutas de FS responden contra el stack local `fe-cargas`; CA-14 verificado | G3 | TODO. Contrato publicado; el despliegue espera el tag de FE |
| CMF-019 | E | `cargar-facturador.py --carga-masiva [cuota]`; `worker-cargas` en `build-images.sh`, `deploy.sh` y `up.sh` de `scripts/segel-fs`, apagado | Sin la opcion, el consumidor no recibe `CARGA_MASIVA`; los scripts construyen y levantan `fe-segel-worker-cargas` con `CARGAS_ENABLED=false` | G3, en local | BLOCKED: espera el tag de FE y la respuesta sobre `EMISSION_RESUME_DRAFT_ENABLED` |
| CMF-020 | E | Prueba conjunta P-06 en local con FE | Carga finalizada y resultado visible en FS; memoria de la API con un archivo del tope y duracion de la sincronizacion con 5.000, registradas | G3 | BLOCKED: espera CMF-018 y el stack de FE disponible |
| CMF-021 | — | Cierre: repasar SPEC, PLAN, TASKS y `docs/BACKLOG.md` con lo descubierto | Documentos alineados con lo implementado; `AGENTS.md` sin cambios pendientes | — | TODO |

## Grupos de validacion

| Grupo | Cubre | Como |
|---|---|---|
| G1 | CMF-002 a CMF-005, CMF-007 a CMF-014 | `npm run test`, `npm run typecheck`, `npm run lint` en `apps/api`; `npm run build` del monorepo; integracion con `DATABASE_URL_TEST` sobre la base local |
| G2 | CMF-006, CMF-015 a CMF-017 | `bash scripts/deploy.sh` con `FE_GATEWAY_MODE=mock` y `CARGA_MASIVA_ENABLED=true`; `node scripts/playwright-carga-masiva.cjs` en 1280x800 y 390x844; fixtures en `apps/api/tests/fixtures/cargas/` |
| G3 | CMF-018 a CMF-020 | Stack de FS con `FE_GATEWAY_MODE=real` contra el stack `fe-cargas` local de FE; nunca `segel-fs` ni Hetzner |

## Pendientes fuera de la matriz

- Despliegue en `segel-fs`: solo con confirmacion directa del usuario, con `CARGA_MASIVA_ENABLED=false` hasta que FE publique el tag y se cierre G3.
- Medicion con el volumen del primer cliente real, antes de habilitarlo (D-6).
- Saldo por documento: registrado en `docs/BACKLOG.md` (D-4).
- Preguntas a FE: tag e imagenes con `/v1/cargas`; `EMISSION_RESUME_DRAFT_ENABLED=true` como requisito; columnas del CSV de resultado.

## Evidencia

### Prototipo retirado (2026-11-06)

La migracion `0037` y la forma de numerar por contexto en la API se escribieron en el commit `ef084f0` y se retiraron en `851627f`, porque el contrato de FE todavia cambiaba. Ese commit queda como referencia para CMF-002, CMF-003 y CMF-005.

Lo que se comprobo con el, y vale para cuando se retome:

- La migracion aplico de la 0001 a la 0037 sobre una base nueva y vacia, y una segunda corrida no dio error de checksum. Sin probar sobre una base con datos.
- Con numeracion del cliente, `POST /facturas` respondio `409 CONFLICT` con `details.reason = NUMERACION_DEL_CLIENTE` y no encolo nada. La API paso 482 pruebas.
- Los codigos de error de la API son una lista cerrada: el motivo va en `details`.
- El backoffice no tiene pruebas de repositorio contra una base: el `PATCH` de contextos y su auditoria se prueban en `backoffice.service.test.ts` con el repositorio simulado, y manualmente en G2.
