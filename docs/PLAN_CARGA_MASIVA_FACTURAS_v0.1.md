# PLAN Carga masiva de facturas por archivo v0.1

**Fecha:** 2026-11-07. **SPEC:** `docs/SPEC_CARGA_MASIVA_FACTURAS_v0.1.md`. **Rama:** `feat/identidad-segel`, sin merge a `master`.

**Estado: fases A a D implementadas** (2026-11-07; decision del usuario, D-8; propuestas D-9 a D-13 aprobadas y D-14 decidida el mismo dia). Este PLAN refleja el diseno adoptado. La seccion 11 lista lo que cambio respecto del plan inicial al implementar.

## 1. Enfoque

FS no valida ni transforma el archivo: lo recibe, comprueba permisos y contexto, y lo reenvia a FE. FS guarda una fila por carga y copia a "Documentos" las facturas que FE va creando.

El trabajo se parte en dos:

- **Fases A a D, contra el mock:** no dependen de FE. `MockFiscalGateway` implementa las operaciones de `/v1/cargas` con las formas exactas de `tecnica/openapi.yaml` de FE (paquete v0.14) y una maquina de estados determinista (seccion 5.4).
- **Fase E, contra FE real:** `RealFiscalGateway` contra el stack local `fe-cargas` de FE. El despliegue, ademas, espera el tag de FE.

**Estado del contrato de FE al 2026-11-07:** publicado en la guia de consumidores (seccion 36) y en `tecnica/openapi.yaml`, con las diez operaciones, incluidas confirmar, cancelar y reintentar. Corre de punta a punta en el stack `fe-cargas` con SIFEN simulado, medido con 5.000 comprobantes. Commiteado en `feat/capacidad-200-clientes`, sin push ni tag. Falta su prueba en SIFEN test (CMA-604). FE sigue tocando lotes y firma (`986112d`, `095a00b`), sin cambio de contrato.

## 2. Orden de trabajo (D-7)

| Orden | Trabajo | Por que en ese lugar |
|---|---|---|
| 1 | Carga masiva, fases A a D | Contrato publicado; no depende de FE |
| 2 | Carga masiva, fase E | Depende del stack local de FE; el despliegue, del tag |
| 3 | Autogestion del operador | Borrador en `SPEC_AUTOGESTION_OPERADOR_v0.1.md`. Depende de rutas nuevas de FE |
| 4 | FS-24, verificacion de documentos en lote | Depende del tag de FE con `RECONCILE_DEFERRED_ENABLED` |

Ninguno de los cuatro se despliega sin confirmacion directa del usuario.

## 3. Base de datos: migracion `db/migrations/0037_carga_masiva.sql`

Aditiva, salvo ampliar `factura_items_snapshot.cantidad` (RN-15b). No modifica migraciones aplicadas (la ultima es `0036_email_estado_pending.sql`). El runner de `apps/api/src/db/migrate.ts` verifica checksums: el archivo no se edita despues de aplicado. El SQL de abajo resume el archivo, que manda.

```sql
alter table actividad_punto_perfiles
  add column numeracion_facturas text not null default 'SERVICIO'
  constraint actividad_punto_perfiles_numeracion_facturas_check check (numeracion_facturas in ('SERVICIO', 'CLIENTE'));

create table cargas_masivas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  facturador_id uuid not null references facturadores(id),
  actividad_punto_perfil_id uuid not null references actividad_punto_perfiles(id),
  fe_carga_id text not null,
  nombre_archivo text,
  tamano_bytes integer not null,
  sha256 text not null,
  numeracion text not null check (numeracion in ('SERVICIO', 'CLIENTE')),
  estado text not null,
  totales jsonb not null default '{}'::jsonb,
  acciones jsonb not null default '{}'::jsonb,
  motivos jsonb not null default '[]'::jsonb,
  fe_snapshot jsonb not null default '{}'::jsonb,
  subida_por uuid not null references usuarios(id),
  confirmada_por uuid references usuarios(id),
  cancelada_por uuid references usuarios(id),
  sincronizada_hasta timestamptz,
  sincronizada_en timestamptz,
  sync_next_at timestamptz,
  sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cargas_masivas_estado_check check (estado in (
    'RECIBIDA','VALIDANDO','RECHAZADA','VALIDADA','EN_COLA','EN_PREPARACION','EN_SIFEN','FINALIZADA','CANCELADA'))
);
create unique index cargas_masivas_fe_carga_uidx on cargas_masivas (facturador_id, fe_carga_id);
create index cargas_masivas_facturador_created_idx on cargas_masivas (facturador_id, created_at desc);
create index cargas_masivas_sync_idx on cargas_masivas (sync_next_at) where sync_next_at is not null;

alter table facturas_operativas
  add column carga_masiva_id uuid references cargas_masivas(id),
  add column carga_numero_archivo text;
create index facturas_operativas_carga_masiva_idx on facturas_operativas (carga_masiva_id) where carga_masiva_id is not null;

create index cargas_masivas_sha256_idx on cargas_masivas (facturador_id, sha256);

alter table factura_items_snapshot alter column cantidad type numeric(18, 6);
```

`estado`, `totales`, `acciones` y `motivos` son una copia de lo que informa FE, para listar sin llamar a FE; `fe_snapshot` guarda la ultima respuesta completa de `GET /v1/cargas/{id}` (fechas `recibida_en`, `validada_en`, `confirmada_en`, `iniciada_en`, `finalizada_en`, `cancelada_en`, `perfil`, `establecimiento`, `punto`, `actividad`). La fuente es FE. `sha256` es el de los bytes recibidos y sirve para reconocer el `200` de repetido sin llamar a FE cuando la carga anterior sigue local.

