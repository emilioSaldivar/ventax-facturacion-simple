-- =============================================================================
-- create_usuario.sql
-- Crea un usuario operador y le asigna una configuracion operativa activa.
--
-- PREREQUISITO — Generar hash Argon2id ANTES de ejecutar este script:
--
--   docker compose exec -T api node -e \
--     "require('argon2').hash('TU_PASSWORD',{type:require('argon2').argon2id}).then(console.log)"
--
--   Copiar el resultado (empieza con $argon2id$) como valor de \set password_hash.
--   NUNCA guardar el password en claro en archivos, tickets ni Git.
--
-- IDEMPOTENTE: si el username ya existe, actualiza display_name y desbloquea.
--              Si la config operativa ya existe para el punto indicado, la reactiva.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- VARIABLES
-- -----------------------------------------------------------------------------

-- Identificadores del facturador al que se asigna el operador
\set tenant_slug        'cliente-acme'
\set emisor_id          '5057016-1'
\set establecimiento    '001'
\set punto_expedicion   '001'
\set perfil_codigo      'AC445203-E001-P001-FE-PTO'
\set actividad_codigo   '45203'

-- Datos del usuario
\set username           'operador.cliente-acme'
\set display_name       'Operador Principal'
\set rol                'OPERADOR_FACTURACION'
-- Roles validos: OPERADOR_FACTURACION | SOPORTE_INTERNO | ADMIN_INTERNO

-- Hash generado con el comando del encabezado — reemplazar con el valor real
\set password_hash      '$argon2id$v=19$m=65536,t=3,p=4$REEMPLAZAR_CON_HASH_REAL'

-- -----------------------------------------------------------------------------
-- EJECUCION
-- -----------------------------------------------------------------------------

begin;

-- Usuario
with usuario_insert as (
  insert into usuarios (tenant_id, username, display_name, password_hash, activo)
  select t.id, :'username', :'display_name', :'password_hash', true
  from tenants t
  where t.slug = :'tenant_slug' and t.activo = true and t.deleted_at is null
  on conflict (username)
    where deleted_at is null
  do update
    set display_name       = excluded.display_name,
        password_hash      = excluded.password_hash,
        failed_login_count = 0,
        bloqueado_at       = null,
        activo             = true,
        updated_at         = now()
  returning id, tenant_id
)
-- Rol
insert into usuario_roles (usuario_id, role_id)
select u.id, r.id
from usuario_insert u
cross join roles r
where r.codigo = :'rol' and r.activo = true
on conflict (usuario_id, role_id) do nothing;

-- Desactivar config operativa anterior del usuario (si existe)
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

-- Asignar nueva config operativa
insert into usuario_operacion_config (tenant_id, usuario_id, facturador_id, actividad_punto_perfil_id, activo)
select
  u.tenant_id,
  u.id                   as usuario_id,
  f.id                   as facturador_id,
  app.id                 as actividad_punto_perfil_id,
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
where u.username = :'username' and t.slug = :'tenant_slug' and u.deleted_at is null
on conflict (usuario_id)
  where activo = true and deleted_at is null
do update
  set facturador_id            = excluded.facturador_id,
      actividad_punto_perfil_id = excluded.actividad_punto_perfil_id,
      updated_at               = now();

commit;

-- =============================================================================
-- VERIFICACION
-- =============================================================================

select
  u.id            as usuario_id,
  u.username,
  u.display_name,
  r.codigo        as rol,
  u.activo        as usuario_activo,
  f.emisor_id,
  e.codigo        as establecimiento,
  p.codigo        as punto,
  a.codigo        as actividad,
  pe.codigo       as perfil,
  app.timbrado,
  app.documento_nro,
  uoc.activo      as config_activa
from usuarios u
join tenants t on t.id = u.tenant_id
join usuario_roles ur on ur.usuario_id = u.id
join roles r on r.id = ur.role_id
left join usuario_operacion_config uoc
  on uoc.usuario_id = u.id and uoc.activo = true and uoc.deleted_at is null
left join actividad_punto_perfiles app
  on app.id = uoc.actividad_punto_perfil_id and app.deleted_at is null
left join facturadores f on f.id = app.facturador_id and f.deleted_at is null
left join facturador_establecimientos e on e.id = app.establecimiento_id
left join facturador_puntos_expedicion p on p.id = app.punto_expedicion_id
left join facturador_actividades a on a.id = app.actividad_id
left join facturador_perfiles_emision pe on pe.id = app.perfil_emision_id
where u.username = :'username' and t.slug = :'tenant_slug' and u.deleted_at is null;
