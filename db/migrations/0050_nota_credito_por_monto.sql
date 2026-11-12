-- SPEC_NOTA_CREDITO_POR_MONTO_v0.1, RN-07: modo de la nota de credito (TOTAL, LINEAS o MONTO) y motivo SIFEN (E401).
-- Las notas por monto llevan lineas por tasa (no articulos de la factura): el saldo por lineas no las cuenta y el
-- reintento de una trabada repite sus lineas y su motivo. null en las notas anteriores (se leen como antes).
alter table facturas_operativas add column if not exists nce_modo text;
alter table facturas_operativas add column if not exists nce_motivo_codigo smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'facturas_operativas_nce_modo_chk') then
    alter table facturas_operativas
      add constraint facturas_operativas_nce_modo_chk check (nce_modo is null or nce_modo in ('TOTAL', 'LINEAS', 'MONTO'));
  end if;
end $$;
