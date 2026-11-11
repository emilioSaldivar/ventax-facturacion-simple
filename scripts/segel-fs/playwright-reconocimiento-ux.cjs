#!/usr/bin/env node
// Guion de reconocimiento de la interfaz del operador (PLAN_UX_RESTO_APP_v0.1 §11, URA-024; PAUTAS_FRONTEND_v0.1 §11).
// Solo lectura: no emite, no guarda, no cambia de punto (abre el dialogo y cancela). Solo stack local de Segel.
//
//   ENSAYO_PASSWORD_FILE=/ruta/clave node scripts/segel-fs/playwright-reconocimiento-ux.cjs
//   RECON_ACTUALIZAR_BASE=1 ...   reescribe la linea base y termina en 0
//
// Recorre login, eleccion de punto, todas las pantallas habilitadas del menu, la ficha de un documento y el dialogo de
// cambio de punto en 1440, 1280 y 390 px. Mide por pantalla: emojis, desborde horizontal, controles sin nombre,
// campos sin etiqueta, controles de menos de 44 px y campos de menos de 16 px (solo 390) y errores de consola.
// Compara los totales por ancho con la linea base versionada: si alguno sube, termina con codigo 1.
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));
const { abrirVista, esperarSesion } = require(path.join(__dirname, "../lib/navegacion.cjs"));

const base = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
const usuario = process.env.ENSAYO_USER ?? "operador-ensayo";
const clave = fs.readFileSync(process.env.ENSAYO_PASSWORD_FILE ?? "", "utf8").trim();
const archivoBase = process.env.RECON_BASE ?? path.join(__dirname, "reconocimiento-ux.base.json");
const actualizarBase = process.env.RECON_ACTUALIZAR_BASE === "1";
const outDir = path.join(process.cwd(), "test-results", "reconocimiento-ux");
fs.mkdirSync(outDir, { recursive: true });

const ANCHOS = [
  { ancho: 1440, alto: 900 },
  { ancho: 1280, alto: 800 },
  { ancho: 390, alto: 844 }
];
const MEDIDAS = ["emojis", "desbordeX", "sinNombre", "camposSinEtiqueta", "chicos", "camposChicos", "consola"];

const slug = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** Medidas de la pantalla visible (PLAN §11, "Medidas por pantalla"). */
async function medir(page, celular, alcance) {
  return page.evaluate(({ celular, alcance }) => {
    const raiz = alcance ? document.querySelector(alcance) ?? document.body : document.body;
    // checkVisibility descarta tambien lo que esta dentro de un <details> cerrado (content-visibility).
    const visible = (e) => {
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return false;
      return typeof e.checkVisibility === "function" ? e.checkVisibility({ visibilityProperty: true }) : getComputedStyle(e).visibility !== "hidden";
    };
    const recorte = (e) => e.outerHTML.replace(/\s+/g, " ").slice(0, 120);
    const texto = raiz.innerText;
    const emojis = texto.match(/[\p{Extended_Pictographic}✓✕⋮⋯⚠←→]/gu) ?? [];
    const controles = [...raiz.querySelectorAll('button, a[href], [role="button"]')].filter(visible);
    const sinNombre = controles.filter((e) => {
      // Un nombre sin letras ni numeros ("⋮", "✕") no le dice nada a un lector de pantalla.
      const util = (t) => /[\p{L}\p{N}]/u.test(t ?? "");
      if (util(e.getAttribute("aria-label")) || e.getAttribute("aria-labelledby") || util(e.getAttribute("title"))) return false;
      if (util(e.innerText)) return false;
      if ([...e.querySelectorAll("img[alt]")].some((i) => i.alt.trim())) return false;
      return true;
    });
    const campos = [...raiz.querySelectorAll('input:not([type="hidden"]), select, textarea')].filter(visible);
    const camposDeTexto = campos.filter((e) => !['checkbox', 'radio', 'range', 'color', 'file'].includes(e.type));
    const camposSinEtiqueta = campos.filter(
      (e) => !(e.labels && e.labels.length) && !e.getAttribute("aria-label")?.trim() && !e.getAttribute("aria-labelledby")
    );
    const res = {
      emojis: emojis.length,
      emojisMuestra: [...new Set(emojis)].slice(0, 10).join(" "),
      desbordeX: document.documentElement.scrollWidth > window.innerWidth + 1 ? 1 : 0,
      sinNombre: sinNombre.length,
      sinNombreMuestra: sinNombre.slice(0, 5).map(recorte),
      camposSinEtiqueta: camposSinEtiqueta.length,
      camposSinEtiquetaMuestra: camposSinEtiqueta.slice(0, 5).map((e) => e.name || e.id || e.placeholder || e.type),
      chicos: 0,
      chicosMuestra: [],
      camposChicos: 0,
      camposChicosMuestra: []
    };
    if (celular) {
      const tocables = [
        ...raiz.querySelectorAll('button, [role="button"], input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea')
      ].filter(visible);
      const chicos = tocables.filter((e) => e.getBoundingClientRect().height < 44);
      res.chicos = chicos.length;
      res.chicosMuestra = chicos
        .slice(0, 12)
        .map((e) => `${(e.innerText || e.getAttribute("aria-label") || e.name || e.tagName).trim().replace(/\s+/g, " ").slice(0, 30)}:${Math.round(e.getBoundingClientRect().height)}px`);
      const camposChicos = camposDeTexto.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16);
      res.camposChicos = camposChicos.length;
      res.camposChicosMuestra = camposChicos.slice(0, 6).map((e) => `${e.name || e.placeholder || e.type}:${getComputedStyle(e).fontSize}`);
    }
    return res;
  }, { celular, alcance });
}

