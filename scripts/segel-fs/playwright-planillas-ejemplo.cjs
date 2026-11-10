#!/usr/bin/env node
// Planillas de ejemplo y documentacion de la planilla (SPEC_PLANILLAS_EJEMPLO_v0.1, CA-01 a CA-05).
// Solo contra el stack local de Segel. No emite: el ejemplo subido se cancela antes de confirmar.
//
//   ENSAYO_PASSWORD_FILE=/ruta/operador.pass node scripts/segel-fs/playwright-planillas-ejemplo.cjs
//
// Escribe test-results/planillas-ejemplo/.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const outDir = path.join(process.cwd(), "test-results", "planillas-ejemplo");
fs.mkdirSync(outDir, { recursive: true });

const resultados = [];
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 400) });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 400)}` : ""}`);
}

async function nuevaCarga(browser, ancho, alto) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(usuario);
  await page.locator('input[name="password"]').fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await esperarSesion(page);
  await abrirVista(page, "Documentos");
  await page.getByRole("button", { name: "Carga masiva" }).click();
  await page.getByRole("heading", { name: "Cargas de facturas" }).waitFor();
  await page.getByRole("button", { name: "Nueva carga" }).click();
  await page.locator('select[aria-label="Tipo de documento"]').waitFor();
  return { ctx, page };
}

async function abrirMenu(page) {
  await page.getByRole("button", { name: /Descargar planilla de ejemplo/ }).click();
  const menu = page.getByRole("menu", { name: "Planillas de ejemplo" });
  await menu.waitFor();
  // La lista de ejemplos llega despues de abrir: se espera a que haya mas que las dos opciones de documentacion.
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="Planillas de ejemplo"] [role="menuitem"]').length > 2, null, { timeout: 20000 });
  return menu;
}

async function bajar(page, accion) {
  const [descarga] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), accion()]);
  const destino = path.join(outDir, descarga.suggestedFilename());
  await descarga.saveAs(destino);
  return destino;
}

