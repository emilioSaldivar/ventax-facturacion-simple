create table catalogo_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  facturador_id uuid not null references facturadores(id),
  codigo text not null,
  codigo_normalizado text not null,
  descripcion text not null,
  precio_unitario integer not null,
  iva_tipo text not null default 'IVA_10',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references usuarios(id),
  updated_by uuid references usuarios(id),
  constraint catalogo_items_precio_unitario_check check (precio_unitario >= 0),
  constraint catalogo_items_iva_tipo_check check (iva_tipo in ('IVA_10', 'IVA_5', 'EXENTA')),
  constraint catalogo_items_codigo_check check (length(codigo_normalizado) >= 1),
  constraint catalogo_items_descripcion_check check (length(trim(descripcion)) >= 1)
);

create unique index catalogo_items_codigo_uidx
  on catalogo_items (facturador_id, codigo_normalizado)
  where deleted_at is null;

create index catalogo_items_facturador_idx on catalogo_items (facturador_id);

create index catalogo_items_descripcion_idx
  on catalogo_items using gin (to_tsvector('simple', descripcion));

create trigger catalogo_items_set_updated_at
before update on catalogo_items
for each row execute function set_updated_at();

