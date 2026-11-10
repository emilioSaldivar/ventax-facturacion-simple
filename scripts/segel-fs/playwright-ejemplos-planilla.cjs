#!/usr/bin/env node
// Sube ejemplos de la planilla CSV v1 de FE por el panel de FS, los confirma y los sigue hasta "Finalizada".
// Solo contra el stack local de Segel con SIFEN test, nunca segel-fs. Un archivo por carga, en orden.
//
//   ENSAYO_PASSWORD_FILE=/ruta/operador.pass node scripts/segel-fs/playwright-ejemplos-planilla.cjs <csv>...
//
// Por archivo registra: estado final, aprobados, rechazados, invalidos y los motivos de cada comprobante.
// Escribe test-results/ejemplos-planilla/.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const outDir = path.join(process.cwd(), "test-results", "ejemplos-planilla");
const LIMITE_MS = Number(process.env.ENSAYO_LIMITE_MIN ?? 20) * 60_000;
fs.mkdirSync(outDir, { recursive: true });

const resultados = [];
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 600), hora: new Date().toISOString() });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 600)}` : ""}`);
}

async function login(page) {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(usuario);
  await page.locator('input[name="password"]').fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await esperarSesion(page);
}

async function irACargas(page) {
  await abrirVista(page, "Documentos");
  await page.getByRole("heading", { name: "Facturas y notas" }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Carga masiva" }).click();
  await page.getByRole("heading", { name: "Cargas de facturas" }).waitFor({ timeout: 20000 });
}

const estado = async (page) => (await page.locator(".carga-encabezado .status-pill").first().innerText().catch(() => "")).trim();
const total = (texto, etiqueta) => Number(new RegExp(`${etiqueta}\\s*\\n?\\s*(\\d+)`).exec(texto)?.[1] ?? 0);

async function probar(page, ruta) {
  const nombre = path.basename(ruta, ".csv");
  await page.getByRole("button", { name: "Nueva carga" }).click();
  await page.locator('input[type="file"]').setInputFiles(ruta);
  await page.getByRole("button", { name: "Subir archivo" }).click();
  await page.locator('.carga-encabezado .status-pill:not(:has-text("Recibida")):not(:has-text("Validando"))').first().waitFor({ timeout: 120000 });
  const validada = await estado(page);
  const informe = await page.locator(".carga-masiva").innerText();
  await page.screenshot({ path: path.join(outDir, `${nombre}-informe.png`), fullPage: true });
  if (!validada.includes("Lista para confirmar")) {
    check(`${nombre}: validado sin errores`, false, `${validada} :: ${informe.slice(0, 500)}`);
    await page.getByRole("button", { name: "Volver a las cargas" }).click();
    await page.getByRole("heading", { name: "Cargas de facturas" }).waitFor({ timeout: 20000 });
    return;
  }
  check(`${nombre}: validado sin errores`, total(informe, "Con errores") === 0, informe.slice(0, 300));
  await page.getByRole("button", { name: "Confirmar y emitir" }).click();
  await page.getByRole("button", { name: /^Sí, emitir \d+ facturas$/ }).click();

  const fin = Date.now() + LIMITE_MS;
  let final = "";
  while (Date.now() < fin) {
    final = await estado(page);
    if (/Finalizada|Cancelada/.test(final)) break;
    await page.waitForTimeout(10000);
  }
  const texto = await page.locator(".carga-masiva").innerText();
  await page.screenshot({ path: path.join(outDir, `${nombre}-final.png`), fullPage: true });
  const comprobantes = total(texto, "Comprobantes");
  const aprobados = total(texto, "Aprobados");
  check(
    `${nombre}: Finalizada con ${comprobantes} aprobado(s) y sin rechazos`,
    final.includes("Finalizada") && aprobados === comprobantes && total(texto, "Rechazados") === 0,
    `${final} comprobantes=${comprobantes} aprobados=${aprobados} rechazados=${total(texto, "Rechazados")} :: ${texto.slice(texto.indexOf("Número del archivo"), texto.indexOf("Número del archivo") + 500)}`
  );
  await page.getByRole("button", { name: "Volver a las cargas" }).click();
  await page.getByRole("heading", { name: "Cargas de facturas" }).waitFor({ timeout: 20000 });
}

(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    await login(page);
    await irACargas(page);
    for (const ruta of process.argv.slice(2)) await probar(page, ruta);
    await ctx.close();
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
