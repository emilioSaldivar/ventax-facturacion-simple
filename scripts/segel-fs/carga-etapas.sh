#!/usr/bin/env bash
# Corre E1 a E4 en orden, una por vez (SPEC_CARGA_SEGEL_FS). Solo contra la instancia de test,
# con el tunel activo. E4 reinicia API FS, API FE y Postgres FS con la carga en curso.
#   carga-etapas.sh [e1|e2|e3|e4 ...]
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
export CARGA_PROYECTO=segel-carga CARGA_API_BASE=http://localhost:18092/api/v1
HOST="${SEGEL_HOST:-segel-fs}"
[[ "$(ssh -o BatchMode=yes "$HOST" 'grep ^FE_API_ENV= ~/segel/fs/.env.segel')" == "FE_API_ENV=test" ]] || { echo "Solo ambiente test (RN-01)." >&2; exit 1; }

COMUN=(--sin-correo --prob-cancelar 0.1 --prob-nc 0.1 --prob-reintento 0.05 --poll-s 30 --limite-final-s 3000 --ventana-login-s 5)

correr() {
  local corrida="$1"; shift
  bash scripts/segel-fs/carga-monitor.sh "$corrida" 15 &
  local monitor=$!
  node scripts/carga/simulate.cjs --corrida "$corrida" "$@" "${COMUN[@]}" 2>&1 | tail -1 | cut -c1-300
  kill "$monitor" 2>/dev/null
  echo "=== $corrida"
  node scripts/segel-fs/carga-resumen.cjs "$corrida" 2>&1 | cut -c1-190
}

reiniciar_con_carga() {
  # Con la carga en curso, cada 6 min y esperando que el servicio vuelva sano.
  for contenedor in segel-fs-api-1 fe-segel-api-1 segel-fs-postgres-1; do
    sleep 360
    inicio=$(date +%s)
    ssh -o BatchMode=yes "$HOST" "docker restart $contenedor >/dev/null"
    for _ in $(seq 1 60); do
      estado="$(ssh -o BatchMode=yes "$HOST" "docker inspect $contenedor --format '{{.State.Health.Status}}'" 2>/dev/null)"
      [[ "$estado" == "healthy" ]] && break
      sleep 2
    done
    echo "$(date +%T) reinicio $contenedor: $estado en $(( $(date +%s) - inicio )) s" | tee -a test-results/carga/e4-fallas/reinicios.txt
  done
}

for etapa in "${@:-e1 e2 e3 e4}"; do
  for e in $etapa; do
    case "$e" in
      e1) correr e1-base --operadores 5 --total-por-hora 60 --duracion-s 900 ;;
      e2) correr e2-doble --operadores 10 --total-por-hora 120 --duracion-s 900 ;;
      e3) for i in 1 2 3; do correr "e3-rafaga-$i" --operadores 10 --escenario rafaga --ventana-rafaga-s 60 --duracion-s 60 --seed "$i"; done ;;
      e4) mkdir -p test-results/carga/e4-fallas; reiniciar_con_carga & correr e4-fallas --operadores 5 --total-por-hora 60 --duracion-s 1500; wait ;;
      *) echo "Etapa desconocida: $e" >&2; exit 2 ;;
    esac
  done
done
