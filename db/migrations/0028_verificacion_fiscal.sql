-- F9 Verificacion Fiscal Automatica (SPEC_BACKOFFICE_ALINEACION_FE_v0.2, seccion 2.2).
-- Columnas estructuradas del ultimo estado SIFEN conocido + agenda del worker de
-- verificacion. Hoy el codigo/mensaje SIFEN solo viven dentro del JSON
-- fiscal_response_snapshot y no hay marca de ultima verificacion.

ALTER TABLE facturas_operativas
  ADD COLUMN IF NOT EXISTS fiscal_status_raw text,
  ADD COLUMN IF NOT EXISTS sifen_result_code text,
  ADD COLUMN IF NOT EXISTS sifen_result_message text,
  ADD COLUMN IF NOT EXISTS sifen_last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS verificacion_next_at timestamptz,
  ADD COLUMN IF NOT EXISTS verificacion_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accion_notificada_at timestamptz;

-- Indice para el claim del worker (patron outbox: estado en transito + agenda vencida).
CREATE INDEX IF NOT EXISTS facturas_operativas_verificacion_idx
  ON facturas_operativas (verificacion_next_at)
  WHERE estado IN ('PENDIENTE_SIFEN', 'EMITIENDO')
    AND deleted_at IS NULL
    AND document_uuid IS NOT NULL;

-- Backfill: los documentos ya en transito entran a la agenda inmediatamente
-- (el worker les aplica el backoff desde su primer intento).
UPDATE facturas_operativas
SET verificacion_next_at = now()
WHERE estado IN ('PENDIENTE_SIFEN', 'EMITIENDO')
  AND deleted_at IS NULL
  AND document_uuid IS NOT NULL
  AND verificacion_next_at IS NULL;

-- Correo administrativo del tenant para notificaciones de accion fiscal
-- (destinatario (b) de SPEC v0.2 seccion 2.9).
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS email_administrativo citext;
