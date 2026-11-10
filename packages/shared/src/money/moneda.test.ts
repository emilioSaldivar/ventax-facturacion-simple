import { describe, expect, it } from "vitest";
import { calculateDocumentTotalsMoneda, tieneDecimalesValidos } from "./moneda";
import { calculateDocumentTotals } from "./tax";

describe("moneda (SPEC_MONEDA_EXTRANJERA_v0.1)", () => {
  const lineas = [
    { descripcion: "Consultoria", cantidad: 2, precio_unitario: 150.25, iva_tipo: "IVA_10" as const },
    { descripcion: "Libro", cantidad: 1, precio_unitario: 10.5, iva_tipo: "IVA_5" as const },
    { descripcion: "Exento", cantidad: 3, precio_unitario: 0.99, iva_tipo: "EXENTA" as const }
  ];

  it("en USD calcula con 2 decimales", () => {
    const { items, totals } = calculateDocumentTotalsMoneda(lineas, "USD");
    expect(items[0]).toMatchObject({ precio_unitario: 150.25, subtotal: 300.5, base_imponible: 273.18, iva_monto: 27.32 });
    expect(items[1]).toMatchObject({ subtotal: 10.5, base_imponible: 10, iva_monto: 0.5 });
    expect(items[2]).toMatchObject({ subtotal: 2.97, base_imponible: 2.97, iva_monto: 0 });
    expect(totals).toEqual({ subtotal: 313.97, total_sin_iva: 286.15, iva_5: 0.5, iva_10: 27.32, total_iva: 27.82, total: 313.97 });
  });

  it("en PYG es exactamente el calculo de siempre", () => {
    const enteras = [{ descripcion: "A", cantidad: 3, precio_unitario: 110000, iva_tipo: "IVA_10" as const }];
    expect(calculateDocumentTotalsMoneda(enteras, "PYG")).toEqual(calculateDocumentTotals(enteras));
  });

  it("rechaza mas de 2 decimales y valida decimales por moneda", () => {
    expect(() => calculateDocumentTotalsMoneda([{ descripcion: "A", cantidad: 1, precio_unitario: 1.005, iva_tipo: "IVA_10" }], "USD")).toThrow();
    expect(tieneDecimalesValidos(12.34, "USD")).toBe(true);
    expect(tieneDecimalesValidos(12.3, "PYG")).toBe(false);
    expect(tieneDecimalesValidos(1200, "PYG")).toBe(true);
  });

  it("cantidad decimal en USD: 1,5 x 150,25 = 225,38", () => {
    const { totals } = calculateDocumentTotalsMoneda([{ descripcion: "A", cantidad: 1.5, precio_unitario: 150.25, iva_tipo: "IVA_10" }], "USD");
    expect(totals).toMatchObject({ total: 225.38, iva_10: 20.49, total_sin_iva: 204.89 });
  });
});
