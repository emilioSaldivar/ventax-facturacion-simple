-- Ajuste manual para bases existentes.
-- Reemplazar los placeholders por los valores reales del emisor.

BEGIN;

UPDATE emisor_certificados cert
SET
  password_value = '<PASSWORD_REAL_DEL_CERTIFICADO>',
  updated_at = NOW()
FROM emisores e
WHERE cert.emisor_id = e.id
  AND e.ruc_completo = '80136968-1'
  AND cert.activo = TRUE;

UPDATE emisor_csc csc
SET
  csc_value = '<CSC_REAL_DEL_EMISOR>',
  updated_at = NOW()
FROM emisores e
WHERE csc.emisor_id = e.id
  AND e.ruc_completo = '80136968-1'
  AND csc.ambiente = 'test'
  AND csc.activo = TRUE;

COMMIT;
