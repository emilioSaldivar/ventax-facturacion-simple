#!/usr/bin/env node
// Catalogo en moneda extranjera (SPEC_CATALOGO_MONEDA_v0.1, TASKS CAM-009). Solo stack local de Segel; no emite.
// Crea articulos "Prueba CAM ..." y los borra al final (por la API, con la sesion del operador).
//
//   ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/segel-fs/playwright-catalogo-moneda.cjs
//
// Escribe test-results/catalogo-moneda/.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const outDir = path.join(process.cwd(), "test-results", "catalogo-moneda");
fs.mkdirSync(outDir, { recursive: true });
const sufijo = String(Date.now() % 100000);

const resultados = [];
function check(escenario, ok, detalle = "") {
  resultados.push({ escenario, ok: Boolean(ok), detalle: String(detalle).slice(0, 300) });
  console.log(`${ok ? "OK  " : "FALLA"} ${escenario}${detalle ? ` :: ${String(detalle).slice(0, 300)}` : ""}`);
}
const EMOJI = /[\p{Extended_Pictographic}]/u;
const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function entrar(browser, ancho, alto, modo = "completo") {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
  await ctx.addInitScript((m) => {
    try {
      window.localStorage.setItem("fs.editor.modo", m);
    } catch {}
  }, modo);
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  // El token de acceso vive en memoria de la app: se toma de sus propios pedidos.
  page.on("request", (r) => {
    const a = r.headers()["authorization"];
    if (a) page.__token = a;
  });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="username"]').fill(usuario);
  await page.locator('input[name="password"]').fill(clave);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await esperarSesion(page);
  return { ctx, page };
}

// Llamadas a la API con la sesion del navegador (el cliente de la app manda la cookie y el token).
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

async function borrarPruebas(page) {
  const r = await api(page, "GET", "/catalogo/items?q=Prueba%20CAM&limit=100&offset=0");
  for (const item of r.json?.items ?? []) await api(page, "DELETE", `/catalogo/items/${item.id}`);
}

async function altaEnCatalogo(page, raiz, { descripcion, moneda, precio }) {
  await raiz.getByLabel("Nombre o descripción").fill(descripcion);
  await raiz.getByLabel("Moneda").selectOption(moneda);
  await raiz.getByLabel(moneda === "PYG" ? "Precio (Gs.)" : `Precio (${moneda})`).fill(precio);
  await raiz.getByRole("button", { name: "Guardar", exact: true }).click();
}

