-- =============================================================================
-- deactivate_usuario.sql
-- Da de baja a un usuario operador.
-- Desactiva el usuario, revoca todas las sesiones activas y desactiva
-- su configuracion operativa.
-- No elimina registros — solo soft delete para mantener auditoria.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- VARIABLES
-- -----------------------------------------------------------------------------

\set tenant_slug    'cliente-acme'
\set username       'operador.cliente-acme'

-- -----------------------------------------------------------------------------
-- EJECUCION
-- -----------------------------------------------------------------------------

begin;

-- Revocar refresh tokens activos
update refresh_tokens rt
set revoked_at = now()
from usuarios u
join tenants t on t.id = u.tenant_id
where rt.usuario_id = u.id
  and rt.revoked_at is null
  and u.username = :'username'
  and t.slug = :'tenant_slug'
  and u.deleted_at is null;

-- Desactivar config operativa activa
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

-- Desactivar usuario
update usuarios u
set activo     = false,
    deleted_at = now(),
    updated_at = now()
from tenants t
where u.tenant_id = t.id
  and u.username = :'username'
  and t.slug = :'tenant_slug'
  and u.deleted_at is null;

commit;

-- VERIFICACION
select
  u.username,
  u.activo,
  u.deleted_at,
  (select count(*) from refresh_tokens rt
   where rt.usuario_id = u.id and rt.revoked_at is null) as tokens_activos_restantes,
  (select count(*) from usuario_operacion_config uoc
   where uoc.usuario_id = u.id and uoc.activo = true and uoc.deleted_at is null) as configs_activas_restantes
from usuarios u
join tenants t on t.id = u.tenant_id
where u.username = :'username' and t.slug = :'tenant_slug';
