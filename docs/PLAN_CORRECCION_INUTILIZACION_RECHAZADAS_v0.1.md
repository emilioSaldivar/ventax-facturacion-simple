# PLAN Correccion vinculada e inutilizacion de facturas rechazadas v0.1

**SPEC:** `docs/SPEC_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1.md`. **TASKS:** `docs/TASKS_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1.md`.

## 1. Base de datos

Migracion `db/migrations/0041_correccion_inutilizacion.sql`, aditiva y nullable (los documentos existentes no cambian):

- Indice unico parcial `facturas_operativas_correccion_uidx` en `(facturador_id, documento_relacionado_id)` `where tipo = 'FACTURA' and documento_relacionado_id is not null and deleted_at is null` (RN-A3). El indice de notas de credito (`facturas_operativas_nce_total_uidx`) ya filtra por `tipo = 'NOTA_CREDITO'`: no chocan.
- Columnas `inutilizacion_status` (`ACCEPTED`, `REJECTED`, `FAILED`, con check), `inutilizacion_evento_id`, `inutilizacion_motivo`, `inutilizacion_rejection_code`, `inutilizacion_rejection_message`, `inutilizacion_intentos integer not null default 0` (check `>= 0`), `inutilizacion_last_at timestamptz`, `inutilizacion_usuario_id uuid references usuarios(id)`. Mismo patron que `0032_cancelacion_resultado.sql`.

## 2. API

### 2.1 Tipos (`facturas.types.ts`)

- `DocumentoResponse` suma:
  - `corrige_a: DocumentoVinculo | null`: factura que corrige (solo `tipo = FACTURA` con `documento_relacionado_id`);
  - `corregida_por: DocumentoVinculo | null`: su correccion;
  - `inutilizacion: DocumentoInutilizacion | null`: `{ status, evento_id, motivo, rejection_code, rejection_message, intentos, last_at }`;
  - `puede_inutilizar?: boolean`, derivado en el service como `puede_reintentar_emision`.
- `DocumentoVinculo = { id, numero_fiscal, estado }`.
- `FacturaQueuedPersistInput` suma `documentoRelacionadoId?: string | null`.
- `FacturaRepository` suma `registrarInutilizacion(input)`.

### 2.2 Repositorio (`facturas.repository.ts`)

- `COLUMNAS_DOCUMENTO` suma las columnas `inutilizacion_*`; `mapFacturaRow` las convierte con `mapInutilizacion` (igual que `mapCancelacion`).
- Los vinculos no van en `COLUMNAS_DOCUMENTO` (se usa tambien en `returning`): metodo privado `findVinculos(ids)` con una consulta, como `findEmisores`. Devuelve, por id, la correccion (hija `tipo = FACTURA`, no borrada) y la corregida (padre de una `FACTURA` con `documento_relacionado_id`). Lo usan `toResponse` y `list`; `mapFacturaRow` recibe los vinculos como parametro opcional.
- `createQueuedEmission` inserta `documento_relacionado_id = $11`. Una violacion de `facturas_operativas_correccion_uidx` se traduce a `HttpError 409` (`CORRECCION_EXISTENTE`); la de idempotencia sigue como hoy.
- `registrarInutilizacion({ facturadorId, documentoId, usuarioId, status, eventoId, motivo, rejectionCode, rejectionMessage })`: `update` de las columnas, `intentos + 1`, `last_at = now()`, y `insert` en `audit_events` `FACTURA_NUMERO_INUTILIZADO` con numero, motivo, estado y evento, en una transaccion. Devuelve el documento.

### 2.3 Fase A en el service (`facturas.service.ts`)

- `facturaEmisionSchema` (`facturas.routes.ts`) = `facturaPreviewSchema.extend({ corrige_documento_id: z.string().uuid().nullable().optional() })`, usado solo en `POST /facturas`. La vista previa no cambia.
- `enqueueFacturaEmission`, antes de crear: si viene `corrige_documento_id`, `repository.findById` con el facturador del contexto; `409 CONFLICT` con `reason` `CORRECCION_NO_ADMITIDA` si no existe, no es `FACTURA`, no esta en `RECHAZADA` o `ERROR_OPERATIVO`, o ya tiene `corregida_por` (RN-A2). Pasa `documentoRelacionadoId` al repositorio. La respuesta por idempotencia existente se devuelve antes, como hoy.

