/**
 * SPEC_NOTA_CREDITO_FACTURA_EXTERNA_v0.1 RN-01 y SPEC_REMISION_FACTURA_ASOCIADA_CDC_v0.1 RN-01 (PLAN 1 de las dos).
 * Lectura y validacion del CDC (MT150 §10.1), 44 digitos:
 *
 *   pos 1-2   tipo de documento (01 factura, 05 nota de credito, 07 nota de remision, ...)
 *   pos 3-10  RUC del emisor sin DV, con ceros a la izquierda · pos 11 DV del RUC
 *   pos 12-14 establecimiento · pos 15-17 punto de expedicion · pos 18-24 numero
 *   pos 25    tipo de contribuyente · pos 26-33 fecha AAAAMMDD · pos 34 tipo de emision
 *   pos 35-43 codigo de seguridad · pos 44 digito verificador (modulo 11 sobre los 43 anteriores)
 *
 * Compartido por la API (al traer y emitir) y la pantalla (antes de llamar a la API).
 */

export const CDC_TIPO_FACTURA = "01";

export interface PartesCdc {
  tipo: string;
  ruc: string;
  dv: string;
  establecimiento: string;
  punto: string;
  numero: string;
  tipo_contribuyente: string;
  /** `AAAA-MM-DD`. */
  fecha: string;
  tipo_emision: string;
  codigo_seguridad: string;
  dv_cdc: string;
}

export type MotivoCdcInvalido = "CDC_FORMATO" | "CDC_DV" | "CDC_NO_ES_FACTURA" | "CDC_OTRO_EMISOR";

export interface CdcInvalido {
  motivo: MotivoCdcInvalido;
  mensaje: string;
}

/** Quita espacios, guiones y todo lo que no sea digito (el KUDE imprime el CDC en grupos). */
export function normalizarCdc(texto: string): string {
  return (texto ?? "").replace(/\D/g, "");
}

/** Modulo 11 (MT150 §10.1.1): pesos 2 a 11 de derecha a izquierda; resto 0 o 1 → 0, si no 11 − resto. */
export function digitoVerificadorCdc(cdc43: string): number | null {
  if (!/^\d{43}$/.test(cdc43)) return null;
  let peso = 2;
  let suma = 0;
  for (let i = cdc43.length - 1; i >= 0; i -= 1) {
    suma += Number(cdc43[i]) * peso;
    peso = peso === 11 ? 2 : peso + 1;
  }
  const resto = suma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function partesDelCdc(cdc: string): PartesCdc | null {
  if (!/^\d{44}$/.test(cdc)) return null;
  const fecha = cdc.slice(25, 33);
  return {
    tipo: cdc.slice(0, 2),
    ruc: cdc.slice(2, 10),
    dv: cdc.slice(10, 11),
    establecimiento: cdc.slice(11, 14),
    punto: cdc.slice(14, 17),
    numero: cdc.slice(17, 24),
    tipo_contribuyente: cdc.slice(24, 25),
    fecha: `${fecha.slice(0, 4)}-${fecha.slice(4, 6)}-${fecha.slice(6, 8)}`,
    tipo_emision: cdc.slice(33, 34),
    codigo_seguridad: cdc.slice(34, 43),
    dv_cdc: cdc.slice(43, 44)
  };
}

/** `001-001-1010665`; null si el CDC no tiene 44 digitos. */
export function numeroFiscalDelCdc(cdc: string): string | null {
  const partes = partesDelCdc(cdc);
  return partes ? `${partes.establecimiento}-${partes.punto}-${partes.numero}` : null;
}

/** El RUC del CDC va sin DV y con ceros a la izquierda; el del facturador, `base-dv`. */
export function mismoEmisorDelCdc(partes: Pick<PartesCdc, "ruc" | "dv">, emisorId: string): boolean {
  const match = /^0*(\d+)-(\d)$/.exec(emisorId.trim());
  if (!match) return false;
  return match[1] === partes.ruc.replace(/^0+/, "") && match[2] === partes.dv;
}

/** RN-01: 44 digitos, DV, tipo factura (01) y RUC/DV del facturador (`base-dv`). null si vale. */
export function validarCdcFactura(cdcTexto: string, emisorId: string): CdcInvalido | null {
  const cdc = normalizarCdc(cdcTexto);
  if (cdc.length !== 44) {
    return { motivo: "CDC_FORMATO", mensaje: `El CDC tiene que tener 44 dígitos (tiene ${cdc.length}).` };
  }
  if (digitoVerificadorCdc(cdc.slice(0, 43)) !== Number(cdc[43])) {
    return { motivo: "CDC_DV", mensaje: "El CDC no es válido: el dígito verificador no coincide. Revisá los 44 dígitos." };
  }
  const partes = partesDelCdc(cdc)!;
  if (partes.tipo !== CDC_TIPO_FACTURA) {
    return { motivo: "CDC_NO_ES_FACTURA", mensaje: `El CDC no es de una factura electrónica (es de un documento tipo ${partes.tipo}).` };
  }
  if (!mismoEmisorDelCdc(partes, emisorId)) {
    return { motivo: "CDC_OTRO_EMISOR", mensaje: `El CDC es de otro RUC (${partes.ruc.replace(/^0+/, "")}-${partes.dv}), no de este facturador.` };
  }
  return null;
}
