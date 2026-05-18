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
  defaultTimbrado: string;
  defaultTimbradoInicio: string;
  defaultEstablecimiento: string;
  defaultPuntoExpedicion: string;
  defaultDocumentoNro: string;
  defaultCreditoPlazoDias: number;
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

export interface FiscalEmitFacturaResponse {
  fiscal_document_id: string | null;
  cdc: string | null;
  numero_fiscal: string | null;
  estado: "EMITIDA" | "PENDIENTE_SIFEN" | "RECHAZADA";
  email_status: "NOT_APPLICABLE" | "DELEGATED" | "SENT" | "FAILED" | "UNKNOWN";
  raw: Record<string, unknown>;
}

export interface FiscalGateway {
  health(): Promise<FiscalGatewayHealth>;
  emitFactura(request: FiscalEmitFacturaRequest): Promise<FiscalEmitFacturaResponse>;
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
