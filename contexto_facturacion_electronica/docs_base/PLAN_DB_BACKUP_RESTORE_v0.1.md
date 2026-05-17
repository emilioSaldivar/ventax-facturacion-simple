# PLAN DB BACKUP RESTORE v0.1

## Estrategia Tecnica

Se agregaran scripts Bash en `scripts/` para operar PostgreSQL dentro del stack Docker Compose usando el nombre de servicio `postgres`.

Esta decision evita acoplarse a `container_name` o a nombres generados por Compose, que cambian segun directorio, proyecto o ambiente.

## Archivos Afectados

- `scripts/backup-db.sh`
- `scripts/restore-db.sh`
- `docs/DEPLOY_MVP_v0.1.md`
- `docs/SPEC_DB_BACKUP_RESTORE_v0.1.md`
- `docs/PLAN_DB_BACKUP_RESTORE_v0.1.md`
- `docs/TASKS_DB_BACKUP_RESTORE_v0.1.md`

## Variables Y Defaults

- `FE_COMPOSE_FILE`: archivo Compose. Default: `docker-compose.prod.yml`.
- `POSTGRES_DB`: base destino. Default: `fe_mvp`.
- `POSTGRES_USER`: usuario PostgreSQL. Default: `postgres`.
- `FE_BACKUP_DIR`: directorio de backups. Default: `backups/postgres_backup`.
- `FE_DB_SERVICE`: servicio Compose PostgreSQL. Default: `postgres`.

## Backup

1. Resolver root del repo.
2. Cargar `.env` si existe.
3. Validar disponibilidad con `pg_isready`.
4. Crear `FE_BACKUP_DIR`.
5. Ejecutar `pg_dump -Fc` dentro del servicio `postgres`.
6. Escribir el dump en host con timestamp.

## Restore

1. Exigir `--yes` o `FE_RESTORE_CONFIRM=YES`.
2. Resolver archivo indicado o ultimo backup disponible.
3. Validar disponibilidad con `pg_isready`.
4. Terminar conexiones activas contra la base destino.
5. Eliminar y recrear la base.
6. Restaurar con `psql` para `.sql` o `pg_restore` para `.dump`.
7. Mostrar validacion final de cantidad de tablas publicas.

## Riesgos

- Restore es destructivo para la base destino.
- Dumps de ambientes distintos pueden requerir usuarios/extensiones compatibles.
- Backups no cifrados deben tratarse como informacion sensible.

## Validacion

- Validacion estatica de sintaxis con `bash -n`.
- Revision documental y operativa de comandos.
- No ejecutar restore real salvo autorizacion explicita del usuario.
