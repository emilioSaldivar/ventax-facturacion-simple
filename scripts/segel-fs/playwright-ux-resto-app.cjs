#!/usr/bin/env node
// UX del resto de la app (SPEC_UX_RESTO_APP_v0.1). Fase 0 (PLAN §10): componentes base, cliente de API,
// accesibilidad, textos y varios puntos. Solo stack local de Segel; esta fase no emite ni guarda documentos.
//
//   ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/segel-fs/playwright-ux-resto-app.cjs [caso ...]
//
// Sin argumentos corre todos los casos. Casos: componentes (URA-017, CA-13), api (URA-018), teclado (URA-019), puntos (URA-021, CA-14), menu (URA-003), nuevo (URA-004), busqueda (URA-025), ficha (URA-007). URA-012 suma los de las fases 1 y 2.
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
    await abrirVista(page, "Catálogo");
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

    // Notas de credito (URA-005): campo "Motivo" con etiqueta asociada y boton con su motivo de bloqueo (RN-04).
    await abrirVista(page, "Notas de crédito");
    await page.getByRole("heading", { name: "Notas de crédito" }).waitFor();
    const elegible = page.locator("button.document-row", { hasText: "Elegible" }).first();
    await elegible.click();
    await page.getByRole("group", { name: "Tipo de nota de crédito" }).waitFor();
    check("CA-13 campo: 'Motivo' asociado por etiqueta", (await page.getByRole("textbox", { name: /^Motivo/ }).count()) === 1);
    const emitir = page.getByRole("button", { name: "Emitir nota de crédito" });
    const bloqueo = await page.locator(".nc-bloqueo").innerText().catch(() => "");
    check("CA-13 sin motivo no se puede emitir y el panel dice por que", (await emitir.isDisabled()) && bloqueo.includes("Escribí el motivo"), bloqueo);

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

// ─── URA-019: teclado, menu de celular y zoom ───────────────────────────────────
async function casoTeclado(browser) {
  {
    const { ctx, page } = await entrar(browser, 1440, 900);
    try {
      await abrirVista(page, "Documentos");
      await page.locator("table.documents-tabla button.enlace-fila").first().waitFor();
      await page.locator(".documents-advanced-filters select").last().focus();
      let llego = false;
      for (let i = 0; i < 40 && !llego; i += 1) {
        await page.keyboard.press("Tab");
        llego = await page.evaluate(() => document.activeElement?.classList.contains("enlace-fila") ?? false);
      }
      check("URA-019 teclado: Tab llega al numero de la primera fila", llego);
      const anillo = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
      check("URA-019 teclado: el foco se ve (outline)", anillo !== "none", anillo);
      await page.keyboard.press("Enter");
      const volver = page.getByRole("button", { name: /Volver a resultados/ });
      check("URA-019 teclado: Enter abre la ficha", await volver.waitFor({ timeout: 15000 }).then(() => true, () => false));
      await page.screenshot({ path: path.join(outDir, "1440-teclado-ficha.png") });
    } finally {
      await ctx.close();
    }
  }
  {
    const { ctx, page } = await entrar(browser, 390, 844);
    try {
      const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
      check("URA-019 zoom: el viewport no bloquea el zoom (D-14)", !/user-scalable=no|maximum-scale/.test(viewport ?? ""), viewport);
      await page.getByRole("button", { name: "Abrir menu" }).click();
      await page.locator("nav.mobile-menu").waitFor();
      await page.keyboard.press("Escape");
      check("URA-019 celular: Escape cierra el menu", await page.locator("nav.mobile-menu").waitFor({ state: "detached", timeout: 5000 }).then(() => true, () => false));
      await abrirVista(page, "Nueva factura");
      const campos = await page.evaluate(() =>
        [...document.querySelectorAll('main input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), main select, main textarea')]
          .filter((e) => e.getBoundingClientRect().height > 0)
          .map((e) => ({ alto: e.getBoundingClientRect().height, letra: parseFloat(getComputedStyle(e).fontSize) }))
      );
      check(
        "URA-019 celular: campos de Nueva factura de 44 px y letra de 16 px",
        campos.length > 0 && campos.every((c) => c.alto >= 44 && c.letra >= 16),
        JSON.stringify(campos.slice(0, 6))
      );
    } finally {
      await ctx.close();
    }
  }
}

