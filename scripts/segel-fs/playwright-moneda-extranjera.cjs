#!/usr/bin/env node
// Factura manual en moneda extranjera (SPEC_MONEDA_EXTRANJERA_v0.1, CA-01 a CA-07). Solo stack local con SIFEN test.
//
//   ENSAYO_PASSWORD_FILE=/ruta/operador.pass [ENSAYO_NC_MONEDA=1] node scripts/segel-fs/playwright-moneda-extranjera.cjs
//
// Emite tres facturas reales en SIFEN test: contado USD, credito USD y contado Gs. Escribe test-results/moneda-extranjera/.
// ENSAYO_NC_MONEDA=1 (FS con FE_NC_MONEDA_EXTRANJERA=true y FE rc4.27 o posterior): ademas emite la nota de credito de la
// factura contado USD y el recibo de la factura credito USD. Sin la variable comprueba que la nota quede bloqueada.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const outDir = path.join(process.cwd(), "test-results", "moneda-extranjera");
const RUC = process.env.ENSAYO_RUC ?? "80026570-0";
const NOMBRE = process.env.ENSAYO_NOMBRE ?? "SEGEL SA";
const NC_MONEDA = process.env.ENSAYO_NC_MONEDA === "1";
fs.mkdirSync(outDir, { recursive: true });

const resultados = [];
const emitidas = [];
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

