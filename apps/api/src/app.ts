import crypto from "node:crypto";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { authRouter } from "./modules/auth/auth.routes";
import { backofficeRouter } from "./modules/backoffice/backoffice.routes";
import { catalogoRouter } from "./modules/catalogo/catalogo.routes";
import { clientesRouter } from "./modules/clientes/clientes.routes";
import { contextRouter } from "./modules/context/context.routes";
import { entregaRouter, publicEntregaRouter } from "./modules/entrega/entrega.routes";
import { facturasRouter } from "./modules/facturas/facturas.routes";
import { fiscalGatewayRouter } from "./modules/fiscal-gateway/fiscal-gateway.routes";
import { healthRouter } from "./modules/health/health.routes";
import { notasRouter } from "./modules/notas/notas.routes";
import { onboardingRouter } from "./modules/onboarding/onboarding.routes";
import { recibosRouter } from "./modules/recibos/recibos.routes";
import { verificacionRouter } from "./modules/verificacion/verificacion.routes";
import { errorHandler } from "./shared/errors/error-handler";
import { HttpError } from "./shared/errors/http-error";
import { logger } from "./shared/logging/logger";

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      origin: [env.APP_ORIGIN, env.BACKOFFICE_ORIGIN],
      exposedHeaders: ["X-App-Version"]
    })
  );

  app.use((_req, res, next) => {
    res.setHeader("X-App-Version", env.APP_VERSION);
    next();
  });
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => {
        const existing = req.headers["x-request-id"];
        return typeof existing === "string" && existing.length > 0 ? existing : crypto.randomUUID();
      }
    })
  );

  app.use((req, _res, next) => {
    req.id = String(req.id);
    next();
  });

  app.use(env.API_BASE_PATH, authRouter);
  app.use(env.API_BASE_PATH, onboardingRouter);
  app.use(env.API_BASE_PATH, backofficeRouter);
  app.use(env.API_BASE_PATH, contextRouter);
  app.use(env.API_BASE_PATH, clientesRouter);
  app.use(env.API_BASE_PATH, catalogoRouter);
  app.use(env.API_BASE_PATH, facturasRouter);
  app.use(env.API_BASE_PATH, entregaRouter);
  app.use(env.API_BASE_PATH, fiscalGatewayRouter);
  app.use(env.API_BASE_PATH, notasRouter);
  app.use(env.API_BASE_PATH, recibosRouter);
  app.use(env.API_BASE_PATH, healthRouter);
  app.use(publicEntregaRouter);
  app.use("/verificar", verificacionRouter);
  app.get("/health", (_req, res) => res.redirect(307, `${env.API_BASE_PATH}/health`));

  app.use((_req, _res, next) => {
    next(new HttpError(404, "NOT_FOUND", "Ruta no encontrada."));
  });
  app.use(errorHandler);

  return app;
}
