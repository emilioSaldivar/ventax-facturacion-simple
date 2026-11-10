import { describe, expect, it } from "vitest";
import { facturaPreviewSchema } from "../src/modules/facturas/facturas.routes";

const base = {
  condicion_venta: "CONTADO",
  cliente: { documento_tipo: "RUC", documento: "80136968-1", razon_social: "Cliente Demo" },
  items: [{ descripcion: "Consultoria", cantidad: 1, precio_unitario: 150.25, iva_tipo: "IVA_10" }]
};

describe("validacion de moneda (SPEC_MONEDA_EXTRANJERA_v0.1, RN-02)", () => {
  it("USD con tipo de cambio y 2 decimales es valida", () => {
    expect(facturaPreviewSchema.safeParse({ ...base, moneda: "USD", tipo_cambio: 7350.5 }).success).toBe(true);
  });

  it("CA-04: USD sin tipo de cambio no es valida", () => {
    const r = facturaPreviewSchema.safeParse({ ...base, moneda: "USD" });
    expect(r.success).toBe(false);
  });

  it("PYG no admite decimales y sigue siendo el valor por omision", () => {
    expect(facturaPreviewSchema.safeParse(base).success).toBe(false);
    const ok = facturaPreviewSchema.safeParse({ ...base, items: [{ ...base.items[0], precio_unitario: 150000 }] });
    expect(ok.success && ok.data.moneda).toBe("PYG");
  });

  it("mas de 2 decimales o tipo de cambio con mas de 4 no son validos; moneda fuera de la lista tampoco", () => {
    expect(facturaPreviewSchema.safeParse({ ...base, moneda: "USD", tipo_cambio: 7350.5, items: [{ ...base.items[0], precio_unitario: 1.005 }] }).success).toBe(false);
    expect(facturaPreviewSchema.safeParse({ ...base, moneda: "USD", tipo_cambio: 7350.12345 }).success).toBe(false);
    expect(facturaPreviewSchema.safeParse({ ...base, moneda: "JPY", tipo_cambio: 50 }).success).toBe(false);
  });

  it("RN-06: cantidad con hasta 4 decimales en cualquier moneda; 5 decimales, cero o negativa no", () => {
    const conCantidad = (cantidad: number) => ({ ...base, moneda: "USD", tipo_cambio: 7350.5, items: [{ ...base.items[0], cantidad }] });
    expect(facturaPreviewSchema.safeParse(conCantidad(1.5)).success).toBe(true);
    expect(facturaPreviewSchema.safeParse(conCantidad(0.0001)).success).toBe(true);
    expect(facturaPreviewSchema.safeParse(conCantidad(1.00005)).success).toBe(false);
    expect(facturaPreviewSchema.safeParse(conCantidad(0)).success).toBe(false);
    expect(facturaPreviewSchema.safeParse(conCantidad(-1)).success).toBe(false);
    const pyg = facturaPreviewSchema.safeParse({ ...base, items: [{ ...base.items[0], cantidad: 2.5, precio_unitario: 150000 }] });
    expect(pyg.success).toBe(true);
  });
});
