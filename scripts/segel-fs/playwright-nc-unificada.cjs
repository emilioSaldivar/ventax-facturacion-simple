#!/usr/bin/env node
// Nota de credito unificada (SPEC_NOTA_CREDITO_UNIFICADA_v0.1, TASKS NCU-007): CA-01 a CA-09 en la pantalla nueva.
// Solo stack local de Segel (.local/segel-ensayo, 18492) contra fe-segel segel-rc4.36 en SIFEN test, con
// FE_NC_DESCUENTOS=true en .env.segel.
//
//   ENSAYO_PASSWORD_FILE=/ruta/operador-final.pass node scripts/segel-fs/playwright-nc-unificada.cjs
//
// Facturas del stack local (PLAN §0: tomadas de la base, no de memoria), por variable para poder repetir:
//   ENSAYO_CA01   factura propia PYG sin notas como la del canvas (2 x 75.000 IVA 10, 1 x 31.500 IVA 5, 3 x 10.000 exento)
//   ENSAYO_CA02   factura propia PYG sin notas (nota total por "Toda la factura")
//   ENSAYO_CA05   factura externa PYG con descuentos, sin notas
//   ENSAYO_USD    factura USD (solo vista previa del % sobre el total)
// Emite en SIFEN test TRES notas: CA-01 (combinada), CA-02 (total) y CA-05 (devolucion con descuento).
// ENSAYO_SIN_EMITIR=1 recorre todo sin emitir. Escribe test-results/nc-unificada/.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const ESPERA_MS = Number(process.env.ENSAYO_ESPERA_MS ?? 25 * 60 * 1000);
const SIN_EMITIR = process.env.ENSAYO_SIN_EMITIR === "1";
// Nota de CA-01 ya emitida en una corrida anterior: no se vuelve a emitir, se espera su aprobacion.
const NC_CA01_ID = process.env.ENSAYO_NC_CA01_ID ?? null;
let CA01 = process.env.ENSAYO_CA01 ?? "1010667";
let CA02 = process.env.ENSAYO_CA02 ?? "1010664";
let CA05 = process.env.ENSAYO_CA05 ?? "9300008";
// Factura externa con descuentos que ya tiene una devolucion: solo vista previa (CA-05 sobre externa, sin emitir).
const CA05_EXTERNA = process.env.ENSAYO_CA05_EXTERNA ?? "9300008";
// ENSAYO_CREAR_FACTURAS=1: emite antes en SIFEN test las tres facturas propias (canvas, una linea, con descuentos)
// y las usa para CA-01..CA-07, para repetir la prueba completa con saldo entero.
const CREAR = process.env.ENSAYO_CREAR_FACTURAS === "1";
const USD = process.env.ENSAYO_USD ?? "1010666";
const outDir = path.join(process.cwd(), "test-results", "nc-unificada");
fs.mkdirSync(outDir, { recursive: true });
const marca = Date.now().toString(36).slice(-5);

const resultados = [];
const emitidas = [];
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 500) });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 500)}` : ""}`);
}
const EMOJI = /[\p{Extended_Pictographic}]/u;
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
  const actualizar = page.getByRole("button", { name: "Actualizar" });
  if (await actualizar.isVisible({ timeout: 3000 }).catch(() => false)) {
    await actualizar.click();
    await page.waitForLoadState("domcontentloaded");
    await esperarSesion(page);
  }
  return { ctx, page };
}

async function api(page, metodo, ruta, cuerpo, clave) {
  return page.evaluate(
    async ({ metodo, ruta, cuerpo, token, clave }) => {
      const r = await fetch(`/api/v1${ruta}`, {
        method: metodo,
        credentials: "include",
        headers: { "content-type": "application/json", authorization: token, ...(clave ? { "idempotency-key": clave } : {}) },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined
      });
      const texto = await r.text();
      let json = null;
      try {
        json = JSON.parse(texto);
      } catch {}
      return { status: r.status, json };
    },
    { metodo, ruta, cuerpo, token: page.__token ?? "", clave: clave ?? null }
  );
}

