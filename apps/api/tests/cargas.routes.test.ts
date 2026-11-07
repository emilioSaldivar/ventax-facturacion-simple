import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCargasRouter, type CargasRouterDeps } from "../src/modules/cargas/cargas.routes";
import { MockFiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.client";
import { mockCargas } from "../src/modules/fiscal-gateway/fiscal-gateway.mock-cargas";
import { FiscalGatewayError } from "../src/modules/fiscal-gateway/fiscal-gateway.types";
import { errorHandler } from "../src/shared/errors/error-handler";
import { FakeCargaRepository, contexto, csv } from "./cargas.fixtures";

describe("rutas de cargas", () => {
  let server: Server;
  let base: string;
  let repository: FakeCargaRepository;
  let gateway: MockFiscalGateway;

  async function levantar(overrides: Partial<CargasRouterDeps> = {}) {
    const app = express();
    app.use(express.json({ limit: "1mb" }));
    app.use((req, _res, next) => {
      (req as unknown as { id: string }).id = "req-test";
      next();
    });
    app.use(
      createCargasRouter({
        repository,
        gatewayFor: async () => gateway,
        requireAuth: (req, _res, next) => {
          req.user = contexto().user as never;
          next();
        },
        getContext: async () => contexto(),
        getReadiness: async () => ({ ready: true, checks: [] }),
        enabled: () => true,
        maxBytes: 2048,
        subidasSimultaneas: 2,
        ...overrides
      })
    );
    app.use(errorHandler);
    await new Promise<void>((resolve) => {
      server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  const subir = (cuerpo: Buffer, tipo = "text/csv", query = "") =>
    fetch(`${base}/cargas${query}`, { method: "POST", headers: { "content-type": tipo }, body: new Uint8Array(cuerpo) });

  beforeEach(() => {
    mockCargas.__reiniciar();
    repository = new FakeCargaRepository();
    gateway = new MockFiscalGateway({ mode: "mock", baseUrl: "http://mock", timeoutMs: 1000, environment: "test" });
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("CA-12: con la bandera apagada toda ruta responde 404", async () => {
    await levantar({ enabled: () => false });
    expect((await fetch(`${base}/cargas`)).status).toBe(404);
    expect((await subir(csv("1;2;;A"))).status).toBe(404);
    expect((await fetch(`${base}/cargas/plantilla`)).status).toBe(404);
  });

  it("sube un csv y responde 201; el mismo archivo responde 200 repetida", async () => {
    await levantar();
    const contenido = csv("001-002-0000001;PED-1;;A");
    const primera = await subir(contenido, "text/csv", "?nombre_archivo=ventas.csv");
    expect(primera.status).toBe(201);
    expect(await primera.json()).toMatchObject({ estado: "RECIBIDA", nombre_archivo: "ventas.csv", repetida: false });
    const segunda = await subir(contenido);
    expect(segunda.status).toBe(200);
    expect(await segunda.json()).toMatchObject({ repetida: true });
  });

  it("acepta content-type con charset y zip", async () => {
    await levantar();
    expect((await subir(csv("001-002-0000001;PED-1;;A"), "text/csv; charset=utf-8")).status).toBe(201);
    expect((await subir(Buffer.from("PK-falso"), "application/zip")).status).toBe(201);
  });

  it.each(["application/json", "multipart/form-data; boundary=x", "text/plain"])("rechaza %s con 415", async (tipo) => {
    await levantar();
    const respuesta = await subir(Buffer.from("{}"), tipo);
    expect(respuesta.status).toBe(415);
    expect(await respuesta.json()).toMatchObject({ error: { details: { reason: "TIPO_DE_CONTENIDO_NO_ADMITIDO" } } });
  });

  it("cuerpo vacio responde 422", async () => {
    await levantar();
    const respuesta = await subir(Buffer.alloc(0));
    expect(respuesta.status).toBe(422);
    expect(await respuesta.json()).toMatchObject({ error: { details: { reason: "ARCHIVO_VACIO" } } });
  });

  it("por encima de CARGA_MAX_BYTES responde 413 con tope_bytes", async () => {
    await levantar();
    const respuesta = await subir(Buffer.alloc(4096, "a"));
    expect(respuesta.status).toBe(413);
    expect(await respuesta.json()).toMatchObject({ error: { code: "PAYLOAD_TOO_LARGE", details: { tope_bytes: 2048 } } });
  });

  it("la tercera subida simultanea responde 429 con Retry-After, y el cupo se libera", async () => {
    let soltar!: () => void;
    const barrera = new Promise<void>((resolve) => {
      soltar = resolve;
    });
    await levantar({
      getReadiness: async () => {
        await barrera;
        return { ready: true, checks: [] };
      }
    });
    const enCurso = [subir(csv("001-002-0000001;PED-1;;A")), subir(csv("001-002-0000002;PED-2;;A"))];
    await new Promise((resolve) => setTimeout(resolve, 100));
    const tercera = await subir(csv("001-002-0000003;PED-3;;A"));
    expect(tercera.status).toBe(429);
    expect(tercera.headers.get("retry-after")).toBe("10");
    soltar();
    await Promise.all(enCurso);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect((await subir(csv("001-002-0000004;PED-4;;A"))).status).toBe(201);
  });

  it("el 429 de FE conserva Retry-After", async () => {
    vi.spyOn(gateway, "crearCarga").mockRejectedValue(
      new FiscalGatewayError("UPSTREAM_ERROR", "cuota", { status: 429, fe_code: "CARGA_CUOTA_DIARIA", message: "Cuota superada", details: null, retry_after_seconds: 3600 })
    );
    await levantar();
    const respuesta = await subir(csv("001-002-0000001;PED-1;;A"));
    expect(respuesta.status).toBe(429);
    expect(respuesta.headers.get("retry-after")).toBe("3600");
  });

  it("contexto no listo responde 409 en subir y confirmar, y no en cancelar", async () => {
    await levantar();
    const creada = (await (await subir(csv("001-002-0000001;PED-1;;A"))).json()) as { id: string };
    await fetch(`${base}/cargas/${creada.id}`);
    await new Promise((resolve) => server.close(resolve));

    await levantar({ getReadiness: async () => ({ ready: false, checks: [{ code: "x", ok: false, message: "falta" }] }) });
    const subida = await subir(csv("001-002-0000002;PED-2;;A"));
    expect(subida.status).toBe(409);
    expect(await subida.json()).toMatchObject({ error: { details: { reason: "CONTEXTO_NO_LISTO" } } });
    expect((await fetch(`${base}/cargas/${creada.id}/confirmar`, { method: "POST" })).status).toBe(409);
    expect((await fetch(`${base}/cargas/${creada.id}/cancelar`, { method: "POST" })).status).toBe(200);
  });

  it("plantilla y resultado se descargan como adjunto csv", async () => {
    await levantar();
    const plantilla = await fetch(`${base}/cargas/plantilla`);
    expect(plantilla.status).toBe(200);
    expect(plantilla.headers.get("content-type")).toContain("text/csv");
    expect(plantilla.headers.get("content-disposition")).toContain("plantilla-carga-facturas.csv");
    const creada = (await (await subir(csv("001-002-0000001;PED-1;;A"), "text/csv", "?nombre_archivo=ventas.csv")).json()) as { id: string };
    const resultado = await fetch(`${base}/cargas/${creada.id}/resultado`);
    expect(resultado.headers.get("content-disposition")).toContain("resultado-ventas.csv");
  });

  it("un id que no es uuid responde 400; el limite de comprobantes es 200", async () => {
    await levantar();
    expect((await fetch(`${base}/cargas/no-es-uuid`)).status).toBe(400);
    const creada = (await (await subir(csv("001-002-0000001;PED-1;;A"))).json()) as { id: string };
    expect((await fetch(`${base}/cargas/${creada.id}/comprobantes?limit=201`)).status).toBe(400);
    expect((await fetch(`${base}/cargas/${creada.id}/comprobantes?limit=200`)).status).toBe(200);
  });

  it("los lotes responden 403 a un operador", async () => {
    await levantar();
    const creada = (await (await subir(csv("001-002-0000001;PED-1;;A"))).json()) as { id: string };
    expect((await fetch(`${base}/cargas/${creada.id}/lotes`)).status).toBe(403);
  });
});
