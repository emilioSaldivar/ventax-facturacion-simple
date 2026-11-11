// Mapa unico de estados a texto y tono (PAUTAS_FRONTEND_v0.1 P-E1, P-E2; PLAN_UX_RESTO_APP_v0.1 §10.3).
// Los tonos son las clases que ya existen en styles.css (.status-pill.<tono>), para no cambiar estilos.

export type TonoEstado = "ready" | "pending" | "blocked" | "rechazado" | "draft" | "anulada" | "vencido";

export interface Estado {
  texto: string;
  tono: TonoEstado;
  codigo: string;
}

export type TipoDocumento = "FACTURA" | "NOTA_CREDITO" | "NOTA_REMISION";

export type CodigoEstadoDocumento =
  | "EMITIENDO"
  | "EMITIDA"
  | "PENDIENTE_SIFEN"
  | "RECHAZADA"
  | "ERROR_OPERATIVO"
  | "ERROR_TEMPORAL"
  | "ANULADA"
  | "CANCELADO_LOCAL";

/** Lo minimo de un documento que hace falta para su estado (estructural: no depende de los tipos de main.tsx). */
export interface DocumentoConEstado {
  tipo: TipoDocumento;
  estado: CodigoEstadoDocumento;
  accion_detalle?: { acciones_sugeridas: string[] } | null;
  inutilizacion?: { status?: string | null } | null;
  corregida_por?: unknown;
}

export function formatDocumentoTipo(value: TipoDocumento): string {
  return value === "NOTA_CREDITO" ? "Nota credito" : value === "NOTA_REMISION" ? "Nota de remisión" : "Factura";
}

export function esNotaSinConfirmar(documento: Pick<DocumentoConEstado, "accion_detalle">): boolean {
  return Boolean(documento.accion_detalle?.acciones_sugeridas.includes("REINTENTAR_NOTA_CREDITO"));
}

/** Tono de la pastilla: el mismo criterio que tenia EstadoDocumentoPill. */
function tonoDocumento(documento: DocumentoConEstado): TonoEstado {
  if (documento.estado === "EMITIDA") return "ready";
  if (documento.estado === "ANULADA") return "anulada";
  if (documento.estado === "RECHAZADA" || documento.estado === "ERROR_OPERATIVO" || esNotaSinConfirmar(documento)) return "rechazado";
  return "pending";
}

/** Texto del estado, sin emojis (P-I1). Mismos textos que la pastilla anterior, sin el emoji del principio. */
function textoDocumento(documento: DocumentoConEstado): string {
  if (esNotaSinConfirmar(documento)) return "Nota credito sin confirmar";
  // SPEC_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1, RN-C1.
  if (documento.tipo === "FACTURA" && documento.estado === "RECHAZADA") {
    const inutilizada = documento.inutilizacion?.status === "ACCEPTED";
    if (documento.corregida_por && inutilizada) return "Resuelta";
    if (inutilizada) return "Número inutilizado";
    if (documento.corregida_por) return "Corregida, falta inutilizar";
  }
  const nombre = formatDocumentoTipo(documento.tipo);
  switch (documento.estado) {
    case "EMITIDA":
      return `${nombre} emitida`;
    case "EMITIENDO":
    case "PENDIENTE_SIFEN":
      return `Procesando ${nombre.toLowerCase()}`;
    case "ANULADA":
      return "Anulada";
    case "CANCELADO_LOCAL":
      return "Cancelada antes de enviar";
    default:
      return "Requiere revision";
  }
}

/** Estado visible de un documento fiscal. */
export function estadoDocumento(documento: DocumentoConEstado): Estado {
  return { texto: textoDocumento(documento), tono: tonoDocumento(documento), codigo: documento.estado };
}

export type CodigoEstadoRecibo = "BORRADOR" | "EMITIDO" | "ANULADO";

/** Estado de un recibo de dinero: antes se mostraba el enum crudo ("EMITIDO"). */
export function estadoRecibo(estado: CodigoEstadoRecibo): Estado {
  if (estado === "EMITIDO") return { texto: "Emitido", tono: "ready", codigo: estado };
  if (estado === "ANULADO") return { texto: "Anulado", tono: "anulada", codigo: estado };
  return { texto: "Borrador", tono: "blocked", codigo: estado };
}
