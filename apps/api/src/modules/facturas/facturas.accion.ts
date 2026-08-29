import { resolveCausaSifen, type AccionSugerida } from "./sifen-causa-catalogo";
import type { DocumentoAccion, DocumentoAccionDetalle, DocumentoResponse } from "./facturas.types";

const DIAS_VENCIMIENTO_VERIFICACION = 30;
const HORAS_PERSISTENCIA_ERROR_TEMPORAL = 1;

/**
 * Campos minimos que deriveAccion necesita — cualquier DocumentoResponse los cumple
 * estructuralmente, pero esto permite invocarla tambien desde queries de agregacion
 * (ej. conteos de salud fiscal por facturador) sin construir un DocumentoResponse
 * completo con items/cliente/totals/delivery.
 */
export type DeriveAccionInput = Pick<
  DocumentoResponse,
  | "id"
  | "tipo"
  | "estado"
  | "document_uuid"
  | "cdc"
  | "numero_fiscal"
  | "fiscal_status_raw"
  | "sifen_result_code"
  | "sifen_result_message"
  | "sifen_last_checked_at"
  | "created_at"
>;

/**
 * Deriva el estado de accion "intuitivo" (SPEC_BACKOFFICE_ALINEACION_FE_v0.2, seccion 2.4)
 * a partir del estado tecnico del documento. Solo 4 valores posibles (RN-V4): sin
 * informacion suficiente para decidir, el default es REQUIERE_SOPORTE — nunca se deja
 * al usuario sin una salida.
 *
 * Nota de implementacion: el SPEC habla de "ERROR_TEMPORAL persistente (> N intentos)".
 * El contador de reintentos del outbox (factura_emision_outbox.attempts) no forma parte
 * de DocumentoResponse — usamos la antiguedad del documento (created_at) como proxy de
 * persistencia en su lugar, igual que para el vencimiento de PENDIENTE_SIFEN.
 *
 * HORAS_PERSISTENCIA_ERROR_TEMPORAL=1 (SPEC_CONTROL_REINTENTOS_EMISION_v0.1, incidente
 * AWAPURA 2026-08-14/24): decision de negocio del 2026-08-24 de alertar rapido en vez de
 * esperar 24h — con reintentos frecuentes, seguir fallando pasada 1 hora ya es una senal
 * fuerte de que no se va a autorresolver. Este mismo umbral gobierna tanto el badge que ve
 * el operador como el disparo de la notificacion por correo desde el worker de outbox
 * (processNextQueuedFiscalEmission en facturas.service.ts).
 */
