import { calculateDocumentTotals, calculateTaxLine, type TaxInputLine } from "@facturacion-simple/shared";
import { logger } from "../../shared/logging/logger";
import { documentoIdentidadTipos, type DocumentoIdentidadTipo } from "../clientes/clientes.types";
import type { DocumentoEstado, FacturaClienteInput, FacturaItemPreview } from "../facturas/facturas.types";
import { mapDocumentStatusCanonico } from "../fiscal-gateway/fiscal-gateway.client";
import type { FeCargaAcciones, FeCargaComprobante, FeCargaDetalleRemision, FeCargaEstado } from "../fiscal-gateway/fiscal-gateway.types";
import type { CargaMasivaRecord, FacturaDeCarga } from "./cargas.types";

const MINUTO = 60_000;
const SIN_TERMINAR_MS = 72 * 60 * MINUTO;

/**
 * Las facturas emitidas desde la app guardan el numero tal como lo devuelve FE (`1010000`); la carga
 * lo informa con establecimiento y punto (`001-001-1010000`). Se guarda igual que las demas, para que
 * la busqueda por numero de Documentos las encuentre (visto en el ensayo local, 2026-11-08).
 */
export function numeroSinPunto(numero: string | null): string | null {
  if (!numero) return null;
  const partes = /^\d{3}-\d{3}-(\d+)$/.exec(numero);
  return partes ? partes[1]! : numero;
}

export function externalRefDeCarga(feCargaId: string, orden: number): string {
  return `carga:${feCargaId}:${orden}`;
}

const ESTADOS_CON_DOCUMENTO = new Set(["PREPARADO", "ENVIADO", "APROBADO", "APROBADO_CON_OBS", "RECHAZADO"]);

/** Estados en los que hay comprobantes que pueden tener `document_uuid` (PLAN 6, paso 3). */
export function cargaTieneDocumentos(estado: FeCargaEstado): boolean {
  return estado === "EN_PREPARACION" || estado === "EN_SIFEN" || estado === "FINALIZADA" || estado === "CANCELADA";
}

/** Espera hasta la proxima sincronizacion. Nulo: la carga no cambia sola (PLAN 6, frecuencia). */
const TOPE_CORREO_TRAS_CIERRE_MS = 2 * 60 * MINUTO;

/**
 * SPEC_CORRECCIONES_ENSAYO_VOLUMEN_v0.1, CEV-1 (FS-40): con la carga cerrada, FE sigue enviando correos
 * (EMAIL_TRAS_APROBACION, cola de 15 a 25 por minuto). Mientras FS tenga facturas de la carga con correo
 * PENDING, se vuelve a sincronizar cada 5 minutos, hasta 2 horas despues del cierre. `null`: sin agenda.
 */
export function agendaPorCorreo(input: {
  estado: FeCargaEstado;
  cerradaEn: string | null | undefined;
  pendientes: number;
  ahora?: number;
}): { esperaMs: number | null; vencida: boolean } {
  const ahora = input.ahora ?? Date.now();
  if ((input.estado !== "FINALIZADA" && input.estado !== "CANCELADA") || input.pendientes <= 0) {
    return { esperaMs: null, vencida: false };
  }
  const cierre = input.cerradaEn ? new Date(input.cerradaEn).getTime() : ahora;
  if (ahora - cierre > TOPE_CORREO_TRAS_CIERRE_MS) return { esperaMs: null, vencida: true };
  return { esperaMs: 5 * MINUTO, vencida: false };
}

export function proximaSincronizacionMs(
  estado: FeCargaEstado,
  confirmadaEn: string | null | undefined,
  ahora = Date.now(),
  acciones?: Pick<FeCargaAcciones, "puede_confirmar">
): number | null {
  switch (estado) {
    case "VALIDADA":
      // SPEC_CARGA_ATENCION_COMPROBANTES_v0.1, RN-06: sin nada que confirmar, FE la cierra sola
      // (en segundos, o al inutilizarse los numeros pendientes). Confirmable: espera al operador.
      return acciones && !acciones.puede_confirmar ? 15 * MINUTO : null;
    case "RECIBIDA":
    case "VALIDANDO":
    case "EN_PREPARACION":
    case "EN_COLA":
    case "EN_SIFEN": {
      if (confirmadaEn && ahora - new Date(confirmadaEn).getTime() > SIN_TERMINAR_MS) return 30 * MINUTO;
      return estado === "EN_COLA" || estado === "EN_SIFEN" ? 5 * MINUTO : MINUTO;
    }
    default:
      return null;
  }
}

function estadoDesdeComprobante(comprobante: FeCargaComprobante): { estado: FacturaDeCarga["estado"]; raw: string } {
  switch (comprobante.estado) {
    case "APROBADO":
      return { estado: "EMITIDA", raw: "APPROVED" };
    case "APROBADO_CON_OBS":
      return { estado: "EMITIDA", raw: "APPROVED_WITH_OBS" };
    case "RECHAZADO":
      return { estado: "RECHAZADA", raw: "REJECTED" };
    default:
      return { estado: "PENDIENTE_SIFEN", raw: "QUEUED_BATCH" };
  }
}

