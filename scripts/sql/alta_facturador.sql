-- =============================================================================
-- alta_facturador.sql
-- Alta completa de un facturador desde ficha "DATOS FE PARA INTEGRACION EXTERNA"
-- Crea: tenant, suscripcion, facturador, establecimiento, punto(s), actividad(es),
--       perfil(es) de emision y actividad_punto_perfiles.
--
-- IDEMPOTENTE: se puede re-ejecutar con los mismos parametros sin duplicados.
-- Para facturadores con un solo punto: comentar el bloque "PUNTO 002" completo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- VARIABLES — completar con los datos de la ficha FE
-- -----------------------------------------------------------------------------

-- Tenant (cliente SaaS)
\set tenant_slug        'cliente-acme'
\set tenant_nombre      'Cliente ACME'
\set plan_codigo        'BASICO_MVP'

-- Emisor (directo de la ficha FE: emisor_id, ruc_emisor, razon_social, nombre_fantasia)
\set emisor_id          '5057016-1'
\set ruc                '5057016-1'
\set razon_social       'EMILIO MATIAS SALDIVAR CAPUTO'
\set nombre_fantasia    '1811 BRANDING Y SOFTWARE'

-- Establecimiento (nombre_oficial, direccion)
\set establecimiento            '001'
\set establecimiento_nombre     'CASA MATRIZ ITA'
\set establecimiento_direccion  'BERNARDINO CABALLERO 112 - ITA'

-- PUNTO 001 — completar con datos del punto de expedicion 001 de la ficha FE
\set punto_001                  '001'
\set punto_001_nombre           'TALLERES DE CHAPERIA Y PINTURA'
\set actividad_001_codigo       '45203'
\set actividad_001_descripcion  'TALLERES DE CHAPERIA Y PINTURA'
\set actividad_001_alias        'CHAPERIA'
\set perfil_001_codigo          'AC445203-E001-P001-FE-PTO'
\set perfil_001_descripcion     'Chaperia y pintura - Punto 001'
\set timbrado_001               '05057016'
\set timbrado_001_inicio        '2026-05-19'
\set documento_nro_001          '0000009'
-- siguiente_numero_fe de la ficha formateado a 7 digitos: 9 -> 0000009
\set credito_plazo_dias         30

-- PUNTO 002 — comentar este bloque completo si el facturador tiene un solo punto
\set punto_002                  '002'
\set punto_002_nombre           'OTRAS ACTIVIDADES DE SERVICIOS PERSONALES N.C.P.'
\set actividad_002_codigo       '96099'
\set actividad_002_descripcion  'OTRAS ACTIVIDADES DE SERVICIOS PERSONALES N.C.P.'
\set actividad_002_alias        'SERVICIOS PERSONALES'
\set perfil_002_codigo          'AC496099-E001-P002-FE-PTO'
\set perfil_002_descripcion     'Servicios personales - Punto 002'
\set timbrado_002               '05057016'
\set timbrado_002_inicio        '2026-05-19'
\set documento_nro_002          '0000019'
-- siguiente_numero_fe de la ficha formateado a 7 digitos: 19 -> 0000019

-- -----------------------------------------------------------------------------
-- EJECUCION
-- -----------------------------------------------------------------------------

begin;

-- Plan base (si no existe)
insert into planes (codigo, nombre, descripcion, max_usuarios, max_facturadores)
values (
  :'plan_codigo',
  'Basico MVP',
  'Plan inicial para facturacion simple mobile-first.',
  3,
  1
)
on conflict (codigo) do update
  set activo       = true,
      updated_at   = now();

-- Tenant
with tenant_insert as (
  insert into tenants (nombre, slug, estado, activo)
  values (:'tenant_nombre', :'tenant_slug', 'ACTIVO', true)
  on conflict (slug) do update
    set nombre     = excluded.nombre,
        estado     = 'ACTIVO',
        activo     = true,
        deleted_at = null,
        updated_at = now()
  returning id
)
-- Suscripcion
insert into tenant_suscripciones (tenant_id, plan_id, estado, activo)
select t.id, p.id, 'ACTIVA', true
from tenant_insert t
cross join planes p
where p.codigo = :'plan_codigo' and p.activo = true and p.deleted_at is null
on conflict (tenant_id)
  where activo = true and estado = 'ACTIVA' and deleted_at is null
