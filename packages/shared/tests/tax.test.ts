import { describe, expect, it } from "vitest";
import { DescuentoInvalidoError, calculateDocumentTotals, calculateTaxLine, cantidadEscalada, roundHalfUp } from "../src/money/tax";
import { calculateDocumentTotalsMoneda } from "../src/money/moneda";

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

  describe("cantidad con hasta 4 decimales (SPEC_MONEDA_EXTRANJERA_v0.1, RN-06)", () => {
    it("redondea el subtotal al guarani con cantidad decimal", () => {
      const linea = calculateTaxLine({ descripcion: "Media", cantidad: 0.5, precio_unitario: 100001, iva_tipo: "IVA_10" }, 1);
      expect(linea.subtotal).toBe(50001);
      expect(linea.base_imponible + linea.iva_monto).toBe(50001);
      expect(linea.cantidad).toBe(0.5);
    });

    it("acepta 4 decimales y rechaza 5", () => {
      expect(calculateTaxLine({ descripcion: "A", cantidad: 1.2345, precio_unitario: 10000, iva_tipo: "EXENTA" }, 1).subtotal).toBe(12345);
      expect(() => calculateTaxLine({ descripcion: "A", cantidad: 1.00005, precio_unitario: 100, iva_tipo: "IVA_10" }, 1)).toThrow("cantidad");
      expect(() => calculateTaxLine({ descripcion: "A", cantidad: -1, precio_unitario: 100, iva_tipo: "IVA_10" }, 1)).toThrow("cantidad");
    });

    it("con cantidad entera el resultado no cambia", () => {
      const linea = calculateTaxLine({ descripcion: "A", cantidad: 3, precio_unitario: 110000, iva_tipo: "IVA_10" }, 1);
      expect(linea).toMatchObject({ subtotal: 330000, base_imponible: 300000, iva_monto: 30000 });
    });

    it("cantidadEscalada", () => {
      expect(cantidadEscalada(1.5)).toBe(15000);
      expect(cantidadEscalada(0.0001)).toBe(1);
      expect(cantidadEscalada(0)).toBeNull();
      expect(cantidadEscalada(0.00001)).toBeNull();
      expect(cantidadEscalada(Number.NaN)).toBeNull();
    });
  });
});

describe("SPEC_DESCUENTOS_FACTURA_v0.1", () => {
  it("CA-01: ejemplo de FE en guaranies", () => {
    const r = calculateDocumentTotalsMoneda(
      [
        { descripcion: "Zapatillas", cantidad: 2, precio_unitario: 100000, iva_tipo: "IVA_10", descuento: 10000 },
        { descripcion: "Medias", cantidad: 1, precio_unitario: 50000, iva_tipo: "IVA_10" }
      ],
      "PYG",
      30000
    );
    expect(r.totals).toMatchObject({ subtotal: 250000, descuento: 50000, descuento_global: 30000, total: 200000 });
    expect(r.totals.total_sin_iva + r.totals.total_iva).toBe(200000);
    expect(r.items.reduce((a, i) => a + i.subtotal, 0)).toBe(200000);
    expect(r.items.reduce((a, i) => a + (i.descuento_global ?? 0), 0)).toBe(30000);
  });

  it("vector PYG de FE (global que no divide exacto): total 83.897 y descuento 6.663", () => {
    const r = calculateDocumentTotalsMoneda(
      [
        { descripcion: "A", cantidad: 3, precio_unitario: 19990, iva_tipo: "IVA_10", descuento: 1110 },
        { descripcion: "B", cantidad: 7, precio_unitario: 4370, iva_tipo: "IVA_5" }
      ],
      "PYG",
      3333
    );
    expect(r.totals.total).toBe(83897);
    expect(r.totals.descuento).toBe(6663);
    // FE: dTotOpeItem 54.432,84 y 29.464,16 -> por linea en enteros 54.433 y 29.464.
    expect(r.items.map((i) => i.subtotal)).toEqual([54433, 29464]);
  });

  it("CA-02 y vector USD de FE: total 81,68, descuento 8,88", () => {
    const fe = calculateDocumentTotalsMoneda(
      [
        { descripcion: "A", cantidad: 3, precio_unitario: 19.99, iva_tipo: "IVA_10", descuento: 1.11 },
        { descripcion: "B", cantidad: 7, precio_unitario: 4.37, iva_tipo: "IVA_5" }
      ],
      "USD",
      5.55
    );
    expect(fe.totals).toMatchObject({ total: 81.68, descuento: 8.88, descuento_global: 5.55 });
    expect(fe.totals.iva_10).toBeCloseTo(4.81, 2);
    expect(fe.totals.iva_5).toBeCloseTo(1.37, 2);
    const ca02 = calculateDocumentTotalsMoneda(
      [
        { descripcion: "A", cantidad: 3, precio_unitario: 10.5, iva_tipo: "IVA_10", descuento: 0.5 },
        { descripcion: "B", cantidad: 1, precio_unitario: 20, iva_tipo: "IVA_10" }
      ],
      "USD",
      5
    );
    expect(ca02.totals).toMatchObject({ subtotal: 51.5, descuento: 6.5, total: 45 });
  });

  it("CA-03: descuento igual al precio y global que deja una linea sin precio", () => {
    expect(() =>
      calculateDocumentTotals([{ descripcion: "A", cantidad: 1, precio_unitario: 100000, iva_tipo: "IVA_10", descuento: 100000 }])
    ).toThrowError(new DescuentoInvalidoError("El descuento tiene que ser menor que el precio", ["items", 0, "descuento"]));
    try {
      calculateDocumentTotals(
        [
          { descripcion: "A", cantidad: 2, precio_unitario: 100000, iva_tipo: "IVA_10", descuento: 10000 },
          { descripcion: "B", cantidad: 1, precio_unitario: 50000, iva_tipo: "IVA_10" }
        ],
        250000
      );
      throw new Error("no fallo");
    } catch (e) {
      expect(e).toBeInstanceOf(DescuentoInvalidoError);
      expect((e as DescuentoInvalidoError).path).toEqual(["descuento_global"]);
      expect((e as Error).message).toMatch(/deja la línea \d sin precio/);
    }
  });

  it("CA-04: sin descuentos el resultado es identico al de siempre", () => {
    const lineas = [
      { descripcion: "A", cantidad: 2, precio_unitario: 110000, iva_tipo: "IVA_10" as const },
      { descripcion: "B", cantidad: 1.5, precio_unitario: 21000, iva_tipo: "IVA_5" as const }
    ];
    expect(calculateDocumentTotals(lineas, 0)).toEqual(calculateDocumentTotals(lineas));
    expect(calculateDocumentTotals(lineas).totals).not.toHaveProperty("descuento");
  });
});
