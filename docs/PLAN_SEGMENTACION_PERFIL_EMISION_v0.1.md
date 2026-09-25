# PLAN Segmentación por Perfil de Emisión, Atribución de Usuario y Rol de Consulta v0.1

**Versión:** 0.1
**Fecha:** 2026-09-19
**Estado:** DRAFT — pendiente TASKS

## Alineación

- `AGENTS.md`
- `docs/SPEC_SEGMENTACION_PERFIL_EMISION_v0.1.md` (fuente funcional; las reglas se citan como RN-xx)
- `docs/PLAN_IMPORT_CONFIG_FACTURADOR_v0.1.md` (crea los perfiles que acá se consumen; su Fase 10 comparte el selector de asignación)
- `docs/TASKS_SEGMENTACION_PERFIL_EMISION_v0.1.md` (a crear)

---

## 1. Estrategia técnica

Cinco decisiones que ordenan todo el trabajo.

### 1.1 La columna es opcional en todas las tablas, siempre

`actividad_punto_perfil_id` se agrega como **nullable** en `catalogo_items`, `facturas_operativas`, `recibos_dinero` y `notas_comerciales`. Nunca se vuelve obligatoria, ni siquiera después del backfill.

- Un ítem sin perfil es **compartido** (RN-01): es un estado válido y deseado, no un dato faltante.
- Un documento sin perfil es **histórico** y visible para todos los operadores del facturador (RN-09): ocultarlo sería peor que mostrarlo de más.
- Deja la migración reversible en su efecto visible (criterio 21 del SPEC): poner la columna en `null` en todas las filas restaura el comportamiento actual sin revertir el esquema.

### 1.2 El alcance se resuelve en el servidor, nunca se recibe del cliente

El contexto operativo ya se resuelve en **cada** request (`getOperationalContext(req.user!.id)`, invocado en `facturas.routes.ts:131` y en el resto de los módulos). El perfil sale de ahí.

Ningún endpoint acepta `actividad_punto_perfil_id` en el cuerpo ni en la query: aceptarlo permitiría a un operador leer o emitir en un perfil ajeno. El único filtro por perfil que se acepta desde el cliente es el del **rol de consulta**, que por definición ve todos.

### 1.3 Un solo lugar por módulo decide el alcance

El filtro no se reparte por las consultas: cada módulo expone una función única que arma la cláusula de alcance, y todas las lecturas pasan por ella.

En facturas ese lugar ya existe: `buildListWhere` (`facturas.repository.ts:1497`). Se extiende su firma para recibir el alcance en vez de solo el `facturadorId`, y las consultas que hoy filtran a mano (`findById:88`, `findByIdempotencyKey:128`, `findNotaCreditoByOriginal:169`, `list:215`, `count:227`) pasan a usar el mismo helper. En catálogo, recibos y notas se crea el equivalente.

Motivo: con nueve caminos de lectura por módulo, un filtro olvidado es una fuga silenciosa de datos entre unidades de negocio. Un único helper convierte eso en un cambio de una línea y en un test que lo cubre entero.

```ts
export type AlcanceLectura =
  | { tipo: "PERFIL"; facturadorId: string; actividadPuntoPerfilId: string }  // operador
  | { tipo: "FACTURADOR"; facturadorId: string };                             // consulta

// Operador:  facturador_id = $1 and (actividad_punto_perfil_id = $2 or actividad_punto_perfil_id is null)
// Consulta:  facturador_id = $1
```

La rama `or … is null` es la implementación literal de RN-09 y de RN-01: el operador ve lo suyo **más** lo compartido o histórico.

### 1.4 El rol de consulta no toca el camino de emisión

`getOperationalContext` y `OperationalContextResponse` **no se modifican**. El usuario de consulta se resuelve por una función aparte, `getConsultaContext(userId)`, que devuelve un tipo propio sin `fiscal_context`.

Consecuencia buscada (RN-20 y criterio 20 del SPEC): las pruebas de emisión existentes deben pasar **sin una sola modificación**. Si alguna falla, el diseño se desvió.

### 1.5 La atribución se expone antes de migrar nada

