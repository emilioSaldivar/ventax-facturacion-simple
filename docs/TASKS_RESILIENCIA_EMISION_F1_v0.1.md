# TASKS_RESILIENCIA_EMISION_F1_v0.1

**Versión:** 0.1
**Fecha:** 2026-06-07
**Estado:** PENDING
**SPEC:** SPEC_RESILIENCIA_EMISION_F1_v0.1.md
**PLAN:** PLAN_RESILIENCIA_EMISION_F1_v0.1.md

---

## Convención de Estado

- `[ ]` Pendiente
- `[x]` Completado
- `[~]` Bloqueado / en revisión

---

## Bloque A — F1-2: Modo AUTO (sin dependencias, primero)

### A1 — Agregar `"AUTO"` a `FiscalEnvioModo` y `FiscalContext`

**Archivo:** `apps/api/src/modules/fiscal-gateway/fiscal-gateway.types.ts`

- [ ] Cambiar `export type FiscalEnvioModo = "BATCH" | "SYNC"` a `"BATCH" | "SYNC" | "AUTO"`.

**Archivo:** `apps/api/src/modules/context/context.types.ts`

- [ ] Cambiar `fiscal_envio_modo?: "BATCH" | "SYNC"` a `"BATCH" | "SYNC" | "AUTO"` en `FiscalContext`.

**Validación A1:**
- [ ] `npm run typecheck` (en `apps/api`) pasa sin errores de tipo relacionados con `FiscalEnvioModo`.

---

### A2 — Actualizar `buildEnvio` y `resolveFiscalEnvioModo` en el gateway

**Archivo:** `apps/api/src/modules/fiscal-gateway/fiscal-gateway.client.ts`

- [ ] En `resolveFiscalEnvioModo`: agregar case para `"AUTO"` que devuelva `"AUTO"`. Actualizar return type a `FiscalEnvioModo` (en lugar de `"BATCH" | "SYNC"`).
- [ ] En `buildEnvio`: agregar case para `"AUTO"` que devuelva `{mode: "AUTO"}`.

**Validación A2:**
- [ ] `npm run typecheck` pasa.
- [ ] Verificar manualmente que `buildEnvio("BATCH")` → `{mode: "BATCH"}`, `buildEnvio("SYNC")` → `{mode: "SYNC", sendNow: true}`, `buildEnvio("AUTO")` → `{mode: "AUTO"}`.

---

## Bloque B — F1-3: Gateway idempotency reconciliation (sin dependencias de A)

### B1 — Agregar tipos de reconciliación a `fiscal-gateway.types.ts`

**Archivo:** `apps/api/src/modules/fiscal-gateway/fiscal-gateway.types.ts`

- [ ] Agregar:
  ```typescript
  export type FiscalIdempotencyReconciliationItemResult =
    | "IMPACTED"
    | "NOT_IMPACTED"
    | "DUPLICATE_CONFLICT"
    | "INVALID_KEY";

  export interface FiscalIdempotencyReconciliationItem {
    idempotency_key: string;
    result: FiscalIdempotencyReconciliationItemResult;
    document_uuid: string | null;
    document_id: string | null;
    current_cdc: string | null;
    status: string | null;
    nro_factura: string | null;
    created_at: string | null;
    message: string | null;
  }

  export interface FiscalIdempotencyReconciliationResponse {
    emisor_id: string;
    env: "test" | "prod";
    from: string;
    to: string;
    items: FiscalIdempotencyReconciliationItem[];
    raw: Record<string, unknown>;
  }
  ```
- [ ] Agregar método a la interfaz `FiscalGateway`:
  ```typescript
  reconcileByIdempotencyKeys(input: {
    emisorId: string;
    env: "test" | "prod";
    from: string;
    to: string;
    idempotencyKeys: string[];
  }): Promise<FiscalIdempotencyReconciliationResponse>;
  ```

