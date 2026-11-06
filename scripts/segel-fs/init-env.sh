#!/usr/bin/env bash
# Corre en el servidor. Genera los .env.segel con secretos propios de esta instancia, una
# sola vez: API_KEY_SECRET no se puede rotar, porque invalida las claves ya emitidas.
set -euo pipefail

# Uso: init-env.sh test|prod. El ambiente se elige siempre a mano: un valor por defecto
# podria dejar produccion emitiendo en test, o al reves.
case "${1:-}" in
  test) ambiente=test; app_env=staging; kude_ambiente=1 ;;
  prod) ambiente=prod; app_env=production; kude_ambiente=2 ;;
  *) echo "Uso: init-env.sh test|prod" >&2; exit 2 ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FS_ENV="$ROOT/fs/.env.segel"
FE_ENV="$ROOT/fe/.env.segel"

for file in "$FS_ENV" "$FE_ENV"; do
  if [[ -e "$file" ]]; then
    echo "$file ya existe; no se sobrescribe." >&2
    exit 1
  fi
done

secret() { openssl rand -hex 32; }

# La clave de FS hacia FE es una sola en los dos archivos.
fe_api_key="$(secret)"
fe_api_key_secret="$(secret)"
fe_admin_auth_secret="$(secret)"
fe_postgres_password="$(secret)"
fs_postgres_password="$(secret)"
jwt_access_secret="$(secret)"
jwt_refresh_secret="$(secret)"

render() {
  sed \
    -e "s|__ROOT__|$ROOT|g" \
    -e "s|__AMBIENTE__|$ambiente|g" \
    -e "s|__APP_ENV__|$app_env|g" \
    -e "s|__KUDE_AMBIENTE__|$kude_ambiente|g" \
    -e "s|__BIND_IP__|${SEGEL_BIND_IP:-10.100.0.145}|g" \
    -e "s|__FS_PORT__|${SEGEL_FS_PORT:-8092}|g" \
    -e "s|__FE_PORT__|${SEGEL_FE_PORT:-8100}|g" \
    -e "s|__FS_API_PORT__|${SEGEL_FS_API_PORT:-8091}|g" \
    -e "s|__FE_API_PORT__|${SEGEL_FE_API_PORT:-9989}|g" \
    -e "s|__PG_PORT__|${SEGEL_PG_PORT:-5434}|g" \
    -e "s|__FE_API_KEY__|$fe_api_key|g" \
    -e "s|__FE_API_KEY_SECRET__|$fe_api_key_secret|g" \
    -e "s|__FE_ADMIN_AUTH_SECRET__|$fe_admin_auth_secret|g" \
    -e "s|__FE_POSTGRES_PASSWORD__|$fe_postgres_password|g" \
    -e "s|__FS_POSTGRES_PASSWORD__|$fs_postgres_password|g" \
    -e "s|__JWT_ACCESS_SECRET__|$jwt_access_secret|g" \
    -e "s|__JWT_REFRESH_SECRET__|$jwt_refresh_secret|g" \
    "$1"
}

umask 077
render "$ROOT/bin/templates/fs.env.example" > "$FS_ENV"
render "$ROOT/bin/templates/fe.env.example" > "$FE_ENV"
echo "Generados $FS_ENV y $FE_ENV"
