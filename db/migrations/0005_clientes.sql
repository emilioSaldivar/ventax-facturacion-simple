create table cliente_identidades (
  id uuid primary key default gen_random_uuid(),
  documento_tipo text not null,
  documento text not null,
  documento_normalizado text not null,
  razon_social text not null,
  direccion text,
  telefono text,
  email citext,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint cliente_identidades_documento_tipo_check check (
    documento_tipo in ('RUC', 'CI', 'PASAPORTE', 'CEDULA_EXTRANJERA', 'NO_ESPECIFICADO')
  ),
  constraint cliente_identidades_documento_check check (length(documento_normalizado) >= 2)
);

create unique index cliente_identidades_documento_uidx
  on cliente_identidades (documento_tipo, documento_normalizado)
  where deleted_at is null;

create index cliente_identidades_razon_social_idx
  on cliente_identidades using gin (to_tsvector('simple', razon_social));

create table facturador_clientes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  facturador_id uuid not null references facturadores(id),
  cliente_identidad_id uuid not null references cliente_identidades(id),
  razon_social text not null,
  direccion text,
  telefono text,
  email citext,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references usuarios(id),
  updated_by uuid references usuarios(id)
);

create unique index facturador_clientes_identidad_uidx
  on facturador_clientes (facturador_id, cliente_identidad_id)
  where deleted_at is null;

create index facturador_clientes_facturador_idx on facturador_clientes (facturador_id);

create index facturador_clientes_razon_social_idx
  on facturador_clientes using gin (to_tsvector('simple', razon_social));

create trigger cliente_identidades_set_updated_at
before update on cliente_identidades
for each row execute function set_updated_at();

create trigger facturador_clientes_set_updated_at
before update on facturador_clientes
for each row execute function set_updated_at();

