#!/usr/bin/env node
// SPEC_NOTA_CREDITO_TRABADA_v0.1, CA-07 (NCT-011). Flujo real: UI + API + Postgres de los contenedores de
// `bash scripts/deploy.sh`, con el gateway fiscal en modo mock y sus escenarios por marcador en el motivo.
// Nunca contra segel-fs ni produccion.
//
//   E2E_BASE_URL=http://127.0.0.1:8392/app/ node scripts/playwright-nota-credito-trabada.cjs
//
// Reutiliza la semilla de la carga masiva (facturador 80099999-1, operador e2e.cm.servicio) y siembra por
// corrida dos facturas emitidas por viewport. La contrasena se genera en cada corrida y no se guarda.
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8392/app/";
const apiContainer = process.env.E2E_API_CONTAINER ?? "fs-cm-api-1";
const pgContainer = process.env.E2E_PG_CONTAINER ?? "fs-cm-postgres-1";
const outDir = process.env.E2E_OUT_DIR ?? path.join(process.cwd(), "test-results", "nota-credito-trabada");
const viewports = [
  { nombre: "390", width: 390, height: 844 },
  { nombre: "1280", width: 1280, height: 800 }
];
const password = `E2e-${crypto.randomBytes(18).toString("base64url")}`;
const corrida = String(Date.now()).slice(-7);

const resultados = [];
function check(viewport, escenario, ok, detalle = "") {
  resultados.push({ viewport, escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 200) });
  console.log(`${ok ? "OK  " : "FALLA"} [${viewport}] ${escenario}${!ok && detalle ? ` :: ${String(detalle).slice(0, 200)}` : ""}`);
}

function psql(sql, args = []) {
  return execFileSync(
    "docker",
    ["exec", "-i", pgContainer, "psql", "-U", "facturacion_simple", "-d", "facturacion_simple", "-At", "-v", "ON_ERROR_STOP=1", ...args],
    { input: sql, encoding: "utf8" }
  ).trim();
}

function sembrarUsuarios() {
  const hash = execFileSync(
    "docker",
    ["exec", "-i", apiContainer, "node", "-e", "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>require('argon2').hash(s,{type:require('argon2').argon2id}).then(h=>process.stdout.write(h)))"],
    { input: password, encoding: "utf8" }
  );
  psql(fs.readFileSync(path.join(__dirname, "sql", "seed_e2e_carga_masiva.sql"), "utf8"), ["-v", `password_hash=${hash}`]);
}

/** Una factura EMITIDA con CDC e item, del operador de servicio. Devuelve su id. */
function sembrarFactura(razon, numero) {
  const cdc = crypto.createHash("sha256").update(razon).digest("hex").toUpperCase().padEnd(44, "0").slice(0, 44);
  return psql(`
    with u as (
      select u.id as usuario_id, u.tenant_id, c.facturador_id
      from usuarios u join usuario_operacion_config c on c.usuario_id = u.id and c.activo
      where u.username = 'e2e.cm.servicio' limit 1
    ), f as (
      insert into facturas_operativas (
        tenant_id, facturador_id, usuario_id, tipo, condicion_venta, estado, external_ref,
        cliente_snapshot, totals_snapshot, fiscal_response_snapshot, numero_fiscal, cdc, document_uuid, emitted_at
      )
      select tenant_id, facturador_id, usuario_id, 'FACTURA', 'CONTADO', 'EMITIDA', 'fac_e2e_nct_' || md5('${razon}'),
        jsonb_build_object('documento_tipo','RUC','documento','80000000-1','razon_social','${razon}','email',null),
        '{"subtotal":1100,"total_sin_iva":1000,"iva_5":0,"iva_10":100,"total_iva":100,"total":1100}'::jsonb,
        '{"status":"APPROVED"}'::jsonb, '${numero}', '${cdc}', gen_random_uuid(), now()
      from u
      returning id, tenant_id, facturador_id
    ), i as (
      insert into factura_items_snapshot (
        tenant_id, facturador_id, factura_operativa_id, catalogo_item_id, line_no, codigo, descripcion,
        cantidad, precio_unitario, iva_tipo, subtotal, base_imponible, iva_monto
      )
      select tenant_id, facturador_id, id, null, 1, 'SRV', 'Servicio E2E', 1, 1100, 'IVA_10', 1100, 1000, 100 from f
    )
    select id from f;
  `);
}

