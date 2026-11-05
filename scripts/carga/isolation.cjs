#!/usr/bin/env node
// Pruebas de aislamiento entre clientes (PLAN §6, SPEC CA-01).
//
//   node scripts/carga/isolation.cjs --corrida r1 [--pares 5] [--seed 1] [--espera-final-s 180] [--documentos-de corrida]
//
// A ataca recursos de B: se espera 403 o 404 y, ademas, que B vea su recurso sin cambios.
// Sale con codigo 1 si hay un solo acceso cruzado. Antes de confiar en un "bloqueado", cada grupo
// prueba el mismo acceso con el dueno: si el dueno tampoco entra, el caso no probo nada.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { apiBase, cargarOperadores, corridaDir, http, idCorrida, parseArgs, prng } = require("./lib.cjs");

const args = parseArgs();
const corrida = args.corrida ?? idCorrida("ais");
const pares = Number(args.pares ?? 3);
const random = prng(args.seed ?? 1);
const esperaFinalMs = Number(args["espera-final-s"] ?? 180) * 1000;
const dir = corridaDir(corrida);
const UUID_INEXISTENTE = "00000000-0000-4000-8000-000000000000";
const resultados = [];

function registrar(par, grupo, caso, esperado, status, ok, detalle = "") {
  resultados.push({ par, grupo, caso, esperado, status, ok, detalle });
  if (!ok) console.error(`  FALLO [${grupo}] ${caso}: status ${status}. ${detalle}`);
}

async function sesion(op) {
  const { datos } = await http("POST", "/auth/login", { cuerpo: { username: op.username, password: op.password } });
  return { ...op, token: datos.access_token };
}

function factura(op, extra = {}) {
  const cliente = op.clientes[0];
  const item = op.items[0];
  return {
    condicion_venta: "CONTADO",
    tipo_transaccion: 2,
    cliente: { cliente_id: cliente.id, documento_tipo: "CI", documento: cliente.documento, razon_social: cliente.razon_social, direccion: "Asuncion", email: `cli-${op.ref}@carga.invalid` },
    items: [{ catalogo_item_id: item.id, codigo: item.codigo, descripcion: item.descripcion, cantidad: 1, precio_unitario: item.precio_unitario, iva_tipo: item.iva_tipo }],
    ...extra
  };
}

async function crearFactura(op, clave) {
  const r = await http("POST", "/facturas", { token: op.token, cuerpo: factura(op), headers: { "idempotency-key": clave } });
  return r.datos;
}

/** El access token dura 15 min, y una aprobacion puede tardar mas: se renueva antes de cada paso. */
async function renovar(op) {
  const { datos } = await http("POST", "/auth/login", { cuerpo: { username: op.username, password: op.password } });
  op.token = datos.access_token;
}

async function esperarEmitida(op, id) {
  const limite = Date.now() + esperaFinalMs;
  let actual;
  do {
    await renovar(op);
    // Como un operador que aprieta "Verificar estado": no depende de la agenda de 5, 35 y 95 min.
    const verificada = await http("POST", `/facturas/${id}/refresh-status`, { token: op.token, cuerpo: {}, sinLanzar: true, timeoutMs: 120000 });
    // Sin identidad fiscal todavia da 409: el estado se lee aparte.
    actual = verificada.status === 200 ? verificada.datos : (await http("GET", `/facturas/${id}`, { token: op.token })).datos;
    if (actual.estado === "EMITIDA") return actual;
    await new Promise((resolve) => setTimeout(resolve, 15000));
  } while (Date.now() < limite);
  return actual;
}

/** Instantanea para comprobar que un ataque rechazado no dejo huella. */
function huella(documento) {
  const { updated_at, sifen_last_checked_at, verificacion_next_at, accion, accion_detalle, ...estable } = documento;
  return crypto.createHash("sha256").update(JSON.stringify(estable)).digest("hex");
}

function bloqueado(status) {
  return status === 403 || status === 404;
}

