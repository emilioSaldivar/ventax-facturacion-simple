import { resolveCausaSifen, type AccionSugerida } from "./sifen-causa-catalogo";
import { puedeInutilizar } from "./facturas.inutilizacion";
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
> & {
  /**
   * Opcional a proposito (PLAN_REINTENTO_EMISION_CONFIRMADO_v0.1 §1): el conteo de salud
   * fiscal del backoffice arma este input a mano y no lo necesita. Sin el, ningun documento
   * es candidato a reintento, que es el lado seguro.
   */
  fiscal_status?: Record<string, unknown> | null;
  /** SPEC_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1, RN-C2. Opcionales por la misma razon. */
  corregida_por?: DocumentoResponse["corregida_por"];
  inutilizacion?: DocumentoResponse["inutilizacion"];
};

/**
 * Candidato a "Reintentar emision" (SPEC_REINTENTO_EMISION_CONFIRMADO_v0.1, RN-01): FE nunca
 * le asigno identidad y el ultimo intento del outbox fallo (failPendingEmission deja `code`).
 * Un documento con `document_uuid` o `cdc` ya llego a FE: lo que corresponde es verificar.
 * Ser candidato no autoriza a reencolar: el servicio confirma con FE antes (RN-02).
 */
export function puedeReintentarEmision(documento: DeriveAccionInput): boolean {
  // SPEC_NOTA_CREDITO_TRABADA_v0.1: la nota no pasa por el outbox de emision; se reintenta con su propia accion.
  if (documento.tipo === "NOTA_CREDITO") return false;
  return (
    (documento.estado === "ERROR_TEMPORAL" || documento.estado === "PENDIENTE_SIFEN") &&
    !documento.document_uuid &&
    !documento.cdc &&
    typeof documento.fiscal_status?.code === "string"
  );
}

/** Codigos con los que FS marca una nota de credito que FE pudo dejar a medias (SPEC_NOTA_CREDITO_TRABADA_v0.1). */
export const CODIGOS_NOTA_TRABADA = ["TRANSMISSION_FAILED", "DRAFT", "ISSUE_NCE_FAILED", "TIMEOUT"] as const;
const HORAS_NOTA_TRABADA_SOPORTE = 48;

/**
 * Nota trabada (SPEC_NOTA_CREDITO_TRABADA_v0.1, Definiciones): nota de credito pendiente cuyo ultimo
 * intento contra FE termino en error o en un `409 idempotent` con `DRAFT`/`TRANSMISSION_FAILED`.
 * Solo se destraba reintentando con la misma clave (RN-05).
 */