## 4. Fase A: forma de numerar por contexto

- **Backoffice API** (`apps/api/src/modules/backoffice/`): `contextoUpdateSchema` suma `numeracion_facturas: z.enum(["SERVICIO","CLIENTE"]).optional()`; `backoffice.repository` lee y escribe la columna; `backoffice.types` `Contexto` suma `numeracion_facturas`. Solo roles internos, como todo `/backoffice` (`requireBackofficeRole`). El cambio queda en `audit_events` con `entity_type = 'actividad_punto_perfil'`, `event_type = 'CONTEXTO_NUMERACION_FACTURAS_CAMBIADA'` y `metadata = { anterior, nuevo }`.
- **Backoffice web** (`apps/backoffice/src/api/contextos.ts` y `main.tsx`, edicion de contextos junto a `credito_plazo_dias`): selector "Numeracion de facturas: La asigna el servicio / La trae el archivo del cliente", con el aviso: "Cambiarla en un punto que ya emitio puede cruzar numeros. Configurar el mismo valor en el numerador de facturacion-electronica."
- **Contexto operativo** (`apps/api/src/modules/context/`): `FiscalContext.numeracion_facturas: "SERVICIO" | "CLIENTE"` se suma al `select` de `getOperationalContext` y al tipo; `OperationalContextResponse.carga_masiva_habilitada: boolean` toma `env.CARGA_MASIVA_ENABLED`. Ambos se documentan en `spec/openapi.yaml` (`FiscalContext`, `OperationalContextResponse`).
- **`POST /facturas`** (`facturas.service.ts`, al inicio del flujo que hoy encola la emision): si `context.fiscal_context.numeracion_facturas === "CLIENTE"`, lanza `HttpError(409, "CONFLICT", "Este punto numera con el archivo del cliente: las facturas se emiten por carga masiva.", { reason: "NUMERACION_DEL_CLIENTE" })`. `ApiErrorCode` es una lista cerrada en `packages/shared/src/types/api.ts`: no se agrega codigo; el motivo va en `details.reason`. `POST /facturas/preview` no cambia. Notas de credito (`/facturas/:id/nota-credito`): sin cambios.
- **Notas y presupuestos:** "Convertir en factura" (`onConvertirEnFactura` en `main.tsx`, que abre el editor con un borrador) termina en `POST /facturas`, asi que queda cubierto por la misma regla sin codigo extra. La interfaz deshabilita ese boton con el mismo criterio que "Nueva factura".
- **web-operacion:** en `main.tsx`, la accion `{ label: "Nueva factura", view: "invoice" }` (hoy `disabled: !canEmit`) queda `disabled` ademas cuando `context.fiscal_context.numeracion_facturas === "CLIENTE"`, con texto de ayuda: "Este punto emite por carga masiva". El mismo criterio para "convertir en factura" en Notas.

## 5. Fase B: API de cargas

Modulo nuevo `apps/api/src/modules/cargas/`: `cargas.routes.ts`, `cargas.service.ts`, `cargas.repository.ts`, `cargas.types.ts`, `cargas.mapeo.ts`, `cargas-sync.worker.ts`. El mock vive junto al gateway: `fiscal-gateway/fiscal-gateway.mock-cargas.ts`. Se monta en `app.ts` como `app.use(env.API_BASE_PATH, cargasRouter)`.

### 5.1 Bandera y variables (`apps/api/src/config/env.ts`)

| Variable | Tipo | Por defecto | Efecto |
|---|---|---|---|
| `CARGA_MASIVA_ENABLED` | `"true"\|"false"` | `false` | Apagada: todas las rutas `/cargas` responden `404 NOT_FOUND`, `carga_masiva_habilitada` es `false`, el worker no arranca |
| `CARGA_MAX_BYTES` | entero | `25165824` (24 MB) | Tope de `express.raw` en la subida; superado responde `413 PAYLOAD_TOO_LARGE` con `details.tope_bytes`. Debe quedar por encima del `CARGA_MAX_BYTES` de FE (20 MB) y por debajo del `client_max_body_size` del nginx (25 MB), para que el `413` normal lo de FE (SPEC RN-01b, D-14) |
| `CARGA_SUBIDAS_SIMULTANEAS` | entero | `2` | Subidas en curso por proceso; la siguiente responde `429` con `Retry-After: 10` |
| `CARGA_UPLOAD_TIMEOUT_MS` | entero | `60000` | Tiempo de espera del reenvio a FE, distinto de `FE_API_TIMEOUT_MS` |
| `CARGAS_SYNC_WORKER_ENABLED` | `"true"\|"false"` | `true` | Worker de la fase C, solo con `CARGA_MASIVA_ENABLED` |
| `CARGAS_SYNC_WORKER_INTERVAL_MS` | entero | `60000` | Cadencia del worker |

### 5.2 Rutas

Todas con `requireAuth`, la bandera, y el contexto operativo del usuario (`getOperationalContext`; sin configuracion operativa, `409 CONFLICT`, como las demas rutas operativas). Solo la subida y confirmar exigen ademas `getReadinessChecks` con `ready === true` (RN-02, RN-10); si no, `409 CONFLICT` con `details.reason = "CONTEXTO_NO_LISTO"` y `details.checks`.

