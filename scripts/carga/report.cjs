#!/usr/bin/env node
// Informe de una corrida (PLAN §10). Reune tiempos, colas, recursos, correo y barrido de secretos.
//
//   node scripts/carga/report.cjs --corrida r1 [--manifiesto <ruta>]
//
// Una corrida en modo mock, o con el generador saturado, se marca como NO EVIDENCIA (RN-04, RN-10).
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { ADMIN_FILE, API_CONTAINER, OPERADORES_FILE, STATE_DIR, corridaDir, leerJsonSiExiste, normalizarRuta, parseArgs, percentil } = require("./lib.cjs");

const args = parseArgs();
if (!args.corrida) { console.error("Falta --corrida."); process.exit(2); }
const dir = corridaDir(args.corrida);
const MAILPIT = process.env.CARGA_MAILPIT_BASE ?? "http://127.0.0.1:8293";

// --hasta: excluye lo posterior a un corte conocido, por ejemplo una interrupcion de la maquina (RN-10: se declara).
const CORTE = args.hasta ? new Date(String(args.hasta)).getTime() : Infinity;
const UMBRALES = { lectura_p95: 500, crear_p95: 1000, kude_p95: 3000, error_5xx_pct: 0.1, cola_normal_p95_s: 60, verif_retraso_p95_s: 300 };

