#!/usr/bin/env node
// Descuentos en la factura (SPEC_DESCUENTOS_FACTURA_v0.1, TASKS DES-008 a DES-011).
//
//   ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/segel-fs/playwright-descuentos.cjs [caso ...]
//
// Casos: grilla (CA-07, 1440 y 1280), simple (CA-08, 390), validacion (CA-03 en pantalla). Sin emitir.
// sifen (CA-10): EMITE en SIFEN test una factura PYG con descuento por linea y un global que no divide exacto
// (avisar a FE antes) y compara los totales oficiales de FE. Variables: SEGEL_APP_URL, ENSAYO_USER, ENSAYO_RUC.
// Escribe test-results/descuentos/.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const RUC = process.env.ENSAYO_RUC ?? "80026570-0";
const NOMBRE = process.env.ENSAYO_NOMBRE ?? "SEGEL SA";
const ESPERA_APROBACION_MS = Number(process.env.ENSAYO_ESPERA_MS ?? 25 * 60 * 1000);
const outDir = path.join(process.cwd(), "test-results", "descuentos");
fs.mkdirSync(outDir, { recursive: true });
const pedidos = process.argv.slice(2);
const corre = (caso) => (pedidos.length === 0 ? caso !== "sifen" : pedidos.includes(caso));

const resultados = [];
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 300) });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 300)}` : ""}`);
}
const EMOJI = /[\p{Extended_Pictographic}]/u;
const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const texto = async (page) => (await page.locator("main").innerText()).replace(/\s+/g, " ");

async function entrar(browser, ancho, alto, modo) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
  await ctx.addInitScript((m) => {
    try {
      window.localStorage.setItem("fs.editor.modo", m);
    } catch {}
  }, modo);
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(usuario);
  await page.locator('input[name="password"]').fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await esperarSesion(page);
  return { ctx, page };
}

async function cliente(page) {
  await page.getByPlaceholder("Ingresá el número de documento").fill(RUC);
  await page.getByPlaceholder("Ingresá el número de documento").press("Tab");
  await page.waitForTimeout(1000);
  const nombre = page.getByLabel("Nombre o razón social");
  if (!(await nombre.inputValue()).trim()) await nombre.fill(NOMBRE);
}

async function fila(page, indice, { descripcion, cantidad, precio, descuento }) {
  const f = page.locator(`[data-grilla-fila="${indice}"]`);
  await f.locator('input[data-celda="descripcion"]').fill(descripcion);
  await page.keyboard.press("Escape").catch(() => undefined);
  await f.getByLabel(/^Cantidad, línea/).fill(cantidad);
  await f.getByLabel(/^Precio, línea/).fill(precio);
  if (descuento !== undefined) await f.getByLabel(/^Descuento, línea/).fill(descuento);
  return f;
}

const totalesTexto = async (page) => (await page.locator(".totales-fija, .totals-section").first().innerText()).replace(/\s+/g, " ");

// CA-07: ejemplo de FE (2 x 100.000 con 10 % y 1 x 50.000; global 30.000).
async function casoGrilla(browser) {
  for (const [ancho, alto] of [
    [1440, 900],
    [1280, 800]
  ]) {
    const { ctx, page } = await entrar(browser, ancho, alto, "completo");
    try {
      await abrirVista(page, "Nueva factura");
      await page.locator("table.grilla-lineas").waitFor();
      const cabecera = await page.locator("table.grilla-lineas thead").innerText();
      check(`CA-07 ${ancho}: columna Descuento con conmutador % y Gs.`, cabecera.includes("Descuento") && (await page.locator("table.grilla-lineas thead [role=group]").count()) === 1);
      await cliente(page);
      const f0 = await fila(page, 0, { descripcion: "Zapatillas DES", cantidad: "2", precio: "100000", descuento: "10" });
      await page.waitForTimeout(400);
      check(`CA-07 ${ancho}: 10 % sobre 100.000 deja el subtotal en 180.000 (2 unidades)`, (await f0.locator(".col-subtotal").innerText()).includes("180.000"), await f0.locator(".col-subtotal").innerText());
      await page.locator("table.grilla-lineas thead").getByRole("group", { name: "Descuento en porcentaje o monto" }).getByRole("button", { name: "Gs." }).click();
      await f0.getByLabel(/^Descuento, línea/).fill("10000");
      await fila(page, 1, { descripcion: "Medias DES", cantidad: "1", precio: "50000" });
      await page.getByLabel(/Descuento sobre el total/).fill("30000");
      await page.waitForTimeout(2200);
      const t = await totalesTexto(page);
      check(`CA-07 ${ancho}: fila "Descuento − Gs. 50.000"`, /Descuento\s*− Gs\.? ?50\.000/.test(t), t);
      check(`CA-07 ${ancho}: "Total a pagar Gs. 200.000"`, /Total a pagar\s*Gs\.? ?200\.000/.test(t), t);
      check(`CA-07 ${ancho}: subtotal bruto 250.000`, /Subtotal\s*Gs\.? ?250\.000/.test(t), t);
      await page.screenshot({ path: path.join(outDir, `${ancho}-grilla.png`), fullPage: true });
      // Descuento igual al precio: linea invalida con su texto y "Crear factura" bloqueado.
      await f0.getByLabel(/^Descuento, línea/).fill("100000");
      await page.waitForTimeout(600);
      const tx = await texto(page);
      check(`CA-07 ${ancho}: descuento igual al precio marca la linea`, tx.includes("El descuento tiene que ser menor que el precio"), "");
      check(`CA-07 ${ancho}: y bloquea Crear factura`, await page.getByRole("button", { name: "Crear factura" }).isDisabled());
      check(`CA ${ancho}: sin desplazamiento horizontal`, await sinDesborde(page));
      check(`CA ${ancho}: sin emojis`, !EMOJI.test(tx));
    } catch (e) {
      check(`grilla ${ancho}: sin excepciones`, false, e.message);
      await page.screenshot({ path: path.join(outDir, `${ancho}-grilla-error.png`), fullPage: true }).catch(() => undefined);
    } finally {
      await ctx.close();
    }
  }
}

