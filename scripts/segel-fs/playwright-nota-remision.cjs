#!/usr/bin/env node
// Nota de remision manual (SPEC_NOTA_REMISION_v0.1, TASKS NRE-015). Stack local de Segel.
//
//   ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/segel-fs/playwright-nota-remision.cjs [caso ...]
//
// Casos: permiso (CA-01), validaciones (CA-04), pantallas (1440, 1280 y 390 sin emitir), motivo1 y motivo7
// (CA-02, CA-03: EMITEN en SIFEN test si el stack usa FE real; avisar a FE antes), motivo1-390 (emite desde celular),
// sin-numerador (RN-01b: ENSAYO_USER2 / ENSAYO_PASSWORD_FILE2 / ENSAYO_PUNTO2, un punto sin numerador tipo 7: queda en
// error operativo con el mensaje "Pedila a Segel") y anular (RN-26: anula la ultima nota aprobada en esta corrida o la de
// ENSAYO_NRE_ANULAR). Variables: SEGEL_APP_URL, ENSAYO_USER, ENSAYO_PASSWORD_FILE, ENSAYO_PUNTO, ENSAYO_RUC, ENSAYO_NOMBRE.
// Escribe test-results/nota-remision/.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const RUC_DESTINATARIO = process.env.ENSAYO_RUC ?? "80026570-0";
const outDir = path.join(process.cwd(), "test-results", "nota-remision");
fs.mkdirSync(outDir, { recursive: true });
const pedidos = process.argv.slice(2);
const corre = (caso) => (pedidos.length === 0 ? !["motivo1", "motivo7", "motivo1-390", "sin-numerador", "anular"].includes(caso) : pedidos.includes(caso));
const ESPERA_APROBACION_MS = Number(process.env.ENSAYO_ESPERA_MS ?? 25 * 60 * 1000); // lote de FE + verificacion de FS (hasta 15 min en lote)

const resultados = [];
const emitidas = [];
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 300) });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 300)}` : ""}`);
}
const EMOJI = /[\p{Extended_Pictographic}]/u;
const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function entrar(browser, ancho, alto, sinPermiso = false, cuenta = null) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
  const usuarioDe = cuenta?.usuario ?? usuario;
  const claveDe = cuenta?.clave ?? clave;
  const puntoPrevio = process.env.ENSAYO_PUNTO;
  if (cuenta?.punto) process.env.ENSAYO_PUNTO = cuenta.punto;
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  if (sinPermiso) {
    await page.route("**/api/v1/me/context", async (route) => {
      const r = await route.fetch();
      const json = await r.json();
      await route.fulfill({ response: r, json: { ...json, nota_remision_habilitada: false } });
    });
  }
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(usuarioDe);
  await page.locator('input[name="password"]').fill(claveDe);
  await page.getByRole("button", { name: "Ingresar" }).click();
  try {
    await esperarSesion(page);
  } finally {
    if (cuenta?.punto) {
      if (puntoPrevio === undefined) delete process.env.ENSAYO_PUNTO;
      else process.env.ENSAYO_PUNTO = puntoPrevio;
    }
  }
  return { ctx, page };
}

async function abrirNueva(page) {
  await abrirVista(page, "Notas de remisión");
  await page.getByRole("heading", { name: "Notas de remisión" }).waitFor();
  const pestana = page.getByRole("button", { name: /^Nueva nota de remisión/ });
  if ((await pestana.getAttribute("aria-pressed")) !== "true") await pestana.click();
  await page.locator(".remision-form").waitFor();
}

async function elegirGeografia(page, idBase, departamento, distrito, ciudad) {
  await page.locator(`#${idBase}-departamento`).selectOption({ label: departamento });
  await page.waitForTimeout(500);
  await page.locator(`#${idBase}-distrito`).selectOption({ label: distrito });
  await page.waitForTimeout(500);
  await page.locator(`#${idBase}-ciudad`).selectOption({ label: ciudad });
}