function leerJsonl(nombre) {
  const archivo = path.join(dir, nombre);
  if (!fs.existsSync(archivo)) return [];
  return fs.readFileSync(archivo, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((x) => !x.t || x.t < CORTE);
}

function estadisticas(valores) {
  const orden = [...valores].sort((a, b) => a - b);
  return { n: orden.length, p50: percentil(orden, 50), p95: percentil(orden, 95), p99: percentil(orden, 99), max: orden[orden.length - 1] ?? null };
}

function porRuta(requests) {
  const grupos = new Map();
  for (const r of requests) {
    if (!grupos.has(r.ruta)) grupos.set(r.ruta, { ms: [], s2: 0, s4: 0, s5: 0, red: 0 });
    const g = grupos.get(r.ruta);
    g.ms.push(r.ms);
    if (r.status === 0) g.red += 1;
    else if (r.status >= 500) g.s5 += 1;
    else if (r.status >= 400) g.s4 += 1;
    else g.s2 += 1;
  }
  return [...grupos.entries()].map(([ruta, g]) => ({ ruta, ...estadisticas(g.ms), s2: g.s2, s4: g.s4, s5: g.s5, red: g.red })).sort((a, b) => b.n - a.n);
}

/** Tiempos del lado servidor, desde los logs de pino. Solo se extraen ruta, estado y tiempo. */
function porRutaServidor(meta, simulacion) {
  if (!meta?.inicio) return [];
  let salida;
  try {
    salida = execFileSync("docker", ["logs", "--since", simulacion?.inicio ?? meta.inicio, ...(simulacion?.fin ? ["--until", simulacion.fin] : []), API_CONTAINER], { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    return [];
  }
  const grupos = new Map();
  for (const linea of salida.split("\n")) {
    if (!linea.includes('"responseTime"')) continue;
    try {
      const entrada = JSON.parse(linea);
      const ruta = `${entrada.req.method} ${normalizarRuta(entrada.req.url).replace(/^\/api\/v1/, "")}`;
      if (!grupos.has(ruta)) grupos.set(ruta, []);
      grupos.get(ruta).push(entrada.responseTime);
    } catch { /* linea cortada */ }
  }
  return [...grupos.entries()].map(([ruta, ms]) => ({ ruta, ...estadisticas(ms) })).sort((a, b) => b.n - a.n);
}

function juntarSecretos(manifiestoRuta) {
  const secretos = new Set();
  const operadores = leerJsonSiExiste(OPERADORES_FILE, {});
  for (const o of Object.values(operadores)) if (o.password) secretos.add(o.password);
  const admin = leerJsonSiExiste(ADMIN_FILE, null);
  if (admin?.password) secretos.add(admin.password);
  const envFile = path.join(STATE_DIR, "env.carga");
  if (fs.existsSync(envFile)) {
    for (const linea of fs.readFileSync(envFile, "utf8").split("\n")) {
      const m = linea.match(/^(FE_API_KEY|POSTGRES_PASSWORD|JWT_ACCESS_SECRET|JWT_REFRESH_SECRET|SMTP_PASS)=(.+)$/);
      if (m) secretos.add(m[2]);
    }
  }
  if (manifiestoRuta && fs.existsSync(manifiestoRuta)) {
    for (const f of JSON.parse(fs.readFileSync(manifiestoRuta, "utf8")).facturadores) secretos.add(f.fe_consumer_api_key);
  }
  return [...secretos].filter((s) => s && s.length >= 8);
}

/** CA-11: cuenta apariciones, sin imprimir nunca el valor encontrado. */
function barrerSecretos(manifiestoRuta) {
  const secretos = juntarSecretos(manifiestoRuta);
  const fuentes = [];
  try {
    fuentes.push(["logs de api", execFileSync("docker", ["logs", API_CONTAINER], { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] })]);
  } catch (error) {
    return { revisado: false, motivo: error.message.split("\n")[0] };
  }
  for (const nombre of fs.readdirSync(dir)) {
    const archivo = path.join(dir, nombre);
    if (fs.statSync(archivo).isFile() && /\.(jsonl?|md)$/.test(nombre)) fuentes.push([nombre, fs.readFileSync(archivo, "utf8")]);
  }
  const hallazgos = [];
  for (const [fuente, texto] of fuentes) {
    const veces = secretos.reduce((total, s) => total + (texto.includes(s) ? 1 : 0), 0);
    if (veces > 0) hallazgos.push({ fuente, secretos_distintos: veces });
  }
  return { revisado: true, secretos_buscados: secretos.length, fuentes: fuentes.length, hallazgos };
}

async function correo() {
  try {
    const { total } = await (await fetch(`${MAILPIT}/api/v1/messages?limit=1`)).json();
    let externos = 0;
    let revisados = 0;
    for (let inicio = 0; inicio < total; inicio += 500) {
      const { messages = [] } = await (await fetch(`${MAILPIT}/api/v1/messages?limit=500&start=${inicio}`)).json();
      for (const m of messages) {
        for (const destino of [...(m.To ?? []), ...(m.Cc ?? []), ...(m.Bcc ?? [])]) {
          revisados += 1;
          if (!String(destino.Address).endsWith("@carga.invalid")) externos += 1;
        }
      }
    }
    return { revisado: true, capturados: total, destinos: revisados, destinos_fuera_de_carga_invalid: externos };
  } catch (error) {
    return { revisado: false, motivo: error.message };
  }
}

function veredictoRuta(rutas, nombre, umbral) {
  const r = rutas.find((x) => x.ruta === nombre);
  if (!r) return { criterio: nombre, valor: null, umbral, ok: null };
  return { criterio: nombre, valor: r.p95, umbral, ok: r.p95 <= umbral };
}

const fmt = (v) => (v === null || v === undefined ? "-" : typeof v === "number" ? String(Math.round(v * 10) / 10) : String(v));

async function main() {
  const meta = leerJsonSiExiste(path.join(dir, "meta.json"), null);
  const simulacion = leerJsonSiExiste(path.join(dir, "simulacion.json"), null);
  const conciliacion = leerJsonSiExiste(path.join(dir, "conciliacion.json"), null);
  const aislamiento = leerJsonSiExiste(path.join(dir, "aislamiento.json"), null);
  const requests = leerJsonl("requests.jsonl");
  const muestras = leerJsonl("muestras.jsonl").filter((m) => !m.error);
  const documentos = leerJsonl("documentos.jsonl");
  const recursos = leerJsonl("recursos.jsonl");
  const rutas = porRuta(requests);
  const servidor = porRutaServidor(meta, args.hasta ? { ...simulacion, fin: String(args.hasta) } : simulacion);

  const total = requests.length;
  const con5xx = requests.filter((r) => r.status >= 500).length;
  const deRed = requests.filter((r) => r.status === 0).length;
  const pct5xx = total ? (100 * (con5xx + deRed)) / total : null;

  const motivosInvalida = [];
  if (!meta) motivosInvalida.push("Sin meta.json: no se puede afirmar modo ni commit.");
  if (meta && meta.fe_gateway_mode !== "real") motivosInvalida.push(`FE_GATEWAY_MODE=${meta.fe_gateway_mode}: no prueba la integracion (RN-04).`);
  if (simulacion && simulacion.generador_valido === false) motivosInvalida.push(`Generador saturado: atraso p99 de ${fmt(simulacion.atraso_generador_p99_ms)} ms.`);
  if (conciliacion && conciliacion.ok_fe === null) motivosInvalida.push("Conciliacion sin el lado FE: CA-02 queda sin verificar.");

  const hasta = documentos.filter((d) => d.t_final && d.estado_final === "EMITIDA").map((d) => (d.t_final - d.t_creacion) / 1000);
  const colaEdad = estadisticas(muestras.map((m) => m.cola_antiguedad_s));
  const colaLista = estadisticas(muestras.map((m) => m.cola_lista));
  const verifRetraso = estadisticas(muestras.map((m) => m.verif_retraso_s));
  const conexiones = estadisticas(muestras.map((m) => m.pg_conexiones));

  // Rendimiento observado de la cola: facturas terminadas por minuto mientras hubo trabajo pendiente.
  let rendimiento = null;
  const conCola = muestras.filter((m) => m.cola_lista > 0);
  if (conCola.length >= 2) {
    const primero = conCola[0];
    const ultimo = conCola[conCola.length - 1];
    const minutos = (ultimo.t - primero.t) / 60000;
    if (minutos > 0) rendimiento = ((ultimo.cola.DONE ?? 0) - (primero.cola.DONE ?? 0)) / minutos;
  }

  const contenedores = new Map();
  for (const r of recursos) {
    if (r.nombre === "host") continue;
    if (!contenedores.has(r.nombre)) contenedores.set(r.nombre, { cpu: [], mem: [] });
    contenedores.get(r.nombre).cpu.push(r.cpu);
    contenedores.get(r.nombre).mem.push(r.mem);
  }

  const criterios = [
    veredictoRuta(rutas, "GET /facturas", UMBRALES.lectura_p95),
    veredictoRuta(rutas, "GET /facturas/:id", UMBRALES.lectura_p95),
    veredictoRuta(rutas, "GET /clientes/search", UMBRALES.lectura_p95),
    veredictoRuta(rutas, "POST /facturas", UMBRALES.crear_p95),
    veredictoRuta(rutas, "GET /facturas/:id/files/kude.pdf", UMBRALES.kude_p95),
    { criterio: "5xx y errores de red (%)", valor: pct5xx, umbral: UMBRALES.error_5xx_pct, ok: pct5xx === null ? null : pct5xx <= UMBRALES.error_5xx_pct },
    { criterio: "Antiguedad de la cola, p95 (s)", valor: colaEdad.p95, umbral: UMBRALES.cola_normal_p95_s, ok: colaEdad.p95 === null ? null : colaEdad.p95 <= UMBRALES.cola_normal_p95_s },
    { criterio: "Retraso de verificacion, p95 (s)", valor: verifRetraso.p95, umbral: UMBRALES.verif_retraso_p95_s, ok: verifRetraso.p95 === null ? null : verifRetraso.p95 <= UMBRALES.verif_retraso_p95_s }
  ];

  const correoInfo = await correo();
  const secretos = barrerSecretos(args.manifiesto ? path.resolve(String(args.manifiesto)) : null);

  const lineas = [];
  lineas.push(`# Informe de corrida ${args.corrida}`, "");
  if (args.hasta) lineas.push(`Metricas hasta ${args.hasta}: lo posterior se excluye por una interrupcion declarada.`, "");
  lineas.push(motivosInvalida.length ? `**NO ES EVIDENCIA DE CAPACIDAD.** ${motivosInvalida.join(" ")}` : "**Corrida valida como evidencia.**", "");
  lineas.push(`Commit ${meta?.app_version ?? "?"}, modo ${meta?.fe_gateway_mode ?? "?"}, host ${meta?.hostname ?? "?"} (${meta?.cpus ?? "?"} CPU, ${meta ? Math.round(meta.mem_total / 1024 ** 3) : "?"} GB).`);
  if (simulacion) lineas.push(`Escenario ${simulacion.escenario}: ${simulacion.operadores} operadores, ${simulacion.total_por_hora} facturas por hora en total, ${simulacion.duracion_s} s. Creadas ${simulacion.creadas}, emitidas ${simulacion.emitidas}, sin estado final ${simulacion.sin_final}, KUDE invalido ${simulacion.kude_invalido}, reintentos con otro documento ${simulacion.reintentos_mal}.`);
  lineas.push("", "## Criterios", "", "| Criterio | Valor | Umbral | Resultado |", "|---|---|---|---|");
  for (const c of criterios) lineas.push(`| ${c.criterio} | ${fmt(c.valor)} | ${c.umbral} | ${c.ok === null ? "sin datos" : c.ok ? "cumple" : "**NO cumple**"} |`);

  lineas.push("", "## Tiempos por ruta, desde el cliente (ms)", "", "| Ruta | n | p50 | p95 | p99 | max | 2xx-3xx | 4xx | 5xx | red |", "|---|---|---|---|---|---|---|---|---|---|");
  for (const r of rutas) lineas.push(`| ${r.ruta} | ${r.n} | ${fmt(r.p50)} | ${fmt(r.p95)} | ${fmt(r.p99)} | ${fmt(r.max)} | ${r.s2} | ${r.s4} | ${r.s5} | ${r.red} |`);
  if (servidor.length) {
    lineas.push("", "## Tiempos por ruta, desde el servidor (ms)", "", "| Ruta | n | p50 | p95 | p99 | max |", "|---|---|---|---|---|---|");
    for (const r of servidor) lineas.push(`| ${r.ruta} | ${r.n} | ${fmt(r.p50)} | ${fmt(r.p95)} | ${fmt(r.p99)} | ${fmt(r.max)} |`);
  }

  lineas.push("", "## Colas", "");
  lineas.push(`- Cola de emision lista: p50 ${fmt(colaLista.p50)}, p95 ${fmt(colaLista.p95)}, maximo ${fmt(colaLista.max)} trabajos.`);
  lineas.push(`- Antiguedad del trabajo mas viejo: p95 ${fmt(colaEdad.p95)} s, maximo ${fmt(colaEdad.max)} s.`);
  lineas.push(`- Rendimiento con cola ocupada: ${fmt(rendimiento)} facturas por minuto.`);
  lineas.push(`- Trabajos en PROCESSING vencidos, maximo: ${fmt(Math.max(0, ...muestras.map((m) => m.processing_vencidos ?? 0)))}.`);
  const tiempoFinal = estadisticas(hasta);
  lineas.push(`- De crear a EMITIDA: p50 ${fmt(tiempoFinal.p50)} s, p95 ${fmt(tiempoFinal.p95)} s, maximo ${fmt(tiempoFinal.max)} s.`);
  lineas.push(`- Retraso de verificacion: p95 ${fmt(verifRetraso.p95)} s, maximo ${fmt(verifRetraso.max)} s.`);

  lineas.push("", "## Recursos", "", "| Contenedor | CPU p95 (%) | CPU max (%) | Memoria max (MB) |", "|---|---|---|---|");
  for (const [nombre, c] of [...contenedores.entries()].sort()) {
    const cpu = estadisticas(c.cpu);
    lineas.push(`| ${nombre} | ${fmt(cpu.p95)} | ${fmt(cpu.max)} | ${fmt(Math.max(...c.mem) / 1e6)} |`);
  }
  lineas.push("", `PostgreSQL: maximo ${fmt(conexiones.max)} conexiones, ${fmt(Math.max(0, ...muestras.map((m) => m.pg_esperando_lock ?? 0)))} esperando bloqueo. Tamano final: ${fmt((muestras[muestras.length - 1]?.pg_tamano_bytes ?? 0) / 1e6)} MB.`);

  lineas.push("", "## Conciliacion", "");
  if (conciliacion) {
    lineas.push(`SaaS: ${conciliacion.ok_saas ? "sin diferencias" : "**CON DIFERENCIAS**"} (${conciliacion.creadas} creadas, ${conciliacion.filas_saas} filas, ${conciliacion.huerfanas.length} huerfanas, ${conciliacion.trabadas.length} trabadas, ${conciliacion.pendientes_al_cierre} pendientes al cierre).`);
    const em = conciliacion.emision_primer_intento_s;
    if (em) lineas.push(`De confirmar a terminar la llamada a FE: p50 ${fmt(em.p50)} s, p95 ${fmt(em.p95)} s, maximo ${fmt(em.max)} s (${em.n} facturas). Umbral de FE en hora pico: p95 menor a 120 s.`);
    lineas.push(`Facturas con el emisor de otro facturador: ${conciliacion.emisor_cruzado.length}.`);
    lineas.push(`FE: ${conciliacion.ok_fe === null ? "**NO VERIFICADO**" : conciliacion.ok_fe ? "sin diferencias" : "**CON DIFERENCIAS**"}.`);
  } else {
    lineas.push("No se ejecuto `reconcile.cjs`.");
  }

  lineas.push("", "## Cancelaciones y CDC", "");
  const simultaneas = leerJsonSiExiste(path.join(dir, "cancelacion-simultanea.json"), null);
  if (simultaneas) {
    lineas.push(`Rafaga: ${simultaneas.cantidad} en ${fmt(simultaneas.disparo_real_s)} s. Respuesta p50 ${fmt(simultaneas.ms_p50)} ms, p95 ${fmt(simultaneas.ms_p95)} ms, maximo ${fmt(simultaneas.ms_max)} ms.`);
    lineas.push(`Por HTTP: ${JSON.stringify(simultaneas.por_http)}. Por resultado: ${JSON.stringify(simultaneas.por_cancelacion)}. CDC que cambio durante la rafaga: ${simultaneas.cdc_cambio_durante}. Sin event_id: ${simultaneas.sin_event_id}.`);
    lineas.push(`Verificar estado sobre anuladas: ${simultaneas.refresh_probadas ?? 0} probadas, ${simultaneas.refresh_reabiertas?.length ?? 0} dejaron de verse anuladas.`);
  } else {
    lineas.push("No se ejecuto `cancelar-simultaneo.cjs`.");
  }
  const conCambio = documentos.filter((d) => d.cdc_cambio).length;
  lineas.push(`Documentos cuyo CDC cambio durante la corrida: ${conCambio} de ${documentos.filter((d) => d.tipo !== "cancelacion").length}. El cruce con el XML de cada evento se hace con \`documentos.jsonl\`.`);

  lineas.push("", "## Aislamiento", "");
  if (aislamiento) {
    lineas.push(`Veredicto ${aislamiento.resumen.veredicto}: ${aislamiento.resumen.casos} casos, ${aislamiento.resumen.accesos_cruzados} accesos cruzados.`);
    const fallos = aislamiento.resultados.filter((r) => !r.ok);
    const unicos = new Map();
    for (const f of fallos) unicos.set(`${f.grupo}|${f.caso}`, f);
    for (const f of unicos.values()) lineas.push(`- [${f.grupo}] ${f.caso}: status ${f.status}. ${f.detalle}`);
  } else {
    lineas.push("No se ejecuto `isolation.cjs` en esta corrida.");
  }

  lineas.push("", "## Correo", "");
  lineas.push(correoInfo.revisado ? `${correoInfo.capturados} correos capturados, ${correoInfo.destinos_fuera_de_carga_invalid} destinos fuera de @carga.invalid.` : `No se pudo revisar: ${correoInfo.motivo}.`);

  lineas.push("", "## Secretos", "");
  if (secretos.revisado) {
    lineas.push(secretos.hallazgos.length ? `**Encontrados** en: ${secretos.hallazgos.map((h) => `${h.fuente} (${h.secretos_distintos})`).join(", ")}.` : `Sin apariciones: ${secretos.secretos_buscados} valores en ${secretos.fuentes} fuentes.`);
  } else {
    lineas.push(`No se pudo revisar: ${secretos.motivo}.`);
  }

  const errores = leerJsonl("errores.jsonl");
  if (errores.length) {
    const tipos = new Map();
    for (const e of errores) {
      const clave = `${e.ruta} (${e.status})`;
      tipos.set(clave, (tipos.get(clave) ?? 0) + 1);
    }
    lineas.push("", "## Errores", "", "| Ruta y estado | Cantidad |", "|---|---|");
    for (const [clave, cantidad] of [...tipos.entries()].sort((a, b) => b[1] - a[1])) lineas.push(`| ${clave} | ${cantidad} |`);
  }

  const salida = path.join(dir, "informe.md");
  fs.writeFileSync(salida, `${lineas.join("\n")}\n`);
  console.log(`${salida}\n${motivosInvalida.length ? "NO ES EVIDENCIA" : "Valida como evidencia"}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(2);
});