| Ruta de FS | Llama a FE | Notas |
|---|---|---|
| `GET /cargas/plantilla` | `GET /v1/cargas/formatos/csv/1` | Reenvia el `text/csv` con `Content-Disposition: attachment; filename="plantilla-carga-facturas.csv"` |
| `POST /cargas` | `POST /v1/cargas` | Archivo como cuerpo. Seccion 5.3 |
| `GET /cargas` | — | Desde `cargas_masivas`, paginado (`limit` 1-100, por defecto 20; `offset`), filtros `estado` (uno o varios separados por coma) y `desde`/`hasta` sobre `created_at` en fecha local |
| `GET /cargas/:id` | `GET /v1/cargas/{id}` | Refresca la copia local y la devuelve. Si FE falla, devuelve la copia con `sincronizada_en` y `sync_error` |
| `GET /cargas/:id/comprobantes` | `GET /v1/cargas/{id}/comprobantes` | Pasa `estado`, `con_advertencias`, `page`, `limit` (tope 200) y `detalle`. Suma a cada comprobante `documento_id` de FS cuando existe una factura con ese `document_uuid` del mismo facturador |
| `POST /cargas/:id/confirmar` | `POST .../confirmar` | Guarda `confirmada_por`, `sync_next_at = now()`, audita |
| `POST /cargas/:id/cancelar` | `POST .../cancelar` | Guarda `cancelada_por`, audita |
| `POST /cargas/:id/reintentar` | `POST .../reintentar` | Audita |
| `GET /cargas/:id/resultado` | `GET .../resultado` | Reenvia el `text/csv` sin leerlo, `filename="resultado-<nombre_archivo o carga_id>.csv"` |
| `GET /cargas/:id/lotes` | `GET .../lotes` | Solo `SOPORTE_INTERNO` y `ADMIN_INTERNO`; otro rol `403` |

**Respuesta de carga de FS** (`CargaMasivaResponse`): `id` (de FS), `fe_carga_id`, `estado`, `nombre_archivo`, `tamano_bytes`, `numeracion`, `totales`, `acciones`, `motivos`, `fechas` (las seis de FE), `contexto` (`perfil`, `establecimiento`, `punto`, `actividad`), `subida_por`, `confirmada_por`, `cancelada_por` (cada uno `{ id, display_name }` o nulo), `sincronizada_en`, `sync_error`, `created_at`. En la subida se agrega `repetida: boolean`. Los comprobantes se devuelven con la forma de FE (`CargaComprobante`) mas `documento_id`.

**Acciones fuera de estado:** un `409 CARGA_ACCION_NO_ADMITIDA` de FE se devuelve como `409 CONFLICT` con `details = { reason: "CARGA_ACCION_NO_ADMITIDA", estado, acciones }`, y antes actualiza `estado` y `acciones` locales con `details` de FE.

**Aislamiento (D-12):** toda consulta filtra por `facturador_id` del contexto y, salvo roles internos, por `actividad_punto_perfil_id` del contexto. Una carga ajena responde `404 NOT_FOUND`.

**Auditoria** (`audit_events`, `entity_type = 'carga_masiva'`, `entity_id = cargas_masivas.id`): `CARGA_SUBIDA` (`{ fe_carga_id, nombre_archivo, tamano_bytes, sha256, repetida }`), `CARGA_CONFIRMADA`, `CARGA_CANCELADA`, `CARGA_REINTENTADA`, con `usuario_id`.

### 5.3 Subida

- **Transporte: el archivo es el cuerpo del pedido.** Confirmado por el usuario (2026-11-06). En la ruta, antes del handler: `express.raw({ type: ["text/csv", "application/zip"], limit: env.CARGA_MAX_BYTES })`. `express.json` global solo parsea `application/json`, asi que no interfiere. Otro `Content-Type` responde `415` con `VALIDATION_ERROR` y `details.reason = "TIPO_DE_CONTENIDO_NO_ADMITIDO"`. Cuerpo vacio: `422 VALIDATION_ERROR`, `details.reason = "ARCHIVO_VACIO"`.
- Parametro de consulta `nombre_archivo` (opcional, se recorta a 200 caracteres, solo informativo). Se aceptan `.csv` y `.zip`; FS no abre el `.zip`.
- `CARGA_SUBIDAS_SIMULTANEAS` se controla con un contador en memoria del modulo; la subida que excede responde `429` con `Retry-After: 10` y `details.reason = "SUBIDAS_SIMULTANEAS"`. Tope de memoria: `CARGA_SUBIDAS_SIMULTANEAS x CARGA_MAX_BYTES` mas la copia del reenvio: con los valores por defecto, 48 MB mas 24 MB.
- FS calcula `sha256` de los bytes y busca una `cargas_masivas` del mismo facturador con ese `sha256` cuyo estado no es `RECHAZADA` ni `CANCELADA` (D-13). Si existe y el usuario puede verla (RN-11), responde `200` con esa carga y `repetida: true` sin llamar a FE (CA-03). Si existe pero pertenece a otro contexto operativo, responde `409 CONFLICT` con `details.reason = "ARCHIVO_YA_SUBIDO_EN_OTRO_CONTEXTO"`, sin datos de la carga ajena y sin llamar a FE: para FE seria la misma carga, y FS no puede mostrarla ni duplicarla. Si no existe, llama a FE.
- FS manda a FE los bytes sin tocarlos, con el mismo `Content-Type`, y en la URL: `emisor_id` (del facturador), `formato=CSV`, `version=1`, `numeracion` (del contexto), `actividadEconomicaCodigo`, `nombre_archivo`; y `emission_profile_code` si `perfil_emision_codigo !== "NO_REQUERIDO"`, o `establecimiento` y `punto` si lo es. Mismo criterio que `buildEmitirFacturaPayload` y `FE_SEND_EMISSION_PROFILE_CODE`.
- Clave: la de consumidor del facturador (`facturasRepository.getFacturadorApiKey`, mismo mecanismo `gatewayWithKey` que la emision y los recibos). Sin clave propia: `409 CONFLICT`, `details.reason = "SIN_CLAVE_DE_CONSUMIDOR"`. Nunca la compartida.
- Tiempo de espera `CARGA_UPLOAD_TIMEOUT_MS`. Ante timeout, FS reintenta una vez con los mismos bytes: FE reconoce el repetido por contenido y no duplica.
- `202` de FE: crea la fila local con `estado`, `totales`, `acciones`, `motivos`, `fe_snapshot`, `sync_next_at = now() + 5 s`, y responde `201` con `repetida: false`. `200` de FE: busca la fila por `(facturador_id, fe_carga_id)`; si no existe (carga hecha fuera de FS, o una `RECHAZADA`/`CANCELADA` local que FE igual reutilizo) la crea con el contexto y `subida_por` del usuario actual; si existe y es de otro contexto, `409 ARCHIVO_YA_SUBIDO_EN_OTRO_CONTEXTO`; responde `200` con `repetida: true` en los demas casos.
- Errores de FE: `403`, `413`, `415`, `422` y `429` se devuelven con el mismo codigo HTTP, `code` de FS por tabla (`403 FORBIDDEN`, `413 PAYLOAD_TOO_LARGE`, `415`/`422 VALIDATION_ERROR`, `429` con `code` `CONFLICT`), el `message` de FE y `details = { fe_code, ...details de FE }`; `Retry-After` se copia. El `413` de FE conserva `details.tope_bytes`: es el tope que ve el usuario (RN-01b). Un `404` de FE en la subida se devuelve como `409 CONFLICT`, `details.reason = "CARGA_MASIVA_NO_HABILITADA_EN_FE"` (D-10). Otros `5xx` y errores de red: `502` `INTERNAL_ERROR` con `details.reason = "FE_NO_DISPONIBLE"`. Nada de esto crea fila local.