### 2.4 Fase B en el service

- `facturas.inutilizacion.ts` (modulo nuevo, puro):
  - `leerNumeracionDelCdc(cdc)`: CDC de 44 digitos; devuelve `{ tipo, ruc, dv, establecimiento, punto, numero }` (posiciones del MT150: 1-2 tipo, 3-10 RUC, 11 DV, 12-14 establecimiento, 15-17 punto, 18-24 numero) o `null`.
  - `puedeInutilizar(documento)`: `tipo = FACTURA`, `estado = RECHAZADA`, `cdc` y `numero_fiscal` presentes, `inutilizacion?.status !== 'ACCEPTED'`.
  - `numeroComparable(numero_fiscal)`: ultimo grupo de digitos con 7 cifras (acepta `1010565` y `001-001-1010565`).
- `inutilizarNumeroFactura(context, documentoId, { motivo }, repository, sharedGateway)`:
  1. `getDocumentoById` (scoped al facturador). `409 INUTILIZACION_NO_ADMITIDA` si no `puedeInutilizar`.
  2. `leerNumeracionDelCdc`; `409` si es `null`, si `tipo !== '01'`, si `ruc-dv` no es `context.facturador.emisor_id` (comparado sin ceros a la izquierda) o si el numero no coincide con `numeroComparable(numero_fiscal)` (RN-B2).
  3. `sharedGateway.inutilizarNumeracion({ emisor_id, establecimiento, puntoExpedicion, desdeNumero: numero, hastaNumero: numero, motivo, tipoDocumento: 'FE' })`.
  4. Resultado (RN-B5): `VOIDED`/`ACCEPTED` → `ACCEPTED`; otro → `REJECTED` con `dCodRes`/`dMsgRes` buscados en `sifen` (`buscarCodigoSifen`, recorrido generico de la respuesta). `FiscalGatewayError` con `status 409` y `body.error = EVENT_ALREADY_EXISTS` → `ACCEPTED` con `details.event_id`. Otros `409` → `HttpError 409` con el mensaje simple y `fe_error`, sin registrar. Sin respuesta → registra `FAILED` y `HttpError 502/504`.
  5. `registrarInutilizacion` y devuelve `withAccion(documento)`.
- `withAccion` suma `puede_inutilizar: puedeInutilizar(documento)`.

### 2.5 Acciones (`facturas.accion.ts`)

- `DeriveAccionInput` suma `corregida_por` e `inutilizacion` (opcionales en el `Pick`).
- `AccionSugerida` suma `INUTILIZAR_NUMERO` (`sifen-causa-catalogo.ts`).
- En `case "RECHAZADA"` para `FACTURA`, despues de calcular la causa (RN-C2):
  - corregida e inutilizada → `OK`, "Factura rechazada resuelta", sin acciones;
  - inutilizada sin correccion → `OK`, "Numero inutilizado", acciones `[CORREGIR_REEMITIR]`;
  - corregida sin inutilizar → `REQUIERE_ACCION`, "Corregida por la factura N", acciones `[INUTILIZAR_NUMERO]`;
  - sin nada → como hoy, quitando `CORREGIR_REEMITIR` si ya hay correccion y sumando `INUTILIZAR_NUMERO` si `puedeInutilizar`. Si la categoria es `SOPORTE`, mantiene `CONTACTAR_SOPORTE` y `soporte_payload`.
- `ERROR_OPERATIVO` quita `CORREGIR_REEMITIR` si ya tiene correccion.

### 2.6 Gateway (`fiscal-gateway.*`)

- `FiscalGateway.inutilizarNumeracion(request: FiscalInutilizarNumeracionRequest): Promise<FiscalInutilizarNumeracionResponse>` (`{ event_id, status, sifen }`).
- Real: `POST ${baseUrl}/evento/inutilizacionnumfactura` con `buildHeaders()` (clave compartida), igual que `cancelFactura`. Errores: `FiscalGatewayError` con `{ status, body }`.
- Mock: guarda en memoria los numeros inutilizados por `emisor:establecimiento:punto:tipo:numero`. Motivo con `INUT-RECHAZO` → `{ status: 'REJECTED', sifen: { dCodRes: '4003', dMsgRes: 'Rango no habilitado (mock)' } }`; repetido → `409 EVENT_ALREADY_EXISTS` con `details.event_id`; si no, `VOIDED`.
- Los tres `FakeFiscalGateway` de los tests suman el metodo.

