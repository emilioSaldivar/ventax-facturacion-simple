# TASKS — Módulo SIFEN — v0.1

Convención:
- ID: SIFEN-XXX
- Tipo: Feature | Tech | Test | Docs
- Prioridad: P0 (bloqueante), P1, P2

## P0 — Bloqueantes (emisión SYNC completa)

### SIFEN-001 (Tech) Definir Ports + Adapters
- Crear interfaces: XmlGenPort, XmlSignPort, QrGenPort, SetApiPort.
- Crear adapters:
  - XmlGenAdapter → generateXMLDE :contentReference[oaicite:23]{index=23}
  - XmlSignAdapter → signXML :contentReference[oaicite:24]{index=24}
  - QrGenAdapter → generateQR :contentReference[oaicite:25]{index=25}
  - SetApiAdapter → recibe/consulta/etc :contentReference[oaicite:26]{index=26}

### SIFEN-002 (Feature) Mapper DEInput → params/data
- Implementar `buildEmisorParams(emisor_id)` (desde DB o config).
- Implementar `buildDEData(DEInput)` para FE contado/credito.
- Asegurar campos mínimos: establecimiento, punto, número, fecha, cliente, items, totales, condición.

### SIFEN-003 (Feature) Service IssueDESyncService
- Orquestar:
  - idempotencia por fiscal_key/cdc
  - xmlgen → xmlsign → qrgen → setapi.recibe
  - persistir artefactos y estado
- Guardar `correlation_id` por intento.

### SIFEN-004 (Tech) Persistencia extendida
- Migración SQL:
  - agregar columnas xml_unsigned/xml_signed/xml_qr/xml_sifen_returned
  - response_raw/status/message
  - send_attempts: correlation_id, operation, error_type, retry_count
- Índices y uniques.

### SIFEN-005 (Test) Unit tests de IssueDESyncService
- Mock adapters:
  - xmlgen retorna xml base
  - xmlsign retorna xml firmado
  - qrgen retorna xml con QR
  - setapi.recibe retorna xml/response
- Validar que persiste y cambia estado.

### SIFEN-006 (Docs) Documentar variables + secretos
- README de SIFEN:
  - credenciales de firma por emisor desde `emisor_certificados`
  - CSC por emisor desde `emisor_csc`
  - SIFEN_ENV test/prod
  - timeouts/retry

## P1 — Eventos + consultas

### SIFEN-010 (Feature) Generación XML de eventos
- Plantillas:
  - cancelación (por CDC)
  - inutilización (por rango / número)
- Validación mínima.

### SIFEN-011 (Feature) SendEventService
- setapi.evento(correlationId, xmlEvent, env, cert_path, key) :contentReference[oaicite:27]{index=27}
- Persistir en `de_events` + estado.

### SIFEN-012 (Feature) ConsultDEService (por CDC)
- setapi.consulta(correlationId, cdc, env, cert_path, key) :contentReference[oaicite:28]{index=28}
- Persistir última respuesta y exponer endpoint.

### SIFEN-013 (Feature) ConsultBatchService
- setapi.consultaLote(correlationId, numeroLote, env, cert_path, key) :contentReference[oaicite:29]{index=29}
- Persistir y exponer endpoint.

### SIFEN-014 (Test) Tests de eventos/consultas
- mocks setapi.evento/consulta/consultaLote
- validar persistencia

## P2 — Batch (sin worker y luego worker)

### SIFEN-020 (Feature) Crear batch (persistir)
- Endpoint: crea batch, asocia documentos existentes, estado PENDING.

### SIFEN-021 (Feature) Enviar batch manual
- setapi.recibeLote(correlationId, xmlSigned[], env, cert_path, key) :contentReference[oaicite:30]{index=30}
- Guardar numero_lote si aparece; estado SENT/ERROR.

### SIFEN-022 (Tech) Worker batch (iteración siguiente)
- Scheduler por intervalo
- reintentos por doc/batch
- límite de docs por lote

## Checklist “Done” para release v0.1
- Emisión SYNC FE contado/credito funcionando end-to-end (sin tocar SIFEN real en tests).
- Eventos cancelación/inutilización implementados.
- Consultas CDC/lote implementadas.
- Persistencia completa + trazabilidad.
- Documentación de configuración y operación.
