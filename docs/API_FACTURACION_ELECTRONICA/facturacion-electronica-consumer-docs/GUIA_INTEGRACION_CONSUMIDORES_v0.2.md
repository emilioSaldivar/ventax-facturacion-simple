# Guía de Integración para Consumidores API — Facturación Electrónica SIFEN

**Versión:** 0.3 (agrega Recibos de Dinero Firmados)
**Fecha:** 2026-07-24
**Aplica a:** integraciones externas (POS, ERP, ecommerce, sistemas de ventas)

> **Corrección importante respecto a versiones previas de esta guía:** el sistema hoy usa **dos claves distintas**, no una sola API key universal con permisos por consumidor. Ver la sección 2 antes de integrar. Esta corrección aplica al contenido de las secciones 2, 6, 7, 8 y 13.

> **Novedad v0.3:** se agrega la sección 16 (subsecciones 16.1-16.12), **Recibos de Dinero Firmados Digitalmente** — un comprobante de cobro/pago con firma digital propia (Ley N.º 6822/2021), independiente de SIFEN (no es un DE, no tiene CDC, nunca se transmite a DNIT). Usa exclusivamente la clave de consumidor (sin la ambigüedad de la clave compartida). Reverificado en esta revisión: las secciones 2, 3 y 13 (modelo de autenticación y permisos) siguen describiendo fielmente el comportamiento actual del sistema — no se detectó otro desalineamiento en el resto de la guía.

---

## 1. Qué es un Consumidor API

Un consumidor API es una identidad máquina que representa tu sistema externo.
A diferencia de los usuarios administradores humanos, el consumidor API:

- no utiliza el panel administrativo;
- se autentica con una **API key** propia;
- solo puede operar sobre los **emisores y ambientes** que le fueron asignados;
- solo puede ejecutar las **acciones que le fueron habilitadas** (permisos).

Estas tres últimas propiedades aplican a los endpoints que usan tu clave de consumidor (`/factura`, `/conciliacion/idempotency*`, `/recibos/*`). Para el resto de la API (`/nota-credito`, `/evento/*`, `/consultar/*`, `/documentos/*`, `/files/*`) autenticás con una clave compartida que no distingue por consumidor ni por emisor — ver sección 2 para el detalle completo.

El proveedor del servicio gestiona los consumidores. Si necesitás una API key, contactá al responsable de la integración.

---

## 2. Tus API Keys (son dos, no una)

El sistema usa hoy **dos mecanismos de autenticación distintos, no intercambiables**. Vas a necesitar ambas claves para poder usar toda la API.

| Clave | Qué es | Endpoints que la requieren |
|---|---|---|
| **Clave de consumidor** (`consumer_api_key`) | Individual por consumidor. Tiene permisos propios (`FACTURA_EMIT`, `IDEMPOTENCY_RECONCILE`, `CANCEL_SEND`) y alcance limitado a los emisores/ambientes que te asignaron. | `POST /v1/factura`, `POST /v1/conciliacion/idempotency`, `POST /v1/conciliacion/idempotency/cancel-send` |
| **Clave compartida** (`shared_api_key`) | Una sola clave global, compartida entre **todos** los consumidores del sistema. No tiene permisos por consumidor ni alcance por emisor: quien la tiene puede consultar, descargar o accionar sobre documentos de **cualquier** emisor dado de alta en el servicio. | `POST /v1/nota-credito`, `POST /v1/evento/cancelar`, `POST /v1/evento/inutilizacionnumfactura`, todo `GET /v1/consultar/*`, `GET /v1/documentos/*`, `GET /v1/files/*` |

Ambas viajan en el **mismo header**, `X-Api-Key` (o `Authorization: Bearer <key>`) — la diferencia está en qué valor corresponde a cada endpoint, no en el nombre del header.

### Cómo obtenerlas

- La **clave de consumidor** te la entrega el administrador **una sola vez**, al crear tu consumidor API. No es recuperable después; si la perdés, el administrador rota la key (invalida la anterior).
- La **clave compartida** te la entrega el administrador junto con la clave de consumidor. Al ser una clave global, su rotación afecta a todos los consumidores — coordinar con el administrador antes de solicitar rotación.

### Cómo usarlas

```http
POST /v1/factura HTTP/1.1
X-Api-Key: <tu_clave_de_consumidor>
Content-Type: application/json
```

```http
GET /v1/documentos/{uuid}/sifen HTTP/1.1
X-Api-Key: <clave_compartida>
```

### Seguridad de las keys

- Nunca expongas ninguna de las dos keys en código fuente, logs ni URLs.
- Guardalas en variables de entorno o gestores de secretos, con nombres que dejen claro cuál es cuál (evita bugs de usar la key equivocada en el endpoint equivocado).
- Tratá la clave compartida con **especial cuidado**: al no tener alcance por emisor, una fuga expone datos de otros emisores/consumidores, no solo los tuyos.
- Si sospechás que alguna fue comprometida, solicitá rotación de inmediato.

---

## 3. Errores de Autenticación y Autorización

**En endpoints con clave de consumidor** (`/factura`, `/conciliacion/idempotency*`):

