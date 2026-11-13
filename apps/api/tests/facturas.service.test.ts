import { describe, expect, it } from "vitest";
import { env } from "../src/config/env";
import { MockFiscalGateway, llamadasMockNotaCreditoPorClave } from "../src/modules/fiscal-gateway/fiscal-gateway.client";
import { reintentarNotaCreditoPorId } from "../src/modules/facturas/facturas.service";
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
  type FiscalDocumentoCanonicoResponse,
  type FiscalFacturalistaResponse,
  type FiscalIdempotencyReconciliationItem,
  type FiscalRefreshStatusRequest,
  type FiscalRefreshStatusResponse
} from "../src/modules/fiscal-gateway/fiscal-gateway.types";
import {
  emitFacturaAgainstFiscalGateway,
  cancelDocumento,
  emitNotaCreditoTotal,
  emitNotaCredito,
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
  MENSAJE_NOTA_CREDITO_CON_ANTICIPO,
  MENSAJE_NOTA_CREDITO_MONEDA_EXTRANJERA,
  listDocumentos,
  previewFactura,
  MENSAJE_TOPE_INNOMINADO,
  MENSAJE_NOTA_CREDITO_INNOMINADA,
  refreshDocumentoStatus
} from "../src/modules/facturas/facturas.service";
import {
  enqueueFacturaEmission,
  processNextQueuedFiscalEmission,
  retryDocumentoEmission,
  ventanasIdempotencia,
  type RetryEmisionDeps
} from "../src/modules/facturas/facturas.service";
import type { OperationalContextRepository, OperationalContextResponse } from "../src/modules/context/context.types";
import type { ClienteRepository, ClienteResponse, ClienteSearchResult } from "../src/modules/clientes/clientes.types";
import type {
  FacturaPersistInput,
  FacturaQueuedPersistInput,
  FacturaRepository,
  DocumentoResponse,
  NotaCreditoPersistInput,
  NotaCreditoReintentoInput,
  PendingFiscalEmission,
  PendingVerificacion
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
    tipo_transaccion_default: 2,
    fiscal_envio_modo: "BATCH",
    batch_enabled: true
  },
  actividad_punto_perfil_id: "55555555-5555-4555-8555-555555555555"
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
  public lastAdoptInput: Parameters<FacturaRepository["adoptarDocumentoFiscalExistente"]>[0] | null = null;
  public adoptReturnsNull = false;
  public lastCancelInput: Parameters<FacturaRepository["cancelDocumento"]>[0] | null = null;
  public lastNotaCreditoInput: NotaCreditoPersistInput | null = null;
  public markAccionNotificadaCalls: string[] = [];
  public notificationRecipients: string[] = [];
  public failPendingEmissionCreatedAt: string | null = null;
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

  public notasByOriginal: DocumentoResponse[] = [];
  public lastReintentoInput: NotaCreditoReintentoInput | null = null;

  async findNotasCreditoByOriginal(input: { facturadorId: string; documentoId: string }): Promise<DocumentoResponse[]> {
    this.lastFindNceByOriginalInput = input;
    return this.existingNceByOriginal ? [this.existingNceByOriginal, ...this.notasByOriginal] : this.notasByOriginal;
  }

  async updateNotaCreditoTrasReintento(input: NotaCreditoReintentoInput): Promise<DocumentoResponse | null> {
    this.lastReintentoInput = input;
    const base = this.existingNceByOriginal ?? this.notasByOriginal.find((n) => n.id === input.documentoId) ?? null;
    if (!base) return null;
    return {
      ...base,
      estado: input.estado,
      cdc: input.fiscalResponse?.cdc ?? base.cdc,
      document_uuid: input.fiscalResponse?.document_uuid ?? base.document_uuid,
      numero_fiscal: input.fiscalResponse?.numero_fiscal ?? base.numero_fiscal,
      fiscal_status: input.fiscalResponse?.raw ?? input.fiscalError
    };
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

  async registrarInutilizacion(): Promise<DocumentoResponse | null> {
    return null;
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

  async claimNextVerificacion(): Promise<PendingVerificacion[]> {
    return [];
  }

  async scheduleNextVerificacion(): Promise<void> {
    // no-op in tests
  }

  async markAccionNotificada(documentoId: string): Promise<void> {
    this.markAccionNotificadaCalls.push(documentoId);
  }

  async getNotificationRecipients(): Promise<string[]> {
    return this.notificationRecipients;
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
      fiscal_status: input.error,
      ...(this.failPendingEmissionCreatedAt ? { created_at: this.failPendingEmissionCreatedAt } : {})
    });
  }

  async retryPendingEmission(input: Parameters<FacturaRepository["retryPendingEmission"]>[0]): Promise<DocumentoResponse | null> {
    this.lastRetryInput = input;
    return this.retryResponse;
  }

  async getFacturadorApiKey(): Promise<string | null> {
    return null;
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

  // Refleja el repositorio real: la adopcion deja identidad fiscal y PENDIENTE_SIFEN.
  async adoptarDocumentoFiscalExistente(
    input: Parameters<FacturaRepository["adoptarDocumentoFiscalExistente"]>[0]
  ): Promise<DocumentoResponse | null> {
    this.lastAdoptInput = input;
    if (this.adoptReturnsNull || !this.findByIdResponse) {
      return null;
    }
    this.findByIdResponse = {
      ...this.findByIdResponse,
      estado: "PENDIENTE_SIFEN",
      document_uuid: input.documentUuid,
      fiscal_document_id: input.fiscalDocumentId,
      cdc: input.cdc,
      numero_fiscal: input.numeroFiscal,
      fiscal_status: input.fiscalStatus
    };
    return this.findByIdResponse;
  }

  async cancelDocumento(input: Parameters<FacturaRepository["cancelDocumento"]>[0]): Promise<DocumentoResponse | null> {
    this.lastCancelInput = input;
    if (!this.findByIdResponse) {
      return null;
    }

    // Refleja la regla del repositorio real: el estado solo cambia si `anula` (RN-04).
    return {
      ...this.findByIdResponse,
      estado: input.anula ? "ANULADA" : this.findByIdResponse.estado,
      cancelacion: {
        status: input.cancelacion.status,
        rejection_code: input.cancelacion.rejectionCode,
        rejection_message: input.cancelacion.rejectionMessage,
        retryable: input.cancelacion.retryable,
        intentos: (this.findByIdResponse.cancelacion?.intentos ?? 0) + 1,
        last_at: "2026-09-25T00:00:00.000Z"
      },
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

class FakeContextRepository implements OperationalContextRepository {
  public calls: Array<{ actividadPuntoPerfilId: string; valor: 1 | 2 | 3 }> = [];
  public shouldThrow = false;

  async getOperationalContext(): Promise<OperationalContextResponse | null> {
    throw new Error("not implemented");
  }

  async getReadinessChecks() {
    throw new Error("not implemented");
  }

  async updateTipoTransaccionDefault(actividadPuntoPerfilId: string, valor: 1 | 2 | 3): Promise<void> {
    if (this.shouldThrow) {
      throw new Error("db unavailable");
    }
    this.calls.push({ actividadPuntoPerfilId, valor });
  }
}

/** Status canonico de FE equivalente al estado que declara el test (SPEC_ESTADO_FISCAL_CANONICO_v0.1). */
const STATUS_CANONICO_POR_ESTADO: Record<string, string> = {
  EMITIDA: "APPROVED",
  RECHAZADA: "REJECTED",
  ANULADA: "CANCELLED",
  PENDIENTE_SIFEN: "QUEUED_BATCH"
};

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
      // SPEC_PARIDAD_CONTRATO_FE_v0.1: el gateway devuelve el status del contrato de FE
      // sin traducir; solo ACCEPTED anula.
      status: "ACCEPTED",
      rejection: null,
      raw: { event_id: "evt-1", status: "ACCEPTED" }
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

  // El estado lo decide el paso canonico: se deriva del estado que declara cada test.
  async getDocumentoCanonico(documentUuid: string): Promise<FiscalDocumentoCanonicoResponse> {
    if (this.refreshResponse instanceof FiscalGatewayError) {
      throw this.refreshResponse;
    }
    const status = STATUS_CANONICO_POR_ESTADO[this.refreshResponse.estado] ?? null;
    return { status, estado: this.refreshResponse.estado, current_cdc: this.refreshResponse.current_cdc, nro_factura: null, raw: { document_uuid: documentUuid, status } };
  }

  async inutilizarNumeracion() {
    return { event_id: "fake-inut", status: "VOIDED", sifen: null };
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

/** Documento que FE nunca recibio: sin identidad y con el fallo del outbox registrado. */
function buildDocumentoNoRecibido(overrides: Partial<DocumentoResponse> = {}): DocumentoResponse {
  return buildDocumento({
    estado: "ERROR_TEMPORAL",
    document_uuid: null,
    cdc: null,
    fiscal_document_id: null,
    numero_fiscal: null,
    external_ref: "fac_0123456789abcdef0123456789abcdef",
    fiscal_status: { code: "TIMEOUT", message: "Timeout fiscal", recoverable: true },
    ...overrides
  });
}

function buildRetryDeps(
  conciliacion: Partial<FiscalIdempotencyReconciliationItem> | FiscalGatewayError = { result: "NOT_IMPACTED" },
  refresh: FiscalRefreshStatusResponse | FiscalGatewayError = { estado: "EMITIDA", current_cdc: null, raw: { refreshed: true } }
): RetryEmisionDeps & {
  reconcileCalls: Array<Parameters<FiscalGateway["reconcileByIdempotencyKeys"]>[0]>;
  refreshCalls: FiscalRefreshStatusRequest[];
} {
  const reconcileCalls: Array<Parameters<FiscalGateway["reconcileByIdempotencyKeys"]>[0]> = [];
  const refreshCalls: FiscalRefreshStatusRequest[] = [];
  const consumerGateway = {
    async reconcileByIdempotencyKeys(input: Parameters<FiscalGateway["reconcileByIdempotencyKeys"]>[0]) {
      reconcileCalls.push(input);
      if (conciliacion instanceof FiscalGatewayError) {
        throw conciliacion;
      }
      return {
        emisor_id: input.emisorId,
        env: input.env,
        from: input.from,
        to: input.to,
        raw: {},
        items: input.idempotencyKeys.map((key) => ({
          idempotency_key: key,
          result: "NOT_IMPACTED" as const,
          document_uuid: null,
          document_id: null,
          current_cdc: null,
          status: null,
          nro_factura: null,
          created_at: null,
          message: null,
          ...conciliacion
        }))
      };
    }
  } as unknown as FiscalGateway;
  const sharedGateway = {
    async refreshFacturaStatus(request: FiscalRefreshStatusRequest) {
      refreshCalls.push(request);
      if (refresh instanceof FiscalGatewayError) {
        throw refresh;
      }
      return refresh;
    },
    async getDocumentoCanonico() {
      if (refresh instanceof FiscalGatewayError) {
        throw refresh;
      }
      const status = STATUS_CANONICO_POR_ESTADO[refresh.estado] ?? null;
      return { status, estado: refresh.estado, current_cdc: refresh.current_cdc, nro_factura: null, raw: { status } };
    }
  } as unknown as FiscalGateway;
  return { consumerGateway, sharedGateway, feEnv: "test", reconcileCalls, refreshCalls };
}

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
      // SPEC_NOTA_CREDITO_PARCIAL_v0.1: la nota total copia todas las lineas; no queda saldo.
      motivo_no_elegible: "La factura ya esta acreditada por completo."
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

    repo.findByIdResponse = buildDocumentoNoRecibido();
    await retryDocumentoEmission(otherFacturadorContext, "66666666-6666-4666-8666-666666666666", repo, buildRetryDeps());
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

  describe("estado fiscal canonico (SPEC_ESTADO_FISCAL_CANONICO_v0.1)", () => {
    function gatewayCanonico(opts: {
      sifen?: Partial<FiscalRefreshStatusResponse> | FiscalGatewayError;
      canonico: { status: string | null; estado: FiscalDocumentoCanonicoResponse["estado"] } | FiscalGatewayError;
    }) {
      const calls = { sifen: 0, canonico: 0 };
      const gateway = {
        async refreshFacturaStatus() {
          calls.sifen += 1;
          if (opts.sifen instanceof FiscalGatewayError) throw opts.sifen;
          return { estado: "PENDIENTE_SIFEN", current_cdc: null, status_raw: null, result_code: null, result_message: null, raw: {}, ...opts.sifen };
        },
        async getDocumentoCanonico() {
          calls.canonico += 1;
          if (opts.canonico instanceof FiscalGatewayError) throw opts.canonico;
          return { ...opts.canonico, current_cdc: null, nro_factura: null, raw: { status: opts.canonico.status } };
        }
      } as unknown as FiscalGateway;
      return { gateway, calls };
    }

    it("REJECTED en FE con SIFEN 0420 queda RECHAZADA y conserva la causa (CA-01)", async () => {
      const repo = new FakeFacturaRepository();
      repo.findByIdResponse = buildDocumento({ estado: "PENDIENTE_SIFEN" });
      const { gateway } = gatewayCanonico({
        sifen: { result_code: "0420", result_message: "Documento No Existe en SIFEN o ha sido Rechazado" },
        canonico: { status: "REJECTED", estado: "RECHAZADA" }
      });

      const result = await refreshDocumentoStatus(context, "66666666-6666-4666-8666-666666666666", repo, gateway);

      expect(result.estado).toBe("RECHAZADA");
      expect(repo.lastUpdateFiscalStatusInput).toMatchObject({
        estado: "RECHAZADA",
        fiscalStatusRaw: "REJECTED",
        sifenResultCode: "0420"
      });
    });

    it("APPROVED en FE queda EMITIDA aunque SIFEN no devuelva 0260/0422 (CA-02)", async () => {
      const repo = new FakeFacturaRepository();
      repo.findByIdResponse = buildDocumento({ estado: "PENDIENTE_SIFEN" });
      const { gateway } = gatewayCanonico({ sifen: { result_code: "0160" }, canonico: { status: "APPROVED", estado: "EMITIDA" } });

      const result = await refreshDocumentoStatus(context, "66666666-6666-4666-8666-666666666666", repo, gateway);

      expect(result.estado).toBe("EMITIDA");
    });

    it("si la consulta SIFEN falla, decide igual con el estado canonico", async () => {
      const repo = new FakeFacturaRepository();
      repo.findByIdResponse = buildDocumento({ estado: "PENDIENTE_SIFEN" });
      const { gateway, calls } = gatewayCanonico({
        sifen: new FiscalGatewayError("TIMEOUT", "timeout"),
        canonico: { status: "APPROVED", estado: "EMITIDA" }
      });

      const result = await refreshDocumentoStatus(context, "66666666-6666-4666-8666-666666666666", repo, gateway);

      expect(calls).toEqual({ sifen: 1, canonico: 1 });
      expect(result.estado).toBe("EMITIDA");
      expect(repo.lastUpdateFiscalStatusInput).toMatchObject({ sifenResultCode: null });
    });

    it("si el estado canonico falla, responde 502 y no actualiza", async () => {
      const repo = new FakeFacturaRepository();
      repo.findByIdResponse = buildDocumento({ estado: "PENDIENTE_SIFEN" });
      const { gateway } = gatewayCanonico({ canonico: new FiscalGatewayError("UPSTREAM_ERROR", "caido") });

      await expect(refreshDocumentoStatus(context, "66666666-6666-4666-8666-666666666666", repo, gateway)).rejects.toMatchObject({
        statusCode: 502
      });
      expect(repo.lastUpdateFiscalStatusInput).toBeNull();
    });

    it("un status canonico desconocido conserva el estado actual", async () => {
      const repo = new FakeFacturaRepository();
      repo.findByIdResponse = buildDocumento({ estado: "PENDIENTE_SIFEN" });
      const { gateway } = gatewayCanonico({ canonico: { status: "ALGO_NUEVO", estado: null } });

      const result = await refreshDocumentoStatus(context, "66666666-6666-4666-8666-666666666666", repo, gateway);

      expect(result.estado).toBe("PENDIENTE_SIFEN");
      expect(repo.lastUpdateFiscalStatusInput).toMatchObject({ estado: "PENDIENTE_SIFEN", fiscalStatusRaw: "ALGO_NUEVO" });
    });
  });

  it("rejects fiscal status refresh when document has no document_uuid", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumento({
      document_uuid: null,
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
      // SPEC_PARIDAD_CONTRATO_FE_v0.1: el service decide si anula a partir del status de FE,
      // y persiste el resultado del intento aunque no anule.
      anula: true,
      cancelacion: {
        status: "ACCEPTED",
        rejectionCode: null,
        rejectionMessage: null,
        retryable: null
      },
      fiscalStatus: {
        event_id: "evt-1",
        status: "ACCEPTED",
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

    const { documento: result } = await emitNotaCreditoTotal(
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
      // SPEC_NOTA_CREDITO_TRABADA_v0.1, RN-01: la clave del navegador se ignora; la deriva el servidor.
      idempotencyKey: expect.stringMatching(/^nce_[0-9a-f]{32}$/),
      estado: "EMITIDA"
    });
    expect(repo.lastNotaCreditoInput?.idempotencyKey).toBe(repo.lastNotaCreditoInput?.externalRef);
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

  it("SPEC_TOTALES_FE_EN_CARGA_v0.1 RN-07: factura de carga con descuento emite la nota por referencia", async () => {
    const repo = new FakeFacturaRepository();
    const base = buildDocumento({ estado: "EMITIDA", cdc: "A".repeat(44) });
    repo.findByIdResponse = { ...base, totals: { ...base.totals, descuento: 10000, nota_credito_por_referencia: true } };
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "Should not emit"));
    await emitNotaCreditoTotal(context, "66666666-6666-4666-8666-666666666666", { motivo: "Error" }, repo, gateway, { idempotencyKey: "x" });
    expect(gateway.lastNotaCreditoRequest?.por_referencia).toBe(true);

    repo.list = async () => ({ total: 1, items: [repo.findByIdResponse!] });
    const candidates = await listNotaCreditoCandidates(context, { limit: 30, offset: 0 }, repo);
    expect(candidates.items[0]).toMatchObject({ elegible: true });
  });

  describe("comprador sin nombre (SPEC_COMPRADOR_INNOMINADO_v0.1)", () => {
    const innominado = { documento_tipo: "INNOMINADO" as const, documento: "xxx", razon_social: "Juan", cliente_id: "11111111-1111-4111-8111-111111111111", naturaleza: "JURIDICA" as const };

    it("RN-03: el servidor fija documento 0 y nombre Sin Nombre, sin agenda ni naturaleza", async () => {
      const repo = new FakeFacturaRepository();
      await enqueueFacturaEmission(context, { ...emitInput, cliente: innominado }, repo, { idempotencyKey: "idem-innominado" });
      expect(repo.lastQueuedInput?.fiscalRequest.cliente).toMatchObject({
        documento_tipo: "INNOMINADO",
        documento: "0",
        razon_social: "Sin Nombre",
        cliente_id: null,
        naturaleza: null
      });
    });

    it("RN-04: en guaranies, justo debajo del tope pasa y en el tope se rechaza sin encolar", async () => {
      const debajo = previewFactura(context, {
        condicion_venta: "CONTADO",
        cliente: innominado,
        items: [{ descripcion: "Venta", cantidad: 1, precio_unitario: 6_999_999, iva_tipo: "IVA_10" }]
      });
      expect(debajo.totals.total).toBe(6_999_999);
      const repo = new FakeFacturaRepository();
      await expect(
        enqueueFacturaEmission(
          context,
          { ...emitInput, cliente: innominado, items: [{ descripcion: "Venta", cantidad: 1, precio_unitario: 7_000_000, iva_tipo: "IVA_10" }] },
          repo,
          { idempotencyKey: "idem-innominado-tope" }
        )
      ).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR", message: MENSAJE_TOPE_INNOMINADO, details: { reason: "INNOMINADO_SOBRE_TOPE" } });
      expect(repo.lastQueuedInput).toBeNull();
    });

    it("RN-04: en USD el tope es sobre el total por el tipo de cambio", () => {
      const base = { condicion_venta: "CONTADO" as const, moneda: "USD" as const, tipo_cambio: 7000, cliente: innominado };
      expect(previewFactura(context, { ...base, items: [{ descripcion: "Venta", cantidad: 1, precio_unitario: 999.99, iva_tipo: "IVA_10" }] }).totals.total).toBe(999.99);
      expect(() => previewFactura(context, { ...base, items: [{ descripcion: "Venta", cantidad: 1, precio_unitario: 1000, iva_tipo: "IVA_10" }] })).toThrow(MENSAJE_TOPE_INNOMINADO);
    });

    it("RN-04: el tope no aplica a otros tipos de documento", () => {
      const result = previewFactura(context, {
        condicion_venta: "CONTADO",
        cliente: { documento_tipo: "RUC", documento: "80136968-1", razon_social: "Cliente Demo" },
        items: [{ descripcion: "Venta", cantidad: 1, precio_unitario: 9_000_000, iva_tipo: "IVA_10" }]
      });
      expect(result.totals.total).toBe(9_000_000);
    });

    it("RN-06: la factura innominada no admite nota de credito (total, parcial y candidatos) y no llama a FE", async () => {
      const repo = new FakeFacturaRepository();
      const base = buildDocumento({ estado: "EMITIDA", cdc: "A".repeat(44) });
      repo.findByIdResponse = { ...base, cliente: { documento_tipo: "INNOMINADO", documento: "0", razon_social: "Sin Nombre" } };
      const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "Should not emit"));
      await expect(
        emitNotaCreditoTotal(context, "66666666-6666-4666-8666-666666666666", { motivo: "Error" }, repo, gateway, { idempotencyKey: "x" })
      ).rejects.toMatchObject({ statusCode: 409, details: { reason: "NOTA_CREDITO_INNOMINADA" } });
      await expect(
        emitNotaCredito(context, "66666666-6666-4666-8666-666666666666", { motivo: "Error", lineas: [{ line_no: 1, cantidad: 1 }] }, repo, gateway)
      ).rejects.toMatchObject({ statusCode: 409, details: { reason: "NOTA_CREDITO_INNOMINADA" } });
      expect(gateway.lastNotaCreditoRequest).toBeNull();
      repo.list = async () => ({ total: 1, items: [repo.findByIdResponse!] });
      const candidates = await listNotaCreditoCandidates(context, { limit: 30, offset: 0 }, repo);
      expect(candidates.items[0]).toMatchObject({ elegible: false, motivo_no_elegible: MENSAJE_NOTA_CREDITO_INNOMINADA });
    });
  });

  describe("moneda extranjera (SPEC_MONEDA_EXTRANJERA_v0.1)", () => {
    it("la vista previa en USD calcula con 2 decimales", () => {
      const result = previewFactura(context, {
        condicion_venta: "CONTADO",
        moneda: "USD",
        tipo_cambio: 7350.5,
        cliente: { documento_tipo: "RUC", documento: "80136968-1", razon_social: "Cliente Demo" },
        items: [{ descripcion: "Consultoria", cantidad: 2, precio_unitario: 150.25, iva_tipo: "IVA_10" }]
      });
      expect(result.totals).toMatchObject({ total: 300.5, iva_10: 27.32, total_sin_iva: 273.18 });
    });

    it("RN-06: la vista previa acepta cantidad decimal (PYG y USD)", () => {
      const cliente = { documento_tipo: "RUC" as const, documento: "80136968-1", razon_social: "Cliente Demo" };
      const pyg = previewFactura(context, { condicion_venta: "CONTADO", cliente, items: [{ descripcion: "Kilos", cantidad: 2.5, precio_unitario: 10001, iva_tipo: "IVA_10" }] });
      expect(pyg.totals.total).toBe(25003);
      expect(pyg.items[0].cantidad).toBe(2.5);
      const usd = previewFactura(context, {
        condicion_venta: "CONTADO",
        moneda: "USD",
        tipo_cambio: 6329.77,
        cliente,
        items: [{ descripcion: "Horas", cantidad: 1.5, precio_unitario: 150.25, iva_tipo: "IVA_10" }]
      });
      expect(usd.totals).toMatchObject({ total: 225.38, iva_10: 20.49 });
    });

    it("D-1: la nota de credito de una factura en USD se bloquea sin llamar a FE", async () => {
      const repo = new FakeFacturaRepository();
      repo.findByIdResponse = { ...buildDocumento({ estado: "EMITIDA", cdc: "A".repeat(44) }), moneda: "USD", tipo_cambio: 7350.5 };
      const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "Should not emit"));
      await expect(
        emitNotaCreditoTotal(context, "66666666-6666-4666-8666-666666666666", { motivo: "Error" }, repo, gateway, { idempotencyKey: "x" })
      ).rejects.toMatchObject({ statusCode: 409, details: { reason: "NOTA_CREDITO_MONEDA_EXTRANJERA" } });
      expect(gateway.lastNotaCreditoRequest).toBeNull();
      repo.list = async () => ({ total: 1, items: [repo.findByIdResponse!] });
      const candidates = await listNotaCreditoCandidates(context, { limit: 30, offset: 0 }, repo);
      expect(candidates.items[0]).toMatchObject({ elegible: false, motivo_no_elegible: MENSAJE_NOTA_CREDITO_MONEDA_EXTRANJERA });
    });

    it("D-1 con FE_NC_MONEDA_EXTRANJERA: la nota de una factura en USD va por referencia y guarda la moneda", async () => {
      const previo = env.FE_NC_MONEDA_EXTRANJERA;
      env.FE_NC_MONEDA_EXTRANJERA = true;
      try {
        const repo = new FakeFacturaRepository();
        repo.findByIdResponse = { ...buildDocumento({ estado: "EMITIDA", cdc: "A".repeat(44) }), moneda: "USD", tipo_cambio: 7350.5 };
        const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "Should not emit"));
        await emitNotaCreditoTotal(context, "66666666-6666-4666-8666-666666666666", { motivo: "Error" }, repo, gateway, { idempotencyKey: "x" });
        expect(gateway.lastNotaCreditoRequest?.por_referencia).toBe(true);
        expect(repo.lastNotaCreditoInput?.original).toMatchObject({ moneda: "USD", tipo_cambio: 7350.5 });
        repo.list = async () => ({ total: 1, items: [repo.findByIdResponse!] });
        const candidates = await listNotaCreditoCandidates(context, { limit: 30, offset: 0 }, repo);
        expect(candidates.items[0]).toMatchObject({ elegible: true });
      } finally {
        env.FE_NC_MONEDA_EXTRANJERA = previo;
      }
    });
  });

  it("SPEC_TOTALES_FE_EN_CARGA_v0.1 RN-08: factura de carga con anticipo no emite nota de credito ni llama a FE", async () => {
    const repo = new FakeFacturaRepository();
    const base = buildDocumento({ estado: "EMITIDA", cdc: "A".repeat(44) });
    repo.findByIdResponse = { ...base, totals: { ...base.totals, anticipo: 50000, nota_credito_por_referencia: true } };
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "Should not emit"));
    await expect(
      emitNotaCreditoTotal(context, "66666666-6666-4666-8666-666666666666", { motivo: "Error" }, repo, gateway, { idempotencyKey: "x" })
    ).rejects.toMatchObject({ statusCode: 409, details: { reason: "NOTA_CREDITO_CON_ANTICIPO" } });
    expect(gateway.lastNotaCreditoRequest).toBeNull();

    repo.list = async () => ({ total: 1, items: [repo.findByIdResponse!] });
    const candidates = await listNotaCreditoCandidates(context, { limit: 30, offset: 0 }, repo);
    expect(candidates.items[0]).toMatchObject({ elegible: false, motivo_no_elegible: MENSAJE_NOTA_CREDITO_CON_ANTICIPO });
  });

  it("sin marca, la nota de credito va con lineas como siempre", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumento({ estado: "EMITIDA", cdc: "A".repeat(44) });
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "Should not emit"));
    await emitNotaCreditoTotal(context, "66666666-6666-4666-8666-666666666666", { motivo: "Error" }, repo, gateway, { idempotencyKey: "x" });
    expect(gateway.lastNotaCreditoRequest?.por_referencia).toBeUndefined();
  });

  it("same invoice and attempt always derive the same key (RN-01)", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumento({ estado: "EMITIDA", cdc: "A".repeat(44) });
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "Should not emit"));

    await emitNotaCreditoTotal(context, "66666666-6666-4666-8666-666666666666", { motivo: "x" }, repo, gateway, { idempotencyKey: "a" });
    const primera = repo.lastNotaCreditoInput?.externalRef;
    await emitNotaCreditoTotal(context, "66666666-6666-4666-8666-666666666666", { motivo: "x" }, repo, gateway, { idempotencyKey: "b" });

    expect(primera).toMatch(/^nce_/);
    expect(repo.lastNotaCreditoInput?.externalRef).toBe(primera);
    expect(gateway.lastNotaCreditoRequest?.external_ref).toBe(primera);
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

    const { documento: result } = await emitNotaCreditoTotal(
      context,
      "66666666-6666-4666-8666-666666666666",
      { motivo: "Devolucion total" },
      repo,
      gateway,
      { idempotencyKey: "nce-idem-4" }
    );

    expect(result.estado).toBe("PENDIENTE_SIFEN");
    expect(repo.lastNotaCreditoInput?.fiscalError).toMatchObject({
      code: "TRANSMISSION_FAILED",
      recoverable: true,
      suggested_action: "RETRY"
    });
    expect(repo.lastNotaCreditoInput?.trabada).toBe(true);
    expect(result.accion).toBe("REQUIERE_ACCION");
    expect(result.accion_detalle?.acciones_sugeridas).toEqual(["REINTENTAR_NOTA_CREDITO"]);
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

  it("retries emission only after FE confirms NOT_IMPACTED", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumentoNoRecibido();
    repo.retryResponse = buildDocumento({
      estado: "EMITIENDO",
      document_uuid: null,
      cdc: null,
      fiscal_document_id: null,
      numero_fiscal: null,
      fiscal_status: { recoverable: true, action: "RETRY_EMISSION_REQUESTED" }
    });
    const deps = buildRetryDeps();

    const result = await retryDocumentoEmission(context, "66666666-6666-4666-8666-666666666666", repo, deps);

    expect(result.estado).toBe("EMITIENDO");
    expect(repo.lastRetryInput).toEqual({
      facturadorId: context.facturador.id,
      documentoId: "66666666-6666-4666-8666-666666666666",
      requestedBy: context.user.id
    });
    expect(deps.reconcileCalls).toHaveLength(1);
    expect(deps.reconcileCalls[0]).toMatchObject({
      emisorId: context.facturador.emisor_id,
      env: "test",
      idempotencyKeys: ["fac_0123456789abcdef0123456789abcdef"]
    });
    expect(repo.lastAdoptInput).toBeNull();
  });

  it("adopts the FE document instead of retrying when FE reports IMPACTED", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumentoNoRecibido();
    const deps = buildRetryDeps({
      result: "IMPACTED",
      document_uuid: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      document_id: "158",
      current_cdc: "C".repeat(44),
      status: "QUEUED_BATCH",
      nro_factura: "001-001-0001086"
    });

    const result = await retryDocumentoEmission(context, "66666666-6666-4666-8666-666666666666", repo, deps);

    expect(repo.lastRetryInput).toBeNull();
    expect(repo.lastAdoptInput).toMatchObject({
      documentUuid: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      fiscalDocumentId: "158",
      cdc: "C".repeat(44),
      numeroFiscal: "001-001-0001086"
    });
    // El refresh posterior va por UUID con el gateway de clave compartida.
    expect(deps.refreshCalls).toEqual([{ documentUuid: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb" }]);
    expect(result.estado).toBe("EMITIDA");
    expect(result.puede_reintentar_emision).toBe(false);
  });

  it("returns the adopted document when the refresh after adoption fails", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumentoNoRecibido();
    const deps = buildRetryDeps(
      { result: "IMPACTED", document_uuid: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb", current_cdc: "C".repeat(44) },
      new FiscalGatewayError("TIMEOUT", "timeout")
    );

    const result = await retryDocumentoEmission(context, "66666666-6666-4666-8666-666666666666", repo, deps);

    expect(result.estado).toBe("PENDIENTE_SIFEN");
    expect(result.document_uuid).toBe("bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb");
    expect(repo.lastRetryInput).toBeNull();
  });

  it.each(["DUPLICATE_CONFLICT", "INVALID_KEY"] as const)("asks for support when FE reports %s", async (result) => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumentoNoRecibido();

    await expect(
      retryDocumentoEmission(context, "66666666-6666-4666-8666-666666666666", repo, buildRetryDeps({ result }))
    ).rejects.toMatchObject({ statusCode: 409, code: "CONFLICT", details: { motivo: "REQUIERE_SOPORTE", result } });
    expect(repo.lastRetryInput).toBeNull();
    expect(repo.lastAdoptInput).toBeNull();
  });

  it("never retries blindly when the idempotency check fails", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumentoNoRecibido();
    const deps = buildRetryDeps(new FiscalGatewayError("UPSTREAM_ERROR", "403 FORBIDDEN"));

    await expect(retryDocumentoEmission(context, "66666666-6666-4666-8666-666666666666", repo, deps)).rejects.toMatchObject({
      statusCode: 503,
      details: { motivo: "CONFIRMACION_NO_DISPONIBLE", gateway_code: "UPSTREAM_ERROR" }
    });
    expect(repo.lastRetryInput).toBeNull();
  });

  it("tells the operator to verify when FE already received the document", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumento({ estado: "PENDIENTE_SIFEN" });
    const deps = buildRetryDeps();

    await expect(retryDocumentoEmission(context, "66666666-6666-4666-8666-666666666666", repo, deps)).rejects.toMatchObject({
      statusCode: 409,
      message: "Este documento ya fue recibido por facturacion electronica. Usa 'Verificar estado fiscal'."
    });
    expect(deps.reconcileCalls).toHaveLength(0);
    expect(repo.lastRetryInput).toBeNull();
  });

  it("rejects retry for final fiscal states", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumentoNoRecibido({ estado: "EMITIDA" });

    await expect(
      retryDocumentoEmission(context, "66666666-6666-4666-8666-666666666666", repo, buildRetryDeps())
    ).rejects.toMatchObject({ statusCode: 409, code: "CONFLICT" });
    expect(repo.lastRetryInput).toBeNull();
  });

  it("reports a race when the outbox job is already being processed", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumentoNoRecibido();
    repo.retryResponse = null;

    await expect(
      retryDocumentoEmission(context, "66666666-6666-4666-8666-666666666666", repo, buildRetryDeps())
    ).rejects.toMatchObject({ statusCode: 409, code: "CONFLICT" });
  });

  it("queries the creation window and the last 7 days for documents older than 7 days", async () => {
    const now = new Date("2026-10-15T12:00:00Z");
    const createdAt = new Date("2026-09-30T12:00:00Z");

    const ventanas = ventanasIdempotencia(createdAt, now);

    expect(ventanas).toEqual([
      { from: new Date("2026-09-30T11:55:00Z"), to: new Date("2026-10-07T11:55:00Z") },
      { from: new Date("2026-10-08T12:00:00Z"), to: now }
    ]);
    expect(ventanasIdempotencia(new Date("2026-10-15T10:00:00Z"), now)).toEqual([
      { from: new Date("2026-10-15T09:55:00Z"), to: now }
    ]);
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

  it("RN-22 carga masiva: un contexto con numeracion del cliente no emite facturas una por una", async () => {
    const repo = new FakeFacturaRepository();
    const contextoCliente: OperationalContextResponse = {
      ...context,
      fiscal_context: { ...context.fiscal_context, numeracion_facturas: "CLIENTE" }
    };

    await expect(
      enqueueFacturaEmission(contextoCliente, emitInput, repo, { idempotencyKey: "idem-numeracion-cliente" })
    ).rejects.toMatchObject({ statusCode: 409, code: "CONFLICT", details: { reason: "NUMERACION_DEL_CLIENTE" } });
    expect(repo.lastQueuedInput).toBeNull();
  });

  it("RN-22 carga masiva: con numeracion de FE, explicita o ausente, la emision sigue igual", async () => {
    const repo = new FakeFacturaRepository();
    const contextoServicio: OperationalContextResponse = {
      ...context,
      fiscal_context: { ...context.fiscal_context, numeracion_facturas: "SERVICIO" }
    };

    const result = await enqueueFacturaEmission(contextoServicio, emitInput, repo, { idempotencyKey: "idem-numeracion-fe" });

    expect(result.estado).toBe("EMITIENDO");
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
      naturaleza: "JURIDICA",
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
      direccion: "Direccion guardada",
      naturaleza: "JURIDICA"
    });
    expect(repo.lastQueuedInput?.fiscalRequest.cliente).toMatchObject({
      email: "guardado@example.com",
      telefono: "0981000000",
      direccion: "Direccion guardada",
      naturaleza: "JURIDICA"
    });
    expect(clientes.lastFindByIdInput).toEqual({
      clienteId: "99999999-9999-4999-8999-999999999999",
      facturadorId: context.facturador.id
    });
  });

  it("keeps explicit naturaleza from the request instead of the saved agenda value", async () => {
    const repo = new FakeFacturaRepository();
    const clientes = new FakeClienteRepository();
    clientes.findByIdResponse = {
      source: "AGENDA_FACTURADOR",
      cliente_id: "99999999-9999-4999-8999-999999999999",
      documento_tipo: "RUC",
      documento: "80136968-1",
      razon_social: "Cliente Demo",
      direccion: null,
      telefono: null,
      email: null,
      naturaleza: "FISICA",
      activo: true
    };

    const result = await enqueueFacturaEmission(
      context,
      {
        ...emitInput,
        cliente: {
          ...emitInput.cliente,
          cliente_id: "99999999-9999-4999-8999-999999999999",
          naturaleza: "JURIDICA"
        }
      },
      repo,
      {
        idempotencyKey: "idem-async-client-naturaleza",
        clienteRepository: clientes
      }
    );

    expect(result.cliente).toMatchObject({ naturaleza: "JURIDICA" });
  });

  it("persists tipo_transaccion_default at enqueue time when a contextRepository is provided", async () => {
    const repo = new FakeFacturaRepository();
    const contextRepository = new FakeContextRepository();

    await enqueueFacturaEmission(
      context,
      { ...emitInput, tipo_transaccion: 1 },
      repo,
      { idempotencyKey: "idem-tipo-transaccion-1", contextRepository }
    );

    expect(contextRepository.calls).toEqual([
      { actividadPuntoPerfilId: context.actividad_punto_perfil_id, valor: 1 }
    ]);
  });

  it("does not persist tipo_transaccion_default when no contextRepository is provided", async () => {
    const repo = new FakeFacturaRepository();

    const result = await enqueueFacturaEmission(context, { ...emitInput, tipo_transaccion: 3 }, repo, {
      idempotencyKey: "idem-tipo-transaccion-no-repo"
    });

    expect(result.estado).toBe("EMITIENDO");
  });

  it("does not fail the queued emission when persisting tipo_transaccion_default throws", async () => {
    const repo = new FakeFacturaRepository();
    const contextRepository = new FakeContextRepository();
    contextRepository.shouldThrow = true;

    const result = await enqueueFacturaEmission(
      context,
      { ...emitInput, tipo_transaccion: 1 },
      repo,
      { idempotencyKey: "idem-tipo-transaccion-fails", contextRepository }
    );

    expect(result.estado).toBe("EMITIENDO");
  });

  it("does not revert tipo_transaccion_default when the async fiscal emission fails afterwards", async () => {
    const repo = new FakeFacturaRepository();
    const contextRepository = new FakeContextRepository();

    await enqueueFacturaEmission(
      context,
      { ...emitInput, tipo_transaccion: 1 },
      repo,
      { idempotencyKey: "idem-tipo-transaccion-async-failure", contextRepository }
    );

    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "SIFEN rechazo el documento"));
    await processNextQueuedFiscalEmission(repo, gateway);

    expect(contextRepository.calls).toEqual([
      { actividadPuntoPerfilId: context.actividad_punto_perfil_id, valor: 1 }
    ]);
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
      fiscalRequest,
      attempts: 1,
      documentoCreatedAt: new Date().toISOString(),
      accionNotificadaAt: null
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
      },
      attempts: 1,
      documentoCreatedAt: new Date().toISOString(),
      accionNotificadaAt: null
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
      },
      attempts: 1,
      documentoCreatedAt: new Date().toISOString(),
      accionNotificadaAt: null
    };
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "SIFEN no disponible"));

    const result = await processNextQueuedFiscalEmission(repo, gateway);

    expect(result?.estado).toBe("ERROR_TEMPORAL");
    expect(repo.lastFailedInput).toMatchObject({
      outboxEstado: "FAILED_TEMP",
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

  function pendingEmissionAt(overrides: Partial<PendingFiscalEmission>): PendingFiscalEmission {
    return {
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
      },
      attempts: 1,
      documentoCreatedAt: new Date().toISOString(),
      accionNotificadaAt: null,
      ...overrides
    };
  }

  it.each([
    [1, 60],
    [2, 5 * 60],
    [3, 15 * 60],
    [4, 30 * 60],
    [5, 60 * 60],
    [6, 2 * 60 * 60],
    [7, 4 * 60 * 60],
    [8, 6 * 60 * 60],
    [9, 6 * 60 * 60]
  ])("computes growing backoff for attempt %i -> %i seconds", async (attempts, expectedRetryAfterSeconds) => {
    const repo = new FakeFacturaRepository();
    repo.pendingEmission = pendingEmissionAt({ attempts });
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "SIFEN no disponible"));

    await processNextQueuedFiscalEmission(repo, gateway);

    expect(repo.lastFailedInput).toMatchObject({
      outboxEstado: "FAILED_TEMP",
      retryAfterSeconds: expectedRetryAfterSeconds
    });
  });

  it("cuts over to FAILED_PERM once the document is 24h or older, marking the error as non recoverable", async () => {
    const repo = new FakeFacturaRepository();
    repo.pendingEmission = pendingEmissionAt({
      attempts: 40,
      documentoCreatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    });
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "SIFEN no disponible"));

    const result = await processNextQueuedFiscalEmission(repo, gateway);

    expect(result?.estado).toBe("ERROR_TEMPORAL");
    expect(repo.lastFailedInput).toMatchObject({
      outboxEstado: "FAILED_PERM",
      estado: "ERROR_TEMPORAL",
      error: {
        recoverable: false,
        retry_after_seconds: null,
        suggested_action: "CONTACTAR_SOPORTE"
      }
    });
  });

  it("forces ERROR_TEMPORAL (not PENDIENTE_SIFEN) on cutover even for a TIMEOUT error", async () => {
    const repo = new FakeFacturaRepository();
    repo.pendingEmission = pendingEmissionAt({
      attempts: 40,
      documentoCreatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
    });
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("TIMEOUT", "Timeout fiscal"));

    const result = await processNextQueuedFiscalEmission(repo, gateway);

    expect(result?.estado).toBe("ERROR_TEMPORAL");
    expect(repo.lastFailedInput).toMatchObject({
      outboxEstado: "FAILED_PERM",
      estado: "ERROR_TEMPORAL"
    });
  });

  it("notifies accion requerida once a failed document is older than the 1h threshold and accion_notificada_at is null", async () => {
    const repo = new FakeFacturaRepository();
    repo.notificationRecipients = ["ops@example.com"];
    // 2h, inequivoco por encima del umbral de 1h (evita el borde exacto del default de buildDocumento).
    repo.failPendingEmissionCreatedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    repo.pendingEmission = pendingEmissionAt({ accionNotificadaAt: null });
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "SIFEN no disponible"));

    await processNextQueuedFiscalEmission(repo, gateway);

    expect(repo.markAccionNotificadaCalls).toEqual(["77777777-7777-4777-8777-777777777777"]);
  });

  it("does not notify again when accion_notificada_at is already set", async () => {
    const repo = new FakeFacturaRepository();
    repo.notificationRecipients = ["ops@example.com"];
    repo.pendingEmission = pendingEmissionAt({ accionNotificadaAt: new Date().toISOString() });
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "SIFEN no disponible"));

    await processNextQueuedFiscalEmission(repo, gateway);

    expect(repo.markAccionNotificadaCalls).toHaveLength(0);
  });

  it("does not fail the emission handling when notifying accion requerida throws", async () => {
    const repo = new FakeFacturaRepository();
    repo.notificationRecipients = ["ops@example.com"];
    repo.failPendingEmissionCreatedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    repo.getNotificationRecipients = async () => {
      throw new Error("smtp down");
    };
    repo.pendingEmission = pendingEmissionAt({ accionNotificadaAt: null });
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "SIFEN no disponible"));

    const result = await processNextQueuedFiscalEmission(repo, gateway);

    expect(result?.estado).toBe("ERROR_TEMPORAL");
    expect(repo.markAccionNotificadaCalls).toEqual(["77777777-7777-4777-8777-777777777777"]);
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
    // RN-F1-1.3: desde F1 devuelve el documento local, no la respuesta de FE.
    expect(canceled.id).toBe(repo.findByIdResponse.id);
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
    // RN-F1-1.6: cancel-send no tiene ventana: aplica antes de transmitir a SIFEN.
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

