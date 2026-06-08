-- =============================================================================
-- alta_facturador_80136968_prod.sql
-- Alta completa de AWAPUREA E.A.S. UNIPERSONAL  (RUC 80136968-1)
-- Tenant:  awapura
-- Fecha:   2026-06-05
-- Fuente:  Export FE id_interno_fe=4
--
-- NOTAS:
--   Punto 001 (SERVICIOS DE ADMINISTRACION DE OFICINAS): se crea el punto pero
--   SIN actividad_punto_perfiles porque la actividad SIFEN y el timbrado
--   no están asignados aún en FE. Completar cuando FE los informe.
--
--   Punto 002 (ALCANTARILLADO): configuracion completa.
--     actividad 37000 / perfil A37000-E001-P002-FE-PTO
--     timbrado 18546268 / inicio 2025-12-30 / siguiente_nro 1
-- =============================================================================

begin;

-- ── Plan base (idempotente) ───────────────────────────────────────────────────
insert into planes (codigo, nombre, descripcion, max_usuarios, max_facturadores)
values ('BASICO_MVP', 'Basico MVP', 'Plan inicial para facturacion simple mobile-first.', 3, 1)
on conflict (codigo) do update
  set activo     = true,
      updated_at = now();

-- ── Tenant ────────────────────────────────────────────────────────────────────
with tenant_insert as (
  insert into tenants (nombre, slug, estado, activo)
  values ('AWAPURA', 'awapura', 'ACTIVO', true)
  on conflict (slug) do update
    set nombre     = excluded.nombre,
        estado     = 'ACTIVO',
        activo     = true,
        deleted_at = null,
        updated_at = now()
  returning id
)
-- ── Suscripcion ───────────────────────────────────────────────────────────────
insert into tenant_suscripciones (tenant_id, plan_id, estado, activo)
select t.id, p.id, 'ACTIVA', true
from tenant_insert t
cross join planes p
where p.codigo = 'BASICO_MVP' and p.activo = true and p.deleted_at is null
on conflict (tenant_id)
  where activo = true and estado = 'ACTIVA' and deleted_at is null
do update
  set plan_id    = excluded.plan_id,
      fecha_fin  = null,
      updated_at = now();

-- ── Facturador ────────────────────────────────────────────────────────────────
insert into facturadores (tenant_id, emisor_id, razon_social, ruc, nombre_fantasia, activo)
select t.id, '80136968-1', 'AWAPUREA E.A.S. UNIPERSONAL', '80136968-1', 'AWAPURA', true
from tenants t
where t.slug = 'awapura' and t.activo = true and t.deleted_at is null
on conflict (tenant_id, emisor_id)
  where deleted_at is null
do update
  set razon_social    = excluded.razon_social,
      ruc             = excluded.ruc,
      nombre_fantasia = excluded.nombre_fantasia,
      activo          = true,
      updated_at      = now();

-- ── Establecimiento 001 ───────────────────────────────────────────────────────
insert into facturador_establecimientos (tenant_id, facturador_id, codigo, nombre, direccion, activo)
select f.tenant_id, f.id, '001', 'AWAPURA E.A.S. UNIPERSONAL', '3 DE FEBRERO', true
from facturadores f
join tenants t on t.id = f.tenant_id
where t.slug = 'awapura' and f.emisor_id = '80136968-1' and f.deleted_at is null
on conflict (facturador_id, codigo)
  where deleted_at is null
do update
  set nombre     = excluded.nombre,
      direccion  = excluded.direccion,
      activo     = true,
      updated_at = now();

-- =============================================================================
-- PUNTO 001 — SERVICIOS DE ADMINISTRACION DE OFICINAS
-- Solo se crea el punto; sin actividad/perfil/timbrado hasta que FE los asigne.
-- =============================================================================

insert into facturador_puntos_expedicion (tenant_id, facturador_id, establecimiento_id, codigo, nombre, activo)
select e.tenant_id, e.facturador_id, e.id, '001', 'SERVICIOS DE ADMINISTRACION DE OFICINAS', true
from facturador_establecimientos e
join facturadores f on f.id = e.facturador_id
join tenants t on t.id = f.tenant_id
where t.slug = 'awapura' and f.emisor_id = '80136968-1'
  and e.codigo = '001' and e.deleted_at is null
