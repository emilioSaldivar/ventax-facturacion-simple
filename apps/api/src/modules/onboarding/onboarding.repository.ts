import { pool } from "../../db/pool";
import type {
  OnboardingRepository,
  OnboardingSessionRecord,
  OtpSessionRecord,
  PlanSnapshotData,
  TycAceptacionRecord,
  TycVersionRecord
} from "./onboarding.types";

export class PgOnboardingRepository implements OnboardingRepository {
  async getActiveTycVersion(): Promise<TycVersionRecord | null> {
    const result = await pool.query<{
      id: string;
      version: string;
      document_hash: string;
      document_content: string;
      published_at: Date;
    }>(`select id, version, document_hash, document_content, published_at from tyc_versiones where activo = true limit 1`);

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      version: row.version,
      documentHash: row.document_hash,
      documentContent: row.document_content,
      publishedAt: row.published_at
    };
  }

  async getOnboardingSession(usuarioId: string): Promise<OnboardingSessionRecord | null> {
    const result = await pool.query<{
      id: string;
      usuario_id: string;
      password_step_at: Date | null;
      new_password_hash: string | null;
      password_change_required: boolean;
      expires_at: Date;
      created_at: Date;
    }>(
      `select id, usuario_id, password_step_at, new_password_hash, password_change_required, expires_at, created_at
       from onboarding_sessions
       where usuario_id = $1 and expires_at > now()`,
      [usuarioId]
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      usuarioId: row.usuario_id,
      passwordStepAt: row.password_step_at,
      newPasswordHash: row.new_password_hash,
      passwordChangeRequired: row.password_change_required,
      expiresAt: row.expires_at,
      createdAt: row.created_at
    };
  }

  async upsertOnboardingSession(usuarioId: string, passwordChangeRequired: boolean): Promise<OnboardingSessionRecord> {
    const result = await pool.query<{
      id: string;
      usuario_id: string;
      password_step_at: Date | null;
      new_password_hash: string | null;
      password_change_required: boolean;
      expires_at: Date;
      created_at: Date;
    }>(
      `insert into onboarding_sessions (usuario_id, password_change_required, expires_at)
       values ($1, $2, now() + interval '2 hours')
       on conflict (usuario_id) do update
         set expires_at = now() + interval '2 hours'
       returning id, usuario_id, password_step_at, new_password_hash, password_change_required, expires_at, created_at`,
      [usuarioId, passwordChangeRequired]
    );

    const row = result.rows[0]!;
    return {
      id: row.id,
      usuarioId: row.usuario_id,
      passwordStepAt: row.password_step_at,
      newPasswordHash: row.new_password_hash,
      passwordChangeRequired: row.password_change_required,
      expiresAt: row.expires_at,
      createdAt: row.created_at
    };
  }

  async markPasswordStep(usuarioId: string, newPasswordHash: string): Promise<void> {
    await pool.query(
      `update onboarding_sessions
       set password_step_at = now(), new_password_hash = $2
       where usuario_id = $1`,
      [usuarioId, newPasswordHash]
    );
  }

  async createOtpSession(input: {
    usuarioId: string;
    otpHash: string;
    emailDestino: string;
    expiresAt: Date;
  }): Promise<OtpSessionRecord> {
    const result = await pool.query<{
      id: string;
      usuario_id: string;
      otp_hash: string;
      email_destino: string;
      intentos_fallidos: number;
      enviado_at: Date;
      validado_at: Date | null;
      revocado_at: Date | null;
      expires_at: Date;
    }>(
      `insert into tyc_otp_sessions (usuario_id, otp_hash, email_destino, expires_at)
       values ($1, $2, $3, $4)
       returning id, usuario_id, otp_hash, email_destino, intentos_fallidos, enviado_at, validado_at, revocado_at, expires_at`,
      [input.usuarioId, input.otpHash, input.emailDestino, input.expiresAt]
    );

    const row = result.rows[0]!;
    return {
      id: row.id,
      usuarioId: row.usuario_id,
      otpHash: row.otp_hash,
      emailDestino: row.email_destino,
      intentosFallidos: row.intentos_fallidos,
      enviadoAt: row.enviado_at,
      validadoAt: row.validado_at,
      revocadoAt: row.revocado_at,
      expiresAt: row.expires_at
    };
  }

  async getActiveOtpSession(usuarioId: string, sessionId: string): Promise<OtpSessionRecord | null> {
    const result = await pool.query<{
      id: string;
      usuario_id: string;
      otp_hash: string;
      email_destino: string;
      intentos_fallidos: number;
      enviado_at: Date;
      validado_at: Date | null;
      revocado_at: Date | null;
      expires_at: Date;
    }>(
      `select id, usuario_id, otp_hash, email_destino, intentos_fallidos, enviado_at, validado_at, revocado_at, expires_at
       from tyc_otp_sessions
       where id = $1
         and usuario_id = $2
         and revocado_at is null
         and validado_at is null
         and expires_at > now()`,
      [sessionId, usuarioId]
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      usuarioId: row.usuario_id,
      otpHash: row.otp_hash,
      emailDestino: row.email_destino,
      intentosFallidos: row.intentos_fallidos,
      enviadoAt: row.enviado_at,
      validadoAt: row.validado_at,
      revocadoAt: row.revocado_at,
      expiresAt: row.expires_at
    };
  }

  async getLastOtpSession(usuarioId: string): Promise<OtpSessionRecord | null> {
    const result = await pool.query<{
      id: string;
      usuario_id: string;
      otp_hash: string;
      email_destino: string;
      intentos_fallidos: number;
      enviado_at: Date;
      validado_at: Date | null;
      revocado_at: Date | null;
      expires_at: Date;
    }>(
      `select id, usuario_id, otp_hash, email_destino, intentos_fallidos, enviado_at, validado_at, revocado_at, expires_at
       from tyc_otp_sessions
       where usuario_id = $1
       order by enviado_at desc
       limit 1`,
      [usuarioId]
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: row.id,
      usuarioId: row.usuario_id,
      otpHash: row.otp_hash,
      emailDestino: row.email_destino,
      intentosFallidos: row.intentos_fallidos,
      enviadoAt: row.enviado_at,
      validadoAt: row.validado_at,
      revocadoAt: row.revocado_at,
      expiresAt: row.expires_at
    };
  }

  async incrementOtpFailedAttempts(sessionId: string): Promise<number> {
    const result = await pool.query<{ intentos_fallidos: number }>(
      `update tyc_otp_sessions set intentos_fallidos = intentos_fallidos + 1 where id = $1 returning intentos_fallidos`,
      [sessionId]
    );
    return result.rows[0]?.intentos_fallidos ?? 1;
  }

  async markOtpValidated(sessionId: string): Promise<void> {
    await pool.query(`update tyc_otp_sessions set validado_at = now() where id = $1`, [sessionId]);
  }

  async revokeOtpSession(sessionId: string): Promise<void> {
    await pool.query(`update tyc_otp_sessions set revocado_at = now() where id = $1`, [sessionId]);
  }

  async recordAcceptance(input: {
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
  }): Promise<TycAceptacionRecord> {
    const result = await pool.query<{ id: string; usuario_id: string; tenant_id: string; tyc_version_id: string; aceptado_at: Date }>(
      `insert into tyc_aceptaciones (
        usuario_id, tenant_id, tyc_version_id,
        tyc_version_texto, tyc_document_hash, plan_snapshot,
        username_snapshot, email_snapshot, display_name_snapshot,
        ip, user_agent,
        otp_session_id, otp_email_destino, otp_enviado_at, otp_validado_at, otp_intentos_fallidos,
        password_cambiado_en_flujo
      ) values (
        $1, $2, $3,
        $4, $5, $6,
        $7, $8, $9,
        $10::inet, $11,
        $12, $13, $14, $15, $16,
        $17
      ) returning id, usuario_id, tenant_id, tyc_version_id, aceptado_at`,
      [
        input.usuarioId,
        input.tenantId,
        input.tycVersionId,
        input.tycVersionTexto,
        input.tycDocumentHash,
        JSON.stringify(input.planSnapshot),
        input.usernameSnapshot,
        input.emailSnapshot,
        input.displayNameSnapshot,
        input.ip,
        input.userAgent,
        input.otpSessionId,
        input.otpEmailDestino,
        input.otpEnviadoAt,
        input.otpValidadoAt,
        input.otpIntentosFallidos,
        input.passwordCambiadoEnFlujo
      ]
    );

    const row = result.rows[0]!;
    return {
      id: row.id,
      usuarioId: row.usuario_id,
      tenantId: row.tenant_id,
      tycVersionId: row.tyc_version_id,
      aceptadoAt: row.aceptado_at
    };
  }

  async completeOnboarding(input: { usuarioId: string; newPasswordHash?: string }): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("begin");
      if (input.newPasswordHash) {
        await client.query(
          `update usuarios set password_hash = $2, must_change_password = false where id = $1`,
          [input.usuarioId, input.newPasswordHash]
        );
      }
      await client.query(`delete from onboarding_sessions where usuario_id = $1`, [input.usuarioId]);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async getTenantPlanSnapshot(tenantId: string): Promise<PlanSnapshotData> {
    const result = await pool.query<{
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
    }>(
      `select
        t.id as tenant_id,
        t.nombre as tenant_nombre,
        p.id as plan_id,
        p.codigo as plan_codigo,
        p.nombre as plan_nombre,
        ts.id as suscripcion_id,
        ts.estado as suscripcion_estado,
        ts.fecha_inicio::text as suscripcion_fecha_inicio,
        f.id as facturador_id,
        f.ruc as facturador_ruc,
        f.razon_social as facturador_razon_social,
        f.nombre_fantasia as facturador_nombre_fantasia,
        f.telefono as facturador_telefono
      from tenants t
      left join tenant_suscripciones ts on ts.tenant_id = t.id and ts.activo = true and ts.deleted_at is null
      left join planes p on p.id = ts.plan_id
      left join facturadores f on f.tenant_id = t.id and f.activo = true and f.deleted_at is null
      where t.id = $1
      order by f.created_at asc
      limit 1`,
      [tenantId]
    );

    const row = result.rows[0];
    if (!row) {
      return {
        tenant_id: tenantId,
        tenant_nombre: "",
        plan_id: null,
        plan_codigo: null,
        plan_nombre: null,
        suscripcion_id: null,
        suscripcion_estado: null,
        suscripcion_fecha_inicio: null,
        facturador_id: null,
        facturador_ruc: null,
        facturador_razon_social: null,
        facturador_nombre_fantasia: null,
        facturador_telefono: null
      };
    }

    return {
      tenant_id: row.tenant_id,
      tenant_nombre: row.tenant_nombre,
      plan_id: row.plan_id,
      plan_codigo: row.plan_codigo,
      plan_nombre: row.plan_nombre,
      suscripcion_id: row.suscripcion_id,
      suscripcion_estado: row.suscripcion_estado,
      suscripcion_fecha_inicio: row.suscripcion_fecha_inicio,
      facturador_id: row.facturador_id,
      facturador_ruc: row.facturador_ruc,
      facturador_razon_social: row.facturador_razon_social,
      facturador_nombre_fantasia: row.facturador_nombre_fantasia,
      facturador_telefono: row.facturador_telefono
    };
  }

  async getUserEmail(usuarioId: string): Promise<{ email: string | null; displayName: string | null; username: string }> {
    const result = await pool.query<{ email: string | null; display_name: string | null; username: string }>(
      `select email, display_name, username::text from usuarios where id = $1`,
      [usuarioId]
    );
    const row = result.rows[0];
    return {
      email: row?.email ?? null,
      displayName: row?.display_name ?? null,
      username: row?.username ?? ""
    };
  }
}

export const onboardingRepository = new PgOnboardingRepository();
