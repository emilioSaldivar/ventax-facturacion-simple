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
    | "FE_DEFAULT_TIMBRADO"
    | "FE_DEFAULT_TIMBRADO_INICIO"
    | "FE_DEFAULT_ESTABLECIMIENTO"
    | "FE_DEFAULT_PUNTO_EXPEDICION"
    | "FE_DEFAULT_DOCUMENTO_NRO"
    | "FE_DEFAULT_CREDITO_PLAZO_DIAS"
  >
): FiscalGatewayConfig {
  return {
    mode: env.FE_GATEWAY_MODE,
    baseUrl: env.FE_API_BASE_URL.replace(/\/+$/, ""),
    apiKey: env.FE_API_KEY,
    timeoutMs: env.FE_API_TIMEOUT_MS,
    environment: env.FE_API_ENV,
    defaultTimbrado: env.FE_DEFAULT_TIMBRADO,
    defaultTimbradoInicio: env.FE_DEFAULT_TIMBRADO_INICIO,
    defaultEstablecimiento: env.FE_DEFAULT_ESTABLECIMIENTO,
    defaultPuntoExpedicion: env.FE_DEFAULT_PUNTO_EXPEDICION,
    defaultDocumentoNro: env.FE_DEFAULT_DOCUMENTO_NRO,
    defaultCreditoPlazoDias: env.FE_DEFAULT_CREDITO_PLAZO_DIAS
  };
}
