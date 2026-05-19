import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/auth.middleware";
import { validateRequest } from "../../shared/validation/validate-request";
import { HttpError } from "../../shared/errors/http-error";
import { backofficeRepository } from "./backoffice.repository";
import { assignBackofficeOperationConfig, createBackofficeUser, resetBackofficeUserPassword } from "./backoffice.service";

const roles = ["OPERADOR_FACTURACION", "SOPORTE_INTERNO", "ADMIN_INTERNO"] as const;

const userCreateSchema = z.object({
  username: z.string().trim().min(3).max(120),
  display_name: z.string().trim().min(1).max(180).nullable().optional(),
  role: z.enum(roles),
  temporary_password: z.string().trim().min(10).max(120).nullable().optional()
});

const userParamsSchema = z.object({
  userId: z.string().uuid()
});

const passwordResetSchema = z.object({
  temporary_password: z.string().trim().min(10).max(120).nullable().optional()
});

const operationConfigSchema = z.object({
  tenant_id: z.string().uuid(),
  facturador_id: z.string().uuid(),
  emisor_id: z.string().trim().min(1).max(120),
  establecimiento: z.string().trim().regex(/^[0-9]{3}$/),
  punto_expedicion: z.string().trim().regex(/^[0-9]{3}$/),
  perfil_emision_codigo: z.string().trim().min(1).max(40),
  actividad_economica_codigo: z.string().trim().min(1).max(40)
});

export const backofficeRouter = Router();

backofficeRouter.post(
  "/backoffice/users",
  requireAuth,
  requireBackofficeRole,
  validateRequest("body", userCreateSchema),
  async (req, res, next) => {
    try {
      const result = await createBackofficeUser(req.user!.tenantId, req.body, backofficeRepository);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }
);

backofficeRouter.post(
  "/backoffice/users/:userId/reset-password",
  requireAuth,
  requireBackofficeRole,
  validateRequest("params", userParamsSchema),
  validateRequest("body", passwordResetSchema),
  async (req, res, next) => {
    try {
      const params = req.params as unknown as z.infer<typeof userParamsSchema>;
      const result = await resetBackofficeUserPassword(params.userId, req.body, backofficeRepository);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

backofficeRouter.put(
  "/backoffice/users/:userId/operation-config",
  requireAuth,
  requireBackofficeRole,
  validateRequest("params", userParamsSchema),
  validateRequest("body", operationConfigSchema),
  async (req, res, next) => {
    try {
      const params = req.params as unknown as z.infer<typeof userParamsSchema>;
      const result = await assignBackofficeOperationConfig(params.userId, req.body, backofficeRepository);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

function requireBackofficeRole(req: Request, _res: Response, next: NextFunction) {
  if (!req.user || !["SOPORTE_INTERNO", "ADMIN_INTERNO"].includes(req.user.role)) {
    next(new HttpError(403, "FORBIDDEN", "Permiso de backoffice requerido."));
    return;
  }

  next();
}
