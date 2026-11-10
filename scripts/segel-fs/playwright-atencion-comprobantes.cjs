#!/usr/bin/env node
// Comprobantes que requieren atencion (SPEC_CARGA_ATENCION_COMPROBANTES_v0.1, TASKS CAC-008).
// Solo contra el stack local de Segel con SIFEN test, nunca segel-fs.
//
//   ENSAYO_PASSWORD_FILE=/ruta/operador.pass node scripts/segel-fs/playwright-atencion-comprobantes.cjs <cac-rechazo.csv> <cac-invalida.csv>
//
// 1. cac-rechazo: un comprobante con un RUC que SIFEN test no reconoce (1306). Se confirma, se espera el rechazo,
//    se ve la atencion y "Editar" deshabilitado, un motivo corto no se envia, se inutiliza y la carga termina.
// 2. cac-invalida: un comprobante invalido con numeracion del servicio. La carga no tiene nada que confirmar y FE
//    la cierra sola: FS debe mostrarla "Finalizada" sin que el operador haga nada (CA-05).
// Escribe test-results/atencion-comprobantes/.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const outDir = path.join(process.cwd(), "test-results", "atencion-comprobantes");
const LIMITE_MS = Number(process.env.ENSAYO_LIMITE_MIN ?? 20) * 60_000;
const [rutaRechazo, rutaInvalida] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

const resultados = [];
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 400), hora: new Date().toISOString() });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 400)}` : ""}`);
}

async function login(page) {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(usuario);
  await page.locator('input[name="password"]').fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.getByRole("button", { name: "Abrir menu" }).first().waitFor({ timeout: 20000 });
}

