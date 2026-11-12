#!/usr/bin/env node
// Descuentos en la factura (SPEC_DESCUENTOS_FACTURA_v0.1, TASKS DES-008 a DES-011).
//
//   ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/segel-fs/playwright-descuentos.cjs [caso ...]
//
// Casos: grilla (CA-07, 1440 y 1280), simple (CA-08, 390), validacion (CA-03 en pantalla), desglose (CA-12 y CA-14,
// 1440/1280/390: fila unica "Descuento (x %)" y controles ocultos por defecto con Agregar/Ocultar/Quitar; RN-18c, RN-24). Sin emitir.
// sifen (CA-10): EMITE en SIFEN test una factura PYG con descuento por linea y un global que no divide exacto
// (avisar a FE antes) y compara los totales oficiales de FE. Variables: SEGEL_APP_URL, ENSAYO_USER, ENSAYO_RUC.
// Prueba fina antes del despliegue (TASKS DES-013 a DES-016, 2026-11-12), tambien EMITEN en SIFEN test:
//   sifen-usd (CA-10b): factura USD con el vector USD de FE; sifen-mix (DES-014): (a) % por linea con una exenta,
//   (b) solo global con IVA 10 y 5; sifen-nc (DES-015): nota de credito TOTAL sobre la ultima factura aprobada en la
//   corrida o la de ENSAYO_NC_FACTURA (numero). En cada emision se compara FS con los totales oficiales de FE y se
//   lee el KUDE con pdftotext (DES-016). Escribe test-results/descuentos/.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
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
const SIFEN_CASOS = ["sifen", "sifen-usd", "sifen-mix", "sifen-nc", "verificar"];
const corre = (caso) => (pedidos.length === 0 ? !SIFEN_CASOS.includes(caso) : pedidos.includes(caso));
const emitidas = [];

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

// En modo completo la tarjeta fija trae todo; en modo simple "Total a pagar" vive en el pie fijo (.pie-crear).
const mostrarDescuentos = (page) => page.getByRole("button", { name: "Agregar descuento" }).click();
const totalesTexto = async (page) => (await page.locator(".totals-section, .pie-crear").allInnerTexts()).join(" ").replace(/\s+/g, " ");

// Llamadas a la API con la sesion del navegador.
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

const conmutador = (page) => page.locator("table.grilla-lineas thead").getByRole("group", { name: "Descuento en porcentaje o monto" });

