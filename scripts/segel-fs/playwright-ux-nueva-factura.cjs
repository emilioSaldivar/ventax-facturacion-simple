#!/usr/bin/env node
// UX de la pantalla Nueva factura (SPEC_UX_NUEVA_FACTURA_v0.1, CA-01 a CA-12). Solo stack local de Segel con SIFEN test.
//
//   ENSAYO_PASSWORD_FILE=/ruta/operador.pass node scripts/segel-fs/playwright-ux-nueva-factura.cjs
//
// Emite tres facturas reales en SIFEN test (USD de tres lineas y PYG en 1440; PYG desde el modo simple en 390) y las
// sigue hasta "Aprobada". Escribe test-results/ux-nueva-factura/.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const outDir = path.join(process.cwd(), "test-results", "ux-nueva-factura");
const RUC = process.env.ENSAYO_RUC ?? "80026570-0";
const NOMBRE = process.env.ENSAYO_NOMBRE ?? "SEGEL SA";
// El punto de ensayo envia por lote: SIFEN test tarda unos 5 minutos en aprobar (corrida del 2026-11-10).
const ESPERA_APROBACION_MS = Number(process.env.ESPERA_APROBACION_MS ?? 600000);
fs.mkdirSync(outDir, { recursive: true });

const resultados = [];
const facturas = [];
let paginaActual = null;
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 400) });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 400)}` : ""}`);
}

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const sinEmojis = async (page) => !EMOJI.test(await page.locator("body").innerText());
const texto = async (page, selector = "main") => (await page.locator(selector).innerText()).replace(/\s+/g, " ");

async function entrar(browser, ancho, alto, modo) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
  if (modo) {
    await ctx.addInitScript((m) => {
      try {
        window.localStorage.setItem("fs.editor.modo", m);
      } catch {}
    }, modo);
  }
  const page = await ctx.newPage();
  paginaActual = page;
  page.setDefaultTimeout(30000);
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(usuario);
  await page.locator('input[name="password"]').fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await esperarSesion(page);
  return { ctx, page };
}

async function abrirNuevaFactura(page) {
  await abrirVista(page, "Nueva factura");
  await page.locator('select[aria-label="Moneda"]').waitFor();
}

async function cargarCliente(page) {
  await page.getByPlaceholder("Ingresá el número de documento").fill(RUC);
  await page.getByPlaceholder("Ingresá el número de documento").press("Tab");
  await page.waitForTimeout(800);
  const nombre = page.getByLabel("Nombre o razón social");
  if (!(await nombre.inputValue()).trim()) await nombre.fill(NOMBRE);
}

async function filaGrilla(page, indice, { descripcion, cantidad, precio }) {
  const fila = page.locator(`[data-grilla-fila="${indice}"]`);
  await fila.locator('input[data-celda="descripcion"]').fill(descripcion);
  await fila.getByLabel(/^Cantidad, línea/).fill(cantidad);
  await fila.getByLabel(/^Precio, línea/).fill(precio);
}

async function motivoBloqueo(page) {
  const motivo = page.locator(".motivo-bloqueo");
  return (await motivo.count()) ? (await motivo.first().innerText()).replace(/\s+/g, " ").trim() : "";
}

/** Crea la factura y espera la pantalla de resultado. Devuelve el texto de la pantalla. */
async function crear(page, etiqueta) {
  const crearBtn = page.getByRole("button", { name: "Crear factura" });
  await page.waitForFunction((b) => b && !b.disabled, await crearBtn.elementHandle(), { timeout: 20000 });
  await crearBtn.click();
  const confirmar = page.getByRole("button", { name: /^Confirmar/ });
  if (await confirmar.isVisible({ timeout: 3000 }).catch(() => false)) await confirmar.click();
  await page.getByRole("button", { name: "Crear nueva factura" }).waitFor({ timeout: 60000 });
  await page.screenshot({ path: path.join(outDir, `${etiqueta}-creada.png`), fullPage: true });
  return texto(page);
}