`facturas_operativas.usuario_id` ya existe y es `not null`, así que **está poblado en todo el histórico por definición del esquema**. Lo escriben los tres `insert into facturas_operativas` del repositorio (`facturas.repository.ts:316, 488, 648`); las otras seis apariciones de `usuario_id` en ese archivo pertenecen a `insert into audit_events`. Lo único que falta es **seleccionarlo**.

Por eso la fase 2 (exponer el emisor en facturas) entrega valor visible sin ninguna migración de datos y sin ningún riesgo, y se puede desplegar sola.

---

## 2. Arquitectura del cambio

```
request  ──▶  requireAuth  ──▶  ¿rol?
                                 │
        ┌────────────────────────┴───────────────────────┐
        │ OPERADOR_FACTURACION                           │ CONSULTA_FACTURADOR
        ▼                                                ▼
 getOperationalContext(userId)                    getConsultaContext(userId)
 (sin cambios: fiscal_context completo)           (nuevo: facturador + perfiles, sin fiscal)
        │                                                │
        ▼                                                ▼
 AlcanceLectura { PERFIL }                        AlcanceLectura { FACTURADOR }
        │                                                │
        └────────────────────┬───────────────────────────┘
                             ▼
              buildAlcanceWhere(alcance)   ← un helper por módulo
                             │
        ┌────────────────────┼────────────────────┬──────────────────┐
        ▼                    ▼                    ▼                  ▼
   catalogo_items    facturas_operativas    recibos_dinero    notas_comerciales
```

---

## 3. Orden de ejecución

```
F0. Autorización por lista blanca              (precondición, sin cambios de comportamiento)
 1. Exponer usuario emisor en facturas         (sin migración, desplegable solo)
 2. Migración: columnas de perfil y de usuario
 3. Backfill de perfil y de atribución         (script idempotente, verificable)
 4. Alcance de lectura: facturas
 5. Alcance de lectura: catálogo + coherencia en emisión
 6. Alcance de lectura: recibos y presupuestos
 7. Rol de consulta: modelo y superficie de lectura
 8. Rol de consulta: alta desde el backoffice
 9. UI operativa: perfil y emisor visibles, app recortada para consulta
10. OpenAPI + Playwright + evidencia
```

Las fases F0, 1 y 2 son independientes entre sí. De la 4 en adelante cada una es un módulo, y **cada una se despliega y se verifica por separado**: si el alcance de facturas rompe algo, catálogo todavía no cambió.

---

## Fase F0 — Autorización por lista blanca

Precondición del rol de consulta (§0 del SPEC). Sin esto, cualquier rol nuevo hereda por descarte los permisos de soporte interno.

**Backend** — `apps/api/src/modules/facturas/facturas.service.ts`:

```ts
// Antes (4 ocurrencias: :400, :438, :524, y el helper :571)
if (context.user.role === "OPERADOR_FACTURACION") throw new HttpError(403, …);

// Después
const ROLES_SOPORTE = ["SOPORTE_INTERNO", "ADMIN_INTERNO"] as const;
function assertSoporteInterno(context: OperationalContextResponse, message: string): void {
  if (!ROLES_SOPORTE.includes(context.user.role as (typeof ROLES_SOPORTE)[number])) {
    throw new HttpError(403, "FORBIDDEN", message);
  }
}
```

Las cuatro ocurrencias pasan a llamar al helper. `assertInternalSupportRole` (`:571`) se reescribe internamente y conserva su nombre y su firma: las llamadas existentes no cambian.

**Frontend** — `apps/web-operacion/src/main.tsx`:

```ts
// :1778
const isInternalSupport = role === "SOPORTE_INTERNO" || role === "ADMIN_INTERNO";
// :2311  →  usa isInternalSupport en lugar de role !== "OPERADOR_FACTURACION"
```

**Verificación:** el comportamiento para los tres roles actuales es idéntico. Un test parametrizado por rol deja constancia de la equivalencia y protege el invariante hacia adelante.

---

## Fase 1 — Exponer el usuario emisor en facturas

Sin migración. Entrega el criterio 9 del SPEC (el histórico muestra su emisor) de forma aislada.

**Repository** (`facturas.repository.ts`): agregar a las cinco proyecciones de lectura el join y las columnas:

```sql
join usuarios u on u.id = f.usuario_id
-- select … u.id as usuario_id, u.username, u.display_name
```

Las consultas hoy no tienen alias de tabla (`from facturas_operativas` a secas): se introduce `f` en las cinco, junto con el join. Es un cambio mecánico y el `typecheck` cubre el mapeo de filas.

