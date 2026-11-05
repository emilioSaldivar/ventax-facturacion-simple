#!/usr/bin/env node
// Lo que ve un operador durante un fallo (PLAN §8). Captura en movil y escritorio, y guarda el texto
// visible, para que la persona presente lo compare con lo que realmente pasa. Usa una factura propia.
//
//   node scripts/carga/observar-fallos.cjs --corrida r1 --etiqueta F1 [--ref f001] [--emitir]
//
// Las capturas se revisan a ojo: el texto de este script no reemplaza mirarlas.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { cargarOperadores, corridaDir, http, parseArgs } = require("./lib.cjs");

const args = parseArgs();
const corrida = args.corrida ?? "observacion";
const etiqueta = String(args.etiqueta ?? "base").replace(/[^A-Za-z0-9_-]/g, "");
const frontend = process.env.CARGA_FRONTEND_BASE ?? "http://127.0.0.1:8292/app/";
const dir = path.join(corridaDir(corrida), "fallos", etiqueta);
fs.mkdirSync(dir, { recursive: true });

const VIEWPORTS = [
  { nombre: "movil", width: 390, height: 844 },
  { nombre: "escritorio", width: 1280, height: 800 }
];

async function crearFactura(op, token) {
  const cliente = op.clientes[0];
  const item = op.items[0];
  const respuesta = await http("POST", "/facturas", {
    token,
    sinLanzar: true,
    headers: { "idempotency-key": `obs-${corrida}-${etiqueta}-${Date.now().toString(36)}` },
    cuerpo: {
      condicion_venta: "CONTADO",
      tipo_transaccion: 2,
      cliente: { cliente_id: cliente.id, documento_tipo: "CI", documento: cliente.documento, razon_social: cliente.razon_social, direccion: "Asuncion", email: `cli-${op.ref}@carga.invalid` },
      items: [{ catalogo_item_id: item.id, descripcion: item.descripcion, cantidad: 1, precio_unitario: item.precio_unitario, iva_tipo: item.iva_tipo }]
    }
  });
  return { status: respuesta.status, id: respuesta.datos?.id ?? null, estado: respuesta.datos?.estado ?? null };
}

async function main() {
  const operadores = cargarOperadores();
  const op = operadores[args.ref ?? "f001"];
  if (!op?.completo) throw new Error(`No hay operador listo con ref ${args.ref ?? "f001"}.`);

  // La API puede estar caida (F6): la pantalla se captura igual, porque es justo lo que se observa.
  let token = null;
  let factura = null;
  const sondas = {};
  try {
    token = (await http("POST", "/auth/login", { cuerpo: { username: op.username, password: op.password } })).datos.access_token;
    factura = args.emitir ? await crearFactura(op, token) : null;
    if (args["esperar-s"]) await new Promise((resolve) => setTimeout(resolve, Number(args["esperar-s"]) * 1000));
    const idDocumento = factura?.id ?? args.id;
    if (idDocumento) {
      const d = (await http("GET", `/facturas/${idDocumento}`, { token, sinLanzar: true })).datos;
      sondas.documento = { id: idDocumento, estado: d?.estado, fiscal_status_raw: d?.fiscal_status_raw, accion: d?.accion, titulo: d?.accion_detalle?.titulo, descripcion: d?.accion_detalle?.descripcion };
      factura = factura ?? { id: idDocumento };
    }
    // Una factura ya aprobada: lo que el operador intentaria hacer durante el fallo.
    if (args["id-emitida"]) {
      const id = args["id-emitida"];
      const kude = await http("GET", `/facturas/${id}/files/kude.pdf`, { token, sinLanzar: true, crudo: true, timeoutMs: 40000 });
      const verificar = await http("POST", `/facturas/${id}/refresh-status`, { token, cuerpo: {}, sinLanzar: true, timeoutMs: 40000 });
      sondas.kude = { status: kude.status, es_pdf: Buffer.isBuffer(kude.datos) && kude.datos.subarray(0, 4).toString() === "%PDF", mensaje: kude.status >= 400 ? kude.datos.toString().slice(0, 200) : null };
      sondas.verificar = { status: verificar.status, estado: verificar.datos?.estado, mensaje: verificar.datos?.error?.message };
      if (args["probar-cancelar"]) {
        const cancelar = await http("POST", `/facturas/${id}/cancelar`, { token, cuerpo: { motivo: "Observacion de fallo" }, sinLanzar: true, timeoutMs: 40000 });
        sondas.cancelar = { status: cancelar.status, estado: cancelar.datos?.estado, mensaje: cancelar.datos?.error?.message };
      }
    }
  } catch (error) {
    sondas.error_api = String(error.message).slice(0, 200);
  }

  const navegador = await chromium.launch();
  const resultados = [];
  for (const viewport of VIEWPORTS) {
    const contexto = await navegador.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const pagina = await contexto.newPage();
    const fallidas = [];
    pagina.on("response", (r) => {
      if (r.status() >= 400 && r.url().includes("/api/")) fallidas.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
    });

    await pagina.goto(frontend, { waitUntil: "domcontentloaded" });
    await pagina.locator('input[name="username"]').fill(op.username);
    await pagina.locator('input[name="password"]').fill(op.password);
    await pagina.getByRole("button", { name: "Ingresar" }).click();
    const entro = await pagina.getByRole("button", { name: "Abrir menu" }).first().waitFor({ timeout: 20000 }).then(() => true).catch(() => false);
    if (!entro) {
      await pagina.screenshot({ path: path.join(dir, `${viewport.nombre}-sin-sesion.png`), fullPage: true });
      resultados.push({ viewport: viewport.nombre, requests_fallidas: fallidas, sin_sesion: true, texto_visible: (await pagina.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 1500) });
      await contexto.close();
      continue;
    }
    await pagina.waitForTimeout(1500);
    await pagina.screenshot({ path: path.join(dir, `${viewport.nombre}-inicio.png`), fullPage: true });

    await pagina.getByRole("button", { name: "Abrir menu" }).first().click();
    await pagina.locator('button:has-text("Documentos")').first().click();
    await pagina.waitForTimeout(2000);
    await pagina.screenshot({ path: path.join(dir, `${viewport.nombre}-documentos.png`), fullPage: true });

    // Detalle del documento mas reciente: es donde el operador lee que paso.
    const fila = pagina.locator(`text=${op.clientes[0].razon_social}`).first();
    if (await fila.count()) {
      await fila.click();
      await pagina.locator(".accion-banner").first().waitFor({ timeout: 8000 }).catch(() => {});
      await pagina.waitForTimeout(1000);
      await pagina.screenshot({ path: path.join(dir, `${viewport.nombre}-detalle.png`), fullPage: true });
    }
    const banner = pagina.locator(".accion-banner").first();
    const textoBanner = (await banner.count()) ? (await banner.innerText()).replace(/\s+/g, " ") : null;

    const texto = (await pagina.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 3000);
    resultados.push({ viewport: viewport.nombre, requests_fallidas: fallidas, banner: textoBanner, texto_visible: texto });
    await contexto.close();
  }
  await navegador.close();

  const salida = { etiqueta, momento: new Date().toISOString(), factura, sondas, resultados };
  fs.writeFileSync(path.join(dir, "observacion.json"), JSON.stringify(salida, null, 2));
  console.log(JSON.stringify({ etiqueta, factura, sondas, pantallas: resultados.map((r) => ({ v: r.viewport, fallidas: r.requests_fallidas.length, sin_sesion: r.sin_sesion ?? false, banner: r.banner ?? null })) }));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(2);
});
