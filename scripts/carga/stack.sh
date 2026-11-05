#!/usr/bin/env bash
# Stack aislado de la verificacion de capacidad (docs/PLAN_VERIFICACION_CAPACIDAD_200_v0.1.md §2).
#
#   stack.sh init [--mock]   crea .local/carga/env.carga con secretos aleatorios
#   stack.sh check           solo evalua las guardas de seguridad
#   stack.sh up              worktree en CARGA_COMMIT + deploy.sh + correo falso + verificaciones
#   stack.sh status          contenedores y verificaciones
#   stack.sh down            detiene, sin borrar datos
#   stack.sh destroy         borra volumenes y worktree, con confirmacion
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CARGA_COMMIT="${CARGA_COMMIT:-7fe6ae8}"
STATE_DIR="$ROOT_DIR/.local/carga"
WORKTREE="$STATE_DIR/worktree"
ENV_FILE="${CARGA_ENV_FILE:-$STATE_DIR/env.carga}"
PROJECT="fs-carga"
MAILPIT_IMAGE="axllent/mailpit:v1.21.8"
MAILPIT_NAME="fs-carga-mailpit"
API_PORT=8291
FRONTEND_PORT=8292
MAILPIT_PORT=8293

die() { echo "ABORTADO: $*" >&2; exit 1; }

env_value() {
  # Lee una clave del archivo sin hacer `source`: los valores no se ejecutan ni se exportan.
  grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true
}

cmd_init() {
  [[ -e "$ENV_FILE" ]] && die "$ENV_FILE ya existe. Borralo a mano si queres regenerarlo."
  mkdir -p "$STATE_DIR"
  chmod 700 "$STATE_DIR"
  local pg jwt jwr smtp
  pg="$(openssl rand -hex 24)"; jwt="$(openssl rand -hex 32)"; jwr="$(openssl rand -hex 32)"; smtp="$(openssl rand -hex 12)"
  local db_url="postgres://facturacion_simple:${pg}@postgres:5432/facturacion_simple"
  install -m 600 /dev/null "$ENV_FILE"
  sed -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${pg}|" \
      -e "s|^DOCKER_DB_URL=.*|DOCKER_DB_URL=${db_url}|" \
      -e "s|^DATABASE_URL=.*|DATABASE_URL=${db_url}|" \
      -e "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=${jwt}|" \
      -e "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=${jwr}|" \
      -e "s|^SMTP_PASS=.*|SMTP_PASS=${smtp}|" \
      "$ROOT_DIR/scripts/carga/env.carga.example" > "$ENV_FILE"
  if [[ "${1:-}" == "--mock" ]]; then
    # Solo para probar las herramientas (E0). El informe rechaza esta corrida como evidencia.
    sed -i -e "s|^FE_GATEWAY_MODE=.*|FE_GATEWAY_MODE=mock|" \
           -e "s|^FE_API_BASE_URL=.*|FE_API_BASE_URL=http://fe-no-usado.invalid:8080/v1|" \
           -e "s|^FE_API_KEY=.*|FE_API_KEY=clave-no-usada-en-mock|" "$ENV_FILE"
    echo "Creado $ENV_FILE en modo MOCK: no es evidencia de capacidad."
  else
    echo "Creado $ENV_FILE. Completar FE_API_BASE_URL y FE_API_KEY con lo que entregue FE."
  fi
}