**Tipos** (`facturas.types.ts:109-140`): `DocumentoResponse` suma

```ts
emitido_por: { id: string; username: string; display_name: string | null } | null;
```

Nullable por prudencia: `usuario_id` es `not null`, pero un usuario borrado lógicamente no debe romper el listado.

**UI** (`apps/web-operacion/src/main.tsx`): columna y línea de detalle con `display_name ?? username`. En mobile va como segunda línea de la fila, no como columna nueva.

---

## Fase 2 — Migración de esquema

`db/migrations/0032_segmentacion_perfil_emision.sql`, aditiva y sin backfill (el backfill va en su propio paso, fase 3, para poder correrlo y verificarlo por separado).

```sql
-- Perfil de emisión (nullable en las cuatro: ver PLAN §1.1)
alter table catalogo_items       add column actividad_punto_perfil_id uuid references actividad_punto_perfiles(id);
alter table facturas_operativas  add column actividad_punto_perfil_id uuid references actividad_punto_perfiles(id);
alter table recibos_dinero       add column actividad_punto_perfil_id uuid references actividad_punto_perfiles(id);
alter table notas_comerciales    add column actividad_punto_perfil_id uuid references actividad_punto_perfiles(id);

-- Atribución de usuario donde no existe (facturas_operativas ya la tiene desde 0007)
alter table recibos_dinero    add column usuario_id uuid references usuarios(id);
alter table notas_comerciales add column usuario_id uuid references usuarios(id);

-- Marca de atribución retroactiva (RN-13): la UI no puede presentarla como autoría verificada
alter table recibos_dinero    add column usuario_atribucion_historica boolean not null default false;
alter table notas_comerciales add column usuario_atribucion_historica boolean not null default false;

-- Índices del filtro combinado, con la misma condición parcial de los existentes
create index catalogo_items_facturador_perfil_idx
  on catalogo_items (facturador_id, actividad_punto_perfil_id) where deleted_at is null;
create index facturas_operativas_facturador_perfil_created_idx
  on facturas_operativas (facturador_id, actividad_punto_perfil_id, created_at desc) where deleted_at is null;
create index recibos_dinero_facturador_perfil_idx
  on recibos_dinero (facturador_id, actividad_punto_perfil_id) where deleted_at is null;
create index notas_comerciales_facturador_perfil_idx
  on notas_comerciales (facturador_id, actividad_punto_perfil_id) where deleted_at is null;
```

`recibos_dinero` y `notas_comerciales` no tienen `tenant_id`: se scopean por `facturador_id`, y así se mantiene.

**Nota sobre el índice de facturas:** el existente `facturas_operativas_facturador_created_idx (facturador_id, created_at desc)` sigue sirviendo al rol de consulta, que no filtra por perfil. El nuevo sirve al operador. No se elimina ninguno.

---

## Fase 3 — Backfill

`db/migrations/0033_segmentacion_backfill.sql`, separado del esquema para poder inspeccionar el resultado antes de seguir, y escrito de forma **idempotente** (solo toca filas con la columna en `null`).

### 3.1 Facturas — perfil desde el snapshot

**Forma real del snapshot, verificada en el código.** `fiscal_request_snapshot` guarda el objeto que devuelve
`buildFiscalEmitRequest` (`facturas.service.ts:1133-1154`) —y `buildFiscalNotaCreditoRequest` (`:1156-1183`) para las NC—,
persistido por los tres `insert into facturas_operativas` (`facturas.repository.ts:316, 488, 648`). Su bloque `fiscal_context`
es el `FiscalContext` completo del contexto operativo:

```jsonc
{
  "external_ref": "...", "condicion_venta": "...", "tipo_transaccion": 2,
  "facturador": { "id": "...", "emisor_id": "...", "ruc": "..." },
  "fiscal_context": {
    "establecimiento": "001",
    "punto_expedicion": "001",
    "perfil_emision_codigo": "A45203-E001-P001-FE-PTO",
    "actividad_economica_codigo": "45203",
    "timbrado": "...", "timbrado_inicio": "...", "documento_nro": "...",
    "credito_plazo_dias": 30, "tipo_transaccion_default": 2,
    "fiscal_envio_modo": "BATCH", "batch_enabled": true
  },
  "cliente": { }, "items": [ ], "totals": { }
}
```