async function login(page) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill("e2e.cm.servicio");
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.getByRole("button", { name: "Abrir menu" }).first().waitFor({ timeout: 15000 });
}

async function irADocumentos(page) {
  await page.getByRole("button", { name: "Abrir menu" }).first().click();
  await page.locator('button:has-text("Documentos")').first().click();
  await page.getByRole("heading", { name: "Facturas y notas" }).waitFor({ timeout: 15000 });
}

async function buscar(page, texto) {
  const input = page.getByPlaceholder("Buscar factura...");
  await input.fill(texto);
  await input.press("Enter");
}

async function abrir(page, razon, tipo) {
  // La lista separa facturas y notas en pestanas.
  await page.getByRole("button", { name: tipo === "Factura" ? "Facturas" : "Notas de credito", exact: true }).first().click();
  await buscar(page, razon);
  const fila = page.locator(".document-row-main", { hasText: razon }).filter({ hasText: tipo }).first();
  await fila.waitFor({ timeout: 15000 });
  await fila.click();
  await page.locator(".accion-banner").first().waitFor({ timeout: 15000 });
}

async function pedirNotaCredito(page, motivo) {
  await page.getByRole("button", { name: /Crear nota de credito/ }).first().click();
  await page.locator(".modal-panel textarea").fill(motivo);
  await page.getByRole("button", { name: "Confirmar" }).click();
}

const sinDesplazamiento = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

let paginaActual = null;
async function escenario(vp, nombre, fn) {
  try {
    await fn();
  } catch (error) {
    check(vp, nombre, false, error.message.split("\n")[0]);
    if (paginaActual) await paginaActual.screenshot({ path: path.join(outDir, `${vp}-falla-${resultados.length}.png`), fullPage: true }).catch(() => {});
  }
}