// CA-08: modo simple en celular.
async function casoSimple(browser) {
  const { ctx, page } = await entrar(browser, 390, 844, "simple");
  try {
    await abrirVista(page, "Nueva factura");
    await page.getByPlaceholder("Ingresá el número de documento").waitFor();
    await cliente(page);
    const agregar = page.getByRole("button", { name: /Agregar (producto|el primer)/ }).first();
    await agregar.click();
    const hoja = page.locator(".line-sheet, [role=dialog]").first();
    await hoja.waitFor();
    await hoja.getByLabel(/^Descripción|Producto o servicio/).first().fill("Servicio DES 390");
    await hoja.getByLabel(/^Precio/).fill("100000");
    check("CA-08 390: la hoja de la linea muestra Descuento con el conmutador", (await hoja.getByLabel("Descuento de la línea").count()) === 1 && (await hoja.getByRole("group", { name: "Descuento en porcentaje o monto" }).count()) === 1);
    await hoja.getByLabel("Descuento de la línea").fill("10");
    await page.screenshot({ path: path.join(outDir, "390-hoja.png") });
    const confirmar = hoja.getByRole("button", { name: /^AGREGAR$|Agregar$|Listo|Confirmar/ }).first();
    if (await confirmar.count()) await confirmar.click();
    await page.waitForTimeout(500);
    await page.getByLabel(/Descuento sobre el total/).fill("5000");
    // La vista previa se recalcula sola; "Calcular" queda debajo del pie fijo en celular.
    await page.waitForTimeout(3000);
    const t = await texto(page);
    check("CA-08 390: totales con la fila Descuento − Gs. 15.000", /Descuento\s*− Gs\.? ?15\.000/.test(t), t.slice(-400));
    check("CA-08 390: total neto Gs. 85.000", /Total a pagar\s*Gs\.? ?85\.000/.test(t), t.slice(-300));
    check("CA-08 390: sin desplazamiento horizontal", await sinDesborde(page));
    await page.screenshot({ path: path.join(outDir, "390-simple.png"), fullPage: true });
  } catch (e) {
    check("simple 390: sin excepciones", false, e.message);
    await page.screenshot({ path: path.join(outDir, "390-simple-error.png"), fullPage: true }).catch(() => undefined);
  } finally {
    await ctx.close();
  }
}