> **No confundir con el payload que se envía a FE.** `fiscal-gateway.client.ts:1186-1218` arma otro objeto, con otros nombres
> (`timbrado.establecimiento`, `timbrado.puntoExpedicion`, `emission_profile_code`). Ese payload **no se persiste**: lo
> persistido es el request interno de arriba. Usar los nombres del gateway en el backfill no resolvería ninguna fila.

Como el snapshot trae **las cuatro claves** del contexto, la tupla se resuelve completa y sin ambigüedad:

```sql
update facturas_operativas f
   set actividad_punto_perfil_id = app.id
  from actividad_punto_perfiles app
  join facturador_actividades a       on a.id  = app.actividad_id
  join facturador_establecimientos e  on e.id  = app.establecimiento_id
  join facturador_puntos_expedicion p on p.id  = app.punto_expedicion_id
  join facturador_perfiles_emision pe on pe.id = app.perfil_emision_id
 where f.actividad_punto_perfil_id is null
   and app.facturador_id = f.facturador_id
   and e.codigo  = f.fiscal_request_snapshot -> 'fiscal_context' ->> 'establecimiento'
   and p.codigo  = f.fiscal_request_snapshot -> 'fiscal_context' ->> 'punto_expedicion'
   and pe.codigo = f.fiscal_request_snapshot -> 'fiscal_context' ->> 'perfil_emision_codigo'
   and a.codigo  = f.fiscal_request_snapshot -> 'fiscal_context' ->> 'actividad_economica_codigo';
```

Igual se valida con un `select count(*)` sobre desarrollo antes de convertirlo en migración: el snapshot es JSON libre y
nada impide que una fila antigua tenga otra forma.

Cuando el snapshot falta o no resuelve (borradores, errores operativos previos a la emisión), se intenta la tupla
establecimiento + punto: si resuelve **un solo** contexto, se asigna; si resuelve varios o ninguno, **queda en `null`**
(RN-09). No se adivina.

### 3.2 Recibos y presupuestos — atribución de usuario

Operador más antiguo del facturador, definido de forma determinista (RN-13):

```sql
with operador_principal as (
  select distinct on (uoc.facturador_id)
         uoc.facturador_id, uoc.usuario_id
    from usuario_operacion_config uoc
    join usuarios u on u.id = uoc.usuario_id and u.activo = true and u.deleted_at is null
   where uoc.deleted_at is null
   order by uoc.facturador_id, uoc.created_at asc
)
update recibos_dinero r
   set usuario_id = op.usuario_id,
       usuario_atribucion_historica = true
  from operador_principal op
 where r.usuario_id is null and op.facturador_id = r.facturador_id;
```

Ídem `notas_comerciales`. Los facturadores sin operadores quedan sin atribución, explícitamente (criterio 10 del SPEC).

### 3.3 Recibos y presupuestos — perfil

**`recibos_dinero` sí tiene `fiscal_request_snapshot`** (agregado en `0025_recibos_dinero_v05_fiscal.sql`), pero su contenido es
más pobre que el de facturas: `buildFiscalCrearReciboRequest` (`recibos.service.ts:70-92`) guarda `emisor_id` y
**`actividad_economica_codigo`**, sin establecimiento ni punto. Alcanza igual para una resolución exacta en el caso frecuente:

1. Si la actividad del snapshot corresponde a **un único** contexto del facturador, se asigna.
2. Si no hay snapshot o la actividad resuelve varios contextos, se aplica la regla conservadora: solo si el facturador tiene
   **exactamente un** contexto activo.
3. En cualquier otro caso, `null`.

`notas_comerciales` **no** tiene snapshot fiscal: para presupuestos y pedidos solo aplican los pasos 2 y 3.

Asignar el perfil del operador principal ocultaría documentos del otro perfil detrás de una inferencia, que es justo lo que RN-09 prohíbe.

### 3.4 Catálogo

**No hay backfill.** Todos los ítems quedan compartidos (RN-03, criterio 3 del SPEC).

### 3.5 Verificación del backfill

Consultas de control que quedan documentadas en TASKS con su resultado en desarrollo:

