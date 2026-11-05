#!/usr/bin/env node
// Muestreo durante una corrida (PLAN §5): colas, PostgreSQL y recursos. Se detiene con Ctrl-C o
// con --duracion-s. Solo lee, y solo sobre los contenedores de fs-carga.
//
//   node scripts/carga/collect.cjs --corrida r1 [--cada-s 5] [--duracion-s 1200] [--contenedores-fe 'fe-aislado']
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { API_CONTAINER, corridaDir, idCorrida, jsonl, parseArgs, psql } = require("./lib.cjs");

const correr = promisify(execFile);
const args = parseArgs();
const corrida = args.corrida ?? idCorrida();
const cadaMs = Number(args["cada-s"] ?? 5) * 1000;
const duracionMs = args["duracion-s"] ? Number(args["duracion-s"]) * 1000 : null;
const filtroFe = args["contenedores-fe"] ? new RegExp(String(args["contenedores-fe"])) : null;
const dir = corridaDir(corrida);
const muestras = jsonl(path.join(dir, "muestras.jsonl"));
const recursos = jsonl(path.join(dir, "recursos.jsonl"));

const SQL_MUESTRA = `
select json_build_object(
  'cola', (select coalesce(json_object_agg(estado, c), '{}') from (select estado, count(*) c from factura_emision_outbox group by 1) t),
  'cola_lista', (select count(*) from factura_emision_outbox where estado in ('PENDING','FAILED_TEMP') and next_attempt_at <= now()),
  'cola_antiguedad_s', (select round(coalesce(extract(epoch from now() - min(created_at)), 0)) from factura_emision_outbox where estado in ('PENDING','FAILED_TEMP') and next_attempt_at <= now()),
  'processing_vencidos', (select count(*) from factura_emision_outbox where estado = 'PROCESSING' and locked_at < now() - interval '2 minutes'),
  'verif_vencidos', (select count(*) from facturas_operativas where verificacion_next_at <= now()),
  'verif_retraso_s', (select round(coalesce(extract(epoch from now() - min(verificacion_next_at)), 0)) from facturas_operativas where verificacion_next_at <= now()),
  'estados', (select coalesce(json_object_agg(estado, c), '{}') from (select estado, count(*) c from facturas_operativas where deleted_at is null group by 1) t),
  'pg_conexiones', (select count(*) from pg_stat_activity where datname = current_database()),
  'pg_activas', (select count(*) from pg_stat_activity where datname = current_database() and state = 'active'),
  'pg_esperando_lock', (select count(*) from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'),
  'pg_tamano_bytes', pg_database_size(current_database())
);`;

function bytes(texto) {
  const m = String(texto).trim().match(/^([\d.]+)\s*([KMGT]?i?B)$/i);
  if (!m) return null;
  const factor = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KIB: 1024, MIB: 1024 ** 2, GIB: 1024 ** 3, TIB: 1024 ** 4 }[m[2].toUpperCase()];
  return Math.round(Number(m[1]) * factor);
}

async function muestrearRecursos() {
  const { stdout } = await correr("docker", ["stats", "--no-stream", "--format", "{{json .}}"], { maxBuffer: 16 * 1024 * 1024 });
  const t = Date.now();
  for (const linea of stdout.trim().split("\n")) {
    if (!linea) continue;
    const c = JSON.parse(linea);
    if (!c.Name.startsWith("fs-carga") && !(filtroFe && filtroFe.test(c.Name))) continue;
    recursos.write({ t, nombre: c.Name, cpu: parseFloat(c.CPUPerc), mem: bytes(c.MemUsage.split("/")[0]), pids: Number(c.PIDs) });
  }
  recursos.write({ t, nombre: "host", cpu_carga_1m: os.loadavg()[0], mem_libre: os.freemem() });
}

function metadatos() {
  // Solo se lee el modo; las demas variables del contenedor no salen de este filtro.
  const meta = {
    corrida,
    inicio: new Date().toISOString(),
    hostname: os.hostname(),
    cpus: os.cpus().length,
    mem_total: os.totalmem()
  };
  return correr("docker", ["inspect", API_CONTAINER, "--format", "{{range .Config.Env}}{{println .}}{{end}}"]).then(({ stdout }) => {
    const entorno = Object.fromEntries(stdout.split("\n").filter(Boolean).map((l) => [l.split("=")[0], l.split("=").slice(1).join("=")]));
    meta.fe_gateway_mode = entorno.FE_GATEWAY_MODE;
    meta.fe_api_env = entorno.FE_API_ENV;
    meta.app_version = entorno.APP_VERSION;
    meta.outbox_interval_ms = entorno.FE_OUTBOX_WORKER_INTERVAL_MS;
    meta.verify_interval_ms = entorno.FE_VERIFY_WORKER_INTERVAL_MS;
    meta.verify_batch = entorno.FE_VERIFY_BATCH_SIZE;
    return meta;
  });
}

async function main() {
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(await metadatos(), null, 2));
  const fin = duracionMs ? Date.now() + duracionMs : Infinity;
  let detener = false;
  process.on("SIGINT", () => { detener = true; });
  process.on("SIGTERM", () => { detener = true; });

  let fallosSeguidos = 0;
  while (!detener && Date.now() < fin) {
    const inicio = Date.now();
    try {
      muestras.write({ t: inicio, ...JSON.parse(psql(SQL_MUESTRA).trim()) });
      await muestrearRecursos();
      fallosSeguidos = 0;
    } catch (error) {
      // Con la base caida (F6) la serie debe mostrar el hueco, no abortar la corrida.
      fallosSeguidos += 1;
      muestras.write({ t: inicio, error: String(error.message).split("\n")[0].slice(0, 200) });
      if (fallosSeguidos === 1) console.error(`Muestreo con error: ${String(error.message).split("\n")[0]}`);
    }
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, cadaMs - (Date.now() - inicio))));
  }
  await Promise.all([muestras.end(), recursos.end()]);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(2);
});
