import { describe, expect, it } from "vitest";
import { deriveAccion } from "../src/modules/facturas/facturas.accion";
import { resolveCausaSifen } from "../src/modules/facturas/sifen-causa-catalogo";
import type { DocumentoResponse, DocumentoEstado } from "../src/modules/facturas/facturas.types";

function buildDocumento(overrides: Partial<DocumentoResponse> = {}): DocumentoResponse {
  return {
    id: "doc-1",
    document_uuid: "11111111-1111-4111-8111-111111111111",
    tipo: "FACTURA",
    estado: "EMITIENDO",
    condicion_venta: "CONTADO",
    numero_fiscal: null,
    cdc: null,
    fiscal_document_id: null,
    external_ref: "ext-1",
    fiscal_envio_modo: "BATCH",
    delivery_mode: null,
    fiscal_idempotent: null,
    batch: null,
    cliente: {
      documento_tipo: "RUC",
      documento: "80000000-1",
      razon_social: "Cliente Test"
    },
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

describe("sifen-causa-catalogo", () => {
  it("resuelve el codigo 1306 como categoria USUARIO con accion CORREGIR_REEMITIR", () => {
    const causa = resolveCausaSifen("1306", null);
    expect(causa.categoria).toBe("USUARIO");
    expect(causa.acciones).toContain("CORREGIR_REEMITIR");
  });

  it("cae a SOPORTE por default cuando no hay codigo ni mensaje reconocido (RN-V4)", () => {
    const causa = resolveCausaSifen(null, null);
    expect(causa.categoria).toBe("SOPORTE");
  });

  it("cae a SOPORTE ante un codigo desconocido no listado en el catalogo", () => {
    const causa = resolveCausaSifen("9999", "mensaje sin patron conocido");
    expect(causa.categoria).toBe("SOPORTE");
  });
});

describe("deriveAccion", () => {
  it("EMITIDA -> OK", () => {
    const { accion } = deriveAccion(buildDocumento({ estado: "EMITIDA" }));
    expect(accion).toBe("OK");
  });

  it("ANULADA -> OK (terminal intencional)", () => {
    const { accion } = deriveAccion(buildDocumento({ estado: "ANULADA" }));
    expect(accion).toBe("OK");
  });

  it("CANCELADO_LOCAL -> OK (terminal intencional)", () => {
    const { accion } = deriveAccion(buildDocumento({ estado: "CANCELADO_LOCAL" }));
    expect(accion).toBe("OK");
  });

  it("PENDIENTE_SIFEN reciente -> EN_PROCESO", () => {
    const { accion, accion_detalle } = deriveAccion(
      buildDocumento({ estado: "PENDIENTE_SIFEN", created_at: new Date().toISOString() })
    );
    expect(accion).toBe("EN_PROCESO");
    expect(accion_detalle.acciones_sugeridas).toHaveLength(0);
  });

  it("PENDIENTE_SIFEN vencido (> 30 dias) -> REQUIERE_SOPORTE con soporte_payload", () => {
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const { accion, accion_detalle } = deriveAccion(buildDocumento({ estado: "PENDIENTE_SIFEN", created_at: oldDate }));
    expect(accion).toBe("REQUIERE_SOPORTE");
    expect(accion_detalle.soporte_payload).not.toBeNull();
    expect(accion_detalle.soporte_payload?.documento_id).toBe("doc-1");
  });

  it("EMITIENDO colgado (> 30 dias) -> REQUIERE_SOPORTE", () => {
    const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const { accion } = deriveAccion(buildDocumento({ estado: "EMITIENDO", created_at: oldDate }));
    expect(accion).toBe("REQUIERE_SOPORTE");
  });

  it("ERROR_OPERATIVO -> REQUIERE_ACCION con CORREGIR_REEMITIR", () => {
    const { accion, accion_detalle } = deriveAccion(buildDocumento({ estado: "ERROR_OPERATIVO" }));
    expect(accion).toBe("REQUIERE_ACCION");
    expect(accion_detalle.acciones_sugeridas).toEqual(["CORREGIR_REEMITIR"]);
  });

  it("ERROR_TEMPORAL reciente -> EN_PROCESO (outbox sigue reintentando)", () => {
    const { accion } = deriveAccion(buildDocumento({ estado: "ERROR_TEMPORAL", created_at: new Date().toISOString() }));
    expect(accion).toBe("EN_PROCESO");
  });

  it("ERROR_TEMPORAL persistente (> 24h) -> REQUIERE_SOPORTE", () => {
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const { accion } = deriveAccion(buildDocumento({ estado: "ERROR_TEMPORAL", created_at: oldDate }));
    expect(accion).toBe("REQUIERE_SOPORTE");
  });

  it("RECHAZADA con causa USUARIO conocida (1306) -> REQUIERE_ACCION", () => {
    const { accion, accion_detalle } = deriveAccion(
      buildDocumento({ estado: "RECHAZADA", sifen_result_code: "1306" })
    );
    expect(accion).toBe("REQUIERE_ACCION");
    expect(accion_detalle.acciones_sugeridas).toContain("CORREGIR_REEMITIR");
  });

  it("RECHAZADA sin codigo reconocido -> REQUIERE_SOPORTE con soporte_payload completo", () => {
    const { accion, accion_detalle } = deriveAccion(
      buildDocumento({
        estado: "RECHAZADA",
        sifen_result_code: null,
        sifen_result_message: null,
        cdc: "01234",
        numero_fiscal: "001-001-0000001"
      })
    );
    expect(accion).toBe("REQUIERE_SOPORTE");
    expect(accion_detalle.acciones_sugeridas).toEqual(["CONTACTAR_SOPORTE"]);
    expect(accion_detalle.soporte_payload).toMatchObject({ cdc: "01234", numero_fiscal: "001-001-0000001" });
  });

  it("nunca devuelve un valor de accion fuera de los 4 permitidos (RN-V4)", () => {
    const estados: DocumentoEstado[] = [
      "EMITIENDO",
      "EMITIDA",
      "PENDIENTE_SIFEN",
      "RECHAZADA",
      "ERROR_OPERATIVO",
      "ERROR_TEMPORAL",
      "ANULADA",
      "CANCELADO_LOCAL"
    ];
    const permitidos = new Set(["OK", "EN_PROCESO", "REQUIERE_ACCION", "REQUIERE_SOPORTE"]);
    for (const estado of estados) {
      const { accion } = deriveAccion(buildDocumento({ estado }));
      expect(permitidos.has(accion)).toBe(true);
    }
  });
});
