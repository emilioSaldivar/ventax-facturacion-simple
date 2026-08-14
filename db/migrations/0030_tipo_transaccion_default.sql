alter table actividad_punto_perfiles
  add column tipo_transaccion_default smallint not null default 2;

alter table actividad_punto_perfiles
  add constraint actividad_punto_perfiles_tipo_transaccion_default_check
  check (tipo_transaccion_default in (1, 2, 3));
