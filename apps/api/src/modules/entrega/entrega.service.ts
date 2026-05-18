import crypto from "node:crypto";
import { env } from "../../config/env";
import { HttpError } from "../../shared/errors/http-error";
import type { OperationalContextResponse } from "../context/context.types";
import type { FacturaRepository } from "../facturas/facturas.types";
import { getDocumentoById } from "../facturas/facturas.service";
import { FiscalGatewayError, type FiscalArtifactResponse, type FiscalGateway } from "../fiscal-gateway/fiscal-gateway.types";
import type {
  DeliveryLinkRecord,
  DeliveryLinkRepository,
  DeliveryLinkResponse,
  EmailStatusResponse,
  PublicDocumentResponse
} from "./entrega.types";

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

export async function getEmailStatus(
  context: OperationalContextResponse,
  documentoId: string,
  repository: FacturaRepository
): Promise<EmailStatusResponse> {
  const documento = await getDocumentoById(context, documentoId, repository);
  const status = documento.delivery.email_status;

  return {
    status,
    message: buildEmailStatusMessage(status, Boolean(documento.cliente.email))
  };
}

export async function getPublicDocument(token: string, repository: DeliveryLinkRepository): Promise<PublicDocumentResponse> {
  const record = await repository.findPublicByToken(token);

  if (!record) {
    throw new HttpError(404, "NOT_FOUND", "Comprobante publico no encontrado.");
  }

  return {
    facturador: record.facturador,
    numero_fiscal: record.documento.numero_fiscal,
    cdc: record.documento.cdc,
    estado: record.documento.estado,
    cliente: record.documento.cliente,
    totals: record.documento.totals,
    email_status: record.documento.email_status,
    artifacts: buildPublicArtifacts(record.token, record.documento.cdc)
  };
}

export async function getPublicArtifact(
  token: string,
  artifact: "kude_pdf" | "xml",
  repository: DeliveryLinkRepository,
  gateway: FiscalGateway
): Promise<FiscalArtifactResponse> {
  const record = await repository.findPublicByToken(token);

  if (!record || !record.documento.cdc) {
    throw new HttpError(404, "NOT_FOUND", "Artefacto publico no encontrado.");
  }

  try {
    return artifact === "kude_pdf" ? await gateway.getKudePdf(record.documento.cdc) : await gateway.getXml(record.documento.cdc);
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      throw new HttpError(
        error.code === "TIMEOUT" ? 504 : 502,
        "INTERNAL_ERROR",
        error.code === "TIMEOUT" ? "Timeout al obtener artefacto fiscal." : "No se pudo obtener artefacto fiscal.",
        {
          gateway_code: error.code,
          details: error.details ?? null
        }
      );
    }
    throw error;
  }
}

function buildResponse(record: DeliveryLinkRecord): DeliveryLinkResponse {
  const publicUrl = `${env.PUBLIC_APP_BASE_URL.replace(/\/$/, "")}/public/d/${record.token}`;

  return {
    public_url: publicUrl,
    whatsapp_url: `https://wa.me/?text=${encodeURIComponent(publicUrl)}`,
    token_status: record.revoked_at ? "REVOKED" : "ACTIVE"
  };
}

function buildPublicArtifacts(token: string, cdc: string | null): PublicDocumentResponse["artifacts"] {
  const publicBase = `${env.PUBLIC_APP_BASE_URL.replace(/\/$/, "")}/public/d/${token}`;
  const available = Boolean(cdc);

  return {
    kude_pdf: {
      available,
      url: available ? `${publicBase}/kude.pdf` : null
    },
    xml: {
      available,
      url: available ? `${publicBase}/xml` : null
    }
  };
}

function buildEmailStatusMessage(status: EmailStatusResponse["status"], hasEmail: boolean): string | null {
  if (!hasEmail || status === "NOT_APPLICABLE") {
    return "Cliente sin email registrado; usar link publico o WhatsApp.";
  }

  if (status === "DELEGATED") {
    return "Envio de email delegado a Ventax FE.";
  }

  if (status === "SENT") {
    return "Ventax FE informo envio de email.";
  }

  if (status === "FAILED") {
    return "Ventax FE informo fallo de email; usar link publico o WhatsApp.";
  }

  return "Estado de email delegado no disponible.";
}
