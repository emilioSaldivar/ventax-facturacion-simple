// Grabacion de los tutoriales en video (SPEC_TUTORIALES_VIDEO_v0.1, PLAN §2). Solo stack local de Segel.
//
// - Video 1440 x 900 con subtitulos, cursor visible y recuadro sobre lo que se usa.
// - Datos del facturador real reemplazados en las respuestas de la API (D-2, D-6, D-7): solo en los campos del
//   emisor, del tenant y del usuario; los datos del cliente no se tocan (el cliente de la CI es la misma persona).
// - Guardia (R-4): despues de cada paso, ningun dato prohibido visible; si aparece, el guion falla.
// - Linea de tiempo (linea.json) con las esperas largas, para que montar.sh las corte.
// - Cobertura (cobertura.json) con las filas del mapa del SPEC que cubre cada paso (CA-6).
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(path.join(__dirname, "../../node_modules/playwright"));

const BASE = process.env.SEGEL_APP_URL ?? "http://127.0.0.1:18492/app/";
const ANCHO = 1440;
const ALTO = 900;

// ---- Reemplazos (D-2, D-6, D-7) ----------------------------------------------------------------
const EMPRESA = "Empresa Ejemplo S.A.";
const RUC_EJEMPLO = "80000000-0";
const TIMBRADO_REAL = "05057016";
const TIMBRADO_EJEMPLO = "12345678";
const OPERADOR = "Operador Demo";
const USUARIO_DEMO = "operador.demo";
const CORREO_DEMO = "ejemplo@ejemplo.com";
const CORREO_DEMO_OFUSCADO = "ej***@ejemplo.com";
const ACTIVIDAD_EJEMPLO = "SERVICIOS DE CONSULTORÍA INFORMÁTICA";

/** Claves que pertenecen al emisor dentro de cualquier respuesta. */
const OBJETOS_EMISOR = new Set(["facturador", "tenant", "emisor"]);
const OBJETOS_USUARIO = new Set(["user", "emitido_por", "usuario", "operador"]);

function reemplazarEmisor(clave, valor) {
  if (/razon_social|nombre_fantasia|^name$|^nombre$/.test(clave)) return EMPRESA;
  if (/^(ruc|emisor_id|ruc_sin_dv|documento)$/.test(clave)) return clave === "ruc_sin_dv" ? "80000000" : RUC_EJEMPLO;
  if (/email|correo/.test(clave)) return CORREO_DEMO;
  if (/telefono|direccion/.test(clave)) return "";
  return valor;
}

function reemplazarUsuario(clave, valor) {
  if (clave === "username") return valor === "operador.ejemplo" ? valor : USUARIO_DEMO;
  if (/display_name|nombre/.test(clave)) return OPERADOR;
  if (/email|correo/.test(clave)) return CORREO_DEMO;
  return valor;
}

// Clientes que pueden verse tal cual (D-6 y datos ficticios de la base local). Cualquier otro nombre de cliente que
// haya quedado de pruebas anteriores se reemplaza por "Cliente Ejemplo NN", con su documento y contacto.
const CLIENTES_PERMITIDOS = new Set(["SEGEL SA", "EMILIO MATIAS SALDIVAR CAPUTO", "EMPRESA FICTICIA S.A.", "CLIENTE DE EJEMPLO", "COMERCIAL DEMO", "BANCO CENTRAL DEL PARAGUAY"]);
const CLAVES_NOMBRE_CLIENTE = new Set(["razon_social", "cliente_nombre", "pagador_nombre", "nombre_razon_social"]);
const CLAVES_DOC_CLIENTE = ["documento", "ruc", "cliente_ruc", "pagador_documento", "numero_documento"];
const CLAVES_CONTACTO = ["email", "telefono", "direccion", "cliente_email", "cliente_telefono"];
const sustitutos = new Map();
function clienteEjemplo(nombre) {
  if (!sustitutos.has(nombre)) sustitutos.set(nombre, String(sustitutos.size + 1).padStart(2, "0"));
  return sustitutos.get(nombre);
}
function nombrePermitido(v) {
  const n = v.trim().toUpperCase();
  return !n || CLIENTES_PERMITIDOS.has(n) || n.startsWith("SIN NOMBRE") || n.startsWith("CLIENTE EJEMPLO") || /INNOMINADO|CONSUMIDOR FINAL/.test(n);
}
// Archivos de cargas de pruebas anteriores: se muestran con un nombre neutro. Los de los tutoriales empiezan con "tutorial-".
const archivos = new Map();
function archivoEjemplo(nombre) {
  if (/^tutorial-/.test(nombre)) return nombre;
  if (!archivos.has(nombre)) archivos.set(nombre, `ventas-${String(archivos.size + 1).padStart(2, "0")}.csv`);
  return archivos.get(nombre);
}
// Descripciones de items de pruebas anteriores.
const DESCRIPCION_DE_PRUEBA = /\bUX\b|ensayo|prueba|\bATO-|\btest\b|\bcac\b|merge|volumen|\bFS-?\d+|\bFE-\w+|\bRAJ\b/i;

