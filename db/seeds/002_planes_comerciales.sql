-- Planes comerciales disponibles en el selector de creación de tenants.
-- El frontend carga estos dinámicamente desde GET /backoffice/planes,
-- por lo que agregar un nuevo plan aquí lo hace aparecer automáticamente en la UI.
insert into planes (codigo, nombre, descripcion, max_usuarios, max_facturadores)
values
  ('BASICO',      'Basico',      'Plan basico de facturacion electronica.',   3,  1),
  ('PROFESIONAL', 'Profesional', 'Plan profesional con mayor capacidad.',     10, 3),
  ('ENTERPRISE',  'Enterprise',  'Plan enterprise sin limites operativos.',   50, 10)
on conflict (codigo) do update
set
  nombre             = excluded.nombre,
  descripcion        = excluded.descripcion,
  max_usuarios       = excluded.max_usuarios,
  max_facturadores   = excluded.max_facturadores,
  activo             = true;