```sql
-- cuántas facturas quedaron sin perfil, por facturador
select facturador_id, count(*) filter (where actividad_punto_perfil_id is null) as sin_perfil, count(*) as total
  from facturas_operativas where deleted_at is null group by 1;
-- ningún documento debe haber quedado asignado a un contexto de otro facturador
select count(*) from facturas_operativas f join actividad_punto_perfiles app
  on app.id = f.actividad_punto_perfil_id where app.facturador_id <> f.facturador_id;  -- debe dar 0
```

---

## Fase 4 — Alcance de lectura: facturas

1. **`AlcanceLectura`** en `apps/api/src/modules/context/context.types.ts` (§1.3), más `alcanceDesdeContexto(context)` que lo deriva del contexto operativo.
2. **`buildListWhere`** (`facturas.repository.ts:1497`) recibe `AlcanceLectura` en lugar de `facturadorId` y antepone la cláusula de alcance. Los filtros actuales (tipo, estado, fechas, búsqueda) no cambian.
3. Las cuatro lecturas puntuales (`findById`, `findByIdempotencyKey`, `findNotaCreditoByOriginal`, y el selector de candidatas a nota de crédito) pasan por el mismo helper: un documento fuera de alcance devuelve `null`, que el service ya traduce a 404 (criterio 7 del SPEC).
4. **Escritura**: `createFactura` y `createNotaCredito` persisten `context.fiscal_context`… en rigor `context.actividad_punto_perfil_id`, que ya viaja en el contexto (`context.types.ts:45`) y hoy solo se usa para `tipo_transaccion_default`. No hace falta resolver nada nuevo.
5. **Nota de crédito**: hereda el perfil de la factura original, no el del operador. Son el mismo valor mientras el operador solo vea su perfil, pero dejarlo explícito evita una inconsistencia si mañana un supervisor puede emitir sobre otro perfil.

---

## Fase 5 — Alcance de lectura: catálogo y coherencia en la emisión

1. `catalogo.repository.ts`: `search` y `list` reciben `AlcanceLectura`. La cláusula del operador es `facturador_id = $1 and (actividad_punto_perfil_id = $2 or actividad_punto_perfil_id is null)`.
2. **Creación** (RN-04): el ítem nace con el perfil del creador. El cuerpo acepta `compartido?: boolean`; con `true`, la columna queda en `null`.
3. **Edición y baja** (RN-06): un ítem de otro perfil no es alcanzable, así que devuelve 404 por el mismo helper. Los compartidos son editables desde cualquier perfil.
4. **Unicidad** (RN-05): el índice `catalogo_items_codigo_uidx (facturador_id, codigo_normalizado)` **no se toca**. El código sigue siendo único por facturador, y el 409 actual sigue aplicando.
5. **Coherencia en la emisión** (RN-10): al construir una factura, los `catalogo_item_id` referenciados se validan contra el alcance del operador. Un ítem de otro perfil produce un error de validación explícito, no un 404 confuso. La validación va en el service de facturas, que es donde se resuelven los ítems.

---

## Fase 6 — Alcance de lectura: recibos y presupuestos

Mismo patrón, con dos particularidades:

1. **Numeración intacta** (RN-14): `recibos_dinero_numeracion` (PK `facturador_id`) y `notas_comerciales_numeracion` (PK `facturador_id, tipo`) **no cambian**. Una sola serie por facturador.
2. **Huecos visibles**: el operador verá su serie con saltos. La UI lo explica en una nota breve junto al listado, para que no se lea como un error del sistema. Es la contrapartida aceptada de no arriesgar números repetidos entre perfiles.
3. **Imputación de recibos** (RN-10): el selector de facturas a imputar usa el alcance del operador, así que una factura de otro perfil no aparece; si se fuerza el id, se rechaza.
4. **Conversión de presupuesto a factura**: se valida que el presupuesto esté en el alcance del operador.
5. **Escritura**: ambos módulos pasan a persistir `usuario_id` y `actividad_punto_perfil_id` desde el contexto. Hasta ahora `recibos_dinero` no guardaba usuario: es la corrección de la deuda que el SPEC documenta en §2.2.

---

## Fase 7 — Rol de consulta: modelo y superficie de lectura

### 7.1 Modelo

`db/migrations/0034_rol_consulta_facturador.sql`:

```sql
alter table roles drop constraint roles_codigo_check;
alter table roles add constraint roles_codigo_check
  check (codigo in ('OPERADOR_FACTURACION', 'SOPORTE_INTERNO', 'ADMIN_INTERNO', 'CONSULTA_FACTURADOR'));

insert into roles (codigo, nombre) values ('CONSULTA_FACTURADOR', 'Consulta y reportes')
on conflict (codigo) do update set nombre = excluded.nombre, activo = true;

-- Asignación sin contexto operativo (SPEC RN-15)
alter table usuario_operacion_config alter column actividad_punto_perfil_id drop not null;

-- Un usuario es operador o es de consulta, nunca ambos (SPEC RN-22)
-- Se valida en el service; en el esquema se garantiza lo verificable:
-- una config sin contexto no puede convivir con una con contexto para el mismo usuario,
-- porque el índice único de config activa por usuario ya lo impide.
```

**Por qué relajar el `not null` y no crear una tabla aparte:** `usuario_operacion_config` es el único lugar donde vive "a qué facturador pertenece este usuario", y el índice único de configuración activa por usuario (`usuario_operacion_config_usuario_activa_uidx`) ya implementa RN-22 sin código extra. Una tabla paralela duplicaría ese invariante en dos lugares y abriría la puerta a que un usuario quedara en ambas.

El riesgo del `drop not null` es acotado: la resolución de contexto operativo (`context.repository.ts:43-130`) usa `join actividad_punto_perfiles app on app.id = uoc.actividad_punto_perfil_id`, un **inner join**. Una fila con `null` simplemente no matchea, que es exactamente el comportamiento deseado: un usuario de consulta no resuelve contexto fiscal y por lo tanto no puede emitir. No hay cambio de comportamiento para los usuarios existentes, todos con contexto.

### 7.2 Contexto de consulta

`apps/api/src/modules/consulta/consulta.context.ts` (módulo nuevo):

```ts
export interface ConsultaContext {
  user: UserSummary;
  tenant: TenantSummary;
  facturador: FacturadorSummary;
  perfiles: Array<{ id: string; codigo: string; alias: string | null;
                    establecimiento: string; punto: string; actividad: string }>;
}
export async function getConsultaContext(userId: string): Promise<ConsultaContext>;
```

Consulta propia, sin joins a `actividad_punto_perfiles` para el alcance (solo para listar los perfiles como filtro). `getOperationalContext` no se toca (§1.4).

Sin facturador asignado → 409 con mensaje explícito, sin exponer datos de otros (§10 del SPEC).

### 7.3 Superficie de lectura

`apps/api/src/modules/consulta/consulta.routes.ts`, todas `GET`, todas con `requireAuth` + `requireConsultaRole`:

```
GET /me/consulta/context
GET /consulta/documentos            ?perfil_id= &usuario_id= + los filtros actuales
GET /consulta/documentos/:id
GET /consulta/recibos                ?perfil_id= &usuario_id= …
GET /consulta/presupuestos           ?perfil_id= &usuario_id= …
GET /consulta/catalogo               ?perfil_id= …
```

Reusan los repositorios existentes pasando `AlcanceLectura { tipo: "FACTURADOR" }` y agregando el filtro opcional por perfil y por usuario. **No se duplica la lógica de listado ni las representaciones**: es el mismo repositorio con otro alcance.

Ningún verbo de escritura se monta en este router. El rol tampoco pasa la lista blanca de F0, así que la autogestión fiscal avanzada le queda cerrada por dos caminos independientes.

---

## Fase 8 — Alta del usuario de consulta desde el backoffice

Extiende la **Fase 10 del PLAN del import** (alta guiada), que ya dejó el punto de extensión previsto:

1. El paso 3, *tipo de acceso*, habilita su segunda opción: *Consulta y reportes*.
2. Con consulta elegida, el paso 4 (perfil) **desaparece**: el `OperationConfigPicker` recibe `modo="CONSULTA"` y solo pide facturador.
3. El cuerpo de alta de usuario acepta `operation_config` sin los campos de contexto, o un modo explícito:
   ```ts
   operation_config: z.discriminatedUnion("modo", [
     z.object({ modo: z.literal("OPERADOR"), facturador_id, emisor_id, establecimiento,
                punto_expedicion, perfil_emision_codigo, actividad_economica_codigo }),
     z.object({ modo: z.literal("CONSULTA"), facturador_id: z.string().uuid() })
   ]).optional()
   ```
