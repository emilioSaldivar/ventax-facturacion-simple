import { HttpError } from "../../shared/errors/http-error";
import type { FiscalGateway, FiscalGatewayHealth } from "../fiscal-gateway/fiscal-gateway.types";
import type { OperationalContextRepository, OperationalContextResponse, ReadinessResponse } from "./context.types";

const fiscalReadinessCacheTtlMs = 10_000;
let fiscalReadinessCache: { expiresAt: number; health: FiscalGatewayHealth } | null = null;

/** Quien pide el contexto: el usuario autenticado y el `uoc` de su token (SPEC_MULTIPERFIL_USUARIO_v0.1). */
export interface SesionOperativa {
  id: string;
  operacionConfigId?: string | null;
}

export const MENSAJE_SIN_CONFIGURACION = "Usuario sin configuracion operativa completa.";
export const MENSAJE_PERFIL_REQUERIDO = "Elegi el punto de expedicion para continuar. Cerra sesion y volve a entrar.";
export const MENSAJE_PERFIL_NO_DISPONIBLE = "El punto de expedicion de tu sesion ya no esta disponible.";

/**
 * SPEC_MULTIPERFIL_USUARIO_v0.1 §B.7. Con `uoc`, esa configuracion o 409 PERFIL_NO_DISPONIBLE.
 * Sin `uoc` (token anterior al despliegue, D-6): una emitible se resuelve sola; varias, 409
 * PERFIL_REQUERIDO; ninguna, el 409 de siempre.
 */
export async function getOperationalContext(
  sesion: SesionOperativa,
  repository: OperationalContextRepository
): Promise<OperationalContextResponse> {
  const operacionConfigId = await resolverOperacionConfig(sesion, repository);
  const context = await repository.getOperationalContext(sesion.id, operacionConfigId);

  if (!context) {
    if (sesion.operacionConfigId) {
      throw new HttpError(409, "CONFLICT", MENSAJE_PERFIL_NO_DISPONIBLE, { reason: "PERFIL_NO_DISPONIBLE" });
    }
    throw new HttpError(409, "CONFLICT", MENSAJE_SIN_CONFIGURACION);
  }

  return context;
}

async function resolverOperacionConfig(sesion: SesionOperativa, repository: OperationalContextRepository): Promise<string | null> {
  if (sesion.operacionConfigId) {
    return sesion.operacionConfigId;
  }
  const perfiles = await repository.listPerfilesDisponibles(sesion.id);
  if (perfiles.length === 0) {
    throw new HttpError(409, "CONFLICT", MENSAJE_SIN_CONFIGURACION);
  }
  if (perfiles.length > 1) {
    throw new HttpError(409, "CONFLICT", MENSAJE_PERFIL_REQUERIDO, { reason: "PERFIL_REQUERIDO" });
  }
  return perfiles[0]!.operacion_config_id;
}

export async function getReadiness(
  sesion: SesionOperativa,
  repository: OperationalContextRepository,
  gateway?: FiscalGateway
): Promise<ReadinessResponse> {
  // Sin `uoc` y con varias configuraciones, el readiness mira la primera: es informativo y
  // /me/context ya responde PERFIL_REQUERIDO en ese caso.
  const checks = await repository.getReadinessChecks(sesion.id, sesion.operacionConfigId ?? null);
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
