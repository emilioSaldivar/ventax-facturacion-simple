# PLAN Presupuestos v0.2

## Alineacion

- `AGENTS.md`
- `docs/SPEC_PRESUPUESTOS_v0.2.md`
- `docs/TASKS_PRESUPUESTOS_v0.2.md`

---

## Orden de ejecucion

```
1. DB — migracion
2. API — tipos
3. API — repository
4. API — service
5. API — routes (nuevos endpoints)
6. API — PDF
7. API — verificacion (respuesta enriquecida)
8. API — openapi.yaml
9. API — typecheck + build
10. Frontend — InvoiceView (prop initialDraft)
11. Frontend — NotasView completo (renaming + UX + acciones)
12. Frontend — typecheck + build
13. QA — Playwright
```

---

## Fase 1 — Migracion DB

### `db/migrations/0024_presupuestos_v02.sql`

```sql
CREATE TYPE nota_estado_comercial AS ENUM (
  'PENDIENTE_RESPUESTA',
  'ACEPTADO',
  'RECHAZADO'
);

ALTER TABLE notas_comerciales
  ADD COLUMN valido_hasta date,
  ADD COLUMN observaciones text,
  ADD COLUMN estado_comercial nota_estado_comercial;
```

No hay cambios en tablas de items. No hay indices adicionales requeridos.

---

## Fase 2 — API tipos (`notas.types.ts`)

Cambios en `apps/api/src/modules/notas/notas.types.ts`:

- Agregar `type NotaEstadoComercial = 'PENDIENTE_RESPUESTA' | 'ACEPTADO' | 'RECHAZADO'`
- Agregar a `NotaRecord`: `valido_hasta: string | null`, `observaciones: string | null`, `estado_comercial: NotaEstadoComercial | null`
- Agregar a `NotaFilaRecord`: `catalog_item_id: string | null`, `catalog_iva_tipo: string | null`
- Agregar a `NotaCreateInput`: `valido_hasta?: string | null`, `observaciones?: string | null`
- Agregar a `NotaUpdateInput`: `valido_hasta?: string | null`, `observaciones?: string | null`
- Agregar a `NotaFilaInput`: `catalog_item_id?: string | null`
- Agregar a `NotasRepository`: `actualizarEstadoComercial(id, facturadorId, estado): Promise<NotaRecord>`, `duplicar(id, facturadorId): Promise<NotaRecord>`

---

## Fase 3 — Repository (`notas.repository.ts`)

Cambios en `apps/api/src/modules/notas/notas.repository.ts`:

- `create()`: incluir `valido_hasta`, `observaciones` en INSERT de nota. Incluir `catalog_item_id` en INSERT de items.
- `update()`: incluir `valido_hasta`, `observaciones` en SET dinamico. Incluir `catalog_item_id` en re-insert de items.
- `emitir()`: si `valido_hasta` es null, asignar `fecha_emision + INTERVAL '30 days'`
- `rowToRecord()`: mapear los tres campos nuevos de nota.
- Query de items (usado en `findById`, `duplicar`): LEFT JOIN con `catalogo_items` para obtener `iva_tipo` como `catalog_iva_tipo`:
  ```sql
  SELECT ni.*, ci.iva_tipo AS catalog_iva_tipo
  FROM notas_comerciales_items ni
  LEFT JOIN catalogo_items ci ON ci.id = ni.catalog_item_id
  WHERE ni.nota_id = $1
  ORDER BY ni.orden
  ```
- Nuevo metodo `actualizarEstadoComercial(id, facturadorId, estado)`:
  - Valida `estado = 'EMITIDO'`
  - UPDATE `estado_comercial` WHERE id + facturador_id
  - Retorna `NotaRecord`
- Nuevo metodo `duplicar(id, facturadorId)`:
  - SELECT nota + items (con catalog_item_id y catalog_iva_tipo)
  - INSERT nuevo registro con nuevos IDs, estado = BORRADOR, sin numero/fecha_emision/estado_comercial
  - Copia items incluyendo `catalog_item_id` (para preservar el vinculo con el catalogo)
  - Retorna `NotaRecord` del nuevo BORRADOR

