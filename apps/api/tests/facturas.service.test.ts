import { describe, expect, it } from "vitest";
import {
  FiscalGatewayError,
  type FiscalByCdcResponse,
  type FiscalGateway,
  type FiscalGatewayHealth,
  type FiscalCancelFacturaRequest,
  type FiscalCancelFacturaResponse,
  type FiscalBatchPendientesResponse,
  type FiscalDocumentoDecisionResponse,
  type FiscalDocumentoEventosResponse,
  type FiscalDocumentoCancelSendResponse,
  type FiscalDocumentoCreateDerivedResponse,
  type FiscalDocumentoResendResponse,
  type FiscalDocumentoValidateCdcImpactResponse,
  type FiscalDocumentoVoidResponse,
  type FiscalEmitFacturaRequest,
  type FiscalEmitFacturaResponse,
  type FiscalEmitNotaCreditoRequest,
  type FiscalEmitNotaCreditoResponse,
  type FiscalFacturalistaResponse,
  type FiscalRefreshStatusRequest,
  type FiscalRefreshStatusResponse
} from "../src/modules/fiscal-gateway/fiscal-gateway.types";
import {
  emitFacturaAgainstFiscalGateway,
  cancelDocumento,
  emitNotaCreditoTotal,
  getBatchPendientesGestion,
  getDocumentoDecision,
  validateDocumentoCdcImpact,
  retryDocumentoSameCdc,
  createDocumentoDerived,
  cancelDocumentoSend,
  voidDocumentoNumber,
  getDocumentoById,
  getDocumentoEventos,
  getReconciliacionFiscal,
  listNotaCreditoCandidates,
  listDocumentos,
  previewFactura,
  refreshDocumentoStatus
} from "../src/modules/facturas/facturas.service";
import { enqueueFacturaEmission, processNextQueuedFiscalEmission, retryDocumentoEmission } from "../src/modules/facturas/facturas.service";
import type { OperationalContextResponse } from "../src/modules/context/context.types";
import type { ClienteRepository, ClienteResponse, ClienteSearchResult } from "../src/modules/clientes/clientes.types";
import type {
  FacturaPersistInput,
  FacturaQueuedPersistInput,
  FacturaRepository,
  DocumentoResponse,
  NotaCreditoPersistInput,
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
    credito_plazo_dias: 30,
    fiscal_envio_modo: "BATCH",
    batch_enabled: true
  }
};

const otherFacturadorContext: OperationalContextResponse = {
  ...context,
  facturador: {
    id: "99999999-9999-4999-8999-999999999999",
    emisor_id: "80000000-0",
    razon_social: "Otro Facturador",
    ruc: "80000000-0"
  }
};

class FakeFacturaRepository implements FacturaRepository {
  public lastInput: FacturaPersistInput | null = null;
  public existing: DocumentoResponse | null = null;
  public existingNceByOriginal: DocumentoResponse | null = null;
  public lastFindByIdempotencyInput: { facturadorId: string; idempotencyKey: string } | null = null;
  public lastFindNceByOriginalInput: { facturadorId: string; documentoId: string } | null = null;
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
  public lastCancelInput: Parameters<FacturaRepository["cancelDocumento"]>[0] | null = null;
  public lastNotaCreditoInput: NotaCreditoPersistInput | null = null;
  public auditEvents: Array<{
    facturadorId: string;
    documentoId: string;
    requestedBy: string;
    eventType: string;
    metadata: Record<string, unknown>;
  }> = [];

  async findByIdempotencyKey(input: { facturadorId: string; idempotencyKey: string }): Promise<DocumentoResponse | null> {
    this.lastFindByIdempotencyInput = input;
    return this.existing;
  }

  async findById(input: { facturadorId: string; documentoId: string }): Promise<DocumentoResponse | null> {
    this.lastFindByIdInput = input;
    return this.findByIdResponse;
  }

  async findNotaCreditoByOriginal(input: { facturadorId: string; documentoId: string }): Promise<DocumentoResponse | null> {
    this.lastFindNceByOriginalInput = input;
    return this.existingNceByOriginal;
  }

  async list(input: { facturadorId: string; filters: Parameters<FacturaRepository["list"]>[0]["filters"] }) {
    this.lastListInput = input;
    return this.listResponse;
  }

