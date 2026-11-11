import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env";
import { requireAuth } from "../auth/auth.middleware";
import { operationalContextRepository } from "../context/context.repository";
import { getOperationalContext } from "../context/context.service";
import { createFiscalGateway, fiscalGateway } from "../fiscal-gateway/fiscal-gateway.client";
import { buildFiscalGatewayConfig } from "../fiscal-gateway/fiscal-gateway.config";
import { permisosDelFacturador } from "../notas-remision/notas-remision.permiso";
import { validateRequest } from "../../shared/validation/validate-request";
import { leerGeografia } from "./geografia.service";

export const geografiaRouter = Router();

async function gatewayDelFacturador(userReq: Parameters<typeof getOperationalContext>[0]) {
  const context = await getOperationalContext(userReq, operationalContextRepository);
  const { apiKey } = await permisosDelFacturador(context.facturador.id);
  return apiKey ? createFiscalGateway({ ...buildFiscalGatewayConfig(env), apiKey }) : fiscalGateway;
}

geografiaRouter.get("/geografia/departamentos", requireAuth, async (req, res, next) => {
  try {
    res.json(await leerGeografia(await gatewayDelFacturador(req.user!), {}));
  } catch (error) {
    next(error);
  }
});

geografiaRouter.get(
  "/geografia/distritos",
  requireAuth,
  validateRequest("query", z.object({ departamento: z.coerce.number().int().min(1) })),
  async (req, res, next) => {
    try {
      res.json(await leerGeografia(await gatewayDelFacturador(req.user!), { departamento: Number(req.query.departamento) }));
    } catch (error) {
      next(error);
    }
  }
);

geografiaRouter.get(
  "/geografia/ciudades",
  requireAuth,
  validateRequest("query", z.object({ distrito: z.coerce.number().int().min(1) })),
  async (req, res, next) => {
    try {
      res.json(await leerGeografia(await gatewayDelFacturador(req.user!), { distrito: Number(req.query.distrito) }));
    } catch (error) {
      next(error);
    }
  }
);
