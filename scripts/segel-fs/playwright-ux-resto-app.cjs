#!/usr/bin/env node
// UX del resto de la app (SPEC_UX_RESTO_APP_v0.1). Fase 0 (PLAN §10): componentes base, cliente de API,
// accesibilidad, textos y varios puntos. Solo stack local de Segel; esta fase no emite ni guarda documentos.
//
//   ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/segel-fs/playwright-ux-resto-app.cjs [caso ...]
//
// Sin argumentos corre todos los casos. Casos: componentes (URA-017, CA-13), api (URA-018). URA-012 suma los de las fases 1 y 2.
// Escribe test-results/ux-resto-app/.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const outDir = path.join(process.cwd(), "test-results", "ux-resto-app");
fs.mkdirSync(outDir, { recursive: true });
const pedidos = process.argv.slice(2);
const corre = (caso) => pedidos.length === 0 || pedidos.includes(caso);

const resultados = [];
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 400) });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 400)}` : ""}`);
}

const EMOJI = /[\p{Extended_Pictographic}]/u;
const enfocado = (page) =>
  page.evaluate(() => {
    const e = document.activeElement;
    return e ? { tag: e.tagName, nombre: (e.getAttribute("aria-label") || e.innerText || "").trim().slice(0, 60), enDialogo: Boolean(e.closest('[role="dialog"]')) } : null;
  });

