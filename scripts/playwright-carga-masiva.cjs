#!/usr/bin/env node
// SPEC_CARGA_MASIVA_FACTURAS_v0.1, G2. Flujo real: UI + API + Postgres de los contenedores, con el
// gateway fiscal en modo mock. No simula respuestas de la API. Nunca contra segel-fs ni produccion.
//
//   E2E_BASE_URL=http://127.0.0.1:8392/app/ E2E_API_CONTAINER=fs-cm-api-1 E2E_PG_CONTAINER=fs-cm-postgres-1 \
//     node scripts/playwright-carga-masiva.cjs
//
// La contrasena de los usuarios de prueba se genera en cada corrida y no se guarda.
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");

const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8392/app/";
const apiContainer = process.env.E2E_API_CONTAINER ?? "fs-cm-api-1";
const pgContainer = process.env.E2E_PG_CONTAINER ?? "fs-cm-postgres-1";
const outDir = process.env.E2E_OUT_DIR ?? path.join(process.cwd(), "test-results", "carga-masiva");
const viewports = [
  { nombre: "1280", width: 1280, height: 800 },
  { nombre: "390", width: 390, height: 844 }
];
const password = `E2e-${crypto.randomBytes(18).toString("base64url")}`;
const corrida = String(Date.now()).slice(-8);
const dirArchivos = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-carga-"));
const TITULOS = "numero_comprobante;referencia_venta;receptor_email;item_codigo";

const resultados = [];
function check(viewport, escenario, ok, detalle = "") {
  resultados.push({ viewport, escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 200) });
  console.log(`${ok ? "OK  " : "FALLA"} [${viewport}] ${escenario}${!ok && detalle ? ` :: ${String(detalle).slice(0, 200)}` : ""}`);
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

/** El worker corre con su propia agenda: esto evita esperar los 5 minutos de EN_SIFEN. */
function adelantarSincronizacion() {
  psql("update cargas_masivas set sync_next_at = now() where sync_next_at is not null;");
}

let contador = 0;
function archivo(prefijo, filas) {
  contador += 1;
  const ruta = path.join(dirArchivos, `${prefijo}-${corrida}-${contador}.csv`);
  fs.writeFileSync(ruta, [TITULOS, ...filas].join("\n"));
  return ruta;
}

function numero(n) {
  contador += 1;
  return `001-001-${String(Number(corrida.slice(-4)) * 100 + contador + n).padStart(7, "0")}`;
}

async function login(page, usuario) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(usuario);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.getByRole("button", { name: "Abrir menu" }).first().waitFor({ timeout: 15000 });
}

async function irADocumentos(page) {
  await page.getByRole("button", { name: "Abrir menu" }).first().click();
  await page.locator('button:has-text("Documentos")').first().click();
  await page.getByRole("heading", { name: "Facturas y notas" }).waitFor({ timeout: 15000 });
}

async function irACargas(page) {
  await irADocumentos(page);
  await page.getByRole("button", { name: /^Cargas por planilla/ }).click();
  await page.getByRole("heading", { name: "Cargas por planilla" }).waitFor({ timeout: 15000 });
}