async function completarComun(page, { motivo }) {
  await page.locator("#nre-motivo").selectOption(String(motivo));
  await page.locator("#nre-km").fill("12");
  if (motivo === 1) {
    await page.locator("#nre-doc-tipo").selectOption("RUC");
    await page.locator("#nre-doc").fill(RUC_DESTINATARIO);
    await page.locator("#nre-nombre").fill(process.env.ENSAYO_NOMBRE ?? "SEGEL SA");
    await page.locator("#nre-dest-direccion").fill("Avda. Mcal. Lopez 1234");
    await page.locator("#nre-dest-numero").fill("1234");
    await elegirGeografia(page, "nre-dest", "CAPITAL", "ASUNCION (DISTRITO)", "ASUNCION (DISTRITO)");
  }
  await page.locator("#nre-salida-direccion").fill("Deposito Segel");
  await page.locator("#nre-salida-numero").fill("100");
  await elegirGeografia(page, "nre-salida", "CAPITAL", "ASUNCION (DISTRITO)", "ASUNCION (DISTRITO)");
  if (motivo === 7) {
    await page.locator("#nre-entrega-direccion").fill("Sucursal Luque");
    await page.locator("#nre-entrega-numero").fill("0");
    await elegirGeografia(page, "nre-entrega", "CENTRAL", "LUQUE", "LUQUE");
  }
  await page.locator("#nre-veh-marca").fill("Volvo");
  await page.locator("#nre-veh-matricula").fill("ABC123");
  await page.locator("#nre-trans-domicilio").fill("Asuncion");
  await page.locator("#nre-chofer-nombre").fill("Juan Perez");
  await page.locator("#nre-chofer-doc").fill("1234567");
  await page.locator("#nre-chofer-dir").fill("Asuncion");
  await page.locator("#nre-item-desc-0").fill(`Cajas de prueba NRE motivo ${motivo}`);
  await page.locator("#nre-item-cant-0").fill("2");
}

async function casoPermiso(browser) {
  const { ctx, page } = await entrar(browser, 1440, 900, true);
  try {
    await abrirVista(page, "Notas de remisión");
    const pestana = page.getByRole("button", { name: /^Nueva nota de remisión/ });
    await pestana.waitFor();
    check("CA-01 sin NRE_EMIT: la pestaña Nueva dice Próximamente y esta deshabilitada", (await pestana.isDisabled()) && (await pestana.innerText()).includes("Próximamente"));
    check("CA-01 sin NRE_EMIT: se explica como pedirlo", (await page.locator("main").innerText()).includes("Pedila a Segel"));
  } finally {
    await ctx.close();
  }
  const con = await entrar(browser, 1440, 900);
  try {
    await abrirNueva(con.page);
    check("CA-01 con NRE_EMIT: el espacio abre en Nueva nota de remisión", (await con.page.locator(".remision-form").count()) === 1);
  } finally {
    await con.ctx.close();
  }
}

async function casoValidaciones(browser) {
  const { ctx, page } = await entrar(browser, 1440, 900);
  try {
    await abrirNueva(page);
    const motivoInicial = (await page.locator(".motivo-bloqueo").first().innerText().catch(() => "")).trim();
    check("CA-04: con el formulario vacio el panel dice que falta", motivoInicial.length > 0, motivoInicial);
    let llamoApi = false;
    page.on("request", (r) => {
      if (r.url().includes("/api/v1/notas-remision") && r.method() === "POST") llamoApi = true;
    });
    await page.getByRole("button", { name: "Emitir nota de remisión" }).click();
    await page.waitForTimeout(500);
    check("CA-04: Emitir con errores no llama a la API", !llamoApi);
    check("CA-04: kilometros marcado en su campo", (await page.locator("main").innerText()).includes("Los kilómetros van de 1 a 99.999."));
    check("CA-04: destinatario sin domicilio marcado", (await page.locator("main").innerText()).includes("Completá dirección, número de casa, departamento y ciudad del destinatario."));
    await page.locator("#nre-doc").fill("80012345-1");
    await page.waitForTimeout(300);
    check("CA-04: RUC del destinatario con DV incorrecto", (await page.locator("main").innerText()).includes("el dígito verificador que corresponde es 0"));
    await page.locator("#nre-trans-ruc").fill("80136968-2");
    await page.waitForTimeout(300);
    check("CA-04: RUC del transportista con DV incorrecto", (await page.locator("main").innerText()).includes("80136968-2 no es válido"));
    await page.locator("#nre-fin").fill("2020-01-01");
    await page.waitForTimeout(300);
    check("CA-04: fin anterior al inicio", (await page.locator("main").innerText()).includes("El fin del traslado no puede ser anterior al inicio."));
    // La geografia viene de FE (proxy de la API).
    const deps = await page.locator("#nre-dest-departamento option").count();
    check("RN-08: la lista de departamentos se carga desde la API", deps > 2, String(deps));
    await page.screenshot({ path: path.join(outDir, "1440-validaciones.png"), fullPage: true });
  } finally {
    await ctx.close();
  }
}

