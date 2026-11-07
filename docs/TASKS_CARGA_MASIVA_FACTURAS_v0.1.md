# TASKS Carga masiva de facturas por archivo v0.1

## Alineacion

- `docs/SPEC_CARGA_MASIVA_FACTURAS_v0.1.md`
- `docs/PLAN_CARGA_MASIVA_FACTURAS_v0.1.md`

## Estado

**Fases A a D implementadas y validadas contra el mock** (2026-11-07; decision del usuario, D-8; D-9 a D-13 aprobadas y D-14 decidida el mismo dia). Pendiente: la fase E contra FE real (G3). Evidencia E-1 a E-3. Ningun despliegue sin confirmacion directa del usuario. Nada se prueba en `segel-fs`.

## Matriz

| ID | Fase | Tarea | Hecho cuando | Validacion | Estado |
|---|---|---|---|---|---|
| CMF-001 | — | SPEC, PLAN y TASKS refinados sobre el contrato publicado por FE | Secciones del PLAN nombran archivos, rutas y comportamientos del codigo real | Revisado con el usuario | DONE (2026-11-07) |
| CMF-002 | A | Migracion `db/migrations/0037_carga_masiva.sql` (PLAN 3) | Aplica sobre una base nueva y sobre una copia con datos; una segunda corrida no reporta checksums cambiados; `numeracion_facturas` vale `SERVICIO` en todas las filas existentes | G1: `migrations.test.ts`; `npm run migrate` dos veces contra la base local | DONE (2026-11-07), E-3 |
| CMF-003 | A | Backoffice API: `numeracion_facturas` en `contextoUpdateSchema`, repositorio, tipo `Contexto` y `audit_events` `CONTEXTO_NUMERACION_FACTURAS_CAMBIADA` | `PATCH /backoffice/contextos/:id` cambia el valor y `GET` lo devuelve; queda el evento con `anterior` y `nuevo` | G2: `playwright-carga-masiva-config.cjs` | DONE (2026-11-07), E-2. Auditoria probada por Playwright, sin prueba unitaria |
| CMF-004 | A | Contexto operativo: `FiscalContext.numeracion_facturas` y `OperationalContextResponse.carga_masiva_habilitada`; `spec/openapi.yaml` | `GET /me/context` trae ambos; con la bandera apagada `carga_masiva_habilitada` es `false` | G2: bandera encendida y apagada | DONE (2026-11-07), E-1, E-2 |
| CMF-005 | A | `POST /facturas` responde `409 CONFLICT` con `details.reason = NUMERACION_DEL_CLIENTE` en contexto `CLIENTE` | No encola nada; `POST /facturas/preview` y nota de credito siguen funcionando | G1: `facturas.service.test.ts`; G2 | DONE (2026-11-07), E-1, E-2 |
| CMF-006 | A | Backoffice web: selector de numeracion con aviso; web-operacion: "Nueva factura" y "convertir en factura" deshabilitados con explicacion en contexto `CLIENTE` | Visible y operable en el backoffice; en la app el boton queda deshabilitado con el texto "Este punto emite por carga masiva" | G2: Playwright, 1280 px y 390 px | DONE (2026-11-07), E-2 |
| CMF-007 | B | Variables `CARGA_*` en `env.ts` (PLAN 5.1) y `.env.example`; bandera `CARGA_MASIVA_ENABLED` | Con la bandera apagada, toda ruta `/cargas` responde `404 NOT_FOUND` | G1: `cargas.service.test.ts` | DONE (2026-11-07), E-1, E-2 |
| CMF-008 | B | Tipos `FeCarga*` y nueve metodos en `FiscalGateway`; `RealFiscalGateway` responde `NOT_IMPLEMENTED` | `npm run typecheck` sin errores; el servicio traduce `NOT_IMPLEMENTED` a `501` con `CARGA_MASIVA_NO_DISPONIBLE` | G1 | DONE (2026-11-07), E-1. Los metodos reales quedaron implementados: ver CMF-018 |
| CMF-009 | B | `MockFiscalGateway`: maquina de estados del PLAN 5.4, con `cargas.mock-data.ts` | Cada fila de la tabla de marcadores y cada transicion de estado tiene una prueba; `409` de accion trae `details.estado` y `details.acciones`; mas de 20 MB responde `413` con `tope_bytes = 20971520` sin crear carga | G1: `cargas.mock.test.ts` | DONE (2026-11-07), E-1 |
| CMF-010 | B | Modulo `cargas`: rutas, servicio, repositorio y tipos (PLAN 5.2 y 5.3), montado en `app.ts` | Subida con `express.raw`, sha256 identico al archivo enviado, repetido local visible sin llamar a FE y repetido de otro contexto con `409 ARCHIVO_YA_SUBIDO_EN_OTRO_CONTEXTO` (D-13), `200` de FE reutiliza la fila, `CARGA_MAX_BYTES` por defecto 24 MB con `413` y `tope_bytes` solo por encima, el `413` de FE llega con su `tope_bytes` (RN-01b), `415`, cuerpo vacio `422`, `429` por subidas simultaneas con `Retry-After`, `409` sin clave de consumidor, `409 CONTEXTO_NO_LISTO`, `404` de FE como `409 CARGA_MASIVA_NO_HABILITADA_EN_FE`, errores de FE con su codigo y `details.fe_code`; `lotes` solo roles internos | G1: `cargas.service.test.ts` | DONE (2026-11-07), E-1, E-2 |
| CMF-011 | B | Aislamiento y auditoria | Carga de otro facturador o de otro perfil responde `404`, tambien por id; rol interno ve todas las del facturador; `audit_events` registra subida, confirmacion, cancelacion y reintento con `usuario_id` | G1: `cargas.service.test.ts` y `cargas.integration.test.ts` | DONE (2026-11-07), E-1, E-2 |
| CMF-012 | B | `spec/openapi.yaml`: tag `Cargas`, diez rutas, esquemas, campos nuevos de contexto y documentos (PLAN 5.5) | El frontend consume exactamente esos nombres; `details.reason` nuevos documentados | Revision cruzada con `carga-masiva.tsx` | DONE (2026-11-07). Rutas validadas por lectura, sin validador automatico de contrato |
| CMF-013 | C | Worker `cargas-sync.worker.ts` y `upsertDesdeCarga` en `facturas.repository` (PLAN 6) | Crea documentos solo con `document_uuid` y estados que lo tienen; dos pasadas no duplican; `ANULADA` no se revierte; `EMITIDA` no vuelve a `PENDIENTE_SIFEN`; fallo de FE no cambia estados y guarda `sync_error`; `verificacion_next_at` nulo; no toca `facturador_clientes`, `cliente_identidades` ni `catalogo_items`; cursor en el `actualizado_en` mas nuevo; comprobantes consultados en todo ciclo de `EN_PREPARACION` a `CANCELADA` aunque los totales no cambien (un `correo` que pasa a `SENT` llega a `email_estado`); snapshot inverso con `calculateDocumentTotals`; frecuencias por estado; `sync_next_at` nulo al terminar | G1: `cargas-sync.worker.test.ts`; integracion del upsert y del `claim` con `skip locked` | DONE (2026-11-07), E-1, E-2 |
| CMF-014 | C | `GET /facturas`: filtro `carga_id` y `DocumentoResponse.carga` | Una factura de carga trae `carga.id` y `carga.numero_archivo`; las demas traen `null`; el filtro devuelve solo las de esa carga | G1: `cargas.integration.test.ts`; G2 | DONE (2026-11-07), E-1, E-2 |
| CMF-015 | D | `carga-masiva.tsx` con las cinco vistas, tercera pestana en `DocumentsView`, refresco cada 15 s, estilos (PLAN 7) | Todos los escenarios de G2 pasan en 1280 px y en 390 px sin desplazamiento horizontal | G2: `scripts/playwright-carga-masiva.cjs` | DONE (2026-11-07), E-2 |
| CMF-016 | D | Marca "Carga" y numero del archivo en Facturas, con enlace a la carga | La factura de carga abre su carga; KuDE, cancelacion y nota de credito disponibles | G2 | DONE (2026-11-07), E-2 |
| CMF-017 | D | `nginx.local.conf`: `client_max_body_size 25m` en `location /api/v1/`; cadena de topes nginx 25 MB > FS 24 MB > FE 20 MB (RN-01b, D-14) | Por el stack de `bash scripts/deploy.sh`: un CSV de 2 MB sube; uno de 21 MB recibe el `413` del mock con `tope_bytes = 20971520`; uno de 25 MB recibe el `413` de la API de FS con `tope_bytes = 25165824`, no del nginx (CA-15) | G2 | DONE (2026-11-07), E-2 |
| CMF-018 | E | `RealFiscalGateway`: nueve metodos contra `tecnica/openapi.yaml` de FE | Las diez rutas de FS responden contra el stack local `fe-cargas`; CA-14 verificado | G3 | PARTIAL (2026-11-07): metodos implementados y probados con `fetch` simulado (E-1). Falta correr contra `fe-cargas`, que usa otra sesion: se coordina con FE. El despliegue espera el tag |
| CMF-019 | E | `cargar-facturador.py --carga-masiva [cuota]`; `worker-cargas` en `build-images.sh`, `deploy.sh` y `up.sh` de `scripts/segel-fs`, apagado | Sin la opcion, el consumidor no recibe `CARGA_MASIVA`; los scripts construyen y levantan `fe-segel-worker-cargas` con `CARGAS_ENABLED=false` | G3, en local | BLOCKED: espera el tag de FE y la respuesta sobre `EMISSION_RESUME_DRAFT_ENABLED` |
| CMF-020 | E | Prueba conjunta P-06 en local con FE | Carga finalizada y resultado visible en FS; memoria de la API con un archivo del tope y duracion de la sincronizacion con 5.000, registradas; verificado que FE mueve `actualizado_en` cuando `correo` cambia (PLAN 6, paso 3) | G3 | BLOCKED: espera CMF-018 y el stack de FE disponible |
| CMF-021 | — | Cierre: repasar SPEC, PLAN, TASKS y `docs/BACKLOG.md` con lo descubierto | Documentos alineados con lo implementado; `AGENTS.md` sin cambios pendientes | — | TODO |