/** Emite la factura cargada en la grilla, guarda los totales de FS, espera la aprobacion y los totales de FE. */
async function emitirYEsperar(page, etiqueta, totalEsperado) {
  const crear = page.getByRole("button", { name: "Crear factura" });
  await page.waitForFunction((b) => b && !b.disabled, await crear.elementHandle(), { timeout: 20000 });
  await crear.click();
  const conf = page.getByRole("button", { name: /^Confirmar/ });
  if (await conf.isVisible({ timeout: 3000 }).catch(() => false)) await conf.click();
  await page.getByRole("button", { name: "Crear nueva factura" }).waitFor({ timeout: 60000 });
  let t = await texto(page);
  // En lote el numero llega con la aprobacion: la factura recien creada se ubica por su total (la mas nueva).
  const lista = await api(page, "GET", "/facturas?tipo=FACTURA&limit=10&offset=0");
  const doc = (lista.json?.items ?? []).find((d) => Math.abs(Number(d.totals?.total) - totalEsperado) < 0.005) ?? null;
  const totalsFs = doc ? ((await api(page, "GET", `/facturas/${doc.id}`)).json?.totals ?? null) : null;
  const inicio = Date.now();
  let aprobada = false;
  let estado = "";
  while (!aprobada && Date.now() - inicio < ESPERA_APROBACION_MS) {
    aprobada = (await page.locator(".paso.hecho").count()) >= 4;
    estado = (await page.locator(".resultado-emision [data-estado]").first().getAttribute("data-estado").catch(() => "")) ?? "";
    if (["RECHAZADA", "ERROR_OPERATIVO", "ERROR_TEMPORAL"].includes(estado)) break;
    if (!aprobada) await page.waitForTimeout(20000);
  }
  aprobada = aprobada || (await page.locator(".paso.hecho").count()) >= 4;
  t = await texto(page);
  let numero = (t.match(/Factura (\d[\d-]{5,})/) ?? [])[1] ?? null;
  let totalsFe = null;
  if (aprobada && doc) {
    const fin = Date.now() + 3 * 60 * 1000;
    while (Date.now() < fin) {
      const d = (await api(page, "GET", `/facturas/${doc.id}`)).json;
      if (d?.totals?.fuente === "FE") {
        totalsFe = d.totals;
        numero = d.numero_fiscal ?? numero;
        break;
      }
      await page.waitForTimeout(10000);
    }
  }
  const kude = page.locator('a[href$="kude.pdf"]').first();
  const kudeUrl = (await kude.count()) ? await kude.getAttribute("href") : null;
  await page.screenshot({ path: path.join(outDir, `${etiqueta}.png`), fullPage: true });
  const r = { etiqueta, numero, aprobada, estado, id: doc?.id ?? null, totalsFs, totalsFe, kudeUrl, texto: t };
  emitidas.push(r);
  fs.writeFileSync(path.join(outDir, `${etiqueta}.json`), JSON.stringify({ ...r, texto: t.slice(0, 600) }, null, 2));
  return r;
}

/** FS (vista previa) contra FE (`/totales`, guardados con fuente FE); en PYG el total de FS es el de FE mas el redondeo. */
function compararFeFs(etiqueta, r, esperado) {
  check(`${etiqueta}: aprobada en SIFEN test (${r.numero ?? "sin numero"})`, r.aprobada, r.texto.slice(0, 200));
  check(`${etiqueta}: FS guardo los totales oficiales de FE`, Boolean(r.totalsFe), JSON.stringify(r.totalsFe));
  const fe = r.totalsFe;
  const fsT = r.totalsFs;
  if (!fe || !fsT) return;
  const filas = [
    ["bruto", fsT.subtotal, fe.subtotal],
    ["descuento", fsT.descuento ?? 0, fe.descuento ?? 0],
    ["iva_10", fsT.iva_10, fe.iva_10],
    ["iva_5", fsT.iva_5, fe.iva_5],
    ["total_iva", fsT.total_iva, fe.total_iva],
    ["total", fsT.total, Number(fe.total) + Number(fe.redondeo ?? 0)]
  ];
  for (const [campo, a, b] of filas) check(`${etiqueta}: ${campo} FS ${a} = FE ${b}`, Math.abs(Number(a) - Number(b)) < 0.005, "");
  for (const [campo, v] of Object.entries(esperado)) check(`${etiqueta}: FE ${campo} = ${v}`, Math.abs(Number(fe[campo] ?? 0) - v) < 0.005, String(fe[campo]));
}

