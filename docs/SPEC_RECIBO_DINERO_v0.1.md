# SPEC Recibo de Dinero v0.1

## 1. Proposito

Definir el modelo funcional del modulo de **Recibos de Dinero**.

Un recibo de dinero acredita que el facturador recibio un pago de un tercero. Puede originarse de dos formas:

1. **Desde una factura a credito** — boton `Emitir recibo` en el detalle de la factura; pre-llena todos los datos del cliente y el importe.
2. **Alta directa** — desde el modulo propio de recibos, para cobros no vinculados a una factura especifica del sistema.

El recibo NO es un comprobante fiscal. No interactua con SIFEN ni con facturacion-electronica. Es un documento operativo de soporte al cobro.

El sistema debe emitir un PDF con datos del facturador y un codigo QR que permita verificar la autenticidad del recibo sin necesidad de autenticacion.

---

## 2. Origenes Del Recibo

### 2.1 Desde Factura A Credito

- Solo facturas con `condicion_venta = CREDITO` pueden originar un recibo vinculado.
- El recibo hereda: nombre del cliente, documento del cliente, importe de la factura, numero de factura como referencia.
- El importe puede ajustarse (pago parcial) al momento de crear el recibo.
- Una factura puede tener multiples recibos (pagos parciales).
- El sistema registra el `factura_id` en el recibo como referencia, pero no modifica el estado de la factura.

### 2.2 Alta Directa

- El usuario completa todos los campos manualmente.
- No requiere que exista una factura en el sistema.
- Util para cobros de facturas emitidas por otros medios, honorarios, cuotas, etc.

---

## 3. Modelo De Datos

### 3.1 Tabla `recibos_dinero`

| Campo | Tipo | Descripcion |
|---|---|---|
| `id` | uuid PK | Identificador interno |
| `facturador_id` | uuid FK | Propietario del recibo |
| `numero` | integer | Correlativo asignado al emitir; null mientras borrador |
| `estado` | enum(`BORRADOR`,`EMITIDO`) | Estado del recibo |
| `fecha_cobro` | date | Fecha en que se recibio el pago (puede ser distinta a la de emision) |
| `pagador_nombre` | text | Nombre o razon social del pagador |
| `pagador_documento_tipo` | text nullable | RUC / CI / PASAPORTE / etc |
| `pagador_documento` | text nullable | Numero del documento del pagador |
| `concepto` | text | Descripcion libre del cobro (ej: "Pago factura N° 100", "Cuota mensual julio") |
| `importe` | numeric(14,2) | Monto recibido (siempre positivo, > 0) |
| `forma_pago` | enum | Ver seccion 4 |
| `referencia_bancaria` | text nullable | Numero de transferencia, cheque, voucher, etc |
| `factura_id` | uuid FK nullable | Referencia a factura del sistema (si aplica) |
| `factura_numero_display` | text nullable | Numero de factura legible para el PDF (se copia al emitir) |
| `verification_token` | uuid unique | Token publico para verificacion QR; generado al crear, inmutable |
| `emitido_at` | timestamptz nullable | Fecha y hora de emision del recibo |
| `deleted_at` | timestamptz nullable | Soft delete (solo borradores) |
| `created_at` | timestamptz | Fecha de creacion |
| `updated_at` | timestamptz | Ultima modificacion |

### 3.2 Tabla `recibos_dinero_numeracion`

| Campo | Tipo | Descripcion |
|---|---|---|
| `facturador_id` | uuid PK | Facturador propietario |
| `ultimo_numero` | integer | Ultimo numero emitido; inicia en 0 |

El numero correlativo es unico por facturador (no por tipo — los recibos no tienen subtipo).

---

## 4. Forma De Pago

| Valor | Etiqueta visible |
|---|---|
| `EFECTIVO` | Efectivo |
| `TRANSFERENCIA` | Transferencia Bancaria |
| `CHEQUE` | Cheque |
| `TARJETA_CREDITO` | Tarjeta de Credito |
| `TARJETA_DEBITO` | Tarjeta de Debito |
| `OTRO` | Otro |

Valor por defecto: `EFECTIVO`.

---

## 5. Estados Del Recibo

```
BORRADOR  →  EMITIDO
```

- **BORRADOR**: editable. Sin numero. Puede eliminarse (soft delete).
- **EMITIDO**: inmutable. Con numero. PDF disponible. No puede editarse ni eliminarse.

