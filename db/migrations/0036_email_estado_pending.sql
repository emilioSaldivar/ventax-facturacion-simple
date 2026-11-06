-- 0036: email_estado admite PENDING (SPEC_CONTRATO_FE_SOBRECARGA_v0.1 RN-03).
alter table facturas_operativas drop constraint if exists facturas_operativas_email_estado_check;
alter table facturas_operativas add constraint facturas_operativas_email_estado_check check (
  email_estado is null or email_estado in ('DELEGATED', 'PENDING', 'SENT', 'FAILED', 'UNKNOWN')
);