async function casoCatalogo(browser, ancho, alto) {
  const { ctx, page } = await entrar(browser, ancho, alto);
  const escritorio = ancho >= 1024;
  try {
    // CA-01/CA-02 por la API (con la sesion del operador).
    if (ancho === 1440) {
      const sinMoneda = await api(page, "POST", "/catalogo/items", { descripcion: `Prueba CAM api ${sufijo}`, precio_unitario: 1000 });
      check("CA-01 API: sin moneda crea en PYG", sinMoneda.status === 201 && sinMoneda.json?.moneda === "PYG", JSON.stringify(sinMoneda.json));
      const usd = await api(page, "POST", "/catalogo/items", { descripcion: `Prueba CAM api usd ${sufijo}`, precio_unitario: 12.5, moneda: "USD" });
      check("CA-01 API: USD 12.5 devuelve USD y 12.5", usd.status === 201 && usd.json?.moneda === "USD" && usd.json?.precio_unitario === 12.5, JSON.stringify(usd.json));
      const tres = await api(page, "POST", "/catalogo/items", { descripcion: "Prueba CAM x", precio_unitario: 12.345, moneda: "USD" });
      check("CA-01 API: USD con 3 decimales responde 400", tres.status === 400 && tres.json?.error?.message === "En USD el precio va con hasta 2 decimales.", JSON.stringify(tres.json));
      const pyg = await api(page, "POST", "/catalogo/items", { descripcion: "Prueba CAM x", precio_unitario: 100.5 });
      check("CA-01 API: PYG con decimales responde 400", pyg.status === 400 && pyg.json?.error?.message === "En guaraníes el precio va sin decimales.", JSON.stringify(pyg.json));
      const eur = await api(page, "POST", "/catalogo/items", { descripcion: "Prueba CAM x", precio_unitario: 10, moneda: "EUR" });
      check("CA-01 API: EUR responde 400", eur.status === 400 && /Moneda no admitida/.test(eur.json?.error?.message ?? ""), JSON.stringify(eur.json));
      const soloUsd = await api(page, "GET", "/catalogo/items?moneda=USD&limit=100&offset=0");
      check("CA-02 API: filtro USD solo trae USD", soloUsd.status === 200 && (soloUsd.json?.items ?? []).every((i) => i.moneda === "USD") && soloUsd.json.items.length > 0);
      const buscar = await api(page, "GET", `/catalogo/items/search?q=${encodeURIComponent(`Prueba CAM api`)}&limit=10&moneda=USD`);
      const monedas = (buscar.json?.items ?? []).map((i) => i.moneda);
      check("CA-02 API: la busqueda trae las dos monedas con USD primero", monedas[0] === "USD" && monedas.includes("PYG"), monedas.join(","));
    }

    await abrirVista(page, "Catálogo");
    await page.getByRole("heading", { name: "Productos y servicios" }).waitFor();
    await page.waitForTimeout(600);
    const usdDesc = `Prueba CAM USD ${ancho} ${sufijo}`;
    const pygDesc = `Prueba CAM Gs ${ancho} ${sufijo}`;
    const abrirAlta = async () => {
      await page.getByRole("button", { name: escritorio ? "Nuevo producto o servicio" : "Nuevo" }).first().click();
      const raiz = escritorio ? page.locator("aside.catalogo-panel") : page.getByRole("dialog", { name: "Nuevo producto o servicio" });
      await raiz.waitFor();
      return raiz;
    };
    let raiz = await abrirAlta();
    if (!escritorio) {
      const alto = await raiz.getByLabel("Moneda").evaluate((e) => e.getBoundingClientRect().height);
      check("CA-05 390: el selector de moneda mide al menos 44 px", alto >= 44, alto);
    }
    check(`CA-04 ${ancho}: el precio arranca en Gs.`, (await raiz.getByLabel("Precio (Gs.)").count()) === 1);
    await raiz.getByLabel("Moneda").selectOption("USD");
    check(`CA-04 ${ancho}: con USD el rotulo cambia y aparece la ayuda de centavos`, (await raiz.getByLabel("Precio (USD)").count()) === 1 && (await raiz.innerText()).includes("Con hasta 2 decimales"));
    if (escritorio) await page.screenshot({ path: path.join(outDir, `${ancho}-catalogo-alta-usd.png`), fullPage: true });
    else await page.screenshot({ path: path.join(outDir, `390-catalogo-alta-usd.png`) });
    await altaEnCatalogo(page, raiz, { descripcion: usdDesc, moneda: "USD", precio: "12,50" });
    await page.waitForTimeout(900);
    raiz = await abrirAlta();
    await altaEnCatalogo(page, raiz, { descripcion: pygDesc, moneda: "PYG", precio: "15000" });
    await page.waitForTimeout(900);
    await page.getByPlaceholder("Buscar producto o servicio...").fill(`Prueba CAM`);
    await page.waitForTimeout(900);
    const lista = async () => (await page.locator(escritorio ? "table.catalogo-tabla tbody" : ".documents-list").innerText()).replace(/\s+/g, " ");
    const todo = await lista();
    check(`CA-04 ${ancho}: el de USD se ve "USD 12,50"`, todo.includes(usdDesc) && todo.includes("USD 12,50"), todo.slice(0, 200));
    check(`CA-04 ${ancho}: el de Gs. se ve "Gs. 15.000"`, todo.includes(pygDesc) && /Gs\.?\s?15\.000/.test(todo));
    const grupo = page.getByRole("group", { name: "Moneda" });
    await grupo.getByRole("button", { name: "USD" }).click();
    await page.waitForTimeout(800);
    const soloUsd = await lista();
    check(`CA-04 ${ancho}: filtro USD deja solo el de USD`, soloUsd.includes(usdDesc) && !soloUsd.includes(pygDesc));
    await grupo.getByRole("button", { name: "Gs." }).click();
    await page.waitForTimeout(800);
    const soloGs = await lista();
    check(`CA-04 ${ancho}: filtro Gs. deja solo el de Gs.`, soloGs.includes(pygDesc) && !soloGs.includes(usdDesc));
    await grupo.getByRole("button", { name: "Todas" }).click();
    await page.waitForTimeout(800);

    // Editar el de USD a Gs. con 12,50: error de RN-05; con 13000 guarda.
    if (escritorio) {
      await page.locator("table.catalogo-tabla tbody tr", { hasText: usdDesc }).locator("td").first().click();
      const panel = page.locator("aside.catalogo-panel");
      await panel.waitFor();
      await panel.getByLabel("Moneda").selectOption("PYG");
      await panel.getByRole("button", { name: /Guardar/ }).first().click();
      await page.waitForTimeout(400);
      check(`CA-04 ${ancho}: pasar 12,50 a Gs. da el error de decimales`, (await panel.innerText()).includes("En guaraníes el precio va sin decimales."));
      await panel.getByLabel("Precio (Gs.)").fill("13000");
      await panel.getByRole("button", { name: /Guardar/ }).first().click();
      await page.waitForTimeout(900);
      check(`CA-04 ${ancho}: con 13000 guarda en Gs.`, (await lista()).includes("13.000"));
    }
    check(`CA ${ancho}: sin desplazamiento horizontal`, await sinDesborde(page));
    check(`CA ${ancho}: sin emojis`, !EMOJI.test(await page.locator("main").innerText()));
    await page.screenshot({ path: path.join(outDir, `${ancho}-catalogo.png`), fullPage: true });
  } catch (e) {
    check(`catalogo ${ancho}: sin excepciones`, false, e.message);
    await page.screenshot({ path: path.join(outDir, `${ancho}-catalogo-error.png`), fullPage: true }).catch(() => undefined);
  } finally {
    await ctx.close();
  }
}

