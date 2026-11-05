#!/usr/bin/env node
// Conciliacion y trazabilidad por idempotency_key (SPEC RN-08, CA-02).
//
//   node scripts/carga/reconcile.cjs --corrida r1 [--fe-url <url-del-fe-aislado> --manifiesto <ruta>]
//   node scripts/carga/reconcile.cjs --buscar cg-r1-f001-000001   rastrea una factura de punta a punta
//
// Comprueba, por cada clave creada: una fila en el SaaS, una en la cola y el external_ref esperado.
// Con --fe-url, ademas, que FE tenga exactamente ese documento. Sin eso, el lado FE queda NO VERIFICADO
// y el informe lo dice: nunca se da por bueno.
const fs = require("node:fs");
const path = require("node:path");
const { cargarOperadores, corridaDir, externalRef, parseArgs, percentil, psql } = require("./lib.cjs");

const args = parseArgs();

function filasPorClave(patron) {
  const seguro = patron.replace(/[^A-Za-z0-9._:%-]/g, "");
  const salida = psql(`
    select coalesce(json_agg(t), '[]') from (
      select f.id, f.facturador_id, f.idempotency_key, f.external_ref, f.estado, f.document_uuid, f.cdc, f.numero_fiscal,
             f.created_at, fa.emisor_id as emisor_facturador, f.fiscal_request_snapshot->'facturador'->>'emisor_id' as emisor_enviado,
             round(extract(epoch from o.updated_at - f.created_at)::numeric, 1) as emision_s, o.estado as cola_estado, o.attempts as cola_intentos, o.updated_at as cola_actualizado
      from facturas_operativas f
      left join factura_emision_outbox o on o.factura_operativa_id = f.id
      join facturadores fa on fa.id = f.facturador_id
      where f.idempotency_key like '${seguro}' and f.deleted_at is null
    ) t;`);
  return JSON.parse(salida.trim());
}

function resumirTiempos(valores) {
  const orden = [...valores].sort((a, b) => a - b);
  return { n: orden.length, p50: percentil(orden, 50), p95: percentil(orden, 95), max: orden[orden.length - 1] ?? null };
}

async function conciliarFe(creadas, feUrl, manifiestoRuta) {
  const manifiesto = JSON.parse(fs.readFileSync(manifiestoRuta, "utf8"));
  const claveDe = Object.fromEntries(manifiesto.facturadores.map((f) => [f.ref, f.fe_consumer_api_key]));
  const porRef = new Map();
  for (const d of creadas) {
    if (!porRef.has(d.ref)) porRef.set(d.ref, []);
    porRef.get(d.ref).push(d);
  }
  const emisorDe = Object.fromEntries(Object.values(cargarOperadores()).map((o) => [o.ref, o.emisor_id]));
  const resultado = { consultadas: 0, encontradas: 0, no_encontradas: [], errores: [] };
  // Contrato publicado (guia FE §10): ISO con zona, hasta 7 dias y 100 claves por pedido.
  const ahora = Date.now();
  const desde = `${new Date(ahora - 6 * 86400000).toISOString().slice(0, 19)}+00:00`;
  const hasta = `${new Date(ahora + 3600000).toISOString().slice(0, 19)}+00:00`;
  for (const [ref, documentos] of porRef) {
    for (let i = 0; i < documentos.length; i += 100) {
      const lote = documentos.slice(i, i + 100);
      const respuesta = await fetch(`${feUrl.replace(/\/$/, "")}/conciliacion/idempotency`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": claveDe[ref] },
        body: JSON.stringify({ emisor_id: emisorDe[ref], env: "test", from: desde, to: hasta, idempotency_keys: lote.map((d) => d.external_ref) })
      });
      if (!respuesta.ok) {
        resultado.errores.push({ ref, status: respuesta.status });
        continue;
      }
      const { items = [] } = await respuesta.json();
      resultado.consultadas += lote.length;
      for (const d of lote) {
        const item = items.find((x) => x.idempotency_key === d.external_ref);
        if (item?.result === "IMPACTED") resultado.encontradas += 1;
        else resultado.no_encontradas.push(d.clave);
      }
    }
  }
  return resultado;
}