/** Arma una factura en el editor y la emite. Devuelve el texto del resultado. */
async function emitir(page, { moneda, tipoCambio, credito, precio, etiqueta }) {
  await abrirVista(page, "Nueva factura");
  await page.locator('select[aria-label="Moneda"]').waitFor();
  if (credito) await page.getByRole("button", { name: "Credito", exact: true }).click();
  await page.locator('select[aria-label="Moneda"]').selectOption(moneda);
  await page.getByPlaceholder("Ingrese numero de documento").fill(RUC);
  await page.getByLabel("Nombre o razon social").fill(NOMBRE);
  await page.getByRole("button", { name: /Agregar producto/ }).click();
  await page.getByPlaceholder("Ingrese descripcion").fill(`Consultoria en informatica ${etiqueta}`);
  await page.locator('label:has-text("Cantidad") input').first().fill("2");
  await page.locator('label:has-text("Precio") input').first().fill(precio);
  await page.getByRole("button", { name: "AGREGAR Y NO GUARDAR" }).click();
  const crear = page.getByRole("button", { name: "Crear factura" });
  if (moneda !== "PYG") {
    // CA-04: sin tipo de cambio no se puede emitir.
    check(`${etiqueta}: sin tipo de cambio no se puede crear la factura`, await crear.isDisabled(), "");
    await page.getByLabel("Tipo de cambio").fill(tipoCambio);
  }
  await page.getByRole("button", { name: "Calcular" }).click();
  await page.waitForTimeout(1500);
  const totales = await page.locator(".total-row.strong").innerText();
  await page.screenshot({ path: path.join(outDir, `${etiqueta}-editor.png`), fullPage: true });
  await crear.click();
  const confirmar = page.getByRole("button", { name: /^Confirmar/ });
  if (await confirmar.isVisible({ timeout: 3000 }).catch(() => false)) await confirmar.click();
  await page.getByText(/Numero|Número/).first().waitFor({ timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const resultado = await page.locator("main").innerText();
  await page.screenshot({ path: path.join(outDir, `${etiqueta}-emitida.png`), fullPage: true });
  // El editor conserva la factura hasta "Crear nueva factura": se limpia para la siguiente.
  await page.getByRole("button", { name: "Crear nueva factura" }).click();
  return { totales: totales.replace(/\s+/g, " "), resultado };
}

(async () => {
  const browser = await chromium.launch();
  try {
    const { ctx, page } = await entrar(browser, 1440, 900);
    const usd = await emitir(page, { moneda: "USD", tipoCambio: "7350,5", credito: false, precio: "150,25", etiqueta: "usd-contado" });
    check("CA-01 usd-contado: total en USD con 2 decimales en el editor", usd.totales.includes("USD 300,50"), usd.totales);
    check("CA-01 usd-contado: la factura se crea", /USD 300,50/.test(usd.resultado), usd.resultado.slice(0, 200).replace(/\n+/g, " | "));

    const credito = await emitir(page, { moneda: "USD", tipoCambio: "7350,5", credito: true, precio: "99,99", etiqueta: "usd-credito" });
    check("CA-02 usd-credito: total en USD", credito.totales.includes("USD 199,98"), credito.totales);

    const pyg = await emitir(page, { moneda: "PYG", credito: false, precio: "110000", etiqueta: "pyg-contado" });
    check("CA-05 pyg-contado: en guaranies como siempre", /Gs\.?\s*220\.000/.test(pyg.totales), pyg.totales);

    // CA-03: Documentos en escritorio.
    await abrirVista(page, "Documentos");
    await page.locator("table.documents-tabla").waitFor({ timeout: 20000 });
    const filas = await page.locator("table.documents-tabla tbody tr").allInnerTexts();
    const filaUsd = filas.find((f) => f.includes("USD 300,50")) ?? "";
    check("CA-03 1440: la tabla muestra USD en Moneda y en Total", filaUsd.includes("USD") && filaUsd.includes("USD 300,50"), filaUsd.replace(/\s+/g, " "));
    const filaPyg = filas.find((f) => /Gs\.?\s*220\.000/.test(f)) ?? "";
    check("CA-05 1440: la factura en guaranies sigue en PYG", filaPyg.includes("PYG"), filaPyg.replace(/\s+/g, " "));
    await page.screenshot({ path: path.join(outDir, "1440-documentos.png"), fullPage: true });

    // La nota de credito pide la factura aprobada en SIFEN: se espera a que deje "Procesando" (hasta 8 min).
    if (NC_MONEDA) {
      const limite = Date.now() + 8 * 60 * 1000;
      let fila = "";
      while (Date.now() < limite) {
        await page.reload({ waitUntil: "domcontentloaded" });
        await esperarSesion(page);
        await abrirVista(page, "Documentos");
        await page.locator("table.documents-tabla").waitFor({ timeout: 20000 });
        fila = (await page.locator("table.documents-tabla tbody tr", { hasText: "USD 300,50" }).first().innerText()).replace(/\s+/g, " ");
        if (!fila.includes("Procesando")) break;
        await page.waitForTimeout(20000);
      }
      check("1440: la factura contado USD sale de Procesando", !fila.includes("Procesando"), fila);
    }
    // Ficha de la factura en USD: tipo de cambio y nota de credito (D-1).
    await page.locator("table.documents-tabla tbody tr", { hasText: "USD 300,50" }).first().locator("td").nth(2).click();
    await page.getByRole("button", { name: /Volver a resultados/ }).waitFor({ timeout: 20000 });
    const ficha = await page.locator(".document-detail").innerText();
    check("CA-03 1440: la ficha muestra el total en USD y el tipo de cambio", ficha.includes("USD 300,50") && ficha.includes("Tipo de cambio"), ficha.slice(0, 300).replace(/\n+/g, " | "));
    await page.screenshot({ path: path.join(outDir, "1440-ficha-usd.png"), fullPage: true });
    const nc = page.getByRole("button", { name: /Crear nota de credito/ }).first();
    if (!NC_MONEDA) {
      check("CA-06 1440: la nota de credito queda bloqueada con aviso", (await nc.count()) > 0 && (await nc.isDisabled()) && ficha.includes("moneda extranjera se gestiona con soporte"), "");
    } else {
      const habilitado = await page.waitForFunction((b) => b && !b.disabled, await nc.elementHandle(), { timeout: 20000 }).then(() => true, () => false);
      check("CA-06 1440: con FE rc4.27 la nota de credito de la factura en USD esta habilitada y sin aviso", habilitado && !ficha.includes("moneda extranjera se gestiona con soporte"), "");
      await nc.click();
      await page.locator(".modal-panel textarea").fill("Prueba de nota de credito en dolares");
      await page.getByRole("button", { name: "Confirmar" }).click();
      const popup = page.locator('section[aria-labelledby="nc-success-title"]');
      const ok = await popup.waitFor({ timeout: 90000 }).then(() => true, () => false);
      const texto = ok ? await popup.innerText() : await page.locator("body").innerText();
      check("CA-06 1440: nota de credito emitida", ok, texto.slice(0, 300).replace(/\n+/g, " | "));
      await page.screenshot({ path: path.join(outDir, "1440-nota-usd.png"), fullPage: true });
      // La nota queda en USD en la pestaña de notas de credito. El aviso de exito tapa el menu: se recarga.
      await page.reload({ waitUntil: "domcontentloaded" });
      await esperarSesion(page);
      await abrirVista(page, "Documentos");
      await page.locator('.filter-tabs button:has-text("Notas de credito")').first().click();
      await page.waitForTimeout(2500);
      const filasNc = await page.locator("table.documents-tabla tbody tr").allInnerTexts().catch(() => []);
      const filaNc = filasNc.find((f) => f.includes("USD 300,50")) ?? "";
      check("CA-06 1440: la nota de credito figura en USD", filaNc.includes("USD"), (filaNc || filasNc[0] || "").replace(/\s+/g, " "));
      await page.screenshot({ path: path.join(outDir, "1440-notas-credito.png"), fullPage: true });

      // D-2: recibo desde la factura credito en USD.
      await page.locator('.filter-tabs button:has-text("Facturas")').first().click();
      await page.locator("table.documents-tabla").waitFor({ timeout: 20000 });
      await page.locator("table.documents-tabla tbody tr", { hasText: "USD 199,98" }).first().locator("td").nth(2).click();
      await page.getByRole("button", { name: /Emitir recibo de cobro/ }).click();
      await page.locator(".nota-card", { hasText: "USD 199,98" }).first().waitFor({ timeout: 30000 }).then(() => true, () => false);
      const tarjeta = page.locator(".nota-card", { hasText: "USD 199,98" }).first();
      check("D-2 1440: el recibo de la factura credito queda en USD", (await tarjeta.count()) > 0, (await page.locator("main").innerText()).slice(0, 300).replace(/\n+/g, " | "));
      await tarjeta.getByRole("button", { name: "Ver" }).click();
      // "Emitir" pide confirmacion con un dialogo del navegador.
      page.once("dialog", (dialogo) => void dialogo.accept());
      await page.getByRole("button", { name: "Emitir", exact: true }).click();
      const emitido = await page.locator(".status-pill", { hasText: "EMITIDO" }).first().waitFor({ timeout: 60000 }).then(() => true, () => false);
      const detalle = await page.locator("main").innerText();
      check("D-2 1440: recibo en USD emitido con centavos", emitido && detalle.includes("USD 199,98"), detalle.slice(0, 300).replace(/\n+/g, " | "));
      await page.screenshot({ path: path.join(outDir, "1440-recibo-usd.png"), fullPage: true });
    }
    await ctx.close();

    for (const [ancho, alto] of [[1280, 800], [390, 844]]) {
      const v = await entrar(browser, ancho, alto);
      await abrirVista(v.page, "Nueva factura");
      await v.page.locator('select[aria-label="Moneda"]').selectOption("USD");
      await v.page.getByLabel("Tipo de cambio").waitFor();
      check(`CA-07 ${ancho}: editor en USD sin desplazamiento horizontal`, await v.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
      await v.page.screenshot({ path: path.join(outDir, `${ancho}-editor-usd.png`), fullPage: true });
      await abrirVista(v.page, "Documentos");
      await v.page.waitForTimeout(2000);
      const texto = await v.page.locator("main").innerText();
      check(`CA-07 ${ancho}: Documentos muestra USD`, texto.includes("USD 300,50"), "");
      await v.ctx.close();
    }
  } catch (error) {
    check("ejecucion sin errores", false, error.message.split("\n").slice(0, 3).join(" "));
    if (paginaActual) await paginaActual.screenshot({ path: path.join(outDir, "error.png"), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(outDir, "resultado.json"), JSON.stringify({ resultados, emitidas }, null, 2));
  const fallos = resultados.filter((r) => !r.ok);
  console.log(`\n${resultados.length - fallos.length}/${resultados.length} verificaciones OK.`);
  process.exit(fallos.length ? 1 : 0);
})();
