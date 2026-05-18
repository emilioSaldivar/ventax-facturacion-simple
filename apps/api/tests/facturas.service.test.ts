import { describe, expect, it } from "vitest";
import {
  FiscalGatewayError,
  type FiscalGateway,
  type FiscalGatewayHealth,
  type FiscalEmitFacturaRequest,
  type FiscalEmitFacturaResponse,
  type FiscalRefreshStatusRequest,
  type FiscalRefreshStatusResponse
} from "../src/modules/fiscal-gateway/fiscal-gateway.types";
import {
  emitFacturaAgainstFiscalGateway,
  getDocumentoById,
  listDocumentos,
  previewFactura,
  refreshDocumentoStatus
} from "../src/modules/facturas/facturas.service";
import { enqueueFacturaEmission, processNextQueuedFiscalEmission, retryDocumentoEmission } from "../src/modules/facturas/facturas.service";
import type { OperationalContextResponse } from "../src/modules/context/context.types";
import type {
  FacturaPersistInput,
  FacturaQueuedPersistInput,
  FacturaRepository,
  DocumentoResponse,
  PendingFiscalEmission
} from "../src/modules/facturas/facturas.types";

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
    credito_plazo_dias: 30
  }
};

class FakeFacturaRepository implements FacturaRepository {
  public lastInput: FacturaPersistInput | null = null;
  public existing: DocumentoResponse | null = null;
  public listResponse = { items: [] as DocumentoResponse[], total: 0 };
  public lastListInput: { facturadorId: string; filters: Parameters<FacturaRepository["list"]>[0]["filters"] } | null = null;
  public findByIdResponse: DocumentoResponse | null = null;
  public lastFindByIdInput: { facturadorId: string; documentoId: string } | null = null;
  public lastUpdateFiscalStatusInput: Parameters<FacturaRepository["updateFiscalStatus"]>[0] | null = null;
  public lastQueuedInput: FacturaQueuedPersistInput | null = null;
  public pendingEmission: PendingFiscalEmission | null = null;
  public lastCompletedInput: Parameters<FacturaRepository["completePendingEmission"]>[0] | null = null;
  public lastFailedInput: Parameters<FacturaRepository["failPendingEmission"]>[0] | null = null;
  public retryResponse: DocumentoResponse | null = null;
  public lastRetryInput: Parameters<FacturaRepository["retryPendingEmission"]>[0] | null = null;

  async findByIdempotencyKey(): Promise<DocumentoResponse | null> {
    return this.existing;
  }

  async findById(input: { facturadorId: string; documentoId: string }): Promise<DocumentoResponse | null> {
    this.lastFindByIdInput = input;
    return this.findByIdResponse;
  }

  async list(input: { facturadorId: string; filters: Parameters<FacturaRepository["list"]>[0]["filters"] }) {
    this.lastListInput = input;
    return this.listResponse;
  }

  async updateFiscalStatus(input: Parameters<FacturaRepository["updateFiscalStatus"]>[0]): Promise<DocumentoResponse | null> {
    this.lastUpdateFiscalStatusInput = input;
    if (!this.findByIdResponse) {
      return null;
    }

    return {
      ...this.findByIdResponse,
      estado: input.estado,
      fiscal_status: input.fiscalStatus
    };
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

  async createQueuedEmission(input: FacturaQueuedPersistInput): Promise<DocumentoResponse> {
    this.lastQueuedInput = input;
    return {
      id: "77777777-7777-4777-8777-777777777777",
      tipo: "FACTURA",
      estado: "EMITIENDO",
      condicion_venta: input.input.condicion_venta,
      numero_fiscal: null,
      cdc: null,
      fiscal_document_id: null,
      external_ref: input.externalRef,
      cliente: input.input.cliente,
      items: input.preview.items,
      totals: input.preview.totals,
      fiscal_status: {},
      delivery: {
        public_url: null,
        whatsapp_url: null,
        email_status: "NOT_APPLICABLE",
        artifacts: {
          kude_pdf: { available: false, url: null },
          xml: { available: false, url: null }
        }
      },
      created_at: "2026-05-18T00:00:00.000Z"
    };
  }

  async claimNextPendingEmission(): Promise<PendingFiscalEmission | null> {
    return this.pendingEmission;
  }

  async completePendingEmission(input: Parameters<FacturaRepository["completePendingEmission"]>[0]): Promise<DocumentoResponse | null> {
    this.lastCompletedInput = input;
    return buildDocumento({
      id: input.documentoId,
      estado: input.response.estado,
      numero_fiscal: input.response.numero_fiscal,
      cdc: input.response.cdc,
      fiscal_document_id: input.response.fiscal_document_id,
      fiscal_status: input.response.raw
    });
  }

  async failPendingEmission(input: Parameters<FacturaRepository["failPendingEmission"]>[0]): Promise<DocumentoResponse | null> {
    this.lastFailedInput = input;
    return buildDocumento({
      id: input.documentoId,
      estado: input.estado,
      fiscal_status: input.error
    });
  }

  async retryPendingEmission(input: Parameters<FacturaRepository["retryPendingEmission"]>[0]): Promise<DocumentoResponse | null> {
    this.lastRetryInput = input;
    return this.retryResponse;
  }
}

class FakeFiscalGateway implements FiscalGateway {
  public lastRequest: FiscalEmitFacturaRequest | null = null;
  public lastRefreshRequest: FiscalRefreshStatusRequest | null = null;

