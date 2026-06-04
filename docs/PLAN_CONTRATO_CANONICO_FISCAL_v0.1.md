# PLAN — Contrato Canónico Fiscal v0.1

## Referencias

- `AGENTS.md`
- `docs/SPEC_CONTRATO_CANONICO_FISCAL_v0.1.md`
- `docs/API_FACTURACION_ELECTRONICA/facturacion-electronica-consumer-docs/OPERACION_CONTRATO_CANONICO_v0.1.md`
- `docs/API_FACTURACION_ELECTRONICA/facturacion-electronica-consumer-docs/openapi.yaml`
- `apps/api/src/modules/fiscal-gateway/fiscal-gateway.types.ts`
- `apps/api/src/modules/fiscal-gateway/fiscal-gateway.client.ts`
- `apps/api/src/modules/facturas/facturas.types.ts`
- `apps/api/src/modules/facturas/facturas.repository.ts`
- `apps/api/src/modules/facturas/facturas.service.ts`
- `apps/api/src/modules/entrega/entrega.types.ts`
- `apps/api/src/modules/entrega/entrega.repository.ts`
- `apps/api/src/modules/entrega/entrega.service.ts`

---

## Enfoque

Implementar la migración en **cinco fases lineales** con orden elegido para mantener el sistema compilable y los tests verdes en cada paso:

1. **Fase 0 — Backfill pre-deploy**: script SQL y verificación de cobertura antes de cualquier deploy.
2. **Fase 1 — Schema + tipos**: cambios aditivos, sin romper nada en tiempo de compilación.
3. **Fase 2 — Gateway**: nuevos métodos canónicos y actualización de firmas (real + mock + tests).
4. **Fase 3 — Repositorios**: persistencia y lectura de `document_uuid` en facturas y entrega.
5. **Fase 4 — Servicios**: migración de guards, argumentos y lógica de negocio (RN-03, RN-05, RN-07).

Cada fase cierra con `npm run typecheck` y `npm run test` verdes antes de pasar a la siguiente.

---

## Fase 0 — Backfill pre-deploy

### Objetivo

Garantizar que todos los registros en `facturas_operativas` con `cdc` tengan `document_uuid` antes de que el nuevo código llegue a staging o producción. Aplica RN-06 y RN-07 del SPEC.

### Script a crear: `scripts/backfill_document_uuid.sql`

```sql
-- Requiere: CSV exportado del backend fiscal
-- Columnas requeridas del CSV: cdc, document_uuid

BEGIN;

CREATE TEMP TABLE _uuid_backfill (
  cdc           TEXT PRIMARY KEY,
  document_uuid TEXT NOT NULL
);

-- Cargar el CSV antes de ejecutar este bloque:
-- \COPY _uuid_backfill (cdc, document_uuid) FROM 'backfill.csv' CSV HEADER;

UPDATE facturas_operativas fo
SET
  document_uuid = b.document_uuid,
  updated_at    = now()
FROM _uuid_backfill b
WHERE fo.cdc = b.cdc
  AND fo.document_uuid IS NULL;

-- Verificación de cobertura — debe arrojar sin_uuid_con_cdc = 0
SELECT
  COUNT(*)                                                             AS total,
  COUNT(*) FILTER (WHERE document_uuid IS NOT NULL)                   AS con_uuid,
  COUNT(*) FILTER (WHERE document_uuid IS NULL AND cdc IS NOT NULL)   AS sin_uuid_con_cdc
FROM facturas_operativas
WHERE deleted_at IS NULL;

COMMIT;
```

El CSV se obtiene del backend fiscal con:
```sql
SELECT cdc, document_uuid
FROM de_documents
WHERE cdc IS NOT NULL
  AND document_uuid IS NOT NULL
ORDER BY created_at;
```

### Criterio de aprobación de Fase 0

`sin_uuid_con_cdc = 0` en el ambiente objetivo antes de continuar con el deploy. Si hay registros sin cubrir, investigar antes de deployar.

---

## Fase 1 — Schema + Tipos

### 1A — Migración de schema

**Nuevo archivo:** `db/migrations/0015_document_uuid.sql`

