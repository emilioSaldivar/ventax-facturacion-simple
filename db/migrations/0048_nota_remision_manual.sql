-- SPEC_NOTA_REMISION_v0.1 (RN-01, RN-06, RN-07): nota de remision emitida desde la app.
-- Permisos de la clave de consumidor de FE, tomados del export de configuracion (consumidor[].permisos).
alter table facturadores add column if not exists fe_consumer_permisos jsonb not null default '[]'::jsonb;

-- Domicilio codificado del cliente (codigos y descripciones de la geografia de FE, con su version).
alter table facturador_clientes add column if not exists domicilio jsonb;

-- Datos reutilizables por facturador (las listas se usan desde la entrega E2).
create table if not exists remision_transportistas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  facturador_id uuid not null references facturadores(id),
  naturaleza text not null,
  nombre text not null,
  ruc text,
  tipo_documento integer,
  doc_nro text,
  domicilio_fiscal text not null,
  chofer_nombre text not null,
  chofer_doc_nro text not null,
  chofer_direccion text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references usuarios(id),
  updated_by uuid references usuarios(id),
  constraint remision_transportistas_naturaleza_check check (naturaleza in ('CONTRIBUYENTE', 'NO_CONTRIBUYENTE')),
  constraint remision_transportistas_tipo_documento_check check (tipo_documento is null or tipo_documento between 1 and 4),
  constraint remision_transportistas_nombre_check check (length(trim(nombre)) between 4 and 60)
);
create index if not exists remision_transportistas_facturador_idx on remision_transportistas (facturador_id) where deleted_at is null;

create table if not exists remision_vehiculos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  facturador_id uuid not null references facturadores(id),
  tipo text not null,
  marca text not null,
  tipo_identificacion integer not null,
  numero_identificacion text,
  matricula text,
  modalidad integer not null default 1,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references usuarios(id),
  updated_by uuid references usuarios(id),
  constraint remision_vehiculos_tipo_identificacion_check check (tipo_identificacion in (1, 2)),
  constraint remision_vehiculos_modalidad_check check (modalidad between 1 and 4)
);
create index if not exists remision_vehiculos_facturador_idx on remision_vehiculos (facturador_id) where deleted_at is null;

create table if not exists remision_locales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  facturador_id uuid not null references facturadores(id),
  nombre text not null,
  direccion text not null,
  numero_casa text not null,
  departamento integer not null,
  departamento_descripcion text,
  distrito integer,
  distrito_descripcion text,
  ciudad integer not null,
  ciudad_descripcion text,
  complemento1 text,
  complemento2 text,
  telefono text,
  uso text not null default 'AMBOS',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_by uuid references usuarios(id),
  updated_by uuid references usuarios(id),
  constraint remision_locales_uso_check check (uso in ('SALIDA', 'ENTREGA', 'AMBOS'))
);
create index if not exists remision_locales_facturador_idx on remision_locales (facturador_id) where deleted_at is null;

create trigger remision_transportistas_set_updated_at before update on remision_transportistas for each row execute function set_updated_at();
create trigger remision_vehiculos_set_updated_at before update on remision_vehiculos for each row execute function set_updated_at();
create trigger remision_locales_set_updated_at before update on remision_locales for each row execute function set_updated_at();
