#!/usr/bin/env node
// FS-143 (SPEC_NOTA_CREDITO_UNIFICADA_v0.1 CA-10, TASKS NCU-011): nota de credito con solo "Ajuste sobre el total".
// Solo stack local de Segel (.local/segel-ensayo, 18492) contra fe-segel en SIFEN test.
//
//   ENSAYO_USER=operador-fs143 ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/segel-fs/playwright-nc-ajuste-total.cjs
//
// Emite en SIFEN test dos facturas de una linea (USD 2,23 como la 0000361 de produccion, y Gs. 110.000) y sobre
// cada una una nota con solo ajuste sobre el total (USD 0,23 a 1280 px; Gs. 10.000 a 1440 px). A 390 px arma la
// nota sin emitir. ENSAYO_SIN_EMITIR=1 no emite notas. Escribe test-results/nc-ajuste-total/.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
if (!/^http:\/\/(localhost|127\.0\.0\.1):/.test(base)) throw new Error("Solo contra el stack local.");
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const ESPERA_MS = Number(process.env.ENSAYO_ESPERA_MS ?? 25 * 60 * 1000);
const SIN_EMITIR = process.env.ENSAYO_SIN_EMITIR === "1";
const outDir = path.join(process.cwd(), "test-results", "nc-ajuste-total");
fs.mkdirSync(outDir, { recursive: true });
const marca = Date.now().toString(36).slice(-5);

const resultados = [];
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 500) });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 500)}` : ""}`);
}
const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const plano = async (loc) => (await loc.innerText()).replace(/\s+/g, " ");
const foto = (page, nombre) => page.screenshot({ path: path.join(outDir, `${nombre}.png`), fullPage: true });

async function entrar(browser, ancho, alto) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  page.on("request", (r) => {
    const a = r.headers()["authorization"];
    if (a) page.__token = a;
  });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(usuario);
  await page.locator('input[name="password"]').fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await esperarSesion(page);
  return { ctx, page };
}

async function api(page, metodo, ruta, cuerpo, claveIdem) {
  return page.evaluate(
    async ({ metodo, ruta, cuerpo, token, claveIdem }) => {
      const r = await fetch(`/api/v1${ruta}`, {
        method: metodo,
        credentials: "include",
        headers: { "content-type": "application/json", authorization: token, ...(claveIdem ? { "idempotency-key": claveIdem } : {}) },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined
      });
      const texto = await r.text();
      let json = null;
      try {
        json = JSON.parse(texto);
      } catch {}
      return { status: r.status, json };
    },
    { metodo, ruta, cuerpo, token: page.__token ?? "", claveIdem: claveIdem ?? null }
  );
}

async function esperarEmitida(page, id) {
  const fin = Date.now() + ESPERA_MS;
  let d = null;
  while (Date.now() < fin) {
    await api(page, "POST", `/facturas/${id}/refresh-status`).catch(() => undefined);
    d = (await api(page, "GET", `/facturas/${id}`)).json;
    if (["RECHAZADA", "ERROR_OPERATIVO"].includes(d?.estado) || (d?.estado === "EMITIDA" && d?.cdc)) break;
    await page.waitForTimeout(20000);
  }
  return d;
}

const CLIENTE = { documento_tipo: "RUC", documento: "80026570-0", razon_social: "SEGEL SA" };
async function crearFactura(page, nombre, cuerpo) {
  const r = await api(page, "POST", "/facturas", { condicion_venta: "CONTADO", tipo_transaccion: 2, cliente: CLIENTE, ...cuerpo }, `fs143-${nombre}-${marca}`);
  if (r.status >= 300) throw new Error(`factura ${nombre}: ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`);
  const d = await esperarEmitida(page, r.json?.id ?? r.json?.documento?.id);
  check(`Preparacion: factura ${nombre} ${d?.numero_fiscal} aprobada en SIFEN test`, d?.estado === "EMITIDA", JSON.stringify({ estado: d?.estado, total: d?.totals?.total, moneda: d?.moneda }));
  return d;
}

async function elegirFactura(page, numero) {
  await abrirVista(page, "Notas de crédito");
  const nueva = page.getByRole("button", { name: /Crear nueva/ });
  if (await nueva.isVisible().catch(() => false)) await nueva.click();
  await page.getByRole("heading", { name: "Factura de la nota" }).waitFor();
  const cambiar = page.getByRole("button", { name: "Cambiar factura" });
  if (await cambiar.isVisible().catch(() => false)) await cambiar.click();
  const fila = page.locator(".nc-candidatas .document-row", { hasText: numero }).first();
  await page.locator(".nc-candidatas .document-row").first().waitFor({ timeout: 15000 }).catch(() => undefined);
  if (!(await fila.isVisible().catch(() => false))) {
    await page.getByLabel("Buscar factura").fill(numero);
    await page.getByRole("button", { name: "Buscar" }).click();
  }
  await fila.click();
  await page.getByRole("heading", { name: "Qué se devuelve o ajusta" }).waitFor();
  await page.locator(".nc-editor").waitFor();
}