async function probarPar(par, a, b, documentoExistente = null) {
  console.log(`Par ${par}: ${a.ref} ataca a ${b.ref}`);
  const sufijo = `${corrida}-${par}-${Date.now().toString(36)}`;
  await renovar(a);
  await renovar(b);
  const claveB = `ais-${sufijo}-b`;
  // Con --documentos-de se ataca una factura ya aprobada de esa corrida, sin esperar un lote nuevo.
  const creadaB = documentoExistente ?? (await crearFactura(b, claveB));
  const documentoB = documentoExistente ? (await http("GET", `/facturas/${creadaB.id}`, { token: b.token })).datos : await esperarEmitida(b, creadaB.id);
  await renovar(a);
  await renovar(b);
  if (documentoB.estado !== "EMITIDA") {
    registrar(par, "preparacion", "documento de B emitido", "EMITIDA", documentoB.estado, false, "Sin EMITIDA no se puede probar KUDE ni cancelar con validez.");
  }
  const huellaInicial = huella(documentoB);
  const id = creadaB.id;

  // Rutas de lectura: el dueno entra (control positivo), el otro no.
  const lecturas = [
    ["GET", `/facturas/${id}`],
    ["GET", `/facturas/${id}/eventos`],
    ["GET", `/facturas/${id}/gestion/decision`],
    ["GET", `/facturas/${id}/email-status`],
    ["GET", `/facturas/${id}/files/kude.pdf`],
    ["GET", `/facturas/${id}/files/xml`]
  ];
  for (const [metodo, ruta] of lecturas) {
    const caso = `${metodo} ${ruta.replace(id, ":id")}`;
    const dueno = await http(metodo, ruta, { token: b.token, sinLanzar: true, crudo: ruta.includes("/files/") });
    // Sin 200 del dueno, un "bloqueado" no prueba nada. Las rutas de soporte dan 403 a todo operador.
    const soloSoporte = dueno.status === 403;
    registrar(par, "control positivo", caso, "200", dueno.status, dueno.status === 200 || soloSoporte, soloSoporte ? "Ruta solo para soporte: el 403 de abajo es por rol, no por cliente." : "");
    const ataque = await http(metodo, ruta, { token: a.token, sinLanzar: true, crudo: ruta.includes("/files/") });
    registrar(par, "lectura ajena", caso, "403/404", ataque.status, bloqueado(ataque.status));
  }

  // Acciones que mutan: el dueno no las ejecuta, para no alterar el documento.
  const acciones = [
    ["POST", `/facturas/${id}/refresh-status`, {}],
    ["POST", `/facturas/${id}/retry-emission`, {}],
    ["POST", `/facturas/${id}/cancelar`, { motivo: "Ataque de prueba" }],
    ["POST", `/facturas/${id}/nota-credito`, { motivo: "Ataque de prueba" }, { "idempotency-key": `ais-${sufijo}-nce` }],
    ["POST", `/facturas/${id}/delivery-link`, {}],
    ["POST", `/facturas/${id}/recibo`, {}]
  ];
  for (const [metodo, ruta, cuerpo, headers] of acciones) {
    const ataque = await http(metodo, ruta, { token: a.token, cuerpo, headers, sinLanzar: true });
    registrar(par, "accion ajena", `${metodo} ${ruta.replace(id, ":id")}`, "403/404", ataque.status, bloqueado(ataque.status));
  }

  const trasAtaques = (await http("GET", `/facturas/${id}`, { token: b.token })).datos;
  registrar(par, "sin huella", "el documento de B no cambio", "igual", "-", huella(trasAtaques) === huellaInicial, huella(trasAtaques) === huellaInicial ? "" : `Estado ahora: ${trasAtaques.estado}.`);

  // Listados: nada de B aparece en lo que ve A, ni buscando sus datos.
  const marcas = [id, b.clientes[0].documento, b.clientes[0].razon_social, b.items[0].descripcion, b.emisor_id];
  const listados = [
    `/facturas?limit=100`,
    `/facturas?q=${encodeURIComponent(b.clientes[0].razon_social)}&limit=100`,
    `/clientes?limit=100`,
    `/clientes?q=${encodeURIComponent(b.clientes[0].documento)}&limit=100`,
    `/catalogo/items?limit=100`,
    `/catalogo/items/search?q=${encodeURIComponent(b.items[0].descripcion)}&limit=30`,
    `/notas?limit=100`,
    `/recibos?limit=100`,
    // H-6: estas dos consultan a FE con la clave compartida.
    `/facturas/gestion/batch-pendientes?limit=200`,
    `/facturas/gestion/reconciliacion?limit=200`,
    `/facturas/gestion/reconciliacion?q=${encodeURIComponent(b.emisor_id ?? "x")}&limit=200`
  ];
  for (const ruta of listados) {
    const r = await http("GET", ruta, { token: a.token, sinLanzar: true });
    const texto = JSON.stringify(r.datos ?? "");
    const filtradas = marcas.filter((m) => m && texto.includes(m));
    // Un listado que da error no prueba aislamiento: queda como fallo a revisar.
    const ok = r.status < 400 ? filtradas.length === 0 : bloqueado(r.status);
    registrar(par, "listado", `GET ${ruta.split("?")[0]}${ruta.includes("q=") ? "?q=" : ""}`, "sin datos de B", r.status, ok, filtradas.length ? `Aparecen ${filtradas.length} datos de B.` : "");
  }

  // H-11: la busqueda cae en la base global de identidades. Se distingue por documento (lo que
  // autoriza SPEC_AGENDAS_CLIENTES_CATALOGO §4) de por fragmento de nombre (enumeracion).
  const nombre = b.clientes[0].razon_social;
  for (const [caso, q] of [["por documento exacto", b.clientes[0].documento], ["por fragmento de nombre", nombre.slice(0, -2)]]) {
    const r = await http("GET", `/clientes/search?q=${encodeURIComponent(q)}&limit=30`, { token: a.token, sinLanzar: true });
    const ajenos = (r.datos?.items ?? []).filter((x) => x.source === "IDENTIDAD_COMPARTIDA" && x.razon_social.includes(b.ref));
    const campos = ["telefono", "email", "direccion"].filter((campo) => ajenos.some((x) => x[campo]));
    // Por documento exacto se admite la identidad, sin contacto (SPEC_BUSQUEDA_CLIENTES_ENTRE_FACTURADORES RN-03).
    const admitido = caso === "por documento exacto" ? campos.length === 0 : ajenos.length === 0;
    registrar(par, "identidad compartida", `GET /clientes/search ${caso}`, caso === "por documento exacto" ? "sin datos de contacto de B" : "sin clientes de B", r.status, admitido, ajenos.length ? `${ajenos.length} clientes de B, con: ${campos.join(", ") || "sin contacto"}.` : "");
  }

  // Referencias de B dentro del cuerpo de A.
  const cuerpoConClienteB = factura(a);
  cuerpoConClienteB.cliente.cliente_id = b.clientes[0].id;
  const conClienteB = await http("POST", "/facturas", { token: a.token, cuerpo: cuerpoConClienteB, headers: { "idempotency-key": `ais-${sufijo}-cli` }, sinLanzar: true });
  registrar(par, "referencia en cuerpo", "POST /facturas con cliente_id de B", "403/404", conClienteB.status, bloqueado(conClienteB.status));

  const cuerpoConItemB = factura(a);
  cuerpoConItemB.items[0].catalogo_item_id = b.items[0].id;
  const conItemB = await http("POST", "/facturas", { token: a.token, cuerpo: cuerpoConItemB, headers: { "idempotency-key": `ais-${sufijo}-itm` }, sinLanzar: true });
  // Si se acepta, el documento no debe traer ningun dato de B.
  const itemTexto = JSON.stringify(conItemB.datos ?? "");
  const itemOk = bloqueado(conItemB.status) || (conItemB.status === 201 && !itemTexto.includes(b.items[0].descripcion));
  registrar(par, "referencia en cuerpo", "POST /facturas con catalogo_item_id de B", "403/404, o sin datos de B", conItemB.status, itemOk, conItemB.status === 201 ? "Se acepta sin usar datos de B: revisar si debe rechazarse." : "");

  // Agenda de B por id.
  const clienteB = b.clientes[0].id;
  const itemB = b.items[0].id;
  for (const [metodo, ruta, cuerpo] of [
    ["PATCH", `/clientes/${clienteB}`, { documento_tipo: "CI", documento: b.clientes[0].documento, razon_social: "Ataque de prueba" }],
    ["DELETE", `/clientes/${clienteB}`, undefined],
    ["PATCH", `/catalogo/items/${itemB}`, { descripcion: "Ataque de prueba", precio_unitario: 1 }],
    ["DELETE", `/catalogo/items/${itemB}`, undefined]
  ]) {
    const r = await http(metodo, ruta, { token: a.token, cuerpo, sinLanzar: true });
    registrar(par, "agenda ajena", `${metodo} ${ruta.replace(/[0-9a-f-]{36}/, ":id")}`, "403/404", r.status, bloqueado(r.status));
  }
  const clientesB = (await http("GET", `/clientes/search?q=${encodeURIComponent(b.clientes[0].documento)}&limit=5`, { token: b.token })).datos;
  const sigueCliente = JSON.stringify(clientesB).includes(b.clientes[0].razon_social);
  registrar(par, "sin huella", "el cliente de B sigue igual", "igual", "-", sigueCliente);

  // La misma clave en dos clientes son dos documentos distintos.
  const claveCompartida = `ais-${sufijo}-misma`;
  const enA = await crearFactura(a, claveCompartida);
  const enB = await crearFactura(b, claveCompartida);
  registrar(par, "idempotencia", "misma clave en A y B da documentos distintos", "distintos", "-", enA.id !== enB.id);
  const cruzado = await http("GET", `/facturas/${enA.id}`, { token: b.token, sinLanzar: true });
  registrar(par, "idempotencia", "B no ve el documento de A", "403/404", cruzado.status, bloqueado(cruzado.status));

  // Enlace publico: un token resuelve solo su documento.
  const enlace = await http("POST", `/facturas/${id}/delivery-link`, { token: b.token, cuerpo: {}, sinLanzar: true });
  const token = enlace.datos?.token ?? enlace.datos?.public_token ?? String(enlace.datos?.url ?? enlace.datos?.public_url ?? "").split("/public/d/")[1];
  const raiz = new URL(apiBase()).origin;
  if (token) {
    const publico = await http("GET", `/public/d/${token}`, { base: raiz, headers: { accept: "application/json" }, sinLanzar: true });
    const textoPublico = JSON.stringify(publico.datos ?? "");
    registrar(par, "enlace publico", "el token de B no expone datos de A", "sin datos de A", publico.status, publico.status === 200 && !textoPublico.includes(a.clientes[0].razon_social));
  } else {
    registrar(par, "enlace publico", "generar enlace", "token", enlace.status, false, "No se obtuvo token: revisar la forma de la respuesta.");
  }
  const adivinado = await http("GET", `/public/d/${crypto.randomBytes(32).toString("hex")}`, { base: raiz, headers: { accept: "application/json" }, sinLanzar: true });
  registrar(par, "enlace publico", "token inventado", "4xx", adivinado.status, adivinado.status >= 400 && adivinado.status < 500);
}

