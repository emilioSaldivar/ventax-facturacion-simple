create table documento_links_publicos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  facturador_id uuid not null references facturadores(id),
  factura_operativa_id uuid not null references facturas_operativas(id) on delete cascade,
  token text not null,
  created_by uuid references usuarios(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint documento_links_publicos_token_length_check check (char_length(token) >= 43)
);

create unique index documento_links_publicos_token_uidx
  on documento_links_publicos (token);

create unique index documento_links_publicos_active_doc_uidx
  on documento_links_publicos (factura_operativa_id)
  where revoked_at is null;

create index documento_links_publicos_facturador_idx
  on documento_links_publicos (facturador_id, created_at desc);

create trigger documento_links_publicos_set_updated_at
before update on documento_links_publicos
for each row execute function set_updated_at();
