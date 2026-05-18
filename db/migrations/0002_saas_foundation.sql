create extension if not exists pgcrypto;

create table tenants (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text not null unique,
  estado text not null default 'ACTIVO',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint tenants_estado_check check (estado in ('ACTIVO', 'SUSPENDIDO', 'CANCELADO')),
  constraint tenants_slug_check check (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$')
);

create table planes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  descripcion text,
  max_usuarios integer not null default 1,
  max_facturadores integer not null default 1,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint planes_codigo_check check (codigo ~ '^[A-Z0-9_]+$'),
  constraint planes_max_usuarios_check check (max_usuarios > 0),
  constraint planes_max_facturadores_check check (max_facturadores > 0)
);

create table tenant_suscripciones (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  plan_id uuid not null references planes(id),
  estado text not null default 'ACTIVA',
  fecha_inicio date not null default current_date,
  fecha_fin date,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint tenant_suscripciones_estado_check check (estado in ('ACTIVA', 'SUSPENDIDA', 'CANCELADA', 'VENCIDA')),
  constraint tenant_suscripciones_fecha_check check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

create unique index tenant_suscripciones_tenant_activa_uidx
  on tenant_suscripciones (tenant_id)
  where activo = true and estado = 'ACTIVA' and deleted_at is null;

create index tenant_suscripciones_tenant_idx on tenant_suscripciones (tenant_id);
create index tenant_suscripciones_plan_idx on tenant_suscripciones (plan_id);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tenants_set_updated_at
before update on tenants
for each row execute function set_updated_at();

create trigger planes_set_updated_at
before update on planes
for each row execute function set_updated_at();

create trigger tenant_suscripciones_set_updated_at
before update on tenant_suscripciones
for each row execute function set_updated_at();