/** Recorre una respuesta JSON y reemplaza los datos reales del emisor y del operador. */
function anonimizar(nodo, ambito = null) {
  if (Array.isArray(nodo)) return nodo.map((x) => anonimizar(x, ambito));
  if (!nodo || typeof nodo !== "object") return nodo;
  const salida = {};
  for (const [k, v] of Object.entries(nodo)) {
    const nuevoAmbito = OBJETOS_EMISOR.has(k) ? "emisor" : OBJETOS_USUARIO.has(k) ? "usuario" : ambito;
    if (v && typeof v === "object") {
      salida[k] = anonimizar(v, nuevoAmbito);
      continue;
    }
    if (typeof v !== "string") {
      salida[k] = v;
      continue;
    }
    let s = v;
    if (/xContenDE|xml/i.test(k) && s.startsWith("<")) s = "";
    if (ambito === "emisor") s = reemplazarEmisor(k, s);
    else if (ambito === "usuario") s = reemplazarUsuario(k, s);
    if (k === "emisor_id") s = RUC_EJEMPLO;
    // Campos planos del emisor fuera de su objeto (por ejemplo, el contexto de los T&C).
    if (/^(tenant_nombre|facturador_razon_social|facturador_nombre(_fantasia)?)$/.test(k)) s = EMPRESA;
    if (/^facturador_ruc$/.test(k)) s = RUC_EJEMPLO;
    if (s.includes("emilio.saldivar@segel.com.py")) s = s.split("emilio.saldivar@segel.com.py").join(CORREO_DEMO);
    // Actividad del facturador local (talleres) por una de servicios, coherente con los items de los videos.
    if (/^actividad_economica_(descripcion|alias)$/.test(k)) s = ACTIVIDAD_EJEMPLO;
    if (k === "actividad_economica_codigo") s = "62010";
    if (k === "perfil_emision_codigo") s = s.replace("45203", "62010");
    if (k === "email_destino_ofuscado") s = CORREO_DEMO_OFUSCADO;
    if (k === "nombre_archivo") s = archivoEjemplo(s);
    // Correos de clientes de pruebas (personales del usuario): fuera.
    if (/email|correo/.test(k) && s.includes("@") && !s.endsWith("@ejemplo.com")) s = ambito === "usuario" || ambito === "emisor" ? CORREO_DEMO : "";
    if (ambito !== "emisor" && /^(descripcion|concepto|observaciones|nce_motivo|motivo)$/.test(k) && DESCRIPCION_DE_PRUEBA.test(s)) s = k === "descripcion" ? "Servicio de consultoría" : "";
    // Timbrado y CDC llevan el RUC del emisor con el cero adelante; el RUC del cliente nunca lo lleva.
    s = s.split(TIMBRADO_REAL).join(TIMBRADO_EJEMPLO);
    // La actividad real tambien va dentro de textos largos (alias del perfil: "...actividad economica TALLERES DE ...").
    s = s.replace(/TALLERES DE CHAPER[IÍ]A Y PINTURA/gi, ACTIVIDAD_EJEMPLO);
    salida[k] = s;
  }
  // Cliente de pruebas anteriores: nombre, documento y contacto de ejemplo.
  if (ambito !== "emisor") {
    for (const k of Object.keys(salida)) {
      if (!CLAVES_NOMBRE_CLIENTE.has(k) || typeof salida[k] !== "string" || nombrePermitido(salida[k])) continue;
      const n = clienteEjemplo(salida[k]);
      salida[k] = `Cliente Ejemplo ${n}`;
      for (const d of CLAVES_DOC_CLIENTE) if (typeof salida[d] === "string" && salida[d]) salida[d] = `80000${n}`;
      for (const c of CLAVES_CONTACTO) if (typeof salida[c] === "string") salida[c] = "";
    }
  }
  return salida;
}

