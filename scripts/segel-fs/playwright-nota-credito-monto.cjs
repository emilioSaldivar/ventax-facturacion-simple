#!/usr/bin/env node
// Nota de credito por monto (SPEC_NOTA_CREDITO_POR_MONTO_v0.1, CA-01 a CA-05 y CA-07; TASKS NCM-008). Solo stack
// local de Segel con SIFEN test, FS con FE_NC_MONEDA_EXTRANJERA=true y FE segel-rc4.34 o posterior.
//
//   ENSAYO_PASSWORD_FILE=/ruta/operador.pass node scripts/segel-fs/playwright-nota-credito-monto.cjs
//
// Emite en SIFEN test: la factura PYG del ejemplo de FE (guia v0.52 §67.5) con dos notas por monto (100.000 y el
// saldo) y una factura USD con una nota por monto de USD 50,25. Escribe test-results/nota-credito-monto/.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const RUC = process.env.ENSAYO_RUC ?? "80026570-0";
const NOMBRE = process.env.ENSAYO_NOMBRE ?? "SEGEL SA";
const ESPERA_MS = Number(process.env.ENSAYO_ESPERA_MS ?? 25 * 60 * 1000);
const outDir = path.join(process.cwd(), "test-results", "nota-credito-monto");
const marca = Date.now().toString(36).slice(-5);
fs.mkdirSync(outDir, { recursive: true });

const resultados = [];
const emitidas = [];
let paginaActual = null;
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 400) });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 400)}` : ""}`);
}
const EMOJI = /[\p{Extended_Pictographic}]/u;
const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const plano = async (loc) => (await loc.innerText()).replace(/\s+/g, " ");

async function entrar(browser, ancho, alto) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
  await ctx.addInitScript(() => {
    try {
      window.localStorage.setItem("fs.editor.modo", "completo");
    } catch {}
  });
  const page = await ctx.newPage();
  paginaActual = page;
  page.setDefaultTimeout(30000);
  // El token de acceso vive en memoria de la app: se toma de sus propios pedidos.
  page.on("request", (r) => {
    const a = r.headers()["authorization"];
    if (a) page.__token = a;
  });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(usuario);
  await page.locator('input[name="password"]').fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await esperarSesion(page);
  return { ctx, page };
}

async function api(page, metodo, ruta, cuerpo) {
  return page.evaluate(
    async ({ metodo, ruta, cuerpo, token }) => {
      const r = await fetch(`/api/v1${ruta}`, {
        method: metodo,
        credentials: "include",
        headers: { "content-type": "application/json", authorization: token },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined
      });
      const texto = await r.text();
      let json = null;
      try {
        json = JSON.parse(texto);
      } catch {}
      return { status: r.status, json };
    },
    { metodo, ruta, cuerpo, token: page.__token ?? "" }
  );
}

async function fila(page, indice, { descripcion, cantidad, precio, descuento, iva }) {
  const f = page.locator(`[data-grilla-fila="${indice}"]`);
  await f.locator('input[data-celda="descripcion"]').fill(`${descripcion} ${marca}`);
  await page.keyboard.press("Escape").catch(() => undefined);
  await f.getByLabel(/^Cantidad, línea/).fill(cantidad);
  await f.getByLabel(/^Precio, línea/).fill(precio);
  if (descuento !== undefined) await f.getByLabel(/^Descuento, línea/).fill(descuento);
  if (iva) await f.getByLabel(/^IVA, línea/).selectOption(iva);
}