// CA-03 en pantalla: global que deja una linea sin precio (error de la API junto al campo) y decimales en Gs.
async function casoValidacion(browser) {
  const { ctx, page } = await entrar(browser, 1440, 900, "completo");
  try {
    await abrirVista(page, "Nueva factura");
    await page.locator("table.grilla-lineas").waitFor();
    await cliente(page);
    await fila(page, 0, { descripcion: "Linea DES", cantidad: "1", precio: "50000" });
    await page.getByLabel(/Descuento sobre el total/).fill("60000");
    await page.waitForTimeout(2200);
    const t = await texto(page);
    check("CA-03 (c): el global mayor que el bruto muestra el mensaje de la API", /deja la línea 1 sin precio/.test(t), t.slice(-300));
    check("CA-03 (c): y Crear factura queda bloqueado", await page.getByRole("button", { name: "Crear factura" }).isDisabled());
    await page.locator("table.grilla-lineas thead").getByRole("group", { name: "Descuento en porcentaje o monto" }).getByRole("button", { name: "%" }).click();
    await page.locator('[data-grilla-fila="0"]').getByLabel(/^Descuento, línea/).fill("100");
    await page.waitForTimeout(400);
    check("RN-16: 100 % no es valido", (await texto(page)).includes("El porcentaje va de 0 a 99,99"));
    await page.screenshot({ path: path.join(outDir, "1440-validacion.png"), fullPage: true });
  } catch (e) {
    check("validacion: sin excepciones", false, e.message);
  } finally {
    await ctx.close();
  }
}

// CA-10: PYG con descuento por linea y global no exacto (vector de FE), emitida en SIFEN test.
async function casoSifen(browser) {
  const { ctx, page } = await entrar(browser, 1440, 900, "completo");
  try {
    await abrirVista(page, "Nueva factura");
    await page.locator("table.grilla-lineas").waitFor();
    await cliente(page);
    await page.locator("table.grilla-lineas thead").getByRole("group", { name: "Descuento en porcentaje o monto" }).getByRole("button", { name: "Gs." }).click();
    await fila(page, 0, { descripcion: "Articulo A DES", cantidad: "3", precio: "19990", descuento: "1110" });
    const f1 = await fila(page, 1, { descripcion: "Articulo B DES", cantidad: "7", precio: "4370" });
    await f1.getByLabel(/^IVA, línea/).selectOption("IVA_5");
    await page.getByLabel(/Descuento sobre el total/).fill("3333");
    await page.waitForTimeout(2500);
    const previa = await totalesTexto(page);
    check("CA-10: vista previa con el total de FE 83.897 y descuento 6.663", /83\.897/.test(previa) && /6\.663/.test(previa), previa);
    const crear = page.getByRole("button", { name: "Crear factura" });
    await page.waitForFunction((b) => b && !b.disabled, await crear.elementHandle(), { timeout: 20000 });
    await crear.click();
    const conf = page.getByRole("button", { name: /^Confirmar/ });
    if (await conf.isVisible({ timeout: 3000 }).catch(() => false)) await conf.click();
    await page.getByRole("button", { name: "Crear nueva factura" }).waitFor({ timeout: 60000 });
    const inicio = Date.now();
    let aprobada = false;
    while (!aprobada && Date.now() - inicio < ESPERA_APROBACION_MS) {
      aprobada = (await page.locator(".paso.hecho").count()) >= 4;
      const estado = (await page.locator(".resultado-emision [data-estado]").first().getAttribute("data-estado").catch(() => "")) ?? "";
      if (["RECHAZADA", "ERROR_OPERATIVO", "ERROR_TEMPORAL"].includes(estado)) break;
      if (!aprobada) await page.waitForTimeout(20000);
    }
    aprobada = aprobada || (await page.locator(".paso.hecho").count()) >= 4;
    const t = await texto(page);
    const numero = (t.match(/Factura (\d[\d-]{5,})/) ?? [])[1] ?? null;
    check(`CA-10: factura PYG con descuento global no exacto aprobada en SIFEN test (${numero ?? "sin numero"})`, aprobada, t.slice(0, 220));
    check("CA-10: el resultado muestra la columna y la fila Descuento", /DESCUENTO|Descuento/.test(t) && /− Gs\.? ?6\.663/.test(t), t.slice(0, 400));
    await page.screenshot({ path: path.join(outDir, "1440-sifen.png"), fullPage: true });
    fs.writeFileSync(path.join(outDir, "sifen.json"), JSON.stringify({ numero, aprobada }, null, 2));
  } catch (e) {
    check("sifen: sin excepciones", false, e.message);
    await page.screenshot({ path: path.join(outDir, "sifen-error.png"), fullPage: true }).catch(() => undefined);
  } finally {
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    if (corre("grilla")) await casoGrilla(browser);
    if (corre("simple")) await casoSimple(browser);
    if (corre("validacion")) await casoValidacion(browser);
    if (corre("sifen")) await casoSifen(browser);
  } finally {
    await browser.close();
  }
  const fallas = resultados.filter((r) => !r.ok).length;
  fs.writeFileSync(path.join(outDir, "resultado.json"), JSON.stringify(resultados, null, 2));
  console.log(`\n${resultados.length - fallas}/${resultados.length} OK`);
  process.exit(fallas ? 1 : 0);
})();
