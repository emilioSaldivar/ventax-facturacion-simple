create index if not exists cliente_identidades_documento_normalizado_idx
  on cliente_identidades (documento_normalizado)
  where deleted_at is null;

create index if not exists facturador_clientes_facturador_identidad_active_idx
  on facturador_clientes (facturador_id, cliente_identidad_id)
  where deleted_at is null and activo = true;

create index if not exists facturador_clientes_facturador_razon_social_idx
  on facturador_clientes (facturador_id, razon_social)
  where deleted_at is null;

create index if not exists catalogo_items_facturador_codigo_active_idx
  on catalogo_items (facturador_id, codigo_normalizado)
  where deleted_at is null and activo = true;

create index if not exists catalogo_items_facturador_descripcion_idx
  on catalogo_items (facturador_id, descripcion)
  where deleted_at is null;