  constructor(
    private readonly response: FiscalEmitFacturaResponse | FiscalGatewayError,
    private readonly refreshResponse: FiscalRefreshStatusResponse | FiscalGatewayError = {
      estado: "EMITIDA",
      raw: { status: { status: "APPROVED" }, refreshed: true }
    }
  ) {}

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

  async refreshFacturaStatus(request: FiscalRefreshStatusRequest): Promise<FiscalRefreshStatusResponse> {
    this.lastRefreshRequest = request;
    if (this.refreshResponse instanceof FiscalGatewayError) {
      throw this.refreshResponse;
    }
    return this.refreshResponse;
  }

  async getXml() {
    return {
      body: Buffer.from("<xml/>"),
      content_type: "application/xml",
      filename: "mock.xml"
    };
  }

  async getKudePdf() {
    return {
      body: Buffer.from("pdf"),
      content_type: "application/pdf",
      filename: "mock.pdf"
    };
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

function buildDocumento(overrides: Partial<DocumentoResponse> = {}): DocumentoResponse {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    tipo: "FACTURA",
    estado: "PENDIENTE_SIFEN",
    condicion_venta: "CONTADO",
    numero_fiscal: "001-001-0000001",
    cdc: "A".repeat(44),
    fiscal_document_id: "doc-1",
    external_ref: "fac-1",
    cliente: emitInput.cliente,
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
    created_at: "2026-05-18T00:00:00.000Z",
    ...overrides
  };
}

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

  it("lists documents within the authenticated facturador scope", async () => {
    const repo = new FakeFacturaRepository();
    repo.listResponse = {
      total: 1,
      items: [
        {
          id: "66666666-6666-4666-8666-666666666666",
          tipo: "FACTURA",
          estado: "EMITIDA",
          condicion_venta: "CONTADO",
          numero_fiscal: "001-001-0000001",
          cdc: "A".repeat(44),
          fiscal_document_id: "doc-1",
          external_ref: "fac-1",
          cliente: emitInput.cliente,
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
        }
      ]
    };

    const result = await listDocumentos(
      context,
      { estado: "EMITIDA", desde: "2026-05-01", hasta: "2026-05-18", q: "Cliente", limit: 20, offset: 0 },
      repo
    );

    expect(result.total).toBe(1);
    expect(repo.lastListInput).toEqual({
      facturadorId: context.facturador.id,
      filters: { estado: "EMITIDA", desde: "2026-05-01", hasta: "2026-05-18", q: "Cliente", limit: 20, offset: 0 }
    });
  });

  it("gets document detail within the authenticated facturador scope", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = {
      id: "66666666-6666-4666-8666-666666666666",
      tipo: "FACTURA",
      estado: "EMITIDA",
      condicion_venta: "CREDITO",
      numero_fiscal: "001-001-0000001",
      cdc: "A".repeat(44),
      fiscal_document_id: "doc-1",
      external_ref: "fac-1",
      cliente: emitInput.cliente,
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

    const result = await getDocumentoById(context, "66666666-6666-4666-8666-666666666666", repo);

    expect(result.condicion_venta).toBe("CREDITO");
    expect(repo.lastFindByIdInput).toEqual({
      facturadorId: context.facturador.id,
      documentoId: "66666666-6666-4666-8666-666666666666"
    });
  });