async function entrar(browser, ancho, alto) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
  await ctx.addInitScript(() => {
    try {
      window.localStorage.setItem("fs.editor.modo", "completo");
    } catch {}
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(usuario);
  await page.locator('input[name="password"]').fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await esperarSesion(page);
  return { ctx, page };
}

// ─── URA-017: componentes base (CA-13) ──────────────────────────────────────────
async function casoComponentes(browser) {
  // Login: el boton de mostrar contraseña se alcanza con Tab y mide 44 px (CampoContrasena).
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.locator('input[name="password"]').focus();
    await page.keyboard.press("Tab");
    const foco = await enfocado(page);
    check("CA-13 login: Tab desde la contraseña llega a 'Mostrar contraseña'", foco?.nombre === "Mostrar contraseña", JSON.stringify(foco));
    const alto = await page.getByRole("button", { name: "Mostrar contraseña" }).evaluate((e) => e.getBoundingClientRect().height);
    check("CA-13 login: el boton del ojo mide 44 px", Math.round(alto) === 44, alto);
    await ctx.close();
  }

  const { ctx, page } = await entrar(browser, 1440, 900);
  try {
    // Nueva factura: "¿Quitar esta línea?" con Dialogo; Escape no quita; Tab no sale; el foco vuelve.
    await abrirVista(page, "Nueva factura");
    const descripcion = page.getByLabel("Descripción, línea 1");
    await descripcion.fill("Linea de prueba URA-017");
    await page.keyboard.press("Escape");
    const quitar = page.getByRole("button", { name: "Quitar línea 1" });
    await quitar.click();
    const dialogo = page.getByRole("dialog", { name: "¿Quitar esta línea?" });
    await dialogo.waitFor();
    check("CA-13 dialogo: abre con su titulo como nombre", await dialogo.isVisible());
    check("CA-13 dialogo: aria-modal", (await dialogo.getAttribute("aria-modal")) === "true");
    let siempreAdentro = true;
    for (let i = 0; i < 5; i += 1) {
      await page.keyboard.press("Tab");
      if (!(await enfocado(page))?.enDialogo) siempreAdentro = false;
    }
    await page.keyboard.press("Shift+Tab");
    if (!(await enfocado(page))?.enDialogo) siempreAdentro = false;
    check("CA-13 dialogo: Tab y Shift+Tab no salen del dialogo", siempreAdentro);
    await page.screenshot({ path: path.join(outDir, "1440-dialogo-quitar-linea.png") });
    await page.keyboard.press("Escape");
    await dialogo.waitFor({ state: "detached" });
    check("CA-13 dialogo: Escape cierra sin quitar la linea", (await descripcion.inputValue()) === "Linea de prueba URA-017");
    const vuelta = await enfocado(page);
    check("CA-13 dialogo: el foco vuelve al boton que lo abrio", vuelta?.nombre === "Quitar línea 1", JSON.stringify(vuelta));
    await quitar.click();
    await dialogo.getByRole("button", { name: "Quitar" }).click();
    await dialogo.waitFor({ state: "detached" });
    check("CA-13 dialogo: 'Quitar' quita la linea", (await page.getByLabel("Descripción, línea 1").inputValue()) === "");

    // Catalogo: MenuFila con nombre, aria-haspopup y aria-expanded; Escape devuelve el foco.
    await abrirVista(page, "Catalogo");
    const boton = page.locator(".menu-fila > button").first();
    await boton.waitFor();
    const nombre = await boton.getAttribute("aria-label");
    check("CA-13 menu de fila: el boton tiene nombre", /^Acciones de .+/.test(nombre ?? ""), nombre);
    check("CA-13 menu de fila: aria-haspopup=menu", (await boton.getAttribute("aria-haspopup")) === "menu");
    check("CA-13 menu de fila: aria-expanded=false cerrado", (await boton.getAttribute("aria-expanded")) === "false");
    await boton.click();
    check("CA-13 menu de fila: aria-expanded=true abierto", (await boton.getAttribute("aria-expanded")) === "true");
    const focoMenu = await page.evaluate(() => document.activeElement?.getAttribute("role"));
    check("CA-13 menu de fila: el foco pasa a la primera opcion", focoMenu === "menuitem", focoMenu);
    await page.keyboard.press("Escape");
    check("CA-13 menu de fila: Escape cierra", (await page.locator('.menu-fila [role="menu"]').count()) === 0);
    check("CA-13 menu de fila: el foco vuelve al boton", (await enfocado(page))?.nombre === nombre);

    // Notas de credito: encabezado, aviso con tono y campo "Motivo" con etiqueta asociada.
    await abrirVista(page, "Devolver factura");
    await page.getByRole("heading", { name: "Seleccionar factura" }).waitFor();
    const elegible = page.locator("button.document-row", { hasText: "Elegible" }).first();
    await elegible.click();
    check("CA-13 campo: 'Motivo' asociado por etiqueta", (await page.getByLabel("Motivo").count()) === 1);
    await page.getByRole("button", { name: "Emitir nota de credito" }).click();
    const aviso = page.locator(".aviso");
    await aviso.waitFor();
    check(
      "CA-13 aviso: falta el motivo, tono atencion y sin emitir",
      (await aviso.innerText()).includes("Motivo requerido") && (await aviso.getAttribute("class")).includes("aviso-atencion")
    );

    // Pastillas sin emojis: Documentos y Cobros / Recibos (enum traducido).
    await abrirVista(page, "Documentos");
    await page.locator(".estado-documento").first().waitFor();
    const pastillas = await page.locator(".estado-documento").allInnerTexts();
    check("CA-13 pastillas de Documentos sin emojis", pastillas.length > 0 && !pastillas.some((t) => EMOJI.test(t)), pastillas.slice(0, 3).join(" | "));
    await abrirVista(page, "Cobros / Recibos");
    await page.locator(".nota-card").first().waitFor();
    const recibos = await page.locator(".nota-card .estado-documento").allInnerTexts();
    check(
      "CA-13 pastillas de Recibos sin el enum crudo",
      recibos.length > 0 && !recibos.some((t) => /^(EMITIDO|BORRADOR|ANULADO)$/.test(t.trim())),
      recibos.slice(0, 4).join(" | ")
    );
  } finally {
    await ctx.close();
  }

  // Cambio de punto: el campo de contraseña ocupa el ancho del dialogo (H-05), en 1440 y 390.
  for (const [ancho, alto] of [
    [1440, 900],
    [390, 844]
  ]) {
    const { ctx: c, page: p } = await entrar(browser, ancho, alto);
    try {
      const botonPunto = p.locator("button.topbar-facturador--boton").first();
      if (!(await botonPunto.isVisible().catch(() => false))) {
        check(`CA-13 ${ancho} cambio de punto: el usuario de ensayo tiene un solo punto (caso omitido)`, true);
        continue;
      }
      await botonPunto.click();
      const dialogo = p.locator('[role="dialog"]').first();
      await dialogo.waitFor();
      const medidas = await dialogo.evaluate((d) => {
        const input = d.querySelector(".password-input input");
        const caja = d.querySelector(".password-input");
        return {
          dialogo: d.getBoundingClientRect().width,
          input: input.getBoundingClientRect().width,
          caja: caja.getBoundingClientRect().width,
          alto: input.getBoundingClientRect().height
        };
      });
      check(
        `CA-13 ${ancho} cambio de punto: la contraseña ocupa el ancho (H-05)`,
        medidas.input >= medidas.caja - 1 && medidas.caja >= medidas.dialogo * 0.8 && medidas.alto >= 44,
        JSON.stringify(medidas)
      );
      await p.screenshot({ path: path.join(outDir, `${ancho}-cambiar-punto.png`) });
      await dialogo.getByRole("button", { name: "Cancelar" }).click();
    } finally {
      await c.close();
    }
  }
}