// ─── URA-021: varios puntos (CA-14). El usuario de ensayo tiene 001-001 y 001-002 ─────────────────────
const CODIGO_PERFIL = /[A-Z]{2}\d{5,}-E\d{3}-P\d{3}/;
const DESCRIPCION_LARGA = /Perfil para la emisi[oó]n de comprobantes/i;

async function entrarEligiendo(browser, ancho, alto, punto) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(usuario);
  await page.locator('input[name="password"]').fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.locator(".perfil-eleccion .perfil-opcion").first().waitFor();
  const titulos = await page.locator(".perfil-eleccion .perfil-opcion strong").allInnerTexts();
  const texto = await page.locator(".perfil-eleccion").innerText();
  await page.locator(".perfil-eleccion .perfil-opcion").filter({ hasText: `Punto ${punto}` }).first().click();
  await esperarSesion(page);
  return { ctx, page, titulos, texto };
}

async function casoPuntos(browser) {
  // 1440: eleccion, Informacion y estado, pie del menu, Documentos con el aviso de punto distinto, carga como borrador.
  {
    const { ctx, page, titulos, texto } = await entrarEligiendo(browser, 1440, 900, "001-001");
    try {
      check("CA-14 1440 eleccion: cada opcion se titula con su punto", titulos.length >= 2 && titulos.every((t) => /^Punto \d{3}-\d{3}$/.test(t.trim())), titulos.join(" | "));
      check("CA-14 1440 eleccion: sin la descripcion fiscal larga como titulo ni 'ultimo numero'", !titulos.some((t) => DESCRIPCION_LARGA.test(t)) && !/[uú]ltimo n[uú]mero/i.test(texto));
      await page.screenshot({ path: path.join(outDir, "1440-puntos-informacion.png"), fullPage: true });
      await abrirVista(page, "Información y estado");
      const info = await page.locator("main").innerText();
      const h1 = await page.locator("main h1").first().innerText();
      check("CA-14 1440 Información y estado: sin el codigo del perfil", !CODIGO_PERFIL.test(info), info.match(CODIGO_PERFIL)?.[0] ?? "");
      check("CA-14 1440 Información y estado: el titulo no es la descripcion fiscal", !DESCRIPCION_LARGA.test(h1), h1);
      check("CA-14 1440 Información y estado: dice el punto activo", info.includes("Punto 001-001"));
      const pie = await page.locator(".side-nav-pie").innerText();
      check("CA-14 1440 pie del menu: el punto y no 'ultimo numero'", pie.includes("Punto 001-001") && !/n[uú]mero/i.test(pie), pie);

      // Documentos: una factura del otro punto, nota de credito desde el menu de la fila.
      await abrirVista(page, "Documentos");
      const fila = page.locator("table.documents-tabla tbody tr", { has: page.locator("td.documents-tabla-punto", { hasText: "001-002" }) }).filter({ hasText: "Factura emitida" }).first();
      await fila.waitFor();
      await fila.locator(".menu-fila > button").click();
      await page.getByRole("menuitem", { name: "Nota de crédito" }).click();
      const modal = page.locator('[role="dialog"]#reason-modal-title, section[role="dialog"]').first();
      await modal.waitFor();
      const aviso = await modal.locator(".aviso").innerText().catch(() => "");
      check("CA-14 1440 Documentos: el modal de nota de credito avisa que la factura es de otro punto", aviso.includes("Punto 001-002") && aviso.includes("Punto 001-001"), aviso);
      await page.screenshot({ path: path.join(outDir, "1440-puntos-nc-otro-punto.png") });
      await modal.getByRole("button", { name: /Cancelar|Volver|Cerrar/ }).first().click();

      // Carga masiva: un archivo elegido y sin subir es un borrador para el cambio de punto (P-P4).
      await page.getByRole("button", { name: /^Cargas por planilla/ }).click();
      await page.getByRole("button", { name: "Nueva carga" }).click();
      await page.getByLabel("Archivo de la carga").setInputFiles({ name: "prueba-ura021.csv", mimeType: "text/csv", buffer: Buffer.from("tipo_documento\n") });
      await page.locator("button.topbar-facturador--boton").click();
      const dialogo = page.getByRole("dialog", { name: "Cambiar punto de expedición" });
      await dialogo.waitFor();
      check("CA-14 1440 carga masiva: con un archivo elegido, el cambio ofrece 'Descartar y cambiar'", (await dialogo.innerText()).includes("Descartar y cambiar"));
      const opciones = await dialogo.locator(".perfil-opcion strong").allInnerTexts();
      check("CA-14 1440 dialogo: opciones tituladas con el punto", opciones.length >= 2 && opciones.every((t) => /^Punto \d{3}-\d{3}$/.test(t.trim())), opciones.join(" | "));
      await dialogo.getByRole("button", { name: "Cancelar" }).click();
    } finally {
      await ctx.close();
    }
  }
  // 390: menu de celular, tarjetas y ficha con el numero completo, candidatas de nota de credito con su punto.
  {
    const { ctx, page } = await entrarEligiendo(browser, 390, 844, "001-001");
    try {
      await page.getByRole("button", { name: "Abrir menu" }).click();
      const menu = page.locator("nav.mobile-menu");
      await menu.waitFor();
      const cabecera = await menu.locator("div").first().innerText();
      check("CA-14 390 menu: la cabecera dice el punto y no la descripcion fiscal", cabecera.includes("Punto 001-001") && !DESCRIPCION_LARGA.test(cabecera), cabecera.replace(/\s+/g, " "));
      await page.screenshot({ path: path.join(outDir, "390-puntos-menu.png") });
      await menu.getByRole("button", { name: /Cambiar punto de expedición/ }).click();
      const dialogo = page.getByRole("dialog", { name: "Cambiar punto de expedición" });
      check("CA-14 390 menu: 'Cambiar punto de expedición' abre el dialogo", await dialogo.waitFor({ timeout: 8000 }).then(() => true, () => false));
      await dialogo.getByRole("button", { name: "Cancelar" }).click();

      await abrirVista(page, "Documentos");
      await page.locator(".document-row").first().waitFor();
      const numeros = await page.locator(".document-row strong").allInnerTexts();
      const conPunto = numeros.filter((t) => /\d{3}-\d{3}-\d{7}/.test(t));
      check("CA-14 390 Documentos: las tarjetas muestran el numero con su punto", conPunto.length > 0 && conPunto.length === numeros.filter((t) => /\d{7}/.test(t)).length, numeros.slice(0, 3).join(" | "));
      await page.locator(".document-row-main, button.document-row").first().click();
      await page.getByRole("button", { name: /Volver a resultados/ }).waitFor();
      // URA-007: el numero con su punto esta en el titulo de la ficha.
      const tituloFicha = await page.locator(".document-ficha h3").first().innerText();
      check("CA-14 390 ficha: numero con su punto", /\d{3}-\d{3}-\d{7}/.test(tituloFicha), tituloFicha);

      await abrirVista(page, "Notas de crédito");
      await page.locator("button.document-row").first().waitFor();
      const candidatas = await page.locator("button.document-row strong").allInnerTexts();
      check("CA-14 390 Notas de crédito: cada factura candidata dice su punto", candidatas.some((t) => /^\d{3}-\d{3}-\d{7}$/.test(t.trim())), candidatas.slice(0, 4).join(" | "));
      await page.screenshot({ path: path.join(outDir, "390-puntos-candidatas.png"), fullPage: true });
    } finally {
      await ctx.close();
    }
  }
}

