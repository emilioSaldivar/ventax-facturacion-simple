# PLAN Recibo de Dinero v0.5

## Alineacion

- `AGENTS.md`
- `docs/SPEC_RECIBO_DINERO_v0.5.md`
- `docs/TASKS_RECIBO_DINERO_v0.5.md`
- `apps/api/src/modules/fiscal-gateway/*` (patron existente a extender, no forkear)
- `apps/api/src/modules/facturas/*` (referencia de patron: `facturas.service.ts:896-989` para el flujo sincrono `emitFacturaAgainstFiscalGateway`/`emitNotaCredito*`)

---

## Orden de ejecucion

```
1. DB — migracion aditiva (nuevas columnas + ANULADO, sin romper filas v0.1-v0.4)
2. fiscal-gateway — tipos nuevos (Fiscal*Recibo*)
3. fiscal-gateway — MockFiscalGateway (fixtures deterministicos)
4. fiscal-gateway — RealFiscalGateway (llamadas HTTP reales a /v1/recibos*)
5. recibos.types.ts — nuevo shape de ReciboRecord/Input/Patch
6. recibos.repository.ts — cache local (upsert desde respuesta fiscal, ya no INSERT/UPDATE de negocio)
7. recibos.service.ts — logica de negocio + idempotencia + mapeo de errores
8. recibos.routes.ts — endpoints nuevos (/xml, /anular) + Idempotency-Key header
9. verificacion.routes.ts (o modulo equivalente) — hibrido fiscal+cache para /verificar/recibo/:token
10. spec/openapi.yaml (propio) — actualizar contrato
11. QA — typecheck + build + tests (MockFiscalGateway; RealFiscalGateway no probado end-to-end, ver bloqueo SPEC seccion 2)
```

---

## Fase 1 — Migracion DB

### `db/migrations/0025_recibos_dinero_v05_fiscal.sql`

Aditiva, no destructiva. No se eliminan columnas viejas (`factura_id`, `factura_numero_display`) para no romper lectura de recibos ya creados bajo v0.1-v0.4; el codigo nuevo simplemente deja de escribirlas y usa las nuevas.

```sql
ALTER TYPE recibo_estado ADD VALUE 'ANULADO';

ALTER TABLE recibos_dinero
  ADD COLUMN moneda text NOT NULL DEFAULT 'PYG',
  ADD COLUMN referencia_documento_uuid uuid,
  ADD COLUMN referencia_documento_numero_display text,
  ADD COLUMN external_ref text,
  ADD COLUMN idempotency_key text,
  ADD COLUMN fiscal_request_snapshot jsonb,
  ADD COLUMN fiscal_response_snapshot jsonb,
  ADD COLUMN xml_hash text,
  ADD COLUMN pdf_hash text,
  ADD COLUMN anulacion_motivo text;

CREATE UNIQUE INDEX recibos_dinero_idempotency_uidx
  ON recibos_dinero (facturador_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX recibos_dinero_external_ref_uidx
  ON recibos_dinero (facturador_id, external_ref)
  WHERE external_ref IS NOT NULL AND deleted_at IS NULL;
```

Nota: `ALTER TYPE ... ADD VALUE` va como primera sentencia y no se usa el valor `'ANULADO'` en ninguna otra sentencia de esta misma migracion (restriccion de Postgres: un valor de enum agregado no puede usarse en la misma transaccion que lo agrego). El runner (`apps/api/src/db/migrations.ts:69,95`) envuelve cada archivo en `BEGIN`/`COMMIT`, por lo que esto es seguro tal como esta escrito.

La tabla `recibos_dinero_numeracion` **no se elimina** (queda huerfana/sin uso) — se documenta como deuda menor de limpieza, no se dropea en esta version para evitar riesgo en un cambio ya grande.

---

## Fase 2-4 — Extension de `fiscal-gateway`

### `apps/api/src/modules/fiscal-gateway/fiscal-gateway.types.ts`

Agregar (siguiendo el patron 1:1 de los tipos `Fiscal*Factura*` ya existentes):

