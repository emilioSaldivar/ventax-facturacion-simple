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
BUILD_COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "dev")

echo "Construyendo y levantando stack con $COMPOSE_FILE y $APP_ENV_FILE (commit: $BUILD_COMMIT_SHA)..."
docker compose "${COMPOSE_ARGS[@]}" build --build-arg BUILD_COMMIT_SHA="$BUILD_COMMIT_SHA"
docker compose "${COMPOSE_ARGS[@]}" up -d

# Red compartida con facturacion-electronica (docs/SPEC_RED_COMPARTIDA_FISCAL_v0.1.md).
#
# `networks: - fiscal_gateway` en docker-compose.yml ya deja al servicio unido a
# $FE_DOCKER_NETWORK en un `up -d` normal. Este paso es una verificacion
# idempotente adicional, no un reemplazo: confirma la union real inspeccionando
# el contenedor (no asume que el `up -d` de arriba recreo el contenedor), y solo
# conecta si hace falta — dos corridas seguidas de `deploy.sh` no deben conectar
# dos veces ni fallar por "ya conectado".
#
# No es fatal a proposito: si la red compartida todavia no existe (host nuevo,
# facturacion-electronica no desplegado todavia) o el nombre configurado esta
# mal, este stack sigue arriba igual — la crea/mantiene facturacion-electronica,
# no este repo (SPEC_RED_COMPARTIDA_FISCAL_v0.1.md, Fuera De Alcance). Lo que no
# puede pasar es que quede sin intentar la conexion en silencio.
ensure_service_on_fiscal_network() {
  local service="$1"
  local network_name="${FE_DOCKER_NETWORK:-}"

  if [[ -z "$network_name" || "$network_name" == "bridge" ]]; then
    return 0
  fi

  local container_id
  container_id=$(docker compose "${COMPOSE_ARGS[@]}" ps -q "$service" 2>/dev/null || true)
  if [[ -z "$container_id" ]]; then
    echo "[fiscal_gateway] servicio '$service' no esta corriendo, no se verifica la red fiscal" >&2
    return 0
  fi

  if ! docker network inspect "$network_name" >/dev/null 2>&1; then
    echo "[fiscal_gateway] la red '$network_name' no existe todavia (la crea facturacion-electronica al desplegarse) — no se conecta esta vez" >&2
    return 0
  fi

  if docker inspect "$container_id" --format '{{json .NetworkSettings.Networks}}' | grep -q "\"$network_name\":"; then
    echo "[fiscal_gateway] '$service' ya esta conectado a '$network_name'"
  else
    echo "[fiscal_gateway] conectando '$service' a '$network_name'..."
    docker network connect "$network_name" "$container_id"
    echo "[fiscal_gateway] '$service' conectado a '$network_name'"
  fi
}

ensure_service_on_fiscal_network api

echo "Estado del stack:"
docker compose "${COMPOSE_ARGS[@]}" ps
