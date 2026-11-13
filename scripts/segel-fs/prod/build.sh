#!/usr/bin/env bash
# Estacion: imagenes de FS desde el tag (git archive) y carga en segel-fs (PLAN v0.4 §2.1). Uso: build.sh <tag>
# La transferencia a segel-fs requiere autorizacion explicita del usuario.
set -euo pipefail
TAG="${1:?tag}"
REPO=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$REPO"
SHA=$(git rev-parse --short "$TAG^{commit}")
echo "tag $TAG -> $SHA"
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
git archive "$TAG" | tar -x -C "$W"
docker build -q --network host --build-arg BUILD_COMMIT_SHA="$SHA" -f "$W/infra/docker/api.Dockerfile" -t "segel-fs-prod-api:$SHA" "$W" >/dev/null
docker build -q --network host --build-arg BUILD_COMMIT_SHA="$SHA" -f "$W/infra/docker/frontend.Dockerfile" -t "segel-fs-prod-frontend:$SHA" "$W" >/dev/null
docker images --format '{{.Repository}}:{{.Tag}} {{.ID}} {{.Size}}' | grep "segel-fs-prod-.*:$SHA"
echo "transfiriendo a segel-fs..."
docker save "segel-fs-prod-api:$SHA" "segel-fs-prod-frontend:$SHA" | gzip -1 | ssh -o BatchMode=yes segel-fs 'gunzip | docker load'
ssh -o BatchMode=yes segel-fs "docker images --format '{{.Repository}}:{{.Tag}} {{.ID}}' | grep 'segel-fs-prod-.*:$SHA'"
echo "SHA=$SHA"
