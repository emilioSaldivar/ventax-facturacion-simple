-- SPEC_INDICES_PADRON_DNIT_v0.1, RN-01 (FS-42): indices del padron DNIT que ninguna consulta usa.
-- Las consultas de la API filtran por (ruc_sin_dv, dv) o por ruc_sin_dv, y las cubre uq_dnit_ruc.
-- Libera unos 200 MB con el padron completo.
drop index if exists idx_dnit_ruc;
drop index if exists idx_dnit_ruc_sin_dv;
drop index if exists idx_dnit_estado;
drop index if exists idx_dnit_razon_social_tsv;