---

## Fase 4 — Service (`notas.service.ts`)

Cambios en `apps/api/src/modules/notas/notas.service.ts`:

- `actualizarEstadoComercial(id, facturadorId, nuevoEstado)`:
  - Valida que `nota.estado === 'EMITIDO'`
  - Llama `repository.actualizarEstadoComercial`
- `duplicarNota(id, facturadorId)`:
  - Llama `repository.duplicar`
  - Retorna el nuevo `NotaRecord`

---

## Fase 5 — Routes (`notas.routes.ts`)

Nuevos endpoints en `apps/api/src/modules/notas/notas.routes.ts`:

```
PATCH  /notas/:id/estado-comercial
  body: { estado_comercial: 'PENDIENTE_RESPUESTA' | 'ACEPTADO' | 'RECHAZADO' }
  → actualizarEstadoComercial

POST   /notas/:id/duplicar
  → duplicarNota → 201 con NotaRecord
```

---

## Fase 6 — PDF (`notas.pdf.ts`)

Archivo: `apps/api/src/modules/notas/notas.pdf.ts`

`buildNotaPdfHtml` recibe `nota: NotaConItems` — que ahora incluye `valido_hasta` y `observaciones`. Sin cambios en firma.

Cambios en el HTML generado:
- `tipoLabel`: "PRESUPUESTO" (no "NOTA DE PRESUPUESTO")
- Encabezado derecho: agregar linea "Valido hasta: {valido_hasta}" si existe
- `<th>Descripcion</th>` → `<th>Conceptos presupuestados</th>` (como label de seccion, no de columna — ver spec)
- Bloque de totales: fondo `#1e3a5f`, texto blanco, mostrar Subtotal + TOTAL
- Observaciones: bloque nuevo antes del footer si `nota.observaciones` existe
- Footer texto: reemplazar "Este documento no es un comprobante fiscal" por el texto largo del spec

---

## Fase 7 — Verificacion (`verificacion.routes.ts`)

Archivo: `apps/api/src/modules/verificacion/verificacion.routes.ts`

El handler `GET /verificar/nota/:token` retorna actualmente el resultado de `verificarNota()`. Enriquecer respuesta con:
- `items[]`: filas de la nota (cuando `valido: true`)
- `observaciones`
- `valido_hasta`
- `estado_comercial`
- `estado_visual`: calculado en el service

Para `estado_visual`, agregar helper en `notas.service.ts`:
```typescript
function calcularEstadoVisual(nota: NotaRecord): 'BORRADOR' | 'PENDIENTE' | 'VENCIDO' | 'ACEPTADO' | 'RECHAZADO'
```

`verificarNota()` en `notas.service.ts` necesita recibir `NotaConItems` (no solo `NotaRecord`) para incluir los items. Ajustar el llamado en `notas.repository.ts` si `findByVerificationToken` retorna solo `NotaRecord` — cambiarlo a `findByVerificationTokenConItems`.

---

## Fase 8 — OpenAPI (`spec/openapi.yaml`)

- Agregar campo `valido_hasta`, `observaciones`, `estado_comercial` a schemas `NotaRecord` y `NotaConItems`
- Agregar path `PATCH /notas/{notaId}/estado-comercial` con schema de body y respuesta
- Agregar path `POST /notas/{notaId}/duplicar` con respuesta `NotaRecord`
- Actualizar schema `NotaCreateRequest` y `NotaUpdateRequest`
- Actualizar `NotaVerificacionResponse` con nuevos campos

---

## Fase 9 — Frontend: InvoiceView — prop `initialDraft`

Archivo: `apps/web-operacion/src/main.tsx`

Agregar interfaz:
```typescript
interface InvoiceInitialDraft {
  cliente_nombre: string;
  cliente_ruc: string | null;
  items: Array<{
    descripcion: string;
    cantidad: number | null;
    precio_unitario: number | null;
    iva_tipo: 'IVA_10' | 'IVA_5' | 'EXENTO';  // del catalogo si existe, IVA_10 si ad-hoc
    catalog_item_id: string | null;
  }>;
}
```

