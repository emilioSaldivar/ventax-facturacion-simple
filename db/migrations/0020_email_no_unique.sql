-- El email puede repetirse entre usuarios de distintos tenants.
-- Solo el username debe ser unico (usuarios_username_uidx lo garantiza).
DROP INDEX IF EXISTS usuarios_email_uidx;
