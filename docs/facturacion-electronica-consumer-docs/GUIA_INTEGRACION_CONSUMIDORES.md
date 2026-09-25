# Guía de Integración para Consumidores API — Facturación Electrónica SIFEN

**Versión:** 0.7 (mapa definitivo de autenticación por endpoint)
**Fecha:** 2026-08-29
**Aplica a:** integraciones externas (POS, ERP, ecommerce, sistemas de ventas)

> **Novedad v0.7 (2026-08-29, solo documentación — sin cambio de comportamiento):** se agregó la **sección 23** con el mapa exhaustivo de qué clave exige cada endpoint, verificado uno por uno contra el código en producción, más el diagnóstico de cada mensaje de `401`. Se aclara además que `DOCUMENTO_READ` y `SIFEN_STATUS_READ` pueden figurar concedidos a tu consumidor pero **ninguna ruta los verifica todavía**. La red de co-locación de `prod` (`ventax_fiscal_prod`) quedó **aprovisionada y verificada** el 2026-08-29, con aislamiento comprobado respecto de `test`. La sección 22.5 aclara además quién hace qué: el deploy del servicio garantiza que la red exista, y **unir tu contenedor es tuyo** — con dos formas documentadas.

> **Novedad v0.6:** la sección 22.5 (co-locación) ahora incluye una tabla fija de `CONSUMER_NETWORK_NAME` por ambiente — `ventax_fiscal_test` / `ventax_fiscal_prod`, mismo alias `facturacion-electronica` en los dos — en vez de mostrarlos como "ejemplo". El ambiente `test` ya está aprovisionado y verificado en vivo (`docker network create` + deploy real + `wget` al alias desde un contenedor de prueba, todos con resultado `200`); `prod` quedó aprovisionado y verificado el 2026-08-29 (aislamiento entre ambientes comprobado en las dos direcciones). Sin cambios de contrato HTTP.

> **Novedad v0.5:** se agrega la sección 22.5, **Co-locación**, para consumidores que corren como contenedor Docker en el mismo host físico o VPS que este servicio. Es una ruta de red alternativa —evita salir a internet para volver a entrar por la dirección pública—, no un endpoint ni un campo de contrato nuevo. Requiere coordinación explícita con el administrador (no es autoservicio); si no corrés en el mismo host, esta sección no te aplica y seguís usando 22.1-22.4 sin cambios. Incluye una advertencia verificada: si más de un consumidor comparte la misma red de co-locación, quedan alcanzables entre sí, no solo con este servicio.