| HTTP | Error | Causa |
|---|---|---|
| `401 UNAUTHORIZED` | `UNAUTHORIZED` | Clave de consumidor ausente, inválida o consumidor inactivo. |
| `403 FORBIDDEN` | `FORBIDDEN` | Clave válida pero sin el permiso funcional requerido. |
| `403 FORBIDDEN` | `FORBIDDEN` | Clave válida pero el emisor solicitado no está asignado a tu consumidor. |
| `422 VALIDATION_ERROR` | `EMISOR_NOT_FOUND` | El `emisor_id` no existe en el sistema. |

**En endpoints con clave compartida** (`/nota-credito`, `/evento/*`, `/consultar/*`, `/documentos/*`, `/files/*`):

| HTTP | Error | Causa |
|---|---|---|
| `401 UNAUTHORIZED` | `UNAUTHORIZED` | Clave compartida ausente o inválida. |

No hay `403` en estos endpoints: la clave compartida no valida permisos ni alcance por emisor. Si la clave es correcta, la request procede sobre cualquier emisor/documento que exista en el sistema.

---

## 4. Lo Que el Administrador Configura para Vos

Antes de emitir, el administrador del servicio configura:

- **`emisor_id`**: identifica al facturador electrónico. Se expresa como `RUC-DV` (ej: `80136968-1`). El administrador te informa cuál usar.
- **Timbrado fiscal**: número de timbrado, establecimiento, punto de expedición y fecha de inicio de vigencia. Estos valores son asignados por SET/DNIT y registrados en el sistema. El administrador te provee los valores exactos que debés usar en cada request.
- **Ambiente**: `test` (homologación SIFEN) o `prod` (producción). El administrador asigna tu consumidor a uno o ambos.

Vos no administrás timbrados, establecimientos, ni emisores. Si necesitás un nuevo timbrado habilitado o un cambio en la configuración fiscal, contactá al administrador del servicio.

---

## 5. Emitir una Factura Electrónica

### 5.1 Endpoint

```http
POST /v1/factura
X-Api-Key: <tu_clave_de_consumidor>
Content-Type: application/json
```

**Permiso requerido:** `FACTURA_EMIT`

### 5.2 Campo obligatorio: `idempotency_key`

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
  "fecha": "2026-07-03T14:30:00",
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
    "idempotency_key": "VENTA-2026-07-03-00123"
  }
}
```

Los valores de `timbrado`, `establecimiento`, `puntoExpedicion` y `fecIni` son los que te provee el administrador.
`numbering: { "authority": "SERVICE" }` indica que el servicio asigna automáticamente el número de comprobante.

### 5.3 Respuesta exitosa

```json
{
  "document_id": "158",
  "document_uuid": "aef20ad1-1abd-4a70-897f-236bb46cd968",
  "cdc": "01801369681001001000108622026070312270544493",
  "nro_factura": "001-001-0001086",
  "status": "QUEUED_BATCH",
  "idempotent": false,
  "delivery_mode": "BATCH"
}
```

**Campo clave: `document_uuid`** — guardalo en tu sistema. Es el identificador permanente del documento que usarás para consultas, lineaje y auditoría.

### 5.4 Modos de envío

| `mode` | Comportamiento |
|---|---|
| `SYNC` | Envía inmediatamente a SIFEN. La respuesta incluye el estado fiscal final (`APPROVED`, `REJECTED`, etc.). |
| `BATCH` | Encola el documento. El worker lo envía en el próximo ciclo (por defecto cada 60s). HTTP 200 con `status: QUEUED_BATCH`. |
| `AUTO` | Intenta `SYNC` y, ante falla técnica, cae a `BATCH`. HTTP 202. |

---

## 6. Emitir una Nota de Crédito Electrónica

Una Nota de Crédito Electrónica (NCE) reduce o anula el monto de una factura ya emitida. Puede referenciar una factura electrónica local o un documento impreso.

### 6.1 Endpoint

```http
POST /v1/nota-credito
X-Api-Key: <clave_compartida>
Content-Type: application/json
```

Usa la **clave compartida**, no la clave de consumidor (ver sección 2). No hay validación de permiso ni de alcance por emisor: cualquier tenedor de la clave compartida puede emitir NCE para cualquier emisor dado de alta en el servicio.

### 6.2 Motivos de emisión

El campo `motivo.codigo` es un entero del catálogo SIFEN:

| Código | Descripción |
|---|---|
| `1` | Devolución de mercaderías |
| `2` | Descuento |
| `3` | Devolución de mercaderías y descuento |
| `4` | Error de carga |

### 6.3 Tipo de referencia

#### Referencia electrónica — factura local

Usá cuando la FE a acreditar fue emitida por este sistema. Referenciás el CDC de esa factura.

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
  "fecha": "2026-07-03T15:00:00",
  "motivo": { "codigo": 2 },
  "referencia": {
    "tipo": "ELECTRONICO",
    "cdc": "01801369681001001000108622026070312270544493"
  },
  "items": [{
    "codigo": "DESC-001",
    "descripcion": "Descuento por volumen",
    "cantidad": 1,
    "precioUnitario": 50000,
    "ivaTipo": "IVA10"
  }],
  "envio": { "mode": "SYNC" }
}
```

