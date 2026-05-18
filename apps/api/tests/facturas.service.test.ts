import { describe, expect, it } from "vitest";
import { FiscalGatewayError, type FiscalGateway, type FiscalGatewayHealth, type FiscalEmitFacturaRequest, type FiscalEmitFacturaResponse } from "../src/modules/fiscal-gateway/fiscal-gateway.types";
import { emitFacturaAgainstFiscalGateway, previewFactura } from "../src/modules/facturas/facturas.service";
import type { OperationalContextResponse } from "../src/modules/context/context.types";
import type { FacturaPersistInput, FacturaRepository, DocumentoResponse } from "../src/modules/facturas/facturas.types";

const context: OperationalContextResponse = {
  user: {
    id: "11111111-1111-4111-8111-111111111111",
    username: "operador",
    display_name: "Operador",
    role: "OPERADOR_FACTURACION"
  },
  tenant: {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Tenant Demo",
    status: "ACTIVE"
  },
  facturador: {
    id: "33333333-3333-4333-8333-333333333333",
    emisor_id: "80136968-1",
    razon_social: "Facturador Demo",
    ruc: "80136968-1"
  },
  fiscal_context: {
    establecimiento: "001",
    punto_expedicion: "001",
    perfil_emision_codigo: "SERV",
    actividad_economica_codigo: "82110",
    actividad_economica_descripcion: "Servicios administrativos"
  }
};

class FakeFacturaRepository implements FacturaRepository {
  public lastInput: FacturaPersistInput | null = null;
  public existing: DocumentoResponse | null = null;

  async findByIdempotencyKey(): Promise<DocumentoResponse | null> {
    return this.existing;
  }

  async createFromEmission(input: FacturaPersistInput): Promise<DocumentoResponse> {
    this.lastInput = input;
    return {
      id: "55555555-5555-4555-8555-555555555555",
      tipo: "FACTURA",
      estado: input.estado,
      condicion_venta: input.input.condicion_venta,
      numero_fiscal: input.fiscalResponse?.numero_fiscal ?? null,
      cdc: input.fiscalResponse?.cdc ?? null,
      fiscal_document_id: input.fiscalResponse?.fiscal_document_id ?? null,
      external_ref: input.externalRef,
      cliente: input.input.cliente,
      items: input.preview.items,
      totals: input.preview.totals,
      fiscal_status: input.fiscalResponse?.raw ?? input.fiscalError,
      delivery: {
        public_url: null,
        whatsapp_url: null,
        email_status: input.fiscalResponse?.email_status ?? "UNKNOWN",
        artifacts: {
          kude_pdf: { available: Boolean(input.fiscalResponse?.cdc), url: null },
          xml: { available: Boolean(input.fiscalResponse?.cdc), url: null }
        }
      },
      created_at: "2026-05-18T00:00:00.000Z"
    };
  }
}

class FakeFiscalGateway implements FiscalGateway {
  public lastRequest: FiscalEmitFacturaRequest | null = null;

  constructor(private readonly response: FiscalEmitFacturaResponse | FiscalGatewayError) {}

  async health(): Promise<FiscalGatewayHealth> {
    return { ok: true, mode: "mock" };
  }

  async emitFactura(request: FiscalEmitFacturaRequest): Promise<FiscalEmitFacturaResponse> {
    this.lastRequest = request;
    if (this.response instanceof FiscalGatewayError) {
      throw this.response;
    }
    return this.response;
  }
}

const emitInput = {
  condicion_venta: "CONTADO" as const,
  cliente: {
    documento_tipo: "RUC" as const,
    documento: "80136968-1",
    razon_social: "Cliente Demo",
    email: "cliente@example.com"
  },
  items: [
    {
      descripcion: "Servicio",
      cantidad: 1,
      precio_unitario: 11000,
      iva_tipo: "IVA_10" as const
    }
  ]
};

