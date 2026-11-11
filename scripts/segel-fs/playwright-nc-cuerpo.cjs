#!/usr/bin/env node
// Cuerpo de POST /facturas/{id}/nota-credito que arma la UI (PLAN_UX_RESTO_APP_v0.1 §7, URA-001 y URA-005).
// No emite: el POST de la nota de credito se intercepta con page.route, se guarda su cuerpo y se responde 422.
// El resto va contra el stack local de Segel.
//
//   ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/segel-fs/playwright-nc-cuerpo.cjs base       guarda la linea de base
//   ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/segel-fs/playwright-nc-cuerpo.cjs comparar   compara con la linea de base
//
// Casos de la linea de base (UI anterior a URA-005):
//   pantalla-total     Notas de credito (antes "Devolver factura"): {motivo}
//   documentos-total   modal de nota de credito de Documentos, Total: {motivo}
//   documentos-parcial el mismo modal, Parcial con 1 unidad de la linea 1: {motivo, lineas}
// En "comparar", la pantalla nueva de URA-005 debe producir los cuerpos de pantalla-total y documentos-parcial.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
// Factura emitida en 001-001, en guaranies, con dos lineas y sin notas de credito (elegida el 2026-11-11).
const FACTURA = process.env.NC_FACTURA_NUMERO ?? "1010559";
const MOTIVO = "Prueba de cuerpo URA-001";
const modo = process.argv[2] ?? "base";
const outDir = path.join(process.cwd(), "test-results", "ux-resto");
fs.mkdirSync(outDir, { recursive: true });

const resultados = [];
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 400) });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 400)}` : ""}`);
}

async function entrar(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  const capturas = [];
  await page.route(/\/facturas\/[^/]+\/nota-credito$/, (route) => {
    if (route.request().method() !== "POST") return route.continue();
    capturas.push(JSON.parse(route.request().postData() ?? "null"));
    return route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "CAPTURADO", message: "Cuerpo capturado por la prueba; no se emitio." } })
    });
  });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(usuario);
  await page.locator('input[name="password"]').fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await esperarSesion(page);
  return { ctx, page, capturas };
}

async function esperarCaptura(capturas, n) {
  for (let i = 0; i < 50 && capturas.length < n; i += 1) await new Promise((r) => setTimeout(r, 200));
  return capturas[n - 1] ?? null;
}

/** Abre Notas de credito con el nombre del menu que tenga la version desplegada. */
async function abrirNotasCredito(page) {
  const lateral = page.locator("nav.side-nav");
  const nombre = (await lateral.getByRole("button", { name: "Notas de crédito" }).count()) > 0 ? "Notas de crédito" : "Devolver factura";
  await abrirVista(page, nombre);
}

async function pantallaTotal(browser) {
  const { ctx, page, capturas } = await entrar(browser);
  try {
    await abrirNotasCredito(page);
    await page.getByPlaceholder(/Cliente, documento/).fill(FACTURA);
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await page.locator("button.document-row", { hasText: FACTURA }).first().click();
    await page.getByLabel("Motivo").fill(MOTIVO);
    await page.getByRole("button", { name: "Emitir nota de crédito" }).click();
    return await esperarCaptura(capturas, 1);
  } finally {
    await ctx.close();
  }
}

async function documentos(browser, parcial) {
  const { ctx, page, capturas } = await entrar(browser);
  try {
    await abrirVista(page, "Documentos");
    await page.getByPlaceholder("Buscar factura...").fill(FACTURA);
    await page.getByPlaceholder("Buscar factura...").press("Enter");
    const fila = page.locator("table.documents-tabla tbody tr", { hasText: FACTURA }).first();
    await fila.waitFor();
    await fila.locator(".menu-fila > button").click();
    await page.getByRole("menuitem", { name: "Nota de crédito" }).click();
    const modal = page.locator('section[role="dialog"]').first();
    await modal.waitFor();
    await modal.locator(".nc-parcial").waitFor();
    if (parcial) {
      await modal.getByRole("button", { name: "Parcial" }).click();
      await modal.getByLabel("Cantidad a acreditar, línea 1").fill("1");
    }
    await modal.locator("textarea").first().fill(MOTIVO);
    await modal.getByRole("button", { name: "Confirmar" }).click();
    return await esperarCaptura(capturas, 1);
  } finally {
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    if (modo === "base") {
      const casos = {
        "pantalla-total": await pantallaTotal(browser),
        "documentos-total": await documentos(browser, false),
        "documentos-parcial": await documentos(browser, true)
      };
      for (const [nombre, cuerpo] of Object.entries(casos)) {
        check(`${nombre}: cuerpo capturado sin emitir`, cuerpo !== null, JSON.stringify(cuerpo));
        if (cuerpo !== null) fs.writeFileSync(path.join(outDir, `nc-${nombre}.json`), `${JSON.stringify(cuerpo, null, 2)}\n`);
      }
      // Version de la linea de base junto al guion: test-results/ no se versiona.
      fs.writeFileSync(path.join(__dirname, "nc-cuerpo.base.json"), `${JSON.stringify({ factura: FACTURA, motivo: MOTIVO, casos }, null, 2)}\n`);
    } else {
      throw new Error("El modo comparar se completa en URA-005, con la pantalla nueva.");
    }
  } catch (e) {
    check("el guion termino sin excepciones", false, String(e));
  } finally {
    await browser.close();
  }
  const fallas = resultados.filter((r) => !r.ok);
  console.log(`\n${resultados.length - fallas.length}/${resultados.length} verificaciones OK.`);
  process.exit(fallas.length ? 1 : 0);
})();
