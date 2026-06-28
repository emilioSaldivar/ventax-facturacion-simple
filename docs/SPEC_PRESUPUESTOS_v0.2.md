# SPEC Presupuestos v0.2

## Alineacion

- `AGENTS.md`
- `docs/PLAN_PRESUPUESTOS_v0.2.md`
- `docs/TASKS_PRESUPUESTOS_v0.2.md`

---

## Contexto y motivacion

El modulo actual `notas_comerciales` implementa la base funcional correctamente: persistencia, PDF, verificacion QR, emision con numero correlativo. Sin embargo presenta problemas de comunicacion y UX:

- El nombre "Nota de Presupuesto" no es el vocabulario del usuario. El usuario dice "voy a hacer un presupuesto".
- La lista no comunica valor: sin agrupacion por fecha, sin busqueda, tarjetas planas.
- El detalle no tiene jerarquia clara de acciones.
- El PDF parece una factura recortada, no un documento comercial.
- No existe ciclo de vida comercial: emitir no es el fin, es el comienzo.
- El flujo natural (presupuesto → cliente acepta → factura) no esta soportado.

Esta version v0.2 transforma el modulo en un CRM comercial minimo.

---

## Estrategia de renaming

El renaming es **solo de capa de presentacion**. El backend (tabla, API path, tipos internos) NO cambia.

| Capa | Antes | Despues |
|---|---|---|
| Navegacion | Notas / Presupuestos | Presupuestos |
| Eyebrow listado | Documentos comerciales | Presupuestos |
| Boton nueva | + Nueva nota | + Nuevo presupuesto |
| Formulario titulo | Nota de Presupuesto | Presupuesto |
| PDF titulo | NOTA DE PRESUPUESTO | PRESUPUESTO |
| Nav sidebar label | Notas / Presupuestos | Presupuestos |
| Tab all | Todos | (eliminado) |
| Heading detalle | Nota de Presupuesto | Presupuesto |

Los tipos internos `PRESUPUESTO` y `PEDIDO` no cambian. La tabla `notas_comerciales` no cambia. El path `/api/v1/notas` no cambia.

---

## Modelo de datos — cambios en `notas_comerciales`

Nueva migracion `0024_presupuestos_v02.sql`:

```sql
-- Vigencia del presupuesto
ALTER TABLE notas_comerciales ADD COLUMN valido_hasta date;

-- Observaciones libres (bullet points, condiciones, notas)
ALTER TABLE notas_comerciales ADD COLUMN observaciones text;

-- Estado comercial (solo aplica cuando estado = 'EMITIDO')
CREATE TYPE nota_estado_comercial AS ENUM (
  'PENDIENTE_RESPUESTA',
  'ACEPTADO',
  'RECHAZADO'
);
ALTER TABLE notas_comerciales
  ADD COLUMN estado_comercial nota_estado_comercial;

-- Referencia al item de catalogo (para preservar iva_tipo al convertir en factura)
ALTER TABLE notas_comerciales_items
  ADD COLUMN catalog_item_id uuid REFERENCES catalogo_items(id) ON DELETE SET NULL;
```

`catalog_item_id` es nullable — solo se persiste cuando el operador seleccionó el item desde el typeahead del catálogo. Items ad-hoc tienen `catalog_item_id = null`.

No se agrega `factura_convertida_id` en esta version — la conversion es frontend-only (v1.0 lo hara bidireccional).

---

## Maquina de estados

El estado combinado que ve el usuario surge de dos columnas:

| `estado` (DB) | `estado_comercial` (DB) | `valido_hasta` vs hoy | Estado visual |
|---|---|---|---|
| BORRADOR | null | cualquiera | Borrador |
| EMITIDO | null | > hoy o null | Pendiente |
| EMITIDO | PENDIENTE_RESPUESTA | > hoy o null | Pendiente |
| EMITIDO | null o PENDIENTE_RESPUESTA | <= hoy | Vencido |
| EMITIDO | ACEPTADO | cualquiera | Aceptado |
| EMITIDO | RECHAZADO | cualquiera | Rechazado |

