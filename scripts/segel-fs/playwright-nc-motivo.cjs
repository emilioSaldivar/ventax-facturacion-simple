#!/usr/bin/env node
// FS-144 (SPEC_NOTA_CREDITO_UNIFICADA_v0.1 CA-11, TASKS NCU-012): el Motivo en SIFEN no se bloquea con la factura entera.
// Solo stack local de Segel (.local/segel-ensayo, 18492) contra fe-segel en SIFEN test.
//
//   ENSAYO_USER=operador-fs143 ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/segel-fs/playwright-nc-motivo.cjs
//
// Emite en SIFEN test tres facturas de una linea y cantidad 1 (Gs. 11.000, como la 0000360 de produccion). A 1280 px
// recorre Toda la factura / ajustes / quitar ajustes con el selector habilitado y emite la factura entera con motivo 2
// (combinada). A 1440 px emite la factura entera con motivo 1 (nota total de siempre). A 390 px solo revisa la
// pantalla. ENSAYO_SIN_EMITIR=1 no emite notas. Escribe test-results/nc-motivo/.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
if (!/^http:\/\/(localhost|127\.0\.0\.1):/.test(base)) throw new Error("Solo contra el stack local.");
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const ESPERA_MS = Number(process.env.ENSAYO_ESPERA_MS ?? 25 * 60 * 1000);
const SIN_EMITIR = process.env.ENSAYO_SIN_EMITIR === "1";
const outDir = path.join(process.cwd(), "test-results", "nc-motivo");
fs.mkdirSync(outDir, { recursive: true });
const marca = Date.now().toString(36).slice(-5);

const resultados = [];
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 500) });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 500)}` : ""}`);
}
const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const plano = async (loc) => (await loc.innerText()).replace(/\s+/g, " ");
const foto = (page, nombre) => page.screenshot({ path: path.join(outDir, `${nombre}.png`), fullPage: true });

async function entrar(browser, ancho, alto) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
  const page = await ctx.newPage();
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

async function api(page, metodo, ruta, cuerpo, claveIdem) {
  return page.evaluate(
    async ({ metodo, ruta, cuerpo, token, claveIdem }) => {
      const r = await fetch(`/api/v1${ruta}`, {
        method: metodo,
        credentials: "include",
        headers: { "content-type": "application/json", authorization: token, ...(claveIdem ? { "idempotency-key": claveIdem } : {}) },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined
      });
      const texto = await r.text();
      let json = null;
      try {
        json = JSON.parse(texto);
      } catch {}
      return { status: r.status, json };
    },
    { metodo, ruta, cuerpo, token: page.__token ?? "", claveIdem: claveIdem ?? null }
  );
}

async function esperarEmitida(page, id) {
  const fin = Date.now() + ESPERA_MS;
  let d = null;
  while (Date.now() < fin) {
    await api(page, "POST", `/facturas/${id}/refresh-status`).catch(() => undefined);
    d = (await api(page, "GET", `/facturas/${id}`)).json;
    if (["RECHAZADA", "ERROR_OPERATIVO"].includes(d?.estado) || (d?.estado === "EMITIDA" && d?.cdc)) break;
    await page.waitForTimeout(20000);
  }
  return d;
}

const CLIENTE = { documento_tipo: "RUC", documento: "80026570-0", razon_social: "SEGEL SA" };
async function crearFactura(page, nombre, cuerpo) {
  const r = await api(page, "POST", "/facturas", { condicion_venta: "CONTADO", tipo_transaccion: 2, cliente: CLIENTE, ...cuerpo }, `fs143-${nombre}-${marca}`);
  if (r.status >= 300) throw new Error(`factura ${nombre}: ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`);
  const d = await esperarEmitida(page, r.json?.id ?? r.json?.documento?.id);
  check(`Preparacion: factura ${nombre} ${d?.numero_fiscal} aprobada en SIFEN test`, d?.estado === "EMITIDA", JSON.stringify({ estado: d?.estado, total: d?.totals?.total, moneda: d?.moneda }));
  return d;
}

