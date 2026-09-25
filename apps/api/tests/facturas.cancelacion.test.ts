// SPEC_PARIDAD_CONTRATO_FE_v0.1 — interpretacion del resultado de la cancelacion.
//
// El invariante del modulo (RN-04) es que NINGUN camino distinto de ACCEPTED modifica el estado
// comercial. Es lo que evita revertir un cobro contra una factura que sigue viva en SIFEN.

import { describe, expect, it } from "vitest";
import { FiscalGatewayError } from "../src/modules/fiscal-gateway/fiscal-gateway.types";
import type {
  FiscalCancelFacturaResponse,
  FiscalCancelStatus,
  FiscalDocumentoEventosResponse
} from "../src/modules/fiscal-gateway/fiscal-gateway.types";

// El mapeo vive en el cliente; se reexpone para testearlo sin HTTP.
import { __testing as gw } from "../src/modules/fiscal-gateway/fiscal-gateway.client";
import { __testingCancelacion } from "../src/modules/facturas/facturas.service";
const __testing = { ...gw, codigoErrorEvento: __testingCancelacion.codigoErrorEvento };

describe("mapeo del status de cancelacion (PF-002)", () => {
  const casos: Array<[string | null, FiscalCancelStatus]> = [
    ["PENDING", "PENDING"],
    ["ACCEPTED", "ACCEPTED"],
    ["REJECTED", "REJECTED"],
    ["FAILED", "FAILED"]
  ];

  it.each(casos)("mapea %s del contrato tal cual", (entrada, esperado) => {
    expect(__testing.mapCancelStatus(entrada)).toBe(esperado);
  });

  it.each([["SENT"], ["DONE"], ["ACEPTADO"], ["ANULADO"], [null], [""]])(
    "un valor fuera del contrato (%s) es UNKNOWN, no PENDING",
    (entrada) => {
      // Esta es la correccion de fondo: antes todo lo desconocido caia en PENDIENTE_SIFEN,
      // y por eso ACCEPTED y REJECTED se veian identicos.
      expect(__testing.mapCancelStatus(entrada as string | null)).toBe("UNKNOWN");
    }
  );
});

describe("mapeo del rechazo (PF-003)", () => {
  it("mapea code, message y retryable", () => {
    expect(__testing.mapCancelRejection({ code: "0100", message: "Error Inesperado", retryable: true })).toEqual({
      code: "0100",
      message: "Error Inesperado",
      retryable: true
    });
  });

  it("retryable ausente se asume false: el lado seguro (RN-03)", () => {
    expect(__testing.mapCancelRejection({ code: "9999" })?.retryable).toBe(false);
  });

  it("retryable que no es booleano tambien es false", () => {
    expect(__testing.mapCancelRejection({ code: "1", retryable: "true" })?.retryable).toBe(false);
  });

  it("sin rechazo devuelve null", () => {
    expect(__testing.mapCancelRejection(undefined)).toBeNull();
    expect(__testing.mapCancelRejection(null)).toBeNull();
  });
});

describe("respuesta completa de cancelacion", () => {
  it("una cancelacion aceptada no trae rechazo", () => {
    const r = __testing.mapFiscalCancelResponse({ event_id: "2", status: "ACCEPTED" });
    expect(r.status).toBe("ACCEPTED");
    expect(r.rejection).toBeNull();
  });

  it("una rechazada expone el motivo y si admite reintento", () => {
    const r: FiscalCancelFacturaResponse = __testing.mapFiscalCancelResponse({
      event_id: "3",
      status: "REJECTED",
      rejection: { code: "0100", message: "Error Inesperado", retryable: true }
    });
    expect(r.status).toBe("REJECTED");
    expect(r.rejection).toEqual({ code: "0100", message: "Error Inesperado", retryable: true });
  });

  it("4009 (plazo extemporaneo) es terminal", () => {
    const r = __testing.mapFiscalCancelResponse({
      status: "REJECTED",
      rejection: { code: "4009", message: "Plazo extemporaneo", retryable: false }
    });
    expect(r.rejection?.retryable).toBe(false);
  });
});

describe("eventos del documento (PF-009)", () => {
  it("una factura esta anulada solo con CANCEL + ACCEPTED (RN-01)", () => {
    const eventos: FiscalDocumentoEventosResponse = __testing.mapFiscalDocumentoEventosResponse({
      events: [
        { event_id: "1", type: "CANCEL", status: "REJECTED" },
        { event_id: "2", type: "CANCEL", status: "ACCEPTED" }
      ]
    });

    // Mirar solo el type es incorrecto: el primer evento es un CANCEL rechazado.
    expect(eventos.events.filter((e) => e.type === "CANCEL")).toHaveLength(2);
    expect(eventos.events.filter((e) => e.type === "CANCEL" && e.status === "ACCEPTED")).toHaveLength(1);
  });
});

