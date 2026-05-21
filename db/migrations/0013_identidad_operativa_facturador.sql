alter table facturador_actividades
  add column if not exists alias_operativo text;

alter table actividad_punto_perfiles
  add column if not exists alias_operativo text;
