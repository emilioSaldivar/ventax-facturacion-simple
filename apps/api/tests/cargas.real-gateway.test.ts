import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealFiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.client";
import { FiscalGatewayError, type FeCargaErrorDetails } from "../src/modules/fiscal-gateway/fiscal-gateway.types";

// Valor sintetico, no es una clave real.
const gateway = new RealFiscalGateway({ mode: "real", baseUrl: "http://fe.test/v1", apiKey: "clave-sintetica", timeoutMs: 1000, environment: "test" });

function respuesta(status: number, cuerpo: unknown, headers: Record<string, string> = {}) {
  return new Response(typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo), { status, headers });
}

describe("RealFiscalGateway: carga masiva", () => {
  const fetchMock = vi.fn();
  const llamada = () => {
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    return { url: new URL(url), init, headers: init.headers as Record<string, string> };
  };

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const pedido = {
    contenido: Buffer.from("a;b\n1;2\n"),
    contentType: "text/csv" as const,
    emisorId: "80136968-1",
    numeracion: "CLIENTE" as const,
    actividadEconomicaCodigo: "82110",
    emissionProfileCode: "SERV",
    nombreArchivo: "ventas enero.csv"
  };

  it("sube el archivo como cuerpo, con la clave y los parametros en la URL", async () => {
    fetchMock.mockResolvedValue(respuesta(202, { carga_id: "c1", estado: "RECIBIDA" }));
    const resultado = await gateway.crearCarga(pedido);
    const { url, init, headers } = llamada();
    expect(url.pathname).toBe("/v1/cargas");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      emisor_id: "80136968-1",
      formato: "CSV",
      version: "1",
      numeracion: "CLIENTE",
      actividadEconomicaCodigo: "82110",
      emission_profile_code: "SERV",
      nombre_archivo: "ventas enero.csv"
    });
    expect(init.method).toBe("POST");
    expect(headers["content-type"]).toBe("text/csv");
    expect(headers["x-api-key"]).toBe("clave-sintetica");
    expect(Buffer.from(init.body as Uint8Array).equals(pedido.contenido)).toBe(true);
    expect(resultado).toMatchObject({ creada: true, carga: { carga_id: "c1" } });
  });

  it("sin perfil manda establecimiento y punto", async () => {
    fetchMock.mockResolvedValue(respuesta(202, { carga_id: "c1" }));
    const { emissionProfileCode: _perfil, ...sinPerfil } = pedido;
    await gateway.crearCarga({ ...sinPerfil, establecimiento: "001", punto: "002" });
    const { url } = llamada();
    expect(url.searchParams.get("establecimiento")).toBe("001");
    expect(url.searchParams.get("punto")).toBe("002");
    expect(url.searchParams.has("emission_profile_code")).toBe(false);
  });

  it("el 200 de FE es un archivo ya subido", async () => {
    fetchMock.mockResolvedValue(respuesta(200, { carga_id: "c1" }));
    expect((await gateway.crearCarga(pedido)).creada).toBe(false);
  });

  it("lee el error plano de /v1/cargas: codigo, mensaje, detalles y espera", async () => {
    fetchMock.mockResolvedValue(
      respuesta(429, { error: "CARGA_CUOTA_DIARIA", message: "Cuota superada", details: { motivo: "CUOTA_DIARIA", retry_after_seconds: 60 } }, { "retry-after": "3600" })
    );
    const error = await gateway.crearCarga(pedido).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FiscalGatewayError);
    const info = (error as FiscalGatewayError).details as FeCargaErrorDetails;
    expect(info).toEqual({
      status: 429,
      fe_code: "CARGA_CUOTA_DIARIA",
      message: "Cuota superada",
      details: { motivo: "CUOTA_DIARIA", retry_after_seconds: 60 },
      retry_after_seconds: 3600
    });
  });

  it("sin cabecera toma la espera de details; un cuerpo no JSON no rompe", async () => {
    fetchMock.mockResolvedValueOnce(respuesta(429, { error: "CARGA_COLA_LLENA", details: { retry_after_seconds: 30 } }));
    const conEspera = (await gateway.getCarga("c1").catch((e: unknown) => e)) as FiscalGatewayError;
    expect((conEspera.details as FeCargaErrorDetails).retry_after_seconds).toBe(30);

    fetchMock.mockResolvedValueOnce(respuesta(502, "<html>bad gateway</html>"));
    const sinJson = (await gateway.getCarga("c1").catch((e: unknown) => e)) as FiscalGatewayError;
    expect(sinJson.code).toBe("UPSTREAM_ERROR");
    expect((sinJson.details as FeCargaErrorDetails).status).toBe(502);
  });

  it("un 504 es TIMEOUT, y un fallo de red UNAVAILABLE", async () => {
    fetchMock.mockResolvedValueOnce(respuesta(504, {}));
    expect(await gateway.getCarga("c1").catch((e: FiscalGatewayError) => e.code)).toBe("TIMEOUT");
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    expect(await gateway.getCarga("c1").catch((e: FiscalGatewayError) => e.code)).toBe("UNAVAILABLE");
  });

  it("los comprobantes pasan solo los filtros indicados", async () => {
    fetchMock.mockResolvedValue(respuesta(200, { items: [], total: 0 }));
    await gateway.listCargaComprobantes("c1", { estado: "INVALIDO,RECHAZADO", actualizado_desde: "2026-11-07T10:00:00.000Z", detalle: true, page: 2, limit: 200 });
    const { url } = llamada();
    expect(url.pathname).toBe("/v1/cargas/c1/comprobantes");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      estado: "INVALIDO,RECHAZADO",
      actualizado_desde: "2026-11-07T10:00:00.000Z",
      detalle: "true",
      page: "2",
      limit: "200"
    });
  });

  it.each([
    ["confirmarCarga", "/v1/cargas/c1/confirmar"],
    ["cancelarCarga", "/v1/cargas/c1/cancelar"],
    ["reintentarCarga", "/v1/cargas/c1/reintentar"]
  ] as const)("%s hace POST a su ruta", async (metodo, ruta) => {
    fetchMock.mockResolvedValue(respuesta(202, { carga_id: "c1" }));
    await gateway[metodo]("c1");
    const { url, init } = llamada();
    expect(url.pathname).toBe(ruta);
    expect(init.method).toBe("POST");
  });

  it("plantilla y resultado devuelven los bytes tal cual", async () => {
    fetchMock.mockResolvedValue(respuesta(200, "a;b\n", { "content-type": "text/csv; charset=utf-8" }));
    const plantilla = await gateway.getPlantillaCarga();
    expect(llamada().url.pathname).toBe("/v1/cargas/formatos/csv/1");
    expect(plantilla.body.toString()).toBe("a;b\n");
    expect(plantilla.content_type).toContain("text/csv");

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(respuesta(200, "x;y\n"));
    const resultado = await gateway.getCargaResultado("c1");
    expect(llamada().url.pathname).toBe("/v1/cargas/c1/resultado");
    expect(resultado.body.toString()).toBe("x;y\n");
  });

  it("los lotes consultan su ruta", async () => {
    fetchMock.mockResolvedValue(respuesta(200, { carga_id: "c1", items: [] }));
    await gateway.getCargaLotes("c1");
    expect(llamada().url.pathname).toBe("/v1/cargas/c1/lotes");
  });
});