Si el CDC referenciado no existe en el sistema, la respuesta es `404`.
Si el monto acumulado de NCE supera el total de la FE original, la respuesta es `409`.

#### Referencia impresa — documento no electrónico

Usá cuando la factura original fue un comprobante impreso (no electrónico).

```json
{
  ...
  "referencia": {
    "tipo": "IMPRESO",
    "timbrado": "12345678",
    "establecimiento": "001",
    "puntoExpedicion": "001",
    "numero": "0000123",
    "fecha": "2026-06-15"
  }
}
```

### 6.4 Respuesta exitosa

```json
{
  "document_id": "210",
  "document_uuid": "c3f8a21b-5e2d-4f0a-9b1c-7d3e6f8a0b2c",
  "cdc": "05801369681001001000000012026070315001234567",
  "nro_documento": "001-001-0000001",
  "status": "APPROVED",
  "idempotent": false,
  "delivery_mode": "SYNC"
}
```

Guardá el `document_uuid` de la NCE al igual que el de la FE.

---

## 7. Cancelar un Documento Electrónico

La cancelación fiscal notifica a SIFEN que un documento aprobado fue anulado. Es una operación fiscal irreversible.

**Diferencia con cancel-send (sección 11):** el cancel-send retira un documento de la cola de envío *antes* de transmitirlo a SIFEN. La cancelación fiscal, en cambio, actúa sobre documentos ya *aprobados* por SIFEN.

### 7.1 Endpoint

```http
POST /v1/evento/cancelar
X-Api-Key: <clave_compartida>
Content-Type: application/json
```

Usa la **clave compartida**, no la clave de consumidor (ver sección 2). No hay validación de permiso ni de alcance por emisor: cualquier tenedor de la clave compartida puede cancelar documentos de cualquier emisor dado de alta en el servicio.

### 7.2 Condiciones de elegibilidad

- El documento debe estar en estado `APPROVED` o `APPROVED_WITH_OBS`.
- Debe estar dentro de la **ventana de 48 horas** desde la aprobación SIFEN.
- No aplica a documentos en `QUEUED_BATCH`, `DRAFT`, `REJECTED`, etc.

### 7.3 Request

```json
{
  "emisor_id": "80136968-1",
  "cdc": "01801369681001001000108622026070312270544493",
  "motivo": "El cliente solicitó anulación de la compra."
}
```

| Campo | Descripción |
|---|---|
| `emisor_id` | RUC completo del emisor (provisto por el administrador). |
| `cdc` | CDC del documento a cancelar. Usá el `cdc` devuelto en la emisión o el `current_cdc` de la consulta canónica. |
| `motivo` | Razón de la cancelación (texto libre, máx. 150 caracteres). |

### 7.4 Respuesta exitosa

```json
{
  "event_id": "45",
  "status": "SENT",
  "sifen": {
    "result_code": "0260",
    "result_message": "Aprobado"
  }
}
```

### 7.5 Errores posibles

| HTTP | Error | Causa |
|---|---|---|
| `404` | `DOCUMENT_NOT_FOUND` | CDC no existe en el sistema. |
| `409` | `INVALID_DOCUMENT_STATUS` | El documento no está en estado `APPROVED` / `APPROVED_WITH_OBS`. |
| `409` | `CANCELLATION_WINDOW_EXPIRED` | Pasaron más de 48 horas desde la aprobación SIFEN. |

---

## 8. Inutilizar Numeración

Cuando números de comprobante quedaron sin uso por errores de sistema, pruebas u otras razones, se deben inutilizar ante SIFEN para cerrar el rango.

### 8.1 Endpoint

```http
POST /v1/evento/inutilizacionnumfactura
X-Api-Key: <clave_compartida>
Content-Type: application/json
```

Usa la **clave compartida**, no la clave de consumidor (ver sección 2). No hay validación de permiso ni de alcance por emisor: cualquier tenedor de la clave compartida puede inutilizar numeración de cualquier emisor dado de alta en el servicio.

### 8.2 Request

```json
{
  "emisor_id": "80136968-1",
  "establecimiento": "001",
  "puntoExpedicion": "001",
  "desdeNumero": "0000123",
  "hastaNumero": "0000125",
  "motivo": "Números generados durante una prueba de conectividad no utilizados."
}
```

| Campo | Descripción |
|---|---|
| `emisor_id` | RUC completo del emisor. |
| `establecimiento` | Código de establecimiento (provisto por el administrador). |
| `puntoExpedicion` | Punto de expedición (provisto por el administrador). |
| `desdeNumero` | Primer número del rango a inutilizar (7 dígitos con ceros iniciales). |
| `hastaNumero` | Último número del rango (máx. 1000 números en un solo request). |
| `motivo` | Razón de la inutilización (texto libre, máx. 150 caracteres). |

Restricciones:
- El rango debe ser secuencial (`desdeNumero <= hastaNumero`).
- No se puede inutilizar un número que ya fue utilizado por un documento aprobado por SIFEN.
- Máximo 1000 números por request.