> **Novedad v0.4:** se agregan las secciones 18 (**Naturaleza del Receptor**) y 19 (**Numeración `SERVICE` vs `CLIENT`**). Ambos campos ya existían y funcionaban en el sistema — lo que faltaba era su documentación en esta guía y, en el caso de `receptor.naturaleza`, su presencia en el `openapi.yaml` de este paquete (ya corregida). **No hay ningún cambio de comportamiento del servicio en esta versión**: si tu integración ya funciona, no requiere cambios. La sección 19.1 documenta una advertencia importante sobre omitir el objeto `numbering`.

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
| **Clave de consumidor** (`consumer_api_key`) | Individual por consumidor. Tiene permisos propios (`FACTURA_EMIT`, `IDEMPOTENCY_RECONCILE`, `CANCEL_SEND`, `RECIBO_WRITE`, `RECIBO_READ`, `RECIBO_VOID`) y alcance limitado a los emisores/ambientes que te asignaron. | `POST /v1/factura`, `POST /v1/conciliacion/idempotency`, `POST /v1/conciliacion/idempotency/cancel-send`, y todo `/v1/recibos*` (ver sección 16) |
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
| `actividad_economica_codigo` | opcional — código de actividad económica del emisor (ver `GET /consultar/ruc/{ruc}`) bajo la cual se genera el recibo. Determina qué logo/rubro se imprime en el PDF. Si el emisor tiene una sola actividad, se puede omitir. Si el emisor tiene varias y no se envía, se usa la actividad **principal** — si el recibo corresponde a otra actividad, el PDF va a mostrar el logo equivocado. Un código que no está declarado y activo para el emisor responde `422 ACTIVITY_NOT_AVAILABLE`. |
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
  "firmado_en": "2026-07-24T15:03:11.000Z",
  "pdf_url": "https://fe-api.tudominio.com/v1/verificar/recibo/{verification_token}/pdf",
  "xml_url": "https://fe-api.tudominio.com/v1/verificar/recibo/{verification_token}/xml"
}
```

Token inexistente → `404 { "valido": false, "motivo": "not_found" }` (sin `pdf_url`/`xml_url`).

**`pdf_url` y `xml_url` solo vienen presentes cuando el recibo existe.** Apuntan siempre al host
real de esta API (no a `PUBLIC_BASE_URL`, que puede ser tu propio dominio si tenés tu propia
pagina de verificación — ver 16.3). Si tu sistema tiene su propia página pública, usalos
directamente en vez de reconstruir la URL vos mismo por convención.

- `GET /v1/verificar/recibo/{verification_token}/pdf` — el PDF firmado (PAdES).
- `GET /v1/verificar/recibo/{verification_token}/xml` — el **documento electrónico**: el XML
  firmado (XMLDSig), la fuente de verdad legal de la que se deriva el PDF. Útil para que un
  auditor o contador acceda al documento firmado en sí, no solo a su representación visual.

Ambos, sin autenticación, con las mismas condiciones (solo disponibles si el recibo está
`EMITIDO`/`ANULADO`).

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

---

## 18. Naturaleza del Receptor (`receptor.naturaleza`)

Aplica a `POST /v1/factura` y `POST /v1/nota-credito`.

Cuando el receptor es un **contribuyente con RUC**, el sistema informa a SIFEN si se trata de una persona física o jurídica (Manual Técnico SIFEN v150, campo `iTiContRec`).

| Valor | Significado | Se envía a SIFEN como |
|---|---|---|
| `FISICA` | Persona física con RUC | `tipoContribuyente: 1` |
| `JURIDICA` | Persona jurídica (empresa, S.A., S.R.L., etc.) | `tipoContribuyente: 2` |

```json
"receptor": {
  "tipoDocumento": "RUC",
  "docNro": "80012345",
  "dv": "6",
  "razonSocial": "EMPRESA COMPRADORA SA",
  "naturaleza": "JURIDICA"
}
```

Reglas:

- El campo es **opcional**. Si se omite, se asume `FISICA`.
- **Solo tiene efecto cuando `tipoDocumento` es `RUC`.** Para receptores con `CI`, `PASAPORTE` u otros tipos, el campo se ignora — esos documentos no llevan tipo de contribuyente en el XML.
- Se recomienda informarlo explícitamente siempre que el receptor sea una empresa. El valor viaja dentro del documento electrónico firmado: una vez que SIFEN aprueba el DE, el dato es inmutable y corregirlo requiere cancelación (dentro de las 48h) o una nota de crédito.

> **Nota de versiones:** este campo se agregó después de la primera versión del contrato. Los documentos emitidos antes de su incorporación no lo persistieron y el sistema los reporta como `FISICA`.

---

## 19. Numeración: `SERVICE` vs `CLIENT`

El objeto `numbering` del request de emisión define **quién asigna el número de comprobante**.

| `authority` | Quién asigna el número | `timbrado.documentoNro` |
|---|---|---|
| `SERVICE` | El servicio, automáticamente desde el numerador configurado para tu emisor | No se envía |
| `CLIENT` | Tu sistema | **Obligatorio** |

```json
"numbering": { "authority": "SERVICE" }
```

### 19.1 Advertencia: omitir `numbering` no equivale a `SERVICE`

El esquema OpenAPI declara `default: SERVICE` para `authority`. Ese default **solo aplica si el objeto `numbering` está presente** y se omite únicamente ese campo:

```json
"numbering": { }                          →  authority = SERVICE
"numbering": { "authority": "SERVICE" }   →  authority = SERVICE
// sin la clave "numbering" en el request →  authority = CLIENT
```

Si omitís el objeto `numbering` por completo, el sistema asume `CLIENT` y **rechaza el request con `422`** indicando que falta `timbrado.documentoNro`.

**Recomendación: enviá siempre `numbering` de forma explícita.** Es una línea y elimina la ambigüedad por completo.

### 19.2 Campos relacionados

- `numbering.requested_document_number`: número sugerido por tu sistema. El servicio puede conservarlo solo como dato de auditoría; no garantiza que sea el número fiscal final.
- `client_reference.operational_series`: serie operativa propia de tu sistema, independiente de la serie fiscal. Es informativa y no altera la numeración fiscal.

El correlativo fiscal no debe asumirse bajo control del cliente salvo acuerdo específico de integración (ver sección 15).

---

## 20. Actividad Económica y Perfil de Emisión

### 20.1 `actividadEconomicaCodigo`

Código de actividad económica del **emisor** (no del receptor) con el que se emite el documento. Es el código asignado por la DNIT/SET al facturador.

```json
{
  "emisor_id": "80136968-1",
  "actividadEconomicaCodigo": "47111",
  "timbrado": { }
}
```

Reglas:

- Es **opcional**. Si el emisor tiene una sola actividad económica registrada, podés omitirlo.
- Si el emisor tiene **varias** actividades y lo omitís, se aplica la actividad marcada como **principal**.
- Informalo explícitamente cuando factures por una actividad que no es la principal.
- Los códigos válidos para tu emisor te los provee el administrador (ver sección 4 y el archivo de configuración exportada, sección 21).

El mismo concepto aplica a los recibos de dinero bajo el nombre `actividad_economica_codigo` (sección 16.4).

### 20.2 `emission_profile_code`

Un **perfil de emisión** es una combinación preconfigurada de actividad económica + establecimiento + punto de expedición + tipo de documento. Existe para emisores cuya configuración fiscal admite más de una combinación válida.

```json
{
  "emisor_id": "80136968-1",
  "emission_profile_code": "PERFIL-01",
  "timbrado": { }
}
```

Reglas:

- Es **opcional**. Si tu emisor tiene un solo perfil configurado —o ninguno— no necesitás enviarlo.
- Si tu emisor tiene **varios perfiles activos**, enviarlo es la forma de indicar con cuál emitir.
- Los códigos de perfil disponibles para tu emisor figuran en el archivo de configuración exportada (sección 21). Si no sabés si tu emisor usa perfiles, consultá al administrador.

### 20.3 `tipoTransaccion`

Tipo de transacción del documento, según catálogo SIFEN.

| Valor | Uso |
|---|---|
| `1` | Venta de mercadería (valor por defecto) |
| `2` | Prestación de servicios |
| `3` | Mixto (venta de mercadería y servicios) |

Es **opcional**; si se omite se asume `1`. Es un dato de la transacción, no de tu configuración: lo decidís por operación, no lo recibís del administrador.

---

## 21. Configuración Fiscal Exportada

El administrador puede entregarte un archivo (`JSON` o `YAML`) con toda la configuración fiscal de tu emisor ya validada en el sistema. Sirve para parametrizar tu integración sin tener que pedir cada dato por separado.

### 21.1 Cómo leer el archivo

Cada dato viene acompañado de la referencia a la sección de esta guía donde se explica su uso:

```json
{
  "contrato": {
    "version": { "valor": "v0.1", "referencia": "GUIA_INTEGRACION_CONSUMIDORES.md#21-configuración-fiscal-exportada" },
    "generado_en": { "valor": "2026-09-24T22:38:24.522Z", "referencia": "GUIA_INTEGRACION_CONSUMIDORES.md#214-importante-es-una-foto-no-un-contrato-permanente" }
  },
  "emisor": {
    "emisor_id": { "valor": "80136968-1", "referencia": "GUIA_INTEGRACION_CONSUMIDORES.md#4-lo-que-el-administrador-configura-para-vos" }
  }
}
```

- `valor`: el dato que tenés que configurar en tu sistema.
- `referencia`: dónde, en esta guía, se explica cómo y cuándo usarlo.

**Ejemplo completo, tomado de una exportación real** (RUC y datos de contacto
reemplazados por valores de ejemplo; la estructura y todas las claves son
exactamente las que devuelve el sistema — verificado 2026-09-24, ver
`spec/openapi.yaml#/components/schemas/ExportConfiguracionConsumidorPayload`
para el esquema formal):

