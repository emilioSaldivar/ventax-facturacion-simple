import type { Env } from "../../config/env";
import type { FiscalGatewayConfig } from "./fiscal-gateway.types";

export function buildFiscalGatewayConfig(
  env: Pick<
    Env,
    | "FE_API_BASE_URL"
    | "FE_API_KEY"
    | "FE_API_TIMEOUT_MS"
    | "FE_API_ENV"
    | "FE_GATEWAY_MODE"
    | "FE_SEND_EMISSION_PROFILE_CODE"
    | "FE_SERVICE_NUMBERING"
  >
): FiscalGatewayConfig {
  return {
    mode: env.FE_GATEWAY_MODE,
    baseUrl: env.FE_API_BASE_URL.replace(/\/+$/, ""),
    apiKey: env.FE_API_KEY,
    timeoutMs: env.FE_API_TIMEOUT_MS,
    environment: env.FE_API_ENV,
    sendEmissionProfileCode: env.FE_SEND_EMISSION_PROFILE_CODE,
    serviceNumbering: env.FE_SERVICE_NUMBERING
  };
}