```typescript
export type ReciboEstadoFiscal = "BORRADOR" | "EMITIDO" | "ANULADO";
export type ReciboPagadorDocumentoTipo = "RUC" | "CI" | "PASAPORTE" | "CEDULA_EXTRANJERA" | "NO_ESPECIFICADO" | null;
export type ReciboFormaPagoFiscal = "EFECTIVO" | "TRANSFERENCIA" | "CHEQUE" | "TARJETA_CREDITO" | "TARJETA_DEBITO" | "OTRO";

export interface FiscalCrearReciboRequest {
  emisor_id: string;
  fecha_cobro: string;
  pagador_nombre: string;
  pagador_documento_tipo?: ReciboPagadorDocumentoTipo;
  pagador_documento?: string | null;
  concepto: string;
  importe: number;
  moneda?: string;
  forma_pago?: ReciboFormaPagoFiscal;
  referencia_bancaria?: string | null;
  referencia_documento_uuid?: string | null;
  referencia_documento_numero_display?: string | null;
  client_reference: { idempotency_key: string };
}

export interface FiscalReciboResult {
  id: string;
  estado: ReciboEstadoFiscal;
  numero: string | null;
  verification_token: string | null;
  fecha_cobro: string;
  pagador_nombre: string;
  pagador_documento_tipo: ReciboPagadorDocumentoTipo;
  pagador_documento: string | null;
  concepto: string;
  importe: string;
  moneda: string;
  forma_pago: ReciboFormaPagoFiscal;
  referencia_bancaria: string | null;
  referencia_documento_numero_display: string | null;
  xml_hash: string | null;
  pdf_hash: string | null;
  anulacion_motivo: string | null;
  emitido_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  raw: Record<string, unknown>;
}

export interface FiscalEditarReciboRequest {
  reciboId: string;
  emisorId: string;
  patch: Partial<Omit<FiscalCrearReciboRequest, "emisor_id" | "client_reference">>;
}

export interface FiscalAnularReciboRequest {
  reciboId: string;
  emisorId: string;
  motivo: string;
}

export interface FiscalReciboVerificacionResult {
  valido: boolean;
  estado?: ReciboEstadoFiscal;
  fecha_emision?: string | null;
  firmado_en?: string | null;
  raw: Record<string, unknown>;
}
```

Agregar a la interfaz `FiscalGateway`:

```typescript
crearRecibo(request: FiscalCrearReciboRequest): Promise<FiscalReciboResult>;
editarRecibo(request: FiscalEditarReciboRequest): Promise<FiscalReciboResult>;
eliminarRecibo(input: { reciboId: string; emisorId: string }): Promise<void>;
emitirRecibo(input: { reciboId: string; emisorId: string }): Promise<FiscalReciboResult>;
anularRecibo(request: FiscalAnularReciboRequest): Promise<FiscalReciboResult>;
getReciboPdf(input: { reciboId: string; emisorId: string }): Promise<FiscalArtifactResponse>;
getReciboXml(input: { reciboId: string; emisorId: string }): Promise<FiscalArtifactResponse>;
verificarRecibo(token: string): Promise<FiscalReciboVerificacionResult>;
verificarReciboPdf(token: string): Promise<FiscalArtifactResponse>;
```

Reusar `FiscalArtifactResponse` y `FiscalGatewayError` ya existentes (sin cambios).

### `apps/api/src/modules/fiscal-gateway/fiscal-gateway.client.ts`

`RealFiscalGateway`: nuevos metodos siguiendo el mismo triplete request-builder/response-mapper/error-mapper que `emitFactura` (`:390-413`) y usando `fetchWithTimeout`/`buildHeaders` ya existentes:

- `crearRecibo` → `POST {baseUrl}/recibos`
- `editarRecibo` → `PATCH {baseUrl}/recibos/{id}`
- `eliminarRecibo` → `DELETE {baseUrl}/recibos/{id}`
- `emitirRecibo` → `POST {baseUrl}/recibos/{id}/emitir`
- `anularRecibo` → `POST {baseUrl}/recibos/{id}/anular`
- `getReciboPdf` → `GET {baseUrl}/recibos/{id}/pdf` (respuesta binaria, igual patron que `getKudePdf`)
- `getReciboXml` → `GET {baseUrl}/recibos/{id}/xml`
- `verificarRecibo` → `GET {baseUrl}/verificar/recibo/{token}` — **sin** `x-api-key` (endpoint publico segun seccion 16.8 de la guia)
- `verificarReciboPdf` → `GET {baseUrl}/verificar/recibo/{token}/pdf` — sin `x-api-key`