### 8.3 Respuesta exitosa

```json
{
  "event_id": "46",
  "status": "SENT",
  "sifen": {
    "result_code": "0260",
    "result_message": "Aprobado"
  }
}
```

### 8.4 Errores posibles

| HTTP | Error | Causa |
|---|---|---|
| `409` | `RANGE_CONFLICT` | El rango incluye números ya utilizados por documentos aprobados. |
| `409` | `INVALID_RANGE` | Rango inválido (desde > hasta, o más de 1000 números). |
| `422` | `VALIDATION_ERROR` | Datos de request inválidos. |

---

## 9. Idempotencia: Recuperar una Transacción Perdida

### 9.1 El problema

Tu sistema envió un request de emisión de FE pero:
- el timeout expiró antes de recibir la respuesta;
- la conexión se cortó;
- el servidor devolvió un error 5xx transitorio.

No sabés si la factura fue creada.

### 9.2 La solución: reintentar con la misma `idempotency_key`

Simplemente enviá el mismo request **exacto** con la misma `idempotency_key`.
El sistema detecta la clave, devuelve el documento existente y **no genera nueva numeración**.

```json
{
  "idempotent": true,
  "document_id": "158",
  "document_uuid": "aef20ad1-1abd-4a70-897f-236bb46cd968",
  "cdc": "01801369681001001000108622026070312270544493",
  "nro_factura": "001-001-0001086",
  "status": "QUEUED_BATCH"
}
```

La respuesta incluye `"idempotent": true` y el HTTP code es `200`.
Tratá esta respuesta igual que una emisión exitosa nueva.

### 9.3 Lógica de reintentos recomendada

```
1. Enviar request con idempotency_key única.
2. Si respuesta 200/202 → guardar document_uuid, fin.
3. Si respuesta 4xx (400, 422) → error de datos, no reintentar con la misma key.
4. Si timeout o 5xx → esperar 2–5 segundos y reintentar con la MISMA key.
5. Máximo 3 reintentos. Si siguen fallando → pasar a conciliación (sección 10).
```

La idempotencia aplica a `POST /v1/factura`. Para `POST /v1/nota-credito`, la idempotencia se gestiona internamente en base a la combinación de emisor, referencia y receptor.

---

## 10. Conciliación por Idempotencia

Cuando el reintento directo no es suficiente (por ejemplo, después de una ventana de mantenimiento o pérdida de logs), podés consultar el estado de varias transacciones de FE por lote.

### 10.1 Endpoint

```http
POST /v1/conciliacion/idempotency
X-Api-Key: <tu_clave_de_consumidor>
Content-Type: application/json
```

**Permiso requerido:** `IDEMPOTENCY_RECONCILE`

### 10.2 Request

```json
{
  "emisor_id": "80136968-1",
  "env": "prod",
  "from": "2026-07-03T00:00:00-04:00",
  "to": "2026-07-03T23:59:59-04:00",
  "idempotency_keys": [
    "VENTA-2026-07-03-00123",
    "VENTA-2026-07-03-00124",
    "VENTA-2026-07-03-00125"
  ]
}
```

Restricciones:
- `from` y `to` son **obligatorios** (ISO 8601 con offset de zona horaria);
- rango máximo: **7 días**;
- máximo **100 keys por request**.

### 10.3 Respuesta

```json
{
  "consumer": { "id": "2", "code": "pos-e2e-2" },
  "emisor_id": "80136968-1",
  "env": "prod",
  "from": "2026-07-03T00:00:00-04:00",
  "to": "2026-07-03T23:59:59-04:00",
  "items": [
    {
      "idempotency_key": "VENTA-2026-07-03-00123",
      "result": "IMPACTED",
      "document_uuid": "aef20ad1-1abd-4a70-897f-236bb46cd968",
      "document_id": "158",
      "current_cdc": "0180136968100100100010862...",
      "status": "QUEUED_BATCH",
      "nro_factura": "001-001-0001086",
      "created_at": "2026-07-03T14:30:00-04:00"
    },
    {
      "idempotency_key": "VENTA-2026-07-03-00124",
      "result": "NOT_IMPACTED",
      "message": "No existe transaccion registrada para esa idempotency_key en el rango consultado."
    }
  ]
}
```

### 10.4 Resultados posibles por ítem

| `result` | Significado | Acción |
|---|---|---|
| `IMPACTED` | La solicitud impactó. Existe documento. | Guardar `document_uuid` y sincronizar estado. |
| `NOT_IMPACTED` | No existe documento en el rango. | La transacción no se procesó. Podés reintentar la emisión con la misma key. |
| `DUPLICATE_CONFLICT` | Múltiples documentos para la misma clave. | Contactar soporte con la `idempotency_key` afectada. |
| `INVALID_KEY` | El valor no cumple el formato. | Corregir el formato (`^[A-Za-z0-9_-]{8,80}$`). |

---

## 11. Cancelar Envío Local (Cancel-Send)

Si tu sistema emitió una FE y la encoló (`QUEUED_BATCH`), pero luego necesitás cancelarla **antes** de que el worker la transmita a SIFEN, podés usar este endpoint.

