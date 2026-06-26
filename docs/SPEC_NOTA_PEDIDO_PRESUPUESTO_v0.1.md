# SPEC Nota de Pedido / Nota de Presupuesto v0.1

## 1. Proposito

Definir el modelo funcional del modulo de documentos comerciales internos no fiscales: **Nota de Pedido** y **Nota de Presupuesto**.

Ambos tipos comparten la misma estructura de datos y el mismo PDF. El tipo solo afecta el titulo visible en el encabezado. No son comprobantes fiscales ni interactuan con SIFEN.

El sistema emite un PDF firmado visualmente por el facturador y un codigo QR que permite verificar la autenticidad del documento sin necesidad de autenticacion.

---

## 2. Tipos De Documento

| Tipo | Titulo en PDF |
|---|---|
| `PRESUPUESTO` | NOTA DE PRESUPUESTO |
| `PEDIDO` | NOTA DE PEDIDO |

---

## 3. Cabecera Del PDF

Basado en los ejemplos reales, la cabecera replica exactamente la estructura de una factura electronica del sistema.

### 3.1 Zonas De La Cabecera

```
┌──────────────────┬──────────────────────────────────────┬──────────────┐
│  LOGO            │  [Banner oscuro]                     │  Nro:        │
│  (imagen del     │  rubro_descripcion                   │  0023        │
│   facturador)    ├──────────────────────────────────────┤  (destacado) │
│                  │  direccion — localidad — pais        │              │
│                  │  Tel: telefono                       │              │
│                  │  RUC: ruc                            │              │
│                  │  NOTA DE PRESUPUESTO                 │              │
│                  │  No valido como comprobante de venta │              │
├──────────────────┴──────────────────────────────────────┴──────────────┤
│  DE [razon_social del facturador]                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Origen De Cada Campo

| Campo visual | Origen en DB |
|---|---|
| Logo | `facturadores.logo_url` (nuevo campo) |
| Banner texto rubro | `facturadores.rubro_descripcion` (nuevo campo) |
| Dirección + localidad | `facturador_establecimientos.direccion` del establecimiento principal del facturador |
| Teléfono | `facturadores.telefono` |
| RUC | `facturadores.ruc` |
| Nombre propietario ("DE ...") | `facturadores.razon_social` |

### 3.3 Numero De Documento

Formato: `NNNN` con ceros a la izquierda (4 dígitos mínimo). Ejemplos reales: `0023`, `0138`. Se asigna al emitir.

### 3.4 Campos Nuevos Necesarios En `facturadores`

| Campo | Tipo | Descripcion |
|---|---|---|
| `logo_url` | text nullable | URL publica o path del logo del facturador configurado desde backoffice |
| `rubro_descripcion` | text nullable | Descripcion corta del rubro (ej: "Chapería - Pintura - Mantenimiento...") |

Estos campos se configuran desde el backoffice. El usuario operativo no los edita.

---

## 4. Bloque De Cliente

Debajo de la cabecera, antes de los ítems:

```
┌──────────────────────┬─────────────────────────────────┐
│  FECHA DE EMISIÓN:   │  DD/MM/YYYY                     │
│  RUC:                │  [ruc del cliente o "—"]        │
├──────────────────────┴─────────────────────────────────┤
│  CLIENTE:  [nombre o razon social]                     │
└────────────────────────────────────────────────────────┘
```

El RUC del cliente puede ser vacío — en ese caso se muestra `—` (ejemplo real: cliente persona física sin RUC visible).

---

## 5. Modelo De Datos

### 5.1 Tabla `notas_comerciales`

| Campo | Tipo | Descripcion |
|---|---|---|
| `id` | uuid PK | Identificador interno |
| `facturador_id` | uuid FK | Propietario del documento |
| `tipo` | enum(`PRESUPUESTO`,`PEDIDO`) | Tipo del documento |
| `numero` | integer nullable | Correlativo asignado al emitir; null mientras borrador |
| `estado` | enum(`BORRADOR`,`EMITIDO`) | Estado del documento |
| `fecha_emision` | date nullable | Fecha de emision; asignada al emitir (no editable) |
| `cliente_nombre` | text | Nombre o razon social del cliente |
| `cliente_ruc` | text nullable | RUC o CI del cliente |
| `verification_token` | uuid unique | Token publico para QR; generado al crear, inmutable |
| `emitido_at` | timestamptz nullable | Timestamp exacto de emision |
| `deleted_at` | timestamptz nullable | Soft delete (solo borradores) |
| `created_at` | timestamptz | — |
| `updated_at` | timestamptz | — |

Campos removidos respecto al borrador anterior: `destinatario_direccion`, `destinatario_telefono`, `destinatario_email`, `texto_libre`, `condicion_pago`, `validez_dias`. Los PDFs reales no los usan.

### 5.2 Tabla `notas_comerciales_items`

Cada nota tiene una lista de filas. Las filas son de tres tipos:

| Tipo (`fila_tipo`) | Comportamiento |
|---|---|
| `CONTEXTO` | Fila descriptiva. Aparece en negrita. Sin cantidad ni precio. Sirve como encabezado de la seccion en el PDF. |
| `ITEM` | Fila con cantidad, precio unitario y total. |
| `ITEM_SIN_PRECIO` | Fila con descripcion y cantidad opcional, pero sin precio (`—`). Util para repuestos a cargo de terceros o trabajos incluidos sin costo. |

| Campo | Tipo | Descripcion |
|---|---|---|
| `id` | uuid PK | — |
| `nota_id` | uuid FK | Nota a la que pertenece |
| `orden` | integer | Posicion (1-based); define el orden de aparicion |
| `fila_tipo` | enum(`CONTEXTO`,`ITEM`,`ITEM_SIN_PRECIO`) | Tipo de fila |
| `descripcion` | text | Texto de la fila. Acepta saltos de linea para sub-items tipo lista (el usuario escribe manualmente "• texto") |
| `cantidad` | numeric(12,2) nullable | Solo para `ITEM`. Null para `CONTEXTO` e `ITEM_SIN_PRECIO` |
| `precio_unitario` | numeric(14,2) nullable | Solo para `ITEM`. Null para los demas tipos |
| `precio_total` | numeric(14,2) nullable | `cantidad × precio_unitario`. Null para los demas tipos |

### 5.3 Tabla `notas_comerciales_numeracion`

| Campo | Tipo | Descripcion |
|---|---|---|
| `facturador_id` | uuid PK | — |
| `tipo` | enum PK | PRESUPUESTO o PEDIDO |
| `ultimo_numero` | integer | Ultimo numero emitido; inicia en 0 |

Numeracion separada por tipo y por facturador.

---

## 6. Calculos De Total

Solo se calcula y muestra un **total unico** (suma de `precio_total` de todos los items con tipo `ITEM`). No hay desglose de IVA en la nota. Los PDFs reales confirman este comportamiento.

```
total = SUM(precio_total) WHERE fila_tipo = 'ITEM'
```

El total se calcula en backend al momento de generar el PDF y al responder el GET del documento.

### 6.1 Total En Letras

Obligatorio en el PDF. Convierte el total numerico a texto en guaranies.

Ejemplos de los PDFs reales:
- `1.750.000` → "Un millon setecientos cincuenta mil guaranies"
- `650.000` → "Seiscientos cincuenta mil guaranies"
- `739.000` → "Setecientos treinta y nueve mil"

La conversion se implementa en el backend con una funcion local (sin libreria externa).

---

## 7. Estados Del Documento

```
BORRADOR  →  EMITIDO
```

- **BORRADOR**: editable libremente, sin numero, eliminable (soft delete).
- **EMITIDO**: inmutable, con numero asignado, `fecha_emision` fijada, PDF disponible. No se puede editar ni eliminar.

La transicion es irreversible. Al emitir:
1. Se obtiene el siguiente numero correlativo en transaccion atomica.
2. Se asigna `fecha_emision = today`.
3. Se cambia estado a `EMITIDO`.

---

## 8. Sistema De Verificacion QR

### 8.1 Token

El campo `verification_token` (uuid v4) se genera al **crear** el documento (estado BORRADOR). Es inmutable. El QR solo es funcional cuando el estado es `EMITIDO`.

### 8.2 URL De Verificacion

```
GET {PUBLIC_APP_BASE_URL}/verificar/nota/{verification_token}
```

Endpoint publico, sin autenticacion. Rate-limit: 60 req/min por IP.

### 8.3 Respuesta

**Valido (`200`):**
```json
{
  "valido": true,
  "tipo": "PRESUPUESTO",
  "numero": 23,
  "fecha_emision": "2025-12-15",
  "facturador": { "razon_social": "...", "ruc": "5057016-1" },
  "cliente": { "nombre": "EL SOL DEL PARAGUAY...", "ruc": "80006416-0" },
  "total": 1750000,
  "mensaje": "Este documento fue emitido por Ventax Facturacion Simple y es autentico."
}
```

**Invalido o borrador (`404`):**
```json
{
  "valido": false,
  "mensaje": "Este documento no existe o no ha sido emitido. Puede ser una falsificacion."
}
```

### 8.4 En El PDF

El QR se ubica en el **pie inferior izquierdo** del PDF. Junto al QR, el texto:
> "Verificar autenticidad: factura.ventax.app/verificar"

---

## 9. Estructura Completa Del PDF

```
┌─────────────────────────────────────────────────────────────┐
│  CABECERA (logo + rubro + datos + Nro)                      │
│  DE [razon_social]                                          │
├─────────────────────────────────────────────────────────────┤
│  FECHA DE EMISION:  DD/MM/YYYY   |  RUC: [cliente ruc]     │
│  CLIENTE: [nombre cliente]                                  │
├──────────┬──────────────────────────────────┬──────┬────────┤
│  CANT.   │  DESCRIPCION                     │ P.U. │ TOTAL  │
├──────────┼──────────────────────────────────┼──────┼────────┤
│          │  [Fila CONTEXTO — bold]           │      │        │
├──────────┼──────────────────────────────────┼──────┼────────┤
│  1       │  [Fila ITEM]                     │350Gs │ 350Gs  │
│          │  [Fila ITEM_SIN_PRECIO]          │  —   │   —    │
│          │  ...                             │      │        │
├──────────┴──────────────────────────────────┴──────┴────────┤
│  TOTAL                                          1.750.000 gs│
├─────────────────────────────────────────────────────────────┤
│  TOTAL: Un millon setecientos cincuenta mil guaranies——--   │
├──────────────────────────┬──────────────────────────────────┤
│  [QR verificacion]       │  (espacio firma opcional futuro) │
│  factura.ventax.app/...  │                                  │
└──────────────────────────┴──────────────────────────────────┘
```

**Tamanio del PDF**: A4 vertical.

**Columnas de la tabla**: CANT. | DESCRIPCION | P.UNITARIO | TOTAL

- Filas `CONTEXTO`: toda la fila en negrita, celdas de P.UNIT y TOTAL vacias.
- Filas `ITEM`: cantidad, descripcion, precio unitario con formato `350.000 gs`, total con formato `350.000- gs`.
- Filas `ITEM_SIN_PRECIO`: descripcion visible, P.UNIT y TOTAL muestran `—`.

---

## 10. API REST

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| `POST` | `/notas` | SI | Crear nota en estado BORRADOR |
| `GET` | `/notas` | SI | Listar notas del facturador activo |
| `GET` | `/notas/:id` | SI | Obtener nota con items y total calculado |
| `PATCH` | `/notas/:id` | SI | Actualizar nota (solo BORRADOR) |
| `POST` | `/notas/:id/emitir` | SI | Emitir nota |
| `GET` | `/notas/:id/pdf` | SI | Generar y devolver PDF (solo EMITIDO) |
| `DELETE` | `/notas/:id` | SI | Eliminar nota (solo BORRADOR) |
| `GET` | `/verificar/nota/:token` | NO | Verificacion publica del QR |

Todos los endpoints autenticados filtran por `facturador_id` del contexto operativo.

**Reglas:**
- Una nota debe tener al menos 1 fila de tipo `ITEM` para poder emitirse.
- PATCH o DELETE sobre nota EMITIDA → `409 CONFLICT`.
- PDF sobre nota BORRADOR → `409 CONFLICT`.
- Insercion de items: se valida `cantidad > 0` y `precio_unitario >= 0` para tipo `ITEM`.

---

## 11. UX Operativa

### 11.1 Listado

- Chips de filtro: Todos / Presupuesto / Pedido
- Columnas: Tipo · Nro · Cliente · Estado · Fecha · Total
- Acciones por fila: Ver · Descargar PDF (si EMITIDO) · Eliminar (si BORRADOR)
- CTA principal: `+ Nueva nota`

### 11.2 Formulario

1. Tipo: selector `Presupuesto` / `Pedido`
2. Cliente: busqueda en agenda del facturador (reusa componente existente)
3. Tabla de filas dinamica:
   - Boton `+ Contexto` agrega fila tipo CONTEXTO (textarea, sin precio)
   - Boton `+ Item` agrega fila tipo ITEM (descripcion + cantidad + precio unitario; total calculado en tiempo real)
   - Boton `+ Item sin precio` agrega fila ITEM_SIN_PRECIO (descripcion + cantidad; precio = —)
   - Cada fila tiene handle de arrastre para reordenar y boton de eliminar
4. Total calculado en tiempo real debajo de la tabla
5. Acciones: `Guardar borrador` · `Emitir` (confirmacion modal — irreversible)

### 11.3 Post-emision

- Numero asignado visible
- Boton `Descargar PDF`
- Boton `Compartir` (Web Share API si disponible)
- Vista de solo lectura

---

## 12. Criterios De Aceptacion

- Una nota sin filas tipo `ITEM` no puede emitirse.
- Al emitir se asigna el numero correlativo por tipo y facturador en transaccion atomica.
- El PDF muestra la cabecera con logo (o solo texto si no hay logo), rubro, direccion, RUC, tipo, numero, cliente, tabla de filas con sus tipos diferenciados, total numerico, total en letras y QR.
- La URL del QR devuelve 200 para notas EMITIDAS y 404 para borradores o tokens inexistentes.
- La verificacion es publica y sin autenticacion.
- Un usuario no puede ver ni operar notas de otro facturador.
- Modificar o eliminar una nota EMITIDA devuelve 409.

---

## 13. Fuera De Alcance — v0.1

- Subir el logo desde la app operativa (solo backoffice)
- Firma digital criptografica del PDF
- Estados adicionales: ACEPTADO, RECHAZADO, VENCIDO
- Conversion de presupuesto a factura
- Envio por email desde la UI
- Condicion de pago y validez (posible v0.2)
- Multi-moneda
