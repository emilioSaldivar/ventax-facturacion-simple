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
import { leerCiudadesDeDepartamento, leerGeografia } from "./geografia.service";

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

// SPEC_DIRECCION_RECEPTOR_v0.1 RN-04: `?distrito=N` (remision) o `?departamento=N` (factura y agenda).
geografiaRouter.get(
  "/geografia/ciudades",
  requireAuth,
  validateRequest(
    "query",
    z
      .object({ distrito: z.coerce.number().int().min(1).optional(), departamento: z.coerce.number().int().min(1).optional() })
      .refine((q) => Boolean(q.distrito) !== Boolean(q.departamento), "Indicá distrito o departamento.")
  ),
  async (req, res, next) => {
    try {
      const gateway = await gatewayDelFacturador(req.user!);
      if (req.query.departamento) {
        res.json(await leerCiudadesDeDepartamento(gateway, Number(req.query.departamento)));
        return;
      }
      res.json(await leerGeografia(gateway, { distrito: Number(req.query.distrito) }));
    } catch (error) {
      next(error);
    }
  }
);
