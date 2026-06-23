import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { validateRequest } from "../../shared/validation/validate-request";
import { authRepository } from "./auth.repository";
import { login, logout, refreshSession } from "./auth.service";

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
      authRepository
    );

    if (result.refreshToken) {
      res.cookie(refreshCookieName, result.refreshToken.rawToken, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        expires: result.refreshToken.expiresAt,
        path: "/api/v1/auth"
      });
    }

    res.json(result.response);
  } catch (error) {
    next(error);
  }
});

authRouter.post("/auth/refresh", async (req, res, next) => {
  try {
    const result = await refreshSession(req.cookies?.[refreshCookieName], authRepository);
    setRefreshCookie(res, result.refreshToken.rawToken, result.refreshToken.expiresAt);
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

function setRefreshCookie(res: import("express").Response, rawToken: string, expiresAt: Date) {
  res.cookie(refreshCookieName, rawToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/api/v1/auth"
  });
}

function clearRefreshCookie(res: import("express").Response) {
  res.clearCookie(refreshCookieName, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/v1/auth"
  });
}