async function elegirFactura(page, numero) {
  await abrirVista(page, "Notas de crédito");
  const nueva = page.getByRole("button", { name: /Crear nueva/ });
  if (await nueva.isVisible().catch(() => false)) await nueva.click();
  await page.getByRole("heading", { name: "Factura de la nota" }).waitFor();
  const cambiar = page.getByRole("button", { name: "Cambiar factura" });
  if (await cambiar.isVisible().catch(() => false)) await cambiar.click();
  const fila = page.locator(".nc-candidatas .document-row", { hasText: numero }).first();
  await page.locator(".nc-candidatas .document-row").first().waitFor({ timeout: 15000 }).catch(() => undefined);
  if (!(await fila.isVisible().catch(() => false))) {
    await page.getByLabel("Buscar factura").fill(numero);
    await page.getByRole("button", { name: "Buscar" }).click();
  }
  await fila.click();
  await page.getByRole("heading", { name: "Qué se devuelve o ajusta" }).waitFor();
  await page.locator(".nc-editor").waitFor();
}

/** Carga solo el ajuste sobre el total, por monto, con el motivo 8 "Ajuste de precio" como en produccion. */
async function soloAjusteTotal(page, unidad, valor) {
  await page.getByRole("button", { name: "Agregar ajuste" }).click();
  await page.getByRole("group", { name: "Ajuste sobre el total en porcentaje o monto" }).getByRole("button", { name: unidad }).click();
  await page.getByLabel("Ajuste sobre el total", { exact: true }).fill(valor);
  await page.getByLabel("Motivo en SIFEN").selectOption({ label: "Ajuste de precio" });
  await page.getByLabel("Detalle para el cliente").fill("AJUSTE DE PRECIO");
}

async function emitirYVerificar(page, etiqueta, totalEsperado) {
  const respuesta = page.waitForResponse((r) => /\/nota-credito$/.test(r.url()) && r.request().method() === "POST", { timeout: 120000 });
  await page.getByRole("button", { name: "Emitir nota de crédito" }).click();
  const r = await respuesta;
  const pedido = r.request().postDataJSON();
  const json = await r.json().catch(() => null);
  check(`${etiqueta}: el pedido no lleva lineas y si el ajuste total`, pedido.lineas === undefined && pedido.combinada === true && pedido.acreditacion_total?.tipo === "MONTO", JSON.stringify(pedido));
  check(`${etiqueta}: POST nota-credito ${r.status()}`, r.status() === 201 || r.status() === 200, JSON.stringify(json?.error ?? null));
  const id = json?.id ?? json?.documento?.id;
  if (!id) return;
  const d = await esperarEmitida(page, id);
  check(
    `${etiqueta}: NC ${d?.numero_fiscal} aprobada, total ${d?.totals?.total}, motivo ${d?.nce_motivo_codigo}`,
    d?.estado === "EMITIDA" && Math.abs((d?.totals?.total ?? 0) - totalEsperado) < 1e-9 && d?.nce_modo === "COMBINADA",
    JSON.stringify({ estado: d?.estado, total: d?.totals?.total, modo: d?.nce_modo, cdc: d?.cdc, sifen: d?.sifen_result_code, mensaje: d?.sifen_result_message })
  );
}

async function emitir(page, etiqueta) {
  const respuesta = page.waitForResponse((r) => /\/nota-credito$/.test(r.url()) && r.request().method() === "POST", { timeout: 120000 });
  await page.getByRole("button", { name: "Emitir nota de crédito" }).click();
  const r = await respuesta;
  const json = await r.json().catch(() => null);
  check(`${etiqueta}: POST nota-credito ${r.status()}`, r.status() === 201 || r.status() === 200, JSON.stringify(json?.error ?? null));
  const id = json?.id ?? json?.documento?.id;
  return { pedido: r.request().postDataJSON(), nota: id ? await esperarEmitida(page, id) : null };
}

