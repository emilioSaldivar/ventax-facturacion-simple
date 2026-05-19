#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRON_MINUTE="${BACKUP_CRON_MINUTE:-15}"
CRON_HOUR="${BACKUP_CRON_HOUR:-2}"
CRON_LOG="${BACKUP_CRON_LOG:-$ROOT_DIR/backups/postgres/backup-cron.log}"
MARKER="# facturacion-simple-cliente postgres backup"
ENTRY="$CRON_MINUTE $CRON_HOUR * * * cd $ROOT_DIR && bash scripts/backup.sh >> $CRON_LOG 2>&1 $MARKER"

if [[ "${DRY_RUN:-NO}" == "YES" ]]; then
  echo "$ENTRY"
  exit 0
fi

mkdir -p "$(dirname "$CRON_LOG")"

existing_cron="$(mktemp)"
new_cron="$(mktemp)"
trap 'rm -f "$existing_cron" "$new_cron"' EXIT

crontab -l > "$existing_cron" 2>/dev/null || true
grep -vF "$MARKER" "$existing_cron" > "$new_cron" || true
printf '%s\n' "$ENTRY" >> "$new_cron"
crontab "$new_cron"

echo "Backup diario instalado en cron: $CRON_HOUR:$CRON_MINUTE"
echo "Log: $CRON_LOG"
