import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { createRequireAuth } from "../src/modules/auth/auth.middleware";
import { signAccessToken } from "../src/modules/auth/token.service";
import type { AuthenticatedUser } from "../src/modules/auth/auth.types";

function requestWithAuthorization(authorization?: string) {
  return {
    get(name: string) {
      return name.toLowerCase() === "authorization" ? authorization : undefined;
    }
  } as Request;
}

describe("requireAuth", () => {
  it("loads active user from a valid bearer token", async () => {
    const user: AuthenticatedUser = {
      id: "11111111-1111-4111-8111-111111111111",
      tenantId: "22222222-2222-4222-8222-222222222222",
      username: "operador",
      role: "OPERADOR_FACTURACION"
    };
    const middleware = createRequireAuth({
      async findActiveUserById(userId: string) {
        return userId === user.id ? user : null;
      }
    });
    const token = signAccessToken({
      sub: user.id,
      tenant_id: user.tenantId,
      username: user.username,
      role: user.role
    });
    const req = requestWithAuthorization(`Bearer ${token}`);

    await middleware(req, {} as never, (error?: unknown) => {
      expect(error).toBeUndefined();
    });

    expect(req.user).toEqual(user);
  });

  it("rejects missing bearer token", async () => {
    const middleware = createRequireAuth({
      async findActiveUserById() {
        return null;
      }
    });

    await middleware(requestWithAuthorization(), {} as never, (error?: unknown) => {
      expect(error).toMatchObject({
        statusCode: 401,
        code: "AUTH_REQUIRED"
      });
    });
  });
});
