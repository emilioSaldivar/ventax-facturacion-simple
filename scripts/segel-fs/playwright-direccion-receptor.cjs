#!/usr/bin/env node
// Direccion del cliente en la factura (SPEC_DIRECCION_RECEPTOR_v0.1, TASKS DIR-011 a DIR-014). Stack local de Segel.
//
//   ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/segel-fs/playwright-direccion-receptor.cjs [caso ...]
//
// Casos sin emitir: pantalla (CA-03, CA-04b, CA-05; 1440 y 1280 en modo completo, 390 en modo simple) y agenda (CA-04).
// Casos que EMITEN en SIFEN test (avisar a FE antes): sifen (CA-01 domicilio completo y CA-02 calle sola; lee el XML en
// la base de fe-segel y el KuDE) y ciudad-larga (ciudad 6531 por la API: FE responde 422 antes de numerar).
// Variables: SEGEL_APP_URL, ENSAYO_USER, ENSAYO_RUC, ENSAYO_NOMBRE, FE_PG_CONTAINER. Escribe test-results/direccion-receptor/.
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
const FE_PG = process.env.FE_PG_CONTAINER ?? "fe-segel-postgres-1";
const ESPERA_APROBACION_MS = Number(process.env.ENSAYO_ESPERA_MS ?? 25 * 60 * 1000);
const outDir = path.join(process.cwd(), "test-results", "direccion-receptor");
fs.mkdirSync(outDir, { recursive: true });
const pedidos = process.argv.slice(2);
const SIN_EMITIR = ["pantalla", "agenda"];
const corre = (caso) => (pedidos.length === 0 ? SIN_EMITIR.includes(caso) : pedidos.includes(caso));

const CALLE = "Avda. Mcal. López c/ Ñandutí";
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

async function api(page, metodo, ruta, cuerpo, extra = {}) {
  return page.evaluate(
    async ({ metodo, ruta, cuerpo, token, extra }) => {
      const r = await fetch(`/api/v1${ruta}`, {
        method: metodo,
        credentials: "include",
        headers: { "content-type": "application/json", authorization: token, ...extra },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined
      });
      let json = null;
      try {
        json = await r.json();
      } catch {}
      return { status: r.status, json };
    },
    { metodo, ruta, cuerpo, token: page.__token ?? "", extra }
  );
}

async function cliente(page) {
  await page.getByPlaceholder("Ingresá el número de documento").fill(RUC);
  await page.getByPlaceholder("Ingresá el número de documento").press("Tab");
  await page.waitForTimeout(1200);
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
}