```json
{
  "contrato": {
    "version": { "valor": "v0.1", "referencia": "..." },
    "generado_en": { "valor": "2026-09-24T22:38:24Z", "referencia": "..." },
    "guia_referencia": "GUIA_INTEGRACION_CONSUMIDORES.md",
    "aviso_vigencia": { "valor": "Esta configuracion es una foto...", "referencia": "..." }
  },
  "servicio": {
    "base_url": { "valor": "https://fe-api.ejemplo.com", "referencia": "..." },
    "base_path": { "valor": "/v1", "referencia": "..." },
    "ambiente_esperado": { "valor": "test", "referencia": "..." },
    "url_verificada": { "valor": true, "referencia": "..." }
  },
  "emisor": {
    "emisor_id": { "valor": "80044279-2", "referencia": "..." },
    "razon_social": { "valor": "MI EMPRESA SRL", "referencia": "..." },
    "nombre_fantasia": { "valor": null, "referencia": "..." },
    "ambiente": { "valor": "test", "referencia": "..." }
  },
  "actividades_economicas": [
    { "codigo": { "valor": "47591", "referencia": "..." }, "descripcion": { "valor": "Comercio al por menor de electrodomésticos y accesorios", "referencia": "..." }, "es_principal": { "valor": true, "referencia": "..." } },
    { "codigo": { "valor": "46460", "referencia": "..." }, "descripcion": { "valor": "Comercio al por mayor de muebles y artículos de iluminación", "referencia": "..." }, "es_principal": { "valor": false, "referencia": "..." } }
  ],
  "establecimientos": [
    {
      "codigo": { "valor": "001", "referencia": "..." },
      "denominacion": { "valor": "MATRIZ", "referencia": "..." },
      "direccion": { "valor": "Calle Ejemplo 123, ASUNCION, ASUNCION, CAPITAL", "referencia": "..." },
      "puntos_expedicion": [
        { "codigo": { "valor": "001", "referencia": "..." }, "descripcion": { "valor": "Caja principal", "referencia": "..." } }
      ]
    }
  ],
  "timbrados": [
    { "numero": { "valor": "80044279", "referencia": "..." }, "fecha_inicio": { "valor": "2026-09-17", "referencia": "..." }, "fecha_fin": { "valor": null, "referencia": "..." }, "vigente": { "valor": true, "referencia": "..." } }
  ],
  "perfiles_emision": {
    "requerido": { "valor": true, "referencia": "..." },
    "items": [
      {
        "codigo": { "valor": "AC46460-E001-P001-FE-GRP2", "referencia": "..." },
        "descripcion": { "valor": "Grupo de 2 actividades, MATRIZ 001-001", "referencia": "..." },
        "actividad_codigo": { "valor": "46460", "referencia": "..." },
        "establecimiento_codigo": { "valor": "001", "referencia": "..." },
        "punto_codigo": { "valor": "001", "referencia": "..." },
        "tipo_documento": { "valor": "1", "referencia": "..." },
        "grupo_actividades": [
          { "codigo": { "valor": "46460", "referencia": "..." }, "descripcion": { "valor": "Comercio al por mayor de muebles y artículos de iluminación", "referencia": "..." } },
          { "codigo": { "valor": "47711", "referencia": "..." }, "descripcion": { "valor": "Comercio al por menor de prendas de vestir", "referencia": "..." } }
        ]
      }
    ]
  },
  "numeracion": {
    "autoridad": { "valor": "SERVICE", "referencia": "..." },
    "documento_nro_requerido": { "valor": false, "referencia": "..." },
    "serie_fiscal": { "valor": null, "referencia": "..." },
    "rango_min": { "valor": null, "referencia": "..." },
    "rango_max": { "valor": null, "referencia": "..." }
  },
  "envio": {
    "modos_habilitados": { "valor": ["SYNC", "BATCH", "AUTO"], "referencia": "..." }
  },
  "tipos_documento_habilitados": { "valor": ["FE"], "referencia": "..." },
  "consumidor": [
    {
      "nombre": { "valor": "mi-sistema-001 — Mi Sistema de Ventas", "referencia": "..." },
      "permisos": { "valor": ["FACTURA_EMIT", "DOCUMENTO_READ"], "referencia": "..." },
      "alcance": { "valor": [{ "emisor_id": "80044279-2", "env": "test", "activo": true }], "referencia": "..." }
    }
  ]
}
```

