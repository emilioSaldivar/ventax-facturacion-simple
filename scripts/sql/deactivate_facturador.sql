-- =============================================================================
-- deactivate_facturador.sql
-- Da de baja a un facturador y toda su configuracion operativa.
-- En una sola transaccion:
--   1. Desactiva todas las actividad_punto_perfiles del facturador.
--   2. Desactiva todas las usuario_operacion_config que apunten al facturador.
--   3. Desactiva el facturador.
-- NO desactiva usuarios ni establecimientos/puntos fisicos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- VARIABLES
-- -----------------------------------------------------------------------------

\set tenant_slug    'cliente-acme'
\set emisor_id      '5057016-1'

-- -----------------------------------------------------------------------------
-- EJECUCION
-- -----------------------------------------------------------------------------

begin;

-- 1. Desactivar configs operativas de todos los usuarios del facturador
update usuario_operacion_config uoc
set activo     = false,
    deleted_at = now(),
    updated_at = now()
from facturadores f
join tenants t on t.id = f.tenant_id
where uoc.facturador_id = f.id
  and uoc.activo = true
  and uoc.deleted_at is null
  and f.emisor_id = :'emisor_id'
  and t.slug = :'tenant_slug'
  and f.deleted_at is null;

-- 2. Desactivar actividad_punto_perfiles del facturador
update actividad_punto_perfiles app
set activo     = false,
    deleted_at = now(),
    updated_at = now()
from facturadores f
join tenants t on t.id = f.tenant_id
where app.facturador_id = f.id
  and app.deleted_at is null
  and f.emisor_id = :'emisor_id'
  and t.slug = :'tenant_slug'
  and f.deleted_at is null;

-- 3. Desactivar facturador
update facturadores f
set activo     = false,
    deleted_at = now(),
    updated_at = now()
from tenants t
where f.tenant_id = t.id
  and f.emisor_id = :'emisor_id'
  and t.slug = :'tenant_slug'
  and f.deleted_at is null;

commit;

-- VERIFICACION
select
  f.emisor_id,
  f.razon_social,
  f.activo                    as facturador_activo,
  f.deleted_at                as facturador_deleted_at,
  (select count(*) from actividad_punto_perfiles app
   where app.facturador_id = f.id and app.activo = true and app.deleted_at is null)
                              as configs_punto_activas,
  (select count(*) from usuario_operacion_config uoc
   where uoc.facturador_id = f.id and uoc.activo = true and uoc.deleted_at is null)
                              as configs_usuario_activas
from facturadores f
join tenants t on t.id = f.tenant_id
where t.slug = :'tenant_slug' and f.emisor_id = :'emisor_id';
