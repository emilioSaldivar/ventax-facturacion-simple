import type { TaxTotals } from "@facturacion-simple/shared";
import type { FiscalContext, FacturadorSummary } from "../context/context.types";
import type { FacturaClienteInput, FacturaItemPreview } from "../facturas/facturas.types";

export type FiscalGatewayMode = "mock" | "real";
export type FiscalGatewayErrorCode = "TIMEOUT" | "UPSTREAM_ERROR" | "UNAVAILABLE" | "INVALID_RESPONSE";
export type FiscalEnvioModo = "BATCH" | "SYNC";
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
  cdc: string | null;
  numero_fiscal: string | null;
  estado: "EMITIDA" | "PENDIENTE_SIFEN" | "RECHAZADA";
  fiscal_envio_modo?: FiscalEnvioModo;
  delivery_mode?: FiscalDeliveryMode | null;
  idempotent?: boolean | null;
  batch?: FiscalBatchTransmissionInfo | null;
  email_status: "NOT_APPLICABLE" | "DELEGATED" | "SENT" | "FAILED" | "UNKNOWN";
  raw: Record<string, unknown>;
}

export type FiscalEmitNotaCreditoResponse = FiscalEmitFacturaResponse;

export interface FiscalRefreshStatusRequest {
  cdc: string;
}

export interface FiscalRefreshStatusResponse {
  estado: "EMITIDA" | "PENDIENTE_SIFEN" | "RECHAZADA" | "ANULADA";
  raw: Record<string, unknown>;
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
  cdc: string | null;
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

export interface FiscalGateway {
  health(): Promise<FiscalGatewayHealth>;
  emitFactura(request: FiscalEmitFacturaRequest): Promise<FiscalEmitFacturaResponse>;
  emitNotaCredito(request: FiscalEmitNotaCreditoRequest): Promise<FiscalEmitNotaCreditoResponse>;
  refreshFacturaStatus(request: FiscalRefreshStatusRequest): Promise<FiscalRefreshStatusResponse>;
  cancelFactura(request: FiscalCancelFacturaRequest): Promise<FiscalCancelFacturaResponse>;
  getDocumentoEventos(cdc: string): Promise<FiscalDocumentoEventosResponse>;
  getBatchPendientesByEmisor(input: { emisorId: string; limit: number; offset: number }): Promise<FiscalBatchPendientesResponse>;
  getFacturalistaByEmisor(input: { emisorId: string; offset: number; limit: number; q?: string }): Promise<FiscalFacturalistaResponse>;
  getXml(cdc: string): Promise<FiscalArtifactResponse>;
  getKudePdf(cdc: string): Promise<FiscalArtifactResponse>;
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
