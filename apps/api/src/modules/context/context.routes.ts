import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware";
import { getOperationalContext, getReadiness } from "./context.service";
import { operationalContextRepository } from "./context.repository";
import { fiscalGateway } from "../fiscal-gateway/fiscal-gateway.client";
import { env } from "../../config/env";

export const contextRouter = Router();

contextRouter.get("/me/context", requireAuth, async (req, res, next) => {
  try {
    const context = await getOperationalContext(req.user!, operationalContextRepository);
    res.json({ ...context, carga_masiva_habilitada: env.CARGA_MASIVA_ENABLED, nc_moneda_extranjera_habilitada: env.FE_NC_MONEDA_EXTRANJERA });
  } catch (error) {
    next(error);
  }
});

// SPEC_MULTIPERFIL_USUARIO_v0.1 §B.4: perfiles emitibles del usuario (tokens full y perfil_select).
contextRouter.get("/me/perfiles", requireAuth, async (req, res, next) => {
  try {
    const perfiles = await operationalContextRepository.listPerfilesDisponibles(req.user!.id);
    res.json({
      perfiles: perfiles.map((p) => ({ ...p, activo_en_sesion: p.operacion_config_id === (req.user!.operacionConfigId ?? null) }))
    });
  } catch (error) {
    next(error);
  }
});

contextRouter.get("/me/readiness", requireAuth, async (req, res, next) => {
  try {
    const readiness = await getReadiness(req.user!, operationalContextRepository, fiscalGateway);
    res.json(readiness);
  } catch (error) {
    next(error);
  }
});