```sql
ALTER TABLE facturas_operativas
  ADD COLUMN document_uuid TEXT;

CREATE INDEX facturas_operativas_document_uuid_idx
  ON facturas_operativas (facturador_id, document_uuid)
  WHERE document_uuid IS NOT NULL AND deleted_at IS NULL;
```

La columna es nullable. No requiere backfill previo para el `ALTER`. El deploy de schema y el backfill son operaciones independientes: el `ALTER` puede correr en cualquier momento; el backfill SQL corre una vez que la columna existe.

### 1B — Tipos del gateway (`fiscal-gateway.types.ts`)

Todos los cambios son **aditivos**. No se elimina ni modifica ningún campo existente en esta fase.

**Agregar `document_uuid` a la respuesta de emisión:**
```typescript
export interface FiscalEmitFacturaResponse {
  fiscal_document_id: string | null;
  document_uuid: string | null;       // NUEVO
  cdc: string | null;
  // resto sin cambio
}
// FiscalEmitNotaCreditoResponse = FiscalEmitFacturaResponse (alias) → se actualiza automáticamente
```

**Agregar campos canónicos al item de lista fiscal:**
```typescript
export interface FiscalFacturalistaItem {
  document_id: string | null;
  document_uuid: string | null;       // NUEVO
  cdc: string | null;
  current_cdc: string | null;         // NUEVO
  // resto sin cambio
}
```

**Nuevo tipo para `by-cdc`:**
```typescript
export interface FiscalByCdcResponse {
  document_uuid: string;
  requested_cdc: string;
  current_cdc: string;
  is_current: boolean;
  lineage_status: "ACTIVE" | "SUPERSEDED" | "INCONSISTENT";
  sifen_resolution?: "APPROVED" | "APPROVED_WITH_OBS" | "REJECTED_OR_MISSING" | "PENDING_CHECK";
  resolution_note?: string | null;
}
```

**Actualizar `FiscalRefreshStatusResponse` para exponer `current_cdc`:**
```typescript
export interface FiscalRefreshStatusResponse {
  estado: "EMITIDA" | "PENDIENTE_SIFEN" | "RECHAZADA" | "ANULADA";
  current_cdc: string | null;         // NUEVO — para detectar divergencia (RN-03)
  raw: Record<string, unknown>;
}
```

**Actualizar `FiscalRefreshStatusRequest` para recibir `documentUuid`:**
```typescript
export interface FiscalRefreshStatusRequest {
  documentUuid: string;               // CAMBIA — antes era { cdc: string }
}
```

**Actualizar firmas en `FiscalGateway` interface:**
```typescript
export interface FiscalGateway {
  // Firmas que cambian
  getXml(documentUuid: string): Promise<FiscalArtifactResponse>;
  getKudePdf(documentUuid: string): Promise<FiscalArtifactResponse>;
  getDocumentoEventos(documentUuid: string): Promise<FiscalDocumentoEventosResponse>;
  refreshFacturaStatus(request: FiscalRefreshStatusRequest): Promise<FiscalRefreshStatusResponse>;

  // Nuevo método
  resolveDocumentoByCdc(cdc: string): Promise<FiscalByCdcResponse>;

  // Sin cambio
  health(): Promise<FiscalGatewayHealth>;
  emitFactura(request: FiscalEmitFacturaRequest): Promise<FiscalEmitFacturaResponse>;
  emitNotaCredito(request: FiscalEmitNotaCreditoRequest): Promise<FiscalEmitNotaCreditoResponse>;
  cancelFactura(request: FiscalCancelFacturaRequest): Promise<FiscalCancelFacturaResponse>;
  getDocumentoDecisionByDocumentId(...): Promise<FiscalDocumentoDecisionResponse>;
  validateDocumentoCdcImpactByDocumentId(...): Promise<FiscalDocumentoValidateCdcImpactResponse>;
  retryDocumentoSameCdcByDocumentId(...): Promise<FiscalDocumentoResendResponse>;
  createDocumentoDerivedByDocumentId(...): Promise<FiscalDocumentoCreateDerivedResponse>;
  cancelDocumentoSendByDocumentId(...): Promise<FiscalDocumentoCancelSendResponse>;
  voidDocumentoNumberByDocumentId(...): Promise<FiscalDocumentoVoidResponse>;
  getBatchPendientesByEmisor(...): Promise<FiscalBatchPendientesResponse>;
  getFacturalistaByEmisor(...): Promise<FiscalFacturalistaResponse>;
}
```

