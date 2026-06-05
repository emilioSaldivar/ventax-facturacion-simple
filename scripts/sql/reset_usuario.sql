-- =============================================================================
-- reset_usuario.sql
-- Desbloquea un usuario, reinicia intentos fallidos y revoca sesiones activas.
-- Opcionalmente actualiza el password si se pasa un nuevo hash.
--
-- Usar cuando el operador esta bloqueado, olvidó su password o necesita
-- nuevo acceso después de un reset manual.
--
-- Para generar nuevo hash Argon2id:
--   docker compose exec -T api node -e \
--     "require('argon2').hash('NUEVO_PASSWORD',{type:require('argon2').argon2id}).then(console.log)"
--
-- Si no se quiere cambiar el password, dejar password_hash en blanco ('').
-- El script solo actualiza el hash si el valor no es vacio.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- VARIABLES
-- -----------------------------------------------------------------------------

\set tenant_slug    'cliente-acme'
\set username       'operador.cliente-acme'

-- Nuevo hash Argon2id. Dejar '' para no cambiar el password.
\set password_hash  ''

-- -----------------------------------------------------------------------------
-- EJECUCION
-- -----------------------------------------------------------------------------

begin;

-- Revocar todos los refresh tokens activos
update refresh_tokens rt
set revoked_at = now()
from usuarios u
join tenants t on t.id = u.tenant_id
where rt.usuario_id = u.id
  and rt.revoked_at is null
  and u.username = :'username'
  and t.slug = :'tenant_slug'
  and u.deleted_at is null;

-- Desbloquear usuario y opcionalmente actualizar hash
update usuarios u
set
  failed_login_count = 0,
  bloqueado_at       = null,
  activo             = true,
  password_hash      = case
                         when :'password_hash' <> '' then :'password_hash'
                         else password_hash
                       end,
  updated_at         = now()
from tenants t
where u.tenant_id = t.id
  and u.username = :'username'
  and t.slug = :'tenant_slug'
  and u.deleted_at is null;

commit;

-- VERIFICACION
select
  u.id,
  u.username,
  u.display_name,
  u.activo,
  u.failed_login_count,
  u.bloqueado_at,
  u.updated_at,
  (select count(*) from refresh_tokens rt
   where rt.usuario_id = u.id and rt.revoked_at is null) as tokens_activos
from usuarios u
join tenants t on t.id = u.tenant_id
where u.username = :'username' and t.slug = :'tenant_slug' and u.deleted_at is null;