### 5.4 Gateway y mock

`FiscalGateway` (`fiscal-gateway.types.ts`) suma, con tipos que copian los esquemas de FE (`FeCarga`, `FeCargaComprobante`, `FeCargaProblema`, `FeCargaTotales`, `FeCargaAcciones`, `FeCargaLote`), estos metodos: `crearCarga(input)`, `getPlantillaCarga()`, `getCarga(cargaId)`, `listCargaComprobantes(cargaId, filtros)`, `confirmarCarga(cargaId)`, `cancelarCarga(cargaId)`, `reintentarCarga(cargaId)`, `getCargaResultado(cargaId)`, `getCargaLotes(cargaId)`. Un error HTTP de FE se propaga como `FiscalGatewayError` con `status`, `fe_code`, `message`, `details` y `retry_after`.

`RealFiscalGateway`: los nueve metodos implementados contra el OpenAPI de FE (seccion 8), sin probar contra FE real hasta G3.

`MockFiscalGateway`: delega en `mockCargas`, con estado de modulo y no de instancia, porque cada pedido crea su propio gateway con la clave del facturador. Se pierde al reiniciar el proceso. Es esta maquina determinista. El mock lee del CSV solo la fila de titulos, `numero_comprobante` (para contar comprobantes distintos), `referencia_venta` (para los marcadores) y `receptor_email`. No valida nada mas.

| Entrada | Resultado del mock |
|---|---|
| Mas de 20.971.520 bytes | `FiscalGatewayError` con `status 413`, `fe_code "CARGA_ARCHIVO_DEMASIADO_GRANDE"`, `details.tope_bytes = 20971520`, como FE. No crea carga |
| Titulos sin `numero_comprobante` | Carga `RECHAZADA`, motivo `COLUMNA_DESCONOCIDA`, fila 1 |
| Mismos bytes ya subidos (sha256), carga no `RECHAZADA` ni `CANCELADA` | `200` con la carga existente |
| `referencia_venta` que empieza con `INVALIDO` | Comprobante `INVALIDO`, error `TOTAL_NO_COINCIDE`, columna `total_comprobante` |
| `referencia_venta` que empieza con `AVISO` | Valido, con advertencia `TRANSMISION_EXTEMPORANEA` |
| `referencia_venta` que empieza con `RECHAZO` | Tras confirmar: `RECHAZADO`, `sifen = { codigo: "1306", mensaje: "RUC del receptor inexistente" }` |
| `referencia_venta` que empieza con `ERROR` | Tras confirmar: `ERROR`; `puede_reintentar: true`; al reintentar pasa a `APROBADO` |
| `referencia_venta` que empieza con `DUP` | `DUPLICADO` con `document_uuid` fijo `00000000-0000-4000-8000-0000000000dd` |
| Cualquier otro | `PENDIENTE` y, tras confirmar, `APROBADO` con `document_uuid` derivado del `carga_id` y el `orden`, `cdc` de 44 digitos, `correo = "SENT"` si el CSV tiene `receptor_email`, `aprobado_en` |