**Validación B1:**
- [ ] `npm run typecheck` reporta que `MockFiscalGateway` y `RealFiscalGateway` no implementan el nuevo método (error esperado, se resuelve en B2).

---

### B2 — Implementar `reconcileByIdempotencyKeys` en gateway client

**Archivo:** `apps/api/src/modules/fiscal-gateway/fiscal-gateway.client.ts`

- [ ] En `MockFiscalGateway`: implementar `reconcileByIdempotencyKeys` devolviendo `NOT_IMPACTED` para todas las keys del input.
- [ ] En `RealFiscalGateway`: implementar `reconcileByIdempotencyKeys`:
  - Llamar `POST {baseUrl}/conciliacion/idempotency` con `fetchWithTimeout`.
  - Body: `{ emisor_id: input.emisorId, env: input.env, from: input.from, to: input.to, idempotency_keys: input.idempotencyKeys }`.
  - En error no-2xx: lanzar `FiscalGatewayError("UPSTREAM_ERROR", ...)`.
  - En timeout: lanzar `FiscalGatewayError("TIMEOUT", ...)`.
  - Mapear respuesta con función `mapFiscalIdempotencyReconciliationResponse`.
- [ ] Agregar función privada `mapFiscalIdempotencyReconciliationResponse(body: unknown): FiscalIdempotencyReconciliationResponse` que:
  - Valida que `body` sea objeto.
  - Mapea `items` como array de `FiscalIdempotencyReconciliationItem`.
  - Devuelve `raw: data` completo.

**Validación B2:**
- [ ] `npm run typecheck` pasa sin errores.
- [ ] `npm run lint` pasa.
- [ ] Verificar que `MockFiscalGateway.reconcileByIdempotencyKeys(["KEY-001", "KEY-002"])` devuelve array con dos items en `NOT_IMPACTED`.

---

## Bloque C — F1-1: Cancel-send para operadores (depende de A1 para el tipo)

### C1 — Agregar `"CANCELADO_LOCAL"` a `DocumentoEstado` y nuevo código de error de gateway

**Archivo:** `apps/api/src/modules/facturas/facturas.types.ts`

- [ ] Agregar `"CANCELADO_LOCAL"` al union `DocumentoEstado`.

**Archivo:** `apps/api/src/modules/fiscal-gateway/fiscal-gateway.types.ts`

- [ ] Agregar `"TRANSMISSION_EVIDENCE_DETECTED"` al union `FiscalGatewayErrorCode`:
  ```typescript
  export type FiscalGatewayErrorCode =
    | "TIMEOUT"
    | "UPSTREAM_ERROR"
    | "UNAVAILABLE"
    | "INVALID_RESPONSE"
    | "TRANSMISSION_EVIDENCE_DETECTED";  // nuevo
  ```

**Validación C1:**
- [ ] `npm run typecheck` pasa (el nuevo estado puede causar que el compilador advierta de casos `never` en algunos switches — corregir si los hay).

---

### C2 — Detectar `TRANSMISSION_EVIDENCE_DETECTED` en `RealFiscalGateway`

**Archivo:** `apps/api/src/modules/fiscal-gateway/fiscal-gateway.client.ts`

- [ ] En `RealFiscalGateway.cancelDocumentoSendByDocumentId`: cuando FE devuelve HTTP 409, leer el body y verificar si contiene `error === "TRANSMISSION_EVIDENCE_DETECTED"` o `code === "TRANSMISSION_EVIDENCE_DETECTED"`. En ese caso, lanzar `FiscalGatewayError("TRANSMISSION_EVIDENCE_DETECTED", "El documento ya fue transmitido a SIFEN.", { status: 409, body })`. Para cualquier otro 409, seguir con `UPSTREAM_ERROR`.

**Validación C2:**
- [ ] `npm run typecheck` pasa.
- [ ] Verificar que otros métodos del gateway no se ven afectados.

---

### C3 — Refactorizar `cancelDocumentoSend` en el servicio

**Archivo:** `apps/api/src/modules/facturas/facturas.service.ts`

