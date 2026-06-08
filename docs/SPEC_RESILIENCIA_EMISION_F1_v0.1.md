# SPEC_RESILIENCIA_EMISION_F1_v0.1

**Versión:** 0.1
**Fecha:** 2026-06-07
**Estado:** DRAFT

---

## 1. Objetivo

Mejorar la resiliencia del flujo de emisión fiscal en cuatro puntos concretos, sin refactors estructurales, usando las capacidades que ya expone `facturacion-electronica`:

1. **F1-1** Habilitar cancel-send para `OPERADOR_FACTURACION` — permitir cancelar un documento encolado antes de que el worker lo transmita a SIFEN.
2. **F1-2** Soporte de modo de envío `AUTO` — dejar que FE elija entre SYNC y BATCH en tiempo real.
3. **F1-3** Agregar idempotency reconciliation al gateway — exposición de `POST /fcws/conciliacion/idempotency` en la capa de gateway sin flujo de servicio aún.
4. **F1-4** Refresh proactivo en idempotency de emisión — cuando se recibe un `PENDIENTE_SIFEN` por idempotency, intentar refresh antes de devolver.

---

## 2. Contexto y Motivación

### F1-1 — Cancel-send

El endpoint `POST /facturas/:id/gestion/cancel-send` ya existe en el router y el gateway ya implementa `cancelDocumentoSendByDocumentId` contra el admin endpoint de FE. La función de servicio `cancelDocumentoSend` bloquea todo rol distinto al de soporte interno (`assertInternalSupportRole`).

Consecuencia: cuando un operador emite una factura con datos incorrectos y el documento queda en `PENDIENTE_SIFEN` (encolado en FE, no transmitido a SIFEN), no puede cancelarla sin intervención de soporte. La factura ocupa una numeración hasta que el worker la transmita; después de eso, la única salida es la cancelación fiscal (que requiere que SIFEN la apruebe primero).

FE cancela localmente (`CANCELLED_LOCAL`) y devuelve el documento a estado `DRAFT` — la numeración queda disponible sin generar evento fiscal.

El problema secundario es que después de un cancel-send exitoso, el servicio actual no actualiza el estado local del documento. El operador ve el documento como `PENDIENTE_SIFEN` aunque FE ya no lo procesará.

### F1-2 — Modo AUTO

`FiscalEnvioModo` y `FiscalContext.fiscal_envio_modo` solo admiten `"BATCH" | "SYNC"`. FE soporta un tercer modo `"AUTO"` que intenta SYNC y cae a BATCH cuando SIFEN devuelve código 1264 (servicio síncrono no disponible). Esto reduce el volumen de documentos que quedan en `PENDIENTE_SIFEN` durante ventanas de inestabilidad SIFEN.

### F1-3 — Gateway idempotency reconciliation

`POST /fcws/conciliacion/idempotency` permite enviar hasta 100 `idempotency_keys` a FE y recibir si cada una impactó o no. Esta capacidad es el fundamento de un futuro worker automático de reconciliación (Fase 2). En F1 solo se agrega la interfaz al gateway para tenerla disponible sin construir el flujo de servicio completo.

### F1-4 — Refresh proactivo en idempotency

Cuando `emitFacturaAgainstFiscalGateway` encuentra un documento existente en `PENDIENTE_SIFEN` (vía idempotency key local), lo devuelve sin verificar si FE ya lo resolvió. Si el worker ya procesó el documento en FE, el estado local puede estar desactualizado. El refresh proactivo consulta FE antes de devolver el documento idempotente.

---

## 3. Alcance

### Incluido

- Cambios en `fiscal-gateway.types.ts`, `fiscal-gateway.client.ts` (gateway).
- Cambios en `facturas.types.ts`, `facturas.service.ts` (servicio).
- Cambios en `context.types.ts` (tipo `FiscalContext.fiscal_envio_modo`).
- Actualización de `facturas.routes.ts` donde aplique (enum de estados, validación).
- El nuevo estado `CANCELADO_LOCAL` en `DocumentoEstado` y su persistencia en el repository.

### Excluido

- Cambios en el frontend (`web-operacion`): la ruta ya existe, el frontend ya puede llamarla. Si la UI necesita diferenciar los flujos "cancelar antes de SIFEN" vs "anulación fiscal", eso es un task de UI separado.
- Worker de reconciliación automática (Fase 2).
- Flujos de corrección sin pérdida de numeración para operadores (`retry-same-cdc`, `create-derived`) — siguen restringidos a soporte interno.
- Cambios en base de datos más allá de lo soportado por el repository interface.

