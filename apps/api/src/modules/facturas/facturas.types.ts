import type { TaxCalculatedLine, TaxTotals, TipoIva } from "@facturacion-simple/shared";
import type { DocumentoIdentidadTipo } from "../clientes/clientes.types";
import type {
  FiscalDeliveryMode,
  FiscalEmitFacturaRequest,
  FiscalEmitFacturaResponse,
  FiscalEmitNotaCreditoRequest,
  FiscalEmitNotaCreditoResponse,
  FiscalBatchTransmissionInfo,
  FiscalEnvioModo
} from "../fiscal-gateway/fiscal-gateway.types";

export const condicionesVenta = ["CONTADO", "CREDITO"] as const;
export type CondicionVenta = (typeof condicionesVenta)[number];

export interface FacturaClienteInput {
  cliente_id?: string | null;
  documento_tipo: DocumentoIdentidadTipo;
  documento: string;
  razon_social: string;
  direccion?: string | null;
  telefono?: string | null;
  email?: string | null;
}

export interface FacturaItemInput {
  catalogo_item_id?: string | null;
  codigo?: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  iva_tipo?: TipoIva;
}

export interface FacturaPreviewInput {
  condicion_venta: CondicionVenta;
  tipo_transaccion?: 1 | 2 | 3;
  credito_plazo_dias?: number | null;
  cliente: FacturaClienteInput;
  items: FacturaItemInput[];
}

export interface FacturaItemPreview extends TaxCalculatedLine {
  catalogo_item_id: string | null;
}

export interface FacturaPreviewResponse {
  items: FacturaItemPreview[];
  totals: TaxTotals;
}

export type DocumentoEstado =
  | "EMITIENDO"
  | "EMITIDA"
  | "PENDIENTE_SIFEN"
  | "RECHAZADA"
  | "ERROR_OPERATIVO"
  | "ERROR_TEMPORAL"
  | "ANULADA";

export type DocumentoTipo = "FACTURA" | "NOTA_CREDITO";
export type DocumentoTipoOperativo = CondicionVenta | "NOTA_CREDITO";
export type EmailStatus = "NOT_APPLICABLE" | "DELEGATED" | "SENT" | "FAILED" | "UNKNOWN";
export type { FiscalBatchTransmissionInfo, FiscalEnvioModo };

export interface DeliverySummary {
  public_url: string | null;
  whatsapp_url: string | null;
  email_status: EmailStatus;
  artifacts: {
    kude_pdf: {
      available: boolean;
      url: string | null;
    };
    xml: {
      available: boolean;
      url: string | null;
    };
  };
}

export interface DocumentoResponse {
  id: string;
  document_uuid: string | null;
  tipo: DocumentoTipo;
  estado: DocumentoEstado;
  condicion_venta: CondicionVenta;
  numero_fiscal: string | null;
  cdc: string | null;
  fiscal_document_id: string | null;
  external_ref: string | null;
  fiscal_envio_modo: FiscalEnvioModo;
  delivery_mode?: FiscalDeliveryMode | null;
  fiscal_idempotent?: boolean | null;
  batch: FiscalBatchTransmissionInfo | null;
  cliente: FacturaClienteInput;
  items: FacturaItemPreview[];
  totals: TaxTotals;
  fiscal_status: Record<string, unknown> | null;
  documento_relacionado_id: string | null;
  nce_motivo: string | null;
  delivery: DeliverySummary;
  created_at: string | null;
}

export interface DocumentoListFilters {
  tipo?: DocumentoTipo;
  tipo_operativo?: DocumentoTipoOperativo;
  estado?: DocumentoEstado;
  desde?: string;
  hasta?: string;
  q?: string;
  limit: number;
  offset: number;
}

export interface DocumentoListResponse {
  items: DocumentoResponse[];
  total: number;
}

export interface NotaCreditoCandidate {
  documento: DocumentoResponse;
  elegible: boolean;
  motivo_no_elegible: string | null;
}

export interface NotaCreditoCandidateListResponse {
  items: NotaCreditoCandidate[];
  total: number;
}

export interface DocumentoEventoResponse {
  event_id: string | null;
  type: string | null;
  status: string | null;
  created_at: string | null;
}

export interface DocumentoEventosListResponse {
  documento_id: string;
  cdc: string | null;
  events: DocumentoEventoResponse[];
}

export interface DocumentoDecisionResponse {
  documento_id: string;
  emisor_id: string;
  env: "test" | "prod";
  cdc: string | null;
  nro_factura: string | null;
  status: string;
  transmission_evidence: "YES" | "NO" | "UNKNOWN";
  number_state: "CONSUMED" | "REUSABLE" | "REQUIRES_VOID" | "UNCERTAIN";
  decision_confidence: "HIGH" | "MEDIUM" | "LOW";
  reason_codes: string[];
  recommended_action: "RETRY" | "CANCEL_SEND" | "CANCEL_FISCAL" | "VOID_NUMBER" | "WAIT_SYNC" | "NO_ACTION";
  next_step_hint: string | null;
  escalation_required: boolean;
  allowed_actions: Record<string, boolean>;
}

export interface DocumentoValidateCdcImpactResponse {
  documento_id: string;
  current_cdc: string | null;
  candidate_cdc: string | null;
  cdc_impact: "CDC_NO_CHANGE" | "CDC_CHANGE";
  reason: string | null;
  allowed_actions: Record<string, boolean>;
}