const seccion = (page) => page.locator("fieldset.direccion-cliente");
async function quitarSiAbierta(page) {
  if (await seccion(page).count()) await page.getByRole("button", { name: "Quitar dirección" }).click();
}
async function opcionesCiudad(page) {
  const sel = seccion(page).getByLabel("Ciudad", { exact: true });
  await page.waitForFunction((el) => el && el.options.length > 1, await sel.elementHandle(), { timeout: 20000 });
  return sel.evaluate((el) => [...el.options].slice(1).map((o) => o.textContent.trim()));
}
async function domicilio(page, { calle = CALLE, numero = "1234", departamento = "CENTRAL", ciudad = "LUQUE" } = {}) {
  if (!(await seccion(page).count())) await page.getByRole("button", { name: "Agregar dirección" }).click();
  await seccion(page).getByLabel("Calle", { exact: true }).fill(calle);
  await seccion(page).getByLabel("Nº de casa", { exact: true }).fill(numero);
  await seccion(page).getByLabel("Departamento", { exact: true }).selectOption({ label: departamento });
  await opcionesCiudad(page);
  await seccion(page).getByLabel("Ciudad", { exact: true }).selectOption({ label: ciudad });
}
async function previaCon(page, cond) {
  const fin = Date.now() + 6000;
  while (Date.now() < fin) {
    if (page.__ultimaPrevia && cond(page.__ultimaPrevia.cliente ?? {})) return true;
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
    check(`RN-02 ${tag}: la seccion de direccion arranca cerrada`, (await seccion(page).count()) === 0 && (await page.getByRole("button", { name: "Agregar dirección" }).isVisible()));
    await cliente(page);
    if (modo === "completo") await lineaGrilla(page, "Servicio direccion DIR", "100000");
    else await lineaSimple(page, "Servicio direccion DIR", "100000");
    await quitarSiAbierta(page);
    await page.getByRole("button", { name: "Agregar dirección" }).click();
    check(`CA-04b ${tag}: "Agregar dirección" abre calle, numero, departamento y ciudad`, (await seccion(page).getByLabel("Calle", { exact: true }).isVisible()) && (await seccion(page).getByLabel("Departamento", { exact: true }).isVisible()) && (await seccion(page).getByLabel("Ciudad", { exact: true }).isDisabled()));

    // CA-03: caracteres.
    await seccion(page).getByLabel("Calle", { exact: true }).fill("Casa 🏠 azul");
    await page.waitForTimeout(400);
    let t = await texto(page);
    check(`CA-03 ${tag}: un emoji se rechaza con el mensaje`, t.includes("La dirección tiene caracteres no permitidos: 🏠"), t.slice(0, 200));
    check(`CA-03 ${tag}: y bloquea Crear factura`, await page.getByRole("button", { name: "Crear factura" }).isDisabled());
    await seccion(page).getByLabel("Calle", { exact: true }).fill(CALLE);
    await page.waitForTimeout(400);
    t = await texto(page);
    check(`CA-03 ${tag}: "${CALLE}" se acepta`, !t.includes("caracteres no permitidos"));
    check(`RN-02 ${tag}: incompleta muestra el aviso`, t.includes("Completá calle, número, departamento y ciudad para que la dirección salga en la factura."));
    check(`RN-02 ${tag}: incompleta no bloquea`, await previaCon(page, (c) => c.direccion === CALLE && !c.ciudad));

    // CA-04b y CA-05: listas encadenadas.
    await seccion(page).getByLabel("Departamento", { exact: true }).selectOption({ label: "CENTRAL" });
    const central = await opcionesCiudad(page);
    check(`CA-04b ${tag}: Central ofrece LUQUE y no ENCARNACION`, central.includes("LUQUE") && !central.includes("ENCARNACION"), `${central.length} ciudades`);
    check(`CA-04b ${tag}: ciudades en orden alfabetico`, central.join("|") === [...central].sort((a, b) => a.localeCompare(b, "es")).join("|"));
    check(`CA-05 ${tag}: ninguna ciudad de mas de 30 caracteres`, central.every((c) => c.length <= 30));
    await seccion(page).getByLabel("Ciudad", { exact: true }).selectOption({ label: "LUQUE" });
    await seccion(page).getByLabel("Departamento", { exact: true }).selectOption({ label: "ITAPUA" });
    check(`CA-04b ${tag}: cambiar el departamento vacia la ciudad`, (await seccion(page).getByLabel("Ciudad", { exact: true }).inputValue()) === "");
    const itapua = await opcionesCiudad(page);
    check(`CA-04b ${tag}: Itapua ofrece ENCARNACION`, itapua.includes("ENCARNACION"));
    await domicilio(page);
    await page.waitForTimeout(400);
    t = await texto(page);
    check(`RN-02 ${tag}: completa no muestra el aviso`, !t.includes("Completá calle, número"));
    check(`RN-01 ${tag}: la vista previa lleva el domicilio`, await previaCon(page, (c) => c.numero_casa === "1234" && c.departamento > 0 && c.ciudad > 0 && c.distrito > 0), JSON.stringify(page.__ultimaPrevia?.cliente ?? {}).slice(0, 250));

    // CA-05 con la remision ya en el selector: no hace falta; el filtro es de la API (prueba de servicio).
    check(`CA-07 ${tag}: sin desplazamiento horizontal`, await sinDesborde(page));
    check(`CA-07 ${tag}: sin emojis en la pantalla`, !EMOJI.test(await texto(page)));
    await seccion(page).screenshot({ path: path.join(outDir, `${tag}-direccion.png`) });
    if (ancho < 720) {
      const alto44 = await seccion(page).getByLabel("Departamento", { exact: true }).evaluate((e) => e.getBoundingClientRect().height >= 44);
      check(`P-A ${tag}: listas de 44 px en celular`, alto44);
    }
    await page.getByRole("button", { name: "Quitar dirección" }).click();
    check(`RN-02 ${tag}: "Quitar dirección" cierra y vacia`, (await seccion(page).count()) === 0 && (await previaCon(page, (c) => !c.ciudad && !c.direccion)));
  } catch (e) {
    check(`pantalla ${tag}: sin excepciones`, false, e.message);
    await page.screenshot({ path: path.join(outDir, `${tag}-error.png`), fullPage: true }).catch(() => undefined);
  } finally {
    await ctx.close();
  }
}

