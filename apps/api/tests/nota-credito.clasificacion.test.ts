import { describe, expect, it } from "vitest";
import { FiscalGatewayError, type FiscalEmitNotaCreditoResponse } from "../src/modules/fiscal-gateway/fiscal-gateway.types";
import { clasificarRespuestaNotaCredito } from "../src/modules/facturas/nota-credito.clasificacion";
import { esNotaTrabada } from "../src/modules/facturas/facturas.accion";
import { normalizarCorreoNotaCredito } from "../src/modules/facturas/facturas.service";

/** PLAN_NOTA_CREDITO_TRABADA_v0.1, seccion 3: una prueba por fila de la tabla. */
const respuesta = (status: string, estado: FiscalEmitNotaCreditoResponse["estado"]): FiscalEmitNotaCreditoResponse => ({
  fiscal_document_id: "1",
  document_uuid: "u",
  cdc: "C",
  numero_fiscal: "0000001",
  estado,
  status_raw: status,
  result_code: null,
  result_message: null,
  email_status: "UNKNOWN",
  raw: { status }
});
const error = (code: "UPSTREAM_ERROR" | "TIMEOUT", status: number | null, body: Record<string, unknown> = {}) =>
  new FiscalGatewayError(code, "x", status === null ? undefined : { status, body });

describe("clasificarRespuestaNotaCredito", () => {
  it.each([
    ["APPROVED", "EMITIDA"],
    ["APPROVED_WITH_OBS", "EMITIDA"]
  ] as const)("%s queda %s", (status, estado) => {
    expect(clasificarRespuestaNotaCredito(respuesta(status, "EMITIDA"))).toMatchObject({ estado, trabada: false, fiscalError: null });
  });

  it("REJECTED queda RECHAZADA", () => {
    expect(clasificarRespuestaNotaCredito(respuesta("REJECTED", "RECHAZADA"))).toMatchObject({ estado: "RECHAZADA", trabada: false });
  });

  it.each(["DRAFT", "TRANSMISSION_FAILED"])("409 idempotent con %s queda trabada, con identidad y code", (status) => {
    const r = clasificarRespuestaNotaCredito(respuesta(status, "PENDIENTE_SIFEN"));
    expect(r).toMatchObject({ estado: "PENDIENTE_SIFEN", trabada: true });
    expect(r.fiscalResponse?.raw).toMatchObject({ code: status, suggested_action: "RETRY" });
    expect(r.fiscalResponse?.document_uuid).toBe("u");
  });

  it("otro estado en transito queda pendiente sin marca", () => {
    expect(clasificarRespuestaNotaCredito(respuesta("QUEUED_BATCH", "PENDIENTE_SIFEN"))).toMatchObject({ trabada: false });
  });

  it.each([
    ["502", error("UPSTREAM_ERROR", 502, { error: "TRANSMISSION_FAILED" }), "TRANSMISSION_FAILED"],
    ["TIMEOUT", error("TIMEOUT", null), "TRANSMISSION_FAILED"],
    ["504", error("UPSTREAM_ERROR", 504), "TRANSMISSION_FAILED"],
    ["500", error("UPSTREAM_ERROR", 500, { error: "ISSUE_NCE_FAILED" }), "ISSUE_NCE_FAILED"]
  ] as const)("%s se persiste trabada con code %s", (_n, e, code) => {
    const r = clasificarRespuestaNotaCredito(e);
    expect(r).toMatchObject({ estado: "PENDIENTE_SIFEN", trabada: true, fiscalResponse: null });
    expect(r.fiscalError).toMatchObject({ code, recoverable: true, suggested_action: "RETRY" });
  });

  it("conserva la identidad si FE la manda en el cuerpo del error", () => {
    const r = clasificarRespuestaNotaCredito(error("UPSTREAM_ERROR", 502, { document_uuid: "abc", nro_documento: "0000007" }));
    expect(r.fiscalError).toMatchObject({ document_uuid: "abc", nro_documento: "0000007" });
  });

  it("CREDIT_NOTE_TOTAL_EXCEEDED responde 409 de soporte", () => {
    expect(() => clasificarRespuestaNotaCredito(error("UPSTREAM_ERROR", 409, { error: "CREDIT_NOTE_TOTAL_EXCEEDED" }))).toThrow(
      expect.objectContaining({ statusCode: 409, code: "CONFLICT" })
    );
  });

  it.each([400, 401, 404, 409, 422, 429])("%s no persiste y responde 502 como antes", (status) => {
    expect(() => clasificarRespuestaNotaCredito(error("UPSTREAM_ERROR", status, { error: "OTRO" }))).toThrow(
      expect.objectContaining({ statusCode: 502 })
    );
  });
});

describe("esNotaTrabada", () => {
  it.each(["TRANSMISSION_FAILED", "DRAFT", "ISSUE_NCE_FAILED", "TIMEOUT"])("%s es trabada", (code) => {
    expect(esNotaTrabada({ tipo: "NOTA_CREDITO", estado: "PENDIENTE_SIFEN", fiscal_status: { code } })).toBe(true);
  });
  it("una factura con el mismo code no es nota trabada", () => {
    expect(esNotaTrabada({ tipo: "FACTURA", estado: "PENDIENTE_SIFEN", fiscal_status: { code: "TIMEOUT" } })).toBe(false);
  });
  it("una nota emitida no es trabada", () => {
    expect(esNotaTrabada({ tipo: "NOTA_CREDITO", estado: "EMITIDA", fiscal_status: { code: "TIMEOUT" } })).toBe(false);
  });
});

describe("correo de la nota de credito (CEV-3)", () => {
  const conCorreo = { cliente: { email: "a@b.py" } } as never;
  const sinCorreo = { cliente: { email: null } } as never;
  const base = (email_status: FiscalEmitNotaCreditoResponse["email_status"]) =>
    clasificarRespuestaNotaCredito({ ...respuesta("QUEUED_BATCH", "PENDIENTE_SIFEN"), email_status });
  it("FE informa PENDING: se conserva", () => {
    expect(normalizarCorreoNotaCredito(base("PENDING"), conCorreo).fiscalResponse?.email_status).toBe("PENDING");
  });
  it("FE no informa y el comprador tiene correo: PENDING, nunca UNKNOWN", () => {
    expect(normalizarCorreoNotaCredito(base("UNKNOWN"), conCorreo).fiscalResponse?.email_status).toBe("PENDING");
  });
  it("FE no informa y el comprador no tiene correo: NOT_APPLICABLE", () => {
    expect(normalizarCorreoNotaCredito(base("UNKNOWN"), sinCorreo).fiscalResponse?.email_status).toBe("NOT_APPLICABLE");
  });
  it("una nota trabada sin respuesta no cambia", () => {
    const trabada = clasificarRespuestaNotaCredito(error("UPSTREAM_ERROR", 502));
    expect(normalizarCorreoNotaCredito(trabada, conCorreo)).toBe(trabada);
  });
});
