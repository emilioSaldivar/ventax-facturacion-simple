# SPEC — Módulo SIFEN (Arquitectura + Integración setapi) — v0.1

## 0. Objetivo
Implementar el “núcleo SIFEN” del servicio:
- Construcción del XML (MT 150) desde datos normalizados.
- Firma XML (DSIG) usando PKCS#12.
- Generación QR (AA002) de forma independiente.
- Envío a SET/SIFEN: síncrono y por lotes.
- Gestión de eventos: cancelación e inutilización.
- Consultas: comprobante por CDC, estado de lote, eventos.
- Persistencia + trazabilidad + reintentos.

Fuera de alcance en este SPEC:
- KUDE (ya lo tenés).
- Envío por correo (ya lo tenés).
- Multi-tenant (se deja preparado por emisor_id).

## 1. Alcance MVP v0.1 (funcional)
### 1.1 Emisión de Documento Electrónico (DE)
- Tipos: Factura Electrónica (FE).
- Condición: CONTADO y CRÉDITO (misma generación XML; cambia el bloque de condición/forma de pago).
- Flujo:
  1) Normalizar request → “DEInput”
  2) Obtener “EmisorParams” (estáticos) + “DEData” (variables por factura)
  3) Generar XML sin firma (xmlgen)
  4) Firmar XML (xmlsign)
  5) Generar QR y embebido en XML (qrgen)
  6) Persistir artefactos (xml unsigned / signed / con qr) y metadatos (CDC, dId, nro fiscal)
  7) Envío SYNC a SIFEN (setapi.recibe)
  8) Persistir respuesta SIFEN y estado final

### 1.2 Envío por lotes
- Recepción de N documentos firmados con QR (o firmados sin QR si SIFEN responde con QR embebido).
- Envío `setapi.recibeLote(id, xmlSigned[], env, cert_path, key)` :contentReference[oaicite:4]{index=4}
- Persistir:
  - batch_id, numero_lote (si aplica), lista de docs, intentos, respuesta.
- Consulta de lote: `setapi.consultaLote(id, numeroLote, env, cert_path, key)` :contentReference[oaicite:5]{index=5}
- Worker/cron de batch: fuera del alcance de este SPEC (solo arquitectura y hooks).

### 1.3 Eventos
- Evento de cancelación: generar XML de evento y enviar con `setapi.evento(...)` :contentReference[oaicite:6]{index=6}
- Evento de inutilización: idem
- Persistir eventos y respuesta.

### 1.4 Consultas
- Consulta de DE por CDC: `setapi.consulta(id, cdc, env, cert_path, key)` :contentReference[oaicite:7]{index=7}
- Consulta estado lote (si aplica): `setapi.consultaLote(...)` :contentReference[oaicite:8]{index=8}
- (Opcional) Consulta RUC: `setapi.consultaRuc(...)` :contentReference[oaicite:9]{index=9}

## 2. Requisitos no funcionales (producción)
### 2.1 Idempotencia
- Emisión SYNC: clave idempotente por “fiscal_key” (emisor + establecimiento + punto + numero + tipoDoc + fecha) y/o por `cdc`.
- Si llega el mismo requestId o fiscal_key:
  - devolver el registro existente (sin regenerar ni reenviar) salvo que se indique “force_retry”.
- En BD:
  - unique(cdc), unique(fiscal_key), unique(did) (si aplica).

### 2.2 Resiliencia
- Reintentos con backoff para envíos (SYNC y lote).
- Circuit breaker por endpoint SIFEN.
- Timeouts configurables.
- Cola de “send_attempts” con estados: PENDING, SUCCESS, FAILED_RETRYABLE, FAILED_FINAL.

### 2.3 Auditoría y trazabilidad
- Guardar:
  - xml_unsigned, xml_signed, xml_qr (si se usa)
  - request normalized
  - respuesta SIFEN (raw)
  - timestamps y correlación (correlation_id)
- Logs con redacción de secretos.

### 2.4 Seguridad
- Secrets por variables de entorno o Docker secrets (certificados).
- Nunca loguear:
  - password de P12
  - clave CSC
  - key/cert de setapi
- Autenticación API por `X-API-Key` (excepto /health).

## 3. Diseño por capas (arquitectura)
### 3.1 Dominio (types + reglas)
- `DEInput` (request normalizado)
- `DEArtifacts` (xmlUnsigned/xmlSigned/xmlWithQR)
- `DESifenResponse` (respuesta parseable)
- `DEStatus` (DRAFT, GENERATED, SIGNED, QR, SENT_SYNC, SENT_BATCH, ACCEPTED, REJECTED, ERROR)
- `EventType` (CANCELACION, INUTILIZACION)

### 3.2 Application Services (casos de uso)
- `IssueDESyncService`
- `IssueDEBatchService` (solo create batch + enqueue, no worker)
- `SendEventService`
- `ConsultDEService`
- `ConsultBatchService`

