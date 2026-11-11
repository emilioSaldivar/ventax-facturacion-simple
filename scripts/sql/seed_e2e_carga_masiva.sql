-- Datos de prueba de la carga masiva (SPEC_CARGA_MASIVA_FACTURAS_v0.1, G2).
-- Solo para el stack aislado con FE_GATEWAY_MODE=mock. Idempotente. Nunca en segel-fs ni en produccion.
--
--   psql -v password_hash="$HASH" -f seed_e2e_carga_masiva.sql
--
-- Deja un facturador con dos contextos: e2e.cm.servicio numera por FE, e2e.cm.cliente numera por
-- archivo. Ademas e2e.cm.soporte, rol interno en el primer contexto.
\set ON_ERROR_STOP on
begin;

insert into planes (codigo, nombre, max_usuarios, max_facturadores)
values ('E2E_CM', 'E2E carga masiva', 100, 10)
on conflict (codigo) do nothing;

insert into tenants (nombre, slug, estado, activo)
values ('E2E Carga masiva', 'e2e-carga-masiva', 'ACTIVO', true)
on conflict (slug) do update set estado = 'ACTIVO', activo = true, deleted_at = null;

insert into tenant_suscripciones (tenant_id, plan_id, estado, activo)
select t.id, p.id, 'ACTIVA', true from tenants t cross join planes p
where t.slug = 'e2e-carga-masiva' and p.codigo = 'E2E_CM'
on conflict (tenant_id) where activo = true and estado = 'ACTIVA' and deleted_at is null do nothing;

insert into facturadores (tenant_id, emisor_id, razon_social, ruc, nombre_fantasia, activo)
select t.id, '80099999-1', 'FACTURADOR E2E CARGA S.A.', '80099999-1', 'E2E Carga', true from tenants t
where t.slug = 'e2e-carga-masiva'
on conflict (tenant_id, emisor_id) where deleted_at is null do nothing;

insert into facturador_establecimientos (tenant_id, facturador_id, codigo, nombre, direccion, activo)
select f.tenant_id, f.id, '001', 'Casa matriz', 'Asuncion', true from facturadores f where f.emisor_id = '80099999-1'
on conflict (facturador_id, codigo) where deleted_at is null do nothing;

insert into facturador_puntos_expedicion (tenant_id, facturador_id, establecimiento_id, codigo, nombre, activo)
select e.tenant_id, e.facturador_id, e.id, v.codigo, v.nombre, true
from facturador_establecimientos e
join facturadores f on f.id = e.facturador_id and f.emisor_id = '80099999-1'
cross join (values ('001', 'Punto servicio'), ('002', 'Punto cliente')) as v(codigo, nombre)
on conflict (establecimiento_id, codigo) where deleted_at is null do nothing;

insert into facturador_actividades (tenant_id, facturador_id, codigo, descripcion, alias_operativo, activo)
select f.tenant_id, f.id, '82110', 'Servicios administrativos', 'Servicios', true from facturadores f where f.emisor_id = '80099999-1'
on conflict (facturador_id, codigo) where deleted_at is null do nothing;

insert into facturador_perfiles_emision (tenant_id, facturador_id, codigo, descripcion, activo)
select f.tenant_id, f.id, v.codigo, v.descripcion, true
from facturadores f
cross join (values ('E2E-P001', 'Perfil servicio'), ('E2E-P002', 'Perfil cliente')) as v(codigo, descripcion)
where f.emisor_id = '80099999-1'
on conflict (facturador_id, codigo) where deleted_at is null do nothing;

insert into actividad_punto_perfiles (
  tenant_id, facturador_id, actividad_id, establecimiento_id, punto_expedicion_id, perfil_emision_id,
  timbrado, timbrado_inicio, documento_nro, credito_plazo_dias, alias_operativo, activo, numeracion_facturas
)
select a.tenant_id, a.facturador_id, a.id, e.id, p.id, pe.id, '80099999', date '2026-01-01', '0000001', 30, v.alias, true, v.numeracion
from (values ('001', 'E2E-P001', 'Contexto servicio', 'SERVICIO'), ('002', 'E2E-P002', 'Contexto cliente', 'CLIENTE')) as v(punto, perfil, alias, numeracion)
join facturadores f on f.emisor_id = '80099999-1'
join facturador_actividades a on a.facturador_id = f.id and a.codigo = '82110'
join facturador_establecimientos e on e.facturador_id = f.id and e.codigo = '001'
join facturador_puntos_expedicion p on p.establecimiento_id = e.id and p.codigo = v.punto
join facturador_perfiles_emision pe on pe.facturador_id = f.id and pe.codigo = v.perfil
on conflict (actividad_id, establecimiento_id, punto_expedicion_id, perfil_emision_id) where deleted_at is null
do update set numeracion_facturas = excluded.numeracion_facturas;

insert into usuarios (tenant_id, username, display_name, password_hash, activo, must_change_password)
select t.id, v.username, v.nombre, :'password_hash', true, false
from tenants t
cross join (values ('e2e.cm.servicio', 'Operador Servicio'), ('e2e.cm.cliente', 'Operador Cliente'), ('e2e.cm.soporte', 'Soporte E2E')) as v(username, nombre)
where t.slug = 'e2e-carga-masiva'
on conflict (username) where deleted_at is null
do update set password_hash = excluded.password_hash, failed_login_count = 0, bloqueado_at = null, activo = true, must_change_password = false;

insert into usuario_roles (usuario_id, role_id)
select u.id, r.id from usuarios u join roles r on r.codigo = case when u.username = 'e2e.cm.soporte' then 'SOPORTE_INTERNO' else 'OPERADOR_FACTURACION' end
where u.username like 'e2e.cm.%'
on conflict (usuario_id, role_id) do nothing;

insert into usuario_operacion_config (tenant_id, usuario_id, facturador_id, actividad_punto_perfil_id, activo)
select u.tenant_id, u.id, f.id, app.id, true
from usuarios u
join facturadores f on f.emisor_id = '80099999-1'
join facturador_perfiles_emision pe on pe.facturador_id = f.id and pe.codigo = case when u.username = 'e2e.cm.cliente' then 'E2E-P002' else 'E2E-P001' end
join actividad_punto_perfiles app on app.perfil_emision_id = pe.id
where u.username like 'e2e.cm.%'
on conflict (usuario_id, actividad_punto_perfil_id) where activo = true and deleted_at is null do nothing;

insert into tyc_aceptaciones (
  usuario_id, tenant_id, tyc_version_id, tyc_version_texto, tyc_document_hash, plan_snapshot,
  username_snapshot, otp_email_destino, otp_enviado_at, otp_validado_at, checkbox_marcado, ip, user_agent, password_cambiado_en_flujo
)
select u.id, u.tenant_id, tv.id, tv.version, tv.document_hash, '{}'::jsonb, u.username, 'e2e@carga.invalid', now(), now(), true, '127.0.0.1', 'e2e', false
from usuarios u
join tyc_versiones tv on tv.activo = true
where u.username like 'e2e.cm.%'
  and not exists (select 1 from tyc_aceptaciones ta where ta.usuario_id = u.id and ta.tyc_version_id = tv.id);

commit;
