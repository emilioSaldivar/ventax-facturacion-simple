import { describe, expect, it } from "vitest";
import { login, logout, refreshSession } from "../src/modules/auth/auth.service";
import { hashPassword } from "../src/modules/auth/password.service";
import { hashRefreshToken } from "../src/modules/auth/token.service";
import type { AuthRepository, AuthenticatedUser, LoginUserRecord } from "../src/modules/auth/auth.types";

class FakeAuthRepository implements AuthRepository {
  public failedLogins: unknown[] = [];
  public successfulLogins: unknown[] = [];
  public refreshTokens: unknown[] = [];
  public revokedTokens: string[] = [];
  public rotatedTokens: unknown[] = [];
  public activeRefreshTokenHash: string | null = null;

  constructor(private readonly user: LoginUserRecord | null) {}

  async findUserForLogin(): Promise<LoginUserRecord | null> {
    return this.user;
  }

  async recordFailedLogin(input: unknown): Promise<void> {
    this.failedLogins.push(input);
  }

  async recordSuccessfulLogin(input: unknown): Promise<void> {
    this.successfulLogins.push(input);
  }

  async createRefreshToken(input: unknown): Promise<void> {
    this.refreshTokens.push(input);
  }

  async rotateRefreshToken(input: {
    currentTokenHash: string;
    newTokenHash: string;
    newExpiresAt: Date;
  }): Promise<LoginUserRecord | null> {
    this.rotatedTokens.push(input);
    if (!this.user || input.currentTokenHash !== this.activeRefreshTokenHash) {
      return null;
    }

    this.activeRefreshTokenHash = input.newTokenHash;
    return this.user;
  }

  async revokeRefreshToken(input: { tokenHash: string }): Promise<boolean> {
    this.revokedTokens.push(input.tokenHash);
    if (input.tokenHash !== this.activeRefreshTokenHash) {
      return false;
    }
    this.activeRefreshTokenHash = null;
    return true;
  }

  async findActiveUserById(): Promise<AuthenticatedUser | null> {
    if (!this.user || !this.user.activo || this.user.bloqueadoAt) {
      return null;
    }

    return {
      id: this.user.id,
      tenantId: this.user.tenantId,
      username: this.user.username,
      role: this.user.role
    };
  }
}

async function activeUser(overrides: Partial<LoginUserRecord> = {}): Promise<LoginUserRecord> {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    tenantId: "22222222-2222-4222-8222-222222222222",
    username: "operador",
    displayName: "Operador",
    passwordHash: await hashPassword("correcta"),
    role: "OPERADOR_FACTURACION",
    activo: true,
    bloqueadoAt: null,
    failedLoginCount: 0,
    mustChangePassword: false,
    hasAcceptedCurrentTyc: true,
    ...overrides
  };
}

describe("login", () => {
  it("returns access token and persists refresh token on success", async () => {
    const repo = new FakeAuthRepository(await activeUser());

    const result = await login({ username: "operador", password: "correcta" }, repo);

    expect(result.response).toMatchObject({
      token_type: "Bearer",
      expires_in: 900,
      user: {
        username: "operador",
        role: "OPERADOR_FACTURACION"
      }
    });
    expect(result.response.access_token).toEqual(expect.any(String));
    expect(result.refreshToken.rawToken).toEqual(expect.any(String));
    expect(repo.successfulLogins).toHaveLength(1);
    expect(repo.refreshTokens).toHaveLength(1);
  });

  it("records failed attempt for invalid password", async () => {
    const repo = new FakeAuthRepository(await activeUser({ failedLoginCount: 2 }));

    await expect(login({ username: "operador", password: "incorrecta" }, repo)).rejects.toMatchObject({
      statusCode: 401
    });

    expect(repo.failedLogins).toContainEqual(
      expect.objectContaining({
        reason: "INVALID_PASSWORD",
        nextFailedCount: 3,
        blockUser: false
      })
    );
  });

  it("blocks user at fifth failed attempt", async () => {
    const repo = new FakeAuthRepository(await activeUser({ failedLoginCount: 4 }));

    await expect(login({ username: "operador", password: "incorrecta" }, repo)).rejects.toMatchObject({
      statusCode: 423
    });

    expect(repo.failedLogins).toContainEqual(
      expect.objectContaining({
        reason: "USER_BLOCKED_BY_FAILED_ATTEMPTS",
        nextFailedCount: 5,
        blockUser: true
      })
    );
  });

  it("rotates refresh token and returns a new access token", async () => {
    const repo = new FakeAuthRepository(await activeUser());
    const rawRefreshToken = "refresh-token";
    repo.activeRefreshTokenHash = hashRefreshToken(rawRefreshToken);

    const result = await refreshSession(rawRefreshToken, repo);

    expect(result.response).toMatchObject({
      token_type: "Bearer",
      user: {
        username: "operador"
      }
    });
    expect(result.refreshToken.rawToken).not.toBe(rawRefreshToken);
    expect(repo.rotatedTokens).toContainEqual(
      expect.objectContaining({
        currentTokenHash: hashRefreshToken(rawRefreshToken)
      })
    );
  });

  it("rejects invalid refresh token", async () => {
    const repo = new FakeAuthRepository(await activeUser());
    repo.activeRefreshTokenHash = hashRefreshToken("otro-token");

    await expect(refreshSession("refresh-token", repo)).rejects.toMatchObject({
      statusCode: 401
    });
  });

  it("revokes refresh token on logout", async () => {
    const repo = new FakeAuthRepository(await activeUser());
    const rawRefreshToken = "refresh-token";
    repo.activeRefreshTokenHash = hashRefreshToken(rawRefreshToken);

    await logout(rawRefreshToken, repo);

    expect(repo.revokedTokens).toEqual([hashRefreshToken(rawRefreshToken)]);
    expect(repo.activeRefreshTokenHash).toBeNull();
  });
});
