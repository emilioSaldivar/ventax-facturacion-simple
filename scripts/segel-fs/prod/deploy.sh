#!/usr/bin/env bash
# Corre EN segel-fs: ssh segel-fs 'bash -s' < deploy.sh <sha> <etiqueta> <facturas_esperadas> <migracion_esperada> <moneda true|false> <contenedor_fe>=<prefijo_id_imagen> [rollback_auto]
# Ejemplo de guarda de FE (ids que informa FE para segel-rc4.36): fe-segel-api-1=sha256:5410b9161f34
# PLAN_DESPLIEGUE_SEGEL_FS_v0.4 §2.2-2.5. Solo FS; FE lo despliega FE. Aborta antes del corte si el respaldo no restaura
# con los conteos esperados o si FE no corre la imagen esperada. Requiere autorizacion explicita del usuario.
set -euo pipefail
SHA="${1:?sha}"; ET="${2:?etiqueta}"; ESP_F="${3:?facturas}"; ESP_M="${4:?migracion}"; MONEDA="${5:?true|false}"; FE_GUARDA="${6:?contenedor_fe=prefijo_id}"; AUTO="${7:-no}"
# Valores de produccion por defecto; el ensayo local los cambia por variable (TASKS v0.4 DSF4-001).
FS_DIR="${FS_DIR:-/home/esaldivar/segel/fs}"; BACKUP_DIR="${BACKUP_DIR:-/home/esaldivar/segel/backups/fs}"
API_URL="${API_URL:-http://127.0.0.1:8091}"; FRONT_URL="${FRONT_URL:-http://10.100.0.145:8092}"
cd "$FS_DIR"
U=$(grep "^POSTGRES_USER=" .env.segel | cut -d= -f2); D=$(grep "^POSTGRES_DB=" .env.segel | cut -d= -f2)
P() { docker exec segel-fs-postgres-1 psql -U "$U" -d "$D" -Atc "$1"; }
log() { echo "[$(date -u +%H:%M:%SZ)] $*"; }
docker image inspect "segel-fs-prod-api:$SHA" "segel-fs-prod-frontend:$SHA" >/dev/null

FE_CONT="${FE_GUARDA%%=*}"; FE_ID="${FE_GUARDA#*=}"
log "FASE 0 FE esperado: $FE_CONT con imagen $FE_ID"
FE_REAL=$(docker inspect "$FE_CONT" --format '{{.Image}}' 2>/dev/null || echo "sin contenedor")
echo "imagen de $FE_CONT: $FE_REAL"
if [[ "$FE_REAL" != "$FE_ID"* ]]; then echo "ABORTO: FE no corre la imagen esperada (D-3). No se toca nada." >&2; exit 4; fi

log "FASE 1 respaldo"
TS=$(date -u +%Y%m%dT%H%M%SZ); B=$BACKUP_DIR/$TS
mkdir -p "$B"; chmod 700 "$B"
docker exec segel-fs-postgres-1 pg_dump -U "$U" -d "$D" -Fc \
  --exclude-table-data=dnit_ruc_contribuyentes --exclude-table-data=dnit_ruc_contribuyentes_staging > "$B/fs.dump"
docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' | grep '^segel-fs' > "$B/imagenes.txt"
cp .env.segel "$B/env.segel"
( cd "$B" && sha256sum fs.dump imagenes.txt env.segel > SHA256SUMS )
chmod 600 "$B/fs.dump" "$B/env.segel"
ls -la "$B" | sed 's/  */ /g'

log "FASE 1b restauracion de prueba"
docker rm -f fs-restaura >/dev/null 2>&1 || true
docker run -d --name fs-restaura --network none -e POSTGRES_PASSWORD=restaura postgres:16-alpine >/dev/null
for i in $(seq 1 40); do docker exec fs-restaura pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker cp "$B/fs.dump" fs-restaura:/tmp/fs.dump
docker exec fs-restaura createdb -U postgres fsr
docker exec fs-restaura pg_restore -U postgres -d fsr --no-owner --no-privileges /tmp/fs.dump 2> "$B/restore.log" || true
RF=$(docker exec fs-restaura psql -U postgres -d fsr -Atc "select count(*) from facturas_operativas")
RM=$(docker exec fs-restaura psql -U postgres -d fsr -Atc "select max(version) from schema_migrations")
docker rm -f fs-restaura >/dev/null
log "restauracion: facturas=$RF migracion=$RM (avisos: $(wc -l < "$B/restore.log"))"
if [[ "$RF" != "$ESP_F" || "$RM" != "$ESP_M" ]]; then echo "ABORTO: restauracion distinta de lo esperado ($ESP_F / $ESP_M). No se toca produccion." >&2; exit 2; fi

log "FASE 2 variables (.env.segel.antes-$ET)"
cp -p .env.segel ".env.segel.antes-$ET"
fijar() { if grep -q "^$1=" .env.segel; then sed -i "s/^$1=.*/$1=$2/" .env.segel; else printf '%s=%s\n' "$1" "$2" >> .env.segel; fi; }
fijar FE_NC_DESCUENTOS true
fijar FE_NC_MONEDA_EXTRANJERA "$MONEDA"
grep -E '^FE_NC_(DESCUENTOS|MONEDA_EXTRANJERA)=' .env.segel