Mapeo de errores HTTP → `FiscalGatewayError`, reusando `mapFetchError`/logica ya presente para `408/504→TIMEOUT`, resto→`UPSTREAM_ERROR`; los codigos de negocio (`RECIBO_NOT_FOUND`, `RECIBO_NOT_EDITABLE`, etc.) viajan en `error.details` (body de la respuesta) para que `recibos.service.ts` los interprete (ver Fase 7, tabla de errores de la SPEC seccion 8).

`MockFiscalGateway`: fixtures deterministicos en memoria (mismo patron que el resto de mocks del archivo) — simular `BORRADOR→EMITIDO→ANULADO` con `numero` incremental fake y `verification_token`/`xml_hash`/`pdf_hash` generados con valores fijos o `crypto.randomUUID()`, para que los tests unitarios/integracion de `recibos.service.test.ts` corran sin red (dado el bloqueo de SPEC seccion 2, **este es el unico modo validable en esta iteracion**).

---

## Fase 5 — `recibos.types.ts`

Reemplazar el shape actual por el descrito en SPEC seccion 5. Cambios puntuales:

- `ReciboEstado`: agregar `'ANULADO'`.
- `ReciboRecord`: agregar `moneda`, `referencia_documento_uuid`, `referencia_documento_numero_display` (reemplazan en el tipo a `factura_id`/`factura_numero_display`, que se mantienen solo a nivel de columna DB para lectura de datos historicos, no en el tipo nuevo expuesto por la API — ver decision de compatibilidad en Fase 6), `external_ref`, `idempotency_key`, `xml_hash`, `pdf_hash`, `anulacion_motivo`.
- `ReciboCreateInput`: agregar `moneda?`, `referencia_documento_uuid?`, `referencia_documento_numero_display?` (reemplazan `factura_id?`/`factura_numero_display?` en el input publico).
- Nuevo `ReciboAnularInput { motivo: string }`.
- `RecibosRepository`: agregar `anular(id, facturadorId, motivo)`, `upsertFromFiscal(fiscalResult, extra)` (usado por el `service` tras cada llamada al gateway), quitar responsabilidad de numeracion/emision local de la interfaz (`emitir` ahora recibe el `FiscalReciboResult` ya resuelto, no genera nada por si mismo).

---

## Fase 6 — `recibos.repository.ts`

Deja de tener logica de negocio (numeracion, transiciones de estado) — pasa a ser un **cache/mirror**:

- `create/update/emitir/anular` dejan de construir el estado por si mismos: reciben el `FiscalReciboResult` ya obtenido del gateway (por el `service`) y hacen `INSERT ... ON CONFLICT (id) DO UPDATE` (upsert) con los campos planos + `fiscal_request_snapshot`/`fiscal_response_snapshot` (jsonb crudo), igual criterio que `facturas.repository.ts:createFromEmission`.
- `factura_id`/`factura_numero_display` (columnas viejas): se dejan de escribir; se mantiene un mapeo de **solo lectura** en `mapRow()` para que recibos historicos (creados antes de v0.5, que nunca tendran `referencia_documento_uuid`) sigan mostrando su referencia antigua sin romper (`referencia_documento_numero_display: row.referencia_documento_numero_display ?? row.factura_numero_display`).
- Se elimina toda referencia a `recibos_dinero_numeracion` (la tabla queda sin uso, ver Fase 1).

---

## Fase 7 — `recibos.service.ts`

Nuevas funciones, mismo patron que `facturas.service.ts:896-955` (`emitFacturaAgainstFiscalGateway`):

