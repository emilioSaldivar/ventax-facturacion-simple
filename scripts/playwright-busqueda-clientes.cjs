#!/usr/bin/env node
// SPEC_BUSQUEDA_CLIENTES_ENTRE_FACTURADORES_v0.1 — BCF-003. UI real contra un stack aislado, sin simular la API.
//
//   E2E_BASE_URL=... E2E_USER=... E2E_PASSWORD=... E2E_OPERADORES=... node scripts/playwright-busqueda-clientes.cjs
//
// E2E_OPERADORES: JSON { propio: {documento, razon_social}, ajeno: {documento, razon_social} }.
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.E2E_BASE_URL;
const user = process.env.E2E_USER;
const password = process.env.E2E_PASSWORD;
const datos = process.env.E2E_OPERADORES ? JSON.parse(process.env.E2E_OPERADORES) : null;
const outDir = process.env.E2E_OUT_DIR ?? path.join(process.cwd(), "test-results", "busqueda-clientes");
if (!baseUrl || !user || !password || !datos) {
  console.error("Faltan E2E_BASE_URL, E2E_USER, E2E_PASSWORD o E2E_OPERADORES.");
  process.exit(2);
}

const resultados = [];
const check = (viewport, verificacion, ok, detalle = "") => resultados.push({ viewport, verificacion, ok: Boolean(ok), detalle });

async function buscar(page, campo, texto) {
  const respuesta = page.waitForResponse((r) => r.url().includes("/clientes/search") && r.url().includes(encodeURIComponent(texto)), { timeout: 8000 }).catch(() => null);
  await campo.fill(texto);
  const r = await respuesta;
  return r ? (await r.json()).items : null;
}

(async () => {
  const browser = await chromium.launch();
  for (const v of [{ nombre: "movil", width: 390, height: 844 }, { nombre: "escritorio", width: 1280, height: 800 }]) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height } });
    const page = await ctx.newPage();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.locator('input[name="username"]').fill(user);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await page.getByRole("button", { name: "Abrir menu" }).first().waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Abrir menu" }).first().click();
    await page.locator('button:has-text("Nueva factura")').first().click();
    const campo = page.getByPlaceholder("Ingresá el número de documento").first();
    await campo.waitFor({ timeout: 10000 });

    const porNombreAjeno = await buscar(page, campo, datos.ajeno.razon_social.slice(0, 10));
    const ajenos = (porNombreAjeno ?? []).filter((c) => c.documento === datos.ajeno.documento);
    check(v.nombre, "nombre ajeno: la API respondio", porNombreAjeno !== null);
    check(v.nombre, "nombre ajeno: sin clientes de otro facturador", ajenos.length === 0, `${ajenos.length} resultados`);
    await page.waitForTimeout(600);
    const textoNombre = await page.locator("body").innerText();
    check(v.nombre, "nombre ajeno: no se muestra en pantalla", !textoNombre.includes(datos.ajeno.razon_social));
    await page.screenshot({ path: path.join(outDir, `${v.nombre}-nombre-ajeno.png`), fullPage: true });

    const porDocumento = await buscar(page, campo, datos.ajeno.documento);
    const identidad = (porDocumento ?? []).find((c) => c.documento === datos.ajeno.documento);
    check(v.nombre, "documento exacto: identidad sin contacto", identidad && !identidad.telefono && !identidad.email && !identidad.direccion, JSON.stringify(identidad ?? null).slice(0, 120));
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, `${v.nombre}-documento-exacto.png`), fullPage: true });

    const propios = await buscar(page, campo, datos.propio.razon_social.slice(0, 10));
    check(v.nombre, "agenda propia: encuentra por fragmento", (propios ?? []).some((c) => c.documento === datos.propio.documento && c.source === "AGENDA_FACTURADOR"));
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, `${v.nombre}-agenda-propia.png`), fullPage: true });
    await ctx.close();
  }
  await browser.close();
  for (const r of resultados) console.log(`${r.ok ? "OK " : "MAL"} [${r.viewport}] ${r.verificacion} ${r.detalle}`);
  process.exit(resultados.every((r) => r.ok) ? 0 : 1);
})().catch((e) => { console.error(e.message); process.exit(2); });
