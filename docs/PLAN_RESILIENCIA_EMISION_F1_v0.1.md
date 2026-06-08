# PLAN_RESILIENCIA_EMISION_F1_v0.1

**Versión:** 0.1
**Fecha:** 2026-06-07
**Estado:** DRAFT
**SPEC:** SPEC_RESILIENCIA_EMISION_F1_v0.1.md

---

## 1. Estrategia General

Cuatro cambios independientes que comparten el mismo bloque de trabajo. No tienen dependencias entre sí (pueden implementarse en cualquier orden), con dos excepciones:

- F1-1 depende de que `CANCELADO_LOCAL` esté en `DocumentoEstado` antes de modificar el servicio.
- F1-2 depende de que `"AUTO"` esté en `FiscalEnvioModo` antes de actualizar `buildEnvio`.

Ningún cambio requiere migración de base de datos — `CANCELADO_LOCAL` es un valor nuevo en una columna de texto existente y el repository existente `updateFiscalStatus` lo persiste sin cambios estructurales.

Ningún cambio rompe contratos existentes excepto el tipo de retorno de `cancelDocumentoSend` en el service — que en la práctica nunca fue consumido por operadores (siempre 403).

---

## 2. Capas Afectadas y Cambios por Archivo

### F1-1: cancel-send para OPERADOR_FACTURACION

**Orden obligatorio dentro de F1-1:** tipos → service → routes

| Archivo | Cambio |
|---|---|
| `facturas.types.ts` | Agregar `"CANCELADO_LOCAL"` a `DocumentoEstado`. Cambiar firma de retorno de `cancelDocumentoSend` en el servicio (el tipo `DocumentoGestionCancelSendResponse` se mantiene en el archivo pero deja de usarse como retorno de la función). |
| `facturas.service.ts` | `cancelDocumentoSend`: (1) eliminar `assertInternalSupportRole`. (2) eliminar `assertWithinWindowOrThrow`. (3) Agregar validación de estado local: solo `PENDIENTE_SIFEN` o `EMITIENDO`. (4) Traducir `409` de FE a error de operador. (5) Después del `appendAuditEvent`: llamar `repository.updateFiscalStatus({..., estado: "CANCELADO_LOCAL", fiscalStatus: {...}})`. (6) Devolver el documento actualizado con `getDocumentoById` o desde el resultado de `updateFiscalStatus`. |
| `facturas.routes.ts` | Agregar `"CANCELADO_LOCAL"` al array `documentoEstados` (línea 37). No hay cambio de handler porque ya hace `res.json(result)`. |

**Detalle del cambio en `cancelDocumentoSend`:**

```
ANTES:
  assertInternalSupportRole(context, "...")       ← eliminar
  assertWithinWindowOrThrow(documento, 72, "...")  ← eliminar
  gateway.cancelDocumentoSendByDocumentId(...)
  repository.appendAuditEvent(...)
  return { documento_id, previous_status, ... }   ← retorno de metadatos

DESPUÉS:
  if (documento.estado !== "PENDIENTE_SIFEN" && documento.estado !== "EMITIENDO")
    throw 409 "Solo documentos en espera de transmision pueden cancelarse antes del envio."

  gateway.cancelDocumentoSendByDocumentId(...)
    ← catch 409: si body contiene TRANSMISSION_EVIDENCE_DETECTED → throw 409 user-facing
    ← catch timeout → throw 504
    ← catch otro error → throw 502

  repository.updateFiscalStatus({
    facturadorId: ...,
    documentoId: ...,
    estado: "CANCELADO_LOCAL",
    fiscalStatus: { ...response.raw, action_result: response.action_result, ... }
  })

  repository.appendAuditEvent({
    eventType: "FACTURA_GESTION_CANCEL_SEND",
    metadata: { previous_status, status: "CANCELADO_LOCAL", action_result, reason_codes }
  })

  return updated DocumentoResponse
```

**Cómo distinguir `TRANSMISSION_EVIDENCE_DETECTED` en el gateway catch:**

El gateway lanza `FiscalGatewayError` cuando FE no es 2xx. Para este caso específico (409 con `TRANSMISSION_EVIDENCE_DETECTED`), el gateway actualmente lanza `UPSTREAM_ERROR` sin distinguir el sub-código. Necesitamos que el service pueda distinguir este caso.

Enfoque: en `cancelDocumentoSendByDocumentId` del `RealFiscalGateway`, cuando FE devuelve 409, relanzar con el body en `details` para que el service pueda inspeccionarlo. El service inspecciona `error.details` y busca el código de error.

