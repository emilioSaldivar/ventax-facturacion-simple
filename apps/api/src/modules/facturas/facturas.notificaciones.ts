import { env } from "../../config/env";
import { sendEmail } from "../../shared/email/email.service";
import { accionRequeridaTemplate, requiereSoporteTemplate } from "../../shared/email/email.templates";
import { logger } from "../../shared/logging/logger";
import type { DocumentoAccionSoportePayload, DocumentoResponse, FacturaRepository } from "./facturas.types";

/**
 * Notifica por correo cuando la verificacion fiscal (automatica o manual) deja un
 * documento en REQUIERE_ACCION o REQUIERE_SOPORTE (SPEC_BACKOFFICE_ALINEACION_FE_v0.2,
 * seccion 2.9). Destinatarios: usuarios operativos del facturador con email +
 * email_administrativo del tenant (repository.getNotificationRecipients) + el correo
 * interno de Ventax (VENTAX_NOTIFY_EMAIL), que recibe ambos tipos de notificacion.
 *
 * El llamador es responsable de aplicar el gate anti-spam (accion_notificada_at) antes
 * y despues de invocar esta funcion — esta funcion solo envia, no decide si debe enviar.
 */
export async function notifyAccionRequerida(
  facturadorId: string,
  documento: DocumentoResponse,
  detalle: { titulo: string; descripcion: string; soporte_payload: DocumentoAccionSoportePayload | null },
  esSoporte: boolean,
  repository: FacturaRepository
): Promise<void> {
  const recipients = await resolveRecipients(facturadorId, repository);
  if (recipients.length === 0) {
    logger.warn({ documentoId: documento.id, facturadorId }, "notificacion de accion fiscal: sin destinatarios, no se envia");
    return;
  }

  const appUrl = `${env.PUBLIC_APP_BASE_URL.replace(/\/+$/, "")}/app/`;
  const template =
    esSoporte && detalle.soporte_payload
      ? requiereSoporteTemplate({
          documentoTipo: documento.tipo,
          numeroFiscal: documento.numero_fiscal,
          titulo: detalle.titulo,
          descripcion: detalle.descripcion,
          appUrl,
          soportePayload: detalle.soporte_payload
        })
      : accionRequeridaTemplate({
          documentoTipo: documento.tipo,
          numeroFiscal: documento.numero_fiscal,
          titulo: detalle.titulo,
          descripcion: detalle.descripcion,
          appUrl
        });

  await Promise.all(recipients.map((to) => sendEmail(to, template)));
}

async function resolveRecipients(facturadorId: string, repository: FacturaRepository): Promise<string[]> {
  const operativos = await repository.getNotificationRecipients(facturadorId);
  const set = new Set(operativos.map((email) => email.trim().toLowerCase()).filter(Boolean));
  if (env.VENTAX_NOTIFY_EMAIL) {
    set.add(env.VENTAX_NOTIFY_EMAIL.trim().toLowerCase());
  }
  return Array.from(set);
}