async function casoAgenda(browser) {
  const { ctx, page } = await entrar(browser, 1440, 900, "completo");
  try {
    const doc = `9${String(Date.now()).slice(-6)}`;
    const alta = await api(page, "POST", "/clientes", { documento_tipo: "CI", documento: doc, razon_social: "Cliente Direccion DIR" });
    check("CA-04: alta de cliente sin direccion por la API", alta.status === 200 || alta.status === 201, String(alta.status));
    await abrirVista(page, "Agenda / Clientes");
    await page.getByLabel(/Buscar/).first().fill(doc);
    await page.waitForTimeout(800);
    await page.locator("tr", { hasText: "Cliente Direccion DIR" }).getByRole("button", { name: /Más opciones|Opciones|más/i }).first().click().catch(() => undefined);
    const editar = page.getByRole("menuitem", { name: /Editar/ });
    if (await editar.count()) await editar.click();
    else await page.locator("tr", { hasText: "Cliente Direccion DIR" }).click();
    await page.getByRole("button", { name: "Agregar dirección" }).waitFor();
    check("RN-02 agenda: sin direccion, la seccion esta cerrada", (await seccion(page).count()) === 0);
    await domicilio(page, { calle: "Cerro León c/ Alejo García", numero: "0" });
    await page.getByRole("button", { name: /^Guardar/ }).click();
    await page.waitForTimeout(1200);
    const leido = (await api(page, "GET", `/clientes?q=${doc}&limit=5&offset=0`)).json?.items?.[0] ?? {};
    check("CA-04 agenda: guarda calle, numero, departamento y ciudad", leido.direccion === "Cerro León c/ Alejo García" && leido.numero_casa === "0" && leido.departamento_descripcion === "CENTRAL" && leido.ciudad_descripcion === "LUQUE", JSON.stringify(leido).slice(0, 300));
    const fila = (await page.locator("tr", { hasText: "Cliente Direccion DIR" }).innerText()).replace(/\s+/g, " ");
    check("RN-08 agenda: la lista muestra calle, Nº, ciudad y departamento", fila.includes("Cerro León c/ Alejo García Nº 0, LUQUE (CENTRAL)"), fila);
    await page.screenshot({ path: path.join(outDir, "agenda.png"), fullPage: true });
  } catch (e) {
    check("agenda: sin excepciones", false, e.message);
    await page.screenshot({ path: path.join(outDir, "agenda-error.png"), fullPage: true }).catch(() => undefined);
  } finally {
    await ctx.close();
  }
}

function xmlRecDe(numero) {
  const sql = `select status, regexp_replace(coalesce(substring(xml_signed from '<gDatRec>.*?</gDatRec>'),''),'\\s+',' ','g') from de_documents where tipo_documento='FE' and numero='${numero}' order by created_at desc limit 1`;
  return execFileSync("docker", ["exec", FE_PG, "sh", "-c", `psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -c "${sql.replace(/"/g, '\\"')}"`], { encoding: "utf8" }).trim();
}

