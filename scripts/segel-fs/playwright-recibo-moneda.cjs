#!/usr/bin/env node
// Recibo con moneda y perfil de emision (SPEC_RECIBO_DINERO_v0.6, TASKS RDM-008 y RDM-009). Stack local de Segel.
//
//   ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/segel-fs/playwright-recibo-moneda.cjs [caso ...]
//
// Casos: pantalla (RN-06, CA-02, CA-09 en 1440, 1280 y 390), api (CA-03, CA-04), emitir (CA-01 en USD y CA-08: crea y
// emite un recibo firmado por el FE de la pila; el recibo no es un DE de SIFEN). Sin casos: los tres.
// Caso candidato (RDM-010, FE con guia §71): perfil en la respuesta y cabecera del perfil en el PDF, recibo desde la
// factura a credito USD de RECIBO_FACTURA_ID (ya emitida; no emite facturas) y recibo EUR por la API.
// Variables: SEGEL_APP_URL, ENSAYO_USER. Escribe test-results/recibo-moneda/.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const outDir = path.join(process.cwd(), "test-results", "recibo-moneda");
fs.mkdirSync(outDir, { recursive: true });
const pedidos = process.argv.slice(2);
const corre = (caso) => (pedidos.length === 0 ? ["pantalla", "api", "emitir"].includes(caso) : pedidos.includes(caso));
const FACTURA_USD = process.env.RECIBO_FACTURA_ID ?? "";

const resultados = [];
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 300) });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 300)}` : ""}`);
}
const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const EMOJI = /[\p{Extended_Pictographic}]/u;

