# Guía de Integración para Consumidores API — Facturación Electrónica SIFEN

**Versión:** 0.1  
**Fecha:** 2026-06-07  
**Aplica a:** integraciones externas (POS, ERP, ecommerce, sistemas de ventas)

---

## 1. Qué es un Consumidor API

Un consumidor API es una identidad máquina que representa tu sistema externo.  
A diferencia de los usuarios administradores humanos, el consumidor API:

- no inicia sesión en el backoffice;
- se autentica exclusivamente con una **API key** propia;
- solo puede operar sobre los **emisores y ambientes** que le fueron asignados;
- solo puede ejecutar las **acciones que le fueron habilitadas** (permisos).

El ADMIN_GLOBAL del sistema gestiona los consumidores. Si necesitás una API key, contactá al administrador.

---

## 2. Tu API Key

### Cómo obtenerla

El administrador crea tu consumidor API y te entrega **una sola vez** la API key completa.  
No es recuperable después. Si la perdés, el administrador puede rotar la key (invalida la anterior).

### Cómo usarla

Incluí la API key en cada request con el header `X-Api-Key`:

```http
POST /fcws/factura HTTP/1.1
X-Api-Key: <tu_api_key>
Content-Type: application/json
```

También podés usar `Authorization: Bearer <tu_api_key>`.

### Seguridad de la key

- Nunca expongas la key en código fuente, logs ni URLs.
- Guardala en variables de entorno o gestores de secretos.
- Si sospechás que fue comprometida, solicitá rotación de inmediato.

---

## 3. Errores de Autenticación y Autorización

| HTTP | Error | Causa |
|---|---|---|
| `401 UNAUTHORIZED` | `UNAUTHORIZED` | API key ausente, inválida o consumidor inactivo. |
| `403 FORBIDDEN` | `FORBIDDEN` | API key válida pero sin el permiso funcional requerido. |
| `403 FORBIDDEN` | `FORBIDDEN` | API key válida pero el emisor solicitado no está asignado. |
| `422 VALIDATION_ERROR` | `EMISOR_NOT_FOUND` | El `emisor_id` no existe en el sistema. |

---

## 4. Emitir una Factura Electrónica

### 4.1 Endpoint

```http
POST /fcws/factura
X-Api-Key: <tu_api_key>
Content-Type: application/json
```

### 4.2 Campo obligatorio: `idempotency_key`

Cada request de emisión **debe incluir** `client_reference.idempotency_key`.

Reglas:
- longitud: 8–80 caracteres;
- caracteres permitidos: letras (`A-Za-z`), números, guion (`-`) y guion bajo (`_`);
- debe ser único dentro de tu sistema para cada intención de emisión;
- si reintentás exactamente el mismo request con la misma key, el sistema devuelve el documento existente sin consumir nueva numeración.

**Recomendación**: usá el ID interno de tu transacción de venta como `idempotency_key`.

```json
{
  "emisor_id": "80136968-1",
  "numbering": { "authority": "SERVICE" },
  "timbrado": {
    "timbrado": "80136968",
    "establecimiento": "001",
    "puntoExpedicion": "001",
    "fecIni": "2025-12-30"
  },
  "receptor": {
    "tipoDocumento": "RUC",
    "docNro": "2005001",
    "dv": "3",
    "razonSocial": "EMPRESA COMPRADORA SA"
  },
  "fecha": "2026-06-07T14:30:00",
  "condicionOperacion": {
    "tipo": "CONTADO",
    "pagos": [{ "medio": "EFECTIVO", "monto": 500000 }]
  },
  "items": [{
    "codigo": "PROD-001",
    "descripcion": "Producto de prueba",
    "cantidad": 1,
    "precioUnitario": 500000,
    "ivaTipo": "IVA10"
  }],
  "envio": { "mode": "BATCH" },
  "client_reference": {
    "source_system": "mi-sistema-ventas",
    "idempotency_key": "VENTA-2026-06-07-00123"
  }
}
```

### 4.3 Respuesta exitosa

```json
{
  "document_id": "158",
  "document_uuid": "aef20ad1-1abd-4a70-897f-236bb46cd968",
  "cdc": "01801369681001001000108622026060712270544493",
  "nro_factura": "001-001-0001086",
  "status": "QUEUED_BATCH",
  "idempotent": false,
  "delivery_mode": "BATCH",
  ...
}
```

**Campo clave: `document_uuid`** — guardalo en tu sistema. Es el identificador permanente del documento que usarás para consultas, lineaje y auditoría.

### 4.4 Modos de envío

| `mode` | Comportamiento |
|---|---|
| `SYNC` | Envía inmediatamente a SIFEN. La respuesta incluye el estado fiscal final (`APPROVED`, `REJECTED`, etc.). |
| `BATCH` | Encola el documento. El worker lo envía en el próximo ciclo (por defecto cada 60s). HTTP 200 con `status: QUEUED_BATCH`. |
| `AUTO` | Intenta `SYNC` y, ante falla técnica o servicio síncrono no habilitado (código SIFEN 1264), cae a `BATCH`. HTTP 202. |

---

