-- F0 (SPEC_BACKOFFICE_ALINEACION_FE_v0.2, seccion 0.1): el check de 0007 permite
-- 'CANCELADA' pero el codigo escribe 'CANCELADO_LOCAL' (DocumentoEstado en
-- facturas.types.ts, cancel-send en facturas.service.ts) — la transicion viola el
-- constraint en Postgres real. 'CANCELADA' nunca fue alcanzable desde el codigo;
-- se migra defensivamente por si existiera alguna fila historica.
UPDATE facturas_operativas SET estado = 'CANCELADO_LOCAL' WHERE estado = 'CANCELADA';

ALTER TABLE facturas_operativas DROP CONSTRAINT facturas_operativas_estado_check;
ALTER TABLE facturas_operativas ADD CONSTRAINT facturas_operativas_estado_check CHECK (
  estado IN ('EMITIENDO', 'PENDIENTE_SIFEN', 'EMITIDA', 'RECHAZADA', 'ERROR_TEMPORAL', 'ERROR_OPERATIVO', 'ANULADA', 'CANCELADO_LOCAL')
);