log "FASE 3 retag (antes-$ET)"
for s in api migrate frontend; do docker tag "segel-fs-$s:latest" "segel-fs-$s:antes-$ET"; done
docker tag "segel-fs-prod-api:$SHA" segel-fs-api:latest
docker tag "segel-fs-prod-api:$SHA" segel-fs-migrate:latest
docker tag "segel-fs-prod-frontend:$SHA" segel-fs-frontend:latest

export APP_ENV_FILE=.env.segel
C="docker compose --env-file .env.segel -f docker-compose.yml"
T0=$(date -u +%FT%TZ)
log "FASE 4 corte: migrate"
$C up -d --no-build --no-deps --force-recreate migrate
RC=$(docker wait segel-fs-migrate-1); docker logs segel-fs-migrate-1 2>&1 | tail -3
if [[ "$RC" != "0" ]]; then echo "FALLA: migrate salio con $RC" >&2; FALLA=1; fi
log "FASE 4 corte: api"
$C up -d --no-build --no-deps --force-recreate api
for i in $(seq 1 60); do [[ "$(docker inspect -f '{{.State.Health.Status}}' segel-fs-api-1)" == "healthy" ]] && break; sleep 2; done
log "FASE 4 corte: frontend"
$C up -d --no-build --no-deps --force-recreate frontend
for i in $(seq 1 60); do [[ "$(docker inspect -f '{{.State.Health.Status}}' segel-fs-frontend-1)" == "healthy" ]] && break; sleep 2; done
log "corte $T0 -> $(date -u +%FT%TZ)"

log "FASE 5 verificacion"
FALLA=${FALLA:-0}
MIG=$(P "select string_agg(version, ',' order by version) from schema_migrations where version >= '0050'")
VA=$(curl -s -D - -o /dev/null $API_URL/api/v1/health | grep -i '^x-app-version' | tr -d '\r' | awk '{print $2}')
VF=$(curl -s -D - -o /dev/null $FRONT_URL/api/v1/health | grep -i '^x-app-version' | tr -d '\r' | awk '{print $2}')
APP=$(curl -s -o /dev/null -w '%{http_code}' $FRONT_URL/app/)
HA=$(docker inspect -f '{{.State.Health.Status}}' segel-fs-api-1); HF=$(docker inspect -f '{{.State.Health.Status}}' segel-fs-frontend-1)
NF=$(P "select count(*) from facturas_operativas"); NE=$(P "select count(*) from facturas_operativas where origen is not null")
NC=$(P "select count(*) from facturas_operativas where nce_modo = 'COMBINADA'")
EV=$(docker exec segel-fs-api-1 sh -c 'echo "$FE_NC_DESCUENTOS/$FE_NC_MONEDA_EXTRANJERA"')
FEH=$(docker exec segel-fs-api-1 sh -c 'wget -qO- -T 5 http://facturacion-electronica:8080/v1/health 2>/dev/null || wget -qO- -T 5 http://fe-segel-api-1:8080/v1/health 2>/dev/null' | head -c 120)
ERR=$(docker logs --since "$T0" segel-fs-api-1 2>&1 | grep -c '"level":50' || true)
echo "CA-03 migraciones >=0050: $MIG ($(P "select count(*) from schema_migrations"))"
echo "CA-04 X-App-Version api=$VA frontend=$VF /app/=$APP api=$HA frontend=$HF FE=$FEH"
echo "CA-05 facturas=$NF (esperado $ESP_F) externas=$NE combinadas=$NC"
echo "CA-06 FE_NC_DESCUENTOS/FE_NC_MONEDA_EXTRANJERA en el contenedor: $EV"
echo "CA-07 errores api desde el corte: $ERR"
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' | grep segel-fs
[[ "$MIG" == "0050,0051,0052" ]] || FALLA=1
[[ "$VA" == "$SHA" && "$VF" == "$SHA" && "$APP" == "200" && "$HA" == "healthy" && "$HF" == "healthy" ]] || FALLA=1
# Externas y combinadas esperadas: 0 en el estreno de 0050-0052; despues, las que informe lectura.sh (hotfix 2026.11.13.1).
[[ "$NF" == "$ESP_F" && "$NE" == "${ESP_EXTERNAS:-0}" && "$NC" == "${ESP_COMBINADAS:-0}" ]] || FALLA=1
[[ "$EV" == "true/$MONEDA" && -n "$FEH" && "$ERR" == "0" ]] || FALLA=1
echo "RESPALDO=$B"
if [[ "$FALLA" != "0" ]]; then
  echo "VERIFICACION FALLIDA" >&2
  if [[ "$AUTO" == "rollback_auto" ]]; then
    log "vuelta atras automatica"
    for s in api migrate frontend; do docker tag "segel-fs-$s:antes-$ET" "segel-fs-$s:latest"; done
    cp -p ".env.segel.antes-$ET" .env.segel
    $C up -d --no-build --no-deps --force-recreate api
    for i in $(seq 1 60); do [[ "$(docker inspect -f '{{.State.Health.Status}}' segel-fs-api-1)" == "healthy" ]] && break; sleep 2; done
    $C up -d --no-build --no-deps --force-recreate frontend
    for i in $(seq 1 60); do [[ "$(docker inspect -f '{{.State.Health.Status}}' segel-fs-frontend-1)" == "healthy" ]] && break; sleep 2; done
    echo "despues de la vuelta atras: $(curl -s -D - -o /dev/null $FRONT_URL/api/v1/health | grep -i '^x-app-version' | tr -d '\r')"
  fi
  exit 5
fi
log "OK"
