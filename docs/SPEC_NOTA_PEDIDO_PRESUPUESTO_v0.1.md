# SPEC Nota de Pedido / Nota de Presupuesto v0.1

## 1. Proposito

Definir el modelo funcional del modulo de documentos comerciales internos no fiscales: **Nota de Pedido** y **Nota de Presupuesto**.

Ambos documentos comparten la misma estructura de datos y el mismo PDF. Se diferencian solo por el tipo declarado al crearlos. No son comprobantes fiscales ni interactuan con SIFEN. Son documentos operativos de apoyo al ciclo comercial del facturador.

El sistema debe emitir un PDF con firma visual del facturador y un codigo QR que permita a cualquier receptor verificar la autenticidad del documento escaneando el codigo. Esta verificacion es publica y no requiere autenticacion.

---

## 2. Tipos De Documento

| Tipo | Uso tipico |
|---|---|
| `PRESUPUESTO` | Cotizacion de precio emitida por el facturador hacia un cliente o prospecto |
| `PEDIDO` | Solicitud de provision de bienes o servicios, tipicamente entre un cliente y el facturador, o entre el facturador y un proveedor |

Ambos tipos comparten la misma tabla, logica y PDF. El tipo solo afecta el titulo visible en el documento.

---

## 3. Modelo De Datos

### 3.1 Tabla `notas_comerciales`

| Campo | Tipo | Descripcion |
|---|---|---|
| `id` | uuid PK | Identificador interno |
| `facturador_id` | uuid FK | Propietario del documento |
| `tipo` | enum(`PRESUPUESTO`,`PEDIDO`) | Tipo del documento |
| `numero` | integer | Correlativo asignado al emitir; null mientras es borrador |
| `estado` | enum(`BORRADOR`,`EMITIDO`) | Estado del documento |
| `destinatario_nombre` | text | Nombre o razon social del destinatario |
| `destinatario_documento_tipo` | text nullable | RUC / CI / PASAPORTE / etc |
| `destinatario_documento` | text nullable | Numero del documento |
| `destinatario_direccion` | text nullable | Direccion del destinatario |
| `destinatario_telefono` | text nullable | Telefono del destinatario |
| `destinatario_email` | text nullable | Email del destinatario |
| `texto_libre` | text nullable | Texto previo a los items (descripcion general, condiciones, referencia, etc) |
| `condicion_pago` | text nullable | Ej: "Credito 30 dias", "Contado", "A convenir" |
| `validez_dias` | integer nullable | Dias de validez desde la emision |
| `verification_token` | uuid unique | Token publico para verificacion QR; generado al crear, inmutable |
| `emitido_at` | timestamptz nullable | Fecha y hora de emision |
| `deleted_at` | timestamptz nullable | Soft delete (solo borradores) |
| `created_at` | timestamptz | Fecha de creacion |
| `updated_at` | timestamptz | Ultima modificacion |

### 3.2 Tabla `notas_comerciales_items`

| Campo | Tipo | Descripcion |
|---|---|---|
| `id` | uuid PK | Identificador interno |
| `nota_id` | uuid FK | Nota a la que pertenece |
| `orden` | integer | Posicion del item en la lista (1-based) |
| `descripcion` | text | Descripcion del producto o servicio |
| `cantidad` | numeric(12,2) | Cantidad |
| `precio_unitario` | numeric(14,2) | Precio unitario sin IVA |
| `iva_tipo` | enum(`IVA_10`,`IVA_5`,`EXENTA`) | Tipo de IVA aplicable |
| `precio_total` | numeric(14,2) | cantidad × precio_unitario (calculado y persistido) |

### 3.3 Tabla `notas_comerciales_numeracion`

| Campo | Tipo | Descripcion |
|---|---|---|
| `facturador_id` | uuid PK | Facturador propietario |
| `tipo` | enum PK | Tipo de documento |
| `ultimo_numero` | integer | Ultimo numero emitido; inicia en 0 |

El numero correlativo se obtiene con `UPDATE ... SET ultimo_numero = ultimo_numero + 1 RETURNING ultimo_numero` dentro de la misma transaccion de emision, garantizando secuencia sin gaps en condiciones normales.

---

## 4. Estados Del Documento

```
BORRADOR  →  EMITIDO
```

- **BORRADOR**: editable en todos sus campos. No tiene numero asignado. Puede eliminarse (soft delete).
- **EMITIDO**: inmutable. Tiene numero asignado. No puede editarse ni eliminarse. Solo puede archivarse logicamente en el futuro si se requiere.

La transicion a EMITIDO es irreversible.

---

## 5. Calculos De Totales

Los totales se calculan en el backend al responder un GET y al emitir el PDF. No se persisten totales en la nota padre; solo `precio_total` por item se persiste.

