#!/usr/bin/env node
// Matriz de moneda extranjera FS + FE con RAJ S.A. en SIFEN test (SPEC_MONEDA_EXTRANJERA_v0.1, MON-006).
// Casos 1 (contado USD), 2 (credito USD a plazo), 4 (NC total por referencia sobre 1) y 6 (recibo USD de 2).
// Solo contra el stack local raj-fs conectado a fe-cargas-real. Emite documentos reales en SIFEN test.
//
//   RAJ_PASSWORD_FILE=/ruta/operador-raj [RAJ_REANUDAR=1] node scripts/segel-fs/playwright-moneda-raj.cjs
//
// RAJ_REANUDAR=1: no emite los casos 1 y 2; sigue con las facturas ya emitidas (USD 605,00 y USD 150,50).
// RAJ_CASOS_12_13=1: solo los casos 12 (factura PYG por 001-001) y 13 (factura USD nueva anulada dentro de las 48 h).
//
// Escribe test-results/moneda-raj/ (capturas y resultado.json).
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.RAJ_APP_URL ?? "http://localhost:18592/app/";
const usuario = process.env.RAJ_USER ?? "operador-raj-3d";
const clave = fs.readFileSync(process.env.RAJ_PASSWORD_FILE ?? "", "utf8").trim();
const outDir = path.join(process.cwd(), "test-results", "moneda-raj");
const RUC = process.env.RAJ_CLIENTE_RUC ?? "80026570-0";
const NOMBRE = process.env.RAJ_CLIENTE_NOMBRE ?? "SEGEL SA";
const TC = "6329,77";
fs.mkdirSync(outDir, { recursive: true });

const resultados = [];
let pagina = null;
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 400) });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 400)}` : ""}`);
}

async function emitir(page, { credito, precio, etiqueta, moneda = "USD" }) {
  await abrirVista(page, "Nueva factura");
  await page.locator('select[aria-label="Moneda"]').waitFor();
  if (credito) await page.getByRole("button", { name: "Credito", exact: true }).click();
  await page.locator('select[aria-label="Moneda"]').selectOption(moneda);
  if (moneda !== "PYG") await page.getByLabel("Tipo de cambio").fill(TC);
  await page.getByPlaceholder("Ingrese numero de documento").fill(RUC);
  await page.getByLabel("Nombre o razon social").fill(NOMBRE);
  await page.getByRole("button", { name: /Agregar producto/ }).click();
  await page.getByPlaceholder("Ingrese descripcion").fill(`Servicio de prueba RAJ ${etiqueta}`);
  await page.locator('label:has-text("Cantidad") input').first().fill("1");
  await page.locator('label:has-text("Precio") input').first().fill(precio);
  await page.getByRole("button", { name: "AGREGAR Y NO GUARDAR" }).click();
  await page.getByRole("button", { name: "Calcular" }).click();
  await page.waitForTimeout(1500);
  const totales = (await page.locator(".total-row.strong").innerText()).replace(/\s+/g, " ");
  await page.screenshot({ path: path.join(outDir, `${etiqueta}-editor.png`), fullPage: true });
  await page.getByRole("button", { name: "Crear factura" }).click();
  const confirmar = page.getByRole("button", { name: /^Confirmar/ });
  if (await confirmar.isVisible({ timeout: 3000 }).catch(() => false)) await confirmar.click();
  await page.getByRole("button", { name: "Crear nueva factura" }).waitFor({ timeout: 60000 });
  await page.screenshot({ path: path.join(outDir, `${etiqueta}-emitida.png`), fullPage: true });
  await page.getByRole("button", { name: "Crear nueva factura" }).click();
  return totales;
}

/** Espera a que la fila con `texto` deje "Procesando" en la pestaña indicada (hasta 8 min). */
async function esperarAprobada(page, texto, pestana) {
  const limite = Date.now() + 8 * 60 * 1000;
  let fila = "";
  while (Date.now() < limite) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await esperarSesion(page);
    await abrirVista(page, "Documentos");
    await page.locator(`.filter-tabs button:has-text("${pestana}")`).first().click();
    await page.waitForTimeout(2000);
    const filaLoc = page.locator("table.documents-tabla tbody tr", { hasText: texto }).first();
    fila = (await filaLoc.count()) ? (await filaLoc.innerText()).replace(/\s+/g, " ") : "";
    if (fila && !fila.includes("Procesando")) break;
    await page.waitForTimeout(20000);
  }
  return fila;
}

