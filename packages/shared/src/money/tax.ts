import type { TipoIva } from "../constants/documentos";

export type PygAmount = number;

export interface TaxInputLine {
  codigo?: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: PygAmount;
  iva_tipo: TipoIva;
  /** SPEC_DESCUENTOS_FACTURA_v0.1 RN-01: descuento por unidad (FE `items[].descuento`). */
  descuento?: PygAmount;
}

export interface TaxCalculatedLine extends TaxInputLine {
  line_no: number;
  codigo: string | null;
  /** Importe neto de la linea: bruto menos el descuento por unidad y el prorrateo del global (RN-06). */
  subtotal: PygAmount;
  base_imponible: PygAmount;
  iva_monto: PygAmount;
  /** RN-06: parte del descuento global que le toca a la linea (solo con descuentos). */
  descuento_global?: PygAmount;
}

export interface TaxTotals {
  subtotal: PygAmount;
  total_sin_iva: PygAmount;
  iva_5: PygAmount;
  iva_10: PygAmount;
  total_iva: PygAmount;
  total: PygAmount;
  /**
   * Total de descuentos (por linea mas global). SPEC_DESCUENTOS_FACTURA_v0.1 RN-05 en la factura manual;
   * SPEC_TOTALES_FE_EN_CARGA_v0.1 en las de carga (montos de FE).
   */
  descuento?: PygAmount;
  /** SPEC_DESCUENTOS_FACTURA_v0.1 RN-05: descuento sobre el total cargado por el operador. */
  descuento_global?: PygAmount;
  /** SPEC_TOTALES_FE_EN_CARGA_v0.1, RN-08: anticipo aplicado; FE no admite la nota de credito total por referencia. */
  anticipo?: PygAmount;
  /** SPEC_TOTALES_FE_EN_CARGA_v0.1, RN-07: con descuento, anticipo o IVA exonerado, la nota de credito va por referencia en FE. */
  nota_credito_por_referencia?: boolean;
  /**
   * SPEC_MONEDA_EXTRANJERA_v0.1, A-2 / RN-07: origen de los totales. "FE": los de `GET /documentos/{uuid}/totales`
   * del documento aprobado (oficiales). Ausente o "FS": el calculo de la vista previa.
   */
  fuente?: "FS" | "FE" | "SIFEN" | "MANUAL";
  /**
   * SPEC_NOTA_CREDITO_FACTURA_EXTERNA_v0.1 (PLAN 3, D-5): base gravada por tasa, exenta y exonerada de una factura
   * externa (del `gTotSub` del rDE, o calculadas en la carga a mano). Con ellas se reparte la nota por monto sin
   * pedir `/totales` a FE, que no tiene la factura.
   */
  gravada_10?: PygAmount;
  gravada_5?: PygAmount;
  exenta?: PygAmount;
  exonerada?: PygAmount;
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

/** Error de validacion de un descuento, con la ruta del campo (SPEC_DESCUENTOS_FACTURA_v0.1 RN-03 y RN-04). */
export class DescuentoInvalidoError extends Error {
  constructor(
    message: string,
    public readonly path: (string | number)[]
  ) {
    super(message);
    this.name = "DescuentoInvalidoError";
  }
}

const bruto = (cantidad: number, precio: number): bigint => {
  // cantidad x 10.000 x precio, redondeado a la unidad (como calculateTaxLine)
  const producto = BigInt(cantidad) * BigInt(precio);
  const escala = BigInt(ESCALA_CANTIDAD);
  return (2n * producto + escala) / (2n * escala);
};

function lineaConNeto(line: TaxInputLine, lineNo: number, neto: number, descuentoGlobal: number): TaxCalculatedLine {
  const base_imponible =
    line.iva_tipo === "EXENTA" ? neto : line.iva_tipo === "IVA_10" ? roundHalfUp(neto * 10, 11) : roundHalfUp(neto * 20, 21);
  return {
    ...line,
    descuento: line.descuento ?? 0,
    line_no: lineNo,
    codigo: normalizeOptionalCode(line.codigo),
    subtotal: neto,
    base_imponible,
    iva_monto: neto - base_imponible,
    descuento_global: descuentoGlobal
  };
}

/**
 * SPEC_DESCUENTOS_FACTURA_v0.1 RN-03 a RN-06, en unidades enteras (guaranies o centavos), como FE/xmlgen:
 * - por linea, `descuento < precio_unitario`;
 * - el global se reparte por peso sobre el bruto (`bruto_i / Σ bruto`), igual que xmlgen; los restos se asignan por
 *   mayor fraccion para que Σ subtotal sea exactamente `Σ cantidad × (precio − descuento) − descuentoGlobal`;
 * - si el neto de alguna linea queda en cero o menos, error en `descuento_global` nombrando la linea.
 * Base e IVA por linea sobre el neto, con la misma regla entera de siempre. Los totales oficiales son los de FE.
 */
function calculateConDescuentos(lines: TaxInputLine[], descuentoGlobal: number): TaxCalculationResult {
  assertNonNegativeInteger(descuentoGlobal, "descuento_global");
  const brutos = lines.map((line, i) => {
    const cantidad = assertCantidad(line.cantidad, "cantidad");
    assertNonNegativeInteger(line.precio_unitario, "precio_unitario");
    const descuento = line.descuento ?? 0;
    assertNonNegativeInteger(descuento, "descuento");
    if (descuento > 0 && descuento >= line.precio_unitario) {
      throw new DescuentoInvalidoError("El descuento tiene que ser menor que el precio", ["items", i, "descuento"]);
    }
    return { bruto: bruto(cantidad, line.precio_unitario), descLinea: bruto(cantidad, descuento) };
  });
  const sumaBruto = brutos.reduce((a, b) => a + b.bruto, 0n);
  const G = BigInt(descuentoGlobal);

  // Reparto proporcional del global con restos por mayor fraccion (exacto en enteros).
  const partes = brutos.map((b) => (sumaBruto > 0n ? (G * b.bruto) / sumaBruto : 0n));
  const restos = brutos.map((b, i) => ({ i, resto: sumaBruto > 0n ? (G * b.bruto) % sumaBruto : 0n }));
  let faltante = G - partes.reduce((a, b) => a + b, 0n);
  restos.sort((a, b) => (b.resto > a.resto ? 1 : b.resto < a.resto ? -1 : a.i - b.i));
  for (const r of restos) {
    if (faltante <= 0n) break;
    partes[r.i]! += 1n;
    faltante -= 1n;
  }

  const items = lines.map((line, i) => {
    const b = brutos[i]!;
    // RN-04 con la cuenta exacta de FE: (bruto − descLinea) × Σbruto − G × bruto > 0.
    if (G > 0n && (b.bruto - b.descLinea) * sumaBruto - G * b.bruto <= 0n) {
      throw new DescuentoInvalidoError(`El descuento sobre el total deja la línea ${i + 1} sin precio`, ["descuento_global"]);
    }
    const neto = Number(b.bruto - b.descLinea - partes[i]!);
    return lineaConNeto(line, i + 1, neto, Number(partes[i]!));
  });

  const totals = sumarTotales(items);
  totals.subtotal = Number(sumaBruto);
  totals.descuento = Number(brutos.reduce((a, b) => a + b.descLinea, 0n) + G);
  if (descuentoGlobal > 0) totals.descuento_global = descuentoGlobal;
  return { items, totals };
}

function sumarTotales(items: TaxCalculatedLine[]): TaxTotals {
  return items.reduce<TaxTotals>(
    (acc, line) => {
      acc.subtotal += line.subtotal;
      acc.total_sin_iva += line.base_imponible;
      acc.total += line.subtotal;
      if (line.iva_tipo === "IVA_5") acc.iva_5 += line.iva_monto;
      if (line.iva_tipo === "IVA_10") acc.iva_10 += line.iva_monto;
      acc.total_iva = acc.iva_5 + acc.iva_10;
      return acc;
    },
    { subtotal: 0, total_sin_iva: 0, iva_5: 0, iva_10: 0, total_iva: 0, total: 0 }
  );
}

export function calculateDocumentTotals(lines: TaxInputLine[], descuentoGlobal = 0): TaxCalculationResult {
  if (lines.length === 0) {
    throw new Error("Debe existir al menos una linea.");
  }

  // SPEC_DESCUENTOS_FACTURA_v0.1: sin descuentos el calculo y la forma del resultado son los de siempre (CA-04).
  if (descuentoGlobal > 0 || lines.some((line) => (line.descuento ?? 0) > 0)) {
    return calculateConDescuentos(lines, descuentoGlobal);
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
