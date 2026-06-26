CREATE TYPE nota_tipo AS ENUM ('PRESUPUESTO', 'PEDIDO');
CREATE TYPE nota_estado AS ENUM ('BORRADOR', 'EMITIDO');
CREATE TYPE nota_fila_tipo AS ENUM ('CONTEXTO', 'ITEM', 'ITEM_SIN_PRECIO');

CREATE TABLE notas_comerciales (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facturador_id     uuid NOT NULL REFERENCES facturadores(id),
  tipo              nota_tipo NOT NULL,
  numero            integer,
  estado            nota_estado NOT NULL DEFAULT 'BORRADOR',
  fecha_emision     date,
  cliente_nombre    text NOT NULL,
  cliente_ruc       text,
  verification_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  emitido_at        timestamptz,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notas_comerciales_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_id         uuid NOT NULL REFERENCES notas_comerciales(id) ON DELETE CASCADE,
  orden           integer NOT NULL,
  fila_tipo       nota_fila_tipo NOT NULL,
  descripcion     text NOT NULL,
  cantidad        numeric(12,2),
  precio_unitario numeric(14,2),
  precio_total    numeric(14,2)
);

CREATE TABLE notas_comerciales_numeracion (
  facturador_id uuid NOT NULL REFERENCES facturadores(id),
  tipo          nota_tipo NOT NULL,
  ultimo_numero integer NOT NULL DEFAULT 0,
  PRIMARY KEY (facturador_id, tipo)
);

CREATE INDEX notas_comerciales_facturador_idx ON notas_comerciales(facturador_id) WHERE deleted_at IS NULL;
CREATE INDEX notas_comerciales_items_nota_idx ON notas_comerciales_items(nota_id);
CREATE UNIQUE INDEX notas_comerciales_verification_token_uidx ON notas_comerciales(verification_token);