// ---- Guardia (R-4) -------------------------------------------------------------------------------
/** Prohibidos en toda la pagina. */
// `segel.com.py` aparece de forma legitima (contacto del proveedor en los T&C); se prohibe el correo personal.
const PROHIBIDO_GLOBAL = ["operador-ensayo", "(ensayo)", TIMBRADO_REAL, "emilio.saldivar", "em***@segel", "ENSAYO", "Ensayo", "ensayo", "AREVALOS", "@gmail.com", "matiassaldiv", "CHAPERIA", "CHAPERÍA"];
/** Prohibidos en las zonas del emisor (el cliente de la CI puede mostrar su nombre y su RUC en el resto). */
const PROHIBIDO_EMISOR = ["5057016", "SALDIVAR", "Saldivar"];
// En las paginas publicas (/verificar/...) toda la pagina cuenta como zona del emisor.
const ZONAS_EMISOR = [".topbar", "nav.side-nav", ".menu-nuevo-panel", "section[aria-labelledby='estado-facturador']", ".estado-espacio .encabezado-pantalla", "section[aria-label='Datos de tu cuenta']"];

// ---- Superposiciones -----------------------------------------------------------------------------
function superposiciones() {
  const montar = () => {
    if (document.getElementById("tut-sub")) return;
    const estilo = document.createElement("style");
    estilo.textContent = `
      #tut-sub{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:1100px;z-index:2147483646;
        background:rgba(0,0,0,.8);color:#fff;font:600 22px/1.35 Montserrat,system-ui,sans-serif;padding:12px 22px;
        border-radius:10px;text-align:center;pointer-events:none;transition:opacity .2s;}
      #tut-sub::after{content:attr(data-t)} #tut-sub:not([data-t]),#tut-sub[data-t='']{opacity:0}
      #tut-cursor{position:fixed;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(220,38,38,.85);
        box-shadow:0 0 0 4px rgba(220,38,38,.25);z-index:2147483647;pointer-events:none;left:-40px;top:-40px;transition:transform .1s}
      #tut-cursor.click{transform:scale(.6)}
      .tut-marco{position:fixed;border:3px solid #dc2626;border-radius:8px;z-index:2147483645;pointer-events:none;
        box-shadow:0 0 0 4px rgba(220,38,38,.18);transition:opacity .2s}`;
    document.head.appendChild(estilo);
    const sub = document.createElement("div");
    sub.id = "tut-sub";
    try {
      sub.dataset.t = sessionStorage.getItem("tut-sub") ?? "";
    } catch {}
    const cursor = document.createElement("div");
    cursor.id = "tut-cursor";
    document.body.appendChild(sub);
    document.body.appendChild(cursor);
    window.addEventListener("mousemove", (e) => {
      cursor.style.left = `${e.clientX}px`;
      cursor.style.top = `${e.clientY}px`;
    }, true);
    window.addEventListener("mousedown", () => cursor.classList.add("click"), true);
    window.addEventListener("mouseup", () => cursor.classList.remove("click"), true);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar);
  else montar();
}

// ---- Sesion de grabacion -------------------------------------------------------------------------
/**
 * Abre el navegador y empieza a grabar.
 * @param {string} video  nombre de la carpeta de salida (v1-primer-ingreso, ...)
 */
async function abrir(video, { modoEditor = "completo", grabar = true } = {}) {
  const outDir = path.join(process.cwd(), "test-results", "tutoriales", video);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, "capturas"), { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: ANCHO, height: ALTO },
    deviceScaleFactor: 1,
    locale: "es-PY",
    timezoneId: "America/Asuncion",
    acceptDownloads: true,
    permissions: ["clipboard-read", "clipboard-write"],
    ...(grabar ? { recordVideo: { dir: outDir, size: { width: ANCHO, height: ALTO } } } : {})
  });
  await ctx.addInitScript((modo) => {
    try {
      window.localStorage.setItem("fs.editor.modo", modo);
    } catch {}
  }, modoEditor);
  await ctx.addInitScript(superposiciones);
  await ctx.route(/\/api\/v1\//, async (route) => {
    const respuesta = await route.fetch().catch(() => null);
    if (!respuesta) return route.abort();
    const tipo = respuesta.headers()["content-type"] ?? "";
    if (!tipo.includes("application/json")) return route.fulfill({ response: respuesta });
    let cuerpo;
    try {
      cuerpo = anonimizar(await respuesta.json());
    } catch {
      return route.fulfill({ response: respuesta });
    }
    return route.fulfill({ response: respuesta, body: JSON.stringify(cuerpo) });
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  const t0 = Date.now();
  const sesion = { video, outDir, browser, ctx, page, t0, linea: [], cobertura: new Set(), pasos: 0, fallas: [], estado: {} };
  return sesion;
}