/** DES-016: el KUDE publico menciona el descuento y los montos esperados. */
async function kudeConDescuento(page, r, montos) {
  if (!r.kudeUrl) {
    check(`${r.etiqueta} KUDE: enlace disponible`, false, "sin enlace kude.pdf en el resultado");
    return;
  }
  const url = new URL(r.kudeUrl, base).toString();
  const resp = await page.request.get(url);
  check(`${r.etiqueta} KUDE: se descarga (${resp.status()})`, resp.ok(), url);
  if (!resp.ok()) return;
  const pdf = path.join(outDir, `${r.etiqueta}-kude.pdf`);
  fs.writeFileSync(pdf, await resp.body());
  let txt = "";
  try {
    txt = execFileSync("pdftotext", ["-layout", pdf, "-"], { encoding: "utf8" });
  } catch (e) {
    check(`${r.etiqueta} KUDE: pdftotext`, false, e.message);
    return;
  }
  fs.writeFileSync(path.join(outDir, `${r.etiqueta}-kude.txt`), txt);
  const plano = txt.replace(/\s+/g, " ");
  check(`${r.etiqueta} KUDE: tiene la columna Descuento`, /descuento/i.test(plano), (plano.match(/.{0,60}descuento.{0,60}/i) ?? [""])[0]);
  // El KUDE de FE imprime el descuento por unidad en cada item y el total de la operacion neto; el global se prorratea
  // en los montos de los items y no aparece como linea propia (DES-016, hallazgo del 2026-11-12).
  for (const m of montos) check(`${r.etiqueta} KUDE: muestra ${m}`, plano.includes(m), (plano.match(new RegExp(`.{0,40}${m.replace(/[.]/g, "\\\\.")}.{0,40}`)) ?? [""])[0]);
}

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
      await mostrarDescuentos(page);
      const cabecera = await page.locator("table.grilla-lineas thead").innerText();
      check(`CA-07 ${ancho}: columna Descuento con conmutador % y Gs.`, /descuento/i.test(cabecera) && (await page.locator("table.grilla-lineas thead [role=group]").count()) === 1);
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
      // RN-18c: una sola fila con el porcentaje sobre el bruto (50.000 / 250.000).
      check(`CA-07 ${ancho}: fila "Descuento (20 %) − Gs. 50.000"`, /Descuento \(20 %\)\s*− Gs\.? ?50\.000/.test(t), t);
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
    await mostrarDescuentos(page);
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
    check("CA-08 390: totales con la fila Descuento (15 %) − Gs. 15.000", /Descuento \(15 %\)\s*− Gs\.? ?15\.000/.test(t), t.slice(-500));
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

