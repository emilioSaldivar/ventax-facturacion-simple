# Spec: Tipo de transacción predeterminado por usuario

## Problema

El usuario debe seleccionar manualmente el tipo de transacción (ej. "Venta de mercadería") cada vez que abre el formulario de nueva factura, aunque la gran mayoría de sus facturas usen siempre el mismo tipo. Esto genera fricción innecesaria.

## Objetivo

Persistir la última selección de `tipo_transaccion` del usuario y usarla como valor inicial la próxima vez que abra el formulario. Sin cambios de UI — solo comportamiento backend + estado inicial en frontend.

## Alcance

**Incluido:**
- Guardar la preferencia de `tipo_transaccion` (1, 2 o 3) por usuario
- Leerla al cargar el contexto operacional
- Pre-poblar el estado inicial del formulario con ese valor
- Actualizarla automáticamente al emitir cada factura exitosamente

**Excluido:**
- Cambios de UI (sin pantallas de configuración, sin botones extra)
- Guardar preferencia de `condicion_venta` (CONTADO/CREDITO) — eso queda para futuro
- Lógica de múltiples perfiles por usuario

## Comportamiento esperado

1. Usuario abre formulario de nueva factura → el selector `Tipo de servicio` ya aparece en el último valor que usó (default inicial: 2 = Prestación de servicios, igual que hoy)
2. Usuario cambia a "Venta de mercadería" y emite → la próxima factura nueva ya tendrá "Venta de mercadería" pre-seleccionado
3. La preferencia es global por usuario (no por sesión ni por facturador)

## Diseño técnico

### 1. Migración de base de datos

Nueva columna en `usuario_operacion_config`:

```sql
alter table usuario_operacion_config
  add column tipo_transaccion_default smallint not null default 2
  check (tipo_transaccion_default in (1, 2, 3));
```

Razón: `usuario_operacion_config` ya tiene unique index `(usuario_id)`, es el lugar correcto para preferencias per-user.

### 2. Context API — lectura

- `context.repository.ts` → `ContextRow`: agregar `tipo_transaccion_default: number`
- Query SQL: agregar `uoc.tipo_transaccion_default` al SELECT
- `context.types.ts` → `FiscalContext`: agregar `tipo_transaccion_default: 1 | 2 | 3`
- Mapear en el return de `getOperationalContext()`

### 3. Context API — actualización tras emisión

En `facturas.service.ts`, dentro de `enqueueFacturaEmission()`, después de persistir la factura en DB y antes del return:

```sql
update usuario_operacion_config
  set tipo_transaccion_default = $1,
      updated_at = now()
  where usuario_id = $2
    and activo = true
    and deleted_at is null
```

El `usuario_id` ya está disponible como parte del contexto que se pasa al servicio.

### 4. Frontend — estado inicial

En `apps/web-operacion/src/main.tsx`, la inicialización actual:

```ts
const [tipoTransaccion, setTipoTransaccion] = useState<TipoTransaccionServicio>(2);
```

Reemplazar por:

```ts
const [tipoTransaccion, setTipoTransaccion] = useState<TipoTransaccionServicio>(
  (context?.fiscal_context?.tipo_transaccion_default ?? 2) as TipoTransaccionServicio
);
```

Donde `context` es la respuesta del endpoint `/context` que ya se carga al inicio de la app.

## Archivos afectados

| Archivo | Cambio |
|---|---|
| `db/migrations/0017_tipo_transaccion_default.sql` | Nueva migración (ALTER TABLE) |
| `apps/api/src/modules/context/context.types.ts` | Agregar campo a `FiscalContext` |
| `apps/api/src/modules/context/context.repository.ts` | SELECT + mapeo del nuevo campo |
| `apps/api/src/modules/facturas/facturas.service.ts` | UPDATE tras emisión exitosa |
| `apps/web-operacion/src/main.tsx` | Inicializar estado desde contexto |

## Criterios de aceptación

- [ ] Primera factura de un usuario nuevo usa tipo 2 (prestación de servicios) — comportamiento sin cambios
- [ ] Tras emitir una factura con tipo 1, la siguiente apertura del formulario inicia con tipo 1
- [ ] Si el UPDATE de preferencia falla, la factura ya fue emitida — no hacer rollback de la factura por esto (best-effort)
- [ ] No hay cambios visuales en el formulario
