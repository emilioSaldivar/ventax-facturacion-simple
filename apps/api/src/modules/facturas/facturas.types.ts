import type { TaxCalculatedLine, TaxTotals, TipoIva } from "@facturacion-simple/shared";
import type { DocumentoIdentidadTipo } from "../clientes/clientes.types";
import type {
  FiscalEmitFacturaRequest,
  FiscalEmitFacturaResponse,
  FiscalEmitNotaCreditoRequest,
  FiscalEmitNotaCreditoResponse
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
export type EmailStatus = "NOT_APPLICABLE" | "DELEGATED" | "SENT" | "FAILED" | "UNKNOWN";

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
  tipo: DocumentoTipo;
  estado: DocumentoEstado;
  condicion_venta: CondicionVenta;
  numero_fiscal: string | null;
  cdc: string | null;
  fiscal_document_id: string | null;
  external_ref: string | null;
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
  }): Promise<DocumentoResponse | null>;
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
}
