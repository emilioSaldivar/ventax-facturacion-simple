#!/usr/bin/env node
// Comprador sin nombre (SPEC_COMPRADOR_INNOMINADO_v0.1, CA-01 a CA-04). Solo stack aislado con FE_GATEWAY_MODE=mock.
//
//   INN_APP_URL=http://127.0.0.1:8492/app/ INN_PROJECT=fs-inn node scripts/playwright-comprador-innominado.cjs
//
// Siembra con scripts/sql/seed_e2e_carga_masiva.sql (usuario e2e.cm.servicio, numera por FE). Escribe test-results/comprador-innominado/.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { chromium } = require(path.join(__dirname, "../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "lib/navegacion.cjs"));

const base = process.env.INN_APP_URL ?? "http://127.0.0.1:8492/app/";
const proyecto = process.env.INN_PROJECT ?? "fs-inn";
const pgContainer = `${proyecto}-postgres-1`;
const apiContainer = `${proyecto}-api-1`;
const usuario = "e2e.cm.servicio";
const password = `E2e-${crypto.randomBytes(18).toString("base64url")}`;
const outDir = path.join(process.cwd(), "test-results", "comprador-innominado");
fs.mkdirSync(outDir, { recursive: true });
const TOPE = "Una factura sin nombre tiene que ser menor a Gs. 7.000.000";

const resultados = [];
let paginaActual = null;
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 300) });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 300)}` : ""}`);
}

function psql(sql, args = []) {
  return execFileSync("docker", ["exec", "-i", pgContainer, "psql", "-U", "facturacion_simple", "-d", "facturacion_simple", "-At", "-v", "ON_ERROR_STOP=1", ...args], { input: sql, encoding: "utf8" });
}

function sembrar() {
  const hash = execFileSync(
    "docker",
    ["exec", "-i", apiContainer, "node", "-e", "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>require('argon2').hash(s,{type:require('argon2').argon2id}).then(h=>process.stdout.write(h)))"],
    { input: password, encoding: "utf8" }
  );
  psql(fs.readFileSync(path.join(__dirname, "sql", "seed_e2e_carga_masiva.sql"), "utf8"), ["-v", `password_hash=${hash}`]);
}

const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function entrar(browser, ancho, alto, modo) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
  await ctx.addInitScript((m) => {
    try {
      window.localStorage.setItem("fs.editor.modo", m);
    } catch {}
  }, modo);
  const page = await ctx.newPage();
  paginaActual = page;
  page.setDefaultTimeout(30000);
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(usuario);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await esperarSesion(page);
  await abrirVista(page, "Nueva factura");
  await page.locator('select[aria-label="Moneda"]').waitFor();
  return { ctx, page };
}

const selectorDocumento = (page) => page.locator(".cliente-fila select").first();
const numero = (page) => page.getByPlaceholder("Ingresá el número de documento");
const nombre = (page) => page.getByLabel("Nombre o razón social");
const casillaAgenda = (page) => page.locator(".casilla-agenda");

async function motivoBloqueo(page) {
  const motivo = page.locator(".motivo-bloqueo");
  return (await motivo.count()) ? (await motivo.first().innerText()).replace(/\s+/g, " ").trim() : "";
}

async function filaGrilla(page, indice, { descripcion, cantidad, precio }) {
  const fila = page.locator(`[data-grilla-fila="${indice}"]`);
  await fila.locator('input[data-celda="descripcion"]').fill(descripcion);
  await fila.getByLabel(/^Cantidad, línea/).fill(cantidad);
  await fila.getByLabel(/^Precio, línea/).fill(precio);
}