La transicion es irreversible.

---

## 6. Sistema De Verificacion QR

### 6.1 Proposito

Cada recibo emitido incluye en su PDF un codigo QR que permite verificar que el documento es autentico y fue emitido por el sistema. El receptor puede escanear el QR para confirmar que el recibo no es una falsificacion.

### 6.2 Token De Verificacion

- El campo `verification_token` (uuid v4) se genera al crear el recibo, antes de la primera persistencia.
- Es inmutable: no cambia si el borrador es editado.
- Solo funciona en estado `EMITIDO` — un borrador no tiene QR activo.
- Es un token separado del `id` para permitir rotacion futura sin afectar llaves primarias.

### 6.3 URL De Verificacion

```
GET {PUBLIC_APP_BASE_URL}/verificar/recibo/{verification_token}
```

Ejemplo: `https://factura.ventax.app/verificar/recibo/550e8400-e29b-41d4-a716-446655440000`

Esta URL es publica, sin autenticacion, con rate-limit de 60 req/min por IP.

### 6.4 Respuesta De Verificacion

**Recibo valido (`200`):**

```json
{
  "valido": true,
  "numero": 15,
  "fecha_cobro": "2026-06-24",
  "emitido_at": "2026-06-24T14:30:00Z",
  "facturador": {
    "razon_social": "EMILIO SALDIVAR",
    "ruc": "5057016-1"
  },
  "pagador": {
    "nombre": "FILARTIGA PALLAROLAS, FIDEL ALBERTO",
    "documento": "562538-6"
  },
  "concepto": "Pago factura N° 100",
  "importe": 1050000,
  "forma_pago": "EFECTIVO",
  "factura_referencia": "100",
  "mensaje": "Este recibo fue emitido por Ventax Facturacion Simple y es autentico."
}
```

**Token invalido o borrador (`404`):**

```json
{
  "valido": false,
  "mensaje": "Este recibo no existe o no ha sido emitido. Puede ser una falsificacion."
}
```

### 6.5 En El PDF

El QR se imprime en el pie del recibo, con el texto:
> "Verificar autenticidad en factura.ventax.app/verificar"

---

## 7. Estructura Del PDF

Tamanio: A5 o media carta (recibos son documentos mas compactos que presupuestos). Se puede ofrecer A4 si el cliente lo prefiere.

### 7.1 Secciones Del PDF

```
┌──────────────────────────────────────────┐
│  RECIBO DE DINERO                        │
│  Nro: XXXX          Fecha: DD/MM/YYYY    │
├──────────────────────────────────────────┤
│  EMITIDO POR                             │
│  Nombre facturador / RUC                 │
│  Direccion · Telefono · Email            │
├──────────────────────────────────────────┤
│  RECIBIDO DE                             │
│  Nombre/razon social del pagador         │
│  RUC / CI: XXXXX                         │
├──────────────────────────────────────────┤
│  CONCEPTO                                │
│  [texto libre del concepto]              │
│  Referencia factura: N° XXX (si aplica)  │
├──────────────────────────────────────────┤
│  IMPORTE RECIBIDO                        │
│  Gs. 1.050.000                           │
│  (UN MILLON CINCUENTA MIL GUARANIES)     │
├──────────────────────────────────────────┤
│  FORMA DE PAGO: Efectivo                 │
│  Referencia bancaria: (si aplica)        │
├─────────────────────┬────────────────────┤
│  QR verificacion    │  Firma del emisor  │
│  [codigo QR]        │  _________________ │
│                     │  Nombre / RUC      │
└─────────────────────┴────────────────────┘
```

### 7.2 Importe En Letras

El importe se convierte a texto en guaranies (ej: `1.050.000 Gs.` → `UN MILLON CINCUENTA MIL GUARANIES`). La conversion es obligatoria en el PDF.

### 7.3 Cabecera Del Facturador

Igual que en Nota de Pedido/Presupuesto: `razon_social`, `ruc`, direccion del establecimiento principal, telefono, email.

---

## 8. API REST

### 8.1 Endpoints

