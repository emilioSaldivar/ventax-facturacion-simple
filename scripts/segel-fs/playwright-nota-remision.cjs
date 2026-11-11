#!/usr/bin/env node
// Nota de remision manual (SPEC_NOTA_REMISION_v0.1, TASKS NRE-015). Stack local de Segel.
//
//   ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/segel-fs/playwright-nota-remision.cjs [caso ...]
//
// Casos: permiso (CA-01), validaciones (CA-04), pantallas (1440, 1280 y 390 sin emitir), motivo1 y motivo7
// (CA-02, CA-03: EMITEN en SIFEN test si el stack usa FE real; avisar a FE antes). Escribe test-results/nota-remision/.
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
const corre = (caso) => (pedidos.length === 0 ? !["motivo1", "motivo7"].includes(caso) : pedidos.includes(caso));

const resultados = [];
const emitidas = [];
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 300) });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 300)}` : ""}`);
}
const EMOJI = /[\p{Extended_Pictographic}]/u;
const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function entrar(browser, ancho, alto, sinPermiso = false) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
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
  await page.locator('input[name="username"]').fill(usuario);
  await page.locator('input[name="password"]').fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await esperarSesion(page);
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
  let aprobada = false;
  for (let i = 0; i < 16 && !aprobada; i += 1) {
    aprobada = (await page.locator(".paso.hecho").count()) >= 4;
    if (!aprobada) {
      await page.waitForTimeout(15000);
      const verificar = page.getByRole("button", { name: /Verificar/ });
      if ((await verificar.count()) > 0 && (await verificar.first().isEnabled())) await verificar.first().click().catch(() => undefined);
    }
  }
  const texto = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  const numero = (texto.match(/(\d{3}-\d{3}-\d{7}|\b\d{7}\b)/) ?? [])[1] ?? null;
  await page.screenshot({ path: path.join(outDir, `${etiqueta}.png`), fullPage: true });
  emitidas.push({ etiqueta, numero, aprobada });
  return { aprobada, texto };
}

async function casoMotivo(browser, motivo) {
  const { ctx, page } = await entrar(browser, 1440, 900);
  try {
    await abrirNueva(page);
    await completarComun(page, { motivo });
    await page.waitForTimeout(500);
    const r = await emitirYEsperar(page, `1440-motivo${motivo}`);
    check(`CA-0${motivo === 1 ? 2 : 3} motivo ${motivo}: nota aprobada en SIFEN test`, r.aprobada, r.texto.slice(0, 200));
  } catch (e) {
    check(`motivo ${motivo}: sin excepciones`, false, e.message);
    await page.screenshot({ path: path.join(outDir, `motivo${motivo}-error.png`), fullPage: true }).catch(() => undefined);
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
  } finally {
    await browser.close();
  }
  const fallas = resultados.filter((r) => !r.ok).length;
  fs.writeFileSync(path.join(outDir, "resultado.json"), JSON.stringify({ resultados, emitidas }, null, 2));
  console.log(`\n${resultados.length - fallas}/${resultados.length} OK. Emitidas: ${JSON.stringify(emitidas)}`);
  process.exit(fallas ? 1 : 0);
})();
