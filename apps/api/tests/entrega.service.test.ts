import { describe, expect, it } from "vitest";
import type { OperationalContextResponse } from "../src/modules/context/context.types";
import { createOrGetDeliveryLink, generatePublicDeliveryToken } from "../src/modules/entrega/entrega.service";
import type { DeliveryLinkRecord, DeliveryLinkRepository } from "../src/modules/entrega/entrega.types";
import type { DocumentoResponse, FacturaPersistInput, FacturaRepository } from "../src/modules/facturas/facturas.types";

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
  public documento: DocumentoResponse | null = buildDocumento();

  async findById(): Promise<DocumentoResponse | null> {
    return this.documento;
  }

  async findByIdempotencyKey(): Promise<DocumentoResponse | null> {
    return null;
  }

  async list() {
    return { items: [], total: 0 };
  }

  async updateFiscalStatus(): Promise<DocumentoResponse | null> {
    return this.documento;
  }

  async createFromEmission(_input: FacturaPersistInput): Promise<DocumentoResponse> {
    return buildDocumento();
  }
}

class FakeDeliveryLinkRepository implements DeliveryLinkRepository {
  public active: DeliveryLinkRecord | null = null;
  public lastCreateInput: Parameters<DeliveryLinkRepository["create"]>[0] | null = null;

  async findActiveByDocumento(): Promise<DeliveryLinkRecord | null> {
    return this.active;
  }

  async create(input: Parameters<DeliveryLinkRepository["create"]>[0]): Promise<DeliveryLinkRecord> {
    this.lastCreateInput = input;
    return {
      id: "77777777-7777-4777-8777-777777777777",
      token: input.token,
      revoked_at: null
    };
  }
}

describe("entrega service", () => {
  it("generates opaque base64url delivery tokens from 32 random bytes", () => {
    const token = generatePublicDeliveryToken();

    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("returns existing active public link without regenerating token", async () => {
    const facturas = new FakeFacturaRepository();
    const deliveryLinks = new FakeDeliveryLinkRepository();
    deliveryLinks.active = {
      id: "77777777-7777-4777-8777-777777777777",
      token: "A".repeat(43),
      revoked_at: null
    };

    const result = await createOrGetDeliveryLink(context, "66666666-6666-4666-8666-666666666666", {}, { facturas, deliveryLinks });

    expect(result).toEqual({
      public_url: `https://factura.ventax.app/public/d/${"A".repeat(43)}`,
      whatsapp_url: `https://wa.me/?text=${encodeURIComponent(`https://factura.ventax.app/public/d/${"A".repeat(43)}`)}`,
      token_status: "ACTIVE"
    });
    expect(deliveryLinks.lastCreateInput).toBeNull();
  });

  it("creates a new active public link scoped to tenant, facturador and user", async () => {
    const facturas = new FakeFacturaRepository();
    const deliveryLinks = new FakeDeliveryLinkRepository();

    const result = await createOrGetDeliveryLink(
      context,
      "66666666-6666-4666-8666-666666666666",
      { regenerate: true },
      { facturas, deliveryLinks }
    );

    expect(result.token_status).toBe("ACTIVE");
    expect(deliveryLinks.lastCreateInput).toMatchObject({
      tenantId: context.tenant.id,
      facturadorId: context.facturador.id,
      documentoId: "66666666-6666-4666-8666-666666666666",
      userId: context.user.id,
      regenerate: true
    });
    expect(deliveryLinks.lastCreateInput?.token).toHaveLength(43);
  });
});

function buildDocumento(): DocumentoResponse {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    tipo: "FACTURA",
    estado: "EMITIDA",
    condicion_venta: "CONTADO",
    numero_fiscal: "001-001-0000001",
    cdc: "A".repeat(44),
    fiscal_document_id: "doc-1",
    external_ref: "fac-1",
    cliente: {
      documento_tipo: "RUC",
      documento: "80136968-1",
      razon_social: "Cliente Demo"
    },
    items: [],
    totals: {
      subtotal: 11000,
      total_sin_iva: 10000,
      iva_5: 0,
      iva_10: 1000,
      total_iva: 1000,
      total: 11000
    },
    fiscal_status: null,
    delivery: {
      public_url: null,
      whatsapp_url: null,
      email_status: "DELEGATED",
      artifacts: {
        kude_pdf: { available: true, url: null },
        xml: { available: true, url: null }
      }
    },
    created_at: "2026-05-18T00:00:00.000Z"
  };
}