async function probarSesiones(a) {
  for (const ruta of ["/backoffice/tenants", "/backoffice/users", "/backoffice/planes", `/backoffice/facturadores/${a.facturador_id}`]) {
    const r = await http("GET", ruta, { token: a.token, sinLanzar: true });
    registrar("-", "rol", `operador en GET ${ruta.replace(a.facturador_id, ":id")}`, "403", r.status, r.status === 403);
  }
  for (const ruta of ["/facturas", `/facturas/${UUID_INEXISTENTE}`, "/clientes", "/me/context"]) {
    const r = await http("GET", ruta, { sinLanzar: true });
    registrar("-", "sin sesion", `GET ${ruta.replace(UUID_INEXISTENTE, ":id")}`, "401", r.status, r.status === 401);
    const invalido = await http("GET", ruta, { token: "no.es.un.token", sinLanzar: true });
    registrar("-", "token invalido", `GET ${ruta.replace(UUID_INEXISTENTE, ":id")}`, "401", invalido.status, invalido.status === 401);
  }
}

async function main() {
  const operadores = Object.values(cargarOperadores()).filter((o) => o.completo);
  if (operadores.length < 2) throw new Error("Hacen falta al menos 2 operadores completos.");

  const aprobadas = args["documentos-de"]
    ? fs.readFileSync(path.join(corridaDir(String(args["documentos-de"])), "documentos.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((d) => d.estado_final === "EMITIDA" && !d.tipo)
    : [];
  const distintas = [...new Map(aprobadas.map((d) => [d.ref, d])).values()];
  if (args["documentos-de"] && distintas.length < pares) throw new Error(`Hay ${distintas.length} facturas aprobadas de emisores distintos y se piden ${pares}.`);
  const refsB = new Set(distintas.slice(0, pares).map((d) => d.ref));
  const base = operadores.filter((o) => !refsB.has(o.ref)).slice(0, pares * 2 + 1);
  const sesiones = await Promise.all([...base, ...operadores.filter((o) => refsB.has(o.ref))].map(sesion));
  await probarSesiones(sesiones[0]);
  for (let par = 1; par <= pares; par += 1) {
    const elegida = distintas[par - 1] ?? null;
    const j = elegida ? sesiones.findIndex((o) => o.ref === elegida.ref) : Math.floor(random() * sesiones.length);
    const i = (j + 1 + Math.floor(random() * (sesiones.length - 1))) % sesiones.length;
    await probarPar(par, sesiones[i], sesiones[j], elegida ? { id: elegida.id } : null);
    // Una corrida larga no debe perder lo ya probado si un par falla.
    fs.writeFileSync(path.join(dir, "aislamiento-parcial.json"), JSON.stringify(resultados, null, 2));
  }

  const fallos = resultados.filter((r) => !r.ok);
  const cruces = fallos.filter((r) => !["control positivo", "preparacion"].includes(r.grupo));
  const resumen = {
    corrida,
    casos: resultados.length,
    fallos: fallos.length,
    accesos_cruzados: cruces.length,
    casos_sin_validez: fallos.length - cruces.length,
    veredicto: cruces.length === 0 ? (fallos.length === 0 ? "SIN_ACCESOS_CRUZADOS" : "SIN_ACCESOS_CON_CASOS_INVALIDOS") : "ACCESO_CRUZADO"
  };
  fs.writeFileSync(path.join(dir, "aislamiento.json"), JSON.stringify({ resumen, resultados }, null, 2));
  console.log(JSON.stringify(resumen));
  process.exit(cruces.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(2);
});
