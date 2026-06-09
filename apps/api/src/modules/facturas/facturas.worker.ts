import type { FiscalGateway } from "../fiscal-gateway/fiscal-gateway.types";
import { logger } from "../../shared/logging/logger";
import { processNextQueuedFiscalEmission } from "./facturas.service";
import type { FacturaRepository } from "./facturas.types";

export function startFacturaEmissionWorker(options: {
  repository: FacturaRepository;
  gateway: FiscalGateway;
  gatewayWithKey: (apiKey: string) => FiscalGateway;
  intervalMs: number;
}): () => void {
  let running = false;

  async function tick(): Promise<void> {
    if (running) {
      return;
    }

    running = true;
    try {
      await processNextQueuedFiscalEmission(options.repository, options.gateway, options.gatewayWithKey);
    } catch (error) {
      logger.error({ err: error }, "factura emission worker failed");
    } finally {
      running = false;
    }
  }

  const interval = setInterval(() => {
    void tick();
  }, options.intervalMs);
  void tick();

  return () => clearInterval(interval);
}