### 1C — Tipos operativos (`facturas.types.ts`)

**Agregar `document_uuid` a `DocumentoResponse`:**
```typescript
export interface DocumentoResponse {
  id: string;
  document_uuid: string | null;       // NUEVO
  tipo: DocumentoTipo;
  // resto sin cambio
}
```

**Actualizar `FacturaRepository` — nuevos métodos necesarios:**
```typescript
export interface FacturaRepository {
  // Método nuevo — actualización de document_uuid en bulk para reconciliación (RN-05)
  bulkUpdateDocumentUuidByCdc(
    items: Array<{ cdc: string; documentUuid: string }>
  ): Promise<void>;

  // Método existente — agregar cdc opcional para actualización (RN-03)
  updateFiscalStatus(input: {
    facturadorId: string;
    documentoId: string;
    estado: DocumentoEstado;
    fiscalStatus: Record<string, unknown>;
    cdc?: string | null;             // NUEVO — para actualizar cuando current_cdc difiere
  }): Promise<DocumentoResponse | null>;

  // Resto sin cambio
}
```

### 1D — Tipos de entrega (`entrega.types.ts`)

**Agregar `document_uuid` a `PublicDocumentRecord`:**
```typescript
export interface PublicDocumentRecord {
  token: string;
  facturador: FacturadorSummary;
  documento: {
    id: string;
    document_uuid: string | null;    // NUEVO
    estado: DocumentoEstado;
    numero_fiscal: string | null;
    cdc: string | null;
    // resto sin cambio
  };
}
// PublicDocumentResponse no cambia — document_uuid no se expone al frontend (RN, decisión R4)
```

**Checkpoint Fase 1:** `npm run typecheck` — el compilador reportará todos los call sites que deben actualizarse en Fases 2-4.

---

## Fase 2 — Gateway (RealFiscalGateway + MockFiscalGateway)

### 2A — `mapFiscalEmitResponse` — extraer `document_uuid`

En `RealFiscalGateway`:
```typescript
function mapFiscalEmitResponse(body: unknown): FiscalEmitFacturaResponse {
  // ...
  return {
    fiscal_document_id: stringOrNull(data.document_id),
    document_uuid: stringOrNull(data.document_uuid),   // NUEVO
    cdc: stringOrNull(data.cdc),
    // resto igual
  };
}
```

Igual para `mapFiscalNotaCreditoResponse`.

### 2B — Métodos canónicos en `RealFiscalGateway`

**`getXml(documentUuid)`** → `GET /documentos/{uuid}/files/xml`
```typescript
async getXml(documentUuid: string): Promise<FiscalArtifactResponse> {
  return this.fetchArtifact(
    `${this.config.baseUrl}/documentos/${encodeURIComponent(documentUuid)}/files/xml`,
    "application/xml",
    `${documentUuid}.xml`
  );
}
```

**`getKudePdf(documentUuid)`** → `GET /documentos/{uuid}/files/kude.pdf`
```typescript
async getKudePdf(documentUuid: string): Promise<FiscalArtifactResponse> {
  return this.fetchArtifact(
    `${this.config.baseUrl}/documentos/${encodeURIComponent(documentUuid)}/files/kude.pdf`,
    "application/pdf",
    `${documentUuid}.pdf`
  );
}
```

**`getDocumentoEventos(documentUuid)`** → `GET /documentos/{uuid}/eventos`
```typescript
async getDocumentoEventos(documentUuid: string): Promise<FiscalDocumentoEventosResponse> {
  const url = new URL(`${this.config.baseUrl}/documentos/${encodeURIComponent(documentUuid)}/eventos`);
  url.searchParams.set("env", this.config.environment);
  // ... fetch + mapeo igual al actual
}
```

**`refreshFacturaStatus({documentUuid})`** → `GET /documentos/{uuid}/sifen`