export function esNotaTrabada(documento: Pick<DeriveAccionInput, "tipo" | "estado" | "fiscal_status">): boolean {
  if (documento.tipo !== "NOTA_CREDITO") return false;
  if (documento.estado !== "PENDIENTE_SIFEN" && documento.estado !== "EMITIENDO") return false;
  const code = documento.fiscal_status?.code;
  return typeof code === "string" && (CODIGOS_NOTA_TRABADA as readonly string[]).includes(code);
}

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
      if (esNotaTrabada(documento)) {
        // RN-06: nunca "En proceso": nada la mueve si el operador no reintenta.
        if (ageHours >= HORAS_NOTA_TRABADA_SOPORTE) {
          return {
            accion: "REQUIERE_SOPORTE",
            accion_detalle: buildSoporteDetalle(
              documento,
              "Nota de crédito sin confirmar",
              `El servicio fiscal no confirmó esta nota de crédito en más de ${HORAS_NOTA_TRABADA_SOPORTE} horas. Necesita revisión de soporte.`
            )
          };
        }
        return {
          accion: "REQUIERE_ACCION",
          accion_detalle: {
            titulo: "Nota de crédito sin confirmar",
            descripcion:
              "El servicio fiscal no confirmó esta nota de crédito. Puede reintentarla: se completa con el mismo número, sin duplicarse.",
            acciones_sugeridas: ["REINTENTAR_NOTA_CREDITO"],
            soporte_payload: null
          }
        };
      }
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
      if (documento.corregida_por) {
        return {
          accion: "OK",
          accion_detalle: {
            titulo: `Corregida por la factura ${documento.corregida_por.numero_fiscal ?? "nueva"}`,
            descripcion: "Esta factura no llegó a SIFEN y ya se emitió su corrección. No requiere ninguna acción.",
            acciones_sugeridas: [],
            soporte_payload: null
          }
        };
      }
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
          acciones_sugeridas: puedeReintentarEmision(documento) ? ["REINTENTAR"] : [],
          soporte_payload: null
        }
      };

    case "RECHAZADA": {
      const causa = resolveCausaSifen(documento.sifen_result_code, documento.sifen_result_message);
      if (documento.tipo === "NOTA_CREDITO") {
        // RN-07: una nota rechazada se corrige emitiendo otra sobre la misma factura, nunca desde el editor de facturas.
        const detalle =
          causa.categoria === "USUARIO"
            ? { titulo: causa.titulo, descripcion: causa.descripcion, acciones_sugeridas: [] as AccionSugerida[], soporte_payload: null }
            : buildSoporteDetalle(documento, causa.titulo, causa.descripcion);
        return {
          accion: causa.categoria === "USUARIO" ? "REQUIERE_ACCION" : "REQUIERE_SOPORTE",
          accion_detalle: {
            ...detalle,
            acciones_sugeridas: [
              "NUEVA_NOTA_CREDITO",
              ...detalle.acciones_sugeridas.filter((a) => a !== "CORREGIR_REEMITIR" && a !== "CREAR_NCE")
            ]
          }
        };
      }
      const resuelta = resolucionDeRechazada(documento);
      if (resuelta) {
        return resuelta;
      }
      const inutilizable = puedeInutilizar(documento);
      if (causa.categoria === "USUARIO") {
        return {
          accion: "REQUIERE_ACCION",
          accion_detalle: {
            titulo: causa.titulo,
            descripcion: causa.descripcion,
            acciones_sugeridas: [...causa.acciones, ...(inutilizable ? (["INUTILIZAR_NUMERO"] as AccionSugerida[]) : [])],
            soporte_payload: null
          }
        };
      }
      const soporte = buildSoporteDetalle(documento, causa.titulo, causa.descripcion);
      return {
        accion: "REQUIERE_SOPORTE",
        accion_detalle: {
          ...soporte,
          acciones_sugeridas: [...soporte.acciones_sugeridas, ...(inutilizable ? (["INUTILIZAR_NUMERO"] as AccionSugerida[]) : [])]
        }
      };
    }

    default:
      return {
        accion: "REQUIERE_SOPORTE",
        accion_detalle: buildSoporteDetalle(documento, "Estado no reconocido", "No pudimos determinar el estado de este documento automáticamente.")
      };
  }
}

/**
 * SPEC_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1, RN-C2: una factura rechazada corregida o con el
 * numero inutilizado. `null` si no tiene ninguna de las dos: sigue la causa de SIFEN.
 */
function resolucionDeRechazada(documento: DeriveAccionInput): { accion: DocumentoAccion; accion_detalle: DocumentoAccionDetalle } | null {
  const corregida = documento.corregida_por ?? null;
  const inutilizada = documento.inutilizacion?.status === "ACCEPTED";
  const numeroCorreccion = corregida?.numero_fiscal ?? "nueva";
  if (corregida && inutilizada) {
    return {
      accion: "OK",
      accion_detalle: {
        titulo: "Factura rechazada resuelta",
        descripcion: `Se corrigió con la factura ${numeroCorreccion} y su número quedó inutilizado ante SIFEN. No requiere ninguna acción.`,
        acciones_sugeridas: [],
        soporte_payload: null
      }
    };
  }
  if (inutilizada) {
    return {
      accion: "OK",
      accion_detalle: {
        titulo: "Número inutilizado",
        descripcion: "El número de esta factura quedó inutilizado ante SIFEN. Si la venta todavía se factura, use Corregir y emitir de nuevo.",
        acciones_sugeridas: ["CORREGIR_REEMITIR"],
        soporte_payload: null
      }
    };
  }
  if (corregida) {
    return {
      accion: "REQUIERE_ACCION",
      accion_detalle: {
        titulo: `Corregida por la factura ${numeroCorreccion}`,
        descripcion: "Falta inutilizar el número de esta factura rechazada.",
        acciones_sugeridas: puedeInutilizar(documento) ? ["INUTILIZAR_NUMERO"] : [],
        soporte_payload: null
      }
    };
  }
  return null;
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
  // RN-08: con identidad fiscal el operador puede adelantarse a la verificacion automatica.
  const cierre = documento.document_uuid || documento.cdc
    ? "Si ya debería estar aprobada, podés verificar ahora."
    : "No necesitás hacer nada.";
  return {
    titulo: "Verificación automática en curso",
    descripcion: lastChecked
      ? `Estamos verificando el estado fiscal automáticamente. Última verificación: ${lastChecked}. ${cierre}`
      : `Estamos verificando el estado fiscal automáticamente. ${cierre}`,
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
