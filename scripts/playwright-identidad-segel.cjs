#!/usr/bin/env node
// Validacion visual de la identidad Segel (TASKS_IDENTIDAD_MARCA_SEGEL_v0.1, V-3 y V-4).
//
// Corre contra el contenedor `frontend`, con la API mockeada por `page.route`.
// El HTML publico de la API se genera con su funcion real, para no depender de datos en la base.

const { chromium } = require("playwright");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const origin = (process.env.SMOKE_ORIGIN ?? "http://127.0.0.1:8096").replace(/\/$/, "");
const outDir = process.env.SMOKE_OUT_DIR ?? "test-results/identidad-segel";
const viewports = [
  { nombre: "mobile", width: 390, height: 844 },
  { nombre: "desktop", width: 1280, height: 800 }
];
const ROJO = "rgb(221, 10, 25)";
const NEGRO = "rgb(0, 0, 0)";
const RATIO = 232 / 68;
const TOKEN = "11111111-1111-4111-8111-111111111111";

const contexto = {
  user: { id: "u1", username: "op", display_name: "Operador", role: "OPERADOR_FACTURACION" },
  tenant: { id: "t1", name: "Demo", status: "ACTIVE" },
  facturador: { id: "f1", emisor_id: "80136968-1", razon_social: "Demo SA", ruc: "80136968-1" },
  fiscal_context: {
    establecimiento: "001", punto_expedicion: "001", perfil_emision_codigo: "P1",
    actividad_economica_codigo: "47111", actividad_economica_descripcion: "Comercio",
    timbrado: "12345678", timbrado_inicio: "2026-01-01", documento_nro: "0000001",
    credito_plazo_dias: 30, tipo_transaccion_default: 1
  }
};

const nota = {
  valido: true, tipo: "PRESUPUESTO", numero: 12, fecha_emision: "2026-11-04", valido_hasta: "2026-11-30",
  cliente_nombre: "Cliente Demo", cliente_ruc: "80000000-5", estado_visual: "VIGENTE", total: 100000,
  items: [{ fila_tipo: "ITEM", descripcion: "Servicio", cantidad: 1, precio_total: 100000 }]
};

const recibo = {
  valido: true, numero: 7, fecha_cobro: "2026-11-04", pagador_nombre: "Cliente Demo", concepto: "Pago",
  importe: 100000, forma_pago: "EFECTIVO", estado: "EMITIDO", emitido_at: "2026-11-04T12:00:00Z"
};

function htmlPublicoApi() {
  const code = `
    import { renderPublicDocumentHtml } from "./apps/api/src/modules/entrega/entrega.service.ts";
    process.stdout.write(renderPublicDocumentHtml({
      facturador: { id: "f1", emisor_id: "80136968-1", razon_social: "Demo SA", ruc: "80136968-1" },
      numero_fiscal: "001-001-0000001", cdc: "${"A".repeat(44)}", estado: "EMITIDA",
      cliente: { documento_tipo: "RUC", documento: "80000000-5", razon_social: "Cliente Demo" },
      totals: { total: 100000, iva_10: 9091, iva_5: 0, exenta: 0, base_10: 90909, base_5: 0 },
      email_status: "DELEGATED",
      artifacts: { kude_pdf: { available: true, url: "/mock.pdf" }, xml: { available: true, url: "/mock.xml" } }
    }));`;
  const r = spawnSync("node_modules/.bin/tsx", ["--input-type=module", "-e", code], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`No se pudo generar el HTML publico: ${r.stderr}`);
  return r.stdout;
}

async function mockApi(page) {
  await page.route("**/api/v1/**", (route) => {
    const url = route.request().url();
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (url.includes("/auth/login")) return json({ error: { code: "UNAUTHORIZED", message: "Credenciales invalidas" } }, 401);
    if (url.includes("/auth/refresh")) return json({ error: { code: "UNAUTHORIZED", message: "Sin sesion" } }, 401);
    if (url.includes("/me/context")) return json(contexto);
    if (url.includes("/me/readiness")) return json({ ready: true, checks: [] });
    if (url.includes("/verificar/nota/")) return json(nota);
    if (url.includes("/verificar/recibo/")) return json(recibo);
    if (url.includes("/backoffice/")) return json({ items: [], total: 0, data: [] });
    return json({ items: [], total: 0 });
  });
}

async function logo(page, selector) {
  return page.locator(selector).first().evaluate((img) => {
    const r = img.getBoundingClientRect();
    return { ancho: r.width, alto: r.height, ratio: r.width / r.height, natural: img.naturalWidth, alt: img.alt };
  });
}

