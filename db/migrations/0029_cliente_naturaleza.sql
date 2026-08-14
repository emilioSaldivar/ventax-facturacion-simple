alter table cliente_identidades
  add column naturaleza text not null default 'FISICA';

alter table cliente_identidades
  add constraint cliente_identidades_naturaleza_check
  check (naturaleza in ('FISICA', 'JURIDICA'));

alter table facturador_clientes
  add column naturaleza text not null default 'FISICA';

alter table facturador_clientes
  add constraint facturador_clientes_naturaleza_check
  check (naturaleza in ('FISICA', 'JURIDICA'));