`InvoiceView` recibe `initialDraft?: InvoiceInitialDraft`. Si esta presente al montar:
- `setSubView("form")`
- Pre-cargar `formClienteNombre`, `formClienteRuc`, `formItems` con los datos del draft
- Cada item usa el `iva_tipo` del draft (ya resuelto por NotasView al construir el draft)

La logica de construccion del draft vive en `NotasView.handleConvertirEnFactura(nota)`:
```typescript
const items = nota.items
  .filter(f => f.fila_tipo === 'ITEM' && f.precio_unitario && f.precio_unitario > 0)
  .map(f => ({
    descripcion: f.descripcion,
    cantidad: f.cantidad ?? 1,
    precio_unitario: f.precio_unitario!,
    iva_tipo: f.catalog_iva_tipo ?? 'IVA_10',
    catalog_item_id: f.catalog_item_id ?? null,
  }));
```

---

## Fase 10 — Frontend: NotasView — renovacion completa

Archivo: `apps/web-operacion/src/main.tsx`

### 10.1 Tipos frontend
- Agregar `valido_hasta`, `observaciones`, `estado_comercial` a `NotaListItem`
- Agregar `catalog_item_id: string | null` y `catalog_iva_tipo: string | null` a `NotaConItems.items`
- Agregar `catalog_item_id?: string | null` a `NotaFilaDraft` (se asigna al seleccionar del typeahead del catalogo)
- Agregar helper `calcularEstadoVisual(nota: NotaListItem): string`

### 10.2 Lista
- Eliminar tabs (Todos / Presupuesto / Pedido)
- Agregar estado `busqueda: string` y filtrar `notas` por cliente_nombre/numero en tiempo real
- Agrupar lista por fecha usando el mismo helper de InvoiceView
- Reemplazar `<tr>` planos por tarjetas de estilo igual a facturas
- Menu de tarjeta: Ver, Compartir, WhatsApp, Duplicar, Eliminar

### 10.3 Formulario
- Titulo: "Presupuesto" / "Pedido"
- Agregar campo `formValidoHasta: string` (input type="date", default vacío)
- Agregar campo `formObservaciones: string` (textarea)
- Incluir en el body de create/update/emitir

### 10.4 Detalle
- Seccion Resumen (Total, Validez, Conceptos count)
- Seccion Conceptos presupuestados (colapsable)
- Seccion Observaciones (si existen)
- Acciones reorganizadas: frecuentes + "Mas opciones"
- Boton "Convertir en factura" (llama `onConvertirEnFactura(nota)`)
- Chips de estado_comercial con cambio rapido (Aceptado / Rechazado)

### 10.5 Labels globales
- `notas: "Presupuestos"` en el mapa de titulos de modulo
- Nav sidebar: `{ label: "Presupuestos", view: "notas", ... }`

### 10.6 Prop en NotasView
- Recibe `onConvertirEnFactura: (nota: NotaListItem) => void`
- Implementado en el componente padre: `setView("facturas")` + pasarle `initialDraft`

---

## Fase 11 — CSS (`styles.css`)

Nuevas clases o ajustes:
- Chips de estado_comercial (colores segun estado)
- `.presupuesto-card` si se diferencia de `.invoice-card`
- `.resumen-grid` para el bloque de resumen en detalle
- `.acciones-frecuentes` + `.mas-opciones` para la reorganizacion de acciones

---

## Archivos modificados

| Archivo | Tipo de cambio |
|---|---|
| `db/migrations/0024_presupuestos_v02.sql` | nuevo |
| `apps/api/src/modules/notas/notas.types.ts` | modificar |
| `apps/api/src/modules/notas/notas.repository.ts` | modificar |
| `apps/api/src/modules/notas/notas.service.ts` | modificar |
| `apps/api/src/modules/notas/notas.routes.ts` | modificar |
| `apps/api/src/modules/notas/notas.pdf.ts` | modificar |
| `apps/api/src/modules/verificacion/verificacion.routes.ts` | modificar |
| `spec/openapi.yaml` | modificar |
| `apps/web-operacion/src/main.tsx` | modificar |
| `apps/web-operacion/src/styles.css` | modificar |