const seg = (s) => Number(((Date.now() - s.t0) / 1000).toFixed(2));

/** Cambia el subtitulo y espera lo necesario para leerlo. `cubre`: filas del mapa del SPEC. */
async function paso(s, texto, { ms = 0, cubre = [] } = {}) {
  s.pasos += 1;
  for (const c of cubre) s.cobertura.add(c);
  await s.page.evaluate((t) => {
    try {
      sessionStorage.setItem("tut-sub", t);
    } catch {}
    const el = document.getElementById("tut-sub");
    if (el) el.dataset.t = t;
  }, texto);
  s.linea.push({ t: seg(s), tipo: "paso", texto });
  const palabras = texto.trim() ? texto.trim().split(/\s+/).length : 0;
  // Lectura comoda: 1,2 s + 300 ms por palabra (unas 3 palabras por segundo).
  await s.page.waitForTimeout(Math.max(ms, palabras ? 1200 + 300 * palabras : 0));
  await guardia(s);
  await s.page.screenshot({ path: path.join(s.outDir, "capturas", `${String(s.pasos).padStart(3, "0")}.png`) });
}

/** Quita el subtitulo. */
async function sinSubtitulo(s) {
  await s.page.evaluate(() => {
    try {
      sessionStorage.setItem("tut-sub", "");
    } catch {}
    const el = document.getElementById("tut-sub");
    if (el) el.dataset.t = "";
  });
}

/** Lleva el cursor al elemento y dibuja un recuadro. Con `clic` lo usa; con `escribir` escribe tecla por tecla. */
async function senalar(s, locator, { clic = false, escribir = null, ms = 700 } = {}) {
  const { page } = s;
  await locator.scrollIntoViewIfNeeded();
  // Si el elemento queda debajo del subtitulo (franja inferior), se centra en la pantalla (v0.2).
  const previa = await locator.boundingBox();
  if (previa && previa.y + previa.height > ALTO - 170) {
    await locator.evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => undefined);
    await page.waitForTimeout(250);
  }
  const caja = await locator.boundingBox();
  if (caja) {
    await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2, { steps: 18 });
    await page.evaluate(({ x, y, w, h }) => {
      const m = document.createElement("div");
      m.className = "tut-marco";
      Object.assign(m.style, { left: `${x - 6}px`, top: `${y - 6}px`, width: `${w + 12}px`, height: `${h + 12}px` });
      document.body.appendChild(m);
      setTimeout(() => m.remove(), 1400);
    }, { x: caja.x, y: caja.y, w: caja.width, h: caja.height });
  }
  await page.waitForTimeout(ms);
  if (escribir !== null) {
    await locator.click();
    await locator.fill("");
    await locator.pressSequentially(String(escribir), { delay: 70 });
  } else if (clic) {
    await locator.click();
  }
}

/** Espera larga (SIFEN, validacion): se marca en la linea para cortarla al montar. */
async function espera(s, nombre, fn, { texto = "Esperando la respuesta de SIFEN…" } = {}) {
  const anterior = await s.page.evaluate(() => document.getElementById("tut-sub")?.dataset.t ?? "");
  await s.page.evaluate((t) => {
    const el = document.getElementById("tut-sub");
    if (el) el.dataset.t = t;
  }, texto);
  const inicio = seg(s);
  try {
    return await fn();
  } finally {
    s.linea.push({ t: inicio, fin: seg(s), tipo: "espera", nombre });
    await s.page.evaluate((t) => {
      const el = document.getElementById("tut-sub");
      if (el) el.dataset.t = t;
    }, anterior);
  }
}

/** Falla si hay datos reales visibles (R-4). */
async function guardia(s) {
  const hallazgos = await s.page.evaluate(({ global, emisor, zonas }) => {
    const out = [];
    const texto = document.body.innerText;
    const valores = [...document.querySelectorAll("input, textarea")].map((e) => e.value).join("\n");
    for (const p of global) if (texto.includes(p) || valores.includes(p)) out.push(`pagina: ${p}`);
    const publica = /\/verificar\//.test(location.pathname);
    for (const sel of publica ? ["body"] : zonas) {
      for (const z of document.querySelectorAll(sel)) {
        const t = z.innerText;
        for (const p of emisor) if (t.includes(p)) out.push(`${sel}: ${p}`);
      }
    }
    return out;
  }, { global: PROHIBIDO_GLOBAL, emisor: PROHIBIDO_EMISOR, zonas: ZONAS_EMISOR });
  if (hallazgos.length) {
    const nombre = path.join(s.outDir, `guardia-${s.pasos}.png`);
    await s.page.screenshot({ path: nombre });
    s.fallas.push(...hallazgos);
    throw new Error(`Guardia: dato real visible (${hallazgos.join("; ")}). Captura: ${nombre}`);
  }
}