## Grupos de validacion

| Grupo | Cubre | Como |
|---|---|---|
| G1 | CMF-002 a CMF-005, CMF-007 a CMF-014 | `npm run test`, `npm run typecheck`, `npm run lint` en `apps/api`; `npm run build` del monorepo; integracion con `DATABASE_URL_TEST` sobre la base local |
| G2 | CMF-006, CMF-015 a CMF-017 | `APP_ENV_FILE=.local/carga-masiva/env bash scripts/deploy.sh` con `FE_GATEWAY_MODE=mock` y `CARGA_MASIVA_ENABLED=true`; `node scripts/playwright-carga-masiva.cjs` y `playwright-carga-masiva-config.cjs` en 1280x800 y 390x844 |
| G3 | CMF-018 a CMF-020 | Stack de FS con `FE_GATEWAY_MODE=real` contra el stack `fe-cargas` local de FE; nunca `segel-fs` ni Hetzner |

## Pendientes fuera de la matriz

- Despliegue en `segel-fs`: solo con confirmacion directa del usuario, con `CARGA_MASIVA_ENABLED=false` hasta que FE publique el tag y se cierre G3.
- Medicion con el volumen del primer cliente real, antes de habilitarlo (D-6).
- Saldo por documento: registrado en `docs/BACKLOG.md` (D-4).
- Preguntas a FE: tag e imagenes con `/v1/cargas`; `EMISSION_RESUME_DRAFT_ENABLED=true` como requisito; columnas del CSV de resultado; aviso previo si sube su `CARGA_MAX_BYTES`, para subir los de FS en el mismo orden (RN-01b).
- Verificar en G3: que FE mueva `actualizado_en` cuando cambia `correo`; los valores reales de `receptor.tipoDocumento`; el tiempo de una subida del tope frente a `proxy_read_timeout` (riesgo del PLAN, seccion 10).
- Infraestructura: el NGINX publico delante de `segel-fs`, si existe, debe admitir al menos 25 MB en la ruta de la API.

