#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
APP_ENV_FILE="${APP_ENV_FILE:-.env}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups/postgres}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-facturacion_simple}"
POSTGRES_USER="${POSTGRES_USER:-facturacion_simple}"
VERIFY_DB="${VERIFY_DB:-${POSTGRES_DB}_restore_verify}"
BACKUP_FILE="${1:-}"

if [[ -z "$BACKUP_FILE" ]]; then
  BACKUP_FILE="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.dump' -printf '%T@ %p\n' 2>/dev/null | sort -rn | awk 'NR == 1 {print $2}')"
fi

if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "No se encontro backup para verificar en $BACKUP_DIR" >&2
  exit 1
fi

if [[ ! -f "$APP_ENV_FILE" ]]; then
  echo "No existe $APP_ENV_FILE en $ROOT_DIR" >&2
  exit 1
fi

COMPOSE_ARGS=(--env-file "$APP_ENV_FILE" -f "$COMPOSE_FILE")

cleanup() {
  docker compose "${COMPOSE_ARGS[@]}" exec -T "$POSTGRES_SERVICE" \
    dropdb -U "$POSTGRES_USER" --if-exists "$VERIFY_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "Verificando restore de $BACKUP_FILE en base temporal $VERIFY_DB..."
cleanup
docker compose "${COMPOSE_ARGS[@]}" exec -T "$POSTGRES_SERVICE" \
  createdb -U "$POSTGRES_USER" "$VERIFY_DB"

docker compose "${COMPOSE_ARGS[@]}" exec -T "$POSTGRES_SERVICE" \
  pg_restore -U "$POSTGRES_USER" -d "$VERIFY_DB" --no-owner --no-acl < "$BACKUP_FILE"

docker compose "${COMPOSE_ARGS[@]}" exec -T "$POSTGRES_SERVICE" \
  psql -U "$POSTGRES_USER" -d "$VERIFY_DB" -v ON_ERROR_STOP=1 -c "select count(*) as migrations from schema_migrations;" >/dev/null

echo "Restore verificado correctamente en base temporal: $VERIFY_DB"