// CA-12 (RN-18c) y CA-14 (RN-24): fila unica "Descuento (x %)" y controles ocultos por defecto. 2 x 100.000 y 1 x 50.000 (IVA 10 %).
async function casoDesglose(browser) {
  for (const [ancho, alto, modo] of [
    [1440, 900, "completo"],
    [1280, 800, "completo"],
    [390, 844, "simple"]
  ]) {
    const { ctx, page } = await entrar(browser, ancho, alto, modo);
    const pref = `CA-12 ${ancho}`;
    const boton = (nombre) => page.getByRole("button", { name: nombre });
    const controlesVisibles = async () => {
      const global = await page.getByLabel(/Descuento sobre el total/).count();
      if (modo === "completo") return global === 1 && (await page.locator("table.grilla-lineas th.col-descuento").count()) === 1;
      return global === 1;
    };
    const controlesOcultos = async () => {
      const global = await page.getByLabel(/Descuento sobre el total/).count();
      if (modo === "completo") return global === 0 && (await page.locator("table.grilla-lineas th.col-descuento").count()) === 0;
      return global === 0;
    };
    const sinFilas = (t) => !/Descuento/.test(t);
    try {
      await abrirVista(page, "Nueva factura");
      await cliente(page);
      if (modo === "completo") {
        await page.locator("table.grilla-lineas").waitFor();
        await fila(page, 0, { descripcion: "Zapatillas DES", cantidad: "2", precio: "100000" });
        await fila(page, 1, { descripcion: "Medias DES", cantidad: "1", precio: "50000" });
      } else {
        for (const [descripcion, cantidad, precio] of [["Zapatillas DES", "2", "100000"], ["Medias DES", "1", "50000"]]) {
          await page.getByRole("button", { name: /Agregar (producto|el primer)/ }).first().click();
          const hoja = page.locator(".line-sheet, [role=dialog]").first();
          await hoja.waitFor();
          await hoja.getByLabel(/^Descripción|Producto o servicio/).first().fill(descripcion);
          await hoja.getByLabel(/^Cantidad/).first().fill(cantidad).catch(() => undefined);
          await hoja.getByLabel(/^Precio/).fill(precio);
          if (descripcion === "Zapatillas DES") check(`CA-14 ${ancho}: la hoja de la linea no muestra Descuento por defecto`, (await hoja.getByLabel("Descuento de la línea").count()) === 0);
          await hoja.getByRole("button", { name: "AGREGAR Y NO GUARDAR" }).click().catch(() => undefined);
          await page.waitForTimeout(400);
        }
      }
      const espera = () => page.waitForTimeout(2200);
      // CA-14: ocultos por defecto; Agregar muestra, Ocultar esconde.
      check(`CA-14 ${ancho}: controles ocultos por defecto y boton "Agregar descuento"`, (await controlesOcultos()) && (await boton("Agregar descuento").count()) === 1);
      await espera();
      let t = await totalesTexto(page);
      check(`${pref} (d): sin descuentos no hay fila Descuento`, sinFilas(t) && /Total a pagar\s*Gs\.? ?250\.000/.test(t), t);
      await boton("Agregar descuento").click();
      await page.waitForTimeout(300);
      check(`CA-14 ${ancho}: Agregar muestra los controles y el boton pasa a "Ocultar descuentos"`, (await controlesVisibles()) && (await boton("Ocultar descuentos").count()) === 1);
      await boton("Ocultar descuentos").click();
      await page.waitForTimeout(300);
      check(`CA-14 ${ancho}: Ocultar los esconde de nuevo`, (await controlesOcultos()) && (await boton("Agregar descuento").count()) === 1);
      await boton("Agregar descuento").click();
      await page.waitForTimeout(300);
      // (b) solo global 30.000 sobre 250.000 = 12 %.
      await page.getByLabel(/Descuento sobre el total/).fill("30000");
      await espera();
      t = await totalesTexto(page);
      check(`${pref} (b): solo global: "Descuento (12 %) − Gs. 30.000"`, /Descuento \(12 %\)\s*− Gs\.? ?30\.000/.test(t), t);
      check(`${pref} (b): Total a pagar Gs. 220.000`, /Total a pagar\s*Gs\.? ?220\.000/.test(t), t);
      check(`CA-14 ${ancho}: con descuento cargado el boton dice "Quitar descuentos"`, (await boton("Quitar descuentos").count()) === 1);
      // (a) solo linea: 10 % en la linea 1 (20.000 sobre 250.000 = 8 %).
      await page.getByLabel(/Descuento sobre el total/).fill("");
      if (modo === "completo") {
        await page.locator('[data-grilla-fila="0"]').getByLabel(/^Descuento, línea/).fill("10");
      } else {
        await page.getByRole("button", { name: "Editar producto 1" }).click();
        const hoja = page.locator(".line-sheet, [role=dialog]").first();
        await hoja.waitFor();
        await hoja.getByLabel("Descuento de la línea").fill("10");
        await hoja.getByRole("button", { name: "Cerrar" }).first().click().catch(() => undefined);
      }
      await espera();
      t = await totalesTexto(page);
      check(`${pref} (a): solo línea: "Descuento (8 %) − Gs. 20.000"`, /Descuento \(8 %\)\s*− Gs\.? ?20\.000/.test(t), t);
      check(`${pref} (a): Total a pagar Gs. 230.000`, /Total a pagar\s*Gs\.? ?230\.000/.test(t), t);
      // (c) los dos: 20.000 + 30.000 = 50.000 (20 %), una sola fila.
      await page.getByLabel(/Descuento sobre el total/).fill("30000");
      await espera();
      t = await totalesTexto(page);
      check(`${pref} (c): una sola fila "Descuento (20 %) − Gs. 50.000"`, /Descuento \(20 %\)\s*− Gs\.? ?50\.000/.test(t) && (t.match(/Descuento/g) ?? []).length === 1, t);
      check(`${pref} (c): sin "por línea", "sobre el total" ni "Total descuentos" en los totales`, !/por línea|Total descuentos/.test(t) && !/Descuento sobre el total\s*−/.test(t), t);
      check(`${pref} (c): Total a pagar Gs. 200.000`, /Total a pagar\s*Gs\.? ?200\.000/.test(t), t);
      check(`${pref} (c): el campo sobre el total sigue habilitado con descuentos de línea (RN-23)`, await page.getByLabel(/Descuento sobre el total/).isEnabled());
      check(`${pref}: sin desplazamiento horizontal`, await sinDesborde(page));
      check(`${pref}: sin emojis`, !EMOJI.test(await texto(page)));
      await page.screenshot({ path: path.join(outDir, `${ancho}-desglose.png`), fullPage: true });
      // CA-14: Quitar descuentos borra todo y oculta.
      await boton("Quitar descuentos").click();
      await espera();
      t = await totalesTexto(page);
      check(`CA-14 ${ancho}: Quitar descuentos vuelve a 250.000 sin fila y oculta los controles`, sinFilas(t) && /Total a pagar\s*Gs\.? ?250\.000/.test(t) && (await controlesOcultos()) && (await boton("Agregar descuento").count()) === 1, t);
    } catch (e) {
      check(`${pref}: sin excepciones`, false, e.message);
      await page.screenshot({ path: path.join(outDir, `${ancho}-desglose-error.png`), fullPage: true }).catch(() => undefined);
    } finally {
      await ctx.close();
    }
  }
}

