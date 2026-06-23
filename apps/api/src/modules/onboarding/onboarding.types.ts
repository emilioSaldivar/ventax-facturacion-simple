export interface TycVersionRecord {
  id: string;
  version: string;
  documentHash: string;
  documentContent: string;
  publishedAt: Date;
}

export interface OnboardingSessionRecord {
  id: string;
  usuarioId: string;
  passwordStepAt: Date | null;
  newPasswordHash: string | null;
  passwordChangeRequired: boolean;
  expiresAt: Date;
  createdAt: Date;
}

export interface OtpSessionRecord {
  id: string;
  usuarioId: string;
  otpHash: string;
  emailDestino: string;
  intentosFallidos: number;
  enviadoAt: Date;
  validadoAt: Date | null;
  revocadoAt: Date | null;
  expiresAt: Date;
}

export interface PlanSnapshotData {
  tenant_id: string;
  tenant_nombre: string;
  plan_id: string | null;
  plan_codigo: string | null;
  plan_nombre: string | null;
  suscripcion_id: string | null;
  suscripcion_estado: string | null;
  suscripcion_fecha_inicio: string | null;
  facturador_id: string | null;
  facturador_ruc: string | null;
  facturador_razon_social: string | null;
  facturador_nombre_fantasia: string | null;
  facturador_telefono: string | null;
}

export interface TycAceptacionRecord {
  id: string;
  usuarioId: string;
  tenantId: string;
  tycVersionId: string;
  aceptadoAt: Date;
}

export interface OnboardingRepository {
  getActiveTycVersion(): Promise<TycVersionRecord | null>;
  getOnboardingSession(usuarioId: string): Promise<OnboardingSessionRecord | null>;
  upsertOnboardingSession(usuarioId: string, passwordChangeRequired: boolean): Promise<OnboardingSessionRecord>;
  markPasswordStep(usuarioId: string, newPasswordHash: string): Promise<void>;
  createOtpSession(input: {
    usuarioId: string;
    otpHash: string;
    emailDestino: string;
    expiresAt: Date;
  }): Promise<OtpSessionRecord>;
  getActiveOtpSession(usuarioId: string, sessionId: string): Promise<OtpSessionRecord | null>;
  getLastOtpSession(usuarioId: string): Promise<OtpSessionRecord | null>;
  incrementOtpFailedAttempts(sessionId: string): Promise<number>;
  markOtpValidated(sessionId: string): Promise<void>;
  revokeOtpSession(sessionId: string): Promise<void>;
  recordAcceptance(input: {
    usuarioId: string;
    tenantId: string;
    tycVersionId: string;
    tycVersionTexto: string;
    tycDocumentHash: string;
    planSnapshot: PlanSnapshotData;
    usernameSnapshot: string;
    emailSnapshot: string | null;
    displayNameSnapshot: string | null;
    ip: string | null;
    userAgent: string | null;
    otpSessionId: string;
    otpEmailDestino: string;
    otpEnviadoAt: Date;
    otpValidadoAt: Date;
    otpIntentosFallidos: number;
    passwordCambiadoEnFlujo: boolean;
  }): Promise<TycAceptacionRecord>;
  completeOnboarding(input: {
    usuarioId: string;
    newPasswordHash?: string;
  }): Promise<void>;
  getTenantPlanSnapshot(tenantId: string): Promise<PlanSnapshotData>;
  getUserEmail(usuarioId: string): Promise<{ email: string | null; displayName: string | null; username: string }>;
}