Avance por llamadas a `getCarga`: `RECIBIDA` al crear; la primera consulta la pasa a `VALIDADA` (o `RECHAZADA`); `confirmarCarga` la pasa a `EN_PREPARACION` con la mitad de los validos `PREPARADO`; la siguiente consulta a `EN_SIFEN` con todos `ENVIADO`; la siguiente a `FINALIZADA` con los estados finales de la tabla, salvo que quede algun `ERROR`, en cuyo caso permanece `EN_SIFEN` hasta reintentar o cancelar. `cancelarCarga` en `VALIDADA` deja `CANCELADA` con todos `CANCELADO`; en `EN_SIFEN` deja `cancelada_en` y pasa `ERROR` a `CANCELADO`. `acciones` se calcula: `puede_confirmar` solo en `VALIDADA` con validos > 0; `puede_cancelar` en `VALIDADA`, `EN_COLA`, `EN_PREPARACION` y en `EN_SIFEN` con pendientes o errores; `puede_reintentar` con `con_error > 0`. Una accion no admitida lanza `FiscalGatewayError` con `status 409`, `fe_code "CARGA_ACCION_NO_ADMITIDA"`, `details = { estado, acciones }`. `detalle=true` arma `receptor`, `condicionOperacion`, `items` y `total` desde `cargas.mock-data.ts` (un receptor RUC `80000000-1`, un item IVA10 de 100.000). `listCargaComprobantes` respeta `estado`, `con_advertencias`, `actualizado_desde`, `page` y `limit`, y pone `actualizado_en` con el instante de cada cambio. `getCargaResultado` devuelve un CSV de una fila por comprobante. `getCargaLotes` devuelve un lote por cada 50 enviados. Una carga confirmada con otra `EN_PREPARACION` o `EN_SIFEN` del mismo emisor queda `EN_COLA` hasta que la otra termine. `acciones` usa la misma regla que `accionesDeCarga` de FE (`presentar-carga.ts`).

### 5.5 Contrato de FS

`spec/openapi.yaml`: tag `Cargas`; las diez rutas; esquemas `CargaMasivaResponse`, `CargaMasivaListResponse`, `CargaMasivaComprobante`, `CargaMasivaProblema`, `CargaMasivaTotales`, `CargaMasivaAcciones`, `CargaMasivaLote`; `FiscalContext.numeracion_facturas`; `OperationalContextResponse.carga_masiva_habilitada`; `DocumentoResponse.carga`; parametro `carga_id` en `GET /facturas`; `details.reason` nuevos en `POST /facturas` y `/cargas`.

## 6. Fase C: sincronizacion con "Documentos"

Worker nuevo `apps/api/src/modules/cargas/cargas-sync.worker.ts`, con `startCargasSyncWorker({ repository, gatewayFor, intervalMs })`, arrancado en `server.ts` junto a los otros dos, solo con `CARGA_MASIVA_ENABLED && CARGAS_SYNC_WORKER_ENABLED`. Usa la clave de consumidor del facturador de cada carga (`getFacturadorApiKey`): `/v1/cargas` pertenece al sistema de claves de consumidor, no al de la clave compartida (ver el comentario de `verificacion.worker.ts`).

Por ciclo:

1. `claimNextCargasSync(limit = 5)`: `select ... from cargas_masivas where sync_next_at <= now() order by sync_next_at limit $1 for update skip locked`, y pone `sync_next_at = now() + interval '10 minutes'` como traba. Mismo patron que `claimNextVerificacion`.
2. `getCarga(fe_carga_id)` y actualiza `estado`, `totales`, `acciones`, `motivos`, `fe_snapshot`, `sincronizada_en = now()`, `sync_error = null`.
3. Si la carga esta en `EN_PREPARACION`, `EN_SIFEN`, `FINALIZADA` o `CANCELADA` (los unicos estados con comprobantes que pueden tener `document_uuid`), pide `listCargaComprobantes` con `actualizado_desde = sincronizada_hasta` menos 2 minutos, `detalle = true`, `limit = 200`, pagina por pagina hasta `page * limit >= total`. Se pide siempre, no solo cuando cambian los `totales`: un cambio de `correo` (`PENDING` a `SENT`) o de `documento_estado` no mueve los totales, y con `actualizado_desde` la respuesta trae solo lo que cambio. **Supuesto a verificar en G3:** FE actualiza `actualizado_en` tambien por el cambio de `correo` (la guia 36.5 dice "tambien por un cambio posterior de su factura").
4. Por cada comprobante con `document_uuid` y `estado` en `PREPARADO`, `ENVIADO`, `APROBADO`, `APROBADO_CON_OBS`, `RECHAZADO`: `cargaRepository.incorporarFacturas` en `facturas_operativas` por `(facturador_id, external_ref)`, con `external_ref = carga:<fe_carga_id>:<orden>`. Una transaccion por pagina. Vive en el repositorio de cargas: `FacturaRepository` tiene dobles de prueba que no lo necesitan.
5. Avanza `sincronizada_hasta` al `actualizado_en` mas nuevo recibido, solo si todas las paginas se procesaron. No usa la hora de FS: no depende de los relojes. El margen de 2 minutos del paso 3 cubre un comprobante que cambia mientras se recorren las paginas, cuyo `actualizado_en` puede quedar por debajo del mas nuevo; volver a incorporarlo es idempotente.
6. Reprograma `sync_next_at` segun la tabla de frecuencia. Si FE fallo en 2 o 3: no toca estados, guarda `sync_error` con el mensaje, y reprograma al intervalo siguiente (RN-19).

| Estado del comprobante en FE | Documento en FS |
|---|---|
| `PREPARADO`, `ENVIADO` | `PENDIENTE_SIFEN`; `fiscal_status_raw = "QUEUED_BATCH"` |
| `APROBADO`, `APROBADO_CON_OBS` | `EMITIDA`; `fiscal_status_raw = "APPROVED"` / `"APPROVED_WITH_OBS"`; `emitted_at = aprobado_en` |
| `RECHAZADO` | `RECHAZADA`; `fiscal_status_raw = "REJECTED"`; `sifen_result_code` y `sifen_result_message` desde `sifen` |
| `DUPLICADO` | No crea documento. La pantalla enlaza al existente por `document_uuid` |
| `INVALIDO`, `CANCELADO`, `PENDIENTE`, `ERROR` | No crean documento |

