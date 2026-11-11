-- SPEC_CATALOGO_MONEDA_v0.1 (RN-01, RN-02): moneda por articulo y precio con 2 decimales fuera de PYG.
-- Los articulos existentes quedan en PYG sin tocar el precio (el cast de integer a numeric no pierde datos).
alter table catalogo_items add column if not exists moneda text not null default 'PYG';
alter table catalogo_items drop constraint if exists catalogo_items_moneda_check;
alter table catalogo_items add constraint catalogo_items_moneda_check check (moneda ~ '^[A-Z]{3}$');
alter table catalogo_items alter column precio_unitario type numeric(18, 2);
alter table catalogo_items drop constraint if exists catalogo_items_precio_moneda_check;
alter table catalogo_items add constraint catalogo_items_precio_moneda_check
  check (moneda <> 'PYG' or precio_unitario = trunc(precio_unitario));
create index if not exists catalogo_items_facturador_moneda_idx on catalogo_items (facturador_id, moneda) where deleted_at is null;
