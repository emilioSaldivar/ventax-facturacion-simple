import type { TaxTotals } from "@facturacion-simple/shared";
import type { FiscalContext, FacturadorSummary } from "../context/context.types";
import type { FacturaClienteInput, FacturaItemPreview } from "../facturas/facturas.types";

export type FiscalGatewayMode = "mock" | "real";
export type FiscalGatewayErrorCode = "TIMEOUT" | "UPSTREAM_ERROR" | "UNAVAILABLE" | "INVALID_RESPONSE" | "TRANSMISSION_EVIDENCE_DETECTED";
export type FiscalEnvioModo = "BATCH" | "SYNC" | "AUTO";
export type FiscalDeliveryMode = "SYNC" | "BATCH" | "AUTO_FALLBACK_BATCH";

export interface FiscalBatchTransmissionInfo {
  batch_id: string | null;
  did: string | null;
  dProtConsLote: string | null;
  dCodRes: string | null;
  dMsgRes: string | null;
  dTpoProces: string | null;
  result_code: string | null;
  result_message: string | null;
  status: "CREATED" | "RECEIVED" | "PROCESSING" | "DONE" | "ERROR" | null;
}

export interface FiscalGatewayConfig {
  mode: FiscalGatewayMode;
  baseUrl: string;
  apiKey?: string;
  timeoutMs: number;
  environment: "test" | "prod";
  sendEmissionProfileCode?: boolean;
  serviceNumbering?: boolean;
}

export interface FiscalGatewayHealth {
  ok: boolean;
  mode: FiscalGatewayMode;
  status?: number;
  message?: string;
}

export interface FiscalEmitFacturaRequest {
  external_ref: string;
  condicion_venta: "CONTADO" | "CREDITO";
  tipo_transaccion: 1 | 2 | 3;
  facturador: FacturadorSummary;
  fiscal_context: FiscalContext;
  cliente: FacturaClienteInput;
  items: FacturaItemPreview[];
  totals: TaxTotals;
}

export interface FiscalEmitNotaCreditoRequest {
  external_ref: string;
  facturador: FacturadorSummary;
  fiscal_context: FiscalContext;
  cliente: FacturaClienteInput;
  items: FacturaItemPreview[];
  totals: TaxTotals;
  motivo: string;
  factura_referencia: {
    documento_id: string;
    cdc: string;
    numero_fiscal: string | null;
  };
}

export interface FiscalEmitFacturaResponse {
  fiscal_document_id: string | null;
  document_uuid: string | null;
  cdc: string | null;
  numero_fiscal: string | null;
  estado: "EMITIDA" | "PENDIENTE_SIFEN" | "RECHAZADA";
  /** Status crudo del backend fiscal (APPROVED, QUEUED_BATCH, REJECTED, ...) antes del mapeo a estado local. */
  status_raw: string | null;
  /** Codigo SIFEN estructurado (dCodRes / result_code), extraido del payload. */
  result_code: string | null;
  /** Mensaje SIFEN estructurado (dMsgRes / result_message), extraido del payload. */
  result_message: string | null;
  fiscal_envio_modo?: FiscalEnvioModo;
  delivery_mode?: FiscalDeliveryMode | null;
  idempotent?: boolean | null;
  batch?: FiscalBatchTransmissionInfo | null;
  email_status: "NOT_APPLICABLE" | "DELEGATED" | "SENT" | "FAILED" | "UNKNOWN";
  raw: Record<string, unknown>;
}

export type FiscalEmitNotaCreditoResponse = FiscalEmitFacturaResponse;

export interface FiscalRefreshStatusRequest {
  documentUuid: string;
}

