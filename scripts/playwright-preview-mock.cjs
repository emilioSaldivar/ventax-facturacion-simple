#!/usr/bin/env node
// UXF-000 / CA-09 (SPEC_UX_NUEVA_FACTURA_v0.1): captura el cuerpo de POST /facturas/preview que arma la UI para tres
// lineas en USD, con la API mockeada por page.route (sin credenciales), para comparar antes y despues de un cambio de UI.
//
//   SMOKE_ORIGIN=http://127.0.0.1:18492 node scripts/playwright-preview-mock.cjs test-results/editor-pc/preview-usd.json [completo|simple]
const { chromium } = require(require("node:path").join(__dirname, "../node_modules/playwright"));
const fs = require("node:fs");
const origin = process.env.SMOKE_ORIGIN ?? "http://127.0.0.1:18492";
const salida = process.argv[2];
const modo = process.argv[3] ?? "completo";
const contexto = {
  user: { id: "u1", username: "op", display_name: "Operador Demo", role: "OPERADOR_FACTURACION" },
  tenant: { id: "t1", name: "Empresa Ejemplo S.A.", status: "ACTIVE" },
  facturador: { id: "f1", emisor_id: "80000000-1", razon_social: "Empresa Ejemplo S.A.", ruc: "80000000-1" },
  fiscal_context: { establecimiento: "001", punto_expedicion: "001", perfil_emision_codigo: "P1", actividad_economica_codigo: "62010",
    actividad_economica_descripcion: "Servicios", timbrado: "12345678", timbrado_inicio: "2026-01-01", documento_nro: "0000119", credito_plazo_dias: 30, tipo_transaccion_default: 2 }
};
const previewResp = { items: [], totals: { subtotal: 0, total_sin_iva: 0, iva_5: 0, iva_10: 0, total_iva: 0, total: 0 } };
let ultimo = null;
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((m) => { localStorage.setItem("fs.editor.modo", m); localStorage.setItem("ventax_factura_access_token", "11111111-1111-4111-8111-111111111111"); }, modo);
  const page = await ctx.newPage();
  await page.route("**/api/v1/**", (route) => {
    const url = route.request().url();
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (url.includes("/auth/refresh")) return json({ error: { code: "UNAUTHORIZED" } }, 401);
    if (url.includes("/me/context")) return json(contexto);
    if (url.includes("/me/readiness")) return json({ ready: true, checks: [] });
    if (url.includes("/facturas/preview")) { ultimo = JSON.parse(route.request().postData() ?? "{}"); return json(previewResp); }
    if (url.includes("/dnit/autocomplete")) return json({ found: false });
    return json({ items: [], total: 0, data: [] });
  });
  await page.goto(origin + "/app/", { waitUntil: "networkidle" });
  const nav = page.locator("nav.side-nav");
  await nav.getByRole("button", { name: "Nueva factura" }).first().click();
  await page.locator('select[aria-label="Moneda"]').waitFor();
  await page.locator('select[aria-label="Moneda"]').selectOption("USD");
  await page.getByLabel("Tipo de cambio").fill("7350,5");
  await page.getByPlaceholder("Ingrese numero de documento").fill("80026570-0");
  await page.getByLabel("Nombre o razon social").fill("SEGEL SA");
  if (modo === "completo") {
    const fila = async (i, d, c, p) => {
      const f = page.locator(`[data-grilla-fila="${i}"]`);
      await f.locator('input[data-celda="descripcion"]').fill(d);
      await f.getByLabel(/^Cantidad, línea/).fill(c);
      await f.getByLabel(/^Precio, línea/).fill(p);
    };
    await fila(0, "Consultoria PC linea 1", "2", "150,25");
    await fila(1, "Consultoria PC linea 2", "1,5", "99,99");
    await fila(2, "Consultoria PC linea 3", "3", "10");
    await page.locator('[data-grilla-fila="2"]').getByLabel(/^IVA, línea/).selectOption("IVA_5");
  }
  await page.waitForTimeout(1500);
  fs.writeFileSync(salida, JSON.stringify(ultimo, null, 2));
  console.log(JSON.stringify(ultimo));
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
