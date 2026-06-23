import type { AuthResponse } from "@facturacion-simple/shared";
import { env } from "../../config/env";
import { HttpError } from "../../shared/errors/http-error";
import { verifyPassword } from "./password.service";
import { createRefreshToken, hashRefreshToken, signAccessToken, signOnboardingToken } from "./token.service";
import type { AuthRepository, LoginInput, RefreshTokenRecord } from "./auth.types";

const maxFailedAttempts = 5;

export interface LoginResult {
  response: AuthResponse;
  refreshToken: RefreshTokenRecord | null;
}

export interface RefreshResult {
  response: AuthResponse;
  refreshToken: RefreshTokenRecord;
}

export async function login(input: LoginInput, repository: AuthRepository): Promise<LoginResult> {
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

  const accessToken = signAccessToken({
    sub: user.id,
    tenant_id: user.tenantId,
    username: user.username,
    role: user.role,
    scope: "full"
  });
  const refreshToken = createRefreshToken();

  await repository.createRefreshToken({
    userId: user.id,
    tokenHash: refreshToken.tokenHash,
    expiresAt: refreshToken.expiresAt,
    ip: input.ip,
    userAgent: input.userAgent
  });

  return {
    response: {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: env.JWT_ACCESS_TTL_MINUTES * 60,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.displayName,
        role: user.role
      }
    },
    refreshToken
  };
}

function invalidCredentials() {
  return new HttpError(401, "AUTH_REQUIRED", "Usuario o contrasena incorrectos.");
}

export async function refreshSession(rawRefreshToken: string | undefined, repository: AuthRepository): Promise<RefreshResult> {
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

  const accessToken = signAccessToken({
    sub: user.id,
    tenant_id: user.tenantId,
    username: user.username,
    role: user.role,
    scope: "full"
  });

  return {
    response: {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: env.JWT_ACCESS_TTL_MINUTES * 60,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.displayName,
        role: user.role
      }
    },
    refreshToken: nextRefreshToken
  };
}

export async function logout(rawRefreshToken: string | undefined, repository: AuthRepository): Promise<void> {
  if (!rawRefreshToken) {
    return;
  }

  await repository.revokeRefreshToken({
    tokenHash: hashRefreshToken(rawRefreshToken)
  });
}
