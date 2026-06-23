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
  }): Promise<void>;
  rotateRefreshToken(input: {
    currentTokenHash: string;
    newTokenHash: string;
    newExpiresAt: Date;
    ip?: string;
    userAgent?: string;
  }): Promise<LoginUserRecord | null>;
  revokeRefreshToken(input: { tokenHash: string }): Promise<boolean>;
  findActiveUserById(userId: string): Promise<AuthenticatedUser | null>;
}
