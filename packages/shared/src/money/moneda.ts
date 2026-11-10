import { calculateDocumentTotals, type TaxCalculationResult, type TaxInputLine } from "./tax";

/**
 * SPEC_MONEDA_EXTRANJERA_v0.1 (PLAN 1). Monedas que ofrece el editor de factura. Con otra moneda que PYG los
 * montos llevan hasta 2 decimales (guia de FE 50.1); en PYG siguen siendo enteros.
 */
export const monedasFactura = ["PYG", "USD", "EUR", "BRL"] as const;
export type MonedaFactura = (typeof monedasFactura)[number];

export function decimalesDeMoneda(moneda: string): 0 | 2 {
  return moneda === "PYG" ? 0 : 2;
}

/** true si el monto tiene a lo sumo los decimales de la moneda. */
export function tieneDecimalesValidos(valor: number, moneda: string): boolean {
  const escala = 10 ** decimalesDeMoneda(moneda);
  return Number.isFinite(valor) && Math.abs(valor * escala - Math.round(valor * escala)) < 1e-6;
}

/**
 * Calculo de presentacion en la moneda de la factura (SPEC RN-03): en otra moneda se calcula en centavos con la
 * misma regla entera de guaranies y se devuelve en unidades con 2 decimales. El KUDE de FE es el oficial.
 */
export function calculateDocumentTotalsMoneda(lines: TaxInputLine[], moneda: string = "PYG"): TaxCalculationResult {
  if (decimalesDeMoneda(moneda) === 0) return calculateDocumentTotals(lines);
  for (const line of lines) {
    if (!tieneDecimalesValidos(line.precio_unitario, moneda)) {
      throw new Error("precio_unitario admite hasta 2 decimales.");
    }
  }
  const enCentavos = calculateDocumentTotals(lines.map((line) => ({ ...line, precio_unitario: Math.round(line.precio_unitario * 100) })));
  const unidades = (centavos: number) => Math.round(centavos) / 100;
  return {
    items: enCentavos.items.map((item) => ({
      ...item,
      precio_unitario: unidades(item.precio_unitario),
      subtotal: unidades(item.subtotal),
      base_imponible: unidades(item.base_imponible),
      iva_monto: unidades(item.iva_monto)
    })),
    totals: {
      subtotal: unidades(enCentavos.totals.subtotal),
      total_sin_iva: unidades(enCentavos.totals.total_sin_iva),
      iva_5: unidades(enCentavos.totals.iva_5),
      iva_10: unidades(enCentavos.totals.iva_10),
      total_iva: unidades(enCentavos.totals.total_iva),
      total: unidades(enCentavos.totals.total)
    }
  };
}
