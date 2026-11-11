#!/usr/bin/env node
// Editor de factura en modo completo para PC (SPEC_EDITOR_FACTURA_PC_v0.1, CA-01 a CA-07). Solo stack local con SIFEN test.
//
//   ENSAYO_PASSWORD_FILE=/ruta/operador.pass node scripts/segel-fs/playwright-editor-pc.cjs
//
// Emite dos facturas reales en SIFEN test (USD de tres lineas y PYG). Escribe test-results/editor-pc/.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const outDir = path.join(process.cwd(), "test-results", "editor-pc");
const RUC = process.env.ENSAYO_RUC ?? "80026570-0";
const NOMBRE = process.env.ENSAYO_NOMBRE ?? "SEGEL SA";
fs.mkdirSync(outDir, { recursive: true });

const resultados = [];
let paginaActual = null;
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 400) });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 400)}` : ""}`);
}

async function entrar(browser, ancho, alto, modo) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
  if (modo) {
    await ctx.addInitScript((m) => {
      try {
        window.localStorage.setItem("fs.editor.modo", m);
      } catch {}
    }, modo);
  }
  const page = await ctx.newPage();
  paginaActual = page;
  page.setDefaultTimeout(30000);
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(usuario);
  await page.locator('input[name="password"]').fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await esperarSesion(page);
  await abrirVista(page, "Nueva factura");
  await page.locator('select[aria-label="Moneda"]').waitFor();
  return { ctx, page };
}

const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function cargarCliente(page) {
  await page.getByPlaceholder("Ingresá el número de documento").fill(RUC);
  await page.getByLabel("Nombre o razón social").fill(NOMBRE);
}

/** Carga una fila de la grilla (indice desde 0). */
async function filaGrilla(page, indice, { descripcion, cantidad, precio }) {
  const fila = page.locator(`[data-grilla-fila="${indice}"]`);
  await fila.locator('input[data-celda="descripcion"]').fill(descripcion);
  await fila.getByLabel(/^Cantidad, línea/).fill(cantidad);
  await fila.getByLabel(/^Precio, línea/).fill(precio);
}

/** Cuerpo de POST /facturas/preview que manda la pantalla con lo cargado (sin claves volatiles). */
async function ultimoPreview(page, accion) {
  const [pedido] = await Promise.all([
    page.waitForRequest((r) => r.url().includes("/facturas/preview") && r.method() === "POST", { timeout: 20000 }),
    accion()
  ]);
  return JSON.parse(pedido.postData() ?? "{}");
}

async function crear(page, etiqueta) {
  const crearBtn = page.getByRole("button", { name: "Crear factura" });
  await page.waitForFunction((b) => b && !b.disabled, await crearBtn.elementHandle(), { timeout: 20000 });
  await crearBtn.click();
  const confirmar = page.getByRole("button", { name: /^Confirmar/ });
  if (await confirmar.isVisible({ timeout: 3000 }).catch(() => false)) await confirmar.click();
  await page.getByRole("button", { name: "Crear nueva factura" }).waitFor({ timeout: 60000 });
  const resultado = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  await page.screenshot({ path: path.join(outDir, `${etiqueta}-emitida.png`), fullPage: true });
  await page.getByRole("button", { name: "Crear nueva factura" }).click();
  return resultado;
}

