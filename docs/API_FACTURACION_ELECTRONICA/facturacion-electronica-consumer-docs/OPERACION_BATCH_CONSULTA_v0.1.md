# OPERACION BATCH CONSULTA MT150 v0.1

## Propósito

Guía operativa para consultar el estado de lotes SIFEN enviados en modo BATCH, identificar resultados por protocolo (`dProtConsLote`) y correlacionar documentos fiscales con sus resultados de lote.

---

## Conceptos clave

| Término | Descripción |
|---|---|
| `did` | Identificador **interno** secuencial del lote (no usar para consultar SIFEN) |
| `sifen_protocol` / `dProtConsLote` | Protocolo SIFEN retornado en la recepción del lote — es el identificador **real** para consultar resultado en SIFEN |
| `QUEUED_BATCH` | Documento encolado, aún no enviado en lote |
| `RECEIVED` | Lote recibido por SIFEN, en espera de procesamiento |
| `PROCESSING` | SIFEN está procesando el lote (código `0361`) |
| `DONE` | Lote procesado por SIFEN (código `0362`) — documentos pueden estar APPROVED/REJECTED |
| `ERROR` | Error de procesamiento o protocolo inexistente (código `0360`) |

---

## Flujo normal de un lote

```
QUEUED_BATCH (documentos) → worker batch-sender → de_batches SENT/RECEIVED
→ worker batch-poller → consulta SIFEN → PROCESSING → DONE
→ documentos actualizados: APPROVED / APPROVED_WITH_OBS / REJECTED
```

---

## Endpoints de consulta

### Listar lotes por facturador

```
GET /consultar/{emisor_id}/lotes?env=test&from=2026-01-01&to=2026-01-31&status=DONE&limit=50&offset=0
```

Filtros disponibles:
- `env` — `test` o `prod`
- `from` / `to` — rango temporal ISO 8601 (basado en `created_at`)
- `status` — `CREATED`, `SENT`, `RECEIVED`, `PROCESSING`, `DONE`, `ERROR`
- `tipoDocumento` — `1` (FE), `5` (NCE), etc.
- `limit` / `offset` — paginación (máx. 200 por página)

**Nota**: `document_uuid` en la respuesta es `null` hasta Ola 1 del linaje canónico.

### Consultar lote puntual por protocolo SIFEN

```
GET /consultar/{emisor_id}/lotes/{dProtConsLote}?env=test&refresh=false
GET /consultar/{emisor_id}/lotes/{dProtConsLote}?env=test&refresh=true
```

- `refresh=false` (default): devuelve el estado almacenado localmente.
- `refresh=true`: llama a SIFEN vía `setapi.consultaLote` con el protocolo real y persiste el resultado.
  - **Throttling**: refresh se omite automáticamente si el lote ya está en estado `DONE` o `ERROR`.
  - Reutiliza el mismo parser MT150 del worker de polling (`summarizeBatchProcessingResponse`).

---

## Reglas operativas

1. **No usar `did` para consultar SIFEN** — usar siempre `sifen_protocol` (campo `dProtConsLote`).
2. **No activar `refresh=true` masivamente** — puede saturar SIFEN. Usar solo para diagnóstico puntual.
3. **El worker batch-poller** es el mecanismo principal de actualización de estado de lotes activos. El endpoint de refresh manual es complementario.
4. **Lotes `DONE` con `document_results` vacíos**: cuando SIFEN no devuelve resultados por documento, todos los documentos del lote quedan en `SENT_BATCH` (el worker maneja este caso).
5. **Correlación de documentos**: el campo `document_results` en la respuesta puntual lista CDC + estado SIFEN por documento dentro del lote (extraído del `response_payload` del lote).

---

## Diagnóstico de problemas comunes

| Síntoma | Causa probable | Acción |
|---|---|---|
| Lote en `RECEIVED` por más de 10 min | Delay de procesamiento SIFEN | Usar `refresh=true` para forzar consulta |
| Lote en `ERROR` con código `0360` | Protocolo inexistente en SIFEN | Revisar si el lote fue realmente enviado; consultar logs del batch-sender |
| Documentos en `SENT_BATCH` sin pasar a `APPROVED` | Lote en `DONE` pero sin resultados por documento | Normal si SIFEN no devuelve detalle; verificar con soporte SET |
| `sifen_protocol` null en lote `SENT` | Fallo al parsear respuesta de recepción | Revisar `response_payload` del lote para diagnóstico |

---

## Compatibilidad

- `GET /consultar/{id}/batch-pendientes` — **sigue operativo** sin cambios de contrato.
- Los nuevos endpoints son **aditivos** — no rompen integraciones existentes.

---

## Referencia

- MT150 sec. `siRecepLoteDE` — recepción de lote
- MT150 sec. `siResultLoteDE` — consulta de resultado de lote
- Códigos SIFEN: `0360` (inexistente), `0361` (en procesamiento), `0362` (concluido)
