#!/usr/bin/env node
// Validaciones del receptor antes de emitir (SPEC_VALIDACIONES_RECEPTOR_v0.1, TASKS VAL-008).
// Solo stack local de Segel; no emite. Crea y borra clientes de prueba "Prueba VAL ...".
// Para CA-08 inserta por SQL en el Postgres local (segel-fs-postgres-1) un cliente con RUC "xxx" y lo borra al final.
//
//   ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/segel-fs/playwright-validaciones-receptor.cjs
//
// Escribe test-results/validaciones-receptor/.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const contenedorDb = process.env.SEGEL_DB_CONTAINER ?? "segel-fs-postgres-1";
const outDir = path.join(process.cwd(), "test-results", "validaciones-receptor");
fs.mkdirSync(outDir, { recursive: true });

const resultados = [];
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 300) });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 300)}` : ""}`);
}
const EMOJI = /[\p{Extended_Pictographic}]/u;
const sql = (q) =>
  execFileSync("docker", ["exec", contenedorDb, "psql", "-U", "facturacion_simple", "-d", "facturacion_simple", "-tAc", q], { encoding: "utf8" }).trim();

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

const errorDe = (raiz, campo) => raiz.locator(`[data-campo-error="${campo}"]`);
async function textoError(raiz, campo) {
  const e = errorDe(raiz, campo);
  return (await e.count()) > 0 ? (await e.first().innerText()).trim() : null;
}

// CA-08: cliente viejo con RUC sin DV, creado por SQL (la API ya no lo deja crear).
function crearClienteInvalido() {
  const fila = sql(
    `select c.facturador_id || '|' || u.tenant_id from usuarios u join usuario_operacion_config c on c.usuario_id = u.id where u.username = '${usuario}' limit 1`
  );
  const [facturadorId, tenantId] = fila.split("|");
  const nombre = `Prueba VAL viejo ${Date.now() % 100000}`;
  const identidad = sql(
    `insert into cliente_identidades (documento_tipo, documento, documento_normalizado, razon_social) values ('RUC', 'xxx', 'XXXVAL${Date.now() % 100000}', '${nombre}') returning id`
  ).split("\n")[0];
  sql(
    `insert into facturador_clientes (tenant_id, facturador_id, cliente_identidad_id, razon_social) values ('${tenantId}', '${facturadorId}', '${identidad}', '${nombre}')`
  );
  return { nombre, identidad };
}
function borrarClienteInvalido(identidad) {
  sql(`delete from facturador_clientes where cliente_identidad_id = '${identidad}'`);
  sql(`delete from cliente_identidades where id = '${identidad}'`);
}

