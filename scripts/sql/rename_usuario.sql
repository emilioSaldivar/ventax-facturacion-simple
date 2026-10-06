-- =============================================================================
-- rename_usuario.sql
-- Corrige el username de un usuario existente conservando su id, su password,
-- sus roles y su config operativa.
--
-- El username es unico global (usuarios_username_uidx sobre username where
-- deleted_at is null), por lo que alcanza con el username viejo para
-- identificar al usuario. No hay FK por username: las unicas copias
-- denormalizadas son historicas y se dejan intactas a proposito
-- (login_attempts.username y los *_snapshot de onboarding son auditoria).
--
-- El username nuevo debe ir en minusculas: normalizeUsername() del backoffice
-- baja a minusculas al crear, y la comparacion de login es citext.
--
-- Las sesiones activas siguen validas: el refresh relee el usuario por id
-- (findActiveUserById) y el claim de username se regenera. Si se prefiere
-- forzar re-login, correr reset_usuario.sql despues.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- VARIABLES
-- -----------------------------------------------------------------------------

\set username_viejo  'fibanes_asu'
\set username_nuevo  'fibanez_asu'

-- -----------------------------------------------------------------------------
-- PRE-VERIFICACION
-- -----------------------------------------------------------------------------

-- Debe devolver exactamente 1 fila para el username viejo y 0 para el nuevo.
select
  u.username,
  u.display_name,
  t.slug as tenant,
  u.activo,
  case
    when u.username = :'username_viejo' then 'ORIGEN (debe existir)'
    else 'DESTINO (debe estar libre)'
  end as rol_en_el_cambio
from usuarios u
join tenants t on t.id = u.tenant_id
where u.username in (:'username_viejo', :'username_nuevo')
  and u.deleted_at is null;

-- -----------------------------------------------------------------------------
-- EJECUCION
-- -----------------------------------------------------------------------------

begin;

update usuarios u
set username   = :'username_nuevo',
    updated_at = now()
where u.username = :'username_viejo'
  and u.deleted_at is null
  -- Guarda explicita: no renombrar si el destino ya esta ocupado por otro
  -- usuario vivo. El indice unico parcial igual abortaria la transaccion.
  and not exists (
    select 1 from usuarios otro
    where otro.username = :'username_nuevo'
      and otro.deleted_at is null
      and otro.id <> u.id
  );

commit;

-- -----------------------------------------------------------------------------
-- VERIFICACION
-- -----------------------------------------------------------------------------

-- Debe devolver 1 fila con el username nuevo y ninguna con el viejo.
select
  u.id,
  u.username,
  u.display_name,
  t.slug as tenant,
  r.codigo as rol,
  u.activo,
  u.updated_at
from usuarios u
join tenants t on t.id = u.tenant_id
left join usuario_roles ur on ur.usuario_id = u.id
left join roles r on r.id = ur.role_id
where u.username in (:'username_viejo', :'username_nuevo')
  and u.deleted_at is null;