### 3.3 Infra Adapters (librerías)
- `XmlGenAdapter` → `xmlgen.generateXMLDE(params, data, options)` :contentReference[oaicite:10]{index=10}
- `XmlSignAdapter` → `xmlsign.signXML(xmlString, p12Path, p12Password)` :contentReference[oaicite:11]{index=11}
- `QrGenAdapter` → `qrgen.generateQR(xmlSigned, idCSC, CSC, env)` :contentReference[oaicite:12]{index=12}
- `SetApiAdapter` → `setApi.recibe / recibeLote / evento / consulta / consultaLote / consultaRuc` :contentReference[oaicite:13]{index=13}

### 3.4 Repositorios (BD)
- `DeDocumentsRepository`
- `DeSendAttemptsRepository`
- `DeBatchesRepository`
- `DeEventsRepository`
- `DeSequencesRepository` (numeración fiscal / próxima)

## 4. Integración setapi (detalles operativos)
### 4.1 Parámetros requeridos por setapi
En todas las operaciones:
- `id`: string de correlación/identificación (definir como `correlation_id` UUID por intento).
- `env`: “test” | “prod”. :contentReference[oaicite:14]{index=14}
- `cert_path` y `key`: se resuelven por emisor desde `emisor_certificados` (`cert_path` y `password_value`).
- `xmlSigned`: XML firmado (y opcionalmente con QR pre-insertado, según estrategia).

### 4.2 Estrategia de QR
- Opción A (recomendada): generar QR local (qrgen) y embebir antes de enviar.
- Opción B: enviar firmado sin QR y almacenar el XML respuesta si setapi retorna “XML con QR”.
Nota: setapi README muestra `.then(xml => console.log("XML con QR", xml))`, lo que sugiere que puede devolver XML modificado. :contentReference[oaicite:15]{index=15}

Se implementa A por control y consistencia; si la respuesta trae cambios, se persiste como `xml_sifen_returned`.

### 4.3 Errores
- Clasificar errores:
  - Retryable: timeouts, 5xx, conexión
  - No retryable: validación, rechazo SIFEN (según código)
- Guardar `raw_response` y `error_stack`.

## 5. Contratos internos (interfaces)
### 5.1 XmlGenPort
- `generate(params: EmisorParams, data: DEData, options?: object): Promise<string>`

### 5.2 XmlSignPort
- `sign(xml: string, p12Path: string, p12Password: string): Promise<string>`

### 5.3 QrGenPort
- `attachQr(xmlSigned: string, idCSC: string|number, csc: string, env: "test"|"prod"): Promise<string>`

### 5.4 SetApiPort
- `sendSync(correlationId: string, xml: string, env: "test"|"prod", certPath: string, key: string): Promise<string>`
- `sendBatch(correlationId: string, xmlList: string[], env, certPath, key): Promise<string>`
- `sendEvent(correlationId: string, xmlEvent: string, env, certPath, key): Promise<string>`
- `consultByCdc(correlationId: string, cdc: string, env, certPath, key): Promise<string>`
- `consultBatch(correlationId: string, numeroLote: string|number, env, certPath, key): Promise<string>`
- `consultRuc(correlationId: string, ruc: string, env, certPath, key): Promise<string>`

## 6. Persistencia (mínimo requerido)
Tablas MVP existentes + ajustes:
- `de_documents`: agregar campos:
  - `xml_unsigned`, `xml_signed`, `xml_qr`, `xml_sifen_returned`
  - `sifen_status`, `sifen_message`, `sifen_response_raw`
- `de_send_attempts`: agregar:
  - `operation` (SYNC|BATCH|EVENT|CONSULT)
  - `correlation_id`
  - `http_status` (si aplica), `error_type`, `retry_after`
- `de_batches` / `de_batch_documents`: agregar `numero_lote` cuando exista.
- `de_events`: `event_type`, `xml_event`, `response_raw`.

## 7. Endpoints (conexión con OpenAPI existente)
- `POST /fcws/factura` → `IssueDESyncService` (generar+firmar+qr+sendSync)
- `POST /fcws/factura/lote` → create batch + persist + enqueue (sin worker)
- `POST /fcws/evento/cancelar` → `SendEventService`
- `POST /fcws/evento/inutilizacionnumfactura` → `SendEventService`
- `GET /fcws/consultar/comprobanteSifen/{cdc}` → `ConsultDEService`
- `GET /fcws/consultar/lote/{numeroLote}` → `ConsultBatchService`
- Listados: `GET /fcws/facturas`, `GET /fcws/facturas/{id}`, `GET /fcws/eventos`

## 8. Definición de “listo para producción”
- Docker compose levanta API + Postgres.
- Variables de entorno validadas (zod).
- Healthcheck incluye conectividad a DB (y opcional ping setapi).
- Logs sin secretos.
- Reintentos controlados.
- Persistencia completa de artefactos y respuesta SIFEN.