  it("returns not found when document detail is outside the facturador scope", async () => {
    const repo = new FakeFacturaRepository();

    await expect(getDocumentoById(context, "66666666-6666-4666-8666-666666666666", repo)).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND"
    });
  });

  it("refreshes fiscal status by CDC and persists the mapped state", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumento();
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "Should not emit"), {
      estado: "EMITIDA",
      raw: { cdc: "A".repeat(44), status: { status: "APPROVED" }, refreshed: true }
    });

    const result = await refreshDocumentoStatus(context, "66666666-6666-4666-8666-666666666666", repo, gateway);

    expect(result.estado).toBe("EMITIDA");
    expect(gateway.lastRefreshRequest).toEqual({ cdc: "A".repeat(44) });
    expect(repo.lastUpdateFiscalStatusInput).toEqual({
      facturadorId: context.facturador.id,
      documentoId: "66666666-6666-4666-8666-666666666666",
      estado: "EMITIDA",
      fiscalStatus: { cdc: "A".repeat(44), status: { status: "APPROVED" }, refreshed: true }
    });
  });

  it("rejects fiscal status refresh when document has no CDC", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumento({
      cdc: null,
      estado: "ERROR_TEMPORAL"
    });
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "Should not emit"));

    await expect(refreshDocumentoStatus(context, "66666666-6666-4666-8666-666666666666", repo, gateway)).rejects.toMatchObject({
      statusCode: 409,
      code: "CONFLICT"
    });
    expect(gateway.lastRefreshRequest).toBeNull();
  });

  it("retries recoverable queued fiscal emissions", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumento({
      estado: "ERROR_TEMPORAL",
      cdc: null,
      fiscal_document_id: null,
      numero_fiscal: null
    });
    repo.retryResponse = buildDocumento({
      estado: "EMITIENDO",
      cdc: null,
      fiscal_document_id: null,
      numero_fiscal: null,
      fiscal_status: {
        recoverable: true,
        action: "RETRY_EMISSION_REQUESTED"
      }
    });

    const result = await retryDocumentoEmission(context, "66666666-6666-4666-8666-666666666666", repo);

    expect(result.estado).toBe("EMITIENDO");
    expect(repo.lastRetryInput).toEqual({
      facturadorId: context.facturador.id,
      documentoId: "66666666-6666-4666-8666-666666666666",
      requestedBy: context.user.id
    });
  });

  it("rejects retry for final fiscal states", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumento({
      estado: "EMITIDA"
    });

    await expect(retryDocumentoEmission(context, "66666666-6666-4666-8666-666666666666", repo)).rejects.toMatchObject({
      statusCode: 409,
      code: "CONFLICT"
    });
    expect(repo.lastRetryInput).toBeNull();
  });

  it("rejects retry when no recoverable outbox job exists", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumento({
      estado: "PENDIENTE_SIFEN"
    });
    repo.retryResponse = null;

    await expect(retryDocumentoEmission(context, "66666666-6666-4666-8666-666666666666", repo)).rejects.toMatchObject({
      statusCode: 409,
      code: "CONFLICT"
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
      external_ref: repo.lastInput?.externalRef,
      condicion_venta: "CONTADO",
      cliente: emitInput.cliente,
      totals: { total: 11000 }
    });
    expect(repo.lastInput?.externalRef).toMatch(/^fac_[a-f0-9]{32}$/);
  });

  it("queues fiscal emission without calling fiscal gateway", async () => {
    const repo = new FakeFacturaRepository();

    const result = await enqueueFacturaEmission(context, emitInput, repo, {
      idempotencyKey: "idem-async-1"
    });

    expect(result.estado).toBe("EMITIENDO");
    expect(repo.lastQueuedInput).toMatchObject({
      tenantId: context.tenant.id,
      facturadorId: context.facturador.id,
      userId: context.user.id,
      idempotencyKey: "idem-async-1"
    });
    expect(repo.lastQueuedInput?.fiscalRequest).toMatchObject({
      external_ref: repo.lastQueuedInput?.externalRef,
      condicion_venta: "CONTADO",
      cliente: emitInput.cliente,
      totals: { total: 11000 }
    });
  });

  it("processes queued fiscal emission and completes document", async () => {
    const repo = new FakeFacturaRepository();
    const fiscalRequest = {
      external_ref: "fac-queued",
      condicion_venta: "CONTADO" as const,
      facturador: context.facturador,
      fiscal_context: context.fiscal_context,
      cliente: emitInput.cliente,
      items: previewFactura(context, emitInput).items,
      totals: previewFactura(context, emitInput).totals
    };
    repo.pendingEmission = {
      outboxId: "88888888-8888-4888-8888-888888888888",
      documentoId: "77777777-7777-4777-8777-777777777777",
      facturadorId: context.facturador.id,
      fiscalRequest
    };
    const gateway = new FakeFiscalGateway({
      fiscal_document_id: "mock-async",
      cdc: "C".repeat(44),
      numero_fiscal: "001-001-0000003",
      estado: "EMITIDA",
      email_status: "DELEGATED",
      raw: { mode: "mock", async: true }
    });

    const result = await processNextQueuedFiscalEmission(repo, gateway);

    expect(result?.estado).toBe("EMITIDA");
    expect(gateway.lastRequest).toEqual(fiscalRequest);
    expect(repo.lastCompletedInput).toMatchObject({
      outboxId: "88888888-8888-4888-8888-888888888888",
      documentoId: "77777777-7777-4777-8777-777777777777"
    });
  });

  it("keeps queued emission recoverable when fiscal gateway times out", async () => {
    const repo = new FakeFacturaRepository();
    repo.pendingEmission = {
      outboxId: "88888888-8888-4888-8888-888888888888",
      documentoId: "77777777-7777-4777-8777-777777777777",
      facturadorId: context.facturador.id,
      fiscalRequest: {
        external_ref: "fac-queued",
        condicion_venta: "CONTADO",
        facturador: context.facturador,
        fiscal_context: context.fiscal_context,
        cliente: emitInput.cliente,
        items: previewFactura(context, emitInput).items,
        totals: previewFactura(context, emitInput).totals
      }
    };
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("TIMEOUT", "Timeout fiscal"));

    const result = await processNextQueuedFiscalEmission(repo, gateway);

    expect(result?.estado).toBe("PENDIENTE_SIFEN");
    expect(repo.lastFailedInput).toMatchObject({
      estado: "PENDIENTE_SIFEN",
      retryAfterSeconds: 60,
      error: {
        code: "TIMEOUT",
        message: "Timeout fiscal",
        recoverable: true,
        retry_after_seconds: 60,
        suggested_action: "REFRESH_OR_RETRY"
      }
    });
  });

  it("emits credit invoice without creating collection state", async () => {
    const repo = new FakeFacturaRepository();
    const gateway = new FakeFiscalGateway({
      fiscal_document_id: "mock-credit",
      cdc: "B".repeat(44),
      numero_fiscal: "001-001-0000002",
      estado: "EMITIDA",
      email_status: "NOT_APPLICABLE",
      raw: { mode: "mock" }
    });

    const result = await emitFacturaAgainstFiscalGateway(
      context,
      {
        ...emitInput,
        condicion_venta: "CREDITO",
        cliente: {
          documento_tipo: "CI",
          documento: "1234567",
          razon_social: "Cliente Credito"
        }
      },
      repo,
      gateway,
      {
        idempotencyKey: "idem-credit-1"
      }
    );

    expect(result).toMatchObject({
      estado: "EMITIDA",
      condicion_venta: "CREDITO",
      fiscal_document_id: "mock-credit"
    });
    expect(gateway.lastRequest).toMatchObject({
      condicion_venta: "CREDITO"
    });
    expect(repo.lastInput?.input.condicion_venta).toBe("CREDITO");
  });

  it("generates stable external_ref for the same facturador and idempotency key", async () => {
    const firstRepo = new FakeFacturaRepository();
    const secondRepo = new FakeFacturaRepository();
    const gateway = new FakeFiscalGateway({
      fiscal_document_id: "mock-fac",
      cdc: "A".repeat(44),
      numero_fiscal: "001-001-0000001",
      estado: "EMITIDA",
      email_status: "DELEGATED",
      raw: { mode: "mock" }
    });

    await emitFacturaAgainstFiscalGateway(context, emitInput, firstRepo, gateway, {
      idempotencyKey: "idem-stable-1"
    });
    await emitFacturaAgainstFiscalGateway(context, emitInput, secondRepo, gateway, {
      idempotencyKey: "idem-stable-1"
    });

    expect(firstRepo.lastInput?.externalRef).toBe(secondRepo.lastInput?.externalRef);
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
