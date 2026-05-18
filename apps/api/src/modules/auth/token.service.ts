import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { UserSummary } from "@facturacion-simple/shared";
import { env } from "../../config/env";

export interface AccessTokenPayload {
  sub: string;
  tenant_id: string;
  username: string;
  role: UserSummary["role"];
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, getAccessSecret(), {
    algorithm: "HS256",
    expiresIn: `${env.JWT_ACCESS_TTL_MINUTES}m`
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, getAccessSecret(), {
    algorithms: ["HS256"]
  });

  if (!isAccessTokenPayload(payload)) {
    throw new Error("Access token invalido.");
  }

  return payload;
}

export function createRefreshToken(now = new Date()) {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashRefreshToken(rawToken);
  const expiresAt = new Date(now.getTime() + env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

  return { rawToken, tokenHash, expiresAt };
}

export function hashRefreshToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function getAccessSecret(): string {
  if (env.JWT_ACCESS_SECRET) {
    return env.JWT_ACCESS_SECRET;
  }

  if (env.NODE_ENV === "production") {
    throw new Error("JWT_ACCESS_SECRET es obligatorio en produccion.");
  }

  return "dev-only-access-secret";
}

function isAccessTokenPayload(payload: unknown): payload is AccessTokenPayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const candidate = payload as Partial<AccessTokenPayload>;
  return (
    typeof candidate.sub === "string" &&
    typeof candidate.tenant_id === "string" &&
    typeof candidate.username === "string" &&
    (candidate.role === "OPERADOR_FACTURACION" ||
      candidate.role === "SOPORTE_INTERNO" ||
      candidate.role === "ADMIN_INTERNO")
  );
}
