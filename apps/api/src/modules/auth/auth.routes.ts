import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { validateRequest } from "../../shared/validation/validate-request";
import { auditRepository } from "../../shared/audit/audit.repository";
import { operationalContextRepository } from "../context/context.repository";
import { requireAuth } from "./auth.middleware";
import { authRepository } from "./auth.repository";
import { login, logout, refreshSession, seleccionarPerfil } from "./auth.service";

// SPEC_MULTIPERFIL_USUARIO_v0.1 §E.2
const perfilSchema = z.object({
  operacion_config_id: z.string().uuid(),
  password: z.string().min(1).max(200).optional()
});

const loginSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(200)
});

export const refreshCookieName = "ventax_refresh_token";
export const authRouter = Router();

authRouter.post("/auth/login", validateRequest("body", loginSchema), async (req, res, next) => {
  try {
    const result = await login(
      {
        username: req.body.username,
        password: req.body.password,
        ip: req.ip,
        userAgent: req.get("user-agent")
      },
      authRepository,
      operationalContextRepository
    );

    if (result.refreshToken) {
      setRefreshCookie(res, result.refreshToken.rawToken, result.refreshToken.expiresAt);
    }

    res.json(result.response);
  } catch (error) {
    next(error);
  }
});

authRouter.post("/auth/refresh", async (req, res, next) => {
  try {
    const result = await refreshSession(req.cookies?.[refreshCookieName], authRepository, operationalContextRepository, auditRepository);
    if (result.refreshToken) {
      setRefreshCookie(res, result.refreshToken.rawToken, result.refreshToken.expiresAt);
    } else {
      // D-8: la sesion quedo en SELECT_PERFIL; no queda cookie valida sin perfil.
      clearRefreshCookie(res);
    }
    res.json(result.response);
  } catch (error) {
    next(error);
  }
});

authRouter.post("/auth/perfil", requireAuth, validateRequest("body", perfilSchema), async (req, res, next) => {
  try {
    const result = await seleccionarPerfil(
      {
        user: req.user!,
        operacionConfigId: req.body.operacion_config_id,
        password: req.body.password,
        refreshCookie: req.cookies?.[refreshCookieName],
        ip: req.ip,
        userAgent: req.get("user-agent")
      },
      authRepository,
      operationalContextRepository,
      auditRepository
    );
    if (result.refreshToken) {
      setRefreshCookie(res, result.refreshToken.rawToken, result.refreshToken.expiresAt);
    }
    res.json(result.response);
  } catch (error) {
    next(error);
  }
});

authRouter.post("/auth/logout", async (req, res, next) => {
  try {
    await logout(req.cookies?.[refreshCookieName], authRepository);
    clearRefreshCookie(res);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export function setRefreshCookie(res: import("express").Response, rawToken: string, expiresAt: Date) {
  res.cookie(refreshCookieName, rawToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/api/v1/auth"
  });
}

export function clearRefreshCookie(res: import("express").Response) {
  res.clearCookie(refreshCookieName, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/v1/auth"
  });
}