---

## 4. Reglas de Negocio y Restricciones

### RN-F1-1: cancel-send para operadores

**RN-F1-1.1** El documento debe estar en estado local `PENDIENTE_SIFEN` o `EMITIENDO` para que el cancel-send sea elegible. Cualquier otro estado resulta en `409 CONFLICT`.

**RN-F1-1.2** Si FE responde `409 TRANSMISSION_EVIDENCE_DETECTED`, el backend SaaS devuelve `409 CONFLICT` con mensaje de operador: "El documento ya fue enviado a SIFEN. Si fue aprobado, use la opción de anulación fiscal." No reintentar.

**RN-F1-1.3** Si el cancel-send en FE es exitoso (`action_result: "CANCELLED"` o equivalente), el backend SaaS actualiza el estado local del documento a `CANCELADO_LOCAL` y registra evento de auditoría `FACTURA_GESTION_CANCEL_SEND`.

**RN-F1-1.4** El estado `CANCELADO_LOCAL` es terminal. No puede transicionar a ningún otro estado. El operador debe emitir un nuevo documento si necesita facturar la misma venta.

**RN-F1-1.5** El endpoint devuelve el `DocumentoResponse` actualizado (con `estado: "CANCELADO_LOCAL"`), no solo los metadatos del cancel-send. Esto permite que el frontend actualice la vista sin un request adicional.

**RN-F1-1.6** El check de ventana de 72 horas **se elimina** para cancel-send. El cancel-send aplica antes de transmisión a SIFEN, no tiene restricción de ventana temporal — la restricción real la impone FE (`TRANSMISSION_EVIDENCE_DETECTED` si ya fue transmitido).

**RN-F1-1.7** El rol `OPERADOR_FACTURACION` puede ejecutar cancel-send. No se requiere rol de soporte.

### RN-F1-2: modo AUTO

**RN-F1-2.1** `FiscalContext.fiscal_envio_modo` acepta `"BATCH" | "SYNC" | "AUTO"`. El valor `"AUTO"` se pasa directamente a FE como `{mode: "AUTO"}`. FE decide en tiempo real.

**RN-F1-2.2** Cuando FE responde con `delivery_mode: "AUTO_FALLBACK_BATCH"`, el documento local se trata como `PENDIENTE_SIFEN`. Cuando responde con `delivery_mode: "SYNC"`, se trata como `EMITIDA` o `RECHAZADA` según el estado fiscal.

**RN-F1-2.3** El tipo `FiscalEnvioModo` en el gateway se extiende a `"BATCH" | "SYNC" | "AUTO"`. Los mappers que dependen de este tipo deben actualizarse para no caer al `else` de BATCH cuando el modo es AUTO.

### RN-F1-3: gateway idempotency reconciliation

**RN-F1-3.1** La interfaz `FiscalGateway` expone `reconcileByIdempotencyKeys`. No se expone ningún endpoint HTTP en el SaaS en F1.

**RN-F1-3.2** El método acepta: `emisorId`, `env`, `from` (ISO 8601 con offset), `to` (ISO 8601 con offset), `idempotencyKeys: string[]` (máx 100).

**RN-F1-3.3** La respuesta mapea cada key a `IMPACTED | NOT_IMPACTED | DUPLICATE_CONFLICT | INVALID_KEY` con `document_uuid` y `document_id` cuando corresponde.

**RN-F1-3.4** La implementación mock devuelve `NOT_IMPACTED` para todas las keys.

### RN-F1-4: refresh proactivo en idempotency

**RN-F1-4.1** Cuando `emitFacturaAgainstFiscalGateway` encuentra un documento existente en `PENDIENTE_SIFEN` vía idempotency key, intenta `refreshDocumentoStatus` antes de devolver.

**RN-F1-4.2** Si el refresh falla (timeout, error de gateway), se devuelve el documento en su estado actual sin propagar el error.

**RN-F1-4.3** Si el refresh exitosamente actualiza el estado (por ejemplo a `EMITIDA`), se devuelve el documento actualizado.

**RN-F1-4.4** El mismo comportamiento aplica para `emitNotaCreditoTotal` cuando se encuentra un documento existente en `PENDIENTE_SIFEN`.

---

## 5. Nuevo Estado: CANCELADO_LOCAL

### Semántica