async function esperarEstado(id, estados, ms = 60000) {
  const inicio = Date.now();
  while (Date.now() - inicio < ms) {
    const estado = psql(`select estado from facturas_operativas where id = '${id}';`).trim();
    if (estados.includes(estado)) return estado;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return psql(`select estado from facturas_operativas where id = '${id}';`).trim();
}

(async () => {
  sembrar();
  const marca = new Date().toISOString();
  const browser = await chromium.launch();
  try {
    for (const ancho of [1440, 1280]) {
      const { ctx, page } = await entrar(browser, ancho, 900, "completo");
      await selectorDocumento(page).selectOption("INNOMINADO");
      check(`CA-01 ${ancho}: documento 0 y nombre Sin Nombre`, (await numero(page).inputValue()) === "0" && (await nombre(page).inputValue()) === "Sin Nombre");
      check(`CA-01 ${ancho}: numero y nombre no se editan`, !(await numero(page).isEditable()) && !(await nombre(page).isEditable()));
      check(`CA-01 ${ancho}: sin casilla de agenda`, (await casillaAgenda(page).count()) === 0);
      const estadoCliente = (await page.locator(".cliente-estado").innerText()).replace(/\s+/g, " ");
      check(`RN-01 ${ancho}: explica consumidor final sin agenda ni nota de credito`, estadoCliente.includes("Consumidor final sin datos"), estadoCliente);
      await page.screenshot({ path: path.join(outDir, `${ancho}-sin-nombre.png`), fullPage: true });

      // CA-02: en el tope no deja crear.
      await filaGrilla(page, 0, { descripcion: "Venta mostrador", cantidad: "1", precio: "7000000" });
      await page.waitForTimeout(1500);
      const motivoTope = await motivoBloqueo(page);
      const crearBtn = page.getByRole("button", { name: "Crear factura" });
      check(`CA-02 ${ancho}: en Gs. 7.000.000 no deja crear y dice por que`, motivoTope.includes(TOPE) && (await crearBtn.isDisabled()), motivoTope);
      await page.screenshot({ path: path.join(outDir, `${ancho}-tope.png`), fullPage: true });

      // RN-02: volver a RUC vacia documento y nombre y muestra la casilla.
      await selectorDocumento(page).selectOption("RUC");
      check(`RN-02 ${ancho}: volver a RUC vacia documento y nombre`, (await numero(page).inputValue()) === "" && (await nombre(page).inputValue()) === "" && (await casillaAgenda(page).count()) > 0);
      await selectorDocumento(page).selectOption("INNOMINADO");

      if (ancho === 1440) {
        // CA-01: debajo del tope se crea.
        await page.locator('[data-grilla-fila="0"]').getByLabel(/^Precio, línea/).fill("50000");
        await page.waitForFunction((b) => b && !b.disabled, await crearBtn.elementHandle(), { timeout: 20000 });
        await crearBtn.click();
        const confirmar = page.getByRole("button", { name: /^Confirmar/ });
        if (await confirmar.isVisible({ timeout: 3000 }).catch(() => false)) await confirmar.click();
        await page.getByRole("button", { name: "Crear nueva factura" }).waitFor({ timeout: 60000 });
        const resultado = (await page.locator("main").innerText()).replace(/\s+/g, " ");
        check("CA-01 1440: el resultado muestra Sin nombre (consumidor final)", resultado.includes("Sin nombre (consumidor final)"));
        await page.screenshot({ path: path.join(outDir, "1440-creada.png"), fullPage: true });

        const fila = psql(
          `select id, cliente_snapshot->>'documento_tipo', cliente_snapshot->>'documento', cliente_snapshot->>'razon_social', fiscal_request_snapshot->'cliente'->>'documento_tipo' from facturas_operativas where created_at >= '${marca}' order by created_at desc limit 1;`
        ).trim().split("|");
        check("CA-01: la factura guarda INNOMINADO / 0 / Sin Nombre", fila[1] === "INNOMINADO" && fila[2] === "0" && fila[3] === "Sin Nombre" && fila[4] === "INNOMINADO", fila.join("|"));
        const agenda = psql(`select count(*) from facturador_clientes where created_at >= '${marca}';`).trim();
        check("RN-01: no se guardo nada en la agenda", agenda === "0", agenda);

        // CA-03: emitida, sin nota de credito.
        const estado = await esperarEstado(fila[0], ["EMITIDA"]);
        check("CA-03: la factura del mock queda emitida", estado === "EMITIDA", estado);
        await abrirVista(page, "Documentos");
        await page.getByText("Sin Nombre").first().click();
        const nc = page.getByRole("button", { name: /Crear nota de crédito/ });
        await nc.waitFor();
        const aviso = await page.getByText("SIFEN no admite nota de crédito de una factura sin nombre").count();
        check("CA-03 1440: la ficha no deja crear nota de credito y avisa", (await nc.isDisabled()) && aviso > 0);
        await page.screenshot({ path: path.join(outDir, "1440-ficha-sin-nc.png"), fullPage: true });
      }
      check(`${ancho}: sin desplazamiento horizontal`, await sinDesborde(page));
      await ctx.close();
    }

    // 390: modo simple.
    const { ctx, page } = await entrar(browser, 390, 844, "simple");
    await selectorDocumento(page).selectOption("INNOMINADO");
    check("CA-01 390: documento 0, Sin Nombre, sin editar y sin casilla", (await numero(page).inputValue()) === "0" && !(await nombre(page).isEditable()) && (await casillaAgenda(page).count()) === 0);
    check("390: sin desplazamiento horizontal", await sinDesborde(page));
    await page.screenshot({ path: path.join(outDir, "390-sin-nombre.png"), fullPage: true });
    await ctx.close();
  } catch (error) {
    check("ejecucion sin errores", false, error.message.split("\n").slice(0, 3).join(" "));
    if (paginaActual) await paginaActual.screenshot({ path: path.join(outDir, "error.png"), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(outDir, "resultados.json"), JSON.stringify(resultados, null, 2));
    const fallas = resultados.filter((r) => !r.ok).length;
    console.log(`\n${resultados.length - fallas}/${resultados.length} OK`);
    process.exitCode = fallas ? 1 : 0;
  }
})();