- [ ] Eliminar la llamada a `assertInternalSupportRole` al inicio de `cancelDocumentoSend`.
- [ ] Eliminar la llamada a `assertWithinWindowOrThrow` al inicio de `cancelDocumentoSend`.
- [ ] Agregar validación de estado local:
  ```typescript
  if (documento.estado !== "PENDIENTE_SIFEN" && documento.estado !== "EMITIENDO") {
    throw new HttpError(409, "CONFLICT", "Solo documentos en espera de transmision pueden cancelarse antes del envio.");
  }
  ```
- [ ] En el bloque `catch` del gateway: agregar case para `error.code === "TRANSMISSION_EVIDENCE_DETECTED"`:
  ```typescript
  if (error.code === "TRANSMISSION_EVIDENCE_DETECTED") {
    throw new HttpError(409, "CONFLICT", "El documento ya fue enviado a SIFEN. Si fue aprobado, use la opcion de anulacion fiscal.");
  }
  ```
- [ ] Después del `appendAuditEvent`: agregar llamada a `repository.updateFiscalStatus`:
  ```typescript
  const updated = await repository.updateFiscalStatus({
    facturadorId: context.facturador.id,
    documentoId,
    estado: "CANCELADO_LOCAL",
    fiscalStatus: {
      ...response.raw,
      action_result: response.action_result,
      reason_codes: response.reason_codes,
      cancel_send_comment: input?.comment ?? null
    }
  });
  if (!updated) {
    throw new HttpError(404, "NOT_FOUND", "Documento no encontrado al persistir cancelacion local.");
  }
  return updated;
  ```
- [ ] Actualizar el tipo de retorno de la función de `Promise<DocumentoGestionCancelSendResponse>` a `Promise<DocumentoResponse>`.
- [ ] Eliminar el `return { documento_id, previous_status, ... }` anterior.

**Validación C3:**
- [ ] `npm run typecheck` pasa — el tipo de retorno actualizado puede requerir ajustes en el route handler (ver C4).
- [ ] `npm run lint` pasa.

---

### C4 — Actualizar routes para `CANCELADO_LOCAL`

**Archivo:** `apps/api/src/modules/facturas/facturas.routes.ts`

- [ ] En la línea `const documentoEstados = [...]` (línea 37 aprox.): agregar `"CANCELADO_LOCAL"` al array.
- [ ] Verificar que el route handler `POST /facturas/:documentoId/gestion/cancel-send` no necesita cambios en el tipo (ya hace `res.json(result)` — con el nuevo tipo `DocumentoResponse` funciona igual).
- [ ] Verificar que no hay import de `DocumentoGestionCancelSendResponse` en routes que necesite actualizarse.

**Validación C4:**
- [ ] `npm run typecheck` pasa.
- [ ] `npm run build` de `apps/api` sin errores.

---

## Bloque D — F1-4: Refresh proactivo en idempotency (sin dependencias de A, B, C)

### D1 — Extraer y agregar `tryRefreshSilently` en el servicio

**Archivo:** `apps/api/src/modules/facturas/facturas.service.ts`

- [ ] Agregar función privada `tryRefreshSilently`:
  ```typescript
  async function tryRefreshSilently(
    context: OperationalContextResponse,
    documento: DocumentoResponse,
    repository: FacturaRepository,
    gateway: FiscalGateway
  ): Promise<DocumentoResponse> {
    if (!documento.document_uuid && !documento.cdc) return documento;
    try {
      return await refreshDocumentoStatus(context, documento.id, repository, gateway);
    } catch {
      return documento;
    }
  }
  ```

- [ ] En `emitFacturaAgainstFiscalGateway`, en el bloque `if (existing) { return existing; }`:
  Cambiar a:
  ```typescript
  if (existing) {
    if (existing.estado === "PENDIENTE_SIFEN") {
      return tryRefreshSilently(context, existing, repository, gateway);
    }
    return existing;
  }
  ```

