import type { TaxTotals } from "@facturacion-simple/shared";
import type { FacturadorSummary } from "../context/context.types";
import type { EmailStatus, FacturaClienteInput, DocumentoEstado } from "../facturas/facturas.types";

export interface DeliveryLinkRecord {
  id: string;
  token: string;
  revoked_at: string | null;
}

export interface DeliveryLinkResponse {
  public_url: string;
  whatsapp_url: string;
  token_status: "ACTIVE" | "REVOKED";
}

export interface EmailStatusResponse {
  status: EmailStatus;
  message: string | null;
}

export interface PublicDocumentResponse {
  facturador: FacturadorSummary;
  numero_fiscal: string | null;
  cdc: string | null;
  estado: DocumentoEstado;
  cliente: FacturaClienteInput;
  totals: TaxTotals;
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

export interface PublicDocumentRecord {
  token: string;
  facturador: FacturadorSummary;
  documento: {
    id: string;
    estado: DocumentoEstado;
    numero_fiscal: string | null;
    cdc: string | null;
    cliente: FacturaClienteInput;
    totals: TaxTotals;
    email_status: EmailStatus;
  };
}

export interface DeliveryLinkRepository {
  findActiveByDocumento(input: { facturadorId: string; documentoId: string }): Promise<DeliveryLinkRecord | null>;
  findPublicByToken(token: string): Promise<PublicDocumentRecord | null>;
  create(input: {
    tenantId: string;
    facturadorId: string;
    documentoId: string;
    userId: string;
    token: string;
    regenerate: boolean;
  }): Promise<DeliveryLinkRecord>;
}
