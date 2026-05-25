#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CRON_MINUTE="${DNIT_CRON_MINUTE:-0}"
CRON_HOUR="${DNIT_CRON_HOUR:-3}"
CRON_DAY="${DNIT_CRON_DAY:-05}"
CRON_LINE="${CRON_MINUTE} ${CRON_HOUR} ${CRON_DAY} * * ${ROOT_DIR}/scripts/run.sh"

( crontab -l 2>/dev/null | grep -v "${ROOT_DIR}/scripts/run.sh"; echo "$CRON_LINE" ) | crontab -

echo "Cron instalado: $CRON_LINE"
