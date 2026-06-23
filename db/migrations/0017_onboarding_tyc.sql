-- Onboarding: cambio de contraseña obligatorio + aceptación de T&C con evidencia electrónica

-- Flag que fuerza el flujo de onboarding en el primer login
alter table usuarios
  add column if not exists must_change_password boolean not null default false;

-- Teléfono del facturador (se muestra como contexto en la pantalla de aceptación de T&C)
alter table facturadores
  add column if not exists telefono text;

-- Versiones del documento de T&C
create table if not exists tyc_versiones (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  document_hash text not null,
  document_content text not null,
  activo boolean not null default false,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Solo puede haber una versión activa a la vez
create unique index if not exists tyc_versiones_activo_uidx
  on tyc_versiones (activo)
  where activo = true;

-- Estado temporal del flujo de onboarding por usuario
create table if not exists onboarding_sessions (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  password_step_at timestamptz,
  new_password_hash text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint onboarding_sessions_expiry_check check (expires_at > created_at)
);

create unique index if not exists onboarding_sessions_usuario_uidx
  on onboarding_sessions (usuario_id);

-- Sesiones OTP para validación de aceptación de T&C
create table if not exists tyc_otp_sessions (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  otp_hash text not null,
  email_destino citext not null,
  intentos_fallidos int not null default 0,
  enviado_at timestamptz not null default now(),
  validado_at timestamptz,
  revocado_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint tyc_otp_sessions_expiry_check check (expires_at > created_at)
);

create index if not exists tyc_otp_sessions_usuario_idx on tyc_otp_sessions (usuario_id);

-- Registro inmutable de aceptaciones de T&C (solo INSERT, nunca UPDATE ni DELETE)
create table if not exists tyc_aceptaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id),
  tenant_id uuid not null references tenants(id),
  tyc_version_id uuid not null references tyc_versiones(id),

  -- Snapshots inmutables al momento de la aceptación
  tyc_version_texto text not null,
  tyc_document_hash text not null,
  plan_snapshot jsonb not null,

  -- Datos del usuario al momento de la aceptación
  username_snapshot text not null,
  email_snapshot citext,
  display_name_snapshot text,

  -- Evidencia técnica
  ip inet,
  user_agent text,
  aceptado_at timestamptz not null default now(),

  -- Checkbox
  checkbox_marcado boolean not null default true,

  -- Traza OTP
  otp_session_id uuid references tyc_otp_sessions(id),
  otp_email_destino text not null,
  otp_enviado_at timestamptz not null,
  otp_validado_at timestamptz not null,
  otp_intentos_fallidos int not null default 0,

  -- El cambio de contraseña ocurrió en este mismo flujo
  password_cambiado_en_flujo boolean not null default false
);

create index if not exists tyc_aceptaciones_usuario_idx on tyc_aceptaciones (usuario_id);
create index if not exists tyc_aceptaciones_tenant_idx on tyc_aceptaciones (tenant_id);
create index if not exists tyc_aceptaciones_version_idx on tyc_aceptaciones (tyc_version_id);