function ivaTipoDeFe(tipo: string | undefined): TaxInputLine["iva_tipo"] {
  if (tipo === "IVA10") return "IVA_10";
  if (tipo === "IVA5") return "IVA_5";
  return "EXENTA";
}

function clienteDeFe(receptor: NonNullable<NonNullable<FeCargaComprobante["detalle"]>["receptor"]>): FacturaClienteInput {
  const tipo = receptor.tipoDocumento as DocumentoIdentidadTipo | undefined;
  const naturaleza = receptor.naturaleza === "FISICA" || receptor.naturaleza === "JURIDICA" ? receptor.naturaleza : null;
  return {
    documento_tipo: tipo && documentoIdentidadTipos.includes(tipo) ? tipo : "NO_ESPECIFICADO",
    documento: `${receptor.docNro ?? ""}${receptor.dv ? `-${receptor.dv}` : ""}`,
    razon_social: receptor.razonSocial ?? "",
    direccion: receptor.direccion ?? null,
    telefono: receptor.telefono ?? null,
    email: receptor.email ?? null,
    naturaleza
  };
}

/**
 * FE admite cantidades decimales y `calculateTaxLine` solo enteras: la linea se calcula sobre su
 * subtotal redondeado, como FE arma el total, y conserva la cantidad y el precio del archivo.
 */
function itemsYTotales(detalle: NonNullable<FeCargaComprobante["detalle"]>): Pick<FacturaDeCarga, "items" | "totals"> {
  const lineas = detalle.items.map((item) => {
    const cantidad = Number(item.cantidad ?? 0);
    const precio = Number(item.precioUnitario ?? 0);
    const linea: TaxInputLine = {
      codigo: item.codigo?.trim() || null,
      descripcion: item.descripcion ?? "",
      cantidad: 1,
      precio_unitario: Math.round(cantidad * precio),
      iva_tipo: ivaTipoDeFe(item.ivaTipo)
    };
    return { linea, cantidad, precio };
  });
  const { totals } = calculateDocumentTotals(lineas.map(({ linea }) => linea));
  const items: FacturaItemPreview[] = lineas.map(({ linea, cantidad, precio }, indice) => ({
    ...calculateTaxLine(linea, indice + 1),
    cantidad,
    precio_unitario: precio,
    catalogo_item_id: null
  }));
  return { items, totals };
}

/**
 * Nulo si el comprobante no crea documento (RN-13) o si FE no trae su detalle. D-11: si el total
 * calculado difiere del de FE, manda FE, que es el que esta en el XML: se registra y se conserva.
 */
/** SPEC_TOTALES_FE_EN_CARGA_v0.1, RN-07: lo que FS no puede reproducir en una nota de credito con sus lineas. */
function requiereNotaCreditoPorReferencia(detalle: NonNullable<FeCargaComprobante["detalle"]>): boolean {
  const t = detalle.totales;
  if (t && (t.descuento > 0 || t.anticipo > 0 || t.exonerada > 0)) return true;
  return detalle.items.some(
    (item) => (item.descuento ?? 0) > 0 || item.afectacionIva === "EXONERADO" || item.afectacionIva === "GRAVADO_PARCIAL"
  );
}

/** Lo que comparten la factura y la nota de remision: identidad, estado y fechas del comprobante. */
function identidadDeComprobante(carga: Pick<CargaMasivaRecord, "fe_carga_id">, comprobante: FeCargaComprobante) {
  const desdeEmision = estadoDesdeComprobante(comprobante);
  const vigente = mapDocumentStatusCanonico(comprobante.documento_estado);
  return {
    externalRef: externalRefDeCarga(carga.fe_carga_id, comprobante.orden),
    // Solo se llama con comprobantes que ya tienen documento (ver comprobanteAFactura).
    documentUuid: comprobante.document_uuid!,
    estado: vigente ?? desdeEmision.estado,
    estadoVigente: vigente !== null,
    fiscalStatusRaw: comprobante.documento_estado ?? desdeEmision.raw,
    sifenCodigo: comprobante.sifen?.codigo ?? null,
    sifenMensaje: comprobante.sifen?.mensaje ?? null,
    cdc: comprobante.cdc,
    numeroFiscal: numeroSinPunto(comprobante.numero_asignado),
    numeroArchivo: comprobante.numero_archivo,
    emailEstado: comprobante.correo,
    aprobadoEn: comprobante.aprobado_en,
    actualizadoEn: comprobante.actualizado_en
  };
}

const SIN_MONTOS: FacturaDeCarga["totals"] = { subtotal: 0, total_sin_iva: 0, iva_5: 0, iva_10: 0, total_iva: 0, total: 0 };

/**
 * SPEC_DOCUMENTOS_ESCRITORIO_v0.1, fase B1 (RN-07). Una nota de remision no tiene precio, IVA, total ni condicion:
 * las lineas guardan cantidad y descripcion (precio 0; `EXENTA` solo por la restriccion de la tabla, no se muestra).
 */
