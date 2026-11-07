/**
 * Carga masiva en modo mock (PLAN_CARGA_MASIVA_FACTURAS_v0.1, seccion 5.4).
 *
 * Maquina de estados determinista, con las formas de `tecnica/openapi.yaml` de FE. El estado es
 * de modulo y no de instancia: cada pedido crea su propio gateway con la clave del facturador, y
 * la carga debe seguir ahi en el pedido siguiente. Se pierde al reiniciar el proceso.
 *
 * Del archivo solo lee los titulos, `numero_comprobante`, `referencia_venta` y `receptor_email`.
 * Los marcadores van al inicio de `referencia_venta`: INVALIDO, AVISO, RECHAZO, ERROR, DUP.
 */
import crypto from "node:crypto";
import {
  FiscalGatewayError,
  type FeCarga,
  type FeCargaAcciones,
  type FeCargaComprobante,
  type FeCargaComprobanteFiltros,
  type FeCargaComprobanteLista,
  type FeCargaErrorDetails,
  type FeCargaEstado,
  type FeCargaLoteLista,
  type FeCargaProblema,
  type FeCargaTotales,
  type FeCrearCargaInput,
  type FeCrearCargaResult,
  type FiscalArtifactResponse
} from "./fiscal-gateway.types";

const TOPE_BYTES_FE = 20_971_520;
const UUID_DUPLICADO = "00000000-0000-4000-8000-0000000000dd";
const COMPROBANTES_POR_LOTE = 50;

type Marcador = "RECHAZO" | "ERROR" | null;

interface MockComprobante extends FeCargaComprobante {
  marcador: Marcador;
  con_correo: boolean;
}

interface MockCarga {
  carga: Omit<FeCarga, "acciones" | "totales">;
  sha256: string;
  emisorId: string;
  comprobantes: MockComprobante[];
  lineas: number;
  titulosValidos: boolean;
}

const cargas = new Map<string, MockCarga>();
let ultimoInstante = 0;

/** `actualizado_en` estrictamente creciente: dos cambios en el mismo milisegundo no se confunden. */
function instante(): string {
  ultimoInstante = Math.max(Date.now(), ultimoInstante + 1);
  return new Date(ultimoInstante).toISOString();
}

function errorFe(status: number, code: string, message: string, details: Record<string, unknown> | null = null): FiscalGatewayError {
  const info: FeCargaErrorDetails = { status, fe_code: code, message, details, retry_after_seconds: null };
  return new FiscalGatewayError("UPSTREAM_ERROR", message, info);
}

function leerFilas(contenido: Buffer): { titulos: string[]; filas: Array<Record<string, string>> } {
  const lineas = contenido.toString("utf8").replace(/^﻿/, "").split(/\r?\n/).filter((linea) => linea.trim() !== "");
  const titulos = (lineas[0] ?? "").split(";").map((titulo) => titulo.trim());
  const filas = lineas.slice(1).map((linea) => {
    const celdas = linea.split(";");
    return Object.fromEntries(titulos.map((titulo, indice) => [titulo, (celdas[indice] ?? "").trim()]));
  });
  return { titulos, filas };
}

function armarComprobantes(filas: Array<Record<string, string>>): MockComprobante[] {
  const comprobantes: MockComprobante[] = [];
  let actual: string | null = null;
  let filaArchivo = 1;

  for (const fila of filas) {
    filaArchivo += 1;
    const numero = fila.numero_comprobante ?? "";
    if (numero === actual) {
      comprobantes[comprobantes.length - 1]!.filas[1] = filaArchivo;
      continue;
    }
    actual = numero;
    const referencia = fila.referencia_venta ?? "";
    comprobantes.push(armarComprobante(comprobantes.length + 1, filaArchivo, numero, referencia, Boolean(fila.receptor_email)));
  }
  return comprobantes;
}

