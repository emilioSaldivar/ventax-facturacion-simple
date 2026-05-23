import crypto from "node:crypto";
import { calculateDocumentTotals, type TaxInputLine } from "@facturacion-simple/shared";
import { HttpError } from "../../shared/errors/http-error";
import type { ClienteRepository, ClienteResponse } from "../clientes/clientes.types";
import type { OperationalContextResponse } from "../context/context.types";
import {
  FiscalGatewayError,
  type FiscalGateway,
  type FiscalEmitFacturaRequest,
  type FiscalEmitFacturaResponse,
  type FiscalEmitNotaCreditoRequest,
  type FiscalEmitNotaCreditoResponse
} from "../fiscal-gateway/fiscal-gateway.types";
import type {
  DocumentoListFilters,
  DocumentoListResponse,
  DocumentoEstado,
  DocumentoResponse,
  FacturaItemPreview,
  FacturaPreviewInput,
  FacturaPreviewResponse,
  FacturaRepository,
  NotaCreditoCandidateListResponse
} from "./facturas.types";

export function previewFactura(
  _context: OperationalContextResponse,
  input: FacturaPreviewInput
): FacturaPreviewResponse {
  validateCliente(input);

  const taxLines: TaxInputLine[] = input.items.map((item) => {
    const descripcion = item.descripcion.trim();
    if (!descripcion) {
      throw new HttpError(400, "VALIDATION_ERROR", "Descripcion de item requerida.");
    }

    return {
      codigo: item.codigo?.trim() || null,
      descripcion,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      iva_tipo: item.iva_tipo ?? "IVA_10"
    };
  });

  try {
    const calculated = calculateDocumentTotals(taxLines);
    const items: FacturaItemPreview[] = calculated.items.map((item, index) => ({
      ...item,
      catalogo_item_id: input.items[index]?.catalogo_item_id?.trim() || null
    }));

    return {
      items,
      totals: calculated.totals
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new HttpError(400, "VALIDATION_ERROR", error.message);
    }
    throw error;
  }
}

function validateCliente(input: FacturaPreviewInput): void {
  if (!input.cliente.documento.trim()) {
    throw new HttpError(400, "VALIDATION_ERROR", "Documento de cliente requerido.");
  }

  if (!input.cliente.razon_social.trim()) {
    throw new HttpError(400, "VALIDATION_ERROR", "Razon social de cliente requerida.");
  }
}

async function resolveFacturaInputCliente(
  context: OperationalContextResponse,
  input: FacturaPreviewInput,
  clienteRepository?: ClienteRepository
): Promise<FacturaPreviewInput> {
  const clienteId = input.cliente.cliente_id?.trim();

  if (!clienteId || !clienteRepository) {
    return input;
  }

  const agendaCliente = await clienteRepository.findByIdForFacturador({
    clienteId,
    facturadorId: context.facturador.id
  });

  if (!agendaCliente) {
    throw new HttpError(404, "NOT_FOUND", "Cliente no encontrado en la agenda del facturador.");
  }

  return {
    ...input,
    cliente: {
      ...input.cliente,
      direccion: firstNonBlank(input.cliente.direccion, agendaCliente.direccion),
      telefono: firstNonBlank(input.cliente.telefono, agendaCliente.telefono),
      email: firstNonBlank(input.cliente.email, agendaCliente.email)
    }
  };
}

function firstNonBlank(primary: string | null | undefined, fallback: ClienteResponse["email"]): string | null {
  const normalized = primary?.trim();
  if (normalized) {
    return normalized;
  }
  return fallback?.trim() || null;
}

export async function listDocumentos(
  context: OperationalContextResponse,
  filters: DocumentoListFilters,
  repository: FacturaRepository
): Promise<DocumentoListResponse> {
  return repository.list({
    facturadorId: context.facturador.id,
    filters
  });
}

export async function listNotaCreditoCandidates(
  context: OperationalContextResponse,
  filters: Pick<DocumentoListFilters, "q" | "limit" | "offset">,
  repository: FacturaRepository
): Promise<NotaCreditoCandidateListResponse> {
  const result = await repository.list({
    facturadorId: context.facturador.id,
    filters: {
      q: filters.q,
      limit: filters.limit,
      offset: filters.offset,
      tipo: "FACTURA"
    }
  });

  const relatedResult = await repository.list({
    facturadorId: context.facturador.id,
    filters: {
      limit: 100,
      offset: 0,
      tipo: "NOTA_CREDITO"
    }
  });
  const creditedFacturaIds = new Set(
    relatedResult.items.map((item) => item.documento_relacionado_id).filter((id): id is string => Boolean(id))
  );

  return {
    total: result.total,
    items: result.items.map((documento) => {
      const motivo = getNotaCreditoIneligibility(documento, creditedFacturaIds);
      return {
        documento,
        elegible: motivo === null,
        motivo_no_elegible: motivo
      };
    })
  };
}

