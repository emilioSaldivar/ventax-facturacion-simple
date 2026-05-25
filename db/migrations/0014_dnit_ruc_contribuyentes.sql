create table if not exists dnit_ruc_contribuyentes (
  id bigserial primary key,
  ruc_sin_dv varchar(20) not null,
  dv varchar(2) not null,
  ruc varchar(30) generated always as (ruc_sin_dv || '-' || dv) stored,
  nombre text,
  apellido text,
  razon_social text not null,
  codigo_dnit varchar(50),
  estado varchar(50),
  fuente_archivo varchar(120),
  fecha_importacion timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_dnit_ruc unique (ruc_sin_dv, dv)
);

create table if not exists dnit_ruc_contribuyentes_staging (
  id bigserial primary key,
  ruc_sin_dv varchar(20) not null,
  dv varchar(2) not null,
  nombre text,
  apellido text,
  razon_social text not null,
  codigo_dnit varchar(50),
  estado varchar(50),
  fuente_archivo varchar(120),
  fecha_importacion timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_dnit_ruc on dnit_ruc_contribuyentes (ruc);
create index if not exists idx_dnit_ruc_sin_dv on dnit_ruc_contribuyentes (ruc_sin_dv);
create index if not exists idx_dnit_estado on dnit_ruc_contribuyentes (estado);
create index if not exists idx_dnit_razon_social_tsv on dnit_ruc_contribuyentes using gin (to_tsvector('simple', razon_social));
