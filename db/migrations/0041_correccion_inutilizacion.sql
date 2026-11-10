-- SPEC_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1.
--
-- Fase A: una factura corregida apunta a la rechazada con `documento_relacionado_id`, la misma
-- columna que usan las notas de credito. Una factura tiene a lo sumo una correccion (RN-A3).
-- Fase B: resultado del ultimo intento de inutilizar el numero, como `0032_cancelacion_resultado`.
--
-- Aditivas y nullable: los documentos existentes no cambian.

create unique index facturas_operativas_correccion_uidx
  on facturas_operativas (facturador_id, documento_relacionado_id)
  where tipo = 'FACTURA'
    and documento_relacionado_id is not null
    and deleted_at is null;

alter table facturas_operativas
  add column inutilizacion_status text,
  add column inutilizacion_evento_id text,
  add column inutilizacion_motivo text,
  add column inutilizacion_rejection_code text,
  add column inutilizacion_rejection_message text,
  add column inutilizacion_intentos integer not null default 0,
  add column inutilizacion_last_at timestamptz,
  add column inutilizacion_usuario_id uuid references usuarios(id);

alter table facturas_operativas
  add constraint facturas_operativas_inutilizacion_status_check
    check (inutilizacion_status is null or inutilizacion_status in ('ACCEPTED', 'REJECTED', 'FAILED')),
  add constraint facturas_operativas_inutilizacion_intentos_check
    check (inutilizacion_intentos >= 0);