// CA-03 en pantalla: global que deja una linea sin precio (error de la API junto al campo) y decimales en Gs.
async function casoValidacion(browser) {
  const { ctx, page } = await entrar(browser, 1440, 900, "completo");
  try {
    await abrirVista(page, "Nueva factura");
    await page.locator("table.grilla-lineas").waitFor();
    await mostrarDescuentos(page);
    await cliente(page);
    await fila(page, 0, { descripcion: "Linea DES", cantidad: "1", precio: "50000" });
    await page.getByLabel(/Descuento sobre el total/).fill("60000");
    await page.waitForTimeout(2200);
    const t = await texto(page);
    check("CA-03 (c): el global mayor que el bruto muestra el mensaje de la API", /deja la línea 1 sin precio/.test(t), t.slice(-300));
    check("CA-03 (c): y Crear factura queda bloqueado", await page.getByRole("button", { name: "Crear factura" }).isDisabled());
    await page.locator("table.grilla-lineas thead").getByRole("group", { name: "Descuento en porcentaje o monto" }).getByRole("button", { name: "Porcentaje" }).click();
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
    await mostrarDescuentos(page);
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

// CA-10b (DES-013): USD con el vector USD de FE (3 x 19,99 con 1,11; 7 x 4,37 IVA 5; global 5,55; TC 6.181,34).
async function casoSifenUsd(browser) {
  const { ctx, page } = await entrar(browser, 1440, 900, "completo");
  try {
    await abrirVista(page, "Nueva factura");
    await page.locator("table.grilla-lineas").waitFor();
    await mostrarDescuentos(page);
    await page.locator('select[aria-label="Moneda"]').selectOption("USD");
    await page.getByLabel("Tipo de cambio").fill("6181,34");
    await cliente(page);
    await conmutador(page).getByRole("button", { name: "USD" }).click();
    await fila(page, 0, { descripcion: "Articulo A USD DES", cantidad: "3", precio: "19,99", descuento: "1,11" });
    const f1 = await fila(page, 1, { descripcion: "Articulo B USD DES", cantidad: "7", precio: "4,37" });
    await f1.getByLabel(/^IVA, línea/).selectOption("IVA_5");
    await page.getByLabel(/Descuento sobre el total/).fill("5,55");
    await page.waitForTimeout(2500);
    const previa = await totalesTexto(page);
    check("CA-10b: vista previa USD con total 81,68 y descuento 8,88", /81,68/.test(previa) && /8,88/.test(previa), previa);
    const r = await emitirYEsperar(page, "sifen-usd", 81.68);
    compararFeFs("CA-10b USD", r, { descuento: 8.88, total: 81.68, iva_10: 4.81, iva_5: 1.37 });
    check("CA-10b: el resultado muestra la fila Descuento con 8,88", /Descuento/i.test(r.texto) && /8,88/.test(r.texto), r.texto.slice(0, 400));
    await kudeConDescuento(page, r, ["1,11", "52,96", "28,72", "81,68"]);
  } catch (e) {
    check("sifen-usd: sin excepciones", false, e.message);
    await page.screenshot({ path: path.join(outDir, "sifen-usd-error.png"), fullPage: true }).catch(() => undefined);
  } finally {
    await ctx.close();
  }
}

// DES-014: (a) porcentaje por linea con una linea exenta, sin global; (b) solo global sobre IVA 10 y 5.
async function casoSifenMix(browser) {
  const { ctx, page } = await entrar(browser, 1440, 900, "completo");
  try {
    await abrirVista(page, "Nueva factura");
    await page.locator("table.grilla-lineas").waitFor();
    await mostrarDescuentos(page);
    await cliente(page);
    await conmutador(page).getByRole("button", { name: "Porcentaje" }).click();
    await fila(page, 0, { descripcion: "Mix A IVA 10 DES", cantidad: "2", precio: "100000", descuento: "10" });
    const f1 = await fila(page, 1, { descripcion: "Mix B exenta DES", cantidad: "1", precio: "30000", descuento: "5" });
    await f1.getByLabel(/^IVA, línea/).selectOption("EXENTA");
    await page.waitForTimeout(2500);
    let previa = await totalesTexto(page);
    check("DES-014a: vista previa con descuento 21.500 y total 208.500", /21\.500/.test(previa) && /208\.500/.test(previa), previa);
    const ra = await emitirYEsperar(page, "sifen-mix-a", 208500);
    compararFeFs("DES-014a PYG % por linea con exenta", ra, { descuento: 21500 });
    await kudeConDescuento(page, ra, ["10.000", "1.500", "180.000", "28.500", "208.500"]);

    await page.getByRole("button", { name: "Crear nueva factura" }).click();
    await page.locator("table.grilla-lineas").waitFor();
    await cliente(page);
    await fila(page, 0, { descripcion: "Mix C IVA 10 DES", cantidad: "3", precio: "50000" });
    const f3 = await fila(page, 1, { descripcion: "Mix D IVA 5 DES", cantidad: "4", precio: "25000" });
    await f3.getByLabel(/^IVA, línea/).selectOption("IVA_5");
    await page.getByLabel(/Descuento sobre el total/).fill("7777");
    await page.waitForTimeout(2500);
    previa = await totalesTexto(page);
    check("DES-014b: vista previa con descuento 7.777 y total 242.223", /7\.777/.test(previa) && /242\.223/.test(previa), previa);
    const rb = await emitirYEsperar(page, "sifen-mix-b", 242223);
    compararFeFs("DES-014b PYG solo global", rb, { descuento: 7777 });
    await kudeConDescuento(page, rb, ["145.334", "96.889", "242.200"]);
  } catch (e) {
    check("sifen-mix: sin excepciones", false, e.message);
    await page.screenshot({ path: path.join(outDir, "sifen-mix-error.png"), fullPage: true }).catch(() => undefined);
  } finally {
    await ctx.close();
  }
}

// verificar: sin emitir, toma las facturas de ENSAYO_VERIFICAR (numeros separados por coma) y compara sus totales
// FS/FE guardados; util para re-leer una corrida anterior.
async function casoVerificar(browser) {
  const numeros = (process.env.ENSAYO_VERIFICAR ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!numeros.length) return;
  const { ctx, page } = await entrar(browser, 1440, 900, "completo");
  try {
    const lista = await api(page, "GET", "/facturas?tipo=FACTURA&limit=50&offset=0");
    for (const n of numeros) {
      const d = (lista.json?.items ?? []).find((x) => x.numero_fiscal === n);
      check(`verificar ${n}: factura aprobada con totales de FE`, d?.estado === "EMITIDA" && d?.totals?.fuente === "FE", JSON.stringify(d?.totals));
      if (d) fs.writeFileSync(path.join(outDir, `verificar-${n}.json`), JSON.stringify(d, null, 2));
    }
    // CA-13 (RN-19b): la ficha de Documentos muestra el desglose con los totales oficiales de FE.
    const esperadas = {};
    try {
      esperadas[process.env.ENSAYO_FICHA_SOLO_GLOBAL ?? "1010645"] = { si: ["Descuento (3,1 %)", "7.777"], no: ["Descuento por línea", "Descuento sobre el total", "Total descuentos"] };
      esperadas[process.env.ENSAYO_FICHA_AMBOS ?? "1010644"] = { si: ["Descuento (9,8 %)", "8,88"], no: ["Descuento por línea", "Descuento sobre el total", "Total descuentos"] };
    } catch {}
    for (const [n, esp] of Object.entries(esperadas)) {
      if (!numeros.includes(n)) continue;
      await abrirVista(page, "Documentos");
      await page.getByRole("heading", { name: "Facturas y notas" }).waitFor();
      await page.getByPlaceholder("Buscar factura...").fill(n);
      await page.waitForTimeout(1500);
      const filaDoc = page.locator("table.documents-tabla tbody tr").filter({ hasText: n }).first();
      await filaDoc.waitFor({ timeout: 20000 });
      await filaDoc.click();
      await page.locator(".document-detail").waitFor({ timeout: 20000 });
      await page.waitForTimeout(800);
      const ficha = (await page.locator(".document-detail").innerText()).replace(/\s+/g, " ");
      check(`CA-13 ficha ${n}: muestra ${esp.si.join(" / ")}`, esp.si.every((s) => ficha.includes(s)), ficha.slice(0, 600));
      check(`CA-13 ficha ${n}: no muestra ${esp.no.join(" / ") || "(nada que excluir)"}`, esp.no.every((s) => !ficha.includes(s)), "");
      await page.screenshot({ path: path.join(outDir, `ficha-${n}.png`), fullPage: true });
    }
  } finally {
    await ctx.close();
  }
}

// DES-015: nota de credito TOTAL sobre una factura con descuento aprobada; la ventana no ofrece la parcial (RN-09).
async function casoSifenNc(browser) {
  const objetivo = process.env.ENSAYO_NC_FACTURA ?? emitidas.filter((e) => e.aprobada).at(-1)?.numero;
  if (!objetivo) {
    check("DES-015: hay una factura con descuento aprobada (ENSAYO_NC_FACTURA o una de esta corrida)", false, "");
    return;
  }
  const { ctx, page } = await entrar(browser, 1440, 900, "completo");
  try {
    const lista = await api(page, "GET", "/facturas?tipo=FACTURA&limit=50&offset=0");
    const doc = (lista.json?.items ?? []).find((d) => d.numero_fiscal === objetivo) ?? null;
    check(`DES-015: factura ${objetivo} aprobada y con nota_credito_por_referencia`, doc?.estado === "EMITIDA" && doc?.totals?.nota_credito_por_referencia === true, JSON.stringify(doc?.totals));
    await abrirVista(page, "Documentos");
    await page.locator("table.documents-tabla").waitFor();
    await page.locator("table.documents-tabla tbody tr", { hasText: objetivo }).first().locator("td").nth(2).click();
    await page.getByRole("button", { name: /Volver a resultados/ }).waitFor({ timeout: 20000 });
    const boton = page.getByRole("button", { name: /Crear nota de crédito/ }).first();
    await page.waitForFunction((b) => b && !b.disabled, await boton.elementHandle(), { timeout: 20000 });
    await boton.click();
    const grupo = page.getByRole("group", { name: "Tipo de nota de crédito" });
    await grupo.waitFor({ timeout: 15000 });
    const parcial = grupo.getByRole("button", { name: "Parcial" });
    const total = grupo.getByRole("button", { name: "Total" });
    check("DES-015: la ventana solo admite la nota total (Parcial deshabilitada)", (await parcial.isDisabled()) && !(await total.isDisabled()), await page.locator(".modal-panel").innerText().then((x) => x.replace(/\s+/g, " ").slice(0, 300)));
    await total.click();
    await page.screenshot({ path: path.join(outDir, "sifen-nc-ventana.png"), fullPage: true });
    await page.locator(".modal-panel textarea").fill("Prueba DES-015: nota total sobre factura con descuento");
    await page.getByRole("button", { name: "Confirmar" }).click();
    const popup = page.locator('section[aria-labelledby="nc-success-title"]');
    const ok = await popup.waitFor({ timeout: 90000 }).then(() => true, () => false);
    const txt = (ok ? await popup.innerText() : await page.locator(".modal-panel").innerText().catch(() => "")).replace(/\s+/g, " ");
    check("DES-015: la nota de credito total se creo", ok, txt.slice(0, 300));
    await page.screenshot({ path: path.join(outDir, "sifen-nc-resultado.png"), fullPage: true });
    const ncs = await api(page, "GET", "/facturas?tipo=NOTA_CREDITO&limit=5&offset=0");
    let nc = (ncs.json?.items ?? []).find((n) => n.referencia?.numero_fiscal === objetivo || n.factura_referencia?.numero_fiscal === objetivo) ?? (ncs.json?.items ?? [])[0] ?? null;
    const fin = Date.now() + ESPERA_APROBACION_MS;
    while (nc && Date.now() < fin && !["EMITIDA", "RECHAZADA", "ERROR_OPERATIVO", "ERROR_TEMPORAL"].includes(nc.estado)) {
      await page.waitForTimeout(20000);
      nc = (await api(page, "GET", `/facturas/${nc.id}`)).json ?? nc;
    }
    check(`DES-015: nota ${nc?.numero_fiscal ?? "?"} aprobada en SIFEN test`, nc?.estado === "EMITIDA", nc?.estado ?? "sin nota");
    check("DES-015: el total de la nota es el total de la factura", nc && doc && Math.abs(Number(nc.totals?.total) - Number(doc.totals?.total)) < 0.005, `${nc?.totals?.total} vs ${doc?.totals?.total}`);
    fs.writeFileSync(path.join(outDir, "sifen-nc.json"), JSON.stringify({ factura: doc, nota: nc }, null, 2));
  } catch (e) {
    check("sifen-nc: sin excepciones", false, e.message);
    await page.screenshot({ path: path.join(outDir, "sifen-nc-error.png"), fullPage: true }).catch(() => undefined);
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
    if (corre("desglose")) await casoDesglose(browser);
    const enSifen = [];
    if (corre("sifen")) enSifen.push(casoSifen(browser));
    if (corre("sifen-usd")) enSifen.push(casoSifenUsd(browser));
    if (corre("sifen-mix")) enSifen.push(casoSifenMix(browser));
    await Promise.all(enSifen);
    if (pedidos.includes("verificar")) await casoVerificar(browser);
    if (corre("sifen-nc")) await casoSifenNc(browser);
  } finally {
    await browser.close();
  }
  const fallas = resultados.filter((r) => !r.ok).length;
  fs.writeFileSync(path.join(outDir, "resultado.json"), JSON.stringify(resultados, null, 2));
  console.log(`\n${resultados.length - fallas}/${resultados.length} OK`);
  process.exit(fallas ? 1 : 0);
})();