- [ ] En `emitNotaCreditoTotal`, en el bloque `if (existing) { return existing; }`:
  Mismo patrón.

**Validación D1:**
- [ ] `npm run typecheck` pasa.
- [ ] Test comportamiento: si el documento existente está en `PENDIENTE_SIFEN` y el mock de gateway devuelve `EMITIDA` en refresh → el resultado de la función es el documento con `estado: "EMITIDA"`.
- [ ] Test comportamiento: si el documento existente está en `EMITIDA` → no hay llamada a refresh, se devuelve directamente.
- [ ] Test comportamiento: si el refresh lanza un error de gateway → se devuelve el documento original en `PENDIENTE_SIFEN` sin propagar el error.

---

## Bloque E — Validación Integrada

### E1 — Typecheck y build completo

- [ ] `npm run typecheck` en `apps/api` — cero errores.
- [ ] `npm run lint` en `apps/api` — cero errores.
- [ ] `npm run build` en `apps/api` — build exitoso.

### E2 — Smoke contra contenedores

Ejecutar `bash scripts/deploy.sh` y luego:

- [ ] `GET /api/health` → 200.
- [ ] Emitir una factura → verificar que `estado` en la respuesta no causa error de parsing (el nuevo tipo es retrocompatible).
- [ ] Llamar `POST /api/facturas/:id/gestion/cancel-send` con un documento en `PENDIENTE_SIFEN` → esperar 200 con `estado: "CANCELADO_LOCAL"` (en modo mock).
- [ ] Llamar `POST /api/facturas/:id/gestion/cancel-send` con un documento en `EMITIDA` → esperar 409.
- [ ] Llamar `GET /api/facturas?estado=CANCELADO_LOCAL` → verificar que el filtro funciona (lista vacía o con el documento cancelado).
- [ ] Verificar que la emisión con `Idempotency-Key` de un documento existente en `PENDIENTE_SIFEN` retorna (potencialmente) el estado actualizado.

### E3 — Verificación de no regresión

- [ ] Emitir una factura en modo SYNC → sigue funcionando igual.
- [ ] Emitir una factura en modo BATCH → sigue funcionando igual.
- [ ] Cancelación fiscal de una factura EMITIDA (`POST /api/facturas/:id/cancelar`) → sigue funcionando igual.
- [ ] Nota de crédito sobre una factura EMITIDA → sigue funcionando igual.
- [ ] Listar facturas con filtros existentes (`estado=EMITIDA`, `estado=RECHAZADA`) → sigue funcionando igual.

---

## Cierre del Bloque

- [ ] SPEC actualizado si se descubrió algún alcance distinto durante implementación.
- [ ] PLAN actualizado si el enfoque adoptado difirió del planificado.
- [ ] `spec/openapi.yaml` — verificar si `CANCELADO_LOCAL` debe agregarse al enum de `estado` en el schema de `DocumentoResponse`. Si el schema lo define explícitamente, actualizar.
- [ ] Documentar bloqueos encontrados (si hubiera) en esta sección antes de cerrar.

---

## Notas Operativas Post-Implementación

Una vez desplegado, comunicar al equipo operativo:

1. El botón de "cancelar" en la vista de documento diferencia dos flujos según el estado:
   - Si el documento está en `PENDIENTE_SIFEN` o `EMITIENDO`: la cancelación es **local** (no llega a SIFEN, número disponible). Resultado: `CANCELADO_LOCAL`.
   - Si el documento está en `EMITIDA`: la cancelación es **fiscal** (se envía evento a SIFEN, ventana de 48h). Resultado: `ANULADA` o `PENDIENTE_SIFEN`.
2. Un documento en `CANCELADO_LOCAL` no puede reactivarse. Para facturar la misma venta, emitir nuevo documento.
3. La numeración fiscal del documento cancelado localmente puede quedar disponible en FE, pero no se garantiza reutilización automática — depende del comportamiento de FE.