async function emitir(page, etiqueta, total) {
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
  let kude = "";
  const enlace = page.locator('a[href$="kude.pdf"]').first();
  if (aprobada && (await enlace.count())) {
    const resp = await page.request.get(new URL(await enlace.getAttribute("href"), base).toString());
    if (resp.ok()) {
      const pdf = path.join(outDir, `${etiqueta}-kude.pdf`);
      fs.writeFileSync(pdf, await resp.body());
      kude = execFileSync("pdftotext", ["-layout", pdf, "-"], { encoding: "utf8" }).replace(/\s+/g, " ");
      fs.writeFileSync(path.join(outDir, `${etiqueta}-kude.txt`), kude);
    }
  }
  await page.screenshot({ path: path.join(outDir, `${etiqueta}.png`), fullPage: true });
  return { numero, aprobada, estado: d?.estado ?? estado, uuid: d?.document_uuid ?? null, cdc: d?.cdc ?? null, kude };
}

async function casoSifen(browser) {
  const emitidas = [];
  // CA-01: domicilio completo.
  {
    const { ctx, page } = await entrar(browser, 1440, 900, "completo");
    try {
      await abrirVista(page, "Nueva factura");
      await page.locator("table.grilla-lineas").waitFor();
      await cliente(page);
      await lineaGrilla(page, "Servicio con domicilio DIR", "10150");
      await quitarSiAbierta(page);
      await domicilio(page);
      const r = await emitir(page, "sifen-domicilio", 10150);
      emitidas.push({ caso: "domicilio completo", ...r, kude: undefined });
      check(`CA-01: aprobada en SIFEN test (${r.numero ?? "sin numero"}, ${r.estado})`, r.aprobada);
      const numero7 = (r.numero ?? "").slice(-7);
      const xml = r.numero ? xmlRecDe(numero7) : "";
      fs.writeFileSync(path.join(outDir, "sifen-domicilio-gDatRec.txt"), xml);
      check("CA-01: el XML lleva dDirRec, dNumCasRec 1234, CENTRAL y LUQUE", xml.includes(`<dDirRec>${CALLE}</dDirRec>`) && xml.includes("<dNumCasRec>1234</dNumCasRec>") && xml.includes("CENTRAL") && xml.includes("LUQUE"), xml.slice(0, 300));
      const linea = (r.kude.match(/Direcci[oó]n:.{0,120}/) ?? [""])[0];
      check("CA-01 (rc4.37): el KuDE imprime calle, Nº, ciudad y departamento", linea.includes("Ñandutí") && linea.includes("1234") && linea.includes("LUQUE") && linea.includes("CENTRAL"), linea);
    } catch (e) {
      check("sifen domicilio: sin excepciones", false, e.message);
    } finally {
      await ctx.close();
    }
  }
  // CA-02: calle sola (domicilio incompleto): se emite sin domicilio en el XML.
  {
    const { ctx, page } = await entrar(browser, 1440, 900, "completo");
    try {
      await abrirVista(page, "Nueva factura");
      await page.locator("table.grilla-lineas").waitFor();
      await cliente(page);
      await lineaGrilla(page, "Servicio con calle sola DIR", "10250");
      await quitarSiAbierta(page);
      await page.getByRole("button", { name: "Agregar dirección" }).click();
      await seccion(page).getByLabel("Calle", { exact: true }).fill("Solo la calle 123");
      await page.waitForTimeout(400);
      check("CA-02: el aviso de direccion incompleta se ve antes de emitir", (await texto(page)).includes("Completá calle, número, departamento y ciudad"));
      const r = await emitir(page, "sifen-calle-sola", 10250);
      emitidas.push({ caso: "calle sola", ...r, kude: undefined });
      check(`CA-02: aprobada en SIFEN test (${r.numero ?? "sin numero"}, ${r.estado})`, r.aprobada);
      const xml = r.numero ? xmlRecDe((r.numero ?? "").slice(-7)) : "";
      check("CA-02: el XML no lleva dDirRec", r.numero && !xml.includes("<dDirRec>"), xml.slice(0, 200));
    } catch (e) {
      check("sifen calle sola: sin excepciones", false, e.message);
    } finally {
      await ctx.close();
    }
  }
  fs.writeFileSync(path.join(outDir, "sifen-emitidas.json"), JSON.stringify(emitidas, null, 2));
  console.log(JSON.stringify(emitidas, null, 2));
}

