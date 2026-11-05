#!/usr/bin/env bash
# Inyeccion de fallos sobre el stack aislado (PLAN §8). Solo actua sobre contenedores fs-carga.
#
#   fallos.sh f1 inyectar|restaurar     FE caido: desconecta la API de la red fiscal
#   fallos.sh f3 inyectar|restaurar     clave compartida invalida: recrea la API con otra FE_API_KEY
#   fallos.sh f5                        API muere con trabajo en curso: docker kill y arranque
#   fallos.sh f6                        reinicio de PostgreSQL
#   fallos.sh trabado                   verifica H-4: marca un trabajo en PROCESSING, reinicia y observa
#
# F2 (FE lento), F7 (emisor sin configuracion), F8 (lotes en 0361) y F9 (1002 tras reenvio) los inyecta el
# equipo de FE en su lado. F4 (clave de consumidor) es un PUT del backoffice. Ver la guia de operacion.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WORKTREE="$ROOT_DIR/.local/carga/worktree"
API="fs-carga-api-1"
POSTGRES="fs-carga-postgres-1"
ENV_FILE="$WORKTREE/.env.carga"

die() { echo "ABORTADO: $*" >&2; exit 1; }
sello() { date -u +%FT%TZ; }
psql_carga() { docker exec -i "$POSTGRES" psql -U facturacion_simple -d facturacion_simple -At "$@"; }
compose() { (cd "$WORKTREE" && APP_ENV_FILE=.env.carga docker compose --env-file .env.carga -f docker-compose.yml "$@"); }
esperar_api() {
  for _ in $(seq 1 60); do
    curl -fsS "http://127.0.0.1:8291/api/v1/health" >/dev/null 2>&1 && { echo "$(sello) API disponible"; return 0; }
    sleep 1
  done
  die "la API no volvio en 60 s."
}

[[ -f "$ENV_FILE" ]] || die "No existe el stack aislado. Ejecutar: stack.sh up"
docker inspect "$API" >/dev/null 2>&1 || die "No existe $API."

RED="$(grep -E '^FE_DOCKER_NETWORK=' "$ENV_FILE" | cut -d= -f2-)"

case "${1:-}:${2:-}" in
  f1:inyectar)
    docker network disconnect "$RED" "$API"
    echo "$(sello) F1 inyectado: API sin red fiscal" ;;
  f1:restaurar)
    docker network connect "$RED" "$API"
    echo "$(sello) F1 restaurado" ;;
  f3:inyectar)
    [[ -f "$ENV_FILE.original" ]] && die "F3 ya esta inyectado."
    install -m 600 "$ENV_FILE" "$ENV_FILE.original"
    sed -i -E "s|^FE_API_KEY=.*|FE_API_KEY=clave-invalida-de-prueba-$(openssl rand -hex 8)|" "$ENV_FILE"
    compose up -d --no-deps --force-recreate api
    esperar_api
    echo "$(sello) F3 inyectado: la API usa una clave compartida invalida" ;;
  f3:restaurar)
    [[ -f "$ENV_FILE.original" ]] || die "F3 no esta inyectado."
    mv "$ENV_FILE.original" "$ENV_FILE"
    compose up -d --no-deps --force-recreate api
    esperar_api
    echo "$(sello) F3 restaurado" ;;
  f5:*)
    echo "$(sello) F5: en PROCESSING antes: $(psql_carga -c "select count(*) from factura_emision_outbox where estado='PROCESSING'")"
    docker kill "$API" >/dev/null
    echo "$(sello) API detenida a la fuerza"
    docker start "$API" >/dev/null
    esperar_api
    echo "$(sello) F5: en PROCESSING despues: $(psql_carga -c "select count(*) from factura_emision_outbox where estado='PROCESSING'")" ;;
  f6:*)
    docker restart "$POSTGRES" >/dev/null
    echo "$(sello) F6: PostgreSQL reiniciado"
    sleep 15
    # H-14: la API puede morir con la base, y no hay politica de reinicio que la levante.
    echo "$(sello) F6: API $(docker inspect "$API" --format '{{.State.Status}} exit={{.State.ExitCode}}')" ;;
  trabado:*)
    # La prueba solo cambia un trabajo ya terminado, en la base aislada.
    id="$(psql_carga -c "select id from factura_emision_outbox where estado = 'DONE' order by created_at desc limit 1")"
    [[ -n "$id" ]] || die "No hay trabajos para probar."
    psql_carga -c "update factura_emision_outbox set estado='PROCESSING', locked_at=now()-interval '2 hours' where id='$id'" >/dev/null
    echo "$(sello) Trabajo $id en PROCESSING, con el bloqueo vencido hace 2 horas"
    docker restart "$API" >/dev/null
    esperar_api
    espera="${2:-60}"
    echo "Observando $espera s, con el worker corriendo..."
    sleep "$espera"
    estado="$(psql_carga -c "select estado from factura_emision_outbox where id='$id'")"
    echo "$(sello) Estado final: $estado"
    psql_carga -c "update factura_emision_outbox set estado='DONE', locked_at=null where id='$id'" >/dev/null
    if [[ "$estado" == "PROCESSING" ]]; then echo "H-4 CONFIRMADA: nada recupera el trabajo"; else echo "H-4 DESCARTADA"; fi ;;
  *)
    sed -n 2,10p "${BASH_SOURCE[0]}" | sed 's/^# \?//'
    exit 2 ;;
esac