Alternativa más limpia: agregar un código específico `TRANSMISSION_EVIDENCE_DETECTED` al enum `FiscalGatewayErrorCode` y lanzarlo desde el gateway cuando detecta ese caso en el body. El service recibe el código tipado y lo maneja sin inspeccionar el `details`.

**Decisión: usar código específico.** Agrega `"TRANSMISSION_EVIDENCE_DETECTED"` a `FiscalGatewayErrorCode`. El gateway inspecciona el body del 409 de FE y lanza el código apropiado. El service lo traduce a un `HttpError` con mensaje de operador.

Cambio adicional:
- `fiscal-gateway.types.ts`: agregar `"TRANSMISSION_EVIDENCE_DETECTED"` a `FiscalGatewayErrorCode`.
- `fiscal-gateway.client.ts`: en `cancelDocumentoSendByDocumentId`, cuando FE devuelve 409, inspeccionar el body e `if (body?.error === "TRANSMISSION_EVIDENCE_DETECTED" || body?.code === "TRANSMISSION_EVIDENCE_DETECTED")` lanzar con ese código.

---

### F1-2: modo AUTO

| Archivo | Cambio |
|---|---|
| `context.types.ts` | `FiscalContext.fiscal_envio_modo?: "BATCH" \| "SYNC" \| "AUTO"` |
| `fiscal-gateway.types.ts` | `FiscalEnvioModo = "BATCH" \| "SYNC" \| "AUTO"` |
| `fiscal-gateway.client.ts` | `buildEnvio("AUTO")` → `{mode: "AUTO"}`. `resolveFiscalEnvioModo` actualmente devuelve `"BATCH" \| "SYNC"` — actualizar return type a `FiscalEnvioModo` y agregar el case `"AUTO"`. Los mappers `mapFiscalEnvioModo` y `mapDocumentStatusWithCode` que usan `resolveFiscalEnvioModo` pueden quedar sin cambios porque `AUTO` no afecta el mapeo de estado (que depende del status, no del modo). |

**Nota sobre `resolveFiscalEnvioModo`:** la función actualmente devuelve `"BATCH" | "SYNC"`. Cuando el modo es `"AUTO"` y FE cayó a BATCH, la respuesta de FE llega con `delivery_mode: "AUTO_FALLBACK_BATCH"` — esto ya está mapeado en `mapDeliveryMode`. El campo `fiscal_envio_modo` que se guarda localmente es el modo *enviado* a FE (AUTO), no el *resultado*. El resultado se captura en `delivery_mode`.

---

### F1-3: gateway idempotency reconciliation

| Archivo | Cambio |
|---|---|
| `fiscal-gateway.types.ts` | Agregar `FiscalIdempotencyReconciliationItemResult`, `FiscalIdempotencyReconciliationItem`, `FiscalIdempotencyReconciliationResponse`. Agregar `reconcileByIdempotencyKeys` a la interfaz `FiscalGateway`. |
| `fiscal-gateway.client.ts` | Implementar en `RealFiscalGateway`: `POST {baseUrl}/conciliacion/idempotency` con timeout estándar. Implementar en `MockFiscalGateway`: devolver `NOT_IMPACTED` para todas las keys. Agregar `mapFiscalIdempotencyReconciliationResponse` como función de mapeo. |

**Endpoint FE:** `POST /fcws/conciliacion/idempotency`
**Auth:** header `X-Api-Key` (mismo mecanismo que el resto).
**Permiso requerido en FE:** `IDEMPOTENCY_RECONCILE` — verificar que la API key del SaaS tiene este permiso configurado en FE antes de usar en producción.

---

### F1-4: refresh proactivo en idempotency

| Archivo | Cambio |
|---|---|
| `facturas.service.ts` | En `emitFacturaAgainstFiscalGateway`: después de `if (existing) { return existing; }`, agregar: `if (existing.estado === "PENDIENTE_SIFEN") { return tryRefreshSilently(context, existing.id, repository, gateway); }`. En `emitNotaCreditoTotal`: mismo patrón. |

**Función auxiliar sugerida (privada en el módulo):**

```typescript
async function tryRefreshSilently(
  context: OperationalContextResponse,
  documentoId: string,
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoResponse> {
  // findById primero para tener el documento actual
  const documento = await repository.findById({
    facturadorId: context.facturador.id,
    documentoId
  });
  if (!documento) return documento!; // no debería ocurrir, ya fue validado antes

  if (documento.estado !== "PENDIENTE_SIFEN") return documento;

  // solo intentar refresh si tiene document_uuid o cdc
  if (!documento.document_uuid && !documento.cdc) return documento;

  try {
    return await refreshDocumentoStatus(context, documentoId, repository, gateway);
  } catch {
    return documento;
  }
}
```

