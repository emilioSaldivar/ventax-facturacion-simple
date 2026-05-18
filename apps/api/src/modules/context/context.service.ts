import { HttpError } from "../../shared/errors/http-error";
import type { OperationalContextRepository, OperationalContextResponse, ReadinessResponse } from "./context.types";

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
  repository: OperationalContextRepository
): Promise<ReadinessResponse> {
  const checks = await repository.getReadinessChecks(userId);

  return {
    ready: checks.every((check) => check.ok),
    checks
  };
}

