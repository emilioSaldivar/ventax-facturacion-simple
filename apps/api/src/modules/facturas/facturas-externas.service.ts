import { normalizarCdc, numeroFiscalDelCdc, partesDelCdc, validarCdcFactura } from "@facturacion-simple/shared";
import type { OperationalContextResponse } from "../context/context.types";
import { FiscalGatewayError, type FiscalConsultaDeSifenResponse, type FiscalGateway } from "../fiscal-gateway/fiscal-gateway.types";
import { HttpError } from "../../shared/errors/http-error";
import { logger } from "../../shared/logging/logger";
import { LecturaRdeError, leerFacturaDeRde, type FacturaLeidaDeRde } from "./de-sifen.lectura";
import { getDocumentoById, previewFactura, withAccion } from "./facturas.service";
import type {
  CondicionVenta,
  DocumentoResponse,
  FacturaPreviewInput,
  FacturaRepository,
  FacturaClienteInput,
  ReferenciaImpresa
} from "./facturas.types";
import type { TaxTotals } from "@facturacion-simple/shared";

/**
 * SPEC_NOTA_CREDITO_FACTURA_EXTERNA_v0.1 (PLAN 5). Trae a FS una factura que no emitio FS, para emitir notas de credito
 * sobre ella con el flujo existente: desde SIFEN por CDC (consulta de FE §31, datos del rDE firmado) o cargada a mano
 * (referencia electronica o impresa). La factura queda `FACTURA` `EMITIDA` con `origen`.
 */

const CACHE_MS = 10 * 60 * 1000;
const RETRY_AFTER_MAX_S = 5;
const cacheDeSifen = new Map<string, { leida: FacturaLeidaDeRde; consulta: FiscalConsultaDeSifenResponse; expira: number }>();

export const MENSAJE_SIFEN_CONSULTA_NO_DISPONIBLE = "Este facturador no puede consultar SIFEN. Pedilo a Segel o cargá la factura a mano.";
export const MENSAJE_SIFEN_NO_DISPONIBLE = "No se pudo consultar SIFEN. Reintentá en unos segundos o cargá la factura a mano.";

export interface FacturaExternaPrevia extends FacturaLeidaDeRde {
  cdc: string;
  sifen: FiscalConsultaDeSifenResponse["sifen"];
}

export interface FacturaExternaManualInput extends Omit<FacturaPreviewInput, "condicion_venta"> {
  condicion_venta?: CondicionVenta;
  /** Con referencia electronica, opcional: se toma del CDC. Con impresa, la fecha de la referencia. */
  fecha_emision?: string | null;
  referencia: { tipo: "ELECTRONICO"; cdc: string } | ({ tipo: "IMPRESO" } & ReferenciaImpresa);
}

