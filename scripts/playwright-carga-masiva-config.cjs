#!/usr/bin/env node
// SPEC_CARGA_MASIVA_FACTURAS_v0.1, G2: configuracion. UI + API + Postgres de los contenedores.
//
//   node scripts/playwright-carga-masiva-config.cjs             selector de numeracion en el backoffice
//   E2E_BANDERA_APAGADA=1 node scripts/...config.cjs            CA-12, con la API en CARGA_MASIVA_ENABLED=false
//
// Requiere el seed de scripts/sql/seed_e2e_carga_masiva.sql. La contrasena se genera en cada corrida.
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const origen = process.env.E2E_ORIGIN ?? "http://127.0.0.1:8392";
const apiContainer = process.env.E2E_API_CONTAINER ?? "fs-cm-api-1";
const pgContainer = process.env.E2E_PG_CONTAINER ?? "fs-cm-postgres-1";
const outDir = process.env.E2E_OUT_DIR ?? path.join(process.cwd(), "test-results", "carga-masiva");
const apagada = process.env.E2E_BANDERA_APAGADA === "1";
const password = `E2e-${crypto.randomBytes(18).toString("base64url")}`;
const viewports = [
  { nombre: "1280", width: 1280, height: 800 },
  { nombre: "390", width: 390, height: 844 }
];

let fallos = 0;
let total = 0;
function check(viewport, escenario, ok, detalle = "") {
  total += 1;
  if (!ok) fallos += 1;
  console.log(`${ok ? "OK  " : "FALLA"} [${viewport}] ${escenario}${!ok && detalle ? ` :: ${String(detalle).slice(0, 300)}` : ""}`);
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

async function loginApp(page, usuario) {
  await page.goto(`${origen}/app/`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(usuario);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.getByRole("button", { name: "Abrir menu" }).first().waitFor({ timeout: 15000 });
}

async function banderaApagada(browser, vp) {
  const contexto = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await contexto.newPage();
  await loginApp(page, "e2e.cm.servicio");
  await page.getByRole("button", { name: "Abrir menu" }).first().click();
  await page.locator('button:has-text("Documentos")').first().click();
  await page.getByRole("heading", { name: "Facturas y notas" }).waitFor();
  await page.getByRole("button", { name: "Notas de credito" }).waitFor();
  check(vp.nombre, "CA-12: sin pestana Carga masiva", (await page.getByRole("button", { name: "Carga masiva" }).count()) === 0);
  const estados = await page.evaluate(async () => {
    const sesion = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" });
    const { access_token: token } = await sesion.json();
    const headers = { authorization: `Bearer ${token}` };
    const contexto = await (await fetch("/api/v1/me/context", { headers })).json();
    return {
      listado: (await fetch("/api/v1/cargas", { headers })).status,
      plantilla: (await fetch("/api/v1/cargas/plantilla", { headers })).status,
      subida: (await fetch("/api/v1/cargas", { method: "POST", headers: { ...headers, "content-type": "text/csv" }, body: "a;b\n" })).status,
      habilitada: contexto.carga_masiva_habilitada
    };
  });
  check(vp.nombre, "CA-12: rutas /cargas responden 404", estados.listado === 404 && estados.plantilla === 404 && estados.subida === 404, JSON.stringify(estados));
  check(vp.nombre, "CA-12: el contexto informa la bandera apagada", estados.habilitada === false, JSON.stringify(estados));
  await page.screenshot({ path: path.join(outDir, `${vp.nombre}-20-bandera-apagada.png`), fullPage: true });
  await contexto.close();
}

// Los demas escenarios dependen de que este contexto numere por el servicio.
function restablecerNumeracion() {
  psql("update actividad_punto_perfiles set numeracion_facturas = 'SERVICIO' where perfil_emision_id in (select id from facturador_perfiles_emision where codigo = 'E2E-P001');");
}

async function selectorBackoffice(browser, vp) {
  restablecerNumeracion();
  const contexto = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await contexto.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(`${origen}/backoffice/`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"], input[type="text"]').first().fill("e2e.cm.soporte");
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /Ingresar|Entrar/ }).click();
  await page.locator("tr", { hasText: "E2E Carga masiva" }).getByRole("button", { name: "Ver" }).click();
  await page.locator("tr", { hasText: "80099999-1" }).getByRole("button", { name: "Ver" }).click();
  await page.getByText(/^Contextos \(/).click();

  const tarjeta = page.locator("div", { has: page.getByRole("button", { name: "Editar", exact: true }) }).filter({ hasText: "E2E-P001" }).last();
  check(vp.nombre, "el contexto muestra su numeracion", (await tarjeta.innerText()).includes("Numeracion: del servicio"), await tarjeta.innerText());
  await tarjeta.getByRole("button", { name: "Editar", exact: true }).click();

  const selector = page.getByLabel("Numeracion de facturas");
  check(vp.nombre, "el selector parte en el valor actual", (await selector.inputValue()) === "SERVICIO");
  check(vp.nombre, "el selector avisa del cruce de numeros", await page.getByText("puede cruzar numeros").isVisible());
  await page.screenshot({ path: path.join(outDir, `${vp.nombre}-21-backoffice-selector.png`), fullPage: true });
  await selector.selectOption("CLIENTE");
  await page.getByRole("button", { name: "Guardar" }).click();
  await page.getByText("Numeracion: del cliente").first().waitFor();

  const evento = psql("select metadata from audit_events where event_type = 'CONTEXTO_NUMERACION_FACTURAS_CAMBIADA' order by created_at desc limit 1;");
  check(vp.nombre, "el cambio queda auditado con anterior y nuevo", evento.includes('"anterior": "SERVICIO"') && evento.includes('"nuevo": "CLIENTE"'), evento);

  // Con el contexto ya en CLIENTE, la app y la API rechazan la emision una por una.
  const ctxApp = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const app = await ctxApp.newPage();
  await loginApp(app, "e2e.cm.servicio");
  const estado = await app.evaluate(async () => {
    const sesion = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" });
    const { access_token: token } = await sesion.json();
    const r = await fetch("/api/v1/facturas", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({
        condicion_venta: "CONTADO",
        tipo_transaccion: 1,
        cliente: { documento_tipo: "RUC", documento: "80000000-5", razon_social: "Cliente" },
        items: [{ descripcion: "Item", cantidad: 1, precio_unitario: 1000, iva_tipo: "IVA_10" }]
      })
    });
    return { status: r.status, cuerpo: await r.text() };
  });
  check(vp.nombre, "CA-13: POST /facturas responde 409 NUMERACION_DEL_CLIENTE", estado.status === 409 && estado.cuerpo.includes("NUMERACION_DEL_CLIENTE"), JSON.stringify(estado));
  await ctxApp.close();
  await contexto.close();
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  sembrar();
  const browser = await chromium.launch();
  for (const vp of viewports) {
    try {
      await (apagada ? banderaApagada(browser, vp) : selectorBackoffice(browser, vp));
    } catch (error) {
      check(vp.nombre, "flujo completo", false, error.message.split("\n")[0]);
    }
  }
  await browser.close();
  if (!apagada) restablecerNumeracion();
  console.log(`\n${total - fallos}/${total} verificaciones OK.`);
  process.exit(fallos ? 1 : 0);
})();
