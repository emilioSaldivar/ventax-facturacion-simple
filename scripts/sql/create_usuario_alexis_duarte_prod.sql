-- =============================================================================
-- create_usuario_alexis_duarte_prod.sql
-- Crea usuario alexis_duarte en tenant awapura y lo asigna a:
--   Punto 002 / Actividad 37000 (ALCANTARILLADO) / Perfil A37000-E001-P002-FE-PTO
--
-- PREREQUISITO 1 — ejecutar PRIMERO alta_facturador_80136968_prod.sql
--
-- PREREQUISITO 2 — generar hash Argon2id antes de ejecutar:
--
--   docker compose exec -T api node -e \
--     "require('argon2').hash('TU_PASSWORD',{type:require('argon2').argon2id}).then(console.log)"
--
--   Reemplazar el valor de password_hash con el resultado (empieza con $argon2id$).
--   NUNCA guardar el password en claro en archivos, tickets ni Git.
-- =============================================================================

-- Verificacion previa
SELECT
  u.username,
  u.email,
  u.display_name,
  u.activo,
  uoc.activo   AS config_activa,
  f.emisor_id,
  e.codigo     AS est,
  p.codigo     AS punto,
  a.codigo     AS actividad,
  pe.codigo    AS perfil
FROM usuarios u
LEFT JOIN usuario_operacion_config uoc
  ON uoc.usuario_id = u.id AND uoc.deleted_at IS NULL
LEFT JOIN actividad_punto_perfiles app
  ON app.id = uoc.actividad_punto_perfil_id AND app.deleted_at IS NULL
LEFT JOIN facturadores f ON f.id = app.facturador_id
LEFT JOIN facturador_establecimientos e ON e.id = app.establecimiento_id
LEFT JOIN facturador_puntos_expedicion p ON p.id = app.punto_expedicion_id
LEFT JOIN facturador_actividades a ON a.id = app.actividad_id
LEFT JOIN facturador_perfiles_emision pe ON pe.id = app.perfil_emision_id
WHERE u.username = 'alexis_duarte'
  AND u.deleted_at IS NULL;

begin;

-- ── Usuario ───────────────────────────────────────────────────────────────────
with usuario_insert as (
  insert into usuarios (tenant_id, username, email, display_name, password_hash, activo)
  select t.id, 'alexis_duarte', 'alexis.duarte@gmail.com', 'Alexis Duarte', '$argon2id$v=19$m=65536,t=3,p=4$kNxk5jUjL8s7mh2vH5F4OA$iGxSmkAh4mwa5GsbxAFQ4bGQ8sD2M+lW9Aal3cnfb4w', true
  from tenants t
  where t.slug = 'awapura' and t.activo = true and t.deleted_at is null
  on conflict (username)
    where deleted_at is null
  do update
    set email              = excluded.email,
        display_name       = excluded.display_name,
        password_hash      = excluded.password_hash,
        failed_login_count = 0,
        bloqueado_at       = null,
        activo             = true,
        updated_at         = now()
  returning id, tenant_id
)
-- ── Rol ───────────────────────────────────────────────────────────────────────
insert into usuario_roles (usuario_id, role_id)
select u.id, r.id
from usuario_insert u
cross join roles r
where r.codigo = 'OPERADOR_FACTURACION' and r.activo = true
on conflict (usuario_id, role_id) do nothing;

-- ── Desactivar config operativa anterior (si existe) ─────────────────────────
update usuario_operacion_config uoc
set activo     = false,
    deleted_at = now(),
    updated_at = now()
from usuarios u
join tenants t on t.id = u.tenant_id
where uoc.usuario_id = u.id
  and uoc.activo = true
  and uoc.deleted_at is null
  and u.username = 'alexis_duarte'
  and t.slug = 'awapura';

-- ── Config operativa: punto 002 / actividad 37000 / A37000-E001-P002-FE-PTO ──
insert into usuario_operacion_config (tenant_id, usuario_id, facturador_id, actividad_punto_perfil_id, activo)
select
  u.tenant_id,
  u.id,
  f.id,
  app.id,
  true
from usuarios u
join tenants t on t.id = u.tenant_id
join facturadores f
  on f.tenant_id = t.id and f.emisor_id = '80136968-1' and f.deleted_at is null
join facturador_establecimientos e
  on e.facturador_id = f.id and e.codigo = '001' and e.deleted_at is null
join facturador_puntos_expedicion p
  on p.establecimiento_id = e.id and p.codigo = '002' and p.deleted_at is null
join facturador_actividades a
  on a.facturador_id = f.id and a.codigo = '37000' and a.deleted_at is null
join facturador_perfiles_emision pe
  on pe.facturador_id = f.id and pe.codigo = 'A37000-E001-P002-FE-PTO' and pe.deleted_at is null
join actividad_punto_perfiles app
  on app.actividad_id = a.id
  and app.establecimiento_id = e.id
  and app.punto_expedicion_id = p.id
  and app.perfil_emision_id = pe.id
  and app.deleted_at is null
where u.username = 'alexis_duarte'
  and t.slug = 'awapura'
  and u.deleted_at is null
on conflict (usuario_id)
  where activo = true and deleted_at is null
do update
  set facturador_id             = excluded.facturador_id,
      actividad_punto_perfil_id = excluded.actividad_punto_perfil_id,
      updated_at                = now();

commit;

-- =============================================================================
-- VERIFICACION FINAL
-- =============================================================================

select
  u.id            as usuario_id,
  u.username,
  u.email,
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
where u.username = 'alexis_duarte'
  and t.slug = 'awapura'
  and u.deleted_at is null;

-- Resultado esperado:
--   username=alexis_duarte  rol=OPERADOR_FACTURACION
--   est=001  punto=002  actividad=37000  perfil=A37000-E001-P002-FE-PTO
--   timbrado=18546268  config_activa=true
