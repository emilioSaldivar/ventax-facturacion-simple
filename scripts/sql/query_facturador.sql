-- =============================================================================
-- query_facturador.sql
-- Estado completo de un facturador: tenant, suscripcion, establecimientos,
-- puntos, actividades, perfiles, timbrado y numero de referencia.
-- Solo lectura. Usar para diagnostico y verificacion de alta.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- VARIABLES
-- -----------------------------------------------------------------------------

\set tenant_slug    'cliente-acme'
\set emisor_id      '5057016-1'

-- -----------------------------------------------------------------------------
-- CONSULTA
-- -----------------------------------------------------------------------------

-- 1. Tenant y suscripcion
select
  t.id            as tenant_id,
  t.slug,
  t.nombre        as tenant_nombre,
  t.estado        as tenant_estado,
  t.activo        as tenant_activo,
  ts.estado       as suscripcion_estado,
  ts.activo       as suscripcion_activa,
  p.codigo        as plan_codigo,
  p.nombre        as plan_nombre,
  ts.fecha_inicio,
  ts.fecha_fin
from tenants t
left join tenant_suscripciones ts
  on ts.tenant_id = t.id and ts.deleted_at is null
left join planes p on p.id = ts.plan_id
where t.slug = :'tenant_slug';

-- 2. Facturador
select
  f.id            as facturador_id,
  f.emisor_id,
  f.ruc,
  f.razon_social,
  f.nombre_fantasia,
  f.activo,
  f.created_at
from facturadores f
join tenants t on t.id = f.tenant_id
where t.slug = :'tenant_slug' and f.emisor_id = :'emisor_id' and f.deleted_at is null;

-- 3. Configuracion fiscal operativa completa (puntos, actividades, perfiles, timbrados)
select
  e.codigo              as establecimiento,
  e.nombre              as est_nombre,
  e.direccion           as est_direccion,
  p.codigo              as punto,
  p.nombre              as punto_nombre,
  a.codigo              as actividad,
  a.descripcion         as actividad_descripcion,
  a.alias_operativo     as actividad_alias,
  pe.codigo             as perfil,
  pe.descripcion        as perfil_descripcion,
  app.timbrado,
  app.timbrado_inicio,
  app.documento_nro,
  app.credito_plazo_dias,
  app.activo            as config_activa,
  app.updated_at        as config_updated_at
from actividad_punto_perfiles app
join facturadores f on f.id = app.facturador_id
join tenants t on t.id = f.tenant_id
join facturador_establecimientos e on e.id = app.establecimiento_id
join facturador_puntos_expedicion p on p.id = app.punto_expedicion_id
join facturador_actividades a on a.id = app.actividad_id
join facturador_perfiles_emision pe on pe.id = app.perfil_emision_id
where t.slug = :'tenant_slug' and f.emisor_id = :'emisor_id'
  and app.deleted_at is null
order by e.codigo, p.codigo;

-- 4. Conteo de documentos operativos del facturador
select
  estado,
  tipo,
  count(*) as cantidad
from facturas_operativas fo
join facturadores f on f.id = fo.facturador_id
join tenants t on t.id = f.tenant_id
where t.slug = :'tenant_slug' and f.emisor_id = :'emisor_id'
  and fo.deleted_at is null
group by estado, tipo
order by estado, tipo;
