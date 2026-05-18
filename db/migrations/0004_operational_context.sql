create table facturadores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  emisor_id text not null,
  razon_social text not null,
  ruc text not null,
  nombre_fantasia text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index facturadores_tenant_emisor_uidx
  on facturadores (tenant_id, emisor_id)
  where deleted_at is null;

create index facturadores_tenant_idx on facturadores (tenant_id);

create table facturador_establecimientos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  facturador_id uuid not null references facturadores(id),
  codigo text not null,
  nombre text,
  direccion text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint facturador_establecimientos_codigo_check check (codigo ~ '^[0-9]{3}$')
);

create unique index facturador_establecimientos_codigo_uidx
  on facturador_establecimientos (facturador_id, codigo)
  where deleted_at is null;

create table facturador_puntos_expedicion (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  facturador_id uuid not null references facturadores(id),
  establecimiento_id uuid not null references facturador_establecimientos(id),
  codigo text not null,
  nombre text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint facturador_puntos_codigo_check check (codigo ~ '^[0-9]{3}$')
);

create unique index facturador_puntos_codigo_uidx
  on facturador_puntos_expedicion (establecimiento_id, codigo)
  where deleted_at is null;

create table facturador_actividades (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  facturador_id uuid not null references facturadores(id),
  codigo text not null,
  descripcion text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index facturador_actividades_codigo_uidx
  on facturador_actividades (facturador_id, codigo)
  where deleted_at is null;

create table facturador_perfiles_emision (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  facturador_id uuid not null references facturadores(id),
  codigo text not null,
  descripcion text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index facturador_perfiles_codigo_uidx
  on facturador_perfiles_emision (facturador_id, codigo)
  where deleted_at is null;

create table actividad_punto_perfiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  facturador_id uuid not null references facturadores(id),
  actividad_id uuid not null references facturador_actividades(id),
  establecimiento_id uuid not null references facturador_establecimientos(id),
  punto_expedicion_id uuid not null references facturador_puntos_expedicion(id),
  perfil_emision_id uuid not null references facturador_perfiles_emision(id),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index actividad_punto_perfiles_uidx
  on actividad_punto_perfiles (actividad_id, establecimiento_id, punto_expedicion_id, perfil_emision_id)
  where deleted_at is null;

create table usuario_operacion_config (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  usuario_id uuid not null references usuarios(id),
  facturador_id uuid not null references facturadores(id),
  actividad_punto_perfil_id uuid not null references actividad_punto_perfiles(id),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index usuario_operacion_config_usuario_activa_uidx
  on usuario_operacion_config (usuario_id)
  where activo = true and deleted_at is null;

create index usuario_operacion_config_facturador_idx on usuario_operacion_config (facturador_id);

create trigger facturadores_set_updated_at
before update on facturadores
for each row execute function set_updated_at();

create trigger facturador_establecimientos_set_updated_at
before update on facturador_establecimientos
for each row execute function set_updated_at();

create trigger facturador_puntos_expedicion_set_updated_at
before update on facturador_puntos_expedicion
for each row execute function set_updated_at();

create trigger facturador_actividades_set_updated_at
before update on facturador_actividades
for each row execute function set_updated_at();

create trigger facturador_perfiles_emision_set_updated_at
before update on facturador_perfiles_emision
for each row execute function set_updated_at();

create trigger actividad_punto_perfiles_set_updated_at
before update on actividad_punto_perfiles
for each row execute function set_updated_at();

create trigger usuario_operacion_config_set_updated_at
before update on usuario_operacion_config
for each row execute function set_updated_at();