function getNotaCreditoIneligibility(documento: DocumentoResponse, creditedFacturaIds: Set<string>): string | null {
  if (documento.tipo !== "FACTURA") {
    return "Solo una factura puede originar nota de credito.";
  }
  if (documento.estado !== "EMITIDA") {
    return "La factura debe estar emitida.";
  }
  if (!documento.cdc) {
    return "La factura no tiene CDC confirmado.";
  }
  if (creditedFacturaIds.has(documento.id)) {
    return "La factura ya tiene una nota de credito total.";
  }
  return null;
}

export async function getDocumentoById(
  context: OperationalContextResponse,
  documentoId: string,
  repository: FacturaRepository
): Promise<DocumentoResponse> {
  const documento = await repository.findById({
    facturadorId: context.facturador.id,
    documentoId
  });

  if (!documento) {
    throw new HttpError(404, "NOT_FOUND", "Documento no encontrado.");
  }

  return documento;
}

export async function refreshDocumentoStatus(
  context: OperationalContextResponse,
  documentoId: string,
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoResponse> {
  const documento = await getDocumentoById(context, documentoId, repository);

  if (!documento.cdc) {
    throw new HttpError(409, "CONFLICT", "Documento sin CDC fiscal para refrescar estado.");
  }

  try {
    const refreshed = await gateway.refreshFacturaStatus({ cdc: documento.cdc });
    const updated = await repository.updateFiscalStatus({
      facturadorId: context.facturador.id,
      documentoId,
      estado: refreshed.estado,
      fiscalStatus: mergeFiscalStatus(documento.fiscal_status, refreshed.raw)
    });

    if (!updated) {
      throw new HttpError(404, "NOT_FOUND", "Documento no encontrado.");
    }

    return updated;
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      throw new HttpError(
        error.code === "TIMEOUT" ? 504 : 502,
        "INTERNAL_ERROR",
        error.code === "TIMEOUT" ? "Timeout al refrescar estado fiscal." : "No se pudo refrescar estado fiscal.",
        {
          gateway_code: error.code,
          details: error.details ?? null
        }
      );
    }
    throw error;
  }
}

export async function retryDocumentoEmission(
  context: OperationalContextResponse,
  documentoId: string,
  repository: FacturaRepository
): Promise<DocumentoResponse> {
  const documento = await getDocumentoById(context, documentoId, repository);

  if (!["PENDIENTE_SIFEN", "ERROR_TEMPORAL"].includes(documento.estado)) {
    throw new HttpError(409, "CONFLICT", "Solo documentos con error temporal o pendiente SIFEN pueden reintentarse.");
  }

  const retried = await repository.retryPendingEmission({
    facturadorId: context.facturador.id,
    documentoId,
    requestedBy: context.user.id
  });

  if (!retried) {
    throw new HttpError(409, "CONFLICT", "El documento no tiene una emision fiscal recuperable en cola.");
  }

  return retried;
}

export async function cancelDocumento(
  context: OperationalContextResponse,
  documentoId: string,
  input: { motivo: string },
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoResponse> {
  const motivo = input.motivo.trim();
  if (!motivo) {
    throw new HttpError(400, "VALIDATION_ERROR", "Motivo de cancelacion requerido.");
  }

  const documento = await getDocumentoById(context, documentoId, repository);

  if (documento.tipo !== "FACTURA" || documento.estado !== "EMITIDA" || !documento.cdc) {
    throw new HttpError(409, "CONFLICT", "Documento no elegible para cancelacion.");
  }

  try {
    const cancelled = await gateway.cancelFactura({
      emisor_id: context.facturador.emisor_id,
      cdc: documento.cdc,
      motivo
    });

    const updated = await repository.cancelDocumento({
      facturadorId: context.facturador.id,
      documentoId,
      requestedBy: context.user.id,
      estado: cancelled.estado,
      fiscalStatus: {
        ...cancelled.raw,
        event_id: cancelled.event_id,
        cancelacion_motivo: motivo
      }
    });

    if (!updated) {
      throw new HttpError(404, "NOT_FOUND", "Documento no encontrado.");
    }

    return updated;
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      throw new HttpError(
        error.code === "TIMEOUT" ? 504 : 502,
        "INTERNAL_ERROR",
        error.code === "TIMEOUT" ? "Timeout al cancelar documento fiscal." : "No se pudo cancelar documento fiscal.",
        {
          gateway_code: error.code,
          details: error.details ?? null
        }
      );
    }
    throw error;
  }
}