**Solo aplica si:**
- el documento está en estado `QUEUED_BATCH`;
- el worker de batch aún no lo transmitió (`last_sent_at` es nulo).

**No aplica para:**
- documentos ya aprobados → usar cancelación fiscal SIFEN (sección 7);
- documentos con cualquier evidencia de transmisión.

### 11.1 Endpoint

```http
POST /v1/conciliacion/idempotency/cancel-send
X-Api-Key: <tu_clave_de_consumidor>
Content-Type: application/json
```

**Permiso requerido:** `CANCEL_SEND`

### 11.2 Request

```json
{
  "emisor_id": "80136968-1",
  "env": "prod",
  "idempotency_key": "VENTA-2026-07-03-00123",
  "reason": "Cliente anuló la venta antes de la facturación."
}
```

### 11.3 Respuesta exitosa

```json
{
  "result": "CANCELLED_LOCAL",
  "document_uuid": "aef20ad1-1abd-4a70-897f-236bb46cd968",
  "document_id": "158",
  "previous_status": "QUEUED_BATCH",
  "status": "DRAFT"
}
```

### 11.4 Errores posibles

| HTTP | Error | Causa |
|---|---|---|
| `200` | `result: NOT_IMPACTED` | No existe documento para la key. |
| `409` | `INVALID_DOCUMENT_STATUS` | Documento no está en `QUEUED_BATCH`. |
| `409` | `TRANSMISSION_EVIDENCE_DETECTED` | El worker ya transmitió el documento. |
| `409` | `DUPLICATE_CONFLICT` | Múltiples documentos para la clave (soporte). |

Después de un cancel-send exitoso, el documento vuelve a estado `DRAFT`. Podés reintentar la emisión con la misma `idempotency_key` (si querés rehacerla) o con una nueva key (si el negocio cambió).

---

## 12. Identidad Canónica del Documento: `document_uuid`

Una vez que emitís cualquier documento (FE o NCE), guardá siempre el `document_uuid`. Es el identificador permanente e inmutable.

```
document_uuid = aef20ad1-1abd-4a70-897f-236bb46cd968
```

Con el `document_uuid` podés consultar:

| Endpoint | Información |
|---|---|
| `GET /v1/documentos/{uuid}` | Estado completo del documento. |
| `GET /v1/documentos/{uuid}/xml` | XML vigente (sin firma, firmado, con QR). |
| `GET /v1/documentos/{uuid}/sifen` | Estado fiscal SIFEN actual. |
| `GET /v1/documentos/{uuid}/eventos` | Cancelaciones, inutilizaciones. |
| `GET /v1/documentos/{uuid}/lineage` | Historial de CDC (trazabilidad fiscal). |
| `GET /v1/documentos/{uuid}/files/kude.pdf` | KUDE PDF. |

Si en algún momento perdés el `document_uuid` pero tenés el CDC, podés recuperarlo:

```http
GET /v1/documentos/by-cdc/{cdc}
```

---

## 13. Permisos Funcionales

Los permisos por consumidor **solo existen y se validan en los endpoints que usan la clave de consumidor**. El administrador te asigna cuáles de estos permisos tiene tu consumidor:

| Permiso | Acción habilitada | ¿Se valida hoy? |
|---|---|---|
| `FACTURA_EMIT` | `POST /v1/factura` | Sí |
| `IDEMPOTENCY_RECONCILE` | `POST /v1/conciliacion/idempotency` | Sí |
| `CANCEL_SEND` | `POST /v1/conciliacion/idempotency/cancel-send` | Sí |
| `DOCUMENTO_READ` | Pensado para consultas por `document_uuid` | No — existe como valor del catálogo de permisos, pero ningún endpoint lo verifica todavía. Las consultas `/documentos/*` funcionan hoy con la clave compartida, sin chequeo de permiso. |
| `SIFEN_STATUS_READ` | Pensado para consulta de estado SIFEN | No — mismo caso que `DOCUMENTO_READ`. |
| `RECIBO_WRITE` | Crear/editar/eliminar/emitir recibos (`POST/PATCH/DELETE /v1/recibos*`) | Sí |
| `RECIBO_READ` | Consultar/listar/descargar recibos (`GET /v1/recibos*`) | Sí |
| `RECIBO_VOID` | Anular un recibo emitido (`POST /v1/recibos/{id}/anular`) | Sí |

Si intentás usar `/factura`, `/conciliacion/*` o `/recibos/*` sin el permiso correspondiente, recibirás `403 FORBIDDEN`.

**Nota-crédito (`/nota-credito`), cancelación fiscal (`/evento/cancelar`) e inutilización de numeración (`/evento/inutilizacionnumfactura`) no usan este modelo de permisos en absoluto.** Se autentican con la clave compartida (sección 2) y no validan permiso ni alcance por emisor: cualquier consumidor con la clave compartida puede ejecutarlas sobre cualquier emisor del sistema.

---

## 14. Escenarios Operativos Frecuentes

### 14.1 Venta confirmada, timeout en la respuesta

```
1. Emitir FE con idempotency_key = "VENTA-001"
2. Timeout → no sabés si impactó
3. Reintentar con la misma key → response con idempotent: true → OK
4. Guardar document_uuid
```

