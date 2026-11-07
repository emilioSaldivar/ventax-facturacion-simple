import { calculateDocumentTotals, calculateTaxLine, type TaxInputLine } from "@facturacion-simple/shared";
import { logger } from "../../shared/logging/logger";
import { documentoIdentidadTipos, type DocumentoIdentidadTipo } from "../clientes/clientes.types";
import type { DocumentoEstado, FacturaClienteInput, FacturaItemPreview } from "../facturas/facturas.types";
import { mapDocumentStatusCanonico } from "../fiscal-gateway/fiscal-gateway.client";
import type { FeCargaComprobante, FeCargaEstado } from "../fiscal-gateway/fiscal-gateway.types";
import type { CargaMasivaRecord, FacturaDeCarga } from "./cargas.types";

const MINUTO = 60_000;
const SIN_TERMINAR_MS = 72 * 60 * MINUTO;

export function externalRefDeCarga(feCargaId: string, orden: number): string {
  return `carga:${feCargaId}:${orden}`;
}

const ESTADOS_CON_DOCUMENTO = new Set(["PREPARADO", "ENVIADO", "APROBADO", "APROBADO_CON_OBS", "RECHAZADO"]);

/** Estados en los que hay comprobantes que pueden tener `document_uuid` (PLAN 6, paso 3). */
export function cargaTieneDocumentos(estado: FeCargaEstado): boolean {
  return estado === "EN_PREPARACION" || estado === "EN_SIFEN" || estado === "FINALIZADA" || estado === "CANCELADA";
}

/** Espera hasta la proxima sincronizacion. Nulo: la carga no cambia sola (PLAN 6, frecuencia). */
export function proximaSincronizacionMs(estado: FeCargaEstado, confirmadaEn: string | null | undefined, ahora = Date.now()): number | null {
  switch (estado) {
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
export function comprobanteAFactura(carga: Pick<CargaMasivaRecord, "fe_carga_id">, comprobante: FeCargaComprobante): FacturaDeCarga | null {
  if (!comprobante.document_uuid || !ESTADOS_CON_DOCUMENTO.has(comprobante.estado)) return null;

  const { detalle } = comprobante;
  if (!detalle || !detalle.receptor || detalle.items.length === 0) {
    logger.warn({ fe_carga_id: carga.fe_carga_id, orden: comprobante.orden }, "carga masiva: comprobante sin detalle, no se incorpora");
    return null;
  }

  const desdeEmision = estadoDesdeComprobante(comprobante);
  const vigente = mapDocumentStatusCanonico(comprobante.documento_estado);
  const { items, totals } = itemsYTotales(detalle);
  const { detalle: _detalle, ...sinDetalle } = comprobante;
  const responseSnapshot: Record<string, unknown> = { ...sinDetalle };

  if (totals.total !== detalle.total) {
    logger.warn(
      { fe_carga_id: carga.fe_carga_id, orden: comprobante.orden, total_fs: totals.total, total_fe: detalle.total },
      "carga masiva: el total calculado difiere del de FE"
    );
    responseSnapshot.total_fe = detalle.total;
  }

  return {
    externalRef: externalRefDeCarga(carga.fe_carga_id, comprobante.orden),
    documentUuid: comprobante.document_uuid,
    estado: vigente ?? desdeEmision.estado,
    estadoVigente: vigente !== null,
    fiscalStatusRaw: comprobante.documento_estado ?? desdeEmision.raw,
    sifenCodigo: comprobante.sifen?.codigo ?? null,
    sifenMensaje: comprobante.sifen?.mensaje ?? null,
    cdc: comprobante.cdc,
    numeroFiscal: comprobante.numero_asignado,
    numeroArchivo: comprobante.numero_archivo,
    emailEstado: comprobante.correo,
    aprobadoEn: comprobante.aprobado_en,
    actualizadoEn: comprobante.actualizado_en,
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
