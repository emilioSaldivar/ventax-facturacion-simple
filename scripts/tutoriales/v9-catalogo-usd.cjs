#!/usr/bin/env node
// V9 — Catalogo en dolares (SPEC_TUTORIALES_VIDEO_v0.2 §2.1, §3.12, M-10; PLAN v0.2 §3 V9). NO emite.
// Antes de grabar borra (logico) en la base LOCAL los articulos que crea el video (LIC-USD y SOP-USD), para repetir.
//
//   ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/tutoriales/v9-catalogo-usd.cjs && bash scripts/tutoriales/montar.sh test-results/tutoriales/v9-catalogo-usd
const { execFileSync } = require("node:child_process");
const t = require("./lib.cjs");

const PG = process.env.TUT_PG_CONTAINER ?? "segel-fs-postgres-1";
const FACTURADOR = "0480309f-3d9d-44f4-9359-4c5c5728c8b2";
const sql = (q) =>
  execFileSync("docker", ["exec", "-i", PG, "sh", "-c", 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atq'], { input: q, encoding: "utf8" }).trim();

function limpiar() {
  sql(`update catalogo_items set deleted_at=now() where facturador_id='${FACTURADOR}' and deleted_at is null
         and (codigo in ('LIC-USD','SOP-USD') or descripcion in ('Licencia anual','Soporte remoto por hora'));`);
}

t.correr("v9-catalogo-usd", {}, async (s) => {
  const { page } = s;
  limpiar();
  await t.ingresar(s);
  await t.paso(s, "En este video: productos y servicios en dólares en tu catálogo, y cómo se usan en una factura en dólares.");

  // 1. Alta de un articulo en USD
  await t.abrirSeccion(s, "Catálogo");
  await page.getByRole("button", { name: "Nuevo producto o servicio" }).first().waitFor();
  await t.paso(s, "Cada producto o servicio tiene una sola moneda: guaraníes o dólares.", { cubre: ["3.12-moneda"] });
  await t.senalar(s, page.getByRole("button", { name: "Nuevo producto o servicio" }).first(), { clic: true });
  await t.senalar(s, page.getByLabel("Nombre o descripción", { exact: true }), { escribir: "Licencia anual" });
  const moneda = page.getByRole("complementary", { name: "Nuevo producto o servicio" }).getByRole("combobox", { name: "Moneda" });
  await t.senalar(s, moneda, { ms: 500 });
  await moneda.selectOption({ label: "Dólares (USD)" });
  await t.paso(s, "En “Moneda” elegí “Dólares (USD)”. El precio pasa a dólares y acepta centavos.");
  await t.senalar(s, page.getByRole("textbox", { name: /^Precio \(USD\)/ }), { escribir: "120,00" });
  await t.senalar(s, page.getByRole("button", { name: "Opciones avanzadas" }), { clic: true });
  const codigo = page.getByPlaceholder("SERV-001");
  if (await codigo.isVisible().catch(() => false)) await t.senalar(s, codigo, { escribir: "LIC-USD" });
  await t.paso(s, "Si vendés lo mismo en guaraníes y en dólares, cargá dos productos, uno en cada moneda.");
  await t.senalar(s, page.getByRole("button", { name: "Guardar", exact: true }), { clic: true });
  const filaLic = page.locator("tbody tr").filter({ hasText: "Licencia anual" }).first();
  await filaLic.waitFor();

  // 2. Precio con su moneda y filtro
  await t.paso(s, "En la lista, cada precio muestra su moneda.", { cubre: ["3.12-filtro"] });
  await t.senalar(s, filaLic.getByText("USD 120,00"), { ms: 1200 });
  const grupoMoneda = page.getByRole("group", { name: "Moneda" });
  await t.paso(s, "Con el filtro “Moneda” ves solo los de una moneda.");
  await t.senalar(s, grupoMoneda.getByRole("button", { name: "USD" }), { clic: true });
  await page.waitForTimeout(1200);
  await t.paso(s, "Ahora solo los productos en dólares.");
  await t.senalar(s, grupoMoneda.getByRole("button", { name: "Todas" }), { clic: true });
  await page.waitForTimeout(800);

  // 3. Factura en USD con un articulo en USD
  await t.paso(s, "Veamos cómo se usan en una factura en dólares.");
  await t.abrirSeccion(s, "Nueva factura");
  await page.locator("section[aria-label='Cliente']").waitFor();
  const monedaFactura = page.getByLabel("Moneda", { exact: true });
  await t.senalar(s, monedaFactura, { ms: 400 });
  await monedaFactura.selectOption("USD");
  await t.senalar(s, page.getByLabel("Tipo de cambio", { exact: true }), { escribir: "7350,50" });
  // Con el cliente cargado la vista previa calcula subtotales y totales (sin cliente quedan en 0: hallazgo H-17).
  const cliente = page.locator("section[aria-label='Cliente']");
  await t.senalar(s, cliente.getByPlaceholder("Ingresá el número de documento"), { escribir: "80026570-0" });
  await page.keyboard.press("Tab");
  await page.waitForFunction(() => {
    const el = document.querySelector("section[aria-label='Cliente'] label.cliente-nombre input");
    return el && el.value.trim().length > 0;
  }, null, { timeout: 20000 });
  await t.paso(s, "Al escribir la descripción, las sugerencias muestran el precio con su moneda.", { cubre: ["3.12-misma-moneda"] });
  await t.senalar(s, page.getByLabel("Descripción, línea 1", { exact: true }), { escribir: "Licencia" });
  const sugLic = page.getByRole("listbox", { name: "Catálogo" }).getByRole("button", { name: /LIC-USD/ }).first();
  await sugLic.waitFor({ timeout: 10000 });
  await t.paso(s, "Hay uno en dólares y otro en guaraníes. Elegí el de dólares.", { ms: 1500 });
  await t.senalar(s, sugLic, { clic: true });
  await page.waitForTimeout(800);
  await t.paso(s, "Como la factura es en dólares, trae el precio: USD 120,00.");
  await t.senalar(s, page.getByLabel("Precio, línea 1", { exact: true }), { ms: 1200 });

  // 4. Articulo en guaranies en una factura en USD
  await t.paso(s, "Ahora uno que está en guaraníes.", { cubre: ["3.12-otra-moneda"] });
  const desc2 = page.getByLabel("Descripción, línea 2", { exact: true });
  if (!(await desc2.isVisible().catch(() => false))) await t.senalar(s, page.getByRole("button", { name: /Agregar línea/ }), { clic: true, ms: 300 });
  await t.senalar(s, desc2, { escribir: "Manten" });
  const sugMant = page.getByRole("listbox", { name: "Catálogo" }).getByRole("button", { name: /MANT-01/ }).first();
  await sugMant.waitFor({ timeout: 10000 });
  await t.senalar(s, sugMant, { clic: true });
  await page.waitForTimeout(800);
  const aviso = page.getByText(/Item del catálogo en Gs\./).first();
  await aviso.waitFor({ timeout: 5000 });
  await t.senalar(s, aviso, { ms: 800 });
  await t.paso(s, "Trae la descripción y el IVA, pero no el precio: la app no convierte, porque la cotización la decidís vos.");
  await t.senalar(s, page.getByLabel("Precio, línea 2", { exact: true }), { escribir: "61,25" });

  // 5. Guardar en el catalogo desde una linea en USD
  await t.paso(s, "Si escribís un producto nuevo, lo podés guardar en el catálogo desde la misma línea.", { cubre: ["3.12-guardar"] });
  const desc3 = page.getByLabel("Descripción, línea 3", { exact: true });
  if (!(await desc3.isVisible().catch(() => false))) await t.senalar(s, page.getByRole("button", { name: /Agregar línea/ }), { clic: true, ms: 300 });
  await t.senalar(s, page.getByLabel("Código, línea 3", { exact: true }), { escribir: "SOP-USD" });
  await t.senalar(s, desc3, { escribir: "Soporte remoto por hora" });
  await page.keyboard.press("Escape").catch(() => undefined);
  await t.senalar(s, page.getByLabel("Cantidad, línea 3", { exact: true }), { escribir: "4" });
  await t.senalar(s, page.getByLabel("Precio, línea 3", { exact: true }), { escribir: "25,00" });
  const guardar = page.getByRole("button", { name: "Guardar en catálogo, línea 3" });
  await t.senalar(s, guardar, { clic: true });
  await page.waitForTimeout(1500);
  await t.paso(s, "Se guarda en dólares, la moneda de la factura, con el precio de la línea.");
  await t.paso(s, "No emitimos esta factura: el resto es igual que cualquier factura en dólares.");

  // Cierre: el catalogo con los dos en USD
  await t.abrirSeccion(s, "Catálogo");
  const salir = page.getByRole("dialog").getByRole("button", { name: /Salir|Descartar|Sí/ }).first();
  if (await salir.isVisible({ timeout: 2500 }).catch(() => false)) {
    await t.paso(s, "Como la factura no se emitió, la app avisa antes de salir.");
    await t.senalar(s, salir, { clic: true });
  }
  await page.getByRole("group", { name: "Moneda" }).waitFor();
  await t.senalar(s, page.getByRole("group", { name: "Moneda" }).getByRole("button", { name: "USD" }), { clic: true });
  await page.locator("tbody tr").filter({ hasText: "Soporte remoto por hora" }).first().waitFor({ timeout: 10000 });
  await t.paso(s, "Y ya está en tu catálogo, en dólares, para la próxima factura.", { ms: 2000 });
  await t.paso(s, "Resumen: cada producto tiene una moneda; en una factura de otra moneda se ofrece sin precio y no se convierte.");
});