do update
  set plan_id    = excluded.plan_id,
      fecha_fin  = null,
      updated_at = now();

-- Facturador
insert into facturadores (tenant_id, emisor_id, razon_social, ruc, nombre_fantasia, activo)
select t.id, :'emisor_id', :'razon_social', :'ruc', :'nombre_fantasia', true
from tenants t
where t.slug = :'tenant_slug' and t.activo = true and t.deleted_at is null
on conflict (tenant_id, emisor_id)
  where deleted_at is null
do update
  set razon_social    = excluded.razon_social,
      ruc             = excluded.ruc,
      nombre_fantasia = excluded.nombre_fantasia,
      activo          = true,
      updated_at      = now();

-- Establecimiento
insert into facturador_establecimientos (tenant_id, facturador_id, codigo, nombre, direccion, activo)
select f.tenant_id, f.id, :'establecimiento', :'establecimiento_nombre', :'establecimiento_direccion', true
from facturadores f
join tenants t on t.id = f.tenant_id
where t.slug = :'tenant_slug' and f.emisor_id = :'emisor_id' and f.deleted_at is null
on conflict (facturador_id, codigo)
  where deleted_at is null
do update
  set nombre     = excluded.nombre,
      direccion  = excluded.direccion,
      activo     = true,
      updated_at = now();

-- =============================================================================
-- PUNTO 001
-- =============================================================================

-- Punto de expedicion 001
insert into facturador_puntos_expedicion (tenant_id, facturador_id, establecimiento_id, codigo, nombre, activo)
select e.tenant_id, e.facturador_id, e.id, :'punto_001', :'punto_001_nombre', true
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

-- Actividad economica 001
insert into facturador_actividades (tenant_id, facturador_id, codigo, descripcion, alias_operativo, activo)
select f.tenant_id, f.id, :'actividad_001_codigo', :'actividad_001_descripcion', :'actividad_001_alias', true
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

-- Perfil de emision 001
insert into facturador_perfiles_emision (tenant_id, facturador_id, codigo, descripcion, activo)
select f.tenant_id, f.id, :'perfil_001_codigo', :'perfil_001_descripcion', true
from facturadores f
join tenants t on t.id = f.tenant_id
where t.slug = :'tenant_slug' and f.emisor_id = :'emisor_id' and f.deleted_at is null
on conflict (facturador_id, codigo)
  where deleted_at is null
do update
  set descripcion = excluded.descripcion,
      activo      = true,
      updated_at  = now();

-- actividad_punto_perfiles 001 (nodo central del contexto fiscal operativo)
insert into actividad_punto_perfiles (
  tenant_id, facturador_id,
  actividad_id, establecimiento_id, punto_expedicion_id, perfil_emision_id,
  timbrado, timbrado_inicio, documento_nro, credito_plazo_dias,
  alias_operativo, activo
)
select
  a.tenant_id,
  a.facturador_id,
  a.id                   as actividad_id,
  e.id                   as establecimiento_id,
  p.id                   as punto_expedicion_id,
  pe.id                  as perfil_emision_id,
  :'timbrado_001',
  :'timbrado_001_inicio'::date,
  :'documento_nro_001',
  :credito_plazo_dias,
  :'actividad_001_alias',
  true
from facturador_actividades a
join facturadores f on f.id = a.facturador_id
join tenants t on t.id = f.tenant_id
join facturador_establecimientos e
  on e.facturador_id = f.id and e.codigo = :'establecimiento' and e.deleted_at is null
join facturador_puntos_expedicion p
  on p.establecimiento_id = e.id and p.codigo = :'punto_001' and p.deleted_at is null
join facturador_perfiles_emision pe
  on pe.facturador_id = f.id and pe.codigo = :'perfil_001_codigo' and pe.deleted_at is null
where t.slug = :'tenant_slug' and f.emisor_id = :'emisor_id'
  and a.codigo = :'actividad_001_codigo' and a.deleted_at is null
on conflict (actividad_id, establecimiento_id, punto_expedicion_id, perfil_emision_id)
  where deleted_at is null
do update
  set timbrado         = excluded.timbrado,
      timbrado_inicio  = excluded.timbrado_inicio,
      documento_nro    = excluded.documento_nro,
      credito_plazo_dias = excluded.credito_plazo_dias,
      alias_operativo  = excluded.alias_operativo,
      activo           = true,
      updated_at       = now();