- **Estado vigente:** si el comprobante trae `documento_estado`, ese decide, con `mapDocumentStatusCanonico`: `CANCELLED` deja `ANULADA`. `fiscal_status_raw` guarda `documento_estado` cuando viene.
- **Estados finales:** una factura `ANULADA` no cambia. Una `EMITIDA` o `RECHAZADA` solo cambia si FE informa otro estado final (`documento_estado`). Asi una cancelacion hecha desde FS no se revierte.
- **Snapshot** (D-11) desde `detalle`, con la inversa de `buildEmitirFacturaPayload`: `cliente_snapshot` = `{ documento_tipo: receptor.tipoDocumento, documento: docNro + (dv ? "-" + dv : ""), razon_social, direccion, telefono, email, naturaleza }`; `condicion_venta` = `condicionOperacion.tipo` (`CONTADO`/`CREDITO`); items con `codigo`, `descripcion`, `cantidad`, `precio_unitario` y `iva_tipo` (inversa de `mapIvaTipo`: `IVA10 -> IVA_10`, `IVA5 -> IVA_5`, `EXENTO -> EXENTA`). `calculateTaxLine` solo admite cantidades enteras y FE admite decimales (RN-15b): cada linea se calcula con cantidad 1 sobre `round(cantidad x precio)`, como FE arma el total, y conserva la cantidad y el precio del archivo. Un tipo de documento que FS no conoce, como `INNOMINADO`, queda `NO_ESPECIFICADO` en el snapshot. Si `totals.total` difiere de `detalle.total`, se registra un `logger.warn` con ambos y se guarda el de FE en `fiscal_response_snapshot.total_fe`; manda el XML de FE, no el calculo de FS.
- **Campos:** `tenant_id`, `facturador_id` y `actividad_punto_perfil_id` de la carga; `usuario_id = confirmada_por`; `tipo = 'FACTURA'`; `numero_fiscal = numero_asignado`; `carga_masiva_id`; `carga_numero_archivo = numero_archivo`; `cdc`; `document_uuid`; `fiscal_document_id` nulo (FE no lo informa por carga); `idempotency_key` nulo; `fiscal_request_snapshot = detalle`; `fiscal_response_snapshot` = el comprobante sin `detalle`; `email_estado` = `correo` (`PENDING`, `SENT`, `FAILED`, o nulo; `PENDING` ya es valido desde la 0036); `verificacion_next_at` nulo (RN-17); `sifen_last_checked_at = actualizado_en`.
- **Frecuencia:** 1 min en `RECIBIDA`, `VALIDANDO` y `EN_PREPARACION`; 5 min en `EN_COLA` y `EN_SIFEN`. `VALIDADA` sin confirmar y `RECHAZADA`: `sync_next_at` nulo, no cambian solas. Al llegar a `FINALIZADA` o `CANCELADA` hace una pasada mas de comprobantes y deja `sync_next_at` nulo: desde ahi, un cambio hecho fuera de FS se ve con "Verificar estado fiscal". Pasadas 72 h desde `confirmada_en` sin terminar, sigue cada 30 min y registra `logger.warn` una vez por ciclo.
- **No toca** `facturador_clientes`, `cliente_identidades` ni `catalogo_items` (RN-16).
- **`GET /facturas`** suma el filtro `carga_id` (uuid de FS) y `DocumentoResponse.carga: { id, numero_archivo } | null`, leidos de `carga_masiva_id` y `carga_numero_archivo`.

## 7. Fase D: pantalla

**PC primero** (SPEC seccion 4): el diseno parte de 1280 px, con tabla ancha, y se adapta hacia abajo con las mismas reglas de `documents-view` (tarjetas por debajo de 720 px).

Componente nuevo `apps/web-operacion/src/carga-masiva.tsx`, exportando `CargaMasivaView({ api, apiBaseUrl, accessToken, esInterno, contexto, cargaInicialId, onVerDocumento })`. Recibe el cliente de `createApiClient` como prop para no importar desde `main.tsx` (7.777 lineas; evita el ciclo). Sus tipos copian `CargaMasivaResponse` y `CargaMasivaComprobante` de `spec/openapi.yaml`. Estilos en `styles.css`, con las clases existentes y un bloque nuevo `.carga-masiva`.

