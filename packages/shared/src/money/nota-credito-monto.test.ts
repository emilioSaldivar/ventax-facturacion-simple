import { describe, expect, it } from "vitest";
import { montosPorTasa, repartirMontoPorTasa, saldoEmitible, validarMontoNotaCredito } from "./nota-credito-monto";

describe("nota de credito por monto (SPEC_NOTA_CREDITO_POR_MONTO_v0.1, guia de FE §67)", () => {
  // Ejemplo verificado por FE en SIFEN test (§67.5).
  const totalesEjemplo = { gravada_10: 150757, iva_10: 15076, gravada_5: 46308, iva_5: 2315, exenta: 27875, exonerada: 0 };

  it("montos por tasa con el IVA incluido", () => {
    expect(montosPorTasa(totalesEjemplo)).toEqual({ iva_10: 165833, iva_5: 48623, exenta: 27875 });
  });

  it("reparte 100.000 como el ejemplo de FE", () => {
    expect(repartirMontoPorTasa(100000, montosPorTasa(totalesEjemplo))).toEqual([
      { iva_tipo: "IVA_10", importe: 68432 },
      { iva_tipo: "IVA_5", importe: 20065 },
      { iva_tipo: "EXENTA", importe: 11503 }
    ]);
  });

  it("la suma es exactamente el monto (diferencia de redondeo en la ultima linea)", () => {
    for (const monto of [50, 10000, 132300, 242300, 99950]) {
      const partes = repartirMontoPorTasa(monto, montosPorTasa(totalesEjemplo));
      expect(partes.reduce((s, p) => s + p.importe, 0)).toBe(monto);
      expect(partes.every((p) => p.importe > 0)).toBe(true);
    }
  });

  it("una sola tasa: una sola linea con el monto", () => {
    expect(repartirMontoPorTasa(10000, { iva_10: 500000, iva_5: 0, exenta: 0 })).toEqual([{ iva_tipo: "IVA_10", importe: 10000 }]);
  });

  it("exonerado va con exento", () => {
    expect(montosPorTasa({ ...totalesEjemplo, exenta: 0, exonerada: 1000 }).exenta).toBe(1000);
  });

  it("en USD reparte en centavos y suma exacto", () => {
    const tasas = montosPorTasa({ gravada_10: 273.18, iva_10: 27.32, gravada_5: 10, iva_5: 0.5, exenta: 2.97, exonerada: 0 }, "USD");
    const partes = repartirMontoPorTasa(50.25, tasas, "USD");
    expect(partes.map((p) => p.iva_tipo)).toEqual(["IVA_10", "IVA_5", "EXENTA"]);
    expect(Math.round(partes.reduce((s, p) => s + p.importe, 0) * 100)).toBe(5025);
    expect(partes[0]!.importe).toBe(48.09);
  });

  it("sin montos en ninguna tasa no reparte", () => {
    expect(repartirMontoPorTasa(1000, { iva_10: 0, iva_5: 0, exenta: 0 })).toEqual([]);
  });

  it("valida multiplos de 50 en PYG y 2 decimales en USD", () => {
    expect(validarMontoNotaCredito(10000)).toBeNull();
    expect(validarMontoNotaCredito(10020)).toMatch(/múltiplo de 50/);
    expect(validarMontoNotaCredito(100.5)).toMatch(/decimales/);
    expect(validarMontoNotaCredito(0)).toMatch(/mayor que cero/);
    expect(validarMontoNotaCredito(50.25, "USD")).toBeNull();
    expect(validarMontoNotaCredito(50.255, "USD")).toMatch(/2 decimales/);
  });

  it("saldo emitible: residuo menor que 50 Gs o 1 centavo es cero; en PYG baja a multiplo de 50", () => {
    expect(saldoEmitible(30)).toBe(0);
    expect(saldoEmitible(132300)).toBe(132300);
    expect(saldoEmitible(132330)).toBe(132300);
    expect(saldoEmitible(0.004, "USD")).toBe(0);
    expect(saldoEmitible(150.25, "USD")).toBe(150.25);
  });
});
