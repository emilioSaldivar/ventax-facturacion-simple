#!/usr/bin/env bash
# Construye en la estacion las imagenes de la instancia Segel desde commits, no desde el
# directorio de trabajo (SPEC_DESPLIEGUE_SEGEL_FS CA-01). Los nombres son los que Compose
# espera por proyecto: <proyecto>-<servicio>.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FS_REF="${FS_REF:-HEAD}"
FE_REPO="${FE_REPO:-$ROOT_DIR/../../FACTURACION_ELECTRONICA_MVP/facturacion-electronica}"
FE_REF="${FE_REF:-segel-rc4.1}"

FS_SHA="$(git -C "$ROOT_DIR" rev-parse --short "$FS_REF")"
FE_SHA="$(git -C "$FE_REPO" rev-parse --short "$FE_REF")"

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
mkdir -p "$WORK_DIR/fs" "$WORK_DIR/fe"
git -C "$ROOT_DIR" archive "$FS_REF" | tar -x -C "$WORK_DIR/fs"
git -C "$FE_REPO" archive "$FE_REF" | tar -x -C "$WORK_DIR/fe"

echo "FS $FS_SHA / FE $FE_SHA"

# --network host: el DNS del bridge de Docker falla en algunas redes de la estacion.
build() { docker build --network host "$@"; }

build --build-arg "BUILD_COMMIT_SHA=$FS_SHA" -f "$WORK_DIR/fs/infra/docker/api.Dockerfile" \
  -t segel-fs-api -t segel-fs-migrate "$WORK_DIR/fs"
build --build-arg "BUILD_COMMIT_SHA=$FS_SHA" -f "$WORK_DIR/fs/infra/docker/frontend.Dockerfile" \
  -t segel-fs-frontend "$WORK_DIR/fs"
build -t segel-fs-dnit-ruc-loader-cron "$WORK_DIR/fs/dnit-ruc-loader"

build -t fe-segel-api -t fe-segel-migrate -t fe-segel-worker-batch -t fe-segel-worker-status-sync \
  -t fe-segel-worker-cargas -t fe-segel-worker-correo "$WORK_DIR/fe"
build -t fe-segel-frontend "$WORK_DIR/fe/frontend"

echo "Imagenes listas: FS $FS_SHA / FE $FE_SHA"
