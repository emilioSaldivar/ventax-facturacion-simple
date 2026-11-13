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

// SPEC_NOTA_CREDITO_POR_MONTO_v0.1, RN-08: aplica a todos los modos (total, lineas y monto).
export const MENSAJE_TOTAL_EXCEDIDO =
  "La suma de las notas de crédito supera el total de la factura. Requiere soporte si no hay otras notas en Documentos.";
export const MENSAJE_FE_SIN_SOPORTE_EXTERNA =
  "El servicio fiscal todavía no acepta notas de crédito sobre facturas emitidas en otro sistema.";

/** SPEC_NOTA_CREDITO_FACTURA_EXTERNA_v0.1 RN-08 (SPEC de FE, RF1). */
const MENSAJES_FACTURA_ASOCIADA: Record<string, string> = {
  INVALID_REFERENCED_DOCUMENT_STATUS: "La factura no está aprobada en SIFEN o fue cancelada.",
  INVALID_REFERENCED_RECEIVER: "El cliente de la nota no es el de la factura.",
  UNIDENTIFIED_REFERENCED_RECEIVER: "SIFEN no admite nota de crédito de una factura sin nombre."
};

const ERRORES_CONSULTA_SIFEN = new Set(["RATE_LIMITED", "SIFEN_NO_DISPONIBLE", "SIFEN_TIMEOUT", "SIFEN_RESPUESTA_INVALIDA"]);

export const MENSAJE_MONEDA_DISTINTA = "La moneda de la nota de credito no coincide con la de la factura.";

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
    // SPEC_NOTA_CREDITO_PARCIAL_v0.1, RN-05: tambien cuando la suma de notas parciales supera la factura.
    throw new HttpError(409, "CONFLICT", MENSAJE_TOTAL_EXCEDIDO, { gateway_code: error.code, fe_code: feError, details: error.details ?? null });
  }
  // SPEC_NOTA_CREDITO_FACTURA_EXTERNA_v0.1 RN-08: FE anterior a rc4.35 no conoce la factura externa (sin numerar).
  if (feError === "REFERENCED_DOCUMENT_NOT_FOUND") {
    throw new HttpError(409, "CONFLICT", MENSAJE_FE_SIN_SOPORTE_EXTERNA, {
      reason: "NOTA_CREDITO_FE_SIN_SOPORTE_EXTERNA",
      gateway_code: error.code,
      fe_code: feError,
      details: error.details ?? null
    });
  }
  // RN-08 con rc4.35: rechazos de la factura asociada antes de numerar, con `details.cdc`.
  if (feError && MENSAJES_FACTURA_ASOCIADA[feError]) {
    throw new HttpError(409, "CONFLICT", MENSAJES_FACTURA_ASOCIADA[feError]!, { gateway_code: error.code, fe_code: feError, details: error.details ?? null });
  }
  // FE (rc4.35, RF1) relanza tal cual los errores de su consulta a SIFEN (§31) sobre la factura externa, antes de
  // numerar: no queda nota ni numero. Solo esos codigos; un 429/503 cualquiera sigue como antes (502, sin guardar).
  if (feError && ERRORES_CONSULTA_SIFEN.has(feError)) {
    throw new HttpError(503, "INTERNAL_ERROR", "SIFEN está ocupado: reintentá la nota de crédito en unos segundos.", {
      reason: "SIFEN_NO_DISPONIBLE",
      gateway_code: error.code,
      details: error.details ?? null
    });
  }
  if (feError === "INVALID_REFERENCED_DOCUMENT") {
    // RN-05: la moneda de la nota no coincide con la de la factura. FE no numero.
    throw new HttpError(409, "CONFLICT", MENSAJE_MONEDA_DISTINTA, { gateway_code: error.code, fe_code: feError, details: error.details ?? null });
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