  async bulkUpdateDocumentUuidByCdc(): Promise<void> {
    // no-op in tests
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
      document_uuid: input.fiscalResponse?.document_uuid ?? null,
      tipo: "FACTURA",
      estado: input.estado,
      condicion_venta: input.input.condicion_venta,
      numero_fiscal: input.fiscalResponse?.numero_fiscal ?? null,
      cdc: input.fiscalResponse?.cdc ?? null,
      fiscal_document_id: input.fiscalResponse?.fiscal_document_id ?? null,
      external_ref: input.externalRef,
      fiscal_envio_modo: input.fiscalResponse?.fiscal_envio_modo ?? "BATCH",
      batch: input.fiscalResponse?.batch ?? null,
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
      created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString()
    };
  }

  async createQueuedEmission(input: FacturaQueuedPersistInput): Promise<DocumentoResponse> {
    this.lastQueuedInput = input;
    return {
      id: "77777777-7777-4777-8777-777777777777",
      document_uuid: null,
      tipo: "FACTURA",
      estado: "EMITIENDO",
      condicion_venta: input.input.condicion_venta,
      numero_fiscal: null,
      cdc: null,
      fiscal_document_id: null,
      external_ref: input.externalRef,
      fiscal_envio_modo: input.fiscalRequest.fiscal_context.fiscal_envio_modo,
      batch: null,
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
      created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString()
    };
  }

  async createNotaCreditoFromFactura(input: NotaCreditoPersistInput): Promise<DocumentoResponse> {
    this.lastNotaCreditoInput = input;
    return {
      ...input.original,
      id: "88888888-8888-4888-8888-888888888888",
      tipo: "NOTA_CREDITO",
      estado: input.estado,
      numero_fiscal: input.fiscalResponse?.numero_fiscal ?? null,
      cdc: input.fiscalResponse?.cdc ?? null,
      fiscal_document_id: input.fiscalResponse?.fiscal_document_id ?? null,
      external_ref: input.externalRef,
      fiscal_envio_modo: input.fiscalResponse?.fiscal_envio_modo ?? "BATCH",
      batch: input.fiscalResponse?.batch ?? null,
      fiscal_status: input.fiscalResponse?.raw ?? input.fiscalError,
      documento_relacionado_id: input.original.id,
      nce_motivo: input.motivo,
      delivery: {
        ...input.original.delivery,
        email_status: input.fiscalResponse?.email_status ?? "UNKNOWN",
        artifacts: {
          kude_pdf: { available: Boolean(input.fiscalResponse?.cdc), url: null },
          xml: { available: Boolean(input.fiscalResponse?.cdc), url: null }
        }
      }
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

  async cancelDocumento(input: Parameters<FacturaRepository["cancelDocumento"]>[0]): Promise<DocumentoResponse | null> {
    this.lastCancelInput = input;
    if (!this.findByIdResponse) {
      return null;
    }

    return {
      ...this.findByIdResponse,
      estado: input.estado,
      fiscal_status: input.fiscalStatus
    };
  }

  async appendAuditEvent(input: {
    facturadorId: string;
    documentoId: string;
    requestedBy: string;
    eventType: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    this.auditEvents.push(input);
  }
}

class FakeClienteRepository implements ClienteRepository {
  public findByIdResponse: ClienteResponse | null = null;
  public lastFindByIdInput: { clienteId: string; facturadorId: string } | null = null;

  async search(): Promise<ClienteSearchResult[]> {
    return [];
  }

  async list() {
    return { items: [], total: 0 };
  }

  async findByIdForFacturador(input: { clienteId: string; facturadorId: string }): Promise<ClienteResponse | null> {
    this.lastFindByIdInput = input;
    return this.findByIdResponse;
  }

  async upsertForFacturador(): Promise<ClienteResponse> {
    throw new Error("not implemented");
  }

  async updateForFacturador(): Promise<ClienteResponse | null> {
    throw new Error("not implemented");
  }
}

class FakeFiscalGateway implements FiscalGateway {
  public lastRequest: FiscalEmitFacturaRequest | null = null;
  public lastNotaCreditoRequest: FiscalEmitNotaCreditoRequest | null = null;
  public lastRefreshRequest: FiscalRefreshStatusRequest | null = null;
  public lastCancelRequest: FiscalCancelFacturaRequest | null = null;

  constructor(
    private readonly response: FiscalEmitFacturaResponse | FiscalGatewayError,
    private readonly refreshResponse: FiscalRefreshStatusResponse | FiscalGatewayError = {
      estado: "EMITIDA",
      current_cdc: null,
      raw: { status: { status: "APPROVED" }, refreshed: true }
    },
    private readonly cancelResponse: FiscalCancelFacturaResponse | FiscalGatewayError = {
      event_id: "evt-1",
      estado: "ANULADA",
      raw: { event_id: "evt-1", status: "SENT" }
    },
    private readonly notaCreditoResponse: FiscalEmitNotaCreditoResponse | FiscalGatewayError = {
      fiscal_document_id: "nce-doc-1",
      cdc: "N".repeat(44),
      numero_fiscal: "001-001-0000002",
      estado: "EMITIDA",
      email_status: "DELEGATED",
      raw: { document_id: "nce-doc-1", status: "APPROVED" }
    },
    private readonly eventosResponse: FiscalDocumentoEventosResponse = {
      events: [],
      raw: { events: [] }
    },
    private readonly batchPendientesResponse: FiscalBatchPendientesResponse = {
      documents: [],
      batches: [],
      raw: { documents: [], batches: [] }
    },
    private readonly facturalistaResponse: FiscalFacturalistaResponse = {
      items: [],
      next: null,
      raw: { items: [], next: null }
    },
    private readonly decisionResponse: FiscalDocumentoDecisionResponse = {
      document_id: "doc-1",
      emisor_id: "80136968-1",
      env: "test",
      cdc: null,
      nro_factura: null,
      status: "REJECTED",
      transmission_evidence: "UNKNOWN",
      number_state: "UNCERTAIN",
      decision_confidence: "LOW",
      reason_codes: ["MOCK"],
      recommended_action: "WAIT_SYNC",
      next_step_hint: null,
      escalation_required: false,
      allowed_actions: {},
      raw: {}
    },
    private readonly validateCdcResponse: FiscalDocumentoValidateCdcImpactResponse = {
      document_id: "doc-1",
      current_cdc: "A".repeat(44),
      candidate_cdc: "A".repeat(44),
      cdc_impact: "CDC_NO_CHANGE",
      reason: "Sin impacto",
      allowed_actions: { retry_same_cdc: true },
      raw: {}
    },
    private readonly resendResponse: FiscalDocumentoResendResponse = {
      document_id: "doc-1",
      status: "PENDING",
      revision_number: 2,
      accepted_by_sifen: false,
      cdc: "A".repeat(44),
      queued_for_batch: true,
      raw: {}
    },
    private readonly createDerivedResponse: FiscalDocumentoCreateDerivedResponse = {
      source_document_id: "doc-1",
      derived_document_id: "doc-2",
      status: "PENDING",
      accepted_by_sifen: false,
      cdc: null,
      nro_factura: null,
      raw: {}
    },
    private readonly cancelSendResponse: FiscalDocumentoCancelSendResponse = {
      document_id: "doc-1",
      previous_status: "QUEUED_BATCH",
      status: "DRAFT",
      action_result: "CANCELLED",
      reason_codes: ["MANUAL_CANCEL"],
      recommended_next_action: "REVIEW_AND_RETRY",
      raw: {}
    },
    private readonly voidResponse: FiscalDocumentoVoidResponse = {
      document_id: "doc-1",
      event_id: "evt-void-1",
      status: "SENT",
      raw: {}
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

  async emitNotaCredito(request: FiscalEmitNotaCreditoRequest): Promise<FiscalEmitNotaCreditoResponse> {
    this.lastNotaCreditoRequest = request;
    if (this.notaCreditoResponse instanceof FiscalGatewayError) {
      throw this.notaCreditoResponse;
    }
    return this.notaCreditoResponse;
  }

  async refreshFacturaStatus(request: FiscalRefreshStatusRequest): Promise<FiscalRefreshStatusResponse> {
    this.lastRefreshRequest = request;
    if (this.refreshResponse instanceof FiscalGatewayError) {
      throw this.refreshResponse;
    }
    return this.refreshResponse;
  }

  async cancelFactura(request: FiscalCancelFacturaRequest): Promise<FiscalCancelFacturaResponse> {
    this.lastCancelRequest = request;
    if (this.cancelResponse instanceof FiscalGatewayError) {
      throw this.cancelResponse;
    }
    return this.cancelResponse;
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

  async getDocumentoEventos(): Promise<FiscalDocumentoEventosResponse> {
    return this.eventosResponse;
  }

  async getDocumentoDecisionByDocumentId(): Promise<FiscalDocumentoDecisionResponse> {
    return this.decisionResponse;
  }

  async getBatchPendientesByEmisor(): Promise<FiscalBatchPendientesResponse> {
    return this.batchPendientesResponse;
  }

  async getFacturalistaByEmisor(): Promise<FiscalFacturalistaResponse> {
    return this.facturalistaResponse;
  }

  async validateDocumentoCdcImpactByDocumentId(): Promise<FiscalDocumentoValidateCdcImpactResponse> {
    return this.validateCdcResponse;
  }

  async retryDocumentoSameCdcByDocumentId(): Promise<FiscalDocumentoResendResponse> {
    return this.resendResponse;
  }

  async createDocumentoDerivedByDocumentId(): Promise<FiscalDocumentoCreateDerivedResponse> {
    return this.createDerivedResponse;
  }

  async cancelDocumentoSendByDocumentId(): Promise<FiscalDocumentoCancelSendResponse> {
    return this.cancelSendResponse;
  }

  async voidDocumentoNumberByDocumentId(): Promise<FiscalDocumentoVoidResponse> {
    return this.voidResponse;
  }

  async resolveDocumentoByCdc(): Promise<FiscalByCdcResponse> {
    throw new Error("not needed");
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
    document_uuid: "aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa",
    tipo: "FACTURA",
    estado: "PENDIENTE_SIFEN",
    condicion_venta: "CONTADO",
    numero_fiscal: "001-001-0000001",
    cdc: "A".repeat(44),
    fiscal_document_id: "doc-1",
    external_ref: "fac-1",
    fiscal_envio_modo: "BATCH",
    batch: null,
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
    created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
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
          created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString()
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

  it("passes operational document filters and exposes NCE candidates with ineligibility cause", async () => {
    const repo = new FakeFacturaRepository();
    const facturaEmitida = buildDocumento({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      estado: "EMITIDA",
      condicion_venta: "CREDITO"
    });
    const facturaPendiente = buildDocumento({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      estado: "PENDIENTE_SIFEN",
      cdc: null
    });
    const nce = buildDocumento({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      tipo: "NOTA_CREDITO",
      documento_relacionado_id: facturaEmitida.id
    });

    repo.listResponse = {
      total: 1,
      items: [facturaEmitida]
    };

    await listDocumentos(context, { tipo_operativo: "CREDITO", limit: 20, offset: 0 }, repo);
    expect(repo.lastListInput).toEqual({
      facturadorId: context.facturador.id,
      filters: { tipo_operativo: "CREDITO", limit: 20, offset: 0 }
    });

    let call = 0;
    repo.list = async (input) => {
      repo.lastListInput = input;
      call += 1;
      if (call === 1) {
        return { total: 2, items: [facturaEmitida, facturaPendiente] };
      }
      return { total: 1, items: [nce] };
    };

    const candidates = await listNotaCreditoCandidates(context, { q: "Cliente", limit: 30, offset: 0 }, repo);
    expect(candidates.items).toHaveLength(2);
    expect(candidates.items[0]).toMatchObject({
      documento: { id: facturaEmitida.id },
      elegible: false,
      motivo_no_elegible: "La factura ya tiene una nota de credito total."
    });
    expect(candidates.items[1]).toMatchObject({
      documento: { id: facturaPendiente.id },
      elegible: false,
      motivo_no_elegible: "La factura debe estar emitida."
    });
  });

  it("keeps list, detail, refresh, retry and cancel scoped to the current facturador", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumento({
      estado: "EMITIDA"
    });
    repo.retryResponse = buildDocumento({
      estado: "EMITIENDO",
      cdc: null,
      fiscal_document_id: null,
      numero_fiscal: null
    });
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "Should not emit"), {
      estado: "EMITIDA",
      raw: { refreshed: true }
    });

    await listDocumentos(otherFacturadorContext, { limit: 10, offset: 0 }, repo);
    expect(repo.lastListInput).toEqual({
      facturadorId: otherFacturadorContext.facturador.id,
      filters: { limit: 10, offset: 0 }
    });

    await getDocumentoById(otherFacturadorContext, "66666666-6666-4666-8666-666666666666", repo);
    expect(repo.lastFindByIdInput).toEqual({
      facturadorId: otherFacturadorContext.facturador.id,
      documentoId: "66666666-6666-4666-8666-666666666666"
    });

    await refreshDocumentoStatus(otherFacturadorContext, "66666666-6666-4666-8666-666666666666", repo, gateway);
    expect(repo.lastUpdateFiscalStatusInput).toMatchObject({
      facturadorId: otherFacturadorContext.facturador.id,
      documentoId: "66666666-6666-4666-8666-666666666666"
    });

    repo.findByIdResponse = buildDocumento({
      estado: "PENDIENTE_SIFEN"
    });
    await retryDocumentoEmission(otherFacturadorContext, "66666666-6666-4666-8666-666666666666", repo);
    expect(repo.lastRetryInput).toEqual({
      facturadorId: otherFacturadorContext.facturador.id,
      documentoId: "66666666-6666-4666-8666-666666666666",
      requestedBy: otherFacturadorContext.user.id
    });

    repo.findByIdResponse = buildDocumento({
      estado: "EMITIDA"
    });
    await cancelDocumento(
      otherFacturadorContext,
      "66666666-6666-4666-8666-666666666666",
      { motivo: "Solicitud del cliente" },
      repo,
      gateway
    );
    expect(repo.lastCancelInput).toMatchObject({
      facturadorId: otherFacturadorContext.facturador.id,
      documentoId: "66666666-6666-4666-8666-666666666666",
      requestedBy: otherFacturadorContext.user.id
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
      created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString()
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

  it("refreshes fiscal status by document_uuid and persists the mapped state", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumento();
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "Should not emit"), {
      estado: "EMITIDA",
      current_cdc: null,
      raw: { status: { status: "APPROVED" }, refreshed: true }
    });

    const result = await refreshDocumentoStatus(context, "66666666-6666-4666-8666-666666666666", repo, gateway);

    expect(result.estado).toBe("EMITIDA");
    expect(gateway.lastRefreshRequest).toEqual({ documentUuid: "aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa" });
    expect(repo.lastUpdateFiscalStatusInput).toMatchObject({
      facturadorId: context.facturador.id,
      documentoId: "66666666-6666-4666-8666-666666666666",
      estado: "EMITIDA"
    });
  });

  it("rejects fiscal status refresh when document has no document_uuid", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumento({
      document_uuid: null,
      estado: "ERROR_TEMPORAL"
    });
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "Should not emit"));

    await expect(refreshDocumentoStatus(context, "66666666-6666-4666-8666-666666666666", repo, gateway)).rejects.toMatchObject({
      statusCode: 409,
      code: "CONFLICT"
    });
    expect(gateway.lastRefreshRequest).toBeNull();
  });

  it("cancels an emitted invoice through the fiscal gateway", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumento({
      estado: "EMITIDA",
      cdc: "A".repeat(44)
    });
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "Should not emit"));

    const result = await cancelDocumento(
      context,
      "66666666-6666-4666-8666-666666666666",
      { motivo: "Error en datos del receptor" },
      repo,
      gateway
    );

    expect(result.estado).toBe("ANULADA");
    expect(gateway.lastCancelRequest).toEqual({
      emisor_id: context.facturador.emisor_id,
      cdc: "A".repeat(44),
      motivo: "Error en datos del receptor"
    });
    expect(repo.lastCancelInput).toEqual({
      facturadorId: context.facturador.id,
      documentoId: "66666666-6666-4666-8666-666666666666",
      requestedBy: context.user.id,
      estado: "ANULADA",
      fiscalStatus: {
        event_id: "evt-1",
        status: "SENT",
        cancelacion_motivo: "Error en datos del receptor"
      }
    });
  });

  it("rejects cancellation for non-emitted or CDC-less documents", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumento({
      estado: "PENDIENTE_SIFEN",
      cdc: null
    });
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "Should not emit"));

    await expect(
      cancelDocumento(context, "66666666-6666-4666-8666-666666666666", { motivo: "Error" }, repo, gateway)
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "CONFLICT"
    });
    expect(gateway.lastCancelRequest).toBeNull();
  });

  it("maps fiscal cancellation gateway failures to upstream errors", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumento({
      estado: "EMITIDA",
      cdc: "A".repeat(44)
    });
    const gateway = new FakeFiscalGateway(
      new FiscalGatewayError("UPSTREAM_ERROR", "Should not emit"),
      {
        estado: "EMITIDA",
        raw: {}
      },
      new FiscalGatewayError("TIMEOUT", "Timeout fiscal")
    );

    await expect(
      cancelDocumento(context, "66666666-6666-4666-8666-666666666666", { motivo: "Error" }, repo, gateway)
    ).rejects.toMatchObject({
      statusCode: 504,
      code: "INTERNAL_ERROR"
    });
  });

  it("emits a total credit note from an eligible invoice", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumento({
      estado: "EMITIDA",
      cdc: "A".repeat(44),
      numero_fiscal: "001-001-0000001",
      items: [
        {
          catalogo_item_id: null,
          line_no: 1,
          codigo: "SERV",
          descripcion: "Servicio",
          cantidad: 1,
          precio_unitario: 11000,
          iva_tipo: "IVA_10",
          subtotal: 11000,
          base_imponible: 10000,
          iva_monto: 1000
        }
      ]
    });
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "Should not emit"));

    const result = await emitNotaCreditoTotal(
      context,
      "66666666-6666-4666-8666-666666666666",
      { motivo: "Devolucion total" },
      repo,
      gateway,
      { idempotencyKey: "nce-idem-1" }
    );

    expect(result.tipo).toBe("NOTA_CREDITO");
    expect(result.estado).toBe("EMITIDA");
    expect(result.documento_relacionado_id).toBe("66666666-6666-4666-8666-666666666666");
    expect(gateway.lastNotaCreditoRequest).toMatchObject({
      external_ref: expect.stringMatching(/^nce_/),
      motivo: "Devolucion total",
      factura_referencia: {
        documento_id: "66666666-6666-4666-8666-666666666666",
        cdc: "A".repeat(44),
        numero_fiscal: "001-001-0000001"
      },
      totals: {
        total: 11000
      }
    });
    expect(repo.lastNotaCreditoInput).toMatchObject({
      facturadorId: context.facturador.id,
      userId: context.user.id,
      motivo: "Devolucion total",
      idempotencyKey: "nce-idem-1",
      estado: "EMITIDA"
    });
  });

  it("rejects credit note when invoice is not eligible or already credited", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumento({
      estado: "ANULADA"
    });
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "Should not emit"));

    await expect(
      emitNotaCreditoTotal(context, "66666666-6666-4666-8666-666666666666", { motivo: "Error" }, repo, gateway, {
        idempotencyKey: "nce-idem-2"
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "CONFLICT"
    });
    expect(gateway.lastNotaCreditoRequest).toBeNull();

    repo.findByIdResponse = buildDocumento({
      estado: "EMITIDA",
      cdc: "A".repeat(44)
    });
    repo.existingNceByOriginal = buildDocumento({
      id: "88888888-8888-4888-8888-888888888888",
      tipo: "NOTA_CREDITO",
      documento_relacionado_id: "66666666-6666-4666-8666-666666666666"
    });

    await expect(
      emitNotaCreditoTotal(context, "66666666-6666-4666-8666-666666666666", { motivo: "Error" }, repo, gateway, {
        idempotencyKey: "nce-idem-3"
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "CONFLICT"
    });
  });

  it("returns existing credit note by idempotency key before creating another NCE", async () => {
    const repo = new FakeFacturaRepository();
    repo.existing = buildDocumento({
      id: "88888888-8888-4888-8888-888888888888",
      tipo: "NOTA_CREDITO",
      documento_relacionado_id: "66666666-6666-4666-8666-666666666666"
    });
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "Should not emit"));

    const result = await emitNotaCreditoTotal(
      context,
      "66666666-6666-4666-8666-666666666666",
      { motivo: "Devolucion total" },
      repo,
      gateway,
      { idempotencyKey: "nce-idem-1" }
    );

    expect(result.id).toBe("88888888-8888-4888-8888-888888888888");
    expect(repo.lastFindByIdInput).toBeNull();
    expect(gateway.lastNotaCreditoRequest).toBeNull();
  });

  it("stores recoverable fiscal errors when credit note emission times out", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumento({
      estado: "EMITIDA",
      cdc: "A".repeat(44)
    });
    const gateway = new FakeFiscalGateway(
      new FiscalGatewayError("UPSTREAM_ERROR", "Should not emit"),
      {
        estado: "EMITIDA",
        raw: {}
      },
      {
        event_id: "evt-1",
        estado: "ANULADA",
        raw: {}
      },
      new FiscalGatewayError("TIMEOUT", "Timeout fiscal")
    );

    const result = await emitNotaCreditoTotal(
      context,
      "66666666-6666-4666-8666-666666666666",
      { motivo: "Devolucion total" },
      repo,
      gateway,
      { idempotencyKey: "nce-idem-4" }
    );

    expect(result.estado).toBe("PENDIENTE_SIFEN");
    expect(repo.lastNotaCreditoInput?.fiscalError).toMatchObject({
      code: "TIMEOUT",
      recoverable: true,
      suggested_action: "REFRESH_OR_CONTACT_SUPPORT"
    });
  });

  it("does not persist credit notes rejected by the fiscal backend", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumento({
      estado: "EMITIDA",
      cdc: "A".repeat(44)
    });
    const gateway = new FakeFiscalGateway(
      new FiscalGatewayError("UPSTREAM_ERROR", "Should not emit"),
      {
        estado: "EMITIDA",
        raw: {}
      },
      {
        event_id: "evt-1",
        estado: "ANULADA",
        raw: {}
      },
      new FiscalGatewayError("UPSTREAM_ERROR", "Backend fiscal rechazo la nota de credito.", {
        status: 409,
        body: {
          error: "NUMERATION_MISMATCH",
          message: "Numeracion invalida para 001-002",
          details: {
            expected_document_number: "0000001",
            requested_document_number: "0000019",
            tipo_documento: 5
          }
        }
      })
    );

    await expect(
      emitNotaCreditoTotal(
        context,
        "66666666-6666-4666-8666-666666666666",
        { motivo: "Devolucion total" },
        repo,
        gateway,
        { idempotencyKey: "nce-idem-5" }
      )
    ).rejects.toMatchObject({
      statusCode: 502,
      code: "INTERNAL_ERROR",
      message: "Backend fiscal rechazo la nota de credito."
    });

    expect(repo.lastNotaCreditoInput).toBeNull();
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
      fiscal_context: {
        fiscal_envio_modo: "BATCH",
        batch_enabled: true
      },
      cliente: emitInput.cliente,
      totals: { total: 11000 }
    });
  });

  it("enriches queued emission customer email from facturador agenda", async () => {
    const repo = new FakeFacturaRepository();
    const clientes = new FakeClienteRepository();
    clientes.findByIdResponse = {
      source: "AGENDA_FACTURADOR",
      cliente_id: "99999999-9999-4999-8999-999999999999",
      documento_tipo: "RUC",
      documento: "80136968-1",
      razon_social: "Cliente Demo",
      direccion: "Direccion guardada",
      telefono: "0981000000",
      email: "guardado@example.com",
      activo: true
    };

    const result = await enqueueFacturaEmission(
      context,
      {
        ...emitInput,
        cliente: {
          ...emitInput.cliente,
          cliente_id: "99999999-9999-4999-8999-999999999999",
          direccion: null,
          telefono: null,
          email: null
        }
      },
      repo,
      {
        idempotencyKey: "idem-async-client-email",
        clienteRepository: clientes
      }
    );

    expect(result.cliente).toMatchObject({
      cliente_id: "99999999-9999-4999-8999-999999999999",
      email: "guardado@example.com",
      telefono: "0981000000",
      direccion: "Direccion guardada"
    });
    expect(repo.lastQueuedInput?.fiscalRequest.cliente).toMatchObject({
      email: "guardado@example.com",
      telefono: "0981000000",
      direccion: "Direccion guardada"
    });
    expect(clientes.lastFindByIdInput).toEqual({
      clienteId: "99999999-9999-4999-8999-999999999999",
      facturadorId: context.facturador.id
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
      estado: "PENDIENTE_SIFEN",
      fiscal_envio_modo: "BATCH",
      delivery_mode: "BATCH",
      batch: {
        batch_id: "batch-1",
        did: "1",
        dProtConsLote: "123",
        dCodRes: "0300",
        dMsgRes: "Lote recibido",
        dTpoProces: null,
        result_code: null,
        result_message: null,
        status: "RECEIVED"
      },
      email_status: "DELEGATED",
      raw: {
        mode: "mock",
        async: true,
        delivery_mode: "BATCH",
        batch: {
          batch_id: "batch-1",
          did: "1",
          dProtConsLote: "123",
          dCodRes: "0300",
          dMsgRes: "Lote recibido",
          status: "RECEIVED"
        }
      }
    });

    const result = await processNextQueuedFiscalEmission(repo, gateway);

    expect(result?.estado).toBe("PENDIENTE_SIFEN");
    expect(gateway.lastRequest).toEqual(fiscalRequest);
    expect(repo.lastCompletedInput).toMatchObject({
      outboxId: "88888888-8888-4888-8888-888888888888",
      documentoId: "77777777-7777-4777-8777-777777777777",
      response: {
        fiscal_envio_modo: "BATCH",
        delivery_mode: "BATCH",
        batch: {
          batch_id: "batch-1",
          dProtConsLote: "123"
        }
      }
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

  it("keeps queued emission recoverable when fiscal gateway returns a temporary upstream error", async () => {
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
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "SIFEN no disponible"));

    const result = await processNextQueuedFiscalEmission(repo, gateway);

    expect(result?.estado).toBe("ERROR_TEMPORAL");
    expect(repo.lastFailedInput).toMatchObject({
      estado: "ERROR_TEMPORAL",
      error: {
        code: "UPSTREAM_ERROR",
        message: "SIFEN no disponible",
        recoverable: true,
        retry_after_seconds: 60,
        suggested_action: "RETRY_EMISSION"
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

  it("generates different external_ref for the same idempotency key across facturadores", async () => {
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
      idempotencyKey: "idem-cross-facturador"
    });
    await emitFacturaAgainstFiscalGateway(otherFacturadorContext, emitInput, secondRepo, gateway, {
      idempotencyKey: "idem-cross-facturador"
    });

    expect(firstRepo.lastInput?.externalRef).not.toBe(secondRepo.lastInput?.externalRef);
    expect(secondRepo.lastFindByIdempotencyInput).toEqual({
      facturadorId: otherFacturadorContext.facturador.id,
      idempotencyKey: "idem-cross-facturador"
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
      documento_relacionado_id: null,
      nce_motivo: null,
      delivery: {
        public_url: null,
        whatsapp_url: null,
        email_status: "UNKNOWN",
        artifacts: {
          kude_pdf: { available: true, url: null },
          xml: { available: true, url: null }
        }
      },
      created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString()
    };
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "Should not emit"));

    const result = await emitFacturaAgainstFiscalGateway(context, emitInput, repo, gateway, {
      idempotencyKey: "idem-1"
    });

    expect(result.id).toBe("66666666-6666-4666-8666-666666666666");
    expect(repo.lastInput).toBeNull();
    expect(gateway.lastRequest).toBeNull();
  });

  it("returns existing queued document for repeated idempotency key without enqueueing again", async () => {
    const repo = new FakeFacturaRepository();
    repo.existing = buildDocumento({
      id: "77777777-7777-4777-8777-777777777777",
      estado: "EMITIENDO",
      numero_fiscal: null,
      cdc: null,
      fiscal_document_id: null,
      external_ref: "fac-existing-queued"
    });

    const result = await enqueueFacturaEmission(context, emitInput, repo, {
      idempotencyKey: "idem-async-existing"
    });

    expect(result).toMatchObject({
      id: "77777777-7777-4777-8777-777777777777",
      estado: "EMITIENDO",
      external_ref: "fac-existing-queued"
    });
    expect(repo.lastQueuedInput).toBeNull();
    expect(repo.lastFindByIdempotencyInput).toEqual({
      facturadorId: context.facturador.id,
      idempotencyKey: "idem-async-existing"
    });
  });

  it("returns fiscal events by documento id using CDC", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumento();
    const gateway = new FakeFiscalGateway(
      new FiscalGatewayError("UPSTREAM_ERROR", "unused"),
      undefined,
      undefined,
      undefined,
      {
        events: [
          {
            event_id: "evt-1",
            type: "CANCEL",
            status: "SENT",
            created_at: "2026-05-24T00:00:00.000Z",
            response: null
          }
        ],
        raw: { events: [{ event_id: "evt-1" }] }
      }
    );

    const result = await getDocumentoEventos(
      {
        ...context,
        user: {
          ...context.user,
          role: "SOPORTE_INTERNO"
        }
      },
      repo.findByIdResponse.id,
      repo,
      gateway
    );

    expect(result).toEqual({
      documento_id: repo.findByIdResponse.id,
      cdc: repo.findByIdResponse.cdc,
      events: [
        {
          event_id: "evt-1",
          type: "CANCEL",
          status: "SENT",
          created_at: "2026-05-24T00:00:00.000Z",
          response: null
        }
      ]
    });
  });

  it("returns support decision by documento id", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumento();
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "unused"));

    const result = await getDocumentoDecision(
      {
        ...context,
        user: {
          ...context.user,
          role: "SOPORTE_INTERNO"
        }
      },
      repo.findByIdResponse.id,
      repo,
      gateway
    );

    expect(result.documento_id).toBe(repo.findByIdResponse.id);
    expect(result.emisor_id).toBe("80136968-1");
    expect(result.recommended_action).toBe("WAIT_SYNC");
  });

  it("restricts decision endpoint for operator role", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumento();
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "unused"));

    await expect(getDocumentoDecision(context, repo.findByIdResponse.id, repo, gateway)).rejects.toMatchObject({
      statusCode: 403
    });
  });

  it("returns CDC impact validation for support role", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumento();
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "unused"));

    const result = await validateDocumentoCdcImpact(
      { ...context, user: { ...context.user, role: "SOPORTE_INTERNO" } },
      repo.findByIdResponse.id,
      { json_input: { receptor: { docNro: "492019" } } },
      repo,
      gateway
    );

    expect(result.documento_id).toBe(repo.findByIdResponse.id);
    expect(result.cdc_impact).toBe("CDC_NO_CHANGE");
  });

  it("executes advanced retry/create/cancel-send/void flows for support role", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumento();
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "unused"));
    const support = { ...context, user: { ...context.user, role: "SOPORTE_INTERNO" as const } };

    const retry = await retryDocumentoSameCdc(support, repo.findByIdResponse.id, { mode: "BATCH", send_now: false }, repo, gateway);
    const derived = await createDocumentoDerived(support, repo.findByIdResponse.id, { mode: "BATCH" }, repo, gateway);
    const canceled = await cancelDocumentoSend(support, repo.findByIdResponse.id, { comment: "cancel local queue" }, repo, gateway);
    const voided = await voidDocumentoNumber(support, repo.findByIdResponse.id, { motivo: "Error operacional" }, repo, gateway);

    expect(retry.revision_number).toBe(2);
    expect(derived.derived_document_id).toBe("doc-2");
    expect(canceled.action_result).toBe("CANCELLED");
    expect(voided.event_id).toBe("evt-void-1");
    expect(repo.auditEvents.map((event) => event.eventType)).toEqual([
      "FACTURA_GESTION_RETRY_SAME_CDC",
      "FACTURA_GESTION_CREATE_DERIVED",
      "FACTURA_GESTION_CANCEL_SEND",
      "FACTURA_GESTION_VOID_NUMBER"
    ]);
  });

  it("blocks advanced management actions outside operational window", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumento({
      created_at: "2026-05-01T00:00:00.000Z"
    });
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "unused"));
    const support = { ...context, user: { ...context.user, role: "SOPORTE_INTERNO" as const } };

    await expect(retryDocumentoSameCdc(support, repo.findByIdResponse.id, { mode: "BATCH" }, repo, gateway)).rejects.toMatchObject({
      statusCode: 409
    });
    await expect(createDocumentoDerived(support, repo.findByIdResponse.id, { mode: "BATCH" }, repo, gateway)).rejects.toMatchObject({
      statusCode: 409
    });
    await expect(cancelDocumentoSend(support, repo.findByIdResponse.id, { comment: "x" }, repo, gateway)).rejects.toMatchObject({
      statusCode: 409
    });
    await expect(voidDocumentoNumber(support, repo.findByIdResponse.id, { motivo: "x" }, repo, gateway)).rejects.toMatchObject({
      statusCode: 409
    });
  });

  it("returns batch pending management summary", async () => {
    const gateway = new FakeFiscalGateway(
      new FiscalGatewayError("UPSTREAM_ERROR", "unused"),
      undefined,
      undefined,
      undefined,
      undefined,
      {
        documents: [{ document_id: "doc-1", cdc: "A".repeat(44), nro_factura: "001-001-0000001", status: "PENDING", fecha_emision: null, tipo_documento: "1" }],
        batches: [{ batch_id: "batch-1", did: "1", status: "PROCESSING", doc_count: 1, result_code: "0360", result_message: "OK" }],
        raw: {}
      }
    );

    const result = await getBatchPendientesGestion(context, { limit: 50, offset: 0 }, gateway);
    expect(result.documents_pending).toBe(1);
    expect(result.batches_pending).toBe(1);
    expect(result.documents[0]?.document_id).toBe("doc-1");
    expect(result.batches[0]?.batch_id).toBe("batch-1");
  });

  it("restricts reconciliation endpoint for operator role", async () => {
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "unused"));

    await expect(
      getReconciliacionFiscal(
        {
          ...context,
          user: {
            ...context.user,
            role: "OPERADOR_FACTURACION"
          }
        },
        { offset: 0, limit: 20 },
        gateway
      )
    ).rejects.toMatchObject({
      statusCode: 403
    });
  });

  it("allows reconciliation endpoint for support role", async () => {
    const gateway = new FakeFiscalGateway(
      new FiscalGatewayError("UPSTREAM_ERROR", "unused"),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        items: [{ document_id: "doc-1", cdc: "A".repeat(44), nro_factura: "001-001-0000001", status: "APPROVED", fecha_emision: null, receptor_doc: "492019", receptor_nombre: "CLIENTE" }],
        next: 20,
        raw: {}
      }
    );

    const result = await getReconciliacionFiscal(
      {
        ...context,
        user: {
          ...context.user,
          role: "SOPORTE_INTERNO"
        }
      },
      { offset: 0, limit: 20, q: "492019" },
      gateway
    );

    expect(result.items).toHaveLength(1);
    expect(result.next).toBe(20);
  });
});
