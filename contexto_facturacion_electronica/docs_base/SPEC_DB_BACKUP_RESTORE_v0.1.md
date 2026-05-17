# SPEC DB BACKUP RESTORE v0.1

## Objetivo

Agregar scripts operativos para crear y restaurar backups de la base PostgreSQL de `facturacion-electronica` en despliegues Docker Compose, tanto en nube como en equipos locales.

## Alcance

- Crear backups en formato custom de PostgreSQL (`pg_dump -Fc`).
- Restaurar backups `.dump`, `.sql` o `.zip` que contengan `.dump` o `.sql`.
- Ejecutar las operaciones contra el servicio Compose estable `postgres`.
- Evitar depender de nombres generados de contenedor, como `<proyecto>-postgres-1`.
- Soportar `docker-compose.prod.yml` por defecto y permitir override del archivo compose.
- Guardar backups locales en `backups/postgres_backup/`.

## Fuera De Alcance

- Automatizar restauraciones durante deploy.
- Subir backups a storage externo.
- Cifrar backups.
- Borrar backups antiguos.
- Restaurar dumps sin confirmacion explicita.

## Reglas Operativas

- El backup es una operacion de lectura y puede ejecutarse sin detener servicios.
- El restore reemplaza la base destino y debe requerir confirmacion explicita.
- Los scripts deben leer `.env` si existe, sin imprimir secretos.
- Los scripts deben usar `docker compose exec -T postgres ...` para apuntar al servicio Compose, no a un nombre de contenedor.
- La base por defecto es `POSTGRES_DB` o `fe_mvp`.
- El usuario por defecto es `POSTGRES_USER` o `postgres`.

## Criterios De Aceptacion

- `bash scripts/backup-db.sh` crea un `.dump` en `backups/postgres_backup/`.
- `bash scripts/restore-db.sh --yes <archivo>` restaura el archivo indicado.
- `bash scripts/restore-db.sh --yes` usa el ultimo backup encontrado en `backups/postgres_backup/`.
- Ambos scripts fallan con mensajes claros si el servicio `postgres` no esta disponible.
- El restore falla si no recibe `--yes` o `FE_RESTORE_CONFIRM=YES`.