- `DocumentsView` (`main.tsx`): `docKindTab` pasa a `"FACTURAS" | "NOTAS_CREDITO" | "CARGA_MASIVA"`; la tercera pestana "Carga masiva" aparece solo con `context.carga_masiva_habilitada`; con ella activa se renderiza `<CargaMasivaView>` en lugar de la lista de documentos y sus filtros.
- Vistas del SPEC, seccion 4: listado, nueva carga, informe, avance y resultado. La nueva carga usa `<input type="file" accept=".csv,.zip">` y zona de arrastre; antes de subir muestra facturador, punto, perfil y forma de numerar del contexto. La subida usa `api.request` con `body: file` y `content-type` `text/csv` o `application/zip` segun la extension, y `?nombre_archivo=`. Las descargas (plantilla, resultado) usan `fetch` con `Authorization` y `URL.createObjectURL`, como la descarga de KuDE.
- Mientras una carga activa esta en pantalla (`RECIBIDA`, `VALIDANDO`, `EN_COLA`, `EN_PREPARACION`, `EN_SIFEN`), `GET /cargas/:id` se repite cada 15 s, y cada 3 s en `RECIBIDA` y `VALIDANDO`, porque validar tarda segundos; se detiene con `document.visibilityState !== "visible"` y al salir de la vista.
- Confirmar pide una segunda confirmacion con la cantidad a emitir ("Se emitiran N facturas reales"). Si hay invalidos y `numeracion === "CLIENTE"`, agrega: "Los numeros de los M comprobantes invalidos quedaran salteados". Cancelar en `EN_SIFEN` avisa que los ya preparados se transmiten igual.
- Textos de FE sin reescribir: codigo, mensaje, fila y columna tal como llegan. Estados de carga y de comprobante con las etiquetas de la seccion 7 del pedido; `EN_COLA` se muestra como "En espera de otra carga".
- `ApiClientError` de `main.tsx` suma `details`, para leer `reason`, `tope_bytes`, `motivos` y `retry_after_seconds`. Los mensajes de la tabla del SPEC, seccion 4, salen del texto del backend y de esos campos. Un `409 CARGA_ACCION_NO_ADMITIDA` recarga la carga y muestra "La carga cambio de estado; se actualizo la pantalla".
- En Facturas, las de carga (`documento.carga`) muestran una marca "Carga" que cambia a la pestana Carga masiva con esa carga abierta, y el numero del archivo cuando difiere de `numero_fiscal`.
- Sin colores ni nombres de Ventax: usa las variables de marca actuales (CA-10).

## 8. Fase E: FE real

- `RealFiscalGateway`: los nueve metodos contra `tecnica/openapi.yaml` de FE. La subida con `fetch` y `body: Buffer`, `Content-Type` del archivo, `x-api-key` de consumidor, `AbortSignal.timeout(CARGA_UPLOAD_TIMEOUT_MS)`. Errores con `readJson` y `FiscalGatewayError` con `fe_code = body.error`, `message = body.message`, `details = body.details`, `retry_after_seconds` de la cabecera: `/v1/cargas` responde `{ error, message, details }`, con `error` como texto.
- `scripts/segel-fs/cargar-facturador.py`: opcion `--carga-masiva [cuota_diaria]` que agrega `CARGA_MASIVA` a `perms` y `cargas_cuota_diaria` en `emisor_assignments`. Sin la opcion, nada cambia.
- `worker-cargas` de FE en `scripts/segel-fs/build-images.sh` (`fe-segel-worker-cargas`), `deploy.sh` y `up.sh`, con `CARGAS_ENABLED=false` hasta decision del usuario. Confirmar con FE si `EMISSION_RESUME_DRAFT_ENABLED=true` es requisito y que implica para la emision en linea.
- Limites de subida (RN-01b): `infra/nginx-or-caddy/nginx.local.conf` agrega `client_max_body_size 25m;` en `location /api/v1/` (hoy ausente: corta en 1 MB). `host-segel-fs.conf`, `host-production.conf` y `host-factura-multi-env.conf` ya tienen 25 MB. Cadena resultante: nginx 25 MB > FS 24 MB > FE 20 MB. El NGINX publico, con infraestructura, al menos 25 MB. Este cambio se hace en la fase D (CMF-017) porque G2 lo necesita; se repite aqui porque el despliegue lo lleva.
- Prueba conjunta P-06 en local: stack de FS por `bash scripts/deploy.sh` con `FE_GATEWAY_MODE=real` apuntando al stack `fe-cargas` de FE, un facturador de prueba con `CARGA_MASIVA`, SIFEN simulado o test segun FE autorice. Medir memoria de la API con un archivo del tope y duracion de la sincronizacion con 5.000.

## 9. Validacion

Se corre en tres grupos, cada uno en un solo flujo de pruebas (regla de `AGENTS.md`):

**G1, API (fases A, B, C):** `npm run test`, `npm run typecheck`, `npm run lint` en `apps/api`; `npm run build` del monorepo. Pruebas nuevas en `apps/api/tests/`: `cargas.service.test.ts` (permisos, aislamiento por facturador y perfil, bandera apagada, reenvio con el mismo sha256, repetido local visible, repetido en otro contexto con `409`, `200` de FE, tipos de contenido, topes de FS y de FE, subidas simultaneas, contexto no listo, errores de FE con su codigo y `details`, `409` de accion con actualizacion de `acciones`); `backoffice.service.test.ts` y `context.service.test.ts` ampliados (fase A); `facturas.routes.test.ts` ampliado (filtro `carga_id` y campo `carga`); `cargas.mock.test.ts` (la maquina de estados completa: rechazada, validada, confirmada, en SIFEN, finalizada, error y reintento, cancelacion en dos estados, repetido); `cargas-sync.worker.test.ts` (crea documentos solo con `document_uuid`; dos pasadas no duplican; `ANULADA` no se revierte; `EMITIDA` no vuelve a `PENDIENTE_SIFEN`; fallo de FE no cambia estados y guarda `sync_error`; `verificacion_next_at` nulo; no toca agenda ni catalogo; cursor en el `actualizado_en` mas nuevo; snapshot inverso con totales); `facturas.numeracion-cliente.test.ts` (`409 NUMERACION_DEL_CLIENTE`; preview y nota de credito permitidas); `migrations.test.ts` sigue pasando con la 0037. Integracion con base (`DATABASE_URL_TEST`, patron de `capacidad.fixes.integration.test.ts`): `cargas.integration.test.ts` para el upsert por `external_ref` y el `claim` con `skip locked`.

