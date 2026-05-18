create table facturas_operativas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  facturador_id uuid not null references facturadores(id),
  usuario_id uuid not null references usuarios(id),
  tipo text not null default 'FACTURA',
  condicion_venta text not null,
  estado text not null default 'ERROR_OPERATIVO',
  external_ref text,
  idempotency_key text,
  cliente_snapshot jsonb not null,
  totals_snapshot jsonb not null,
  fiscal_request_snapshot jsonb,
  fiscal_response_snapshot jsonb,
  fiscal_document_id text,
  cdc text,
  numero_fiscal text,
  email_estado text,
  emitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint facturas_operativas_tipo_check check (tipo in ('FACTURA', 'NOTA_CREDITO')),
  constraint facturas_operativas_condicion_check check (condicion_venta in ('CONTADO', 'CREDITO')),
  constraint facturas_operativas_estado_check check (
    estado in ('EMITIENDO', 'PENDIENTE_SIFEN', 'EMITIDA', 'RECHAZADA', 'ERROR_TEMPORAL', 'ERROR_OPERATIVO', 'ANULADA', 'CANCELADA')
  ),
  constraint facturas_operativas_email_estado_check check (
    email_estado is null or email_estado in ('DELEGATED', 'SENT', 'FAILED', 'UNKNOWN')
  )
);

create unique index facturas_operativas_external_ref_uidx
  on facturas_operativas (facturador_id, external_ref)
  where external_ref is not null and deleted_at is null;

create unique index facturas_operativas_idempotency_uidx
  on facturas_operativas (facturador_id, idempotency_key)
  where idempotency_key is not null and deleted_at is null;

create index facturas_operativas_facturador_created_idx
  on facturas_operativas (facturador_id, created_at desc)
  where deleted_at is null;

create index facturas_operativas_estado_idx
  on facturas_operativas (facturador_id, estado)
  where deleted_at is null;

create table factura_items_snapshot (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  facturador_id uuid not null references facturadores(id),
  factura_operativa_id uuid not null references facturas_operativas(id) on delete cascade,
  catalogo_item_id uuid references catalogo_items(id),
  line_no integer not null,
  codigo text,
  descripcion text not null,
  cantidad integer not null,
  precio_unitario integer not null,
  iva_tipo text not null,
  subtotal integer not null,
  base_imponible integer not null,
  iva_monto integer not null,
  created_at timestamptz not null default now(),
  constraint factura_items_snapshot_line_no_check check (line_no > 0),
  constraint factura_items_snapshot_cantidad_check check (cantidad > 0),
  constraint factura_items_snapshot_precio_check check (precio_unitario >= 0),
  constraint factura_items_snapshot_iva_tipo_check check (iva_tipo in ('IVA_10', 'IVA_5', 'EXENTA')),
  constraint factura_items_snapshot_montos_check check (
    subtotal >= 0 and base_imponible >= 0 and iva_monto >= 0
  )
);

create unique index factura_items_snapshot_line_uidx
  on factura_items_snapshot (factura_operativa_id, line_no);

create index factura_items_snapshot_factura_idx
  on factura_items_snapshot (factura_operativa_id);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  facturador_id uuid references facturadores(id),
  usuario_id uuid references usuarios(id),
  entity_type text not null,
  entity_id uuid,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_entity_idx on audit_events (entity_type, entity_id, created_at desc);
create index audit_events_tenant_idx on audit_events (tenant_id, created_at desc);
create index audit_events_facturador_idx on audit_events (facturador_id, created_at desc);

create trigger facturas_operativas_set_updated_at
before update on facturas_operativas
for each row execute function set_updated_at();
