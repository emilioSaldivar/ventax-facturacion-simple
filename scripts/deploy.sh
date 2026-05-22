#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
APP_ENV_FILE="${APP_ENV_FILE:-.env}"
export COMPOSE_FILE APP_ENV_FILE

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "No existe $COMPOSE_FILE en $ROOT_DIR" >&2
  exit 1
fi

if [[ ! -f "$APP_ENV_FILE" ]]; then
  echo "No existe $APP_ENV_FILE en $ROOT_DIR" >&2
  exit 1
fi

COMPOSE_ARGS=(--env-file "$APP_ENV_FILE" -f "$COMPOSE_FILE")

echo "Construyendo y levantando stack con $COMPOSE_FILE y $APP_ENV_FILE..."
docker compose "${COMPOSE_ARGS[@]}" up -d --build

echo "Estado del stack:"
docker compose "${COMPOSE_ARGS[@]}" ps
