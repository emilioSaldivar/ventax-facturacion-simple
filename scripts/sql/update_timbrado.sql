-- =============================================================================
-- update_timbrado.sql
-- Actualiza timbrado, fecha de inicio y numero de referencia en el
-- actividad_punto_perfiles de un punto especifico.
-- Usar en renovacion de timbrado o correccion de documento_nro.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- VARIABLES
-- -----------------------------------------------------------------------------

\set tenant_slug        'cliente-acme'
\set emisor_id          '5057016-1'
\set establecimiento    '001'
\set punto_expedicion   '001'
\set actividad_codigo   '45203'
\set perfil_codigo      'AC445203-E001-P001-FE-PTO'

-- Nuevos valores del timbrado
\set timbrado_nuevo      '05057016'
\set timbrado_inicio     '2026-07-01'
\set documento_nro       '0000001'
-- siguiente_numero_fe formateado a 7 digitos

-- -----------------------------------------------------------------------------
-- EJECUCION
-- -----------------------------------------------------------------------------

begin;

update actividad_punto_perfiles app
set
  timbrado        = :'timbrado_nuevo',
  timbrado_inicio = :'timbrado_inicio'::date,
  documento_nro   = :'documento_nro',
  updated_at      = now()
from facturador_actividades a
join facturadores f on f.id = a.facturador_id
join tenants t on t.id = f.tenant_id
join facturador_establecimientos e
  on e.facturador_id = f.id and e.codigo = :'establecimiento' and e.deleted_at is null
join facturador_puntos_expedicion p
  on p.establecimiento_id = e.id and p.codigo = :'punto_expedicion' and p.deleted_at is null
join facturador_perfiles_emision pe
  on pe.facturador_id = f.id and pe.codigo = :'perfil_codigo' and pe.deleted_at is null
where t.slug = :'tenant_slug'
  and f.emisor_id = :'emisor_id' and f.deleted_at is null
  and a.codigo = :'actividad_codigo' and a.deleted_at is null
  and app.actividad_id = a.id
  and app.establecimiento_id = e.id
  and app.punto_expedicion_id = p.id
  and app.perfil_emision_id = pe.id
  and app.deleted_at is null;

commit;

-- VERIFICACION
select
  e.codigo        as establecimiento,
  p.codigo        as punto,
  a.codigo        as actividad,
  app.timbrado,
  app.timbrado_inicio,
  app.documento_nro,
  app.updated_at
from actividad_punto_perfiles app
join facturador_actividades a on a.id = app.actividad_id
join facturadores f on f.id = a.facturador_id
join tenants t on t.id = f.tenant_id
join facturador_establecimientos e on e.id = app.establecimiento_id
join facturador_puntos_expedicion p on p.id = app.punto_expedicion_id
join facturador_perfiles_emision pe on pe.id = app.perfil_emision_id
where t.slug = :'tenant_slug' and f.emisor_id = :'emisor_id'
  and e.codigo = :'establecimiento' and p.codigo = :'punto_expedicion'
  and a.codigo = :'actividad_codigo' and app.deleted_at is null;