on conflict (establecimiento_id, codigo)
  where deleted_at is null
do update
  set nombre     = excluded.nombre,
      activo     = true,
      updated_at = now();

-- =============================================================================
-- PUNTO 002 — ALCANTARILLADO  (actividad 37000 / perfil A37000-E001-P002-FE-PTO)
-- =============================================================================

-- Punto de expedicion 002
insert into facturador_puntos_expedicion (tenant_id, facturador_id, establecimiento_id, codigo, nombre, activo)
select e.tenant_id, e.facturador_id, e.id, '002', 'ALCANTARILLADO', true
from facturador_establecimientos e
join facturadores f on f.id = e.facturador_id
join tenants t on t.id = f.tenant_id
where t.slug = 'awapura' and f.emisor_id = '80136968-1'
  and e.codigo = '001' and e.deleted_at is null
on conflict (establecimiento_id, codigo)
  where deleted_at is null
do update
  set nombre     = excluded.nombre,
      activo     = true,
      updated_at = now();

-- Actividad economica 37000
insert into facturador_actividades (tenant_id, facturador_id, codigo, descripcion, alias_operativo, activo)
select f.tenant_id, f.id, '37000', 'ALCANTARILLADO', 'ALCANTARILLADO', true
from facturadores f
join tenants t on t.id = f.tenant_id
where t.slug = 'awapura' and f.emisor_id = '80136968-1' and f.deleted_at is null
on conflict (facturador_id, codigo)
  where deleted_at is null
do update
  set descripcion     = excluded.descripcion,
      alias_operativo = excluded.alias_operativo,
      activo          = true,
      updated_at      = now();

-- Perfil de emision A37000-E001-P002-FE-PTO
insert into facturador_perfiles_emision (tenant_id, facturador_id, codigo, descripcion, activo)
select f.tenant_id, f.id, 'A37000-E001-P002-FE-PTO', 'Alcantarillado - Punto 002', true
from facturadores f
join tenants t on t.id = f.tenant_id
where t.slug = 'awapura' and f.emisor_id = '80136968-1' and f.deleted_at is null
on conflict (facturador_id, codigo)
  where deleted_at is null
do update
  set descripcion = excluded.descripcion,
      activo      = true,
      updated_at  = now();

-- actividad_punto_perfiles 002
-- siguiente_numero_fe = 1  →  documento_nro = '0000001'
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
  '18546268',
  '2025-12-30'::date,
  '0000001',
  30,
  'ALCANTARILLADO',
  true
from facturador_actividades a
join facturadores f on f.id = a.facturador_id
join tenants t on t.id = f.tenant_id
join facturador_establecimientos e
  on e.facturador_id = f.id and e.codigo = '001' and e.deleted_at is null
join facturador_puntos_expedicion p
  on p.establecimiento_id = e.id and p.codigo = '002' and p.deleted_at is null
join facturador_perfiles_emision pe
  on pe.facturador_id = f.id and pe.codigo = 'A37000-E001-P002-FE-PTO' and pe.deleted_at is null
where t.slug = 'awapura' and f.emisor_id = '80136968-1'
  and a.codigo = '37000' and a.deleted_at is null
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
-- VERIFICACION — confirmar estado resultante
-- =============================================================================

select
  t.id                  as tenant_id,
  t.slug                as tenant_slug,
  t.estado              as tenant_estado,
  ts.estado             as suscripcion_estado,
  f.id                  as facturador_id,
  f.emisor_id,
  f.razon_social,
  f.nombre_fantasia,
  e.codigo              as establecimiento,
  p.codigo              as punto,
  p.nombre              as punto_nombre,
  a.codigo              as actividad,
  pe.codigo             as perfil,
  app.timbrado,
  app.timbrado_inicio,
  app.documento_nro
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
where t.slug = 'awapura'
order by e.codigo, p.codigo;

-- Resultado esperado: 1 fila (solo punto 002 tiene actividad_punto_perfiles)
--   est=001  punto=002  actividad=37000  perfil=A37000-E001-P002-FE-PTO
--   timbrado=18546268  timbrado_inicio=2025-12-30  documento_nro=0000001
