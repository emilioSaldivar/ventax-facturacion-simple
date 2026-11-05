-- Perfil de carga real (SPEC D-4). SOLO LECTURA. Devuelve agregados: nada de nombres, RUC ni documentos.
-- La transaccion de solo lectura hace que cualquier escritura falle, aunque alguien edite este archivo.
--
-- Lo corre el usuario, en la VPS, y pasa la salida:
--   docker exec -i ventax-facturacion-simple-prod-postgres-1 \
--     psql -U facturacion_simple -d facturacion_simple -At -F ' | ' < scripts/carga/sql/perfil-produccion.sql

begin transaction read only;

select 'facturadores_con_docs', count(distinct facturador_id) from facturas_operativas where deleted_at is null;
select 'facturadores_activos_30d', count(distinct facturador_id) from facturas_operativas where created_at > now() - interval '30 days';
select 'documentos_total', count(*), min(created_at)::date, max(created_at)::date from facturas_operativas where deleted_at is null;
select 'tamano_base', pg_size_pretty(pg_database_size(current_database()));
select 'tabla', relname, pg_size_pretty(pg_total_relation_size(relid)), n_live_tup
  from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 6;

-- Por dia y por facturador activo.
select 'docs_por_dia_30d: dias, media, p95, max',
  count(*), round(avg(c), 1), percentile_cont(0.95) within group (order by c), max(c)
  from (select created_at::date d, count(*) c from facturas_operativas where created_at > now() - interval '30 days' group by 1) t;
select 'docs_por_facturador_30d: media, p50, p95, max',
  round(avg(c), 1), percentile_cont(0.5) within group (order by c), percentile_cont(0.95) within group (order by c), max(c)
  from (select facturador_id, count(*) c from facturas_operativas where created_at > now() - interval '30 days' group by 1) t;
-- Concentracion: cuanto del volumen genera el facturador mas activo. Sin identificarlo.
select 'participacion_facturador_mayor_30d_pct', round(100.0 * max(c) / nullif(sum(c), 0), 1)
  from (select facturador_id, count(*) c from facturas_operativas where created_at > now() - interval '30 days' group by 1) t;

-- Picos: dimensionan E2 y E3.
select 'pico_por_hora: max, p99',
  max(c), percentile_cont(0.99) within group (order by c)
  from (select date_trunc('hour', created_at) h, count(*) c from facturas_operativas group by 1) t;
select 'pico_por_minuto: max', max(c)
  from (select date_trunc('minute', created_at) m, count(*) c from facturas_operativas group by 1) t;
select 'pico_por_facturador_y_hora: max', max(c)
  from (select facturador_id, date_trunc('hour', created_at) h, count(*) c from facturas_operativas group by 1, 2) t;

-- Distribucion por hora local, ultimos 90 dias.
select 'hora_local', extract(hour from created_at at time zone 'America/Asuncion')::int, count(*)
  from facturas_operativas where created_at > now() - interval '90 days' group by 2 order by 2;

-- Cola de emision. locked_at se limpia al terminar, asi que se mide de punta a punta.
select 'outbox_estado', estado, count(*) from factura_emision_outbox group by 2 order by 2;
select 'emision_seg_30d_primer_intento: p50, p95, max',
  round(percentile_cont(0.5) within group (order by e)::numeric, 1),
  round(percentile_cont(0.95) within group (order by e)::numeric, 1),
  round(max(e)::numeric, 1)
  from (select extract(epoch from updated_at - created_at) e from factura_emision_outbox
        where estado = 'DONE' and attempts = 1 and created_at > now() - interval '30 days') t;
-- H-4: trabajos que quedaron en PROCESSING hace mas de 10 minutos. Sin nada que los recupere.
select 'outbox_processing_vencidos', count(*), min(locked_at)
  from factura_emision_outbox where estado = 'PROCESSING' and locked_at < now() - interval '10 minutes';

-- Verificacion.
select 'verificacion: vencidos, agendados', count(*) filter (where verificacion_next_at <= now()), count(*) filter (where verificacion_next_at > now())
  from facturas_operativas where verificacion_next_at is not null;
select 'estado', estado, count(*) from facturas_operativas where deleted_at is null group by 2 order by 3 desc;

-- H-11: tamano de la base global de identidades que la busqueda expone entre clientes.
select 'identidades: total, con_telefono, con_email, en_agenda_de_2_o_mas',
  count(*), count(telefono), count(email),
  (select count(*) from (select cliente_identidad_id from facturador_clientes where deleted_at is null group by 1 having count(distinct facturador_id) >= 2) t)
  from cliente_identidades where deleted_at is null;

rollback;
