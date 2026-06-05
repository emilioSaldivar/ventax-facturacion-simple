import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFiscalGatewayConfig } from "../src/modules/fiscal-gateway/fiscal-gateway.config";
import { MockFiscalGateway, RealFiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.client";
import type { FiscalEmitFacturaRequest } from "../src/modules/fiscal-gateway/fiscal-gateway.types";

const request: FiscalEmitFacturaRequest = {
  external_ref: "fac_11111111-1111-4111-8111-111111111111",
  condicion_venta: "CONTADO",
  tipo_transaccion: 2,
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
    actividad_economica_descripcion: "Servicios administrativos",
    timbrado: "80136968",
    timbrado_inicio: "2025-12-30",
    documento_nro: "0000000",
    credito_plazo_dias: 30,
    fiscal_envio_modo: "BATCH",
    batch_enabled: true
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
    });

    expect(config).toEqual({
      mode: "mock",
      baseUrl: "https://fe-api.ventax.app/fcws",
      apiKey: undefined,
      timeoutMs: 20000,
      environment: "test",
    });
  });

  it("returns deterministic mock emission data", async () => {
    const gateway = new MockFiscalGateway({
      mode: "mock",
      baseUrl: "https://fe-api.ventax.app/fcws",
      timeoutMs: 20000,
      environment: "test",
    });

    const first = await gateway.emitFactura(request);
    const second = await gateway.emitFactura(request);

    expect(first).toEqual(second);
    expect(first.estado).toBe("EMITIDA");
    expect(first.numero_fiscal).toMatch(/^001-002-[0-9]{7}$/);
    expect(first.cdc).toHaveLength(44);
    expect(first.email_status).toBe("DELEGATED");
  });

  it("returns deterministic mock cancellation data", async () => {
    const gateway = new MockFiscalGateway({
      mode: "mock",
      baseUrl: "https://fe-api.ventax.app/fcws",
      timeoutMs: 20000,
      environment: "test",
    });

    const first = await gateway.cancelFactura({
      emisor_id: request.facturador.emisor_id,
      cdc: "C".repeat(44),
      motivo: "Error en datos del receptor"
    });
    const second = await gateway.cancelFactura({
      emisor_id: request.facturador.emisor_id,
      cdc: "C".repeat(44),
      motivo: "Error en datos del receptor"
    });

    expect(first).toEqual(second);
    expect(first.estado).toBe("ANULADA");
    expect(first.event_id).toMatch(/^mock-cancel-/);
  });

  it("emits CONTADO payload to real fiscal backend and maps approved response", async () => {
    const calls: Array<{ url: string; init: RequestInit; payload: Record<string, unknown> }> = [];
    const gateway = new RealFiscalGateway({
      mode: "real",
      baseUrl: "https://fe-api.ventax.app/fcws",
      apiKey: "secret",
      timeoutMs: 20000,
      environment: "test",
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
            delivery_mode: "BATCH",
            batch: {
              batch_id: "batch-1",
              dProtConsLote: "123456",
              dCodRes: "0300",
              dMsgRes: "Lote recibido",
              status: "RECEIVED"
            },
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
      fiscal_envio_modo: "BATCH",
      delivery_mode: "BATCH",
      batch: {
        batch_id: "batch-1",
        dProtConsLote: "123456",
        dCodRes: "0300",
        dMsgRes: "Lote recibido",
        status: "RECEIVED"
      },
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
        docNro: "1234567",
        dv: "8",
        razonSocial: "Cliente",
        email: "cliente@example.com"
      },
      condicionOperacion: {
        tipo: "CONTADO",
        pagos: [{ medio: "EFECTIVO", monto: 11000 }]
      },
      tipoTransaccion: 2,
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
        mode: "BATCH"
      }
    });
    expect(calls[0]?.payload.envio).not.toHaveProperty("sendNow");
    expect(calls[0]?.payload).not.toHaveProperty("condicionOperacion.credito");
  });

  it("only sends sendNow for explicit SYNC emission mode", async () => {
    const calls: Array<{ payload: Record<string, unknown> }> = [];
    const gateway = new RealFiscalGateway({
      mode: "real",
      baseUrl: "https://fe-api.ventax.app/fcws",
      apiKey: "secret",
      timeoutMs: 20000,
      environment: "test",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push({ payload: JSON.parse(String(init.body)) as Record<string, unknown> });
        return new Response(
          JSON.stringify({
            document_id: "doc-sync",
            cdc: "Y".repeat(44),
            nro_factura: "001-002-0000009",
            status: "APPROVED",
            delivery_mode: "SYNC"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
    );

    await gateway.emitFactura({
      ...request,
      fiscal_context: {
        ...request.fiscal_context,
        fiscal_envio_modo: "SYNC"
      }
    });

    expect(calls[0]?.payload).toMatchObject({
      envio: {
        mode: "SYNC",
        sendNow: true
      }
    });
  });

  it("maps idempotent 409 emission response as the existing fiscal document", async () => {
    const gateway = new RealFiscalGateway({
      mode: "real",
      baseUrl: "https://fe-api.ventax.app/fcws",
      apiKey: "secret",
      timeoutMs: 20000,
      environment: "test",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            document_id: "doc-existing",
            cdc: "I".repeat(44),
            nro_factura: "001-001-0000001",
            status: "APPROVED",
            idempotent: true,
            email_status: "FAILED"
          }),
          { status: 409, headers: { "content-type": "application/json" } }
        )
      )
    );

    const result = await gateway.emitFactura(request);

    expect(result).toMatchObject({
      fiscal_document_id: "doc-existing",
      cdc: "I".repeat(44),
      numero_fiscal: "001-001-0000001",
      estado: "EMITIDA",
      email_status: "FAILED"
    });
  });

  it("keeps non-idempotent 409 emission responses as fiscal errors", async () => {
    const gateway = new RealFiscalGateway({
      mode: "real",
      baseUrl: "https://fe-api.ventax.app/fcws",
      apiKey: "secret",
      timeoutMs: 20000,
      environment: "test",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ code: "CONFLICT" }), { status: 409, headers: { "content-type": "application/json" } })
      )
    );

    await expect(gateway.emitFactura(request)).rejects.toMatchObject({
      code: "UPSTREAM_ERROR"
    });
  });

  it("maps batch queued emission as PENDIENTE_SIFEN with batch diagnostics", async () => {
    const gateway = new RealFiscalGateway({
      mode: "real",
      baseUrl: "https://fe-api.ventax.app/fcws",
      apiKey: "secret",
      timeoutMs: 20000,
      environment: "test",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
        expect(payload).toMatchObject({
          envio: {
            mode: "BATCH"
          }
        });
        expect(payload.envio).not.toHaveProperty("sendNow");

        return new Response(
          JSON.stringify({
            document_id: "doc-batch-1",
            cdc: "B".repeat(44),
            nro_factura: "001-002-0000008",
            status: "BATCH_QUEUED",
            delivery_mode: "BATCH",
            batch: {
              batch_id: "batch-queued-1",
              did: "42",
              dProtConsLote: "987654",
              dCodRes: "0300",
              dMsgRes: "Lote recibido",
              dTpoProces: "5",
              status: "RECEIVED"
            }
          }),
          { status: 202, headers: { "content-type": "application/json" } }
        );
      })
    );

    const result = await gateway.emitFactura(request);

    expect(result).toMatchObject({
      fiscal_document_id: "doc-batch-1",
      estado: "PENDIENTE_SIFEN",
      fiscal_envio_modo: "BATCH",
      delivery_mode: "BATCH",
      batch: {
        batch_id: "batch-queued-1",
        did: "42",
        dProtConsLote: "987654",
        dCodRes: "0300",
        dMsgRes: "Lote recibido",
        dTpoProces: "5",
        status: "RECEIVED"
      }
    });
  });

  it("maps AUTO_FALLBACK_BATCH delivery mode without ambiguities", async () => {
    const gateway = new RealFiscalGateway({
      mode: "real",
      baseUrl: "https://fe-api.ventax.app/fcws",
      apiKey: "secret",
      timeoutMs: 20000,
      environment: "test"
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            document_id: "doc-auto-fallback",
            cdc: "A".repeat(44),
            nro_factura: "001-001-0000999",
            status: "PENDING",
            delivery_mode: "AUTO_FALLBACK_BATCH"
          }),
          { status: 202, headers: { "content-type": "application/json" } }
        )
      )
    );

    const result = await gateway.emitFactura(request);
    expect(result.estado).toBe("PENDIENTE_SIFEN");
    expect(result.fiscal_envio_modo).toBe("BATCH");
    expect(result.delivery_mode).toBe("AUTO_FALLBACK_BATCH");
  });

  it("maps fiscal code 0422 (CDC encontrado) as approved emission", async () => {
    const gateway = new RealFiscalGateway({
      mode: "real",
      baseUrl: "https://fe-api.ventax.app/fcws",
      apiKey: "secret",
      timeoutMs: 20000,
      environment: "test"
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            document_id: "doc-cdc-found",
            cdc: "Z".repeat(44),
            nro_factura: "001-001-0000011",
            status: "PENDING",
            status_detail: {
              dCodRes: "0422",
              dMsgRes: "CDC encontrado"
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    const result = await gateway.emitFactura(request);

    expect(result.estado).toBe("EMITIDA");
    expect(result.numero_fiscal).toBe("001-001-0000011");
  });

  it("can omit FE emission profile and let FE service assign numbering", async () => {
    const calls: Array<{ payload: Record<string, unknown> }> = [];
    const gateway = new RealFiscalGateway({
      mode: "real",
      baseUrl: "https://fe-api.ventax.app/fcws",
      apiKey: "secret",
      timeoutMs: 20000,
      environment: "test",
      serviceNumbering: true,
      sendEmissionProfileCode: false
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push({ payload: JSON.parse(String(init.body)) as Record<string, unknown> });
        return new Response(
          JSON.stringify({
            document_id: "doc-service-numbering",
            cdc: "S".repeat(44),
            nro_factura: "001-001-0002104",
            status: "APPROVED"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
    );

    await gateway.emitFactura(request);

    expect(calls[0]?.payload).not.toHaveProperty("emission_profile_code");
    expect(calls[0]?.payload).toMatchObject({
      timbrado: {
        documentoNro: null
      },
      numbering: {
        mode: "ONLINE",
        authority: "SERVICE",
        requested_document_number: null
      }
    });
  });

  it("emits CREDITO payload without payments or collection schedule", async () => {
    const calls: Array<{ payload: Record<string, unknown> }> = [];
    const gateway = new RealFiscalGateway({
      mode: "real",
      baseUrl: "https://fe-api.ventax.app/fcws",
      apiKey: "secret",
      timeoutMs: 20000,
      environment: "test",
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
      condicion_venta: "CREDITO",
      fiscal_context: {
        ...request.fiscal_context,
        credito_plazo_dias: 45
      }
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

  it("emits NCE payload referencing the original electronic invoice", async () => {
    const calls: Array<{ url: string; payload: Record<string, unknown> }> = [];
    const gateway = new RealFiscalGateway({
      mode: "real",
      baseUrl: "https://fe-api.ventax.app/fcws",
      apiKey: "secret",
      timeoutMs: 20000,
      environment: "test",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, payload: JSON.parse(String(init.body)) as Record<string, unknown> });

        return new Response(
          JSON.stringify({
            document_id: "nce-doc-1",
            cdc: "N".repeat(44),
            nro_documento: "001-002-0000010",
            status: "APPROVED"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
    );

    const result = await gateway.emitNotaCredito({
      external_ref: "nce_123",
      facturador: request.facturador,
      fiscal_context: request.fiscal_context,
      cliente: request.cliente,
      items: request.items,
      totals: request.totals,
      motivo: "Devolucion total",
      factura_referencia: {
        documento_id: "66666666-6666-4666-8666-666666666666",
        cdc: "F".repeat(44),
        numero_fiscal: "001-002-0000007"
      }
    });

    expect(result).toMatchObject({
      fiscal_document_id: "nce-doc-1",
      cdc: "N".repeat(44),
      numero_fiscal: "001-002-0000010",
      estado: "EMITIDA"
    });
    expect(calls[0]?.url).toBe("https://fe-api.ventax.app/fcws/nota-credito");
    expect(calls[0]?.payload).toMatchObject({
      emisor_id: request.facturador.emisor_id,
      actividadEconomicaCodigo: "82110",
      emission_profile_code: "SERV",
      timbrado: {
        documentoNro: "0000000"
      },
      numbering: {
        mode: "ONLINE",
        authority: "SERVICE",
        requested_document_number: "0000000"
      },
      client_reference: {
        entity_type: "nota_credito_operativa",
        entity_id: "nce_123",
        idempotency_key: "nce_123"
      },
      motivo: {
        codigo: 1,
        descripcion: "Devolucion total"
      },
      referencia: {
        tipo: "ELECTRONICO",
        cdc: "F".repeat(44)
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
        mode: "BATCH"
      }
    });
    expect(calls[0]?.payload.envio).not.toHaveProperty("sendNow");
  });

  it("lets FE service assign NCE numbering when service numbering is enabled", async () => {
    const calls: Array<{ payload: Record<string, unknown> }> = [];
    const gateway = new RealFiscalGateway({
      mode: "real",
      baseUrl: "https://fe-api.ventax.app/fcws",
      apiKey: "secret",
      timeoutMs: 20000,
      environment: "test",
      serviceNumbering: true
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push({ payload: JSON.parse(String(init.body)) as Record<string, unknown> });

        return new Response(
          JSON.stringify({
            document_id: "nce-doc-service-numbering",
            cdc: "N".repeat(44),
            nro_documento: "001-002-0000001",
            status: "APPROVED"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
    );

    await gateway.emitNotaCredito({
      external_ref: "nce_service_numbering",
      facturador: request.facturador,
      fiscal_context: {
        ...request.fiscal_context,
        documento_nro: "0000019"
      },
      cliente: request.cliente,
      items: request.items,
      totals: request.totals,
      motivo: "Devolucion total",
      factura_referencia: {
        documento_id: "66666666-6666-4666-8666-666666666666",
        cdc: "F".repeat(44),
        numero_fiscal: "001-002-0000014"
      }
    });

    expect(calls[0]?.payload).toMatchObject({
      timbrado: {
        documentoNro: null
      },
      numbering: {
        mode: "ONLINE",
        authority: "SERVICE",
        requested_document_number: null
      }
    });
  });

  it("derives fiscal number from resolved timbrado when nro_factura is omitted", async () => {
    const gateway = new RealFiscalGateway({
      mode: "real",
      baseUrl: "https://fe-api.ventax.app/fcws",
      timeoutMs: 20000,
      environment: "test",
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

    const testUuid = "ffffffff-ffff-4fff-bfff-ffffffffffff";
    const result = await gateway.refreshFacturaStatus({ documentUuid: testUuid });

    expect(result.estado).toBe("EMITIDA");
    expect(calls[0]).toBe(`https://fe-api.ventax.app/fcws/documentos/${testUuid}/sifen?env=test&refresh=true`);
  });

  it("maps refresh code 0422 (CDC encontrado) as approved state", async () => {
    const gateway = new RealFiscalGateway({
      mode: "real",
      baseUrl: "https://fe-api.ventax.app/fcws",
      apiKey: "secret",
      timeoutMs: 20000,
      environment: "test"
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            cdc: "G".repeat(44),
            status: {
              status: "PENDING",
              sifen_status: { code: "0422", message: "CDC encontrado" }
            },
            refreshed: true
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
      )
    );

    const result = await gateway.refreshFacturaStatus({ documentUuid: "gggggggg-gggg-4ggg-bggg-gggggggggggg" });
    expect(result.estado).toBe("EMITIDA");
  });

  it("sends cancellation event to real fiscal backend", async () => {
    const calls: Array<{ url: string; init: RequestInit; payload: Record<string, unknown> }> = [];
    const gateway = new RealFiscalGateway({
      mode: "real",
      baseUrl: "https://fe-api.ventax.app/fcws",
      apiKey: "secret",
      timeoutMs: 20000,
      environment: "test",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
        calls.push({ url, init, payload });

        return new Response(
          JSON.stringify({
            event_id: "evt-real-1",
            status: "SENT",
            sifen: { code: "0300" }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      })
    );

    const result = await gateway.cancelFactura({
      emisor_id: request.facturador.emisor_id,
      cdc: "C".repeat(44),
      motivo: "Error en datos del receptor"
    });

    expect(result).toMatchObject({
      event_id: "evt-real-1",
      estado: "PENDIENTE_SIFEN"
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://fe-api.ventax.app/fcws/evento/cancelar");
    expect(calls[0]?.init.headers).toMatchObject({
      accept: "application/json",
      "content-type": "application/json",
      "x-api-key": "secret"
    });
    expect(calls[0]?.payload).toEqual({
      emisor_id: request.facturador.emisor_id,
      cdc: "C".repeat(44),
      motivo: "Error en datos del receptor"
    });
  });

  it("adds env query when downloading XML and KUDE artifacts", async () => {
    const calls: string[] = [];
    const gateway = new RealFiscalGateway({
      mode: "real",
      baseUrl: "https://fe-api.ventax.app/fcws",
      apiKey: "secret",
      timeoutMs: 20000,
      environment: "test"
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        return new Response("artifact", { status: 200, headers: { "content-type": "application/pdf" } });
      })
    );

    const xmlUuid = "xxxxxxxx-xxxx-4xxx-bxxx-xxxxxxxxxxxx";
    const kudeUuid = "yyyyyyyy-yyyy-4yyy-byyy-yyyyyyyyyyyy";
    await gateway.getXml(xmlUuid);
    await gateway.getKudePdf(kudeUuid);

    expect(calls[0]).toBe(`https://fe-api.ventax.app/fcws/documentos/${xmlUuid}/files/xml?env=test`);
    expect(calls[1]).toBe(`https://fe-api.ventax.app/fcws/documentos/${kudeUuid}/files/kude.pdf?env=test`);
  });

  it("queries eventos, pendientes batch y facturalista with env", async () => {
    const calls: string[] = [];
    const gateway = new RealFiscalGateway({
      mode: "real",
      baseUrl: "https://fe-api.ventax.app/fcws",
      apiKey: "secret",
      timeoutMs: 20000,
      environment: "test"
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);

        if (url.includes("/consultar/evento/")) {
          return new Response(JSON.stringify({ events: [] }), { status: 200, headers: { "content-type": "application/json" } });
        }
        if (url.includes("/batch-pendientes")) {
          return new Response(JSON.stringify({ documents: [], batches: [] }), { status: 200, headers: { "content-type": "application/json" } });
        }

        return new Response(JSON.stringify({ items: [], next: null }), { status: 200, headers: { "content-type": "application/json" } });
      })
    );

    const eventosUuid = "cccccccc-cccc-4ccc-bccc-cccccccccccc";
    await gateway.getDocumentoEventos(eventosUuid);
    await gateway.getBatchPendientesByEmisor({ emisorId: "80136968-1", limit: 20, offset: 0 });
    await gateway.getFacturalistaByEmisor({ emisorId: "80136968-1", offset: 0, limit: 20 });

    expect(calls[0]).toBe(`https://fe-api.ventax.app/fcws/documentos/${eventosUuid}/eventos?env=test`);
    expect(calls[1]).toBe("https://fe-api.ventax.app/fcws/consultar/80136968-1/batch-pendientes?env=test&limit=20&offset=0");
    expect(calls[2]).toBe("https://fe-api.ventax.app/fcws/consultar/80136968-1/facturalista/0?env=test&limit=20");
  });
});