async function casoAgenda(browser, ancho, alto, invalido) {
  const { ctx, page } = await entrar(browser, ancho, alto);
  const escritorio = ancho >= 1024;
  try {
    await abrirVista(page, "Agenda / Clientes");
    await page.getByRole("heading", { name: "Clientes" }).waitFor();
    await page.waitForTimeout(800);

    // CA-08: el cliente viejo se marca "Revisar datos".
    await page.getByPlaceholder(/Buscar/).first().fill(invalido.nombre).catch(() => undefined);
    await page.waitForTimeout(900);
    const filaVieja = escritorio
      ? page.locator("table.agenda-tabla tbody tr", { hasText: invalido.nombre })
      : page.locator(".client-row", { hasText: invalido.nombre });
    const marcado = await filaVieja.first().waitFor({ timeout: 8000 }).then(
      async () => (await filaVieja.first().locator('[data-estado="REVISAR_DATOS"]').count()) > 0,
      () => false
    );
    check(`CA-08 ${ancho}: cliente con RUC "xxx" se lista con "Revisar datos"`, marcado);
    const titulo = marcado ? await filaVieja.first().locator(".agenda-revisar").getAttribute("title") : "";
    check(`CA-08 ${ancho}: el motivo dice que falta el DV`, /Falta el dígito verificador/.test(titulo ?? ""), titulo);
    if (escritorio && marcado) {
      await filaVieja.first().locator("td").first().click();
      const panel = page.locator("aside.catalogo-panel, .catalogo-panel").first();
      await panel.waitFor();
      check(`CA-08 ${ancho}: al editarlo, aviso con los datos para corregir`, (await panel.innerText()).includes("datos para corregir"));
      await panel.getByRole("button", { name: "Guardar", exact: true }).click();
      await page.waitForTimeout(400);
      check(`CA-08 ${ancho}: no se puede guardar sin corregir`, (await textoError(panel, "documento")) !== null && (await panel.innerText()).includes("Corregí los datos marcados"));
      await page.screenshot({ path: path.join(outDir, `${ancho}-agenda-revisar-datos.png`), fullPage: true });
      await panel.getByRole("button", { name: "Cancelar" }).click();
    }
    await page.getByPlaceholder(/Buscar/).first().fill("").catch(() => undefined);

    // Alta: errores por campo.
    await page.getByRole("button", { name: escritorio ? "Nuevo cliente" : /^Nuevo/ }).first().click();
    const form = escritorio ? page.locator(".catalogo-panel").first() : page.getByRole("dialog", { name: "Nuevo cliente" });
    await form.waitFor();
    await form.getByLabel("Tipo de documento").selectOption("RUC");
    const doc = form.getByRole("textbox", { name: /^Documento/ });

    await doc.fill("80012345-1");
    await form.getByLabel("Nombre o razón social").click();
    await page.waitForTimeout(300);
    const e1 = await textoError(form, "documento");
    check(`CA-01 ${ancho}: RUC 80012345-1 rechazado con el DV correcto en el mensaje`, /corresponde es 0/.test(e1 ?? ""), e1);
    // 99999901 no esta en el padron local: el padron no completa el DV y FS lo pide (D-2).
    await doc.fill("99999901");
    await form.getByLabel("Nombre o razón social").click();
    await page.waitForTimeout(1200);
    const e2 = await textoError(form, "documento");
    check(`CA-01 ${ancho}: RUC sin DV pide el DV`, /Falta el dígito verificador/.test(e2 ?? ""), e2);
    await doc.fill("xxx");
    await form.getByLabel("Nombre o razón social").click();
    check(`CA-01 ${ancho}: RUC "xxx" rechazado`, /Falta el dígito verificador/.test((await textoError(form, "documento")) ?? ""));

    await form.getByLabel("Nombre o razón social").fill("ABC");
    await form.getByLabel("Teléfono").click();
    check(`CA-04 ${ancho}: nombre de 3 letras rechazado`, /entre 4 y 255/.test((await textoError(form, "razon_social")) ?? ""));
    await form.getByLabel("Teléfono").fill("12345");
    await form.getByLabel("Correo").click();
    check(`CA-03 ${ancho}: telefono de 5 numeros rechazado`, /entre 6 y 15/.test((await textoError(form, "telefono")) ?? ""));
    await form.getByLabel("Correo").fill("juan @mail.com");
    await form.getByLabel("Teléfono").click();
    check(`CA-02 ${ancho}: correo con espacio rechazado`, /correo no es válido/.test((await textoError(form, "email")) ?? ""));
    await form.getByRole("button", { name: "Guardar", exact: true }).click();
    await page.waitForTimeout(400);
    check(`RV-09 ${ancho}: no guarda y lo dice`, (await form.innerText()).includes("Corregí los datos marcados"));
    await page.screenshot({ path: path.join(outDir, `${ancho}-agenda-errores.png`), fullPage: !escritorio ? false : true });

    // Alta valida con normalizacion (CI unica para no chocar con datos previos).
    const ci = String(9000000 + (Date.now() % 900000));
    const nombre = `Prueba  VAL  ${ancho}`;
    await form.getByLabel("Tipo de documento").selectOption("CI");
    await doc.fill(ci);
    await form.getByLabel("Nombre o razón social").fill(nombre);
    await form.getByLabel("Teléfono").fill("+595 (981) 123-456");
    await form.getByLabel("Correo").fill("  prueba.val@mail.com ");
    check(`CA-01/02/03 ${ancho}: sin errores con datos validos`, (await form.locator("[data-campo-error]").count()) === 0);
    await form.getByRole("button", { name: "Guardar", exact: true }).click();
    await page.waitForTimeout(1200);
    const guardado = JSON.parse(
      sql(`select row_to_json(x) from (select fc.razon_social, fc.telefono, fc.email::text as email from facturador_clientes fc join cliente_identidades ci on ci.id = fc.cliente_identidad_id where ci.documento = '${ci}' and fc.deleted_at is null) x`) || "null"
    );
    check(`CA-03/04 ${ancho}: se guarda normalizado (telefono solo digitos, un espacio, correo recortado)`, guardado?.telefono === "595981123456" && guardado?.razon_social === `Prueba VAL ${ancho}` && guardado?.email === "prueba.val@mail.com", JSON.stringify(guardado));
    sql(`update facturador_clientes set deleted_at = now() where cliente_identidad_id in (select id from cliente_identidades where documento = '${ci}')`);
    check(`RV ${ancho}: agenda sin desplazamiento horizontal`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    check(`RV ${ancho}: agenda sin emojis`, !EMOJI.test(await page.locator("main").innerText()));
  } catch (e) {
    check(`agenda ${ancho}: sin excepciones`, false, e.message);
    await page.screenshot({ path: path.join(outDir, `${ancho}-agenda-error.png`), fullPage: true }).catch(() => undefined);
  } finally {
    await ctx.close();
  }
}

async function casoEditor(browser, ancho, alto) {
  const { ctx, page } = await entrar(browser, ancho, alto);
  try {
    await abrirVista(page, "Nueva factura");
    const seccion = page.locator("section.client-section");
    await seccion.waitFor();
    await seccion.locator(".cliente-fila select").first().selectOption("RUC");
    const numero = seccion.getByPlaceholder("Ingresá el número de documento");
    await numero.fill("80012345-1");
    await seccion.getByLabel("Nombre o razón social").click();
    await page.waitForTimeout(600);
    const e1 = await textoError(seccion, "documento");
    check(`CA-01 editor ${ancho}: RUC con DV incorrecto marcado bajo el numero`, /corresponde es 0/.test(e1 ?? ""), e1);
    await seccion.getByLabel("Nombre o razón social").fill("Empresa de prueba SA");
    // El motivo del cliente va antes que el de las lineas (RN-04), asi que no hace falta cargar lineas.
    await page.waitForTimeout(900);
    const motivo = (await page.locator(".motivo-bloqueo").first().innerText().catch(() => "")).trim();
    check(`RV-09 editor ${ancho}: "Crear factura" bloqueado con el motivo del cliente`, /Corregí los datos del cliente/.test(motivo), motivo);
    await page.screenshot({ path: path.join(outDir, `${ancho}-editor-ruc-invalido.png`), fullPage: true });

    // CA-07: DV escrito distinto al del padron de la DNIT (RUC del padron local 80136968-1).
    await numero.fill("80136968-2");
    await numero.press("Tab");
    await page.waitForTimeout(1500);
    const aviso = (await seccion.locator(".aviso").first().innerText().catch(() => "")).trim();
    check(`CA-07 editor ${ancho}: aviso con el RUC de la DNIT y boton para usarlo`, /Según la DNIT el RUC es 80136968-1/.test(aviso), aviso);
    const usar = seccion.getByRole("button", { name: "Usar 80136968-1" });
    if ((await usar.count()) > 0) {
      await usar.click();
      await page.waitForTimeout(800);
      check(`CA-07 editor ${ancho}: "Usar" corrige el numero y quita el error`, (await numero.inputValue()) === "80136968-1" && (await textoError(seccion, "documento")) === null);
    }

    // Correo invalido abre los opcionales y bloquea.
    const opcionales = seccion.getByRole("button", { name: /dirección, teléfono y correo/i });
    if ((await seccion.getByLabel("Correo").count()) === 0) await opcionales.click();
    await seccion.getByLabel("Correo").fill("cliente@dominio");
    await seccion.getByLabel("Teléfono").click();
    await page.waitForTimeout(600);
    check(`CA-02 editor ${ancho}: correo sin dominio marcado`, /correo no es válido/.test((await textoError(seccion, "email")) ?? ""));
    const motivo2 = (await page.locator(".motivo-bloqueo").first().innerText().catch(() => "")).trim();
    check(`CA-02 editor ${ancho}: bloquea con el motivo del correo`, /correo no es válido/.test(motivo2), motivo2);
    await seccion.getByLabel("Correo").fill("");
    await page.waitForTimeout(900);
    check(`CA-02 editor ${ancho}: correo vacio no bloquea por el cliente`, !/Corregí los datos del cliente/.test((await page.locator(".motivo-bloqueo").first().innerText().catch(() => "")).trim()));
    check(`RV editor ${ancho}: sin desplazamiento horizontal`, await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.screenshot({ path: path.join(outDir, `${ancho}-editor-dnit.png`), fullPage: true });
  } catch (e) {
    check(`editor ${ancho}: sin excepciones`, false, e.message);
    await page.screenshot({ path: path.join(outDir, `${ancho}-editor-error.png`), fullPage: true }).catch(() => undefined);
  } finally {
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  const invalido = crearClienteInvalido();
  try {
    for (const [ancho, alto] of [
      [1440, 900],
      [1280, 800],
      [390, 844]
    ]) {
      await casoAgenda(browser, ancho, alto, invalido);
      await casoEditor(browser, ancho, alto);
    }
  } finally {
    borrarClienteInvalido(invalido.identidad);
    await browser.close();
  }
  const fallas = resultados.filter((r) => !r.ok).length;
  fs.writeFileSync(path.join(outDir, "resultado.json"), JSON.stringify(resultados, null, 2));
  console.log(`\n${resultados.length - fallas}/${resultados.length} OK`);
  process.exit(fallas ? 1 : 0);
})();