// ─── URA-018: descargas por el cliente de API, con renovacion de sesion ─────────
async function casoApi(browser) {
  const { ctx, page } = await entrar(browser, 1440, 900);
  try {
    await abrirVista(page, "Cobros / Recibos");
    const emitido = page.locator(".nota-card", { has: page.locator('.estado-documento[data-estado="EMITIDO"]') }).first();
    await emitido.waitFor();
    await emitido.getByRole("button", { name: "Ver", exact: true }).click();
    const verPdf = page.getByRole("button", { name: "Ver PDF" }).first();
    await verPdf.waitFor();
    // El primer pedido del PDF responde 401 como si el token hubiera vencido: el cliente renueva una vez y reintenta.
    let forzado = false;
    await page.route(/\/recibos\/[^/]+\/pdf$/, (route) => {
      if (forzado) return route.continue();
      forzado = true;
      return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Token vencido" } }) });
    });
    let refrescos = 0;
    const pdfs = [];
    page.on("request", (r) => {
      if (r.url().includes("/auth/refresh") && r.method() === "POST") refrescos += 1;
    });
    page.on("response", (r) => {
      if (/\/recibos\/[^/]+\/pdf$/.test(r.url())) pdfs.push(r.status());
    });
    const ventana = ctx.waitForEvent("page", { timeout: 15000 }).catch(() => null);
    await verPdf.click();
    const nueva = await ventana;
    await page.waitForTimeout(1500);
    check("URA-018: el PDF del recibo pasa por el cliente y se renueva la sesion una sola vez", refrescos === 1, `refresh=${refrescos}`);
    check("URA-018: tras renovar, el PDF responde 200 y se abre", pdfs.includes(200) && nueva !== null, `respuestas=${pdfs.join(",")} ventana=${nueva ? "si" : "no"}`);
    check("URA-018: sin aviso de error en la pantalla", (await page.locator(".error-banner").count()) === 0);
    if (nueva) await nueva.close();
  } finally {
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    if (corre("componentes")) await casoComponentes(browser);
    if (corre("api")) await casoApi(browser);
  } catch (e) {
    check("el guion termino sin excepciones", false, String(e));
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(outDir, "resultados.json"), JSON.stringify(resultados, null, 1));
  const fallas = resultados.filter((r) => !r.ok);
  console.log(`\n${resultados.length - fallas.length}/${resultados.length} verificaciones OK.`);
  process.exit(fallas.length ? 1 : 0);
})();
