// Movido de main.tsx sin cambios (PLAN_UX_RESTO_APP_v0.1 §10.9, URA-023).
import { formatDocumentoTipo } from "./estados";
import { type DocumentoEstado, type DocumentoResponse } from "../tipos";

/** RN-10: estados en los que verificar ya no le aporta nada al operador. */
export function esEstadoFinalOperador(estado: DocumentoEstado): boolean {
  return estado === "EMITIDA" || estado === "ANULADA" || estado === "CANCELADO_LOCAL";
}

/** RN-03: el backend solo reencola con confirmacion de FE; si FE ya lo tenia, devuelve el estado refrescado. */
export function mensajeResultadoReintento(documento: DocumentoResponse): string {
  return documento.estado === "EMITIENDO"
    ? "Reintento de emisión enviado."
    : "La factura ya había llegado a facturación electrónica. Actualizamos su estado.";
}

/** Texto simple del estado, sin emojis (PAUTAS_FRONTEND_v0.1 P-I1, URA-007). */
export function getSimpleDocumentoEstado(value: DocumentoEstado, tipo?: DocumentoResponse["tipo"]): string {
  const nombre = formatDocumentoTipo(tipo ?? "FACTURA");
  if (value === "EMITIDA") {
    return `${nombre} emitida`;
  }
  if (value === "RECHAZADA" || value === "ERROR_OPERATIVO" || value === "ERROR_TEMPORAL" || value === "ANULADA" || value === "CANCELADO_LOCAL") {
    return "Requiere revisión";
  }
  return `Procesando ${nombre.toLowerCase()}`;
}

export function getDocumentoNombreLower(tipo: DocumentoResponse["tipo"]): string {
  return tipo === "NOTA_CREDITO" ? "nota de crédito" : tipo === "NOTA_REMISION" ? "nota de remisión" : "factura";
}

export function mensajeNotaCredito(nota: DocumentoResponse): string {
  if (nota.estado === "EMITIDA") return "Nota de crédito emitida.";
  if (nota.estado === "RECHAZADA") return "SIFEN rechazó la nota de crédito.";
  if (nota.accion_detalle?.acciones_sugeridas.includes("REINTENTAR_NOTA_CREDITO")) {
    return "La nota de crédito sigue sin confirmarse. Podés reintentar más tarde, sin riesgo de duplicarla.";
  }
  return "La nota de crédito está pendiente de confirmación SIFEN.";
}

export function formatEmailStatus(value: string): string {
  if (value === "DELEGATED") {
    return "Delegado";
  }
  if (value === "PENDING") {
    return "En cola";
  }
  if (value === "SENT") {
    return "Enviado";
  }
  if (value === "FAILED") {
    return "Fallido";
  }
  if (value === "NOT_APPLICABLE") {
    return "Sin email";
  }
  return "Desconocido";
}