export async function emitNotaCreditoTotal(
  context: OperationalContextResponse,
  facturaId: string,
  input: { motivo: string },
  repository: FacturaRepository,
  gateway: FiscalGateway,
  options: { idempotencyKey?: string } = {}
): Promise<DocumentoResponse> {
  const motivo = input.motivo.trim();
  if (!motivo) {
    throw new HttpError(400, "VALIDATION_ERROR", "Motivo de nota de credito requerido.");
  }

  if (options.idempotencyKey) {
    const existing = await repository.findByIdempotencyKey({
      facturadorId: context.facturador.id,
      idempotencyKey: options.idempotencyKey
    });

    if (existing) {
      return existing;
    }
  }

  const original = await getDocumentoById(context, facturaId, repository);
  if (original.tipo !== "FACTURA" || original.estado !== "EMITIDA" || !original.cdc) {
    throw new HttpError(409, "CONFLICT", "Factura no elegible para nota de credito.");
  }

  const existingByOriginal = await repository.findNotaCreditoByOriginal({
    facturadorId: context.facturador.id,
    documentoId: facturaId
  });
  if (existingByOriginal) {
    throw new HttpError(409, "CONFLICT", "La factura ya tiene una nota de credito total.");
  }

  const externalRef = buildNotaCreditoExternalRef(context, facturaId, options.idempotencyKey);
  const fiscalRequest = buildFiscalNotaCreditoRequest(context, original, motivo, externalRef);
  let fiscalResponse: FiscalEmitNotaCreditoResponse | null = null;
  let fiscalError: Record<string, unknown> | null = null;
  let estado: DocumentoEstado = "EMITIENDO";

  try {
    fiscalResponse = await gateway.emitNotaCredito(fiscalRequest);
    estado = fiscalResponse.estado;
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      estado = error.code === "TIMEOUT" ? "PENDIENTE_SIFEN" : "ERROR_TEMPORAL";
      fiscalError = {
        code: error.code,
        message: error.message,
        details: error.details ?? null,
        recoverable: true,
        suggested_action: error.code === "TIMEOUT" ? "REFRESH_OR_CONTACT_SUPPORT" : "RETRY_NCE"
      };
    } else {
      throw error;
    }
  }

  return repository.createNotaCreditoFromFactura({
    tenantId: context.tenant.id,
    facturadorId: context.facturador.id,
    userId: context.user.id,
    original,
    motivo,
    externalRef,
    idempotencyKey: options.idempotencyKey,
    fiscalRequest,
    fiscalResponse,
    fiscalError,
    estado
  });
}

export async function emitFacturaAgainstFiscalGateway(
  context: OperationalContextResponse,
  input: FacturaPreviewInput,
  repository: FacturaRepository,
  gateway: FiscalGateway,
  options: { idempotencyKey?: string; clienteRepository?: ClienteRepository } = {}
): Promise<DocumentoResponse> {
  if (options.idempotencyKey) {
    const existing = await repository.findByIdempotencyKey({
      facturadorId: context.facturador.id,
      idempotencyKey: options.idempotencyKey
    });

    if (existing) {
      return existing;
    }
  }

  const resolvedInput = await resolveFacturaInputCliente(context, input, options.clienteRepository);
  const preview = previewFactura(context, resolvedInput);
  const externalRef = buildExternalRef(context, options.idempotencyKey);
  const fiscalRequest = buildFiscalEmitRequest(context, resolvedInput, preview, externalRef);

  let fiscalResponse: FiscalEmitFacturaResponse | null = null;
  let fiscalError: Record<string, unknown> | null = null;
  let estado: DocumentoEstado = "EMITIENDO";

  try {
    fiscalResponse = await gateway.emitFactura(fiscalRequest);
    estado = fiscalResponse.estado;
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      estado = error.code === "TIMEOUT" ? "PENDIENTE_SIFEN" : "ERROR_TEMPORAL";
      fiscalError = {
        code: error.code,
        message: error.message,
        details: error.details ?? null
      };
    } else {
      throw error;
    }
  }

  return repository.createFromEmission({
    tenantId: context.tenant.id,
    facturadorId: context.facturador.id,
    userId: context.user.id,
    externalRef,
    idempotencyKey: options.idempotencyKey,
    input: resolvedInput,
    preview,
    fiscalRequest: fiscalRequest as unknown as Record<string, unknown>,
    fiscalResponse,
    fiscalError,
    estado
  });
}

