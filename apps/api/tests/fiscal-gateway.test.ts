import { describe, expect, it } from "vitest";
import { buildFiscalGatewayConfig } from "../src/modules/fiscal-gateway/fiscal-gateway.config";
import { MockFiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.client";
import type { FiscalEmitFacturaRequest } from "../src/modules/fiscal-gateway/fiscal-gateway.types";

const request: FiscalEmitFacturaRequest = {
  external_ref: "fac_11111111-1111-4111-8111-111111111111",
  condicion_venta: "CONTADO",
  facturador: {
    id: "33333333-3333-4333-8333-333333333333",
    emisor_id: "80136968-1",
    razon_social: "Facturador Demo",
    ruc: "80136968-1"
  },
  fiscal_context: {
    establecimiento: "001",
    punto_expedicion: "002",
    perfil_emision_codigo: "SERV",
    actividad_economica_codigo: "82110",
    actividad_economica_descripcion: "Servicios administrativos"
  },
  cliente: {
    documento_tipo: "RUC",
    documento: "1234567-8",
    razon_social: "Cliente",
    email: "cliente@example.com"
  },
  items: [
    {
      line_no: 1,
      catalogo_item_id: null,
      codigo: null,
      descripcion: "Servicio",
      cantidad: 1,
      precio_unitario: 11000,
      iva_tipo: "IVA_10",
      subtotal: 11000,
      base_imponible: 10000,
      iva_monto: 1000
    }
  ],
  totals: {
    subtotal: 11000,
    total_sin_iva: 10000,
    iva_5: 0,
    iva_10: 1000,
    total_iva: 1000,
    total: 11000
  }
};

describe("fiscal gateway", () => {
  it("builds config without requiring secrets in mock mode", () => {
    const config = buildFiscalGatewayConfig({
      FE_GATEWAY_MODE: "mock",
      FE_API_BASE_URL: "https://fe-api.ventax.app/fcws/",
      FE_API_KEY: undefined,
      FE_API_TIMEOUT_MS: 20000,
      FE_API_ENV: "test",
      FE_DEFAULT_TIMBRADO: "80136968",
      FE_DEFAULT_TIMBRADO_INICIO: "2025-12-30",
      FE_DEFAULT_ESTABLECIMIENTO: "001",
      FE_DEFAULT_PUNTO_EXPEDICION: "001",
      FE_DEFAULT_DOCUMENTO_NRO: "0000000",
      FE_DEFAULT_CREDITO_PLAZO_DIAS: 30
    });

    expect(config).toEqual({
      mode: "mock",
      baseUrl: "https://fe-api.ventax.app/fcws",
      apiKey: undefined,
      timeoutMs: 20000,
      environment: "test",
      defaultTimbrado: "80136968",
      defaultTimbradoInicio: "2025-12-30",
      defaultEstablecimiento: "001",
      defaultPuntoExpedicion: "001",
      defaultDocumentoNro: "0000000",
      defaultCreditoPlazoDias: 30
    });
  });

  it("returns deterministic mock emission data", async () => {
    const gateway = new MockFiscalGateway({
      mode: "mock",
      baseUrl: "https://fe-api.ventax.app/fcws",
      timeoutMs: 20000,
      environment: "test",
      defaultTimbrado: "80136968",
      defaultTimbradoInicio: "2025-12-30",
      defaultEstablecimiento: "001",
      defaultPuntoExpedicion: "001",
      defaultDocumentoNro: "0000000",
      defaultCreditoPlazoDias: 30
    });

    const first = await gateway.emitFactura(request);
    const second = await gateway.emitFactura(request);

    expect(first).toEqual(second);
    expect(first.estado).toBe("EMITIDA");
    expect(first.numero_fiscal).toMatch(/^001-002-[0-9]{7}$/);
    expect(first.cdc).toHaveLength(44);
    expect(first.email_status).toBe("DELEGATED");
  });
});