async function correr(browser, vp) {
  const { nombre } = vp;
  const razonTrabada = `NCT TRABADA ${corrida} ${nombre}`;
  const razonRechazo = `NCT RECHAZO ${corrida} ${nombre}`;
  const facturaTrabada = sembrarFactura(razonTrabada, `09${corrida.slice(-4)}${nombre === "390" ? 1 : 3}`);
  const facturaRechazo = sembrarFactura(razonRechazo, `09${corrida.slice(-4)}${nombre === "390" ? 2 : 4}`);

  const contexto = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await contexto.newPage();
  page.setDefaultTimeout(20000);
  paginaActual = page;
  const foto = (paso) => page.screenshot({ path: path.join(outDir, `${nombre}-${paso}.png`), fullPage: true });

  await login(page);
  await irADocumentos(page);

  await escenario(nombre, "FE 502: la nota queda 'sin confirmar' con boton de reintento (CA-01, RN-06)", async () => {
    await abrir(page, razonTrabada, "Factura");
    await pedirNotaCredito(page, "[FE-502] devolucion e2e");
    const popup = page.locator('section[aria-labelledby="nc-success-title"]');
    await popup.waitFor();
    const titulo = (await popup.locator("h3").innerText()).trim();
    const boton = await popup.getByTestId("popup-reintentar-nota-credito").isVisible();
    await foto("01-nota-sin-confirmar");
    check(nombre, "FE 502: la nota queda 'sin confirmar' con boton de reintento (CA-01, RN-06)", titulo === "Nota de crédito sin confirmar" && boton, titulo);
    await popup.getByRole("button", { name: "Ver nota de crédito" }).click();
  });

  await escenario(nombre, "tras recargar, el detalle de la nota muestra el aviso y no ofrece 'Verificar estado fiscal'", async () => {
    // La recarga descarta todo lo que la pagina tenia en memoria, incluida la sesion si no persiste.
    await page.reload({ waitUntil: "domcontentloaded" });
    await Promise.race([
      page.getByRole("button", { name: "Abrir menu" }).first().waitFor({ timeout: 15000 }),
      page.locator('input[name="username"]').waitFor({ timeout: 15000 })
    ]);
    if (await page.locator('input[name="username"]').isVisible()) await login(page);
    await irADocumentos(page);
    await abrir(page, razonTrabada, "Nota credito");
    const banner = page.locator(".accion-banner").first();
    const titulo = (await banner.locator(".accion-banner-titulo").innerText()).trim();
    const verificar = await banner.getByRole("button", { name: "Verificar estado fiscal" }).count();
    const encabezado = await page.locator("h3", { hasText: "Nota de crédito sin confirmar" }).count();
    const procesando = await page.getByText("Procesando nota de crédito").count();
    await foto("02-detalle-sin-confirmar");
    check(
      nombre,
      "tras recargar, el detalle de la nota muestra el aviso y no ofrece 'Verificar estado fiscal'",
      titulo === "Nota de crédito sin confirmar" && verificar === 0 && encabezado > 0 && procesando === 0 && (await sinDesplazamiento(page)),
      `${titulo} verificar=${verificar} encabezado=${encabezado} procesando=${procesando}`
    );
  });

  await escenario(nombre, "reintento con la misma clave deja la nota emitida (CA-01, CA-04)", async () => {
    await page.getByTestId("reintentar-nota-credito").click();
    await page.locator(".accion-banner-titulo", { hasText: "Nota de crédito emitida" }).first().waitFor({ timeout: 15000 });
    await foto("03-nota-emitida");
    const filas = psql(`
      select count(*) || ':' || string_agg(estado, ',') || ':' || count(distinct external_ref)
      from facturas_operativas where documento_relacionado_id = '${facturaTrabada}' and tipo = 'NOTA_CREDITO'`);
    check(nombre, "reintento con la misma clave deja la nota emitida (CA-01, CA-04)", filas === "1:EMITIDA:1", filas);
  });

  await escenario(nombre, "nota rechazada ofrece 'Emitir nueva nota de crédito' y no 'Corregir y emitir de nuevo' (RN-07)", async () => {
    await page.getByRole("button", { name: "Volver" }).first().click().catch(() => {});
    await irADocumentos(page);
    await abrir(page, razonRechazo, "Factura");
    await pedirNotaCredito(page, "[FE-REJECTED] devolucion e2e");
    const popup = page.locator('section[aria-labelledby="nc-success-title"]');
    await popup.waitFor();
    await popup.getByRole("button", { name: "Ver nota de crédito" }).click();
    await page.getByTestId("nueva-nota-credito").waitFor({ timeout: 15000 });
    const corregir = await page.getByRole("button", { name: "Corregir y emitir de nuevo" }).count();
    await foto("04-nota-rechazada");
    check(nombre, "nota rechazada ofrece 'Emitir nueva nota de crédito' y no 'Corregir y emitir de nuevo' (RN-07)", corregir === 0, `corregir=${corregir}`);
  });

  await escenario(nombre, "la nueva nota sobre la factura con nota rechazada se emite (CA-05)", async () => {
    await page.getByTestId("nueva-nota-credito").click();
    await page.locator(".modal-panel textarea").fill("devolucion corregida e2e");
    await page.getByRole("button", { name: "Confirmar" }).click();
    const popup = page.locator('section[aria-labelledby="nc-success-title"]');
    await popup.waitFor();
    await foto("05-segunda-nota");
    const filas = psql(`
      select string_agg(estado, ',' order by created_at) || ':' || count(distinct external_ref)
      from facturas_operativas where documento_relacionado_id = '${facturaRechazo}' and tipo = 'NOTA_CREDITO'`);
    check(nombre, "la nueva nota sobre la factura con nota rechazada se emite (CA-05)", filas === "RECHAZADA,EMITIDA:2", filas);
    await popup.getByRole("button", { name: "Ver nota de crédito" }).click();
  });

  await contexto.close();
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  sembrarUsuarios();
  const browser = await chromium.launch();
  for (const vp of viewports) {
    await correr(browser, vp);
  }
  await browser.close();
  const fallos = resultados.filter((r) => !r.ok);
  fs.writeFileSync(path.join(outDir, "resultado.json"), JSON.stringify(resultados, null, 2));
  console.log(`\n${resultados.length - fallos.length}/${resultados.length} verificaciones OK. Capturas en ${outDir}`);
  process.exit(fallos.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
