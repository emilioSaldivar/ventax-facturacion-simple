-- SPEC_NOTA_CREDITO_PARCIAL_v0.1, RN-06: una factura admite varias notas de credito vivas (parciales) hasta cubrir
-- su total. El indice unico de 0038 (una nota viva por factura) hacia que la segunda parcial, ya emitida en FE,
-- no se guardara: el repositorio devolvia la primera. La regla "la total solo sin notas vivas" (RN-07) queda en el
-- servicio, y el tope por importe lo controla FE (CREDIT_NOTE_TOTAL_EXCEEDED, SIFEN 2417).
drop index if exists facturas_operativas_nce_total_uidx;

create index if not exists facturas_operativas_nce_relacionado_idx
  on facturas_operativas (facturador_id, documento_relacionado_id)
  where tipo = 'NOTA_CREDITO'
    and documento_relacionado_id is not null
    and deleted_at is null;
