#!/usr/bin/env node
// Ajustes de textos para el operador (SPEC_AJUSTES_TEXTOS_OPERADOR_v0.1, CA-1 a CA-7). Solo stack local de Segel.
// No emite: la nota de credito se simula devolviendo una nota ya emitida y el recibo se simula con un 500.
//
//   ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/segel-fs/playwright-ajustes-textos.cjs
//
// Escribe test-results/ajustes-textos/.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const notaEmitidaId = process.env.ATO_NOTA_ID ?? "fdc7d723-6ac7-4958-b029-819b438d167e";
const cargaRemision = process.env.ATO_CARGA_NRE ?? "fs-nre_venta.csv";
const outDir = path.join(process.cwd(), "test-results", "ajustes-textos");
fs.mkdirSync(outDir, { recursive: true });

const resultados = [];
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 300) });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 300)}` : ""}`);
}

async function entrar(browser, ancho, alto) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto }, acceptDownloads: true });
  await ctx.addInitScript(() => {
    try {
      window.localStorage.setItem("fs.editor.modo", "completo");
    } catch {}
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(usuario);
  await page.locator('input[name="password"]').fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await esperarSesion(page);
  return { ctx, page };
}

const foto = (page, nombre) => page.screenshot({ path: path.join(outDir, `${nombre}.png`), fullPage: false });

async function porAncho(browser, ancho, alto) {
  const { ctx, page } = await entrar(browser, ancho, alto);
  try {
    // CA-1 y CA-6: Nueva factura sin numero estimado; ayuda del tipo de cambio en USD.
    await abrirVista(page, "Nueva factura");
    const subtitulo = page.locator(".editor-subtitulo");
    await subtitulo.waitFor();
    const texto = await subtitulo.innerText();
    check(`CA-1 ${ancho}: sin "Próximo número"`, !texto.includes("Próximo número") && texto.includes("el número lo asigna el sistema al emitir"), texto);
    await page.getByLabel("Moneda").selectOption("USD");
    await page.getByLabel("Tipo de cambio").fill("7350,5");
    const ayuda = page.getByText("Según la DNIT, va la cotización del día anterior.");
    check(`CA-6 ${ancho}: ayuda de la DNIT con tipo de cambio valido`, await ayuda.isVisible());
    await page.getByLabel("Tipo de cambio").fill("");
    check(`CA-6 ${ancho}: sin valor vuelve el error`, (await page.getByText("Obligatorio al facturar en USD").isVisible()) && !(await ayuda.isVisible()));
    await foto(page, `${ancho}-nueva-factura`);
    await page.getByLabel("Moneda").selectOption("PYG");

    if (ancho !== 1440) return;

    // CA-5: titulo de Pedidos.
    await abrirVista(page, "Presupuestos / Pedidos");
    await page.getByRole("heading", { name: "Presupuestos", exact: true }).waitFor();
    await page.getByRole("tab", { name: "Pedidos" }).click();
    check("CA-5: la pestaña Pedidos titula Pedidos", await page.getByRole("heading", { name: "Pedidos", exact: true }).isVisible());

    // CA-3: listado de cargas desde Documentos.
    await abrirVista(page, "Documentos");
    await page.getByRole("tab", { name: /Cargas por planilla/ }).or(page.getByRole("button", { name: /Cargas por planilla/ })).first().click();
    check("CA-3: listado titula Cargas subidas, sin repetir el titulo de la pantalla", (await page.getByRole("heading", { name: "Cargas subidas" }).isVisible()) && (await page.getByRole("heading", { name: "Cargas por planilla" }).count()) === 1);
    check("CA-3: desde Documentos baja la plantilla de facturas", await page.getByRole("button", { name: "Descargar plantilla de facturas" }).isVisible());

    // CA-3 y CA-4: desde Notas de remision.
    await abrirVista(page, "Notas de remisión");
    const boton = page.getByRole("button", { name: "Descargar plantilla de notas de remisión" });
    await boton.waitFor();
    const [descarga] = await Promise.all([page.waitForEvent("download"), boton.click()]);
    check("CA-3: desde Notas de remision baja su plantilla", descarga.suggestedFilename() === "plantilla-carga-notas-remision.csv", descarga.suggestedFilename());
    await page.getByRole("button", { name: cargaRemision }).first().click();
    const ver = page.getByRole("button", { name: "Ver nota de remisión" }).first();
    await ver.waitFor();
    check("CA-4: la fila de una remision dice Ver nota de remisión", (await page.getByRole("button", { name: "Ver factura" }).count()) === 0);
    await foto(page, "1440-carga-remision");

    // CA-7: error del recibo desde la ficha de una factura a credito.
    await page.route(/\/facturas\/[^/]+\/recibo$/, (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "PRUEBA", message: "Error simulado del recibo." } }) })
    );
    await abrirVista(page, "Documentos");
    await page.getByRole("tab", { name: /^Facturas/ }).or(page.getByRole("button", { name: /^Facturas/ })).first().click().catch(() => undefined);
    await page.getByLabel("Tipo factura").selectOption({ label: "Crédito" }).catch(() => undefined);
    await page.waitForTimeout(1500);
    await page.locator("tbody tr").first().click();
    const recibo = page.getByRole("button", { name: "Emitir recibo de cobro" });
    await recibo.waitFor();
    await recibo.click();
    const error = page.locator(".form-error", { hasText: "Error simulado del recibo." });
    await error.waitFor({ timeout: 8000 }).catch(() => undefined);
    check("CA-7: el error del recibo se muestra", await error.isVisible());
    await page.unroute(/\/facturas\/[^/]+\/recibo$/);

    // CA-2: resultado de una nota de credito, sin emitir (se devuelve una nota ya emitida).
    await page.route(/\/facturas\/[^/]+\/nota-credito$/, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const url = route.request().url().replace(/\/facturas\/[^/]+\/nota-credito$/, `/facturas/${notaEmitidaId}`);
      const respuesta = await route.fetch({ url, method: "GET", postData: undefined });
      return route.fulfill({ response: respuesta });
    });
    await abrirVista(page, "Notas de crédito");
    await page.getByRole("button", { name: "Buscar" }).click();
    const elegible = page.locator(".nc-candidatas button.document-row").filter({ hasText: "Elegible" }).first();
    await elegible.waitFor();
    await elegible.click();
    await page.getByLabel("Motivo (detalle para el cliente)").fill("Prueba de texto ATO-002, sin emitir");
    await page.getByRole("button", { name: "Emitir nota de crédito" }).click();
    const titulo = page.locator("#invoice-title");
    await titulo.waitFor();
    const t = await titulo.innerText();
    check("CA-2: el resultado de una NC titula Nota de crédito", t.startsWith("Nota de crédito"), t);
    check("CA-2: el boton dice Crear nueva nota de crédito", await page.getByRole("button", { name: "Crear nueva nota de crédito" }).isVisible());
    await foto(page, "1440-resultado-nc");
  } finally {
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const [ancho, alto] of [[1440, 900], [1280, 800], [390, 844]]) {
      try {
        await porAncho(browser, ancho, alto);
      } catch (error) {
        check(`ejecucion ${ancho} sin excepciones`, false, error instanceof Error ? error.stack : String(error));
      }
    }
  } finally {
    await browser.close();
    const ok = resultados.filter((r) => r.ok).length;
    fs.writeFileSync(path.join(outDir, "resumen.json"), JSON.stringify({ resultados }, null, 2));
    console.log(`\n${ok}/${resultados.length} verificaciones OK.`);
    process.exitCode = ok === resultados.length ? 0 : 1;
  }
})();