// FS-155: la ciudad 6531 (mas de 30 caracteres) no se ofrece en pantalla; por la API, FE la rechaza antes de numerar.
async function casoCiudadLarga(browser) {
  const { ctx, page } = await entrar(browser, 1440, 900, "completo");
  try {
    const r = await api(page, "POST", "/facturas", {
      condicion_venta: "CONTADO",
      tipo_transaccion: 2,
      cliente: { documento_tipo: "RUC", documento: RUC, razon_social: NOMBRE, direccion: "Calle de prueba", numero_casa: "0", departamento: 2, distrito: 281, ciudad: 6531 },
      items: [{ descripcion: "Prueba ciudad larga DIR", cantidad: 1, precio_unitario: 10350, iva_tipo: "IVA_10" }]
    }, { "Idempotency-Key": `dir-ciudad-larga-${Date.now()}` });
    // La emision va por cola: se espera el estado final del documento.
    let d = r.json ?? {};
    for (let i = 0; i < 20 && d.id && ["EMITIENDO", "PENDIENTE_SIFEN"].includes(d.estado); i += 1) {
      await page.waitForTimeout(6000);
      d = (await api(page, "GET", `/facturas/${d.id}`)).json ?? d;
    }
    fs.writeFileSync(path.join(outDir, "ciudad-larga.json"), JSON.stringify(d, null, 2));
    const sinNumero = !d.numero_fiscal;
    const motivo = JSON.stringify(d.accion_detalle ?? d).slice(0, 600);
    check("FS-155: la ciudad 6531 no consume numero", sinNumero, motivo);
    check("FS-155: el pedido llego a FE (no es un error de FS)", r.status !== 400 || !/Idempotency/i.test(motivo), `${r.status}`);
    check("FS-155: queda en error para corregir (no rechazo de SIFEN)", d.estado === "ERROR_OPERATIVO", `${r.status} ${d.estado ?? ""}`);
    // FS muestra el codigo generico de FE (VALIDATION_ERROR), sin el detalle: es FS-93. Se informa, no se exige.
    check("FS-155: sin document_uuid (FE no creo el documento)", !d.document_uuid, String(d.document_uuid));
    console.log(`INFO FS-155 motivo para el operador: ${d.accion_detalle?.descripcion ?? "-"}`);
  } catch (e) {
    check("ciudad-larga: sin excepciones", false, e.message);
  } finally {
    await ctx.close();
  }
}


