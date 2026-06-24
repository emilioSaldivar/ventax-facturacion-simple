import crypto from "node:crypto";
import type { AuthResponse } from "@facturacion-simple/shared";
import { env } from "../../config/env";
import { HttpError } from "../../shared/errors/http-error";
import { sendAdminEmailRequiredNotification, sendOtpEmail } from "../../shared/email/email.service";
import { hashPassword, verifyPassword } from "../auth/password.service";
import { createRefreshToken, signAccessToken } from "../auth/token.service";
import type { OnboardingRepository, TycVersionRecord } from "./onboarding.types";

const OTP_DIGITS = 6;
const OTP_TTL_MINUTES = 15;
const OTP_MAX_ATTEMPTS = 5;
const OTP_COOLDOWN_SECONDS = 60;

export interface TycCurrentResponse {
  id: string;
  version: string;
  document_hash: string;
  document_content: string;
  published_at: string;
  context: {
    tenant_nombre: string | null;
    facturador_ruc: string | null;
    facturador_razon_social: string | null;
    plan_nombre: string | null;
    username: string;
    email: string | null;
  };
}

export interface OtpRequestResponse {
  otp_session_id: string;
  email_destino_ofuscado: string;
  expires_in_seconds: number;
}

export interface OnboardingCompleteInput {
  otpSessionId: string;
  otpCode: string;
  checkboxAceptado: boolean;
}

export async function getActiveTyc(
  userId: string,
  tenantId: string,
  repository: OnboardingRepository
): Promise<TycCurrentResponse> {
  const tyc = await repository.getActiveTycVersion();
  if (!tyc) {
    throw new HttpError(404, "NOT_FOUND", "No hay Terminos y Condiciones activos configurados.");
  }

  const [planSnapshot, userData] = await Promise.all([
    repository.getTenantPlanSnapshot(tenantId),
    repository.getUserEmail(userId)
  ]);

  return {
    id: tyc.id,
    version: tyc.version,
    document_hash: tyc.documentHash,
    document_content: tyc.documentContent,
    published_at: tyc.publishedAt.toISOString(),
    context: {
      tenant_nombre: planSnapshot.tenant_nombre || null,
      facturador_ruc: planSnapshot.facturador_ruc,
      facturador_razon_social: planSnapshot.facturador_razon_social,
      plan_nombre: planSnapshot.plan_nombre,
      username: userData.username,
      email: userData.email
    }
  };
}

export async function changePassword(
  userId: string,
  input: { newPassword: string; confirmPassword: string },
  repository: OnboardingRepository
): Promise<void> {
  if (input.newPassword !== input.confirmPassword) {
    throw new HttpError(400, "VALIDATION_ERROR", "Las contrasenas no coinciden.");
  }

  if (input.newPassword.length < 8 || input.newPassword.length > 200) {
    throw new HttpError(400, "VALIDATION_ERROR", "La contrasena debe tener entre 8 y 200 caracteres.");
  }

  await repository.upsertOnboardingSession(userId, true);

  const newPasswordHash = await hashPassword(input.newPassword);
  await repository.markPasswordStep(userId, newPasswordHash);
}