4. `createUser` inserta la fila de `usuario_operacion_config` con `actividad_punto_perfil_id` en `null` para el modo consulta, en la misma transacción.
5. `UserDetailView` muestra el modo y permite cambiarlo (RN-22: es una operación explícita de soporte).

---

## Fase 9 — UI operativa

### 9.1 Para el operador

- Cada documento muestra su **perfil** (con `alias_operativo`, cayendo a códigos solo si no hay alias) y **quién lo emitió**.
- Los documentos sin perfil llevan una marca discreta ("sin perfil asignado"), explicada en un tooltip.
- La atribución retroactiva de recibos y presupuestos se muestra diferenciada ("atribución histórica"), nunca como autoría verificada (RN-13).
- Catálogo: distintivo de ítem compartido, y el control para marcarlo al crear o editar.
- Nota breve sobre los huecos de numeración en recibos y presupuestos (fase 6).

### 9.2 Para el usuario de consulta

Misma app, navegación recortada. `apps/web-operacion/src/main.tsx` decide al resolver el contexto:

- si el rol es de consulta, se monta un árbol de vistas de solo lectura y **no se montan** las de emisión, cobros, catálogo editable ni clientes;
- el menú de navegación (`nav.mobile-menu`, `main.tsx:1507-1508`) ofrece solo Documentos, Recibos, Presupuestos y Catálogo;
- cada listado suma dos filtros: **perfil** y **operador**, alimentados por `ConsultaContext.perfiles` y por los emisores presentes;
- no se renderiza ningún botón de acción. La seguridad no depende de eso —el backend rechaza igual (§10 del SPEC)— pero la pantalla no debe ofrecer lo que no se puede hacer.

Reusar los componentes de listado existentes parametrizados por origen de datos, en lugar de duplicarlos, es lo que mantiene el costo de esta fase acotado.

---

## Fase 10 — Contrato, pruebas y evidencia

- `spec/openapi.yaml`: campos nuevos en las respuestas de documentos y catálogo, la superficie `/consulta/*`, y el alcance documentado de cada listado.
- Playwright y evidencia: ver §5.

---

## 4. Validaciones

| Momento | Qué se valida | Dónde |
|---|---|---|
| Autorización | Rol contra lista blanca, nunca por descarte | F0 |
| Alcance de lectura | Facturador + perfil, o facturador solo | `buildAlcanceWhere` por módulo |
| Acceso puntual | Documento fuera de alcance → 404 | Mismo helper en las lecturas por id |
| Emisión | Ítems del catálogo dentro del alcance | Service de facturas (RN-10) |
| Imputación y conversión | Factura o presupuesto dentro del alcance | Services de recibos y notas |
| Escritura del rol de consulta | Ningún verbo montado, y rol fuera de la lista blanca | Router de consulta + F0 |
| Backfill | Ningún documento asignado a un contexto de otro facturador | Consultas de control (§3.5) |
| Integridad | `actividad_punto_perfil_id` referencia un contexto del mismo facturador | FK + consulta de control |

---

## 5. Estrategia de testing

### Unitarios y de integración (`vitest`)

| Archivo | Cobertura |
|---|---|
| `facturas.alcance.test.ts` | `buildAlcanceWhere` en sus dos formas; el operador ve lo suyo más lo que no tiene perfil; no ve lo ajeno; el de consulta ve todo |
| `facturas.service.test.ts` (extender) | Documento de otro perfil → 404; nota de crédito hereda el perfil de la original; emisión con ítem de otro perfil → error de validación |
| `catalogo.service.test.ts` (extender) | Alcance en `list` y `search`; ítem creado nace con perfil; `compartido: true` lo deja en `null`; unicidad de código intacta |
| `recibos.service.test.ts`, `notas.service.test.ts` (extender) | Alcance; persistencia de `usuario_id` y perfil; imputación y conversión restringidas |
| `consulta.service.test.ts` (nuevo) | `getConsultaContext`; alcance por facturador; filtros por perfil y por usuario; usuario sin facturador → 409 |
| `auth.roles.test.ts` (nuevo) | Lista blanca por rol, parametrizado por los cuatro códigos; equivalencia de comportamiento para los tres actuales |
| **Regresión de emisión** | **Las pruebas de emisión existentes deben pasar sin modificación** (criterio 20 del SPEC). Si alguna requiere cambios, el diseño se desvió de §1.4 |

