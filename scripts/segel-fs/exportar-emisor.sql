-- Configuracion de un emisor de FE, sin certificado ni CSC, para cargar-facturador.py.
-- Solo lectura. Uso: psql -At -v ruc=5057016-1 -f exportar-emisor.sql
select json_build_object(
 'emisor',(select row_to_json(e) from (select ruc_base, ruc_dv, ruc_completo, razon_social, nombre_fantasia, tipo_contribuyente, tipo_regimen from emisores where ruc_completo = :'ruc') e),
 'act',(select json_agg(json_build_object('id',a.id,'codigo_actividad',a.codigo_actividad,'descripcion_actividad',a.descripcion_actividad,'es_principal',a.es_principal,'activo',a.activo)) from emisor_actividades a join emisores e on e.id=a.emisor_id where e.ruc_completo = :'ruc'),
 'est',(select json_agg(a) from establecimientos a join emisores e on e.id=a.emisor_id where e.ruc_completo = :'ruc'),
 'pun',(select json_agg(p) from puntos_expedicion p join establecimientos a on a.id=p.establecimiento_id join emisores e on e.id=a.emisor_id where e.ruc_completo = :'ruc'),
 'tim',(select json_agg(a) from emisor_timbrados a join emisores e on e.id=a.emisor_id where e.ruc_completo = :'ruc'),
 'num',(select json_agg(a) from numeradores_documentos a join emisores e on e.id=a.emisor_id where e.ruc_completo = :'ruc'),
 'cob',(select json_agg(a) from emisor_timbrado_actividades a join emisores e on e.id=a.emisor_id where e.ruc_completo = :'ruc'),
 'per',(select json_agg(a) from emisor_perfiles_emision a join emisores e on e.id=a.emisor_id where e.ruc_completo = :'ruc')
);
