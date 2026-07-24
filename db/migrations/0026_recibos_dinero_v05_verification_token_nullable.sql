-- verification_token ya no lo genera este servicio localmente (0023 lo definia
-- NOT NULL DEFAULT gen_random_uuid()) — desde v0.5 lo asigna facturacion-electronica
-- recien al emitir (POST /recibos/{id}/emitir). Mientras el recibo esta en BORRADOR,
-- el valor es null.
ALTER TABLE recibos_dinero
  ALTER COLUMN verification_token DROP NOT NULL,
  ALTER COLUMN verification_token DROP DEFAULT;
