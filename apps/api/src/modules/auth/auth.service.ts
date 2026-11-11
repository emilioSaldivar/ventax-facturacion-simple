import type { AuthResponse, PerfilDisponible } from "@facturacion-simple/shared";
import type { AuditRepository } from "../../shared/audit/audit.repository";
import { env } from "../../config/env";
import { HttpError } from "../../shared/errors/http-error";
import { verifyPassword } from "./password.service";
import {
  createRefreshToken,
  hashRefreshToken,
  PERFIL_SELECT_TTL_SECONDS,
  signAccessToken,
  signOnboardingToken,
  signPerfilSelectToken
} from "./token.service";
import type { AuthenticatedUser, AuthRepository, LoginInput, LoginUserRecord, RefreshTokenRecord } from "./auth.types";

const maxFailedAttempts = 5;

export interface LoginResult {
  response: AuthResponse;
  refreshToken: RefreshTokenRecord | null;
}

export interface RefreshResult {
  response: AuthResponse;
  /** null cuando la sesion queda en SELECT_PERFIL: la ruta limpia la cookie (D-8). */
  refreshToken: RefreshTokenRecord | null;
}

/** SPEC_MULTIPERFIL_USUARIO_v0.1: de donde salen los perfiles emitibles del usuario. */
export interface PerfilesSource {
  listPerfilesDisponibles(userId: string): Promise<PerfilDisponible[]>;
}

type SesionUser = Pick<LoginUserRecord, "id" | "tenantId" | "username" | "displayName" | "role">;

function userSummary(user: SesionUser) {
  return { id: user.id, username: user.username, display_name: user.displayName, role: user.role };
}

function sesionCompleta(user: SesionUser, uoc: string | null): AuthResponse {
  return {
    access_token: signAccessToken({
      sub: user.id,
      tenant_id: user.tenantId,
      username: user.username,
      role: user.role,
      scope: "full",
      ...(uoc ? { uoc } : {})
    }),
    token_type: "Bearer",
    expires_in: env.JWT_ACCESS_TTL_MINUTES * 60,
    user: userSummary(user)
  };
}

function sesionPerfilSelect(user: SesionUser, perfiles: PerfilDisponible[]): AuthResponse {
  return {
    access_token: signPerfilSelectToken({ sub: user.id, tenant_id: user.tenantId, username: user.username, role: user.role }),
    token_type: "Bearer",
    expires_in: PERFIL_SELECT_TTL_SECONDS,
    user: userSummary(user),
    pending_actions: ["SELECT_PERFIL"],
    perfiles
  };
}

/**
 * SPEC_MULTIPERFIL_USUARIO_v0.1 §B.1. Una configuracion emitible: sesion completa con `uoc`.
 * Varias: token `perfil_select` sin refresh (D-8). Ninguna: sesion completa sin `uoc`, como antes.
 * Sin `perfiles` (llamadores anteriores) se comporta exactamente como antes de esta SPEC.
 */
export async function emitirSesion(
  user: SesionUser,
  input: { ip?: string; userAgent?: string },
  repository: AuthRepository,
  perfiles?: PerfilesSource
): Promise<LoginResult> {
  const lista = perfiles ? await perfiles.listPerfilesDisponibles(user.id) : [];
  if (lista.length > 1) {
    return { response: sesionPerfilSelect(user, lista), refreshToken: null };
  }

  const uoc = lista.length === 1 ? lista[0]!.operacion_config_id : null;
  const refreshToken = createRefreshToken();
  await repository.createRefreshToken({
    userId: user.id,
    tokenHash: refreshToken.tokenHash,
    expiresAt: refreshToken.expiresAt,
    ip: input.ip,
    userAgent: input.userAgent,
    operacionConfigId: uoc
  });
  return { response: sesionCompleta(user, uoc), refreshToken };
}

