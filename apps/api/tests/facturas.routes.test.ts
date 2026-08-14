import { describe, expect, it } from "vitest";
import { facturaPreviewSchema } from "../src/modules/facturas/facturas.routes";

const basePayload = {
  condicion_venta: "CONTADO",
  tipo_transaccion: 1,
  cliente: {
    documento_tipo: "RUC",
    documento: "80163532-2",
    razon_social: "Cliente Demo"
  },
  items: [
    {
      descripcion: "Servicio",
      cantidad: 1,
      precio_unitario: 10000,
      iva_tipo: "IVA_10"
    }
  ]
};

describe("facturaPreviewSchema", () => {
  it("keeps cliente.naturaleza instead of silently stripping it (regression: Zod drops undeclared object keys)", () => {
    const parsed = facturaPreviewSchema.parse({
      ...basePayload,
      cliente: { ...basePayload.cliente, naturaleza: "JURIDICA" }
    });

    expect(parsed.cliente.naturaleza).toBe("JURIDICA");
  });

  it("keeps cliente.naturaleza undefined when omitted", () => {
    const parsed = facturaPreviewSchema.parse(basePayload);

    expect(parsed.cliente.naturaleza).toBeUndefined();
  });

  it("rejects an invalid naturaleza value", () => {
    expect(() =>
      facturaPreviewSchema.parse({
        ...basePayload,
        cliente: { ...basePayload.cliente, naturaleza: "OTRO" }
      })
    ).toThrow();
  });

  it("keeps tipo_transaccion and defaults it to 2 when omitted", () => {
    const { tipo_transaccion, ...withoutTipoTransaccion } = basePayload;
    const parsed = facturaPreviewSchema.parse(withoutTipoTransaccion);

    expect(parsed.tipo_transaccion).toBe(2);
  });
});
