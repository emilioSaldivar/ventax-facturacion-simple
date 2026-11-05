#!/usr/bin/env node
// Simulador de operadores por HTTP (PLAN §4). Cada operador usa su propio usuario.
//
//   node scripts/carga/simulate.cjs --corrida r1 --operadores 200 --total-por-hora 250 --duracion-s 3600
//     [--escenario normal|rafaga|concentrado] [--ventana-rafaga-s 60] [--pausa-s 0] [--prob-cancelar 0.05] [--prob-reintento 0.02]
//     [--poll-s 60] [--prob-refresh 0] [--limite-final-s 7200] [--seed 1] [--ref-concentrado f001] [--cantidad-concentrado 500]
//
// Modelo abierto (RN-09): las facturas llegan a su ritmo aunque el sistema se atrase.
//   normal       Poisson por operador, con la tasa ajustada por perfil de volumen.
//   rafaga       cada operador crea una factura al mismo tiempo (E3).
//   concentrado  un solo cliente encola muchas, y los demas siguen a ritmo normal (H-2).
const path = require("node:path");
const fs = require("node:fs");
const { cargarOperadores, cookieRefresh, corridaDir, externalRef, http, idCorrida, jsonl, normalizarRuta, parseArgs, percentil, prng } = require("./lib.cjs");

const args = parseArgs();
const corrida = args.corrida ?? idCorrida();
const escenario = args.escenario ?? "normal";
const cantidadOperadores = Number(args.operadores ?? 5);
// Facturas por hora de TODOS los clientes juntos (pedido de FE: 50 en pico, 250 en dia fuerte).
const totalPorHora = args["total-por-hora"] !== undefined ? Number(args["total-por-hora"]) : cantidadOperadores * Number(args["tasa-por-hora"] ?? 0.25);
const tasaPorHora = totalPorHora / cantidadOperadores;
const pausaMs = Number(args["pausa-s"] ?? 0) * 1000;
const ventanaRafagaMs = Number(args["ventana-rafaga-s"] ?? 60) * 1000;
const duracionS = Number(args["duracion-s"] ?? 60);
const probCancelar = Number(args["prob-cancelar"] ?? 0.05);
const probReintento = Number(args["prob-reintento"] ?? 0.02);
// La app no consulta en bucle: esto representa al operador mirando la lista. Un sondeo agresivo
// durante los 28 min de aprobacion mediria al simulador, no a la app.
const pollMs = Number(args["poll-s"] ?? 60) * 1000;
// Lotes cada 15 min, aprobacion p95 de 28 min y verificacion a los 5, 35 y 95 min: hay que esperar mas de 95.
const limiteFinalMs = Number(args["limite-final-s"] ?? 7200) * 1000;
// Probabilidad, en cada consulta, de que el operador apriete "Verificar estado". 0 mide solo al worker.
const probRefresh = Number(args["prob-refresh"] ?? 0);
const semilla = args.seed ?? 1;
const excluir = new Set(String(args.excluir ?? "").split(",").filter(Boolean));

// muy_alto: el emisor que acumula facturas para la tanda de cancelaciones del mismo emisor (E9).
const MULTIPLICADOR_VOLUMEN = { bajo: 0.25, normal: 1, alto: 4, muy_alto: 24 };
// Estado final desde el punto de vista del operador. Los demas siguen en proceso.
const ESTADOS_FINALES = new Set(["EMITIDA", "RECHAZADA", "CANCELADA", "CANCELADO_LOCAL", "ANULADA", "ERROR_TEMPORAL"]);

const dir = corridaDir(corrida);
const requests = jsonl(path.join(dir, "requests.jsonl"));
const documentos = jsonl(path.join(dir, "documentos.jsonl"));
const errores = jsonl(path.join(dir, "errores.jsonl"));
const atrasosPlanificacion = [];
const contadores = { creadas: 0, emitidas: 0, sin_final: 0, kude_ok: 0, kude_invalido: 0, canceladas: 0, reintentos_ok: 0, reintentos_mal: 0 };

