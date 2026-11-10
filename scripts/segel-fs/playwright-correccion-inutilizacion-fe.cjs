#!/usr/bin/env node
// FS-51 contra FE real (SPEC_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1, fases A y B). Solo stack local de Segel con
// SIFEN test: emite una factura a un RUC que SIFEN test no reconoce (1306), la corrige con "Corregir y emitir de
// nuevo" a un RUC valido e inutiliza el numero de la rechazada. La inutilizacion en SIFEN test es irreversible.
//
//   ENSAYO_PASSWORD_FILE=/ruta/operador.pass node scripts/segel-fs/playwright-correccion-inutilizacion-fe.cjs
//
// Escribe test-results/correccion-inutilizacion-fe/.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
if (!/^http:\/\/(localhost|127\.0\.0\.1):/.test(base)) throw new Error("Solo contra el stack local.");
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const pgFs = process.env.ENSAYO_PG_FS ?? "segel-fs-postgres-1";
const pgFe = process.env.ENSAYO_PG_FE ?? "fe-segel-postgres-1";
const RUC_INEXISTENTE = "80000000-5";
const RUC_VALIDO = process.env.ENSAYO_RUC ?? "80026570-0";
const NOMBRE_VALIDO = process.env.ENSAYO_NOMBRE ?? "SEGEL SA";
const marca = `FS51-FE-${Date.now().toString(36).slice(-5)}`;
const outDir = path.join(process.cwd(), "test-results", "correccion-inutilizacion-fe");
fs.mkdirSync(outDir, { recursive: true });

const resultados = [];
let pagina = null;
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 500) });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 500)}` : ""}`);
}

function psql(contenedor, sql) {
  return execFileSync("docker", ["exec", "-i", contenedor, "sh", "-c", 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -v ON_ERROR_STOP=1'], {
    input: sql,
    encoding: "utf8"
  }).trim();
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function abrirDocumento(page, numero) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await esperarSesion(page);
  await abrirVista(page, "Documentos");
  await page.getByPlaceholder("Buscar factura...").fill(numero);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.locator(`text=${numero}`).first().waitFor({ timeout: 20000 });
  const listado = (await page.locator(".documents-view").innerText()).replace(/\s+/g, " ");
  await page.locator(`text=${numero}`).first().click();
  await page.getByRole("button", { name: /Volver a resultados/ }).waitFor({ timeout: 20000 });
  return listado;
}