(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    pagina = page;
    page.setDefaultTimeout(30000);
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.locator('input[name="username"]').fill(usuario);
    await page.locator('input[name="password"]').fill(clave);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await esperarSesion(page);

    if (process.env.RAJ_CASOS_12_13 === "1") {
      // Caso 12: factura PYG por 001-001, como siempre (con logo en el KUDE).
      const t12 = await emitir(page, { credito: false, precio: "110000", etiqueta: "caso12-pyg", moneda: "PYG" });
      check("Caso 12: factura PYG 001-001 en guaranies en el editor", /Gs\.?\s*110\.000/.test(t12), t12);
      // Caso 13: factura USD nueva para anular dentro de las 48 h.
      const t13 = await emitir(page, { credito: false, precio: "20,10", etiqueta: "caso13-usd" });
      check("Caso 13: factura USD 20,10 en el editor", t13.includes("USD 20,10"), t13);
      const f12 = await esperarAprobada(page, "110.000", "Facturas");
      check("Caso 12: aprobada por SIFEN test", f12.includes("Factura emitida"), f12);
      const f13 = await esperarAprobada(page, "USD 20,10", "Facturas");
      check("Caso 13: factura USD aprobada antes de anular", f13.includes("Factura emitida"), f13);
      await page.locator("table.documents-tabla tbody tr", { hasText: "USD 20,10" }).first().locator("td").nth(2).click();
      const anular = page.getByRole("button", { name: /Anular factura/ }).first();
      await anular.waitFor({ timeout: 20000 });
      await page.waitForFunction((b) => b && !b.disabled, await anular.elementHandle(), { timeout: 20000 }).catch(() => {});
      await anular.click();
      await page.locator(".modal-panel textarea").fill("Prueba RAJ: anulacion de factura en dolares dentro de las 48 horas");
      await page.getByRole("button", { name: "Confirmar" }).click();
      // SIFEN test puede responder 4009 en los primeros minutos: se reintenta hasta 3 veces cada 2 min.
      let ficha13 = "";
      for (let intento = 1; intento <= 3; intento += 1) {
        await page.waitForTimeout(8000);
        ficha13 = (await page.locator("main").innerText()).replace(/\s+/g, " ");
        if (/Anulada|ANULADA|anulad/i.test(ficha13) && !/Requiere|error|rechaz/i.test(ficha13)) break;
        await page.screenshot({ path: path.join(outDir, `caso13-intento${intento}.png`), fullPage: true });
        if (intento < 3) {
          await page.waitForTimeout(120000);
          const otra = page.getByRole("button", { name: /Anular factura/ }).first();
          if (await otra.isVisible().catch(() => false) && !(await otra.isDisabled())) {
            await otra.click();
            await page.locator(".modal-panel textarea").fill("Prueba RAJ: anulacion de factura en dolares dentro de las 48 horas");
            await page.getByRole("button", { name: "Confirmar" }).click();
          }
        }
      }
      check("Caso 13: factura USD anulada (evento aceptado)", /Anulada|ANULADA/i.test(ficha13), ficha13.slice(0, 300));
      await page.screenshot({ path: path.join(outDir, "caso13-anulada.png"), fullPage: true });
      await ctx.close();
      throw { fin: true };
    }
    if (process.env.RAJ_REANUDAR !== "1") {
      const t1 = await emitir(page, { credito: false, precio: "605", etiqueta: "caso1-contado-usd" });
      check("Caso 1: contado USD 605,00 en el editor", t1.includes("USD 605,00"), t1);
      const t2 = await emitir(page, { credito: true, precio: "150,50", etiqueta: "caso2-credito-usd" });
      check("Caso 2: credito USD 150,50 en el editor", t2.includes("USD 150,50"), t2);
    }

    const f1 = await esperarAprobada(page, "USD 605,00", "Facturas");
    check("Caso 1: aprobada por SIFEN test", f1.includes("Factura emitida"), f1);
    const f2 = await esperarAprobada(page, "USD 150,50", "Facturas");
    check("Caso 2: aprobada por SIFEN test", f2.includes("Factura emitida"), f2);
    await page.screenshot({ path: path.join(outDir, "documentos-facturas.png"), fullPage: true });

    // Caso 4: NC total por referencia sobre el caso 1.
    await page.locator("table.documents-tabla tbody tr", { hasText: "USD 605,00" }).first().locator("td").nth(2).click();
    await page.getByRole("button", { name: /Volver a resultados/ }).waitFor({ timeout: 20000 });
    const ficha = await page.locator(".document-detail").innerText();
    check("Caso 1: ficha con USD y tipo de cambio 6.329,77", ficha.includes("USD 605,00") && ficha.includes("6.329,77"), ficha.slice(0, 250).replace(/\n+/g, " | "));
    const nc = page.getByRole("button", { name: /Crear nota de credito/ }).first();
    const habilitada = await page.waitForFunction((b) => b && !b.disabled, await nc.elementHandle(), { timeout: 20000 }).then(() => true, () => false);
    check("Caso 4: nota de credito habilitada", habilitada);
    await nc.click();
    await page.locator(".modal-panel textarea").fill("Prueba RAJ: nota de credito total en USD");
    await page.getByRole("button", { name: "Confirmar" }).click();
    const popup = page.locator('section[aria-labelledby="nc-success-title"]');
    check("Caso 4: nota de credito enviada", await popup.waitFor({ timeout: 90000 }).then(() => true, () => false));
    const fnc = await esperarAprobada(page, "USD 605,00", "Notas de credito");
    check("Caso 4: nota de credito en USD aprobada por SIFEN test", fnc.includes("USD 605,00") && !fnc.includes("Procesando") && !fnc.includes("Rechaz"), fnc);
    await page.screenshot({ path: path.join(outDir, "documentos-notas.png"), fullPage: true });

    // Caso 6: recibo en USD desde el caso 2.
    await page.locator('.filter-tabs button:has-text("Facturas")').first().click();
    await page.locator("table.documents-tabla").waitFor({ timeout: 20000 });
    await page.locator("table.documents-tabla tbody tr", { hasText: "USD 150,50" }).first().locator("td").nth(2).click();
    await page.getByRole("button", { name: /Emitir recibo de cobro/ }).click();
    const tarjeta = page.locator(".nota-card", { hasText: "USD 150,50" }).first();
    await tarjeta.waitFor({ timeout: 30000 });
    await tarjeta.getByRole("button", { name: "Ver" }).click();
    page.once("dialog", (dialogo) => void dialogo.accept());
    await page.getByRole("button", { name: "Emitir", exact: true }).click();
    const emitido = await page.locator(".status-pill", { hasText: "EMITIDO" }).first().waitFor({ timeout: 60000 }).then(() => true, () => false);
    const detalle = (await page.locator("main").innerText()).replace(/\n+/g, " | ");
    check("Caso 6: recibo USD 150,50 emitido", emitido && detalle.includes("USD 150,50"), detalle.slice(detalle.indexOf("Recibo"), detalle.indexOf("Recibo") + 300));
    await page.screenshot({ path: path.join(outDir, "caso6-recibo.png"), fullPage: true });
    await ctx.close();
  } catch (error) {
    if (error && error.fin) { /* corrida parcial terminada */ } else
    check("ejecucion sin errores", false, String(error && error.message || error).split("\n").slice(0, 3).join(" "));
    if (pagina) await pagina.screenshot({ path: path.join(outDir, "error.png"), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(outDir, "resultado.json"), JSON.stringify(resultados, null, 2));
  const fallos = resultados.filter((r) => !r.ok);
  console.log(`\n${resultados.length - fallos.length}/${resultados.length} verificaciones OK.`);
  process.exit(fallos.length ? 1 : 0);
})();
