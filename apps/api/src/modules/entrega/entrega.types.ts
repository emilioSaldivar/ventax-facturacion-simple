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

export interface DeliveryLinkRepository {
  findActiveByDocumento(input: { facturadorId: string; documentoId: string }): Promise<DeliveryLinkRecord | null>;
  create(input: {
    tenantId: string;
    facturadorId: string;
    documentoId: string;
    userId: string;
    token: string;
    regenerate: boolean;
  }): Promise<DeliveryLinkRecord>;
}
