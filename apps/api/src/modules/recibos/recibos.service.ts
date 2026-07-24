import crypto from "node:crypto";
import { HttpError } from "../../shared/errors/http-error.js";
import {
  FiscalGatewayError,
  type FiscalGateway,
  type ReciboPagadorDocumentoTipo
} from "../fiscal-gateway/fiscal-gateway.types.js";
import type { OperationalContextResponse } from "../context/context.types.js";
import type {
  ReciboRecord,
  ReciboAnularInput,
  ReciboCreateInput,
  ReciboListFilters,
  ReciboListResponse,
  ReciboUpdateInput,
  RecibosRepository,
} from "./recibos.types.js";

function buildReciboExternalRef(facturadorId: string, idempotencyKey?: string): string {
  return idempotencyKey
    ? `rec_${crypto.createHash("sha256").update(`${facturadorId}:${idempotencyKey}`).digest("hex").slice(0, 32)}`
    : `rec_${crypto.randomUUID()}`;
}

/**
 * Traduce un error del backend fiscal (Recibos de Dinero Firmados Digitalmente,
 * ver SPEC_RECIBO_DINERO_v0.5.md seccion 8) a un HttpError propio.
 */
function mapFiscalGatewayError(error: unknown, accion: string): HttpError {
  if (!(error instanceof FiscalGatewayError)) {
    throw error instanceof Error ? error : new Error(String(error));
  }

  if (error.code === "TIMEOUT") {
    return new HttpError(504, "INTERNAL_ERROR", `Tiempo de espera agotado al ${accion}.`, { gateway_code: error.code });
  }

  const details = error.details && typeof error.details === "object" ? (error.details as Record<string, unknown>) : {};
  const body = details.body && typeof details.body === "object" ? (details.body as Record<string, unknown>) : {};
  const businessCode = typeof body.error === "string" ? body.error : null;

  switch (businessCode) {
    case "RECIBO_NOT_FOUND":
      return new HttpError(404, "NOT_FOUND", "Recibo no encontrado.");
    case "RECIBO_NOT_EDITABLE":
      return new HttpError(409, "CONFLICT", "No se puede modificar un recibo ya emitido.");
    case "RECIBO_NOT_DELETABLE":
      return new HttpError(409, "CONFLICT", "No se puede eliminar un recibo ya emitido.");
    case "RECIBO_NOT_EMITTABLE":
      return new HttpError(409, "CONFLICT", "El recibo no esta en borrador o hubo una emision concurrente.");
    case "RECIBO_NOT_ANULABLE":
      return new HttpError(409, "CONFLICT", "Solo se puede anular un recibo emitido.");
    case "RECIBO_ALREADY_ANULADO":
      return new HttpError(409, "CONFLICT", "El recibo ya fue anulado.");
    case "CERTIFICATE_NOT_FOUND":
    case "CERTIFICATE_EXPIRED":
      return new HttpError(422, "VALIDATION_ERROR", "El facturador no tiene certificado digital valido cargado; contactar soporte.");
    case "INVALID_DOCUMENT_REFERENCE":
      return new HttpError(422, "VALIDATION_ERROR", "La factura referenciada no existe o no pertenece a este facturador.");
    default:
      return new HttpError(502, "INTERNAL_ERROR", `Backend fiscal rechazo ${accion}.`, {
        gateway_code: error.code,
        details: error.details ?? null
      });
  }
}

function buildFiscalCrearReciboRequest(
  context: OperationalContextResponse,
  input: ReciboCreateInput,
  externalRef: string,
  idempotencyKey?: string
) {
  return {
    emisor_id: context.facturador.emisor_id,
    fecha_cobro: input.fecha_cobro,
    pagador_nombre: input.pagador_nombre,
    pagador_documento_tipo: (input.pagador_documento_tipo ?? null) as ReciboPagadorDocumentoTipo,
    pagador_documento: input.pagador_documento ?? null,
    concepto: input.concepto,
    importe: input.importe,
    moneda: input.moneda ?? "PYG",
    forma_pago: input.forma_pago ?? "EFECTIVO",
    referencia_bancaria: input.referencia_bancaria ?? null,
    referencia_documento_uuid: input.referencia_documento_uuid ?? null,
    referencia_documento_numero_display: input.referencia_documento_numero_display ?? null,
    ...(idempotencyKey ? { client_reference: { idempotency_key: externalRef } } : {})
  };
}