La respuesta del endpoint canónico incluye `current_cdc`. El mapper debe extraerlo:
```typescript
async refreshFacturaStatus(request: FiscalRefreshStatusRequest): Promise<FiscalRefreshStatusResponse> {
  const url = new URL(
    `${this.config.baseUrl}/documentos/${encodeURIComponent(request.documentUuid)}/sifen`
  );
  url.searchParams.set("env", this.config.environment);
  url.searchParams.set("refresh", "true");
  // ...
  return mapFiscalRefreshStatusCanonicoResponse(body);
}

function mapFiscalRefreshStatusCanonicoResponse(body: unknown): FiscalRefreshStatusResponse {
  // ...
  return {
    estado: mapRefreshDocumentStatusWithCode(status, fiscalCode),
    current_cdc: stringOrNull(data.current_cdc),       // NUEVO
    raw: data
  };
}
```

**`resolveDocumentoByCdc(cdc)`** → `GET /documentos/by-cdc/{cdc}`
```typescript
async resolveDocumentoByCdc(cdc: string): Promise<FiscalByCdcResponse> {
  const url = new URL(`${this.config.baseUrl}/documentos/by-cdc/${encodeURIComponent(cdc)}`);
  url.searchParams.set("env", this.config.environment);
  const response = await this.fetchWithTimeout(url.toString(), {
    method: "GET",
    headers: this.buildHeaders()
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new FiscalGatewayError("UPSTREAM_ERROR", "No se pudo resolver CDC a documento canonico.", { status: response.status, body });
  }
  return mapFiscalByCdcResponse(body);
}
```

**`mapFiscalFacturalistaResponse`** — agregar `document_uuid` y `current_cdc`:
```typescript
items: items.map((item) => ({
  document_id: stringOrNull(row.document_id),
  document_uuid: stringOrNull(row.document_uuid),      // NUEVO
  cdc: stringOrNull(row.cdc),
  current_cdc: stringOrNull(row.current_cdc),          // NUEVO
  // resto igual
}))
```

### 2C — `MockFiscalGateway` — actualizar para paridad con interfaz

- `emitFactura`: generar `document_uuid` mock derivado de `external_ref` (mismo hash, formato UUID v4 simulado).
- `emitNotaCredito`: ídem.
- `getXml(documentUuid)`: devolver XML mock con `documentUuid` en el tag.
- `getKudePdf(documentUuid)`: devolver buffer mock.
- `getDocumentoEventos(documentUuid)`: devolver `events: []`.
- `refreshFacturaStatus({documentUuid})`: devolver `{ estado: "EMITIDA", current_cdc: null, raw: {...} }`.
- `resolveDocumentoByCdc(cdc)`: devolver respuesta mock con `document_uuid` generado del cdc.

### 2D — Tests de gateway (`apps/api/tests/fiscal-gateway.test.ts`)

- Verificar que `mapFiscalEmitResponse` extrae `document_uuid` correctamente.
- Verificar que `mapFiscalRefreshStatusCanonicoResponse` extrae `current_cdc`.
- Verificar que `resolveDocumentoByCdc` maneja el caso CDC histórico (`is_current: false`).
- Verificar que el mock cumple la interfaz completa.

**Checkpoint Fase 2:** `npm run typecheck` + `npm run test --filter=fiscal-gateway` verdes.

---

## Fase 3 — Repositorios

### 3A — `facturas.repository.ts`

**`FacturaRow` interface:**
```typescript
interface FacturaRow {
  // ...
  document_uuid: string | null;      // NUEVO
}
```

**Todos los `SELECT`** — agregar `document_uuid` a la lista de columnas:
```sql
document_uuid,   -- NUEVO en findById, findByIdempotencyKey, findNotaCreditoByOriginal, list
```

**`createFromEmission`** — agregar `document_uuid` al `INSERT` y `RETURNING`:
```sql
INSERT INTO facturas_operativas (
  ..., document_uuid   -- NUEVO
) VALUES (
  ..., $16             -- NUEVO: input.fiscalResponse?.document_uuid ?? null
)
RETURNING ..., document_uuid
```

**`createNotaCreditoFromFactura`** — ídem.