| Metodo | Ruta | Descripcion |
|---|---|---|
| `POST` | `/recibos` | Crear recibo en estado BORRADOR (alta directa) |
| `GET` | `/recibos` | Listar recibos del facturador activo |
| `GET` | `/recibos/:id` | Obtener recibo completo |
| `PATCH` | `/recibos/:id` | Actualizar recibo (solo BORRADOR) |
| `POST` | `/recibos/:id/emitir` | Emitir: asigna numero, cambia estado a EMITIDO |
| `GET` | `/recibos/:id/pdf` | Generar y devolver PDF (solo EMITIDO) |
| `DELETE` | `/recibos/:id` | Eliminar recibo (solo BORRADOR, soft delete) |
| `POST` | `/facturas/:id/recibo` | Crear recibo borrador pre-llenado desde factura credito |
| `GET` | `/facturas/:id/recibos` | Listar recibos vinculados a una factura |
| `GET` | `/verificar/recibo/:token` | Verificacion publica — sin autenticacion |

### 8.2 Reglas De Negocio

- `importe > 0` siempre.
- `fecha_cobro` no puede ser futura.
- `POST /facturas/:id/recibo` solo acepta facturas con `condicion_venta = CREDITO`; devuelve `422` si la factura es de contado.
- Una vez emitido, cualquier intento de PATCH o DELETE devuelve `409 CONFLICT`.
- El PDF solo se puede generar para recibos en estado `EMITIDO`.
- El `verification_token` solo se expone en el GET individual y al emitir.
- Un usuario no puede acceder a recibos de otro facturador.

### 8.3 Pre-llenado Desde Factura

`POST /facturas/:id/recibo` devuelve un recibo en estado BORRADOR con:

```json
{
  "pagador_nombre": "[nombre cliente de la factura]",
  "pagador_documento_tipo": "[tipo doc cliente]",
  "pagador_documento": "[doc cliente]",
  "concepto": "Pago factura N° [numero]",
  "importe": [total de la factura],
  "forma_pago": "EFECTIVO",
  "factura_id": "[id de la factura]",
  "factura_numero_display": "[numero legible]"
}
```

El usuario puede modificar el importe antes de emitir (pago parcial).

---

## 9. UX Operativa

### 9.1 Acceso Desde Factura Credito

En el panel de detalle de una factura con `condicion_venta = CREDITO`, aparece la seccion **Cobros**:

- Lista de recibos ya emitidos vinculados a la factura (numero, importe, fecha, forma de pago)
- Boton `+ Emitir recibo de cobro`
- Al tocar el boton: llama a `POST /facturas/:id/recibo`, crea el borrador y navega al formulario de recibo pre-llenado

### 9.2 Modulo Propio — Listado

- Busqueda por numero, pagador o concepto
- Filtro por fecha y forma de pago
- Columnas: Numero · Pagador · Concepto · Importe · Forma de pago · Estado · Fecha
- Acciones: `Ver` / `Descargar PDF` (si EMITIDO) / `Eliminar` (si BORRADOR)
- Boton principal: `+ Nuevo recibo`

### 9.3 Formulario Alta / Edicion

1. Pagador: busqueda con reuso de agenda de clientes
2. Fecha de cobro (default: hoy)
3. Concepto: texto libre
4. Importe
5. Forma de pago (selector)
6. Referencia bancaria (opcional, visible si forma de pago != EFECTIVO)
7. Factura vinculada (campo opcional de busqueda por numero de factura, solo credito)
8. Acciones: `Guardar borrador` / `Emitir` (con confirmacion modal)

### 9.4 Vista Post-Emision

- Numero asignado visible
- Boton `Descargar PDF`
- Boton `Compartir` (share API nativa)
- Documento en solo-lectura

---

## 10. Criterios De Aceptacion

- Un recibo puede emitirse sin vinculo a factura.
- Un recibo vinculado a factura solo puede crearse desde facturas credito.
- Al emitir se asigna el siguiente numero correlativo por facturador.
- El PDF incluye datos del facturador, pagador, concepto, importe en numeros y letras, forma de pago, referencia y QR de verificacion.
- La URL del QR devuelve `200` con datos para recibos emitidos.
- La URL del QR devuelve `404` para tokens inexistentes o borradores.
- La verificacion no requiere autenticacion.
- Un usuario no puede operar recibos de otro facturador.
- Editar o eliminar un recibo emitido devuelve `409`.

---

## 11. Fuera De Alcance (Esta Version)

- Control de saldo pendiente por factura (suma de importe de recibos vs total factura)
- Cambio de estado de factura a "pagada" automaticamente al cubrir el total
- Envio del recibo por email al pagador
- Multi-moneda
- Firma digital criptografica del PDF