### 14.2 Pérdida de log de múltiples transacciones

```
1. POST /conciliacion/idempotency con las keys afectadas + rango de fechas
2. Para cada NOT_IMPACTED → reintentar emisión con la misma key
3. Para cada IMPACTED → sincronizar document_uuid en tu sistema
4. Para DUPLICATE_CONFLICT → escalar a soporte
```

### 14.3 Cliente anuló antes de que se facture

```
1. Emitir FE con idempotency_key → QUEUED_BATCH
2. Cliente cancela antes del siguiente ciclo batch
3. POST /conciliacion/idempotency/cancel-send con la key
4. Si result=CANCELLED_LOCAL → el número queda disponible para reintento
5. Si 409 TRANSMISSION_EVIDENCE_DETECTED → el documento ya fue enviado,
   usar cancelación fiscal (sección 7) si está dentro de las 48h
```

### 14.4 Cambio de datos de la venta antes de transmitir

```
1. Cancel-send por idempotency_key (revierte a DRAFT)
2. Emitir con UNA NUEVA idempotency_key con los datos correctos
   (usar key nueva para evitar confusiones en conciliación futura)
```

### 14.5 Devolución parcial de una FE aprobada

```
1. Obtener el CDC de la FE: GET /v1/documentos/{uuid} → current_cdc
2. POST /v1/nota-credito con referencia tipo ELECTRONICO y el CDC
3. motivo.codigo = 1 (devolución de mercaderías)
4. Guardar el document_uuid de la NCE emitida
```

### 14.6 Descuento posterior a la emisión

```
1. Obtener el CDC de la FE: GET /v1/documentos/{uuid} → current_cdc
2. POST /v1/nota-credito con referencia ELECTRONICO, motivo.codigo = 2
3. El monto del descuento va en el item de la NCE
4. Si la NCE supera el total de la FE → 409, revisar el monto
```

### 14.7 Cancelación de FE aprobada (dentro de las 48h)

```
1. Verificar que el documento está APPROVED y dentro de la ventana de 48h
2. POST /v1/evento/cancelar con emisor_id, cdc y motivo
3. Si 409 CANCELLATION_WINDOW_EXPIRED → la ventana fiscal venció,
   considerar emitir una NCE por el total de la factura
```

### 14.8 Números saltados por error de sistema

```
1. Identificar el rango de números no emitidos
2. POST /v1/evento/inutilizacionnumfactura con el rango
3. Si 409 RANGE_CONFLICT → algún número del rango fue utilizado,
   ajustar el rango y reintentar
```

---

## 15. Límites y Restricciones

| Recurso | Límite |
|---|---|
| `idempotency_key` longitud | 8–80 caracteres |
| `idempotency_key` formato | `^[A-Za-z0-9_-]{8,80}$` |
| Keys por request de conciliación | máx. 100 |
| Rango de fechas en conciliación | máx. 7 días |
| Números por request de inutilización | máx. 1000 |
| `motivo` en cancelar / inutilizar | máx. 150 caracteres |
| Ventana de cancelación fiscal | 48 horas desde aprobación SIFEN |
| `motivo` en anular un recibo | máx. 500 caracteres |
| `concepto`/`pagador_nombre` de un recibo | texto libre, sin límite explícito de longitud (validar contra el tamaño razonable de un campo de formulario) |
| `importe` de un recibo | mayor a 0, máximo 2 decimales |

---

## 16. Recibos de Dinero Firmados Digitalmente

### 16.1 Qué es y por qué existe

Un recibo de dinero es un comprobante de cobro o pago (alquileres, anticipos, cuotas, cobro de una
factura a crédito, etc.) **firmado digitalmente**, con validez legal propia bajo la
**Ley N.º 6822/2021** ("De los Servicios de Confianza para las Transacciones Electrónicas..."),
que reconoce la firma electrónica cualificada con efecto legal equivalente a la firma manuscrita.

**No es un Documento Electrónico (DE) de SIFEN:**
- no tiene CDC;
- no consume numeración fiscal SIFEN;
- **nunca se transmite a DNIT/SIFEN**, bajo ninguna circunstancia.

Se firma con el mismo certificado `.p12` que el emisor ya tiene cargado para sus DE — ese
certificado es de propósito general, no está limitado a SIFEN.

**No debe confundirse con el Comprobante de Retención** (que sí es un DE de SIFEN, para
retención de impuestos). Son conceptos distintos y no relacionados.

### 16.2 Autenticación

Todos los endpoints de recibos usan **exclusivamente la clave de consumidor**
(`ApiConsumerKeyAuth`), la misma que usás para `/factura`. No hay ambigüedad de "clave
compartida" acá — es el modelo de autenticación más simple y moderno de toda la API.

Excepción: los dos endpoints de **verificación pública** (`/verificar/recibo/{token}` y su
`/pdf`) no requieren ninguna autenticación — están pensados para que cualquier tercero que
reciba el PDF pueda validar su autenticidad escaneando el QR.

### 16.3 Ciclo de vida

