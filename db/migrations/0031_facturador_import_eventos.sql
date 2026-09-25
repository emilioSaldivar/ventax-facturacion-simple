-- Auditoria de imports de configuracion fiscal aplicados.
--
-- Justificacion (SPEC_IMPORT_CONFIG_FACTURADOR_v0.1 seccion 7): el re-import puede
-- actualizar el timbrado de contextos productivos. Sin traza no hay forma de auditar
-- que archivo produjo que cambio, ni quien lo aplico.
--
-- El archivo no contiene secretos: el generador de FE nunca emite siguiente_numero,
-- CSC, certificados ni claves, asi que se guarda integro.

create table facturador_import_eventos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  facturador_id uuid references facturadores(id),
  usuario_id uuid references usuarios(id),
  archivo_nombre text not null,
  archivo_formato text not null,
  contrato_version text not null,
  generado_en text,
  -- Registro del override explicito de ambiente (RN-16).
  ambiente_forzado boolean not null default false,
  -- Documento desenvuelto (sin los wrappers {valor, referencia}).
  payload jsonb not null,
  -- ImportDiff efectivamente aplicado.
  resumen jsonb not null,
  created_at timestamptz not null default now(),
  constraint facturador_import_eventos_formato_check check (archivo_formato in ('json', 'yaml'))
);

create index facturador_import_eventos_facturador_idx
  on facturador_import_eventos (facturador_id, created_at desc);

create index facturador_import_eventos_tenant_idx
  on facturador_import_eventos (tenant_id, created_at desc);