-- =============================================================================
-- PUNTO 002 — comentar este bloque completo si no aplica
-- =============================================================================

-- Punto de expedicion 002
insert into facturador_puntos_expedicion (tenant_id, facturador_id, establecimiento_id, codigo, nombre, activo)
select e.tenant_id, e.facturador_id, e.id, :'punto_002', :'punto_002_nombre', true
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

-- Actividad economica 002
insert into facturador_actividades (tenant_id, facturador_id, codigo, descripcion, alias_operativo, activo)
select f.tenant_id, f.id, :'actividad_002_codigo', :'actividad_002_descripcion', :'actividad_002_alias', true
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

-- Perfil de emision 002
insert into facturador_perfiles_emision (tenant_id, facturador_id, codigo, descripcion, activo)
select f.tenant_id, f.id, :'perfil_002_codigo', :'perfil_002_descripcion', true
from facturadores f
join tenants t on t.id = f.tenant_id
where t.slug = :'tenant_slug' and f.emisor_id = :'emisor_id' and f.deleted_at is null
on conflict (facturador_id, codigo)
  where deleted_at is null
do update
  set descripcion = excluded.descripcion,
      activo      = true,
      updated_at  = now();

-- actividad_punto_perfiles 002
insert into actividad_punto_perfiles (
  tenant_id, facturador_id,
  actividad_id, establecimiento_id, punto_expedicion_id, perfil_emision_id,
  timbrado, timbrado_inicio, documento_nro, credito_plazo_dias,
  alias_operativo, activo
)
select
  a.tenant_id,
  a.facturador_id,
  a.id                   as actividad_id,
  e.id                   as establecimiento_id,
  p.id                   as punto_expedicion_id,
  pe.id                  as perfil_emision_id,
  :'timbrado_002',
  :'timbrado_002_inicio'::date,
  :'documento_nro_002',
  :credito_plazo_dias,
  :'actividad_002_alias',
  true
from facturador_actividades a
join facturadores f on f.id = a.facturador_id
join tenants t on t.id = f.tenant_id
join facturador_establecimientos e
  on e.facturador_id = f.id and e.codigo = :'establecimiento' and e.deleted_at is null
join facturador_puntos_expedicion p
  on p.establecimiento_id = e.id and p.codigo = :'punto_002' and p.deleted_at is null
join facturador_perfiles_emision pe
  on pe.facturador_id = f.id and pe.codigo = :'perfil_002_codigo' and pe.deleted_at is null
where t.slug = :'tenant_slug' and f.emisor_id = :'emisor_id'
  and a.codigo = :'actividad_002_codigo' and a.deleted_at is null
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
-- VERIFICACION — confirmar el estado resultante
-- =============================================================================

select
  t.id                  as tenant_id,
  t.slug                as tenant_slug,
  t.estado              as tenant_estado,
  ts.estado             as suscripcion_estado,
  f.id                  as facturador_id,
  f.emisor_id,
  f.ruc,
  f.razon_social,
  f.nombre_fantasia,
  e.codigo              as establecimiento,
  e.nombre              as est_nombre,
  p.codigo              as punto,
  p.nombre              as punto_nombre,
  a.codigo              as actividad,
  a.alias_operativo     as actividad_alias,
  pe.codigo             as perfil,
  app.timbrado,
  app.timbrado_inicio,
  app.documento_nro,
  app.credito_plazo_dias
from tenants t
join tenant_suscripciones ts
  on ts.tenant_id = t.id and ts.activo = true and ts.deleted_at is null
join facturadores f
  on f.tenant_id = t.id and f.deleted_at is null
join actividad_punto_perfiles app
  on app.facturador_id = f.id and app.deleted_at is null
join facturador_establecimientos e
  on e.id = app.establecimiento_id and e.deleted_at is null
join facturador_puntos_expedicion p
  on p.id = app.punto_expedicion_id and p.deleted_at is null
join facturador_actividades a
  on a.id = app.actividad_id and a.deleted_at is null
join facturador_perfiles_emision pe
  on pe.id = app.perfil_emision_id and pe.deleted_at is null
where t.slug = :'tenant_slug'
order by e.codigo, p.codigo;