describe("errores de evento (PF-007)", () => {
  const codigos = ["EVENT_ALREADY_EXISTS", "EVENT_IN_PROGRESS", "CANCEL_WINDOW_EXPIRED", "INVALID_DOCUMENT_STATUS"];

  it.each(codigos)("%s se reconoce como error de evento, no como falla del sistema", (codigo) => {
    const error = new FiscalGatewayError("UPSTREAM_ERROR", "x", { status: 409, body: { error: codigo } });
    expect(__testing.codigoErrorEvento(error)).toBe(codigo);
  });

  it("un error ajeno no se confunde con uno de evento", () => {
    const error = new FiscalGatewayError("UPSTREAM_ERROR", "x", { status: 500, body: { error: "BOOM" } });
    expect(__testing.codigoErrorEvento(error)).toBeNull();
  });
});

// ─── PF-013: el invariante del modulo ─────────────────────────────────────────
//
// RN-04: ningun camino distinto de ACCEPTED modifica el estado comercial. Si este bloque
// falla, el sistema puede estar anulando una factura que sigue viva en SIFEN.

import { cancelDocumento } from "../src/modules/facturas/facturas.service";

describe("RN-04 — solo ACCEPTED anula (invariante)", () => {
  const CDC = "A".repeat(44);

  function armar(status: FiscalCancelStatus, rejection: { code: string; message: string; retryable: boolean } | null = null) {
    const documento = {
      id: "doc-1",
      document_uuid: "uuid-1",
      tipo: "FACTURA",
      estado: "EMITIDA",
      cdc: CDC,
      cancelacion: null,
      items: [],
      totals: {},
      cliente: {},
      delivery: {}
    } as unknown as Parameters<typeof cancelDocumento>[0] extends never ? never : any;

    const repo = {
      lastInput: null as any,
      async findById() {
        return documento;
      },
      async cancelDocumento(input: any) {
        this.lastInput = input;
        return { ...documento, estado: input.anula ? "ANULADA" : documento.estado };
      }
    };

    const gateway = {
      async cancelFactura() {
        return { event_id: "e1", status, rejection, raw: { status } };
      },
      async getDocumentoEventos() {
        return { events: [], raw: {} };
      }
    };

    return { repo, gateway };
  }

  const context = {
    user: { id: "u1", role: "OPERADOR_FACTURACION" },
    facturador: { id: "f1", emisor_id: "80136968-1" }
  } as unknown as Parameters<typeof cancelDocumento>[0];

  it.each<[FiscalCancelStatus, boolean]>([
    ["ACCEPTED", true],
    ["REJECTED", false],
    ["FAILED", false],
    ["PENDING", false],
    ["UNKNOWN", false]
  ])("con status %s, anula=%s", async (status, esperado) => {
    const { repo, gateway } = armar(status, status === "REJECTED" ? { code: "0100", message: "x", retryable: true } : null);

    const res = await cancelDocumento(context, "doc-1", { motivo: "prueba" }, repo as never, gateway as never);

    expect(repo.lastInput.anula).toBe(esperado);
    expect(res.estado).toBe(esperado ? "ANULADA" : "EMITIDA");
  });

  it("persiste el resultado del intento aunque no anule", async () => {
    const { repo, gateway } = armar("REJECTED", { code: "0100", message: "Error Inesperado", retryable: true });

    await cancelDocumento(context, "doc-1", { motivo: "prueba" }, repo as never, gateway as never);

    expect(repo.lastInput.cancelacion).toEqual({
      status: "REJECTED",
      rejectionCode: "0100",
      rejectionMessage: "Error Inesperado",
      retryable: true
    });
  });
});

describe("event_id tolerante al tipo (defecto detectado en el smoke)", () => {
  it("acepta el bigint de FE como numero o como string", () => {
    expect(__testing.idOrNull(2)).toBe("2");
    expect(__testing.idOrNull("2")).toBe("2");
    expect(__testing.idOrNull(null)).toBeNull();
    expect(__testing.idOrNull("")).toBeNull();
  });

  it("no pierde el event_id de una cancelacion", () => {
    expect(__testing.mapFiscalCancelResponse({ event_id: 7, status: "ACCEPTED" }).event_id).toBe("7");
  });
});
