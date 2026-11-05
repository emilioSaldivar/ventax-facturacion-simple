#!/usr/bin/env bash
# Observacion de los fallos que inyecta FS (PLAN §8): F1, F3, F4, F5 y F6. No cancela facturas salvo en F3.
#   correr-fallos.sh <corrida> <manifiesto>
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CORRIDA="${1:?corrida}"; MANIFIESTO="${2:?manifiesto}"
F="$ROOT/scripts/carga/fallos.sh"
OBS="node $ROOT/scripts/carga/observar-fallos.cjs --corrida $CORRIDA"
BASE="$ROOT/test-results/carga/real-e8/documentos-base.jsonl"
P="docker exec -i fs-carga-postgres-1 psql -U facturacion_simple -d facturacion_simple -At"
emitida() { python3 -c "import json,sys
for l in open('$BASE'):
    d=json.loads(l)
    if d['estado']=='EMITIDA' and d['clave'].split('-')[-2]=='$1': print(d['id']); break"; }
paso() { echo; echo "=== $1 ($(date -u +%T))"; }

E_F040=$(emitida f040); E_F020=$(emitida f020); E_F015=$(emitida f015)

paso "base"; $OBS --etiqueta base --ref f040 --emitir --esperar-s 20 --id-emitida "$E_F040"

paso "F1 FE caido"; bash "$F" f1 inyectar
$OBS --etiqueta F1-durante --ref f040 --emitir --esperar-s 30 --id-emitida "$E_F040"
bash "$F" f1 restaurar; sleep 120
$OBS --etiqueta F1-despues --ref f040 --id-emitida "$E_F040"

paso "F3 clave compartida invalida"; bash "$F" f3 inyectar
$OBS --etiqueta F3-durante --ref f040 --emitir --esperar-s 30 --id-emitida "$E_F040" --probar-cancelar
bash "$F" f3 restaurar; sleep 20
$OBS --etiqueta F3-despues --ref f040 --id-emitida "$E_F040"

paso "F4 clave de un consumidor invalida (f015), control f010"
node - "$MANIFIESTO" <<'JS'
const { http, ADMIN_FILE, cargarOperadores } = require(process.env.LIB);
const fs = require("node:fs");
(async () => {
  const admin = JSON.parse(fs.readFileSync(ADMIN_FILE, "utf8"));
  const token = (await http("POST", "/auth/login", { cuerpo: admin })).datos.access_token;
  const r = await http("PUT", `/backoffice/facturadores/${cargarOperadores().f015.facturador_id}/api-key`, { token, cuerpo: { api_key: "clave-invalida-de-prueba-f015" }, sinLanzar: true });
  console.log("clave de f015 reemplazada:", r.status);
})();
JS
$OBS --etiqueta F4-durante --ref f015 --emitir --esperar-s 30 --id-emitida "$E_F015"
$OBS --etiqueta F4-control --ref f010 --emitir --esperar-s 30
node - "$MANIFIESTO" <<'JS'
const { http, ADMIN_FILE, cargarOperadores } = require(process.env.LIB);
const fs = require("node:fs");
(async () => {
  const admin = JSON.parse(fs.readFileSync(ADMIN_FILE, "utf8"));
  const clave = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).facturadores.find((f) => f.ref === "f015").fe_consumer_api_key;
  const token = (await http("POST", "/auth/login", { cuerpo: admin })).datos.access_token;
  const r = await http("PUT", `/backoffice/facturadores/${cargarOperadores().f015.facturador_id}/api-key`, { token, cuerpo: { api_key: clave }, sinLanzar: true });
  console.log("clave de f015 restaurada:", r.status);
})();
JS

paso "F5 la API muere en plena emision"
$OBS --etiqueta F5-antes --ref f020 --id-emitida "$E_F020"
# Directo por API: la llamada a FE dura unos 6 s, y Playwright tardaria mas en llegar.
node - <<'JS'
const { http, cargarOperadores } = require(process.env.LIB);
(async () => {
  const op = cargarOperadores().f020;
  const token = (await http("POST", "/auth/login", { cuerpo: { username: op.username, password: op.password } })).datos.access_token;
  const c = op.clientes[0]; const i = op.items[0];
  const r = await http("POST", "/facturas", { token, headers: { "idempotency-key": `obs-f5-${Date.now().toString(36)}` }, cuerpo: { condicion_venta: "CONTADO", tipo_transaccion: 2, cliente: { cliente_id: c.id, documento_tipo: "CI", documento: c.documento, razon_social: c.razon_social, direccion: "Asuncion" }, items: [{ catalogo_item_id: i.id, descripcion: i.descripcion, cantidad: 1, precio_unitario: i.precio_unitario, iva_tipo: i.iva_tipo }] } });
  console.log("factura creada", r.datos.id);
})();
JS
for _ in $(seq 1 240); do
  n=$($P -c "select count(*) from factura_emision_outbox where estado='PROCESSING' and locked_at > now() - interval '1 minute'")
  [[ "$n" != "0" ]] && break
  sleep 0.25
done
echo "En PROCESSING al matar: $n"
$P -c "select o.id, f.idempotency_key from factura_emision_outbox o join facturas_operativas f on f.id=o.factura_operativa_id where o.estado='PROCESSING' and o.locked_at > now() - interval '1 minute'" | cut -c1-90
bash "$F" f5; sleep 90
echo "Trabajos en PROCESSING tras 90 s:"; $P -c "select f.idempotency_key, o.attempts, f.estado, f.document_uuid is not null from factura_emision_outbox o join facturas_operativas f on f.id=o.factura_operativa_id where o.estado='PROCESSING'" | cut -c1-110
$OBS --etiqueta F5-despues --ref f020 --id-emitida "$E_F020"

paso "F6 reinicio de PostgreSQL"; bash "$F" f6
$OBS --etiqueta F6-durante --ref f020
docker start fs-carga-api-1 >/dev/null; sleep 15
curl -s -o /dev/null -m 5 -w "API tras levantarla a mano: %{http_code}\n" http://127.0.0.1:8291/api/v1/health
$OBS --etiqueta F6-despues --ref f020 --emitir --esperar-s 30
echo; echo "=== fin ($(date -u +%T))"
