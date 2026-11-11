-- SPEC_MULTIPERFIL_USUARIO_v0.1 (FS-54), MPU-008: repite el backfill de perfil de 0034.
--
-- 0034 atribuyo el perfil a los documentos existentes en su momento, pero hasta 0044 / MPU-007
-- ningun insert escribia `actividad_punto_perfil_id`: todo documento creado despues de 0034
-- quedo en null (hallazgo H-3 de TASKS_SEGMENTACION). Este archivo copia LITERALMENTE los pasos
-- de perfil de 0034 (1, 2, 4 y 5) con sus mismas reglas, que no se pueden relajar:
--   1. `deleted_at is null` en las cinco tablas; 2. nunca filtrar por `activo`;
--   3. ante cualquier duda, la columna queda en null.
-- Se omite el paso 3 de 0034 (atribucion de usuario), que es de la cadena de segmentacion.
-- Idempotente: solo toca filas con la columna en null.

-- ---------------------------------------------------------------------------
-- Paso 1 — Facturas: tupla exacta del snapshot
--
-- `fiscal_request_snapshot -> 'fiscal_context'` guarda el FiscalContext completo del
-- contexto operativo (lo arma buildFiscalEmitRequest). No confundir con el payload que
-- se envia a facturacion-electronica, que usa otros nombres y no se persiste.
-- ---------------------------------------------------------------------------
update facturas_operativas f
   set actividad_punto_perfil_id = app.id
  from actividad_punto_perfiles app
  join facturador_actividades a       on a.id  = app.actividad_id        and a.deleted_at  is null
  join facturador_establecimientos e  on e.id  = app.establecimiento_id  and e.deleted_at  is null
  join facturador_puntos_expedicion p on p.id  = app.punto_expedicion_id and p.deleted_at  is null
  join facturador_perfiles_emision pe on pe.id = app.perfil_emision_id   and pe.deleted_at is null
 where f.actividad_punto_perfil_id is null
   and f.deleted_at is null
   and app.facturador_id = f.facturador_id
   and app.deleted_at is null
   and e.codigo  = f.fiscal_request_snapshot -> 'fiscal_context' ->> 'establecimiento'
   and p.codigo  = f.fiscal_request_snapshot -> 'fiscal_context' ->> 'punto_expedicion'
   and pe.codigo = f.fiscal_request_snapshot -> 'fiscal_context' ->> 'perfil_emision_codigo'
   and a.codigo  = f.fiscal_request_snapshot -> 'fiscal_context' ->> 'actividad_economica_codigo';

-- ---------------------------------------------------------------------------
-- Paso 2 — Facturas: establecimiento + punto, solo si resuelven un unico contexto
--
-- Aplica tanto cuando falta el snapshot (borradores, errores previos a la emision) como
-- cuando esta pero su tupla no coincide: en staging hay 3 documentos de mayo de 2026 que
-- traen la actividad como 'C4_96099' en vez de '96099', formato que ya no se usa.
-- `(array_agg(...))[1]` y no `min()`: PostgreSQL no define min() para uuid.
-- ---------------------------------------------------------------------------
with resuelto as (
  select f.id as factura_id, (array_agg(app.id))[1] as perfil_id
    from facturas_operativas f
    join actividad_punto_perfiles app   on app.facturador_id = f.facturador_id and app.deleted_at is null
    join facturador_establecimientos e  on e.id = app.establecimiento_id  and e.deleted_at is null
    join facturador_puntos_expedicion p on p.id = app.punto_expedicion_id and p.deleted_at is null
   where f.actividad_punto_perfil_id is null
     and f.deleted_at is null
     and e.codigo = f.fiscal_request_snapshot -> 'fiscal_context' ->> 'establecimiento'
     and p.codigo = f.fiscal_request_snapshot -> 'fiscal_context' ->> 'punto_expedicion'
   group by f.id
  having count(*) = 1
)
update facturas_operativas f
   set actividad_punto_perfil_id = r.perfil_id
  from resuelto r
 where f.id = r.factura_id;

-- ---------------------------------------------------------------------------
-- Paso 4 — Recibos: perfil por la actividad del snapshot
--
-- `recibos_dinero.fiscal_request_snapshot` existe desde 0025 pero es mas pobre que el de
-- facturas: trae `actividad_economica_codigo` sin establecimiento ni punto. Alcanza
-- cuando esa actividad corresponde a un unico contexto vivo del facturador.
-- ---------------------------------------------------------------------------
with resuelto as (
  select r.id as recibo_id, (array_agg(app.id))[1] as perfil_id
    from recibos_dinero r
    join actividad_punto_perfiles app on app.facturador_id = r.facturador_id and app.deleted_at is null
    join facturador_actividades a     on a.id = app.actividad_id and a.deleted_at is null
   where r.actividad_punto_perfil_id is null
     and r.deleted_at is null
     and a.codigo = r.fiscal_request_snapshot ->> 'actividad_economica_codigo'
   group by r.id
  having count(*) = 1
)
update recibos_dinero r
   set actividad_punto_perfil_id = x.perfil_id
  from resuelto x
 where r.id = x.recibo_id;

-- ---------------------------------------------------------------------------
-- Paso 5 — Recibos y presupuestos: regla conservadora
--
-- Si el facturador tiene exactamente un contexto vivo, no hay ambiguedad posible.
-- `notas_comerciales` no tiene snapshot fiscal, asi que este es su unico camino.
-- Asignarles el perfil del operador principal escondería documentos del otro perfil
-- detras de una inferencia, que es justo lo que RN-09 prohibe.
-- ---------------------------------------------------------------------------
with unico_contexto as (
  select facturador_id, (array_agg(id))[1] as perfil_id
    from actividad_punto_perfiles
   where deleted_at is null
   group by facturador_id
  having count(*) = 1
)
update recibos_dinero r
   set actividad_punto_perfil_id = u.perfil_id
  from unico_contexto u
 where r.actividad_punto_perfil_id is null
   and r.deleted_at is null
   and u.facturador_id = r.facturador_id;

with unico_contexto as (
  select facturador_id, (array_agg(id))[1] as perfil_id
    from actividad_punto_perfiles
   where deleted_at is null
   group by facturador_id
  having count(*) = 1
)
update notas_comerciales n
   set actividad_punto_perfil_id = u.perfil_id
  from unico_contexto u
 where n.actividad_punto_perfil_id is null
   and n.deleted_at is null
   and u.facturador_id = n.facturador_id;