## Evidencia

### E-1. G1, API (2026-11-07)

`npm run test` de la API: 586 pasan, 0 fallan, 35 omitidas (las que piden `DATABASE_URL_TEST`). `tsc --noEmit` sin errores en API, web-operacion y backoffice; es lo mismo que `npm run lint` en la API. `npm run build` del monorepo correcto. `scripts/check-no-secrets.cjs` limpio. Archivos nuevos: `cargas.mock`, `cargas.service`, `cargas.routes`, `cargas-sync.worker` y `cargas.real-gateway`.

`cargas.integration.test.ts` con `DATABASE_URL_TEST` sobre el Postgres del stack aislado: 7 de 7. Cubre crear sin duplicar, `claim`, cantidad decimal, `verificacion_next_at` nulo, avance a `EMITIDA`, `ANULADA` sin revertir, y agenda sin tocar.

**Limite:** el cliente real se probo con `fetch` simulado, no contra FE.

### E-2. G2, pantalla, contra contenedores y mock (2026-11-07)

Stack aislado `fs-cm` levantado con `scripts/deploy.sh`, puertos 8391 y 8392. Viewports 1280x800 y 390x844.

| Script | Resultado | Escenarios |
|---|---|---|
| `playwright-carga-masiva.cjs` | 86/86 | Plantilla, extension no admitida, archivo rechazado, informe con errores y avisos, filtros, doble confirmacion, avance, resultado, descarga, factura de carga con marca y enlace, KuDE, cancelacion, nota de credito, sincronizacion que no revierte una cancelacion, archivo repetido, repetido en otro contexto, error con reintento, carga en espera, cancelar, topes de 2, 21 y 24,5 MB, contexto `CLIENTE`, numeros salteados, aislamiento entre contextos, lotes para rol interno, sin desplazamiento horizontal |
| `playwright-carga-masiva-config.cjs` | 10/10 | Selector del backoffice, aviso, auditoria con `anterior` y `nuevo`, `409 NUMERACION_DEL_CLIENTE` |
| `E2E_BANDERA_APAGADA=1 ...config.cjs` | 6/6 | Sin pestana, rutas en `404`, contexto con la bandera apagada |

