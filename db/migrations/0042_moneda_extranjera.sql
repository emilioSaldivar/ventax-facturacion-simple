-- SPEC_MONEDA_EXTRANJERA_v0.1 (PLAN 2): factura en moneda extranjera. Los montos de las lineas pasan a 2 decimales;
-- el cast desde entero no pierde nada.
alter table facturas_operativas add column if not exists moneda text not null default 'PYG';
alter table facturas_operativas add column if not exists tipo_cambio numeric(18, 4);
alter table facturas_operativas drop constraint if exists facturas_operativas_moneda_check;
alter table facturas_operativas add constraint facturas_operativas_moneda_check check (moneda ~ '^[A-Z]{3}$');

alter table factura_items_snapshot alter column precio_unitario type numeric(18, 2);
alter table factura_items_snapshot alter column subtotal type numeric(18, 2);
alter table factura_items_snapshot alter column base_imponible type numeric(18, 2);
alter table factura_items_snapshot alter column iva_monto type numeric(18, 2);