El estado VENCIDO es **calculado en frontend y en respuesta API** — no se persiste. El cron de auto-vencimiento es v1.0.

Transiciones permitidas (via `PATCH /notas/:id/estado-comercial`):
- PENDIENTE_RESPUESTA → ACEPTADO
- PENDIENTE_RESPUESTA → RECHAZADO
- ACEPTADO → PENDIENTE_RESPUESTA (revertir)
- RECHAZADO → PENDIENTE_RESPUESTA (revertir)
- Solo aplica cuando `nota.estado = 'EMITIDO'`

---

## Nuevos campos en Create/Update

`NotaCreateInput` y `NotaUpdateInput` incorporan:
- `valido_hasta?: string | null` — formato ISO date `YYYY-MM-DD`
- `observaciones?: string | null` — texto libre con saltos de linea

Al emitir (`POST /notas/:id/emitir`):
- Si `valido_hasta` es null, se asigna automaticamente `fecha_emision + 30 dias`.

---

## Nuevo endpoint: duplicar

`POST /notas/:id/duplicar`

Crea un nuevo BORRADOR copiando: `tipo`, `cliente_nombre`, `cliente_ruc`, `items`, `observaciones`. No copia: `numero`, `estado`, `fecha_emision`, `valido_hasta`, `estado_comercial`, `verification_token` (nuevo UUID).

Respuesta: `NotaRecord` del nuevo BORRADOR.

---

## UI — Lista de presupuestos

Patron identico a la lista de facturas. Tres secciones:

### Encabezado
```
PRESUPUESTOS
[Buscar presupuesto...]
```
- Input de busqueda por nombre de cliente o numero (filtro client-side sobre los resultados ya cargados).

### Tabs de tipo
```
[ Presupuestos ]  [ Pedidos ]
```
Dos tabs fijos: **Presupuestos** (tipo=PRESUPUESTO) y **Pedidos** (tipo=PEDIDO). Se elimina el tab "Todos" y el tab suelto anterior. La seleccion del tab dispara el fetch con `?tipo=PRESUPUESTO` o `?tipo=PEDIDO`. Por defecto activo: Presupuestos.

Ambos tipos comparten exactamente la misma estructura de datos, el mismo formulario, el mismo detalle y el mismo PDF. La unica diferencia es el nombre que aparece en el titulo del documento:
- tipo PRESUPUESTO → "Presupuesto", PDF: "PRESUPUESTO"
- tipo PEDIDO → "Pedido", PDF: "NOTA DE PEDIDO"

El boton de nueva nota cambia segun el tab activo:
- Tab Presupuestos → "+ Nuevo presupuesto"
- Tab Pedidos → "+ Nuevo pedido"

### Botones de accion
```
+ Nuevo presupuesto   (o + Nuevo pedido segun tab)
```

### Lista agrupada por fecha
Igual al patron de facturas: cabecera "Hoy", "Ayer", "Ultimos 7 dias", "Ultimos 30 dias".

### Tarjeta de presupuesto
```
📄  Presupuesto 000138          ⋮
    Anthony Racing
    Gs. 739.000      11/06/2026
                    [Pendiente]
```

Chip de estado con color:
- Borrador → gris
- Pendiente → amarillo
- Vencido → naranja/rojo
- Aceptado → verde
- Rechazado → rojo

Menu de tarjeta (⋮):
- Ver
- Compartir enlace
- Enviar por WhatsApp
- Duplicar
- Eliminar (solo BORRADOR)

---

## UI — Formulario de presupuesto

Identico al formulario actual excepto:
- Titulo: "Presupuesto" (no "Nota de Presupuesto")
- Nuevo campo **Validez**: date picker con default `+30 dias` al emitir.
- Nuevo campo **Observaciones**: textarea al final del formulario, placeholder "Ej: Repuestos no incluidos. Vigencia 30 dias."
- Boton emitir: "Emitir presupuesto" (no "Emitir")

