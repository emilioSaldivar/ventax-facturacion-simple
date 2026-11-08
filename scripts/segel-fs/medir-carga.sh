#!/usr/bin/env bash
# Medicion y mapa del comportamiento de una prueba de carga masiva (PLAN_DESPLIEGUE_SEGEL_FS_v0.2, seccion 4.1;
# TASKS SF2-018a). Solo lee: no escribe en las bases ni cambia banderas.
#
#   medir-carga.sh inicio <corrida>   linea base y muestreo en segundo plano
#   medir-carga.sh marca  <corrida> <texto>   anota un hito (subida, confirmacion, ...) con la hora
#   medir-carga.sh fin    <corrida>   corta el muestreo, toma el cierre y escribe resumen.md
#
# MEDIR_DESTINO=local (por defecto: contenedores de la estacion) o vps (por ssh a SEGEL_HOST, segel-fs).
# Salida en test-results/medicion/<corrida>/, fuera de git.
set -uo pipefail

ACCION="${1:?inicio|marca|fin}"
CORRIDA="${2:?corrida}"
DESTINO="${MEDIR_DESTINO:-local}"
HOST="${SEGEL_HOST:-segel-fs}"
FE_PG="${MEDIR_FE_PG:-fe-segel-postgres-1}"
FS_PG="${MEDIR_FS_PG:-segel-fs-postgres-1}"
FILTRO_CONTENEDORES="${MEDIR_CONTENEDORES:-fe-segel-|segel-fs-}"
KUDE_DIR="${MEDIR_KUDE_DIR:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR="$ROOT/test-results/medicion/$CORRIDA"
mkdir -p "$DIR"

remoto() {
  if [[ "$DESTINO" == "vps" ]]; then ssh -o BatchMode=yes "$HOST" "$@"; else bash -c "$*"; fi
}
# El SQL viaja por la entrada estandar: asi las comillas simples sobreviven al shell local y al de ssh.
sql_en() { printf '%s\n' "$2" | remoto "docker exec -i $1 sh -c 'psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -At -F, -v ON_ERROR_STOP=1'"; }
fe_sql() { sql_en "$FE_PG" "$1"; }
fs_sql() { sql_en "$FS_PG" "$1"; }
ahora() { date -u +%Y-%m-%dT%H:%M:%SZ; }

desde() { cat "$DIR/inicio.txt"; }

foto() {
  local etiqueta="$1"
  {
    echo "## $etiqueta ($(ahora))"
    echo '```'
    remoto "docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}'" | grep -E "$FILTRO_CONTENEDORES" | sort
    echo
    remoto "df -h / /var /home 2>/dev/null | sort -u"
    echo
    echo "FE documentos por estado y correo:"
    fe_sql "select status, coalesce(email_status,'-'), count(*) from de_documents group by 1,2 order by 1,2"
    echo "FE lotes abiertos:"
    fe_sql "select status, count(*) from de_batches where completed_at is null group by 1"
    echo "FE agenda de lotes (env, intervalo, poll_seconds, poll_max_tries):"
    fe_sql "select env, interval_minutes, poll_seconds, poll_max_tries from batch_dispatch_defaults order by env"
    echo "FE numeradores (emisor, tipo, siguiente numero, forma):"
    fe_sql "select emisor_id, tipo_documento, siguiente_numero, coalesce(forma_numeracion,'-') from numeradores_documentos order by 1,2"
    echo "FS documentos por estado:"
    fs_sql "select tipo, estado, coalesce(email_estado,'-'), count(*) from facturas_operativas where deleted_at is null group by 1,2,3 order by 1,2,3"
    echo "Tamano de las bases:"
    fe_sql "select pg_size_pretty(pg_database_size(current_database()))"
    fs_sql "select pg_size_pretty(pg_database_size(current_database()))"
    if [[ -n "$KUDE_DIR" ]]; then echo "kude-cache:"; remoto "du -sh $KUDE_DIR"; fi
    echo "Reinicios por contenedor:"
    remoto "docker ps -a --format '{{.Names}}' | grep -E '$FILTRO_CONTENEDORES' | xargs -r docker inspect -f '{{.Name}} restarts={{.RestartCount}} oom={{.State.OOMKilled}} status={{.State.Status}}'"
    echo '```'
  } >> "$DIR/resumen.md" 2>&1
}

muestrear() {
  local inicio
  inicio="$(desde)"
  echo "hora,contenedor,mem,cpu" > "$DIR/stats.csv"
  echo "hora,carga,estado,leidos,validada,confirmada,iniciada,finalizada" > "$DIR/cargas.csv"
  echo "hora,status,email_status,cantidad" > "$DIR/documentos.csv"
  local n=0
  while [[ ! -f "$DIR/parar" ]]; do
    local h
    h="$(ahora)"
    remoto "docker stats --no-stream --format '{{.Name}},{{.MemUsage}},{{.CPUPerc}}'" 2>/dev/null \
      | grep -E "$FILTRO_CONTENEDORES" | sed "s#^#$h,#" >> "$DIR/stats.csv"
    if (( n % 2 == 0 )); then
      fe_sql "select id, estado, comprobantes_leidos, validada_at, confirmada_at, iniciada_at, finalizada_at from cargas where created_at >= '$inicio' order by created_at" 2>/dev/null \
        | sed "s#^#$h,#" >> "$DIR/cargas.csv"
    fi
    if (( n % 6 == 0 )); then
      fe_sql "select status, coalesce(email_status,'-'), count(*) from de_documents where created_at >= '$inicio' group by 1,2" 2>/dev/null \
        | sed "s#^#$h,#" >> "$DIR/documentos.csv"
    fi
    n=$((n + 1))
    sleep 5
  done
}