export async function enqueueFacturaEmission(
  context: OperationalContextResponse,
  input: FacturaPreviewInput,
  repository: FacturaRepository,
  options: { idempotencyKey?: string; clienteRepository?: ClienteRepository } = {}
): Promise<DocumentoResponse> {
  if (options.idempotencyKey) {
    const existing = await repository.findByIdempotencyKey({
      facturadorId: context.facturador.id,
      idempotencyKey: options.idempotencyKey
    });

    if (existing) {
      return existing;
    }
  }

  const resolvedInput = await resolveFacturaInputCliente(context, input, options.clienteRepository);
  const preview = previewFactura(context, resolvedInput);
  const externalRef = buildExternalRef(context, options.idempotencyKey);
  const fiscalRequest = buildFiscalEmitRequest(context, resolvedInput, preview, externalRef);

  return repository.createQueuedEmission({
    tenantId: context.tenant.id,
    facturadorId: context.facturador.id,
    userId: context.user.id,
    externalRef,
    idempotencyKey: options.idempotencyKey,
    input: resolvedInput,
    preview,
    fiscalRequest
  });
}

export async function processNextQueuedFiscalEmission(
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoResponse | null> {
  const pending = await repository.claimNextPendingEmission();
  if (!pending) {
    return null;
  }

  try {
    const response = await gateway.emitFactura(pending.fiscalRequest);
    return repository.completePendingEmission({
      outboxId: pending.outboxId,
      documentoId: pending.documentoId,
      response
    });
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      const retryAfterSeconds = 60;
      return repository.failPendingEmission({
        outboxId: pending.outboxId,
        documentoId: pending.documentoId,
        estado: error.code === "TIMEOUT" ? "PENDIENTE_SIFEN" : "ERROR_TEMPORAL",
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? null,
          recoverable: true,
          retry_after_seconds: retryAfterSeconds,
          suggested_action: error.code === "TIMEOUT" ? "REFRESH_OR_RETRY" : "RETRY_EMISSION"
        },
        retryAfterSeconds
      });
    }
    throw error;
  }
}

function buildFiscalEmitRequest(
  context: OperationalContextResponse,
  input: FacturaPreviewInput,
  preview: FacturaPreviewResponse,
  externalRef: string
): FiscalEmitFacturaRequest {
  return {
    external_ref: externalRef,
    condicion_venta: input.condicion_venta,
    tipo_transaccion: input.tipo_transaccion ?? 2,
    facturador: context.facturador,
    fiscal_context: {
      ...context.fiscal_context,
      credito_plazo_dias: input.credito_plazo_dias ?? context.fiscal_context.credito_plazo_dias,
      fiscal_envio_modo: context.fiscal_context.fiscal_envio_modo ?? "BATCH",
      batch_enabled: context.fiscal_context.batch_enabled ?? true
    },
    cliente: input.cliente,
    items: preview.items,
    totals: preview.totals
  };
}

function buildFiscalNotaCreditoRequest(
  context: OperationalContextResponse,
  original: DocumentoResponse,
  motivo: string,
  externalRef: string
): FiscalEmitNotaCreditoRequest {
  if (!original.cdc) {
    throw new HttpError(409, "CONFLICT", "Factura sin CDC fiscal para nota de credito.");
  }

  return {
    external_ref: externalRef,
    facturador: context.facturador,
    fiscal_context: {
      ...context.fiscal_context,
      fiscal_envio_modo: context.fiscal_context.fiscal_envio_modo ?? "BATCH",
      batch_enabled: context.fiscal_context.batch_enabled ?? true
    },
    cliente: original.cliente,
    items: original.items,
    totals: original.totals,
    motivo,
    factura_referencia: {
      documento_id: original.id,
      cdc: original.cdc,
      numero_fiscal: original.numero_fiscal
    }
  };
}

function mergeFiscalStatus(
  current: Record<string, unknown> | null,
  refreshed: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...(current ?? {}),
    ...refreshed
  };
}

function buildExternalRef(context: OperationalContextResponse, idempotencyKey?: string): string {
  return idempotencyKey
    ? `fac_${crypto.createHash("sha256").update(`${context.facturador.id}:${idempotencyKey}`).digest("hex").slice(0, 32)}`
    : `fac_${crypto.randomUUID()}`;
}

function buildNotaCreditoExternalRef(context: OperationalContextResponse, facturaId: string, idempotencyKey?: string): string {
  return idempotencyKey
    ? `nce_${crypto.createHash("sha256").update(`${context.facturador.id}:${idempotencyKey}`).digest("hex").slice(0, 32)}`
    : `nce_${crypto.createHash("sha256").update(`${context.facturador.id}:${facturaId}:${crypto.randomUUID()}`).digest("hex").slice(0, 32)}`;
}
