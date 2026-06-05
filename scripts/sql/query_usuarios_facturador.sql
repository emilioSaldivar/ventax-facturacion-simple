-- =============================================================================
-- query_usuarios_facturador.sql
-- Lista todos los usuarios del tenant con su config operativa activa
-- para el facturador indicado. Incluye usuarios sin config asignada.
-- Solo lectura. Usar para diagnostico de acceso y verificacion de alta.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- VARIABLES
-- -----------------------------------------------------------------------------

\set tenant_slug    'cliente-acme'
\set emisor_id      '5057016-1'

-- -----------------------------------------------------------------------------
-- CONSULTA
-- -----------------------------------------------------------------------------

-- 1. Usuarios con config operativa activa para este facturador
select
  u.id                  as usuario_id,
  u.username,
  u.display_name,
  r.codigo              as rol,
  u.activo              as usuario_activo,
  u.failed_login_count,
  u.bloqueado_at,
  u.ultimo_login_at,
  e.codigo              as establecimiento_asignado,
  p.codigo              as punto_asignado,
  a.codigo              as actividad_asignada,
  pe.codigo             as perfil_asignado,
  app.timbrado          as timbrado_activo,
  app.documento_nro     as nro_referencia,
  uoc.activo            as config_activa
from usuarios u
join tenants t on t.id = u.tenant_id
join usuario_roles ur on ur.usuario_id = u.id
join roles r on r.id = ur.role_id
join usuario_operacion_config uoc
  on uoc.usuario_id = u.id and uoc.activo = true and uoc.deleted_at is null
join actividad_punto_perfiles app on app.id = uoc.actividad_punto_perfil_id and app.deleted_at is null
join facturadores f on f.id = uoc.facturador_id and f.emisor_id = :'emisor_id' and f.deleted_at is null
join facturador_establecimientos e on e.id = app.establecimiento_id
join facturador_puntos_expedicion p on p.id = app.punto_expedicion_id
join facturador_actividades a on a.id = app.actividad_id
join facturador_perfiles_emision pe on pe.id = app.perfil_emision_id
where t.slug = :'tenant_slug' and u.deleted_at is null
order by u.username;

-- 2. Usuarios del tenant SIN config operativa activa (posibles huerfanos)
select
  u.id        as usuario_id,
  u.username,
  u.display_name,
  r.codigo    as rol,
  u.activo,
  'SIN CONFIG OPERATIVA' as estado_config
from usuarios u
join tenants t on t.id = u.tenant_id
join usuario_roles ur on ur.usuario_id = u.id
join roles r on r.id = ur.role_id
where t.slug = :'tenant_slug'
  and u.deleted_at is null
  and not exists (
    select 1 from usuario_operacion_config uoc
    where uoc.usuario_id = u.id and uoc.activo = true and uoc.deleted_at is null
  )
order by u.username;