**`completePendingEmission`** — agregar `document_uuid` al `UPDATE` y `RETURNING`:
```sql
UPDATE facturas_operativas SET
  ...,
  document_uuid = COALESCE(document_uuid, $7),  -- NUEVO: solo actualiza si aún es null
WHERE id = $1
RETURNING ..., document_uuid
```

Se usa `COALESCE` para no sobreescribir un UUID ya válido ante respuestas de reintento sin UUID.

**`updateFiscalStatus`** — agregar actualización opcional de `cdc`:

La query debe incluir `cdc = COALESCE($5, cdc)` cuando se pase el parámetro. Diseño:
```typescript
async updateFiscalStatus(input: {
  facturadorId: string;
  documentoId: string;
  estado: DocumentoEstado;
  fiscalStatus: Record<string, unknown>;
  cdc?: string | null;
}): Promise<DocumentoResponse | null> {
  const result = await pool.query(
    `UPDATE facturas_operativas
     SET
       estado = $3,
       fiscal_response_snapshot = $4::jsonb,
       cdc = COALESCE($5, cdc),               -- NUEVO: actualiza si se pasa valor
       updated_at = now()
     WHERE facturador_id = $1
       AND id = $2
       AND deleted_at is null
     RETURNING ..., document_uuid`,
    [input.facturadorId, input.documentoId, input.estado,
     JSON.stringify(input.fiscalStatus), input.cdc ?? null]
  );
  // ...
}
```

**`bulkUpdateDocumentUuidByCdc`** — nuevo método para RN-05:
```typescript
async bulkUpdateDocumentUuidByCdc(
  items: Array<{ cdc: string; documentUuid: string }>
): Promise<void> {
  if (items.length === 0) return;

  // Construir VALUES ($1,$2), ($3,$4), ...
  const values: unknown[] = [];
  const placeholders = items.map((item, i) => {
    values.push(item.cdc, item.documentUuid);
    return `($${i * 2 + 1}, $${i * 2 + 2})`;
  });

  await pool.query(
    `UPDATE facturas_operativas fo
     SET document_uuid = v.document_uuid, updated_at = now()
     FROM (VALUES ${placeholders.join(", ")}) AS v(cdc, document_uuid)
     WHERE fo.cdc = v.cdc
       AND fo.document_uuid IS NULL
       AND fo.deleted_at IS NULL`,
    values
  );
}
```

**`mapFacturaRow`** — mapear `document_uuid`:
```typescript
function mapFacturaRow(row: FacturaRow, items: FacturaItemPreview[]): DocumentoResponse {
  return {
    id: row.id,
    document_uuid: row.document_uuid,   // NUEVO
    // resto igual
  };
}
```

### 3B — `entrega.repository.ts`

**`PublicDocumentRow`:**
```typescript
interface PublicDocumentRow {
  // ...
  document_uuid: string | null;      // NUEVO
}
```

**`findPublicByToken` SELECT** — agregar `fo.document_uuid`:
```sql
SELECT
  ...,
  fo.document_uuid   -- NUEVO
FROM documento_links_publicos dlp
JOIN facturas_operativas fo ON fo.id = dlp.factura_operativa_id
-- ...
```

**`mapPublicRow`** — mapear `document_uuid` en `documento`:
```typescript
documento: {
  id: row.documento_id,
  document_uuid: row.document_uuid,  // NUEVO
  // resto igual
}
```

**Checkpoint Fase 3:** `npm run typecheck` + `npm run test` verdes. El compilador guiará todos los call sites rotos.

---

## Fase 4 — Servicios

### 4A — `facturas.service.ts` — `refreshDocumentoStatus`

Antes:
```typescript
if (!documento.cdc) throw new HttpError(409, "CONFLICT", "Documento sin CDC...");
const refreshed = await gateway.refreshFacturaStatus({ cdc: documento.cdc });
await repository.updateFiscalStatus({ ..., estado: refreshed.estado, fiscalStatus: ... });
```

