import { afterEach, describe, expect, it, vi } from "vitest";
import { createFiscalGateway, mapFiscalDocumentoTotalesResponse, MockFiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.client";
import { FiscalGatewayError, type FiscalDocumentoTotalesResponse, type FiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.types";
import { guardarTotalesFe, totalesDesdeFe } from "../src/modules/facturas/facturas.service";
import type { DocumentoResponse, FacturaRepository } from "../src/modules/facturas/facturas.types";

// SPEC_MONEDA_EXTRANJERA_v0.1, A-2 / RN-07 (TASKS MON-009).

/** Totales reales de FE para la 001-001-0000748 de RAJ en SIFEN test (TASKS MON-010, caso 7). */
const feUsd: FiscalDocumentoTotalesResponse = {
  moneda: "USD",
  tipo_cambio: 6329.77,
  totales: { bruto: 605, descuento: 0, anticipo: 0, total: 605, redondeo: 0, gravada_10: 550, gravada_5: 0, exenta: 0, exonerada: 0, iva_10: 55, iva_5: 0, iva_total: 55 },
  total_guaranies: 3829511,
  raw: {}
};

function documento(overrides: Partial<DocumentoResponse> = {}): DocumentoResponse {
  return {
    id: "doc-1",
    tipo: "FACTURA",
    estado: "EMITIDA",
    document_uuid: "2bcf1ddd-da1e-4b26-81ab-6d2f8722096f",
    moneda: "USD",
    tipo_cambio: 6329.77,
    totals: { subtotal: 605, total_sin_iva: 550, iva_5: 0, iva_10: 55, total_iva: 55, total: 605 },
    ...overrides
  } as DocumentoResponse;
}

function repositorio() {
  const updateTotals = vi.fn(async (input: { totals: DocumentoResponse["totals"] }) => documento({ totals: input.totals }));
  return { repo: { updateTotals } as unknown as FacturaRepository, updateTotals };
}

function gatewayCon(getDocumentoTotales: FiscalGateway["getDocumentoTotales"]) {
  return { getDocumentoTotales: vi.fn(getDocumentoTotales) } as unknown as FiscalGateway & { getDocumentoTotales: ReturnType<typeof vi.fn> };
}

describe("totales oficiales de FE (A-2)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("totalesDesdeFe: USD con total en guaranies y fuente FE", () => {
    expect(totalesDesdeFe(feUsd)).toEqual({
      subtotal: 605,
      total_sin_iva: 550,
      iva_5: 0,
      iva_10: 55,
      total_iva: 55,
      total: 605,
      redondeo: 0,
      total_guaranies: 3829511,
      fuente: "FE"
    });
  });

  it("totalesDesdeFe: PYG con descuento conserva el descuento y la marca de referencia previa", () => {
    const pyg: FiscalDocumentoTotalesResponse = {
      moneda: "PYG",
      tipo_cambio: null,
      totales: { bruto: 100000, descuento: 10000, anticipo: 0, total: 90000, redondeo: 0, gravada_10: 81818, gravada_5: 0, exenta: 0, exonerada: 0, iva_10: 8182, iva_5: 0, iva_total: 8182 },
      total_guaranies: 90000,
      raw: {}
    };
    const t = totalesDesdeFe(pyg, { subtotal: 1, total_sin_iva: 1, iva_5: 0, iva_10: 0, total_iva: 0, total: 1, nota_credito_por_referencia: true });
    expect(t).toMatchObject({ subtotal: 100000, total: 90000, total_sin_iva: 81818, descuento: 10000, nota_credito_por_referencia: true, fuente: "FE" });
    expect(t).not.toHaveProperty("anticipo");
  });

  it("guarda los totales de FE de un documento aprobado", async () => {
    const { repo, updateTotals } = repositorio();
    const gateway = gatewayCon(async () => feUsd);
    const result = await guardarTotalesFe("fac-1", documento(), repo, gateway);
    expect(gateway.getDocumentoTotales).toHaveBeenCalledWith("2bcf1ddd-da1e-4b26-81ab-6d2f8722096f");
    expect(updateTotals).toHaveBeenCalledWith(expect.objectContaining({ facturadorId: "fac-1", documentoId: "doc-1" }));
    expect(result.totals).toMatchObject({ fuente: "FE", total_guaranies: 3829511 });
  });

  it("no consulta si ya tiene los de FE, si no esta aprobado o si no es factura ni nota", async () => {
    const { repo, updateTotals } = repositorio();
    const gateway = gatewayCon(async () => feUsd);
    await guardarTotalesFe("fac-1", documento({ totals: { ...documento().totals, fuente: "FE" } }), repo, gateway);
    await guardarTotalesFe("fac-1", documento({ estado: "PENDIENTE_SIFEN" }), repo, gateway);
    await guardarTotalesFe("fac-1", documento({ tipo: "NOTA_REMISION" }), repo, gateway);
    await guardarTotalesFe("fac-1", documento({ document_uuid: null }), repo, gateway);
    expect(gateway.getDocumentoTotales).not.toHaveBeenCalled();
    expect(updateTotals).not.toHaveBeenCalled();
  });

  it("RN-07: si FE falla o la moneda difiere, devuelve el documento sin cambios y no lanza", async () => {
    const { repo, updateTotals } = repositorio();
    const falla = gatewayCon(async () => {
      throw new FiscalGatewayError("UPSTREAM_ERROR", "x", { status: 404, body: { error: "XML_NOT_AVAILABLE" } });
    });
    const doc = documento();
    await expect(guardarTotalesFe("fac-1", doc, repo, falla)).resolves.toBe(doc);
    const otraMoneda = gatewayCon(async () => ({ ...feUsd, moneda: "EUR" }));
    await expect(guardarTotalesFe("fac-1", doc, repo, otraMoneda)).resolves.toBe(doc);
    expect(updateTotals).not.toHaveBeenCalled();
  });

  it("cliente HTTP: GET /documentos/{uuid}/totales con la clave de la instancia", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ document_uuid: "u", tipo_documento: "FE", moneda: "USD", tipo_cambio: 6329.77, totales: feUsd.totales, total_guaranies: 3829511 }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const gateway = createFiscalGateway({ mode: "real", baseUrl: "http://fe.test/v1", apiKey: "clave", timeoutMs: 1000, environment: "test" } as never);
    const r = await gateway.getDocumentoTotales("u");
    expect(r).toMatchObject({ moneda: "USD", tipo_cambio: 6329.77, total_guaranies: 3829511 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://fe.test/v1/documentos/u/totales?env=test");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("clave");
  });

  it("mapFiscalDocumentoTotalesResponse rechaza una respuesta sin total", () => {
    expect(() => mapFiscalDocumentoTotalesResponse({ moneda: "USD", totales: {} })).toThrow(FiscalGatewayError);
    expect(mapFiscalDocumentoTotalesResponse({ totales: { total: 110000 } })).toMatchObject({ moneda: "PYG", tipo_cambio: null, total_guaranies: 110000 });
  });

  it("mock: devuelve los totales de lo que emitio, con el total en guaranies", async () => {
    const mock = new MockFiscalGateway({ mode: "mock", baseUrl: "http://mock", timeoutMs: 1000, environment: "test" });
    const emitida = await mock.emitFactura({
      external_ref: "fac_totales_mock",
      moneda: "USD",
      tipo_cambio: 6329.77,
      totals: { subtotal: 605, total_sin_iva: 550, iva_5: 0, iva_10: 55, total_iva: 55, total: 605 },
      cliente: { email: null },
      fiscal_context: { establecimiento: "001", punto_expedicion: "001" }
    } as never);
    const totales = await mock.getDocumentoTotales(emitida.document_uuid!);
    expect(totales).toMatchObject({ moneda: "USD", total_guaranies: 3829511, totales: { total: 605, iva_10: 55 } });
    await expect(mock.getDocumentoTotales("00000000-0000-4000-8000-000000000000")).rejects.toBeInstanceOf(FiscalGatewayError);
  });
});