describe("facturas service", () => {
  it("calculates preview totals without persistence", () => {
    const result = previewFactura(context, {
      condicion_venta: "CONTADO",
      cliente: {
        documento_tipo: "RUC",
        documento: "80136968-1",
        razon_social: "Cliente Demo"
      },
      items: [
        {
          catalogo_item_id: "44444444-4444-4444-8444-444444444444",
          codigo: "SERV-001",
          descripcion: "Servicio 10",
          cantidad: 2,
          precio_unitario: 110000,
          iva_tipo: "IVA_10"
        },
        {
          descripcion: "Producto 5",
          cantidad: 1,
          precio_unitario: 10500,
          iva_tipo: "IVA_5"
        },
        {
          descripcion: "Exento",
          cantidad: 1,
          precio_unitario: 5000,
          iva_tipo: "EXENTA"
        }
      ]
    });

    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toMatchObject({
      line_no: 1,
      catalogo_item_id: "44444444-4444-4444-8444-444444444444",
      subtotal: 220000,
      base_imponible: 200000,
      iva_monto: 20000
    });
    expect(result.totals).toEqual({
      subtotal: 235500,
      total_sin_iva: 215000,
      iva_5: 500,
      iva_10: 20000,
      total_iva: 20500,
      total: 235500
    });
  });

  it("uses IVA_10 by default for quick invoice items", () => {
    const result = previewFactura(context, {
      condicion_venta: "CREDITO",
      cliente: {
        documento_tipo: "CI",
        documento: "1234567",
        razon_social: "Cliente"
      },
      items: [
        {
          descripcion: "Servicio rapido",
          cantidad: 1,
          precio_unitario: 11000
        }
      ]
    });

    expect(result.items[0]).toMatchObject({
      iva_tipo: "IVA_10",
      base_imponible: 10000,
      iva_monto: 1000
    });
  });

  it("rejects missing customer identity data", () => {
    expect(() =>
      previewFactura(context, {
        condicion_venta: "CONTADO",
        cliente: {
          documento_tipo: "RUC",
          documento: " ",
          razon_social: "Cliente"
        },
        items: [
          {
            descripcion: "Servicio",
            cantidad: 1,
            precio_unitario: 1000
          }
        ]
      })
    ).toThrow("Documento de cliente requerido");
  });

  it("emits against fiscal gateway and persists snapshot", async () => {
    const repo = new FakeFacturaRepository();
    const gateway = new FakeFiscalGateway({
      fiscal_document_id: "mock-fac",
      cdc: "A".repeat(44),
      numero_fiscal: "001-001-0000001",
      estado: "EMITIDA",
      email_status: "DELEGATED",
      raw: { mode: "mock" }
    });

    const result = await emitFacturaAgainstFiscalGateway(context, emitInput, repo, gateway, {
      idempotencyKey: "idem-1"
    });

    expect(result.estado).toBe("EMITIDA");
    expect(result.numero_fiscal).toBe("001-001-0000001");
    expect(repo.lastInput).toMatchObject({
      tenantId: context.tenant.id,
      facturadorId: context.facturador.id,
      userId: context.user.id,
      idempotencyKey: "idem-1",
      estado: "EMITIDA"
    });
    expect(repo.lastInput?.preview.totals.total).toBe(11000);
    expect(gateway.lastRequest).toMatchObject({
      condicion_venta: "CONTADO",
      cliente: emitInput.cliente,
      totals: { total: 11000 }
    });
  });

  it("persists timeout emissions as PENDIENTE_SIFEN", async () => {
    const repo = new FakeFacturaRepository();
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("TIMEOUT", "Timeout fiscal"));

    const result = await emitFacturaAgainstFiscalGateway(context, emitInput, repo, gateway);

    expect(result.estado).toBe("PENDIENTE_SIFEN");
    expect(repo.lastInput?.fiscalError).toMatchObject({
      code: "TIMEOUT",
      message: "Timeout fiscal"
    });
  });

  it("returns existing document for repeated idempotency key", async () => {
    const repo = new FakeFacturaRepository();
    repo.existing = {
      id: "66666666-6666-4666-8666-666666666666",
      tipo: "FACTURA",
      estado: "EMITIDA",
      condicion_venta: "CONTADO",
      numero_fiscal: "001-001-0000001",
      cdc: "A".repeat(44),
      fiscal_document_id: "doc-1",
      external_ref: "fac-existing",
      cliente: emitInput.cliente,
      items: [],
      totals: {
        subtotal: 0,
        total_sin_iva: 0,
        iva_5: 0,
        iva_10: 0,
        total_iva: 0,
        total: 0
      },
      fiscal_status: null,
      delivery: {
        public_url: null,
        whatsapp_url: null,
        email_status: "UNKNOWN",
        artifacts: {
          kude_pdf: { available: true, url: null },
          xml: { available: true, url: null }
        }
      },
      created_at: "2026-05-18T00:00:00.000Z"
    };
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "Should not emit"));

    const result = await emitFacturaAgainstFiscalGateway(context, emitInput, repo, gateway, {
      idempotencyKey: "idem-1"
    });

    expect(result.id).toBe("66666666-6666-4666-8666-666666666666");
    expect(repo.lastInput).toBeNull();
    expect(gateway.lastRequest).toBeNull();
  });
});
