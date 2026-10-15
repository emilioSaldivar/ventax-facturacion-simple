#!/usr/bin/env node
// SPEC_REINTENTO_EMISION_CONFIRMADO_v0.1 — REC-012. Flujo real: UI + API + Postgres de los contenedores,
// con `facturacion-electronica` en modo mock. No simula respuestas de la API.
//
//   E2E_USER=... E2E_PASSWORD=... E2E_RESEED_CMD="docker exec -i ... psql ... < seed.sql" \
//     node scripts/playwright-reintento-emision.cjs
//
// El seed deja dos facturas del operador E2E: "E2E REC Verificar" (FE ya la recibio: UUID y CDC,
// PENDIENTE_SIFEN) y "E2E REC Reintentar" (FE nunca la recibio: sin identidad, ultimo intento fallido).
const { execSync } = require("node:child_process");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8096/app/";
const user = process.env.E2E_USER;
const password = process.env.E2E_PASSWORD;
const reseed = process.env.E2E_RESEED_CMD;
const outDir = process.env.E2E_OUT_DIR ?? path.join(process.cwd(), "test-results");

if (!user || !password || !reseed) {
  console.error("Faltan E2E_USER, E2E_PASSWORD o E2E_RESEED_CMD.");
  process.exit(2);
}

const viewports = [
  { nombre: "mobile", width: 390, height: 844 },
  { nombre: "desktop", width: 1280, height: 800 }
];

const resultados = [];
function check(viewport, escenario, verificacion, ok, detalle = "") {
  resultados.push({ viewport, escenario, verificacion, ok: Boolean(ok), detalle });
}

async function login(page) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(user);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.getByRole("button", { name: "Abrir menu" }).first().waitFor({ timeout: 15000 });
}

async function abrirDocumento(page, cliente) {
  // Recarga para volver a la lista: el menu no cierra un detalle ya abierto. La sesion persiste.
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Abrir menu" }).first().waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Abrir menu" }).first().click();
  await page.locator('button:has-text("Documentos")').first().click();
  const fila = page.locator(`text=${cliente}`).first();
  await fila.waitFor({ timeout: 15000 });
  await fila.click();
  await page.locator(".accion-banner").first().waitFor({ timeout: 15000 });
}

async function abrirOpcionesAvanzadas(page) {
  const summary = page.locator("summary", { hasText: "Opciones avanzadas" }).first();
  if (await summary.count()) {
    const abierto = await summary.evaluate((el) => el.parentElement?.hasAttribute("open"));
    if (!abierto) await summary.click();
  }
}

async function contarBoton(page, nombre) {
  return page.getByRole("button", { name: nombre, exact: true }).count();
}

async function main() {
  const browser = await chromium.launch();

  for (const vp of viewports) {
    execSync(reseed, { stdio: "ignore", shell: "/bin/bash" });
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    await login(page);

    // (a) FE ya recibio el documento: verificar, nunca reintentar.
    await abrirDocumento(page, "E2E REC Verificar");
    const banner = page.locator(".accion-banner").first();
    check(vp.nombre, "a", "banner muestra 'Verificar estado fiscal'",
      await banner.getByRole("button", { name: "Verificar estado fiscal" }).count() === 1);
    check(vp.nombre, "a", "banner invita a verificar ahora",
      (await banner.innerText()).includes("podés verificar ahora"));
    await abrirOpcionesAvanzadas(page);
    check(vp.nombre, "a", "sin 'Reintentar emisión' en ninguna parte", await contarBoton(page, "Reintentar emisión") === 0);
    check(vp.nombre, "a", "sin etiquetas viejas",
      await contarBoton(page, "Volver a verificar") === 0 && await contarBoton(page, "Reintentar validacion") === 0 && await contarBoton(page, "Reintentar") === 0);
    check(vp.nombre, "a", "un solo 'Verificar estado fiscal' en pantalla (RN-10)", await contarBoton(page, "Verificar estado fiscal") === 1);
    await page.screenshot({ path: path.join(outDir, `reintento-a-antes-${vp.nombre}.png`), fullPage: true });

    await banner.getByRole("button", { name: "Verificar estado fiscal" }).click();
    const emitida = await page.locator(".accion-banner", { hasText: "Factura emitida" }).first()
      .waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    check(vp.nombre, "a", "tras verificar, el documento queda emitido", emitida);
    await abrirOpcionesAvanzadas(page);
    check(vp.nombre, "a", "emitida: sin 'Verificar estado fiscal' (RN-10)", await contarBoton(page, "Verificar estado fiscal") === 0);
    await page.screenshot({ path: path.join(outDir, `reintento-a-despues-${vp.nombre}.png`), fullPage: true });

    // (b) FE nunca lo recibio: reintentar emision, con confirmacion del backend.
    await abrirDocumento(page, "E2E REC Reintentar");
    const bannerB = page.locator(".accion-banner").first();
    check(vp.nombre, "b", "banner muestra 'Reintentar emisión'",
      await bannerB.getByRole("button", { name: "Reintentar emisión" }).count() === 1);
    check(vp.nombre, "b", "sin 'Verificar estado fiscal' en el banner (no tiene identidad)",
      await bannerB.getByRole("button", { name: "Verificar estado fiscal" }).count() === 0);
    await abrirOpcionesAvanzadas(page);
    check(vp.nombre, "b", "'Reintentar emisión' tambien en opciones avanzadas", await contarBoton(page, "Reintentar emisión") === 2);
    await page.screenshot({ path: path.join(outDir, `reintento-b-antes-${vp.nombre}.png`), fullPage: true });

    await bannerB.getByRole("button", { name: "Reintentar emisión" }).click();
    const enviado = await page.locator("text=Reintento de emisión enviado.").first()
      .waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    check(vp.nombre, "b", "mensaje 'Reintento de emisión enviado.'", enviado);
    check(vp.nombre, "b", "el boton desaparece tras reintentar", await contarBoton(page, "Reintentar emisión") === 0);
    await page.screenshot({ path: path.join(outDir, `reintento-b-despues-${vp.nombre}.png`), fullPage: true });

    await ctx.close();
  }

  await browser.close();
  const fallos = resultados.filter((r) => !r.ok);
  console.log(JSON.stringify({ resultados, fallos: fallos.length }, null, 2));
  if (fallos.length > 0) process.exit(1);
  console.log(`OK: ${resultados.length} verificaciones en ${viewports.length} viewports.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