export async function crearRecibo(
  context: OperationalContextResponse,
  input: ReciboCreateInput,
  repository: RecibosRepository,
  gateway: FiscalGateway,
  options: { idempotencyKey?: string } = {}
): Promise<ReciboRecord> {
  if (!input.pagador_nombre?.trim()) {
    throw new HttpError(400, "VALIDATION_ERROR", "El nombre del pagador es requerido.");
  }
  if (!input.concepto?.trim()) {
    throw new HttpError(400, "VALIDATION_ERROR", "El concepto es requerido.");
  }
  if (!input.importe || input.importe <= 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "El importe debe ser mayor a cero.");
  }

  if (options.idempotencyKey) {
    const existing = await repository.findByIdempotencyKey(context.facturador.id, options.idempotencyKey);
    if (existing) return existing;
  }

  const externalRef = buildReciboExternalRef(context.facturador.id, options.idempotencyKey);
  const fiscalRequest = buildFiscalCrearReciboRequest(context, input, externalRef, options.idempotencyKey);

  try {
    const fiscalResult = await gateway.crearRecibo(fiscalRequest);
    return repository.upsertFromFiscal({
      facturadorId: context.facturador.id,
      fiscal: fiscalResult,
      referenciaDocumentoUuid: input.referencia_documento_uuid ?? null,
      externalRef,
      idempotencyKey: options.idempotencyKey ?? null,
      fiscalRequestSnapshot: fiscalRequest
    });
  } catch (error) {
    throw mapFiscalGatewayError(error, "crear el recibo");
  }
}

export async function getRecibo(
  id: string,
  facturadorId: string,
  repository: RecibosRepository
): Promise<ReciboRecord> {
  const recibo = await repository.findById(id, facturadorId);
  if (!recibo) throw new HttpError(404, "NOT_FOUND", "Recibo no encontrado.");
  return recibo;
}

export async function listRecibos(
  facturadorId: string,
  filters: ReciboListFilters,
  repository: RecibosRepository
): Promise<ReciboListResponse> {
  return repository.list(facturadorId, filters);
}

export async function editarRecibo(
  id: string,
  context: OperationalContextResponse,
  input: ReciboUpdateInput,
  repository: RecibosRepository,
  gateway: FiscalGateway
): Promise<ReciboRecord> {
  const existing = await getRecibo(id, context.facturador.id, repository);
  if (existing.estado !== "BORRADOR") {
    throw new HttpError(409, "CONFLICT", "No se puede modificar un recibo ya emitido.");
  }
  if (input.importe !== undefined && input.importe <= 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "El importe debe ser mayor a cero.");
  }

  try {
    const fiscalResult = await gateway.editarRecibo({
      reciboId: id,
      patch: {
        fecha_cobro: input.fecha_cobro,
        pagador_nombre: input.pagador_nombre,
        pagador_documento_tipo: input.pagador_documento_tipo as ReciboPagadorDocumentoTipo | undefined,
        pagador_documento: input.pagador_documento,
        concepto: input.concepto,
        importe: input.importe,
        moneda: input.moneda,
        forma_pago: input.forma_pago,
        referencia_bancaria: input.referencia_bancaria
      }
    });
    return repository.upsertFromFiscal({ facturadorId: context.facturador.id, fiscal: fiscalResult });
  } catch (error) {
    throw mapFiscalGatewayError(error, "editar el recibo");
  }
}

export async function eliminarRecibo(
  id: string,
  context: OperationalContextResponse,
  repository: RecibosRepository,
  gateway: FiscalGateway
): Promise<void> {
  const existing = await getRecibo(id, context.facturador.id, repository);
  if (existing.estado !== "BORRADOR") {
    throw new HttpError(409, "CONFLICT", "No se puede eliminar un recibo ya emitido.");
  }

  try {
    await gateway.eliminarRecibo({ reciboId: id });
  } catch (error) {
    throw mapFiscalGatewayError(error, "eliminar el recibo");
  }
  await repository.markDeleted(id, context.facturador.id);
}