/** Emite la factura cargada y espera que FE la apruebe y FS guarde sus totales (fuente FE). Devuelve el documento. */
async function emitirFactura(page, etiqueta, totalEsperado) {
  const crear = page.getByRole("button", { name: "Crear factura" });
  await page.waitForFunction((b) => b && !b.disabled, await crear.elementHandle(), { timeout: 20000 });
  await crear.click();
  const conf = page.getByRole("button", { name: /^Confirmar/ });
  if (await conf.isVisible({ timeout: 3000 }).catch(() => false)) await conf.click();
  await page.getByRole("button", { name: "Crear nueva factura" }).waitFor({ timeout: 60000 });
  const lista = await api(page, "GET", "/facturas?tipo=FACTURA&limit=10&offset=0");
  // Por la marca de la corrida: antes de aprobarse FS guarda su calculo (en PYG sin el redondeo a 50 de FE).
  const doc = (lista.json?.items ?? []).find((d) => (d.items ?? []).some((i) => i.descripcion?.includes(marca)) && d.items.length === 3);
  if (!doc) throw new Error(`${etiqueta}: no se encontro la factura de ${totalEsperado}`);
  const final = await esperarAprobado(page, doc.id, etiqueta);
  await page.screenshot({ path: path.join(outDir, `${etiqueta}-factura.png`), fullPage: true });
  await page.getByRole("button", { name: "Crear nueva factura" }).click();
  return final;
}

/** Espera EMITIDA con totales de FE (o un estado final de error). */
async function esperarAprobado(page, id, etiqueta) {
  const fin = Date.now() + ESPERA_MS;
  let d = null;
  while (Date.now() < fin) {
    d = (await api(page, "GET", `/facturas/${id}`)).json;
    if (d?.estado === "EMITIDA" && d?.totals?.fuente === "FE") break;
    if (["RECHAZADA", "ERROR_OPERATIVO"].includes(d?.estado)) break;
    await page.waitForTimeout(20000);
    // El refresco fiscal lo dispara la consulta del documento.
    await api(page, "POST", `/facturas/${id}/refresh-status`).catch(() => undefined);
  }
  emitidas.push({ etiqueta, id, numero: d?.numero_fiscal ?? null, estado: d?.estado ?? null, total: d?.totals?.total ?? null, fuente: d?.totals?.fuente ?? null, sifen: d?.sifen_result_code ?? null });
  fs.writeFileSync(path.join(outDir, "emitidas.json"), JSON.stringify(emitidas, null, 2));
  return d;
}

async function abrirFicha(page, id) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await esperarSesion(page);
  await abrirVista(page, "Documentos");
  await page.locator("table.documents-tabla, .document-row-main").first().waitFor({ timeout: 20000 });
  const doc = (await api(page, "GET", `/facturas/${id}`)).json;
  const total = doc.moneda === "PYG" ? new Intl.NumberFormat("es-PY").format(doc.totals.total) : doc.totals.total.toFixed(2).replace(".", ",");
  const ancho = page.viewportSize().width;
  const fila = ancho >= 1024
    ? page.locator("table.documents-tabla tbody tr", { hasText: total }).first().locator("td").nth(2)
    : page.locator(".document-row-main", { hasText: total }).first();
  await fila.click();
}

async function abrirVentanaMonto(page) {
  const boton = page.getByRole("button", { name: /Crear nota de cr[eé]dito/ }).first();
  await page.waitForFunction((b) => b && !b.disabled, await boton.elementHandle(), { timeout: 20000 });
  await boton.click();
  const grupo = page.getByRole("group", { name: "Tipo de nota de crédito" });
  await grupo.waitFor({ timeout: 15000 });
  return grupo;
}

