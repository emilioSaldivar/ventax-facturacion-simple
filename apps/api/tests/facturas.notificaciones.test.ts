import { describe, expect, it, vi, beforeEach } from "vitest";

const sendEmailMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../src/shared/email/email.service", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args)
}));

import { notifyAccionRequerida } from "../src/modules/facturas/facturas.notificaciones";
import type { DocumentoResponse, FacturaRepository } from "../src/modules/facturas/facturas.types";

function buildDocumento(overrides: Partial<DocumentoResponse> = {}): DocumentoResponse {
  return {
    id: "doc-1",
    document_uuid: "11111111-1111-4111-8111-111111111111",
    tipo: "FACTURA",
    estado: "RECHAZADA",
    condicion_venta: "CONTADO",
    numero_fiscal: "001-001-0000001",
    cdc: null,
    fiscal_document_id: null,
    external_ref: "ext-1",
    fiscal_envio_modo: "BATCH",
    batch: null,
    cliente: { documento_tipo: "RUC", documento: "80000000-1", razon_social: "Cliente Test" },
    items: [],
    totals: { subtotal: 0, total_sin_iva: 0, iva_5: 0, iva_10: 0, total_iva: 0, total: 0 },
    fiscal_status: null,
    fiscal_status_raw: null,
    sifen_result_code: null,
    sifen_result_message: null,
    sifen_last_checked_at: null,
    documento_relacionado_id: null,
    nce_motivo: null,
    delivery: {
      public_url: null,
      whatsapp_url: null,
      email_status: "NOT_APPLICABLE",
      artifacts: { kude_pdf: { available: false, url: null }, xml: { available: false, url: null } }
    },
    created_at: new Date().toISOString(),
    ...overrides
  };
}

function buildRepository(recipients: string[]): FacturaRepository {
  return {
    getNotificationRecipients: async () => recipients
  } as unknown as FacturaRepository;
}

beforeEach(() => {
  sendEmailMock.mockClear();
});

describe("notifyAccionRequerida", () => {
  it("envia el template REQUIERE_ACCION a todos los destinatarios resueltos", async () => {
    const repo = buildRepository(["ops@cliente.com", "ADMIN@cliente.com"]);
    await notifyAccionRequerida(
      "fact-1",
      buildDocumento(),
      { titulo: "Corregir receptor", descripcion: "El receptor no es valido.", soporte_payload: null },
      false,
      repo
    );

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const [, template] = sendEmailMock.mock.calls[0];
    expect(template.subject).toContain("requiere acción");
  });

  it("envia el template REQUIERE_SOPORTE con el bloque de datos cuando esSoporte=true", async () => {
    const repo = buildRepository(["ops@cliente.com"]);
    await notifyAccionRequerida(
      "fact-1",
      buildDocumento(),
      {
        titulo: "Necesita revisión",
        descripcion: "Causa desconocida.",
        soporte_payload: {
          documento_id: "doc-1",
          document_uuid: "11111111-1111-4111-8111-111111111111",
          cdc: null,
          numero_fiscal: "001-001-0000001",
          sifen_result_code: null,
          sifen_result_message: null,
          fiscal_status_raw: "REJECTED",
          created_at: new Date().toISOString()
        }
      },
      true,
      repo
    );

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const [, template] = sendEmailMock.mock.calls[0];
    expect(template.subject).toContain("soporte");
    expect(template.text).toContain("document_uuid");
  });

  it("no envia nada si no hay destinatarios (facturador sin usuarios con email ni admin ni Ventax configurado)", async () => {
    const repo = buildRepository([]);
    await notifyAccionRequerida(
      "fact-1",
      buildDocumento(),
      { titulo: "x", descripcion: "y", soporte_payload: null },
      false,
      repo
    );

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("deduplica destinatarios repetidos sin distinguir mayusculas/minusculas", async () => {
    const repo = buildRepository(["Ops@Cliente.com", "ops@cliente.com"]);
    await notifyAccionRequerida(
      "fact-1",
      buildDocumento(),
      { titulo: "x", descripcion: "y", soporte_payload: null },
      false,
      repo
    );

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });
});