async function elegirMoneda(page, moneda) {
  await page.locator('select[aria-label="Moneda"]').selectOption(moneda);
  if (moneda !== "PYG") await page.getByLabel("Tipo de cambio").fill("7350,5");
}

async function casoEditor(browser) {
  const { ctx, page } = await entrar(browser, 1440, 900);
  try {
    // Articulos de prueba por la API: uno en USD y uno en Gs.
    const usd = await api(page, "POST", "/catalogo/items", { descripcion: `Prueba CAM editor USD ${sufijo}`, precio_unitario: 12.5, moneda: "USD" });
    const gs = await api(page, "POST", "/catalogo/items", { descripcion: `Prueba CAM editor Gs ${sufijo}`, precio_unitario: 15000 });
    check("editor: articulos de prueba creados", usd.status === 201 && gs.status === 201);

    await abrirVista(page, "Nueva factura");
    await page.locator("table.grilla-lineas").waitFor();
    await elegirMoneda(page, "USD");
    const fila0 = page.locator('[data-grilla-fila="0"]');
    await fila0.locator('input[data-celda="descripcion"]').fill(`Prueba CAM editor`);
    const sugerencias = page.locator(".grilla-sugerencias");
    await sugerencias.waitFor();
    const textoSug = (await sugerencias.innerText()).replace(/\s+/g, " ");
    check("RN-15: las sugerencias muestran el precio con su moneda", textoSug.includes("USD 12,50") && /Gs\.?\s?15\.000/.test(textoSug), textoSug);
    check("RN-07: en USD el articulo en USD sale primero", (await sugerencias.locator("button").first().innerText()).includes("USD"));
    await sugerencias.locator("button", { hasText: "editor USD" }).click();
    await page.waitForTimeout(500);
    check("CA-06 1440: en USD el articulo en USD completa el precio 12,50", (await fila0.getByLabel(/^Precio, línea/).inputValue()).replace(".", ",") === "12,50", await fila0.getByLabel(/^Precio, línea/).inputValue());

    const fila1 = page.locator('[data-grilla-fila="1"]');
    await fila1.locator('input[data-celda="descripcion"]').fill(`Prueba CAM editor Gs`);
    await page.locator(".grilla-sugerencias button", { hasText: "editor Gs" }).click();
    await page.waitForTimeout(500);
    check("CA-06 1440: en USD el articulo en Gs. deja el precio vacio", (await fila1.getByLabel(/^Precio, línea/).inputValue()) === "");
    check("CA-06 1440: con el aviso de la moneda del articulo", (await page.locator("main").innerText()).includes("Item del catálogo en Gs.: cargá el precio en USD."));
    check("CA-08 1440: el pie ya no dice 'no disponible en USD'", !(await page.locator(".grilla-pie").innerText()).includes("no disponible"));
    await page.screenshot({ path: path.join(outDir, "1440-editor-usd.png"), fullPage: true });

    // CA-08: linea manual en USD guardada en el catalogo.
    await fila1.locator('input[data-celda="descripcion"]').fill(`Prueba CAM servicio ${sufijo}`);
    await fila1.getByLabel(/^Cantidad, línea/).fill("1");
    await fila1.getByLabel(/^Precio, línea/).fill("20,00");
    await page.waitForTimeout(500);
    const cuerpo = page.waitForRequest((r) => r.url().includes("/catalogo/items") && r.method() === "POST", { timeout: 10000 }).then((r) => r.postDataJSON(), () => null);
    const guardar = fila1.getByLabel(/Guardar en catálogo, línea/);
    const disponible = (await guardar.count()) > 0 && (await guardar.first().isEnabled());
    check("CA-08 1440: \"Guardar en el catálogo\" disponible en USD", disponible);
    if (disponible) {
      await guardar.first().click();
      const dialogo = page.getByRole("dialog");
      if (await dialogo.waitFor({ timeout: 2000 }).then(() => true, () => false)) {
        await dialogo.getByRole("button", { name: /Guardar|Confirmar|Agregar/ }).first().click();
      }
      const body = await cuerpo;
      check("CA-08 1440: POST /catalogo/items recibe moneda USD y precio 20", body?.moneda === "USD" && Number(body?.precio_unitario) === 20, JSON.stringify(body));
    }

    // CA-07: factura en Gs., el articulo en USD deja el precio vacio.
    await elegirMoneda(page, "PYG");
    const fila2 = page.locator('[data-grilla-fila="2"]');
    const destino = (await fila2.count()) ? fila2 : page.locator("[data-grilla-fila]").last();
    await destino.locator('input[data-celda="descripcion"]').fill(`Prueba CAM editor USD`);
    await page.locator(".grilla-sugerencias button", { hasText: "editor USD" }).first().click();
    await page.waitForTimeout(500);
    check("CA-07 1440: en Gs. el articulo en USD deja el precio vacio", (await destino.getByLabel(/^Precio, línea/).inputValue()) === "");
    check("CA-07 1440: con el aviso 'cargá el precio en Gs.'", (await page.locator("main").innerText()).includes("Item del catálogo en USD: cargá el precio en Gs."));
    await page.screenshot({ path: path.join(outDir, "1440-editor-pyg.png"), fullPage: true });
    check("editor 1440: sin desplazamiento horizontal", await sinDesborde(page));
  } catch (e) {
    check("editor 1440: sin excepciones", false, e.message);
    await page.screenshot({ path: path.join(outDir, "1440-editor-error.png"), fullPage: true }).catch(() => undefined);
  } finally {
    await borrarPruebas(page).catch(() => undefined);
    await ctx.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const [ancho, alto] of [
      [1440, 900],
      [1280, 800],
      [390, 844]
    ]) {
      await casoCatalogo(browser, ancho, alto);
    }
    await casoEditor(browser);
  } finally {
    const { ctx, page } = await entrar(browser, 1280, 800);
    await borrarPruebas(page).catch(() => undefined);
    await ctx.close();
    await browser.close();
  }
  const fallas = resultados.filter((r) => !r.ok).length;
  fs.writeFileSync(path.join(outDir, "resultado.json"), JSON.stringify(resultados, null, 2));
  console.log(`\n${resultados.length - fallas}/${resultados.length} OK`);
  process.exit(fallas ? 1 : 0);
})();
