# TASKS DB BACKUP RESTORE v0.1

## Estado

| Estado | Tarea | Evidencia |
|--------|-------|-----------|
| DONE | Definir SPEC de backup y restore | `docs/SPEC_DB_BACKUP_RESTORE_v0.1.md` |
| DONE | Definir PLAN tecnico | `docs/PLAN_DB_BACKUP_RESTORE_v0.1.md` |
| DONE | Implementar script de backup | `scripts/backup-db.sh` |
| DONE | Implementar script de restore con confirmacion explicita | `scripts/restore-db.sh` |
| DONE | Documentar uso operativo | `docs/DEPLOY_MVP_v0.1.md` |
| DONE | Validar sintaxis de scripts | `bash -n scripts/backup-db.sh scripts/restore-db.sh` |

## Notas

- No se ejecuto restore real porque reemplaza la base destino.
- Los scripts usan el servicio Compose `postgres` y no nombres concretos de contenedor.
