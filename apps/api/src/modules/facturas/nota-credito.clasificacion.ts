import { FiscalGatewayError, type FiscalEmitNotaCreditoResponse } from "../fiscal-gateway/fiscal-gateway.types";
import { HttpError } from "../../shared/errors/http-error";
import type { DocumentoEstado } from "./facturas.types";

/**
 * SPEC_NOTA_CREDITO_TRABADA_v0.1, RN-03, RN-04 y RN-10; PLAN, seccion 3.
 * Traduce lo que respondio FE a `POST /v1/nota-credito` a lo que FS persiste.
 * Una nota "trabada" queda en PENDIENTE_SIFEN con `code` en el estado fiscal guardado:
 * es la marca que lee `esNotaTrabada` para ofrecer el reintento con la misma clave.
 */
export interface ClasificacionNotaCredito {
  estado: DocumentoEstado;
  fiscalResponse: FiscalEmitNotaCreditoResponse | null;
  fiscalError: Record<string, unknown> | null;
  trabada: boolean;
}

const ESTADOS_FE_TRABADA = new Set(["DRAFT", "TRANSMISSION_FAILED"]);

export const MENSAJE_TOTAL_EXCEDIDO = "FE ya registra una nota de credito por esta factura. Requiere soporte.";

export function clasificarRespuestaNotaCredito(
  resultado: FiscalEmitNotaCreditoResponse | FiscalGatewayError
): ClasificacionNotaCredito {
  if (resultado instanceof FiscalGatewayError) {
    return clasificarError(resultado);
  }

  const status = resultado.status_raw;
  if (status && ESTADOS_FE_TRABADA.has(status)) {
    // RN-04: un 409 idempotent con DRAFT o TRANSMISSION_FAILED no es "en proceso": FE no la mueve sola.
    return {
      estado: "PENDIENTE_SIFEN",
      fiscalResponse: {
        ...resultado,
        estado: "PENDIENTE_SIFEN",
        raw: { ...resultado.raw, code: status, recoverable: true, suggested_action: "RETRY" }
      },
      fiscalError: null,
      trabada: true
    };
  }

  return { estado: resultado.estado, fiscalResponse: resultado, fiscalError: null, trabada: false };
}

function clasificarError(error: FiscalGatewayError): ClasificacionNotaCredito {
  const details = (error.details ?? null) as Record<string, unknown> | null;
  const httpStatus = typeof details?.status === "number" ? details.status : null;
  const body = (details?.body ?? null) as Record<string, unknown> | null;
  const feError = typeof body?.error === "string" ? body.error : null;

  if (feError === "CREDIT_NOTE_TOTAL_EXCEEDED") {
    // RN-10: FE tiene una nota por esta factura que FS no conoce. Caso residual.
    throw new HttpError(409, "CONFLICT", MENSAJE_TOTAL_EXCEDIDO, { gateway_code: error.code, details: error.details ?? null });
  }

  let code: string | null = null;
  if (error.code === "TIMEOUT" || httpStatus === 502 || httpStatus === 504) code = "TRANSMISSION_FAILED";
  else if (httpStatus === 500) code = "ISSUE_NCE_FAILED";

  if (!code) {
    // Errores que no crean la nota en FE (400, 401, 404, 409 sin idempotent, 422, 429): como hasta ahora.
    throw new HttpError(502, "INTERNAL_ERROR", "Backend fiscal rechazo la nota de credito.", {
      gateway_code: error.code,
      details: error.details ?? null
    });
  }

  // RN-03: FE pudo haber creado la nota con numero. Se guarda para reintentar con la misma clave.
  return {
    estado: "PENDIENTE_SIFEN",
    fiscalResponse: null,
    fiscalError: {
      code,
      message: error.message,
      details: error.details ?? null,
      recoverable: true,
      suggested_action: "RETRY",
      ...(identidadDelCuerpo(body) ?? {})
    },
    trabada: true
  };
}

/** Si FE mando identidad en el cuerpo del error, se conserva (PLAN, seccion 3). */
export function identidadDelCuerpo(body: Record<string, unknown> | null): Record<string, string> | null {
  if (!body) return null;
  const out: Record<string, string> = {};
  for (const campo of ["document_id", "document_uuid", "cdc", "nro_documento"]) {
    const valor = body[campo];
    if (typeof valor === "string" && valor.length > 0) out[campo] = valor;
  }
  return Object.keys(out).length ? out : null;
}
