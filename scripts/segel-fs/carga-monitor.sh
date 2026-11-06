#!/usr/bin/env bash
# Muestrea la VPS durante una corrida y escribe test-results/carga/<corrida>/vps.csv.
# Avisa con la linea CORTAR cuando se cruza un limite de SPEC_CARGA_SEGEL_FS RN-04.
#   carga-monitor.sh <corrida> [cada_segundos]
set -uo pipefail

CORRIDA="${1:?corrida}"
CADA="${2:-15}"
HOST="${SEGEL_HOST:-segel-fs}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR="$ROOT/test-results/carga/$CORRIDA"
mkdir -p "$DIR"
CSV="$DIR/vps.csv"
[[ -f "$CSV" ]] || echo "hora,mem_disponible_mib,swap_usada_mib,carga_1m,var_uso_pct,reiniciando,fs_api_mib,fe_api_mib,fs_pg_mib,fe_pg_mib,fe_batch_mib" > "$CSV"

mib() { sed -E 's/ \/.*//' | awk '{v=$1; if (v ~ /GiB/) {sub(/GiB/,"",v); print int(v*1024)} else if (v ~ /MiB/) {sub(/MiB/,"",v); print int(v)} else if (v ~ /KiB/) {print 0} else print 0}'; }

while true; do
  salida="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$HOST" '
    free -m | awk "/^Mem:/{printf \"%s \", \$7} /^Swap:/{printf \"%s \", \$3}"
    cut -d" " -f1 /proc/loadavg | tr "\n" " "
    df --output=pcent /var | tail -1 | tr -d " %\n"; echo -n " "
    docker ps -a --filter name=segel --filter status=restarting --format "{{.Names}}" | wc -l
    docker stats --no-stream --format "{{.Name}}={{.MemUsage}}" segel-fs-api-1 fe-segel-api-1 segel-fs-postgres-1 fe-segel-postgres-1 fe-segel-worker-batch-1
  ' 2>/dev/null)"
  if [[ -z "$salida" ]]; then
    echo "$(date +%T),sin-conexion" >> "$CSV"
    sleep "$CADA"
    continue
  fi
  read -r mem swap carga var reiniciando <<< "$(echo "$salida" | head -1)"
  valor() { echo "$salida" | grep "^$1=" | cut -d= -f2 | mib; }
  echo "$(date +%T),$mem,$swap,$carga,$var,$reiniciando,$(valor segel-fs-api-1),$(valor fe-segel-api-1),$(valor segel-fs-postgres-1),$(valor fe-segel-postgres-1),$(valor fe-segel-worker-batch-1)" >> "$CSV"
  if (( var > 85 )) || (( mem < 300 )) || (( reiniciando > 0 )); then
    echo "CORTAR $(date +%T) var=$var mem=$mem reiniciando=$reiniciando" | tee -a "$DIR/cortes.txt"
  fi
  sleep "$CADA"
done
