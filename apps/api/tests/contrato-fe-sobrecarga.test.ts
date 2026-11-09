import { afterEach, describe, expect, it, vi } from "vitest";
import { createFiscalGateway, extraerMotivoRechazo } from "../src/modules/fiscal-gateway/fiscal-gateway.client";
import { FiscalGatewayError, type FiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.types";
import { processNextQueuedFiscalEmission, refreshFiscalStatusForDocumento } from "../src/modules/facturas/facturas.service";
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
  function repositorio(estado: string, estadoFiscal = "EMITIDA") {
    const guardados: string[] = [];
    return {
      guardados,
      repo: {
        findById: async () => ({ id: "d", document_uuid: "u", delivery: { email_status: estado }, cliente: { email: "a@b.invalid" }, estado: estadoFiscal, tipo: "FACTURA" }),
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

  it("FS-27, CA-27.1: un rechazado con correo deja de estar en cola", async () => {
    const { repo, guardados } = repositorio("PENDING", "RECHAZADA");
    const r = await getEmailStatus(contexto, "d", repo, gateway("NOT_APPLICABLE"));
    expect(r.status).toBe("NOT_APPLICABLE");
    expect(guardados).toEqual(["NOT_APPLICABLE"]);
    expect(r.message).toBe("No se envio correo: SIFEN rechazo la factura.");
  });

  it("FS-27, CA-27.2: sin correo cargado, el mensaje de siempre", async () => {
    const r = await getEmailStatus(contexto, "d", repositorio("NOT_APPLICABLE", "EMITIDA").repo, undefined);
    expect(r.message).toContain("Cliente sin email registrado");
  });

  it("no consulta FE si el estado ya es final", async () => {
    const { repo } = repositorio("SENT");
    const consulta = vi.fn();
    await getEmailStatus(contexto, "d", repo, { getDocumentoCanonico: consulta } as unknown as FiscalGateway);
    expect(consulta).not.toHaveBeenCalled();
  });
});

describe("contrato FE: nota de credito", () => {
  afterEach(() => vi.unstubAllGlobals());
  const solicitudNc = { ...(solicitud as object), factura_referencia: { documento_id: "d", cdc: "0".repeat(44) }, motivo: "x" } as never;

  it("el 409 con idempotent: true es la nota existente", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(409, { document_id: "1", document_uuid: "u", cdc: "c", nro_documento: "0001009", status: "QUEUED_BATCH", idempotent: true })));
    const r = await gatewayReal().emitNotaCredito(solicitudNc);
    expect(r).toMatchObject({ document_uuid: "u", numero_fiscal: "0001009", idempotent: true });
  });

  it("SPEC_TOTALES_FE_EN_CARGA_v0.1 RN-07: por referencia va a /nota-credito/total sin receptor ni items", async () => {
    const fetchMock = vi.fn(async () => respuesta(200, { document_id: "1", document_uuid: "u", cdc: "c", nro_documento: "0001010", status: "QUEUED_BATCH" }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await gatewayReal().emitNotaCredito({ ...(solicitudNc as object), por_referencia: true } as never);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).pathname).toBe("/v1/nota-credito/total");
    const cuerpo = JSON.parse(String(init.body));
    expect(cuerpo.receptor).toBeUndefined();
    expect(cuerpo.items).toBeUndefined();
    expect(cuerpo.referencia).toEqual({ tipo: "ELECTRONICO", cdc: "0".repeat(44) });
    expect(cuerpo.client_reference.idempotency_key).toBeDefined();
    expect(r).toMatchObject({ document_uuid: "u", numero_fiscal: "0001010" });

    fetchMock.mockClear();
    await gatewayReal().emitNotaCredito(solicitudNc);
    const [urlNormal] = fetchMock.mock.calls[0] as unknown as [string];
    expect(new URL(urlNormal).pathname).toBe("/v1/nota-credito");
  });

  it("otro 409 sigue siendo un error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(409, { error: "CREDIT_NOTE_TOTAL_EXCEEDED" })));
    await expect(gatewayReal().emitNotaCredito(solicitudNc)).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
  });
});