Capturas en `test-results/carga-masiva/`, sin versionar. La revision de capturas encontro y se corrigio: titulos y estados partidos a mitad de palabra en 1280 px, filtros encimados y CDC en la columna equivocada en 390 px.

**Limites:** el tope de 25 MB del nginx se comprobo con 24,5 MB, por debajo de ese tope; un cuerpo mayor no se probo. La cuota diaria, la cola llena y los parametros invalidos de FE se probaron en G1, no por pantalla: el mock no los produce. "Corregir y emitir de nuevo" con cantidad decimal no se probo (RN-15b).

### E-3. Migracion 0037 (2026-11-07)

- Base nueva: 0001 a 0037, en el stack `fs-cm`.
- Copia de la base local, con 72 facturas, 77 items y 14 contextos: aplico 0035 a 0037. La suma de cantidades quedo igual (93) y los 14 contextos en `SERVICIO`. Una segunda corrida no aplico nada ni reporto checksums.
- La copia se borro al terminar. Es la base local de desarrollo, no una copia de produccion.

### Prototipo retirado (2026-11-06)

La migracion `0037` y la forma de numerar por contexto en la API se escribieron en el commit `ef084f0` y se retiraron en `851627f`, porque el contrato de FE todavia cambiaba. Ese commit queda como referencia para CMF-002, CMF-003 y CMF-005.

Lo que se comprobo con el, y vale para cuando se retome:

- La migracion aplico de la 0001 a la 0037 sobre una base nueva y vacia, y una segunda corrida no dio error de checksum. Sin probar sobre una base con datos.
- Con numeracion del cliente, `POST /facturas` respondio `409 CONFLICT` con `details.reason = NUMERACION_DEL_CLIENTE` y no encolo nada. La API paso 482 pruebas.
- Los codigos de error de la API son una lista cerrada: el motivo va en `details`.
- El backoffice no tiene pruebas de repositorio contra una base: el `PATCH` de contextos y su auditoria se prueban en `backoffice.service.test.ts` con el repositorio simulado, y manualmente en G2.