export async function emitirRecibo(
  id: string,
  context: OperationalContextResponse,
  repository: RecibosRepository,
  gateway: FiscalGateway
): Promise<ReciboRecord> {
  const existing = await getRecibo(id, context.facturador.id, repository);
  if (existing.estado !== "BORRADOR") {
    throw new HttpError(409, "CONFLICT", "El recibo no esta en borrador o hubo una emision concurrente.");
  }

  try {
    const fiscalResult = await gateway.emitirRecibo({ reciboId: id });
    return repository.upsertFromFiscal({ facturadorId: context.facturador.id, fiscal: fiscalResult });
  } catch (error) {
    throw mapFiscalGatewayError(error, "emitir el recibo");
  }
}

export async function anularRecibo(
  id: string,
  context: OperationalContextResponse,
  input: ReciboAnularInput,
  repository: RecibosRepository,
  gateway: FiscalGateway
): Promise<ReciboRecord> {
  const existing = await getRecibo(id, context.facturador.id, repository);
  if (existing.estado === "BORRADOR") {
    throw new HttpError(409, "CONFLICT", "Solo se puede anular un recibo emitido.");
  }
  if (existing.estado === "ANULADO") {
    throw new HttpError(409, "CONFLICT", "El recibo ya fue anulado.");
  }

  try {
    const fiscalResult = await gateway.anularRecibo({ reciboId: id, motivo: input.motivo });
    return repository.upsertFromFiscal({ facturadorId: context.facturador.id, fiscal: fiscalResult });
  } catch (error) {
    throw mapFiscalGatewayError(error, "anular el recibo");
  }
}

export async function getReciboPdf(
  id: string,
  context: OperationalContextResponse,
  repository: RecibosRepository,
  gateway: FiscalGateway
) {
  await getRecibo(id, context.facturador.id, repository);
  try {
    return await gateway.getReciboPdf({ reciboId: id });
  } catch (error) {
    throw mapFiscalGatewayError(error, "descargar el PDF del recibo");
  }
}

export async function getReciboXml(
  id: string,
  context: OperationalContextResponse,
  repository: RecibosRepository,
  gateway: FiscalGateway
) {
  const existing = await getRecibo(id, context.facturador.id, repository);
  if (existing.estado === "BORRADOR") {
    throw new HttpError(404, "NOT_FOUND", "El recibo aun no fue emitido.");
  }
  try {
    return await gateway.getReciboXml({ reciboId: id });
  } catch (error) {
    throw mapFiscalGatewayError(error, "descargar el XML del recibo");
  }
}

export interface ReciboVerificacionResult {
  valido: boolean;
  numero?: number | null;
  fecha_cobro?: string;
  pagador_nombre?: string;
  concepto?: string;
  importe?: number;
  forma_pago?: ReciboRecord["forma_pago"];
  referencia_documento_numero_display?: string | null;
  estado?: ReciboRecord["estado"];
  emitido_at?: string | null;
}

/**
 * Combina el estado/validez legal real (fuente: facturacion-electronica) con los
 * datos comerciales que ya tenemos en cache local — ver SPEC_RECIBO_DINERO_v0.5.md
 * seccion 7. Si el backend fiscal no puede consultarse, no se expone informacion
 * comercial (fail-closed).
 */
export async function verificarRecibo(
  token: string,
  repository: RecibosRepository,
  gateway: FiscalGateway
): Promise<ReciboVerificacionResult> {
  const fiscalResult = await gateway.verificarRecibo(token);
  if (!fiscalResult.valido) {
    return { valido: false };
  }

  const cached = await repository.findByVerificationToken(token);
  if (!cached) {
    return { valido: true, estado: fiscalResult.estado, emitido_at: fiscalResult.firmado_en ?? null };
  }

  return {
    valido: true,
    numero: cached.numero,
    fecha_cobro: cached.fecha_cobro,
    pagador_nombre: cached.pagador_nombre,
    concepto: cached.concepto,
    importe: cached.importe,
    forma_pago: cached.forma_pago,
    referencia_documento_numero_display: cached.referencia_documento_numero_display,
    estado: fiscalResult.estado ?? cached.estado,
    emitido_at: fiscalResult.firmado_en ?? cached.emitido_at
  };
}