/** Sigue el estado fiscal hasta "Aprobada" (CA-07, CA-11). */
async function esperarAprobada(page, etiqueta) {
  const inicio = Date.now();
  while (Date.now() - inicio < ESPERA_APROBACION_MS) {
    const pasos = await page.locator(".paso.hecho").count();
    if (pasos === 4) break;
    const resumen = page.locator("summary", { hasText: "Más opciones" });
    if ((await resumen.count()) && !(await page.locator("details.mas-opciones[open]").count())) await resumen.click();
    const verificar = page.getByRole("button", { name: "Verificar estado fiscal" });
    if (await verificar.isVisible().catch(() => false)) await verificar.click();
    await page.waitForTimeout(15000);
  }
  const t = await texto(page);
  const numero = (t.match(/Factura (\d[\d-]{5,})/) ?? [])[1] ?? null;
  const aprobada = (await page.locator(".paso.hecho").count()) === 4;
  await page.screenshot({ path: path.join(outDir, `${etiqueta}-aprobada.png`), fullPage: true });
  facturas.push({ etiqueta, numero, aprobada });
  return { aprobada, numero, kude: await page.getByRole("link", { name: "Ver KUDE en PDF" }).count() };
}

async function marco(page, v) {
  check(`CA-01 ${v}: barra con logo Segel, facturador y operador`, (await page.locator("header.topbar img.topbar-logo").isVisible()) && (await page.locator(".topbar-facturador small").innerText()).includes("Timbrado") && (await page.locator(".topbar-operador").isVisible()));
  check(`CA-01 ${v}: menu lateral con iconos SVG y pie de estado`, (await page.locator("nav.side-nav .side-nav-item svg").count()) === 8 && (await page.locator(".side-nav-pie").innerText()).includes("facturar"));
  check(`CA-01 ${v}: sin desplazamiento horizontal`, await sinDesborde(page));
  check(`CA-10 ${v}: sin emojis en el marco ni en Nueva factura`, await sinEmojis(page));
}

