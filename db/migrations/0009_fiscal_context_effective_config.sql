alter table actividad_punto_perfiles
  add column timbrado text,
  add column timbrado_inicio date,
  add column documento_nro text,
  add column credito_plazo_dias integer not null default 30;

alter table actividad_punto_perfiles
  add constraint actividad_punto_perfiles_timbrado_check
    check (timbrado is null or timbrado ~ '^[0-9]+$'),
  add constraint actividad_punto_perfiles_documento_nro_check
    check (documento_nro is null or documento_nro ~ '^[0-9]{7}$'),
  add constraint actividad_punto_perfiles_credito_plazo_check
    check (credito_plazo_dias > 0);