function comprobanteANotaRemision(carga: Pick<CargaMasivaRecord, "fe_carga_id">, comprobante: FeCargaComprobante): FacturaDeCarga | null {
  const detalle = comprobante.detalle as unknown as FeCargaDetalleRemision | null | undefined;
  if (!detalle || !detalle.receptor || detalle.items.length === 0) {
    logger.warn({ fe_carga_id: carga.fe_carga_id, orden: comprobante.orden }, "carga masiva: nota de remision sin detalle, no se incorpora");
    return null;
  }
  const { detalle: _detalle, ...sinDetalle } = comprobante;
  const items: FacturaItemPreview[] = detalle.items.map((item, indice) => ({
    line_no: indice + 1,
    codigo: item.codigo?.trim() || null,
    descripcion: item.descripcion ?? "",
    cantidad: Number(item.cantidad ?? 0),
    precio_unitario: 0,
    iva_tipo: "EXENTA",
    subtotal: 0,
    base_imponible: 0,
    iva_monto: 0,
    catalogo_item_id: null
  }));
  return {
    tipo: "NOTA_REMISION",
    ...identidadDeComprobante(carga, comprobante),
    condicionVenta: null,
    cliente: clienteDeFe(detalle.receptor),
    items,
    totals: { ...SIN_MONTOS },
    requestSnapshot: detalle,
    responseSnapshot: { ...sinDetalle }
  };
}

export function comprobanteAFactura(carga: Pick<CargaMasivaRecord, "fe_carga_id">, comprobante: FeCargaComprobante): FacturaDeCarga | null {
  if (!comprobante.document_uuid || !ESTADOS_CON_DOCUMENTO.has(comprobante.estado)) return null;
  // SPEC_DOCUMENTOS_ESCRITORIO_v0.1, fase B1: la nota de remision es su propio documento.
  if (comprobante.tipo_documento === "NOTA_REMISION") return comprobanteANotaRemision(carga, comprobante);
  // RN-05 (SPEC_TOTALES_FE_EN_CARGA_v0.1): los demas tipos todavia no son documentos de FS.
  if (comprobante.tipo_documento && comprobante.tipo_documento !== "FACTURA") {
    logger.warn({ fe_carga_id: carga.fe_carga_id, orden: comprobante.orden, tipo_documento: comprobante.tipo_documento }, "carga masiva: comprobante que no es factura, no se incorpora");
    return null;
  }

  const { detalle } = comprobante;
  if (!detalle || !detalle.receptor || detalle.items.length === 0) {
    logger.warn({ fe_carga_id: carga.fe_carga_id, orden: comprobante.orden }, "carga masiva: comprobante sin detalle, no se incorpora");
    return null;
  }

  const calculado = itemsYTotales(detalle);
  const { items } = calculado;
  const { detalle: _detalle, ...sinDetalle } = comprobante;
  const responseSnapshot: Record<string, unknown> = { ...sinDetalle };
  const t = detalle.totales;
  // RN-01: con los totales de FE no hay calculo propio. RN-02: sin ellos, como hasta ahora.
  const totals: FacturaDeCarga["totals"] = t
    ? {
        subtotal: t.bruto,
        total_sin_iva: t.total - t.iva_total,
        iva_5: t.iva_5,
        iva_10: t.iva_10,
        total_iva: t.iva_total,
        total: t.total,
        descuento: t.descuento,
        ...(t.anticipo > 0 ? { anticipo: t.anticipo } : {})
      }
    : { ...calculado.totals };
  if (requiereNotaCreditoPorReferencia(detalle)) totals.nota_credito_por_referencia = true;

  if (!t && totals.total !== detalle.total) {
    logger.warn(
      { fe_carga_id: carga.fe_carga_id, orden: comprobante.orden, total_fs: totals.total, total_fe: detalle.total },
      "carga masiva: el total calculado difiere del de FE"
    );
    responseSnapshot.total_fe = detalle.total;
  }

  return {
    tipo: "FACTURA",
    ...identidadDeComprobante(carga, comprobante),
    condicionVenta: detalle.condicionOperacion?.tipo === "CREDITO" ? "CREDITO" : "CONTADO",
    cliente: clienteDeFe(detalle.receptor),
    items,
    totals,
    requestSnapshot: detalle,
    responseSnapshot
  };
}

/**
 * Estado que queda en FS (PLAN 6, estados finales). Una factura ANULADA no cambia; una EMITIDA o
 * RECHAZADA solo cambia por otro estado final que FE informe como vigente, asi una sincronizacion
 * atrasada no revierte una cancelacion hecha desde FS.
 */
export function resolverEstadoFactura(actual: DocumentoEstado, factura: Pick<FacturaDeCarga, "estado" | "estadoVigente">): DocumentoEstado {
  if (actual === "ANULADA") return actual;
  if (actual === "EMITIDA" || actual === "RECHAZADA") {
    return factura.estadoVigente && factura.estado !== "PENDIENTE_SIFEN" ? factura.estado : actual;
  }
  return factura.estado;
}