// Punta a punta (pedido del usuario, 2026-11-13): nota de credito total sobre la factura con domicilio. FE arma la
// nota con el receptor de la factura; se lee el KuDE de la nota.
async function casoSifenNc(browser) {
  const { ctx, page } = await entrar(browser, 1440, 900, "completo");
  try {
    const objetivo = process.env.ENSAYO_NC_FACTURA ?? "1010682";
    const lista = await api(page, "GET", `/facturas?tipo=FACTURA&q=${objetivo}&limit=10&offset=0`);
    const fac = (lista.json?.items ?? []).find((d) => (d.numero_fiscal ?? "").endsWith(objetivo));
    check(`NC: factura ${objetivo} encontrada y emitida`, fac?.estado === "EMITIDA", fac?.estado ?? "no encontrada");
    if (!fac) return;
    const r = await api(page, "POST", `/facturas/${fac.id}/nota-credito`, { motivo: "Devolucion total de prueba de punta a punta DIR" }, { "Idempotency-Key": `dir-nc-${Date.now()}` });
    let nc = r.json ?? {};
    check("NC: la API acepto la nota total", r.status === 200 || r.status === 201, `${r.status} ${JSON.stringify(nc).slice(0, 200)}`);
    const inicio = Date.now();
    while (nc.id && !["EMITIDA", "RECHAZADA", "ERROR_OPERATIVO"].includes(nc.estado) && Date.now() - inicio < ESPERA_APROBACION_MS) {
      await page.waitForTimeout(20000);
      nc = (await api(page, "GET", `/facturas/${nc.id}`)).json ?? nc;
    }
    check(`NC: ${nc.numero_fiscal ?? "sin numero"} aprobada en SIFEN test`, nc.estado === "EMITIDA", nc.estado);
    check("NC: el total es el de la factura", Math.abs(Number(nc.totals?.total) - Number(fac.totals?.total)) < 0.005, `${nc.totals?.total} vs ${fac.totals?.total}`);
    if (nc.estado === "EMITIDA") {
      const link = await api(page, "POST", `/facturas/${nc.id}/delivery-link`, {});
      const resp = await page.request.get(new URL(`${link.json.public_url}/kude.pdf`.replace("localhost", "127.0.0.1")).toString());
      const pdf = path.join(outDir, "sifen-nc-kude.pdf");
      fs.writeFileSync(pdf, await resp.body());
      const kude = execFileSync("pdftotext", ["-layout", pdf, "-"], { encoding: "utf8" }).replace(/\s+/g, " ");
      const linea = (kude.match(/Direcci[oó]n:.{0,90}/) ?? [""])[0];
      console.log(`INFO NC KuDE: ${linea}`);
      check("NC: el KuDE de la nota se descarga", resp.ok());
    }
    fs.writeFileSync(path.join(outDir, "sifen-nc.json"), JSON.stringify({ factura: fac.numero_fiscal, nc: nc.numero_fiscal, estado: nc.estado, cdc: nc.cdc }, null, 2));
  } catch (e) {
    check("sifen-nc: sin excepciones", false, e.message);
  } finally {
    await ctx.close();
  }
}


// DIR-018 (RN-08, D-6): la ficha muestra la direccion; si no fue a SIFEN, lo aclara. Usa las facturas de la ultima
// corrida `sifen` (sifen-emitidas.json) o ENSAYO_FICHA_COMPLETA / ENSAYO_FICHA_INCOMPLETA.
async function casoFicha(browser) {
  let completa = process.env.ENSAYO_FICHA_COMPLETA;
  let incompleta = process.env.ENSAYO_FICHA_INCOMPLETA;
  try {
    const e = JSON.parse(fs.readFileSync(path.join(outDir, "sifen-emitidas.json"), "utf8"));
    completa = completa ?? e.find((x) => x.caso === "domicilio completo")?.numero;
    incompleta = incompleta ?? e.find((x) => x.caso === "calle sola")?.numero;
  } catch {}
  for (const [ancho, alto, modo] of [[1440, 900, "completo"], [390, 844, "simple"]]) {
    for (const [num, esperaAclaracion] of [[completa, false], [incompleta, true]]) {
      if (!num) {
        check(`DIR-018 ${ancho}: hay factura para el caso ${esperaAclaracion ? "incompleta" : "completa"}`, false, "correr antes el caso sifen");
        continue;
      }
      const { ctx, page } = await entrar(browser, ancho, alto, modo);
      try {
        await abrirVista(page, "Documentos");
        await page.getByPlaceholder("Buscar factura...").fill(num);
        await page.getByRole("button", { name: "Buscar", exact: true }).click().catch(() => undefined);
        await page.waitForTimeout(1500);
        const fila = page.locator("tr", { hasText: num }).first();
        if (await fila.count()) await fila.locator(".enlace-fila").first().click();
        else await page.getByText(num).first().click();
        await page.getByText("Dirección", { exact: true }).first().waitFor();
        const t = await texto(page);
        const tieneAclaracion = t.includes("No sale en la factura: falta número, departamento y ciudad.");
        check(`DIR-018 ${ancho}: ${num} ${esperaAclaracion ? "con" : "sin"} la aclaracion de direccion no enviada`, tieneAclaracion === esperaAclaracion, (t.match(/Dirección .{0,120}/) ?? [""])[0]);
        check(`DIR-018 ${ancho}: ${num} sin desborde`, await sinDesborde(page));
        await page.screenshot({ path: path.join(outDir, `ficha-${num}-${ancho}.png`), fullPage: true });
      } catch (e) {
        check(`ficha ${num} ${ancho}: sin excepciones`, false, e.message);
      } finally {
        await ctx.close();
      }
    }
  }
}

