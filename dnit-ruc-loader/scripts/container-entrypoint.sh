#!/usr/bin/env sh
set -eu

CRON_MINUTE="${DNIT_CRON_MINUTE:-0}"
CRON_HOUR="${DNIT_CRON_HOUR:-3}"
CRON_DAY="${DNIT_CRON_DAY:-05}"
CRON_ENABLED="${DNIT_CRON_ENABLED:-true}"

mkdir -p /app/data/downloads /app/data/extracted /app/data/logs

run_on_start() {
  if [ "${DNIT_RUN_ON_START:-false}" = "true" ]; then
    echo "dnit-ruc-loader: ejecucion inicial habilitada"
    /app/scripts/run.sh || true
  fi
}

if [ "$CRON_ENABLED" != "true" ]; then
  echo "dnit-ruc-loader: cron deshabilitado (DNIT_CRON_ENABLED=$CRON_ENABLED)"
  echo "dnit-ruc-loader: carga manual con 'bash scripts/deploy-loader.sh --load-now'"
  run_on_start
  exec tail -f /dev/null
fi

case "$CRON_DAY" in
  ''|*[!0-9]*)
    echo "DNIT_CRON_DAY invalido: $CRON_DAY" >&2
    exit 1
    ;;
esac

if [ "$CRON_DAY" -lt 1 ] || [ "$CRON_DAY" -gt 31 ]; then
  echo "DNIT_CRON_DAY fuera de rango (1..31): $CRON_DAY" >&2
  exit 1
fi

CRON_LINE="${CRON_MINUTE} ${CRON_HOUR} ${CRON_DAY} * * /app/scripts/run.sh"
echo "$CRON_LINE" > /etc/crontabs/root
echo "dnit-ruc-loader cron: $CRON_LINE"

run_on_start

exec crond -f -l 8
