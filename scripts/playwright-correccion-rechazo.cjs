#!/usr/bin/env node
// FS-28 y FS-29 (SPEC_CORRECCIONES_TRAS_FIXES_FE_v0.1, seccion 7c), contra el ensayo local de la segunda
// entrega. UI + API + Postgres de los contenedores; no simula respuestas. Solo localhost.
//
//   E2E_USER=operador-ensayo E2E_PASSWORD_FILE=<ruta> E2E_RECHAZADA=001-001-1010001 node scripts/playwright-correccion-rechazo.cjs
//
// No emite: verifica que el editor quede listo para emitir con los datos de la rechazada. Emitir es
// una factura comun, ya cubierta por el guion del ensayo.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:18492/app/";
const usuario = process.env.E2E_USER;
const clave = process.env.E2E_PASSWORD_FILE ? fs.readFileSync(process.env.E2E_PASSWORD_FILE, "utf8").trim() : process.env.E2E_PASSWORD;
const rechazada = process.env.E2E_RECHAZADA;
const outDir = process.env.E2E_OUT_DIR ?? path.join(process.cwd(), "test-results", "correccion-rechazo");
if (!/^http:\/\/(localhost|127\.0\.0\.1):/.test(baseUrl)) throw new Error("Solo contra el ensayo local.");
if (!usuario || !clave || !rechazada) throw new Error("Faltan E2E_USER, E2E_PASSWORD(_FILE) o E2E_RECHAZADA.");

let fallos = 0;
let total = 0;
function check(vp, nombre, ok, detalle = "") {
  total += 1;
  if (!ok) fallos += 1;
  console.log(`${ok ? "OK   " : "FALLA"} [${vp}] ${nombre}${ok ? "" : ` :: ${String(detalle).slice(0, 300)}`}`);
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  for (const vp of [{ nombre: "390", width: 390, height: 844 }, { nombre: "1280", width: 1280, height: 800 }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.locator('input[name="username"]').fill(usuario);
      await page.locator('input[name="password"]').fill(clave);
      await page.getByRole("button", { name: "Ingresar" }).click();
      await page.getByRole("button", { name: "Abrir menu" }).first().click();
      await page.locator('button:has-text("Documentos")').first().click();
      await page.getByRole("heading", { name: "Facturas y notas" }).waitFor();
      await page.getByPlaceholder("Buscar factura...").fill(rechazada);
      await page.getByRole("button", { name: "Buscar", exact: true }).click();
      await page.locator(`text=${rechazada}`).first().click();
      await page.locator(".accion-banner").first().waitFor();

      const ficha = await page.locator(".documents-view").innerText();
      check(vp.nombre, "CA-29.1: la ficha del 1306 no habla de pruebas ni de Marangatu test", !/ambiente de pruebas|Marangatu test|homologacion/i.test(ficha), ficha);
      check(vp.nombre, "FS-29: indica revisar el RUC y el digito verificador", /digito verificador/i.test(ficha), ficha);
      // FS-31: un documento sin validez no se entrega.
      check(vp.nombre, "CA-31.2: aviso de factura sin validez", await page.getByTestId("sin-validez").isVisible(), ficha);
      check(vp.nombre, "CA-31.2: sin Ver PDF, WhatsApp, Compartir ni Copiar enlace", !/Ver factura PDF|Enviar por WhatsApp|Compartir factura|Copiar enlace/.test(await page.locator(".documents-view").innerText()), ficha);
      await page.screenshot({ path: path.join(outDir, `${vp.nombre}-1-ficha-rechazada.png`), fullPage: true });

      await page.getByRole("button", { name: "Corregir y emitir de nuevo" }).click();
      const aviso = page.locator(".invoice-editor .editor-alert", { hasText: "Corrigiendo la factura rechazada" });
      await aviso.waitFor();
      const textoAviso = await aviso.innerText();
      check(vp.nombre, "CA-28.1: el editor avisa que corrige la rechazada y que sale con numero nuevo", textoAviso.includes(rechazada) && textoAviso.includes("número nuevo"), textoAviso);

      const editor = await page.locator("main").innerText();
      const valores = await page.locator(".invoice-editor input").evaluateAll((els) => els.map((el) => el.value));
      const todo = `${editor}\n${valores.join("\n")}`;
      check(vp.nombre, "CA-28.1: cliente precargado", todo.includes("RUC INEXISTENTE ENSAYO") && /99999990-\d/.test(todo), valores.join(" | "));
      const item = page.getByText("Servicio de ensayo", { exact: true }).first();
      const hayItem = await item.waitFor({ timeout: 5000 }).then(() => true, () => false);
      check(vp.nombre, "CA-28.1: item precargado", hayItem || todo.includes("Servicio de ensayo"), editor.slice(-400));
      check(vp.nombre, "sin desplazamiento horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
      await page.screenshot({ path: path.join(outDir, `${vp.nombre}-2-editor-precargado.png`), fullPage: true });
      if (process.env.E2E_EMITIDA) {
        await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
        await page.getByRole("button", { name: "Abrir menu" }).first().click();
        await page.locator('button:has-text("Documentos")').first().click();
        await page.getByPlaceholder("Buscar factura...").fill(process.env.E2E_EMITIDA);
        await page.getByRole("button", { name: "Buscar", exact: true }).click();
        await page.locator(`text=${process.env.E2E_EMITIDA}`).first().click();
        await page.getByText("Enviar por WhatsApp").first().waitFor();
        check(vp.nombre, "CA-31.2: una factura emitida conserva las acciones de entrega", (await page.getByTestId("sin-validez").count()) === 0);
        await page.screenshot({ path: path.join(outDir, `${vp.nombre}-3-ficha-emitida.png`), fullPage: true });
      }
    } catch (error) {
      check(vp.nombre, "flujo completo", false, error.message.split("\n")[0]);
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${total - fallos}/${total} verificaciones OK. Capturas en ${outDir}`);
  process.exit(fallos ? 1 : 0);
})();
