-- Consultas de control del backfill de segmentacion (0034), SEG-010.
--
-- Solo lectura. Se ejecutan despues de aplicar 0034 en cada entorno y su resultado se
-- registra en docs/TASKS_SEGMENTACION_PERFIL_EMISION_v0.1.md.
--
--   docker exec <postgres> psql -U <user> -d <db> -f /ruta/verificar_backfill_segmentacion.sql
-- o bien copiando y pegando los bloques.

\echo '== 1. Cobertura por facturador: cuanto quedo sin perfil =='
select fa.ruc,
       'facturas' as tabla,
       count(*) as total,
       count(d.actividad_punto_perfil_id) as con_perfil,
       count(*) - count(d.actividad_punto_perfil_id) as sin_perfil
  from facturas_operativas d
  join facturadores fa on fa.id = d.facturador_id
 where d.deleted_at is null
 group by 1, 2
union all
select fa.ruc, 'recibos', count(*), count(d.actividad_punto_perfil_id),
       count(*) - count(d.actividad_punto_perfil_id)
  from recibos_dinero d join facturadores fa on fa.id = d.facturador_id
 where d.deleted_at is null group by 1, 2
union all
select fa.ruc, 'presupuestos', count(*), count(d.actividad_punto_perfil_id),
       count(*) - count(d.actividad_punto_perfil_id)
  from notas_comerciales d join facturadores fa on fa.id = d.facturador_id
 where d.deleted_at is null group by 1, 2
 order by 1, 2;

\echo ''
\echo '== 2. INVARIANTE: ningun documento asignado al contexto de otro facturador (debe dar 0) =='
select 'facturas' as tabla, count(*) as fugas
  from facturas_operativas d
  join actividad_punto_perfiles app on app.id = d.actividad_punto_perfil_id
 where app.facturador_id <> d.facturador_id
union all
select 'recibos', count(*) from recibos_dinero d
  join actividad_punto_perfiles app on app.id = d.actividad_punto_perfil_id
 where app.facturador_id <> d.facturador_id
union all
select 'presupuestos', count(*) from notas_comerciales d
  join actividad_punto_perfiles app on app.id = d.actividad_punto_perfil_id
 where app.facturador_id <> d.facturador_id;

\echo ''
\echo '== 3. INVARIANTE: el catalogo no se toco, todos los items quedan compartidos (debe dar 0) =='
select count(*) as items_con_perfil
  from catalogo_items where actividad_punto_perfil_id is not null;

\echo ''
\echo '== 4. INVARIANTE: la tupla exacta coincide con lo asignado (debe dar 0 discrepancias) =='
select count(*) as discrepancias
  from facturas_operativas f
  join actividad_punto_perfiles app on app.id = f.actividad_punto_perfil_id
  join facturador_establecimientos e  on e.id  = app.establecimiento_id
  join facturador_puntos_expedicion p on p.id  = app.punto_expedicion_id
 where f.deleted_at is null
   and f.fiscal_request_snapshot -> 'fiscal_context' ->> 'establecimiento' is not null
   and (e.codigo <> f.fiscal_request_snapshot -> 'fiscal_context' ->> 'establecimiento'
        or p.codigo <> f.fiscal_request_snapshot -> 'fiscal_context' ->> 'punto_expedicion');

\echo ''
\echo '== 5. Atribucion de usuario en recibos y presupuestos =='
select 'recibos' as tabla, count(*) as total, count(usuario_id) as con_usuario,
       count(*) filter (where usuario_atribucion_historica) as historica
  from recibos_dinero where deleted_at is null
union all
select 'presupuestos', count(*), count(usuario_id),
       count(*) filter (where usuario_atribucion_historica)
  from notas_comerciales where deleted_at is null;

\echo ''
\echo '== 6. Documentos en un contexto sin operador asignado (RN-23: no los vera ningun operador) =='
select fa.ruc, pe.codigo as perfil, app.activo, count(*) as documentos
  from facturas_operativas f
  join actividad_punto_perfiles app on app.id = f.actividad_punto_perfil_id
  join facturadores fa on fa.id = f.facturador_id
  join facturador_perfiles_emision pe on pe.id = app.perfil_emision_id
 where f.deleted_at is null
   and not exists (
     select 1 from usuario_operacion_config uoc
       join usuarios u on u.id = uoc.usuario_id and u.activo and u.deleted_at is null
      where uoc.actividad_punto_perfil_id = app.id and uoc.deleted_at is null and uoc.activo)
 group by 1, 2, 3 order by 1, 2;
