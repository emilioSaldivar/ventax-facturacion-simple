#!/usr/bin/env node
// Nota de credito parcial con lineas (SPEC_NOTA_CREDITO_PARCIAL_v0.1, CA-01 a CA-07). Solo stack local con SIFEN test,
// FS con FE_NC_MONEDA_EXTRANJERA=true y FE segel-rc4.27 o posterior.
//
//   ENSAYO_PASSWORD_FILE=/ruta/operador.pass node scripts/segel-fs/playwright-nota-credito-parcial.cjs
//
// Emite en SIFEN test: factura USD de dos lineas, dos notas parciales en USD, factura PYG y una parcial en PYG.
// Escribe test-results/nota-credito-parcial/.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const outDir = path.join(process.cwd(), "test-results", "nota-credito-parcial");
const RUC = process.env.ENSAYO_RUC ?? "80026570-0";
const NOMBRE = process.env.ENSAYO_NOMBRE ?? "SEGEL SA";
const marca = Date.now().toString(36).slice(-5);
fs.mkdirSync(outDir, { recursive: true });

const resultados = [];
let paginaActual = null;
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 400) });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 400)}` : ""}`);
}

async function entrar(browser, ancho, alto) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
  const page = await ctx.newPage();
  paginaActual = page;
  page.setDefaultTimeout(30000);
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(usuario);
  await page.locator('input[name="password"]').fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await esperarSesion(page);
  return { ctx, page };
}

/** Factura desde la grilla del modo completo (1440). Devuelve la descripcion unica de la primera linea. */
async function facturar(page, { moneda, lineas, etiqueta }) {
  await abrirVista(page, "Nueva factura");
  await page.locator("table.grilla-lineas").waitFor();
  await page.locator('select[aria-label="Moneda"]').selectOption(moneda);
  if (moneda !== "PYG") await page.getByLabel("Tipo de cambio").fill("7350,5");
  await page.getByPlaceholder("Ingrese numero de documento").fill(RUC);
  await page.getByLabel("Nombre o razon social").fill(NOMBRE);
  for (const [indice, linea] of lineas.entries()) {
    const fila = page.locator(`[data-grilla-fila="${indice}"]`);
    await fila.locator('input[data-celda="descripcion"]').fill(`${linea.descripcion} ${marca}`);
    await fila.getByLabel(/^Cantidad, línea/).fill(linea.cantidad);
    await fila.getByLabel(/^Precio, línea/).fill(linea.precio);
  }
  const crear = page.getByRole("button", { name: "Crear factura" });
  await page.waitForFunction((b) => b && !b.disabled, await crear.elementHandle(), { timeout: 20000 });
  await crear.click();
  const confirmar = page.getByRole("button", { name: /^Confirmar/ });
  if (await confirmar.isVisible({ timeout: 3000 }).catch(() => false)) await confirmar.click();
  await page.getByRole("button", { name: "Crear nueva factura" }).waitFor({ timeout: 60000 });
  await page.screenshot({ path: path.join(outDir, `${etiqueta}-factura.png`), fullPage: true });
  await page.getByRole("button", { name: "Crear nueva factura" }).click();
}

/** Abre la ficha de la factura cuyo total es `total`, esperando que salga de "Procesando" (hasta 8 min). */
async function fichaAprobada(page, total) {
  const limite = Date.now() + 8 * 60 * 1000;
  let fila = "";
  while (Date.now() < limite) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await esperarSesion(page);
    await abrirVista(page, "Documentos");
    await page.locator("table.documents-tabla").waitFor({ timeout: 20000 });
    const loc = page.locator("table.documents-tabla tbody tr", { hasText: total }).first();
    fila = (await loc.count()) ? (await loc.innerText()).replace(/\s+/g, " ") : "";
    if (fila && !fila.includes("Procesando")) break;
    await page.waitForTimeout(20000);
  }
  await page.locator("table.documents-tabla tbody tr", { hasText: total }).first().locator("td").nth(2).click();
  await page.getByRole("button", { name: /Volver a resultados/ }).waitFor({ timeout: 20000 });
  return fila;
}

