import crypto from "node:crypto";
import { env } from "../../config/env";
import { HttpError } from "../../shared/errors/http-error";
import { logger } from "../../shared/logging/logger";
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
  facturasRepository: FacturaRepository,
  gateway: FiscalGateway,
  observability?: {
    requestId?: string;
    endpoint?: string;
  }
): Promise<FiscalArtifactResponse> {
  const record = await repository.findPublicByToken(token);

  if (!record) {
    throw new HttpError(404, "NOT_FOUND", "Artefacto publico no disponible.");
  }

  let documentUuid = record.documento.document_uuid;

  if (!documentUuid) {
    const cdc = record.documento.cdc;
    if (!cdc) {
      throw new HttpError(404, "NOT_FOUND", "Artefacto publico no disponible. Emision pendiente.");
    }

    // El documento fue emitido pero el UUID no está sincronizado localmente.
    // Resolverlo via CDC y persistirlo para no repetir la resolucion.
    let resolved: string;
    try {
      const byCdc = await gateway.resolveDocumentoByCdc(cdc);
      resolved = byCdc.document_uuid;
    } catch (error) {
      if (error instanceof FiscalGatewayError) {
        logger.warn(
          {
            event: "document_uuid_resolution_failed",
            requestId: observability?.requestId ?? null,
            occurred_at: new Date().toISOString(),
            cdc,
            gateway_code: error.code
          },
          "Could not resolve document_uuid from CDC"
        );
        throw new HttpError(404, "NOT_FOUND", "Artefacto publico no disponible. UUID fiscal no resuelto.");
      }
      throw error;
    }

    facturasRepository
      .bulkUpdateDocumentUuidByCdc([{ cdc, documentUuid: resolved }])
      .catch(() => {
        // fallo en persistencia no bloquea la respuesta
      });

    documentUuid = resolved;
  }

  try {
    return artifact === "kude_pdf"
      ? await gateway.getKudePdf(documentUuid)
      : await gateway.getXml(documentUuid);
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      logger.error(
        {
          event: "fiscal_artifact_fetch_failed",
          requestId: observability?.requestId ?? null,
          occurred_at: new Date().toISOString(),
          endpoint: observability?.endpoint ?? null,
          artifact,
          document_uuid: documentUuid,
          numero_fiscal: record.documento.numero_fiscal,
          documento_estado: record.documento.estado,
          gateway_code: error.code,
          gateway_details: error.details ?? null
        },
        "Fiscal artifact fetch failed"
      );

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

export function renderPublicDocumentHtml(documento: PublicDocumentResponse): string {
  const title = documento.numero_fiscal ? `Comprobante ${documento.numero_fiscal}` : "Comprobante pendiente";
  const kudeUrl = documento.artifacts.kude_pdf.available ? documento.artifacts.kude_pdf.url : null;
  const xmlUrl = documento.artifacts.xml.available ? documento.artifacts.xml.url : null;

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color: #18242a;
        background: #f4f8fa;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      * { box-sizing: border-box; }
      body { margin: 0; }
      main {
        min-height: 100vh;
        padding: 18px;
        background: linear-gradient(180deg, rgb(7 167 225 / 0.1), transparent 280px), #f4f8fa;
      }
      .shell {
        display: grid;
        gap: 14px;
        width: min(100%, 760px);
        margin: 0 auto;
      }
      .brand {
        display: inline-flex;
        align-items: center;
        width: fit-content;
        min-height: 42px;
      }
      .brand img {
        display: block;
        width: 142px;
        height: auto;
      }
      .panel {
        display: grid;
        gap: 14px;
        border: 1px solid #d7e5ea;
        border-radius: 8px;
        background: #ffffff;
        padding: 16px;
      }
      .heading {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }
      h1, h2, p { margin-top: 0; }
      h1 { margin-bottom: 6px; font-size: 26px; line-height: 1.12; }
      h2 { margin: 0; font-size: 18px; }
      .muted { margin: 0; color: #65747b; overflow-wrap: anywhere; }
      .pill {
        flex: 0 0 auto;
        border-radius: 999px;
        background: ${documento.estado === "EMITIDA" ? "#e7f7ef" : "#fff1e8"};
        color: ${documento.estado === "EMITIDA" ? "#087f5b" : "#9a3412"};
        padding: 7px 10px;
        font-size: 12px;
        font-weight: 900;
      }
      dl {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin: 0;
      }
      dt { color: #65747b; font-size: 12px; font-weight: 800; }
      dd { margin: 2px 0 0; font-size: 17px; font-weight: 900; overflow-wrap: anywhere; }
      .total {
        border-radius: 8px;
        background: #eef7fb;
        padding: 14px;
      }
      .total dd { font-size: 26px; }
      .actions {
        display: grid;
        grid-template-columns: 1fr;
        gap: 10px;
      }
      a {
        display: grid;
        min-height: 48px;
        place-items: center;
        border: 1px solid #c6d9df;
        border-radius: 8px;
        background: #ffffff;
        color: #006b86;
        font-weight: 900;
        line-height: 1.15;
        padding: 8px 12px;
        text-decoration: none;
      }
      a.primary { border-color: #07a7e1; background: #07a7e1; color: #ffffff; }
      a.disabled { pointer-events: none; color: #7a8b92; opacity: 0.58; }
      @media (min-width: 620px) {
        main { padding: 28px; }
        .actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="shell" aria-labelledby="public-document-title">
        <div class="brand">
          <img src="/app/brand/VENTAX-PRINCIPAL.svg" alt="Ventax" width="142" height="46">
        </div>
        <article class="panel">
          <div class="heading">
            <div>
              <h1 id="public-document-title">${escapeHtml(title)}</h1>
              <p class="muted">${escapeHtml(documento.facturador.razon_social)} · RUC ${escapeHtml(documento.facturador.ruc)}</p>
            </div>
            <span class="pill">${escapeHtml(formatPublicEstado(documento.estado))}</span>
          </div>
          <dl>
            <div>
              <dt>Cliente</dt>
              <dd>${escapeHtml(documento.cliente.razon_social)}</dd>
            </div>
            <div>
              <dt>Documento</dt>
              <dd>${escapeHtml(documento.cliente.documento)}</dd>
            </div>
            <div>
              <dt>Referencia</dt>
              <dd>${escapeHtml(documento.numero_fiscal ?? "pendiente")}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>${escapeHtml(formatPublicEmailStatus(documento.email_status))}</dd>
            </div>
          </dl>
          <div class="total">
            <dt>Total</dt>
            <dd>${escapeHtml(formatGuaranies(documento.totals.total))}</dd>
          </div>
          <div class="actions">
            <a class="primary${kudeUrl ? "" : " disabled"}" href="${escapeAttribute(kudeUrl ?? "#")}">Ver factura PDF</a>
            <a class="${xmlUrl ? "" : "disabled"}" href="${escapeAttribute(xmlUrl ?? "#")}">Descargar documento electronico</a>
          </div>
          <p class="muted">La factura PDF es la representacion visual de la factura electronica.</p>
        </article>
      </section>
    </main>
  </body>
</html>`;
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
    return "El documento se enviara en el correo del cliente.";
  }

  if (status === "SENT") {
    return "Ventax informo envio de email.";
  }

  if (status === "FAILED") {
    return "Ventax informo fallo de envio (email no cargado o incorrecto); Usar link publico o WhatsApp.";
  }

  return "Estado de email delegado no disponible.";
}

function formatPublicEstado(estado: PublicDocumentResponse["estado"]): string {
  const labels: Record<PublicDocumentResponse["estado"], string> = {
    EMITIENDO: "Emitiendo",
    EMITIDA: "Emitida",
    PENDIENTE_SIFEN: "Pendiente SIFEN",
    RECHAZADA: "Rechazada",
    ERROR_OPERATIVO: "Error operativo",
    ERROR_TEMPORAL: "Error temporal",
    ANULADA: "Anulada"
  };
  return labels[estado];
}

function formatPublicEmailStatus(status: PublicDocumentResponse["email_status"]): string {
  if (status === "DELEGATED") {
    return "Delegado a Ventax FE";
  }
  if (status === "SENT") {
    return "Enviado";
  }
  if (status === "FAILED") {
    return "Fallido";
  }
  if (status === "NOT_APPLICABLE") {
    return "Sin email";
  }
  return "No disponible";
}

function formatGuaranies(value: number): string {
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: "PYG",
    maximumFractionDigits: 0
  }).format(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
