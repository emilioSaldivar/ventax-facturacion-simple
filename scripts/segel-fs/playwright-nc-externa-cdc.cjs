#!/usr/bin/env node
// Nota de credito sobre factura traida por CDC (SPEC_NOTA_CREDITO_FACTURA_EXTERNA_v0.1, CA-01 a CA-03; TASKS NCX-010
// parcial). Usa dos facturas emitidas directamente en FE (fe-segel, SIFEN test) SIN pasar por FS, asi que FS no las
// tiene: A con descuentos (copia de 1010665) y B sin descuentos (copia de 1010667).
//
//   ENSAYO_CDC_A=<cdc> ENSAYO_CDC_B=<cdc> ENSAYO_PASSWORD_FILE=/ruta/operador-final.pass \
//     node scripts/segel-fs/playwright-nc-externa-cdc.cjs
//
// Emite en SIFEN test tres NC: total por tasa sobre A (D-3), parcial por lineas y por monto sobre B.
// Limite conocido: FE rc4.34 si tiene estas facturas (las emitio el); el caso "FE tampoco la conoce" espera rc4.35.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const CDC_A = process.env.ENSAYO_CDC_A ?? "";
const CDC_B = process.env.ENSAYO_CDC_B ?? "";
const ESPERA_MS = Number(process.env.ENSAYO_ESPERA_MS ?? 25 * 60 * 1000);
const outDir = path.join(process.cwd(), "test-results", "nc-externa-cdc");
fs.mkdirSync(outDir, { recursive: true });

const resultados = [];
const emitidas = [];
let paginaActual = null;
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 400) });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 400)}` : ""}`);
}
const plano = async (loc) => (await loc.innerText()).replace(/\s+/g, " ");
const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function entrar(browser, ancho, alto) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
  const page = await ctx.newPage();
  paginaActual = page;
  page.setDefaultTimeout(30000);
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

async function esperarAprobado(page, id, etiqueta) {
  const fin = Date.now() + ESPERA_MS;
  let d = null;
  while (Date.now() < fin) {
    d = (await api(page, "GET", `/facturas/${id}`)).json;
    if (d?.estado === "EMITIDA" && d?.cdc) break;
    if (["RECHAZADA", "ERROR_OPERATIVO"].includes(d?.estado)) break;
    await page.waitForTimeout(20000);
    await api(page, "POST", `/facturas/${id}/refresh-status`).catch(() => undefined);
  }
  emitidas.push({ etiqueta, id, numero: d?.numero_fiscal ?? null, estado: d?.estado ?? null, total: d?.totals?.total ?? null, fuente: d?.totals?.fuente ?? null, sifen: d?.sifen_result_code ?? null, mensaje: d?.sifen_result_message ?? null });
  fs.writeFileSync(path.join(outDir, "emitidas.json"), JSON.stringify(emitidas, null, 2));
  return d;
}

async function notaDe(page, facturaId, total) {
  const notas = (await api(page, "GET", "/facturas?tipo=NOTA_CREDITO&limit=30&offset=0")).json?.items ?? [];
  return notas.find((n) => n.documento_relacionado_id === facturaId && (total === undefined || Math.abs(Number(n.totals?.total) - total) < 0.5)) ?? null;
}

