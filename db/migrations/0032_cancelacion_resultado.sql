-- Resultado del ultimo intento de cancelacion fiscal.
--
-- Hasta ahora solo se guardaba el `estado` derivado, y como el mapeo no conocia ACCEPTED ni
-- REJECTED, una cancelacion aceptada y una rechazada quedaban igual (PENDIENTE_SIFEN).
-- Estas columnas preservan lo que FE respondio, que es lo que permite decidir si se reintenta.
--
-- Aditivas y nullable: los documentos existentes no cambian.

alter table facturas_operativas
  add column cancelacion_status text,
  add column cancelacion_rejection_code text,
  add column cancelacion_rejection_message text,
  add column cancelacion_retryable boolean,
  add column cancelacion_intentos integer not null default 0,
  add column cancelacion_last_at timestamptz;

alter table facturas_operativas
  add constraint facturas_operativas_cancelacion_status_check
    check (cancelacion_status is null
           or cancelacion_status in ('PENDING', 'ACCEPTED', 'REJECTED', 'FAILED', 'UNKNOWN')),
  add constraint facturas_operativas_cancelacion_intentos_check
    check (cancelacion_intentos >= 0);

-- Soporta la reconciliacion de PF-018: documentos con intento de cancelacion sin resolver.
create index facturas_operativas_cancelacion_pendiente_idx
  on facturas_operativas (facturador_id, cancelacion_last_at desc)
  where cancelacion_status is not null
    and cancelacion_status <> 'ACCEPTED'
    and deleted_at is null;
