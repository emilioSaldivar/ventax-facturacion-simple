-- SPEC_NOTA_CREDITO_UNIFICADA_v0.1 (PLAN 2, RN-06). Una nota combinada puede tener varias lineas que vienen del mismo
-- item de la factura (una devolucion y una acreditacion): el `line_no` de la nota pasa a ser correlativo y la linea
-- de la factura va en `linea_factura`; `origen_nc` dice de donde salio cada linea. null en notas y facturas anteriores.
alter table factura_items_snapshot add column if not exists linea_factura integer;
alter table factura_items_snapshot add column if not exists origen_nc text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'factura_items_snapshot_origen_nc_chk') then
    alter table factura_items_snapshot
      add constraint factura_items_snapshot_origen_nc_chk
      check (origen_nc is null or origen_nc in ('DEVOLUCION', 'ACREDITACION_LINEA', 'ACREDITACION_TOTAL'));
  end if;
  -- nce_modo gana COMBINADA.
  if exists (select 1 from pg_constraint where conname = 'facturas_operativas_nce_modo_chk') then
    alter table facturas_operativas drop constraint facturas_operativas_nce_modo_chk;
  end if;
  alter table facturas_operativas
    add constraint facturas_operativas_nce_modo_chk
    check (nce_modo is null or nce_modo in ('TOTAL', 'LINEAS', 'MONTO', 'COMBINADA'));
end $$;