const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Operador {
  constructor(datos, indice) {
    this.datos = datos;
    this.random = prng(`${semilla}:${datos.ref}`);
    this.secuencia = 0;
    this.indice = indice;
    this.token = null;
    this.cookie = null;
  }

  /** Toda llamada queda registrada. Un error de red cuenta como status 0, no aborta la corrida. */
  async llamar(metodo, ruta, opciones = {}) {
    const inicio = Date.now();
    const rutaNormal = `${metodo} ${normalizarRuta(ruta)}`;
    try {
      const respuesta = await http(metodo, ruta, { ...opciones, token: opciones.token ?? this.token, sinLanzar: true });
      requests.write({ t: inicio, ruta: rutaNormal, status: respuesta.status, ms: Math.round(respuesta.ms), ref: this.datos.ref });
      if (respuesta.status >= 500) {
        errores.write({ t: inicio, ruta: rutaNormal, status: respuesta.status, ref: this.datos.ref, cuerpo: resumen(respuesta.datos), clave: opciones.clave });
      }
      return respuesta;
    } catch (error) {
      requests.write({ t: inicio, ruta: rutaNormal, status: 0, ms: Date.now() - inicio, ref: this.datos.ref });
      errores.write({ t: inicio, ruta: rutaNormal, status: 0, ref: this.datos.ref, cuerpo: error.name, clave: opciones.clave });
      return { status: 0, datos: null };
    }
  }

  async iniciarSesion() {
    const respuesta = await this.llamar("POST", "/auth/login", { cuerpo: { username: this.datos.username, password: this.datos.password } });
    if (respuesta.status !== 200) throw new Error(`Login de ${this.datos.ref} dio ${respuesta.status}.`);
    this.token = respuesta.datos.access_token;
    this.cookie = respuesta.headers ? cookieRefresh(respuesta.headers) : null;
    this.expira = Date.now() + (respuesta.datos.expires_in - 60) * 1000;
    await this.llamar("GET", "/me/context");
    await this.llamar("GET", "/me/readiness");
  }

  async asegurarSesion() {
    if (this.token && Date.now() < this.expira) return;
    if (this.cookie) {
      const respuesta = await this.llamar("POST", "/auth/refresh", { cookie: this.cookie, token: "" });
      if (respuesta.status === 200) {
        this.token = respuesta.datos.access_token;
        this.cookie = (respuesta.headers && cookieRefresh(respuesta.headers)) || this.cookie;
        this.expira = Date.now() + (respuesta.datos.expires_in - 60) * 1000;
        return;
      }
    }
    await this.iniciarSesion();
  }

  cuerpoFactura() {
    const clientes = this.datos.clientes;
    const items = this.datos.items;
    const cliente = clientes[Math.floor(this.random() * clientes.length)];
    const item = items[Math.floor(this.random() * items.length)];
    return {
      condicion_venta: "CONTADO",
      tipo_transaccion: 2,
      cliente: {
        cliente_id: cliente.id,
        documento_tipo: "CI",
        documento: cliente.documento,
        razon_social: cliente.razon_social,
        email: `cli-${this.datos.ref}@carga.invalid`,
        direccion: "Asuncion"
      },
      items: [{ catalogo_item_id: item.id, codigo: item.codigo, descripcion: item.descripcion, cantidad: 1 + Math.floor(this.random() * 3), precio_unitario: item.precio_unitario, iva_tipo: item.iva_tipo }]
    };
  }

  /** El ciclo completo de una factura, como lo recorre la app. */
  async facturar({ soloCrear = false } = {}) {
    await this.asegurarSesion();
    this.secuencia += 1;
    const clave = `cg-${corrida}-${this.datos.ref}-${String(this.secuencia).padStart(6, "0")}`;

    if (!soloCrear) {
      await this.llamar("GET", "/facturas?limit=20");
      const cliente = this.datos.clientes[Math.floor(this.random() * this.datos.clientes.length)];
      await this.llamar("GET", `/clientes/search?q=${encodeURIComponent(cliente.documento)}&limit=10`);
    }
    const cuerpo = this.cuerpoFactura();
    if (!soloCrear) {
      if (pausaMs) await espera(pausaMs);
      await this.llamar("POST", "/facturas/preview", { cuerpo });
      if (pausaMs) await espera(pausaMs);
    }

    const inicioCreacion = Date.now();
    const creada = await this.llamar("POST", "/facturas", { cuerpo, headers: { "idempotency-key": clave }, clave });
    // Cruce pedido por FE contra el XML de cada evento: clave, external_ref, uuid y todo CDC observado.
    const registro = { clave, external_ref: externalRef(this.datos.facturador_id, clave), ref: this.datos.ref, emisor_id: this.datos.emisor_id, facturador_id: this.datos.facturador_id, t_creacion: inicioCreacion, status_creacion: creada.status };
    if (creada.status !== 201 || !creada.datos?.id) {
      errores.write({ t: inicioCreacion, ruta: "POST /facturas", status: creada.status, ref: this.datos.ref, cuerpo: resumen(creada.datos), clave });
      documentos.write({ ...registro, resultado: "no_creada" });
      return;
    }
    contadores.creadas += 1;
    registro.id = creada.datos.id;

    if (this.random() < probReintento) {
      const repetida = await this.llamar("POST", "/facturas", { cuerpo, headers: { "idempotency-key": clave }, clave });
      if (repetida.datos?.id === creada.datos.id) {
        contadores.reintentos_ok += 1;
      } else {
        contadores.reintentos_mal += 1;
        errores.write({ t: Date.now(), ruta: "POST /facturas (reintento)", status: repetida.status, ref: this.datos.ref, cuerpo: "documento distinto con la misma clave", clave });
      }
      registro.reintentada = true;
    }
    if (soloCrear) {
      documentos.write({ ...registro, resultado: "solo_creada" });
      return;
    }

    let actual = creada.datos;
    // Cada cambio de estado o de CDC: tras un reenvio el CDC puede cambiar y el uuid no.
    registro.historial = [];
    const anotar = (documento) => {
      const ultimo = registro.historial[registro.historial.length - 1];
      if (!ultimo || ultimo.estado !== documento.estado || ultimo.cdc !== (documento.cdc ?? null)) {
        registro.historial.push({ t: Date.now(), estado: documento.estado, cdc: documento.cdc ?? null });
      }
    };
    anotar(actual);
    const limite = Date.now() + limiteFinalMs;
    while (!ESTADOS_FINALES.has(actual.estado) && Date.now() < limite) {
      await espera(pollMs);
      await this.asegurarSesion();
      const usarRefresh = probRefresh > 0 && this.random() < probRefresh;
      const consulta = usarRefresh
        ? await this.llamar("POST", `/facturas/${registro.id}/refresh-status`, { cuerpo: {} })
        : await this.llamar("GET", `/facturas/${registro.id}`);
      if (consulta.status === 200) {
        actual = consulta.datos;
        anotar(actual);
      }
    }
    registro.t_final = Date.now();
    registro.estado_final = actual.estado;
    registro.document_uuid = actual.document_uuid ?? null;
    registro.cdc = actual.cdc ?? null;
    registro.cdc_cambio = new Set(registro.historial.map((h) => h.cdc).filter(Boolean)).size > 1;
    registro.numero_fiscal = actual.numero_fiscal ?? null;

    if (!ESTADOS_FINALES.has(actual.estado)) contadores.sin_final += 1;
    if (actual.estado === "EMITIDA") {
      contadores.emitidas += 1;
      await this.asegurarSesion();
      const kude = await this.llamar("GET", `/facturas/${registro.id}/files/kude.pdf`, { crudo: true });
      const esPdf = kude.status === 200 && Buffer.isBuffer(kude.datos) && kude.datos.subarray(0, 4).toString() === "%PDF";
      contadores[esPdf ? "kude_ok" : "kude_invalido"] += 1;
      registro.kude_ok = esPdf;
      if (kude.status === 200 && !esPdf) {
        errores.write({ t: Date.now(), ruta: "GET /facturas/:id/files/kude.pdf", status: 200, ref: this.datos.ref, cuerpo: "la respuesta no es un PDF", clave });
      }
      if (this.random() < probCancelar) {
        const cancelada = await this.llamar("POST", `/facturas/${registro.id}/cancelar`, { cuerpo: { motivo: "Prueba de carga: anulacion simulada" }, clave });
        registro.cancelacion_status = cancelada.status;
        registro.cancelacion = cancelada.datos?.cancelacion ?? null;
        registro.cdc_al_cancelar = actual.cdc ?? null;
        if (cancelada.status === 200) contadores.canceladas += 1;
      }
    }
    documentos.write({ ...registro, resultado: "completa" });
  }
}

