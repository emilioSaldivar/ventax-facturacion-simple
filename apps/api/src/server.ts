import { env } from "./config/env";
import { createApp } from "./app";
import { facturasRepository } from "./modules/facturas/facturas.repository";
import { startFacturaEmissionWorker } from "./modules/facturas/facturas.worker";
import { fiscalGateway } from "./modules/fiscal-gateway/fiscal-gateway.client";
import { logger } from "./shared/logging/logger";

const app = createApp();

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, basePath: env.API_BASE_PATH }, "API listening");
});

if (env.FE_OUTBOX_WORKER_ENABLED) {
  startFacturaEmissionWorker({
    repository: facturasRepository,
    gateway: fiscalGateway,
    intervalMs: env.FE_OUTBOX_WORKER_INTERVAL_MS
  });
  logger.info({ intervalMs: env.FE_OUTBOX_WORKER_INTERVAL_MS }, "factura emission worker enabled");
}