// ─── URA-003: menu en cuatro grupos, un espacio por tipo (CA-01, CA-02, CA-03) ───────────────────────
const GRUPOS = ["Emitir", "Consultar", "Comercial", "Administración"];
const EMITIR = ["Nueva factura", "Notas de crédito", "Notas de débito", "Notas de remisión", "Autofacturas"];

async function casoMenu(browser) {
  for (const [ancho, alto] of [
    [1440, 900],
    [1280, 800],
    [390, 844]
  ]) {
    const { ctx, page } = await entrar(browser, ancho, alto);
    try {
      const celular = ancho < 1024;
      if (celular) await page.getByRole("button", { name: "Abrir menu" }).click();
      const nav = page.locator(celular ? "nav.mobile-menu" : "nav.side-nav");
      await nav.waitFor();
      const grupos = (await nav.locator(celular ? ".menu-group-title" : ".side-nav-titulo").allInnerTexts()).map((t) => t.trim());
      check(`CA-01 ${ancho}: cuatro grupos en orden`, JSON.stringify(grupos.map((g) => g.toLowerCase())) === JSON.stringify(GRUPOS.map((g) => g.toLowerCase())), grupos.join(" | "));
      const textoNav = await nav.innerText();
      check(`CA-01 ${ancho}: "Emitir" lista los cinco tipos`, EMITIR.every((t) => textoNav.includes(t)), "");
      for (const t of ["Notas de débito", "Autofacturas"]) {
        const boton = nav.locator("button", { hasText: t }).first();
        check(`CA-01 ${ancho}: ${t} deshabilitado con "Próximamente"`, (await boton.isDisabled()) && (await boton.innerText()).includes("Próximamente"));
      }
      const remision = nav.locator("button", { hasText: "Notas de remisión" }).first();
      check(`CA-02 ${ancho}: Notas de remisión "Por planilla" con la carga masiva habilitada`, (await remision.innerText()).includes("Por planilla") && !(await remision.isDisabled()));
      check(`CA-03 ${ancho}: sin "Devolver factura" ni "Notas / Presupuestos"`, !/Devolver factura|Notas \/ Presupuestos/.test(textoNav));
      if (!celular) {
        // RN-02: un clic en "Próximamente" no navega ni consulta la API.
        let pedidos = 0;
        const contar = (r) => { if (r.url().includes("/api/")) pedidos += 1; };
        page.on("request", contar);
        const antes = await page.locator("main").innerText();
        await nav.locator("button", { hasText: "Notas de débito" }).first().click({ force: true });
        await page.waitForTimeout(800);
        page.off("request", contar);
        check(`CA-01 ${ancho}: clic en "Próximamente" sin navegar ni pedir a la API`, pedidos === 0 && (await page.locator("main").innerText()) === antes, `pedidos=${pedidos}`);
        // URA-006: espacio propio con "Emitidas · N" y "Por planilla" (la carga masiva con NOTA_REMISION por defecto).
        await remision.click();
        await page.getByRole("heading", { name: "Notas de remisión" }).waitFor();
        await page.getByRole("button", { name: /^Emitidas · \d+/ }).waitFor({ timeout: 10000 }).catch(() => undefined);
        const pestanas = await page.getByRole("group", { name: "Notas de remisión" }).innerText();
        check(`URA-006 ${ancho}: "Notas de remisión" abre su espacio con Emitidas y Por planilla`, /Emitidas · \d+/.test(pestanas) && pestanas.includes("Por planilla"), pestanas.replace(/\s+/g, " "));
        await page.getByRole("button", { name: "Nueva carga" }).click();
        const tipoNr = await page.locator('select[aria-label="Tipo de documento"]').inputValue();
        check(`URA-006 ${ancho}: "Nueva carga" desde Notas de remisión elige NOTA_REMISION`, tipoNr === "NOTA_REMISION", tipoNr);
        await page.screenshot({ path: path.join(outDir, `${ancho}-remision.png`), fullPage: true });
        await page.locator("nav.side-nav").getByRole("button", { name: /Notas de remisión/ }).click();
        await page.getByRole("button", { name: /^Emitidas/ }).click();
        const activa = await page.locator(".filter-tabs button.active").first().innerText().catch(() => "");
        check(`URA-006 ${ancho}: "Emitidas" abre Documentos en la pestaña de remisiones`, /Notas de remisión/.test(activa), activa);
        await abrirVista(page, "Notas de crédito");
        check(`CA-03 ${ancho}: "Notas de crédito" abre la pantalla de notas de crédito`, await page.getByRole("heading", { name: "Notas de crédito" }).waitFor({ timeout: 10000 }).then(() => true, () => false));
      } else {
        await page.screenshot({ path: path.join(outDir, `${ancho}-menu.png`) });
      }
      if (!celular) await page.screenshot({ path: path.join(outDir, `${ancho}-menu.png`) });
    } finally {
      await ctx.close();
    }
  }
}