function hoyAsuncion(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion", year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}

/** RN-01. 400 con el motivo, sin consultar a FE. */
function validarCdc(context: OperationalContextResponse, texto: string): string {
  const invalido = validarCdcFactura(texto, context.facturador.emisor_id);
  if (invalido) {
    throw new HttpError(400, "VALIDATION_ERROR", invalido.mensaje, { reason: invalido.motivo, campo: "cdc" });
  }
  return normalizarCdc(texto);
}

/** D-7: una factura (propia o externa) por CDC; una externa por referencia impresa. */
async function rechazarDuplicada(
  context: OperationalContextResponse,
  repository: FacturaRepository,
  clave: { cdc: string } | { referencia: ReferenciaImpresa }
): Promise<void> {
  const existente =
    "cdc" in clave
      ? await repository.findByCdc({ facturadorId: context.facturador.id, cdc: clave.cdc })
      : await repository.findByReferenciaImpresa({ facturadorId: context.facturador.id, referencia: clave.referencia });
  if (existente) {
    throw new HttpError(409, "CONFLICT", `La factura ${existente.numero_fiscal ?? ""} ya está en el sistema.`.replace("  ", " "), {
      reason: "FACTURA_YA_EXISTE",
      documento_id: existente.id
    });
  }
}

/** RN-02: traduce los errores de §31 a los del operador. */
function errorDeConsulta(error: unknown): HttpError {
  if (error instanceof FiscalGatewayError) {
    const details = (error.details ?? {}) as { status?: number; body?: { error?: string } };
    const codigo = details.body?.error;
    if (details.status === 404 || codigo === "CDC_INEXISTENTE") {
      return new HttpError(409, "CONFLICT", "SIFEN no tiene una factura aprobada con ese CDC. Verificalo con quien la emitió.", {
        reason: "FACTURA_NO_APROBADA"
      });
    }
    if (details.status === 401 || details.status === 403 || codigo === "FORBIDDEN" || codigo === "UNAUTHORIZED" || codigo === "SIN_PERMISO_SIFEN") {
      return new HttpError(409, "CONFLICT", MENSAJE_SIFEN_CONSULTA_NO_DISPONIBLE, { reason: "SIFEN_CONSULTA_NO_DISPONIBLE" });
    }
    if (details.status === 422) {
      return new HttpError(400, "VALIDATION_ERROR", "El servicio fiscal no aceptó el CDC.", { reason: "CDC_FORMATO", fe: details.body ?? null });
    }
  }
  return new HttpError(503, "INTERNAL_ERROR", MENSAJE_SIFEN_NO_DISPONIBLE, { reason: "SIFEN_NO_DISPONIBLE" });
}

async function consultar(gateway: FiscalGateway, cdc: string, emisorId: string): Promise<FiscalConsultaDeSifenResponse> {
  if (!gateway.consultarDeSifen) {
    throw new HttpError(409, "CONFLICT", MENSAJE_SIFEN_CONSULTA_NO_DISPONIBLE, { reason: "SIFEN_CONSULTA_NO_DISPONIBLE" });
  }
  try {
    return await gateway.consultarDeSifen(cdc, emisorId);
  } catch (error) {
    // RN-02: ante 429 se espera Retry-After (tope 5 s) y se reintenta una vez.
    const details = (error instanceof FiscalGatewayError ? error.details : null) as { status?: number; retry_after?: number } | null;
    if (details?.status === 429) {
      const espera = Math.min(details.retry_after ?? 1, RETRY_AFTER_MAX_S);
      await new Promise((resolve) => setTimeout(resolve, espera * 1000));
      try {
        return await gateway.consultarDeSifen(cdc, emisorId);
      } catch (segundo) {
        throw errorDeConsulta(segundo);
      }
    }
    throw errorDeConsulta(error);
  }
}

/** RN-02 y RN-03: consulta (con cache de 10 min por facturador y CDC) y lectura del rDE. */
async function leerDeSifen(context: OperationalContextResponse, cdc: string, gateway: FiscalGateway): Promise<{ leida: FacturaLeidaDeRde; consulta: FiscalConsultaDeSifenResponse }> {
  const clave = `${context.facturador.id}:${cdc}`;
  const guardada = cacheDeSifen.get(clave);
  if (guardada && guardada.expira > Date.now()) return guardada;

  const consulta = await consultar(gateway, cdc, context.facturador.emisor_id);
  if (consulta.estado !== "APROBADO") {
    throw new HttpError(
      409,
      "CONFLICT",
      consulta.estado === "CANCELADO" ? "La factura está cancelada en SIFEN." : "SIFEN no tiene esa factura aprobada.",
      { reason: "FACTURA_NO_APROBADA", estado: consulta.estado }
    );
  }
  let leida: FacturaLeidaDeRde;
  try {
    leida = leerFacturaDeRde(consulta.xml_rde);
  } catch (error) {
    if (error instanceof LecturaRdeError && error.codigo === "IVA_PARCIAL_NO_SOPORTADO") {
      throw new HttpError(409, "CONFLICT", "La factura tiene IVA gravado parcial: todavía no se puede traer al sistema.", { reason: "IVA_PARCIAL_NO_SOPORTADO" });
    }
    logger.warn({ err: error, cdc }, "factura externa: el rDE no se pudo leer");
    throw new HttpError(503, "INTERNAL_ERROR", MENSAJE_SIFEN_NO_DISPONIBLE, { reason: "SIFEN_NO_DISPONIBLE" });
  }
  // RN-03: tipo y emisor en el XML (redundante con RN-01 salvo CDC manipulado).
  const [base, dv] = context.facturador.emisor_id.split("-");
  if (leida.tipo_de !== 1 || leida.emisor.ruc.replace(/^0+/, "") !== (base ?? "").replace(/^0+/, "") || leida.emisor.dv !== dv) {
    throw new HttpError(409, "CONFLICT", "La factura de SIFEN no es de este facturador.", { reason: "FACTURA_NO_PROPIA" });
  }
  const valor = { leida, consulta, expira: Date.now() + CACHE_MS };
  cacheDeSifen.set(clave, valor);
  return valor;
}

/** POST /facturas/externas/sifen/previsualizar: la factura leida, sin guardar. */
export async function previsualizarDeSifen(
  context: OperationalContextResponse,
  cdcTexto: string,
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<FacturaExternaPrevia> {
  const cdc = validarCdc(context, cdcTexto);
  await rechazarDuplicada(context, repository, { cdc });
  const { leida, consulta } = await leerDeSifen(context, cdc, gateway);
  return { ...leida, cdc, sifen: consulta.sifen };
}

/** POST /facturas/externas/sifen: guarda la factura leida del rDE (`origen SIFEN`). */
export async function traerDeSifen(
  context: OperationalContextResponse,
  cdcTexto: string,
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoResponse> {
  const cdc = validarCdc(context, cdcTexto);
  await rechazarDuplicada(context, repository, { cdc });
  const { leida, consulta } = await leerDeSifen(context, cdc, gateway);
  const { exterior: _exterior, ...cliente } = leida.receptor;
  const creada = await repository.createFacturaExterna({
    tenantId: context.tenant.id,
    facturadorId: context.facturador.id,
    userId: context.user.id,
    origen: "SIFEN",
    cdc,
    referenciaImpresa: null,
    numeroFiscal: leida.numero_fiscal,
    fechaEmision: leida.fecha_emision,
    condicionVenta: leida.condicion_venta,
    moneda: leida.moneda,
    tipoCambio: leida.tipo_cambio,
    // D-8: el receptor del exterior se guarda marcado; la NC lo rechaza.
    cliente: (leida.receptor.exterior ? { ...cliente, exterior: true } : cliente) as FacturaClienteInput,
    items: leida.items,
    totals: leida.totals,
    sifenConsulta: { protocolo: consulta.sifen.dProtAut, fecha_proceso: consulta.sifen.dFecProc, consultado_en: new Date().toISOString() }
  });
  cacheDeSifen.delete(`${context.facturador.id}:${cdc}`);
  return withAccion(creada);
}

/** RN-05: formatos de la referencia impresa (FE no los valida antes de numerar). Devuelve la normalizada. */
export function validarReferenciaImpresa(referencia: ReferenciaImpresa, ahora = new Date()): ReferenciaImpresa {
  const normalizada: ReferenciaImpresa = {
    timbrado: referencia.timbrado.trim(),
    establecimiento: referencia.establecimiento.trim().padStart(3, "0"),
    punto: referencia.punto.trim().padStart(3, "0"),
    numero: referencia.numero.trim().padStart(7, "0"),
    fecha: referencia.fecha.trim()
  };
  const errores: Array<{ campo: string; mensaje: string }> = [];
  if (!/^\d{8}$/.test(normalizada.timbrado)) errores.push({ campo: "referencia.timbrado", mensaje: "El timbrado tiene 8 dígitos." });
  if (!/^\d{3}$/.test(normalizada.establecimiento)) errores.push({ campo: "referencia.establecimiento", mensaje: "El establecimiento tiene 3 dígitos." });
  if (!/^\d{3}$/.test(normalizada.punto)) errores.push({ campo: "referencia.punto", mensaje: "El punto de expedición tiene 3 dígitos." });
  if (!/^\d{7}$/.test(normalizada.numero)) errores.push({ campo: "referencia.numero", mensaje: "El número tiene hasta 7 dígitos." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizada.fecha) || Number.isNaN(Date.parse(normalizada.fecha))) {
    errores.push({ campo: "referencia.fecha", mensaje: "Indicá la fecha de la factura." });
  } else if (normalizada.fecha > hoyAsuncion(ahora)) {
    errores.push({ campo: "referencia.fecha", mensaje: "La fecha de la factura no puede ser futura." });
  }
  if (errores.length > 0) {
    throw new HttpError(400, "VALIDATION_ERROR", errores[0]!.mensaje, { errores });
  }
  return normalizada;
}

/** POST /facturas/externas/manual (`origen MANUAL`). Totales calculados por FS como en Nueva factura. */
export async function cargarManual(
  context: OperationalContextResponse,
  input: FacturaExternaManualInput,
  repository: FacturaRepository,
  ahora = new Date()
): Promise<DocumentoResponse> {
  let cdc: string | null = null;
  let referencia: ReferenciaImpresa | null = null;
  let numeroFiscal: string;
  let fechaEmision = input.fecha_emision ?? "";
  if (input.referencia.tipo === "ELECTRONICO") {
    cdc = validarCdc(context, input.referencia.cdc);
    numeroFiscal = numeroFiscalDelCdc(cdc)!;
    fechaEmision = input.fecha_emision || partesDelCdc(cdc)!.fecha;
    await rechazarDuplicada(context, repository, { cdc });
  } else {
    const { tipo: _tipo, ...impresa } = input.referencia;
    referencia = validarReferenciaImpresa(impresa, ahora);
    numeroFiscal = `${referencia.establecimiento}-${referencia.punto}-${referencia.numero}`;
    fechaEmision = referencia.fecha;
    await rechazarDuplicada(context, repository, { referencia });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaEmision) || fechaEmision > hoyAsuncion(ahora)) {
    throw new HttpError(400, "VALIDATION_ERROR", "Indicá una fecha de factura que no sea futura.", { campo: "fecha_emision" });
  }
  const condicion = input.condicion_venta ?? "CONTADO";
  const preview = previewFactura(context, { ...input, condicion_venta: condicion } as FacturaPreviewInput);
  // D-5: base por tasa para la nota por monto (sin /totales de FE). FS ya calcula base e IVA por linea.
  const porTasa = preview.items.reduce(
    (acc, item) => {
      if (item.iva_tipo === "IVA_10") acc.gravada_10 += item.base_imponible;
      else if (item.iva_tipo === "IVA_5") acc.gravada_5 += item.base_imponible;
      else acc.exenta += item.subtotal;
      return acc;
    },
    { gravada_10: 0, gravada_5: 0, exenta: 0 }
  );
  const redondear = (valor: number) => Math.round(valor * 100) / 100;
  const { nota_credito_por_referencia: _ref, ...totalsSinReferencia } = preview.totals;
  const totals: TaxTotals = {
    ...totalsSinReferencia,
    gravada_10: redondear(porTasa.gravada_10),
    gravada_5: redondear(porTasa.gravada_5),
    exenta: redondear(porTasa.exenta),
    exonerada: 0,
    fuente: "MANUAL"
  };
  const creada = await repository.createFacturaExterna({
    tenantId: context.tenant.id,
    facturadorId: context.facturador.id,
    userId: context.user.id,
    origen: "MANUAL",
    cdc,
    referenciaImpresa: referencia,
    numeroFiscal,
    fechaEmision,
    condicionVenta: condicion,
    moneda: input.moneda ?? "PYG",
    tipoCambio: input.tipo_cambio ?? null,
    cliente: input.cliente,
    items: preview.items,
    totals,
    sifenConsulta: null
  });
  return withAccion(creada);
}

/** DELETE /facturas/externas/:id (RN-09): solo externas sin notas de credito. */
export async function eliminarExterna(context: OperationalContextResponse, documentoId: string, repository: FacturaRepository): Promise<void> {
  const documento = await getDocumentoById(context, documentoId, repository);
  if (!documento.origen) {
    throw new HttpError(409, "CONFLICT", "Solo se puede eliminar una factura externa.", { reason: "NO_ES_EXTERNA" });
  }
  const borrada = await repository.softDeleteFacturaExterna({ facturadorId: context.facturador.id, documentoId });
  if (!borrada) {
    throw new HttpError(409, "CONFLICT", "La factura tiene notas de crédito: no se puede eliminar.", { reason: "EXTERNA_CON_NOTAS" });
  }
}

/** Solo para pruebas. */
export function __limpiarCacheDeSifen(): void {
  cacheDeSifen.clear();
}
