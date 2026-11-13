#!/usr/bin/env node
// Nota de credito sobre factura externa (SPEC_NOTA_CREDITO_FACTURA_EXTERNA_v0.1, TASKS NCX-009): CA-04 a CA-08 con el
// FE actual (segel-rc4.34). Solo stack local de Segel (.local/segel-ensayo, 18492) contra fe-segel en SIFEN test.
//
//   ENSAYO_PASSWORD_FILE=/ruta/operador-final.pass node scripts/segel-fs/playwright-nc-factura-externa.cjs
//
// Emite en SIFEN test UNA nota de credito: la total sobre una factura externa impresa cargada a mano (CA-05).
// CA-06 llama a FE con una referencia electronica externa y espera el 404 de FE antes de numerar (no gasta numero).
// CA-01 a CA-03 (factura externa real traida por CDC y NC aceptada por FE) esperan segel-rc4.35 (NCX-010).
// Escribe test-results/nc-factura-externa/.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const ESPERA_MS = Number(process.env.ENSAYO_ESPERA_MS ?? 25 * 60 * 1000);
const outDir = path.join(process.cwd(), "test-results", "nc-factura-externa");
fs.mkdirSync(outDir, { recursive: true });
// CDC real de una factura del emisor del ensayo que YA esta en FS (001-001-1010667), copiado del stack local.
const CDC_EN_FS = "01050570161001001101066712026111210175744287";
// Una NC real del mismo emisor (tipo 05), para el rechazo por tipo.
const CDC_NC = "05050570161001001101003412026111214303408548";
const marca = Date.now().toString(36).slice(-5);
// Numero impreso unico por corrida (7 digitos).
const numeroImpreso = String(Date.now()).slice(-7);

const resultados = [];
const emitidas = [];
let paginaActual = null;
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 400) });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 400)}` : ""}`);
}
const EMOJI = /[\p{Extended_Pictographic}]/u;
const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const plano = async (loc) => (await loc.innerText()).replace(/\s+/g, " ");

/** DV modulo 11 del CDC (MT150 §10.1.1), igual que packages/shared/src/fiscal/cdc.ts. */
function dvCdc(cdc43) {
  let peso = 2;
  let suma = 0;
  for (let i = cdc43.length - 1; i >= 0; i -= 1) {
    suma += Number(cdc43[i]) * peso;
    peso = peso === 11 ? 2 : peso + 1;
  }
  const resto = suma % 11;
  return resto < 2 ? 0 : 11 - resto;
}
// CDC bien formado del mismo emisor con un numero que no existe en FS ni en FE (para CA-06): 001-001-9 + 6 digitos.
const cdc43 = CDC_EN_FS.slice(0, 17) + `9${numeroImpreso.slice(-6)}` + CDC_EN_FS.slice(24, 43);
const CDC_EXTERNO = cdc43 + String(dvCdc(cdc43));
const dvMalo = CDC_EN_FS.slice(0, 43) + String((Number(CDC_EN_FS[43]) + 1) % 10);

async function entrar(browser, ancho, alto) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
  const page = await ctx.newPage();
  paginaActual = page;
  page.setDefaultTimeout(30000);
  page.on("request", (r) => {
    const a = r.headers()["authorization"];
    if (a) page.__token = a;
  });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(usuario);
  await page.locator('input[name="password"]').fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await esperarSesion(page);
  // Tras un redespliegue la app ofrece "Nueva version disponible": se acepta para trabajar con el frontend nuevo.
  const actualizar = page.getByRole("button", { name: "Actualizar" });
  if (await actualizar.isVisible({ timeout: 3000 }).catch(() => false)) {
    await actualizar.click();
    await page.waitForLoadState("domcontentloaded");
    await esperarSesion(page);
  }
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
      const texto = await r.text();
      let json = null;
      try {
        json = JSON.parse(texto);
      } catch {}
      return { status: r.status, json };
    },
    { metodo, ruta, cuerpo, token: page.__token ?? "" }
  );
}

async function abrirTraerFactura(page) {
  await abrirVista(page, "Notas de crédito");
  await page.getByRole("button", { name: /La factura no está en el sistema/ }).click();
  await page.getByRole("heading", { name: "Traer una factura" }).waitFor();
}

