CREATE TYPE recibo_estado AS ENUM ('BORRADOR', 'EMITIDO');
CREATE TYPE recibo_forma_pago AS ENUM (
  'EFECTIVO', 'TRANSFERENCIA', 'CHEQUE',
  'TARJETA_CREDITO', 'TARJETA_DEBITO', 'OTRO'
);

CREATE TABLE recibos_dinero (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facturador_id          uuid NOT NULL REFERENCES facturadores(id),
  numero                 integer,
  estado                 recibo_estado NOT NULL DEFAULT 'BORRADOR',
  fecha_cobro            date NOT NULL,
  pagador_nombre         text NOT NULL,
  pagador_documento_tipo text,
  pagador_documento      text,
  concepto               text NOT NULL,
  importe                numeric(14,2) NOT NULL CHECK (importe > 0),
  forma_pago             recibo_forma_pago NOT NULL DEFAULT 'EFECTIVO',
  referencia_bancaria    text,
  factura_id             uuid REFERENCES facturas_operativas(id),
  factura_numero_display text,
  verification_token     uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  emitido_at             timestamptz,
  deleted_at             timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recibos_dinero_numeracion (
  facturador_id uuid PRIMARY KEY REFERENCES facturadores(id),
  ultimo_numero integer NOT NULL DEFAULT 0
);

CREATE INDEX recibos_dinero_facturador_idx ON recibos_dinero(facturador_id) WHERE deleted_at IS NULL;
CREATE INDEX recibos_dinero_factura_idx    ON recibos_dinero(factura_id)    WHERE factura_id IS NOT NULL;
CREATE UNIQUE INDEX recibos_dinero_token_uidx ON recibos_dinero(verification_token);