case "$ACCION" in
  inicio)
    [[ -f "$DIR/muestreo.pid" ]] && { echo "Ya hay un muestreo para $CORRIDA" >&2; exit 1; }
    ahora > "$DIR/inicio.txt"
    rm -f "$DIR/parar"
    echo "# Medicion $CORRIDA ($DESTINO)" > "$DIR/resumen.md"
    foto "Linea base"
    muestrear > "$DIR/muestreo.log" 2>&1 &
    echo $! > "$DIR/muestreo.pid"
    echo "Muestreo iniciado en $DIR (inicio $(desde))"
    ;;
  marca)
    echo "$(ahora),${3:?texto}" >> "$DIR/marcas.csv"
    ;;
  fin)
    touch "$DIR/parar"
    if [[ -f "$DIR/muestreo.pid" ]]; then
      pid="$(cat "$DIR/muestreo.pid")"
      for _ in $(seq 1 30); do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
      rm -f "$DIR/muestreo.pid"
    fi
    ahora > "$DIR/fin.txt"
    inicio="$(desde)"
    foto "Cierre"
    {
      echo "## Cargas (FE, desde $inicio)"
      echo '```'
      echo "id,estado,leidos,s_validar,s_confirmar_a_iniciar,s_iniciar_a_finalizar,s_total"
      fe_sql "select id, estado, comprobantes_leidos,
                round(extract(epoch from validada_at - created_at)),
                round(extract(epoch from iniciada_at - confirmada_at)),
                round(extract(epoch from finalizada_at - iniciada_at)),
                round(extract(epoch from finalizada_at - created_at))
              from cargas where created_at >= '$inicio' order by created_at"
      echo '```'
      echo "## Lotes (FE, desde $inicio)"
      echo '```'
      echo "lotes,documentos,max_consultas,prom_consultas,s_recepcion_max"
      fe_sql "select count(*), coalesce(sum(doc_count),0), coalesce(max(poll_attempt_count),0), round(avg(poll_attempt_count),1),
                round(max(extract(epoch from completed_at - created_at)))
              from de_batches where created_at >= '$inicio'"
      echo "status de lotes:"
      fe_sql "select status, coalesce(sifen_receive_code,'-'), count(*) from de_batches where created_at >= '$inicio' group by 1,2"
      echo "maximo de lotes por minuto:"
      fe_sql "select coalesce(max(c),0) from (select date_trunc('minute', created_at), count(*) c from de_batches where created_at >= '$inicio' group by 1) t"
      echo '```'
      echo "## Documentos (FE, desde $inicio)"
      echo '```'
      fe_sql "select status, coalesce(email_status,'-'), count(*) from de_documents where created_at >= '$inicio' group by 1,2 order by 1,2"
      echo "rechazos 1002 (posible falso duplicado):"
      fe_sql "select count(*) from de_documents where created_at >= '$inicio' and status = 'REJECTED' and sifen_last_status::text like '%1002%'"
      echo "correos reintentando (PENDING con error):"
      fe_sql "select count(*) from de_documents where created_at >= '$inicio' and email_status = 'PENDING' and email_error is not null"
      echo '```'
      echo "## Picos por contenedor (muestreo cada 5 s)"
      echo '```'
      awk -F, 'NR>1 {
          split($3, m, " / "); v=m[1]; mult=1;
          if (v ~ /GiB/) mult=1024; else if (v ~ /KiB/) mult=1/1024;
          gsub(/[A-Za-z]/, "", v); mem=v*mult; cpu=$4; gsub(/%/, "", cpu);
          if (mem > pm[$2]) pm[$2]=mem; if (cpu+0 > pc[$2]) pc[$2]=cpu+0
        } END { tot=0; for (c in pm) { printf "%s pico_mem=%.0fMiB pico_cpu=%.0f%%\n", c, pm[c], pc[c]; tot+=pm[c] }
                printf "suma de picos=%.0fMiB\n", tot }' "$DIR/stats.csv" | sort
      echo '```'
      if [[ -f "$DIR/marcas.csv" ]]; then echo "## Marcas"; echo '```'; cat "$DIR/marcas.csv"; echo '```'; fi
    } >> "$DIR/resumen.md" 2>&1
    echo "Resumen en $DIR/resumen.md (inicio $inicio, fin $(cat "$DIR/fin.txt"))"
    ;;
  *) echo "Uso: medir-carga.sh inicio|marca|fin <corrida> [texto]" >&2; exit 2 ;;
esac
