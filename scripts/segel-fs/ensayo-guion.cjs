#!/usr/bin/env node
// Guion del ensayo local de la segunda entrega por la API de FS, con las mismas rutas que usa la app
// (PLAN_DESPLIEGUE_SEGEL_FS_v0.2, seccion 2.3). Solo contra el ensayo local en SIFEN test: se niega a
// correr si la URL no es localhost. Emite facturas reales de SIFEN test.
//
//   ENSAYO_USER=operador-ensayo ENSAYO_PASSWORD_FILE=/ruta/operador.pass ENSAYO_EMAIL=esaldivar.segel@gmail.com \
//     node scripts/segel-fs/ensayo-guion.cjs [pasos]     pasos: 2,2b,3,5,6 (por defecto, todos)
//
// Deja el resultado en $ENSAYO_OUT (por defecto ./ensayo-resultado.json). No imprime claves.
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const FS = process.env.ENSAYO_FS ?? "http://localhost:18492/api/v1";
const FE = process.env.ENSAYO_FE ?? "http://localhost:18500/v1";
const usuario = process.env.ENSAYO_USER;
const clave = process.env.ENSAYO_PASSWORD_FILE ? fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE, "utf8").trim() : process.env.ENSAYO_PASSWORD;
const correo = process.env.ENSAYO_EMAIL;
const salida = process.env.ENSAYO_OUT ?? "ensayo-resultado.json";
const pasos = new Set((process.argv[2] ?? "2,2b,3,5,6").split(","));
const ESPERA_MAX_MS = Number(process.env.ENSAYO_ESPERA_MAX_MS ?? 30 * 60 * 1000);

for (const url of [FS, FE]) {
  if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+\//.test(url)) throw new Error(`Solo contra el ensayo local: ${url}`);
}
if (!usuario || !clave || !correo) throw new Error("Faltan ENSAYO_USER, ENSAYO_PASSWORD(_FILE) o ENSAYO_EMAIL.");

const resultados = [];
function registrar(paso, verificacion, ok, detalle = {}) {
  resultados.push({ paso, verificacion, ok: Boolean(ok), detalle, en: new Date().toISOString() });
  console.log(`${ok ? "OK   " : "FALLA"} [${paso}] ${verificacion}${ok ? "" : ` :: ${JSON.stringify(detalle).slice(0, 300)}`}`);
}

let token = null;
async function pedir(metodo, ruta, { cuerpo, tipo = "application/json", clave: idempotencia, crudo = false } = {}) {
  const headers = { authorization: `Bearer ${token}` };
  if (cuerpo !== undefined) headers["content-type"] = tipo;
  if (idempotencia) headers["idempotency-key"] = idempotencia;
  const r = await fetch(`${FS}${ruta}`, { method: metodo, headers, body: cuerpo === undefined ? undefined : tipo === "application/json" ? JSON.stringify(cuerpo) : cuerpo });
  const texto = await r.text();
  let datos = texto;
  if (!crudo) {
    try { datos = JSON.parse(texto); } catch { /* texto plano */ }
  }
  return { status: r.status, datos };
}

async function esperar(descripcion, fn, cadaMs = 15000) {
  const hasta = Date.now() + ESPERA_MAX_MS;
  for (;;) {
    const valor = await fn();
    if (valor) return valor;
    if (Date.now() > hasta) throw new Error(`Tiempo agotado: ${descripcion}`);
    await new Promise((r) => setTimeout(r, cadaMs));
  }
}

const sufijo = String(Date.now()).slice(-6);
const clienteCi = (email) => ({ documento_tipo: "CI", documento: "1234567", razon_social: "CLIENTE ENSAYO SEGEL", ...(email ? { email } : {}) });
const item = { descripcion: "Servicio de ensayo", cantidad: 1, precio_unitario: 1100, iva_tipo: "IVA_10" };

/** Digito verificador del RUC paraguayo, modulo 11 con base 11. */
function dvRuc(base) {
  let total = 0;
  let k = 2;
  for (const d of [...base].reverse()) {
    total += Number(d) * k;
    k = k >= 11 ? 2 : k + 1;
  }
  const resto = total % 11;
  return resto > 1 ? 11 - resto : 0;
}

