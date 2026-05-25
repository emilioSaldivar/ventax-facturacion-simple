#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

APP_ENV_FILE="${APP_ENV_FILE:-.env}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
LOAD_NOW=false

for arg in "$@"; do
  case "$arg" in
    --load-now)
      LOAD_NOW=true
      ;;
    *)
      echo "Parametro no soportado: $arg" >&2
      echo "Uso: APP_ENV_FILE=.env.local bash scripts/deploy-loader.sh [--load-now]" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$APP_ENV_FILE" ]]; then
  echo "No existe $APP_ENV_FILE en $ROOT_DIR" >&2
  exit 1
fi

COMPOSE_ARGS=(--env-file "$APP_ENV_FILE" -f "$COMPOSE_FILE")

echo "Desplegando solo dnit-ruc-loader-cron con $COMPOSE_FILE y $APP_ENV_FILE..."
docker compose "${COMPOSE_ARGS[@]}" up -d --build dnit-ruc-loader-cron

echo "Estado dnit-ruc-loader-cron:"
docker compose "${COMPOSE_ARGS[@]}" ps dnit-ruc-loader-cron

if [[ "$LOAD_NOW" == "true" ]]; then
  echo "Ejecutando carga inmediata DNIT (--load-now)..."
  docker compose "${COMPOSE_ARGS[@]}" run --rm --entrypoint sh dnit-ruc-loader-cron -lc "/app/scripts/run.sh"
  echo "Carga inmediata finalizada."
fi

CRON_DAY="$(grep -E '^DNIT_CRON_DAY=' "$APP_ENV_FILE" | tail -n1 | cut -d'=' -f2- || true)"
CRON_HOUR="$(grep -E '^DNIT_CRON_HOUR=' "$APP_ENV_FILE" | tail -n1 | cut -d'=' -f2- || true)"
CRON_MINUTE="$(grep -E '^DNIT_CRON_MINUTE=' "$APP_ENV_FILE" | tail -n1 | cut -d'=' -f2- || true)"
CRON_DAY="${CRON_DAY:-05}"
CRON_HOUR="${CRON_HOUR:-3}"
CRON_MINUTE="${CRON_MINUTE:-0}"

echo "Regla mensual configurada para dnit-ruc-loader-cron: ${CRON_MINUTE} ${CRON_HOUR} ${CRON_DAY} * *"