(async () => {
  const browser = await chromium.launch();
  try {
    // 1440: facturas, ejemplo subido tal cual, documentacion y notas de remision.
    const { ctx, page } = await nuevaCarga(browser, 1440, 900);
    let menu = await abrirMenu(page);
    const grupos = await menu.locator(".planilla-ejemplos-titulo").allInnerTexts();
    const items = await menu.getByRole("menuitem").allInnerTexts();
    const gruposMin = grupos.map((g) => g.toLowerCase());
    check("CA-01 1440: ejemplos de factura agrupados por tipo de cliente", gruposMin.includes("consumidor final") && gruposMin.includes("documentación") && items.length > 3, `${grupos.join(", ")} :: ${items.length} opciones`);
    await page.screenshot({ path: path.join(outDir, "1440-menu-facturas.png"), fullPage: true });

    const primero = menu.locator(".planilla-ejemplos-grupo").first().getByRole("menuitem").first();
    const nombreEjemplo = (await primero.innerText()).trim();
    const archivo = await bajar(page, () => primero.click());
    const contenido = fs.readFileSync(archivo, "utf8");
    const numeros = [...new Set(contenido.split(/\r?\n/).slice(1).map((l) => l.split(";")[1]).filter(Boolean))];
    check("CA-02 1440: el ejemplo trae el punto del operador (001-001)", numeros.length > 0 && numeros.every((n) => n.startsWith("001-001-")), `${nombreEjemplo} :: ${numeros.join(", ")}`);

    await page.locator('input[type="file"]').setInputFiles(archivo);
    await page.getByRole("button", { name: "Subir archivo" }).click();
    await page.locator('.carga-encabezado .status-pill:not(:has-text("Recibida")):not(:has-text("Validando"))').first().waitFor({ timeout: 120000 });
    const informe = await page.locator(".carga-masiva").innerText();
    check("CA-02 1440: el ejemplo subido tal cual valida sin PUNTO_DISTINTO", !informe.includes("PUNTO_DISTINTO") && !informe.includes("NUMERO_FUERA_DE_ORDEN"), informe.slice(0, 300).replace(/\n+/g, " | "));
    await page.screenshot({ path: path.join(outDir, "1440-ejemplo-subido.png"), fullPage: true });
    // No se emite: se cancela la carga si se puede.
    if (await page.getByRole("button", { name: "Cancelar carga" }).isVisible().catch(() => false)) {
      await page.getByRole("button", { name: "Cancelar carga" }).click();
      await page.getByRole("button", { name: "Sí, cancelar" }).click();
      await page.locator('.carga-encabezado .status-pill:has-text("Cancelada")').first().waitFor({ timeout: 60000 }).catch(() => {});
    }
    check("1440: el ejemplo subido quedo cancelado, sin emitir", (await page.locator(".carga-encabezado .status-pill").first().innerText()).includes("Cancelada"));

    await page.getByRole("button", { name: "Volver a las cargas" }).click();
    await page.getByRole("button", { name: "Nueva carga" }).click();
    menu = await abrirMenu(page);
    const pdf = await bajar(page, () => menu.getByRole("menuitem", { name: "Documentación de la planilla (PDF)" }).click());
    check("CA-03 1440: documentacion en PDF", fs.readFileSync(pdf).subarray(0, 4).toString() === "%PDF" && path.basename(pdf).endsWith(".pdf"), `${path.basename(pdf)} ${fs.statSync(pdf).size} bytes`);
    menu = await abrirMenu(page);
    const md = await bajar(page, () => menu.getByRole("menuitem", { name: "Documentación de la planilla (Markdown)" }).click());
    check("CA-03 1440: documentacion en Markdown", path.basename(md).endsWith(".md") && fs.statSync(md).size > 100, `${path.basename(md)} ${fs.statSync(md).size} bytes`);

    const plantilla = await bajar(page, () => page.getByRole("button", { name: "Descargar plantilla de facturas" }).click());
    const filasPlantilla = fs.readFileSync(plantilla, "utf8").split(/\r?\n/).slice(1).filter(Boolean);
    check("CA-04 1440: la plantilla trae el punto del operador", filasPlantilla.length > 0 && filasPlantilla.every((l) => l.split(";")[1].startsWith("001-001-")), filasPlantilla.map((l) => l.split(";")[1]).join(", "));

    await page.locator('select[aria-label="Tipo de documento"]').selectOption("NOTA_REMISION");
    await page.waitForTimeout(1000);
    menu = await abrirMenu(page);
    const itemsNre = await menu.getByRole("menuitem").allInnerTexts();
    check("CA-01 1440: con Nota de remision, los ejemplos de remision", itemsNre.length >= 4, itemsNre.join(" | "));
    const nre = await bajar(page, () => menu.locator(".planilla-ejemplos-grupo").first().getByRole("menuitem").first().click());
    const filasNre = fs.readFileSync(nre, "utf8").split(/\r?\n/).slice(1).filter(Boolean);
    check("CA-02 1440: el ejemplo de remision trae NOTA_REMISION y el punto del operador", filasNre.every((l) => l.startsWith("NOTA_REMISION;001-001-")), filasNre.map((l) => l.split(";").slice(0, 2).join(";")).join(", "));
    menu = await abrirMenu(page);
    await page.screenshot({ path: path.join(outDir, "1440-menu-remisiones.png"), fullPage: true });
    await ctx.close();

    for (const [ancho, alto] of [[1280, 800], [390, 844]]) {
      const v = await nuevaCarga(browser, ancho, alto);
      await abrirMenu(v.page);
      check(`CA-05 ${ancho}: menu visible y sin desplazamiento horizontal`, await v.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
      await v.page.screenshot({ path: path.join(outDir, `${ancho}-menu.png`), fullPage: true });
      await v.ctx.close();
    }
  } catch (error) {
    check("ejecucion sin errores", false, error.message.split("\n")[0]);
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(outDir, "resultado.json"), JSON.stringify(resultados, null, 2));
  const fallos = resultados.filter((r) => !r.ok);
  console.log(`\n${resultados.length - fallos.length}/${resultados.length} verificaciones OK.`);
  process.exit(fallos.length ? 1 : 0);
})();
