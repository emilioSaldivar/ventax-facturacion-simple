import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware";
import { fiscalGateway } from "./fiscal-gateway.client";

export const fiscalGatewayRouter = Router();

fiscalGatewayRouter.get("/fiscal-gateway/health", requireAuth, async (_req, res, next) => {
  try {
    res.json(await fiscalGateway.health());
  } catch (error) {
    next(error);
  }
});