| Campo calculado | Formula |
|---|---|
| `subtotal_gravado_10` | suma de `precio_total` donde `iva_tipo = IVA_10` |
| `subtotal_gravado_5` | suma de `precio_total` donde `iva_tipo = IVA_5` |
| `subtotal_exento` | suma de `precio_total` donde `iva_tipo = EXENTA` |
| `iva_10` | `subtotal_gravado_10 / 11` (redondeado entero) |
| `iva_5` | `subtotal_gravado_5 / 21` (redondeado entero) |
| `total` | `subtotal_gravado_10 + subtotal_gravado_5 + subtotal_exento` |

---

## 6. Sistema De Verificacion QR

### 6.1 Proposito

Cada nota emitida incluye en su PDF un codigo QR que permite a cualquier receptor verificar que el documento es autentico y fue emitido por el sistema Ventax Facturacion Simple. No requiere login ni cuenta.

### 6.2 Token De Verificacion

- El campo `verification_token` (uuid v4) se genera automaticamente al crear la nota, antes de la primera persistencia.
- Es inmutable: nunca cambia aunque el documento sea editado.
- Solo es operativo en documentos con estado `EMITIDO` — un borrador no expone su QR.
- El token no es el `id` del documento. Usar un token separado permite invalidar el mecanismo en el futuro sin afectar llaves primarias.

### 6.3 URL De Verificacion

```
GET {PUBLIC_APP_BASE_URL}/verificar/nota/{verification_token}
```

Ejemplo: `https://factura.ventax.app/verificar/nota/550e8400-e29b-41d4-a716-446655440000`

Esta URL es publica, sin autenticacion, sin rate-limit agresivo (max 60 req/min por IP).

### 6.4 Respuesta De Verificacion

El endpoint devuelve una pagina HTML simple (no requiere React) o un JSON segun el `Accept` header:

**Documento valido (`200`):**

```json
{
  "valido": true,
  "tipo": "PRESUPUESTO",
  "numero": 42,
  "emitido_at": "2026-06-24T10:00:00Z",
  "facturador": {
    "razon_social": "EMILIO SALDIVAR",
    "ruc": "5057016-1"
  },
  "destinatario": {
    "nombre": "FILARTIGA PALLAROLAS, FIDEL ALBERTO",
    "documento": "562538-6"
  },
  "total": 1050000,
  "mensaje": "Este documento fue emitido por Ventax Facturacion Simple y es autentico."
}
```

**Token invalido o borrador (`404`):**

```json
{
  "valido": false,
  "mensaje": "Este documento no existe o no ha sido emitido. Puede ser una falsificacion."
}
```

### 6.5 Datos Mostrados En El QR Del PDF

El QR se imprime en el pie del PDF, acompanado del texto:
> "Verificar autenticidad: escanea el codigo QR o ingresa a factura.ventax.app/verificar"

El QR codifica la URL completa de verificacion.

### 6.6 Privacidad

La URL de verificacion expone datos minimos del documento (tipo, numero, fecha, facturador, destinatario, total). No expone items detallados, texto libre, ni datos internos. La persona que escanea el QR solo puede confirmar si el documento es autentico o no.

---

## 7. Estructura Del PDF

El PDF se genera en el servidor con Puppeteer (HTML→PDF) sobre una plantilla HTML propia del modulo. Tamanio: A4 vertical.

### 7.1 Secciones Del PDF (De Arriba Hacia Abajo)

```
┌────────────────────────────────────────────┐
│  LOGO / NOMBRE FACTURADOR                  │
│  RUC · Direccion · Telefono · Email        │
├────────────────────────────────────────────┤
│  Tipo de documento: PRESUPUESTO / PEDIDO   │
│  Nro: XXXX          Fecha: DD/MM/YYYY      │
├──────────────────────┬─────────────────────┤
│  DESTINATARIO        │  Condicion de pago  │
│  Nombre / RUC / CI   │  Validez: X dias    │
│  Direccion / Tel     │                     │
├────────────────────────────────────────────┤
│  TEXTO LIBRE (observaciones / contexto)    │
│  (bloque de texto libre, puede ser vacio)  │
├──────────┬───────────────────┬──────┬──────┤
│  Cant    │  Descripcion      │  IVA │ Total│
├──────────┼───────────────────┼──────┼──────┤
│  ...     │  ...              │  10% │  ... │
│  ...     │  ...              │   5% │  ... │
├────────────────────────────────────────────┤
│  Subtotal gravado 10%  |  Gs. XXXX         │
│  IVA 10%               |  Gs. XXXX         │
│  Subtotal gravado 5%   |  Gs. XXXX         │
│  IVA 5%                |  Gs. XXXX         │
│  Total                 |  Gs. XXXX         │
├───────────────────────┬────────────────────┤
│  QR verificacion      │  Firma del emisor  │
│  [codigo QR]          │  _________________ │
│  factura.ventax.app   │  Nombre / RUC      │
└───────────────────────┴────────────────────┘
```