async function sinDesplazamiento(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

async function subir(page, ruta) {
  await page.getByRole("button", { name: "Nueva carga" }).click();
  await page.locator('input[type="file"]').setInputFiles(ruta);
  await page.getByRole("button", { name: "Subir archivo" }).click();
}

async function volverALista(page) {
  await page.getByRole("button", { name: "Volver a las cargas" }).click();
  await page.getByRole("heading", { name: "Cargas por planilla" }).waitFor();
}

async function esperarEstado(page, texto, timeout = 45000) {
  await page.locator(`.carga-encabezado .status-pill:has-text("${texto}")`).waitFor({ timeout });
}

async function escenario(vp, nombre, fn) {
  try {
    await fn();
  } catch (error) {
    check(vp, nombre, false, error.message.split("\n")[0]);
  }
}

async function correr(browser, vp) {
  const { nombre } = vp;
  const contexto = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, acceptDownloads: true });
  const page = await contexto.newPage();
  page.setDefaultTimeout(20000);
  const foto = (paso) => page.screenshot({ path: path.join(outDir, `${nombre}-${paso}.png`), fullPage: true });

  await login(page, "e2e.cm.servicio");
  await irACargas(page);
  check(nombre, "pestana Carga masiva visible con la bandera encendida", true);
  await foto("01-listado");

  await escenario(nombre, "plantilla descargada", async () => {
    const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Descargar plantilla" }).click()]);
    const contenido = fs.readFileSync(await descarga.path(), "utf8");
    check(nombre, "plantilla descargada", descarga.suggestedFilename() === "plantilla-carga-facturas.csv" && contenido.includes("numero_comprobante"));
  });

  await escenario(nombre, "nueva carga muestra contexto y aviso", async () => {
    await page.getByRole("button", { name: "Nueva carga" }).click();
    const contexto = await page.locator(".carga-contexto").innerText();
    const aviso = await page.locator(".carga-masiva").innerText();
    check(nombre, "nueva carga muestra contexto y aviso", contexto.includes("001-001") && contexto.includes("La asigna el servicio") && aviso.includes("Confirmar emite facturas reales"));
    await foto("02-nueva");
    await page.locator('input[type="file"]').setInputFiles({ name: "ventas.txt", mimeType: "text/plain", buffer: Buffer.from("x") });
    check(nombre, "extension no admitida se avisa antes de subir", await page.getByText("El archivo debe ser .csv o .zip.").isVisible());
    await page.locator(".carga-masiva").getByRole("button", { name: "Volver", exact: true }).click();
    await page.getByRole("heading", { name: "Cargas por planilla" }).waitFor();
  });

  await escenario(nombre, "archivo rechazado con motivo, fila y columna", async () => {
    const ruta = path.join(dirArchivos, `mal-${nombre}-${corrida}.csv`);
    fs.writeFileSync(ruta, `otra;columna\n${corrida};${nombre}\n`);
    await subir(page, ruta);
    await esperarEstado(page, "Archivo rechazado");
    const texto = await page.locator(".error-banner").innerText();
    check(nombre, "archivo rechazado con motivo, fila y columna", texto.includes("COLUMNA_DESCONOCIDA") && texto.includes("Fila 1") && texto.includes("numero_comprobante"), texto);
    await foto("03-rechazado");
    await volverALista(page);
  });

  const nrosInforme = [numero(0), numero(0), numero(0), numero(0)];
  const rutaInforme = archivo(`informe-${nombre}`, [
    `${nrosInforme[0]};PED-OK;a@b.py;A`,
    `${nrosInforme[1]};INVALIDO-1;;A`,
    `${nrosInforme[2]};AVISO-1;;A`,
    `${nrosInforme[3]};RECHAZO-1;;A`
  ]);

  await escenario(nombre, "informe con errores y avisos", async () => {
    await subir(page, rutaInforme);
    await esperarEstado(page, "Lista para confirmar");
    await page.locator(".carga-tabla").first().waitFor();
    const tabla = await page.locator(".carga-masiva").innerText();
    check(nombre, "informe con errores y avisos", tabla.includes("TOTAL_NO_COINCIDE") && tabla.includes("total_comprobante") && tabla.includes("TRANSMISION_EXTEMPORANEA"), tabla);
    check(nombre, "la pantalla dice que los errores se corrigen en el archivo", tabla.includes("se corrigen en el archivo"));
    await page.getByRole("button", { name: "Con errores" }).click();
    await page.waitForFunction(() => document.querySelectorAll(".carga-masiva table tbody tr").length === 1);
    check(nombre, "filtro de comprobantes", (await page.locator(".carga-masiva table tbody tr").count()) === 1);
    await page.getByRole("button", { name: "Todos" }).click();
    await page.waitForFunction(() => document.querySelectorAll(".carga-masiva table tbody tr").length === 4);
    await foto("04-informe");
    check(nombre, "informe sin desplazamiento horizontal", await sinDesplazamiento(page));
  });

  await escenario(nombre, "confirmar pide doble confirmacion", async () => {
    await page.getByRole("button", { name: "Confirmar y emitir" }).click();
    const dialogo = await page.getByRole("dialog").innerText();
    check(nombre, "confirmar pide doble confirmacion con la cantidad", dialogo.includes("Se emitirán 3 facturas reales") && dialogo.includes("1 comprobante(s) con errores"), dialogo);
    await foto("05-confirmar");
    await page.getByRole("button", { name: "Sí, emitir 3 facturas" }).click();
    await page.locator('.carga-encabezado .status-pill:has-text("Emitiendo"), .carga-encabezado .status-pill:has-text("En SIFEN"), .carga-encabezado .status-pill:has-text("Finalizada")').first().waitFor();
    await foto("06-avance");
    check(nombre, "avance visible tras confirmar", true);
  });

  await escenario(nombre, "resultado con rechazo, aprobado y descarga", async () => {
    await esperarEstado(page, "Finalizada", 70000);
    adelantarSincronizacion();
    await page.waitForTimeout(5000);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Abrir menu" }).first().waitFor();
    await irACargas(page);
    await page.locator(".carga-enlace", { hasText: path.basename(rutaInforme) }).first().click();
    await esperarEstado(page, "Finalizada");
    await page.getByRole("button", { name: "Ver factura" }).first().waitFor({ timeout: 20000 });
    const tabla = await page.locator(".carga-masiva").innerText();
    check(nombre, "resultado con rechazo y aprobado", tabla.includes("1306") && tabla.includes("Aprobado") && tabla.includes("Enviado"), tabla);
    const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Descargar resultado" }).click()]);
    check(nombre, "descarga del resultado", descarga.suggestedFilename().startsWith("resultado-") && fs.readFileSync(await descarga.path(), "utf8").includes(nrosInforme[0]));
    await foto("07-resultado");
    check(nombre, "resultado sin desplazamiento horizontal", await sinDesplazamiento(page));
  });

  await escenario(nombre, "factura de carga en Facturas con marca y enlace", async () => {
    await page.getByRole("button", { name: "Ver factura" }).first().click();
    await page.getByText("Cliente de carga").first().waitFor();
    const detalle = await page.locator(".documents-view").innerText();
    check(nombre, "la factura de carga abre su detalle con su cliente e items", detalle.includes("Item de carga"), detalle);
    await foto("08-factura");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Abrir menu" }).first().waitFor();
    await irADocumentos(page);
    const marca = page.locator(".carga-marca .carga-enlace").first();
    await marca.waitFor({ timeout: 15000 });
    check(nombre, "marca Carga en la lista de Facturas", (await marca.innerText()) === "Carga");
    await foto("09-facturas");
    await marca.click();
    await page.locator(".carga-masiva .carga-encabezado h3").first().waitFor();
    check(nombre, "la marca abre su carga", (await page.locator(".carga-masiva h3").first().innerText()).includes("-"));
    await page.getByRole("button", { name: "Volver a las cargas" }).click();
  });

  await escenario(nombre, "CA-05: KuDE, cancelacion y nota de credito sobre facturas de carga", async () => {
    const pedir = (nombreArchivo) =>
      page.evaluate(async ({ nombreArchivo }) => {
        const sesion = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" });
        const { access_token: token } = await sesion.json();
        const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
        const { items: cargas } = await (await fetch("/api/v1/cargas?limit=100", { headers })).json();
        const carga = cargas.find((c) => c.nombre_archivo === nombreArchivo);
        const { items } = await (await fetch(`/api/v1/facturas?carga_id=${carga.id}&limit=100`, { headers })).json();
        const emitidas = items.filter((f) => f.estado === "EMITIDA");
        const enlace = await fetch(`/api/v1/facturas/${emitidas[0].id}/delivery-link`, { method: "POST", headers, body: "{}" });
        const { public_url: url } = await enlace.json();
        const kude = await fetch(`${new URL(url).pathname}/kude.pdf`);
        const cancelar = await fetch(`/api/v1/facturas/${emitidas[0].id}/cancelar`, { method: "POST", headers, body: JSON.stringify({ motivo: "Prueba de carga" }) });
        const nota = await fetch(`/api/v1/facturas/${emitidas[1].id}/nota-credito`, { method: "POST", headers: { ...headers, "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ motivo: "Prueba de carga" }) });
        return { documentos: items.length, emitidas: emitidas.length, enlace: enlace.status, kude: kude.status, cancelar: cancelar.status, nota: nota.status, cancelada: emitidas[0].id, notaCuerpo: nota.ok ? "" : await nota.text() };
      }, { nombreArchivo });
    const r = await pedir(path.basename(rutaInforme));
    check(nombre, "CA-05: el filtro carga_id trae solo sus facturas (invalido fuera)", r.documentos === 3 && r.emitidas === 2, JSON.stringify(r));
    check(nombre, "CA-05: KuDE descargable por el enlace publico", r.enlace < 300 && r.kude === 200, JSON.stringify(r));
    check(nombre, "CA-05: la factura de carga se cancela", r.cancelar < 300, JSON.stringify(r));
    check(nombre, "CA-05: la factura de carga recibe nota de credito", r.nota < 300, JSON.stringify(r));
    const estadoAntes = psql(`select estado from facturas_operativas where id = '${r.cancelada}';`).trim();
    psql(`update cargas_masivas set sync_next_at = now(), sincronizada_hasta = null where nombre_archivo = '${path.basename(rutaInforme)}';`);
    await page.waitForTimeout(6000);
    const estadoDespues = psql(`select estado from facturas_operativas where id = '${r.cancelada}';`).trim();
    check(nombre, "CA-06: la sincronizacion no revierte la cancelacion hecha en FS", estadoDespues === estadoAntes, `${estadoAntes} -> ${estadoDespues}`);
  });

  await escenario(nombre, "archivo repetido abre la carga anterior", async () => {
    await subir(page, rutaInforme);
    await page.locator(".carga-aviso", { hasText: "ya se había subido" }).waitFor({ timeout: 15000 });
    check(nombre, "archivo repetido abre la carga anterior", (await page.locator(".carga-masiva h3").first().innerText()) === path.basename(rutaInforme));
    await volverALista(page);
  });

  await escenario(nombre, "comprobante en error con reintento y carga en espera", async () => {
    const primera = archivo(`error-${nombre}`, [`${numero(0)};PED-${corrida}-1;;A`, `${numero(0)};ERROR-${corrida};;A`]);
    await subir(page, primera);
    await esperarEstado(page, "Lista para confirmar");
    await page.getByRole("button", { name: "Confirmar y emitir" }).click();
    await page.getByRole("button", { name: /Sí, emitir/ }).click();
    await page.locator(".carga-aviso", { hasText: "falla del servicio" }).waitFor({ timeout: 20000 });
    await page.getByRole("button", { name: "Reintentar fallas" }).waitFor({ timeout: 20000 });
    check(nombre, "comprobante en error se explica y ofrece reintentar", true);
    await foto("10-error");

    const dialogoAbierto = page.getByRole("button", { name: "Cancelar carga" });
    await dialogoAbierto.click();
    const textoCancelar = await page.getByRole("dialog").innerText();
    await page.locator(".carga-masiva").getByRole("button", { name: "Volver", exact: true }).click();
    if (await page.locator('.carga-encabezado .status-pill:has-text("En SIFEN")').isVisible()) {
      check(nombre, "cancelar en SIFEN avisa que lo preparado se transmite", textoCancelar.includes("siguen su curso"), textoCancelar);
    } else {
      check(nombre, "cancelar avisa que lo preparado se transmite", textoCancelar.includes("siguen su curso"), textoCancelar);
    }

    await volverALista(page);
    const segunda = archivo(`espera-${nombre}`, [`${numero(0)};PED-${corrida}-2;;A`]);
    await subir(page, segunda);
    await esperarEstado(page, "Lista para confirmar");
    await page.getByRole("button", { name: "Confirmar y emitir" }).click();
    await page.getByRole("button", { name: /Sí, emitir/ }).click();
    await esperarEstado(page, "En espera de otra carga", 15000);
    const texto = await page.locator(".carga-avance").innerText();
    check(nombre, "carga en espera de otra se distingue de emitiendo", texto.includes("Espera a que termine otra carga"), texto);
    await foto("11-en-espera");

    await volverALista(page);
    await page.locator(".carga-enlace", { hasText: path.basename(primera) }).first().click();
    await page.getByRole("button", { name: "Reintentar fallas" }).click();
    await esperarEstado(page, "Finalizada", 70000);
    check(nombre, "el reintento termina la carga", true);
    await volverALista(page);
    await page.locator(".carga-enlace", { hasText: path.basename(segunda) }).first().click();
    await esperarEstado(page, "Finalizada", 70000);
    check(nombre, "la carga en espera arranca cuando termina la otra", true);
    await volverALista(page);
  });

  await escenario(nombre, "cancelar una carga validada", async () => {
    await subir(page, archivo(`cancelar-${nombre}`, [`${numero(0)};PED-${corrida}-3;;A`]));
    await esperarEstado(page, "Lista para confirmar");
    await page.getByRole("button", { name: "Cancelar carga" }).click();
    await page.getByRole("button", { name: "Sí, cancelar" }).click();
    await esperarEstado(page, "Cancelada", 15000);
    check(nombre, "cancelar una carga validada", true);
    await volverALista(page);
  });

  await escenario(nombre, "topes de tamano", async () => {
    const grande = (mb) => {
      const ruta = path.join(dirArchivos, `grande-${mb}-${nombre}-${corrida}.csv`);
      const relleno = Buffer.alloc(mb * 1024 * 1024, "a");
      fs.writeFileSync(ruta, Buffer.concat([Buffer.from(`${TITULOS}\n`), relleno]));
      return ruta;
    };
    const pedir = async (ruta) =>
      page.evaluate(async ({ b64 }) => {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const sesion = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" });
        const { access_token: token } = await sesion.json();
        const r = await fetch(`/api/v1/cargas?nombre_archivo=tope.csv`, { method: "POST", headers: { "content-type": "text/csv", authorization: `Bearer ${token}` }, body: bytes });
        return { status: r.status, cuerpo: await r.text() };
      }, { b64: fs.readFileSync(ruta).toString("base64") });

    const veintiuno = await pedir(grande(21));
    check(nombre, "21 MB atraviesa nginx y API y recibe el 413 del mock con tope_bytes", veintiuno.status === 413 && veintiuno.cuerpo.includes("20971520"), veintiuno.cuerpo);
    const veinticinco = await pedir(grande(24.5));
    check(nombre, "por encima de 24 MB recibe el 413 de la API de FS, no del nginx", veinticinco.status === 413 && veinticinco.cuerpo.includes("25165824"), veinticinco.cuerpo);

    await page.getByRole("button", { name: "Nueva carga" }).click();
    await page.locator('input[type="file"]').setInputFiles(grande(21));
    await page.getByRole("button", { name: "Subir archivo" }).click();
    await page.locator(".error-banner", { hasText: "20 MB" }).waitFor({ timeout: 30000 });
    check(nombre, "la pantalla explica el tope y pide partir el archivo", (await page.locator(".error-banner").innerText()).includes("Pártelo"));
    await foto("12-tope");
    await page.locator(".carga-masiva").getByRole("button", { name: "Volver", exact: true }).click();
  });

  await escenario(nombre, "un archivo de 2 MB sube por todo el stack", async () => {
    const filas = [`${numero(0)};PED-GRANDE-${nombre}-${corrida};;A`];
    const relleno = "x".repeat(200);
    const lineas = [...filas];
    while (Buffer.byteLength(lineas.join("\n")) < 2 * 1024 * 1024) lineas.push(`${numero(0)};${relleno};;A`);
    await subir(page, archivo(`dos-mb-${nombre}`, lineas));
    await esperarEstado(page, "Lista para confirmar", 20000);
    check(nombre, "un archivo de 2 MB sube por todo el stack", true);
    await page.getByRole("button", { name: "Cancelar carga" }).click();
    await page.getByRole("button", { name: "Sí, cancelar" }).click();
    await esperarEstado(page, "Cancelada", 15000);
    await volverALista(page);
  });

  check(nombre, "listado sin desplazamiento horizontal", await sinDesplazamiento(page));
  await foto("13-listado-final");
  await contexto.close();

  // Contexto con numeracion del cliente.
  const ctxCliente = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const pagCliente = await ctxCliente.newPage();
  pagCliente.setDefaultTimeout(20000);
  await escenario(nombre, "contexto CLIENTE", async () => {
    await login(pagCliente, "e2e.cm.cliente");
    await pagCliente.getByRole("button", { name: "Abrir menu" }).first().click();
    const item = pagCliente.locator('button.menu-item:has-text("Nueva factura")').first();
    check(nombre, "contexto CLIENTE: Nueva factura deshabilitada", await item.isDisabled());
    check(nombre, "contexto CLIENTE: explica por que", (await item.innerText()).includes("Este punto emite por carga masiva"));
    check(nombre, "contexto CLIENTE: Notas de crédito sigue disponible", !(await pagCliente.locator('button.menu-item:has-text("Notas de crédito")').first().isDisabled()));
    await pagCliente.screenshot({ path: path.join(outDir, `${nombre}-14-cliente-menu.png`) });
    await pagCliente.locator('button:has-text("Documentos")').first().click();
    await pagCliente.getByRole("button", { name: /^Cargas por planilla/ }).click();
    await pagCliente.getByRole("heading", { name: "Cargas por planilla" }).waitFor();
    const lista = await pagCliente.locator(".carga-masiva").innerText();
    check(nombre, "CA-04: otro contexto del facturador no ve las cargas ajenas", !lista.includes(`informe-${nombre}-${corrida}`), lista);
    await pagCliente.getByRole("button", { name: "Nueva carga" }).click();
    check(nombre, "contexto CLIENTE: la forma de numerar se muestra", (await pagCliente.locator(".carga-contexto").innerText()).includes("La trae el archivo"));
    await pagCliente.locator('input[type="file"]').setInputFiles(rutaInforme);
    await pagCliente.getByRole("button", { name: "Subir archivo" }).click();
    const aviso = pagCliente.locator(".error-banner", { hasText: "otro contexto" });
    await aviso.waitFor({ timeout: 15000 });
    check(nombre, "archivo repetido en otro contexto se avisa sin abrir la carga ajena", true);
    await pagCliente.locator(".carga-masiva").getByRole("button", { name: "Volver", exact: true }).click();
    const conSalteados = archivo(`salteados-${nombre}`, [`${numero(0)};PED-S-${corrida};;A`, `${numero(0)};INVALIDO-S;;A`]);
    await pagCliente.getByRole("button", { name: "Nueva carga" }).click();
    await pagCliente.locator('input[type="file"]').setInputFiles(conSalteados);
    await pagCliente.getByRole("button", { name: "Subir archivo" }).click();
    await pagCliente.locator('.carga-encabezado .status-pill:has-text("Lista para confirmar")').waitFor({ timeout: 45000 });
    await pagCliente.getByRole("button", { name: "Confirmar y emitir" }).click();
    check(nombre, "numeracion del cliente: avisa los numeros salteados", (await pagCliente.getByRole("dialog").innerText()).includes("quedarán salteados"));
    await pagCliente.locator(".carga-masiva").getByRole("button", { name: "Volver", exact: true }).click();
    await pagCliente.getByRole("button", { name: "Cancelar carga" }).click();
    await pagCliente.getByRole("button", { name: "Sí, cancelar" }).click();
  });
  await ctxCliente.close();

  // Rol interno.
  const ctxSoporte = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const pagSoporte = await ctxSoporte.newPage();
  pagSoporte.setDefaultTimeout(20000);
  await escenario(nombre, "rol interno", async () => {
    await login(pagSoporte, "e2e.cm.soporte");
    await irACargas(pagSoporte);
    await pagSoporte.locator(".carga-enlace", { hasText: `salteados-${nombre}` }).first().waitFor({ timeout: 15000 });
    check(nombre, "rol interno ve las cargas de otro contexto del facturador", true);
    await pagSoporte.locator(".carga-enlace", { hasText: `informe-${nombre}` }).first().click();
    await pagSoporte.getByRole("button", { name: "Ver lotes SIFEN" }).click();
    await pagSoporte.locator("th", { hasText: "Lote" }).first().waitFor({ state: "attached" });
    check(nombre, "rol interno ve los lotes SIFEN", true);
    await pagSoporte.screenshot({ path: path.join(outDir, `${nombre}-15-soporte-lotes.png`), fullPage: true });
  });
  await ctxSoporte.close();
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  sembrar();
  const browser = await chromium.launch();
  for (const vp of viewports) {
    await correr(browser, vp);
  }
  await browser.close();
  fs.rmSync(dirArchivos, { recursive: true, force: true });

  const fallos = resultados.filter((r) => !r.ok);
  fs.writeFileSync(path.join(outDir, "resultado.json"), JSON.stringify(resultados, null, 2));
  console.log(`\n${resultados.length - fallos.length}/${resultados.length} verificaciones OK. Capturas en ${outDir}`);
  process.exit(fallos.length ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(2);
});
