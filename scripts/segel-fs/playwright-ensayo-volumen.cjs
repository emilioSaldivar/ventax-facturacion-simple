#!/usr/bin/env node
// Ensayo de volumen de la segunda entrega (PLAN_DESPLIEGUE_SEGEL_FS_v0.2, seccion 4.1; TASKS SF2-018b).
// Recorre la pestana Carga masiva del panel de FS como el operador: subir, revisar el informe, confirmar y
// seguir la carga hasta "Finalizada". Solo contra el stack local del ensayo (SIFEN test), nunca segel-fs.
//
//   ENSAYO_PASSWORD_FILE=/ruta/operador.pass node scripts/segel-fs/playwright-ensayo-volumen.cjs <fase> <archivo>...
//
//   fase sondeo  <csv>            una carga, se espera Finalizada
//   fase A       <csv>            una carga sola, como sonda
//   fase BC      <csv-B> <csv-C>  dos cargas seguidas: la segunda debe esperar a la primera
//   fase vistas                   capturas de la lista de cargas y de Documentos en 390 y 1280
//
// Anota los hitos con medir-carga.sh si ENSAYO_CORRIDA esta definida. Escribe test-results/ensayo-volumen/.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const corrida = process.env.ENSAYO_CORRIDA ?? "";
const outDir = path.join(process.cwd(), "test-results", "ensayo-volumen");
const LIMITE_CARGA_MS = Number(process.env.ENSAYO_LIMITE_MIN ?? 30) * 60_000;
const [fase, ...archivos] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