```typescript
export async function crearRecibo(
  context: OperationalContextResponse,
  input: ReciboCreateInput,
  repository: RecibosRepository,
  gateway: FiscalGateway,
  options: { idempotencyKey?: string } = {}
): Promise<ReciboRecord> {
  if (options.idempotencyKey) {
    const existing = await repository.findByIdempotencyKey(context.facturador.id, options.idempotencyKey);
    if (existing) return existing;
  }
  // validaciones de negocio ya existentes (pagador_nombre, concepto, importe > 0)
  // + si viene referencia_documento_uuid, resolver la factura propia y pasar su numero_fiscal
  const externalRef = buildReciboExternalRef(context.facturador.id, options.idempotencyKey);
  const fiscalRequest = buildFiscalCrearReciboRequest(context, input, externalRef);
  let fiscalResult: FiscalReciboResult;
  try {
    fiscalResult = await gateway.crearRecibo(fiscalRequest);
  } catch (error) {
    throw mapFiscalGatewayError(error, "crear el recibo");
  }
  return repository.upsertFromFiscal(fiscalResult, { facturadorId: context.facturador.id, externalRef, idempotencyKey: options.idempotencyKey, fiscalRequest });
}
```

Analogo para `editarRecibo`, `eliminarRecibo`, `emitirRecibo`, `anularRecibo` — cada uno: valida precondicion de negocio minima (ej. existe y pertenece al facturador — `404` propio antes de llamar al gateway, para no gastar una llamada fiscal en un id ajeno), llama al gateway, mapea error, actualiza cache local con `upsertFromFiscal`.

`mapFiscalGatewayError(error, accion)`: helper compartido que traduce `FiscalGatewayError` + el codigo de negocio embebido en `details` (`RECIBO_NOT_FOUND`, `RECIBO_NOT_EDITABLE`, etc., ver SPEC seccion 8) a `HttpError` con el status/code correctos. Este helper puede vivir en `recibos.service.ts` o extraerse a `shared/` si `facturas` quisiera reusarlo despues (no se extrae ahora, YAGNI — solo se implementa donde se necesita).

`buildReciboExternalRef`: mismo esquema que `buildExternalRef` de facturas (`sha256(`${facturadorId}:${idempotencyKey}`).slice(0,32)`), prefijado `rec_` en vez de `fac_`.

**Verificacion publica** (`verificarRecibo(token, repository, gateway)`): llama `gateway.verificarRecibo(token)`; si `valido`, busca el recibo en cache local por `verification_token` para adjuntar los datos comerciales (pagador/concepto/importe/forma_pago) segun la decision de SPEC seccion 7; si el cache local no tiene ese token (edge case: recibo emitido pero cache no sincronizado), responder solo con lo que da el backend fiscal sin romper.

---

## Fase 8 — `recibos.routes.ts`

- `POST /recibos`: agregar lectura de header `Idempotency-Key` (mismo parser/validacion que `facturas.routes.ts:480-499` — reusar esa funcion si es exportable, o duplicar la validacion minima si no).
- Nuevo: `GET /recibos/:reciboId/xml` (analogo a `/pdf`, solo si `estado` != `BORRADOR`; si `BORRADOR` → `404 XML_NOT_FOUND` segun contrato fiscal).
- Nuevo: `POST /recibos/:reciboId/anular`, body `{ motivo: string, max 500 }` validado con Zod.
- `GET /recibos/:reciboId/pdf`: deja de llamar a `buildReciboPdfHtml`/`htmlToPdfBuffer` — pasa a hacer streaming/passthrough de `gateway.getReciboPdf(...)`. **Se elimina el uso de `recibos.pdf.ts`** en este endpoint (archivo queda sin consumidores — eliminar o dejar como dead code marcado, decidir en TASKS si se borra en esta misma iteracion o se deja para limpieza posterior; recomendacion: borrarlo, ya que mantener codigo muerto que genera un PDF "no fiscal" que ya no se usa es confuso y contradice la regla de dominio).

---

## Fase 9 — Verificacion publica

`verificacion.routes.ts` (o el modulo que sirva `GET /verificar/recibo/:token`): reemplazar la logica actual (`findByVerificationToken` puramente local) por la funcion hibrida de Fase 7. `GET /verificar/recibo/:token/pdf`: passthrough a `gateway.verificarReciboPdf(token)`.

---

## Fase 10 — `spec/openapi.yaml` (propio)

