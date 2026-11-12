#!/usr/bin/env node
// Plazo de credito escrito por el operador (SPEC_PLAZO_CREDITO_v0.1, TASKS PLZ-006 a PLZ-008).
//
//   ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/segel-fs/playwright-plazo-credito.cjs [caso ...]
//
// Casos: pantalla (CA-01 a CA-04 y CA-06 en 1440 y 1280, modo completo, y 390, modo simple). Sin emitir.
// sifen (CA-05): EMITE en SIFEN test facturas a credito con 5, 35, 120 y 365 dias (avisar a FE antes),
// espera la aprobacion y busca "<N> dias" en el KUDE. Variables: SEGEL_APP_URL, ENSAYO_USER, ENSAYO_RUC,
// ENSAYO_PLAZOS (por defecto 5,35,120,365). Escribe test-results/plazo-credito/.
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
const PLAZOS = (process.env.ENSAYO_PLAZOS ?? "5,35,120,365").split(",").map(Number);
const ESPERA_APROBACION_MS = Number(process.env.ENSAYO_ESPERA_MS ?? 25 * 60 * 1000);
const outDir = path.join(process.cwd(), "test-results", "plazo-credito");
fs.mkdirSync(outDir, { recursive: true });
const pedidos = process.argv.slice(2);
const corre = (caso) => (pedidos.length === 0 ? caso === "pantalla" : pedidos.includes(caso));

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
  page.on("request", (r) => {
    const a = r.headers()["authorization"];
    if (a) page.__token = a;
    if (r.method() === "POST" && /\/facturas\/preview$/.test(r.url())) {
      try {
        page.__ultimaPrevia = JSON.parse(r.postData() ?? "{}");
      } catch {}
    }
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

async function lineaGrilla(page, descripcion, precio) {
  const f = page.locator('[data-grilla-fila="0"]');
  await f.locator('input[data-celda="descripcion"]').fill(descripcion);
  await page.keyboard.press("Escape").catch(() => undefined);
  await f.getByLabel(/^Cantidad, línea/).fill("1");
  await f.getByLabel(/^Precio, línea/).fill(precio);
}

async function lineaSimple(page, descripcion, precio) {
  await page.getByRole("button", { name: /Agregar (producto|el primer)/ }).first().click();
  const hoja = page.locator(".line-sheet, [role=dialog]").first();
  await hoja.waitFor();
  await hoja.getByLabel(/^Descripción|Producto o servicio/).first().fill(descripcion);
  await hoja.getByLabel(/^Precio/).fill(precio);
  await hoja.getByRole("button", { name: /agregar y no guardar/i }).first().click();
  await hoja.waitFor({ state: "hidden" });
  await page.waitForTimeout(400);
}

const credito = (page) => page.getByRole("group", { name: "Condición de venta" }).getByRole("button", { name: "Crédito" });
const contado = (page) => page.getByRole("group", { name: "Condición de venta" }).getByRole("button", { name: "Contado" });
const campo = (page) => page.getByLabel("Plazo en días");
const sumar = (page) => page.getByRole("button", { name: "Sumar 5 días" });
const restar = (page) => page.getByRole("button", { name: "Restar 5 días" });

/** Espera a que la vista previa salga con el plazo esperado (o sin plazo con null). */
async function previaCon(page, esperado) {
  const fin = Date.now() + 6000;
  while (Date.now() < fin) {
    const p = page.__ultimaPrevia;
    if (p && (p.credito_plazo_dias ?? null) === esperado) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

async function casoPantalla(browser, ancho, alto, modo) {
  const { ctx, page } = await entrar(browser, ancho, alto, modo);
  const tag = `${ancho}`;
  try {
    await abrirVista(page, "Nueva factura");
    await page.getByPlaceholder("Ingresá el número de documento").waitFor();
    await cliente(page);
    if (modo === "completo") await lineaGrilla(page, "Servicio plazo PLZ", "100000");
    else await lineaSimple(page, "Servicio plazo PLZ", "100000");

    if (modo === "completo") {
      check(`CA-06 ${tag}: con Contado el plazo se ve deshabilitado`, await campo(page).isDisabled());
    } else {
      check(`RN-06 ${tag}: con Contado el plazo no se muestra (modo simple)`, (await campo(page).count()) === 0);
    }
    check(`CA-04 ${tag}: con Contado la vista previa no lleva plazo`, await previaCon(page, null), JSON.stringify(page.__ultimaPrevia?.credito_plazo_dias));

    await credito(page).click();
    check(`CA-01 ${tag}: al elegir Credito el plazo dice 30`, (await campo(page).inputValue()) === "30", await campo(page).inputValue());
    check(`CA-04 ${tag}: la vista previa lleva 30`, await previaCon(page, 30), JSON.stringify(page.__ultimaPrevia?.credito_plazo_dias));
    await page.screenshot({ path: path.join(outDir, `${tag}-credito-30.png`), fullPage: false });

    await sumar(page).click();
    check(`CA-02 ${tag}: sumar 30 -> 35`, (await campo(page).inputValue()) === "35");
    await restar(page).click();
    await restar(page).click();
    check(`CA-02 ${tag}: restar 35 -> 30 -> 25`, (await campo(page).inputValue()) === "25");
    check(`CA-04 ${tag}: la vista previa lleva 25`, await previaCon(page, 25));

    await campo(page).fill("3");
    await restar(page).click();
    check(`CA-02 ${tag}: desde 3 restar deja 1`, (await campo(page).inputValue()) === "1");
    check(`CA-02 ${tag}: en 1 el boton restar queda deshabilitado`, await restar(page).isDisabled());
    await campo(page).fill("362");
    await sumar(page).click();
    check(`CA-02 ${tag}: desde 362 sumar deja 365`, (await campo(page).inputValue()) === "365");
    check(`CA-02 ${tag}: en 365 el boton sumar queda deshabilitado`, await sumar(page).isDisabled());

    await campo(page).fill("120");
    check(`CA-03 ${tag}: escribir 120 deja 120`, (await campo(page).inputValue()) === "120");
    check(`CA-04 ${tag}: la vista previa lleva 120`, await previaCon(page, 120));
    await campo(page).fill("");
    await campo(page).pressSequentially("12a0");
    check(`CA-03 ${tag}: "12a0" queda 120`, (await campo(page).inputValue()) === "120", await campo(page).inputValue());

    const crear = page.getByRole("button", { name: "Crear factura" });
    for (const malo of ["", "0", "400"]) {
      await campo(page).fill(malo);
      await page.waitForTimeout(300);
      const t = await texto(page);
      const valor = await campo(page).inputValue();
      check(`CA-03 ${tag}: "${malo}" (queda "${valor}") muestra el error`, t.includes("Escribí un plazo de 1 a 365 días"), t.slice(-300));
      check(`CA-03 ${tag}: "${malo}" bloquea Crear factura con el motivo`, (await crear.isDisabled()) && t.includes("Plazo de crédito: escribí un plazo de 1 a 365 días"));
      check(`CA-03 ${tag}: "${malo}" marca el campo como invalido`, (await campo(page).getAttribute("aria-invalid")) === "true");
      if (malo === "400") {
        await page.screenshot({ path: path.join(outDir, `${tag}-error.png`), fullPage: false });
        if (modo === "completo") {
          const yPlazo = (await page.locator(".plazo-campo").boundingBox())?.y;
          const yServicio = (await page.locator(".banda-servicio select").boundingBox())?.y;
          check(`CA-06 ${tag}: con el error visible el plazo sigue alineado con Tipo de servicio`, Math.abs(yPlazo - yServicio) < 1, `${yPlazo} / ${yServicio}`);
        }
      }
    }

    await campo(page).fill("45");
    await contado(page).click();
    check(`RN-06 ${tag}: con Contado el error no bloquea`, !(await texto(page)).includes("Plazo de crédito:"));
    await credito(page).click();
    check(`RN-06 ${tag}: volver a Credito conserva 45`, (await campo(page).inputValue()) === "45");

    // P-A: 44 px en celular y foco visible.
    if (ancho < 720) {
      const alto44 = await sumar(page).evaluate((b) => b.getBoundingClientRect().height >= 44 && b.getBoundingClientRect().width >= 44);
      check(`P-A ${tag}: botones de 44 px en celular`, alto44);
      const fuente = await campo(page).evaluate((i) => parseFloat(getComputedStyle(i).fontSize));
      check(`P-A ${tag}: el numero tiene 16 px (sin zoom en iOS)`, fuente >= 16, String(fuente));
    } else {
      const caja = await page.locator(".plazo-campo").boundingBox();
      check(`CA-06 ${tag}: el campo tiene el alto de la banda (38 px)`, caja && Math.round(caja.height) === 38, JSON.stringify(caja));
    }
    const t = await texto(page);
    check(`CA-06 ${tag}: sin desplazamiento horizontal`, await sinDesborde(page));
    check(`CA-06 ${tag}: sin emojis`, !EMOJI.test(t));
    await page.locator(".banda-comprobante").screenshot({ path: path.join(outDir, `${tag}-banda.png`) });
  } catch (e) {
    check(`pantalla ${tag}: sin excepciones`, false, e.message);
    await page.screenshot({ path: path.join(outDir, `${tag}-error-excepcion.png`), fullPage: true }).catch(() => undefined);
  } finally {
    await ctx.close();
  }
}

async function api(page, metodo, ruta) {
  return page.evaluate(
    async ({ metodo, ruta, token }) => {
      const r = await fetch(`/api/v1${ruta}`, { method: metodo, credentials: "include", headers: { authorization: token } });
      let json = null;
      try {
        json = await r.json();
      } catch {}
      return { status: r.status, json };
    },
    { metodo, ruta, token: page.__token ?? "" }
  );
}

// CA-05: una factura por plazo; el precio distingue cada una (10.000 + dias) para ubicarla por su total.
async function casoSifen(browser) {
  const emitidas = [];
  for (const dias of PLAZOS) {
    const { ctx, page } = await entrar(browser, 1440, 900, "completo");
    const etiqueta = `sifen-${dias}`;
    try {
      await abrirVista(page, "Nueva factura");
      await page.locator("table.grilla-lineas").waitFor();
      await cliente(page);
      const total = 10000 + dias;
      await lineaGrilla(page, `Servicio a credito ${dias} dias PLZ`, String(total));
      await credito(page).click();
      await campo(page).fill(String(dias));
      check(`CA-05 ${dias}: la vista previa lleva ${dias}`, await previaCon(page, dias));
      const crear = page.getByRole("button", { name: "Crear factura" });
      await page.waitForFunction((b) => b && !b.disabled, await crear.elementHandle(), { timeout: 20000 });
      await crear.click();
      const conf = page.getByRole("button", { name: /^Confirmar/ });
      if (await conf.isVisible({ timeout: 3000 }).catch(() => false)) await conf.click();
      await page.getByRole("button", { name: "Crear nueva factura" }).waitFor({ timeout: 60000 });
      const lista = await api(page, "GET", "/facturas?tipo=FACTURA&limit=10&offset=0");
      const doc = (lista.json?.items ?? []).find((d) => Math.abs(Number(d.totals?.total) - total) < 0.005) ?? null;
      const inicio = Date.now();
      let aprobada = false;
      let estado = "";
      while (!aprobada && Date.now() - inicio < ESPERA_APROBACION_MS) {
        aprobada = (await page.locator(".paso.hecho").count()) >= 4;
        estado = (await page.locator(".resultado-emision [data-estado]").first().getAttribute("data-estado").catch(() => "")) ?? "";
        if (["RECHAZADA", "ERROR_OPERATIVO", "ERROR_TEMPORAL"].includes(estado)) break;
        if (!aprobada) await page.waitForTimeout(20000);
      }
      const d = doc ? (await api(page, "GET", `/facturas/${doc.id}`)).json : null;
      const numero = d?.numero_fiscal ?? null;
      check(`CA-05 ${dias} dias: aprobada en SIFEN test (${numero ?? "sin numero"}, ${d?.estado ?? estado})`, aprobada, d?.sifen?.mensaje ?? estado);
      let kudeOk = false;
      const kude = page.locator('a[href$="kude.pdf"]').first();
      if (aprobada && (await kude.count())) {
        const resp = await page.request.get(new URL(await kude.getAttribute("href"), base).toString());
        if (resp.ok()) {
          const pdf = path.join(outDir, `${etiqueta}-kude.pdf`);
          fs.writeFileSync(pdf, await resp.body());
          const txt = execFileSync("pdftotext", ["-layout", pdf, "-"], { encoding: "utf8" }).replace(/\s+/g, " ");
          kudeOk = new RegExp(`\\b${dias} d[ií]as\\b`, "i").test(txt);
          check(`CA-05 ${dias} dias: el KUDE dice "${dias} dias"`, kudeOk, (txt.match(/.{0,40}d[ií]as.{0,20}/i) ?? [""])[0]);
        }
      }
      await page.screenshot({ path: path.join(outDir, `${etiqueta}.png`), fullPage: true });
      emitidas.push({ dias, numero, estado: d?.estado ?? estado, document_uuid: d?.document_uuid ?? null, cdc: d?.cdc ?? null, kudeOk });
    } catch (e) {
      check(`sifen ${dias}: sin excepciones`, false, e.message);
      await page.screenshot({ path: path.join(outDir, `${etiqueta}-error.png`), fullPage: true }).catch(() => undefined);
    } finally {
      await ctx.close();
    }
  }
  fs.writeFileSync(path.join(outDir, "sifen-emitidas.json"), JSON.stringify(emitidas, null, 2));
  console.log(JSON.stringify(emitidas, null, 2));
}

(async () => {
  const browser = await chromium.launch();
  try {
    if (corre("pantalla")) {
      const anchos = (process.env.ENSAYO_ANCHOS ?? "1440,1280,390").split(",").map(Number);
      for (const a of anchos) await casoPantalla(browser, a, a < 720 ? 844 : a === 1440 ? 900 : 800, a < 720 ? "simple" : "completo");
    }
    if (corre("sifen")) await casoSifen(browser);
  } finally {
    await browser.close();
  }
  const fallas = resultados.filter((r) => !r.ok).length;
  fs.writeFileSync(path.join(outDir, "resultados.json"), JSON.stringify(resultados, null, 2));
  console.log(`\n${resultados.length - fallas}/${resultados.length} OK`);
  process.exit(fallas ? 1 : 0);
})();
