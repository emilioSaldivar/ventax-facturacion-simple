#!/usr/bin/env node
// SPEC_ESTADO_FISCAL_CANONICO_v0.1 — EFC-008. Flujo real (UI + API + Postgres de los contenedores) con
// `facturacion-electronica` en modo mock y FE_MOCK_CANONICAL_STATUS=REJECTED en la API.
//
//   E2E_USER=... E2E_PASSWORD=... E2E_RESEED_CMD="..." node scripts/playwright-estado-canonico.cjs
//
// Reutiliza el seed de playwright-reintento-emision: "E2E REC Verificar" es un PENDIENTE_SIFEN con UUID.
const { execSync } = require("node:child_process");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8096/app/";
const { E2E_USER: user, E2E_PASSWORD: password, E2E_RESEED_CMD: reseed } = process.env;
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
const check = (viewport, verificacion, ok) => resultados.push({ viewport, verificacion, ok: Boolean(ok) });

async function abrirDocumento(page, cliente) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Abrir menu" }).first().click();
  await page.locator('button:has-text("Documentos")').first().click();
  await page.locator(`text=${cliente}`).first().click();
  await page.locator(".accion-banner").first().waitFor({ timeout: 15000 });
}

async function main() {
  const browser = await chromium.launch();
  for (const vp of viewports) {
    execSync(reseed, { stdio: "ignore", shell: "/bin/bash" });
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.locator('input[name="username"]').fill(user);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.getByRole("button", { name: "Abrir menu" }).first().waitFor({ timeout: 15000 });

    await abrirDocumento(page, "E2E REC Verificar");
    await page.locator(".accion-banner").first().getByRole("button", { name: "Verificar estado fiscal" }).click();
    const cambio = await page.locator(".accion-banner", { hasNotText: "Verificación automática en curso" }).first()
      .waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    check(vp.nombre, "tras verificar, deja de figurar como en proceso", cambio);
    // RECHAZADA se presenta al operador como "Requiere revision" con el aviso rojo de causa.
    check(vp.nombre, "el documento se muestra 'Requiere revision' (RECHAZADA)", await page.locator(".status-pill", { hasText: "Requiere revision" }).count() > 0);
    check(vp.nombre, "aviso de rechazo con accion para soporte", await page.getByRole("button", { name: /Copiar datos para soporte/ }).count() > 0);
    check(vp.nombre, "sin 'Reintentar emisión' (FE ya lo recibio)", await page.getByRole("button", { name: "Reintentar emisión", exact: true }).count() === 0);
    const summary = page.locator("summary", { hasText: "Opciones avanzadas" }).first();
    if (!(await summary.evaluate((el) => el.parentElement?.hasAttribute("open")))) await summary.click();
    check(vp.nombre, "un solo 'Verificar estado fiscal' (en opciones avanzadas)", await page.getByRole("button", { name: "Verificar estado fiscal", exact: true }).count() === 1);
    await page.screenshot({ path: path.join(outDir, `estado-canonico-rechazada-${vp.nombre}.png`), fullPage: true });
    await ctx.close();
  }
  await browser.close();
  const fallos = resultados.filter((r) => !r.ok);
  console.log(JSON.stringify({ resultados, fallos: fallos.length }, null, 2));
  if (fallos.length) process.exit(1);
  console.log(`OK: ${resultados.length} verificaciones en ${viewports.length} viewports.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
