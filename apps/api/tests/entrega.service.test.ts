import { describe, expect, it } from "vitest";
import type { OperationalContextResponse } from "../src/modules/context/context.types";
import {
  createOrGetDeliveryLink,
  generatePublicDeliveryToken,
  getEmailStatus,
  getPublicArtifact,
  getPublicDocument,
  renderPublicDocumentHtml
} from "../src/modules/entrega/entrega.service";
import type { DeliveryLinkRecord, DeliveryLinkRepository, PublicDocumentRecord } from "../src/modules/entrega/entrega.types";
import type {
  DocumentoResponse,
  FacturaPersistInput,
  FacturaQueuedPersistInput,
  FacturaRepository,
  PendingFiscalEmission
} from "../src/modules/facturas/facturas.types";
import type { FiscalGateway } from "../src/modules/fiscal-gateway/fiscal-gateway.types";

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
    actividad_economica_descripcion: "Servicios administrativos",
    timbrado: "80136968",
    timbrado_inicio: "2025-12-30",
    documento_nro: "0000000",
    credito_plazo_dias: 30,
    tipo_transaccion_default: 2,
    fiscal_envio_modo: "BATCH",
    batch_enabled: true
  },
  actividad_punto_perfil_id: "55555555-5555-4555-8555-555555555555"
};

class FakeFacturaRepository implements FacturaRepository {
  public documento: DocumentoResponse | null = buildDocumento();

  async findById(): Promise<DocumentoResponse | null> {
    return this.documento;
  }

  async findByIdempotencyKey(): Promise<DocumentoResponse | null> {
    return null;
  }

  async findNotaCreditoByOriginal(): Promise<DocumentoResponse | null> {
    return null;
  }

  async list() {
    return { items: [], total: 0 };
  }

  async updateFiscalStatus(): Promise<DocumentoResponse | null> {
    return this.documento;
  }

  async bulkUpdateDocumentUuidByCdc(): Promise<void> {
    // no-op in tests
  }

  async createFromEmission(_input: FacturaPersistInput): Promise<DocumentoResponse> {
    return buildDocumento();
  }

  async registrarInutilizacion(): Promise<DocumentoResponse | null> {
    return null;
  }

  async createQueuedEmission(_input: FacturaQueuedPersistInput): Promise<DocumentoResponse> {
    return buildDocumento();
  }

  async claimNextPendingEmission(): Promise<PendingFiscalEmission | null> {
    return null;
  }

  async completePendingEmission(): Promise<DocumentoResponse | null> {
    return this.documento;
  }

  async failPendingEmission(): Promise<DocumentoResponse | null> {
    return this.documento;
  }

  async retryPendingEmission(): Promise<DocumentoResponse | null> {
    return this.documento;
  }

  // SPEC_NOTA_CREDITO_FACTURA_EXTERNA_v0.1: fuera del alcance de estas pruebas.
  async createFacturaExterna(): Promise<DocumentoResponse> {
    throw new Error("no implementado en el fake");
  }

  async findByCdc(): Promise<DocumentoResponse | null> {
    return null;
  }

  async findByReferenciaImpresa(): Promise<DocumentoResponse | null> {
    return null;
  }

  async softDeleteFacturaExterna(): Promise<boolean> {
    return false;
  }
}

class FakeDeliveryLinkRepository implements DeliveryLinkRepository {
  public active: DeliveryLinkRecord | null = null;
  public publicDocument: PublicDocumentRecord | null = buildPublicDocument();
  public lastCreateInput: Parameters<DeliveryLinkRepository["create"]>[0] | null = null;

  async findActiveByDocumento(): Promise<DeliveryLinkRecord | null> {
    return this.active;
  }