(async () => {
  const browser = await chromium.launch();
  try {
    // ---- 1440: CA-01 a CA-07, CA-09, CA-11 (USD y PYG) ----
    const { ctx, page } = await entrar(browser, 1440, 900, "completo");
    await abrirNuevaFactura(page);
    await marco(page, "1440");
    check("CA-02 1440: modo completo con encabezado, banda, cliente, grilla y totales fijos", (await page.locator(".invoice-editor.completo").count()) === 1 && (await page.locator(".banda-comprobante").isVisible()) && (await page.locator("table.grilla-lineas th.col-numero").isVisible()) && (await page.locator("aside.totales-fija").isVisible()) && (await page.locator(".editor-subtitulo").innerText()).includes("el número lo asigna el sistema al emitir") && !(await page.locator(".editor-subtitulo").innerText()).includes("Próximo número"));
    check("CA-02 1440: sin Mostrar datos, invoice-band ni tarjeta Factura", (await page.getByRole("button", { name: /Mostrar datos/ }).count()) === 0 && (await page.locator(".invoice-band").count()) === 0 && (await page.getByText("Opciones de factura").count()) === 0);
    check("CA-03 1440: vacio, el motivo es el cliente", (await motivoBloqueo(page)).includes("Falta el cliente"), await motivoBloqueo(page));
    await page.screenshot({ path: path.join(outDir, "1440-vacio.png") });

    await page.locator('select[aria-label="Moneda"]').selectOption("USD");
    await page.getByLabel("Tipo de cambio").fill("7350,5");
    await cargarCliente(page);
    await page.waitForTimeout(600);
    check("CA-03 1440: con cliente y sin lineas, el motivo son las lineas", (await motivoBloqueo(page)).includes("Agregá al menos una línea"), await motivoBloqueo(page));
    check("CA-04 1440: tilde de origen y casilla de agenda visibles", (await page.locator(".cliente-origen.ok").count()) === 1 && (await page.locator(".casilla-agenda input").count()) === 1);
    await page.getByRole("button", { name: /Direccion, telefono y correo/ }).click();
    check("CA-04 1440: el desplegable abre direccion, telefono y correo", (await page.getByLabel("Dirección").isVisible()) && (await page.getByLabel("Teléfono").isVisible()) && (await page.getByLabel("Correo").isVisible()));

    // Fila invalida: precio 0 en USD (la grilla recorta los decimales de mas, asi que el caso de precision es CA-05 del editor PC).
    await filaGrilla(page, 0, { descripcion: "UX linea 1", cantidad: "2", precio: "150,25" });
    await filaGrilla(page, 1, { descripcion: "UX linea 2", cantidad: "1,5", precio: "99,99" });
    await filaGrilla(page, 2, { descripcion: "UX linea 3", cantidad: "3", precio: "0" });
    await page.locator('[data-grilla-fila="2"]').getByLabel(/^IVA, línea/).selectOption("IVA_5");
    await page.waitForTimeout(900);
    check("CA-03 1440: fila invalida con motivo propio y bloqueo que la nombra", (await page.locator('tr.fila-motivo[data-grilla-motivo="2"]').count()) === 1 && (await motivoBloqueo(page)).includes("línea 3"), await motivoBloqueo(page));
    check("CA-05 1440: aviso de catalogo no disponible en USD", (await page.locator(".grilla-pie").innerText()).includes("no disponible en USD"));
    await page.screenshot({ path: path.join(outDir, "1440-fila-invalida.png") });
    await page.locator('[data-grilla-fila="2"]').getByLabel(/^Precio, línea/).fill("10");
    await page.waitForTimeout(1500);
    const totales = await texto(page, "aside.totales-fija");
    check("CA-05 1440: equivalente en guaranies y total USD 480,49", totales.includes("USD 480,49") && /equivale a Gs\. [\d.]+ al cambio de 7350,5/.test(totales), totales);
    check("CA-02 1440: sin desplazamiento horizontal con lineas", await sinDesborde(page));
    await page.screenshot({ path: path.join(outDir, "1440-usd-cargada.png"), fullPage: true });

    // CA-09: el cuerpo de la vista previa es el mismo que guardo el editor PC (clave de la linea de base).
    const basePreview = path.join(process.cwd(), "test-results", "editor-pc", "preview-usd.json");
    if (fs.existsSync(basePreview)) {
      const [pedido] = await Promise.all([
        page.waitForRequest((r) => r.url().includes("/facturas/preview") && r.method() === "POST", { timeout: 20000 }),
        page.getByRole("button", { name: "Crédito", exact: true }).click().then(() => page.getByRole("button", { name: "Contado", exact: true }).click())
      ]);
      const cuerpo = JSON.parse(pedido.postData() ?? "{}");
      const esperado = JSON.parse(fs.readFileSync(basePreview, "utf8"));
      const sinCliente = (c) => JSON.stringify({ ...c, cliente: { ...c.cliente, cliente_id: null, direccion: null, telefono: null, email: null }, items: c.items.map((i) => ({ ...i, descripcion: "x" })) });
      check("CA-09 1440: el cuerpo de la vista previa conserva la forma de la linea de base", sinCliente(cuerpo) === sinCliente(esperado), JSON.stringify(cuerpo).slice(0, 300));
    } else {
      check("CA-09 1440: sin linea de base (test-results/editor-pc/preview-usd.json)", false, "correr UXF-000");
    }

    const creadaUsd = await crear(page, "1440-usd");
    check("CA-06 1440: el resultado reemplaza al formulario", (await page.locator("table.grilla-lineas").count()) === 0 && (await page.locator(".resultado-emision").count()) === 1 && creadaUsd.includes("USD 480,49"), creadaUsd.slice(0, 200));
    check("CA-06 1440: pasos, resumen con lineas, entrega y mas opciones", (await page.locator(".pasos .paso").count()) === 4 && (await page.locator(".resultado-lineas tbody tr").count()) === 3 && (await page.getByRole("link", { name: "Enviar por WhatsApp" }).count()) === 1 && (await page.locator("summary", { hasText: "Más opciones" }).count()) === 1);
    check("CA-07 1440: recien creada muestra Enviada a SIFEN o Esperando aprobacion", (await page.locator(".paso.activo, .paso.hecho").count()) >= 2);
    const usd = await esperarAprobada(page, "1440-usd");
    check("CA-11 1440: factura USD aprobada en SIFEN test con KUDE", usd.aprobada && usd.kude === 1, `numero ${usd.numero}`);
    check("CA-10 1440: sin emojis en el resultado", await sinEmojis(page));

    await page.getByRole("button", { name: "Crear nueva factura" }).click();
    check("CA-06 1440: Crear nueva factura vuelve al formulario vacio en modo completo", (await page.locator("table.grilla-lineas").isVisible()) && (await page.getByPlaceholder("Ingresá el número de documento").inputValue()) === "" && (await page.locator('select[aria-label="Moneda"]').inputValue()) === "PYG");

    // PYG con catalogo (CA-11).
    await cargarCliente(page);
    const fila0 = page.locator('[data-grilla-fila="0"]');
    await fila0.locator('input[data-celda="descripcion"]').fill("a");
    const sugerencia = page.locator(".grilla-sugerencias button").first();
    if (await sugerencia.waitFor({ timeout: 8000 }).then(() => true, () => false)) {
      await sugerencia.click();
      check("CA-11 1440: articulo del catalogo desde la celda", (await fila0.getByLabel(/^Precio, línea/).inputValue()).length > 0);
    } else {
      check("CA-11 1440: catalogo sin coincidencias, linea a mano", true, "sin sugerencias");
      await filaGrilla(page, 0, { descripcion: "UX servicio en guaranies", cantidad: "1", precio: "110000" });
    }
    const creadaPyg = await crear(page, "1440-pyg");
    check("CA-11 1440: factura PYG creada desde la grilla", /Gs\.?\s*[\d.]+/.test(creadaPyg), creadaPyg.slice(0, 200));
    const pyg = await esperarAprobada(page, "1440-pyg");
    check("CA-11 1440: factura PYG aprobada en SIFEN test", pyg.aprobada, `numero ${pyg.numero}`);
    await page.getByRole("button", { name: "Ver en Documentos" }).click();
    await page.waitForTimeout(1500);
    check("CA-06 1440: Ver en Documentos abre la lista de facturas", (await page.locator('nav.side-nav [aria-current="page"]').innerText()).includes("Documentos") && (await page.locator("table.documents-tabla, .documents-list").count()) >= 1);
    await ctx.close();

    // ---- 1280: marco y modo completo sin desborde (CA-01, CA-02) ----
    const v1280 = await entrar(browser, 1280, 800, "completo");
    await abrirNuevaFactura(v1280.page);
    await marco(v1280.page, "1280");
    check("CA-02 1280: modo completo sin desplazamiento horizontal", (await v1280.page.locator("table.grilla-lineas").isVisible()) && (await sinDesborde(v1280.page)));
    await v1280.page.screenshot({ path: path.join(outDir, "1280-completo.png"), fullPage: true });
    await v1280.ctx.close();

    // ---- 390: modo simple, pie fijo y emision PYG (CA-08, CA-11) ----
    const v390 = await entrar(browser, 390, 844, "completo");
    const p = v390.page;
    check("CA-01 390: barra de celular con isotipo y boton de menu", (await p.locator("header.topbar img.topbar-isotipo").isVisible()) && (await p.getByRole("button", { name: "Abrir menu" }).isVisible()));
    await p.getByRole("button", { name: "Abrir menu" }).click();
    check("CA-01 390: menu de celular con iconos SVG", (await p.locator("nav.mobile-menu .menu-item svg").count()) === 8);
    await p.locator('nav.mobile-menu button:has-text("Nueva factura")').first().click();
    await p.locator('select[aria-label="Moneda"]').waitFor();
    check("CA-08 390: modo simple sin conmutador, con pie fijo visible", (await p.locator(".invoice-editor.completo").count()) === 0 && (await p.getByRole("group", { name: "Modo del editor" }).count()) === 0 && (await p.locator(".pie-crear").isVisible()));
    const pie = await p.locator(".pie-crear").boundingBox();
    check("CA-08 390: el pie con Crear factura esta dentro del alto de la pantalla sin desplazarse", pie !== null && pie.y + pie.height <= 844 + 1, JSON.stringify(pie));
    check("CA-08 390: sin desplazamiento horizontal", await sinDesborde(p));
    check("CA-10 390: sin emojis", await sinEmojis(p));
    await p.screenshot({ path: path.join(outDir, "390-simple.png") });
    await cargarCliente(p);
    await p.getByRole("button", { name: "+ Agregar producto" }).click();
    await p.getByPlaceholder("Ingresá descripción").fill("UX servicio simple");
    await p.getByPlaceholder("0").fill("55000");
    await p.getByRole("button", { name: "AGREGAR Y NO GUARDAR" }).click();
    await p.waitForTimeout(1200);
    check("CA-08 390: linea compacta con lapiz SVG", (await p.locator(".sale-item-card svg").count()) === 1 && (await texto(p, ".sale-item-card")).includes("Gs. 55.000"));
    await p.screenshot({ path: path.join(outDir, "390-simple-lineas.png"), fullPage: true });
    const creadaSimple = await crear(p, "390-pyg");
    check("CA-11 390: factura PYG creada desde el modo simple", creadaSimple.includes("Gs. 55.000"), creadaSimple.slice(0, 200));
    const simple = await esperarAprobada(p, "390-pyg");
    check("CA-11 390: factura aprobada en SIFEN test", simple.aprobada, `numero ${simple.numero}`);
    check("CA-08 390: resultado sin desplazamiento horizontal", await sinDesborde(p));
    await v390.ctx.close();

    // ---- CA-04: el guardado del cliente falla y la factura sale igual (sin emitir: se corta antes de POST /facturas) ----
    const v4 = await entrar(browser, 1440, 900, "completo");
    await abrirNuevaFactura(v4.page);
    await v4.page.route("**/api/v1/clientes", (route) => route.request().method() === "POST" ? route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "agenda caida (simulado)" } }) }) : route.continue());
    await v4.page.route("**/api/v1/facturas", (route) => route.request().method() === "POST" ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "SIMULADO", message: "emision cortada por el guion (no se emite)" } }) }) : route.continue());
    await v4.page.getByPlaceholder("Ingresá el número de documento").fill("80000000-1");
    await v4.page.getByLabel("Nombre o razón social").fill("Cliente UX de prueba");
    await filaGrilla(v4.page, 0, { descripcion: "UX linea", cantidad: "1", precio: "1000" });
    await v4.page.waitForTimeout(1200);
    const [pedidoFactura] = await Promise.all([
      v4.page.waitForRequest((r) => r.url().endsWith("/api/v1/facturas") && r.method() === "POST", { timeout: 20000 }),
      v4.page.getByRole("button", { name: "Crear factura" }).click()
    ]);
    await v4.page.waitForTimeout(800);
    const estadoCliente = await texto(v4.page, ".cliente-estado");
    check("CA-04 1440: si falla la agenda, se avisa y la factura se envia igual", Boolean(pedidoFactura) && /No se pudo guardar el cliente/.test(estadoCliente), estadoCliente);
    await v4.ctx.close();
  } catch (error) {
    check("ejecucion sin errores", false, error.message.split("\n").slice(0, 3).join(" "));
    if (paginaActual) await paginaActual.screenshot({ path: path.join(outDir, "error.png"), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(outDir, "resultado.json"), JSON.stringify({ resultados, facturas }, null, 2));
  const fallos = resultados.filter((r) => !r.ok);
  console.log(`\n${resultados.length - fallos.length}/${resultados.length} verificaciones OK. Facturas: ${JSON.stringify(facturas)}`);
  process.exit(fallos.length ? 1 : 0);
})();
