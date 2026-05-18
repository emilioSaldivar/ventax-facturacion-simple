import type { HealthResponse } from "@facturacion-simple/shared";
import { Router } from "express";

export const healthRouter = Router();

export function getHealthResponse(now = new Date()): HealthResponse {
  return {
    status: "ok",
    service: "facturacion-simple-api",
    timestamp: now.toISOString()
  };
}

healthRouter.get("/health", (_req, res) => {
  res.json(getHealthResponse());
});
