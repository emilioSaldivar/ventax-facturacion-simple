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
  BatchPendientesGestionResponse,
  DocumentoDecisionResponse,
  DocumentoEstado,
  DocumentoEventosListResponse,
  DocumentoGestionCancelSendResponse,
  DocumentoGestionCreateDerivedResponse,
  DocumentoGestionResendResponse,
  DocumentoGestionVoidResponse,
  DocumentoListFilters,
  DocumentoListResponse,
  DocumentoResponse,
  DocumentoValidateCdcImpactResponse,
  FacturaItemPreview,
  FacturaPreviewInput,
  FacturaPreviewResponse,
  FacturaRepository,
  NotaCreditoCandidateListResponse,
  ReconciliacionFiscalResponse
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

  let documentUuid = documento.document_uuid;

  if (!documentUuid) {
    const cdc = documento.cdc;
    if (!cdc) {
      throw new HttpError(409, "CONFLICT", "Documento sin identidad fiscal canonica. Requiere sincronizacion.");
    }

    // Documento emitido con cdc pero sin document_uuid local — resolverlo via CDC
    // y persistirlo antes de continuar con el refresh.
    try {
      const byCdc = await gateway.resolveDocumentoByCdc(cdc);
      documentUuid = byCdc.document_uuid;
      await repository.bulkUpdateDocumentUuidByCdc([{ cdc, documentUuid }]);
    } catch (error) {
      if (error instanceof FiscalGatewayError) {
        throw new HttpError(
          error.code === "TIMEOUT" ? 504 : 502,
          "INTERNAL_ERROR",
          "No se pudo resolver la identidad fiscal del documento.",
          { gateway_code: error.code }
        );
      }
      throw error;
    }
  }

  try {
    const refreshed = await gateway.refreshFacturaStatus({ documentUuid });

    // RN-03: actualizar cdc si el backend devuelve un current_cdc diferente al almacenado
    const cdcActualizado =
      refreshed.current_cdc && refreshed.current_cdc !== documento.cdc
        ? refreshed.current_cdc
        : undefined;

    const updated = await repository.updateFiscalStatus({
      facturadorId: context.facturador.id,
      documentoId,
      estado: refreshed.estado,
      fiscalStatus: mergeFiscalStatus(documento.fiscal_status, refreshed.raw),
      cdc: cdcActualizado
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

export async function getDocumentoEventos(
  context: OperationalContextResponse,
  documentoId: string,
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoEventosListResponse> {
  if (context.user.role === "OPERADOR_FACTURACION") {
    throw new HttpError(403, "FORBIDDEN", "Historial fiscal avanzado disponible solo para soporte interno.");
  }

  const documento = await getDocumentoById(context, documentoId, repository);
  if (!documento.document_uuid) {
    throw new HttpError(409, "CONFLICT", "Documento sin identidad fiscal canonica. Requiere sincronizacion.");
  }

  try {
    const response = await gateway.getDocumentoEventos(documento.document_uuid);
    return {
      documento_id: documento.id,
      cdc: documento.cdc,
      events: response.events
    };
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      throw new HttpError(
        error.code === "TIMEOUT" ? 504 : 502,
        "INTERNAL_ERROR",
        error.code === "TIMEOUT" ? "Timeout al consultar historial fiscal." : "No se pudo consultar historial fiscal.",
        {
          gateway_code: error.code,
          details: error.details ?? null
        }
      );
    }
    throw error;
  }
}

export async function getDocumentoDecision(
  context: OperationalContextResponse,
  documentoId: string,
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoDecisionResponse> {
  if (context.user.role === "OPERADOR_FACTURACION") {
    throw new HttpError(403, "FORBIDDEN", "Autogestion avanzada disponible solo para soporte interno.");
  }

  const documento = await getDocumentoById(context, documentoId, repository);

  try {
    const response = await gateway.getDocumentoDecisionByDocumentId({
      emisorId: context.facturador.emisor_id,
      documentId: documento.fiscal_document_id ?? documento.id
    });

    return {
      documento_id: documento.id,
      emisor_id: response.emisor_id,
      env: response.env,
      cdc: response.cdc,
      nro_factura: response.nro_factura,
      status: response.status,
      transmission_evidence: response.transmission_evidence,
      number_state: response.number_state,
      decision_confidence: response.decision_confidence,
      reason_codes: response.reason_codes,
      recommended_action: response.recommended_action,
      next_step_hint: response.next_step_hint,
      escalation_required: response.escalation_required,
      allowed_actions: response.allowed_actions
    };
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      throw new HttpError(
        error.code === "TIMEOUT" ? 504 : 502,
        "INTERNAL_ERROR",
        error.code === "TIMEOUT" ? "Timeout al consultar decision operativa." : "No se pudo consultar decision operativa.",
        {
          gateway_code: error.code,
          details: error.details ?? null
        }
      );
    }
    throw error;
  }
}

export async function getBatchPendientesGestion(
  context: OperationalContextResponse,
  input: { limit: number; offset: number },
  gateway: FiscalGateway
): Promise<BatchPendientesGestionResponse> {
  try {
    const response = await gateway.getBatchPendientesByEmisor({
      emisorId: context.facturador.emisor_id,
      limit: input.limit,
      offset: input.offset
    });

    return {
      documents_pending: response.documents.length,
      batches_pending: response.batches.length,
      documents: response.documents,
      batches: response.batches
    };
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      throw new HttpError(
        error.code === "TIMEOUT" ? 504 : 502,
        "INTERNAL_ERROR",
        error.code === "TIMEOUT"
          ? "Timeout al consultar documentos en espera de confirmacion."
          : "No se pudo consultar documentos en espera de confirmacion.",
        {
          gateway_code: error.code,
          details: error.details ?? null
        }
      );
    }
    throw error;
  }
}

export async function getReconciliacionFiscal(
  context: OperationalContextResponse,
  input: { offset: number; limit: number; q?: string },
  gateway: FiscalGateway,
  repository: FacturaRepository
): Promise<ReconciliacionFiscalResponse> {
  if (context.user.role === "OPERADOR_FACTURACION") {
    throw new HttpError(403, "FORBIDDEN", "Comparar con registro fiscal disponible solo para soporte interno.");
  }

  try {
    const response = await gateway.getFacturalistaByEmisor({
      emisorId: context.facturador.emisor_id,
      offset: input.offset,
      limit: input.limit,
      q: input.q
    });

    // RN-05: actualización oportunista de document_uuid para registros que aún no lo tienen
    const itemsConUuid = response.items.filter(
      (item): item is typeof item & { cdc: string; document_uuid: string } =>
        Boolean(item.document_uuid) && Boolean(item.cdc)
    );
    if (itemsConUuid.length > 0) {
      repository
        .bulkUpdateDocumentUuidByCdc(
          itemsConUuid.map((item) => ({ cdc: item.cdc, documentUuid: item.document_uuid }))
        )
        .catch(() => {
          // fallo en actualización oportunista no bloquea la respuesta
        });
    }

    return {
      items: response.items,
      next: response.next
    };
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      throw new HttpError(
        error.code === "TIMEOUT" ? 504 : 502,
        "INTERNAL_ERROR",
        error.code === "TIMEOUT" ? "Timeout al comparar con registro fiscal." : "No se pudo comparar con registro fiscal.",
        {
          gateway_code: error.code,
          details: error.details ?? null
        }
      );
    }
    throw error;
  }
}

function assertInternalSupportRole(context: OperationalContextResponse, message: string): void {
  if (context.user.role === "OPERADOR_FACTURACION") {
    throw new HttpError(403, "FORBIDDEN", message);
  }
}

function assertWithinWindowOrThrow(documento: DocumentoResponse, maxHours: number, actionLabel: string): void {
  if (!documento.created_at) {
    throw new HttpError(409, "CONFLICT", `${actionLabel} requiere fecha operativa del documento para validar ventana.`);
  }
  const createdAt = new Date(documento.created_at);
  if (Number.isNaN(createdAt.getTime())) {
    throw new HttpError(409, "CONFLICT", `${actionLabel} requiere fecha operativa valida del documento para validar ventana.`);
  }
  const elapsedHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
  if (elapsedHours > maxHours) {
    throw new HttpError(409, "CONFLICT", `${actionLabel} fuera de ventana operativa (${maxHours}h).`);
  }
}

export async function validateDocumentoCdcImpact(
  context: OperationalContextResponse,
  documentoId: string,
  input: { json_input?: Record<string, unknown> } | undefined,
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoValidateCdcImpactResponse> {
  assertInternalSupportRole(context, "Autogestion avanzada disponible solo para soporte interno.");
  const documento = await getDocumentoById(context, documentoId, repository);
  assertWithinWindowOrThrow(documento, 72, "Prevalidacion CDC");
  try {
    const response = await gateway.validateDocumentoCdcImpactByDocumentId({
      emisorId: context.facturador.emisor_id,
      documentId: documento.fiscal_document_id ?? documento.id,
      json_input: input?.json_input
    });
    return {
      documento_id: documento.id,
      current_cdc: response.current_cdc,
      candidate_cdc: response.candidate_cdc,
      cdc_impact: response.cdc_impact,
      reason: response.reason,
      allowed_actions: response.allowed_actions
    };
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      throw new HttpError(error.code === "TIMEOUT" ? 504 : 502, "INTERNAL_ERROR", "No se pudo prevalidar impacto CDC.", {
        gateway_code: error.code,
        details: error.details ?? null
      });
    }
    throw error;
  }
}

type GestionActionInput = {
  mode?: "SYNC" | "BATCH" | "AUTO";
  send_now?: boolean;
  comment?: string;
  json_input?: Record<string, unknown>;
};

export async function retryDocumentoSameCdc(
  context: OperationalContextResponse,
  documentoId: string,
  input: GestionActionInput | undefined,
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoGestionResendResponse> {
  assertInternalSupportRole(context, "Autogestion avanzada disponible solo para soporte interno.");
  const documento = await getDocumentoById(context, documentoId, repository);
  assertWithinWindowOrThrow(documento, 72, "Reintento con mismo CDC");
  try {
    const response = await gateway.retryDocumentoSameCdcByDocumentId({
      emisorId: context.facturador.emisor_id,
      documentId: documento.fiscal_document_id ?? documento.id,
      ...input
    });
    await repository.appendAuditEvent({
      facturadorId: context.facturador.id,
      documentoId: documento.id,
      requestedBy: context.user.id,
      eventType: "FACTURA_GESTION_RETRY_SAME_CDC",
      metadata: {
        mode: input?.mode ?? null,
        send_now: typeof input?.send_now === "boolean" ? input.send_now : null,
        comment: input?.comment ?? null,
        accepted_by_sifen: response.accepted_by_sifen,
        status: response.status,
        revision_number: response.revision_number,
        queued_for_batch: response.queued_for_batch
      }
    });
    return {
      documento_id: documento.id,
      status: response.status,
      revision_number: response.revision_number,
      accepted_by_sifen: response.accepted_by_sifen,
      cdc: response.cdc,
      queued_for_batch: response.queued_for_batch
    };
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      throw new HttpError(error.code === "TIMEOUT" ? 504 : 502, "INTERNAL_ERROR", "No se pudo reintentar el documento con el mismo CDC.", {
        gateway_code: error.code,
        details: error.details ?? null
      });
    }
    throw error;
  }
}

export async function createDocumentoDerived(
  context: OperationalContextResponse,
  documentoId: string,
  input: GestionActionInput | undefined,
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoGestionCreateDerivedResponse> {
  assertInternalSupportRole(context, "Autogestion avanzada disponible solo para soporte interno.");
  const documento = await getDocumentoById(context, documentoId, repository);
  assertWithinWindowOrThrow(documento, 72, "Creacion de DE derivado");
  try {
    const response = await gateway.createDocumentoDerivedByDocumentId({
      emisorId: context.facturador.emisor_id,
      documentId: documento.fiscal_document_id ?? documento.id,
      ...input
    });
    await repository.appendAuditEvent({
      facturadorId: context.facturador.id,
      documentoId: documento.id,
      requestedBy: context.user.id,
      eventType: "FACTURA_GESTION_CREATE_DERIVED",
      metadata: {
        mode: input?.mode ?? null,
        send_now: typeof input?.send_now === "boolean" ? input.send_now : null,
        comment: input?.comment ?? null,
        accepted_by_sifen: response.accepted_by_sifen,
        status: response.status,
        derived_document_id: response.derived_document_id
      }
    });
    return {
      source_document_id: documento.id,
      derived_document_id: response.derived_document_id,
      status: response.status,
      accepted_by_sifen: response.accepted_by_sifen,
      cdc: response.cdc,
      nro_factura: response.nro_factura
    };
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      throw new HttpError(error.code === "TIMEOUT" ? 504 : 502, "INTERNAL_ERROR", "No se pudo crear DE derivado.", {
        gateway_code: error.code,
        details: error.details ?? null
      });
    }
    throw error;
  }
}

export async function cancelDocumentoSend(
  context: OperationalContextResponse,
  documentoId: string,
  input: { comment?: string } | undefined,
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoGestionCancelSendResponse> {
  assertInternalSupportRole(context, "Autogestion avanzada disponible solo para soporte interno.");
  const documento = await getDocumentoById(context, documentoId, repository);
  assertWithinWindowOrThrow(documento, 72, "Cancelacion de envio local");
  try {
    const response = await gateway.cancelDocumentoSendByDocumentId({
      emisorId: context.facturador.emisor_id,
      documentId: documento.fiscal_document_id ?? documento.id,
      comment: input?.comment
    });
    await repository.appendAuditEvent({
      facturadorId: context.facturador.id,
      documentoId: documento.id,
      requestedBy: context.user.id,
      eventType: "FACTURA_GESTION_CANCEL_SEND",
      metadata: {
        comment: input?.comment ?? null,
        previous_status: response.previous_status,
        status: response.status,
        action_result: response.action_result,
        reason_codes: response.reason_codes
      }
    });
    return {
      documento_id: documento.id,
      previous_status: response.previous_status,
      status: response.status,
      action_result: response.action_result,
      reason_codes: response.reason_codes,
      recommended_next_action: response.recommended_next_action
    };
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      throw new HttpError(error.code === "TIMEOUT" ? 504 : 502, "INTERNAL_ERROR", "No se pudo cancelar el envio local.", {
        gateway_code: error.code,
        details: error.details ?? null
      });
    }
    throw error;
  }
}

export async function voidDocumentoNumber(
  context: OperationalContextResponse,
  documentoId: string,
  input: { motivo: string },
  repository: FacturaRepository,
  gateway: FiscalGateway
): Promise<DocumentoGestionVoidResponse> {
  assertInternalSupportRole(context, "Autogestion avanzada disponible solo para soporte interno.");
  const documento = await getDocumentoById(context, documentoId, repository);
  assertWithinWindowOrThrow(documento, 360, "Inutilizacion de numeracion");
  try {
    const response = await gateway.voidDocumentoNumberByDocumentId({
      emisorId: context.facturador.emisor_id,
      documentId: documento.fiscal_document_id ?? documento.id,
      motivo: input.motivo
    });
    await repository.appendAuditEvent({
      facturadorId: context.facturador.id,
      documentoId: documento.id,
      requestedBy: context.user.id,
      eventType: "FACTURA_GESTION_VOID_NUMBER",
      metadata: {
        motivo: input.motivo,
        event_id: response.event_id,
        status: response.status
      }
    });
    return {
      documento_id: documento.id,
      event_id: response.event_id,
      status: response.status
    };
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      throw new HttpError(error.code === "TIMEOUT" ? 504 : 502, "INTERNAL_ERROR", "No se pudo inutilizar la numeracion.", {
        gateway_code: error.code,
        details: error.details ?? null
      });
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
      if (error.code !== "TIMEOUT") {
        throw new HttpError(502, "INTERNAL_ERROR", "Backend fiscal rechazo la nota de credito.", {
          gateway_code: error.code,
          details: error.details ?? null
        });
      }

      estado = "PENDIENTE_SIFEN";
      fiscalError = {
        code: error.code,
        message: error.message,
        details: error.details ?? null,
        recoverable: true,
        suggested_action: "REFRESH_OR_CONTACT_SUPPORT"
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