(async () => {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => {
      try {
        window.localStorage.setItem("fs.editor.modo", "simple");
      } catch {}
    });
    const page = await ctx.newPage();
    pagina = page;
    page.setDefaultTimeout(30000);
    await page.goto(base, { waitUntil: "domcontentloaded" });
    await page.locator('input[name="username"]').fill(usuario);
    await page.locator('input[name="password"]').fill(clave);
    await page.getByRole("button", { name: "Ingresar" }).click();
    await esperarSesion(page);

    // Factura a un RUC que SIFEN test no reconoce.
    await abrirVista(page, "Nueva factura");
    await page.getByPlaceholder("Ingrese numero de documento").fill(RUC_INEXISTENTE);
    await page.getByLabel("Nombre o razon social").fill("EMPRESA FICTICIA S.A.");
    await page.getByRole("button", { name: /Agregar producto/ }).click();
    await page.getByPlaceholder("Ingrese descripcion").fill(`Servicio ${marca}`);
    await page.locator('label:has-text("Precio") input').first().fill("1100");
    await page.getByRole("button", { name: "AGREGAR Y NO GUARDAR" }).click();
    await page.getByRole("button", { name: "Calcular" }).click();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Crear factura" }).click();
    const confirmar = page.getByRole("button", { name: /^Confirmar/ });
    if (await confirmar.isVisible({ timeout: 3000 }).catch(() => false)) await confirmar.click();
    await page.getByRole("button", { name: "Crear nueva factura" }).waitFor({ timeout: 60000 });

    let fila = "";
    for (let i = 0; i < 120 && !fila; i += 1) {
      fila = psql(pgFs, `select id || '|' || coalesce(numero_fiscal,'') || '|' || estado from facturas_operativas where tipo='FACTURA' and cliente_snapshot->>'documento' = '${RUC_INEXISTENTE}' and exists (select 1 from factura_items_snapshot i where i.factura_operativa_id = facturas_operativas.id and i.descripcion like '%${marca}%') order by created_at desc limit 1`);
      if (!fila) await esperar(1000);
    }
    const [rechazadaId, numero] = fila.split("|");
    check("emitida la factura al RUC inexistente", Boolean(rechazadaId && numero), fila);

    // Esperar el rechazo confirmado (hasta 12 min: lote).
    let estado = "";
    let codigo = "";
    const limite = Date.now() + 12 * 60 * 1000;
    while (Date.now() < limite) {
      [estado, codigo] = psql(pgFs, `select estado || '|' || coalesce(sifen_result_code,'') from facturas_operativas where id='${rechazadaId}'`).split("|");
      if (estado === "RECHAZADA") break;
      await esperar(20000);
    }
    check("SIFEN test la rechaza (1306 esperado)", estado === "RECHAZADA", `${numero}: ${estado} ${codigo}`);

    // Fase A: corregir y emitir de nuevo con un RUC valido.
    let listado = await abrirDocumento(page, numero);
    check("CA-06: la rechazada figura 'Requiere revision'", /Requiere revision/.test(listado), listado.slice(0, 200));
    const corregir = page.getByRole("button", { name: "Corregir y emitir de nuevo" });
    check("1306 ofrece 'Corregir y emitir de nuevo'", await corregir.isVisible().catch(() => false));
    await page.screenshot({ path: path.join(outDir, "1-rechazada.png"), fullPage: true });
    await corregir.click();
    await page.locator(".invoice-editor .editor-alert", { hasText: "Corrigiendo la factura rechazada" }).waitFor();
    await page.getByPlaceholder("Ingrese numero de documento").fill(RUC_VALIDO);
    await page.getByLabel("Nombre o razon social").fill(NOMBRE_VALIDO);
    await page.getByRole("button", { name: "Calcular" }).click();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Crear factura" }).click();
    if (await confirmar.isVisible({ timeout: 3000 }).catch(() => false)) await confirmar.click();
    await page.getByRole("button", { name: "Crear nueva factura" }).waitFor({ timeout: 60000 });

    let correccion = "";
    for (let i = 0; i < 60 && !correccion; i += 1) {
      correccion = psql(pgFs, `select id || '|' || coalesce(numero_fiscal,'') from facturas_operativas where documento_relacionado_id='${rechazadaId}' and tipo='FACTURA'`);
      if (!correccion || correccion.endsWith("|")) {
        correccion = "";
        await esperar(1000);
      }
    }
    const [correccionId, numeroCorreccion] = correccion.split("|");
    check("CA-01: la correccion queda vinculada a la rechazada", Boolean(correccionId), correccion);
    let estadoCorreccion = "";
    const limite2 = Date.now() + 12 * 60 * 1000;
    while (Date.now() < limite2) {
      estadoCorreccion = psql(pgFs, `select estado from facturas_operativas where id='${correccionId}'`);
      if (estadoCorreccion !== "PENDIENTE_SIFEN" && estadoCorreccion !== "EMITIENDO") break;
      await esperar(20000);
    }
    check("la correccion queda aprobada por SIFEN test", estadoCorreccion === "EMITIDA", `${numeroCorreccion}: ${estadoCorreccion}`);

    listado = await abrirDocumento(page, numero);
    const vinculo = await page.getByTestId("vinculo-correccion").innerText().catch(() => "");
    check("CA-01: la original dice 'Corregida por' con el numero nuevo", vinculo.includes("Corregida por") && vinculo.includes(numeroCorreccion), vinculo);
    check("CA-06: figura 'Corregida, falta inutilizar'", /Corregida, falta inutilizar/.test(listado), listado.slice(0, 200));
    await page.screenshot({ path: path.join(outDir, "2-corregida.png"), fullPage: true });

    // Fase B: inutilizar el numero de la rechazada contra FE real.
    await page.getByTestId("inutilizar-numero").click();
    await page.getByRole("dialog", { name: `Inutilizar número ${numero}` }).waitFor();
    await page.getByTestId("confirmar-inutilizar").click();
    const estadoInutilizacion = await page.getByTestId("estado-inutilizacion").waitFor({ timeout: 90000 }).then(
      () => page.getByTestId("estado-inutilizacion").innerText(),
      async () => (await page.locator(".document-detail").innerText()).replace(/\s+/g, " ").slice(0, 400)
    );
    check("CA-03: queda 'Inutilizado ante SIFEN'", /Inutilizado ante SIFEN/.test(estadoInutilizacion), estadoInutilizacion);
    await page.screenshot({ path: path.join(outDir, "3-inutilizada.png"), fullPage: true });

    const fsEstado = psql(pgFs, `select coalesce(inutilizacion_status,'') from facturas_operativas where id='${rechazadaId}'`);
    check("RN-B4: FS guarda ACCEPTED", fsEstado === "ACCEPTED", fsEstado);
    const auditoria = psql(pgFs, `select count(*) from audit_events where entity_id='${rechazadaId}' and event_type='FACTURA_NUMERO_INUTILIZADO'`);
    check("RN-B4: auditoria FACTURA_NUMERO_INUTILIZADO", Number(auditoria) >= 1, auditoria);
    const numeroCorto = numero.replace(/^.*-/, "").padStart(7, "0");
    const feEvento = psql(
      pgFe,
      `select coalesce(string_agg(type || ':' || status || ':' || range_from || '-' || range_to, ','), '') from de_events where type ilike '%VOID%' and ${Number(numeroCorto)} between range_from::int and range_to::int and created_at > now() - interval '1 hour'`
    );
    check("FE: evento VOID_RANGE aceptado para el numero", /VOID[^,]*:ACCEPTED/i.test(feEvento), feEvento || "sin evento");

    listado = await abrirDocumento(page, numero);
    check("CA-06: corregida e inutilizada figura 'Resuelta'", /Resuelta/.test(listado), listado.slice(0, 200));
    await ctx.close();
  } catch (error) {
    check("ejecucion sin errores", false, error.message.split("\n").slice(0, 3).join(" "));
    if (pagina) await pagina.screenshot({ path: path.join(outDir, "error.png"), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(outDir, "resultado.json"), JSON.stringify(resultados, null, 2));
  const fallos = resultados.filter((r) => !r.ok);
  console.log(`\n${resultados.length - fallos.length}/${resultados.length} verificaciones OK.`);
  process.exit(fallos.length ? 1 : 0);
})();
