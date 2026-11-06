import { afterEach, describe, expect, it, vi } from "vitest";
import { createFiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.client";
import { FiscalGatewayError, type FiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.types";
import { processNextQueuedFiscalEmission } from "../src/modules/facturas/facturas.service";
import { getEmailStatus } from "../src/modules/entrega/entrega.service";

// SPEC_CONTRATO_FE_SOBRECARGA_v0.1.
const gatewayReal = () =>
  createFiscalGateway({ mode: "real", baseUrl: "http://fe.test/v1", apiKey: "clave", timeoutMs: 1000, environment: "test", sendEmissionProfileCode: true, serviceNumbering: true } as never);
const solicitud = {
  external_ref: "fac_1",
  condicion_venta: "CONTADO",
  tipo_transaccion: 2,
  facturador: { emisor_id: "1-1", ruc: "1-1", razon_social: "X" },
  fiscal_context: { establecimiento: "001", punto_expedicion: "001", perfil_emision_codigo: "P", actividad_economica_codigo: "1", timbrado: "1", timbrado_inicio: "2025-01-01", documento_nro: "0000001", tipo_transaccion_default: 2 },
  cliente: { documento_tipo: "CI", documento: "1", razon_social: "C" },
  items: [{ line_no: 1, descripcion: "S", cantidad: 1, precio_unitario: 11000, iva_tipo: "IVA_10", subtotal: 11000, base_imponible: 10000, iva_monto: 1000 }],
  totals: { subtotal: 11000, total_sin_iva: 10000, iva_5: 0, iva_10: 1000, total_iva: 1000, total: 11000 }
} as never;

function respuesta(status: number, cuerpo: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json", ...headers } });
}

describe("contrato FE: sobrecarga", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("convierte el 503 EMISSION_OVERLOADED y respeta Retry-After", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(503, { error: "EMISSION_OVERLOADED", details: { reason: "QUEUE_FULL", retry_after_seconds: 5 } }, { "retry-after": "12" })));
    const error = await gatewayReal().emitFactura(solicitud).catch((e) => e);
    expect(error).toBeInstanceOf(FiscalGatewayError);
    expect(error.code).toBe("EMISSION_OVERLOADED");
    expect(error.details.retry_after_seconds).toBe(12);
  });

  it("usa el cuerpo si falta el encabezado", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(503, { error: "EMISSION_OVERLOADED", details: { retry_after_seconds: 7 } })));
    const error = await gatewayReal().emitFactura(solicitud).catch((e) => e);
    expect(error.details.retry_after_seconds).toBe(7);
  });

  it("otro 503 sigue siendo UPSTREAM_ERROR", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(503, { error: "SIFEN_NO_DISPONIBLE" })));
    const error = await gatewayReal().emitFactura(solicitud).catch((e) => e);
    expect(error.code).toBe("UPSTREAM_ERROR");
  });

  function repositorio(creado: Date) {
    const fallos: Array<Record<string, unknown>> = [];
    return {
      fallos,
      repo: {
        claimNextPendingEmission: async () => ({ outboxId: "o", documentoId: "d", facturadorId: "f", facturadorApiKey: null, fiscalRequest: {}, attempts: 3, documentoCreatedAt: creado.toISOString(), accionNotificadaAt: null }),
        failPendingEmission: async (input: Record<string, unknown>) => {
          fallos.push(input);
          return null;
        }
      } as never
    };
  }
  const conError = (e: Error) => ({ emitFactura: async () => { throw e; } }) as unknown as FiscalGateway;

  it("el outbox espera lo indicado y mantiene EMITIENDO", async () => {
    const { repo, fallos } = repositorio(new Date());
    await processNextQueuedFiscalEmission(repo, conError(new FiscalGatewayError("EMISSION_OVERLOADED", "x", { retry_after_seconds: 9 })));
    expect(fallos[0]).toMatchObject({ estado: "EMITIENDO", retryAfterSeconds: 9, outboxEstado: "FAILED_TEMP" });
  });

  it("otros errores siguen como antes", async () => {
    const { repo, fallos } = repositorio(new Date());
    await processNextQueuedFiscalEmission(repo, conError(new FiscalGatewayError("UPSTREAM_ERROR", "x", {})));
    expect(fallos[0]).toMatchObject({ estado: "ERROR_TEMPORAL" });
  });

  it("el corte por antiguedad se mantiene con sobrecarga", async () => {
    const { repo, fallos } = repositorio(new Date(Date.now() - 1000 * 60 * 60 * 24 * 30));
    await processNextQueuedFiscalEmission(repo, conError(new FiscalGatewayError("EMISSION_OVERLOADED", "x", { retry_after_seconds: 9 })));
    expect(fallos[0]).toMatchObject({ estado: "ERROR_TEMPORAL", outboxEstado: "FAILED_PERM" });
  });
});

describe("contrato FE: correo en cola", () => {
  const contexto = { facturador: { id: "f" } } as never;
  function repositorio(estado: string) {
    const guardados: string[] = [];
    return {
      guardados,
      repo: {
        findById: async () => ({ id: "d", document_uuid: "u", delivery: { email_status: estado }, cliente: { email: "a@b.invalid" }, estado: "EMITIDA", tipo: "FACTURA" }),
        updateEmailEstadoPendiente: async (_d: string, _f: string, final: string) => { guardados.push(final); }
      } as never
    };
  }
  const gateway = (email_status: string | null) => ({ getDocumentoCanonico: async () => ({ email_status }) }) as unknown as FiscalGateway;

  it("guarda el resultado final", async () => {
    const { repo, guardados } = repositorio("PENDING");
    const r = await getEmailStatus(contexto, "d", repo, gateway("SENT"));
    expect(r.status).toBe("SENT");
    expect(guardados).toEqual(["SENT"]);
  });

  it("sigue en cola si FE no informa el campo o sigue pendiente", async () => {
    for (const valor of [null, "PENDING"]) {
      const { repo, guardados } = repositorio("PENDING");
      expect((await getEmailStatus(contexto, "d", repo, gateway(valor))).status).toBe("PENDING");
      expect(guardados).toEqual([]);
    }
  });

  it("sigue en cola si FE falla, sin error para el operador", async () => {
    const { repo } = repositorio("PENDING");
    const caido = { getDocumentoCanonico: async () => { throw new Error("caido"); } } as unknown as FiscalGateway;
    expect((await getEmailStatus(contexto, "d", repo, caido)).status).toBe("PENDING");
  });

  it("no consulta FE si el estado ya es final", async () => {
    const { repo } = repositorio("SENT");
    const consulta = vi.fn();
    await getEmailStatus(contexto, "d", repo, { getDocumentoCanonico: consulta } as unknown as FiscalGateway);
    expect(consulta).not.toHaveBeenCalled();
  });
});