// ─── URA-004: boton "Nuevo" en la barra de escritorio (CA-04) ──────────────────────────────────────────
async function casoNuevo(browser) {
  for (const [ancho, alto] of [
    [1440, 900],
    [1280, 800]
  ]) {
    const { ctx, page } = await entrar(browser, ancho, alto);
    try {
      const boton = page.getByRole("button", { name: "Nuevo", exact: true });
      check(`CA-04 ${ancho}: boton "Nuevo" con aria-haspopup=menu`, (await boton.getAttribute("aria-haspopup")) === "menu");
      await boton.click();
      const menu = page.getByRole("menu", { name: "Nuevo documento" });
      await menu.waitFor();
      check(`CA-04 ${ancho}: aria-expanded=true y foco en la primera opcion`, (await boton.getAttribute("aria-expanded")) === "true" && (await page.evaluate(() => document.activeElement?.getAttribute("role"))) === "menuitem");
      const texto = await menu.innerText();
      check(`CA-04 ${ancho}: bloques SIFEN y comerciales`, texto.includes("Documentos electrónicos (SIFEN)") && texto.includes("Comprobantes comerciales"), "");
      for (const t of ["Nota de débito", "Autofactura"]) {
        const op = menu.getByRole("menuitem", { name: new RegExp(t) });
        check(`CA-04 ${ancho}: ${t} "Próximamente" no se puede elegir`, (await op.isDisabled()) && (await op.innerText()).includes("Próximamente"));
      }
      check(`CA-04 ${ancho}: el pie dice por que punto se emite (RN-07)`, /Se emite por el Punto 001-001/.test(texto), (texto.match(/Se emite por[^\n]*/) ?? [""])[0]);
      await page.screenshot({ path: path.join(outDir, `${ancho}-menu-nuevo.png`) });
      await page.keyboard.press("Escape");
      check(`CA-04 ${ancho}: Escape cierra y el foco vuelve al boton`, (await page.getByRole("menu", { name: "Nuevo documento" }).count()) === 0 && (await page.evaluate(() => document.activeElement?.textContent?.trim())) === "Nuevo");

      await boton.click();
      await page.getByRole("menuitem", { name: /^Factura/ }).click();
      check(`CA-04 ${ancho}: "Factura" abre Nueva factura`, await page.getByRole("heading", { name: "Nueva factura" }).waitFor({ timeout: 10000 }).then(() => true, () => false));
      await boton.click();
      await page.getByRole("menuitem", { name: /^Nota de crédito/ }).click();
      check(`CA-04 ${ancho}: "Nota de crédito" abre Notas de crédito`, await page.getByRole("heading", { name: "Notas de crédito" }).waitFor({ timeout: 10000 }).then(() => true, () => false));
      await boton.click();
      await page.getByRole("menuitem", { name: /^Nota de remisión/ }).click();
      // Las pestañas de Documentos tambien se llaman "Tipo de documento": se apunta al select de la carga.
      const tipo = page.locator('select[aria-label="Tipo de documento"]');
      const llego = await tipo.waitFor({ timeout: 10000 }).then(() => true, () => false);
      check(`CA-04 ${ancho}: "Nota de remisión" abre la carga masiva con el tipo elegido`, llego && (await tipo.inputValue()) === "NOTA_REMISION", llego ? await tipo.inputValue() : "sin selector");
      await page.mouse.click(5, 300);
      await boton.click();
      await page.mouse.click(700, 700);
      check(`CA-04 ${ancho}: un clic afuera cierra el menu`, (await page.getByRole("menu", { name: "Nuevo documento" }).count()) === 0);
    } finally {
      await ctx.close();
    }
  }
  const { ctx, page } = await entrar(browser, 390, 844);
  try {
    check("CA-04 390: sin boton \"Nuevo\" en la barra de celular (E.2)", (await page.getByRole("button", { name: "Nuevo", exact: true }).count()) === 0);
  } finally {
    await ctx.close();
  }
}

