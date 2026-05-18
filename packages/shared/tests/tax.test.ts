import { describe, expect, it } from "vitest";
import { calculateDocumentTotals, calculateTaxLine, roundHalfUp } from "../src/money/tax";

describe("tax calculation", () => {
  it("calculates IVA_10 by line from tax-included PYG prices", () => {
    const result = calculateTaxLine(
      {
        codigo: "SERV-001",
        descripcion: "Servicio",
        cantidad: 2,
        precio_unitario: 110000,
        iva_tipo: "IVA_10"
      },
      1
    );

    expect(result).toMatchObject({
      subtotal: 220000,
      base_imponible: 200000,
      iva_monto: 20000
    });
  });

  it("calculates IVA_5 by line from tax-included PYG prices", () => {
    const result = calculateTaxLine(
      {
        descripcion: "Producto 5",
        cantidad: 3,
        precio_unitario: 10500,
        iva_tipo: "IVA_5"
      },
      1
    );

    expect(result.subtotal).toBe(31500);
    expect(result.base_imponible).toBe(30000);
    expect(result.iva_monto).toBe(1500);
  });

  it("keeps exenta lines without IVA and includes them in total_sin_iva", () => {
    const result = calculateDocumentTotals([
      {
        descripcion: "Exento",
        cantidad: 1,
        precio_unitario: 50000,
        iva_tipo: "EXENTA"
      }
    ]);

    expect(result.items[0]).toMatchObject({
      subtotal: 50000,
      base_imponible: 50000,
      iva_monto: 0
    });
    expect(result.totals).toEqual({
      subtotal: 50000,
      total_sin_iva: 50000,
      iva_5: 0,
      iva_10: 0,
      total_iva: 0,
      total: 50000
    });
  });

  it("sums grouped IVA from already rounded lines", () => {
    const result = calculateDocumentTotals([
      {
        descripcion: "Linea 10 A",
        cantidad: 1,
        precio_unitario: 10,
        iva_tipo: "IVA_10"
      },
      {
        descripcion: "Linea 10 B",
        cantidad: 1,
        precio_unitario: 10,
        iva_tipo: "IVA_10"
      },
      {
        descripcion: "Linea 5",
        cantidad: 1,
        precio_unitario: 21,
        iva_tipo: "IVA_5"
      }
    ]);

    expect(result.items.map((line) => line.iva_monto)).toEqual([1, 1, 1]);
    expect(result.totals).toEqual({
      subtotal: 41,
      total_sin_iva: 38,
      iva_5: 1,
      iva_10: 2,
      total_iva: 3,
      total: 41
    });
  });

  it("uses half-up rounding for exact halves", () => {
    expect(roundHalfUp(1, 2)).toBe(1);
    expect(roundHalfUp(3, 2)).toBe(2);
  });

  it("rejects decimals and non-positive quantities", () => {
    expect(() =>
      calculateTaxLine(
        {
          descripcion: "Decimal",
          cantidad: 1,
          precio_unitario: 10.5,
          iva_tipo: "IVA_10"
        },
        1
      )
    ).toThrow("precio_unitario");

    expect(() =>
      calculateTaxLine(
        {
          descripcion: "Cantidad cero",
          cantidad: 0,
          precio_unitario: 10,
          iva_tipo: "IVA_10"
        },
        1
      )
    ).toThrow("cantidad");
  });
});
