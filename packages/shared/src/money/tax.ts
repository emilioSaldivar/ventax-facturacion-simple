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

export function roundHalfUp(numerator: number, denominator = 1): number {
  assertNonNegativeInteger(numerator, "numerator");
  assertPositiveInteger(denominator, "denominator");

  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

export function calculateTaxLine(line: TaxInputLine, lineNo: number): TaxCalculatedLine {
  assertPositiveInteger(lineNo, "line_no");
  assertPositiveInteger(line.cantidad, "cantidad");
  assertNonNegativeInteger(line.precio_unitario, "precio_unitario");

  const subtotal = line.cantidad * line.precio_unitario;
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
