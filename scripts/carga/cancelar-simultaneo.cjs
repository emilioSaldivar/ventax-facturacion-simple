#!/usr/bin/env node
// Cancelaciones simultaneas (E9, pedido de FE): unas 50 en pocos segundos, para reproducir el cruce de
// eventos que un porcentaje al azar no reproduce.
//
//   node scripts/carga/cancelar-simultaneo.cjs --corrida r1 [--cantidad 50] [--ventana-s 5] [--mismo-emisor 25] [--probar-refresh 5] [--seed 1]
//
// Mezcla facturas del mismo emisor y de emisores distintos, como pide FE. Toma facturas EMITIDA de la corrida, prepara las sesiones antes, y dispara todas dentro de la ventana.
// Agrega a documentos.jsonl una linea `tipo: "cancelacion"` por documento, para cruzar clave y CDC contra
// el XML de cada evento en FE. Queda el CDC antes y despues, porque la app cancela con su CDC local.
const fs = require("node:fs");
const path = require("node:path");
const { cargarOperadores, corridaDir, http, jsonl, parseArgs, percentil, prng, psql } = require("./lib.cjs");

const args = parseArgs();
if (!args.corrida) { console.error("Falta --corrida."); process.exit(2); }
const cantidad = Number(args.cantidad ?? 50);
const ventanaMs = Number(args["ventana-s"] ?? 5) * 1000;
const mismoEmisor = Number(args["mismo-emisor"] ?? Math.floor(cantidad / 2));
// FS-11 y FE-02: tras la rafaga, verifica algunas anuladas y mira si vuelven a verse emitidas.
const probarRefresh = Number(args["probar-refresh"] ?? 5);
const random = prng(args.seed ?? 1);
const dir = corridaDir(args.corrida);
const archivo = path.join(dir, "documentos.jsonl");
const MOTIVO = "Prueba de carga: cancelacion simultanea";

/** Lo que el SaaS guardo de la respuesta de FE. Fuente del event_id: /eventos es solo para soporte. */
function datosGuardados(ids) {
  if (ids.length === 0) return new Map();
  const lista = ids.map((id) => `'${String(id).replace(/[^0-9a-f-]/gi, "")}'`).join(",");
  const salida = psql(`select coalesce(json_agg(t), '[]') from (select id, estado, cdc, document_uuid, fiscal_response_snapshot from facturas_operativas where id in (${lista})) t;`);
  return new Map(JSON.parse(salida.trim()).map((f) => [f.id, f]));
}

