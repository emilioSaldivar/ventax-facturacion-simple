import type { TipoIva } from "../constants/documentos";

export type PygAmount = number;

export interface TaxInputLine {
  codigo?: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: PygAmount;
  iva_tipo: TipoIva;
}

export interface TaxCalculatedLine extends TaxInputLine {
  line_no: number;
  codigo: string | null;
  subtotal: PygAmount;
  base_imponible: PygAmount;
  iva_monto: PygAmount;
}

export interface TaxTotals {
  subtotal: PygAmount;
  total_sin_iva: PygAmount;
  iva_5: PygAmount;
  iva_10: PygAmount;
  total_iva: PygAmount;
  total: PygAmount;
  /** SPEC_TOTALES_FE_EN_CARGA_v0.1: solo en facturas de carga, con los montos de FE. No entra en el calculo propio. */
  descuento?: PygAmount;
  /** SPEC_TOTALES_FE_EN_CARGA_v0.1, RN-08: anticipo aplicado; FE no admite la nota de credito total por referencia. */
  anticipo?: PygAmount;
  /** SPEC_TOTALES_FE_EN_CARGA_v0.1, RN-07: con descuento, anticipo o IVA exonerado, la nota de credito va por referencia en FE. */
  nota_credito_por_referencia?: boolean;
  /**
   * SPEC_MONEDA_EXTRANJERA_v0.1, A-2 / RN-07: origen de los totales. "FE": los de `GET /documentos/{uuid}/totales`
   * del documento aprobado (oficiales). Ausente o "FS": el calculo de la vista previa.
   */
  fuente?: "FS" | "FE";
  /** dTotalGs (F023) de FE: total en guaranies; en PYG, el total. Solo con `fuente: "FE"`. */
  total_guaranies?: number;
  /** dRedon (F013) de FE. Solo con `fuente: "FE"`. */
  redondeo?: number;
}

export interface TaxCalculationResult {
  items: TaxCalculatedLine[];
  totals: TaxTotals;
}

export function assertPositiveInteger(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${fieldName} debe ser un entero positivo.`);
  }
}

export function assertNonNegativeInteger(value: number, fieldName: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${fieldName} debe ser un entero no negativo.`);
  }
}

/** MT150 E711: cantidad mayor que cero con hasta 4 decimales (SPEC_MONEDA_EXTRANJERA_v0.1, RN-06). */
export const DECIMALES_CANTIDAD = 4;
const ESCALA_CANTIDAD = 10 ** DECIMALES_CANTIDAD;

/** Cantidad escalada a entero (x 10.000), o null si no es positiva o tiene mas de 4 decimales. */
export function cantidadEscalada(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const escalada = Math.round(value * ESCALA_CANTIDAD);
  if (Math.abs(value * ESCALA_CANTIDAD - escalada) > 1e-6 || !Number.isSafeInteger(escalada) || escalada <= 0) return null;
  return escalada;
}

export function assertCantidad(value: number, fieldName: string): number {
  const escalada = cantidadEscalada(value);
  if (escalada === null) {
    throw new Error(`${fieldName} debe ser mayor que cero con hasta ${DECIMALES_CANTIDAD} decimales.`);
  }
  return escalada;
}

export function roundHalfUp(numerator: number, denominator = 1): number {
  assertNonNegativeInteger(numerator, "numerator");
  assertPositiveInteger(denominator, "denominator");

  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

export function calculateTaxLine(line: TaxInputLine, lineNo: number): TaxCalculatedLine {
  assertPositiveInteger(lineNo, "line_no");
  const cantidad = assertCantidad(line.cantidad, "cantidad");
  assertNonNegativeInteger(line.precio_unitario, "precio_unitario");

  // Con cantidad decimal el subtotal se redondea al entero (guaranies o centavos), como arma FE el total.
  // Cuenta exacta en BigInt: cantidad x 10.000 x precio, redondeo a la mitad hacia arriba.
  const producto = BigInt(cantidad) * BigInt(line.precio_unitario);
  const escala = BigInt(ESCALA_CANTIDAD);
  const subtotal = Number((2n * producto + escala) / (2n * escala));
  assertNonNegativeInteger(subtotal, "subtotal");

  if (line.iva_tipo === "EXENTA") {
    return {
      ...line,
      line_no: lineNo,
      codigo: normalizeOptionalCode(line.codigo),
      subtotal,
      base_imponible: subtotal,
      iva_monto: 0
    };
  }

  const base_imponible = line.iva_tipo === "IVA_10" ? roundHalfUp(subtotal * 10, 11) : roundHalfUp(subtotal * 20, 21);

  return {
    ...line,
    line_no: lineNo,
    codigo: normalizeOptionalCode(line.codigo),
    subtotal,
    base_imponible,
    iva_monto: subtotal - base_imponible
  };
}

export function calculateDocumentTotals(lines: TaxInputLine[]): TaxCalculationResult {
  if (lines.length === 0) {
    throw new Error("Debe existir al menos una linea.");
  }

  const items = lines.map((line, index) => calculateTaxLine(line, index + 1));
  const totals = items.reduce<TaxTotals>(
    (acc, line) => {
      acc.subtotal += line.subtotal;
      acc.total_sin_iva += line.base_imponible;
      acc.total += line.subtotal;

      if (line.iva_tipo === "IVA_5") {
        acc.iva_5 += line.iva_monto;
      }

      if (line.iva_tipo === "IVA_10") {
        acc.iva_10 += line.iva_monto;
      }

      acc.total_iva = acc.iva_5 + acc.iva_10;
      return acc;
    },
    {
      subtotal: 0,
      total_sin_iva: 0,
      iva_5: 0,
      iva_10: 0,
      total_iva: 0,
      total: 0
    }
  );

  return { items, totals };
}

function normalizeOptionalCode(code: string | null | undefined): string | null {
  const normalized = code?.trim();
  return normalized ? normalized : null;
}
