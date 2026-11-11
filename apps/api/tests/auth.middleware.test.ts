import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { createRequireAuth } from "../src/modules/auth/auth.middleware";
import { signAccessToken, signPerfilSelectToken } from "../src/modules/auth/token.service";
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
      role: user.role,
      scope: "full"
    });
    const req = requestWithAuthorization(`Bearer ${token}`);

    await middleware(req, {} as never, (error?: unknown) => {
      expect(error).toBeUndefined();
    });

    expect(req.user).toEqual({ ...user, operacionConfigId: null, scope: "full" });
  });

  it("carga el uoc del token en req.user (SPEC_MULTIPERFIL_USUARIO_v0.1)", async () => {
    const user: AuthenticatedUser = { id: "11111111-1111-4111-8111-111111111111", tenantId: "t", username: "op", role: "OPERADOR_FACTURACION" };
    const middleware = createRequireAuth({ async findActiveUserById() { return user; } });
    const token = signAccessToken({ sub: user.id, tenant_id: "t", username: "op", role: user.role, scope: "full", uoc: "cfg-1" });
    const req = requestWithAuthorization(`Bearer ${token}`);
    let err: unknown;
    await middleware(req, {} as never, (e?: unknown) => { err = e; });
    expect(err).toBeUndefined();
    expect(req.user).toMatchObject({ operacionConfigId: "cfg-1", scope: "full" });
  });

  it("perfil_select solo pasa por /auth/perfil, /me/perfiles y /auth/logout", async () => {
    const user: AuthenticatedUser = { id: "11111111-1111-4111-8111-111111111111", tenantId: "t", username: "op", role: "OPERADOR_FACTURACION" };
    const middleware = createRequireAuth({ async findActiveUserById() { return user; } });
    const token = signPerfilSelectToken({ sub: user.id, tenant_id: "t", username: "op", role: user.role });
    for (const [ruta, permitido] of [["/facturas", false], ["/me/context", false], ["/auth/perfil", true], ["/me/perfiles", true], ["/auth/logout", true]] as const) {
      const req = { ...requestWithAuthorization(`Bearer ${token}`), path: ruta } as Request;
      let err: unknown;
      await middleware(req, {} as never, (e?: unknown) => { err = e; });
      if (permitido) {
        expect(err, ruta).toBeUndefined();
        expect(req.user?.scope).toBe("perfil_select");
      } else {
        expect(err, ruta).toMatchObject({ statusCode: 403, details: { reason: "PERFIL_REQUERIDO" } });
      }
    }
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
