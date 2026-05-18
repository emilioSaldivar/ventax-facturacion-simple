#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "No existe $COMPOSE_FILE en $ROOT_DIR" >&2
  exit 1
fi

echo "Construyendo y levantando stack con $COMPOSE_FILE..."
docker compose -f "$COMPOSE_FILE" up -d --build

echo "Estado del stack:"
docker compose -f "$COMPOSE_FILE" ps
