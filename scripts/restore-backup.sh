#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups/postgres}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-facturacion_simple}"
POSTGRES_USER="${POSTGRES_USER:-facturacion_simple}"
CONFIRMED="${RESTORE_CONFIRM:-NO}"
BACKUP_FILE=""

for arg in "$@"; do
  case "$arg" in
    --yes)
      CONFIRMED="YES"
      ;;
    *)
      BACKUP_FILE="$arg"
      ;;
  esac
done

if [[ -z "$BACKUP_FILE" ]]; then
  BACKUP_FILE="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.dump' -printf '%T@ %p\n' 2>/dev/null | sort -rn | awk 'NR == 1 {print $2}')"
fi

if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "No se encontro backup para restaurar en $BACKUP_DIR" >&2
  exit 1
fi

if [[ "$CONFIRMED" != "YES" ]]; then
  echo "Restore destructivo bloqueado."
  echo "Backup seleccionado: $BACKUP_FILE"
  echo "Ejecutar con RESTORE_CONFIRM=YES o agregar --yes para confirmar."
  exit 1
fi

echo "Restaurando $BACKUP_FILE sobre base $POSTGRES_DB..."
docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-acl < "$BACKUP_FILE"

echo "Restore finalizado desde: $BACKUP_FILE"