const CLIENTE = { documento_tipo: "RUC", documento: "80026570-0", razon_social: "SEGEL SA" };
const FACTURAS_A_CREAR = {
  canvas: {
    items: [
      { descripcion: `NCU canvas IVA10 ${marca}`, cantidad: 2, precio_unitario: 75000, iva_tipo: "IVA_10" },
      { descripcion: `NCU canvas IVA5 ${marca}`, cantidad: 1, precio_unitario: 31500, iva_tipo: "IVA_5" },
      { descripcion: `NCU canvas exento ${marca}`, cantidad: 3, precio_unitario: 10000, iva_tipo: "EXENTA" }
    ]
  },
  unaLinea: { items: [{ descripcion: `NCU una linea ${marca}`, cantidad: 1, precio_unitario: 10350, iva_tipo: "IVA_10" }] },
  conDescuento: {
    descuento_global: 20000,
    items: [
      { descripcion: `NCU con descuento IVA10 ${marca}`, cantidad: 2, precio_unitario: 100000, iva_tipo: "IVA_10", descuento: 10000 },
      { descripcion: `NCU con descuento IVA5 ${marca}`, cantidad: 1, precio_unitario: 52330, iva_tipo: "IVA_5" },
      { descripcion: `NCU con descuento exento ${marca}`, cantidad: 1, precio_unitario: 30000, iva_tipo: "EXENTA" }
    ]
  }
};

/** Emite una factura propia en SIFEN test y espera su aprobacion; devuelve el numero fiscal. */
async function crearFactura(page, nombre) {
  const { items, ...resto } = FACTURAS_A_CREAR[nombre];
  const r = await api(page, "POST", "/facturas", { condicion_venta: "CONTADO", tipo_transaccion: 2, cliente: CLIENTE, items, ...resto }, `ncu-${nombre}-${marca}`);
  if (r.status >= 300) throw new Error(`factura ${nombre}: POST /facturas ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`);
  const id = r.json?.id ?? r.json?.documento?.id;
  const fin = Date.now() + ESPERA_MS;
  let d = null;
  while (Date.now() < fin) {
    await api(page, "POST", `/facturas/${id}/refresh-status`).catch(() => undefined);
    d = (await api(page, "GET", `/facturas/${id}`)).json;
    if (["EMITIDA", "RECHAZADA", "ERROR_OPERATIVO"].includes(d?.estado) && (d?.estado !== "EMITIDA" || d?.cdc)) break;
    await page.waitForTimeout(20000);
  }
  check(`Preparacion: factura ${nombre} ${d?.numero_fiscal} aprobada en SIFEN test`, d?.estado === "EMITIDA", JSON.stringify({ estado: d?.estado, total: d?.totals?.total }));
  return d?.numero_fiscal ?? null;
}

/** Abre Notas de credito y elige la factura por su numero (de la lista o buscandola). */
async function elegirFactura(page, numero) {
  await abrirVista(page, "Notas de crédito");
  // Despues de emitir, la pantalla muestra el resultado: se vuelve al formulario.
  const nueva = page.getByRole("button", { name: /Crear nueva/ });
  if (await nueva.isVisible().catch(() => false)) await nueva.click();
  await page.getByRole("heading", { name: "Factura de la nota" }).waitFor();
  // La pantalla conserva la factura elegida al volver a abrirla desde el menu.
  const cambiar = page.getByRole("button", { name: "Cambiar factura" });
  if (await cambiar.isVisible().catch(() => false)) await cambiar.click();
  const fila = page.locator(".nc-candidatas .document-row", { hasText: numero }).first();
  // FS-142: la busqueda por numero no encuentra facturas externas; se espera la lista y se busca solo si no esta.
  await page.locator(".nc-candidatas .document-row").first().waitFor({ timeout: 15000 }).catch(() => undefined);
  if (!(await fila.isVisible().catch(() => false))) {
    await page.getByLabel("Buscar factura").fill(numero);
    await page.getByRole("button", { name: "Buscar" }).click();
  }
  await fila.click();
  await page.getByRole("heading", { name: "Qué se devuelve o ajusta" }).waitFor();
  await page.locator(".nc-editor").waitFor();
}

const totalNota = async (page) => plano(page.getByTestId("nc-total"));
const bloqueo = async (page) => ((await page.locator(".nc-bloqueo").isVisible().catch(() => false)) ? plano(page.locator(".nc-bloqueo")) : "");