## 5. Idempotencia: Recuperar una Transacción Perdida

### 5.1 El problema

Tu sistema envió un request de emisión pero:
- el timeout expiró antes de recibir la respuesta;
- la conexión se cortó;
- el servidor devolvió un error 5xx transitorio.

No sabés si la factura fue creada.

### 5.2 La solución: reintentar con la misma `idempotency_key`

Simplemente enviá el mismo request **exacto** con la misma `idempotency_key`.  
El sistema detecta la clave, devuelve el documento existente y **no genera nueva numeración**.

```json
{
  "idempotent": true,
  "document_id": "158",
  "document_uuid": "aef20ad1-1abd-4a70-897f-236bb46cd968",
  "cdc": "01801369681001001000108622026060712270544493",
  "nro_factura": "001-001-0001086",
  "status": "QUEUED_BATCH"
}
```

La respuesta incluye `"idempotent": true` y el HTTP code es `200`.  
Tratá esta respuesta igual que una emisión exitosa nueva.

### 5.3 Lógica de reintentos recomendada

```
1. Enviar request con idempotency_key única.
2. Si respuesta 200/202 → guardar document_uuid, fin.
3. Si respuesta 4xx (400, 422) → error de datos, no reintentar con la misma key.
4. Si timeout o 5xx → esperar 2–5 segundos y reintentar con la MISMA key.
5. Máximo 3 reintentos. Si siguen fallando → pasar a conciliación (sección 6).
```

---

## 6. Conciliación por Idempotencia

Cuando el reintento directo no es suficiente (por ejemplo, después de una ventana de mantenimiento o pérdida de logs), podés consultar el estado de varias transacciones por lote.

### 6.1 Endpoint

```http
POST /fcws/conciliacion/idempotency
X-Api-Key: <tu_api_key>
Content-Type: application/json
```

**Permiso requerido:** `IDEMPOTENCY_RECONCILE`

### 6.2 Request

```json
{
  "emisor_id": "80136968-1",
  "env": "prod",
  "from": "2026-06-07T00:00:00-04:00",
  "to": "2026-06-07T23:59:59-04:00",
  "idempotency_keys": [
    "VENTA-2026-06-07-00123",
    "VENTA-2026-06-07-00124",
    "VENTA-2026-06-07-00125"
  ]
}
```

Restricciones:
- `from` y `to` son **obligatorios** (ISO 8601 con offset de zona horaria);
- rango máximo: **7 días**;
- máximo **100 keys por request**.

### 6.3 Respuesta

```json
{
  "consumer": { "id": "2", "code": "pos-e2e-2" },
  "emisor_id": "80136968-1",
  "env": "prod",
  "from": "2026-06-07T00:00:00-04:00",
  "to": "2026-06-07T23:59:59-04:00",
  "items": [
    {
      "idempotency_key": "VENTA-2026-06-07-00123",
      "result": "IMPACTED",
      "document_uuid": "aef20ad1-1abd-4a70-897f-236bb46cd968",
      "document_id": "158",
      "current_cdc": "0180136968100100100010862...",
      "status": "QUEUED_BATCH",
      "nro_factura": "001-001-0001086",
      "created_at": "2026-06-07T14:30:00-04:00"
    },
    {
      "idempotency_key": "VENTA-2026-06-07-00124",
      "result": "NOT_IMPACTED",
      "message": "No existe transaccion registrada para esa idempotency_key en el rango consultado."
    }
  ]
}
```

### 6.4 Resultados posibles por ítem

| `result` | Significado | Acción |
|---|---|---|
| `IMPACTED` | La solicitud impactó. Existe documento. | Guardar `document_uuid` y sincronizar estado. |
| `NOT_IMPACTED` | No existe documento en el rango. | La transacción no se procesó. Podés reintentar la emisión con la misma key. |
| `DUPLICATE_CONFLICT` | Múltiples documentos para la misma clave. | Contactar soporte con la `idempotency_key` afectada. |
| `INVALID_KEY` | El valor no cumple el formato. | Corregir el formato (`^[A-Za-z0-9_-]{8,80}$`). |

---

## 7. Cancelar Envío Local (Cancel-Send por Idempotencia)

Si tu sistema emitió una factura y la encoló (`QUEUED_BATCH`), pero luego necesitás cancelarla **antes** de que el worker la transmita a SIFEN, podés usar este endpoint.

**Solo aplica si:**
- el documento está en estado `QUEUED_BATCH`;
- el worker de batch aún no lo transmitió (`last_sent_at` es nulo).

**No aplica para:**
- documentos ya aprobados → usar cancelación fiscal SIFEN (evento `CANCEL_FISCAL`);
- documentos con cualquier evidencia de transmisión.

### 7.1 Endpoint

```http
POST /fcws/conciliacion/idempotency/cancel-send
X-Api-Key: <tu_api_key>
Content-Type: application/json
```

**Permiso requerido:** `CANCEL_SEND`

### 7.2 Request

```json
{
  "emisor_id": "80136968-1",
  "env": "prod",
  "idempotency_key": "VENTA-2026-06-07-00123",
  "reason": "Cliente anuló la venta antes de la facturación."
}
```

