import { describe, expect, it } from "vitest";
import { notaCreditoSchema } from "../src/modules/facturas/facturas.routes";

// FS-143 (SPEC_NOTA_CREDITO_UNIFICADA_v0.1 RN-01): validacion de entrada de POST /facturas/:id/nota-credito.
const total = { tipo: "MONTO" as const, valor: 0.23 };

describe("esquema de la nota de credito", () => {
  it("acepta solo ajuste sobre el total, sin lineas o con lineas vacias", () => {
    expect(notaCreditoSchema.safeParse({ motivo: "AJUSTE DE PRECIO", combinada: true, motivo_codigo: 8, acreditacion_total: total }).success).toBe(true);
    expect(notaCreditoSchema.safeParse({ motivo: "AJUSTE DE PRECIO", combinada: true, motivo_codigo: 8, lineas: [], acreditacion_total: total }).success).toBe(true);
  });

  it("rechaza el cuerpo viejo con lineas vacias: no debe convertirse en la nota total", () => {
    const r = notaCreditoSchema.safeParse({ motivo: "Devolucion", lineas: [] });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.path.join("."))).toContain("lineas");
  });

  it("rechaza la combinada sin devoluciones ni ajustes", () => {
    expect(notaCreditoSchema.safeParse({ motivo: "x", combinada: true, lineas: [] }).success).toBe(false);
    expect(notaCreditoSchema.safeParse({ motivo: "x", combinada: true }).success).toBe(false);
  });

  it("los cuerpos de siempre siguen validos", () => {
    expect(notaCreditoSchema.safeParse({ motivo: "Total" }).success).toBe(true);
    expect(notaCreditoSchema.safeParse({ motivo: "Parcial", lineas: [{ line_no: 1, cantidad: 1 }] }).success).toBe(true);
    expect(notaCreditoSchema.safeParse({ motivo: "Monto", monto: 1000, motivo_codigo: 3 }).success).toBe(true);
  });
});