/** Carga a mano una factura impresa (o electronica con `cdc`) y devuelve el texto de la ficha que se abre. */
async function cargarAMano(page, { numero, cdc, descripcion }) {
  await page.getByRole("button", { name: "Cargar a mano" }).click();
  if (cdc) {
    await page.getByRole("group", { name: "Tipo de factura" }).getByRole("button", { name: "Electrónica" }).click();
    await page.getByLabel("CDC", { exact: true }).fill(cdc);
  } else {
    await page.getByLabel("Timbrado").fill("12345678");
    await page.getByLabel("Establecimiento").fill("1");
    await page.getByLabel("Punto").fill("1");
    await page.getByLabel("Número").fill(numero);
    await page.getByLabel("Fecha de la factura").fill("2026-11-10");
  }
  await page.getByLabel("Documento", { exact: true }).fill("80026570-0");
  await page.getByLabel("Nombre o razón social").fill("SEGEL SA");
  await page.getByLabel("Descripción, línea 1").fill(`${descripcion} ${marca}`);
  await page.getByLabel("Cantidad, línea 1").fill("1");
  await page.getByLabel("Precio, línea 1").fill("110000");
  await page.getByRole("button", { name: "Guardar factura" }).click();
  await page.getByRole("button", { name: /Volver a resultados/ }).waitFor({ timeout: 20000 });
  return plano(page.locator(".document-detail"));
}

async function esperarAprobado(page, id, etiqueta) {
  const fin = Date.now() + ESPERA_MS;
  let d = null;
  while (Date.now() < fin) {
    d = (await api(page, "GET", `/facturas/${id}`)).json;
    if (d?.estado === "EMITIDA" && d?.cdc) break;
    if (["RECHAZADA", "ERROR_OPERATIVO"].includes(d?.estado)) break;
    await page.waitForTimeout(20000);
    await api(page, "POST", `/facturas/${id}/refresh-status`).catch(() => undefined);
  }
  emitidas.push({ etiqueta, id, numero: d?.numero_fiscal ?? null, estado: d?.estado ?? null, total: d?.totals?.total ?? null, sifen: d?.sifen_result_code ?? null, mensaje: d?.sifen_result_message ?? null });
  fs.writeFileSync(path.join(outDir, "emitidas.json"), JSON.stringify(emitidas, null, 2));
  return d;
}