export async function login(input: LoginInput, repository: AuthRepository, perfiles?: PerfilesSource): Promise<LoginResult> {
  const username = input.username.trim();
  const user = await repository.findUserForLogin(username);

  if (!user) {
    await repository.recordFailedLogin({
      username,
      ip: input.ip,
      userAgent: input.userAgent,
      reason: "USER_NOT_FOUND"
    });
    throw invalidCredentials();
  }

  if (!user.activo) {
    await repository.recordFailedLogin({
      username,
      userId: user.id,
      ip: input.ip,
      userAgent: input.userAgent,
      reason: "USER_INACTIVE"
    });
    throw invalidCredentials();
  }

  if (user.bloqueadoAt) {
    await repository.recordFailedLogin({
      username,
      userId: user.id,
      ip: input.ip,
      userAgent: input.userAgent,
      reason: "USER_BLOCKED"
    });
    throw new HttpError(423, "FORBIDDEN", "Usuario bloqueado por intentos fallidos. Contactar con backoffice.");
  }

  const passwordOk = await verifyPassword(user.passwordHash, input.password);
  if (!passwordOk) {
    const nextFailedCount = user.failedLoginCount + 1;
    const blockUser = nextFailedCount >= maxFailedAttempts;

    await repository.recordFailedLogin({
      username,
      userId: user.id,
      ip: input.ip,
      userAgent: input.userAgent,
      reason: blockUser ? "USER_BLOCKED_BY_FAILED_ATTEMPTS" : "INVALID_PASSWORD",
      nextFailedCount,
      blockUser
    });

    if (blockUser) {
      throw new HttpError(423, "FORBIDDEN", "Usuario bloqueado por intentos fallidos. Contactar con backoffice.");
    }

    throw invalidCredentials();
  }

  await repository.recordSuccessfulLogin({
    userId: user.id,
    username: user.username,
    ip: input.ip,
    userAgent: input.userAgent
  });

  if (user.mustChangePassword) {
    const accessToken = signOnboardingToken({
      sub: user.id,
      tenant_id: user.tenantId,
      username: user.username,
      role: user.role
    });

    return {
      response: {
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 30 * 60,
        user: {
          id: user.id,
          username: user.username,
          display_name: user.displayName,
          role: user.role
        },
        pending_actions: ["CHANGE_PASSWORD", "ACCEPT_TYC"]
      },
      refreshToken: null
    };
  }

  if (!user.hasAcceptedCurrentTyc) {
    const accessToken = signOnboardingToken({
      sub: user.id,
      tenant_id: user.tenantId,
      username: user.username,
      role: user.role
    });

    return {
      response: {
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: 30 * 60,
        user: {
          id: user.id,
          username: user.username,
          display_name: user.displayName,
          role: user.role
        },
        pending_actions: ["ACCEPT_TYC"]
      },
      refreshToken: null
    };
  }

  return emitirSesion(user, { ip: input.ip, userAgent: input.userAgent }, repository, perfiles);
}

function invalidCredentials() {
  return new HttpError(401, "AUTH_REQUIRED", "Usuario o contrasena incorrectos.");
}

export async function refreshSession(
  rawRefreshToken: string | undefined,
  repository: AuthRepository,
  perfiles?: PerfilesSource,
  audit?: AuditRepository
): Promise<RefreshResult> {
  if (!rawRefreshToken) {
    throw new HttpError(401, "AUTH_REQUIRED", "Refresh token requerido.");
  }

  const currentTokenHash = hashRefreshToken(rawRefreshToken);
  const nextRefreshToken = createRefreshToken();
  const user = await repository.rotateRefreshToken({
    currentTokenHash,
    newTokenHash: nextRefreshToken.tokenHash,
    newExpiresAt: nextRefreshToken.expiresAt
  });

  if (!user) {
    throw new HttpError(401, "AUTH_REQUIRED", "Refresh token invalido o expirado.");
  }

  if (!perfiles) {
    return { response: sesionCompleta(user, user.operacionConfigId ?? null), refreshToken: nextRefreshToken };
  }

  // SPEC_MULTIPERFIL_USUARIO_v0.1 §B.5: el refresh conserva el perfil si sigue emitible.
  const lista = await perfiles.listPerfilesDisponibles(user.id);
  const guardado = user.operacionConfigId ?? null;
  if (guardado && lista.some((p) => p.operacion_config_id === guardado)) {
    return { response: sesionCompleta(user, guardado), refreshToken: nextRefreshToken };
  }

  if (lista.length > 1) {
    // D-8: no queda un refresh valido sin perfil.
    await repository.revokeRefreshToken({ tokenHash: nextRefreshToken.tokenHash });
    return { response: sesionPerfilSelect(user, lista), refreshToken: null };
  }

  const unico = lista[0]?.operacion_config_id ?? null;
  if (unico !== guardado) {
    await repository.setRefreshTokenOperacionConfig?.({ tokenHash: nextRefreshToken.tokenHash, operacionConfigId: unico });
    if (unico && audit) {
      await audit.insertEvent({
        tenantId: user.tenantId,
        // SPEC_MULTIPERFIL_USUARIO_v0.2 A.1 (F-4): mismo formato que los eventos de login y app.
        facturadorId: lista[0]!.facturador_id ?? null,
        usuarioId: user.id,
        entityType: "usuario_operacion_config",
        entityId: unico,
        eventType: "PERFIL_SELECCIONADO",
        metadata: { anterior: guardado, nuevo: unico, origen: "REFRESH", ...perfilResumen(lista[0]!) }
      });
    }
  }
  return { response: sesionCompleta(user, unico), refreshToken: nextRefreshToken };
}

function perfilResumen(p: PerfilDisponible) {
  return { establecimiento: p.establecimiento, punto_expedicion: p.punto_expedicion, perfil_emision_codigo: p.perfil_emision_codigo };
}

