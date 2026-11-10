#!/usr/bin/env node
// SPEC_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1 (CIR-009). Flujo real: UI + API + Postgres de los
// contenedores de `bash scripts/deploy.sh`, con el gateway fiscal en modo mock. Nunca contra segel-fs
// ni produccion.
//
//   APP_ENV_FILE=.local/carga-masiva/env bash scripts/deploy.sh
//   E2E_BASE_URL=http://127.0.0.1:8392/app/ E2E_API_CONTAINER=fs-cm-api-1 E2E_PG_CONTAINER=fs-cm-postgres-1 \
//     node scripts/playwright-correccion-inutilizacion.cjs
//
// Datos: usa el seed de la carga masiva (facturador 80099999-1, usuario e2e.cm.servicio). Emite facturas
// por la API (el mock las aprueba) y un UPDATE las deja RECHAZADA con un CDC de estructura MT150, porque
// el mock de emision no genera CDC con esa estructura (PLAN 4 y 5). La contrasena se genera en cada corrida.
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8392/app/";
const apiUrl = new URL("/api/v1", baseUrl).toString();
const apiContainer = process.env.E2E_API_CONTAINER ?? "fs-cm-api-1";
const pgContainer = process.env.E2E_PG_CONTAINER ?? "fs-cm-postgres-1";
const outDir = process.env.E2E_OUT_DIR ?? path.join(process.cwd(), "test-results", "correccion-inutilizacion");
if (!/^http:\/\/(localhost|127\.0\.0\.1):/.test(baseUrl)) throw new Error("Solo contra el stack local.");

const usuario = "e2e.cm.servicio";
const password = `E2e-${crypto.randomBytes(18).toString("base64url")}`;
const corrida = String(Date.now()).slice(-6);
const viewports = [
  { nombre: "390", width: 390, height: 844 },
  { nombre: "1280", width: 1280, height: 800 }
];

const resultados = [];
function check(vp, escenario, ok, detalle = "") {
  resultados.push({ vp, escenario, ok: Boolean(ok) });
  console.log(`${ok ? "OK   " : "FALLA"} [${vp}] ${escenario}${!ok && detalle ? ` :: ${String(detalle).slice(0, 300)}` : ""}`);
}

function psql(sql, args = []) {
  return execFileSync("docker", ["exec", "-i", pgContainer, "psql", "-U", "facturacion_simple", "-d", "facturacion_simple", "-At", "-v", "ON_ERROR_STOP=1", ...args], { input: sql, encoding: "utf8" }).trim();
}

function sembrar() {
  const hash = execFileSync(
    "docker",
    ["exec", "-i", apiContainer, "node", "-e", "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>require('argon2').hash(s,{type:require('argon2').argon2id}).then(h=>process.stdout.write(h)))"],
    { input: password, encoding: "utf8" }
  );
  psql(fs.readFileSync(path.join(__dirname, "sql", "seed_e2e_carga_masiva.sql"), "utf8"), ["-v", `password_hash=${hash}`]);
}