// DIR-014/DIR-019: KuDE de la ultima nota de remision aprobada (o ENSAYO_NRE): destinatario y punto de entrega.
async function casoKudeRemision(browser) {
  const { ctx, page } = await entrar(browser, 1440, 900, "completo");
  try {
    const lista = (await api(page, "GET", "/facturas?tipo=NOTA_REMISION&limit=10&offset=0")).json?.items ?? [];
    const nre = process.env.ENSAYO_NRE ? lista.find((d) => (d.numero_fiscal ?? "").endsWith(process.env.ENSAYO_NRE)) : lista.find((d) => d.estado === "EMITIDA");
    check(`KuDE remision: hay una nota aprobada (${nre?.numero_fiscal ?? "-"})`, nre?.estado === "EMITIDA");
    if (!nre) return;
    const link = await api(page, "POST", `/facturas/${nre.id}/delivery-link`, {});
    const resp = await page.request.get(`${link.json.public_url}/kude.pdf`.replace("localhost", "127.0.0.1"));
    const pdf = path.join(outDir, `kude-remision-${nre.numero_fiscal}.pdf`);
    fs.writeFileSync(pdf, await resp.body());
    const kude = execFileSync("pdftotext", ["-layout", pdf, "-"], { encoding: "utf8" }).replace(/\s+/g, " ");
    const destinatario = (kude.match(/Direccion: (?!Avda\.? Eusebio)(.{0,100}?) Motivo/) ?? kude.match(/Direccion: .{0,100}/) ?? [""])[0];
    check("KuDE remision: el destinatario lleva direccion con Nº, ciudad y departamento", /Direccion: \S.*Nº \d+, .+ - .+/.test(destinatario), destinatario);
    check("KuDE remision: rotulo \"Direccion del Punto de Entrega:\" completo", kude.includes("Direccion del Punto de Entrega:"));
    check("KuDE remision: rotulo \"Ciudad del Punto de Entrega:\" completo", kude.includes("Ciudad del Punto de Entrega:"));
    check("KuDE remision: departamento del punto de entrega", /Departamento del punto de entrega: \S/.test(kude));
    execFileSync("pdftoppm", ["-r", "120", "-png", "-f", "1", "-l", "1", pdf, path.join(outDir, `kude-remision-${nre.numero_fiscal}`)]);
  } catch (e) {
    check("kude-remision: sin excepciones", false, e.message);
  } finally {
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    if (corre("pantalla")) {
      const anchos = (process.env.ENSAYO_ANCHOS ?? "1440,1280,390").split(",").map(Number);
      for (const a of anchos) await casoPantalla(browser, a, a < 720 ? 844 : a === 1440 ? 900 : 800, a < 720 ? "simple" : "completo");
    }
    if (corre("agenda")) await casoAgenda(browser);
    if (corre("sifen")) await casoSifen(browser);
    if (corre("ciudad-larga")) await casoCiudadLarga(browser);
    if (corre("sifen-nc")) await casoSifenNc(browser);
    if (corre("ficha")) await casoFicha(browser);
    if (corre("kude-remision")) await casoKudeRemision(browser);
  } finally {
    await browser.close();
  }
  const fallas = resultados.filter((r) => !r.ok).length;
  fs.writeFileSync(path.join(outDir, "resultados.json"), JSON.stringify(resultados, null, 2));
  console.log(`\n${resultados.length - fallas}/${resultados.length} OK`);
  process.exit(fallas ? 1 : 0);
})();