/** SPEC_NOTA_CREDITO_TRABADA_v0.1, CA-01 a CA-05, con el mock de FE de FS (PLAN, seccion 6). */
describe("nota de credito trabada (FS-38)", () => {
  const FACTURA_ID = "66666666-6666-4666-8666-666666666666";

  class RepoConNotas extends FakeFacturaRepository {
    private seq = 0;
    async createNotaCreditoFromFactura(input: NotaCreditoPersistInput): Promise<DocumentoResponse> {
      const base = await super.createNotaCreditoFromFactura(input);
      if (this.notasByOriginal.some((n) => n.external_ref === input.externalRef && n.estado !== "RECHAZADA")) {
        throw new Error("violacion del indice unico");
      }
      this.seq += 1;
      const nota = {
        ...base,
        id: `nota-${this.seq}`,
        external_ref: input.externalRef,
        document_uuid: input.fiscalResponse?.document_uuid ?? null,
        numero_fiscal: input.fiscalResponse?.numero_fiscal ?? null,
        nce_motivo: input.motivo,
        fiscal_status: input.fiscalResponse?.raw ?? input.fiscalError,
        created_at: new Date().toISOString()
      };
      this.notasByOriginal.push(nota);
      return nota;
    }
    async updateNotaCreditoTrasReintento(input: NotaCreditoReintentoInput) {
      const actual = await super.updateNotaCreditoTrasReintento(input);
      if (actual) this.notasByOriginal = this.notasByOriginal.map((n) => (n.id === input.documentoId ? actual : n));
      return actual;
    }
    async findById(input: { facturadorId: string; documentoId: string }): Promise<DocumentoResponse | null> {
      return this.notasByOriginal.find((n) => n.id === input.documentoId) ?? (await super.findById(input));
    }
  }

  class GatewayConMock extends FakeFiscalGateway {
    readonly mock = new MockFiscalGateway({ mode: "mock", baseUrl: "http://mock", timeoutMs: 1000, environment: "test" });
    public claves: string[] = [];
    constructor() {
      super(new FiscalGatewayError("UPSTREAM_ERROR", "no se usa"));
    }
    async emitNotaCredito(request: FiscalEmitNotaCreditoRequest): Promise<FiscalEmitNotaCreditoResponse> {
      this.claves.push(request.external_ref);
      return this.mock.emitNotaCredito(request);
    }
  }

  function preparar() {
    const repo = new RepoConNotas();
    repo.findByIdResponse = buildDocumento({ id: FACTURA_ID, estado: "EMITIDA", cdc: "A".repeat(44) });
    return { repo, gateway: new GatewayConMock() };
  }

  for (const marcador of ["[FE-502]", "[FE-504]", "[FE-500]", "[FE-DRAFT]"]) {
    it(`${marcador}: queda trabada y el reintento con la misma clave la deja emitida (CA-01, CA-02)`, async () => {
      // Facturador propio por caso: el mock cuenta llamadas por clave a nivel de modulo.
      const ctx = { ...context, facturador: { ...context.facturador, id: `fac-${marcador}` } };
      const { repo, gateway } = preparar();

      const { documento: trabada, reintento } = await emitNotaCreditoTotal(ctx, FACTURA_ID, { motivo: `${marcador} devolucion` }, repo, gateway);
      expect(reintento).toBe(false);
      expect(trabada.estado).toBe("PENDIENTE_SIFEN");
      expect(trabada.accion).toBe("REQUIERE_ACCION");
      expect(trabada.accion_detalle?.titulo).toBe("Nota de crédito sin confirmar");
      expect(trabada.accion_detalle?.acciones_sugeridas).toEqual(["REINTENTAR_NOTA_CREDITO"]);
      expect(trabada.puede_reintentar_emision).toBe(false);
      expect(repo.lastNotaCreditoInput?.trabada).toBe(true);

      const emitida = await reintentarNotaCreditoPorId(ctx, trabada.id, repo, gateway);
      expect(emitida.estado).toBe("EMITIDA");
      expect(emitida.document_uuid).toBeTruthy();
      expect(emitida.numero_fiscal).toBeTruthy();
      expect(gateway.claves).toHaveLength(2);
      expect(gateway.claves[1]).toBe(gateway.claves[0]);
      expect(llamadasMockNotaCreditoPorClave(gateway.claves[0]!)).toBe(2);
    });
  }

  it("un nuevo pedido sobre la misma factura reintenta la trabada en vez de crear otra (RN-02, CA-04)", async () => {
    const ctx = { ...context, facturador: { ...context.facturador, id: "fac-recarga" } };
    const { repo, gateway } = preparar();
    await emitNotaCreditoTotal(ctx, FACTURA_ID, { motivo: "[FE-502] devolucion" }, repo, gateway, { idempotencyKey: "pagina-1" });
    // El operador recarga la pagina: el navegador manda otra clave, que se ignora.
    const { documento, reintento } = await emitNotaCreditoTotal(ctx, FACTURA_ID, { motivo: "[FE-502] devolucion" }, repo, gateway, {
      idempotencyKey: "pagina-2"
    });
    expect(reintento).toBe(true);
    expect(documento.estado).toBe("EMITIDA");
    expect(repo.notasByOriginal).toHaveLength(1);
    expect(new Set(gateway.claves).size).toBe(1);
  });

  it("409 idempotent TRANSMISSION_FAILED sigue trabada hasta que FE la completa (RN-04, RN-11)", async () => {
    const ctx = { ...context, facturador: { ...context.facturador, id: "fac-tf409" } };
    const { repo, gateway } = preparar();
    const { documento } = await emitNotaCreditoTotal(ctx, FACTURA_ID, { motivo: "[FE-TF-409] devolucion" }, repo, gateway);
    expect(documento.accion_detalle?.acciones_sugeridas).toEqual(["REINTENTAR_NOTA_CREDITO"]);
    const segunda = await reintentarNotaCreditoPorId(ctx, documento.id, repo, gateway);
    expect(segunda.estado).toBe("PENDIENTE_SIFEN");
    expect(segunda.accion).toBe("REQUIERE_ACCION");
    const tercera = await reintentarNotaCreditoPorId(ctx, documento.id, repo, gateway);
    expect(tercera.estado).toBe("EMITIDA");
  });

  it("una nota rechazada permite emitir otra con el intento siguiente y otra clave (RN-02, RN-07, CA-05)", async () => {
    const ctx = { ...context, facturador: { ...context.facturador, id: "fac-rechazo" } };
    const { repo, gateway } = preparar();
    const { documento: rechazada } = await emitNotaCreditoTotal(ctx, FACTURA_ID, { motivo: "[FE-REJECTED] devolucion" }, repo, gateway);
    expect(rechazada.estado).toBe("RECHAZADA");
    expect(rechazada.accion_detalle?.acciones_sugeridas[0]).toBe("NUEVA_NOTA_CREDITO");
    expect(rechazada.accion_detalle?.acciones_sugeridas).not.toContain("CORREGIR_REEMITIR");

    const { documento: segunda } = await emitNotaCreditoTotal(ctx, FACTURA_ID, { motivo: "devolucion corregida" }, repo, gateway);
    expect(segunda.estado).toBe("EMITIDA");
    expect(gateway.claves[1]).not.toBe(gateway.claves[0]);
  });

  it("con una nota emitida, otra responde 409 y no llama a FE", async () => {
    const ctx = { ...context, facturador: { ...context.facturador, id: "fac-emitida" } };
    const { repo, gateway } = preparar();
    await emitNotaCreditoTotal(ctx, FACTURA_ID, { motivo: "devolucion" }, repo, gateway);
    await expect(emitNotaCreditoTotal(ctx, FACTURA_ID, { motivo: "otra" }, repo, gateway)).rejects.toMatchObject({ statusCode: 409 });
    expect(gateway.claves).toHaveLength(1);
  });

  it("CREDIT_NOTE_TOTAL_EXCEEDED no persiste y pide soporte (RN-10)", async () => {
    const ctx = { ...context, facturador: { ...context.facturador, id: "fac-total" } };
    const { repo, gateway } = preparar();
    await expect(emitNotaCreditoTotal(ctx, FACTURA_ID, { motivo: "[FE-TOTAL] x" }, repo, gateway)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("Requiere soporte")
    });
    expect(repo.notasByOriginal).toHaveLength(0);
  });

  it("reintentar una nota que no esta trabada responde 409", async () => {
    const ctx = { ...context, facturador: { ...context.facturador, id: "fac-no-trabada" } };
    const { repo, gateway } = preparar();
    const { documento } = await emitNotaCreditoTotal(ctx, FACTURA_ID, { motivo: "devolucion" }, repo, gateway);
    await expect(reintentarNotaCreditoPorId(ctx, documento.id, repo, gateway)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("dos pedidos simultaneos producen una sola nota (RN-09, CA-03)", async () => {
    const ctx = { ...context, facturador: { ...context.facturador, id: "fac-doble" } };
    const { repo, gateway } = preparar();
    const resultados = await Promise.allSettled([
      emitNotaCreditoTotal(ctx, FACTURA_ID, { motivo: "devolucion" }, repo, gateway),
      emitNotaCreditoTotal(ctx, FACTURA_ID, { motivo: "devolucion" }, repo, gateway)
    ]);
    expect(repo.notasByOriginal).toHaveLength(1);
    expect(new Set(gateway.claves).size).toBe(1);
    expect(resultados.filter((r) => r.status === "fulfilled").length).toBeGreaterThanOrEqual(1);
  });
});

describe("perfil de emision en el documento (SPEC_MULTIPERFIL_USUARIO_v0.1 RN-05, D-1)", () => {
  const PERFIL_002 = "99999999-0002-4999-8999-999999999999";
  const contexto002: OperationalContextResponse = {
    ...context,
    actividad_punto_perfil_id: PERFIL_002,
    fiscal_context: { ...context.fiscal_context, punto_expedicion: "002", perfil_emision_codigo: "P002" }
  };

  it("la factura encolada persiste el perfil del contexto del pedido", async () => {
    const repo = new FakeFacturaRepository();
    await enqueueFacturaEmission(contexto002, emitInput, repo, { idempotencyKey: "idem-perfil-002" });
    expect(repo.lastQueuedInput?.actividadPuntoPerfilId).toBe(PERFIL_002);
    expect(repo.lastQueuedInput?.fiscalRequest.fiscal_context).toMatchObject({ punto_expedicion: "002", perfil_emision_codigo: "P002" });
  });

  it("la NC sobre una factura de otro punto sale y se guarda con el perfil ACTIVO", async () => {
    const repo = new FakeFacturaRepository();
    repo.findByIdResponse = buildDocumento({
      estado: "EMITIDA",
      cdc: "A".repeat(44),
      numero_fiscal: "001-001-0000001",
      perfil_emision: { establecimiento: "001", punto_expedicion: "001", perfil_emision_codigo: "P001", alias: null }
    });
    const gateway = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "Should not emit"));

    await emitNotaCreditoTotal(contexto002, "66666666-6666-4666-8666-666666666666", { motivo: "Devolucion" }, repo, gateway, {
      idempotencyKey: "nce-perfil-002"
    });

    expect(repo.lastNotaCreditoInput?.actividadPuntoPerfilId).toBe(PERFIL_002);
    expect(gateway.lastNotaCreditoRequest?.fiscal_context).toMatchObject({ punto_expedicion: "002", perfil_emision_codigo: "P002" });
  });

  it("la idempotencia de la NC no depende del perfil (RN-12)", async () => {
    const repo = new FakeFacturaRepository();
    const factura = buildDocumento({ estado: "EMITIDA", cdc: "A".repeat(44), numero_fiscal: "001-001-0000001" });
    repo.findByIdResponse = factura;
    const g1 = new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "x"));
    await emitNotaCreditoTotal(context, factura.id, { motivo: "a" }, repo, g1, { idempotencyKey: "k" });
    const clave1 = repo.lastNotaCreditoInput?.externalRef;
    const repo2 = new FakeFacturaRepository();
    repo2.findByIdResponse = factura;
    await emitNotaCreditoTotal(contexto002, factura.id, { motivo: "a" }, repo2, new FakeFiscalGateway(new FiscalGatewayError("UPSTREAM_ERROR", "x")), { idempotencyKey: "k" });
    expect(repo2.lastNotaCreditoInput?.externalRef).toBe(clave1);
  });
});
