-- 0037: carga masiva de facturas por archivo (SPEC_CARGA_MASIVA_FACTURAS_v0.1).
--
-- Aditiva. Nada lee estas columnas hasta que CARGA_MASIVA_ENABLED este encendida, salvo
-- `numeracion_facturas`, que nace en 'SERVICIO': el comportamiento actual.

-- RN-21: forma de numerar las facturas de un contexto operativo. 'SERVICIO' = la asigna
-- facturacion-electronica. 'CLIENTE' = viene en el archivo de la carga.
alter table actividad_punto_perfiles
  add column numeracion_facturas text not null default 'SERVICIO',
  add constraint actividad_punto_perfiles_numeracion_facturas_check
    check (numeracion_facturas in ('SERVICIO', 'CLIENTE'));

-- Una fila por carga. Estado, totales y acciones son una copia de lo que informa FE,
-- para listar sin llamarlo; la fuente es FE.
create table cargas_masivas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  facturador_id uuid not null references facturadores(id),
  actividad_punto_perfil_id uuid not null references actividad_punto_perfiles(id),
  fe_carga_id text not null,
  nombre_archivo text,
  numeracion text not null,
  estado text not null,
  totales jsonb not null default '{}'::jsonb,
  acciones jsonb not null default '{}'::jsonb,
  motivos jsonb not null default '[]'::jsonb,
  subida_por uuid not null references usuarios(id),
  confirmada_por uuid references usuarios(id),
  cancelada_por uuid references usuarios(id),
  -- Mayor `actualizado_en` de comprobante ya procesado: cursor de `actualizado_desde`.
  sincronizada_hasta timestamptz,
  sincronizada_en timestamptz,
  sync_next_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cargas_masivas_numeracion_check check (numeracion in ('SERVICIO', 'CLIENTE'))
);

create unique index cargas_masivas_fe_carga_uidx
  on cargas_masivas (facturador_id, fe_carga_id);

create index cargas_masivas_facturador_created_idx
  on cargas_masivas (facturador_id, created_at desc);

create index cargas_masivas_sync_idx
  on cargas_masivas (sync_next_at)
  where sync_next_at is not null;

create trigger cargas_masivas_set_updated_at
before update on cargas_masivas
for each row execute function set_updated_at();

-- RN-12: factura creada por una carga. `carga_numero_archivo` es el numero que traia el
-- archivo; difiere de `numero_fiscal` cuando numera FE.
alter table facturas_operativas
  add column carga_masiva_id uuid references cargas_masivas(id),
  add column carga_numero_archivo text;

create index facturas_operativas_carga_masiva_idx
  on facturas_operativas (carga_masiva_id)
  where carga_masiva_id is not null;