async function emitir(page, etiqueta) {
  const respuesta = page.waitForResponse((r) => /\/nota-credito$/.test(r.url()) && r.request().method() === "POST", { timeout: 120000 });
  await page.getByRole("button", { name: "Emitir nota de crédito" }).click();
  const r = await respuesta;
  const cuerpoPedido = r.request().postDataJSON();
  const json = await r.json().catch(() => null);
  check(`${etiqueta}: POST nota-credito ${r.status()}`, r.status() === 201 || r.status() === 200, JSON.stringify({ pedido: cuerpoPedido, error: json?.error ?? null }));
  return { pedido: cuerpoPedido, nota: json };
}

async function esperarAprobada(page, id, etiqueta) {
  const fin = Date.now() + ESPERA_MS;
  let d = null;
  while (Date.now() < fin) {
    d = (await api(page, "GET", `/facturas/${id}`)).json;
    if (d?.estado === "EMITIDA" && d?.cdc) break;
    if (["RECHAZADA", "ERROR_OPERATIVO"].includes(d?.estado)) break;
    await page.waitForTimeout(20000);
    await api(page, "POST", `/facturas/${id}/refresh-status`).catch(() => undefined);
  }
  emitidas.push({ etiqueta, id, numero: d?.numero_fiscal ?? null, estado: d?.estado ?? null, total: d?.totals?.total ?? null, modo: d?.nce_modo ?? null, motivo_codigo: d?.nce_motivo_codigo ?? null, sifen: d?.sifen_result_code ?? null, mensaje: d?.sifen_result_message ?? null });
  check(`${etiqueta}: NC ${d?.numero_fiscal} aprobada en SIFEN test`, d?.estado === "EMITIDA", JSON.stringify({ estado: d?.estado, total: d?.totals?.total, modo: d?.nce_modo, sifen: d?.sifen_result_code, mensaje: d?.sifen_result_message }));
  return d;
}

async function idDeFactura(page, numero) {
  const lista = (await api(page, "GET", `/facturas/nce-candidatas?limit=60&offset=0`)).json;
  const c = lista?.items?.find((i) => (i.documento.numero_fiscal ?? "").endsWith(numero));
  return c?.documento?.id ?? null;
}