(async () => {
  const browser = await chromium.launch();
  try {
    const { ctx, page } = await entrar(browser, 1280, 900);
    const una = (n) => ({ items: [{ descripcion: `FS-144 prestacion de servicios ${n} ${marca}`, cantidad: 1, precio_unitario: 11000, iva_tipo: "IVA_10" }] });
    const f1 = await crearFactura(page, "a", una("a"));
    const f2 = await crearFactura(page, "b", una("b"));
    const f3 = await crearFactura(page, "c", una("c"));

    // 1280: los pasos del usuario sobre la factura de una linea.
    await elegirFactura(page, f1.numero_fiscal);
    const sel = page.getByLabel("Motivo en SIFEN");
    const paso = async (nombre, valorEsperado) => {
      const habilitado = await sel.isEnabled();
      const valor = await sel.inputValue();
      check(`1280 ${nombre}: selector habilitado${valorEsperado ? ` con ${valorEsperado}` : ""}`, habilitado && (!valorEsperado || valor === valorEsperado), JSON.stringify({ habilitado, valor }));
    };
    await page.getByRole("button", { name: "Toda la factura" }).click();
    await paso("Toda la factura", "1");
    await page.getByRole("button", { name: "Agregar ajuste" }).click();
    await page.getByLabel("Ajuste sobre el total", { exact: true }).fill("500");
    await paso("con ajuste sobre el total");
    await sel.selectOption("8");
    await paso("elige Ajuste de precio", "8");
    await page.getByRole("button", { name: "Quitar ajustes" }).click();
    await paso("despues de quitar ajustes", "8");
    await page.getByRole("button", { name: "Toda la factura" }).click();
    await sel.selectOption("2");
    await paso("vuelve a Toda la factura y elige Devolucion", "2");
    await page.getByLabel("Detalle para el cliente").fill("DEVOLUCION");
    check("1280: sin desplazamiento horizontal", await sinDesborde(page));
    await foto(page, "1280-entera-motivo-2");
    if (!SIN_EMITIR) {
      const { pedido, nota } = await emitir(page, "1280 entera motivo 2");
      check("1280: el pedido va combinado con motivo 2 y la linea entera", pedido.combinada === true && pedido.motivo_codigo === 2 && pedido.lineas?.length === 1 && pedido.lineas[0].cantidad === 1, JSON.stringify(pedido));
      check(`1280: NC ${nota?.numero_fiscal} aprobada, COMBINADA, motivo 2, Gs. 11.000`, nota?.estado === "EMITIDA" && nota?.nce_modo === "COMBINADA" && nota?.nce_motivo_codigo === 2 && nota?.totals?.total === 11000, JSON.stringify({ estado: nota?.estado, modo: nota?.nce_modo, motivo: nota?.nce_motivo_codigo, total: nota?.totals?.total, cdc: nota?.cdc, sifen: nota?.sifen_result_code }));
    }
    await ctx.close();

    // 1440: factura entera dejando el motivo 1 sugerido → la nota total de siempre.
    const e2 = await entrar(browser, 1440, 900);
    await elegirFactura(e2.page, f2.numero_fiscal);
    await e2.page.getByRole("button", { name: "Toda la factura" }).click();
    const sel2 = e2.page.getByLabel("Motivo en SIFEN");
    check("1440 Toda la factura: selector habilitado con 1 sugerido", (await sel2.isEnabled()) && (await sel2.inputValue()) === "1");
    await e2.page.getByLabel("Detalle para el cliente").fill("DEVOLUCION TOTAL");
    check("1440: sin desplazamiento horizontal", await sinDesborde(e2.page));
    await foto(e2.page, "1440-entera-motivo-1");
    if (!SIN_EMITIR) {
      const { pedido, nota } = await emitir(e2.page, "1440 entera motivo 1");
      check("1440: el pedido es la nota total de siempre ({motivo})", Object.keys(pedido).join() === "motivo", JSON.stringify(pedido));
      check(`1440: NC ${nota?.numero_fiscal} aprobada, total Gs. 11.000`, nota?.estado === "EMITIDA" && nota?.totals?.total === 11000, JSON.stringify({ estado: nota?.estado, modo: nota?.nce_modo, total: nota?.totals?.total, cdc: nota?.cdc, sifen: nota?.sifen_result_code }));
    }
    await e2.ctx.close();

    // 390: solo pantalla.
    const e3 = await entrar(browser, 390, 844);
    await elegirFactura(e3.page, f3.numero_fiscal);
    await e3.page.getByRole("button", { name: "Toda la factura" }).click();
    const sel3 = e3.page.getByLabel("Motivo en SIFEN");
    await sel3.selectOption("2");
    check("390 Toda la factura: selector habilitado y acepta Devolucion", (await sel3.isEnabled()) && (await sel3.inputValue()) === "2");
    check("390: sin desplazamiento horizontal", await sinDesborde(e3.page));
    await foto(e3.page, "390-entera-motivo-2");
    await e3.ctx.close();
  } catch (error) {
    check("flujo completo", false, error.message.split("\n")[0]);
  }
  await browser.close();
  fs.writeFileSync(path.join(outDir, "resultado.json"), JSON.stringify(resultados, null, 2));
  const fallas = resultados.filter((r) => !r.ok).length;
  console.log(`\n${resultados.length - fallas}/${resultados.length} verificaciones OK. Capturas en ${outDir}`);
  process.exit(fallas ? 1 : 0);
})();