Después:
```typescript
if (!documento.document_uuid) {
  throw new HttpError(409, "CONFLICT", "Documento sin identidad fiscal canonica. Requiere sincronizacion.");
}
const refreshed = await gateway.refreshFacturaStatus({ documentUuid: documento.document_uuid });

// RN-03: actualizar cdc si el backend devuelve un current_cdc diferente
const cdcActualizado =
  refreshed.current_cdc && refreshed.current_cdc !== documento.cdc
    ? refreshed.current_cdc
    : undefined;

await repository.updateFiscalStatus({
  facturadorId: context.facturador.id,
  documentoId,
  estado: refreshed.estado,
  fiscalStatus: mergeFiscalStatus(documento.fiscal_status, refreshed.raw),
  cdc: cdcActualizado        // undefined si no cambió → COALESCE no altera el valor
});
```

### 4B — `facturas.service.ts` — `getDocumentoEventos`

Antes:
```typescript
if (!documento.cdc) throw ...;
const response = await gateway.getDocumentoEventos(documento.cdc);
```

Después:
```typescript
if (!documento.document_uuid) {
  throw new HttpError(409, "CONFLICT", "Documento sin identidad fiscal canonica. Requiere sincronizacion.");
}
const response = await gateway.getDocumentoEventos(documento.document_uuid);
```

### 4C — `facturas.service.ts` — `getReconciliacionFiscal` (RN-05)

Agregar `repository: FacturaRepository` como parámetro. Después de obtener la respuesta del facturalista, hacer la actualización oportunista:

```typescript
export async function getReconciliacionFiscal(
  context: OperationalContextResponse,
  input: { offset: number; limit: number; q?: string },
  gateway: FiscalGateway,
  repository: FacturaRepository          // NUEVO parámetro
): Promise<ReconciliacionFiscalResponse> {
  // ...
  const response = await gateway.getFacturalistaByEmisor({ ... });

  // RN-05: actualización oportunista de document_uuid
  const itemsConUuid = response.items.filter(
    (item) => item.document_uuid && item.cdc
  ) as Array<{ cdc: string; document_uuid: string }>;

  if (itemsConUuid.length > 0) {
    await repository.bulkUpdateDocumentUuidByCdc(
      itemsConUuid.map((item) => ({
        cdc: item.cdc,
        documentUuid: item.document_uuid
      }))
    ).catch(() => {
      // No bloquear la respuesta ante fallo de actualización oportunista
    });
  }

  return { items: response.items, next: response.next };
}
```

El `.catch(() => {})` garantiza que un fallo en la actualización oportunista no bloquea la respuesta de reconciliación al usuario. El error se puede loguear opcionalmente.

**Actualizar el call site** de `getReconciliacionFiscal` en las rutas para pasar el repositorio.

### 4D — `entrega.service.ts` — `getPublicArtifact`

```typescript
export async function getPublicArtifact(
  token: string,
  artifact: "kude_pdf" | "xml",
  repository: DeliveryLinkRepository,
  gateway: FiscalGateway,
  observability?: { requestId?: string; endpoint?: string }
): Promise<FiscalArtifactResponse> {
  const record = await repository.findPublicByToken(token);

  if (!record || !record.documento.document_uuid) {
    throw new HttpError(404, "NOT_FOUND", "Artefacto publico no disponible.");
  }

  try {
    return artifact === "kude_pdf"
      ? await gateway.getKudePdf(record.documento.document_uuid)
      : await gateway.getXml(record.documento.document_uuid);
  } catch (error) {
    // manejo de error igual al actual, cambiando cdc → document_uuid en el log
  }
}
```

**Decisión de diseño:** El guard unifica `document_uuid` como única condición. No hay fallback a `cdc`. Esto es seguro porque la Fase 0 garantiza que todos los documentos con `cdc` tienen `document_uuid` antes del deploy.

**Checkpoint Fase 4:** `npm run typecheck` + `npm run test` + `npm run build` verdes.

---

## Fase 5 — Validación Final

### Validación técnica

```bash
npm run typecheck --workspace @facturacion-simple/api
npm run test --workspace @facturacion-simple/api
npm run lint --workspace @facturacion-simple/api
npm run build
bash scripts/deploy.sh
```

### Validación funcional sobre contenedores

Con `bash scripts/deploy.sh` corriendo:

1. **Emisión SYNC** — emitir una factura en modo mock; verificar que `document_uuid` queda en DB.
2. **Emisión BATCH (outbox)** — encolar y procesar; verificar que `document_uuid` queda en DB después del worker.
3. **Link público** — generar token de entrega y acceder a `/p/{token}/kude.pdf` y `/p/{token}/xml`; verificar respuesta 200.
4. **Refresh de estado** — llamar el endpoint de refresh sobre el documento emitido; verificar que no hay error y que el estado se actualiza.
5. **Cobertura post-backfill** — ejecutar la consulta de verificación del script y confirmar `sin_uuid_con_cdc = 0`.

### Validación Playwright

- Flujo completo: emisión desde la UI → descarga de PDF desde link compartido (mobile viewport 390px).
- Verificar que el link de descarga funciona sin errores 404.
- Viewport adicional: tablet 768px.

---

## Orden de Ejecución Completo

```
Fase 0 (antes del deploy)
  └─ Ejecutar backfill SQL en staging
  └─ Verificar sin_uuid_con_cdc = 0
  └─ Confirmar aprobación → continuar

Fase 1 (una PR o rama única)
  1A. db/migrations/0015_document_uuid.sql
  1B. fiscal-gateway.types.ts (tipos aditivos)
  1C. facturas.types.ts (tipos aditivos)
  1D. entrega.types.ts (tipos aditivos)
  └─ checkpoint: typecheck verde (con errores esperados en call sites → guía Fases 2-4)

Fase 2 (misma rama)
  2A. fiscal-gateway.client.ts — mappers de emisión
  2B. fiscal-gateway.client.ts — métodos canónicos RealFiscalGateway
  2C. fiscal-gateway.client.ts — MockFiscalGateway actualizado
  2D. tests/fiscal-gateway.test.ts — tests nuevos y actualizados
  └─ checkpoint: typecheck + test gateway verde

Fase 3 (misma rama)
  3A. facturas.repository.ts — INSERT/UPDATE/SELECT/mapRow/bulkUpdate
  3B. entrega.repository.ts — SELECT + mapRow
  └─ checkpoint: typecheck + test verde

Fase 4 (misma rama)
  4A. facturas.service.ts — refreshDocumentoStatus
  4B. facturas.service.ts — getDocumentoEventos
  4C. facturas.service.ts — getReconciliacionFiscal + call site en routes
  4D. entrega.service.ts — getPublicArtifact
  └─ checkpoint: typecheck + test + build verde

Fase 5 (antes de merge)
  Validación funcional sobre contenedores
  Validación Playwright
  Revisión final de evidencias

Fase 0 bis (antes del deploy a producción)
  └─ Repetir backfill SQL en producción
  └─ Verificar sin_uuid_con_cdc = 0
  └─ Deploy a producción
```

---

## Riesgos y Mitigaciones

| Riesgo | Mitigación |
|---|---|
| Registros sin `document_uuid` en producción al momento del deploy | Fase 0 obligatoria con verificación de cobertura antes de merge y antes de deploy a producción |
| `bulkUpdateDocumentUuidByCdc` actualiza un cdc incorrecto | La query tiene `AND fo.document_uuid IS NULL` — solo actualiza nulls. Si el cdc fue reconciliado, la columna `cdc` ya tiene el valor correcto del backfill |
| `completePendingEmission` sobreescribe un UUID válido con null | `SET document_uuid = COALESCE(document_uuid, $7)` — nunca sobreescribe un UUID ya válido |
| El endpoint `/documentos/{uuid}/sifen` no devuelve `current_cdc` en todos los estados | `stringOrNull(data.current_cdc)` devuelve null → `cdcActualizado` queda `undefined` → `COALESCE` no altera el valor almacenado |
| El `.catch` en `getReconciliacionFiscal` silencia errores reales | El catch es solo para el update oportunista, no para la consulta al gateway. El error del gateway sigue propagándose normalmente |

---

## Validación

Por tarea implementada:

- `npm run typecheck --workspace @facturacion-simple/api`
- `npm run test --workspace @facturacion-simple/api`
- `npm run lint --workspace @facturacion-simple/api`
- `npm run build`
- `bash scripts/deploy.sh` para validación sobre contenedores
- Playwright: flujo emisión + link público en mobile 390px y tablet 768px
- Evidencia en `docs/TASKS_CONTRATO_CANONICO_FISCAL_v0.1.md`
