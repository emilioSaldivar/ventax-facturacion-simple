#!/usr/bin/env node
// FS-33 a FS-36 (SPEC_CORRECCIONES_TRAS_FIXES_FE_v0.1, seccion 7e), contra el ensayo local de la segunda
// entrega. UI + API + Postgres de los contenedores. Solo localhost. No emite ni modifica documentos.
//
//   E2E_USER=operador-ensayo E2E_PASSWORD_FILE=<ruta> E2E_ANULADA=1010014 E2E_RECHAZADA=1010001 \
//     E2E_CARGA_CON_ERRORES=invalida-408271.csv node scripts/playwright-ensayo-documentos.cjs
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:18492/app/";
const usuario = process.env.E2E_USER;
const clave = process.env.E2E_PASSWORD_FILE ? fs.readFileSync(process.env.E2E_PASSWORD_FILE, "utf8").trim() : process.env.E2E_PASSWORD;
const anulada = process.env.E2E_ANULADA;
const rechazada = process.env.E2E_RECHAZADA;
const cargaConErrores = process.env.E2E_CARGA_CON_ERRORES;
const outDir = process.env.E2E_OUT_DIR ?? path.join(process.cwd(), "test-results", "ensayo-documentos");
if (!/^http:\/\/(localhost|127\.0\.0\.1):/.test(baseUrl)) throw new Error("Solo contra el ensayo local.");
if (!usuario || !clave || !anulada || !rechazada || !cargaConErrores) throw new Error("Faltan variables: ver el encabezado.");

let fallos = 0;
let total = 0;
function check(vp, nombre, ok, detalle = "") {
  total += 1;
  if (!ok) fallos += 1;
  console.log(`${ok ? "OK   " : "FALLA"} [${vp}] ${nombre}${ok ? "" : ` :: ${String(detalle).slice(0, 300)}`}`);
}

async function irADocumentos(page) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Abrir menu" }).first().click();
  await page.locator('button:has-text("Documentos")').first().click();
  await page.getByRole("heading", { name: "Facturas y notas" }).waitFor();
}

async function buscar(page, numero) {
  await page.getByPlaceholder("Buscar factura...").fill(numero);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.locator(".document-row", { hasText: numero }).first().waitFor();
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  for (const vp of [{ nombre: "390", width: 390, height: 844 }, { nombre: "1280", width: 1280, height: 800 }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, permissions: ["clipboard-read", "clipboard-write"] });
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.locator('input[name="username"]').fill(usuario);
      await page.locator('input[name="password"]').fill(clave);
      await page.getByRole("button", { name: "Ingresar" }).click();
      await page.getByRole("button", { name: "Abrir menu" }).first().waitFor();

      // FS-34: la anulada se distingue sin abrirla.
      await irADocumentos(page);
      await buscar(page, anulada);
      const fila = page.locator(".document-row", { hasText: anulada }).first();
      const estado = await fila.locator(".estado-documento").getAttribute("data-estado");
      const texto = await fila.innerText();
      check(vp.nombre, "CA-34.1: la anulada muestra su estado en el listado", estado === "ANULADA" && /Anulada/.test(texto), texto);
      check(vp.nombre, "CA-34.1: sin el icono verde de emitida", !texto.includes("🟢"), texto);
      await page.screenshot({ path: path.join(outDir, `${vp.nombre}-1-listado-anulada.png`), fullPage: true });

      // FS-36: la rechazada avisa la inutilizacion pendiente.
      await buscar(page, rechazada);
      await page.locator(".document-row", { hasText: rechazada }).first().click();
      await page.locator(".accion-banner").first().waitFor();
      const ficha = await page.locator(".documents-view").innerText();
      check(vp.nombre, "CA-36.1: la rechazada dice que su numero queda pendiente de inutilizar", /pendiente de inutilizar/.test(ficha), ficha);

      // FS-35: ayuda a soporte en un comprobante con error de una carga.
      await irADocumentos(page);
      await page.getByRole("button", { name: "Carga masiva" }).click();
      await page.locator(".carga-enlace", { hasText: cargaConErrores }).first().click();
      await page.getByRole("button", { name: "Con errores" }).click();
      await page.getByRole("button", { name: "Copiar datos para soporte" }).first().click();
      await page.locator(".carga-aviso", { hasText: "Datos copiados" }).waitFor();
      const copiado = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
      check(vp.nombre, "CA-35.1: copia los datos del comprobante con error", /TOTAL_NO_COINCIDE/.test(copiado) && copiado.includes(cargaConErrores), copiado);
      await page.screenshot({ path: path.join(outDir, `${vp.nombre}-2-carga-soporte.png`), fullPage: true });

      // FS-33: ver una factura de la carga y volver a la carga.
      await page.getByRole("button", { name: "Aprobados" }).click();
      await page.getByRole("button", { name: "Ver factura" }).first().click();
      const volver = page.getByRole("button", { name: "← Volver a la carga" });
      await volver.waitFor();
      check(vp.nombre, "CA-33.1: la ficha ofrece volver a la carga", true);
      await volver.click();
      await page.locator(".carga-masiva h3", { hasText: cargaConErrores }).waitFor();
      check(vp.nombre, "CA-33.1: vuelve al detalle de la misma carga", true);
      check(vp.nombre, "sin desplazamiento horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
      await page.screenshot({ path: path.join(outDir, `${vp.nombre}-3-vuelta-a-la-carga.png`), fullPage: true });
    } catch (error) {
      check(vp.nombre, "flujo completo", false, error.message.split("\n")[0]);
      await page.screenshot({ path: path.join(outDir, `${vp.nombre}-falla.png`), fullPage: true }).catch(() => {});
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${total - fallos}/${total} verificaciones OK. Capturas en ${outDir}`);
  process.exit(fallos ? 1 : 0);
})();
