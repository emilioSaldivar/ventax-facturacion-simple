-- Reconciliacion de cancelaciones (SPEC_PARIDAD_CONTRATO_FE_v0.1, PF-018).
--
-- Antes de la correccion, `mapCancelStatus` no conocia ACCEPTED ni REJECTED: ambos caian en
-- PENDIENTE_SIFEN. Como FE rechaza ~15% de las cancelaciones de forma no determinista, hay
-- documentos cuyo estado local no refleja lo que realmente paso en SIFEN.
--
-- ESTE SCRIPT NO CORRIGE NADA. Lista los casos para revisarlos uno por uno contra
-- GET /v1/documentos/{uuid}/eventos, que es la unica fuente que dice si hay un CANCEL ACCEPTED.
--
-- Uso:
--   psql "$DATABASE_URL" -f scripts/sql/reconciliar_cancelaciones.sql

\echo '== 1. Documentos con intento de cancelacion posterior a la correccion, sin resolver =='

select
  f.id,
  f.numero_fiscal,
  f.cdc,
  f.estado,
  f.cancelacion_status,
  f.cancelacion_rejection_code,
  f.cancelacion_retryable,
  f.cancelacion_intentos,
  f.cancelacion_last_at,
  fac.emisor_id
from facturas_operativas f
join facturadores fac on fac.id = f.facturador_id
where f.cancelacion_status is not null
  and f.cancelacion_status <> 'ACCEPTED'
  and f.deleted_at is null
order by f.cancelacion_last_at desc;

\echo ''
\echo '== 2. Sospechosos historicos: anulacion intentada ANTES de la correccion =='
\echo '   (sin cancelacion_status, pero con rastro de cancelacion en el snapshot fiscal)'

select
  f.id,
  f.numero_fiscal,
  f.cdc,
  f.estado,
  f.document_uuid,
  f.fiscal_response_snapshot ->> 'status'  as status_crudo,
  f.fiscal_response_snapshot ->> 'event_id' as event_id,
  f.updated_at,
  fac.emisor_id
from facturas_operativas f
join facturadores fac on fac.id = f.facturador_id
where f.cancelacion_status is null
  and f.deleted_at is null
  and f.fiscal_response_snapshot ? 'cancelacion_motivo'
order by f.updated_at desc;

\echo ''
\echo '== 3. Resumen por facturador =='

select
  fac.emisor_id,
  count(*) filter (where f.cancelacion_status = 'REJECTED')  as rechazadas,
  count(*) filter (where f.cancelacion_status = 'FAILED')    as sin_respuesta,
  count(*) filter (where f.cancelacion_status = 'UNKNOWN')   as no_interpretadas,
  count(*) filter (where f.cancelacion_status is null
                     and f.fiscal_response_snapshot ? 'cancelacion_motivo') as historicas_sin_dato
from facturas_operativas f
join facturadores fac on fac.id = f.facturador_id
where f.deleted_at is null
group by fac.emisor_id
having count(*) filter (where f.cancelacion_status is not null
                          or f.fiscal_response_snapshot ? 'cancelacion_motivo') > 0
order by fac.emisor_id;

\echo ''
\echo 'Siguiente paso por cada fila del bloque 1 y 2:'
\echo '  GET /v1/documentos/{document_uuid}/eventos  con la clave compartida'
\echo '  Anulada SOLO si hay un evento type=CANCEL y status=ACCEPTED.'