---

## UI — Detalle del presupuesto

### Cabecera
```
← Presupuestos

Presupuesto                    [Pendiente]
Nº 000138

Anthony Racing
RUC: 7777777-7
```

### Resumen
```
RESUMEN
Total             Gs. 739.000
Validez           11/07/2026 (vence en 30 dias)
Conceptos         2 items
```

### Conceptos presupuestados (colapsable, como facturas)
```
Conceptos presupuestados    2 items  ▼

  Consultoria              Gs. 149.000
  Implementacion           Gs. 590.000
```

### Observaciones (solo si existen)
```
OBSERVACIONES
• Repuestos no incluidos.
• Vigencia 30 dias.
```

### Acciones frecuentes
```
📱  Enviar por WhatsApp
🔗  Compartir presupuesto
📄  Ver / Descargar PDF
```

### Convertir en factura (solo estado EMITIDO, no RECHAZADO)
```
╔═══════════════════════════════╗
║  Convertir en factura →       ║
╚═══════════════════════════════╝
```

Al presionar: navega a InvoiceView con datos pre-cargados (cliente + items). El usuario revisa IVA por item y confirma. No hay link bidireccional en v0.2.

Si ya fue convertido a factura (v1.0): mostrar "Factura Nº 00000045 — Ver factura →".

### Cambio de estado comercial
```
Marcar como:
[Aceptado]   [Rechazado]
```
Solo visible cuando `estado = EMITIDO` y estado_comercial != ACEPTADO/RECHAZADO.

### Mas opciones
```
Copiar enlace
Duplicar presupuesto
Eliminar (solo BORRADOR)
Editar (solo BORRADOR)
```

---

## PDF — Diseno mejorado

### Encabezado

```
[LOGO]                    PRESUPUESTO
Empresa SRL               Nº 0000138
RUC: 80012345-6
Rubro                     Emitido: 11/06/2026
Direccion                 Valido hasta: 11/07/2026
Tel: 0981-123456           [QR]
```

El tipo ("PRESUPUESTO" o "PEDIDO") como titulo grande. No "NOTA DE...".

### Cliente
```
CLIENTE
Anthony Racing
RUC/CI: 7777777-7
```

### Tabla — cabecera renombrada
```
CONCEPTOS PRESUPUESTADOS

Descripcion          Cant.    Precio Unit.    Total
Consultoria             1      149.000       149.000
Implementacion          1      590.000       590.000
```

### Totales — bloque visible
```
                   ┌─────────────────────────────┐
                   │ Subtotal          Gs. 739.000 │
                   │ TOTAL             Gs. 739.000 │
                   └─────────────────────────────┘
```
Fondo azul oscuro (`#1e3a5f`) o negro, texto blanco. Total en letras debajo.

### Observaciones (si existen)
```
OBSERVACIONES
Repuestos no incluidos. Vigencia 30 dias.
Sujeto a disponibilidad.
```

### Pie de pagina
```
Este documento corresponde a un presupuesto comercial y no constituye
un comprobante fiscal. Para aceptar este presupuesto comuniquese con nosotros.

Verificar en: https://factura.ventax.app/verificar/nota/TOKEN
```

---

## Pagina publica de verificacion (mejora de respuesta API)

El endpoint `GET /verificar/nota/:token` ya existe. En v0.2 enriquece la respuesta con:
- `items`: array completo de filas (descripcion, cantidad, precio_total)
- `observaciones`: texto de observaciones
- `valido_hasta`: fecha de vigencia
- `estado_comercial`: estado actual
- `estado_visual`: enum calculado (`PENDIENTE | ACEPTADO | RECHAZADO | VENCIDO | BORRADOR`)

La pagina HTML publica enriquecida (`/verificar/nota/:token` como ruta SPA) es **v1.0** — requiere una ruta publica separada sin auth. En v0.2 solo se mejora el JSON de respuesta.

