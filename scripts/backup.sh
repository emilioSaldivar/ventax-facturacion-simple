#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups/postgres}"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-facturacion_simple}"
POSTGRES_USER="${POSTGRES_USER:-facturacion_simple}"
BACKUP_KEEP_RECENT_DAYS="${BACKUP_KEEP_RECENT_DAYS:-7}"
BACKUP_KEEP_EXTENDED_DAYS="${BACKUP_KEEP_EXTENDED_DAYS:-30}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/${POSTGRES_DB}-${STAMP}.dump"

mkdir -p "$BACKUP_DIR"

echo "Generando backup PostgreSQL en $BACKUP_FILE..."
docker compose -f "$COMPOSE_FILE" exec -T "$POSTGRES_SERVICE" \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-acl > "$BACKUP_FILE"

echo "Backup generado: $BACKUP_FILE"

if [[ "$BACKUP_KEEP_EXTENDED_DAYS" =~ ^[0-9]+$ && "$BACKUP_KEEP_EXTENDED_DAYS" -gt 0 ]]; then
  echo "Aplicando retencion extendida: ${BACKUP_KEEP_EXTENDED_DAYS} dias..."
  find "$BACKUP_DIR" -maxdepth 1 -type f -name "${POSTGRES_DB}-*.dump" -mtime "+$BACKUP_KEEP_EXTENDED_DAYS" -print -delete
fi

if [[ "$BACKUP_KEEP_RECENT_DAYS" =~ ^[0-9]+$ && "$BACKUP_KEEP_RECENT_DAYS" -gt 0 ]]; then
  echo "Compactando backups anteriores a ${BACKUP_KEEP_RECENT_DAYS} dias: se conserva el ultimo por dia..."
  find "$BACKUP_DIR" -maxdepth 1 -type f -name "${POSTGRES_DB}-*.dump" -mtime "+$BACKUP_KEEP_RECENT_DAYS" -printf '%f\n' \
    | sort -r \
    | awk -F'[-.]' '!seen[$2]++ {next} {print}' \
    | while IFS= read -r old_file; do
        rm -f "$BACKUP_DIR/$old_file"
      done
fi
