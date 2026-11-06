#!/usr/bin/env bash
# Corre en el servidor. Levanta FE y FS con las imagenes ya cargadas; nunca compila.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NETWORK="segel_fiscal"

for file in "$ROOT/fs/.env.segel" "$ROOT/fe/.env.segel"; do
  [[ -f "$file" ]] || { echo "Falta $file: correr init-env.sh." >&2; exit 1; }
done

docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK" >/dev/null

# La imagen de FE corre como node (uid 1000) y el usuario de deploy puede tener otro uid.
# El chown se hace desde un contenedor, sin sudo (PLAN §4).
runtime="$ROOT/fe-runtime"
mkdir -p "$runtime/secrets" "$runtime/runtime/cert-seed" "$runtime/runtime/cert-uploads" "$runtime/runtime/logo-uploads"
docker run --rm --user 0 --network none --entrypoint chown -v "$runtime:/d" fe-segel-api -R 1000:1000 /d/secrets /d/runtime

(
  cd "$ROOT/fe"
  export FE_ENV_FILE=.env.segel
  docker compose --env-file .env.segel -f docker-compose.prod.yml up -d --no-build
)

(
  cd "$ROOT/fs"
  # env_file del compose lee APP_ENV_FILE del shell; --env-file no alcanza.
  export APP_ENV_FILE=.env.segel
  docker compose --env-file .env.segel -f docker-compose.yml up -d --no-build
  # El nginx del frontend resuelve "api" al arrancar: si la API se recreo y el frontend no,
  # queda con la IP vieja y responde 502.
  docker compose --env-file .env.segel -f docker-compose.yml restart frontend
)

echo "FS -> FE por la red interna:"
docker exec segel-fs-api-1 wget -qO- http://facturacion-electronica:8080/v1/health
echo
docker ps --filter name=segel --format 'table {{.Names}}\t{{.Ports}}\t{{.Status}}'