/** Carga solo el ajuste sobre el total, por monto, con el motivo 8 "Ajuste de precio" como en produccion. */
async function soloAjusteTotal(page, unidad, valor) {
  await page.getByRole("button", { name: "Agregar ajuste" }).click();
  await page.getByRole("group", { name: "Ajuste sobre el total en porcentaje o monto" }).getByRole("button", { name: unidad }).click();
  await page.getByLabel("Ajuste sobre el total", { exact: true }).fill(valor);
  await page.getByLabel("Motivo en SIFEN").selectOption({ label: "Ajuste de precio" });
  await page.getByLabel("Detalle para el cliente").fill("AJUSTE DE PRECIO");
}

async function emitirYVerificar(page, etiqueta, totalEsperado) {
  const respuesta = page.waitForResponse((r) => /\/nota-credito$/.test(r.url()) && r.request().method() === "POST", { timeout: 120000 });
  await page.getByRole("button", { name: "Emitir nota de crédito" }).click();
  const r = await respuesta;
  const pedido = r.request().postDataJSON();
  const json = await r.json().catch(() => null);
  check(`${etiqueta}: el pedido no lleva lineas y si el ajuste total`, pedido.lineas === undefined && pedido.combinada === true && pedido.acreditacion_total?.tipo === "MONTO", JSON.stringify(pedido));
  check(`${etiqueta}: POST nota-credito ${r.status()}`, r.status() === 201 || r.status() === 200, JSON.stringify(json?.error ?? null));
  const id = json?.id ?? json?.documento?.id;
  if (!id) return;
  const d = await esperarEmitida(page, id);
  check(
    `${etiqueta}: NC ${d?.numero_fiscal} aprobada, total ${d?.totals?.total}, motivo ${d?.nce_motivo_codigo}`,
    d?.estado === "EMITIDA" && Math.abs((d?.totals?.total ?? 0) - totalEsperado) < 1e-9 && d?.nce_modo === "COMBINADA",
    JSON.stringify({ estado: d?.estado, total: d?.totals?.total, modo: d?.nce_modo, cdc: d?.cdc, sifen: d?.sifen_result_code, mensaje: d?.sifen_result_message })
  );
}

(async () => {
  const browser = await chromium.launch();
  try {
    const { ctx, page } = await entrar(browser, 1280, 900);
    const usd = await crearFactura(page, "usd", {
      moneda: "USD",
      tipo_cambio: 7350,
      items: [{ descripcion: `FS-143 prestacion de servicios ${marca}`, cantidad: 1, precio_unitario: 2.23, iva_tipo: "IVA_10" }]
    });
    const pyg = await crearFactura(page, "pyg", { items: [{ descripcion: `FS-143 servicio ${marca}`, cantidad: 1, precio_unitario: 110000, iva_tipo: "IVA_10" }] });

    // 1280: el caso de produccion (USD 2,23, ajuste 0,23).
    await elegirFactura(page, usd.numero_fiscal);
    await soloAjusteTotal(page, "USD", "0.23");
    const resumen = await plano(page.getByTestId("nc-total"));
    check("1280 USD: Resumen muestra USD 0,23 y el boton esta habilitado", /0,23/.test(resumen) && (await page.getByRole("button", { name: "Emitir nota de crédito" }).isEnabled()), resumen);
    check("1280: sin desplazamiento horizontal", await sinDesborde(page));
    await foto(page, "1280-usd-antes");
    if (!SIN_EMITIR) await emitirYVerificar(page, "1280 USD", 0.23);
    await foto(page, "1280-usd-despues");
    await ctx.close();

    // 1440: lo mismo en guaranies.
    const e2 = await entrar(browser, 1440, 900);
    await elegirFactura(e2.page, pyg.numero_fiscal);
    await soloAjusteTotal(e2.page, "Gs.", "10000");
    check("1440: sin desplazamiento horizontal", await sinDesborde(e2.page));
    await foto(e2.page, "1440-pyg-antes");
    if (!SIN_EMITIR) await emitirYVerificar(e2.page, "1440 PYG", 10000);
    await foto(e2.page, "1440-pyg-despues");
    await e2.ctx.close();

    // 390: arma la nota sin emitir.
    const e3 = await entrar(browser, 390, 844);
    await elegirFactura(e3.page, usd.numero_fiscal);
    await soloAjusteTotal(e3.page, "USD", "0.10");
    check("390 USD: boton habilitado con solo ajuste total", await e3.page.getByRole("button", { name: "Emitir nota de crédito" }).isEnabled());
    check("390: sin desplazamiento horizontal", await sinDesborde(e3.page));
    await foto(e3.page, "390-usd");
    await e3.ctx.close();
  } catch (error) {
    check("flujo completo", false, error.message.split("\n")[0]);
  }
  await browser.close();
  fs.writeFileSync(path.join(outDir, "resultado.json"), JSON.stringify(resultados, null, 2));
  const fallas = resultados.filter((r) => !r.ok).length;
  console.log(`\n${resultados.length - fallas}/${resultados.length} verificaciones OK. Capturas en ${outDir}`);
  process.exit(fallas ? 1 : 0);
})();
