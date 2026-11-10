import type { DocumentoResponse } from "./facturas.types";

/**
 * SPEC_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1, fase B. Reglas puras de la inutilizacion del numero
 * de una factura rechazada. FS no decide si SIFEN confirmo el rechazo: eso lo decide FE.
 */

export interface NumeracionDelCdc {
  tipo: string;
  ruc: string;
  dv: string;
  establecimiento: string;
  punto: string;
  numero: string;
}

/**
 * Lee la numeracion de un CDC de 44 digitos (MT150): 1-2 tipo de documento, 3-10 RUC, 11 DV,
 * 12-14 establecimiento, 15-17 punto de expedicion, 18-24 numero. Es la identidad que SIFEN
 * conoce del documento, por eso RN-B2 la toma de aca y no del pedido del operador.
 */
export function leerNumeracionDelCdc(cdc: string | null | undefined): NumeracionDelCdc | null {
  if (!cdc || !/^\d{44}$/.test(cdc)) {
    return null;
  }
  return {
    tipo: cdc.slice(0, 2),
    ruc: cdc.slice(2, 10),
    dv: cdc.slice(10, 11),
    establecimiento: cdc.slice(11, 14),
    punto: cdc.slice(14, 17),
    numero: cdc.slice(17, 24)
  };
}

/** Ultimo grupo de digitos del numero fiscal, con 7 cifras: acepta `1010565` y `001-001-1010565`. */
export function numeroComparable(numeroFiscal: string | null | undefined): string | null {
  const grupos = numeroFiscal?.match(/\d+/g);
  const ultimo = grupos?.[grupos.length - 1];
  if (!ultimo || ultimo.length > 7) {
    return null;
  }
  return ultimo.padStart(7, "0");
}

/** `5057016-1` y el RUC `05057016` con DV `1` del CDC son el mismo emisor. */
export function mismoEmisor(emisorId: string, numeracion: Pick<NumeracionDelCdc, "ruc" | "dv">): boolean {
  const match = /^0*(\d+)-(\d)$/.exec(emisorId.trim());
  if (!match) {
    return false;
  }
  return match[1] === numeracion.ruc.replace(/^0+/, "") && match[2] === numeracion.dv;
}

/** RN-B1. */
export function puedeInutilizar(
  documento: Pick<DocumentoResponse, "tipo" | "estado" | "cdc" | "numero_fiscal" | "inutilizacion">
): boolean {
  return (
    documento.tipo === "FACTURA" &&
    documento.estado === "RECHAZADA" &&
    Boolean(documento.cdc) &&
    Boolean(documento.numero_fiscal) &&
    documento.inutilizacion?.status !== "ACCEPTED"
  );
}

/** Busca `dCodRes` y `dMsgRes` en la respuesta de SIFEN que reenvia FE, sin asumir su forma. */
export function buscarCodigoSifen(respuesta: unknown): { code: string | null; message: string | null } {
  let code: string | null = null;
  let message: string | null = null;
  const visitar = (valor: unknown, profundidad: number): void => {
    if (profundidad > 8 || valor === null || typeof valor !== "object") return;
    for (const [clave, interno] of Object.entries(valor as Record<string, unknown>)) {
      const nombre = clave.replace(/^.*:/, "");
      if (code === null && nombre === "dCodRes" && (typeof interno === "string" || typeof interno === "number")) {
        code = String(interno);
      } else if (message === null && nombre === "dMsgRes" && typeof interno === "string") {
        message = interno;
      } else {
        visitar(interno, profundidad + 1);
      }
    }
  };
  visitar(respuesta, 0);
  return { code, message };
}