export interface DocumentoGestionResendResponse {
  documento_id: string;
  status: string;
  revision_number: number;
  accepted_by_sifen: boolean;
  cdc: string | null;
  queued_for_batch: boolean | null;
}

export interface DocumentoGestionCreateDerivedResponse {
  source_document_id: string;
  derived_document_id: string;
  status: string;
  accepted_by_sifen: boolean;
  cdc: string | null;
  nro_factura: string | null;
}

export interface DocumentoGestionCancelSendResponse {
  documento_id: string;
  previous_status: string;
  status: string;
  action_result: string;
  reason_codes: string[];
  recommended_next_action: string;
}

export interface DocumentoGestionVoidResponse {
  documento_id: string;
  event_id: string | null;
  status: string;
}

export interface BatchPendientesGestionResponse {
  documents_pending: number;
  batches_pending: number;
  documents: Array<{
    document_id: string | null;
    cdc: string | null;
    nro_factura: string | null;
    status: string | null;
    fecha_emision: string | null;
    tipo_documento: string | null;
  }>;
  batches: Array<{
    batch_id: string | null;
    did: string | null;
    dProtConsLote: string | null;
    dCodRes: string | null;
    status: string | null;
    doc_count: number | null;
    result_code: string | null;
    result_message: string | null;
  }>;
}

export interface ReconciliacionFiscalResponse {
  items: Array<{
    document_id: string | null;
    cdc: string | null;
    nro_factura: string | null;
    status: string | null;
    fecha_emision: string | null;
    receptor_doc: string | null;
    receptor_nombre: string | null;
  }>;
  next: number | null;
}

export interface FacturaPersistInput {
  tenantId: string;
  facturadorId: string;
  userId: string;
  externalRef: string;
  idempotencyKey?: string;
  input: FacturaPreviewInput;
  preview: FacturaPreviewResponse;
  fiscalRequest: Record<string, unknown>;
  fiscalResponse: FiscalEmitFacturaResponse | null;
  fiscalError: Record<string, unknown> | null;
  estado: DocumentoEstado;
}

export interface FacturaQueuedPersistInput {
  tenantId: string;
  facturadorId: string;
  userId: string;
  externalRef: string;
  idempotencyKey?: string;
  input: FacturaPreviewInput;
  preview: FacturaPreviewResponse;
  fiscalRequest: FiscalEmitFacturaRequest;
}

export interface NotaCreditoPersistInput {
  tenantId: string;
  facturadorId: string;
  userId: string;
  original: DocumentoResponse;
  motivo: string;
  externalRef: string;
  idempotencyKey?: string;
  fiscalRequest: FiscalEmitNotaCreditoRequest;
  fiscalResponse: FiscalEmitNotaCreditoResponse | null;
  fiscalError: Record<string, unknown> | null;
  estado: DocumentoEstado;
}

export interface PendingFiscalEmission {
  outboxId: string;
  documentoId: string;
  facturadorId: string;
  fiscalRequest: FiscalEmitFacturaRequest;
}

export interface FacturaRepository {
  findByIdempotencyKey(input: { facturadorId: string; idempotencyKey: string }): Promise<DocumentoResponse | null>;
  findById(input: { facturadorId: string; documentoId: string }): Promise<DocumentoResponse | null>;
  findNotaCreditoByOriginal(input: { facturadorId: string; documentoId: string }): Promise<DocumentoResponse | null>;
  list(input: { facturadorId: string; filters: DocumentoListFilters }): Promise<DocumentoListResponse>;
  updateFiscalStatus(input: {
    facturadorId: string;
    documentoId: string;
    estado: DocumentoEstado;
    fiscalStatus: Record<string, unknown>;
    cdc?: string | null;
  }): Promise<DocumentoResponse | null>;
  bulkUpdateDocumentUuidByCdc(items: Array<{ cdc: string; documentUuid: string }>): Promise<void>;
  createFromEmission(input: FacturaPersistInput): Promise<DocumentoResponse>;
  createQueuedEmission(input: FacturaQueuedPersistInput): Promise<DocumentoResponse>;
  createNotaCreditoFromFactura(input: NotaCreditoPersistInput): Promise<DocumentoResponse>;
  claimNextPendingEmission(): Promise<PendingFiscalEmission | null>;
  completePendingEmission(input: {
    outboxId: string;
    documentoId: string;
    response: FiscalEmitFacturaResponse;
  }): Promise<DocumentoResponse | null>;
  failPendingEmission(input: {
    outboxId: string;
    documentoId: string;
    estado: DocumentoEstado;
    error: Record<string, unknown>;
    retryAfterSeconds: number;
  }): Promise<DocumentoResponse | null>;
  retryPendingEmission(input: {
    facturadorId: string;
    documentoId: string;
    requestedBy: string;
  }): Promise<DocumentoResponse | null>;
  cancelDocumento(input: {
    facturadorId: string;
    documentoId: string;
    requestedBy: string;
    estado: "ANULADA" | "PENDIENTE_SIFEN";
    fiscalStatus: Record<string, unknown>;
  }): Promise<DocumentoResponse | null>;
  appendAuditEvent(input: {
    facturadorId: string;
    documentoId: string;
    requestedBy: string;
    eventType: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
}