export interface FiscalRefreshStatusResponse {
  estado: "EMITIDA" | "PENDIENTE_SIFEN" | "RECHAZADA" | "ANULADA";
  current_cdc: string | null;
  /** Status crudo del backend fiscal antes del mapeo a estado local. */
  status_raw: string | null;
  /** Codigo SIFEN estructurado (dCodRes / result_code). */
  result_code: string | null;
  /** Mensaje SIFEN estructurado (dMsgRes / result_message). */
  result_message: string | null;
  raw: Record<string, unknown>;
}

export type FiscalLineageStatus = "ACTIVE" | "SUPERSEDED" | "INCONSISTENT";
export type FiscalSifenResolution = "APPROVED" | "APPROVED_WITH_OBS" | "REJECTED_OR_MISSING" | "PENDING_CHECK";

export interface FiscalByCdcResponse {
  document_uuid: string;
  document_id: string;
  requested_cdc: string;
  current_cdc: string | null;
  is_current: boolean;
  lineage_status: FiscalLineageStatus;
  sifen_resolution: FiscalSifenResolution;
  status: string;
  accepted_by_sifen: boolean;
  nro_factura: string | null;
  tipo_documento: string;
  emisor_id: string;
  env: "test" | "prod";
  resolution_note: string;
}

export interface FiscalCancelFacturaRequest {
  emisor_id: string;
  cdc: string;
  motivo: string;
}

export interface FiscalCancelFacturaResponse {
  event_id: string | null;
  estado: "ANULADA" | "PENDIENTE_SIFEN";
  raw: Record<string, unknown>;
}

export interface FiscalDocumentoEvento {
  event_id: string | null;
  type: string | null;
  status: string | null;
  created_at: string | null;
  response: Record<string, unknown> | null;
}

export interface FiscalDocumentoEventosResponse {
  events: FiscalDocumentoEvento[];
  raw: Record<string, unknown>;
}

export interface FiscalDocumentoDecisionResponse {
  document_id: string;
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
  raw: Record<string, unknown>;
}

export interface FiscalDocumentoValidateCdcImpactResponse {
  document_id: string;
  current_cdc: string | null;
  candidate_cdc: string | null;
  cdc_impact: "CDC_NO_CHANGE" | "CDC_CHANGE";
  reason: string | null;
  allowed_actions: Record<string, boolean>;
  raw: Record<string, unknown>;
}

export interface FiscalDocumentoResendResponse {
  document_id: string;
  status: string;
  revision_number: number;
  accepted_by_sifen: boolean;
  cdc: string | null;
  queued_for_batch: boolean | null;
  raw: Record<string, unknown>;
}

export interface FiscalDocumentoCreateDerivedResponse {
  source_document_id: string;
  derived_document_id: string;
  status: string;
  accepted_by_sifen: boolean;
  cdc: string | null;
  nro_factura: string | null;
  raw: Record<string, unknown>;
}

export interface FiscalDocumentoCancelSendResponse {
  document_id: string;
  previous_status: string;
  status: string;
  action_result: string;
  reason_codes: string[];
  recommended_next_action: string;
  raw: Record<string, unknown>;
}

export interface FiscalDocumentoVoidResponse {
  document_id: string;
  event_id: string | null;
  status: string;
  raw: Record<string, unknown>;
}

export interface FiscalBatchPendienteDocumento {
  document_id: string | null;
  cdc: string | null;
  nro_factura: string | null;
  status: string | null;
  fecha_emision: string | null;
  tipo_documento: string | null;
}

export interface FiscalBatchPendienteLote {
  batch_id: string | null;
  did: string | null;
  dProtConsLote: string | null;
  dCodRes: string | null;
  status: string | null;
  doc_count: number | null;
  result_code: string | null;
  result_message: string | null;
}

export interface FiscalBatchPendientesResponse {
  documents: FiscalBatchPendienteDocumento[];
  batches: FiscalBatchPendienteLote[];
  raw: Record<string, unknown>;
}

export interface FiscalFacturalistaItem {
  document_id: string | null;
  document_uuid: string | null;
  cdc: string | null;
  current_cdc: string | null;
  nro_factura: string | null;
  status: string | null;
  fecha_emision: string | null;
  receptor_doc: string | null;
  receptor_nombre: string | null;
}

