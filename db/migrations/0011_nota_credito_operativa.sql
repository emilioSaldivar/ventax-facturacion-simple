alter table facturas_operativas
  add column documento_relacionado_id uuid references facturas_operativas(id),
  add column nce_motivo text;

create unique index facturas_operativas_nce_total_uidx
  on facturas_operativas (facturador_id, documento_relacionado_id)
  where tipo = 'NOTA_CREDITO'
    and documento_relacionado_id is not null
    and deleted_at is null;

create index facturas_operativas_documento_relacionado_idx
  on facturas_operativas (documento_relacionado_id)
  where documento_relacionado_id is not null
    and deleted_at is null;