---

## "Convertir en factura" — especificacion del flujo

1. Usuario ve el detalle de un presupuesto EMITIDO.
2. Presiona "Convertir en factura".
3. El frontend navega a InvoiceView (`setView("facturas")`) con `initialDraft` construido con las siguientes reglas de mapeo:

### Reglas de mapeo de items

Solo los items `fila_tipo = ITEM` con `precio_unitario > 0` se transfieren. Todo lo demas se omite.

Para esos items, la regla unificada es:

| Caso | `iva_tipo` usado | `precio_unitario` | `descripcion` | `catalog_item_id` |
|---|---|---|---|---|
| Item seleccionado del catalogo (`catalog_item_id` != null) | el del catalogo (ej. IVA_10, IVA_5, EXENTO) | del presupuesto | del presupuesto | incluido — vincula con el item de catalogo |
| Item ad-hoc (`catalog_item_id` = null) | IVA_10 por defecto | del presupuesto | del presupuesto | null |

**Regla clave:** el precio del presupuesto siempre tiene precedencia sobre el precio del catalogo. La descripcion del presupuesto siempre tiene precedencia. Solo el `iva_tipo` se toma del catalogo cuando el item tiene origen en el catalogo.

| Fila del presupuesto | Condicion | Accion |
|---|---|---|
| `fila_tipo = ITEM`, `precio_unitario > 0`, `catalog_item_id` != null | item de catalogo con precio | incluir → `iva_tipo` del catalogo + precio/descripcion del presupuesto |
| `fila_tipo = ITEM`, `precio_unitario > 0`, `catalog_item_id` = null | item ad-hoc con precio | incluir → `iva_tipo: 'IVA_10'` + precio/descripcion del presupuesto |
| `fila_tipo = ITEM`, `precio_unitario` null o 0 | sin precio | **omitir** |
| `fila_tipo = ITEM_SIN_PRECIO` | sin precio por definicion | **omitir** |
| `fila_tipo = CONTEXTO` | descripcion sin precio | **omitir** |

Para obtener el `iva_tipo` del catalogo en el frontend sin llamada adicional: el endpoint `GET /notas/:id` retorna items con `catalog_iva_tipo` (campo enriquecido via JOIN con `catalogo_items` en el repository). Ese valor es el que se usa al construir el `initialDraft`.

### Datos de cliente
- `cliente_nombre` del presupuesto → `formClienteNombre` en InvoiceView
- `cliente_ruc` del presupuesto → `formClienteRuc` en InvoiceView
- No se dispara autocomplete DNIT automaticamente (el operador lo puede hacer manualmente si necesita)

### InvoiceView con initialDraft
- Abre directamente el formulario (`subView = "form"`)
- Items pre-cargados: `descripcion`, `cantidad` (o 1 si null), `precio_unitario`, `iva_tipo: 'IVA_10'`
- Ningun item se guarda en catalogo — se agregan como items ad-hoc sin `catalog_item_id`
- El operador puede ajustar IVA por item antes de emitir

### Post-conversion
- No hay actualizacion automatica del presupuesto en v0.2
- El operador puede marcar manualmente el presupuesto como ACEPTADO desde el detalle
- El link bidireccional (Factura Nº XXXX generada desde este presupuesto) es v1.0

Para implementar el `initialDraft`, se pasa como prop a `InvoiceView` desde el componente padre. `InvoiceView` recibe `initialDraft?: InvoiceInitialDraft` y, si esta presente al montar, inicializa el formulario con esos datos.

---

## Fuera de alcance v0.2

- Pagina HTML publica enriquecida (rica landing de verificacion).
- Auto-marcar VENCIDO via cron job.
- Boton "Aceptar presupuesto" en pagina publica.
- Tracking bidireccional presupuesto ↔ factura (`factura_convertida_id`).
- Modulo Pedidos separado.
- Cotizaciones como tipo distinto.
- Historial de cambios de estado.