async function cerrarMenuCelular(page) {
  const menu = page.locator("nav.mobile-menu");
  if (!(await menu.isVisible().catch(() => false))) return;
  await page.keyboard.press("Escape");
  if (await menu.isVisible().catch(() => false)) await page.locator(".menu-scrim").first().click({ position: { x: 380, y: 830 } }).catch(() => {});
  if (await menu.isVisible().catch(() => false)) await page.locator(".menu-scrim").first().click({ position: { x: 5, y: 5 }, force: true }).catch(() => {});
}

/** Etiquetas de los elementos habilitados del menu, leidas del DOM (sobrevive a los cambios de nombre). */
async function etiquetasMenu(page, celular) {
  if (celular) {
    await page.getByRole("button", { name: "Abrir menu" }).first().click();
    const items = page.locator("nav.mobile-menu button.menu-item:not([disabled])");
    await items.first().waitFor();
    const etiquetas = await items.evaluateAll((els) => els.map((e) => (e.querySelector("span:not(.menu-item-icon)")?.textContent ?? e.innerText).trim()));
    await cerrarMenuCelular(page);
    return etiquetas;
  }
  const items = page.locator("nav.side-nav button:not([disabled])");
  return items.evaluateAll((els) => els.map((e) => e.innerText.trim().split("\n")[0].trim()));
}

