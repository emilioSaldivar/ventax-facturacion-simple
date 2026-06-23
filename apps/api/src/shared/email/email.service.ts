import nodemailer from "nodemailer";
import { Resend } from "resend";
import { env } from "../../config/env";
import { logger } from "../logging/logger";
import { otpTemplate } from "./email.templates";
import type { EmailTemplate, OtpPurpose } from "./email.types";

export type { EmailTemplate, OtpPurpose };

let resendClient: Resend | null = null;
let smtpTransport: nodemailer.Transporter | null = null;

function getResend(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  if (!resendClient) resendClient = new Resend(env.RESEND_API_KEY);
  return resendClient;
}

function getSmtp(): nodemailer.Transporter | null {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) return null;
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
    });
  }
  return smtpTransport;
}

export async function sendEmail(to: string, template: EmailTemplate): Promise<void> {
  const resend = getResend();
  if (resend) {
    const from = `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>`;
    await resend.emails.send({ from, to, subject: template.subject, html: template.html, text: template.text });
    return;
  }

  const smtp = getSmtp();
  if (smtp) {
    try {
      await smtp.sendMail({
        from: `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>`,
        replyTo: env.SMTP_REPLY_TO,
        to,
        subject: template.subject,
        html: template.html,
        text: template.text
      });
      return;
    } catch (smtpError) {
      logger.warn(
        { to, subject: template.subject, text: template.text, err: smtpError },
        "[SMTP] Envio fallo — email logueado en texto plano:"
      );
      return;
    }
  }

  logger.info(
    { to, subject: template.subject, text: template.text },
    "[DEV] Email no enviado — RESEND_API_KEY y SMTP_HOST no configurados:"
  );
}

export async function sendOtpEmail(
  to: string,
  otpCode: string,
  displayName: string,
  purpose: OtpPurpose = "onboarding"
): Promise<void> {
  await sendEmail(to, otpTemplate(otpCode, displayName, purpose));
}