(Los `"referencia": "..."` de arriba son solo para no repetir la misma URL
decenas de veces en este ejemplo; en el archivo real cada uno trae la ancla
completa, como en el primer ejemplo de esta sección.)

### 21.2 Qué contiene

| Bloque | Contenido |
|---|---|
| `emisor` | `emisor_id`, razón social, nombre de fantasía, ambiente (`test`/`prod`) |
| `actividades_economicas` | códigos, descripciones y cuál es la principal (sección 20.1) |
| `establecimientos` | códigos, denominación, dirección y sus puntos de expedición |
| `timbrados` | número, fecha de inicio, fecha de fin y cuál está vigente |
| `perfiles_emision` | códigos de perfil disponibles, si son obligatorios (sección 20.2) y, por perfil, el grupo de actividades económicas que va a declarar el XML (sección 25) |
| `numeracion` | autoridad (`SERVICE`/`CLIENT`), serie fiscal y rango válido (sección 19) |
| `envio` | modos de envío habilitados para tu emisor (sección 5.4) |
| `tipos_documento_habilitados` | qué documentos podés emitir (FE, NCE) |
| `consumidor` | tu nombre de consumidor, permisos concedidos y emisores/ambientes asignados (sección 13) |

### 21.3 Qué NO contiene

El archivo **nunca incluye secretos** y es seguro guardarlo en tu sistema de configuración:

- no incluye API keys (ni la de consumidor ni la compartida);
- no incluye el certificado digital, su contraseña ni su ubicación;
- no incluye el CSC (código de seguridad del contribuyente).

