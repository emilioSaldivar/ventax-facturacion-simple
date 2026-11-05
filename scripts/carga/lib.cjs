// Utilidades comunes de las herramientas de carga (docs/PLAN_VERIFICACION_CAPACIDAD_200_v0.1.md).
// Sin dependencias externas. Nada aqui imprime ni persiste claves o contrasenas.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..", "..");
// Permite un segundo stack aislado, sin tocar fs-carga ni sus datos.
const PROYECTO = process.env.CARGA_PROYECTO ?? "fs-carga";
const STATE_DIR = path.join(ROOT, ".local", PROYECTO === "fs-carga" ? "carga" : PROYECTO);
const OPERADORES_FILE = path.join(STATE_DIR, "operadores.json");
const ADMIN_FILE = path.join(STATE_DIR, "admin.json");
const POSTGRES_CONTAINER = `${PROYECTO}-postgres-1`;
const API_CONTAINER = `${PROYECTO}-api-1`;

/** SPEC RN-01: solo se admite un destino local, y por defecto el del stack aislado. */
function apiBase() {
  const base = (process.env.CARGA_API_BASE ?? "http://127.0.0.1:8291/api/v1").replace(/\/$/, "");
  const host = new URL(base).hostname;
  const permitidos = (process.env.CARGA_HOSTS_PERMITIDOS ?? "127.0.0.1,localhost").split(",");
  if (!permitidos.includes(host) || /ventax\.app/i.test(base)) {
    throw new Error(`Destino no permitido: ${base}. Solo el stack aislado (RN-01).`);
  }
  return base;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const actual = argv[i];
    if (!actual.startsWith("--")) continue;
    const clave = actual.slice(2);
    const siguiente = argv[i + 1];
    if (siguiente === undefined || siguiente.startsWith("--")) {
      args[clave] = true;
    } else {
      args[clave] = siguiente;
      i += 1;
    }
  }
  return args;
}

function escribirPrivado(archivo, contenido) {
  fs.mkdirSync(path.dirname(archivo), { recursive: true, mode: 0o700 });
  const temporal = `${archivo}.tmp`;
  fs.writeFileSync(temporal, contenido, { mode: 0o600 });
  fs.renameSync(temporal, archivo);
}

function leerJsonSiExiste(archivo, porDefecto) {
  return fs.existsSync(archivo) ? JSON.parse(fs.readFileSync(archivo, "utf8")) : porDefecto;
}

function corridaDir(corrida) {
  const dir = path.join(ROOT, "test-results", "carga", corrida);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function idCorrida(prefijo = "r") {
  return `${prefijo}${new Date().toISOString().replace(/[-:T]/g, "").slice(2, 12)}`;
}

/** Escritor JSONL con buffer: disco lento no debe frenar al generador de carga. */
function jsonl(archivo) {
  const stream = fs.createWriteStream(archivo, { flags: "a" });
  return {
    write: (objeto) => stream.write(`${JSON.stringify(objeto)}\n`),
    end: () => new Promise((resolve) => stream.end(resolve))
  };
}

class ApiError extends Error {
  constructor(metodo, ruta, status, cuerpo) {
    super(`${metodo} ${ruta} -> ${status} ${resumirCuerpo(cuerpo)}`);
    this.status = status;
    this.cuerpo = cuerpo;
  }
}

function resumirCuerpo(cuerpo) {
  if (cuerpo === null || cuerpo === undefined) return "";
  const texto = typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
  return texto.slice(0, 400);
}

/** Cliente minimo. `crudo` devuelve bytes; nunca lanza en `sinLanzar`, para las pruebas negativas. */
async function http(metodo, ruta, { token, cuerpo, headers = {}, cookie, crudo = false, sinLanzar = false, base, timeoutMs = 60000 } = {}) {
  const url = `${base ?? apiBase()}${ruta}`;
  const inicio = performance.now();
  const respuesta = await fetch(url, {
    method: metodo,
    headers: {
      ...(cuerpo === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(timeoutMs)
  });
  let datos;
  if (crudo) {
    datos = Buffer.from(await respuesta.arrayBuffer());
  } else {
    const texto = await respuesta.text();
    try {
      datos = texto ? JSON.parse(texto) : null;
    } catch {
      datos = texto;
    }
  }
  const ms = performance.now() - inicio;
  if (!respuesta.ok && !sinLanzar) {
    throw new ApiError(metodo, ruta, respuesta.status, datos);
  }
  return { status: respuesta.status, datos, ms, headers: respuesta.headers };
}

function cookieRefresh(headers) {
  const valores = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  const encontrada = valores.find((valor) => valor.startsWith("ventax_refresh_token="));
  return encontrada ? encontrada.split(";")[0] : null;
}

/** PRNG con semilla, para que una corrida se pueda reproducir (mulberry32). */
function prng(semilla) {
  let estado = Number(crypto.createHash("sha256").update(String(semilla)).digest().readUInt32LE(0));
  return () => {
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentil(ordenados, p) {
  if (ordenados.length === 0) return null;
  const indice = Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1);
  return ordenados[Math.max(0, indice)];
}

/** Agrupa ids en la ruta para que las metricas sumen por ruta y no por documento. */
function normalizarRuta(ruta) {
  return ruta
    .split("?")[0]
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id");
}

/** psql sobre la base AISLADA. El contenedor es fijo: no hay forma de apuntar a otra. */
function psql(sql, { separador = "\t" } = {}) {
  return execFileSync(
    "docker",
    ["exec", "-i", POSTGRES_CONTAINER, "psql", "-U", "facturacion_simple", "-d", "facturacion_simple", "-v", "ON_ERROR_STOP=1", "-At", "-F", separador],
    { input: sql, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }
  );
}

/** La idempotency_key que recibe FE: misma derivacion que buildExternalRef en facturas.service.ts. */
function externalRef(facturadorId, clave) {
  return `fac_${crypto.createHash("sha256").update(`${facturadorId}:${clave}`).digest("hex").slice(0, 32)}`;
}

/** Mapa ref -> operador sembrado. El archivo tiene contrasenas: debe seguir en 600. */
function cargarOperadores() {
  if (!fs.existsSync(OPERADORES_FILE)) {
    throw new Error(`No existe ${OPERADORES_FILE}. Ejecutar seed.cjs primero.`);
  }
  const permisos = (fs.statSync(OPERADORES_FILE).mode & 0o777).toString(8);
  if (permisos !== "600") {
    throw new Error(`${OPERADORES_FILE} debe tener permiso 600, tiene ${permisos}.`);
  }
  return JSON.parse(fs.readFileSync(OPERADORES_FILE, "utf8"));
}

module.exports = {
  ROOT,
  STATE_DIR,
  OPERADORES_FILE,
  ADMIN_FILE,
  POSTGRES_CONTAINER,
  API_CONTAINER,
  ApiError,
  apiBase,
  cargarOperadores,
  cookieRefresh,
  corridaDir,
  escribirPrivado,
  externalRef,
  http,
  idCorrida,
  jsonl,
  leerJsonSiExiste,
  normalizarRuta,
  parseArgs,
  percentil,
  prng,
  psql
};
