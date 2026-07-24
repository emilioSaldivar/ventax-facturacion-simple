ALTER TYPE recibo_estado ADD VALUE 'ANULADO';

ALTER TABLE recibos_dinero
  ADD COLUMN moneda text NOT NULL DEFAULT 'PYG',
  ADD COLUMN referencia_documento_uuid uuid,
  ADD COLUMN referencia_documento_numero_display text,
  ADD COLUMN external_ref text,
  ADD COLUMN idempotency_key text,
  ADD COLUMN fiscal_request_snapshot jsonb,
  ADD COLUMN fiscal_response_snapshot jsonb,
  ADD COLUMN xml_hash text,
  ADD COLUMN pdf_hash text,
  ADD COLUMN anulacion_motivo text;

CREATE UNIQUE INDEX recibos_dinero_idempotency_uidx
  ON recibos_dinero (facturador_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX recibos_dinero_external_ref_uidx
  ON recibos_dinero (facturador_id, external_ref)
  WHERE external_ref IS NOT NULL AND deleted_at IS NULL;
