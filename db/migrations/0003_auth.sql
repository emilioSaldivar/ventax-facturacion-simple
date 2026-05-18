create extension if not exists citext;

create table roles (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint roles_codigo_check check (codigo in ('OPERADOR_FACTURACION', 'SOPORTE_INTERNO', 'ADMIN_INTERNO'))
);

create table usuarios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  username citext not null,
  email citext,
  display_name text,
  password_hash text not null,
  failed_login_count integer not null default 0,
  bloqueado_at timestamptz,
  ultimo_login_at timestamptz,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint usuarios_failed_login_count_check check (failed_login_count >= 0)
);

create unique index usuarios_username_uidx
  on usuarios (username)
  where deleted_at is null;

create unique index usuarios_email_uidx
  on usuarios (email)
  where email is not null and deleted_at is null;

create index usuarios_tenant_idx on usuarios (tenant_id);

create table usuario_roles (
  usuario_id uuid not null references usuarios(id) on delete cascade,
  role_id uuid not null references roles(id),
  created_at timestamptz not null default now(),
  primary key (usuario_id, role_id)
);

create table refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  replaced_by_token_id uuid references refresh_tokens(id),
  created_at timestamptz not null default now(),
  created_by_ip inet,
  user_agent text,
  constraint refresh_tokens_expiry_check check (expires_at > created_at)
);

create index refresh_tokens_usuario_idx on refresh_tokens (usuario_id);
create index refresh_tokens_active_idx on refresh_tokens (usuario_id, expires_at)
  where revoked_at is null;

create table login_attempts (
  id uuid primary key default gen_random_uuid(),
  username citext not null,
  usuario_id uuid references usuarios(id),
  success boolean not null,
  reason text,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index login_attempts_username_created_idx on login_attempts (username, created_at desc);
create index login_attempts_usuario_created_idx on login_attempts (usuario_id, created_at desc);

insert into roles (codigo, nombre)
values
  ('OPERADOR_FACTURACION', 'Operador de facturacion'),
  ('SOPORTE_INTERNO', 'Soporte interno'),
  ('ADMIN_INTERNO', 'Administrador interno')
on conflict (codigo) do update
set
  nombre = excluded.nombre,
  activo = true;

create trigger roles_set_updated_at
before update on roles
for each row execute function set_updated_at();

create trigger usuarios_set_updated_at
before update on usuarios
for each row execute function set_updated_at();