### Integración con base

`segmentacion.integration.test.ts`, con `describe.skipIf(!DATABASE_URL_TEST)`, sobre el stack de `bash scripts/deploy.sh`:

- dos perfiles, dos operadores y un usuario de consulta, sembrados desde un import real;
- cada operador ve solo lo suyo; el de consulta ve todo;
- backfill sobre datos sembrados: verifica el mapeo desde el snapshot y las dos consultas de control de §3.5;
- facturador de un solo perfil: comportamiento idéntico al previo (criterio 13 del SPEC).

### Playwright

`scripts/playwright-segmentacion-perfiles.cjs`, patrón de los `.cjs` existentes, viewports `390×844` y `1440×900`:

(a) operador A no ve el catálogo ni los documentos de B; (b) ítem compartido visible para ambos; (c) columna de emisor y de perfil en el listado; (d) marca de documento sin perfil; (e) usuario de consulta: ve todo, con filtros por perfil y por operador, y **sin ningún botón de acción**; (f) recibos del operador con huecos de numeración y del usuario de consulta con la serie completa.

### Entornos

Misma promoción que el import (§5.bis del PLAN del import): **desarrollo sobre el stack completo → testing en la VPS → producción**. Con una exigencia adicional propia de esta iniciativa: el backfill se corre primero en desarrollo sobre datos sembrados, **y después sobre una copia del dump de producción**, verificando las consultas de control antes de tocar la VPS.

### Cierre por `AGENTS.md`

`npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`, `bash scripts/deploy.sh`, y evidencia en TASKS con escenarios, viewports y resultado.

---

## 6. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | **Un filtro de alcance olvidado** en alguna de las ~9 lecturas por módulo filtra datos entre unidades de negocio | Un único helper por módulo (§1.3) y un test que recorre todas las lecturas; ninguna consulta arma su cláusula de alcance a mano |
| 2 | **El backfill asigna mal el perfil** de una factura histórica y la oculta del operador que sí la emitió | Solo se asigna con coincidencia exacta de la tupla del snapshot; la duda queda en `null` y `null` es visible para todos (RN-09). Consultas de control en §3.5 y prueba sobre copia del dump de producción |
| 3 | ~~Las rutas del JSON de `fiscal_request_snapshot` no son las que supongo~~ **Resuelto en la auditoría**: son las de `buildFiscalEmitRequest` (§3.1), no las del payload del gateway | Queda el riesgo residual de filas antiguas con otra forma: se valida con un `select count(*)` sobre desarrollo antes de convertir el `update` en migración |
| 4 | **`drop not null` en `usuario_operacion_config`** debilita un invariante del camino crítico | El join de resolución es `inner`: una fila sin contexto simplemente no resuelve, que es el comportamiento buscado. Ningún usuario existente cambia. Cubierto por la regresión de emisión |
| 5 | **El rol nuevo hereda permisos por descarte** | F0 es precondición, no una tarea paralela |
| 6 | **El operador percibe los huecos de numeración como un error** | Nota explicativa en el listado (fase 6) y serie completa disponible para el usuario de consulta |
| 7 | **Duplicación de listados** para el rol de consulta encarece el mantenimiento | La superficie de consulta reusa repositorios y representaciones; solo cambia el alcance y agrega dos filtros |
| 8 | **El facturador de un solo perfil sufre una regresión** por un cambio pensado para multi-perfil | Criterio 13 del SPEC con su propia prueba: con un contexto, todo se comporta como antes |

---

## 7. Qué queda preparado para después

- **Reporte de ventas**: la superficie `/consulta/*` es donde cuelga. Esta versión entrega acceso y listados; el reporte agregado se especifica aparte (RN-21).
- **Rol de supervisor con capacidad de intervenir** (anular, corregir, reasignar): el rol de consulta deliberadamente no lo hace. Si se necesita, es alcance nuevo sobre la misma base de autorización por lista blanca.
- **Segmentación de la agenda de clientes**: fuera de alcance por decisión (§3 del SPEC). El patrón de `AlcanceLectura` serviría sin cambios si se decidiera incorporarla.
