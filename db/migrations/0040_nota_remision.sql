-- SPEC_DOCUMENTOS_ESCRITORIO_v0.1, fase B1: notas de remision incorporadas desde la carga masiva.
-- Una nota de remision no tiene condicion de venta ni montos.
alter table facturas_operativas drop constraint if exists facturas_operativas_tipo_check;
alter table facturas_operativas
  add constraint facturas_operativas_tipo_check check (tipo in ('FACTURA', 'NOTA_CREDITO', 'NOTA_REMISION'));

alter table facturas_operativas alter column condicion_venta drop not null;
alter table facturas_operativas drop constraint if exists facturas_operativas_condicion_check;
alter table facturas_operativas
  add constraint facturas_operativas_condicion_check check (condicion_venta is null or condicion_venta in ('CONTADO', 'CREDITO'));

alter table cargas_masivas add column if not exists tipo_documento text not null default 'FACTURA';
alter table cargas_masivas drop constraint if exists cargas_masivas_tipo_documento_check;
alter table cargas_masivas
  add constraint cargas_masivas_tipo_documento_check check (tipo_documento in ('FACTURA', 'NOTA_REMISION'));