async function casoPantallas(browser) {
  for (const [ancho, alto] of [
    [1440, 900],
    [1280, 800],
    [390, 844]
  ]) {
    const { ctx, page } = await entrar(browser, ancho, alto);
    try {
      await abrirNueva(page);
      await completarComun(page, { motivo: 1 });
      await page.waitForTimeout(500);
      const bloqueo = (await page.locator(".motivo-bloqueo").count()) > 0 ? (await page.locator(".motivo-bloqueo").first().innerText()).trim() : "";
      check(`CA-02 ${ancho}: con los datos completos no hay motivo de bloqueo`, bloqueo === "", bloqueo);
      check(`CA-02 ${ancho}: el boton Emitir esta habilitado`, await page.getByRole("button", { name: "Emitir nota de remisión" }).isEnabled());
      check(`CA ${ancho}: sin desplazamiento horizontal`, await sinDesborde(page));
      check(`CA ${ancho}: sin emojis`, !EMOJI.test(await page.locator("main").innerText()));
      if (ancho >= 1024) {
        const panel = await page.locator("aside.nc-panel").boundingBox();
        check(`CA ${ancho}: panel fijo a la derecha`, panel && panel.x > ancho / 2, JSON.stringify(panel));
      }
      await page.screenshot({ path: path.join(outDir, `${ancho}-formulario.png`), fullPage: true });
    } finally {
      await ctx.close();
    }
  }
}

async function emitirYEsperar(page, etiqueta) {
  await page.getByRole("button", { name: "Emitir nota de remisión" }).click();
  await page.locator(".resultado-emision, .paso").first().waitFor({ timeout: 30000 });
  // Se espera hasta un estado final: aprobada (4 pasos hechos), rechazada o error. El lote de FE test sale cada 15 min.
  const inicio = Date.now();
  let aprobada = false;
  let final = false;
  while (!final && Date.now() - inicio < ESPERA_APROBACION_MS) {
    aprobada = (await page.locator(".paso.hecho").count()) >= 4;
    const estado = (await page.locator(".resultado-emision [data-estado]").first().getAttribute("data-estado").catch(() => null)) ?? "";
    final = aprobada || ["RECHAZADA", "ERROR_OPERATIVO", "ERROR_TEMPORAL", "ANULADA"].includes(estado);
    if (!final) {
      await page.waitForTimeout(20000);
      const verificar = page.getByRole("button", { name: /Verificar/ });
      if ((await verificar.count()) > 0 && (await verificar.first().isEnabled())) await verificar.first().click().catch(() => undefined);
    }
  }
  // Ultima mirada: la aprobacion puede llegar en los segundos finales de la espera.
  aprobada = aprobada || (await page.locator(".paso.hecho").count()) >= 4;
  const texto = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  const numero = (texto.match(/(\d{3}-\d{3}-\d{7}|\b\d{7}\b)/) ?? [])[1] ?? null;
  const estadoFinal = (await page.locator(".resultado-emision [data-estado]").first().getAttribute("data-estado").catch(() => null)) ?? null;
  await page.screenshot({ path: path.join(outDir, `${etiqueta}.png`), fullPage: true });
  emitidas.push({ etiqueta, numero, aprobada, estado: estadoFinal, segundos: Math.round((Date.now() - inicio) / 1000) });
  return { aprobada, texto, estado: estadoFinal };
}

async function casoMotivo(browser, motivo, ancho = 1440, alto = 900) {
  const { ctx, page } = await entrar(browser, ancho, alto);
  try {
    await abrirNueva(page);
    await completarComun(page, { motivo });
    await page.waitForTimeout(500);
    const r = await emitirYEsperar(page, `${ancho}-motivo${motivo}`);
    check(`CA-0${motivo === 1 ? 2 : 3} motivo ${motivo} ${ancho}: nota aprobada en SIFEN test`, r.aprobada, `${r.estado} · ${r.texto.slice(0, 160)}`);
    if (motivo === 7 && r.aprobada) {
      const texto = await page.locator("main").innerText();
      check("RN-20 motivo 7: dice 'Descargar para el traslado' y no ofrece WhatsApp ni correo", texto.includes("Descargar para el traslado") && !/WhatsApp/.test(texto), texto.slice(0, 120));
    }
    if (ancho < 1024) check("CA 390: resultado sin desplazamiento horizontal", await sinDesborde(page));
  } catch (e) {
    check(`motivo ${motivo} ${ancho}: sin excepciones`, false, e.message);
    await page.screenshot({ path: path.join(outDir, `motivo${motivo}-${ancho}-error.png`), fullPage: true }).catch(() => undefined);
  } finally {
    await ctx.close();
  }
}