export interface FiscalFacturalistaResponse {
  items: FiscalFacturalistaItem[];
  next: number | null;
  raw: Record<string, unknown>;
}

export interface FiscalArtifactResponse {
  body: Buffer;
  content_type: string;
  filename: string;
}

export type FiscalIdempotencyReconciliationItemResult =
  | "IMPACTED"
  | "NOT_IMPACTED"
  | "DUPLICATE_CONFLICT"
  | "INVALID_KEY";

export interface FiscalIdempotencyReconciliationItem {
  idempotency_key: string;
  result: FiscalIdempotencyReconciliationItemResult;
  document_uuid: string | null;
  document_id: string | null;
  current_cdc: string | null;
  status: string | null;
  nro_factura: string | null;
  created_at: string | null;
  message: string | null;
}

export interface FiscalIdempotencyReconciliationResponse {
  emisor_id: string;
  env: "test" | "prod";
  from: string;
  to: string;
  items: FiscalIdempotencyReconciliationItem[];
  raw: Record<string, unknown>;
}

export type ReciboEstadoFiscal = "BORRADOR" | "EMITIDO" | "ANULADO";
export type ReciboPagadorDocumentoTipo = "RUC" | "CI" | "PASAPORTE" | "CEDULA_EXTRANJERA" | "NO_ESPECIFICADO" | null;
export type ReciboFormaPagoFiscal = "EFECTIVO" | "TRANSFERENCIA" | "CHEQUE" | "TARJETA_CREDITO" | "TARJETA_DEBITO" | "OTRO";

export interface FiscalCrearReciboRequest {
  emisor_id: string;
  /** Si se omite, facturacion-electronica usa la actividad economica "principal" del emisor. */
  actividad_economica_codigo?: string;
  fecha_cobro: string;
  pagador_nombre: string;
  pagador_documento_tipo?: ReciboPagadorDocumentoTipo;
  pagador_documento?: string | null;
  concepto: string;
  importe: number;
  moneda?: string;
  forma_pago?: ReciboFormaPagoFiscal;
  referencia_bancaria?: string | null;
  referencia_documento_uuid?: string | null;
  referencia_documento_numero_display?: string | null;
  client_reference?: { idempotency_key: string };
}

export interface FiscalReciboResult {
  id: string;
  estado: ReciboEstadoFiscal;
  numero: string | null;
  verification_token: string | null;
  fecha_cobro: string;
  pagador_nombre: string;
  pagador_documento_tipo: ReciboPagadorDocumentoTipo;
  pagador_documento: string | null;
  concepto: string;
  importe: string;
  moneda: string;
  forma_pago: ReciboFormaPagoFiscal;
  referencia_bancaria: string | null;
  referencia_documento_numero_display: string | null;
  actividad_economica_codigo: string | null;
  xml_hash: string | null;
  pdf_hash: string | null;
  anulacion_motivo: string | null;
  emitido_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  raw: Record<string, unknown>;
}

export interface FiscalEditarReciboRequest {
  reciboId: string;
  patch: Partial<Omit<FiscalCrearReciboRequest, "emisor_id" | "client_reference">>;
}

export interface FiscalAnularReciboRequest {
  reciboId: string;
  motivo: string;
}

export interface FiscalReciboVerificacionResult {
  valido: boolean;
  estado?: ReciboEstadoFiscal;
  fecha_emision?: string | null;
  firmado_en?: string | null;
  raw: Record<string, unknown>;
}