/** Emite una nota parcial desde la ficha abierta: `cantidades` por numero de linea (1, 2, ...). */
async function notaParcial(page, cantidades, etiqueta) {
  const boton = page.getByRole("button", { name: /Crear nota de credito/ }).first();
  await page.waitForFunction((b) => b && !b.disabled, await boton.elementHandle(), { timeout: 20000 });
  await boton.click();
  const grupo = page.getByRole("group", { name: "Tipo de nota de credito" });
  await grupo.waitFor({ timeout: 15000 });
  await grupo.getByRole("button", { name: "Parcial" }).click();
  for (const [linea, cantidad] of Object.entries(cantidades)) {
    await page.getByLabel(`Cantidad a acreditar, linea ${linea}`).fill(cantidad);
  }
  const totalNota = (await page.locator(".nc-parcial-total").innerText()).replace(/\s+/g, " ");
  await page.screenshot({ path: path.join(outDir, `${etiqueta}-ventana.png`), fullPage: true });
  await page.locator(".modal-panel textarea").fill(`Prueba de nota parcial ${etiqueta}`);
  await page.getByRole("button", { name: "Confirmar" }).click();
  const popup = page.locator('section[aria-labelledby="nc-success-title"]');
  const ok = await popup.waitFor({ timeout: 90000 }).then(() => true, () => false);
  const texto = ok ? (await popup.innerText()).replace(/\s+/g, " ") : (await page.locator(".modal-panel").innerText().catch(() => "")).replace(/\s+/g, " ");
  await page.screenshot({ path: path.join(outDir, `${etiqueta}-resultado.png`), fullPage: true });
  if (ok) await page.getByRole("button", { name: "Ver nota de credito" }).click();
  return { ok, texto, totalNota };
}