# Guardas de SPEC RN-01 y RN-02. Corren antes de construir nada.
cmd_check() {
  [[ -f "$ENV_FILE" ]] || die "No existe $ENV_FILE. Ejecutar: stack.sh init"
  [[ "$(stat -c %a "$ENV_FILE")" == "600" ]] || die "$ENV_FILE debe tener permiso 600."

  case "$(hostname)" in
    cobrapy-mvp-01*) die "este host aloja produccion y staging (RN-01)." ;;
  esac

  local project env_fe network url mode
  project="$(env_value COMPOSE_PROJECT_NAME)"
  env_fe="$(env_value FE_API_ENV)"
  network="$(env_value FE_DOCKER_NETWORK)"
  url="$(env_value FE_API_BASE_URL)"
  mode="$(env_value FE_GATEWAY_MODE)"

  [[ "$project" == "$PROJECT" ]] || die "COMPOSE_PROJECT_NAME debe ser $PROJECT, es '$project'."
  [[ "$env_fe" == "test" ]] || die "FE_API_ENV debe ser test, es '$env_fe' (RN-02)."
  [[ "$network" == fs_carga* ]] || die "la red fiscal debe empezar con fs_carga, es '$network' (RN-01)."
  [[ "$mode" == "real" || "$mode" == "mock" ]] || die "FE_GATEWAY_MODE invalido: '$mode'."

  if grep -Eq '^FE_API_BASE_URL=<|^FE_API_KEY=<' "$ENV_FILE"; then
    die "faltan FE_API_BASE_URL o FE_API_KEY en $ENV_FILE."
  fi
  if echo "$url" | grep -Eiq 'fe-prod|fe-test|ventax\.app'; then
    die "FE_API_BASE_URL apunta a un ambiente prohibido: '$url' (RN-01)."
  fi
  if grep -Eq '^RESEND_API_KEY=.+|^VENTAX_NOTIFY_EMAIL=.+' "$ENV_FILE"; then
    die "RESEND_API_KEY y VENTAX_NOTIFY_EMAIL deben estar vacios (RN-05)."
  fi
  [[ "$(env_value SMTP_HOST)" == "mailpit" ]] || die "SMTP_HOST debe ser mailpit (RN-05)."

  # Una red con nombre correcto podria igual tener conectado un FE real.
  if docker network inspect "$network" >/dev/null 2>&1; then
    local conectados
    conectados="$(docker network inspect "$network" --format '{{range .Containers}}{{.Name}} {{end}}')"
    if echo "$conectados" | grep -Eiq 'fe-prod|fe-test|ventax-facturacion|pos-graciela'; then
      die "la red '$network' tiene conectado un stack ajeno: $conectados"
    fi
  fi
  # El modo real exige red sin salida: un FE conectado aqui no debe poder llegar a SIFEN real.
  if [[ "$mode" == "real" ]] && docker network inspect "$network" >/dev/null 2>&1; then
    if [[ "$(docker network inspect "$network" --format '{{.Internal}}')" != "true" ]]; then
      die "la red '$network' tiene salida a internet. Debe recrearse con --internal (RN-02)."
    fi
  fi
  echo "Guardas OK (modo: $mode, host: $(hostname))."
}

compose() {
  (cd "$WORKTREE" && COMPOSE_FILE=docker-compose.yml APP_ENV_FILE=.env.carga \
    docker compose --env-file .env.carga -f docker-compose.yml "$@")
}

cmd_up() {
  cmd_check

  if [[ ! -e "$WORKTREE/.git" ]]; then
    git -C "$ROOT_DIR" worktree add --detach "$WORKTREE" "$CARGA_COMMIT"
  fi
  local actual esperado
  actual="$(git -C "$WORKTREE" rev-parse HEAD)"
  esperado="$(git -C "$ROOT_DIR" rev-parse "$CARGA_COMMIT^{commit}")"
  [[ "$actual" == "$esperado" ]] || die "el worktree esta en $actual y se esperaba $esperado."
  [[ -z "$(git -C "$WORKTREE" status --porcelain)" ]] || die "el worktree tiene cambios: el codigo debe ser exacto (RN-03)."

  install -m 600 "$ENV_FILE" "$WORKTREE/.env.carga"

  local network
  network="$(env_value FE_DOCKER_NETWORK)"
  if ! docker network inspect "$network" >/dev/null 2>&1; then
    echo "La red $network no existe: se crea. FE debe conectarse a esta misma red."
    # Interna: FE tambien se conecta aqui, y no debe quedar con ruta a SIFEN real ni a internet.
    docker network create --internal "$network" >/dev/null
  fi

  (cd "$WORKTREE" && APP_ENV_FILE=.env.carga bash scripts/deploy.sh)

  if ! docker inspect "$MAILPIT_NAME" >/dev/null 2>&1; then
    docker run -d --name "$MAILPIT_NAME" --restart unless-stopped \
      --label "com.docker.compose.project=$PROJECT-correo" \
      --network "${PROJECT}_default" --network-alias mailpit \
      -p "127.0.0.1:${MAILPIT_PORT}:8025" \
      -e MP_SMTP_AUTH_ACCEPT_ANY=1 -e MP_SMTP_AUTH_ALLOW_INSECURE=1 -e MP_MAX_MESSAGES=0 \
      "$MAILPIT_IMAGE" >/dev/null
  else
    docker start "$MAILPIT_NAME" >/dev/null
  fi

  cmd_verify
}

