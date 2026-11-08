-- SPEC_NOTA_CREDITO_TRABADA_v0.1, RN-02: una nota viva por factura; una nota RECHAZADA no bloquea la siguiente.
drop index if exists facturas_operativas_nce_total_uidx;

create unique index facturas_operativas_nce_total_uidx
  on facturas_operativas (facturador_id, documento_relacionado_id)
  where tipo = 'NOTA_CREDITO'
    and documento_relacionado_id is not null
    and deleted_at is null
    and estado <> 'RECHAZADA';
