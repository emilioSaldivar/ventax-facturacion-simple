import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFiscalGatewayConfig } from "../src/modules/fiscal-gateway/fiscal-gateway.config";
import { MockFiscalGateway, RealFiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.client";
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("emits CONTADO payload to real fiscal backend and maps approved response", async () => {
    const calls: Array<{ url: string; init: RequestInit; payload: Record<string, unknown> }> = [];
    const gateway = new RealFiscalGateway({
      mode: "real",
      baseUrl: "https://fe-api.ventax.app/fcws",
      apiKey: "secret",
      timeoutMs: 20000,
      environment: "test",
      defaultTimbrado: "80136968",
      defaultTimbradoInicio: "2025-12-30",
      defaultEstablecimiento: "001",
      defaultPuntoExpedicion: "001",
      defaultDocumentoNro: "0000000",
      defaultCreditoPlazoDias: 30
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
        calls.push({ url, init, payload });

        return new Response(
          JSON.stringify({
            document_id: "doc-real-1",
            cdc: "C".repeat(44),
            nro_factura: "001-002-0000007",
            status: "APPROVED",
            email_status: "DELEGATED",
            number_source: "SERVICE"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
    );

    const result = await gateway.emitFactura(request);

    expect(result).toMatchObject({
      fiscal_document_id: "doc-real-1",
      cdc: "C".repeat(44),
      numero_fiscal: "001-002-0000007",
      estado: "EMITIDA",
      email_status: "DELEGATED"
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://fe-api.ventax.app/fcws/factura");
    expect(calls[0]?.init.headers).toMatchObject({
      accept: "application/json",
      "content-type": "application/json",
      "x-api-key": "secret"
    });
    expect(calls[0]?.payload).toMatchObject({
      emisor_id: request.facturador.emisor_id,
      actividadEconomicaCodigo: "82110",
      emission_profile_code: "SERV",
      timbrado: {
        timbrado: "80136968",
        establecimiento: "001",
        puntoExpedicion: "002",
        documentoNro: "0000000",
        fecIni: "2025-12-30"
      },
      numbering: {
        mode: "ONLINE",
        authority: "SERVICE",
        requested_document_number: "0000000"
      },
      client_reference: {
        source_system: "facturacion-simple-cliente",
        entity_type: "factura_operativa",
        entity_id: request.external_ref,
        request_id: request.external_ref,
        idempotency_key: request.external_ref,
        operational_series: "SERV"
      },
      receptor: {
        tipoDocumento: "RUC",
        docNro: "1234567-8",
        razonSocial: "Cliente"
      },
      condicionOperacion: {
        tipo: "CONTADO",
        pagos: [{ medio: "EFECTIVO", monto: 11000 }]
      },
      items: [
        {
          codigo: "L001",
          descripcion: "Servicio",
          cantidad: 1,
          precioUnitario: 11000,
          ivaTipo: "IVA10"
        }
      ],
      envio: {
        mode: "SYNC",
        sendNow: true
      }
    });
    expect(calls[0]?.payload).not.toHaveProperty("condicionOperacion.credito");
  });

  it("emits CREDITO payload without payments or collection schedule", async () => {
    const calls: Array<{ payload: Record<string, unknown> }> = [];
    const gateway = new RealFiscalGateway({
      mode: "real",
      baseUrl: "https://fe-api.ventax.app/fcws",
      apiKey: "secret",
      timeoutMs: 20000,
      environment: "test",
      defaultTimbrado: "80136968",
      defaultTimbradoInicio: "2025-12-30",
      defaultEstablecimiento: "001",
      defaultPuntoExpedicion: "001",
      defaultDocumentoNro: "0000000",
      defaultCreditoPlazoDias: 45
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push({ payload: JSON.parse(String(init.body)) as Record<string, unknown> });

        return new Response(
          JSON.stringify({
            document_id: "doc-credito-1",
            cdc: "E".repeat(44),
            nro_factura: "001-002-0000009",
            status: "APPROVED"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
    );

    const result = await gateway.emitFactura({
      ...request,
      condicion_venta: "CREDITO"
    });

    expect(result).toMatchObject({
      fiscal_document_id: "doc-credito-1",
      estado: "EMITIDA",
      numero_fiscal: "001-002-0000009"
    });
    expect(calls[0]?.payload).toMatchObject({
      condicionOperacion: {
        tipo: "CREDITO",
        credito: {
          modalidad: "PLAZO",
          plazoDias: 45
        }
      }
    });
    expect(calls[0]?.payload).not.toHaveProperty("condicionOperacion.pagos");
    expect(calls[0]?.payload).not.toHaveProperty("cobros");
    expect(calls[0]?.payload).not.toHaveProperty("cuotas");
  });

  it("derives fiscal number from resolved timbrado when nro_factura is omitted", async () => {
    const gateway = new RealFiscalGateway({
      mode: "real",
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

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            document_id: "doc-real-2",
            cdc: "D".repeat(44),
            timbrado: {
              establecimiento: "001",
              puntoExpedicion: "002",
              documentoNro: "0000008"
            },
            status: "APPROVED"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    const result = await gateway.emitFactura(request);

    expect(result.numero_fiscal).toBe("001-002-0000008");
    expect(result.estado).toBe("EMITIDA");
  });

  it("refreshes fiscal status from SIFEN endpoint and maps approved state", async () => {
    const calls: string[] = [];
    const gateway = new RealFiscalGateway({
      mode: "real",
      baseUrl: "https://fe-api.ventax.app/fcws",
      apiKey: "secret",
      timeoutMs: 20000,
      environment: "test",
      defaultTimbrado: "80136968",
      defaultTimbradoInicio: "2025-12-30",
      defaultEstablecimiento: "001",
      defaultPuntoExpedicion: "001",
      defaultDocumentoNro: "0000000",
      defaultCreditoPlazoDias: 30
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);

        return new Response(
          JSON.stringify({
            cdc: "F".repeat(44),
            status: {
              status: "APPROVED",
              sifen_status: { code: "0260" }
            },
            refreshed: true
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
    );

    const result = await gateway.refreshFacturaStatus({ cdc: "F".repeat(44) });

    expect(result.estado).toBe("EMITIDA");
    expect(result.raw).toMatchObject({
      cdc: "F".repeat(44),
      refreshed: true
    });
    expect(calls[0]).toBe(`https://fe-api.ventax.app/fcws/consultar/comprobanteSifen/${"F".repeat(44)}?env=test&refresh=true`);
  });
});