// RN-01b: el emisor tiene numerador tipo 7 en algun punto, pero no en el punto activo de este usuario.
async function casoSinNumerador(browser) {
  const cuenta = {
    usuario: process.env.ENSAYO_USER2,
    clave: fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE2 ?? "", "utf8").trim(),
    punto: process.env.ENSAYO_PUNTO2 ?? "001-003"
  };
  const { ctx, page } = await entrar(browser, 1440, 900, false, cuenta);
  try {
    await abrirNueva(page);
    check("RN-01b: la pestaña se ofrece (el emisor tiene NRE_EMIT y numerador en otro punto)", (await page.locator(".remision-form").count()) === 1);
    await completarComun(page, { motivo: 1 });
    await page.waitForTimeout(500);
    const r = await emitirYEsperar(page, "1440-sin-numerador");
    check("RN-01b / RN-23: la nota queda en error operativo, sin reintentos", r.estado === "ERROR_OPERATIVO", `${r.estado} · ${r.texto.slice(0, 160)}`);
    check("RN-01b: el mensaje dice que falta la numeracion y pide a Segel", r.texto.includes("todavía no tiene numeración para notas de remisión"), r.texto.slice(0, 300));
  } catch (e) {
    check("sin-numerador: sin excepciones", false, e.message);
    await page.screenshot({ path: path.join(outDir, "sin-numerador-error.png"), fullPage: true }).catch(() => undefined);
  } finally {
    await ctx.close();
  }
}

// RN-26: anular una nota de remision aprobada desde la ficha de Documentos (168 h).
async function casoAnular(browser) {
  const objetivo = process.env.ENSAYO_NRE_ANULAR ?? emitidas.filter((e) => e.aprobada && e.numero).map((e) => e.numero).pop();
  if (!objetivo) {
    check("RN-26 anular: hay una nota aprobada para anular", false, "sin nota; pasa ENSAYO_NRE_ANULAR");
    return;
  }
  const { ctx, page } = await entrar(browser, 1440, 900);
  try {
    await abrirVista(page, "Documentos");
    // Pestaña de Documentos (no la entrada del menu lateral con el mismo nombre).
    await page.getByRole("group", { name: "Tipo de documento" }).getByRole("button", { name: /^Notas de remisión/ }).click();
    await page.getByPlaceholder(/Buscar/).first().fill(objetivo.replace(/^\d{3}-\d{3}-/, ""));
    await page.getByPlaceholder(/Buscar/).first().press("Enter");
    const fila = page.locator("table.documents-tabla tbody tr", { hasText: objetivo.replace(/^\d{3}-\d{3}-/, "") }).first();
    await fila.waitFor({ timeout: 15000 });
    await fila.locator("button.enlace-fila").click();
    const ficha = page.locator("aside.document-ficha");
    await ficha.waitFor();
    const anular = ficha.getByRole("button", { name: /Anular nota de remisión/ });
    check("RN-26: la ficha ofrece 'Anular nota de remisión'", (await anular.count()) === 1 && (await anular.isEnabled()));
    await anular.click();
    // Ventana de motivo de Documentos: textarea "Motivo" y boton "Confirmar".
    const motivo = page.getByLabel("Motivo");
    await motivo.waitFor({ timeout: 10000 });
    await motivo.fill("Prueba de anulación de nota de remisión desde FS");
    await page.getByRole("button", { name: "Confirmar", exact: true }).click();
    let estado = "";
    for (let i = 0; i < 12; i += 1) {
      await page.waitForTimeout(5000);
      estado = (await ficha.locator(".estado-documento").first().getAttribute("data-estado").catch(() => "")) ?? "";
      if (estado === "ANULADA") break;
    }
    check(`RN-26: la nota ${objetivo} queda ANULADA en SIFEN test`, estado === "ANULADA", `estado ${estado} · ${(await ficha.innerText()).replace(/\s+/g, " ").slice(0, 200)}`);
    await page.screenshot({ path: path.join(outDir, "1440-anular.png"), fullPage: true });
  } catch (e) {
    check("anular: sin excepciones", false, e.message);
    await page.screenshot({ path: path.join(outDir, "anular-error.png"), fullPage: true }).catch(() => undefined);
  } finally {
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    if (corre("permiso")) await casoPermiso(browser);
    if (corre("validaciones")) await casoValidaciones(browser);
    if (corre("pantallas")) await casoPantallas(browser);
    if (corre("motivo1")) await casoMotivo(browser, 1);
    if (corre("motivo7")) await casoMotivo(browser, 7);
    if (corre("motivo1-390")) await casoMotivo(browser, 1, 390, 844);
    if (corre("sin-numerador")) await casoSinNumerador(browser);
    if (corre("anular")) await casoAnular(browser);
  } finally {
    await browser.close();
  }
  const fallas = resultados.filter((r) => !r.ok).length;
  fs.writeFileSync(path.join(outDir, "resultado.json"), JSON.stringify({ resultados, emitidas }, null, 2));
  console.log(`\n${resultados.length - fallas}/${resultados.length} OK. Emitidas: ${JSON.stringify(emitidas)}`);
  process.exit(fallas ? 1 : 0);
})();