```
BORRADOR (mutable, editable, sin numero ni firma)
   │  PATCH /recibos/{id}  → sigue en BORRADOR
   │  DELETE /recibos/{id} → eliminado (soft delete)
   │
   │  POST /recibos/{id}/emitir
   ▼
EMITIDO (inmutable — numerado, firmado en XML y PDF, ya no se puede editar ni eliminar)
   │
   │  POST /recibos/{id}/anular
   ▼
ANULADO (metadato sobre el EMITIDO original; el XML/PDF original NO se modifica.
          Se crea un recibo de anulación nuevo, también firmado, que referencia al original)
```

La firma real ocurre **recién al emitir** (`POST /recibos/{id}/emitir`). Un `BORRADOR` no tiene
validez legal — es solo un dato en edición.

### 16.4 Crear un Recibo (BORRADOR)

```http
POST /v1/recibos
X-Api-Key: <tu_clave_de_consumidor>
Content-Type: application/json
```

**Permiso requerido:** `RECIBO_WRITE`

```json
{
  "emisor_id": "80136968-1",
  "fecha_cobro": "2026-07-24",
  "pagador_nombre": "Juan Pérez",
  "pagador_documento_tipo": "CI",
  "pagador_documento": "1234567",
  "concepto": "Pago de alquiler julio 2026",
  "importe": 1500000,
  "moneda": "PYG",
  "forma_pago": "EFECTIVO",
  "client_reference": { "idempotency_key": "RECIBO-2026-07-24-00123" }
}
```

| Campo | Notas |
|---|---|
| `pagador_documento_tipo` | `RUC \| CI \| PASAPORTE \| CEDULA_EXTRANJERA \| NO_ESPECIFICADO` (opcional) |
| `forma_pago` | `EFECTIVO \| TRANSFERENCIA \| CHEQUE \| TARJETA_CREDITO \| TARJETA_DEBITO \| OTRO` (default `EFECTIVO`) |
| `referencia_documento_uuid` | opcional — `document_uuid` de una factura de este mismo sistema, si el recibo cobra esa factura (ver 16.4.1) |
| `referencia_documento_numero_display` | opcional — texto libre para mostrar en el PDF (ej. número fiscal de la factura) |
| `client_reference.idempotency_key` | opcional, mismo formato que en `/factura` (`^[A-Za-z0-9_-]{8,80}$`) |

**Respuesta (201):**

```json
{
  "id": "b2f1c9a0-...",
  "estado": "BORRADOR",
  "numero": null,
  "verification_token": null,
  "concepto": "Pago de alquiler julio 2026",
  "importe": "1500000.00",
  ...
}
```

Guardá el `id` — lo necesitás para editar, emitir, anular o descargar este recibo.

#### 16.4.1 Vincular un recibo a una factura (cobro de crédito)

Si el recibo documenta el cobro de una factura emitida por este mismo sistema, incluí
`referencia_documento_uuid` con el `document_uuid` de esa factura (ver sección 12). El sistema
valida que esa factura pertenezca al mismo emisor; si no existe o es de otro emisor, responde
`422 INVALID_DOCUMENT_REFERENCE`.

### 16.5 Editar o Eliminar un Recibo (solo BORRADOR)

```http
PATCH /v1/recibos/{id}
X-Api-Key: <tu_clave_de_consumidor>
```

Todos los campos son opcionales — enviá solo lo que cambia. Si el recibo ya fue emitido,
responde `409 RECIBO_NOT_EDITABLE`.

```http
DELETE /v1/recibos/{id}
X-Api-Key: <tu_clave_de_consumidor>
```

Soft delete. Solo aplica sobre `BORRADOR`. Si ya fue emitido: `409 RECIBO_NOT_DELETABLE`.

### 16.6 Emitir (firmar) un Recibo

```http
POST /v1/recibos/{id}/emitir
X-Api-Key: <tu_clave_de_consumidor>
```

Este es el paso que realmente le da validez legal al recibo: asigna número correlativo y
`verification_token`, firma el XML (XMLDSig) y el PDF (PAdES) con el certificado del emisor, y
persiste todo de forma atómica — si la firma falla por cualquier motivo, el recibo **permanece
en `BORRADOR`** (no se pierde numeración).

**Respuesta (200):**

```json
{
  "id": "b2f1c9a0-...",
  "estado": "EMITIDO",
  "numero": "42",
  "verification_token": "3f9a1c2e-...",
  "xml_hash": "a1b2c3...",
  "pdf_hash": "d4e5f6...",
  "emitido_at": "2026-07-24T15:03:11.000Z",
  ...
}
```

**Errores posibles:**

| HTTP | Error | Causa |
|---|---|---|
| `404` | `RECIBO_NOT_FOUND` | El id no existe (o no pertenece a tu alcance de emisor). |
| `409` | `RECIBO_NOT_EMITTABLE` | El recibo no está en `BORRADOR` (ya emitido o anulado), o hubo una emisión concurrente. |
| `422` | `CERTIFICATE_NOT_FOUND` | El emisor no tiene certificado digital cargado. |
| `422` | `CERTIFICATE_EXPIRED` | El certificado del emisor está vencido. |
| `500` | `XML_SIGNATURE_FAILED` / `PDF_SIGNATURE_FAILED` | Falló la firma. El recibo sigue en `BORRADOR`, podés reintentar. |