export const MENSAJE_PERFIL_NO_DISPONIBLE_USUARIO = "Punto de expedicion no disponible para este usuario.";

export interface SeleccionarPerfilInput {
  user: AuthenticatedUser;
  operacionConfigId: string;
  password?: string;
  refreshCookie?: string;
  ip?: string;
  userAgent?: string;
}

/**
 * SPEC_MULTIPERFIL_USUARIO_v0.1 §B.2 y §B.3. Con token `perfil_select` elige sin contraseña (la
 * acaba de escribir). Con token completo exige la contraseña y cuenta los fallos como el login
 * (RN-04). Un perfil ajeno, inexistente o no emitible responde el mismo 401.
 */
export async function seleccionarPerfil(
  input: SeleccionarPerfilInput,
  repository: AuthRepository,
  perfiles: PerfilesSource,
  audit: AuditRepository & { facturadorDe?: (operacionConfigId: string) => Promise<string | null> }
): Promise<LoginResult> {
  const scope = input.user.scope ?? "full";
  if (scope === "onboarding_only") {
    throw new HttpError(403, "ONBOARDING_REQUIRED", "Debes completar el proceso de activacion antes de usar la plataforma.");
  }

  const record = await repository.findUserForLogin(input.user.username);
  if (!record || record.id !== input.user.id || !record.activo) {
    throw new HttpError(401, "AUTH_REQUIRED", "Usuario no autenticado o inactivo.");
  }
  if (record.bloqueadoAt) {
    throw new HttpError(423, "FORBIDDEN", "Usuario bloqueado por intentos fallidos. Contactar con backoffice.");
  }

  if (scope === "full") {
    if (!input.password) {
      throw new HttpError(400, "VALIDATION_ERROR", "Ingresa tu contraseña para cambiar de punto de expedicion.");
    }
    const ok = await verifyPassword(record.passwordHash, input.password);
    if (!ok) {
      const nextFailedCount = record.failedLoginCount + 1;
      const blockUser = nextFailedCount >= maxFailedAttempts;
      await repository.recordFailedLogin({
        username: record.username,
        userId: record.id,
        ip: input.ip,
        userAgent: input.userAgent,
        reason: blockUser ? "USER_BLOCKED_BY_FAILED_ATTEMPTS" : "INVALID_PASSWORD_PERFIL",
        nextFailedCount,
        blockUser
      });
      if (blockUser) {
        throw new HttpError(423, "FORBIDDEN", "Usuario bloqueado por intentos fallidos. Contactar con backoffice.");
      }
      throw new HttpError(401, "AUTH_REQUIRED", "Contraseña incorrecta.", { reason: "PASSWORD_INCORRECTA" });
    }
  }

  const lista = await perfiles.listPerfilesDisponibles(record.id);
  const elegido = lista.find((p) => p.operacion_config_id === input.operacionConfigId);
  if (!elegido) {
    throw new HttpError(401, "AUTH_REQUIRED", MENSAJE_PERFIL_NO_DISPONIBLE_USUARIO, { reason: "PERFIL_NO_DISPONIBLE" });
  }

  if (scope === "full") {
    await repository.resetFailedLogin?.(record.id);
  }

  const refreshToken = createRefreshToken();
  await repository.createRefreshToken({
    userId: record.id,
    tokenHash: refreshToken.tokenHash,
    expiresAt: refreshToken.expiresAt,
    ip: input.ip,
    userAgent: input.userAgent,
    operacionConfigId: elegido.operacion_config_id
  });
  if (input.refreshCookie) {
    await repository.revokeRefreshToken({ tokenHash: hashRefreshToken(input.refreshCookie) });
  }

  const anterior = input.user.operacionConfigId ?? null;
  if (anterior !== elegido.operacion_config_id) {
    await audit.insertEvent({
      tenantId: record.tenantId,
      facturadorId: (await audit.facturadorDe?.(elegido.operacion_config_id)) ?? null,
      usuarioId: record.id,
      entityType: "usuario_operacion_config",
      entityId: elegido.operacion_config_id,
      eventType: scope === "full" ? "PERFIL_CAMBIADO" : "PERFIL_SELECCIONADO",
      metadata: {
        anterior,
        nuevo: elegido.operacion_config_id,
        origen: scope === "full" ? "APP" : "LOGIN",
        ip: input.ip ?? null,
        user_agent: input.userAgent ?? null,
        ...perfilResumen(elegido)
      }
    });
  }

  return { response: sesionCompleta(record, elegido.operacion_config_id), refreshToken };
}

export async function logout(rawRefreshToken: string | undefined, repository: AuthRepository): Promise<void> {
  if (!rawRefreshToken) {
    return;
  }

  await repository.revokeRefreshToken({
    tokenHash: hashRefreshToken(rawRefreshToken)
  });
}