### 2.7 Ruta y contrato

- `POST /facturas/:documentoId/inutilizar`, `requireAuth`, cuerpo `{ motivo: string 5..150 }` (`.strict()` no: se ignora todo otro campo, RN-B2/CA-07). Usa `fiscalGateway` (clave compartida). `200 DocumentoResponse`.
- `spec/openapi.yaml`: la ruta nueva, `corrige_documento_id` en `FacturaEmisionRequest` (o el esquema que use `POST /facturas`), y en `DocumentoResponse` `corrige_a`, `corregida_por`, `inutilizacion`, `puede_inutilizar`; `INUTILIZAR_NUMERO` en el enum de `acciones_sugeridas`.

## 3. Pantalla (`apps/web-operacion/src/main.tsx`)

- Tipos: los campos nuevos de `DocumentoResponse` y `INUTILIZAR_NUMERO` en las acciones; `InvoiceInitialDraft.corrige_documento_id`.
- `borradorDeCorreccion` lleva `corrige_documento_id: documento.id`; `emitFactura` lo agrega al cuerpo del `POST /facturas` cuando existe (no a la vista previa).
- Detalle:
  - "Corregida por la factura N" y "Corrige a la factura N" como enlaces que abren ese documento con `openDetail` (`data-testid="vinculo-correccion"`);
  - boton "Inutilizar número" cuando `acciones_sugeridas` incluye `INUTILIZAR_NUMERO` (`data-testid="inutilizar-numero"`), que abre un dialogo con motivo (5 a 150, precargado "Factura rechazada por SIFEN") y la confirmacion de RN-B3; al responder actualiza `selected` y muestra el resultado;
  - estado de la inutilizacion (`data-testid="estado-inutilizacion"`): aceptada, rechazada con codigo, o sin respuesta;
  - `AVISO_INUTILIZACION` pasa a ser el aviso de RN-C3 y solo se muestra sin inutilizacion aceptada.
- `formatEstadoDocumento(documento)` suma los estados de RN-C1 para `RECHAZADA`: "🟠 Corregida, falta inutilizar", "⚪ Número inutilizado", "⚪ Resuelta". Es la funcion que usan el listado y el detalle.

## 4. Pruebas

- `tests/facturas.inutilizacion.test.ts`: `leerNumeracionDelCdc` (el CDC real de `1010565`, longitud o caracteres invalidos), `numeroComparable`, `puedeInutilizar`.
- `tests/facturas.service.test.ts`: correccion vinculada (CA-01, CA-02) e inutilizacion (CA-03 a CA-05, CA-07) con el repositorio y el gateway falsos.
- `tests/facturas.accion.test.ts`: los cuatro casos de RN-C2.
- `tests/fiscal-gateway.test.ts`: el mock (aceptada, rechazada, repetida).
- Playwright `scripts/playwright-correccion-inutilizacion.cjs` contra el stack de `bash scripts/deploy.sh` con `FE_GATEWAY_MODE=mock`, en 390 y 1280: los datos (una factura rechazada con CDC de estructura valida) los prepara un `UPDATE` sobre una factura emitida del mock, documentado en el guion.

## 5. Riesgos

- La clave compartida autoriza a cualquier emisor: FS nunca toma del operador emisor, establecimiento, punto ni numero (RN-B2), y el emisor sale del facturador del contexto. Cuando FE publique `EVENTO_INUTILIZAR`, se cambia a `resolveConsumerGateway`.
- El mock de emision genera CDC sin estructura de MT150: por eso los datos de Playwright se preparan con un `UPDATE`. No se cambia el mock de emision para no tocar pruebas existentes.
- `findVinculos` agrega una consulta por listado; usa el indice `facturas_operativas_documento_relacionado_idx` existente.