function armarComprobante(orden: number, fila: number, numero: string, referencia: string, conCorreo: boolean): MockComprobante {
  const base: MockComprobante = {
    orden,
    filas: [fila, fila],
    tipo_documento: "FACTURA",
    numero_archivo: numero,
    numero_asignado: null,
    referencia_venta: referencia || null,
    estado: "PENDIENTE",
    errores: [],
    advertencias: [],
    document_uuid: null,
    cdc: null,
    documento_estado: null,
    lote: null,
    sifen: null,
    correo: null,
    aprobado_en: null,
    actualizado_en: instante(),
    marcador: referencia.startsWith("RECHAZO") ? "RECHAZO" : referencia.startsWith("ERROR") ? "ERROR" : null,
    con_correo: conCorreo
  };

  if (referencia.startsWith("INVALIDO")) {
    base.estado = "INVALIDO";
    base.errores = [{
      codigo: "TOTAL_NO_COINCIDE",
      mensaje: "El total del comprobante no coincide con la suma de sus lineas.",
      fila,
      columna: "total_comprobante"
    }];
  } else if (referencia.startsWith("DUP")) {
    base.estado = "DUPLICADO";
    base.document_uuid = UUID_DUPLICADO;
  } else if (referencia.startsWith("AVISO")) {
    base.advertencias = [{
      codigo: "TRANSMISION_EXTEMPORANEA",
      mensaje: "La fecha de emision tiene mas de 5 dias de atraso: se emite como transmision extemporanea.",
      fila,
      columna: "fecha_emision"
    }];
  }
  return base;
}

function contar(mock: MockCarga, estado: FeCargaComprobante["estado"]): number {
  return mock.comprobantes.filter((comprobante) => comprobante.estado === estado).length;
}

function totalesDe(mock: MockCarga): FeCargaTotales {
  const enviados = contar(mock, "ENVIADO");
  const concluidos = contar(mock, "APROBADO") + contar(mock, "APROBADO_CON_OBS") + contar(mock, "RECHAZADO");
  const validada = mock.carga.estado !== "RECIBIDA" && mock.carga.estado !== "VALIDANDO";
  return {
    lineas: validada ? mock.lineas : null,
    comprobantes: validada ? mock.comprobantes.length : null,
    invalidos: contar(mock, "INVALIDO"),
    duplicados: contar(mock, "DUPLICADO"),
    pendientes: contar(mock, "PENDIENTE"),
    preparados: contar(mock, "PREPARADO"),
    enviados,
    aprobados: contar(mock, "APROBADO"),
    aprobados_con_obs: contar(mock, "APROBADO_CON_OBS"),
    rechazados: contar(mock, "RECHAZADO"),
    con_error: contar(mock, "ERROR"),
    cancelados: contar(mock, "CANCELADO"),
    con_advertencias: mock.comprobantes.filter((comprobante) => comprobante.advertencias.length > 0).length,
    numeros_salteados: 0,
    lotes_enviados: Math.ceil((enviados + concluidos) / COMPROBANTES_POR_LOTE),
    lotes_en_proceso: Math.ceil(enviados / COMPROBANTES_POR_LOTE),
    lotes_concluidos: Math.floor(concluidos / COMPROBANTES_POR_LOTE)
  };
}

/** Misma regla que `accionesDeCarga` de FE (`presentar-carga.ts`). */
function accionesDe(estado: FeCargaEstado, totales: FeCargaTotales): FeCargaAcciones {
  return {
    puede_confirmar: estado === "VALIDADA" && totales.pendientes > 0,
    puede_cancelar: ["VALIDADA", "EN_COLA", "EN_PREPARACION", "EN_SIFEN"].includes(estado) && totales.pendientes + totales.con_error > 0,
    puede_reintentar: ["EN_PREPARACION", "EN_SIFEN"].includes(estado) && totales.con_error > 0
  };
}

function presentar(mock: MockCarga): FeCarga {
  const totales = totalesDe(mock);
  return { ...mock.carga, acciones: accionesDe(mock.carga.estado, totales), totales };
}

function buscar(cargaId: string): MockCarga {
  const mock = cargas.get(cargaId);
  if (!mock) throw errorFe(404, "CARGA_NOT_FOUND", "Carga no encontrada");
  return mock;
}

function hayOtraActiva(mock: MockCarga): boolean {
  return [...cargas.values()].some(
    (otra) => otra !== mock && otra.emisorId === mock.emisorId && ["EN_PREPARACION", "EN_SIFEN"].includes(otra.carga.estado)
  );
}