(async () => {
  const browser = await chromium.launch();
  try {
    // ── Escritorio 1440: armado combinado del canvas (CA-01, CA-03, CA-04) ──
    const { ctx, page } = await entrar(browser, 1440, 900);
    if (CREAR) {
      CA01 = (await crearFactura(page, "canvas")) ?? CA01;
      CA02 = (await crearFactura(page, "unaLinea")) ?? CA02;
      CA05 = (await crearFactura(page, "conDescuento")) ?? CA05;
    }
    const idCa01 = await idDeFactura(page, CA01);
    const saldoAntes = idCa01 ? (await api(page, "GET", `/facturas/${idCa01}/nota-credito/saldo`)).json : null;
    if (!NC_CA01_ID) check("Saldo CA-01 sin notas previas", saldoAntes?.monto?.saldo === 211500 && saldoAntes?.descuentos_en_nc === true, JSON.stringify({ saldo: saldoAntes?.monto?.saldo, descuentos_en_nc: saldoAntes?.descuentos_en_nc }));

    let notaCa01 = NC_CA01_ID ? { id: NC_CA01_ID } : null;
    if (!NC_CA01_ID) {
    await elegirFactura(page, CA01);
    check("CA-09: acreditaciones ocultas por defecto", !(await page.getByLabel("Ajuste, línea 2").isVisible().catch(() => false)));
    await foto(page, "1440-inicial");

    // CA-03: tope por item (devolver 2 y acreditar 20.000 sobre un item de 150.000).
    await page.getByLabel("Devolver, línea 1").fill("2");
    await page.getByRole("button", { name: "Agregar ajuste" }).click();
    await page.getByRole("group", { name: "Ajuste en porcentaje o monto" }).getByRole("button", { name: "Gs." }).click();
    await page.getByLabel("Ajuste, línea 1").fill("20000");
    const errorCelda = await plano(page.locator(".nc-celda-error").first()).catch(() => "");
    const botonDeshabilitado = await page.getByRole("button", { name: "Emitir nota de crédito" }).isDisabled();
    check("CA-03: tope por item marca la celda y bloquea", /Supera|supera/.test(errorCelda) && botonDeshabilitado, `${errorCelda} | bloqueo: ${await bloqueo(page)}`);
    await foto(page, "1440-ca03-tope-item");
    await page.getByLabel("Ajuste, línea 1").fill("");
    await page.getByLabel("Devolver, línea 1").fill("");

    // CA-03: total sobre el saldo.
    await page.getByLabel("Ajuste sobre el total", { exact: true }).fill("300000");
    const b1 = await bloqueo(page);
    check("CA-03: total sobre el saldo bloquea el boton", /saldo/i.test(b1) && (await page.getByRole("button", { name: "Emitir nota de crédito" }).isDisabled()), b1);

    // CA-04: 10 % sobre el total = 21.150 repartido por tasa.
    await page.getByRole("group", { name: "Ajuste sobre el total en porcentaje o monto" }).getByRole("button", { name: "Porcentaje" }).click();
    await page.getByLabel("Ajuste sobre el total", { exact: true }).fill("10");
    const t04 = await totalNota(page);
    const desglose04 = await plano(page.locator(".nc-desglose")).catch(() => "");
    check("CA-04: 10 % sobre el total = 21.150 por tasa", /21\.150/.test(t04) && /IVA 10 %/.test(desglose04) && /Exento/.test(desglose04), `${t04} | ${desglose04}`);
    await page.getByLabel("Ajuste sobre el total", { exact: true }).fill("");

    // CA-01: devolver 1 del item 1, 10 % del item 2 y 5.000 sobre el total = 83.150, motivo 1.
    await page.getByRole("group", { name: "Ajuste en porcentaje o monto" }).getByRole("button", { name: "Porcentaje" }).click();
    await page.getByLabel("Devolver, línea 1").fill("1");
    await page.getByLabel("Ajuste, línea 2").fill("10");
    await page.getByRole("group", { name: "Ajuste sobre el total en porcentaje o monto" }).getByRole("button", { name: "Gs." }).click();
    await page.getByLabel("Ajuste sobre el total", { exact: true }).fill("5000");
    const t01 = await totalNota(page);
    const panel = await plano(page.locator(".nc-panel"));
    const motivoSifen = await page.getByLabel("Motivo en SIFEN").inputValue();
    check("CA-01: vista previa 83.150 con motivo 1", /83\.150/.test(t01) && motivoSifen === "1" && /75\.000/.test(panel) && /3\.150/.test(panel) && /5\.000/.test(panel), `${t01} | motivo ${motivoSifen} | ${panel}`);
    await page.getByLabel("Detalle para el cliente").fill(`Devolucion y bonificacion ${marca}`);
    check("CA-01: boton habilitado sin bloqueo", !(await page.getByRole("button", { name: "Emitir nota de crédito" }).isDisabled()), await bloqueo(page));
    check("CA-09 1440: sin desborde ni emojis", (await sinDesborde(page)) && !EMOJI.test(await page.locator("body").innerText()));
    await foto(page, "1440-ca01-armada");

    // 1280: misma grilla sin desborde.
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.waitForTimeout(300);
    check("CA-09 1280: grilla completa sin desborde", (await sinDesborde(page)) && (await page.locator("table.nc-lineas-editor").isVisible()));
    await foto(page, "1280-ca01-armada");
    await page.setViewportSize({ width: 1440, height: 900 });

    if (!SIN_EMITIR) {
      const { pedido, nota } = await emitir(page, "CA-01");
      check(
        "CA-01: pedido combinado con lineas y total",
        pedido?.combinada === true && pedido?.motivo_codigo === 1 && pedido?.acreditacion_total?.valor === 5000 && pedido?.lineas?.length === 2,
        JSON.stringify(pedido)
      );
      notaCa01 = nota;
      await foto(page, "1440-ca01-resultado");
    }
    }

    // ── CA-04 USD: 10 % sobre el total con 2 decimales (sin emitir) ──
    await elegirFactura(page, USD);
    await page.getByRole("button", { name: "Agregar ajuste" }).click();
    await page.getByRole("group", { name: "Ajuste sobre el total en porcentaje o monto" }).getByRole("button", { name: "Porcentaje" }).click();
    await page.getByLabel("Ajuste sobre el total", { exact: true }).fill("10");
    const tUsd = await totalNota(page);
    check("CA-04 USD: 10 % con 2 decimales", /USD [\d.]+,\d{2}/.test(tUsd) && !/USD 0,00/.test(tUsd), tUsd);

    // ── CA-07: desde la ficha de Documentos se abre esta pantalla con la factura ──
    await abrirVista(page, "Documentos");
    const filaDoc = page.locator("tr, .document-row", { hasText: CA02 }).first();
    if (await filaDoc.waitFor({ timeout: 15000 }).then(() => true).catch(() => false)) {
      await filaDoc.click();
      await page.getByRole("button", { name: "Crear nota de crédito" }).locator("visible=true").first().click();
      const abrio = await page.getByRole("heading", { name: "Qué se devuelve o ajusta" }).waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
      const tarjeta = abrio ? await plano(page.locator(".nc-factura-elegida")) : "";
      const sinVentana = !(await page.locator(".modal-panel .nc-parcial").isVisible().catch(() => false));
      check("CA-07: la ficha abre la pantalla unificada con la factura", abrio && tarjeta.includes(CA02) && sinVentana, tarjeta);
    } else {
      check("CA-07: la ficha abre la pantalla unificada con la factura", false, `no se encontro ${CA02} en Documentos`);
    }

    // ── CA-02: "Toda la factura" sin notas = nota total de siempre ──
    if (!(await page.getByRole("heading", { name: "Qué se devuelve o ajusta" }).isVisible().catch(() => false))) await elegirFactura(page, CA02);
    await page.getByRole("button", { name: "Toda la factura" }).click();
    const t02 = await totalNota(page);
    const etiqueta02 = await plano(page.locator(".nc-panel"));
    check("CA-02: Toda la factura muestra el total de la factura y motivo 1 fijo", /factura entera/.test(etiqueta02) && (await page.getByLabel("Motivo en SIFEN").inputValue()) === "1" && (await page.getByLabel("Motivo en SIFEN").isDisabled()), `${t02} | ${etiqueta02}`);
    await page.getByLabel("Detalle para el cliente").fill(`Anulacion total ${marca}`);
    let notaCa02 = null;
    if (!SIN_EMITIR) {
      const { pedido, nota } = await emitir(page, "CA-02");
      check("CA-02: cuerpo {motivo} (camino de la total, D-7)", pedido && Object.keys(pedido).join(",") === "motivo", JSON.stringify(pedido));
      notaCa02 = nota;
    }

    // ── CA-05: factura externa con descuentos, devolver 1 unidad de la linea con descuento ──
    await elegirFactura(page, CA05);
    const encabezados = await plano(page.locator("table.nc-lineas-editor thead"));
    await page.getByLabel("Devolver, línea 1").fill("1");
    const errores05 = await page.locator(".nc-celda-error, .nc-celda-aviso").count();
    const t05 = await totalNota(page);
    check("CA-05: devolucion de linea con descuento al neto (bandera encendida)", /Neto u\./.test(encabezados) && errores05 === 0 && !/Gs\. 0$/.test(t05), `${t05} | ${encabezados}`);
    await page.getByLabel("Detalle para el cliente").fill(`Devolucion con descuento ${marca}`);
    await foto(page, "1440-ca05-externa-descuento");
    let notaCa05 = null;
    if (!SIN_EMITIR) {
      const { pedido, nota } = await emitir(page, "CA-05");
      check("CA-05: pedido combinado con devolucion", pedido?.combinada === true && pedido?.lineas?.[0]?.cantidad === 1, JSON.stringify(pedido));
      notaCa05 = nota;
    }

    // ── CA-05 sobre la factura externa con descuentos (vista previa, sin emitir) ──
    await elegirFactura(page, CA05_EXTERNA);
    const saldoExt = (await api(page, "GET", `/facturas/${(await idDeFactura(page, CA05_EXTERNA)) ?? ""}/nota-credito/saldo`)).json;
    const lineaConSaldo = saldoExt?.lineas?.find((l) => l.saldo > 0 && ((l.descuento ?? 0) > 0 || (l.descuento_global ?? 0) > 0));
    if (lineaConSaldo) {
      await page.getByLabel(`Devolver, línea ${lineaConSaldo.line_no}`).fill("1");
      const tExt = await totalNota(page);
      check("CA-05 externa: devolver una linea con descuento arma la nota al neto, sin errores", (await page.locator(".nc-celda-error, .nc-celda-aviso").count()) === 0 && !/ 0$/.test(tExt), `${tExt} linea ${lineaConSaldo.line_no}`);
      await foto(page, "1440-ca05-externa-vista");
    } else {
      check("CA-05 externa: devolver una linea con descuento arma la nota al neto, sin errores", false, "sin linea con descuento y saldo");
    }

    // ── Celular 390: tarjetas por linea ──
    const movil = await entrar(browser, 390, 844);
    await elegirFactura(movil.page, CA02 === CA01 ? USD : USD);
    const tarjetas = await movil.page.locator(".nc-tarjeta-linea").count();
    await movil.page.getByRole("button", { name: "Agregar ajuste" }).click();
    const alturaCampo = await movil.page.getByLabel("Devolver, línea 1").evaluate((el) => el.getBoundingClientRect().height);
    check("CA-09 390: tarjetas por linea, sin tabla, sin desborde, campos de 44 px", tarjetas > 0 && !(await movil.page.locator("table.nc-lineas-editor").isVisible().catch(() => false)) && (await sinDesborde(movil.page)) && alturaCampo >= 44, `tarjetas ${tarjetas}, alto ${alturaCampo}`);
    await foto(movil.page, "390-tarjetas");
    await movil.ctx.close();

    // ── Aprobaciones en SIFEN test y saldo despues (CA-01, CA-06) ──
    if (!SIN_EMITIR) {
      const d01 = notaCa01?.id ? await esperarAprobada(page, notaCa01.id, "CA-01") : null;
      if (d01) {
        check("CA-01: guardada COMBINADA con motivo 1", d01.nce_modo === "COMBINADA" && d01.nce_motivo_codigo === 1, JSON.stringify({ modo: d01.nce_modo, motivo: d01.nce_motivo_codigo, items: d01.items?.map((i) => [i.codigo, i.linea_factura, i.origen_nc, i.subtotal]) }));
        const saldo = (await api(page, "GET", `/facturas/${idCa01}/nota-credito/saldo`)).json;
        check("CA-01: saldo 128.350 despues de la nota", saldo?.monto?.saldo === 128350, JSON.stringify(saldo?.monto));
        check(
          "CA-06: saldo por linea (devuelto 1 del item 1; 3.150 acreditados del item 2)",
          saldo?.lineas?.[0]?.cantidad_acreditada === 1 && saldo?.lineas?.[0]?.importe_acreditado === 75000 && saldo?.lineas?.[1]?.importe_acreditado === 3150 && saldo?.lineas?.[1]?.cantidad_acreditada === 0,
          JSON.stringify(saldo?.lineas?.map((l) => [l.line_no, l.cantidad_acreditada, l.importe_acreditado, l.saldo_importe]))
        );
        await elegirFactura(page, CA01);
        const grilla = await plano(page.locator("table.nc-lineas-editor tbody"));
        check("CA-06: la grilla muestra lo ya acreditado", /75\.000/.test(grilla) && /3\.150/.test(grilla), grilla);
        await foto(page, "1440-ca06-saldo");
      }
      if (notaCa02?.id) {
        const d02 = await esperarAprobada(page, notaCa02.id, "CA-02");
        check("CA-02: guardada como total", d02?.nce_modo === "TOTAL" || d02?.nce_modo === null, `modo ${d02?.nce_modo}`);
      }
      if (notaCa05?.id) await esperarAprobada(page, notaCa05.id, "CA-05");
    }
    await ctx.close();
  } catch (error) {
    check("Ejecucion sin excepciones", false, error?.stack ?? String(error));
  } finally {
    await browser.close();
    const resumen = { fecha: new Date().toISOString(), base, sin_emitir: SIN_EMITIR, facturas: { CA01, CA02, CA05, USD }, ok: resultados.filter((r) => r.ok).length, total: resultados.length, resultados, emitidas };
    fs.writeFileSync(path.join(outDir, "resultado.json"), JSON.stringify(resumen, null, 2));
    console.log(`\n${resumen.ok}/${resumen.total} verificaciones OK`);
    process.exit(resumen.ok === resumen.total ? 0 : 1);
  }
})();
