# PLAN — Módulo SIFEN — v0.1

## 1. Entregables
1) Infraestructura de integración:
   - Adapters: xmlgen, xmlsign, qrgen, setapi
   - Ports/Interfaces + wiring en services
2) Casos de uso:
   - Emisión SYNC end-to-end
   - Eventos (cancelación / inutilización)
   - Consultas (CDC / lote)
   - Batch (solo creación y persistencia; worker en siguiente iteración)
3) Persistencia extendida:
   - Campos xml_* + respuesta raw + estados
   - Send attempts con reintentos
4) Tests:
   - Unit tests de mapeo (DEInput → params/data)
   - Unit tests de services con mocks de adapters
   - Integration test mínimo con DB (sin tocar SIFEN real)
5) Documentación:
   - Cómo configurar certificados y secretos
   - Flujos y troubleshooting

## 2. Fases
### Fase A — “Core generación”
- Implementar mapper DB/request → `params` + `data`
- `xmlgen.generateXMLDE(...)` :contentReference[oaicite:16]{index=16}
- Persistir xml_unsigned + CDC extraído

### Fase B — “Firma + QR”
- `xmlsign.signXML(xml, p12Path, p12Pass)` :contentReference[oaicite:17]{index=17}
- `qrgen.generateQR(xmlSigned, idCSC, CSC, env)` :contentReference[oaicite:18]{index=18}
- Persistir xml_signed + xml_qr

### Fase C — “Envío SYNC”
- `setapi.recibe(correlationId, xmlSignedOrQr, env, cert_path, key)` :contentReference[oaicite:19]{index=19}
- Parse básico de respuesta (guardar raw) + estado ACCEPTED/REJECTED

### Fase D — “Eventos”
- Generador XML evento (plantillas propias)
- Envío `setapi.evento(...)` :contentReference[oaicite:20]{index=20}
- Persistir `de_events`

### Fase E — “Batch (sin worker)”
- Endpoint create batch: valida docs, guarda, estado PENDING
- Endpoint send batch manual: llama `recibeLote` :contentReference[oaicite:21]{index=21}

### Fase F — “Consultas”
- `setapi.consulta(...)` y `consultaLote(...)` :contentReference[oaicite:22]{index=22}
- Persistir última respuesta

## 3. Configuración necesaria (prod)
- Certificado P12 para firma (xmlsign).
- CSC (idCSC + CSC) para QR.
- Credenciales/archivos para setapi: `cert_path` y `key` (mTLS o firma del request según la lib).
- ENV: test/prod, timeouts, retry policy.
- IP/ambiente habilitado por SET según corresponda.

## 4. Riesgos y mitigación
- Ambigüedad de “cert_path/key” en setapi:
  - Se implementa como passthrough via env vars; se documenta formato esperado por la lib.
- Diferencias entre “XML con QR” retornado por setapi:
  - Se persiste `xml_sifen_returned` y se guarda trazabilidad.
- Rechazos por mapeo MT150:
  - Tests de mapeo + validación previa con xmlgen.