/** Nota por monto desde la ventana de la ficha abierta. */
async function notaMontoVentana(page, { monto, tipo, etiqueta }) {
  const grupo = await abrirVentanaMonto(page);
  await grupo.getByRole("button", { name: "Por monto" }).click();
  await page.getByLabel("Monto a acreditar").fill(monto);
  if (tipo) await page.getByLabel("Tipo de ajuste").selectOption({ label: tipo });
  await page.waitForTimeout(300);
  const ventana = await plano(page.locator(".modal-panel"));
  await page.screenshot({ path: path.join(outDir, `${etiqueta}-ventana.png`), fullPage: true });
  await page.locator(".modal-panel textarea").fill(`Prueba de nota por monto ${etiqueta}`);
  await page.getByRole("button", { name: "Confirmar" }).click();
  const popup = page.locator('section[aria-labelledby="nc-success-title"]');
  const ok = await popup.waitFor({ timeout: 90000 }).then(() => true, () => false);
  const texto = ok ? await plano(popup) : await plano(page.locator(".modal-panel")).catch(() => "");
  await page.screenshot({ path: path.join(outDir, `${etiqueta}-resultado.png`), fullPage: true });
  if (ok) await page.getByRole("button", { name: "Ver nota de crédito" }).click();
  return { ok, texto, ventana };
}

async function notasDe(page, facturaId) {
  const r = await api(page, "GET", "/facturas?tipo=NOTA_CREDITO&limit=50&offset=0");
  return (r.json?.items ?? []).filter((n) => n.documento_relacionado_id === facturaId);
}

