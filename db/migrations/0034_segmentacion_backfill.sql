-- Segmentacion por perfil de emision: backfill.
--
-- Separado de 0033 para poder inspeccionar su resultado antes de seguir. Idempotente:
-- cada paso solo toca filas que todavia tienen la columna en null, asi que volver a
-- correrlo no cambia nada.
--
-- REGLAS QUE NO SE PUEDEN RELAJAR
--
-- 1. Todas las resoluciones filtran `deleted_at is null` en LAS CINCO tablas
--    (contexto + las cuatro dimensiones). Sin eso, un contexto dado de baja duplica la
--    tupla de uno vivo y la coincidencia deja de ser unica: medido sobre produccion el
--    2026-10-06, la version sin filtros deja 231 de 242 documentos ambiguos. Y un
--    `update ... from` con varias filas coincidentes NO falla: PostgreSQL elige una
--    arbitrariamente y sigue, de modo que el dano seria silencioso.
--
-- 2. Nunca se filtra por `activo`. `activo` significa "puede emitir ahora" y no dice
--    nada sobre el origen de un documento ya emitido. Un contexto desactivado sigue
--    siendo el perfil real de lo que se emitio con el (RN-23).
--
-- 3. Ante cualquier duda, la columna queda en null. Un documento sin perfil es historico
--    y visible para todos los operadores del facturador (RN-09); uno mal asignado se
--    esconde del operador que corresponde. Mostrar de mas es preferible a ocultar.
--
-- La unicidad del paso 1 esta garantizada por el esquema, no solo por los datos: las
-- cuatro tablas dimension tienen indice unico (padre, codigo) where deleted_at is null,
-- y actividad_punto_perfiles_uidx es unico sobre la tupla de cuatro con la misma
-- condicion. Con los filtros puestos la consulta no puede devolver mas de una fila.

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
-- Paso 3 — Recibos y presupuestos: atribucion de usuario
--
-- Operador mas antiguo del facturador, de forma determinista (RN-13). Es una inferencia,
-- no autoria verificada: `usuario_atribucion_historica` lo marca para que la UI no la
-- presente como tal. Los facturadores sin operadores quedan sin atribucion.
-- ---------------------------------------------------------------------------
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
 where r.usuario_id is null
   and r.deleted_at is null
   and op.facturador_id = r.facturador_id;

with operador_principal as (
  select distinct on (uoc.facturador_id)
         uoc.facturador_id, uoc.usuario_id
    from usuario_operacion_config uoc
    join usuarios u on u.id = uoc.usuario_id and u.activo = true and u.deleted_at is null
   where uoc.deleted_at is null
   order by uoc.facturador_id, uoc.created_at asc
)
update notas_comerciales n
   set usuario_id = op.usuario_id,
       usuario_atribucion_historica = true
  from operador_principal op
 where n.usuario_id is null
   and n.deleted_at is null
   and op.facturador_id = n.facturador_id;

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

-- ---------------------------------------------------------------------------
-- Catalogo: sin backfill, a proposito (RN-03).
-- Todos los items quedan compartidos, de modo que ningun operador pierde acceso a lo que
-- ya usaba. La separacion se construye desde ahi, item por item.
-- ---------------------------------------------------------------------------
