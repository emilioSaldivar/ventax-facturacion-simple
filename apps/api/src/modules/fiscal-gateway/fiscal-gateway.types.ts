import type { TaxTotals } from "@facturacion-simple/shared";
import type { FiscalContext, FacturadorSummary } from "../context/context.types";
import type { FacturaClienteInput, FacturaItemPreview } from "../facturas/facturas.types";

export type FiscalGatewayMode = "mock" | "real";
export type FiscalGatewayErrorCode = "TIMEOUT" | "UPSTREAM_ERROR" | "UNAVAILABLE" | "INVALID_RESPONSE";

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
