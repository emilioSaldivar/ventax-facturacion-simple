import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware";
import { getOperationalContext, getReadiness } from "./context.service";
import { operationalContextRepository } from "./context.repository";

export const contextRouter = Router();

contextRouter.get("/me/context", requireAuth, async (req, res, next) => {
  try {
    const context = await getOperationalContext(req.user!.id, operationalContextRepository);
    res.json(context);
  } catch (error) {
    next(error);
  }
});

contextRouter.get("/me/readiness", requireAuth, async (req, res, next) => {
  try {
    const readiness = await getReadiness(req.user!.id, operationalContextRepository);
    res.json(readiness);
  } catch (error) {
    next(error);
  }
});

