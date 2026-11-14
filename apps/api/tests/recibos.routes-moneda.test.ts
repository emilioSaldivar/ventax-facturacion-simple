import { describe, it, expect } from "vitest";
import { reciboCreateBodySchema, updateBodySchema } from "../src/modules/recibos/recibos.routes.js";

// SPEC_RECIBO_DINERO_v0.6 RN-01, RN-02 y CA-03: la API de FS valida moneda e importe antes de llamar a FE.
const base = { fecha_cobro: "2026-11-13", pagador_nombre: "Juan Perez", concepto: "Cobro", importe: 1500 };

function errores(result: ReturnType<typeof reciboCreateBodySchema.safeParse>) {
  return result.success ? {} : result.error.flatten().fieldErrors;
}

describe("recibos: moneda e importe (RN-01, RN-02)", () => {
  it("sin moneda vale PYG con importe entero", () => {
    expect(reciboCreateBodySchema.safeParse(base).success).toBe(true);
  });

  it("admite USD, EUR y BRL con 2 decimales", () => {
    for (const moneda of ["USD", "EUR", "BRL"]) {
      expect(reciboCreateBodySchema.safeParse({ ...base, moneda, importe: 150.5 }).success).toBe(true);
    }
  });

  it("CA-03: PYG con decimales se rechaza en importe", () => {
    expect(errores(reciboCreateBodySchema.safeParse({ ...base, moneda: "PYG", importe: 1500.5 }))).toHaveProperty("importe");
  });

  it("USD con 3 decimales se rechaza en importe", () => {
    expect(errores(reciboCreateBodySchema.safeParse({ ...base, moneda: "USD", importe: 1.005 }))).toHaveProperty("importe");
  });

  it("CA-03: otra moneda se rechaza en moneda", () => {
    expect(errores(reciboCreateBodySchema.safeParse({ ...base, moneda: "GBP" }))).toHaveProperty("moneda");
  });

  it("la edicion acepta las cuatro monedas y rechaza otra", () => {
    expect(updateBodySchema.safeParse({ moneda: "EUR" }).success).toBe(true);
    expect(updateBodySchema.safeParse({ moneda: "ARS" }).success).toBe(false);
  });
});
