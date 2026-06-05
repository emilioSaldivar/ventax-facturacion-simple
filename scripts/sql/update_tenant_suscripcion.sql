-- =============================================================================
-- update_tenant_suscripcion.sql
-- Cambia el estado de la suscripcion activa de un tenant.
-- Tambien actualiza el estado del tenant en consecuencia.
--
-- Estados validos de suscripcion: ACTIVA | SUSPENDIDA | CANCELADA
-- Estados resultantes del tenant: ACTIVO | SUSPENDIDO | CANCELADO
-- =============================================================================

-- -----------------------------------------------------------------------------
-- VARIABLES
-- -----------------------------------------------------------------------------

\set tenant_slug            'cliente-acme'
\set nuevo_estado_suscripcion  'SUSPENDIDA'
-- ACTIVA     → tenant queda ACTIVO
-- SUSPENDIDA → tenant queda SUSPENDIDO
-- CANCELADA  → tenant queda CANCELADO, suscripcion se da de baja

-- -----------------------------------------------------------------------------
-- EJECUCION
-- -----------------------------------------------------------------------------

begin;

-- Actualizar suscripcion
update tenant_suscripciones ts
set
  estado     = :'nuevo_estado_suscripcion',
  activo     = case when :'nuevo_estado_suscripcion' = 'CANCELADA' then false else activo end,
  deleted_at = case when :'nuevo_estado_suscripcion' = 'CANCELADA' then now() else deleted_at end,
  fecha_fin  = case when :'nuevo_estado_suscripcion' = 'CANCELADA' then current_date else fecha_fin end,
  updated_at = now()
from tenants t
where ts.tenant_id = t.id
  and ts.activo = true
  and ts.deleted_at is null
  and t.slug = :'tenant_slug';

-- Actualizar estado del tenant
update tenants
set
  estado     = case :'nuevo_estado_suscripcion'
                 when 'ACTIVA'     then 'ACTIVO'
                 when 'SUSPENDIDA' then 'SUSPENDIDO'
                 when 'CANCELADA'  then 'CANCELADO'
                 else estado
               end,
  updated_at = now()
where slug = :'tenant_slug' and deleted_at is null;

commit;

-- VERIFICACION
select
  t.slug,
  t.nombre,
  t.estado        as tenant_estado,
  ts.estado       as suscripcion_estado,
  ts.fecha_inicio,
  ts.fecha_fin,
  ts.activo       as suscripcion_activa
from tenants t
left join tenant_suscripciones ts
  on ts.tenant_id = t.id and ts.deleted_at is null
where t.slug = :'tenant_slug';