// ─── URA-025: busqueda por numero completo (CA-16) ─────────────────────────────────────────────────────
async function casoBusqueda(browser) {
  const { ctx, page } = await entrar(browser, 1440, 900);
  try {
    async function buscarEnDocumentos(pestana, texto) {
      await abrirVista(page, "Documentos");
      await page.getByRole("group", { name: "Tipo de documento" }).getByRole("button", { name: pestana, exact: true }).click();
      await page.getByPlaceholder("Buscar factura...").fill(texto);
      await page.getByPlaceholder("Buscar factura...").press("Enter");
      await page.waitForTimeout(1500);
      return page.locator("table.documents-tabla tbody tr").allInnerTexts();
    }
    const exacta = await buscarEnDocumentos("Notas de crédito", "001-001-1010006");
    check("CA-16 Documentos: 001-001-1010006 encuentra la nota 1010006", exacta.some((t) => t.includes("1010006")), exacta.slice(0, 2).join(" | "));
    const otroPunto = await buscarEnDocumentos("Notas de crédito", "001-002-1010006");
    check("CA-16 Documentos: 001-002-1010006 no la encuentra (otro punto)", !otroPunto.some((t) => t.includes("1010006")), otroPunto.slice(0, 2).join(" | "));
    const suelto = await buscarEnDocumentos("Notas de crédito", "1010006");
    check("CA-16 Documentos: 1010006 la sigue encontrando", suelto.some((t) => t.includes("1010006")), suelto.slice(0, 2).join(" | "));
    const corto = await buscarEnDocumentos("Facturas", "001-002-8487");
    check("CA-16 Documentos: 001-002-8487 encuentra la factura 0008487 de 001-002", corto.some((t) => t.includes("0008487")), corto.slice(0, 2).join(" | "));
    await page.screenshot({ path: path.join(outDir, "1440-busqueda-numero.png") });

    await abrirVista(page, "Notas de crédito");
    await page.getByLabel("Buscar factura").fill("001-002-8487");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await page.waitForTimeout(1500);
    const candidatas = await page.locator("button.document-row").allInnerTexts();
    check("CA-16 Notas de crédito: 001-002-8487 encuentra la factura candidata", candidatas.length > 0 && candidatas.every((t) => t.includes("0008487")), candidatas.slice(0, 2).join(" | "));
  } finally {
    await ctx.close();
  }
}