async function irACargas(page) {
  await page.getByRole("button", { name: "Abrir menu" }).first().click();
  await page.locator('button:has-text("Documentos")').first().click();
  await page.getByRole("heading", { name: "Facturas y notas" }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Carga masiva" }).click();
  await page.getByRole("heading", { name: "Cargas de facturas" }).waitFor({ timeout: 20000 });
}

const estado = async (page) => (await page.locator(".carga-encabezado .status-pill").first().innerText().catch(() => "")).trim();

async function subir(page, ruta) {
  await page.getByRole("button", { name: "Nueva carga" }).click();
  await page.locator('input[type="file"]').setInputFiles(ruta);
  await page.getByRole("button", { name: "Subir archivo" }).click();
  await page.locator(".carga-encabezado .status-pill").first().waitFor({ timeout: 60000 });
  await page.locator('.carga-encabezado .status-pill:not(:has-text("Recibida")):not(:has-text("Validando"))').first().waitFor({ timeout: 120000 });
}

/** La pantalla se refresca sola cada 15 s mientras la carga esta activa; aca solo se espera la condicion. */
async function esperar(page, condicion, etiqueta) {
  const fin = Date.now() + LIMITE_MS;
  while (Date.now() < fin) {
    if (await condicion()) return true;
    await page.waitForTimeout(5000);
  }
  check(`${etiqueta}: tiempo agotado`, false, await estado(page));
  return false;
}

async function sinDesborde(page, etiqueta) {
  const ok = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check(`${etiqueta}: sin desplazamiento horizontal`, ok);
}

async function rechazo(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await login(page);
  await irACargas(page);
  await subir(page, rutaRechazo);
  check("rechazo: archivo validado", (await estado(page)).includes("Lista para confirmar"), await estado(page));
  await page.getByRole("button", { name: "Confirmar y emitir" }).click();
  await page.getByRole("button", { name: /Sí, emitir 1 facturas/ }).click();

  const atencion = page.locator(".carga-atencion").first();
  if (!(await esperar(page, async () => (await atencion.count()) > 0, "rechazo: SIFEN rechaza y aparece la atencion"))) {
    await page.screenshot({ path: path.join(outDir, "rechazo-sin-atencion.png"), fullPage: true });
    await ctx.close();
    return;
  }
  const texto = await page.locator(".carga-masiva").innerText();
  check("CA-01: aviso y total 'Requieren atención'", /Requieren atención\s*\n?\s*1/.test(texto) && texto.includes("La carga no termina hasta inutilizarlos"), texto.slice(0, 300));
  check("CA-01: numero sin resolver, rechazado por SIFEN", (await atencion.innerText()).includes("rechazado por SIFEN"), await atencion.innerText());
  check("CA-01: el rechazo trae su codigo SIFEN", texto.includes("1306"), "");
  // RN-10: sin nada en proceso, la carga solo espera al operador.
  check("RN-10: el estado se muestra como Requiere atención", (await estado(page)) === "Requiere atención", await estado(page));
  check("RN-10: sin barra ni 'Esperando la respuesta de SIFEN'", !texto.includes("Esperando la respuesta de SIFEN") && (await page.locator(".carga-barra").count()) === 0, "");
  const editar = page.getByRole("button", { name: "Editar" }).first();
  check("CA-04: Editar deshabilitado", await editar.isDisabled(), "");
  check("CA-04: texto 'Edición no disponible todavía'", texto.includes("Edición no disponible todavía"), "");
  await page.screenshot({ path: path.join(outDir, "390-rechazo-atencion.png"), fullPage: true });
  await sinDesborde(page, "390 con atencion");

  await page.getByRole("button", { name: "Inutilizar número" }).first().click();
  const dialogo = page.getByRole("dialog", { name: /Inutilizar número/ });
  await dialogo.locator("textarea").fill("abc");
  check("CA-03: motivo corto no se envia", await dialogo.getByRole("button", { name: "Sí, inutilizar" }).isDisabled(), "");
  check("RN-02: el dialogo advierte que no se deshace", (await dialogo.innerText()).includes("No se puede deshacer"), "");
  await page.screenshot({ path: path.join(outDir, "390-dialogo.png"), fullPage: true });
  await dialogo.locator("textarea").fill("Factura rechazada por SIFEN en la prueba de la carga");
  await dialogo.getByRole("button", { name: "Sí, inutilizar" }).click();
  const aviso = page.locator(".carga-aviso", { hasText: "Inutilización del número" });
  await aviso.waitFor({ timeout: 90000 }).catch(() => {});
  const avisoTexto = await aviso.innerText().catch(() => "");
  check("CA-02: la inutilizacion se envia y FE responde", /Aceptada|En curso/.test(avisoTexto), avisoTexto || (await page.locator(".carga-masiva").innerText()).slice(0, 300));

  const cerrada = await esperar(page, async () => (await estado(page)).includes("Finalizada"), "CA-02: la carga termina al inutilizar");
  await page.getByRole("button", { name: "Volver a las cargas" }).click();
  await page.getByRole("heading", { name: "Cargas de facturas" }).waitFor({ timeout: 20000 });
  const filaLista = page.locator("tr", { hasText: path.basename(rutaRechazo) }).first();
  check("RN-10: en la lista, la carga cerrada vuelve a Finalizada", (await filaLista.locator(".status-pill").innerText()).includes("Finalizada"), "");
  await page.locator(".carga-enlace", { hasText: path.basename(rutaRechazo) }).first().click();
  await page.locator(".carga-encabezado .status-pill").first().waitFor({ timeout: 20000 });
  if (cerrada) check("CA-02: la carga termina al inutilizar", true, await estado(page));
  const inut = await page.locator(".carga-inutilizacion").first().innerText().catch(() => "");
  check("CA-02: el comprobante muestra la inutilizacion", inut.includes("Inutilización"), inut);
  check("CA-02: sin atencion, no queda boton de inutilizar", (await page.getByRole("button", { name: "Inutilizar número" }).count()) === 0, "");
  await page.screenshot({ path: path.join(outDir, "390-rechazo-final.png"), fullPage: true });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, "1280-rechazo-final.png"), fullPage: true });
  await sinDesborde(page, "1280 con inutilizacion");
  await ctx.close();
}

async function invalida(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  await login(page);
  await irACargas(page);
  await subir(page, rutaInvalida);
  const primera = await estado(page);
  check("CA-05: sin nada que confirmar no se ofrece confirmar", (await page.getByRole("button", { name: "Confirmar y emitir" }).count()) === 0, primera);
  const cerrada = await esperar(page, async () => (await estado(page)).includes("Finalizada"), "CA-05: FE la cierra sola y FS la muestra Finalizada");
  if (cerrada) check("CA-05: FE la cierra sola y FS la muestra Finalizada", true, `${primera} -> ${await estado(page)}`);
  check("CA-05: con numeracion del servicio un invalido no requiere atencion", (await page.locator(".carga-atencion").count()) === 0, "");
  await page.screenshot({ path: path.join(outDir, "1280-invalida-final.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, "390-invalida-final.png"), fullPage: true });
  await sinDesborde(page, "390 carga invalida");
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    await invalida(browser);
    await rechazo(browser);
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