Esos elementos los administra el proveedor del servicio y nunca se comparten.

### 21.4 Importante: es una foto, no un contrato permanente

El archivo refleja la configuración **en el momento indicado en `contrato.generado_en`**. Queda desactualizado si el administrador:

- carga un timbrado nuevo (recambio anual);
- agrega o desactiva un establecimiento o punto de expedición;
- cambia la autoridad de numeración;
- modifica tus permisos o los emisores asignados.

**No cablees estos valores como constantes permanentes.** Ante cualquier cambio de configuración fiscal, pedí una exportación nueva. Un timbrado vencido en tu sistema produce rechazos de SIFEN.

---

## 22. A Qué Dirección Conectarse

El archivo de configuración exportada (sección 21) incluye un bloque `servicio` con la dirección del servicio al que tenés que apuntar:

```yaml
servicio:
  base_url:
    valor: https://fe.ejemplo.com.py
  base_path:
    valor: /v1
  ambiente_esperado:
    valor: prod
  url_verificada:
    valor: true
```

### 22.1 Cómo armar la URL de un endpoint

Concatenás `base_url` + `base_path` + la ruta del endpoint que figura en esta guía:

```
base_url        https://fe.ejemplo.com.py
base_path       /v1
endpoint        /factura
─────────────────────────────────────────────
URL final       https://fe.ejemplo.com.py/v1/factura
```

Lo mismo para cualquier otro: `/nota-credito`, `/evento/cancelar`, `/consultar/comprobante/{cdc}`, `/documentos/{document_uuid}`, `/recibos`, etc.

Configurá **solo `base_url` en tu sistema**, y derivá el resto. Así, si algún día cambia el host, tenés un único lugar que tocar.

### 22.2 `ambiente_esperado` y el alcance de tu clave

`ambiente_esperado` te dice contra qué ambiente está configurado ese emisor: `test` (homologación SIFEN) o `prod` (producción).

Tu clave de consumidor tiene un alcance por emisor **y por ambiente** (sección 4). Ambos tienen que coincidir: si el archivo dice `prod` pero tu clave está asignada solo a `test`, vas a recibir `403` al intentar emitir. Ante esa combinación, consultá al administrador antes de seguir.

### 22.3 Si el archivo dice `url_verificada: false`

Ese campo indica si un administrador **configuró deliberadamente** la dirección de la API y si ese valor es utilizable. **No** indica que la dirección responda: nada comprueba alcanzabilidad.

**No integres contra esa dirección sin confirmarla.** El campo `aviso` que acompaña al archivo te dice cuál de los motivos aplica. El más frecuente es que el administrador todavía no configuró la variable específica de la API, y el archivo trajo una dirección de respaldo que **puede apuntar a otro servicio** — en ese caso vas a recibir `401` o `404` aunque tu clave sea perfectamente válida. Es un síntoma engañoso: parece un problema de credenciales y es un problema de dirección.

Cuando vale `true`, la dirección fue configurada explícitamente como la de esta API y podés usarla tal cual.

Detalle completo de los motivos en la sección 24.

### 22.4 Autenticación: la dirección no alcanza

Saber a dónde conectarte no te autentica. Seguís necesitando tus claves, que **nunca viajan en el archivo exportado** (sección 21.3) y se entregan por un canal aparte. Revisá la sección 2 para el modelo de dos claves y cuál corresponde a cada endpoint.

### 22.5 Si tu sistema corre en el mismo servidor que este servicio (co-locación)

Todo lo anterior (22.1-22.4) asume que le llegás a este servicio por su dirección pública. Hay un caso distinto: si tu sistema corre en **el mismo host físico o VPS**, la dirección pública es la ruta más lenta y menos confiable posible — sale de tu contenedor, cruza a internet, vuelve a entrar por el mismo servidor. En un caso real medido, esa ruta agregaba **~50 segundos por venta** (timeout + reintentos) contra **~476 ms** conectando directo.

Este es un caso de infraestructura, no un contrato HTTP nuevo: no hay endpoints, campos ni autenticación distintos. Es exclusivamente sobre *cómo llega tu contenedor al nuestro* cuando ambos están en la misma máquina.

**Cuándo aplica.** Solo si tu sistema y este servicio corren como contenedores Docker en el mismo host, administrados por el mismo proveedor de infraestructura. Si no estás seguro, no aplica — usá 22.1-22.4.

**Qué necesitás pedirle al administrador.** Esto no lo armás vos solo: requiere que el administrador aprovisione una red Docker compartida en el host y te confirme dos datos:

| Dato | Para qué |
|---|---|
| Nombre de la red compartida | Unir tu contenedor a la misma red Docker que el servicio. Es **distinto por ambiente** — ver tabla abajo |
| Alias de red del servicio | El nombre que resolvés dentro de esa red — **no** el nombre del contenedor real (`fe-test-api-1`), que cambia con un redeploy o un `scale` |

**Nombre de red por ambiente — valor fijo, no varía por consumidor.** Todo consumidor co-locado en un mismo host se une a la misma red por ambiente (más abajo en esta sección se explica qué implica eso cuando hay más de uno):

| Ambiente | `CONSUMER_NETWORK_NAME` | Alias del servicio | Estado |
|---|---|---|---|
| `test` (homologación) | `ventax_fiscal_test` | `facturacion-electronica` | **Operativo**, verificado en vivo el 2026-08-20 |
| `prod` (producción) | `ventax_fiscal_prod` | `facturacion-electronica` | Aprovisionada y verificada desde 2026-08-29 |

El alias es **el mismo string en los dos ambientes** — `facturacion-electronica:8080` siempre. Lo que determina a qué ambiente llegás es la red a la que tu contenedor está unido, no la URL. Si tu clave de consumidor está asignada a `test` (sección 4), unite a `ventax_fiscal_test`; si está en `prod`, a `ventax_fiscal_prod`. Unirte a la red que no corresponde a tu clave no te da acceso — vas a recibir `403` igual, pero confirmalo con el administrador antes de asumir cuál te toca.

Con esos dos datos, en tu propio `docker-compose.yml` (o equivalente):

```yaml
services:
  tu-servicio:
    # ... tu configuración normal ...
    networks:
      default:                # no la saques: sin esto perdés tu propia red interna
      consumer_net:
        # nada más que unirte

networks:
  consumer_net:
    external: true
    name: ventax_fiscal_test   # o ventax_fiscal_prod, según el ambiente de tu clave — ver tabla arriba
```

Y tu variable de conexión pasa a ser el alias, no una IP ni el nombre de contenedor:

```
http://facturacion-electronica:8080/v1
```

**Quién hace qué.** Desde el 2026-08-29 la red la garantiza el propio deploy del servicio de facturación: si no existe, la crea. Las dos redes (`ventax_fiscal_test` y `ventax_fiscal_prod`) ya están operativas. Lo que **no** hace el servicio es unir tu contenedor: eso lo hacés vos, desde tu propio stack.

| Responsabilidad | De quién |
|---|---|
| Que la red exista | del servicio de facturación (automático en cada deploy) |
| Que la API esté unida con el alias `facturacion-electronica` | del servicio de facturación |
| Que **tu** contenedor se una a la red | **tuya** |

Podés unirte de dos formas. La primera es la recomendada, porque sobrevive a que recrees tu contenedor:

```yaml
# en tu propio docker-compose
networks:
  ventax_fiscal:
    external: true
    name: ventax_fiscal_prod
services:
  api:
    networks: [default, ventax_fiscal]
```

```bash
# alternativa, sobre un contenedor ya corriendo — se pierde si lo recreás
docker network connect ventax_fiscal_prod <tu_contenedor>
```

**Por qué sigue sin ser autoservicio del todo.** Necesitás que el administrador te confirme el nombre exacto de la red que te corresponde por ambiente. Un nombre equivocado, o unirte a la red de `prod` cuando tu sistema es de `test`, te conecta al ambiente que no corresponde — verificá explícitamente con el administrador a cuál te uniste antes de emitir el primer documento real.

**Qué NO cambia.** Seguís necesitando tu API key (22.4) y seguís respetando el modelo de dos claves (sección 2). La co-locación te da una ruta de red más corta; no te da acceso ni permisos que no tuvieras ya. Si además tenés consumidores tuyos que **no** están en este host, seguí usando `base_url`/`base_path` del archivo exportado (22.1) para esos — el alias de red compartida solo resuelve desde adentro de esa red Docker, no es una URL pública.

**Si hay más de un consumidor co-locado en la misma red — leé esto antes de integrarte.** Verificamos con una prueba directa (dos contenedores en la misma red Docker) que dos consumidores unidos a la **misma** red compartida quedan alcanzables **entre sí**, no solo cada uno con `facturacion-electronica`. Es el comportamiento estándar de cualquier red Docker con más de un miembro — no algo específico ni exclusivo de este servicio, y no es una falla de diseño, pero sí algo que tenés que saber antes de unirte:

- No expongas en el contenedor que unís a esta red nada que no quieras que otro consumidor co-locado pueda alcanzar directamente.
- Si vas a compartir la red con otro sistema que no controlás vos (por ejemplo, otro proveedor con infraestructura en el mismo host), consultalo explícitamente con el administrador de este servicio antes de integrarte. Puede coordinar una red dedicada por consumidor en lugar de una compartida entre varios, si tu caso lo amerita.
- Esto es exclusivamente sobre la red de co-locación (22.5). No aplica si conectás por `base_url` (22.1) — esa ruta no te expone a otros consumidores en ningún caso.

**Referencia técnica completa** (para quien administra tu infraestructura, no para el día a día de integración): `docs/OPERACION_GIT_DEPLOY.md` y `docs/SPEC_RED_COMPARTIDA_CONSUMIDORES_v0.1.md` del repositorio de este servicio.

---

## 23. Mapa Definitivo de Autenticación por Endpoint

**Agregada el 2026-08-29.** La sección 2 explica el modelo de las dos claves; esta sección es
la referencia exhaustiva, verificada endpoint por endpoint contra el código desplegado en
producción y comprobada con llamadas reales.

**No hay cambio de comportamiento.** El servicio siempre funcionó así. Esta sección corrige
documentación que en algunos artefactos declaraba la clave equivocada; no requiere que
modifiques tu integración, salvo que hoy estés recibiendo `401` en consultas.

### Clave de consumidor

| Método | Endpoint | Permiso |
|---|---|---|
| `POST` | `/v1/factura` | `FACTURA_EMIT` |
| `POST` | `/v1/conciliacion/idempotency` | `IDEMPOTENCY_RECONCILE` |
| `POST` | `/v1/conciliacion/idempotency/cancel-send` | `CANCEL_SEND` |
| `POST` | `/v1/recibos` | `RECIBO_WRITE` |
| `PATCH` | `/v1/recibos/{id}` | `RECIBO_WRITE` |
| `POST` | `/v1/recibos/{id}/emitir` | `RECIBO_WRITE` |
| `DELETE` | `/v1/recibos/{id}` | `RECIBO_WRITE` |
| `POST` | `/v1/recibos/{id}/anular` | `RECIBO_VOID` |
| `GET` | `/v1/recibos` | `RECIBO_READ` |
| `GET` | `/v1/recibos/{id}` | `RECIBO_READ` |
| `GET` | `/v1/recibos/{id}/pdf` | `RECIBO_READ` |
| `GET` | `/v1/recibos/{id}/xml` | `RECIBO_READ` |

### Clave compartida

`POST /v1/nota-credito`, `POST /v1/evento/cancelar`,
`POST /v1/evento/inutilizacionnumfactura`, y **todos** los `GET` de
`/v1/documentos/*` (incluido `/by-cdc/{cdc}` y los `/files/*`), `/v1/consultar/*`
y `/v1/files/*`. Son 25 endpoints. Ninguno verifica permisos ni alcance por emisor.

### Sin autenticación

`GET /v1/health` y `/v1/verificar/recibo/{token}` (más `/pdf` y `/xml`).

### Los permisos de lectura todavía no hacen nada

`DOCUMENTO_READ` y `SIFEN_STATUS_READ` pueden figurar concedidos a tu consumidor, pero
**ninguna ruta los verifica**. Tenerlos no habilita a consultar con la clave de consumidor:
las consultas siguen exigiendo la clave compartida. Están declarados para una migración
futura que todavía no se hizo.

### Diagnóstico rápido de `401`

| Mensaje | Causa |
|---|---|
| `API key requerida` | Falta el header por completo. |
| `API key invalida` | Endpoint de clave compartida; mandaste otra clave (casi siempre la de consumidor). |
| `API key invalida o consumidor inactivo` | Endpoint de clave de consumidor; mandaste la compartida, o tu consumidor está inactivo. |

Si tu integración emite facturas sin problema pero falla al consultar el estado, es
exactamente este caso: estás usando la clave de consumidor en un endpoint que espera la
compartida.

---

## 24. `url_verificada` en detalle: qué significa cada motivo

Sección agregada porque el significado de `url_verificada` se precisó. **No hay cambio de
comportamiento:** el archivo exportado tiene los mismos campos, en el mismo lugar, con los mismos
tipos. Lo que cambió es *cuándo* el sistema se anima a decir `true`, y que ahora el `aviso` te dice
el motivo concreto en vez de un texto genérico. Si tu integración ya funciona, no tenés que tocar
nada.

### 24.1 Qué afirma y qué no afirma

`url_verificada: true` afirma **una** cosa: que un administrador configuró deliberadamente la
dirección de esta API y que el valor es utilizable tal cual.

