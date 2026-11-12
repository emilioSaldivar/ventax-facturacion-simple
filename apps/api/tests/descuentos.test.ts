import { afterEach, describe, expect, it, vi } from "vitest";
import { previewFactura, totalesDesdeFe } from "../src/modules/facturas/facturas.service";
import { facturaPreviewSchema } from "../src/modules/facturas/facturas.routes";
import { RealFiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.client";
import type { OperationalContextResponse } from "../src/modules/context/context.types";
import type { FacturaPreviewInput } from "../src/modules/facturas/facturas.types";

// SPEC_DESCUENTOS_FACTURA_v0.1 (TASKS DES-003 a DES-005).
const context = {
  user: { id: "11111111-1111-4111-8111-111111111111", username: "op", display_name: "Op", role: "OPERADOR_FACTURACION" },
  tenant: { id: "22222222-2222-4222-8222-222222222222", name: "T", status: "ACTIVE" },
  facturador: { id: "33333333-3333-4333-8333-333333333333", emisor_id: "80136968-1", razon_social: "SEGEL SA", ruc: "80136968-1" },
  fiscal_context: {
    establecimiento: "001",
    punto_expedicion: "001",
    perfil_emision_codigo: "SERV",
    actividad_economica_codigo: "82110",
    actividad_economica_descripcion: "Servicios",
    timbrado: "80136968",
    timbrado_inicio: "2025-12-30",
    documento_nro: "0000000",
    credito_plazo_dias: 30,
    tipo_transaccion_default: 2
  },
  actividad_punto_perfil_id: "55555555-5555-4555-8555-555555555555"
} as unknown as OperationalContextResponse;

const cliente = { documento_tipo: "RUC" as const, documento: "80012345-0", razon_social: "Cliente SA" };
const ca01 = (): FacturaPreviewInput => ({
  condicion_venta: "CONTADO",
  cliente,
  items: [
    { descripcion: "Zapatillas", cantidad: 2, precio_unitario: 100000, iva_tipo: "IVA_10", descuento: 10000 },
    { descripcion: "Medias", cantidad: 1, precio_unitario: 50000, iva_tipo: "IVA_10" }
  ],
  descuento_global: 30000
});

describe("RN-04 a RN-06 y RN-09: vista previa", () => {
  it("CA-01: ejemplo de FE en guaranies", () => {
    const r = previewFactura(context, ca01());
    expect(r.totals).toMatchObject({ subtotal: 250000, descuento: 50000, descuento_global: 30000, total: 200000, nota_credito_por_referencia: true });
    expect(r.totals.total_sin_iva + r.totals.total_iva).toBe(200000);
    expect(r.items[0]).toMatchObject({ descuento: 10000, subtotal: expect.any(Number) });
  });

  it("CA-02: USD", () => {
    const r = previewFactura(context, {
      condicion_venta: "CONTADO",
      moneda: "USD",
      tipo_cambio: 7300,
      cliente,
      items: [
        { descripcion: "A", cantidad: 3, precio_unitario: 10.5, iva_tipo: "IVA_10", descuento: 0.5 },
        { descripcion: "B", cantidad: 1, precio_unitario: 20, iva_tipo: "IVA_10" }
      ],
      descuento_global: 5
    });
    expect(r.totals).toMatchObject({ subtotal: 51.5, descuento: 6.5, total: 45 });
  });

  it("CA-03 (c): global que deja una linea sin precio responde 400 en descuento_global", () => {
    expect(() => previewFactura(context, { ...ca01(), descuento_global: 250000 })).toThrowError(/deja la línea \d sin precio/);
    try {
      previewFactura(context, { ...ca01(), descuento_global: 250000 });
    } catch (e) {
      expect(e).toMatchObject({ statusCode: 400, details: { path: ["descuento_global"] } });
    }
  });

  it("CA-03 (d) y CA-04: sin descuentos, identico a hoy y sin nota por referencia", () => {
    const sin = previewFactura(context, { ...ca01(), items: ca01().items.map(({ descuento: _d, ...i }) => i), descuento_global: 0 });
    expect(sin.totals).toEqual({ subtotal: 250000, total_sin_iva: 227273, iva_5: 0, iva_10: 22727, total_iva: 22727, total: 250000 });
  });
});

describe("RN-02 y RN-03: el esquema de la API rechaza antes del calculo", () => {
  const parse = (input: unknown) => facturaPreviewSchema.safeParse(input);
  it("CA-03 (a): descuento igual al precio", () => {
    const r = parse({ ...ca01(), items: [{ descripcion: "A", cantidad: 1, precio_unitario: 100000, descuento: 100000 }] });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("El descuento tiene que ser menor que el precio");
  });
  it("CA-03 (b): decimales en guaranies", () => {
    const r = parse({ ...ca01(), items: [{ descripcion: "A", cantidad: 1, precio_unitario: 100000, descuento: 10.5 }] });
    expect(JSON.stringify(r.error?.issues)).toContain("En guaraníes, el descuento va sin decimales");
    const g = parse({ ...ca01(), descuento_global: 10.5 });
    expect(JSON.stringify(g.error?.issues)).toContain("En guaraníes, el descuento va sin decimales");
  });
  it("USD admite 2 decimales y no 3", () => {
    const base = { ...ca01(), moneda: "USD", tipo_cambio: 7300, items: [{ descripcion: "A", cantidad: 1, precio_unitario: 10.5, descuento: 0.5 }], descuento_global: 1.25 };
    expect(parse(base).success).toBe(true);
    expect(parse({ ...base, descuento_global: 1.255 }).success).toBe(false);
  });
});

describe("RN-07: pedido a FE", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("CA-01: descuento por item solo donde hay, descuentoGlobal y pagos por el total neto", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ cdc: "01" + "0".repeat(42), status: "QUEUED_BATCH", nro_factura: "0000001" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    // Valor sintetico, no es una clave real.
    const gw = new RealFiscalGateway({ mode: "real", baseUrl: "http://fe.test/v1", apiKey: "clave-sintetica", timeoutMs: 1000, environment: "test" } as never);
    const preview = previewFactura(context, ca01());
    await gw.emitFactura({
      external_ref: "fac_x",
      condicion_venta: "CONTADO",
      tipo_transaccion: 2,
      facturador: context.facturador,
      fiscal_context: context.fiscal_context,
      cliente,
      items: preview.items,
      totals: preview.totals
    } as never);
    const cuerpo = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(cuerpo.items[0].descuento).toBe(10000);
    expect(cuerpo.items[0].precioUnitario).toBe(100000);
    expect(cuerpo.items[1]).not.toHaveProperty("descuento");
    expect(cuerpo.descuentoGlobal).toBe(30000);
    expect(JSON.stringify(cuerpo.condicionOperacion)).toContain("200000");
  });

  it("sin descuentos, el pedido no lleva los campos", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "QUEUED_BATCH" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const gw = new RealFiscalGateway({ mode: "real", baseUrl: "http://fe.test/v1", apiKey: "clave-sintetica", timeoutMs: 1000, environment: "test" } as never);
    const preview = previewFactura(context, { ...ca01(), items: [{ descripcion: "A", cantidad: 1, precio_unitario: 1000, iva_tipo: "IVA_10" }], descuento_global: 0 });
    await gw.emitFactura({ external_ref: "fac_y", condicion_venta: "CONTADO", tipo_transaccion: 2, facturador: context.facturador, fiscal_context: context.fiscal_context, cliente, items: preview.items, totals: preview.totals } as never);
    const cuerpo = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(cuerpo).not.toHaveProperty("descuentoGlobal");
    expect(cuerpo.items[0]).not.toHaveProperty("descuento");
  });
});

describe("RN-08: totales oficiales de FE", () => {
  it("CA-06: conserva descuento_global y la nota por referencia", () => {
    const t = totalesDesdeFe(
      {
        moneda: "PYG",
        tipo_cambio: null,
        totales: { bruto: 250000, descuento: 50000, anticipo: 0, total: 200000, redondeo: 0, gravada_10: 181818, gravada_5: 0, exenta: 0, exonerada: 0, iva_10: 18182, iva_5: 0, iva_total: 18182 },
        total_guaranies: 200000
      } as never,
      { subtotal: 250000, total_sin_iva: 0, iva_5: 0, iva_10: 0, total_iva: 0, total: 200000, descuento: 50000, descuento_global: 30000, nota_credito_por_referencia: true }
    );
    expect(t).toMatchObject({ fuente: "FE", descuento: 50000, descuento_global: 30000, nota_credito_por_referencia: true, total: 200000 });
  });
});
