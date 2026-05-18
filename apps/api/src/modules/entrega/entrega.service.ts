import crypto from "node:crypto";
import { env } from "../../config/env";
import type { OperationalContextResponse } from "../context/context.types";
import type { FacturaRepository } from "../facturas/facturas.types";
import { getDocumentoById } from "../facturas/facturas.service";
import type { DeliveryLinkRecord, DeliveryLinkRepository, DeliveryLinkResponse } from "./entrega.types";

export async function createOrGetDeliveryLink(
  context: OperationalContextResponse,
  documentoId: string,
  options: { regenerate?: boolean },
  repositories: {
    facturas: FacturaRepository;
    deliveryLinks: DeliveryLinkRepository;
  }
): Promise<DeliveryLinkResponse> {
  await getDocumentoById(context, documentoId, repositories.facturas);

  if (!options.regenerate) {
    const existing = await repositories.deliveryLinks.findActiveByDocumento({
      facturadorId: context.facturador.id,
      documentoId
    });

    if (existing) {
      return buildResponse(existing);
    }
  }

  const created = await repositories.deliveryLinks.create({
    tenantId: context.tenant.id,
    facturadorId: context.facturador.id,
    documentoId,
    userId: context.user.id,
    token: generatePublicDeliveryToken(),
    regenerate: Boolean(options.regenerate)
  });

  return buildResponse(created);
}

export function generatePublicDeliveryToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function buildResponse(record: DeliveryLinkRecord): DeliveryLinkResponse {
  const publicUrl = `${env.PUBLIC_APP_BASE_URL.replace(/\/$/, "")}/public/d/${record.token}`;

  return {
    public_url: publicUrl,
    whatsapp_url: `https://wa.me/?text=${encodeURIComponent(publicUrl)}`,
    token_status: record.revoked_at ? "REVOKED" : "ACTIVE"
  };
}