La función reutiliza `refreshDocumentoStatus` existente y absorbe cualquier error sin propagarlo.

---

## 3. Orden de Implementación Recomendado

```
1. F1-2 (AUTO mode) — cambios de tipo puros, sin lógica de negocio, mínimo riesgo
2. F1-3 (gateway reconciliation) — solo gateway, sin tocar service ni routes
3. F1-1 tipos (CANCELADO_LOCAL en DocumentoEstado) — prerequisito para F1-1 service
4. F1-1 gateway (TRANSMISSION_EVIDENCE_DETECTED en FiscalGatewayErrorCode) — prerequisito para F1-1 service
5. F1-1 service (cancelDocumentoSend refactoring) — cambio principal
6. F1-1 routes (agregar CANCELADO_LOCAL al array de estados)
7. F1-4 (refresh proactivo) — cambio más pequeño, puede ir en cualquier momento
```

---

## 4. Validaciones por Cambio

### F1-1
- `npm run typecheck` — el compilador debe aceptar el nuevo estado `CANCELADO_LOCAL` en todos los lugares donde `DocumentoEstado` se usa.
- Test unitario o smoke: llamar `POST /facturas/:id/gestion/cancel-send` con un documento en `PENDIENTE_SIFEN` en modo mock → esperar 200 con `estado: "CANCELADO_LOCAL"`.
- Test unitario o smoke: llamar con documento en `EMITIDA` → esperar 409.
- Test unitario o smoke: simular que el gateway lanza `TRANSMISSION_EVIDENCE_DETECTED` → esperar 409 con mensaje de operador.
- Verificar que `CANCELADO_LOCAL` aparece en el Zod schema del query de listado (para poder filtrar).

### F1-2
- `npm run typecheck` — sin errores de tipo en `FiscalEnvioModo` y `FiscalContext`.
- Verificar que `buildEnvio("AUTO")` devuelve `{mode: "AUTO"}` (test unitario simple o inspección).
- Verificar que `buildEnvio("BATCH")` y `buildEnvio("SYNC")` siguen funcionando igual.

### F1-3
- `npm run typecheck` — sin errores en la nueva interfaz y sus implementaciones.
- Verificar que `MockFiscalGateway.reconcileByIdempotencyKeys` devuelve estructura válida.
- Verificar que `RealFiscalGateway.reconcileByIdempotencyKeys` llama al endpoint correcto con los headers correctos.

### F1-4
- `npm run typecheck` — sin errores.
- Test: emisión con idempotency key existente en PENDIENTE_SIFEN → verificar que intenta refresh (en mock, el refresh devuelve EMITIDA → el resultado final debe ser EMITIDA).
- Test: si el refresh lanza error → el documento original en PENDIENTE_SIFEN es devuelto sin propagar error.

---

## 5. Riesgos y Mitigaciones

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| `CANCELADO_LOCAL` no persistido correctamente si la BD tiene constraint en la columna `estado` | Baja — la columna es texto sin enum en DB | Verificar con el repository real que `updateFiscalStatus` acepta el nuevo valor |
| El permiso `IDEMPOTENCY_RECONCILE` no está configurado en la API key de producción (F1-3) | Posible | Verificar antes de usar en producción; si no está, solicitar al admin de FE |
| AUTO mode causa que documentos en modo SYNC caigan silenciosamente a BATCH sin que el operador lo sepa | Baja — FE devuelve `delivery_mode: AUTO_FALLBACK_BATCH` que ya se registra | Mapear `AUTO_FALLBACK_BATCH` correctamente en el estado local como `PENDIENTE_SIFEN` |
| El refresh proactivo en F1-4 agrega latencia a la respuesta de emisión idempotente | Baja — solo ocurre cuando el documento existe Y está en PENDIENTE_SIFEN | Aceptable. Si la latencia es un problema, se puede hacer async con `void` |

---

## 6. No Requiere

- Migraciones de base de datos.
- Cambios en `spec/openapi.yaml` — no hay endpoints nuevos; el estado `CANCELADO_LOCAL` ya es parte del campo `estado` existente en la respuesta de documento.
- Cambios en el frontend (`web-operacion`) para que el cancel-send funcione — la ruta ya existe.
- Cambios en configuración de infraestructura.