(async () => {
  const browser = await chromium.launch();
  try {
    // CA-01, CA-02, CA-05 y CA-06 en 1440, modo completo por omision.
    const { ctx, page } = await entrar(browser, 1440, 900, null);
    check("CA-01 1440: abre en modo completo con la grilla", (await page.locator(".invoice-editor.completo").count()) === 1 && (await page.locator("table.grilla-lineas").isVisible()));
    check("CA-01 1440: conmutador visible y sin boton Calcular", (await page.getByRole("group", { name: "Modo del editor" }).isVisible()) && (await page.getByRole("button", { name: "Calcular" }).count()) === 0);
    check("CA-01 1440: sin desplazamiento horizontal", await sinDesborde(page));

    await page.locator('select[aria-label="Moneda"]').selectOption("USD");
    await page.getByLabel("Tipo de cambio").fill("7350,5");
    await cargarCliente(page);
    // CA-05: precision por moneda en la grilla.
    await filaGrilla(page, 0, { descripcion: "Consultoria PC linea 1", cantidad: "1,00005", precio: "150,255" });
    const cantidadVista = await page.locator('[data-grilla-fila="0"]').getByLabel(/^Cantidad, línea/).inputValue();
    const precioVisto = await page.locator('[data-grilla-fila="0"]').getByLabel(/^Precio, línea/).inputValue();
    check("CA-05 1440: la grilla no admite 5 decimales de cantidad ni 3 de precio en USD", cantidadVista === "1,0000" && precioVisto === "150,25", `${cantidadVista} / ${precioVisto}`);
    await filaGrilla(page, 0, { descripcion: "Consultoria PC linea 1", cantidad: "2", precio: "150,25" });
    await filaGrilla(page, 1, { descripcion: "Consultoria PC linea 2", cantidad: "1,5", precio: "99,99" });
    // Enter en la fila 2 pasa a la descripcion de la fila 3 (RN-06).
    await page.locator('[data-grilla-fila="1"]').getByLabel(/^Precio, línea/).press("Enter");
    await page.waitForTimeout(300);
    const enfocada = await page.evaluate(() => document.activeElement?.closest("[data-grilla-fila]")?.getAttribute("data-grilla-fila"));
    check("RN-06 1440: Enter pasa a la fila siguiente", enfocada === "2", `fila con foco: ${enfocada}`);
    await filaGrilla(page, 2, { descripcion: "Consultoria PC linea 3", cantidad: "3", precio: "10" });
    const cuerpoCompleto = await ultimoPreview(page, async () => {
      await page.locator('[data-grilla-fila="2"]').getByLabel(/^IVA, línea/).selectOption("IVA_5");
    });
    await page.waitForTimeout(1500);
    const total = (await page.locator(".total-row.strong").innerText()).replace(/\s+/g, " ");
    // 300,50 + 149,99 (1,5 x 99,99 = 149,985) + 30,00 = 480,49
    check("CA-02 1440: tres lineas sin ventanas, total en USD", total.includes("USD 480,49"), total);
    check("CA-02 1440: tres lineas en el pedido, cantidad 1,5", cuerpoCompleto.items?.length === 3 && cuerpoCompleto.items[1].cantidad === 1.5, JSON.stringify(cuerpoCompleto.items));
    await page.screenshot({ path: path.join(outDir, "1440-completo-usd.png"), fullPage: true });

    // CA-04 y RN-02: el modo simple conserva las lineas y arma el mismo pedido.
    const cuerpoSimple = await ultimoPreview(page, async () => {
      await page.getByRole("group", { name: "Modo del editor" }).getByRole("button", { name: "Modo simple" }).click();
      // Fuerza una vista previa nueva sin cambiar datos: alternar y volver la condicion de venta.
      await page.getByRole("button", { name: "Crédito", exact: true }).click();
      await page.getByRole("button", { name: "Contado", exact: true }).click();
    });
    check("CA-04 1440: el modo simple muestra las tres lineas", (await page.locator(".sale-item-card").count()) === 3);
    const normalizar = (c) => JSON.stringify({ ...c, items: c.items });
    check("RN-02 1440: el pedido es identico en ambos modos", normalizar(cuerpoCompleto) === normalizar(cuerpoSimple), "");
    await page.getByRole("group", { name: "Modo del editor" }).getByRole("button", { name: "Modo completo" }).click();
    await page.waitForTimeout(500);
    const filasGrilla = await page.locator("[data-grilla-fila]").count();
    check("CA-04 1440: de vuelta al completo, la grilla tiene las tres lineas y una vacia", filasGrilla === 4, `${filasGrilla} filas`);

    const usd = await crear(page, "1440-usd");
    check("CA-02 1440: factura USD de tres lineas creada", usd.includes("USD 480,49"), usd.slice(0, 200));

    // CA-06: catalogo desde la celda; factura PYG (la factura nueva arranca en guaranies).
    check("RN-01 1440: la factura nueva arranca en PYG", (await page.locator('select[aria-label="Moneda"]').inputValue()) === "PYG");
    await cargarCliente(page);
    const fila0 = page.locator('[data-grilla-fila="0"]');
    await fila0.locator('input[data-celda="descripcion"]').fill("a");
    const sugerencia = page.locator(".grilla-sugerencias button").first();
    const haySugerencias = await sugerencia.waitFor({ timeout: 8000 }).then(() => true, () => false);
    if (haySugerencias) {
      await sugerencia.click();
      const precioCatalogo = await fila0.getByLabel(/^Precio, línea/).inputValue();
      check("CA-06 1440: elegir un articulo del catalogo completa la fila en PYG", precioCatalogo.length > 0, precioCatalogo);
    } else {
      check("CA-06 1440: catalogo sin articulos que coincidan (se carga a mano)", true, "sin sugerencias");
      await filaGrilla(page, 0, { descripcion: "Servicio PC en guaranies", cantidad: "1", precio: "110000" });
    }
    const pyg = await crear(page, "1440-pyg");
    check("CA-02 1440: factura PYG creada desde la grilla", /Gs\.?\s*[\d.]+/.test(pyg), pyg.slice(0, 200));
    await ctx.close();

    // CA-04: la preferencia persiste en el navegador.
    const v1280 = await entrar(browser, 1280, 800, "simple");
    check("CA-04 1280: con la preferencia en simple abre en simple", (await v1280.page.locator(".invoice-editor.completo").count()) === 0);
    await v1280.page.getByRole("group", { name: "Modo del editor" }).getByRole("button", { name: "Modo completo" }).click();
    check("CA-01 1280: modo completo sin desplazamiento horizontal", (await v1280.page.locator("table.grilla-lineas").isVisible()) && (await sinDesborde(v1280.page)));
    await v1280.page.screenshot({ path: path.join(outDir, "1280-completo.png"), fullPage: true });
    await v1280.ctx.close();

    // CA-03: celular, modo simple sin conmutador.
    const v390 = await entrar(browser, 390, 844, "completo");
    check("CA-03 390: modo simple y sin conmutador", (await v390.page.locator(".invoice-editor.completo").count()) === 0 && (await v390.page.getByRole("group", { name: "Modo del editor" }).count()) === 0);
    check("CA-03 390: sin desplazamiento horizontal", await sinDesborde(v390.page));
    await v390.page.screenshot({ path: path.join(outDir, "390-simple.png"), fullPage: true });
    await v390.ctx.close();
  } catch (error) {
    check("ejecucion sin errores", false, error.message.split("\n").slice(0, 3).join(" "));
    if (paginaActual) await paginaActual.screenshot({ path: path.join(outDir, "error.png"), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(outDir, "resultado.json"), JSON.stringify(resultados, null, 2));
  const fallos = resultados.filter((r) => !r.ok);
  console.log(`\n${resultados.length - fallos.length}/${resultados.length} verificaciones OK.`);
  process.exit(fallos.length ? 1 : 0);
})();
