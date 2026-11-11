#!/usr/bin/env bash
# Monta un tutorial: bruto.webm -> <video>.mp4 (H.264, 1440x900, sin audio), cortando las esperas largas.
# De cada espera registrada en linea.json quedan 1 s al principio y 1 s al final (PLAN §2).
#   bash scripts/tutoriales/montar.sh test-results/tutoriales/v3-facturas
set -euo pipefail
dir="${1:?carpeta del video}"
video="$(basename "$dir")"
[ -f "$dir/bruto.webm" ] || { echo "falta $dir/bruto.webm" >&2; exit 1; }
# Tramos a cortar: [inicio+1, fin-1] de cada espera de mas de 3 s; y el primer segundo en blanco.
cortes="$(node -e '
const l=require(require("path").resolve(process.argv[1],"linea.json"));
const c=[[0,1]];
for(const e of l.eventos) if(e.tipo==="espera" && e.fin-e.t>3) c.push([e.t+1,e.fin-1]);
console.log(c.map(([a,b])=>`between(t,${a.toFixed(2)},${b.toFixed(2)})`).join("+"));
' "$dir")"
ffmpeg -loglevel error -y -i "$dir/bruto.webm" \
  -vf "fps=30,select='not(${cortes})',setpts=N/30/TB,scale=1440:900:flags=lanczos,format=yuv420p" \
  -an -c:v libx264 -preset slow -crf 20 -movflags +faststart "$dir/$video.mp4"
bruto=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$dir/bruto.webm" 2>/dev/null || echo 0)
final=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$dir/$video.mp4")
echo "$video: bruto ${bruto}s -> ${final}s ($dir/$video.mp4)"
