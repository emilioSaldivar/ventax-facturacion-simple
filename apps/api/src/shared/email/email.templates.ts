import type { EmailTemplate, OtpPurpose } from "./email.types";

// Isotipo Ventax (la X) — un solo <polygon>, compatible con todos los clientes de email
const VENTAX_ISO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 749.04 766.14" width="36" height="37" role="img" aria-label="Ventax" style="display:inline-block;vertical-align:middle;"><polygon fill="#ffffff" points="683.23 194.95 749.04 194.95 704.56 .99 388.55 194.95 482.22 194.95 396.73 321.91 339.37 193.48 142.44 193.48 265.73 428.08 114.87 619.97 0 765.15 213.1 765.15 360.35 544.8 411.29 676.38 619.35 676.38 489.21 434.08 683.23 194.95"/></svg>`;

const BRAND_COLOR = "#07a7e1";
const BRAND_NAME = "Ventax Facturación Simple";

const OTP_PURPOSE_CONFIG: Record<OtpPurpose, { subject: string; headline: string; description: string; preheader: string }> = {
  onboarding: {
    subject: "Tu código de verificación — Ventax Facturación Simple",
    headline: "Verificación de identidad",
    description: "Ingresá este código en la aplicación para confirmar la aceptación de los <strong>Términos y Condiciones</strong> de Ventax Facturación Simple.",
    preheader: "Tu código de verificación para activar tu cuenta."
  },
  password_reset: {
    subject: "Código para restablecer tu contraseña — Ventax",
    headline: "Restablecer contraseña",
    description: "Ingresá este código para continuar con el proceso de restablecimiento de tu contraseña.",
    preheader: "Código para restablecer tu contraseña en Ventax."
  }
};

export function otpTemplate(otpCode: string, displayName: string, purpose: OtpPurpose): EmailTemplate {
  const config = OTP_PURPOSE_CONFIG[purpose];
  const safeDisplayName = escapeHtml(displayName);
  const digits = otpCode.split("");

  const html = buildLayout({
    preheader: config.preheader,
    headerContent: `
      ${VENTAX_ISO_SVG}
      <span style="color:#ffffff;font-size:17px;font-weight:bold;vertical-align:middle;margin-left:10px;letter-spacing:-0.3px;">${escapeHtml(BRAND_NAME)}</span>
    `,
    bodyContent: `
      <p style="margin:0 0 6px 0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:${BRAND_COLOR};">${escapeHtml(config.headline)}</p>
      <p style="margin:0 0 20px 0;font-size:16px;color:#111827;">Hola, <strong>${safeDisplayName}</strong></p>
      <p style="margin:0 0 28px 0;font-size:14px;line-height:1.6;color:#4b5563;">${config.description}</p>

      ${buildOtpDigitGrid(digits)}

      <p style="margin:20px 0 8px 0;font-size:13px;color:#6b7280;text-align:center;">
        Válido por <strong style="color:#374151;">15 minutos</strong>
      </p>
      <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
        Si no solicitaste este código, ignorá este mensaje con seguridad.
      </p>
    `
  });

  const text = buildTextVersion(otpCode, displayName, config.description.replace(/<[^>]+>/g, ""));

  return { subject: config.subject, html, text };
}

function buildOtpDigitGrid(digits: string[]): string {
  const cells = digits
    .map(
      (d) =>
        `<td style="width:48px;height:60px;background:#f0f9ff;border:2px solid ${BRAND_COLOR};border-radius:10px;text-align:center;vertical-align:middle;font-size:30px;font-weight:700;color:#0e2430;font-family:'Courier New',Courier,monospace;line-height:1;">${escapeHtml(d)}</td>`
    )
    .join(`<td style="width:6px;"></td>`);

  return `
    <table cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto;">
      <tr>${cells}</tr>
    </table>
  `;
}

function buildLayout({ preheader, headerContent, bodyContent }: {
  preheader: string;
  headerContent: string;
  bodyContent: string;
}): string {
  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:#f3f4f6;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

  <!-- Preheader oculto -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.07);">

          <!-- Header -->
          <tr>
            <td style="background:${BRAND_COLOR};padding:22px 32px;text-align:center;">
              ${headerContent}
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 28px 32px;">
              ${bodyContent}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:14px 32px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                <strong style="color:#6b7280;">${escapeHtml(BRAND_NAME)}</strong>
                &nbsp;·&nbsp;
                <a href="mailto:facturacion@ventax.app" style="color:#9ca3af;text-decoration:none;">facturacion@ventax.app</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

function buildTextVersion(otpCode: string, displayName: string, purposeDescription: string): string {
  return [
    `Hola, ${displayName}`,
    "",
    purposeDescription,
    "",
    "Tu código de verificación:",
    "",
    `  ${otpCode.split("").join("  ")}`,
    "",
    "Válido por 15 minutos.",
    "Si no solicitaste este código, ignorá este mensaje.",
    "",
    `— ${BRAND_NAME}`,
    "facturacion@ventax.app"
  ].join("\n");
}

export function adminEmailRequiredTemplate(username: string, displayName: string | null): EmailTemplate {
  const safeUsername = escapeHtml(username);
  const safeName = escapeHtml(displayName ?? username);

  const html = buildLayout({
    preheader: `El usuario ${username} necesita su correo configurado para activar su cuenta.`,
    headerContent: `
      ${VENTAX_ISO_SVG}
      <span style="color:#ffffff;font-size:17px;font-weight:bold;vertical-align:middle;margin-left:10px;letter-spacing:-0.3px;">${escapeHtml(BRAND_NAME)}</span>
    `,
    bodyContent: `
      <p style="margin:0 0 6px 0;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:#f59e0b;">Correo faltante — Accion requerida</p>
      <p style="margin:0 0 20px 0;font-size:16px;color:#111827;">Solicitud de configuracion de email</p>
      <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#4b5563;">
        El siguiente usuario intento completar su activacion pero <strong>no tiene correo electronico configurado</strong> en su cuenta.
      </p>
      <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;margin:0 0 24px 0;">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 8px 0;font-size:13px;color:#6b7280;">Usuario</p>
            <p style="margin:0;font-size:16px;font-weight:700;color:#111827;font-family:'Courier New',monospace;">${safeUsername}</p>
            ${displayName ? `<p style="margin:4px 0 0 0;font-size:13px;color:#6b7280;">${safeName}</p>` : ""}
          </td>
        </tr>
      </table>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">
        Contacta al usuario para obtener su correo electronico y configuralo en el backoffice desde <strong>Gestion → Usuarios → ${safeUsername}</strong>.
      </p>
    `
  });

  const text = [
    "Solicitud de configuracion de email — Ventax Facturacion Simple",
    "",
    `El usuario "${username}"${displayName ? ` (${displayName})` : ""} intento completar su activacion pero no tiene correo electronico configurado.`,
    "",
    "Accion requerida: contacta al usuario y configura su email en el backoffice.",
    "",
    `— ${BRAND_NAME}`,
    "facturacion@ventax.app"
  ].join("\n");

  return {
    subject: `[Ventax] Usuario sin email: ${username}`,
    html,
    text
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
