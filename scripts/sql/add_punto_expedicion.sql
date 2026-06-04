-- =============================================================================
-- add_punto_expedicion.sql
-- Agrega un punto de expedicion a un facturador y establecimiento ya existentes.
-- Crea: punto, actividad economica, perfil de emision y actividad_punto_perfiles.
--
-- Usar cuando el facturador ya fue dado de alta con alta_facturador.sql
-- y se necesita agregar un punto adicional.
-- IDEMPOTENTE.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- VARIABLES
-- -----------------------------------------------------------------------------

-- Identificadores del facturador existente
\set tenant_slug    'cliente-acme'
\set emisor_id      '5057016-1'
\set establecimiento '001'

-- Nuevo punto
\set punto_codigo           '003'
\set punto_nombre           'NOMBRE DEL PUNTO 003'
\set actividad_codigo       '47112'
\set actividad_descripcion  'VENTA AL POR MENOR'
\set actividad_alias        'DESPENSA'
\set perfil_codigo          'AC447112-E001-P003-FE-PTO'
\set perfil_descripcion     'Venta al por menor - Punto 003'
\set timbrado               '05057016'
\set timbrado_inicio        '2026-05-19'
\set documento_nro          '0000001'
\set credito_plazo_dias     30

-- -----------------------------------------------------------------------------
-- EJECUCION
-- -----------------------------------------------------------------------------

begin;

-- Punto de expedicion
insert into facturador_puntos_expedicion (tenant_id, facturador_id, establecimiento_id, codigo, nombre, activo)
select e.tenant_id, e.facturador_id, e.id, :'punto_codigo', :'punto_nombre', true
from facturador_establecimientos e
join facturadores f on f.id = e.facturador_id
join tenants t on t.id = f.tenant_id
where t.slug = :'tenant_slug' and f.emisor_id = :'emisor_id'
  and e.codigo = :'establecimiento' and e.deleted_at is null
on conflict (establecimiento_id, codigo)
  where deleted_at is null
do update
  set nombre     = excluded.nombre,
      activo     = true,
      updated_at = now();

-- Actividad economica
insert into facturador_actividades (tenant_id, facturador_id, codigo, descripcion, alias_operativo, activo)
select f.tenant_id, f.id, :'actividad_codigo', :'actividad_descripcion', :'actividad_alias', true
from facturadores f
join tenants t on t.id = f.tenant_id
where t.slug = :'tenant_slug' and f.emisor_id = :'emisor_id' and f.deleted_at is null
on conflict (facturador_id, codigo)
  where deleted_at is null
do update
  set descripcion     = excluded.descripcion,
      alias_operativo = excluded.alias_operativo,
      activo          = true,
      updated_at      = now();

-- Perfil de emision
insert into facturador_perfiles_emision (tenant_id, facturador_id, codigo, descripcion, activo)
select f.tenant_id, f.id, :'perfil_codigo', :'perfil_descripcion', true
from facturadores f
join tenants t on t.id = f.tenant_id
where t.slug = :'tenant_slug' and f.emisor_id = :'emisor_id' and f.deleted_at is null
on conflict (facturador_id, codigo)
  where deleted_at is null
do update
  set descripcion = excluded.descripcion,
      activo      = true,
      updated_at  = now();

-- actividad_punto_perfiles
insert into actividad_punto_perfiles (
  tenant_id, facturador_id,
  actividad_id, establecimiento_id, punto_expedicion_id, perfil_emision_id,
  timbrado, timbrado_inicio, documento_nro, credito_plazo_dias,
  alias_operativo, activo
)
select
  a.tenant_id,
  a.facturador_id,
  a.id    as actividad_id,
  e.id    as establecimiento_id,
  p.id    as punto_expedicion_id,
  pe.id   as perfil_emision_id,
  :'timbrado',
  :'timbrado_inicio'::date,
  :'documento_nro',
  :credito_plazo_dias,
  :'actividad_alias',
  true
from facturador_actividades a
join facturadores f on f.id = a.facturador_id
join tenants t on t.id = f.tenant_id
join facturador_establecimientos e
  on e.facturador_id = f.id and e.codigo = :'establecimiento' and e.deleted_at is null
join facturador_puntos_expedicion p
  on p.establecimiento_id = e.id and p.codigo = :'punto_codigo' and p.deleted_at is null
join facturador_perfiles_emision pe
  on pe.facturador_id = f.id and pe.codigo = :'perfil_codigo' and pe.deleted_at is null
where t.slug = :'tenant_slug' and f.emisor_id = :'emisor_id'
  and a.codigo = :'actividad_codigo' and a.deleted_at is null
on conflict (actividad_id, establecimiento_id, punto_expedicion_id, perfil_emision_id)
  where deleted_at is null
do update
  set timbrado           = excluded.timbrado,
      timbrado_inicio    = excluded.timbrado_inicio,
      documento_nro      = excluded.documento_nro,
      credito_plazo_dias = excluded.credito_plazo_dias,
      alias_operativo    = excluded.alias_operativo,
      activo             = true,
      updated_at         = now();

commit;

-- =============================================================================
-- VERIFICACION
-- =============================================================================

select
  p.codigo              as punto,
  p.nombre              as punto_nombre,
  a.codigo              as actividad,
  a.descripcion         as actividad_descripcion,
  pe.codigo             as perfil,
  app.timbrado,
  app.timbrado_inicio,
  app.documento_nro,
  app.credito_plazo_dias,
  app.activo
from facturador_puntos_expedicion p
join facturador_establecimientos e on e.id = p.establecimiento_id
join facturadores f on f.id = p.facturador_id
join tenants t on t.id = f.tenant_id
left join actividad_punto_perfiles app
  on app.punto_expedicion_id = p.id and app.deleted_at is null
left join facturador_actividades a
  on a.id = app.actividad_id
left join facturador_perfiles_emision pe
  on pe.id = app.perfil_emision_id
where t.slug = :'tenant_slug' and f.emisor_id = :'emisor_id'
  and e.codigo = :'establecimiento' and p.codigo = :'punto_codigo'
  and p.deleted_at is null;