  async findPublicByToken(): Promise<PublicDocumentRecord | null> {
    return this.publicDocument;
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

class FakeFiscalGateway implements FiscalGateway {
  public lastXmlUuid: string | null = null;
  public lastPdfUuid: string | null = null;

  async health() {
    return { ok: true, mode: "mock" as const };
  }

  async emitFactura() {
    throw new Error("not needed");
  }

  async emitNotaCredito() {
    throw new Error("not needed");
  }

  async refreshFacturaStatus() {
    throw new Error("not needed");
  }

  async inutilizarNumeracion() {
    return { event_id: "fake-inut", status: "VOIDED", sifen: null };
  }

  async cancelFactura() {
    throw new Error("not needed");
  }

  async getDocumentoEventos() {
    throw new Error("not needed");
  }

  async resolveDocumentoByCdc() {
    throw new Error("not needed");
  }

  async getDocumentoDecisionByDocumentId() {
    throw new Error("not needed");
  }

  async getBatchPendientesByEmisor() {
    throw new Error("not needed");
  }

  async getFacturalistaByEmisor() {
    throw new Error("not needed");
  }

  async validateDocumentoCdcImpactByDocumentId() {
    throw new Error("not needed");
  }

  async retryDocumentoSameCdcByDocumentId() {
    throw new Error("not needed");
  }

  async createDocumentoDerivedByDocumentId() {
    throw new Error("not needed");
  }

  async cancelDocumentoSendByDocumentId() {
    throw new Error("not needed");
  }

  async voidDocumentoNumberByDocumentId() {
    throw new Error("not needed");
  }

  async getXml(documentUuid: string) {
    this.lastXmlUuid = documentUuid;
    return {
      body: Buffer.from("<xml/>"),
      content_type: "application/xml",
      filename: `${documentUuid}.xml`
    };
  }

  async getKudePdf(documentUuid: string) {
    this.lastPdfUuid = documentUuid;
    return {
      body: Buffer.from("pdf"),
      content_type: "application/pdf",
      filename: `${documentUuid}.pdf`
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
      public_url: `https://app.factura.segel.com.py/public/d/${"A".repeat(43)}`,
      whatsapp_url: `https://wa.me/?text=${encodeURIComponent(`https://app.factura.segel.com.py/public/d/${"A".repeat(43)}`)}`,
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

  it("returns public document data without internal ids", async () => {
    const deliveryLinks = new FakeDeliveryLinkRepository();

    const result = await getPublicDocument("A".repeat(43), deliveryLinks);

    expect(result).toMatchObject({
      facturador: context.facturador,
      numero_fiscal: "001-001-0000001",
      cdc: "A".repeat(44),
      estado: "EMITIDA",
      email_status: "DELEGATED",
      artifacts: {
        kude_pdf: {
          available: true,
          url: `https://app.factura.segel.com.py/public/d/${"A".repeat(43)}/kude.pdf`
        },
        xml: {
          available: true,
          url: `https://app.factura.segel.com.py/public/d/${"A".repeat(43)}/xml`
        }
      }
    });
    expect("id" in result).toBe(false);
  });

  it("renders public document html with artifacts and escaped customer data", async () => {
    const deliveryLinks = new FakeDeliveryLinkRepository();
    deliveryLinks.publicDocument = {
      ...buildPublicDocument(),
      documento: {
        ...buildPublicDocument().documento,
        cliente: {
          documento_tipo: "RUC",
          documento: "800<1>",
          razon_social: "Cliente <script>alert(1)</script>",
          email: "cliente@example.com"
        }
      }
    };

    const publicDocument = await getPublicDocument("A".repeat(43), deliveryLinks);
    const html = renderPublicDocumentHtml(publicDocument);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Ver factura PDF");
    expect(html).toContain("Descargar documento electronico");
    expect(html).toContain('/app/brand/segel-logo-fondo-claro.svg');
    expect(html).toContain(`/public/d/${"A".repeat(43)}/kude.pdf`);
    expect(html).toContain(`/public/d/${"A".repeat(43)}/xml`);
    expect(html).toContain("Cliente &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<span>V</span> VENTAX");
    expect(html).not.toContain("Cliente <script>");
  });

  it("SPEC_MONEDA_EXTRANJERA_v0.1, D-5: la pagina publica muestra el total en la moneda del documento", async () => {
    const deliveryLinks = new FakeDeliveryLinkRepository();
    const base = buildPublicDocument();
    deliveryLinks.publicDocument = {
      ...base,
      documento: {
        ...base.documento,
        moneda: "USD",
        tipo_cambio: 6329.77,
        totals: { ...base.documento.totals, total: 275.23, fuente: "FE", total_guaranies: 1742158 }
      }
    };
    const html = renderPublicDocumentHtml(await getPublicDocument("A".repeat(43), deliveryLinks));
    expect(html).toContain("USD 275,23");
    expect(html).toContain("Tipo de cambio 6.329,77");
    expect(html).toMatch(/Equivale a Gs\.?\s*1\.742\.158/);
    expect(html).not.toMatch(/Gs\.?\s*275(?![\d.,])/);

    // En guaranies, como siempre y sin detalle de moneda.
    deliveryLinks.publicDocument = { ...base, documento: { ...base.documento, moneda: "PYG", tipo_cambio: null } };
    const pyg = renderPublicDocumentHtml(await getPublicDocument("A".repeat(43), deliveryLinks));
    expect(pyg).not.toContain("Tipo de cambio");
  });

  it("fetches public artifacts by CDC through fiscal gateway", async () => {
    const deliveryLinks = new FakeDeliveryLinkRepository();
    const gateway = new FakeFiscalGateway();

    const result = await getPublicArtifact("A".repeat(43), "xml", deliveryLinks, new FakeFacturaRepository(), gateway);

    expect(gateway.lastXmlUuid).toBe("aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa");
    expect(result.content_type).toBe("application/xml");
  });

  it("FS-31: un documento rechazado no ofrece ni entrega KuDE ni XML por el enlace publico", async () => {
    const deliveryLinks = new FakeDeliveryLinkRepository();
    deliveryLinks.publicDocument = {
      ...buildPublicDocument(),
      documento: {
        ...buildPublicDocument().documento,
        estado: "RECHAZADA"
      }
    };
    const gateway = new FakeFiscalGateway();

    const publicDocument = await getPublicDocument("A".repeat(43), deliveryLinks);
    expect(publicDocument.estado).toBe("RECHAZADA");
    expect(publicDocument.artifacts.kude_pdf.available).toBe(false);
    expect(publicDocument.artifacts.xml.available).toBe(false);
    await expect(getPublicArtifact("A".repeat(43), "kude_pdf", deliveryLinks, new FakeFacturaRepository(), gateway)).rejects.toMatchObject({ statusCode: 404 });
    expect(gateway.lastPdfUuid ?? null).toBeNull();
  });

  it.each(["RECHAZADA", "ERROR_OPERATIVO", "ERROR_TEMPORAL", "CANCELADO_LOCAL"] as const)("FS-31: no crea enlace publico para un documento %s", async (estado) => {
    const facturas = new FakeFacturaRepository();
    facturas.documento = { ...buildDocumento(), estado };
    const deliveryLinks = new FakeDeliveryLinkRepository();
    await expect(createOrGetDeliveryLink(context, "66666666-6666-4666-8666-666666666666", {}, { facturas, deliveryLinks })).rejects.toMatchObject({
      statusCode: 409,
      details: { reason: "DOCUMENTO_SIN_VALIDEZ" }
    });
    expect(deliveryLinks.lastCreateInput).toBeNull();
  });

  it("returns delegated email status message from document detail", async () => {
    const facturas = new FakeFacturaRepository();

    const result = await getEmailStatus(context, "66666666-6666-4666-8666-666666666666", facturas);

    expect(result).toEqual({
      status: "DELEGATED",
      message: "El documento se enviara en el correo del cliente."
    });
  });
});

function buildDocumento(): DocumentoResponse {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    document_uuid: "aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa",
    tipo: "FACTURA",
    estado: "EMITIDA",
    condicion_venta: "CONTADO",
    numero_fiscal: "001-001-0000001",
    cdc: "A".repeat(44),
    fiscal_document_id: "doc-1",
    external_ref: "fac-1",
    fiscal_envio_modo: "BATCH",
    batch: null,
    cliente: {
      documento_tipo: "RUC",
      documento: "80136968-1",
      razon_social: "Cliente Demo",
      email: "cliente@example.com"
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
    documento_relacionado_id: null,
    nce_motivo: null,
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

function buildPublicDocument(): PublicDocumentRecord {
  const documento = buildDocumento();

  return {
    token: "A".repeat(43),
    facturador: context.facturador,
    documento: {
      id: documento.id,
      document_uuid: documento.document_uuid,
      estado: documento.estado,
      numero_fiscal: documento.numero_fiscal,
      cdc: documento.cdc,
      cliente: documento.cliente,
      totals: documento.totals,
      email_status: documento.delivery.email_status
    }
  };
}