(async () => {
  const browser = await chromium.launch();
  try {
    const { ctx, page } = await entrar(browser, 1440, 900);

    // Factura USD de dos lineas: 2 x 150,25 y 1 x 99,99 = 400,49.
    await facturar(page, {
      moneda: "USD",
      etiqueta: "usd",
      lineas: [
        { descripcion: "Servicio A", cantidad: "2", precio: "150,25" },
        { descripcion: "Servicio B", cantidad: "1", precio: "99,99" }
      ]
    });
    const filaUsd = await fichaAprobada(page, "USD 400,49");
    check("factura USD 400,49 aprobada por SIFEN test", filaUsd.includes("Factura emitida"), filaUsd);

    // CA-01: primera parcial, 1 x 150,25.
    const p1 = await notaParcial(page, { 1: "1" }, "usd-parcial-1");
    check("CA-01 1440: la ventana calcula USD 150,25", p1.totalNota.includes("USD 150,25"), p1.totalNota);
    check("CA-01 1440: nota parcial USD emitida", p1.ok, p1.texto);

    // CA-03: pedir mas que el saldo no se envia.
    await fichaAprobada(page, "USD 400,49");
    // La seccion de lo acreditado llega despues de abrir la ficha (GET /nota-credito/saldo).
    await page.locator(".nc-acreditado").waitFor({ timeout: 15000 }).catch(() => {});
    const ficha = (await page.locator(".document-detail").innerText()).replace(/\s+/g, " ");
    check("CA-01 1440: la ficha de la factura muestra lo acreditado y el saldo", ficha.includes("Acreditado por notas de crédito") && ficha.includes("1 de 2"), ficha.slice(0, 300));
    const boton = page.getByRole("button", { name: /Crear nota de credito/ }).first();
    await boton.click();
    const grupo = page.getByRole("group", { name: "Tipo de nota de credito" });
    await grupo.waitFor();
    check("RN-07 1440: con una nota viva, Total deshabilitado", await grupo.getByRole("button", { name: "Total" }).isDisabled());
    await grupo.getByRole("button", { name: "Parcial" }).click();
    await page.getByLabel("Cantidad a acreditar, linea 1").fill("3");
    await page.locator(".modal-panel textarea").fill("Mas que el saldo");
    await page.getByRole("button", { name: "Confirmar" }).click();
    const error = (await page.locator(".modal-panel .form-error").innerText().catch(() => "")).trim();
    check("CA-03 1440: cantidad mayor que el saldo no se envia", error.includes("supera el saldo"), error);
    await page.getByRole("button", { name: "Cancelar" }).click();

    // CA-02: segunda parcial por el saldo; despues la factura queda acreditada.
    const p2 = await notaParcial(page, { 1: "1", 2: "1" }, "usd-parcial-2");
    check("CA-02 1440: segunda parcial por el saldo, USD 250,24", p2.ok && p2.totalNota.includes("USD 250,24"), `${p2.totalNota} :: ${p2.texto}`);
    await fichaAprobada(page, "USD 400,49");
    await page.getByRole("button", { name: /Crear nota de credito/ }).first().click();
    await page.getByRole("group", { name: "Tipo de nota de credito" }).waitFor();
    const sinSaldo = (await page.locator(".modal-panel").innerText()).replace(/\s+/g, " ");
    check("CA-02 1440: sin saldo, la ventana no ofrece ni total ni parcial", sinSaldo.includes("acreditada por completo"), sinSaldo.slice(0, 200));
    await page.getByRole("button", { name: "Cancelar" }).click();

    // Las dos notas figuran en USD. La ficha abierta tapa las pestañas: se recarga.
    await page.reload({ waitUntil: "domcontentloaded" });
    await esperarSesion(page);
    await abrirVista(page, "Documentos");
    await page.locator("table.documents-tabla").waitFor({ timeout: 20000 });
    await page.locator('.filter-tabs button:has-text("Notas de credito")').first().click();
    await page.waitForTimeout(2500);
    const notas = (await page.locator("table.documents-tabla tbody tr").allInnerTexts()).map((t) => t.replace(/\s+/g, " "));
    check("CA-01/02 1440: las notas USD 150,25 y USD 250,24 en la lista", notas.some((n) => n.includes("USD 150,25")) && notas.some((n) => n.includes("USD 250,24")), notas.slice(0, 3).join(" || "));
    await page.screenshot({ path: path.join(outDir, "1440-notas.png"), fullPage: true });

    // CA-04: factura PYG y parcial por una linea.
    await facturar(page, {
      moneda: "PYG",
      etiqueta: "pyg",
      lineas: [
        { descripcion: "Producto C", cantidad: "3", precio: "110000" },
        { descripcion: "Producto D", cantidad: "1", precio: "55000" }
      ]
    });
    const filaPyg = await fichaAprobada(page, "385.000");
    check("factura PYG 385.000 aprobada", filaPyg.includes("Factura emitida"), filaPyg);
    const p3 = await notaParcial(page, { 1: "1" }, "pyg-parcial");
    check("CA-04 1440: parcial PYG por 110.000 emitida", p3.ok && /110\.000/.test(p3.totalNota), `${p3.totalNota} :: ${p3.texto}`);
    await ctx.close();

    // CA-07: la ventana en 1280 y 390.
    for (const [ancho, alto] of [[1280, 800], [390, 844]]) {
      const v = await entrar(browser, ancho, alto);
      await abrirVista(v.page, "Documentos");
      await v.page.waitForTimeout(2000);
      const fila = ancho >= 1024 ? v.page.locator("table.documents-tabla tbody tr", { hasText: "385.000" }).first().locator("td").nth(2) : v.page.locator(".document-row-main", { hasText: "385.000" }).first();
      await fila.click();
      await v.page.getByRole("button", { name: /Crear nota de credito/ }).first().click();
      const g = v.page.getByRole("group", { name: "Tipo de nota de credito" });
      await g.waitFor();
      await g.getByRole("button", { name: "Parcial" }).click();
      const desborde = await v.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      check(`CA-07 ${ancho}: ventana parcial visible y sin desplazamiento horizontal`, desborde && (await v.page.locator(".nc-parcial-tabla").isVisible()));
      await v.page.screenshot({ path: path.join(outDir, `${ancho}-ventana.png`), fullPage: true });
      await v.ctx.close();
    }
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