async function api(method, ruta, token, body, extraHeaders = {}) {
  const response = await fetch(`${apiUrl}${ruta}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Emite por la API, espera la aprobacion del mock y la deja RECHAZADA con un CDC MT150 del facturador. */
async function prepararRechazada(token, etiqueta, numero, codigo) {
  const emitida = await api(
    "POST",
    "/facturas",
    token,
    {
      condicion_venta: "CONTADO",
      cliente: { documento_tipo: "RUC", documento: "80000000-5", razon_social: `RECHAZADA ${etiqueta} ${corrida}` },
      items: [{ descripcion: "Servicio rechazado", cantidad: 1, precio_unitario: 1100, iva_tipo: "IVA_10" }]
    },
    { "idempotency-key": `e2e-cir-${etiqueta}-${corrida}` }
  );
  if (emitida.status !== 201) throw new Error(`emision ${etiqueta}: ${emitida.status} ${JSON.stringify(emitida.body)}`);
  const id = emitida.body.id;
  for (let i = 0; i < 40; i += 1) {
    if (psql(`select estado from facturas_operativas where id = '${id}'`) === "EMITIDA") break;
    await esperar(500);
  }
  const cdc = `01800999991001001${numero}12026111011${String(Number(corrida) * 10 + numero.length).padStart(8, "0").slice(-8)}0`;
  if (cdc.length !== 44) throw new Error(`CDC de prueba con largo ${cdc.length}`);
  psql(`update facturas_operativas
          set estado = 'RECHAZADA', cdc = '${cdc}', numero_fiscal = '${numero}', fiscal_status_raw = 'REJECTED',
              sifen_result_code = '${codigo}', sifen_result_message = 'Rechazo de prueba E2E'
        where id = '${id}'`);
  return { id, numero };
}

async function abrirDocumento(page, numero) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Salir" }).first().waitFor();
  // En movil el menu se abre; en escritorio esta a la izquierda.
  const abrirMenu = page.getByRole("button", { name: "Abrir menu" }).first();
  if (await abrirMenu.isVisible()) await abrirMenu.click();
  await page.locator('button:visible:has-text("Documentos")').first().click();
  await page.getByRole("heading", { name: "Facturas y notas" }).waitFor();
  await page.getByPlaceholder("Buscar factura...").fill(numero);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await page.locator(`text=${numero}`).first().waitFor();
  const estadoListado = await page.locator(".documents-view").innerText();
  await page.locator(`text=${numero}`).first().click();
  await page.locator(".accion-banner").first().waitFor();
  return estadoListado;
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  sembrar();
  const login = await api("POST", "/auth/login", null, { username: usuario, password });
  const token = login.body?.access_token ?? login.body?.data?.access_token;
  if (!token) throw new Error(`login: ${login.status} ${JSON.stringify(login.body)}`);

  const browser = await chromium.launch();
  for (const [indice, vp] of viewports.entries()) {
    const base = 4000000 + (Number(corrida) % 9000) * 10 + indice * 4;
    const r1 = await prepararRechazada(token, `A-${vp.nombre}`, String(base + 1), "1306");
    const r2 = await prepararRechazada(token, `B-${vp.nombre}`, String(base + 2), "1306");
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(20000);
    try {
      await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await page.locator('input[name="username"]').fill(usuario);
      await page.locator('input[name="password"]').fill(password);
      await page.getByRole("button", { name: "Ingresar" }).click();
      await page.getByRole("button", { name: "Salir" }).first().waitFor();

      // Estado inicial: rechazada sin resolver, con las dos acciones.
      let listado = await abrirDocumento(page, r1.numero);
      check(vp.nombre, "CA-06: rechazada sin resolver figura 'Requiere revision'", /Requiere revision/.test(listado), listado.slice(0, 300));
      check(vp.nombre, "RN-B1: ofrece Inutilizar número", await page.getByTestId("inutilizar-numero").isVisible());
      check(vp.nombre, "RN-C3: aviso de inutilizar antes del dia 15", /antes del día 15/.test(await page.locator(".accion-banner").first().innerText()));
      await page.screenshot({ path: path.join(outDir, `${vp.nombre}-1-rechazada.png`), fullPage: true });

      // Fase A: corregir y emitir.
      await page.getByRole("button", { name: "Corregir y emitir de nuevo" }).click();
      await page.locator(".invoice-editor .editor-alert", { hasText: "Corrigiendo la factura rechazada" }).waitFor();
      await page.getByRole("button", { name: "Calcular" }).click();
      await page.getByText("Total a pagar").waitFor();
      await page.getByRole("button", { name: /Crear factura|Emitir factura/ }).click();
      let correccionId = "";
      for (let i = 0; i < 40 && !correccionId; i += 1) {
        correccionId = psql(`select id from facturas_operativas where documento_relacionado_id = '${r1.id}' and tipo = 'FACTURA'`);
        if (!correccionId) await esperar(500);
      }
      check(vp.nombre, "CA-01: la emision queda vinculada a la rechazada", Boolean(correccionId));
      let numeroCorreccion = "";
      for (let i = 0; i < 40 && !numeroCorreccion; i += 1) {
        numeroCorreccion = psql(`select coalesce(numero_fiscal, '') from facturas_operativas where id = '${correccionId}'`);
        if (!numeroCorreccion) await esperar(500);
      }

      listado = await abrirDocumento(page, r1.numero);
      check(vp.nombre, "CA-06: corregida figura 'Corregida, falta inutilizar'", /Corregida, falta inutilizar/.test(listado), listado.slice(0, 300));
      const vinculo = await page.getByTestId("vinculo-correccion").innerText();
      check(vp.nombre, "CA-01: la original dice 'Corregida por' con el numero nuevo", vinculo.includes("Corregida por") && vinculo.includes(numeroCorreccion), vinculo);
      check(vp.nombre, "RN-A4: la original ya no ofrece corregir", (await page.getByRole("button", { name: "Corregir y emitir de nuevo" }).count()) === 0);
      await page.screenshot({ path: path.join(outDir, `${vp.nombre}-2-corregida.png`), fullPage: true });

      // Fase B: inutilizar.
      await page.getByTestId("inutilizar-numero").click();
      const dialogo = page.getByRole("dialog", { name: `Inutilizar número ${r1.numero}` });
      await dialogo.waitFor();
      check(vp.nombre, "RN-B3: la confirmacion nombra el numero y dice que no se deshace", /No se puede deshacer/.test(await dialogo.innerText()) && (await dialogo.innerText()).includes(r1.numero));
      await page.screenshot({ path: path.join(outDir, `${vp.nombre}-3-dialogo.png`), fullPage: true });
      await page.getByTestId("confirmar-inutilizar").click();
      await page.getByTestId("estado-inutilizacion").waitFor();
      check(vp.nombre, "CA-03: queda 'Inutilizado ante SIFEN'", /Inutilizado ante SIFEN/.test(await page.getByTestId("estado-inutilizacion").innerText()));
      check(vp.nombre, "CA-03: el boton desaparece", (await page.getByTestId("inutilizar-numero").count()) === 0);
      const fila = psql(`select inutilizacion_status || '|' || inutilizacion_intentos from facturas_operativas where id = '${r1.id}'`);
      check(vp.nombre, "RN-B4: la base guarda ACCEPTED", fila === "ACCEPTED|1", fila);
      const auditoria = psql(`select count(*) from audit_events where entity_id = '${r1.id}' and event_type = 'FACTURA_NUMERO_INUTILIZADO'`);
      check(vp.nombre, "RN-B4: queda en auditoria", auditoria === "1", auditoria);
      listado = await abrirDocumento(page, r1.numero);
      check(vp.nombre, "CA-06: corregida e inutilizada figura 'Resuelta'", /Resuelta/.test(listado), listado.slice(0, 300));
      check(vp.nombre, "sin desplazamiento horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
      await page.screenshot({ path: path.join(outDir, `${vp.nombre}-4-resuelta.png`), fullPage: true });

      // La nueva dice a cual corrige y el enlace abre la original.
      await abrirDocumento(page, numeroCorreccion);
      const vinculoNueva = await page.getByTestId("vinculo-correccion").innerText();
      check(vp.nombre, "CA-01: la nueva dice 'Corrige a' la rechazada", vinculoNueva.includes("Corrige a") && vinculoNueva.includes(r1.numero), vinculoNueva);
      await page.getByTestId("vinculo-correccion").getByRole("button").click();
      await page.getByTestId("estado-inutilizacion").waitFor();
      check(vp.nombre, "RN-A4: el enlace abre la original", (await page.locator(".documents-view").innerText()).includes(r1.numero));

      // CA-04: SIFEN rechaza la inutilizacion; se puede reintentar.
      await abrirDocumento(page, r2.numero);
      await page.getByTestId("inutilizar-numero").click();
      await page.getByRole("dialog").locator("textarea").fill("INUT-RECHAZO prueba E2E");
      await page.getByTestId("confirmar-inutilizar").click();
      await page.getByTestId("estado-inutilizacion").waitFor();
      check(vp.nombre, "CA-04: muestra el rechazo con su codigo", /rechazó la inutilización \(4003\)/.test(await page.getByTestId("estado-inutilizacion").innerText()));
      check(vp.nombre, "CA-04: el boton sigue para reintentar", await page.getByTestId("inutilizar-numero").isVisible());
      check(vp.nombre, "CA-06: rechazo de inutilizacion sigue 'Requiere revision'", /Requiere revision/.test(await page.locator(".documents-view").innerText()));
      await page.screenshot({ path: path.join(outDir, `${vp.nombre}-5-inutilizacion-rechazada.png`), fullPage: true });
    } catch (error) {
      check(vp.nombre, "flujo completo", false, error.message.split("\n")[0]);
      await page.screenshot({ path: path.join(outDir, `${vp.nombre}-error.png`), fullPage: true }).catch(() => {});
    }
    await ctx.close();
  }
  await browser.close();

  // CA-02, CA-05 y CA-07 por la API del mismo stack.
  const emitida = psql(`select f.id from facturas_operativas f join facturadores fa on fa.id = f.facturador_id
                         where fa.emisor_id = '80099999-1' and f.estado = 'EMITIDA' and f.tipo = 'FACTURA' order by f.created_at desc limit 1`);
  const noInutiliza = await api("POST", `/facturas/${emitida}/inutilizar`, token, { motivo: "Motivo de prueba" });
  check("api", "CA-05: una factura aprobada no se inutiliza (409)", noInutiliza.status === 409, JSON.stringify(noInutiliza.body));
  const noCorrige = await api(
    "POST",
    "/facturas",
    token,
    {
      condicion_venta: "CONTADO",
      corrige_documento_id: emitida,
      cliente: { documento_tipo: "RUC", documento: "80000000-5", razon_social: "No corrige" },
      items: [{ descripcion: "Servicio", cantidad: 1, precio_unitario: 1100, iva_tipo: "IVA_10" }]
    },
    { "idempotency-key": `e2e-cir-ca02-${corrida}` }
  );
  check("api", "CA-02: no corrige una factura aprobada (409)", noCorrige.status === 409, JSON.stringify(noCorrige.body));
  const r3 = await prepararRechazada(token, "C-api", String(4000000 + (Number(corrida) % 9000) * 10 + 9), "1306");
  const conCampos = await api("POST", `/facturas/${r3.id}/inutilizar`, token, { motivo: "Motivo de prueba", establecimiento: "999", numero: "0000001" });
  check("api", "CA-07: ignora establecimiento y numero del cuerpo", conCampos.status === 200 && conCampos.body.inutilizacion?.status === "ACCEPTED", JSON.stringify(conCampos.body?.inutilizacion));

  const fallos = resultados.filter((r) => !r.ok).length;
  console.log(`\n${resultados.length - fallos}/${resultados.length} verificaciones OK. Capturas en ${outDir}`);
  process.exit(fallos ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
