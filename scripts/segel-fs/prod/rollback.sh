#!/usr/bin/env bash
# Corre EN segel-fs: ssh segel-fs 'bash -s' < rollback.sh <etiqueta>. PLAN_DESPLIEGUE_SEGEL_FS_v0.4 §3.
# Vuelve a las imagenes :antes-<etiqueta> y al .env.segel anterior. No revierte el esquema (columnas aditivas que la
# version anterior ignora). Requiere autorizacion explicita del usuario.
set -euo pipefail
ET="${1:?etiqueta}"
# Valores de produccion por defecto; el ensayo local los cambia por variable (TASKS v0.4 DSF4-001).
FS_DIR="${FS_DIR:-/home/esaldivar/segel/fs}"; BACKUP_DIR="${BACKUP_DIR:-/home/esaldivar/segel/backups/fs}"
API_URL="${API_URL:-http://127.0.0.1:8091}"; FRONT_URL="${FRONT_URL:-http://10.100.0.145:8092}"
cd "$FS_DIR"
U=$(grep "^POSTGRES_USER=" .env.segel | cut -d= -f2); D=$(grep "^POSTGRES_DB=" .env.segel | cut -d= -f2)
P() { docker exec segel-fs-postgres-1 psql -U "$U" -d "$D" -Atc "$1"; }
export APP_ENV_FILE=.env.segel
C="docker compose --env-file .env.segel -f docker-compose.yml"
echo "[$(date -u +%T)] vuelta atras a :antes-$ET"
echo "facturas externas cargadas: $(P "select count(*) from facturas_operativas where origen is not null")"
echo "notas combinadas: $(P "select count(*) from facturas_operativas where nce_modo = 'COMBINADA'")"
$C stop api frontend
for s in api migrate frontend; do docker tag "segel-fs-$s:antes-$ET" "segel-fs-$s:latest"; done
cp -p ".env.segel.antes-$ET" .env.segel
$C up -d --no-build --no-deps --force-recreate api
for i in $(seq 1 60); do [[ "$(docker inspect -f '{{.State.Health.Status}}' segel-fs-api-1)" == "healthy" ]] && break; sleep 2; done
$C up -d --no-build --no-deps --force-recreate frontend
for i in $(seq 1 60); do [[ "$(docker inspect -f '{{.State.Health.Status}}' segel-fs-frontend-1)" == "healthy" ]] && break; sleep 2; done
echo "X-App-Version: $(curl -s -D - -o /dev/null $FRONT_URL/api/v1/health | grep -i '^x-app-version' | tr -d '\r')"
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep segel-fs