function preparar(mock: MockCarga, comprobante: MockComprobante): void {
  if (comprobante.marcador === "ERROR") {
    comprobante.estado = "ERROR";
    comprobante.marcador = null;
    comprobante.actualizado_en = instante();
    return;
  }
  const digest = crypto.createHash("sha256").update(`${mock.carga.carga_id}:${comprobante.orden}`).digest("hex");
  comprobante.estado = "PREPARADO";
  comprobante.document_uuid = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  comprobante.cdc = digest.toUpperCase().padEnd(44, "0").slice(0, 44);
  comprobante.numero_asignado = mock.carga.numeracion === "CLIENTE"
    ? comprobante.numero_archivo
    : `${mock.carga.establecimiento ?? "001"}-${mock.carga.punto ?? "001"}-${String(comprobante.orden).padStart(7, "0")}`;
  comprobante.documento_estado = "QUEUED_BATCH";
  comprobante.correo = comprobante.con_correo ? "PENDING" : null;
  comprobante.actualizado_en = instante();
}

function iniciarPreparacion(mock: MockCarga): void {
  mock.carga.estado = "EN_PREPARACION";
  mock.carga.iniciada_en = instante();
  const pendientes = mock.comprobantes.filter((comprobante) => comprobante.estado === "PENDIENTE");
  for (const comprobante of pendientes.slice(0, Math.ceil(pendientes.length / 2))) {
    preparar(mock, comprobante);
  }
}

function concluir(comprobante: MockComprobante): void {
  const ahora = instante();
  if (comprobante.marcador === "RECHAZO") {
    comprobante.estado = "RECHAZADO";
    comprobante.documento_estado = "REJECTED";
    comprobante.sifen = { codigo: "1306", mensaje: "RUC del receptor inexistente" };
    comprobante.correo = null;
  } else {
    comprobante.estado = "APROBADO";
    comprobante.documento_estado = "APPROVED";
    comprobante.sifen = { codigo: "0260", mensaje: "Aprobado" };
    comprobante.aprobado_en = ahora;
    comprobante.correo = comprobante.con_correo ? "SENT" : null;
  }
  comprobante.actualizado_en = ahora;
}

/** Cada consulta de la carga la adelanta un paso (PLAN 5.4). */
function avanzar(mock: MockCarga): void {
  const { carga } = mock;
  switch (carga.estado) {
    case "RECIBIDA":
      carga.validada_en = instante();
      if (!mock.titulosValidos) {
        carga.estado = "RECHAZADA";
        carga.finalizada_en = carga.validada_en;
        carga.motivos = [{
          codigo: "COLUMNA_DESCONOCIDA",
          mensaje: "Falta la columna \"numero_comprobante\": puede ser un titulo mal escrito.",
          fila: 1,
          columna: "numero_comprobante"
        }];
      } else {
        carga.estado = "VALIDADA";
      }
      break;
    case "EN_COLA":
      if (!hayOtraActiva(mock)) iniciarPreparacion(mock);
      break;
    case "EN_PREPARACION":
      for (const comprobante of mock.comprobantes) {
        if (comprobante.estado === "PENDIENTE") preparar(mock, comprobante);
        if (comprobante.estado === "PREPARADO") {
          comprobante.estado = "ENVIADO";
          comprobante.lote = String(Math.ceil(comprobante.orden / COMPROBANTES_POR_LOTE));
          comprobante.actualizado_en = instante();
        }
      }
      carga.estado = "EN_SIFEN";
      break;
    case "EN_SIFEN":
      for (const comprobante of mock.comprobantes) {
        if (comprobante.estado === "ENVIADO") concluir(comprobante);
        if (comprobante.estado === "PENDIENTE") preparar(mock, comprobante);
      }
      if (contar(mock, "ERROR") + contar(mock, "PREPARADO") === 0) {
        carga.estado = "FINALIZADA";
        carga.finalizada_en = instante();
      } else if (contar(mock, "PREPARADO") > 0) {
        carga.estado = "EN_PREPARACION";
      }
      break;
    default:
      break;
  }
}

function accionNoAdmitida(mock: MockCarga): FiscalGatewayError {
  const actual = presentar(mock);
  return errorFe(409, "CARGA_ACCION_NO_ADMITIDA", "La carga no admite esa accion en su estado actual.", {
    estado: actual.estado,
    acciones: actual.acciones
  });
}