### 16.7 Descargar el PDF o el XML

```http
GET /v1/recibos/{id}/pdf
X-Api-Key: <tu_clave_de_consumidor>
```

- Si el recibo está `BORRADOR`: devuelve una **vista previa sin firmar** (número mostrado como
  `-------`, sin QR funcional, marcada visiblemente como borrador sin validez legal).
- Si está `EMITIDO`/`ANULADO`: devuelve el **PDF firmado** ya persistido (nunca se regenera —
  cada descarga devuelve exactamente los mismos bytes firmados).

```http
GET /v1/recibos/{id}/xml
X-Api-Key: <tu_clave_de_consumidor>
```

Solo disponible si el recibo está `EMITIDO`/`ANULADO`. Devuelve `404 XML_NOT_FOUND` si sigue en
`BORRADOR`.

### 16.8 Verificación Pública (sin autenticación)

El PDF firmado incluye un QR que apunta a:

```http
GET /v1/verificar/recibo/{verification_token}
```

Sin autenticación. Pensado para que un tercero (el pagador, un auditor, cualquiera con el PDF en
mano) confirme la autenticidad del recibo. La respuesta es **deliberadamente limitada** — nunca
expone importe, receptor ni concepto:

```json
{
  "valido": true,
  "estado": "EMITIDO",
  "fecha_emision": "2026-07-24",
  "firmado_en": "2026-07-24T15:03:11.000Z"
}
```

Token inexistente → `404 { "valido": false, "motivo": "not_found" }`.

También existe `GET /v1/verificar/recibo/{verification_token}/pdf` para descargar el PDF firmado
públicamente, sin autenticación.

### 16.9 Anular un Recibo

```http
POST /v1/recibos/{id}/anular
X-Api-Key: <tu_clave_de_consumidor>
Content-Type: application/json
```

**Permiso requerido:** `RECIBO_VOID`. Solo aplica sobre un recibo `EMITIDO`.

```json
{ "motivo": "Importe incorrecto, se emitió uno nuevo" }
```

Genera un **nuevo recibo firmado** ("recibo de anulación") que referencia al original. El
XML/PDF del recibo original **no se modifica** — solo cambia su `estado` a `ANULADO`. La
verificación pública del original a partir de ese momento informa `estado: ANULADO`.

Si el recibo está en `BORRADOR`: `409 RECIBO_NOT_ANULABLE`. Si ya fue anulado:
`409 RECIBO_ALREADY_ANULADO`.

### 16.10 Listar y Sincronizar tu Caché Local

```http
GET /v1/recibos?emisor_id={ruc}&updated_since=2026-07-24T00:00:00Z
X-Api-Key: <tu_clave_de_consumidor>
```

**Permiso requerido:** `RECIBO_READ`

Si tu sistema mantiene su propia copia/caché de recibos (por ejemplo para mostrarlos en tu UI sin
depender de esta API en cada render), usá `updated_since` para sincronizar de forma incremental
en vez de releer todo el historial. La respuesta incluye altas, ediciones, emisiones,
anulaciones **y los recibos eliminados** (`deleted_at` no nulo) ocurridos después de ese
timestamp — así tu caché puede reflejar también los borrados.

| Query param | Notas |
|---|---|
| `emisor_id` | requerido, RUC completo |
| `estado` | `BORRADOR \| EMITIDO \| ANULADO` |
| `updated_since` | ISO 8601 con offset |
| `fecha_desde` / `fecha_hasta` | filtro por `fecha_cobro` |
| `page` / `limit` | paginación (`limit` máx. 200) |

**Recomendación operativa:** guardá el timestamp de tu última sincronización exitosa y usalo
como `updated_since` en la siguiente corrida — no hace falta re-sincronizar desde el inicio de
los tiempos cada vez.

### 16.11 Escenario: cobro de una factura a crédito

```
1. Factura emitida a crédito: GET /v1/documentos/{uuid} → confirmar condicion CREDITO
2. Cliente paga → POST /v1/recibos con referencia_documento_uuid = document_uuid de la factura
3. Revisar el BORRADOR (concepto, importe, datos del pagador)
4. POST /v1/recibos/{id}/emitir → recibo firmado, listo para entregar al cliente
5. GET /v1/recibos/{id}/pdf → adjuntar/enviar al cliente
```

### 16.12 Escenario: error detectado después de emitir

```
1. POST /v1/recibos/{id}/anular con el motivo del error
2. El recibo original queda ANULADO (su PDF/XML no cambia, solo el estado)
3. Emitir un recibo nuevo con los datos correctos (POST /v1/recibos → PATCH → POST .../emitir)
```

---

## 17. Contacto y Soporte

Para obtener o rotar una API key, configurar permisos o emisores asignados, o escalar casos `DUPLICATE_CONFLICT`:

- Contactar al responsable de integración del servicio.
- Proporcionar: código del consumidor (`consumer_code`), `idempotency_key` o `document_uuid` afectado y rango de fechas.