cmd_verify() {
  local version modo home_segel app_segel fallos=0
  version="$(curl -fsS -D - -o /dev/null "http://127.0.0.1:${API_PORT}/api/v1/health" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-app-version"{print $2}')"
  if [[ "$version" == "$(git -C "$ROOT_DIR" rev-parse --short "$CARGA_COMMIT")" ]]; then
    echo "OK  X-App-Version=$version"
  else
    echo "MAL X-App-Version=$version, se esperaba $CARGA_COMMIT"; fallos=1
  fi

  modo="$(env_value FE_GATEWAY_MODE)"
  if [[ "$modo" == "real" ]]; then echo "OK  FE_GATEWAY_MODE=real"; else echo "AVISO FE_GATEWAY_MODE=$modo: esta corrida no es evidencia"; fi

  home_segel="$(curl -fsS "http://127.0.0.1:${FRONTEND_PORT}/app/" | grep -ci segel || true)"
  app_segel="$(docker exec "${PROJECT}-frontend-1" sh -c 'cat /usr/share/nginx/html/app/assets/*.js /usr/share/nginx/html/app/assets/*.css' 2>/dev/null | grep -ci segel || true)"
  if [[ "$home_segel" == "0" && "$app_segel" == "0" ]]; then
    echo "OK  frontend sin Segel"
  else
    echo "MAL el frontend contiene Segel"; fallos=1
  fi

  if curl -fsS "http://127.0.0.1:${MAILPIT_PORT}/api/v1/info" >/dev/null; then echo "OK  correo falso activo"; else echo "MAL correo falso inactivo"; fallos=1; fi
  [[ "$fallos" == "0" ]] || die "las verificaciones fallaron."
}

cmd_status() {
  compose ps
  docker ps --filter "name=$MAILPIT_NAME" --format '{{.Names}}\t{{.Status}}'
  cmd_verify
}

cmd_down() {
  compose stop
  docker stop "$MAILPIT_NAME" >/dev/null 2>&1 || true
}

cmd_destroy() {
  echo "Esto borra los volumenes de '$PROJECT', el correo falso y el worktree. Otros proyectos no se tocan."
  read -r -p "Escribi '$PROJECT' para confirmar: " respuesta
  [[ "$respuesta" == "$PROJECT" ]] || die "sin confirmacion."
  compose down -v --remove-orphans
  docker rm -f "$MAILPIT_NAME" >/dev/null 2>&1 || true
  git -C "$ROOT_DIR" worktree remove --force "$WORKTREE"
  echo "Listo. $ENV_FILE se conserva: borralo a mano si ya no hace falta."
}

case "${1:-}" in
  init) shift; cmd_init "$@" ;;
  check) cmd_check ;;
  up) cmd_up ;;
  status) cmd_status ;;
  down) cmd_down ;;
  destroy) cmd_destroy ;;
  *) sed -n 2,9p "${BASH_SOURCE[0]}" | sed 's/^# \?//'; exit 2 ;;
esac
