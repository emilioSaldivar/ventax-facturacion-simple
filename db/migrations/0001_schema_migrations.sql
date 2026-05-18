create table if not exists schema_migrations (
  version text primary key,
  name text not null,
  filename text not null,
  checksum text not null,
  applied_at timestamptz not null default now()
);