export async function requestOtp(
  userId: string,
  repository: OnboardingRepository
): Promise<OtpRequestResponse> {
  await repository.upsertOnboardingSession(userId, false);

  const userData = await repository.getUserEmail(userId);

  if (!userData.email) {
    sendAdminEmailRequiredNotification(userData.username, userData.displayName).catch(() => {});
    throw new HttpError(
      412,
      "EMAIL_REQUIRED",
      "No hay correo electronico configurado para tu cuenta. Ya notificamos a Ventax — te contactaremos a la brevedad."
    );
  }

  const lastOtp = await repository.getLastOtpSession(userId);
  if (lastOtp && lastOtp.revocadoAt === null && lastOtp.validadoAt === null) {
    const secondsSinceLastSend = (Date.now() - lastOtp.enviadoAt.getTime()) / 1000;
    if (secondsSinceLastSend < OTP_COOLDOWN_SECONDS) {
      const waitSeconds = Math.ceil(OTP_COOLDOWN_SECONDS - secondsSinceLastSend);
      throw new HttpError(
        429,
        "VALIDATION_ERROR",
        `Espera ${waitSeconds} segundos antes de solicitar un nuevo codigo.`
      );
    }
    await repository.revokeOtpSession(lastOtp.id);
  }

  const rawOtp = generateOtp();
  const otpHash = hashOtp(rawOtp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  const session = await repository.createOtpSession({
    usuarioId: userId,
    otpHash,
    emailDestino: userData.email,
    expiresAt
  });

  await sendOtpEmail(userData.email, rawOtp, userData.displayName ?? userData.username);

  return {
    otp_session_id: session.id,
    email_destino_ofuscado: ofuscarEmail(userData.email),
    expires_in_seconds: OTP_TTL_MINUTES * 60
  };
}

export async function completeOnboarding(
  userId: string,
  tenantId: string,
  input: OnboardingCompleteInput,
  ip: string | null,
  userAgent: string | null,
  repository: OnboardingRepository
): Promise<{ response: AuthResponse; refreshToken: { rawToken: string; tokenHash: string; expiresAt: Date } }> {
  if (!input.checkboxAceptado) {
    throw new HttpError(400, "VALIDATION_ERROR", "Debes aceptar los Terminos y Condiciones para continuar.");
  }

  const session = await repository.getOnboardingSession(userId);
  if (!session) {
    throw new HttpError(422, "VALIDATION_ERROR", "Sesion de activacion no encontrada. Solicita un nuevo codigo OTP.");
  }
  if (session.passwordChangeRequired && (!session.passwordStepAt || !session.newPasswordHash)) {
    throw new HttpError(422, "VALIDATION_ERROR", "Debes completar el cambio de contrasena antes de aceptar los terminos.");
  }

  const otpSession = await repository.getActiveOtpSession(userId, input.otpSessionId);
  if (!otpSession) {
    throw new HttpError(400, "VALIDATION_ERROR", "Codigo OTP invalido, expirado o ya utilizado. Solicita uno nuevo.");
  }

  const otpIsValid = otpSession.otpHash === hashOtp(input.otpCode);
  if (!otpIsValid) {
    const newCount = await repository.incrementOtpFailedAttempts(otpSession.id);
    if (newCount >= OTP_MAX_ATTEMPTS) {
      await repository.revokeOtpSession(otpSession.id);
      throw new HttpError(400, "VALIDATION_ERROR", "Demasiados intentos fallidos. Solicita un nuevo codigo OTP.");
    }
    throw new HttpError(400, "VALIDATION_ERROR", `Codigo incorrecto. Intentos restantes: ${OTP_MAX_ATTEMPTS - newCount}.`);
  }

  await repository.markOtpValidated(otpSession.id);

  const tyc = await repository.getActiveTycVersion();
  if (!tyc) {
    throw new HttpError(500, "INTERNAL_ERROR", "Error interno: no hay T&C activos.");
  }

  const planSnapshot = await repository.getTenantPlanSnapshot(tenantId);
  const userData = await repository.getUserEmail(userId);

  await repository.recordAcceptance({
    usuarioId: userId,
    tenantId,
    tycVersionId: tyc.id,
    tycVersionTexto: tyc.version,
    tycDocumentHash: tyc.documentHash,
    planSnapshot,
    usernameSnapshot: userData.username,
    emailSnapshot: userData.email,
    displayNameSnapshot: userData.displayName,
    ip,
    userAgent,
    otpSessionId: otpSession.id,
    otpEmailDestino: otpSession.emailDestino,
    otpEnviadoAt: otpSession.enviadoAt,
    otpValidadoAt: new Date(),
    otpIntentosFallidos: otpSession.intentosFallidos,
    passwordCambiadoEnFlujo: !!session.newPasswordHash
  });

  await repository.completeOnboarding({
    usuarioId: userId,
    newPasswordHash: session.newPasswordHash ?? undefined
  });

  const refreshToken = createRefreshToken();

  return {
    response: {
      access_token: signAccessToken({
        sub: userId,
        tenant_id: tenantId,
        username: userData.username,
        role: "OPERADOR_FACTURACION",
        scope: "full"
      }),
      token_type: "Bearer",
      expires_in: env.JWT_ACCESS_TTL_MINUTES * 60,
      user: {
        id: userId,
        username: userData.username,
        display_name: userData.displayName,
        role: "OPERADOR_FACTURACION"
      }
    },
    refreshToken
  };
}

function generateOtp(): string {
  const num = crypto.randomInt(0, 10 ** OTP_DIGITS);
  return num.toString().padStart(OTP_DIGITS, "0");
}

function hashOtp(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function ofuscarEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}