- `ReciboRecord`/`ReciboCreateRequest`/`ReciboUpdateRequest`: agregar `moneda`, `referencia_documento_uuid`, `referencia_documento_numero_display`, `xml_hash`, `pdf_hash`, `anulacion_motivo`; marcar `factura_id`/`factura_numero_display` como `deprecated: true` (se mantienen en el schema de respuesta por compatibilidad de lectura de recibos historicos, pero ya no se aceptan en el request de creacion).
- `ReciboEstado`: agregar `ANULADO` al enum.
- Nuevo path `GET /recibos/{reciboId}/xml`.
- Nuevo path `POST /recibos/{reciboId}/anular` con `ReciboAnularRequest { motivo }`.

---

## Fase 11 — QA

- `npm run typecheck --workspace=@facturacion-simple/api`
- `npm run build --workspace=@facturacion-simple/api`
- `npx vitest run tests/recibos.service.test.ts` (nuevo/actualizado, usando `MockFiscalGateway` — cubrir: crear con idempotency-key repetida devuelve el mismo recibo sin llamar al gateway dos veces; emitir asigna numero/verification_token/hashes; editar sobre EMITIDO → 409; anular sobre EMITIDO → nuevo estado ANULADO con motivo; anular sobre BORRADOR → 409; verificacion publica combina estado fiscal + datos comerciales de cache)
- **No se ejecuta** `bash scripts/deploy.sh` ni validacion Playwright/E2E contra `fe-test` en esta iteracion — bloqueado por SPEC seccion 2 (`/v1/recibos` no desplegado). Se documenta como `PENDING`/bloqueado en TASKS hasta que el backend fiscal lo publique.

---

## Fase 12 — Correccion post-deploy: resolver clave por-facturador (2026-07-24)

Al validar en staging se encontro que `recibos.routes.ts` llamaba siempre al singleton `fiscalGateway` (clave global `env.FE_API_KEY`), ignorando `facturadores.fe_consumer_api_key` — la clave especifica que cada facturador tiene registrada en `facturacion-electronica`. `facturas` no tiene este problema porque su unico camino de emision real es el outbox worker, que ya resuelve `gatewayWithKey(pending.facturadorApiKey)` (`server.ts:22`, `facturas.repository.ts:778,792`); `recibos` en cambio llama al gateway de forma sincrona en cada operacion (crear/editar/eliminar/emitir/anular/pdf/xml) y nunca pasaba por ese mecanismo.

Correccion aplicada en `recibos.routes.ts`:
- Nuevo metodo `RecibosRepository.getFacturadorApiKey(facturadorId)` → `SELECT fe_consumer_api_key FROM facturadores WHERE id = $1`.
- Nueva funcion `resolveGateway(facturadorId)`: si el facturador tiene `fe_consumer_api_key`, construye un gateway con `createFiscalGateway({ ...buildFiscalGatewayConfig(env), apiKey })`; si no, usa el singleton `fiscalGateway` (clave global) como fallback.
- Los 8 call-sites que antes pasaban el singleton `fiscalGateway` directamente ahora pasan `await resolveGateway(context.facturador.id)`.

No se toco `facturas` ni el patron de outbox — el fix es local a `recibos`.

---

## Archivos modificados/creados

| Archivo | Tipo de cambio |
|---|---|
| `db/migrations/0025_recibos_dinero_v05_fiscal.sql` | nuevo |
| `apps/api/src/modules/fiscal-gateway/fiscal-gateway.types.ts` | modificar |
| `apps/api/src/modules/fiscal-gateway/fiscal-gateway.client.ts` | modificar |
| `apps/api/src/modules/recibos/recibos.types.ts` | modificar |
| `apps/api/src/modules/recibos/recibos.repository.ts` | modificar |
| `apps/api/src/modules/recibos/recibos.service.ts` | modificar |
| `apps/api/src/modules/recibos/recibos.routes.ts` | modificar |
| `apps/api/src/modules/recibos/recibos.pdf.ts` | eliminar (ver Fase 8) |
| `apps/api/src/modules/verificacion/verificacion.routes.ts` (o equivalente) | modificar |
| `apps/api/tests/recibos.service.test.ts` | nuevo/modificar |
| `spec/openapi.yaml` | modificar |
