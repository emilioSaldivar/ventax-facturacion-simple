insert into planes (codigo, nombre, descripcion, max_usuarios, max_facturadores)
values ('BASICO_MVP', 'Basico MVP', 'Plan inicial para facturacion simple mobile-first.', 3, 1)
on conflict (codigo) do update
set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  max_usuarios = excluded.max_usuarios,
  max_facturadores = excluded.max_facturadores,
  activo = true;