// ─── URA-007: Documentos con ficha lateral (CA-06) ────────────────────────────────────────────────────
async function casoFicha(browser) {
  {
    const { ctx, page } = await entrar(browser, 1440, 900);
    try {
      await abrirVista(page, "Documentos");
      await page.locator("table.documents-tabla tbody tr").first().waitFor();
      const pestanas = (await page.getByRole("group", { name: "Tipo de documento" }).innerText()).replace(/\s+/g, " ");
      check("CA-06 1440: solo la pestaña activa muestra su cantidad", /Facturas · \d+/.test(pestanas) && !/Notas de crédito · \d+/.test(pestanas) && pestanas.includes("Cargas por planilla"), pestanas);
      const tabla = await page.locator("table.documents-tabla").innerText();
      check("CA-06 1440: tabla sin emojis", !EMOJI.test(tabla));
      // Una factura emitida que todavia admite nota de credito (la de URA-001 no tiene notas).
      await page.getByPlaceholder("Buscar factura...").fill("001-001-1010559");
      await page.getByPlaceholder("Buscar factura...").press("Enter");
      await page.locator("table.documents-tabla tbody tr", { hasText: "1010559" }).first().waitFor();
      await page.locator("table.documents-tabla tbody tr", { hasText: "1010559" }).first().locator("button.enlace-fila").click();
      const ficha = page.locator("aside.document-ficha");
      await ficha.waitFor();
      check("CA-06 1440: la ficha se abre al costado y la tabla sigue a la vista", (await page.locator("table.documents-tabla").isVisible()) && Math.round((await ficha.boundingBox()).width) === 360, String(Math.round((await ficha.boundingBox()).width)));
      const texto = await ficha.innerText();
      check("CA-06 1440: titulo con tipo y numero con punto, una sola pastilla", (await ficha.locator("h3").first().innerText()).includes("1010559") && (await ficha.locator(".estado-documento").count()) === 1, await ficha.locator("h3").first().innerText());
      check("CA-06 1440: pasos de la emision", (await ficha.locator("ol.ficha-pasos li").count()) >= 3);
      const columnas = await ficha.locator(".ficha-entrega").evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(" ").length);
      check("CA-06 1440: entrega en dos columnas", columnas === 2, String(columnas));
      check("CA-06 1440: \"Desde esta factura\" con nota de credito habilitada", texto.includes("Desde esta factura") && (await ficha.getByRole("button", { name: /Crear nota de crédito/ }).isEnabled()));
      check("CA-06 1440: nota de debito y de remision para esta venta Próximamente", (await ficha.getByRole("button", { name: /Nota de débito/ }).isDisabled()) && (await ficha.getByRole("button", { name: /Nota de remisión para esta venta/ }).isDisabled()));
      check("CA-06 1440: Anular separado y con estilo de peligro", (await ficha.locator(".ficha-peligro .danger-action").count()) === 1);
      check("CA-06 1440: ficha sin emojis", !EMOJI.test(texto));
      await page.screenshot({ path: path.join(outDir, "1440-ficha.png"), fullPage: true });
    } finally {
      await ctx.close();
    }
  }
  {
    const { ctx, page } = await entrar(browser, 390, 844);
    try {
      await abrirVista(page, "Documentos");
      await page.locator(".document-row").first().waitFor();
      const tarjetas = await page.locator(".documents-list").innerText();
      check("CA-06 390: tarjetas con pastilla y sin emojis", (await page.locator(".documents-list .estado-documento").count()) > 0 && !EMOJI.test(tarjetas));
      await page.locator(".document-row-main, button.document-row").first().click();
      await page.getByRole("button", { name: /Volver a resultados/ }).waitFor();
      check("CA-06 390: en celular la ficha reemplaza a la lista", (await page.locator(".documents-list").count()) === 0);
      await page.screenshot({ path: path.join(outDir, "390-ficha.png"), fullPage: true });
    } finally {
      await ctx.close();
    }
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    if (corre("componentes")) await casoComponentes(browser);
    if (corre("api")) await casoApi(browser);
    if (corre("teclado")) await casoTeclado(browser);
    if (corre("puntos")) await casoPuntos(browser);
    if (corre("menu")) await casoMenu(browser);
    if (corre("nuevo")) await casoNuevo(browser);
    if (corre("busqueda")) await casoBusqueda(browser);
    if (corre("ficha")) await casoFicha(browser);
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
