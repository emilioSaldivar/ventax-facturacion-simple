#!/usr/bin/env bash
# Prepara la instancia Segel desde la estacion. No arranca nada: el arranque es up.sh.
#
#   deploy.sh bundle <dir>   arma en <dir> los archivos que van al servidor (tambien para ensayo local)
#   deploy.sh files          copia esos archivos a $SEGEL_HOST:$REMOTE_ROOT
#   deploy.sh images         transfiere las imagenes construidas con build-images.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SEGEL_HOST="${SEGEL_HOST:-segel-fs}"
REMOTE_ROOT="${REMOTE_ROOT:-/home/esaldivar/segel}"
FS_REF="${FS_REF:-HEAD}"
FE_REPO="${FE_REPO:-$ROOT_DIR/../../FACTURACION_ELECTRONICA_MVP/facturacion-electronica}"
FE_REF="${FE_REF:-segel-rc1}"

IMAGES=(
  segel-fs-api segel-fs-migrate segel-fs-frontend segel-fs-dnit-ruc-loader-cron
  fe-segel-api fe-segel-migrate fe-segel-worker-batch fe-segel-worker-status-sync fe-segel-frontend
)

bundle() {
  local dir="$1"
  mkdir -p "$dir/bin/templates" "$dir/fs/dnit-ruc-loader/data" "$dir/fe/frontend" "$dir/backups/fs" "$dir/backups/fe"
  git -C "$ROOT_DIR" show "$FS_REF:docker-compose.yml" > "$dir/fs/docker-compose.yml"
  git -C "$FE_REPO" show "$FE_REF:docker-compose.prod.yml" > "$dir/fe/docker-compose.prod.yml"
  git -C "$ROOT_DIR" show "$FS_REF:infra/segel-fs/fs.env.example" > "$dir/bin/templates/fs.env.example"
  git -C "$ROOT_DIR" show "$FS_REF:infra/segel-fs/fe.env.example" > "$dir/bin/templates/fe.env.example"
  git -C "$ROOT_DIR" show "$FS_REF:db/seeds/002_planes_comerciales.sql" > "$dir/bin/templates/planes.sql"
  for script in init-env.sh up.sh bootstrap.sh; do
    git -C "$ROOT_DIR" show "$FS_REF:scripts/segel-fs/$script" > "$dir/bin/$script"
    chmod +x "$dir/bin/$script"
  done
}

preflight() {
  ssh "$SEGEL_HOST" "docker ps >/dev/null && mkdir -p '$REMOTE_ROOT' && df -h /var '$REMOTE_ROOT'" || {
    echo "$SEGEL_HOST no esta listo: hace falta acceso a Docker y poder crear $REMOTE_ROOT." >&2
    exit 1
  }
}

case "${1:-}" in
  bundle)
    [[ -n "${2:-}" ]] || { echo "Uso: deploy.sh bundle <dir>" >&2; exit 2; }
    bundle "$2"
    ;;
  files)
    preflight
    work_dir="$(mktemp -d)"
    trap 'rm -rf "$work_dir"' EXIT
    bundle "$work_dir"
    # Nunca incluye .env.segel: ese archivo solo existe en el servidor.
    tar -C "$work_dir" -cf - . | ssh "$SEGEL_HOST" "tar -C '$REMOTE_ROOT' --no-same-owner -xf -"
    ;;
  images)
    preflight
    docker save "${IMAGES[@]}" | nice -n 19 gzip -1 | ssh "$SEGEL_HOST" 'gunzip | docker load'
    ;;
  *)
    echo "Uso: deploy.sh {bundle <dir>|files|images}" >&2
    exit 2
    ;;
esac