export function deriveAccion(documento: DeriveAccionInput): { accion: DocumentoAccion; accion_detalle: DocumentoAccionDetalle } {
  const ageMs = documento.created_at ? Date.now() - new Date(documento.created_at).getTime() : 0;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const ageHours = ageMs / (1000 * 60 * 60);

  switch (documento.estado) {
    case "EMITIDA":
      return { accion: "OK", accion_detalle: buildOkDetalle(documento) };

    case "ANULADA":
    case "CANCELADO_LOCAL":
      return { accion: "OK", accion_detalle: buildTerminalDetalle(documento) };

    case "EMITIENDO":
    case "PENDIENTE_SIFEN":
      if (ageDays > DIAS_VENCIMIENTO_VERIFICACION) {
        return {
          accion: "REQUIERE_SOPORTE",
          accion_detalle: buildSoporteDetalle(
            documento,
            "Verificación fiscal sin resolver",
            `Este documento lleva más de ${DIAS_VENCIMIENTO_VERIFICACION} días sin una confirmación de SIFEN. Necesita revisión de soporte.`
          )
        };
      }
      return { accion: "EN_PROCESO", accion_detalle: buildEnProcesoDetalle(documento) };

    case "ERROR_OPERATIVO":
      return {
        accion: "REQUIERE_ACCION",
        accion_detalle: {
          titulo: "Datos del documento incompletos",
          descripcion: "Hay un problema con los datos cargados antes de enviar a SIFEN. Revise el documento y vuelva a intentar.",
          acciones_sugeridas: ["CORREGIR_REEMITIR"],
          soporte_payload: null
        }
      };

    case "ERROR_TEMPORAL":
      if (ageHours > HORAS_PERSISTENCIA_ERROR_TEMPORAL) {
        return {
          accion: "REQUIERE_SOPORTE",
          accion_detalle: buildSoporteDetalle(
            documento,
            "Error técnico persistente",
            `El sistema intentó enviar este documento a SIFEN sin éxito por más de ${HORAS_PERSISTENCIA_ERROR_TEMPORAL} horas.`
          )
        };
      }
      return {
        accion: "EN_PROCESO",
        accion_detalle: {
          titulo: "Reintentando envío",
          descripcion: "Hubo un error técnico temporal. El sistema sigue reintentando el envío automáticamente.",
          acciones_sugeridas: ["REINTENTAR"],
          soporte_payload: null
        }
      };

    case "RECHAZADA": {
      const causa = resolveCausaSifen(documento.sifen_result_code, documento.sifen_result_message);
      if (causa.categoria === "USUARIO") {
        return {
          accion: "REQUIERE_ACCION",
          accion_detalle: {
            titulo: causa.titulo,
            descripcion: causa.descripcion,
            acciones_sugeridas: causa.acciones,
            soporte_payload: null
          }
        };
      }
      return {
        accion: "REQUIERE_SOPORTE",
        accion_detalle: buildSoporteDetalle(documento, causa.titulo, causa.descripcion)
      };
    }

    default:
      return {
        accion: "REQUIERE_SOPORTE",
        accion_detalle: buildSoporteDetalle(documento, "Estado no reconocido", "No pudimos determinar el estado de este documento automáticamente.")
      };
  }
}

function buildOkDetalle(documento: DeriveAccionInput): DocumentoAccionDetalle {
  return {
    titulo: documento.tipo === "NOTA_CREDITO" ? "Nota de crédito emitida" : "Factura emitida",
    descripcion: "El documento fue aprobado por SIFEN. No requiere ninguna acción.",
    acciones_sugeridas: [],
    soporte_payload: null
  };
}

function buildTerminalDetalle(documento: DeriveAccionInput): DocumentoAccionDetalle {
  return {
    titulo: documento.estado === "ANULADA" ? "Documento anulado" : "Cancelado antes de enviar",
    descripcion: "Este documento no está activo. No requiere ninguna acción.",
    acciones_sugeridas: [],
    soporte_payload: null
  };
}

function buildEnProcesoDetalle(documento: DeriveAccionInput): DocumentoAccionDetalle {
  const lastChecked = documento.sifen_last_checked_at ? formatRelativeCheckedAt(documento.sifen_last_checked_at) : null;
  return {
    titulo: "Verificación automática en curso",
    descripcion: lastChecked
      ? `Estamos verificando el estado fiscal automáticamente. Última verificación: ${lastChecked}. No necesitás hacer nada.`
      : "Estamos verificando el estado fiscal automáticamente. No necesitás hacer nada.",
    acciones_sugeridas: [],
    soporte_payload: null
  };
}

function buildSoporteDetalle(documento: DeriveAccionInput, titulo: string, descripcion: string): DocumentoAccionDetalle {
  return {
    titulo,
    descripcion,
    acciones_sugeridas: ["CONTACTAR_SOPORTE"] as AccionSugerida[],
    soporte_payload: {
      documento_id: documento.id,
      document_uuid: documento.document_uuid,
      cdc: documento.cdc,
      numero_fiscal: documento.numero_fiscal,
      sifen_result_code: documento.sifen_result_code,
      sifen_result_message: documento.sifen_result_message,
      fiscal_status_raw: documento.fiscal_status_raw,
      created_at: documento.created_at
    }
  };
}

function formatRelativeCheckedAt(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "hace instantes";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;
  const diffDays = Math.round(diffHours / 24);
  return `hace ${diffDays} d`;
}