const resultados = [];
function check(escenario, ok, detalle = "") {
  resultados.push({ fase, escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 300), hora: new Date().toISOString() });
  console.log(`${ok ? "OK  " : "FALLA"} [${fase}] ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 300)}` : ""}`);
}
function marca(texto) {
  console.log(`${new Date().toISOString()} ${texto}`);
  if (corrida) execFileSync("bash", [path.join(__dirname, "medir-carga.sh"), "marca", corrida, texto]);
}

async function login(page) {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(usuario);
  await page.locator('input[name="password"]').fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await page.getByRole("button", { name: "Abrir menu" }).first().waitFor({ timeout: 20000 });
}

async function irACargas(page) {
  await page.getByRole("button", { name: "Abrir menu" }).first().click();
  await page.locator('button:has-text("Documentos")').first().click();
  await page.getByRole("heading", { name: "Facturas y notas" }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Carga masiva" }).click();
  await page.getByRole("heading", { name: "Cargas de facturas" }).waitFor({ timeout: 20000 });
}

async function estado(page) {
  return (await page.locator(".carga-encabezado .status-pill").first().innerText().catch(() => "")).trim();
}

/** Sube y confirma. Devuelve el nombre del archivo, que identifica la carga en la lista. */
async function subirYConfirmar(page, ruta, etiqueta) {
  const filas = fs.readFileSync(ruta, "utf8").trim().split("\n").length - 1;
  await page.getByRole("button", { name: "Nueva carga" }).click();
  await page.locator('input[type="file"]').setInputFiles(ruta);
  await page.getByRole("button", { name: "Subir archivo" }).click();
  marca(`${etiqueta}: subida (${filas} filas)`);
  await page.locator('.carga-encabezado .status-pill:has-text("Lista para confirmar"), .carga-encabezado .status-pill:has-text("Archivo rechazado")').first().waitFor({ timeout: 180000 });
  const st = await estado(page);
  await page.screenshot({ path: path.join(outDir, `${fase}-${etiqueta}-informe.png`), fullPage: true });
  if (!st.includes("Lista para confirmar")) {
    check(`${etiqueta}: archivo validado`, false, `${st} :: ${await page.locator(".carga-masiva").innerText()}`);
    return null;
  }
  marca(`${etiqueta}: validada`);
  await page.getByRole("button", { name: "Confirmar y emitir" }).click();
  const dialogo = await page.getByRole("dialog").innerText();
  const esperado = `Se emitirán ${filas} facturas reales`;
  check(`${etiqueta}: el informe no tiene errores y el dialogo pide ${filas}`, dialogo.includes(esperado) && !dialogo.includes("con errores"), dialogo);
  await page.getByRole("button", { name: `Sí, emitir ${filas} facturas` }).click();
  marca(`${etiqueta}: confirmada`);
  return path.basename(ruta);
}

async function abrirCarga(page, nombreArchivo) {
  await page.locator(".carga-enlace", { hasText: nombreArchivo }).first().click();
  await page.locator(".carga-encabezado .status-pill").first().waitFor({ timeout: 20000 });
}

/** Sigue una carga hasta un estado final, recargando la vista; anota cada cambio de estado. */
async function seguir(page, nombreArchivo, etiqueta) {
  const fin = Date.now() + LIMITE_CARGA_MS;
  let anterior = "";
  while (Date.now() < fin) {
    const st = await estado(page);
    if (st && st !== anterior) {
      marca(`${etiqueta}: ${st}`);
      anterior = st;
    }
    if (/Finalizada|Cancelada|Archivo rechazado/.test(st)) return st;
    await page.waitForTimeout(15000);
    await page.getByRole("button", { name: "Volver a las cargas" }).click().catch(() => {});
    await page.getByRole("heading", { name: "Cargas de facturas" }).waitFor({ timeout: 20000 }).catch(() => {});
    await abrirCarga(page, nombreArchivo).catch(() => {});
  }
  return `TIEMPO AGOTADO (${anterior})`;
}

async function resultado(page, etiqueta, filas) {
  const texto = await page.locator(".carga-masiva").innerText();
  await page.screenshot({ path: path.join(outDir, `${fase}-${etiqueta}-final.png`), fullPage: true });
  const aprobados = /Aprobados\s*\n?\s*(\d+)/.exec(texto)?.[1];
  const rechazados = /Rechazados\s*\n?\s*(\d+)/.exec(texto)?.[1];
  check(`${etiqueta}: ${filas} aprobadas, 0 rechazadas`, Number(aprobados) === filas && Number(rechazados ?? 0) === 0, `aprobados=${aprobados} rechazados=${rechazados}`);
  return { aprobados: Number(aprobados), rechazados: Number(rechazados ?? 0) };
}

async function vistas(browser) {
  for (const vp of [{ n: "390", w: 390, h: 844 }, { n: "1280", w: 1280, h: 800 }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
    const page = await ctx.newPage();
    await login(page);
    await irACargas(page);
    await page.screenshot({ path: path.join(outDir, `vistas-${vp.n}-cargas.png`), fullPage: true });
    const lista = await page.locator(".carga-masiva").innerText();
    const sinScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    check(`vistas ${vp.n}: lista de cargas sin desplazamiento horizontal`, sinScroll, lista.slice(0, 200));
    await page.getByRole("button", { name: "Facturas", exact: true }).first().click().catch(() => {});
    await page.screenshot({ path: path.join(outDir, `vistas-${vp.n}-documentos.png`), fullPage: true });
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    if (fase === "vistas") {
      await vistas(browser);
    } else {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await ctx.newPage();
      page.setDefaultTimeout(30000);
      await login(page);
      await irACargas(page);
      if (fase === "sondeo" || fase === "A") {
        const ruta = archivos[0];
        const filas = fs.readFileSync(ruta, "utf8").trim().split("\n").length - 1;
        const nombre = await subirYConfirmar(page, ruta, fase);
        if (nombre) {
          const st = await seguir(page, nombre, fase);
          check(`${fase}: carga Finalizada`, st.includes("Finalizada"), st);
          await resultado(page, fase, filas);
        }
      } else if (fase === "BC") {
        const [rutaB, rutaC] = archivos;
        const filasB = fs.readFileSync(rutaB, "utf8").trim().split("\n").length - 1;
        const filasC = fs.readFileSync(rutaC, "utf8").trim().split("\n").length - 1;
        const nombreB = await subirYConfirmar(page, rutaB, "B");
        await page.getByRole("button", { name: "Volver a las cargas" }).click();
        await page.getByRole("heading", { name: "Cargas de facturas" }).waitFor();
        const nombreC = await subirYConfirmar(page, rutaC, "C");
        // La pantalla tarda un ciclo en dejar "Lista para confirmar" tras confirmar.
        await page.locator('.carga-encabezado .status-pill:not(:has-text("Lista para confirmar"))').first().waitFor({ timeout: 20000 }).catch(() => {});
        const stC = await estado(page);
        check("C: espera a que termine B (EN_COLA)", /En espera de otra carga|Emitiendo|En SIFEN/.test(stC), stC);
        await page.screenshot({ path: path.join(outDir, `BC-C-tras-confirmar.png`), fullPage: true });
        if (nombreB && nombreC) {
          const st = await seguir(page, nombreC, "C");
          check("C: carga Finalizada", st.includes("Finalizada"), st);
          await resultado(page, "C", filasC);
          await page.getByRole("button", { name: "Volver a las cargas" }).click();
          await page.getByRole("heading", { name: "Cargas de facturas" }).waitFor();
          await abrirCarga(page, nombreB);
          const stB = await seguir(page, nombreB, "B");
          check("B: carga Finalizada", stB.includes("Finalizada"), stB);
          await resultado(page, "B", filasB);
        }
      }
      await ctx.close();
    }
  } catch (error) {
    check("ejecucion sin errores", false, error.message.split("\n")[0]);
  } finally {
    await browser.close();
  }
  const previo = fs.existsSync(path.join(outDir, "resultado.json")) ? JSON.parse(fs.readFileSync(path.join(outDir, "resultado.json"), "utf8")) : [];
  fs.writeFileSync(path.join(outDir, "resultado.json"), JSON.stringify([...previo, ...resultados], null, 2));
  const fallos = resultados.filter((r) => !r.ok);
  console.log(`\n[${fase}] ${resultados.length - fallos.length}/${resultados.length} verificaciones OK.`);
  process.exit(fallos.length ? 1 : 0);
})();