### 7.2 Cabecera Del Facturador

Se obtiene de los datos del facturador activo asociado al `facturador_id` de la nota:
- `razon_social` y/o `nombre_fantasia`
- `ruc`
- `direccion` del establecimiento principal
- `telefono` (campo agregado en migracion 0017)
- `email` del facturador si existe

### 7.3 Texto Libre

Se renderiza como un bloque de texto con saltos de linea respetados (`white-space: pre-wrap`). Si esta vacio, la seccion no aparece en el PDF.

### 7.4 Tabla De Items

Columnas: `Cant` · `Descripcion` · `% IVA` · `Total Gs.`
El precio unitario no se muestra en la columna — queda como dato interno para calcular el total. (Decision de diseno: el receptor ve el total por item, no el precio unitario de forma separada. Puede incluirse si el cliente lo requiere.)

> **Nota:** El ejemplo PDF recibido (orden de provision AESA) muestra: Cant · Descripcion · Importe · % · IVA · Total. Ajustar columnas al confirmar el ejemplo final con el cliente.

---

## 8. API REST

### 8.1 Endpoints

| Metodo | Ruta | Descripcion |
|---|---|---|
| `POST` | `/notas` | Crear nota en estado BORRADOR |
| `GET` | `/notas` | Listar notas del facturador activo |
| `GET` | `/notas/:id` | Obtener nota con items y totales calculados |
| `PATCH` | `/notas/:id` | Actualizar nota (solo BORRADOR) |
| `POST` | `/notas/:id/emitir` | Emitir: asigna numero, cambia estado a EMITIDO |
| `GET` | `/notas/:id/pdf` | Generar y devolver PDF (solo EMITIDO) |
| `DELETE` | `/notas/:id` | Eliminar nota (solo BORRADOR, soft delete) |
| `GET` | `/verificar/nota/:token` | Verificacion publica — sin autenticacion |

### 8.2 Alcance Por Facturador

Todos los endpoints autenticados (`/notas/*`) filtran por el `facturador_id` del contexto operativo del usuario. Un usuario no puede acceder ni listar notas de otro facturador.

### 8.3 Reglas De Negocio

- Items: `cantidad > 0`, `precio_unitario >= 0`.
- Una nota debe tener al menos 1 item para poder emitirse.
- Una vez emitida, cualquier intento de PATCH o DELETE devuelve `409 CONFLICT`.
- El PDF solo se puede solicitar para notas con estado `EMITIDO`.
- El `verification_token` no se expone en la respuesta de listado; solo en el GET individual y al emitir.

---

## 9. UX Operativa

### 9.1 Vista Listado

- Tabs o chips de filtro: `Todos` / `Presupuesto` / `Pedido`
- Columnas visibles: Tipo · Numero · Destinatario · Estado · Fecha · Total
- Acciones por fila: `Ver` / `Descargar PDF` (si EMITIDO) / `Eliminar` (si BORRADOR)
- Boton principal: `+ Nuevo`

### 9.2 Formulario De Alta / Edicion

1. Seleccion de tipo: `Presupuesto` o `Pedido` (selector visible)
2. Destinatario: campo de busqueda con reuso de agenda de clientes del facturador
3. Texto libre: textarea multillinea ("Descripcion / Contexto / Observaciones")
4. Tabla de items: filas dinamicas, cada fila con `descripcion` (autocompletado desde catalogo), `cantidad`, `precio_unitario`, `iva_tipo`; total por fila calculado en tiempo real
5. Panel de totales: visible abajo de la tabla, calculado en tiempo real
6. Condicion de pago y validez: campos opcionales
7. Acciones: `Guardar borrador` / `Emitir` (con confirmacion modal — accion irreversible)

### 9.3 Vista Post-Emision

Al emitir, la UI muestra:
- Numero asignado
- Boton `Descargar PDF`
- Boton `Compartir` (share API nativa del dispositivo si disponible)
- El documento queda en solo-lectura

---

## 10. Criterios De Aceptacion

- Un borrador puede crearse sin items; no puede emitirse sin items.
- Al emitir se asigna el siguiente numero correlativo por tipo y facturador.
- El PDF incluye todos los datos del facturador, destinatario, texto libre, items, totales y QR de verificacion.
- La URL del QR devuelve `200` con datos del documento para notas emitidas.
- La URL del QR devuelve `404` con mensaje de advertencia para tokens inexistentes o borradores.
- La verificacion no requiere autenticacion.
- Un usuario no puede ver ni operar notas de otro facturador.
- Editar una nota emitida devuelve error `409`.

---

## 11. Fuera De Alcance (Esta Version)

- Envio por email directo desde la UI (modulo de notificaciones futuro)
- Estados adicionales: `ACEPTADO`, `RECHAZADO`, `VENCIDO`
- Conversion de presupuesto a factura
- Firma digital criptografica del PDF
- Multi-moneda
