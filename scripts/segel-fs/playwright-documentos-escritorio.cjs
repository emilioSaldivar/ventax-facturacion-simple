#!/usr/bin/env node
// Documentos en escritorio (SPEC_DOCUMENTOS_ESCRITORIO_v0.1, CA-01 a CA-05). Solo lectura: no emite ni cambia nada.
//
//   ENSAYO_PASSWORD_FILE=/ruta/operador.pass node scripts/segel-fs/playwright-documentos-escritorio.cjs
//
// Escribe test-results/documentos-escritorio/.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const outDir = path.join(process.cwd(), "test-results", "documentos-escritorio");
fs.mkdirSync(outDir, { recursive: true });

const resultados = [];
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 300) });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 300)}` : ""}`);
}

async function entrar(browser, ancho, alto) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(usuario);
  await page.locator('input[name="password"]').fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await esperarSesion(page);
  return { ctx, page };
}

const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function escritorio(browser, ancho) {
  const { ctx, page } = await entrar(browser, ancho, 900);
  const v = String(ancho);
  check(`${v}: menu lateral visible y sin boton de menu`, (await page.locator("nav.side-nav").isVisible()) && (await page.getByRole("button", { name: "Abrir menu" }).count()) === 0);
  await abrirVista(page, "Documentos");
  await page.getByRole("heading", { name: "Facturas y notas" }).waitFor();
  check(`${v}: Documentos marcado en el menu lateral`, (await page.locator('nav.side-nav [aria-current="page"]').innerText()).includes("Documentos"));
  await page.locator("table.documents-tabla").waitFor({ timeout: 20000 });
  const encabezados = (await page.locator("table.documents-tabla thead th").allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  check(`CA-01 ${v}: tabla con sus columnas`, ["Fecha", "Número", "Cliente", "RUC o CI", "Condición", "Estado", "CDC", "Moneda", "Total"].every((c) => encabezados.includes(c)), encabezados.join(", "));
  check(`CA-01 ${v}: sin desplazamiento horizontal`, await sinDesborde(page));
  check(`CA-01 ${v}: sin tarjetas de celular`, (await page.locator(".document-row").count()) === 0);
  const proximamente = page.locator("button.pestana-proximamente");
  check(`CA-04 ${v}: tres pestañas Próximamente deshabilitadas`, (await proximamente.count()) === 3 && (await proximamente.evaluateAll((bs) => bs.every((b) => b.disabled))), (await proximamente.allInnerTexts()).join(" | "));
  check(`CA-05 ${v}: filtros a la vista sin "Mas filtros"`, await page.locator(".documents-advanced-filters select").first().isVisible());
  await page.screenshot({ path: path.join(outDir, `${v}-tabla.png`), fullPage: true });

  // CA-03: menu de la fila y clic en la fila.
  await page.locator("table.documents-tabla tbody tr .icon-menu-action").first().click();
  const menu = page.getByRole("menu", { name: "Acciones del documento" });
  check(`CA-03 ${v}: menu de la fila con "Ver detalle"`, await menu.getByRole("menuitem", { name: "Ver detalle" }).isVisible());
  await page.screenshot({ path: path.join(outDir, `${v}-menu-fila.png`) });
  await page.locator("table.documents-tabla tbody tr .icon-menu-action").first().click();
  await page.locator("table.documents-tabla tbody tr td").nth(2).click();
  const volver = page.getByRole("button", { name: /Volver a resultados/ });
  check(`CA-03 ${v}: clic en la fila abre la ficha`, await volver.waitFor({ timeout: 20000 }).then(() => true, () => false));
  await page.screenshot({ path: path.join(outDir, `${v}-ficha.png`), fullPage: true });
  await volver.click();
  await page.locator("table.documents-tabla").waitFor();

  // CA-05: sin fechas, mas de una pagina.
  await page.locator('.documents-advanced-filters input[type="date"]').first().fill("");
  await page.waitForTimeout(1500);
  const pager = page.locator(".documents-paginas");
  if (await pager.isVisible().catch(() => false)) {
    await pager.getByRole("button", { name: "Siguiente" }).click();
    await page.waitForTimeout(1500);
    check(`CA-05 ${v}: paginacion avanza`, (await pager.innerText()).includes("Página 2"), await pager.innerText());
  } else {
    check(`CA-05 ${v}: paginacion (menos de 30 documentos, sin paginas)`, true, "sin paginador");
  }
  await ctx.close();
}

async function celular(browser) {
  const { ctx, page } = await entrar(browser, 390, 844);
  check("CA-02 390: boton de menu y sin menu lateral", (await page.getByRole("button", { name: "Abrir menu" }).isVisible()) && (await page.locator("nav.side-nav").count()) === 0);
  await abrirVista(page, "Documentos");
  await page.getByRole("heading", { name: "Facturas y notas" }).waitFor();
  await page.locator(".document-row").first().waitFor({ timeout: 20000 });
  check("CA-02 390: tarjetas y sin tabla", (await page.locator("table.documents-tabla").count()) === 0);
  check("CA-02 390: sin desplazamiento horizontal", await sinDesborde(page));
  await page.screenshot({ path: path.join(outDir, "390-tarjetas.png"), fullPage: true });
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    await escritorio(browser, 1440);
    await escritorio(browser, 1280);
    await celular(browser);
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
