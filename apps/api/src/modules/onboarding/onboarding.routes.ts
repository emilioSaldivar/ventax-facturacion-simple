import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { requireAuth } from "../auth/auth.middleware";
import { refreshCookieName } from "../auth/auth.routes";
import { authRepository } from "../auth/auth.repository";
import { validateRequest } from "../../shared/validation/validate-request";
import { onboardingRepository } from "./onboarding.repository";
import { changePassword, completeOnboarding, getActiveTyc, requestOtp } from "./onboarding.service";

export const onboardingRouter = Router();

onboardingRouter.get("/onboarding/tyc/current", requireAuth, async (req, res, next) => {
  try {
    const tyc = await getActiveTyc(req.user!.id, req.user!.tenantId, onboardingRepository);
    res.json(tyc);
  } catch (error) {
    next(error);
  }
});

const changePasswordSchema = z.object({
  new_password: z.string().min(8).max(200),
  confirm_password: z.string().min(1).max(200)
});

onboardingRouter.post(
  "/onboarding/password",
  requireAuth,
  validateRequest("body", changePasswordSchema),
  async (req, res, next) => {
    try {
      await changePassword(
        req.user!.id,
        { newPassword: req.body.new_password, confirmPassword: req.body.confirm_password },
        onboardingRepository
      );
      res.json({ step_completed: "CHANGE_PASSWORD", next_step: "ACCEPT_TYC" });
    } catch (error) {
      next(error);
    }
  }
);

onboardingRouter.post("/onboarding/otp/request", requireAuth, async (req, res, next) => {
  try {
    const result = await requestOtp(req.user!.id, onboardingRepository);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

const completeSchema = z.object({
  otp_session_id: z.string().uuid(),
  otp_code: z.string().length(6).regex(/^\d{6}$/),
  checkbox_aceptado: z.literal(true)
});

onboardingRouter.post(
  "/onboarding/complete",
  requireAuth,
  validateRequest("body", completeSchema),
  async (req, res, next) => {
    try {
      const result = await completeOnboarding(
        req.user!.id,
        req.user!.tenantId,
        {
          otpSessionId: req.body.otp_session_id,
          otpCode: req.body.otp_code,
          checkboxAceptado: req.body.checkbox_aceptado
        },
        req.ip ?? null,
        req.get("user-agent") ?? null,
        onboardingRepository
      );

      await authRepository.createRefreshToken({
        userId: req.user!.id,
        tokenHash: result.refreshToken.tokenHash,
        expiresAt: result.refreshToken.expiresAt,
        ip: req.ip,
        userAgent: req.get("user-agent")
      });

      res.cookie(refreshCookieName, result.refreshToken.rawToken, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        expires: result.refreshToken.expiresAt,
        path: "/api/v1/auth"
      });

      res.json(result.response);
    } catch (error) {
      next(error);
    }
  }
);
