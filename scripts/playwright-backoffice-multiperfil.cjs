#!/usr/bin/env node
// Backoffice: varios puntos de expedicion por usuario (SPEC_MULTIPERFIL_USUARIO_v0.1 §D, v0.2 C; MPU-014, MPU2-012).
// Solo stack local de Segel.
//
//   BACKOFFICE_PASSWORD_FILE=/ruta/admin.pass node scripts/playwright-backoffice-multiperfil.cjs
//
// Recorre el detalle de operador-ensayo en 1440 px: tabla de puntos, quitar 001-002 (texto del confirm), agregar
// de nuevo con facturador fijo, texto de RN-01 y listado sin filas duplicadas. Deja los datos como estaban.
// Escribe test-results/backoffice-multiperfil/.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../node_modules/playwright"));

const base = process.env.SEGEL_BACKOFFICE_URL ?? "http://127.0.0.1:18492/backoffice/";
const clave = fs.readFileSync(process.env.BACKOFFICE_PASSWORD_FILE ?? "", "utf8").trim();
const operador = process.env.ENSAYO_USER ?? "operador-ensayo";
const outDir = path.join(process.cwd(), "test-results", "backoffice-multiperfil");
fs.mkdirSync(outDir, { recursive: true });

const resultados = [];
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 300) });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 300)}` : ""}`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(20000);
  const dialogos = [];
  page.on("dialog", (d) => {
    dialogos.push(d.message());
    void d.accept();
  });
  try {
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.locator('input[autocomplete="username"]').fill("admin-backoffice");
    await page.locator('input[autocomplete="current-password"]').fill(clave);
    await page.locator("form.auth-form button[type=submit]").click();
    await page.getByRole("button", { name: "Usuarios" }).first().click();
    await page.getByRole("heading", { name: "Usuarios" }).waitFor();
    await page.waitForTimeout(1000);
    const filas = page.locator("tbody tr").filter({ has: page.locator("td.monospace", { hasText: new RegExp(`^${operador}$`) }) });
    check("CA-07: el listado muestra una sola fila por usuario con varios puntos", (await filas.count()) === 1, String(await filas.count()));
    await filas.first().getByRole("button", { name: "Ver" }).click();

    const tabla = page.getByRole("table", { name: "Puntos de expedición del usuario" });
    await tabla.waitFor();
    check("D.1: la tabla lista dos puntos", (await tabla.locator("tbody tr").count()) === 2);
    check("RN-01: texto fijo de un facturador por usuario", (await page.locator("body").innerText()).includes("Todas las configuraciones de un usuario son del mismo facturador"));
    await page.screenshot({ path: path.join(outDir, "1440-dos-puntos.png"), fullPage: true });

    const fila002 = tabla.locator("tbody tr").filter({ has: page.locator("td", { hasText: /^002$/ }) });
    await fila002.getByRole("button", { name: "Quitar" }).click();
    await page.waitForTimeout(1500);
    const texto = dialogos.at(-1) ?? "";
    check("CA-21: el confirm no dice que se cierran sesiones", !/sesiones abiertas/i.test(texto) && texto.includes("seguira con los puntos que le queden"), texto);
    check("D.2: tras quitar queda un punto", (await tabla.locator("tbody tr").count()) === 1);

    await page.getByRole("button", { name: "Agregar punto de expedición" }).click();
    const selects = page.locator("form.form select");
    check("D.1: tenant y facturador fijos al agregar", (await selects.nth(0).isDisabled()) && (await selects.nth(1).isDisabled()));
    const contexto = selects.nth(2);
    await page.waitForFunction((el) => el && el.options.length > 1, await contexto.elementHandle(), { timeout: 15000 });
    const opciones = await contexto.locator("option").allInnerTexts();
    check("D.1: el punto ya asignado no se ofrece", opciones.length === 2, JSON.stringify(opciones));
    await contexto.selectOption({ index: 1 });
    await page.screenshot({ path: path.join(outDir, "1440-agregar.png"), fullPage: true });
    await page.getByRole("button", { name: "Agregar punto" }).click();
    await page.waitForTimeout(2000);
    check("D.1: tras agregar vuelven a ser dos puntos", (await tabla.locator("tbody tr").count()) === 2);
    check("Sin desplazamiento horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.screenshot({ path: path.join(outDir, "1440-final.png"), fullPage: true });
  } catch (error) {
    check("ejecucion sin excepciones", false, error instanceof Error ? error.stack : String(error));
  } finally {
    await browser.close();
    const ok = resultados.filter((r) => r.ok).length;
    fs.writeFileSync(path.join(outDir, "resumen.json"), JSON.stringify({ resultados }, null, 2));
    console.log(`\n${ok}/${resultados.length} verificaciones OK.`);
    process.exitCode = ok === resultados.length ? 0 : 1;
  }
})();
