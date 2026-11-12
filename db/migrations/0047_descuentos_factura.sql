-- SPEC_DESCUENTOS_FACTURA_v0.1 (RN-06, RN-08): descuento por unidad y parte del descuento global por linea.
-- El default 0 deja las facturas existentes sin cambio de significado.
alter table factura_items_snapshot add column if not exists descuento numeric(18, 2) not null default 0;
alter table factura_items_snapshot add column if not exists descuento_global numeric(18, 2) not null default 0;
alter table factura_items_snapshot drop constraint if exists factura_items_snapshot_descuento_check;
alter table factura_items_snapshot add constraint factura_items_snapshot_descuento_check check (descuento >= 0 and descuento_global >= 0);