async function emitir(nombre, cliente) {
  const r = await pedir("POST", "/facturas", { cuerpo: { condicion_venta: "CONTADO", tipo_transaccion: 2, cliente, items: [item] }, clave: `ensayo-${nombre}-${sufijo}` });
  if (r.status >= 300) throw new Error(`${nombre}: POST /facturas ${r.status} ${JSON.stringify(r.datos).slice(0, 200)}`);
  return r.datos;
}

async function esperarFinal(id) {
  return esperar(`estado final de ${id}`, async () => {
    // "Verificar estado fiscal", como el boton del operador: no depende de la agenda del worker.
    const r = await pedir("POST", `/facturas/${id}/refresh-status`, { cuerpo: {} });
    const doc = r.status < 300 ? r.datos : (await pedir("GET", `/facturas/${id}`)).datos;
    return ["EMITIDA", "RECHAZADA"].includes(doc.estado) ? doc : null;
  });
}

async function esperarCorreo(id, finales) {
  return esperar(`correo de ${id}`, async () => {
    const r = await pedir("GET", `/facturas/${id}/email-status`);
    return finales.includes(r.datos.status) ? r.datos : null;
  });
}

async function cargar(nombre, args) {
  const ruta = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ensayo-carga-")), `${nombre}.csv`);
  execFileSync("python3", [path.join(__dirname, "generar-carga.py"), ...args, "--salida", ruta], { stdio: "inherit", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
  const r = await pedir("POST", `/cargas?nombre_archivo=${encodeURIComponent(path.basename(ruta))}`, { cuerpo: fs.readFileSync(ruta), tipo: "text/csv" });
  fs.rmSync(path.dirname(ruta), { recursive: true, force: true });
  if (r.status >= 300) throw new Error(`${nombre}: POST /cargas ${r.status} ${JSON.stringify(r.datos).slice(0, 300)}`);
  return r.datos;
}

async function esperarCarga(id, estados) {
  return esperar(`carga ${id} en ${estados}`, async () => {
    const r = await pedir("GET", `/cargas/${id}`);
    return estados.includes(r.datos.estado) ? r.datos : null;
  }, 10000);
}

async function paso(nombre, fn) {
  if (!pasos.has(nombre)) return;
  try {
    await fn();
  } catch (error) {
    registrar(nombre, "el paso termina", false, { error: error.message });
  }
}

(async () => {
  const login = await (await fetch(`${FS}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: usuario, password: clave }) })).json();
  if (!login.access_token || login.pending_actions?.length) throw new Error(`Login del operador incompleto: ${JSON.stringify(login.pending_actions ?? login.error ?? {})}. Activarlo antes (activar-operador-test.cjs).`);
  token = login.access_token;

  const salud = await (await fetch(`${FE}/health`)).json().catch(() => ({}));
  registrar("1", "FE: java.kude.ok y java.firma.ok en true", salud?.java?.kude?.ok === true && salud?.java?.firma?.ok === true, salud?.java ?? salud);
  const contexto = (await pedir("GET", "/me/context")).datos;
  registrar("1", "FS: carga masiva habilitada y numeracion SERVICIO", contexto.carga_masiva_habilitada === true && (contexto.fiscal_context?.numeracion_facturas ?? "SERVICIO") === "SERVICIO", { habilitada: contexto.carga_masiva_habilitada, numeracion: contexto.fiscal_context?.numeracion_facturas });

  const ctx = contexto.fiscal_context;
  const punto = `${ctx.establecimiento}-${ctx.punto_expedicion}`;
  // Con numeracion del servicio el numero del archivo es referencia: cada archivo usa su propio tramo,
  // lejos del bloque 1010000 que asigna FE, para que no se lea como un numero ya usado.
  let tramo = 0;
  const generar = (cantidad, referencia, extra = []) => [
    "--cantidad", String(cantidad), "--monto", "1100", "--punto", punto, "--numero-desde", String(8500000 + (Number(sufijo) % 1000) * 100 + (tramo++) * 20),
    "--receptor-tipo", "CI", "--receptor-documento", "1234567", "--receptor-nombre", "CLIENTE ENSAYO SEGEL",
    "--receptor-email", correo, "--item-descripcion", "Servicio de ensayo", "--referencia", `${referencia}-${sufijo}`, ...extra
  ];
  let facturasDeCarga = [];

  await paso("2", async () => {
    const emitida = await emitir("contado", clienteCi(correo));
    registrar("2", "POST /facturas encola", emitida.estado === "EMITIENDO" || emitida.estado === "PENDIENTE_SIFEN", { estado: emitida.estado });
    const final = await esperarFinal(emitida.id);
    registrar("2", "aprobada por SIFEN test", final.estado === "EMITIDA", { estado: final.estado, numero: final.numero_fiscal, sifen: final.sifen_result_code });
    const antes = (await pedir("GET", `/facturas/${emitida.id}/email-status`)).datos;
    const correoFinal = await esperarCorreo(emitida.id, ["SENT", "FAILED"]);
    registrar("2", "correo SENT despues de la aprobacion (revisar la casilla)", correoFinal.status === "SENT", { primero: antes.status, final: correoFinal.status });
  });

  await paso("2b", async () => {
    // RUC con digito verificador valido pero inexistente: SIFEN test responde 1306.
    const base = "99999990";
    const rechazada = await emitir("rechazo", { documento_tipo: "RUC", documento: `${base}-${dvRuc(base)}`, razon_social: "RUC INEXISTENTE ENSAYO", naturaleza: "JURIDICA", email: correo });
    const final = await esperarFinal(rechazada.id);
    registrar("2b", "rechazada por SIFEN", final.estado === "RECHAZADA", { estado: final.estado, sifen: final.sifen_result_code });
    registrar("2b", "FS-20: motivo real del rechazo, no 0420", Boolean(final.sifen_result_code) && final.sifen_result_code !== "0420", { codigo: final.sifen_result_code, mensaje: final.sifen_result_message });
    const correoFinal = await esperarCorreo(rechazada.id, ["NOT_APPLICABLE", "SENT", "FAILED"]);
    registrar("2b", "FS-27: sin correo, con el mensaje de rechazo", correoFinal.status === "NOT_APPLICABLE" && /SIFEN rechazo/.test(correoFinal.message ?? ""), correoFinal);
  });

  await paso("3", async () => {
    const plantilla = await pedir("GET", "/cargas/plantilla", { crudo: true });
    registrar("3", "plantilla de FE", plantilla.status === 200 && String(plantilla.datos).includes("numero_comprobante"), { status: plantilla.status });
    const subida = await cargar(`diez-${sufijo}`, generar(10, "CARGA10"));
    const validada = await esperarCarga(subida.id, ["VALIDADA", "RECHAZADA"]);
    registrar("3", "10 validos", validada.estado === "VALIDADA" && validada.totales.pendientes === 10, { estado: validada.estado, totales: validada.totales, motivos: validada.motivos });
    const confirmada = await pedir("POST", `/cargas/${subida.id}/confirmar`, { cuerpo: {} });
    registrar("3", "confirmar", confirmada.status === 200, { status: confirmada.status, estado: confirmada.datos.estado });
    const final = await esperarCarga(subida.id, ["FINALIZADA"]);
    registrar("3", "FINALIZADA con 10 aprobadas", (final.totales.aprobados ?? 0) + (final.totales.aprobados_con_obs ?? 0) === 10, { totales: final.totales, fechas: final.fechas });
    const comprobantes = await esperar("correos de la carga", async () => {
      const r = await pedir("GET", `/cargas/${subida.id}/comprobantes?limit=50`);
      return r.datos.items.every((c) => c.correo === "SENT" || c.correo === "FAILED") ? r.datos.items : null;
    });
    registrar("3", "10 correos SENT", comprobantes.filter((c) => c.correo === "SENT").length === 10, { correos: comprobantes.map((c) => c.correo) });
    const numeros = comprobantes.map((c) => c.numero_asignado).sort();
    registrar("3", "numeros asignados por FE, sin repetir", new Set(numeros).size === 10, { numeros });
    const docs = await esperar("facturas en Documentos", async () => {
      const r = await pedir("GET", `/facturas?carga_id=${subida.id}&limit=50`);
      return r.datos.items.length === 10 && r.datos.items.every((d) => d.estado === "EMITIDA") ? r.datos.items : null;
    }, 20000);
    facturasDeCarga = docs;
    registrar("3", "10 facturas EMITIDA en Documentos, con su carga", docs.every((d) => d.carga?.id === subida.id), { estados: docs.map((d) => d.estado) });
    registrar("3", "tiempos de la carga", true, { recibida: final.fechas.recibida_en, confirmada: final.fechas.confirmada_en, finalizada: final.fechas.finalizada_en });
  });

  await paso("5", async () => {
    const subida = await cargar(`invalida-${sufijo}`, generar(4, "CARGAINV", ["--invalidas", "1"]));
    const validada = await esperarCarga(subida.id, ["VALIDADA", "RECHAZADA"]);
    const invalidos = (await pedir("GET", `/cargas/${subida.id}/comprobantes?estado=INVALIDO`)).datos.items;
    const error = invalidos[0]?.errores?.[0];
    registrar("5", "informe: 3 validos, 1 con error con fila y columna", validada.totales.pendientes === 3 && invalidos.length === 1 && Boolean(error?.fila) && Boolean(error?.columna), { totales: validada.totales, error });
    await pedir("POST", `/cargas/${subida.id}/confirmar`, { cuerpo: {} });
    const final = await esperarCarga(subida.id, ["FINALIZADA"]);
    registrar("5", "se emiten solo los validos", (final.totales.aprobados ?? 0) === 3 && (final.totales.invalidos ?? 0) === 1, { totales: final.totales });
  });

  await paso("6", async () => {
    if (facturasDeCarga.length < 2) throw new Error("Hace falta el paso 3 en la misma corrida.");
    const [aCancelar, aNota] = facturasDeCarga;
    const cancelada = await pedir("POST", `/facturas/${aCancelar.id}/cancelar`, { cuerpo: { motivo: "Ensayo de cancelacion" } });
    registrar("6", "cancelar una factura de carga", cancelada.status < 300, { status: cancelada.status, estado: cancelada.datos.estado, cancelacion: cancelada.datos.cancelacion });
    const nota = await pedir("POST", `/facturas/${aNota.id}/nota-credito`, { cuerpo: { motivo: "Ensayo de nota de credito" }, clave: `ensayo-nc-${sufijo}` });
    registrar("6", "nota de credito sobre una factura de carga", nota.status < 300, { status: nota.status, estado: nota.datos.estado });
    const anulada = await esperar("cancelacion aceptada", async () => {
      const d = (await pedir("GET", `/facturas/${aCancelar.id}`)).datos;
      return d.estado === "ANULADA" ? d : null;
    });
    registrar("6", "la cancelacion queda ANULADA", anulada.estado === "ANULADA");
    // La sincronizacion de la carga corre cada minuto: dos pasadas.
    await new Promise((r) => setTimeout(r, 130000));
    const despues = (await pedir("GET", `/facturas/${aCancelar.id}`)).datos;
    registrar("6", "la sincronizacion no revierte la cancelacion", despues.estado === "ANULADA", { estado: despues.estado });
  });

  fs.writeFileSync(salida, JSON.stringify(resultados, null, 2));
  const fallos = resultados.filter((r) => !r.ok).length;
  console.log(`\n${resultados.length - fallos}/${resultados.length} verificaciones OK. Resultado en ${salida}`);
  process.exit(fallos ? 1 : 0);
})().catch((error) => {
  fs.writeFileSync(salida, JSON.stringify(resultados, null, 2));
  console.error(error.message);
  process.exit(2);
});
