alter table facturas_operativas
  add column document_uuid text;

create index facturas_operativas_document_uuid_idx
  on facturas_operativas (facturador_id, document_uuid)
  where document_uuid is not null and deleted_at is null;