async function run() {
  fs.mkdirSync(outDir, { recursive: true });
  const htmlApi = htmlPublicoApi();
  const browser = await chromium.launch();
  const resultados = [];

  for (const vp of viewports) {
    const abrir = async (nombre, token) => {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, serviceWorkers: "block" });
      const page = await ctx.newPage();
      const problemas = [];
      page.on("response", (res) => {
        if (res.status() >= 400 && !res.url().includes("/api/v1/")) problemas.push(`${res.status()} ${res.url()}`);
      });
      page.on("request", (req) => {
        if (req.url().startsWith("http") && !req.url().startsWith(origin)) problemas.push(`externo ${req.url()}`);
      });
      await mockApi(page);
      if (token) await page.addInitScript(([k, v]) => localStorage.setItem(k, v), token);
      const cerrar = async (checks, { fuente = true, desbordeConocido = false } = {}) => {
        await page.waitForTimeout(500);
        const texto = await page.locator("body").innerText();
        const fuentes = await page.evaluate(async () => {
          await document.fonts.ready;
          // Fondo real: el primer color no transparente desde el elemento visible hacia arriba
          let el = document.querySelector("#root > *") ?? document.querySelector("main") ?? document.body;
          let fondo = "rgba(0, 0, 0, 0)";
          while (el && fondo === "rgba(0, 0, 0, 0)") { fondo = getComputedStyle(el).backgroundColor; el = el.parentElement; }
          return {
            fondo,
            desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            familia: getComputedStyle(document.body).fontFamily,
            cargada: [...document.fonts].some((f) => f.family.includes("Montserrat") && f.status === "loaded")
          };
        });
        const todo = {
          ...checks,
          sinTextoVentax: !/Ventax/i.test(texto.replace(/[\w.+-]*@?ventax\.app/gi, "")),
          sinAssetsRotosNiExternos: problemas.length === 0,
          fondoBlanco: fuentes.fondo === "rgb(255, 255, 255)" || fuentes.fondo === "rgba(0, 0, 0, 0)",
          sinDesborde: desbordeConocido || fuentes.desborde <= 0,
          ...(fuente ? { montserrat: fuentes.familia.includes("Montserrat") && fuentes.cargada } : {})
        };
        const fallos = Object.entries(todo).filter(([, v]) => v !== true).map(([k]) => k);
        resultados.push({ viewport: vp.nombre, pantalla: nombre, fallos, problemas });
        await page.screenshot({ path: path.join(outDir, `${nombre}-${vp.nombre}.png`), fullPage: true });
        await ctx.close();
      };
      return { page, cerrar };
    };

    // Login: logo, accion primaria, mensaje en linea y error real
    {
      const { page, cerrar } = await abrir("login");
      await page.goto(`${origin}/app/`, { waitUntil: "networkidle" });
      const l = await logo(page, "img.brand-logo");
      const primaria = page.locator(".primary-action").first();
      const inputs = page.locator("input");
      await inputs.nth(0).fill("op");
      await inputs.nth(1).fill("clave");
      await primaria.click();
      await page.waitForSelector(".form-error");
      const estilos = await page.evaluate(() => {
        const el = document.createElement("p");
        el.className = "inline-message";
        document.body.appendChild(el);
        const inline = getComputedStyle(el).color;
        el.remove();
        return { inline, error: getComputedStyle(document.querySelector(".form-error")).color };
      });
      const fondo = await primaria.evaluate((b) => getComputedStyle(b).backgroundColor);
      await cerrar({
        logoProporcion: Math.abs(l.ratio - RATIO) <= 0.05,
        logoCargado: l.natural > 0,
        logoAlt: l.alt === "Segel",
        primariaRoja: fondo === ROJO,
        inlineNegro: estilos.inline === NEGRO,
        errorDistinto: estilos.error !== ROJO && estilos.error !== NEGRO,
        titulo: (await page.title()) === "Segel Factura"
      });
    }

    // Aplicacion: isotipo compacto
    {
      const { page, cerrar } = await abrir("aplicacion", ["ventax_factura_access_token", "mock"]);
      await page.goto(`${origin}/app/`, { waitUntil: "networkidle" });
      await page.waitForSelector(".brand-mark.compact img");
      const l = await logo(page, ".brand-mark.compact img");
      // "Volver" no se parte en dos lineas
      const volver = await page.locator(".header-actions .ghost-action", { hasText: "Volver" }).first().evaluate((b) => {
        const r = document.createRange();
        r.selectNodeContents(b);
        return r.getClientRects().length;
      });
      // Hover de la accion primaria: sigue en la familia del rojo
      const crear = page.locator(".primary-action").first();
      await crear.scrollIntoViewIfNeeded();
      await crear.evaluate((b) => { b.disabled = false; });
      await crear.hover();
      await page.waitForTimeout(250);
      const hover = await crear.evaluate((b) => getComputedStyle(b).backgroundColor);
      await cerrar({
        isotipo34: Math.round(l.ancho) === 34 && Math.round(l.alto) === 34,
        isotipoCargado: l.natural > 0,
        volverUnaLinea: volver === 1,
        hoverRojo: hover === "rgb(199, 9, 22)"
      });
    }

    // Pestana activa: texto legible sobre el fondo de marca (regresion detectada a ojo)
    {
      const { page, cerrar } = await abrir("catalogo-pestana-activa", ["ventax_factura_access_token", "mock"]);
      await page.goto(`${origin}/app/`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "Abrir menu" }).first().click();
      await page.locator(".menu-item", { hasText: "Catálogo" }).first().click();
      await page.waitForSelector(".filter-tabs button.active");
      const tab = await page.locator(".filter-tabs button.active").first().evaluate((b) => {
        const c = getComputedStyle(b);
        return { color: c.color, fondo: c.backgroundColor };
      });
      await cerrar({ fondoRojo: tab.fondo === ROJO, textoBlanco: tab.color === "rgb(255, 255, 255)" });
    }

    // Paginas publicas React
    for (const [nombre, ruta, alto] of [["nota-publica", "nota", 40], ["recibo-publico", "recibo", 46]]) {
      const { page, cerrar } = await abrir(nombre);
      await page.goto(`${origin}/verificar/${ruta}/${TOKEN}`, { waitUntil: "networkidle" });
      await page.waitForSelector('img[alt="Segel"]');
      const l = await logo(page, 'img[alt="Segel"]');
      await cerrar({ logoProporcion: Math.abs(l.ratio - RATIO) <= 0.05, logoCargado: l.natural > 0, logoAlto: Math.round(l.alto) === alto });
    }

    // HTML publico de la API. Es independiente del CSS de la app: no carga Montserrat (SPEC, limitaciones)
    {
      const { page, cerrar } = await abrir("documento-publico-api");
      await page.route("**/public/d/mock", (r) => r.fulfill({ status: 200, contentType: "text/html", body: htmlApi }));
      await page.goto(`${origin}/public/d/mock`, { waitUntil: "networkidle" });
      const l = await logo(page, ".brand img");
      const boton = await page.locator("a.primary").first().evaluate((a) => getComputedStyle(a).backgroundColor);
      await cerrar({ logoProporcion: Math.abs(l.ratio - RATIO) <= 0.05, logoCargado: l.natural > 0, logoAlt: l.alt === "Segel", botonRojo: boton === ROJO }, { fuente: false });
    }

    // Backoffice: login y sidebar
    {
      const { page, cerrar } = await abrir("backoffice-login");
      await page.goto(`${origin}/backoffice/`, { waitUntil: "networkidle" });
      const eyebrow = await page.locator(".auth-eyebrow").innerText();
      const fondo = await page.locator(".btn-primary").first().evaluate((b) => getComputedStyle(b).backgroundColor);
      await cerrar({ eyebrow: eyebrow.toLowerCase() === "segel backoffice", titulo: (await page.title()) === "Segel Backoffice", botonRojo: fondo === ROJO });
    }
    {
      const { page, cerrar } = await abrir("backoffice-sidebar", ["ventax_backoffice_access_token", "mock-token"]);
      await page.goto(`${origin}/backoffice/`, { waitUntil: "networkidle" });
      await page.waitForSelector(".sidebar-brand .brand-label");
      await cerrar({ etiqueta: (await page.locator(".sidebar-brand .brand-label").innerText()).toLowerCase() === "segel" }, { desbordeConocido: true });
    }
  }

  // V-4: PWA y service worker. Se usa un contexto con service workers habilitados.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await mockApi(page);
    await page.goto(`${origin}/app/`, { waitUntil: "networkidle" });
    const estado = await page.evaluate(async () => {
      const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 15000))]);
      return reg?.active?.state ?? "sin-registro";
    });
    const cdp = await ctx.newCDPSession(page);
    const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
    const { errors: erroresManifest } = await cdp.send("Page.getAppManifest");
    const cache = await page.evaluate(async () => {
      const keys = await caches.keys();
      const items = await Promise.all(keys.map(async (k) => (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname)));
      return items.flat();
    });
    const fallos = [];
    if (estado !== "activated" && estado !== "activating") fallos.push(`service worker: ${estado}`);
    if (installabilityErrors.length) fallos.push(`instalacion: ${JSON.stringify(installabilityErrors)}`);
    if (erroresManifest.length) fallos.push(`manifest: ${JSON.stringify(erroresManifest)}`);
    if (!cache.includes("/app/icons/segel-icon-512.png")) fallos.push("icono 512 fuera del cache");
    resultados.push({ viewport: "mobile", pantalla: "pwa", fallos, problemas: [] });
    await ctx.close();
  }

  await browser.close();
  const conFallos = resultados.filter((r) => r.fallos.length > 0);
  console.log(JSON.stringify(conFallos.length ? conFallos : resultados.map((r) => `${r.viewport}/${r.pantalla}: ok`), null, 2));
  if (conFallos.length > 0) process.exit(1);
  console.log(`OK: ${resultados.length} pantallas en ${viewports.length} viewports.`);
}

run().catch((e) => { console.error(e); process.exit(1); });