(async () => {
  if (!CDC_A || !CDC_B) throw new Error("Faltan ENSAYO_CDC_A y ENSAYO_CDC_B");
  const browser = await chromium.launch();
  try {
    const { ctx, page } = await entrar(browser, 1440, 900);

    // ---- CA-01: traer A por CDC desde la pantalla (vista previa de solo lectura y guardado).
    await abrirVista(page, "Notas de crédito");
    await page.getByRole("button", { name: /La factura no está en el sistema/ }).click();
    await page.getByLabel("CDC", { exact: true }).fill(CDC_A.replace(/(\d{4})(?=\d)/g, "$1 "));
    await page.getByRole("button", { name: "Consultar en SIFEN" }).click();
    const previa = page.locator('section[aria-labelledby="fe-previa-titulo"]');
    await previa.waitFor({ timeout: 30000 });
    const textoPrevia = await plano(previa);
    check("CA-01: la vista previa muestra la factura de SIFEN (3 lineas, total 242.300, sin edicion)", /242\.300/.test(textoPrevia) && /No se pueden editar/.test(textoPrevia) && (await previa.locator("tbody tr").count()) === 3, textoPrevia.slice(0, 300));
    check("CA-01: la vista previa muestra los descuentos (40.000)", /Descuentos\s*Gs\.?\s*40\.000/.test(textoPrevia), textoPrevia.slice(-200));
    check("CA-08 1440: vista previa sin desplazamiento horizontal", await sinDesborde(page));
    await page.screenshot({ path: path.join(outDir, "1440-previa-a.png"), fullPage: true });
    await previa.getByRole("button", { name: "Guardar factura" }).click();
    await page.getByRole("button", { name: /Volver a resultados/ }).waitFor({ timeout: 20000 });
    const fichaA = await plano(page.locator(".document-detail"));
    check("CA-01: la ficha dice Externa traida de SIFEN con su protocolo", /Externa · traída de SIFEN \(protocolo \d+\)/.test(fichaA), fichaA.slice(0, 300));
    await page.screenshot({ path: path.join(outDir, "1440-ficha-a.png"), fullPage: true });
    const facturas = (await api(page, "GET", "/facturas?tipo=FACTURA&limit=20&offset=0")).json?.items ?? [];
    const a = facturas.find((d) => d.cdc === CDC_A);
    check("CA-01 API: guardada con origen SIFEN, totales del rDE y bases por tasa", a?.origen === "SIFEN" && a?.totals?.total === 242300 && a?.totals?.gravada_10 === 150757 && a?.totals?.fuente === "SIFEN", JSON.stringify(a ? { o: a.origen, t: a.totals } : null).slice(0, 300));
    const saldoA = (await api(page, "GET", `/facturas/${a?.id}/nota-credito/saldo`)).json;
    check("CA-01 API: saldo con las tasas guardadas 165.833 / 48.623 / 27.875 y Parcial bloqueada", JSON.stringify(saldoA?.monto?.tasas) === JSON.stringify({ iva_10: 165833, iva_5: 48623, exenta: 27875 }) && saldoA?.monto?.saldo === 242300, JSON.stringify(saldoA?.monto));
    const repetida = await api(page, "POST", "/facturas/externas/sifen", { cdc: CDC_A });
    check("D-7: traer A otra vez responde 409 FACTURA_YA_EXISTE", repetida.status === 409 && repetida.json?.error?.details?.reason === "FACTURA_YA_EXISTE");

    // ---- CA-02: NC total sobre A (con descuentos) desde la ficha: va por tasa (D-3).
    const boton = page.getByRole("button", { name: /Crear nota de cr[eé]dito/ }).first();
    await page.waitForFunction((b) => b && !b.disabled, await boton.elementHandle(), { timeout: 20000 });
    await boton.click();
    await page.getByRole("group", { name: "Tipo de nota de crédito" }).waitFor({ timeout: 15000 });
    await page.locator(".modal-panel textarea").fill("Devolucion total de factura externa");
    await page.getByRole("button", { name: "Confirmar" }).click();
    const popup = page.locator('section[aria-labelledby="nc-success-title"]');
    check("CA-02: NC total sobre A emitida desde la ficha", await popup.waitFor({ timeout: 90000 }).then(() => true, () => false));
    const ncA = await notaDe(page, a?.id);
    const ncADetalle = ncA ? (await api(page, "GET", `/facturas/${ncA.id}`)).json : null;
    check(
      "CA-02 (D-3): la NC total va por tasa (AJ-IVA10/AJ-IVA5/AJ-EXE), suma 242.300 y se guarda como MONTO",
      ncADetalle?.nce_modo === "MONTO" && ncADetalle?.items?.map((i) => i.codigo).join(",") === "AJ-IVA10,AJ-IVA5,AJ-EXE" && ncADetalle?.totals?.total === 242300,
      JSON.stringify(ncADetalle ? { modo: ncADetalle.nce_modo, items: ncADetalle.items.map((i) => [i.codigo, i.precio_unitario]), total: ncADetalle.totals.total } : null)
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await esperarSesion(page);

    // ---- CA-03: traer B por API, NC parcial por lineas (1 x 75.000) desde la ventana y por monto por el saldo.
    const traidaB = await api(page, "POST", "/facturas/externas/sifen", { cdc: CDC_B });
    const b = traidaB.json;
    check("CA-03: B traida por CDC (origen SIFEN, total 211.500, sin descuentos)", traidaB.status === 201 && b?.origen === "SIFEN" && b?.totals?.total === 211500 && !(b?.totals?.descuento > 0), JSON.stringify(b?.totals ?? traidaB.json).slice(0, 200));
    const parcial = await api(page, "POST", `/facturas/${b?.id}/nota-credito`, { motivo: "Devolucion de una unidad", lineas: [{ line_no: 1, cantidad: 1 }] });
    check("CA-03: NC parcial por lineas sobre B (1 x 75.000) aceptada", parcial.status === 201 && parcial.json?.totals?.total === 75000, JSON.stringify(parcial.json?.totals ?? parcial.json).slice(0, 200));
    const saldoB = (await api(page, "GET", `/facturas/${b?.id}/nota-credito/saldo`)).json;
    check("CA-03: saldo de B 136.500 y la linea 1 con 1 de 2 acreditada", saldoB?.monto?.saldo === 136500 && saldoB?.lineas?.[0]?.cantidad_acreditada === 1, JSON.stringify({ saldo: saldoB?.monto?.saldo, l1: saldoB?.lineas?.[0] }));
    const monto = await api(page, "POST", `/facturas/${b?.id}/nota-credito`, { motivo: "Ajuste por el saldo", monto: 136500, motivo_codigo: 8 });
    check("CA-03: NC por monto sobre B por el saldo exacto aceptada", monto.status === 201 && monto.json?.totals?.total === 136500, JSON.stringify(monto.json?.totals ?? monto.json).slice(0, 200));
    const saldoFinalB = (await api(page, "GET", `/facturas/${b?.id}/nota-credito/saldo`)).json;
    check("CA-03: B acreditada por completo", saldoFinalB?.monto?.admite === false && saldoFinalB?.monto?.saldo === 0, JSON.stringify(saldoFinalB?.monto));
    await ctx.close();

    // ---- CA-08 390: vista previa en celular.
    const v = await entrar(browser, 390, 844);
    await abrirVista(v.page, "Notas de crédito");
    await v.page.getByRole("button", { name: /La factura no está en el sistema/ }).click();
    await v.page.getByLabel("CDC", { exact: true }).fill(CDC_B);
    await v.page.getByRole("button", { name: "Consultar en SIFEN" }).click();
    const aviso = await v.page.locator(".aviso-error").first().innerText({ timeout: 20000 }).catch(() => "");
    check("CA-08 390: B ya traida responde ya existe, sin desplazamiento horizontal", /ya está en el sistema/.test(aviso) && (await sinDesborde(v.page)), aviso);
    await v.ctx.close();

    // ---- Aprobacion en SIFEN test.
    const w = await entrar(browser, 1440, 900);
    for (const [etiqueta, id, total] of [["nc-total-por-tasa-A", ncA?.id, 242300], ["nc-parcial-B", parcial.json?.id, 75000], ["nc-monto-B", monto.json?.id, 136500]]) {
      if (!id) {
        check(`${etiqueta}: guardada en FS`, false);
        continue;
      }
      const d = await esperarAprobado(w.page, id, etiqueta);
      check(`${etiqueta} (${d?.numero_fiscal}): aprobada en SIFEN test`, d?.estado === "EMITIDA", JSON.stringify({ estado: d?.estado, sifen: d?.sifen_result_code, mensaje: d?.sifen_result_message }));
      check(`${etiqueta}: total de FE igual al pedido`, d?.totals?.fuente === "FE" && Math.abs(Number(d?.totals?.total) - total) < 0.5, JSON.stringify(d?.totals));
    }
    await w.ctx.close();
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