function detalleMock(): NonNullable<FeCargaComprobante["detalle"]> {
  return {
    fecha: new Date().toISOString().slice(0, 19),
    tipoTransaccion: 1,
    receptor: { tipoDocumento: "RUC", docNro: "80000000", dv: "1", razonSocial: "Cliente de carga", naturaleza: "JURIDICA" },
    condicionOperacion: { tipo: "CONTADO" },
    items: [{ codigo: "ITEM-1", descripcion: "Item de carga", cantidad: 1, precioUnitario: 100000, ivaTipo: "IVA10" }],
    total: 100000
  };
}

export const mockCargas = {
  crear(input: FeCrearCargaInput): FeCrearCargaResult {
    if (input.contenido.length === 0) {
      throw errorFe(422, "CARGA_ARCHIVO_VACIO", "El archivo llego vacio.");
    }
    if (input.contenido.length > TOPE_BYTES_FE) {
      throw errorFe(413, "CARGA_ARCHIVO_DEMASIADO_GRANDE", "El archivo supera el tope de 20 MB.", { tope_bytes: TOPE_BYTES_FE });
    }

    const sha256 = crypto.createHash("sha256").update(input.contenido).digest("hex");
    for (const existente of cargas.values()) {
      if (
        existente.emisorId === input.emisorId &&
        existente.sha256 === sha256 &&
        !["RECHAZADA", "CANCELADA"].includes(existente.carga.estado)
      ) {
        return { carga: presentar(existente), creada: false };
      }
    }

    const esZip = input.contentType === "application/zip";
    const { titulos, filas } = esZip
      ? { titulos: ["numero_comprobante"], filas: [{ numero_comprobante: "001-001-0000001" }] }
      : leerFilas(input.contenido);
    const carga_id = crypto.randomUUID();
    const mock: MockCarga = {
      sha256,
      emisorId: input.emisorId,
      comprobantes: titulos.includes("numero_comprobante") ? armarComprobantes(filas) : [],
      lineas: filas.length,
      titulosValidos: titulos.includes("numero_comprobante"),
      carga: {
        carga_id,
        estado: "RECIBIDA",
        emisor_id: input.emisorId,
        env: "test",
        formato: "CSV",
        version: "1",
        nombre_archivo: input.nombreArchivo ?? null,
        tamano_bytes: input.contenido.length,
        perfil: input.emissionProfileCode ?? null,
        establecimiento: input.establecimiento ?? null,
        punto: input.punto ?? null,
        actividad: input.actividadEconomicaCodigo,
        numeracion: input.numeracion,
        recibida_en: instante(),
        validada_en: null,
        confirmada_en: null,
        iniciada_en: null,
        finalizada_en: null,
        cancelada_en: null,
        motivos: null
      }
    };
    cargas.set(carga_id, mock);
    return { carga: presentar(mock), creada: true };
  },

  plantilla(): FiscalArtifactResponse {
    const titulos = "tipo_documento;numero_comprobante;fecha_emision;referencia_venta;receptor_tipo_documento;receptor_documento;receptor_nombre;receptor_email;condicion;pago_1_medio;pago_1_monto;total_comprobante;item_codigo;item_descripcion;item_cantidad;item_precio_unitario;item_iva";
    const ejemplo = "FACTURA;001-001-0000001;2026-11-07T09:15:00;PED-1;RUC;80000000-1;EMPRESA EJEMPLO S.A.;compras@ejemplo.com.py;CONTADO;EFECTIVO;100000;100000;SRV-1;Servicio;1;100000;IVA10";
    return { body: Buffer.from(`${titulos}\n${ejemplo}\n`, "utf8"), content_type: "text/csv; charset=utf-8", filename: "carga-csv-v1.csv" };
  },

  obtener(cargaId: string): FeCarga {
    const mock = buscar(cargaId);
    avanzar(mock);
    return presentar(mock);
  },

  comprobantes(cargaId: string, filtros: FeCargaComprobanteFiltros): FeCargaComprobanteLista {
    const mock = buscar(cargaId);
    const estados = filtros.estado?.split(",").map((estado) => estado.trim());
    const filtrados = mock.comprobantes.filter((comprobante) => {
      if (estados && !estados.includes(comprobante.estado)) return false;
      if (filtros.con_advertencias && comprobante.advertencias.length === 0) return false;
      if (filtros.actualizado_desde && comprobante.actualizado_en <= filtros.actualizado_desde) return false;
      return true;
    });
    const page = filtros.page ?? 1;
    const limit = filtros.limit ?? 50;
    const items = filtrados.slice((page - 1) * limit, page * limit).map((comprobante) => {
      const { marcador: _marcador, con_correo: _conCorreo, ...publico } = comprobante;
      return filtros.detalle ? { ...publico, detalle: comprobante.document_uuid ? detalleMock() : null } : publico;
    });
    return { carga_id: cargaId, estado: mock.carga.estado, items, page, limit, total: filtrados.length };
  },

  confirmar(cargaId: string): FeCarga {
    const mock = buscar(cargaId);
    if (!presentar(mock).acciones.puede_confirmar) throw accionNoAdmitida(mock);
    mock.carga.confirmada_en = instante();
    if (hayOtraActiva(mock)) {
      mock.carga.estado = "EN_COLA";
    } else {
      iniciarPreparacion(mock);
    }
    return presentar(mock);
  },

  cancelar(cargaId: string): FeCarga {
    const mock = buscar(cargaId);
    if (!presentar(mock).acciones.puede_cancelar) throw accionNoAdmitida(mock);
    const ahora = instante();
    mock.carga.cancelada_en = ahora;
    for (const comprobante of mock.comprobantes) {
      if (comprobante.estado === "PENDIENTE" || comprobante.estado === "ERROR") {
        comprobante.estado = "CANCELADO";
        comprobante.actualizado_en = instante();
      }
    }
    const sinPreparar = mock.comprobantes.every((comprobante) => !comprobante.document_uuid || comprobante.estado === "DUPLICADO");
    if (sinPreparar) {
      mock.carga.estado = "CANCELADA";
      mock.carga.finalizada_en = ahora;
    }
    return presentar(mock);
  },

  reintentar(cargaId: string): FeCarga {
    const mock = buscar(cargaId);
    if (!presentar(mock).acciones.puede_reintentar) throw accionNoAdmitida(mock);
    for (const comprobante of mock.comprobantes) {
      if (comprobante.estado === "ERROR") preparar(mock, comprobante);
    }
    mock.carga.estado = "EN_PREPARACION";
    return presentar(mock);
  },

  resultado(cargaId: string): FiscalArtifactResponse {
    const mock = buscar(cargaId);
    const celda = (problemas: FeCargaProblema[]) => problemas.map((problema) => `${problema.codigo}: ${problema.mensaje}`).join(" | ");
    const filas = mock.comprobantes.map((c) =>
      [c.orden, c.numero_archivo, c.numero_asignado, c.referencia_venta, c.estado, celda(c.errores), c.document_uuid, c.cdc, c.sifen?.codigo, c.correo]
        .map((valor) => valor ?? "")
        .join(";")
    );
    const csv = ["orden;numero_comprobante;numero_asignado;referencia_venta;estado;errores;document_uuid;cdc;sifen_codigo;correo", ...filas].join("\n");
    return { body: Buffer.from(`${csv}\n`, "utf8"), content_type: "text/csv; charset=utf-8", filename: `resultado-${cargaId}.csv` };
  },

  lotes(cargaId: string): FeCargaLoteLista {
    const mock = buscar(cargaId);
    const enLote = mock.comprobantes.filter((comprobante) => comprobante.lote);
    const numeros = [...new Set(enLote.map((comprobante) => comprobante.lote!))];
    return {
      carga_id: cargaId,
      estado: mock.carga.estado,
      items: numeros.map((numero) => {
        const delLote = enLote.filter((comprobante) => comprobante.lote === numero);
        const concluido = delLote.every((comprobante) => comprobante.estado !== "ENVIADO");
        return {
          lote_id: `${cargaId}-${numero}`,
          numero_lote: numero,
          estado: concluido ? "CONCLUIDO" : "RECIBIDO",
          documentos: delLote.length,
          aprobados: delLote.filter((comprobante) => comprobante.estado === "APROBADO").length,
          rechazados: delLote.filter((comprobante) => comprobante.estado === "RECHAZADO").length,
          recepcion: { codigo: "0300", mensaje: "Lote recibido" },
          resultado: concluido ? { codigo: "0362", mensaje: "Lote procesado" } : null,
          enviado_en: mock.carga.iniciada_en,
          consultado_en: mock.carga.iniciada_en,
          concluido_en: concluido ? mock.carga.finalizada_en : null
        };
      })
    };
  },

  /** Solo pruebas. */
  __reiniciar(): void {
    cargas.clear();
  }
};
