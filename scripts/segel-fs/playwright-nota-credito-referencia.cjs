#!/usr/bin/env node
// Nota de credito total por referencia (SPEC_TOTALES_FE_EN_CARGA_v0.1, RN-07; TASKS TFC-008).
// Solo contra el stack local de Segel con SIFEN test, nunca segel-fs.
//
//   ENSAYO_PASSWORD_FILE=/ruta/operador.pass node scripts/segel-fs/playwright-nota-credito-referencia.cjs <numero_fiscal>...
//
// Por factura: la busca por numero en Documentos, abre su ficha, emite "Crear nota de credito" y registra el resultado.
// La comparacion de montos con el XML firmado la hace quien corre la prueba, con la base de FE.
// Escribe test-results/nota-credito-referencia/.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const outDir = path.join(process.cwd(), "test-results", "nota-credito-referencia");
fs.mkdirSync(outDir, { recursive: true });

const resultados = [];
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 500), hora: new Date().toISOString() });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 500)}` : ""}`);
}

async function login(page) {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(usuario);
  await page.locator('input[name="password"]').fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await esperarSesion(page);
}

async function documentos(page) {
  await abrirVista(page, "Documentos");
  await page.getByRole("heading", { name: "Facturas y notas" }).waitFor({ timeout: 20000 });
}

async function emitir(page, numero, vp) {
  const input = page.getByPlaceholder("Buscar factura...");
  await input.fill(numero);
  await input.press("Enter");
  await page.locator(".document-row-main", { hasText: numero }).first().click();
  const boton = page.getByRole("button", { name: /Crear nota de credito/ }).first();
  await boton.waitFor({ timeout: 20000 });
  // La ficha termina de cargar despues de dibujar el boton: se espera a que se habilite.
  const habilitado = await page.waitForFunction((b) => b && !b.disabled, await boton.elementHandle(), { timeout: 20000 }).then(() => true, () => false);
  check(`${numero}: "Crear nota de credito" habilitado`, habilitado, "");
  check(`${numero}: sin aviso de anticipo`, (await page.getByText("tiene anticipo").count()) === 0, "");
  await page.screenshot({ path: path.join(outDir, `${vp}-${numero}-ficha.png`), fullPage: true });
  await boton.click();
  await page.locator(".modal-panel textarea").fill("Prueba de nota de credito total por referencia");
  await page.getByRole("button", { name: "Confirmar" }).click();
  const popup = page.locator('section[aria-labelledby="nc-success-title"]');
  const ok = await popup.waitFor({ timeout: 60000 }).then(() => true, () => false);
  const texto = ok ? await popup.innerText() : await page.locator("body").innerText();
  check(`${numero}: nota de credito emitida`, ok, texto.replace(/\n+/g, " | "));
  await page.screenshot({ path: path.join(outDir, `${vp}-${numero}-nota.png`), fullPage: true });
}

(async () => {
  const browser = await chromium.launch();
  try {
    const numeros = process.argv.slice(2);
    for (const [indice, numero] of numeros.entries()) {
      const vp = indice === 0 ? { n: "390", w: 390, h: 844 } : { n: "1280", w: 1280, h: 800 };
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
      const page = await ctx.newPage();
      page.setDefaultTimeout(30000);
      await login(page);
      await documentos(page);
      await emitir(page, numero, vp.n);
      check(`${numero}: sin desplazamiento horizontal en ${vp.n}`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "");
      await ctx.close();
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