| Campo | Valor |
|---|---|
| Nombre | `CANCELADO_LOCAL` |
| Significado | El documento fue encolado en FE pero cancelado antes de transmisión a SIFEN. No existe en SIFEN. No hay evento fiscal. |
| Terminal | Sí — no puede transicionar a otro estado. |
| Numeración | Puede estar disponible para reutilización en FE (depende de FE). |
| Diferencia con ANULADA | ANULADA requiere que SIFEN aprobara el documento primero. CANCELADO_LOCAL nunca llegó a SIFEN. |

### Transición permitida

```
PENDIENTE_SIFEN ──cancel-send exitoso──► CANCELADO_LOCAL
EMITIENDO       ──cancel-send exitoso──► CANCELADO_LOCAL
```

### Transición no permitida

```
EMITIDA         ──cancel-send──► ❌ (usar /cancelar para anulación fiscal)
ANULADA         ──cancel-send──► ❌
CANCELADO_LOCAL ──cualquier cosa──► ❌ (terminal)
RECHAZADA       ──cancel-send──► ❌
```

---

## 6. Cambios de Contrato

### 6.1 `DocumentoEstado` (facturas.types.ts)

Agrega `"CANCELADO_LOCAL"`:
```typescript
export type DocumentoEstado =
  | "EMITIENDO"
  | "EMITIDA"
  | "PENDIENTE_SIFEN"
  | "RECHAZADA"
  | "ERROR_OPERATIVO"
  | "ERROR_TEMPORAL"
  | "ANULADA"
  | "CANCELADO_LOCAL";   // nuevo
```

### 6.2 `FiscalEnvioModo` (fiscal-gateway.types.ts)

```typescript
export type FiscalEnvioModo = "BATCH" | "SYNC" | "AUTO";  // agrega AUTO
```

### 6.3 `FiscalContext.fiscal_envio_modo` (context.types.ts)

```typescript
fiscal_envio_modo?: "BATCH" | "SYNC" | "AUTO";  // agrega AUTO
```

### 6.4 `FiscalGateway` interface (fiscal-gateway.types.ts)

Nuevo método:
```typescript
reconcileByIdempotencyKeys(input: {
  emisorId: string;
  env: "test" | "prod";
  from: string;
  to: string;
  idempotencyKeys: string[];
}): Promise<FiscalIdempotencyReconciliationResponse>;
```

Con tipos:
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

### 6.5 `cancelDocumentoSend` return type (facturas.service.ts / facturas.types.ts)

El servicio `cancelDocumentoSend` cambia su tipo de retorno de `DocumentoGestionCancelSendResponse` a `DocumentoResponse`. El tipo `DocumentoGestionCancelSendResponse` se mantiene (puede ser usado internamente o en el futuro) pero deja de ser el tipo de retorno de la función de servicio.

### 6.6 `FacturaRepository` (facturas.types.ts)

No requiere nuevos métodos. El estado `CANCELADO_LOCAL` se persiste usando el método existente `updateFiscalStatus` que acepta `estado: DocumentoEstado`.

---

## 7. Errores y Respuestas Esperadas por Escenario

### cancel-send

| Escenario | HTTP | Error | Mensaje operativo |
|---|---|---|---|
| Estado no elegible (ej. EMITIDA) | 409 | CONFLICT | "Solo documentos en espera de transmision pueden cancelarse antes del envio." |
| FE: `TRANSMISSION_EVIDENCE_DETECTED` | 409 | CONFLICT | "El documento ya fue enviado a SIFEN. Si fue aprobado, use la opcion de anulacion fiscal." |
| FE: `INVALID_DOCUMENT_STATUS` | 409 | CONFLICT | "El documento no esta en estado elegible para cancelacion local en el sistema fiscal." |
| FE: timeout | 504 | INTERNAL_ERROR | "Timeout al cancelar envio local." |
| FE: error desconocido | 502 | INTERNAL_ERROR | "No se pudo cancelar el envio local." |
| Exitoso | 200 | — | `DocumentoResponse` con `estado: "CANCELADO_LOCAL"` |

---

## 8. Fuera de Alcance Explícito

- Lógica de re-emisión después de cancel-send (el operador usa el flujo normal de emisión).
- Distinción visual en el frontend entre "cancelar antes de SIFEN" y "anulación fiscal".
- Worker de reconciliación automática de `PENDIENTE_SIFEN` (Fase 2).
- Habilitar `retry-same-cdc` o `create-derived` para operadores (Fase 2).
- Monitoreo de lotes batch en la UI.
- Múltiples establecimientos / emisión multipunto.
