-- =============================================================================
-- update_usuario_config.sql
-- Cambia la config operativa activa de un usuario a un punto/actividad/perfil
-- diferente dentro del mismo facturador.
--
-- La config anterior se desactiva (queda como historico de auditoria).
-- IDEMPOTENTE: si la config ya apunta al punto indicado, la reactiva.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- VARIABLES
-- -----------------------------------------------------------------------------

\set tenant_slug        'cliente-acme'
\set username           'operador.cliente-acme'

-- Nuevo destino operativo
\set emisor_id          '5057016-1'
\set establecimiento    '001'
\set punto_expedicion   '002'
\set perfil_codigo      'AC496099-E001-P002-FE-PTO'
\set actividad_codigo   '96099'

-- -----------------------------------------------------------------------------
-- EJECUCION
-- -----------------------------------------------------------------------------

begin;

-- Desactivar config anterior
update usuario_operacion_config uoc
set activo     = false,
    deleted_at = now(),
    updated_at = now()
from usuarios u
join tenants t on t.id = u.tenant_id
where uoc.usuario_id = u.id
  and uoc.activo = true
  and uoc.deleted_at is null
  and u.username = :'username'
  and t.slug = :'tenant_slug';

-- Insertar nueva config
insert into usuario_operacion_config (tenant_id, usuario_id, facturador_id, actividad_punto_perfil_id, activo)
select
  u.tenant_id,
  u.id,
  f.id,
  app.id,
  true
from usuarios u
join tenants t on t.id = u.tenant_id
join facturadores f on f.tenant_id = t.id and f.emisor_id = :'emisor_id' and f.deleted_at is null
join facturador_establecimientos e
  on e.facturador_id = f.id and e.codigo = :'establecimiento' and e.deleted_at is null
join facturador_puntos_expedicion p
  on p.establecimiento_id = e.id and p.codigo = :'punto_expedicion' and p.deleted_at is null
join facturador_perfiles_emision pe
  on pe.facturador_id = f.id and pe.codigo = :'perfil_codigo' and pe.deleted_at is null
join facturador_actividades a
  on a.facturador_id = f.id and a.codigo = :'actividad_codigo' and a.deleted_at is null
join actividad_punto_perfiles app
  on app.actividad_id = a.id
  and app.establecimiento_id = e.id
  and app.punto_expedicion_id = p.id
  and app.perfil_emision_id = pe.id
  and app.deleted_at is null
where u.username = :'username' and t.slug = :'tenant_slug' and u.deleted_at is null;

commit;

-- VERIFICACION
select
  u.username,
  e.codigo   as establecimiento,
  p.codigo   as punto,
  a.codigo   as actividad,
  pe.codigo  as perfil,
  app.timbrado,
  app.documento_nro,
  uoc.activo as config_activa
from usuarios u
join tenants t on t.id = u.tenant_id
join usuario_operacion_config uoc
  on uoc.usuario_id = u.id and uoc.activo = true and uoc.deleted_at is null
join actividad_punto_perfiles app on app.id = uoc.actividad_punto_perfil_id
join facturador_establecimientos e on e.id = app.establecimiento_id
join facturador_puntos_expedicion p on p.id = app.punto_expedicion_id
join facturador_actividades a on a.id = app.actividad_id
join facturador_perfiles_emision pe on pe.id = app.perfil_emision_id
where u.username = :'username' and t.slug = :'tenant_slug' and u.deleted_at is null;
