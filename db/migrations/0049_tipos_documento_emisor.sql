-- SPEC_NOTA_REMISION_v0.1 RN-01b: tipos de documento que FE tiene habilitados para el emisor (export §21,
-- `tipos_documento_habilitados`, union de perfiles y numeradores). "NRE" indica un numerador tipo 7 en algun punto.
alter table facturadores add column if not exists fe_tipos_documento jsonb not null default '[]'::jsonb;
