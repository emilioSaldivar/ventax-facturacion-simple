#!/usr/bin/env node
// Resume una corrida de carga: tiempos por ruta, estados, duplicados y consumo de la VPS.
//   node scripts/segel-fs/carga-resumen.cjs <corrida>
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const corrida = process.argv[2];
const dir = path.resolve(__dirname, "../../test-results/carga", corrida);
const leer = (n) => (fs.existsSync(path.join(dir, n)) ? fs.readFileSync(path.join(dir, n), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const pct = (v, p) => { const o = [...v].sort((a, b) => a - b); return o.length ? o[Math.min(o.length - 1, Math.ceil((p / 100) * o.length) - 1)] : null; };

const req = leer("requests.jsonl");
const rutas = {};
for (const r of req) (rutas[r.ruta] ??= []).push(r);
console.log("ruta | n | p50 ms | p95 ms | max ms | estados");
for (const [ruta, v] of Object.entries(rutas).sort((a, b) => b[1].length - a[1].length)) {
  const estados = {};
  for (const r of v) estados[r.status] = (estados[r.status] ?? 0) + 1;
  const ms = v.map((r) => r.ms);
  console.log(`${ruta} | ${v.length} | ${pct(ms, 50)} | ${pct(ms, 95)} | ${Math.max(...ms)} | ${JSON.stringify(estados)}`);
}
const total5xx = req.filter((r) => r.status >= 500 || r.status === 0).length;
console.log(`requests ${req.length}, 5xx o sin conexion ${total5xx}`);

const docs = leer("documentos.jsonl");
const finales = {};
for (const d of docs) { const k = d.estado_final ?? d.resultado; finales[k] = (finales[k] ?? 0) + 1; }
console.log("documentos:", JSON.stringify(finales));
const tiempos = docs.filter((d) => d.t_final && d.historial?.length).map((d) => (d.t_final - d.historial[0].t) / 1000);
console.log("segundos hasta estado final: p50", pct(tiempos, 50), "p95", pct(tiempos, 95), "max", tiempos.length ? Math.max(...tiempos) : null);
console.log("cancelaciones:", JSON.stringify(docs.reduce((a, d) => { if (d.cancelacion_status) a[d.cancelacion_status] = (a[d.cancelacion_status] ?? 0) + 1; return a; }, {})));
console.log("notas de credito:", JSON.stringify(docs.reduce((a, d) => { if (d.nc_status) a[d.nc_status] = (a[d.nc_status] ?? 0) + 1; return a; }, {})));
const errores = leer("errores.jsonl");
const agrupados = {};
for (const e of errores) { const k = `${e.ruta} ${e.status} ${String(e.cuerpo ?? "").slice(0, 110)}`; agrupados[k] = (agrupados[k] ?? 0) + 1; }
console.log("errores:", errores.length);
for (const [k, n] of Object.entries(agrupados).sort((a, b) => b[1] - a[1]).slice(0, 10)) console.log(`  ${n} x ${k}`);

const csv = path.join(dir, "vps.csv");
if (fs.existsSync(csv)) {
  const filas = fs.readFileSync(csv, "utf8").trim().split("\n");
  const cols = filas[0].split(",");
  const datos = filas.slice(1).map((f) => f.split(",")).filter((f) => f.length === cols.length);
  const num = (c) => datos.map((f) => Number(f[cols.indexOf(c)]));
  console.log(`VPS (${datos.length} muestras): mem disponible min ${Math.min(...num("mem_disponible_mib"))} MiB, swap max ${Math.max(...num("swap_usada_mib"))} MiB, carga max ${Math.max(...num("carga_1m"))}, /var max ${Math.max(...num("var_uso_pct"))} %`);
  console.log(`Contenedores, max MiB: API FS ${Math.max(...num("fs_api_mib"))}, API FE ${Math.max(...num("fe_api_mib"))}, PG FS ${Math.max(...num("fs_pg_mib"))}, PG FE ${Math.max(...num("fe_pg_mib"))}, batch ${Math.max(...num("fe_batch_mib"))}`);
}

// Cruces con FE (FE-14, FE-15 y FE-01): el documento de FE debe ser el de esta venta, y la
// cancelacion debe firmar el CDC pedido. Un 200 o un estado local no alcanzan.
function consultar(contenedor, sql) {
  const salida = execFileSync("ssh", ["-o", "BatchMode=yes", process.env.SEGEL_HOST ?? "segel-fs", `docker exec -i ${contenedor} sh -c 'psql -q -At -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`], { input: sql }).toString();
  return JSON.parse(salida.trim() || "[]");
}
try {
  const fsDocs = consultar("segel-fs-postgres-1", "select coalesce(json_agg(x),'[]') from (select external_ref, document_uuid, numero_fiscal, cdc, tipo, estado, cancelacion_status from facturas_operativas where document_uuid is not null) x;");
  const feDocs = consultar("fe-segel-postgres-1", "select coalesce(json_agg(x),'[]') from (select document_uuid, client_idempotency_key, numero, cdc, status from de_documents) x;");
  const porUuid = new Map(feDocs.map((d) => [String(d.document_uuid), d]));
  const usos = {};
  let ajenos = 0, huerfanos = 0, ncSinClave = 0;
  for (const d of fsDocs) {
    usos[d.document_uuid] = (usos[d.document_uuid] ?? 0) + 1;
    const fe = porUuid.get(String(d.document_uuid));
    if (!fe) huerfanos += 1;
    // FE c337d9e guarda las notas de credito sin clave: no se pueden cruzar por este campo.
    else if (d.tipo === "NOTA_CREDITO" && !fe.client_idempotency_key) ncSinClave += 1;
    else if (fe.client_idempotency_key !== d.external_ref) ajenos += 1;
  }
  console.log(`FE-14 cruce: FS ${fsDocs.length}, FE ${feDocs.length}, documento ajeno ${ajenos}, sin documento en FE ${huerfanos}, NC sin clave en FE ${ncSinClave}, uuid compartido ${Object.values(usos).filter((n) => n > 1).length}`);
  console.log("FE estados:", JSON.stringify(feDocs.reduce((a, d) => { a[d.status] = (a[d.status] ?? 0) + 1; return a; }, {})));
  const trabados = consultar("fe-segel-postgres-1", "select coalesce(json_agg(x),'[]') from (select id, numero, status from de_documents where status='DRAFT' and xml_signed is null) x;");
  const repetidos = consultar("fe-segel-postgres-1", "select coalesce(json_agg(x),'[]') from (select establecimiento, punto_expedicion, numero, count(*) n from de_documents group by 1,2,3 having count(*)>1) x;");
  console.log(`FE-15 trabados: ${trabados.length}. Numeros repetidos en FE: ${repetidos.length}`);
  const eventos = consultar("fe-segel-postgres-1", "select coalesce(json_agg(x),'[]') from (select id, type, status, cdc, position(cdc in coalesce(payload_xml,'')) > 0 cdc_en_xml from de_events where cdc is not null) x;");
  const fsCanceladas = fsDocs.filter((d) => d.cancelacion_status);
  const cdcEventos = new Set(eventos.map((e) => e.cdc));
  console.log(`FE-01: eventos ${eventos.length}, firma con otro CDC ${eventos.filter((e) => !e.cdc_en_xml).length}, cancelaciones en FS ${fsCanceladas.length}, sin evento con su CDC ${fsCanceladas.filter((d) => !cdcEventos.has(d.cdc)).length}`);
} catch (e) {
  console.log("sin cruce con FE:", e.message.slice(0, 200));
}

const prefijo = `cg-${corrida}-%`;
const sql = `
select 'fs_estado', estado, tipo, count(*) from facturas_operativas where idempotency_key like '${prefijo}' or idempotency_key like 'nc-${corrida}-%' group by 2,3 order by 2,3;
select 'dup_numero_fiscal', count(*) from (select numero_fiscal from facturas_operativas where numero_fiscal is not null group by numero_fiscal, tipo having count(*) > 1) x;
select 'dup_idempotencia', count(*) from (select idempotency_key from facturas_operativas group by idempotency_key having count(*) > 1) x;
select 'cdc_repetido', count(*) from (select cdc from facturas_operativas where cdc is not null group by cdc having count(*) > 1) x;
select 'cancelacion', cancelacion_status, count(*) from facturas_operativas where idempotency_key like '${prefijo}' and cancelacion_status is not null group by 2;
select 'rechazo_sifen', sifen_result_code, left(sifen_result_message, 80), count(*) from facturas_operativas where (idempotency_key like '${prefijo}' or idempotency_key like 'nc-${corrida}-%') and estado not in ('EMITIDA','CANCELADA','ANULADA') and sifen_result_code is not null group by 2,3;
`;
try {
  console.log(execFileSync("ssh", ["-o", "BatchMode=yes", process.env.SEGEL_HOST ?? "segel-fs", "docker exec -i segel-fs-postgres-1 sh -c 'psql -q -At -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\"'"], { input: sql }).toString());
} catch (e) {
  console.log("sin datos de la base:", e.message.slice(0, 200));
}