(async () => {
  const browser = await chromium.launch();
  const pantallas = [];
  let fallo = null;
  try {
    for (const { ancho, alto } of ANCHOS) {
      const celular = ancho < 1024;
      const ctx = await browser.newContext({ viewport: { width: ancho, height: alto } });
      const page = await ctx.newPage();
      page.setDefaultTimeout(20000);
      let logueado = false;
      let consola = [];
      page.on("console", (m) => {
        if (m.type() === "error") consola.push(m.text().slice(0, 160));
      });
      page.on("response", (r) => {
        if (r.status() < 400) return;
        // H-23: sin sesion, la renovacion responde 401 (sin cookie). Es esperado antes del login.
        if (!logueado && r.url().includes("/auth/refresh")) return;
        consola.push(`${r.status()} ${r.url().replace(/^.*\/api\/v1/, "")}`);
      });
      // El 401 previo al login tambien deja un "Failed to load resource" en la consola del navegador.
      const limpiarConsolaPrevia = () => {
        consola = consola.filter((c) => !/401/.test(c));
      };

      async function registrar(nombre, alcance) {
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(outDir, `${ancho}-${nombre}.png`), fullPage: true });
        const m = await medir(page, celular, alcance);
        pantallas.push({ ancho, pantalla: nombre, ...m, consola: consola.length, consolaMuestra: [...new Set(consola)].slice(0, 5) });
        consola = [];
      }

      await page.goto(base, { waitUntil: "domcontentloaded" });
      await page.locator('input[name="username"]').waitFor();
      limpiarConsolaPrevia();
      await registrar("00-login");

      await page.locator('input[name="username"]').fill(usuario);
      await page.locator('input[name="password"]').fill(clave);
      await page.getByRole("button", { name: "Ingresar" }).click();
      logueado = true;
      const eleccion = page.getByRole("heading", { name: /punto vas a trabajar/ });
      const hayEleccion = await eleccion.waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
      if (hayEleccion) {
        await registrar("01-elegir-punto");
        await page.locator(".perfil-opcion").first().click();
      }
      await esperarSesion(page);

      if (celular) {
        await page.getByRole("button", { name: "Abrir menu" }).first().click();
        await page.locator("nav.mobile-menu").waitFor();
        await registrar("02-menu", "nav.mobile-menu");
        await cerrarMenuCelular(page);
      }

      const etiquetas = await etiquetasMenu(page, celular);
      for (const [i, etiqueta] of etiquetas.entries()) {
        const nombre = `${10 + i}-${slug(etiqueta)}`;
        try {
          await abrirVista(page, etiqueta);
          await page.waitForTimeout(800);
          await registrar(nombre);
        } catch (e) {
          pantallas.push({ ancho, pantalla: nombre, error: String(e).slice(0, 200) });
          await cerrarMenuCelular(page);
          continue;
        }
        if (/^documentos$/i.test(etiqueta)) {
          try {
            const fila = celular
              ? page.locator(".document-row-main, button.document-row").first()
              : page.locator("button.enlace-fila, tr.documents-tabla-fila").first();
            await fila.click({ timeout: 8000 });
            await page.waitForTimeout(800);
            await registrar(`${10 + i}b-ficha`);
            const volver = page.getByRole("button", { name: /Volver a resultados/ }).first();
            if (await volver.isVisible().catch(() => false)) await volver.click();
            else await page.keyboard.press("Escape");
          } catch (e) {
            pantallas.push({ ancho, pantalla: `${10 + i}b-ficha`, error: String(e).slice(0, 200) });
          }
        }
      }

      const botonPunto = page.locator("button.topbar-facturador--boton").first();
      if (await botonPunto.isVisible().catch(() => false)) {
        await botonPunto.click();
        await page.locator('[role="dialog"]').first().waitFor();
        await registrar("30-cambiar-punto", '[role="dialog"]');
        await page.getByRole("button", { name: "Cancelar" }).first().click();
      }
      await ctx.close();
    }
  } catch (e) {
    fallo = e;
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(outDir, "hallazgos.json"), JSON.stringify(pantallas, null, 1));

  const totales = {};
  for (const { ancho } of ANCHOS) {
    totales[ancho] = Object.fromEntries(MEDIDAS.map((m) => [m, 0]));
    totales[ancho].pantallas = 0;
    totales[ancho].errores = 0;
  }
  for (const p of pantallas) {
    const t = totales[p.ancho];
    t.pantallas += 1;
    if (p.error) {
      t.errores += 1;
      continue;
    }
    for (const m of MEDIDAS) t[m] += p[m] ?? 0;
  }

  console.log("\nPantallas con hallazgos:");
  for (const p of pantallas) {
    if (p.error) {
      console.log(`  ${p.ancho} ${p.pantalla}: ERROR ${p.error}`);
      continue;
    }
    const partes = MEDIDAS.filter((m) => p[m]).map((m) => `${m}=${p[m]}`);
    if (partes.length) console.log(`  ${p.ancho} ${p.pantalla}: ${partes.join(" ")}`);
  }
  console.log("\nTotales por ancho:");
  console.table(totales);

  if (fallo) {
    console.error(`El recorrido se corto: ${String(fallo).slice(0, 400)}`);
    process.exit(2);
  }

  if (actualizarBase || !fs.existsSync(archivoBase)) {
    const contenido = {
      generado: new Date().toISOString(),
      app: base,
      nota: "Totales por ancho del guion de reconocimiento (PLAN_UX_RESTO_APP_v0.1 §11). Se reescribe solo cuando bajan.",
      totales
    };
    fs.writeFileSync(archivoBase, `${JSON.stringify(contenido, null, 2)}\n`);
    console.log(`Linea base escrita en ${archivoBase}`);
    process.exit(0);
  }

  const base0 = JSON.parse(fs.readFileSync(archivoBase, "utf8")).totales;
  const subas = [];
  const bajas = [];
  for (const { ancho } of ANCHOS) {
    for (const m of [...MEDIDAS, "errores"]) {
      const antes = base0[ancho]?.[m] ?? 0;
      const ahora = totales[ancho][m];
      if (ahora > antes) subas.push(`${ancho} ${m}: ${antes} -> ${ahora}`);
      if (ahora < antes) bajas.push(`${ancho} ${m}: ${antes} -> ${ahora}`);
    }
  }
  if (bajas.length) console.log(`\nBajaron (actualizar la linea base con RECON_ACTUALIZAR_BASE=1):\n  ${bajas.join("\n  ")}`);
  if (subas.length) {
    console.error(`\nSUBIERON respecto de la linea base (RN-11):\n  ${subas.join("\n  ")}`);
    for (const p of pantallas) {
      for (const m of MEDIDAS) {
        const muestra = p[`${m}Muestra`];
        if (p[m] && muestra && subas.some((s) => s.startsWith(`${p.ancho} ${m}:`))) {
          console.error(`  ${p.ancho} ${p.pantalla} ${m}: ${JSON.stringify(muestra)}`);
        }
      }
    }
    process.exit(1);
  }
  console.log("\nSin subas respecto de la linea base.");
})();