/** Ingresa con usuario y contraseña (la clave solo por archivo, R-3). */
async function ingresar(s, { usuario = "operador-ensayo", archivoClave = process.env.ENSAYO_PASSWORD_FILE, punto = "001-001", lento = false } = {}) {
  const clave = fs.readFileSync(archivoClave ?? "", "utf8").trim();
  const { page } = s;
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const u = page.locator('input[name="username"]');
  const p = page.locator('input[name="password"]');
  await u.waitFor();
  if (lento) {
    await senalar(s, u, { escribir: usuario });
    await senalar(s, p, { escribir: clave, ms: 300 });
  } else {
    await u.fill(usuario);
    await p.fill(clave);
  }
  await page.getByRole("button", { name: "Ingresar" }).click();
  const lateral = page.locator("nav.side-nav");
  const opcion = page.locator(`.perfil-eleccion .perfil-opcion[aria-label*="${punto}"]`).first();
  await lateral.or(opcion).waitFor();
  if (await opcion.isVisible().catch(() => false)) {
    if (lento) return; // el guion muestra la eleccion
    await opcion.click();
  }
  await lateral.waitFor();
}

/** Abre una seccion del menu lateral. */
async function abrirSeccion(s, etiqueta, { mostrar = true } = {}) {
  const boton = s.page.locator("nav.side-nav").getByRole("button", { name: etiqueta }).first();
  if (mostrar) await senalar(s, boton, { clic: true, ms: 400 });
  else await boton.click();
}

/** Termina: cierra el navegador, guarda el video como bruto.webm, la linea y la cobertura. */
async function cerrar(s, { ok = true } = {}) {
  await sinSubtitulo(s).catch(() => undefined);
  const video = s.page.video();
  await s.ctx.close();
  await s.browser.close();
  if (video) {
    const origen = await video.path();
    fs.renameSync(origen, path.join(s.outDir, "bruto.webm"));
  }
  fs.writeFileSync(path.join(s.outDir, "linea.json"), JSON.stringify({ video: s.video, eventos: s.linea }, null, 2));
  fs.writeFileSync(path.join(s.outDir, "cobertura.json"), JSON.stringify({ video: s.video, cubre: [...s.cobertura].sort() }, null, 2));
  fs.writeFileSync(path.join(s.outDir, "resumen.json"), JSON.stringify({ video: s.video, ok, pasos: s.pasos, fallas: s.fallas, estado: s.estado }, null, 2));
}

/** Estado compartido entre videos (numeros de las facturas de V3 para V4 y V6). */
const ESTADO = path.join(process.cwd(), "test-results", "tutoriales", "estado.json");
function leerEstado() {
  try {
    return JSON.parse(fs.readFileSync(ESTADO, "utf8"));
  } catch {
    return {};
  }
}
function guardarEstado(parcial) {
  fs.mkdirSync(path.dirname(ESTADO), { recursive: true });
  fs.writeFileSync(ESTADO, JSON.stringify({ ...leerEstado(), ...parcial }, null, 2));
}

/** Corre un guion: abre, ejecuta, cierra y marca el resultado. */
async function correr(video, opciones, fn) {
  const s = await abrir(video, opciones);
  let ok = false;
  try {
    await fn(s);
    ok = true;
  } catch (error) {
    console.error(`FALLA ${video}:`, error instanceof Error ? error.stack : error);
    await s.page.screenshot({ path: path.join(s.outDir, "falla.png") }).catch(() => undefined);
  } finally {
    await cerrar(s, { ok });
    console.log(`${ok ? "OK" : "FALLA"} ${video}: ${s.pasos} pasos -> ${s.outDir}`);
    process.exitCode = ok ? 0 : 1;
  }
  return ok;
}

module.exports = {
  BASE,
  abrir,
  paso,
  sinSubtitulo,
  senalar,
  espera,
  guardia,
  ingresar,
  abrirSeccion,
  cerrar,
  correr,
  leerEstado,
  guardarEstado,
  anonimizar,
  PROHIBIDO_GLOBAL,
  PROHIBIDO_EMISOR,
  ZONAS_EMISOR
};
