import type { UserSummary } from "@facturacion-simple/shared";

export interface LoginInput {
  username: string;
  password: string;
  ip?: string;
  userAgent?: string;
}

export interface LoginUserRecord {
  id: string;
  tenantId: string;
  username: string;
  displayName: string | null;
  passwordHash: string;
  role: UserSummary["role"];
  activo: boolean;
  bloqueadoAt: Date | null;
  failedLoginCount: number;
  mustChangePassword: boolean;
  hasAcceptedCurrentTyc: boolean;
  /** SPEC_MULTIPERFIL_USUARIO_v0.1 §B.5: configuracion guardada en el refresh token rotado. */
  operacionConfigId?: string | null;
}

export interface RefreshTokenRecord {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  username: string;
  role: UserSummary["role"];
  /** SPEC_MULTIPERFIL_USUARIO_v0.1: `uoc` del token; null si el token no lo trae. */
  operacionConfigId?: string | null;
  scope?: "full" | "onboarding_only" | "perfil_select";
}

export interface AuthRepository {
  findUserForLogin(username: string): Promise<LoginUserRecord | null>;
  recordFailedLogin(input: {
    username: string;
    userId?: string;
    ip?: string;
    userAgent?: string;
    reason: string;
    nextFailedCount?: number;
    blockUser?: boolean;
  }): Promise<void>;
  recordSuccessfulLogin(input: {
    userId: string;
    username: string;
    ip?: string;
    userAgent?: string;
  }): Promise<void>;
  createRefreshToken(input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    ip?: string;
    userAgent?: string;
    operacionConfigId?: string | null;
  }): Promise<void>;
  rotateRefreshToken(input: {
    currentTokenHash: string;
    newTokenHash: string;
    newExpiresAt: Date;
    ip?: string;
    userAgent?: string;
  }): Promise<LoginUserRecord | null>;
  revokeRefreshToken(input: { tokenHash: string }): Promise<boolean>;
  /** SPEC_MULTIPERFIL_USUARIO_v0.1. Opcionales para no romper repositorios de prueba existentes. */
  setRefreshTokenOperacionConfig?(input: { tokenHash: string; operacionConfigId: string | null }): Promise<void>;
  revokeRefreshTokensByOperacionConfig?(operacionConfigId: string): Promise<number>;
  resetFailedLogin?(userId: string): Promise<void>;
  findActiveUserById(userId: string): Promise<AuthenticatedUser | null>;
}
