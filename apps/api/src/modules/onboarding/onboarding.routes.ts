import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/auth.middleware";
import { setRefreshCookie } from "../auth/auth.routes";
import { emitirSesion } from "../auth/auth.service";
import { operationalContextRepository } from "../context/context.repository";
import { authRepository } from "../auth/auth.repository";
import { validateRequest } from "../../shared/validation/validate-request";
import { onboardingRepository } from "./onboarding.repository";
import { acceptTycAdmin, changePassword, completeOnboarding, getActiveTyc, requestOtp } from "./onboarding.service";

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
        req.user!.role,
        req.ip ?? null,
        req.get("user-agent") ?? null,
        onboardingRepository
      );

      // SPEC_MULTIPERFIL_USUARIO_v0.1 §B.6: misma regla de sesion que el login.
      const sesion = await emitirSesion(
        {
          id: req.user!.id,
          tenantId: req.user!.tenantId,
          username: result.response.user.username,
          displayName: result.response.user.display_name,
          role: result.response.user.role
        },
        { ip: req.ip, userAgent: req.get("user-agent") },
        authRepository,
        operationalContextRepository
      );
      if (sesion.refreshToken) {
        setRefreshCookie(res, sesion.refreshToken.rawToken, sesion.refreshToken.expiresAt);
      }

      res.json(sesion.response);
    } catch (error) {
      next(error);
    }
  }
);

// Bypass de OTP para roles admin/soporte — solo usable durante onboarding
onboardingRouter.post("/onboarding/admin/accept-direct", requireAuth, async (req, res, next) => {
  try {
    const result = await acceptTycAdmin(
      req.user!.id,
      req.user!.tenantId,
      req.user!.role,
      req.ip ?? null,
      req.get("user-agent") ?? null,
      onboardingRepository
    );

    // SPEC_MULTIPERFIL_USUARIO_v0.1 §B.6: misma regla de sesion que el login.
    const sesion = await emitirSesion(
      {
        id: req.user!.id,
        tenantId: req.user!.tenantId,
        username: result.response.user.username,
        displayName: result.response.user.display_name,
        role: result.response.user.role
      },
      { ip: req.ip, userAgent: req.get("user-agent") },
      authRepository,
      operationalContextRepository
    );
    if (sesion.refreshToken) {
      setRefreshCookie(res, sesion.refreshToken.rawToken, sesion.refreshToken.expiresAt);
    }

    res.json(sesion.response);
  } catch (error) {
    next(error);
  }
});