async function main() {
  const lineas = fs.readFileSync(archivo, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const yaCanceladas = new Set(lineas.filter((d) => d.tipo === "cancelacion" || d.cancelacion_status).map((d) => d.clave));
  const candidatas = lineas.filter((d) => d.tipo !== "cancelacion" && d.estado_final === "EMITIDA" && !yaCanceladas.has(d.clave));
  if (candidatas.length < cantidad) throw new Error(`Se pidieron ${cantidad} y hay ${candidatas.length} facturas EMITIDA sin cancelar.`);

  // Muestra reproducible. Parte del emisor con mas facturas, y el resto de emisores distintos.
  const mezcladas = candidatas.map((d) => [random(), d]).sort((a, b) => a[0] - b[0]).map(([, d]) => d);
  const porEmisor = new Map();
  for (const d of mezcladas) porEmisor.set(d.ref, [...(porEmisor.get(d.ref) ?? []), d]);
  const mayor = [...porEmisor.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  const delMismo = mayor[1].slice(0, mismoEmisor);
  const usadas = new Set(delMismo.map((d) => d.clave));
  const otrosEmisores = [...porEmisor.entries()].filter(([ref]) => ref !== mayor[0]).map(([, lista]) => lista[0]);
  const resto = mezcladas.filter((d) => !usadas.has(d.clave));
  const distintas = [...otrosEmisores, ...resto.filter((d) => !otrosEmisores.includes(d))].slice(0, cantidad - delMismo.length);
  const elegidas = [...delMismo, ...distintas];
  if (elegidas.length < cantidad) throw new Error(`Solo se pudieron elegir ${elegidas.length} de ${cantidad}.`);

  const operadores = cargarOperadores();
  const tokens = new Map();
  await Promise.all(
    [...new Set(elegidas.map((d) => d.ref))].map(async (ref) => {
      const { datos } = await http("POST", "/auth/login", { cuerpo: { username: operadores[ref].username, password: operadores[ref].password } });
      tokens.set(ref, datos.access_token);
    })
  );

  // El CDC que la app tiene en este momento es el que mandara a FE.
  const previos = await Promise.all(elegidas.map((d) => http("GET", `/facturas/${d.id}`, { token: tokens.get(d.ref) })));

  const inicio = Date.now() + 500;
  const disparos = elegidas.map(async (d, i) => {
    const momento = inicio + random() * ventanaMs;
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, momento - Date.now())));
    const tEnvio = Date.now();
    let respuesta;
    try {
      respuesta = await http("POST", `/facturas/${d.id}/cancelar`, { token: tokens.get(d.ref), cuerpo: { motivo: MOTIVO }, sinLanzar: true, timeoutMs: 120000 });
    } catch (error) {
      respuesta = { status: 0, datos: { error: error.name } };
    }
    return { d, previo: previos[i].datos, tEnvio, tRespuesta: Date.now(), respuesta };
  });
  const resultados = await Promise.all(disparos);

  // Relectura despues de la rafaga: si el CDC cambio, el cruce contra el XML lo tiene que mostrar.
  const guardados = datosGuardados(resultados.map((r) => r.d.id));
  const salida = jsonl(archivo);
  const conteo = { por_http: {}, por_cancelacion: {}, cdc_cambio_durante: 0, sin_event_id: 0 };
  for (const { d, previo, tEnvio, tRespuesta, respuesta } of resultados) {
    const posterior = await http("GET", `/facturas/${d.id}`, { token: tokens.get(d.ref), sinLanzar: true });
    const guardado = guardados.get(d.id) ?? {};
    const eventId = guardado.fiscal_response_snapshot?.event_id ?? null;
    const cancelacion = respuesta.datos?.cancelacion ?? posterior.datos?.cancelacion ?? null;
    const estadoCancelacion = cancelacion?.status ?? "SIN_RESULTADO";
    conteo.por_http[respuesta.status] = (conteo.por_http[respuesta.status] ?? 0) + 1;
    conteo.por_cancelacion[estadoCancelacion] = (conteo.por_cancelacion[estadoCancelacion] ?? 0) + 1;
    if (!eventId) conteo.sin_event_id += 1;
    const cdcPosterior = posterior.datos?.cdc ?? guardado.cdc ?? null;
    if (previo.cdc !== cdcPosterior) conteo.cdc_cambio_durante += 1;
    salida.write({
      tipo: "cancelacion",
      clave: d.clave,
      external_ref: d.external_ref,
      ref: d.ref,
      emisor_id: d.emisor_id,
      id: d.id,
      document_uuid: previo.document_uuid ?? d.document_uuid ?? null,
      numero_fiscal: previo.numero_fiscal ?? d.numero_fiscal ?? null,
      cdc_enviado: previo.cdc ?? null,
      cdc_posterior: cdcPosterior,
      event_id: eventId,
      t_envio: tEnvio,
      t_respuesta: tRespuesta,
      ms: tRespuesta - tEnvio,
      status_http: respuesta.status,
      cancelacion,
      estado_previo: previo.estado,
      estado_posterior: posterior.datos?.estado ?? null,
      error: respuesta.status >= 400 ? JSON.stringify(respuesta.datos ?? null).slice(0, 400) : null
    });
  }
  await salida.end();

  const anuladas = resultados.filter((r) => (r.respuesta.datos?.estado ?? "") === "ANULADA").slice(0, probarRefresh);
  const reabiertas = [];
  for (const { d } of anuladas) {
    const verificada = await http("POST", `/facturas/${d.id}/refresh-status`, { token: tokens.get(d.ref), cuerpo: {}, sinLanzar: true, timeoutMs: 120000 });
    if (verificada.datos?.estado && verificada.datos.estado !== "ANULADA") {
      reabiertas.push({ clave: d.clave, estado: verificada.datos.estado, fiscal_status_raw: verificada.datos.fiscal_status_raw ?? null });
    }
  }

  const tiempos = resultados.map((r) => r.tRespuesta - r.tEnvio).sort((a, b) => a - b);
  const resumen = {
    corrida: args.corrida,
    cantidad,
    del_mismo_emisor: delMismo.length,
    emisor_repetido: mayor[0],
    emisores_distintos: new Set(elegidas.map((d) => d.ref)).size,
    ventana_s: ventanaMs / 1000,
    disparo_real_s: (Math.max(...resultados.map((r) => r.tEnvio)) - Math.min(...resultados.map((r) => r.tEnvio))) / 1000,
    ms_p50: percentil(tiempos, 50),
    ms_p95: percentil(tiempos, 95),
    ms_max: tiempos[tiempos.length - 1],
    refresh_probadas: anuladas.length,
    refresh_reabiertas: reabiertas,
    ...conteo
  };
  fs.writeFileSync(path.join(dir, "cancelacion-simultanea.json"), JSON.stringify(resumen, null, 2));
  console.log(JSON.stringify(resumen));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(2);
});