**No** afirma que la dirección responda. Nadie hace una prueba de conexión al exportar el archivo,
así que un `true` no te garantiza que el servicio esté arriba ni que tu red lo alcance.

### 24.2 Los motivos de `url_verificada: false`

| Situación | Qué pasó | Qué hacer |
|---|---|---|
| **No se configuró la dirección de la API** | El archivo trae una dirección de respaldo, tomada de una variable que existe para los links públicos de verificación de recibos. Esa dirección **puede ser la de otro servicio** (por ejemplo, la página propia de otro integrador) | Pedile al administrador la URL real de la API. **No** integres contra la dirección del archivo |
| **No es `https://`** | La dirección quedó vacía, mal formada o en `http://` | Pedí la dirección definitiva |
| **Es un valor por defecto de desarrollo** | El archivo se exportó desde una instalación que no tiene configurada su URL pública | Pedí la dirección definitiva |
| **Ya termina en `/v1`** | La dirección incluye el prefijo de versión, que vos también agregás por `base_path`. Concatenar ambos da `.../v1/v1/factura` | Avisale al administrador. Mientras tanto, **no** le agregues `base_path` a esa dirección |

### 24.3 El síntoma que más cuesta diagnosticar

Si estás recibiendo **`401` con una clave que sabés que es válida**, revisá la dirección antes que
la credencial.

Un `401` producido por pegarle al host equivocado es indistinguible de un `401` por clave revocada:
la respuesta la genera otro servicio, no esta API, así que ni siquiera aparece en nuestros logs.
Verificá que la dirección que estás usando sea la que corresponde a la API — el `base_url` del
archivo más el `base_path`, y que el archivo diga `url_verificada: true`.

Una comprobación de 5 segundos que descarta el caso: pedile `GET {base_url}{base_path}/health` a la
dirección que estás usando. Si no responde un JSON de esta API, el problema es la dirección, no tu
clave.

---

## 25. Grupo de Actividades Económicas por Perfil de Emisión

### 25.1 `grupo_actividades` en el archivo exportado

Un documento electrónico puede declarar **más de una actividad económica** en el XML (hasta 9, según el Manual Técnico SIFEN v150). Esto es distinto de tener varios perfiles: es un mismo perfil de emisión el que, al emitir, agrega varios bloques de actividad económica en un mismo documento.

Si tu emisor tiene esto configurado, cada perfil en `perfiles_emision.items[]` (sección 21) incluye `grupo_actividades`, un array con las actividades que va a llevar el XML **en el orden en que van a aparecer**:

```json
{
  "perfiles_emision": {
    "items": [
      {
        "codigo": "COBR",
        "actividad_codigo": {
          "valor": "82910",
          "referencia": "GUIA_INTEGRACION_CONSUMIDORES.md#202-emission_profile_code"
        },
        "grupo_actividades": {
          "valor": [
            { "codigo": "82910", "descripcion": "Actividades de agencias de cobro y oficinas de crédito" },
            { "codigo": "82110", "descripcion": "Servicios de administración de oficinas" }
          ],
          "referencia": "GUIA_INTEGRACION_CONSUMIDORES.md#251-grupo_actividades-en-el-archivo-exportado"
        }
      }
    ]
  }
}
```

La primera actividad de `grupo_actividades` **siempre coincide con `actividad_codigo`** del mismo perfil: es la que determina tu logo, tu nombre de fantasía y el formato del KUDE (ticket o A4), igual que hoy. Las siguientes son actividades adicionales que se agregan al XML pero no afectan la presentación del documento.

### 25.2 Es informativo — no cambia lo que enviás

**No tenés que enviar ni elegir nada nuevo.** Seguís mandando `emission_profile_code` (sección 20.2) exactamente igual que antes; el grupo de actividades lo resuelve el sistema del lado del administrador, no vos. Este campo existe solo para que sepas de antemano qué actividades va a llevar el XML de un perfil determinado, sin tener que emitir un documento y leerlo para averiguarlo.

Si tu emisor no tiene grupos configurados, `grupo_actividades` viene con una sola actividad (la misma que `actividad_codigo`) o el campo puede no aparecer, según la versión del archivo — tratalo siempre como opcional.

### 25.3 Compatibilidad

Esta sección y el campo `grupo_actividades` son **aditivos**: agregar un grupo de actividades a un perfil existente no cambia `emission_profile_code`, no cambia ningún otro campo del contrato de emisión, y no rompe ninguna integración que ya esté funcionando. Un perfil sin grupo configurado emite exactamente el mismo XML que antes de que existiera esta funcionalidad.