**G2, pantalla (fase D):** `APP_ENV_FILE=.local/carga-masiva/env bash scripts/deploy.sh`, un stack aislado (`COMPOSE_PROJECT_NAME=fs-cm`, puertos 8391 y 8392) con `FE_GATEWAY_MODE=mock` y `CARGA_MASIVA_ENABLED=true`, y datos de `scripts/sql/seed_e2e_carga_masiva.sql`; `scripts/playwright-carga-masiva.cjs` en 1280x800 primero y 390x844, con archivos CSV que el script genera en cada corrida. Escenarios: pestana ausente con la bandera apagada; plantilla descargada; archivo rechazado con motivo, fila y columna; informe con errores y avisos; confirmar con doble confirmacion y aviso de numeros salteados; carga en espera de otra; avance y refresco; comprobante en error con reintento; resultado con filtros y descarga; archivo repetido abre la anterior; cancelar en `EN_SIFEN` con su aviso; factura de carga en Facturas con marca y enlace; contexto `CLIENTE` sin "Nueva factura"; topes: 2 MB sube, 21 MB recibe el `413` del mock con `tope_bytes`, 25 MB recibe el `413` de FS (CA-15); sin desplazamiento horizontal en 390 px. Capturas y resultado en la evidencia de `TASKS`.

**G3, FE real (fase E):** prueba conjunta P-06 contra el stack local de FE, con los mismos escenarios de G2 que apliquen y CA-14 (sha256 del archivo recibido por FE, leido de su respuesta o de su base). Nunca en `segel-fs` ni en Hetzner.

## 10. Riesgos

| Riesgo | Mitigacion |
|---|---|
| Cantidad decimal al corregir una factura rechazada | El editor solo admite enteras: el operador ajusta la linea (RN-15b). Se revisa con autogestion del operador |
| Subida lenta frente al nginx: FS espera hasta 60 s y reintenta una vez, y `proxy_read_timeout` por defecto es 60 s | El navegador puede ver un `504` mientras la subida termina. Subir de nuevo no duplica: los mismos bytes abren la misma carga. Medir en G3 con un archivo del tope antes de tocar el nginx |
| FE cambia el contrato antes del tag | Los tipos del gateway copian el OpenAPI de FE y viven en `fiscal-gateway.types.ts`; el mock y la fase E se ajustan en un solo lugar |
| 5.000 inserciones por ciclo en `facturas_operativas` | Paginas de 200 y una transaccion por pagina. Medir en P-06 |
| Memoria de la API con archivos de hasta 24 MB | `CARGA_SUBIDAS_SIMULTANEAS = 2`: 72 MB en el peor caso. Dato de FE: 5.000 comprobantes de dos lineas pesan 1,65 MB; 100.000 lineas, unos 16,5 MB |
| Un tope de FS corta antes que FE y el usuario ve un mensaje sin `tope_bytes` de FE | Cadena nginx 25 MB > FS 24 MB > FE 20 MB (RN-01b), verificada en G2 con archivos de 2 MB, 21 MB y 25 MB (CA-15) |
| El nginx del frontend corta en 1 MB | `client_max_body_size 25m` en `nginx.local.conf`, verificado en G2 con un archivo de 2 MB |
| Sin dato de volumen real (D-6) | Declarado en el SPEC. Medir con el primer cliente antes de habilitarlo |
| Un contexto pasa de `SERVICIO` a `CLIENTE` con facturas ya emitidas | Aviso en el backoffice. La proteccion real es la validacion de FE sobre su numerador |
| La forma de numerar queda distinta en FS y en FE | FE rechaza con `422` y FS lo muestra como problema de configuracion. Mejora posible: que FE publique la configuracion del numerador y FS la lea |
| El filtro por perfil deja sin ver cargas a un usuario que cambia de contexto | Es la segmentacion vigente. Soporte interno ve todas |
| La migracion 0037 viaja antes que la funcion | Aditiva, con valores por defecto y bandera apagada: sin efecto visible (D-8) |
| Dos facturas por la misma venta si el operador emite en linea en un punto `CLIENTE` | RN-22 en FS; FE no protege ese cruce (RN-21c) |

## 11. Cambios respecto del plan inicial

Descubiertos al implementar, el 2026-11-07:

| Tema | Plan inicial | Adoptado | Por que |
|---|---|---|---|
| Cantidad | Entera, con `calculateDocumentTotals` | `numeric(18,6)` y linea calculada sobre su subtotal | FE admite decimales (`item_cantidad`). Con el plan inicial, la sincronizacion habria fallado en la primera cantidad decimal |
| Error de FE | `body.error.code` | `body.error` es el texto | Forma real de `handleError` en `cargas.route.ts` de FE. El OpenAPI lo declara como `ErrorResponse` |
| Estado del mock | "Por proceso" | De modulo | `createFiscalGateway` crea una instancia por pedido |
| Contexto ausente | `403` | `409` | Es lo que responde `getOperationalContext` en todas las rutas |
| `RealFiscalGateway` en fase B | `501 NOT_IMPLEMENTED` | Implementado | El contrato ya esta publicado; una fase intermedia no aportaba |
| Upsert de facturas | `facturas.repository` | `cargas.repository` | No agranda `FacturaRepository` ni sus dobles de prueba |
| Cursor | `actualizado_en` mas nuevo | Lo mismo, consultado con 2 minutos de margen | Un cambio durante el recorrido de paginas podia perderse |
| Refresco de pantalla | 15 s | 15 s, y 3 s mientras valida | Validar tarda segundos |
| Fixtures de G2 | Archivos versionados | Generados por el script | Cada corrida necesita bytes nuevos: los repetidos abren la carga anterior |
