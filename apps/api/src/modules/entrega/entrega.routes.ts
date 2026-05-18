import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth/auth.middleware";
import { operationalContextRepository } from "../context/context.repository";
import { getOperationalContext } from "../context/context.service";
import { facturasRepository } from "../facturas/facturas.repository";
import { validateRequest } from "../../shared/validation/validate-request";
import { deliveryLinkRepository } from "./entrega.repository";
import { createOrGetDeliveryLink } from "./entrega.service";

const documentoParamsSchema = z.object({
  documentoId: z.string().uuid()
});

const deliveryLinkBodySchema = z
  .object({
    regenerate: z.boolean().default(false)
  })
  .default({ regenerate: false });

export const entregaRouter = Router();

entregaRouter.post(
  "/facturas/:documentoId/delivery-link",
  requireAuth,
  validateRequest("params", documentoParamsSchema),
  validateRequest("body", deliveryLinkBodySchema),
  async (req, res, next) => {
    try {
      const context = await getOperationalContext(req.user!.id, operationalContextRepository);
      const result = await createOrGetDeliveryLink(context, String(req.params.documentoId), req.body, {
        facturas: facturasRepository,
        deliveryLinks: deliveryLinkRepository
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);