async function main() {
  if (args.buscar) {
    const filas = filasPorClave(String(args.buscar));
    console.log(JSON.stringify(filas.map((f) => ({ ...f, external_ref_esperado: externalRef(f.facturador_id, f.idempotency_key) })), null, 2));
    process.exit(filas.length === 1 ? 0 : 1);
  }
  if (!args.corrida) throw new Error("Falta --corrida.");

  const dir = corridaDir(args.corrida);
  // --desde-base: si el simulador se corto, la lista sale de documentos-base.jsonl, exportado de la base de FS.
  const registrados = args["desde-base"]
    ? fs.readFileSync(path.join(dir, "documentos-base.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).map((d) => ({ ...d, ref: d.clave.split("-").at(-2) }))
    : fs.readFileSync(path.join(dir, "documentos.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((d) => d.tipo !== "cancelacion");
  const creadas = registrados.filter((d) => d.id);
  const filas = filasPorClave(`cg-${args.corrida}-%`);
  const porClave = new Map(filas.map((f) => [f.idempotency_key, f]));
  const conocidas = new Set(registrados.map((d) => d.clave));

  const informe = {
    corrida: args.corrida,
    claves_registradas: registrados.length,
    creadas: creadas.length,
    filas_saas: filas.length,
    sin_fila: [],
    id_distinto: [],
    sin_cola: [],
    // Pedido de FE, seccion 6: cada factura lleva el emisor de su facturador.
    emisor_cruzado: filas.filter((f) => f.emisor_enviado && f.emisor_enviado !== f.emisor_facturador).map((f) => f.idempotency_key),
    emisor_sin_dato: filas.filter((f) => !f.emisor_enviado).length,
    // De confirmar a terminar la llamada a FE, en facturas emitidas al primer intento.
    emision_primer_intento_s: resumirTiempos(filas.filter((f) => f.cola_estado === "DONE" && f.cola_intentos === 1).map((f) => Number(f.emision_s))),
    external_ref_distinto: [],
    huerfanas: filas.filter((f) => !conocidas.has(f.idempotency_key)).map((f) => f.idempotency_key),
    trabadas: filas.filter((f) => f.cola_estado === "PROCESSING").map((f) => f.idempotency_key),
    pendientes_al_cierre: filas.filter((f) => ["PENDING", "FAILED_TEMP"].includes(f.cola_estado)).length,
    estados: {},
    fe: { verificado: false }
  };

  for (const d of creadas) {
    const fila = porClave.get(d.clave);
    if (!fila) { informe.sin_fila.push(d.clave); continue; }
    if (fila.id !== d.id) informe.id_distinto.push(d.clave);
    if (!fila.cola_estado) informe.sin_cola.push(d.clave);
    if (fila.external_ref !== externalRef(fila.facturador_id, d.clave)) informe.external_ref_distinto.push(d.clave);
    d.external_ref = fila.external_ref;
  }
  for (const f of filas) informe.estados[f.estado] = (informe.estados[f.estado] ?? 0) + 1;

  if (args["fe-url"]) {
    if (!args.manifiesto) throw new Error("--fe-url requiere --manifiesto.");
    informe.fe = { verificado: true, ...(await conciliarFe(creadas.filter((d) => d.external_ref), String(args["fe-url"]), String(args.manifiesto))) };
  }

  const lados = [informe.sin_fila, informe.id_distinto, informe.sin_cola, informe.external_ref_distinto, informe.huerfanas, informe.emisor_cruzado];
  informe.ok_saas = lados.every((l) => l.length === 0);
  informe.ok_fe = informe.fe.verificado ? informe.fe.no_encontradas.length === 0 && informe.fe.errores.length === 0 : null;
  fs.writeFileSync(path.join(dir, "conciliacion.json"), JSON.stringify(informe, null, 2));
  console.log(JSON.stringify({ ok_saas: informe.ok_saas, ok_fe: informe.ok_fe, creadas: informe.creadas, filas_saas: informe.filas_saas, huerfanas: informe.huerfanas.length, trabadas: informe.trabadas.length, pendientes_al_cierre: informe.pendientes_al_cierre, emisor_cruzado: informe.emisor_cruzado.length, emisor_sin_dato: informe.emisor_sin_dato, emision_s: informe.emision_primer_intento_s }));
  process.exit(informe.ok_saas && informe.ok_fe !== false ? 0 : 1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(2);
});