### 7.3 Respuesta exitosa

```json
{
  "result": "CANCELLED_LOCAL",
  "document_uuid": "aef20ad1-1abd-4a70-897f-236bb46cd968",
  "document_id": "158",
  "previous_status": "QUEUED_BATCH",
  "status": "DRAFT"
}
```

### 7.4 Errores posibles

| HTTP | Error | Causa |
|---|---|---|
| `200` | `result: NOT_IMPACTED` | No existe documento para la key. |
| `409` | `INVALID_DOCUMENT_STATUS` | Documento no está en `QUEUED_BATCH`. |
| `409` | `TRANSMISSION_EVIDENCE_DETECTED` | El worker ya transmitió el documento. |
| `409` | `DUPLICATE_CONFLICT` | Múltiples documentos para la clave (soporte). |

Después de un cancel-send exitoso, el documento vuelve a estado `DRAFT`. Podés reintentar la emisión con la misma `idempotency_key` (si querés rehacerla) o con una nueva key (si el negocio cambió).

---

## 8. Identidad Canónica del Documento: `document_uuid`

Una vez que emitís un documento, guardá siempre el `document_uuid`. Es el identificador permanente e inmutable.

```
document_uuid = aef20ad1-1abd-4a70-897f-236bb46cd968
```

Con el `document_uuid` podés consultar:

| Endpoint | Información |
|---|---|
| `GET /fcws/documentos/{uuid}` | Estado completo del documento. |
| `GET /fcws/documentos/{uuid}/xml` | XML vigente (sin firma, firmado, con QR). |
| `GET /fcws/documentos/{uuid}/sifen` | Estado fiscal SIFEN actual. |
| `GET /fcws/documentos/{uuid}/eventos` | Cancelaciones, inutilizaciones. |
| `GET /fcws/documentos/{uuid}/lineage` | Historial de CDC (trazabilidad fiscal). |
| `GET /fcws/documentos/{uuid}/files/kude.pdf` | KUDE PDF. |

Si en algún momento perdés el `document_uuid` pero tenés el CDC (código de control), podés recuperarlo:

```http
GET /fcws/documentos/by-cdc/{cdc}
```

---

## 9. Permisos Funcionales

El administrador configura qué puede hacer tu consumidor. Los permisos disponibles:

| Permiso | Acción habilitada |
|---|---|
| `FACTURA_EMIT` | `POST /fcws/factura` |
| `DOCUMENTO_READ` | Consultas canónicas por `document_uuid` del emisor asignado. |
| `SIFEN_STATUS_READ` | Consulta de estado SIFEN. |
| `IDEMPOTENCY_RECONCILE` | `POST /fcws/conciliacion/idempotency` |
| `CANCEL_SEND` | `POST /fcws/conciliacion/idempotency/cancel-send` |

Si intentás usar un endpoint sin el permiso correspondiente, recibirás `403 FORBIDDEN`.

---

## 10. Escenarios Operativos Frecuentes

### 10.1 Venta confirmada, timeout en la respuesta

```
1. Emitir con idempotency_key = "VENTA-001"
2. Timeout → no sabés si impactó
3. Reintentar con la misma key → response con idempotent: true → OK
4. Guardar document_uuid
```

### 10.2 Pérdida de log de múltiples transacciones

```
1. POST /conciliacion/idempotency con las keys afectadas + rango de fechas
2. Para cada NOT_IMPACTED → reintentar emisión con la misma key
3. Para cada IMPACTED → sincronizar document_uuid en tu sistema
4. Para DUPLICATE_CONFLICT → escalar a soporte
```

### 10.3 Cliente anuló antes de que se facture

```
1. Emitir con idempotency_key → QUEUED_BATCH
2. Cliente cancela antes del siguiente ciclo batch
3. POST /conciliacion/idempotency/cancel-send con la key
4. Si result=CANCELLED_LOCAL → el número queda disponible para reintento
5. Si 409 TRANSMISSION_EVIDENCE_DETECTED → el documento ya fue enviado,
   gestionar cancelación fiscal desde el backoffice
```

### 10.4 Cambio de datos de la venta antes de transmitir

```
1. Cancel-send por idempotency_key (revierte a DRAFT)
2. Emitir con UNA NUEVA idempotency_key con los datos correctos
   (la key anterior quedó "usada" por el documento cancelado; para evitar confusiones
    en conciliación futura, usar una key nueva)
```

---

## 11. Límites y Restricciones

| Recurso | Límite |
|---|---|
| `idempotency_key` longitud | 8–80 caracteres |
| `idempotency_key` formato | `^[A-Za-z0-9_-]{8,80}$` |
| Keys por request de conciliación | máx 100 |
| Rango de fechas en conciliación | máx 7 días |
| Rango audit-logs admin | máx 30 días |

---

## 12. Contacto y Soporte

Para obtener o rotar una API key, configurar permisos, o escalar casos `DUPLICATE_CONFLICT`:

- Contactar al **ADMIN_GLOBAL** del sistema.
- Proporcionar: código del consumidor (`consumer_code`), `idempotency_key` afectada y rango de fechas.
