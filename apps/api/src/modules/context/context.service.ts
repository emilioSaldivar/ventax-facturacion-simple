import { HttpError } from "../../shared/errors/http-error";
import type { FiscalGateway, FiscalGatewayHealth } from "../fiscal-gateway/fiscal-gateway.types";
import type { OperationalContextRepository, OperationalContextResponse, ReadinessResponse } from "./context.types";

const fiscalReadinessCacheTtlMs = 10_000;
let fiscalReadinessCache: { expiresAt: number; health: FiscalGatewayHealth } | null = null;

export async function getOperationalContext(
  userId: string,
  repository: OperationalContextRepository
): Promise<OperationalContextResponse> {
  const context = await repository.getOperationalContext(userId);

  if (!context) {
    throw new HttpError(409, "CONFLICT", "Usuario sin configuracion operativa completa.");
  }

  return context;
}

export async function getReadiness(
  userId: string,
  repository: OperationalContextRepository,
  gateway?: FiscalGateway
): Promise<ReadinessResponse> {
  const checks = await repository.getReadinessChecks(userId);
  const allChecks = gateway ? [...checks, await getFiscalReadinessCheck(gateway)] : checks;

  return {
    ready: allChecks.every((check) => check.ok),
    checks: allChecks
  };
}

async function getFiscalReadinessCheck(gateway: FiscalGateway) {
  const health = await getCachedFiscalHealth(gateway);

  return {
    code: "fiscal_backend_ready",
    ok: health.ok,
    message: health.ok
      ? `Backend fiscal disponible (${health.mode}).`
      : health.message ?? "Backend fiscal no disponible para emitir."
  };
}

async function getCachedFiscalHealth(gateway: FiscalGateway): Promise<FiscalGatewayHealth> {
  const now = Date.now();
  if (fiscalReadinessCache && fiscalReadinessCache.expiresAt > now) {
    return fiscalReadinessCache.health;
  }

  const health = await gateway.health().catch((error: unknown) => ({
    ok: false,
    mode: "real" as const,
    message: error instanceof Error ? error.message : "Backend fiscal no disponible."
  }));
  fiscalReadinessCache = {
    expiresAt: now + fiscalReadinessCacheTtlMs,
    health
  };

  return health;
}

export function clearFiscalReadinessCacheForTests(): void {
  fiscalReadinessCache = null;
}
