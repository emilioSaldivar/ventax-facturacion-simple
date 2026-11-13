-- SPEC_DIRECCION_RECEPTOR_v0.1 (FS-152): domicilio del cliente en la agenda del facturador, con los codigos de
-- geografia del MT150 que publica FE (GET /v1/parametrizaciones/geografia). Aditiva, columnas nulas, sin backfill:
-- los clientes existentes conservan su calle y quedan con el domicilio incompleto (RN-05). No se toca
-- cliente_identidades: el domicilio no se comparte entre facturadores (FS-01, FS-17).
alter table facturador_clientes
  add column if not exists numero_casa text,
  add column if not exists departamento integer,
  add column if not exists departamento_descripcion text,
  add column if not exists distrito integer,
  add column if not exists distrito_descripcion text,
  add column if not exists ciudad integer,
  add column if not exists ciudad_descripcion text;