async function entrar(browser, ancho, alto) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  page.on("request", (r) => {
    const a = r.headers()["authorization"];
    if (a) page.__token = a;
    if (/\/api\/v1\/recibos(\/[^/]+)?$/.test(r.url()) && ["POST", "PATCH"].includes(r.method())) {
      try {
        page.__ultimoRecibo = JSON.parse(r.postData() ?? "{}");
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

async function api(page, metodo, ruta, cuerpo) {
  return page.evaluate(
    async ({ metodo, ruta, cuerpo, token }) => {
      const r = await fetch(`/api/v1${ruta}`, {
        method: metodo,
        credentials: "include",
        headers: { "content-type": "application/json", authorization: token },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined
      });
      let json = null;
      try {
        json = await r.json();
      } catch {}
      return { status: r.status, json };
    },
    { metodo, ruta, cuerpo, token: page.__token ?? "" }
  );
}

async function abrirNuevoRecibo(page) {
  await abrirVista(page, "Cobros / Recibos");
  await page.getByRole("button", { name: "+ Nuevo recibo" }).click();
  await page.getByRole("heading", { name: "Nuevo recibo" }).waitFor();
}

async function completarRecibo(page, { moneda, importe, concepto }) {
  await page.locator("label.required-field", { hasText: "Documento" }).locator("select").first().selectOption("CI");
  await page.getByPlaceholder("Ingresá el número de documento").fill("1234567");
  await page.getByLabel("Pagador (nombre o razón social)").fill("Juan Perez Prueba");
  await page.getByLabel("Concepto *").fill(concepto);
  await page.getByLabel("Moneda").selectOption(moneda);
  await page.getByLabel(/^Importe/).fill(importe);
}

const cuerpoBase = { fecha_cobro: new Date().toISOString().slice(0, 10), pagador_nombre: "Juan Perez Prueba", pagador_documento_tipo: "CI", pagador_documento: "1234567", concepto: "RDM-008 api" };

(async () => {
  const browser = await chromium.launch();
  try {
    if (corre("pantalla")) {
      for (const [ancho, alto] of [[1440, 900], [1280, 800], [390, 844]]) {
        const { ctx, page } = await entrar(browser, ancho, alto);
        await abrirNuevoRecibo(page);
        const moneda = page.getByLabel("Moneda");
        const opciones = (await moneda.locator("option").allInnerTexts()).map((t) => t.trim());
        check(`RN-06 ${ancho}: Moneda ofrece Gs. y USD`, opciones.join("|") === "Guaraníes (Gs.)|Dólares (USD)", opciones.join("|"));
        check(`RN-06 ${ancho}: guaraníes por defecto`, (await moneda.inputValue()) === "PYG");
        await moneda.selectOption("USD");
        const importe = page.getByLabel(/^Importe/);
        check(`RN-06 ${ancho}: la etiqueta sigue la moneda`, (await page.locator("label", { has: importe }).innerText()).includes("Importe (USD)"));
        await importe.fill("150,505");
        check(`RN-02 ${ancho}: USD admite hasta 2 decimales`, (await importe.inputValue()) === "150,50", await importe.inputValue());
        await moneda.selectOption("PYG");
        check(`RN-06 ${ancho}: al pasar a Gs. el importe pierde los decimales`, (await importe.inputValue()) === "150", await importe.inputValue());
        check(`CA-09 ${ancho}: sin desborde horizontal`, await sinDesborde(page));
        check(`P-X ${ancho}: sin emojis en el formulario`, !EMOJI.test(await page.locator("main").innerText()));
        await moneda.selectOption("USD");
        await importe.fill("150,50");
        await page.screenshot({ path: path.join(outDir, `${ancho}-formulario-usd.png`), fullPage: true });
        await ctx.close();
      }
    }

    if (corre("api")) {
      const { ctx, page } = await entrar(browser, 1440, 900);
      await abrirVista(page, "Cobros / Recibos");
      const pygDec = await api(page, "POST", "/recibos", { ...cuerpoBase, moneda: "PYG", importe: 1500.5 });
      check("CA-03: PYG con decimales da 400 en importe", pygDec.status === 400 && pygDec.json?.error?.details?.fieldErrors?.importe, JSON.stringify(pygDec.json));
      const gbp = await api(page, "POST", "/recibos", { ...cuerpoBase, moneda: "GBP", importe: 10 });
      check("CA-03: otra moneda da 400 en moneda", gbp.status === 400 && gbp.json?.error?.details?.fieldErrors?.moneda, JSON.stringify(gbp.json));
      const usd3 = await api(page, "POST", "/recibos", { ...cuerpoBase, moneda: "USD", importe: 1.005 });
      check("RN-02: USD con 3 decimales da 400", usd3.status === 400, JSON.stringify(usd3.json));
      const borrador = await api(page, "POST", "/recibos", { ...cuerpoBase, moneda: "USD", importe: 150.5 });
      check("RN-01: borrador USD 150,50 creado", borrador.status === 201 && borrador.json?.moneda === "USD" && borrador.json?.importe === 150.5, JSON.stringify(borrador.json));
      if (borrador.status === 201) {
        const aPyg = await api(page, "PATCH", `/recibos/${borrador.json.id}`, { moneda: "PYG" });
        check("CA-04: pasar el borrador a PYG con 150,50 da 400", aPyg.status === 400, JSON.stringify(aPyg.json));
        const ok = await api(page, "PATCH", `/recibos/${borrador.json.id}`, { importe: 99.99 });
        check("RN-02: editar el importe USD a 99,99", ok.status === 200 && ok.json?.importe === 99.99, JSON.stringify(ok.json));
        const borrado = await api(page, "DELETE", `/recibos/${borrador.json.id}`);
        check("limpieza: borrador eliminado", [200, 204].includes(borrado.status), String(borrado.status));
      }
      await ctx.close();
    }

    if (corre("emitir")) {
      const { ctx, page } = await entrar(browser, 1440, 900);
      await abrirNuevoRecibo(page);
      await completarRecibo(page, { moneda: "USD", importe: "150,50", concepto: "RDM-008 recibo USD" });
      page.once("dialog", (d) => void d.accept());
      await page.getByRole("button", { name: "Guardar y emitir" }).click();
      const emitido = await page.locator(".status-pill", { hasText: "EMITIDO" }).first().waitFor({ timeout: 60000 }).then(() => true, () => false);
      const detalle = (await page.locator("main").innerText()).replace(/\s+/g, " ");
      if (!emitido) await page.screenshot({ path: path.join(outDir, "1440-recibo-usd-falla.png"), fullPage: true });
      check("CA-01: recibo USD 150,50 emitido", emitido && detalle.includes("USD 150,50"), detalle.slice(0, 300));
      const enviado = page.__ultimoRecibo ?? {};
      check("CA-01: el formulario manda moneda USD e importe 150.5", enviado.moneda === "USD" && enviado.importe === 150.5, JSON.stringify(enviado));
      await page.screenshot({ path: path.join(outDir, "1440-recibo-usd-emitido.png"), fullPage: true });
      const lista = await api(page, "GET", "/recibos?limit=5&offset=0");
      const recibo = (lista.json?.items ?? []).find((r) => r.concepto === "RDM-008 recibo USD");
      check("CA-01: la lista lo trae en USD", recibo?.moneda === "USD" && recibo?.importe === 150.5, JSON.stringify(recibo ?? lista.json).slice(0, 300));
      check("CA-08: respuesta con emission_profile_code (null con FE sin v0.56)", recibo && "emission_profile_code" in recibo, JSON.stringify(recibo?.emission_profile_code));
      if (recibo) {
        const pdf = await page.evaluate(async ({ id, token }) => {
          const r = await fetch(`/api/v1/recibos/${id}/pdf`, { headers: { authorization: token }, credentials: "include" });
          const b = new Uint8Array(await r.arrayBuffer());
          return { status: r.status, tipo: r.headers.get("content-type"), inicio: String.fromCharCode(...b.slice(0, 5)), largo: b.length };
        }, { id: recibo.id, token: page.__token ?? "" });
        check("CA-01/CA-08: el PDF firmado de FE se descarga", pdf.status === 200 && pdf.inicio === "%PDF-", JSON.stringify(pdf));
      }
      await ctx.close();
    }
    if (corre("candidato")) {
      const { ctx, page } = await entrar(browser, 1440, 900);
      await abrirVista(page, "Cobros / Recibos");
      const textoPdf = async (id, nombre) => {
        const b64 = await page.evaluate(async ({ id, token }) => {
          const r = await fetch(`/api/v1/recibos/${id}/pdf`, { headers: { authorization: token }, credentials: "include" });
          const b = new Uint8Array(await r.arrayBuffer());
          let s = "";
          for (const x of b) s += String.fromCharCode(x);
          return btoa(s);
        }, { id, token: page.__token ?? "" });
        const archivo = path.join(outDir, nombre);
        fs.writeFileSync(archivo, Buffer.from(b64, "base64"));
        return execFileSync("pdftotext", ["-layout", archivo, "-"]).toString().replace(/\s+/g, " ");
      };
      const emitir = async (id) => api(page, "POST", `/recibos/${id}/emitir`);

      const usd = await api(page, "POST", "/recibos", { ...cuerpoBase, concepto: "RDM-010 recibo USD perfil", moneda: "USD", importe: 150.5 });
      check("RDM-010 CA-01: el recibo vuelve con el perfil del punto", usd.status === 201 && Boolean(usd.json?.emission_profile_code), JSON.stringify(usd.json?.emission_profile_code ?? usd.json));
      if (usd.status === 201) {
        const e = await emitir(usd.json.id);
        const t = await textoPdf(usd.json.id, "rdm010-usd.pdf");
        check("RDM-010 CA-01: emitido; PDF en USD con letras", e.status === 200 && t.includes("USD 150,50") && /DÓLARES ESTADOUNIDENSES CON 50\/100/.test(t), t.slice(0, 400));
        console.log(`PDF USD: ${t.slice(0, 600)}`);
      }

      const eur = await api(page, "POST", "/recibos", { ...cuerpoBase, concepto: "RDM-010 recibo EUR", moneda: "EUR", importe: 1250.75 });
      check("RDM-010 CA-02: recibo EUR 1250,75 creado", eur.status === 201 && eur.json?.moneda === "EUR", JSON.stringify(eur.json).slice(0, 300));
      if (eur.status === 201) {
        const e = await emitir(eur.json.id);
        const t = await textoPdf(eur.json.id, "rdm010-eur.pdf");
        check("RDM-010 CA-02: PDF en EUR con letras", e.status === 200 && t.includes("EUR 1.250,75") && /EUROS CON 75\/100/.test(t), t.slice(0, 400));
      }

      if (FACTURA_USD) {
        const desde = await api(page, "POST", `/facturas/${FACTURA_USD}/recibo`);
        check("RDM-010 CA-07: recibo desde la factura a credito USD, en USD por su total y con perfil", desde.status === 201 && desde.json?.moneda === "USD" && Boolean(desde.json?.emission_profile_code), JSON.stringify(desde.json).slice(0, 300));
        if (desde.status === 201) {
          await page.reload();
          await esperarSesion(page);
          await abrirVista(page, "Cobros / Recibos");
          const tarjeta = page.locator(".nota-card", { hasText: desde.json.concepto }).first();
          await tarjeta.getByRole("button", { name: "Ver" }).click();
          await page.getByRole("button", { name: "Editar", exact: true }).click();
          check("RDM-010 D-4: al editar, la moneda del recibo de factura no se cambia", await page.getByLabel("Moneda").isDisabled());
          await page.screenshot({ path: path.join(outDir, "1440-recibo-factura-moneda-fija.png"), fullPage: true });
          const e = await emitir(desde.json.id);
          const t = await textoPdf(desde.json.id, "rdm010-desde-factura.pdf");
          check("RDM-010 CA-07: emitido; PDF en USD", e.status === 200 && t.includes("USD"), t.slice(0, 300));
        }
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(outDir, "resultado.json"), JSON.stringify(resultados, null, 2));
    const fallas = resultados.filter((r) => !r.ok).length;
    console.log(`\n${resultados.length - fallas}/${resultados.length} OK`);
    process.exitCode = fallas ? 1 : 0;
  }
})();