export interface FiscalGateway {
  health(): Promise<FiscalGatewayHealth>;
  emitFactura(request: FiscalEmitFacturaRequest): Promise<FiscalEmitFacturaResponse>;
  emitNotaCredito(request: FiscalEmitNotaCreditoRequest): Promise<FiscalEmitNotaCreditoResponse>;
  refreshFacturaStatus(request: FiscalRefreshStatusRequest): Promise<FiscalRefreshStatusResponse>;
  cancelFactura(request: FiscalCancelFacturaRequest): Promise<FiscalCancelFacturaResponse>;
  getDocumentoEventos(documentUuid: string): Promise<FiscalDocumentoEventosResponse>;
  resolveDocumentoByCdc(cdc: string): Promise<FiscalByCdcResponse>;
  getDocumentoDecisionByDocumentId(input: { emisorId: string; documentId: string }): Promise<FiscalDocumentoDecisionResponse>;
  validateDocumentoCdcImpactByDocumentId(input: {
    emisorId: string;
    documentId: string;
    json_input?: Record<string, unknown>;
  }): Promise<FiscalDocumentoValidateCdcImpactResponse>;
  retryDocumentoSameCdcByDocumentId(input: {
    emisorId: string;
    documentId: string;
    mode?: "SYNC" | "BATCH" | "AUTO";
    send_now?: boolean;
    comment?: string;
    json_input?: Record<string, unknown>;
  }): Promise<FiscalDocumentoResendResponse>;
  createDocumentoDerivedByDocumentId(input: {
    emisorId: string;
    documentId: string;
    mode?: "SYNC" | "BATCH" | "AUTO";
    send_now?: boolean;
    comment?: string;
    json_input?: Record<string, unknown>;
  }): Promise<FiscalDocumentoCreateDerivedResponse>;
  cancelDocumentoSendByDocumentId(input: {
    emisorId: string;
    documentId: string;
    comment?: string;
  }): Promise<FiscalDocumentoCancelSendResponse>;
  voidDocumentoNumberByDocumentId(input: {
    emisorId: string;
    documentId: string;
    motivo: string;
  }): Promise<FiscalDocumentoVoidResponse>;
  getBatchPendientesByEmisor(input: { emisorId: string; limit: number; offset: number }): Promise<FiscalBatchPendientesResponse>;
  getFacturalistaByEmisor(input: { emisorId: string; offset: number; limit: number; q?: string }): Promise<FiscalFacturalistaResponse>;
  getXml(documentUuid: string): Promise<FiscalArtifactResponse>;
  getKudePdf(documentUuid: string): Promise<FiscalArtifactResponse>;
  reconcileByIdempotencyKeys(input: {
    emisorId: string;
    env: "test" | "prod";
    from: string;
    to: string;
    idempotencyKeys: string[];
  }): Promise<FiscalIdempotencyReconciliationResponse>;
  crearRecibo(request: FiscalCrearReciboRequest): Promise<FiscalReciboResult>;
  /** GET /recibos/{id} — usado tras anular para releer el estado real del recibo original (ver seccion 16.9 de la guia: anular NO actualiza el original in-place, genera un documento nuevo separado). */
  getRecibo(id: string): Promise<FiscalReciboResult>;
  editarRecibo(request: FiscalEditarReciboRequest): Promise<FiscalReciboResult>;
  eliminarRecibo(input: { reciboId: string }): Promise<void>;
  emitirRecibo(input: { reciboId: string }): Promise<FiscalReciboResult>;
  anularRecibo(request: FiscalAnularReciboRequest): Promise<FiscalReciboResult>;
  getReciboPdf(input: { reciboId: string }): Promise<FiscalArtifactResponse>;
  getReciboXml(input: { reciboId: string }): Promise<FiscalArtifactResponse>;
  verificarRecibo(token: string): Promise<FiscalReciboVerificacionResult>;
  verificarReciboPdf(token: string): Promise<FiscalArtifactResponse>;
  verificarReciboXml(token: string): Promise<FiscalArtifactResponse>;
}

export class FiscalGatewayError extends Error {
  constructor(
    public readonly code: FiscalGatewayErrorCode,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "FiscalGatewayError";
  }
}