(async () => {
  const browser = await chromium.launch();
  try {
    const { ctx, page } = await entrar(browser, 1440, 900);

    // ENSAYO_PYG_ID / ENSAYO_USD_ID: reusar facturas ya emitidas por una corrida anterior (no emitir otra).
    const reusar = async (id, etiqueta) => (id ? esperarAprobado(page, id, etiqueta) : null);
    // ---- Factura PYG del ejemplo de FE (§67.5): 2 x 100.000 con 10.000 de descuento c/u (10 %), 52.330 (5 %),
    // 30.000 exento y 20.000 de descuento global. Total neto 242.300.
    let fac = await reusar(process.env.ENSAYO_PYG_ID, "pyg");
    if (!fac) {
    await abrirVista(page, "Nueva factura");
    await page.locator("table.grilla-lineas").waitFor();
    await page.getByRole("button", { name: "Agregar descuento" }).click();
    await page.getByPlaceholder("Ingresá el número de documento").fill(RUC);
    await page.getByPlaceholder("Ingresá el número de documento").press("Tab");
    await page.waitForTimeout(1000);
    const nombre = page.getByLabel("Nombre o razón social");
    if (!(await nombre.inputValue()).trim()) await nombre.fill(NOMBRE);
    await page.locator("table.grilla-lineas thead").getByRole("group", { name: "Descuento en porcentaje o monto" }).getByRole("button", { name: "Gs." }).click();
    await fila(page, 0, { descripcion: "NCM articulo 10", cantidad: "2", precio: "100000", descuento: "10000" });
    await fila(page, 1, { descripcion: "NCM articulo 5", cantidad: "1", precio: "52330", iva: "IVA_5" });
    await fila(page, 2, { descripcion: "NCM exento", cantidad: "1", precio: "30000", iva: "EXENTA" });
    await page.getByLabel(/Descuento sobre el total/).fill("20000");
    await page.waitForTimeout(2500);
    fac = await emitirFactura(page, "pyg", 242300);
    }
    check(`factura PYG aprobada en SIFEN test (${fac?.numero_fiscal})`, fac?.estado === "EMITIDA", JSON.stringify({ estado: fac?.estado, total: fac?.totals?.total }));
    check("factura PYG: total neto de FE 242.300", fac?.totals?.total === 242300, JSON.stringify(fac?.totals));

    // Saldo expuesto con las tasas de FE.
    const saldo0 = (await api(page, "GET", `/facturas/${fac.id}/nota-credito/saldo`)).json;
    check("saldo: Parcial por lineas no se admite (factura con descuento) y Por monto si", saldo0?.admite_parcial === false && saldo0?.monto?.admite === true, JSON.stringify(saldo0?.monto));
    check("saldo: tasas de FE 165.833 / 48.623 / 27.875", JSON.stringify(saldo0?.monto?.tasas) === JSON.stringify({ iva_10: 165833, iva_5: 48623, exenta: 27875 }), JSON.stringify(saldo0?.monto?.tasas));

    // CA-03 en la ventana: 10.020 no es multiplo de 50; mas que el saldo no se envia.
    await abrirFicha(page, fac.id);
    const grupo = await abrirVentanaMonto(page);
    check("RN-03 1440: Parcial deshabilitado en la factura con descuento", await grupo.getByRole("button", { name: "Parcial" }).isDisabled());
    await grupo.getByRole("button", { name: "Por monto" }).click();
    const resumen = await plano(page.locator(".nc-monto"));
    check("1440: la ventana muestra total, acreditado y saldo 242.300", /Saldo disponible\s*(Gs\.?\s*)?242\.300/.test(resumen), resumen.slice(0, 200));
    await page.getByLabel("Monto a acreditar").fill("10020");
    const aviso50 = await plano(page.locator(".nc-monto"));
    check("CA-03 1440: 10.020 avisa multiplo de 50", aviso50.includes("múltiplo de 50"), aviso50.slice(0, 300));
    await page.locator(".modal-panel textarea").fill("No deberia salir");
    await page.getByRole("button", { name: "Confirmar" }).click();
    const err50 = (await page.locator(".modal-panel .form-error").innerText().catch(() => "")).trim();
    check("CA-03 1440: Confirmar con 10.020 no envia", err50.includes("múltiplo de 50"), err50);
    await page.getByLabel("Monto a acreditar").fill("300000");
    await page.getByRole("button", { name: "Confirmar" }).click();
    const errSaldo = (await page.locator(".modal-panel .form-error").innerText().catch(() => "")).trim();
    check("CA-03 1440: mas que el saldo no se envia", errSaldo.includes("supera el saldo"), errSaldo);
    await page.getByLabel("Monto a acreditar").fill("100000");
    await page.waitForTimeout(300);
    const reparto = await plano(page.locator(".nc-monto-reparto"));
    check("CA-01 1440: reparto previo 68.432 / 20.065 / 11.503", /68\.432/.test(reparto) && /20\.065/.test(reparto) && /11\.503/.test(reparto), reparto);
    check("1440: sin emojis en la ventana", !EMOJI.test(await plano(page.locator(".modal-panel"))));
    await page.getByRole("button", { name: "Cancelar" }).click();

    // CA-01: nota de 100.000, Descuento.
    await abrirFicha(page, fac.id);
    const n1 = await notaMontoVentana(page, { monto: "100000", tipo: "Descuento", etiqueta: "pyg-monto-1" });
    check("CA-01 1440: nota por monto 100.000 emitida desde la ficha", n1.ok, n1.texto);

    // RN-04 por la API: 152.300 supera el neto (142.300) pero no el bruto; FS la frena sin llamar a FE.
    const excede = await api(page, "POST", `/facturas/${fac.id}/nota-credito`, { motivo: "Supera el neto", monto: 152300, motivo_codigo: 3 });
    check("CA-03 API: 152.300 responde 409 NOTA_CREDITO_SUPERA_SALDO con saldo 142.300", excede.status === 409 && excede.json?.error?.details?.reason === "NOTA_CREDITO_SUPERA_SALDO" && excede.json?.error?.details?.saldo === 142300, JSON.stringify(excede));
    const no50 = await api(page, "POST", `/facturas/${fac.id}/nota-credito`, { motivo: "No multiplo", monto: 10020 });
    check("CA-03 API: 10.020 responde 400", no50.status === 400, JSON.stringify(no50.json).slice(0, 200));

    // CA-04: segunda nota por el saldo exacto desde Notas de credito > Nueva, Ajuste de precio.
    await page.reload({ waitUntil: "domcontentloaded" });
    await esperarSesion(page);
    await abrirVista(page, "Notas de crédito");
    await page.getByLabel("Buscar factura").fill(fac.numero_fiscal?.slice(-7) ?? "");
    await page.getByRole("button", { name: "Buscar" }).click();
    await page.waitForTimeout(1500);
    await page.locator(".nc-candidatas .document-row", { hasText: "242.300" }).first().click();
    const g2 = page.getByRole("group", { name: "Tipo de nota de crédito" });
    await g2.waitFor({ timeout: 15000 });
    check("CA-04 1440: con una nota viva, Toda la factura deshabilitado", await g2.getByRole("button", { name: "Toda la factura" }).isDisabled());
    await g2.getByRole("button", { name: "Un monto" }).click();
    const resumen2 = await plano(page.locator(".nc-monto"));
    check("CA-04 1440: saldo 142.300 en la pantalla Notas de credito", /Saldo disponible\s*(Gs\.?\s*)?142\.300/.test(resumen2), resumen2.slice(0, 200));
    await page.getByLabel("Monto a acreditar").fill("142300");
    await page.getByLabel("Tipo de ajuste").selectOption({ label: "Ajuste de precio" });
    await page.getByLabel("Motivo (detalle para el cliente)").fill("Ajuste por el saldo");
    check("CA-07 1440: pantalla Notas de credito sin desplazamiento horizontal", await sinDesborde(page));
    await page.screenshot({ path: path.join(outDir, "1440-pantalla-notas.png"), fullPage: true });
    await page.getByRole("button", { name: "Emitir nota de crédito" }).click();
    const resultado2 = await page.locator(".resultado-emision").first().waitFor({ timeout: 90000 }).then(() => true, () => false);
    check("CA-04 1440: segunda nota por el saldo exacto emitida", resultado2, await plano(page.locator("main")).catch(() => ""));
    await page.screenshot({ path: path.join(outDir, "pyg-monto-2-resultado.png"), fullPage: true });

    const saldoFinal = (await api(page, "GET", `/facturas/${fac.id}/nota-credito/saldo`)).json;
    check("CA-04: Por monto dice acreditada por completo", saldoFinal?.monto?.admite === false && /acreditada por completo/.test(saldoFinal?.monto?.motivo_no_admite ?? ""), JSON.stringify(saldoFinal?.monto));
    const candidatas = (await api(page, "GET", `/facturas/nce-candidatas?limit=30&offset=0&q=${encodeURIComponent(fac.numero_fiscal ?? "")}`)).json;
    const cand = (candidatas?.items ?? []).find((c) => c.documento.id === fac.id);
    check("CA-04: la factura ya no es elegible", cand ? cand.elegible === false : true, JSON.stringify(cand ? { elegible: cand.elegible, motivo: cand.motivo_no_elegible } : "no listada"));

    // ---- CA-02: factura USD (2 x 150,25 IVA 10, 1 x 10,50 IVA 5, 3 x 0,99 exento) y nota por USD 50,25, Bonificacion.
    let usd = await reusar(process.env.ENSAYO_USD_ID, "usd");
    if (!usd) {
    await abrirVista(page, "Nueva factura");
    await page.locator("table.grilla-lineas").waitFor();
    await page.locator('select[aria-label="Moneda"]').selectOption("USD");
    await page.getByLabel("Tipo de cambio").fill("7350,5");
    await page.getByPlaceholder("Ingresá el número de documento").fill(RUC);
    await page.getByPlaceholder("Ingresá el número de documento").press("Tab");
    await page.waitForTimeout(1000);
    if (!(await page.getByLabel("Nombre o razón social").inputValue()).trim()) await page.getByLabel("Nombre o razón social").fill(NOMBRE);
    await fila(page, 0, { descripcion: "NCM consultoria", cantidad: "2", precio: "150,25" });
    await fila(page, 1, { descripcion: "NCM libro", cantidad: "1", precio: "10,5", iva: "IVA_5" });
    await fila(page, 2, { descripcion: "NCM exento", cantidad: "3", precio: "0,99", iva: "EXENTA" });
    await page.waitForTimeout(2500);
    usd = await emitirFactura(page, "usd", 313.97);
    }
    check(`factura USD aprobada en SIFEN test (${usd?.numero_fiscal})`, usd?.estado === "EMITIDA", JSON.stringify({ estado: usd?.estado, total: usd?.totals?.total }));
    await abrirFicha(page, usd.id);
    const n3 = await notaMontoVentana(page, { monto: "50,25", tipo: "Bonificación", etiqueta: "usd-monto" });
    check("CA-02 1440: la ventana USD reparte en las tres tasas", /IVA 10 %/.test(n3.ventana) && /IVA 5 %/.test(n3.ventana) && /Exento/.test(n3.ventana), n3.ventana.slice(0, 400));
    check("CA-02 1440: nota por monto USD 50,25 emitida", n3.ok, n3.texto);
    // CA-05: la nota por monto no cambia el saldo por lineas.
    const saldoUsd = (await api(page, "GET", `/facturas/${usd.id}/nota-credito/saldo`)).json;
    check("CA-05: el saldo por lineas sigue completo tras la nota por monto", (saldoUsd?.lineas ?? []).every((l) => l.cantidad_acreditada === 0), JSON.stringify(saldoUsd?.lineas?.map((l) => l.cantidad_acreditada)));
    check("CA-05: saldo neto USD 263,72", Math.abs((saldoUsd?.monto?.saldo ?? 0) - 263.72) < 0.005, JSON.stringify(saldoUsd?.monto));
    await ctx.close();

    // ---- CA-07: la ventana Por monto en 1280 y 390 (factura USD, con saldo).
    for (const [ancho, alto] of [[1280, 800], [390, 844]]) {
      const v = await entrar(browser, ancho, alto);
      await abrirFicha(v.page, usd.id);
      const g = await abrirVentanaMonto(v.page);
      await g.getByRole("button", { name: "Por monto" }).click();
      await v.page.getByLabel("Monto a acreditar").fill("10");
      await v.page.waitForTimeout(300);
      const visible = await v.page.locator(".nc-monto-reparto").isVisible();
      check(`CA-07 ${ancho}: ventana Por monto con reparto y sin desplazamiento horizontal`, visible && (await sinDesborde(v.page)));
      if (ancho < 1024) {
        const alto44 = await v.page.getByLabel("Monto a acreditar").evaluate((e) => e.getBoundingClientRect().height);
        check("CA-07 390: campo de monto de al menos 44 px", alto44 >= 43.5, String(alto44));
      }
      await v.page.screenshot({ path: path.join(outDir, `${ancho}-ventana-monto.png`), fullPage: true });
      await v.ctx.close();
    }

    // ---- Aprobacion de las notas en SIFEN test y totales de FE = monto pedido.
    const v = await entrar(browser, 1440, 900);
    for (const [facturaId, esperados] of [[fac.id, [100000, 142300]], [usd.id, [50.25]]]) {
      const notas = await notasDe(v.page, facturaId);
      for (const esperado of esperados) {
        const n = notas.find((x) => Math.abs(Number(x.totals?.total) - esperado) < 0.005);
        if (!n) {
          check(`nota de ${esperado}: guardada en FS`, false, JSON.stringify(notas.map((x) => x.totals?.total)));
          continue;
        }
        const d = await esperarAprobado(v.page, n.id, `nota-${esperado}`);
        check(`nota de ${esperado} (${d?.numero_fiscal}): aprobada en SIFEN test, modo MONTO`, d?.estado === "EMITIDA" && d?.nce_modo === "MONTO", JSON.stringify({ estado: d?.estado, sifen: d?.sifen_result_code, modo: d?.nce_modo }));
        check(`nota de ${esperado}: total de FE igual al monto pedido`, d?.totals?.fuente === "FE" && Math.abs(Number(d?.totals?.total) - esperado) < 0.005, JSON.stringify(d?.totals));
      }
    }
    await v.ctx.close();
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