function resumen(datos) {
  if (Buffer.isBuffer(datos)) return `<${datos.length} bytes>`;
  const texto = typeof datos === "string" ? datos : JSON.stringify(datos ?? null);
  return texto.slice(0, 500);
}

function exponencial(random, mediaMs) {
  return -Math.log(1 - random()) * mediaMs;
}

/** Espera hasta `momento` y registra cuanto se atraso el generador: si se satura, sus tiempos no valen. */
async function esperarHasta(momento) {
  const restante = momento - Date.now();
  if (restante > 0) await espera(restante);
  atrasosPlanificacion.push(Date.now() - momento);
}

async function main() {
  const todos = Object.values(cargarOperadores()).filter((o) => o.completo && !excluir.has(o.ref));
  if (todos.length < cantidadOperadores) {
    throw new Error(`Se pidieron ${cantidadOperadores} operadores y hay ${todos.length} listos.`);
  }
  const operadores = todos.slice(0, cantidadOperadores).map((datos, i) => new Operador(datos, i));

  // Los logins se reparten para medir la jornada. E2 fuerza el pico con --ventana-login-s corta.
  const ventanaLoginMs = Number(args["ventana-login-s"] ?? Math.min(60, cantidadOperadores)) * 1000;
  const inicioLogin = Date.now();
  await Promise.all(
    operadores.map(async (operador, i) => {
      await esperarHasta(inicioLogin + (ventanaLoginMs * i) / operadores.length);
      await operador.iniciarSesion();
    })
  );
  console.log(`Sesiones listas: ${operadores.length} en ${Math.round((Date.now() - inicioLogin) / 1000)} s.`);

  const multiplicadorPromedio = operadores.reduce((suma, o) => suma + (MULTIPLICADOR_VOLUMEN[o.datos.perfil_volumen] ?? 1), 0) / operadores.length;
  const inicio = Date.now();
  const fin = inicio + duracionS * 1000;
  const tareas = [];
  const lanzar = (operador, opciones) => {
    tareas.push(
      operador.facturar(opciones).catch((error) => {
        errores.write({ t: Date.now(), ruta: "ciclo", status: -1, ref: operador.datos.ref, cuerpo: error.message });
      })
    );
  };

  const reporte = setInterval(() => {
    console.log(`${Math.round((Date.now() - inicio) / 1000)} s ${JSON.stringify(contadores)}`);
  }, 30000);

  if (escenario === "rafaga") {
    // E3 / C3: las 200 dentro de la ventana, no en el mismo milisegundo.
    await Promise.all(
      operadores.map(async (operador) => {
        await esperarHasta(inicio + operador.random() * ventanaRafagaMs);
        lanzar(operador);
      })
    );
  } else {
    if (escenario === "concentrado") {
      const ref = args["ref-concentrado"] ?? operadores[0].datos.ref;
      const cantidad = Number(args["cantidad-concentrado"] ?? 500);
      const elegido = operadores.find((o) => o.datos.ref === ref);
      if (!elegido) throw new Error(`No esta el operador ${ref}.`);
      // De a uno por vez: un solo operador, sin polling, llenando la cola.
      tareas.push((async () => { for (let i = 0; i < cantidad; i += 1) await elegido.facturar({ soloCrear: true }); })());
    }
    await Promise.all(
      operadores.map(async (operador) => {
        // El perfil reparte el volumen sin cambiar el total pedido.
        const tasa = (tasaPorHora * (MULTIPLICADOR_VOLUMEN[operador.datos.perfil_volumen] ?? 1)) / multiplicadorPromedio;
        const mediaMs = 3600000 / tasa;
        let momento = inicio + exponencial(operador.random, mediaMs);
        while (momento < fin) {
          await esperarHasta(momento);
          lanzar(operador);
          momento += exponencial(operador.random, mediaMs);
        }
      })
    );
  }

  console.log(`Fin de arribos a ${Math.round((Date.now() - inicio) / 1000)} s. Esperando ciclos abiertos...`);
  await Promise.all(tareas);
  clearInterval(reporte);

  await Promise.all([requests.end(), documentos.end(), errores.end()]);
  const ordenados = [...atrasosPlanificacion].sort((a, b) => a - b);
  const p99 = percentil(ordenados, 99) ?? 0;
  const resumenCorrida = {
    corrida,
    escenario,
    operadores: operadores.length,
    total_por_hora: totalPorHora,
    duracion_s: duracionS,
    semilla,
    inicio: new Date(inicio).toISOString(),
    fin: new Date().toISOString(),
    atraso_generador_p99_ms: p99,
    generador_valido: p99 <= 250,
    ...contadores
  };
  fs.writeFileSync(path.join(dir, "simulacion.json"), JSON.stringify(resumenCorrida, null, 2));
  console.log(JSON.stringify(resumenCorrida));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(2);
});