describe("FS-11: documento anulado", () => {
  it("no consulta SIFEN con refresh y conserva ANULADA", async () => {
    const actualizaciones: Array<Record<string, unknown>> = [];
    const repo = {
      findById: async () => ({ id: "d", estado: "ANULADA", document_uuid: "u", cdc: "c", fiscal_status: null }),
      updateFiscalStatus: async (input: Record<string, unknown>) => {
        actualizaciones.push(input);
        return { id: "d", estado: input.estado };
      }
    } as never;
    const refresh = vi.fn();
    const gateway = { refreshFacturaStatus: refresh, getDocumentoCanonico: async () => ({ status: "APPROVED", estado: "EMITIDA", current_cdc: "c", raw: {} }) } as unknown as FiscalGateway;
    await refreshFiscalStatusForDocumento("f", "d", repo, gateway);
    expect(refresh).not.toHaveBeenCalled();
    expect(actualizaciones[0]).toMatchObject({ estado: "ANULADA" });
  });
});

describe("FS-20 y FS-21: motivo de rechazo y 0422", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("lee las formas reales de FE: lote y sincronico", () => {
    expect(extraerMotivoRechazo({ "ns2:dEstRes": "Rechazado", "ns2:gResProc": { "ns2:dCodRes": "1306", "ns2:dMsgRes": "TEST" } })).toEqual({ code: "1306", message: "TEST" });
    expect(extraerMotivoRechazo({ "ns2:rRetEnviDe": { "ns2:rProtDe": { "ns2:gResProc": { "ns2:dCodRes": "1306", "ns2:dMsgRes": "TEST" } } } })).toEqual({ code: "1306", message: "TEST" });
  });

  it("una consulta no trae motivo", () => {
    expect(extraerMotivoRechazo({ "ns2:rEnviConsDeResponse": { "ns2:dCodRes": "0420", "ns2:dMsgRes": "No existe" } })).toBeNull();
    expect(extraerMotivoRechazo(null)).toBeNull();
  });

  function repositorio(sifen_result_code: string | null = "1306") {
    const guardados: Array<Record<string, unknown>> = [];
    return {
      guardados,
      repo: {
        findById: async () => ({ id: "d", estado: "PENDIENTE_SIFEN", document_uuid: "u", cdc: "c", fiscal_status: null, sifen_result_code }),
        updateFiscalStatus: async (input: Record<string, unknown>) => {
          guardados.push(input);
          return { id: "d", estado: input.estado };
        }
      } as never
    };
  }
  const gatewayRechazo = (getMotivoRechazo: () => Promise<unknown>) =>
    ({
      refreshFacturaStatus: async () => ({ result_code: "0420", result_message: "No existe", raw: {} }),
      getDocumentoCanonico: async () => ({ status: "REJECTED", estado: "RECHAZADA", current_cdc: "c", raw: {} }),
      getMotivoRechazo
    }) as unknown as FiscalGateway;

  it("guarda el motivo real y no el 0420", async () => {
    const { repo, guardados } = repositorio();
    await refreshFiscalStatusForDocumento("f", "d", repo, gatewayRechazo(async () => ({ code: "1306", message: "TEST" })));
    expect(guardados[0]).toMatchObject({ estado: "RECHAZADA", sifenResultCode: "1306", sifenResultMessage: "TEST" });
  });

  it("sin motivo, no pisa lo guardado con 0420", async () => {
    const { repo, guardados } = repositorio();
    await refreshFiscalStatusForDocumento("f", "d", repo, gatewayRechazo(async () => { throw new Error("caido"); }));
    expect(guardados[0]).toMatchObject({ estado: "RECHAZADA", sifenResultCode: null, sifenResultMessage: null });
  });

  it("sin motivo ni nada guardado, informa 0420", async () => {
    const { repo, guardados } = repositorio(null);
    await refreshFiscalStatusForDocumento("f", "d", repo, gatewayRechazo(async () => null));
    expect(guardados[0]).toMatchObject({ estado: "RECHAZADA", sifenResultCode: "0420" });
  });

  it("0422 con status CANCELLED no se da por aprobado", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(200, { document_id: "1", document_uuid: "u", cdc: "c", status: "CANCELLED", result_code: "0422" })));
    expect((await gatewayReal().emitFactura(solicitud)).estado).toBe("PENDIENTE_SIFEN");
  });

  it("0422 sin status sigue aprobado, como antes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(200, { document_id: "1", document_uuid: "u", cdc: "c", result_code: "0422" })));
    expect((await gatewayReal().emitFactura(solicitud)).estado).toBe("EMITIDA");
  });
});