(async () => {
  const browser = await chromium.launch();
  // ENSAYO_NC_EXTERNA_ID: solo verifica la aprobacion de una NC ya emitida por una corrida anterior (no emite otra).
  if (process.env.ENSAYO_NC_EXTERNA_ID) {
    const v = await entrar(browser, 1440, 900);
    const d = await esperarAprobado(v.page, process.env.ENSAYO_NC_EXTERNA_ID, "nc-impresa");
    check(`CA-05: NC ${d?.numero_fiscal} sobre factura impresa aprobada en SIFEN test`, d?.estado === "EMITIDA", JSON.stringify({ estado: d?.estado, sifen: d?.sifen_result_code, mensaje: d?.sifen_result_message }));
    await browser.close();
    fs.writeFileSync(path.join(outDir, "resultado-aprobacion.json"), JSON.stringify(resultados, null, 2));
    process.exit(resultados.every((r) => r.ok) ? 0 : 1);
  }
  try {
    const { ctx, page } = await entrar(browser, 1440, 900);

    // ---- CA-04: validaciones del CDC en pantalla y duplicado.
    await abrirTraerFactura(page);
    check("1440: pantalla Traer una factura sin emojis", !EMOJI.test(await plano(page.locator("main"))));
    await page.getByLabel("CDC", { exact: true }).fill(dvMalo);
    const consultar = page.getByRole("button", { name: "Consultar en SIFEN" });
    check("CA-04: CDC con DV malo deshabilita Consultar y explica", (await consultar.isDisabled()) && /dígito verificador/.test(await plano(page.locator(".nc-tarjeta").first())));
    await page.getByLabel("CDC", { exact: true }).fill(CDC_NC);
    check("CA-04: CDC de una nota de credito rechazado en pantalla", (await consultar.isDisabled()) && /no es de una factura/.test(await plano(page.locator(".nc-tarjeta").first())));
    await page.getByLabel("CDC", { exact: true }).fill(CDC_EN_FS.replace(/(\d{4})(?=\d)/g, "$1 "));
    await consultar.click();
    const aviso = await page.locator(".aviso-error").first().innerText({ timeout: 20000 }).catch(() => "");
    check("CA-04: CDC de una factura que ya esta en el sistema (1010667) responde ya existe", /ya está en el sistema/.test(aviso), aviso);
    await page.screenshot({ path: path.join(outDir, "1440-cdc-duplicado.png"), fullPage: true });
    const directa = await api(page, "POST", "/facturas/externas/sifen/previsualizar", { cdc: CDC_NC });
    check("CA-04 API: CDC de una NC responde 400 CDC_NO_ES_FACTURA", directa.status === 400 && directa.json?.error?.details?.reason === "CDC_NO_ES_FACTURA", JSON.stringify(directa.json?.error ?? {}).slice(0, 200));

    // ---- CA-05: factura impresa a mano y NC total real en SIFEN test.
    const ficha = await cargarAMano(page, { numero: numeroImpreso, descripcion: "Servicio impreso" });
    check("CA-05: la ficha dice Externa cargada a mano", /Externa · cargada a mano/.test(ficha) && /timbrado 12345678/.test(ficha), ficha.slice(0, 300));
    check("CA-07: la externa no ofrece PDF ni enlace ni anular, ni pasos de emision", /no tiene PDF ni enlace/.test(ficha) && !/Anular factura/.test(ficha) && !/Enviada a SIFEN/.test(ficha));
    await page.screenshot({ path: path.join(outDir, "1440-ficha-externa.png"), fullPage: true });
    // La ficha abierta es la de la externa recien guardada: se ubica entre las facturas mas nuevas por su numero.
    const lista = await api(page, "GET", "/facturas?tipo=FACTURA&limit=20&offset=0");
    const externa = (lista.json?.items ?? []).find((d) => d.origen === "MANUAL" && d.numero_fiscal === `001-001-${numeroImpreso.padStart(7, "0")}`);
    check("CA-05 API: guardada con origen MANUAL, numero con ceros y total 110.000", externa && externa.numero_fiscal === `001-001-${numeroImpreso.padStart(7, "0")}` && externa.totals.total === 110000, JSON.stringify(externa ? { n: externa.numero_fiscal, t: externa.totals.total, ref: externa.referencia_impresa } : null));
    const kude = await api(page, "POST", `/facturas/${externa?.id}/delivery-link`, {});
    check("CA-07 API: sin enlace para compartir (409 FACTURA_EXTERNA)", kude.status === 409 && kude.json?.error?.details?.reason === "FACTURA_EXTERNA", JSON.stringify(kude.json?.error ?? {}).slice(0, 200));

    const boton = page.getByRole("button", { name: /Crear nota de cr[eé]dito/ }).first();
    await page.waitForFunction((b) => b && !b.disabled, await boton.elementHandle(), { timeout: 20000 });
    // SPEC_NOTA_CREDITO_UNIFICADA_v0.1 D-8: la ficha abre la pantalla de Notas de credito con la factura elegida.
    await boton.click();
    await page.getByRole("heading", { name: "Qué se devuelve o ajusta" }).waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "Toda la factura" }).click();
    await page.getByLabel("Detalle para el cliente").fill(`Devolucion de factura impresa ${marca}`);
    let nota = null;
    // ENSAYO_EXTERNA_CON_NOTA_ID: la NC real ya se emitio en una corrida anterior; aca solo se abre la pantalla.
    const sinEmitir = Boolean(process.env.ENSAYO_EXTERNA_CON_NOTA_ID);
    if (sinEmitir) {
      const panel = await plano(page.locator(".nc-panel"));
      check("CA-05: la pantalla de NC se abre sobre la externa con la factura entera", /factura entera/.test(panel) && (await page.getByRole("button", { name: "Emitir nota de crédito" }).isEnabled()), panel.slice(0, 200));
      await page.screenshot({ path: path.join(outDir, "1440-ventana-nc-externa.png"), fullPage: true });
    } else {
      await page.getByRole("button", { name: "Emitir nota de crédito" }).click();
      const resultado = page.getByRole("button", { name: /Crear nueva/ }).first();
      const emitida = await resultado.waitFor({ timeout: 90000 }).then(() => true, () => false);
      check("CA-05: NC total sobre la impresa emitida desde la ficha", emitida, emitida ? await plano(page.locator(".nc-espacio")) : await plano(page.locator(".nc-panel")).catch(() => ""));
      await page.screenshot({ path: path.join(outDir, "1440-nc-impresa.png"), fullPage: true });
      const notas = (await api(page, "GET", "/facturas?tipo=NOTA_CREDITO&limit=20&offset=0")).json?.items ?? [];
      nota = notas.find((n) => n.documento_relacionado_id === externa?.id) ?? null;
      check("CA-05: la NC guardada referencia a la externa", Boolean(nota), JSON.stringify(nota ? { id: nota.id, estado: nota.estado } : null));
    }
    // Cierra el aviso de la nota emitida antes de seguir navegando.
    await page.reload({ waitUntil: "domcontentloaded" });
    await esperarSesion(page);

    // ---- CA-06: referencia electronica externa: FE (rc4.34) la rechaza con 404 antes de numerar.
    await abrirTraerFactura(page);
    const fichaElectronica = await cargarAMano(page, { cdc: CDC_EXTERNO, descripcion: "Servicio electronico" });
    check("CA-06: externa con CDC a mano guardada (aviso de datos no verificados)", /datos no verificados en SIFEN/.test(fichaElectronica), fichaElectronica.slice(0, 200));
    const externaElectronica = ((await api(page, "GET", "/facturas?tipo=FACTURA&limit=10&offset=0")).json?.items ?? []).find((d) => d.cdc === CDC_EXTERNO);
    const rechazo = await api(page, "POST", `/facturas/${externaElectronica?.id}/nota-credito`, { motivo: "Prueba sin soporte de FE" });
    // rc4.34: 404 → NOTA_CREDITO_FE_SIN_SOPORTE_EXTERNA. rc4.35 (BL-213): FE consulta SIFEN, el CDC armado no existe
    // (2403) → 422 INVALID_REFERENCED_DOCUMENT con el motivo de FE. En los dos casos, 409 sin numerar ni guardar nota.
    const razon = rechazo.json?.error?.details?.reason ?? rechazo.json?.error?.details?.fe_code;
    check(
      "CA-06 API: FE rechaza la NC sobre un CDC externo inexistente antes de numerar (409) y no se guarda nota",
      rechazo.status === 409 && ["NOTA_CREDITO_FE_SIN_SOPORTE_EXTERNA", "INVALID_REFERENCED_DOCUMENT"].includes(razon),
      JSON.stringify(rechazo.json?.error ?? {}).slice(0, 300)
    );
    const sinNota = ((await api(page, "GET", "/facturas?tipo=NOTA_CREDITO&limit=20&offset=0")).json?.items ?? []).every((n) => n.documento_relacionado_id !== externaElectronica?.id);
    check("CA-06: no quedo nota de credito sobre esa externa", sinNota);

    // ---- RN-09: eliminar la externa electronica (sin notas).
    await page.getByRole("button", { name: "Eliminar factura externa" }).click();
    await page.getByRole("button", { name: "Eliminar", exact: true }).click();
    await page.waitForTimeout(1500);
    const borrada = await api(page, "GET", `/facturas/${externaElectronica?.id}`);
    check("RN-09: la externa sin notas se elimina", borrada.status === 404, String(borrada.status));
    const conNotas = await api(page, "DELETE", `/facturas/externas/${process.env.ENSAYO_EXTERNA_CON_NOTA_ID ?? externa?.id}`);
    check("RN-09 API: la externa con nota no se elimina (409)", conNotas.status === 409, JSON.stringify(conNotas.json?.error ?? {}).slice(0, 200));
    await ctx.close();

    // ---- CA-08: 1280 y 390.
    for (const [ancho, alto] of [[1280, 800], [390, 844]]) {
      const v = await entrar(browser, ancho, alto);
      await abrirTraerFactura(v.page);
      await v.page.getByLabel("CDC", { exact: true }).fill(CDC_EN_FS);
      check(`CA-08 ${ancho}: Desde SIFEN sin desplazamiento horizontal`, await sinDesborde(v.page));
      await v.page.screenshot({ path: path.join(outDir, `${ancho}-sifen.png`), fullPage: true });
      await v.page.getByRole("button", { name: "Cargar a mano" }).click();
      check(`CA-08 ${ancho}: Cargar a mano sin desplazamiento horizontal`, await sinDesborde(v.page));
      if (ancho < 1024) {
        const alto44 = await v.page.getByLabel("Timbrado").evaluate((e) => e.getBoundingClientRect().height);
        check("CA-08 390: campos de al menos 44 px", alto44 >= 43.5, String(alto44));
      }
      await v.page.screenshot({ path: path.join(outDir, `${ancho}-manual.png`), fullPage: true });
      await v.ctx.close();
    }

    // ---- Aprobacion en SIFEN test de la NC de CA-05.
    if (nota) {
      const v = await entrar(browser, 1440, 900);
      const d = await esperarAprobado(v.page, nota.id, "nc-impresa");
      check(`CA-05: NC ${d?.numero_fiscal} sobre factura impresa aprobada en SIFEN test`, d?.estado === "EMITIDA", JSON.stringify({ estado: d?.estado, sifen: d?.sifen_result_code, mensaje: d?.sifen_result_message }));
      await v.ctx.close();
    }
  } catch (error) {
    check("ejecucion sin errores", false, error.message.split("\n").slice(0, 3).join(" "));
    if (paginaActual) await paginaActual.screenshot({ path: path.join(outDir, "error.png"), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(outDir, "resultado.json"), JSON.stringify(resultados, null, 2));
  const fallos = resultados.filter((r) => !r.ok);
  console.log(`\n${resultados.length - fallos.length}/${resultados.length} verificaciones OK.`);
  process.exit(fallos.length ? 1 : 0);
})();
