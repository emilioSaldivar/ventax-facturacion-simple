-- SPEC_NOTA_CREDITO_FACTURA_EXTERNA_v0.1 (PLAN 4). Factura que no emitio FS, traida para emitir notas de credito:
-- `origen` SIFEN (leida del rDE con la consulta de FE §31) o MANUAL (cargada por el operador). null = emitida por FS.
alter table facturas_operativas add column if not exists origen text;
alter table facturas_operativas add column if not exists referencia_impresa jsonb;
alter table facturas_operativas add column if not exists sifen_consulta jsonb;
alter table facturas_operativas add column if not exists fecha_emision date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'facturas_operativas_origen_chk') then
    alter table facturas_operativas
      add constraint facturas_operativas_origen_chk check (origen is null or origen in ('SIFEN', 'MANUAL'));
  end if;
end $$;

-- D-7: una factura externa por CDC o por referencia impresa. Solo sobre externas: un indice sobre todas las
-- facturas podria fallar con duplicados historicos que no se pudieron revisar en produccion; el servicio compara
-- ademas contra las facturas propias antes de guardar.
create unique index if not exists facturas_operativas_externa_cdc_uidx
  on facturas_operativas (facturador_id, cdc)
  where origen is not null and cdc is not null and deleted_at is null;

create unique index if not exists facturas_operativas_externa_impresa_uidx
  on facturas_operativas (
    facturador_id,
    (referencia_impresa ->> 'timbrado'),
    (referencia_impresa ->> 'establecimiento'),
    (referencia_impresa ->> 'punto'),
    (referencia_impresa ->> 'numero')
  )
  where origen is not null and referencia_impresa is not null and deleted_at is null;
