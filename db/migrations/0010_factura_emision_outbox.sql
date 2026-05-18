create table factura_emision_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  facturador_id uuid not null references facturadores(id),
  factura_operativa_id uuid not null references facturas_operativas(id) on delete cascade,
  estado text not null default 'PENDING',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint factura_emision_outbox_estado_check check (
    estado in ('PENDING', 'PROCESSING', 'DONE', 'FAILED_TEMP', 'FAILED_PERM')
  ),
  constraint factura_emision_outbox_attempts_check check (attempts >= 0)
);

create unique index factura_emision_outbox_factura_uidx
  on factura_emision_outbox (factura_operativa_id);

create index factura_emision_outbox_pending_idx
  on factura_emision_outbox (estado, next_attempt_at, created_at)
  where estado in ('PENDING', 'FAILED_TEMP');

create trigger factura_emision_outbox_set_updated_at
before update on factura_emision_outbox
for each row execute function set_updated_at();
