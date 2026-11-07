#!/usr/bin/env bash
# Prepara en la estacion el ensayo local de la segunda entrega (PLAN_DESPLIEGUE_SEGEL_FS_v0.2, seccion 2):
# mismo paquete y mismas imagenes que van a la VPS, en SIFEN test, en puertos altos. No arranca nada
# ni emite: el arranque y los secretos son del usuario. Nunca toca segel-fs.
#
#   ensayo-local.sh [dir]   por defecto .local/segel-ensayo, fuera de git
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR="${1:-$ROOT_DIR/.local/segel-ensayo}"
FS_PORT=18492
FE_PORT=18500

[[ -e "$DIR/fs/.env.segel" ]] && { echo "$DIR ya tiene un ensayo. Borralo a mano si queres empezar de cero." >&2; exit 1; }

mkdir -p "$DIR"
chmod 700 "$DIR"
bash "$ROOT_DIR/scripts/segel-fs/deploy.sh" bundle "$DIR"
SEGEL_BIND_IP=127.0.0.1 SEGEL_FS_PORT=$FS_PORT SEGEL_FE_PORT=$FE_PORT SEGEL_FS_API_PORT=18491 SEGEL_FE_API_PORT=18489 SEGEL_PG_PORT=15494 \
  bash "$DIR/bin/init-env.sh" test

# Sin esto, los enlaces publicos y los correos apuntarian al dominio de produccion.
sed -i \
  -e "s|^APP_ORIGIN=.*|APP_ORIGIN=http://localhost:$FS_PORT|" \
  -e "s|^BACKOFFICE_ORIGIN=.*|BACKOFFICE_ORIGIN=http://localhost:$FS_PORT|" \
  -e "s|^PUBLIC_APP_BASE_URL=.*|PUBLIC_APP_BASE_URL=http://localhost:$FS_PORT|" \
  "$DIR/fs/.env.segel"
sed -i \
  -e "s|^CORS_ALLOW_ORIGINS=.*|CORS_ALLOW_ORIGINS=http://localhost:$FE_PORT|" \
  -e "s|^PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=http://localhost:$FS_PORT|" \
  -e "s|^PUBLIC_API_BASE_URL=.*|PUBLIC_API_BASE_URL=http://localhost:$FE_PORT|" \
  "$DIR/fe/.env.segel"

cat <<EOF

Paquete listo en $DIR. Falta, en este orden:
  1. Cargar la contrasena SMTP en fs/.env.segel y fe/.env.segel.
  2. bash $DIR/bin/up.sh
  3. bash $DIR/bin/bootstrap.sh
  4. Facturador: cargar-facturador.py --ambiente test --carga-masiva 1000 \\
       --fe http://localhost:$FE_PORT/v1 --fs http://localhost:$FS_PORT/api/v1 ...
  5. Certificado y CSC en http://localhost:$FE_PORT/
  6. App en http://localhost:$FS_PORT/app/ . Guion: PLAN_DESPLIEGUE_SEGEL_FS_v0.2, seccion 2.3.
EOF
