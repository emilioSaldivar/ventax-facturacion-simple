-- backfill_document_uuid.sql
-- Pobla facturas_operativas.document_uuid usando el mapeo exportado de de_documents
-- en el backend fiscal.
--
-- Prerequisito: la columna document_uuid ya debe existir (migration 0015_document_uuid.sql).
--
-- Uso:
--   1. Exportar el CSV del backend fiscal:
--      SELECT cdc, document_uuid
--      FROM de_documents
--      WHERE cdc IS NOT NULL AND document_uuid IS NOT NULL
--      ORDER BY created_at;
--
--   2. Conectar a la DB del SaaS y ejecutar:
--      psql $DATABASE_URL -f scripts/backfill_document_uuid.sql
--
--   3. Cuando psql pida el path del CSV en el paso COPY, ingresar la ruta absoluta.
--      Alternativa: reemplazar el \COPY con un bloque INSERT VALUES generado del CSV.
--
-- El script es idempotente: solo actualiza registros con document_uuid IS NULL.
-- Se puede ejecutar varias veces sin efecto adverso.

BEGIN;

CREATE TEMP TABLE _uuid_backfill (
  cdc           TEXT PRIMARY KEY,
  document_uuid TEXT NOT NULL
) ON COMMIT DROP;

-- Cargar el CSV. Ajustar la ruta al archivo exportado del backend fiscal.
-- Ejecutar este comando manualmente antes de continuar con el UPDATE:
--
--   \COPY _uuid_backfill (cdc, document_uuid) FROM '/ruta/al/backfill.csv' CSV HEADER;
--
-- Si se prefiere sin psql interactivo, generar INSERT VALUES desde el CSV y
-- reemplazar el bloque \COPY por los inserts directamente en este script.

-- UPDATE principal — solo toca registros sin document_uuid
UPDATE facturas_operativas fo
SET
  document_uuid = b.document_uuid,
  updated_at    = now()
FROM _uuid_backfill b
WHERE fo.cdc = b.cdc
  AND fo.document_uuid IS NULL
  AND fo.deleted_at IS NULL;

-- Consulta de verificacion de cobertura
-- El campo sin_uuid_con_cdc debe ser 0 antes de aprobar el deploy.
SELECT
  COUNT(*)                                                           AS total_documentos,
  COUNT(*) FILTER (WHERE document_uuid IS NOT NULL)                 AS con_uuid,
  COUNT(*) FILTER (WHERE document_uuid IS NULL AND cdc IS NOT NULL) AS sin_uuid_con_cdc,
  COUNT(*) FILTER (WHERE document_uuid IS NULL AND cdc IS NULL)     AS sin_uuid_sin_cdc
FROM facturas_operativas
WHERE deleted_at IS NULL;

COMMIT;
