import { afterEach, describe, it, expect, vi } from "vitest";
import { createFiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.client.js";
import type { FiscalCrearReciboRequest } from "../src/modules/fiscal-gateway/fiscal-gateway.types.js";

// SPEC_RECIBO_DINERO_v0.6 D-2, RN-07 y PLAN §4: perfil en el cliente fiscal real y reglas de la guia §71 en el mock.
const request: FiscalCrearReciboRequest = {
  emisor_id: "80136968-1",
  fecha_cobro: "2026-11-13",
  pagador_nombre: "Juan Perez",
  concepto: "Cobro",
  importe: 150.5,
  moneda: "USD",
  emission_profile_code: "SERV"
};

const respuestaFe = { id: "r1", estado: "BORRADOR", fecha_cobro: "2026-11-13", pagador_nombre: "Juan Perez", concepto: "Cobro", importe: "150.50", moneda: "USD", emission_profile_code: "SERV", created_at: "x", updated_at: "x" };

function real(sendEmissionProfileCode: boolean) {
  return createFiscalGateway({ mode: "real", baseUrl: "http://fe.test/v1", apiKey: "clave", timeoutMs: 1000, environment: "test", sendEmissionProfileCode } as never);
}

afterEach(() => vi.unstubAllGlobals());

describe("recibo: perfil de emision en el cliente fiscal", () => {
  it("manda emission_profile_code y lee el de la respuesta", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(respuestaFe), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await real(true).crearRecibo(request);
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ emission_profile_code: "SERV", moneda: "USD", importe: 150.5 });
    expect(result.emission_profile_code).toBe("SERV");
  });

  it("con FE_SEND_EMISSION_PROFILE_CODE=false no lo manda", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ...respuestaFe, emission_profile_code: undefined }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await real(false).crearRecibo(request);
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).not.toHaveProperty("emission_profile_code");
    expect(result.emission_profile_code).toBeNull();
  });
});

describe("recibo: mock con las reglas de la guia §71", () => {
  const mock = () => createFiscalGateway({ mode: "mock" } as never);

  it("acepta USD con decimales y devuelve el perfil", async () => {
    await expect(mock().crearRecibo(request)).resolves.toMatchObject({ moneda: "USD", importe: "150.50", emission_profile_code: "SERV" });
  });

  it("rechaza otra moneda, PYG con decimales y un perfil inexistente", async () => {
    await expect(mock().crearRecibo({ ...request, moneda: "GBP" })).rejects.toMatchObject({ details: { status: 422, body: { error: "VALIDATION_ERROR" } } });
    await expect(mock().crearRecibo({ ...request, moneda: "PYG" })).rejects.toMatchObject({ details: { status: 422 } });
    await expect(mock().crearRecibo({ ...request, emission_profile_code: "NO-EXISTE" })).rejects.toMatchObject({
      details: { body: { error: "EMISSION_PROFILE_NOT_AVAILABLE" } }
    });
  });
});
