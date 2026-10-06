-- Segmentacion por perfil de emision: esquema.
--
-- Hasta ahora el catalogo y los documentos solo se acotaban por facturador, de modo que
-- un operador asignado a un perfil veia tambien lo de los demas perfiles del mismo
-- facturador. Estas columnas permiten acotarlos al contexto operativo
-- (actividad x establecimiento x punto x perfil) con el que se crearon.
--
-- Aditiva y sin backfill: el backfill va en 0034, separado para poder inspeccionar su
-- resultado antes de seguir.
--
-- `actividad_punto_perfil_id` es nullable en las cuatro tablas y nunca deja de serlo
-- (PLAN seccion 1.1). Un item sin perfil es compartido (RN-01) y un documento sin perfil
-- es historico y visible para todos los operadores del facturador (RN-09): son estados
-- validos, no datos faltantes. Eso tambien deja el efecto visible reversible, porque
-- poner la columna en null en todas las filas restaura el comportamiento actual sin
-- revertir el esquema.
--
-- Nada lee estas columnas todavia: hasta la fase 4 el cambio es invisible.

-- Perfil de emision
alter table catalogo_items
  add column actividad_punto_perfil_id uuid references actividad_punto_perfiles(id);
alter table facturas_operativas
  add column actividad_punto_perfil_id uuid references actividad_punto_perfiles(id);
alter table recibos_dinero
  add column actividad_punto_perfil_id uuid references actividad_punto_perfiles(id);
alter table notas_comerciales
  add column actividad_punto_perfil_id uuid references actividad_punto_perfiles(id);

-- Atribucion de usuario donde todavia no existe.
-- `facturas_operativas.usuario_id` ya existe desde 0004 y es not null, asi que su
-- historico esta completo por definicion del esquema.
alter table recibos_dinero
  add column usuario_id uuid references usuarios(id);
alter table notas_comerciales
  add column usuario_id uuid references usuarios(id);

-- Marca de atribucion retroactiva (RN-13): el backfill de 0034 atribuye los documentos
-- historicos al operador mas antiguo del facturador, que es una inferencia, no autoria
-- verificada. La UI debe poder distinguirla y no presentarla como tal.
alter table recibos_dinero
  add column usuario_atribucion_historica boolean not null default false;
alter table notas_comerciales
  add column usuario_atribucion_historica boolean not null default false;

-- Indices del filtro combinado, con la misma condicion parcial que los existentes.
-- No se elimina ninguno: `facturas_operativas_facturador_created_idx` sigue sirviendo al
-- rol de consulta, que lista por facturador sin filtrar por perfil.
create index catalogo_items_facturador_perfil_idx
  on catalogo_items (facturador_id, actividad_punto_perfil_id) where deleted_at is null;
create index facturas_operativas_facturador_perfil_created_idx
  on facturas_operativas (facturador_id, actividad_punto_perfil_id, created_at desc) where deleted_at is null;
create index recibos_dinero_facturador_perfil_idx
  on recibos_dinero (facturador_id, actividad_punto_perfil_id) where deleted_at is null;
create index notas_comerciales_facturador_perfil_idx
  on notas_comerciales (facturador_id, actividad_punto_perfil_id) where deleted_at is null;
