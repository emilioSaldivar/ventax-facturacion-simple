import crypto from "node:crypto";
import { env } from "../../config/env";
import { buildFiscalGatewayConfig } from "./fiscal-gateway.config";
import {
  FiscalGatewayError,
  type FiscalByCdcResponse,
  type FiscalDeliveryMode,
  type FiscalEmitFacturaRequest,
  type FiscalEmitFacturaResponse,
  type FiscalEmitNotaCreditoRequest,
  type FiscalEmitNotaCreditoResponse,
  type FiscalArtifactResponse,
  type FiscalCancelFacturaRequest,
  type FiscalCancelFacturaResponse,
  type FiscalBatchPendientesResponse,
  type FiscalDocumentoCancelSendResponse,
  type FiscalDocumentoCreateDerivedResponse,
  type FiscalDocumentoDecisionResponse,
  type FiscalDocumentoEventosResponse,
  type FiscalDocumentoResendResponse,
  type FiscalDocumentoValidateCdcImpactResponse,
  type FiscalDocumentoVoidResponse,
  type FiscalGateway,
  type FiscalGatewayConfig,
  type FiscalGatewayHealth,
  type FiscalFacturalistaResponse,
  type FiscalRefreshStatusRequest,
  type FiscalRefreshStatusResponse
} from "./fiscal-gateway.types";

export function createFiscalGateway(config: FiscalGatewayConfig): FiscalGateway {
  return config.mode === "mock" ? new MockFiscalGateway(config) : new RealFiscalGateway(config);
}

export class MockFiscalGateway implements FiscalGateway {
  constructor(private readonly config: FiscalGatewayConfig) {}

  async health(): Promise<FiscalGatewayHealth> {
    return {
      ok: true,
      mode: "mock",
      status: 200,
      message: `Mock fiscal activo (${this.config.environment}).`
    };
  }

  async emitFactura(request: FiscalEmitFacturaRequest): Promise<FiscalEmitFacturaResponse> {
    const digest = crypto.createHash("sha256").update(request.external_ref).digest("hex").toUpperCase();
    const digestLower = digest.toLowerCase();
    const numeric = String(Number.parseInt(digest.slice(0, 8), 16) % 10_000_000).padStart(7, "0");
    const cdc = digest.padEnd(44, "0").slice(0, 44);
    const document_uuid = `${digestLower.slice(0, 8)}-${digestLower.slice(8, 12)}-4${digestLower.slice(13, 16)}-${digestLower.slice(16, 20)}-${digestLower.slice(20, 32)}`;

    return {
      fiscal_document_id: `mock-${request.external_ref}`,
      document_uuid,
      cdc,
      numero_fiscal: `${request.fiscal_context.establecimiento}-${request.fiscal_context.punto_expedicion}-${numeric}`,
      estado: "EMITIDA",
      fiscal_envio_modo: resolveFiscalEnvioModo(request.fiscal_context.fiscal_envio_modo),
      delivery_mode: "BATCH",
      batch: null,
      email_status: request.cliente.email ? "DELEGATED" : "NOT_APPLICABLE",
      raw: {
        mode: "mock",
        document_uuid,
        fiscal_envio_modo: resolveFiscalEnvioModo(request.fiscal_context.fiscal_envio_modo),
        delivery_mode: "BATCH",
        external_ref: request.external_ref,
        total: request.totals.total
      }
    };
  }

  async emitNotaCredito(request: FiscalEmitNotaCreditoRequest): Promise<FiscalEmitNotaCreditoResponse> {
    const digest = crypto.createHash("sha256").update(request.external_ref).digest("hex").toUpperCase();
    const digestLower = digest.toLowerCase();
    const numeric = String(Number.parseInt(digest.slice(0, 8), 16) % 10_000_000).padStart(7, "0");
    const cdc = digest.padEnd(44, "0").slice(0, 44);
    const document_uuid = `${digestLower.slice(0, 8)}-${digestLower.slice(8, 12)}-4${digestLower.slice(13, 16)}-${digestLower.slice(16, 20)}-${digestLower.slice(20, 32)}`;

    return {
      fiscal_document_id: `mock-${request.external_ref}`,
      document_uuid,
      cdc,
      numero_fiscal: `${request.fiscal_context.establecimiento}-${request.fiscal_context.punto_expedicion}-${numeric}`,
      estado: "EMITIDA",
      fiscal_envio_modo: resolveFiscalEnvioModo(request.fiscal_context.fiscal_envio_modo),
      delivery_mode: "BATCH",
      batch: null,
      email_status: request.cliente.email ? "DELEGATED" : "NOT_APPLICABLE",
      raw: {
        mode: "mock",
        document_uuid,
        fiscal_envio_modo: resolveFiscalEnvioModo(request.fiscal_context.fiscal_envio_modo),
        delivery_mode: "BATCH",
        document_type: "NCE",
        external_ref: request.external_ref,
        referencia_cdc: request.factura_referencia.cdc,
        total: request.totals.total
      }
    };
  }

  async refreshFacturaStatus(request: FiscalRefreshStatusRequest): Promise<FiscalRefreshStatusResponse> {
    return {
      estado: "EMITIDA",
      current_cdc: null,
      raw: {
        mode: "mock",
        document_uuid: request.documentUuid,
        refreshed: true,
        status: "APPROVED"
      }
    };
  }

  async cancelFactura(request: FiscalCancelFacturaRequest): Promise<FiscalCancelFacturaResponse> {
    const digest = crypto.createHash("sha256").update(`${request.emisor_id}:${request.cdc}:${request.motivo}`).digest("hex");

    return {
      event_id: `mock-cancel-${digest.slice(0, 16)}`,
      estado: "ANULADA",
      raw: {
        mode: "mock",
        event_id: `mock-cancel-${digest.slice(0, 16)}`,
        cdc: request.cdc,
        status: "SENT"
      }
    };
  }

  async getXml(documentUuid: string): Promise<FiscalArtifactResponse> {
    return {
      body: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><mockFiscalDocument document_uuid="${escapeXml(documentUuid)}"/>`, "utf8"),
      content_type: "application/xml; charset=utf-8",
      filename: `${documentUuid}.xml`
    };
  }

  async getKudePdf(documentUuid: string): Promise<FiscalArtifactResponse> {
    return {
      body: Buffer.from(`Mock KUDE/PDF ${documentUuid}`, "utf8"),
      content_type: "application/pdf",
      filename: `${documentUuid}.pdf`
    };
  }

  async getDocumentoEventos(documentUuid: string): Promise<FiscalDocumentoEventosResponse> {
    return {
      events: [],
      raw: {
        mode: "mock",
        document_uuid: documentUuid,
        events: []
      }
    };
  }

  async resolveDocumentoByCdc(cdc: string): Promise<FiscalByCdcResponse> {
    const digestLower = crypto.createHash("sha256").update(cdc).digest("hex");
    const document_uuid = `${digestLower.slice(0, 8)}-${digestLower.slice(8, 12)}-4${digestLower.slice(13, 16)}-${digestLower.slice(16, 20)}-${digestLower.slice(20, 32)}`;
    return {
      document_uuid,
      document_id: "0",
      requested_cdc: cdc,
      current_cdc: cdc,
      is_current: true,
      lineage_status: "ACTIVE",
      sifen_resolution: "APPROVED",
      status: "APPROVED",
      accepted_by_sifen: true,
      nro_factura: null,
      tipo_documento: "FE",
      emisor_id: "mock",
      env: this.config.environment,
      resolution_note: "CDC consultado es el vigente del documento."
    };
  }

  async getDocumentoDecisionByDocumentId(input: {
    emisorId: string;
    documentId: string;
  }): Promise<FiscalDocumentoDecisionResponse> {
    return {
      document_id: input.documentId,
      emisor_id: input.emisorId,
      env: this.config.environment,
      cdc: null,
      nro_factura: null,
      status: "UNKNOWN",
      transmission_evidence: "UNKNOWN",
      number_state: "UNCERTAIN",
      decision_confidence: "LOW",
      reason_codes: ["MOCK_GATEWAY"],
      recommended_action: "WAIT_SYNC",
      next_step_hint: "Decision no disponible en modo mock.",
      escalation_required: false,
      allowed_actions: {
        retry_same_cdc: false,
        cancel_send: false,
        cancel_fiscal: false,
        void_number: false,
        create_derived: false
      },
      raw: {
        mode: "mock",
        emisor_id: input.emisorId,
        document_id: input.documentId
      }
    };
  }

  async getBatchPendientesByEmisor(input: {
    emisorId: string;
    limit: number;
    offset: number;
  }): Promise<FiscalBatchPendientesResponse> {
    return {
      documents: [],
      batches: [],
      raw: {
        mode: "mock",
        emisor_id: input.emisorId,
        limit: input.limit,
        offset: input.offset
      }
    };
  }

  async getFacturalistaByEmisor(input: {
    emisorId: string;
    offset: number;
    limit: number;
    q?: string;
  }): Promise<FiscalFacturalistaResponse> {
    return {
      items: [],
      next: null,
      raw: {
        mode: "mock",
        emisor_id: input.emisorId,
        offset: input.offset,
        limit: input.limit,
        q: input.q ?? null
      }
    };
  }

  async validateDocumentoCdcImpactByDocumentId(input: {
    emisorId: string;
    documentId: string;
    json_input?: Record<string, unknown>;
  }): Promise<FiscalDocumentoValidateCdcImpactResponse> {
    return {
      document_id: input.documentId,
      current_cdc: null,
      candidate_cdc: null,
      cdc_impact: "CDC_NO_CHANGE",
      reason: "Operacion no disponible en modo mock.",
      allowed_actions: { retry_same_cdc: false, create_derived: false, void_number: false },
      raw: { mode: "mock", emisor_id: input.emisorId, document_id: input.documentId }
    };
  }

  async retryDocumentoSameCdcByDocumentId(input: {
    emisorId: string;
    documentId: string;
    mode?: "SYNC" | "BATCH" | "AUTO";
    send_now?: boolean;
    comment?: string;
    json_input?: Record<string, unknown>;
  }): Promise<FiscalDocumentoResendResponse> {
    return {
      document_id: input.documentId,
      status: "PENDING",
      revision_number: 0,
      accepted_by_sifen: false,
      cdc: null,
      queued_for_batch: true,
      raw: { mode: "mock", emisor_id: input.emisorId, document_id: input.documentId }
    };
  }

  async createDocumentoDerivedByDocumentId(input: {
    emisorId: string;
    documentId: string;
    mode?: "SYNC" | "BATCH" | "AUTO";
    send_now?: boolean;
    comment?: string;
    json_input?: Record<string, unknown>;
  }): Promise<FiscalDocumentoCreateDerivedResponse> {
    return {
      source_document_id: input.documentId,
      derived_document_id: `mock-derived-${input.documentId}`,
      status: "PENDING",
      accepted_by_sifen: false,
      cdc: null,
      nro_factura: null,
      raw: { mode: "mock", emisor_id: input.emisorId, document_id: input.documentId }
    };
  }

  async cancelDocumentoSendByDocumentId(input: {
    emisorId: string;
    documentId: string;
    comment?: string;
  }): Promise<FiscalDocumentoCancelSendResponse> {
    return {
      document_id: input.documentId,
      previous_status: "QUEUED_BATCH",
      status: "DRAFT",
      action_result: "CANCELLED",
      reason_codes: ["MOCK_GATEWAY"],
      recommended_next_action: "REVIEW_AND_RETRY",
      raw: { mode: "mock", emisor_id: input.emisorId, document_id: input.documentId, comment: input.comment ?? null }
    };
  }

  async voidDocumentoNumberByDocumentId(input: {
    emisorId: string;
    documentId: string;
    motivo: string;
  }): Promise<FiscalDocumentoVoidResponse> {
    return {
      document_id: input.documentId,
      event_id: `mock-void-${crypto.createHash("sha256").update(input.motivo).digest("hex").slice(0, 12)}`,
      status: "SENT",
      raw: { mode: "mock", emisor_id: input.emisorId, document_id: input.documentId }
    };
  }
}

export class RealFiscalGateway implements FiscalGateway {
  constructor(private readonly config: FiscalGatewayConfig) {}

  async health(): Promise<FiscalGatewayHealth> {
    try {
      const response = await this.fetchWithTimeout(`${this.config.baseUrl}/health`, {
        method: "GET",
        headers: this.buildHeaders()
      });

      return {
        ok: response.ok,
        mode: "real",
        status: response.status,
        message: response.ok ? "Backend fiscal disponible." : "Backend fiscal no disponible."
      };
    } catch (error) {
      const mapped = mapFetchError(error);
      return {
        ok: false,
        mode: "real",
        message: mapped.message
      };
    }
  }

  async emitFactura(_request: FiscalEmitFacturaRequest): Promise<FiscalEmitFacturaResponse> {
    const payload = this.buildEmitirFacturaPayload(_request);

    const response = await this.fetchWithTimeout(`${this.config.baseUrl}/factura`, {
      method: "POST",
      headers: {
        ...this.buildHeaders(),
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const body = await readJson(response);

    if (!response.ok && !isIdempotentDocumentConflict(response.status, body)) {
      throw new FiscalGatewayError(
        response.status === 408 || response.status === 504 ? "TIMEOUT" : "UPSTREAM_ERROR",
        "Backend fiscal rechazo la emision.",
        { status: response.status, body }
      );
    }

    return mapFiscalEmitResponse(body);
  }

  async emitNotaCredito(request: FiscalEmitNotaCreditoRequest): Promise<FiscalEmitNotaCreditoResponse> {
    const payload = this.buildEmitirNotaCreditoPayload(request);

    const response = await this.fetchWithTimeout(`${this.config.baseUrl}/nota-credito`, {
      method: "POST",
      headers: {
        ...this.buildHeaders(),
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const body = await readJson(response);

    if (!response.ok && !isIdempotentDocumentConflict(response.status, body)) {
      throw new FiscalGatewayError(
        response.status === 408 || response.status === 504 ? "TIMEOUT" : "UPSTREAM_ERROR",
        "Backend fiscal rechazo la nota de credito.",
        { status: response.status, body }
      );
    }

    return mapFiscalNotaCreditoResponse(body);
  }

  async refreshFacturaStatus(request: FiscalRefreshStatusRequest): Promise<FiscalRefreshStatusResponse> {
    const url = new URL(`${this.config.baseUrl}/documentos/${encodeURIComponent(request.documentUuid)}/sifen`);
    url.searchParams.set("env", this.config.environment);
    url.searchParams.set("refresh", "true");

    const response = await this.fetchWithTimeout(url.toString(), {
      method: "GET",
      headers: this.buildHeaders()
    });

    const body = await readJson(response);

    if (!response.ok) {
      throw new FiscalGatewayError(
        response.status === 408 || response.status === 504 ? "TIMEOUT" : "UPSTREAM_ERROR",
        "Backend fiscal rechazo la consulta de estado.",
        { status: response.status, body }
      );
    }

    return mapFiscalRefreshStatusCanonicoResponse(body);
  }

  async cancelFactura(request: FiscalCancelFacturaRequest): Promise<FiscalCancelFacturaResponse> {
    const response = await this.fetchWithTimeout(`${this.config.baseUrl}/evento/cancelar`, {
      method: "POST",
      headers: {
        ...this.buildHeaders(),
        "content-type": "application/json"
      },
      body: JSON.stringify({
        emisor_id: request.emisor_id,
        cdc: request.cdc,
        motivo: request.motivo
      })
    });

    const body = await readJson(response);

    if (!response.ok) {
      throw new FiscalGatewayError(
        response.status === 408 || response.status === 504 ? "TIMEOUT" : "UPSTREAM_ERROR",
        "Backend fiscal rechazo la cancelacion.",
        { status: response.status, body }
      );
    }

    return mapFiscalCancelResponse(body);
  }

  async getXml(documentUuid: string): Promise<FiscalArtifactResponse> {
    return this.fetchArtifact(
      `${this.config.baseUrl}/documentos/${encodeURIComponent(documentUuid)}/files/xml`,
      "application/xml",
      `${documentUuid}.xml`
    );
  }

  async getKudePdf(documentUuid: string): Promise<FiscalArtifactResponse> {
    return this.fetchArtifact(
      `${this.config.baseUrl}/documentos/${encodeURIComponent(documentUuid)}/files/kude.pdf`,
      "application/pdf",
      `${documentUuid}.pdf`
    );
  }

  async getDocumentoEventos(documentUuid: string): Promise<FiscalDocumentoEventosResponse> {
    const url = new URL(`${this.config.baseUrl}/documentos/${encodeURIComponent(documentUuid)}/eventos`);
    url.searchParams.set("env", this.config.environment);

    const response = await this.fetchWithTimeout(url.toString(), {
      method: "GET",
      headers: this.buildHeaders()
    });

    const body = await readJson(response);
    if (!response.ok) {
      throw new FiscalGatewayError(
        response.status === 408 || response.status === 504 ? "TIMEOUT" : "UPSTREAM_ERROR",
        "Backend fiscal rechazo la consulta de eventos.",
        { status: response.status, body }
      );
    }

    return mapFiscalDocumentoEventosResponse(body);
  }

  async resolveDocumentoByCdc(cdc: string): Promise<FiscalByCdcResponse> {
    const url = new URL(`${this.config.baseUrl}/documentos/by-cdc/${encodeURIComponent(cdc)}`);
    url.searchParams.set("env", this.config.environment);

    const response = await this.fetchWithTimeout(url.toString(), {
      method: "GET",
      headers: this.buildHeaders()
    });

    const body = await readJson(response);
    if (!response.ok) {
      throw new FiscalGatewayError(
        response.status === 408 || response.status === 504 ? "TIMEOUT" : "UPSTREAM_ERROR",
        "Backend fiscal no pudo resolver el CDC a documento canonico.",
        { status: response.status, body }
      );
    }

    return mapFiscalByCdcResponse(body);
  }

  async getDocumentoDecisionByDocumentId(input: {
    emisorId: string;
    documentId: string;
  }): Promise<FiscalDocumentoDecisionResponse> {
    const endpoint = `${this.config.baseUrl}/admin/emisores/${encodeURIComponent(input.emisorId)}/facturas/${encodeURIComponent(input.documentId)}/decision`;
    const url = new URL(endpoint);
    url.searchParams.set("env", this.config.environment);

    const response = await this.fetchWithTimeout(url.toString(), {
      method: "GET",
      headers: this.buildHeaders()
    });

    const body = await readJson(response);
    if (!response.ok) {
      throw new FiscalGatewayError(
        response.status === 408 || response.status === 504 ? "TIMEOUT" : "UPSTREAM_ERROR",
        "Backend fiscal rechazo la consulta de decision.",
        { status: response.status, body }
      );
    }

    return mapFiscalDocumentoDecisionResponse(body);
  }

  async getBatchPendientesByEmisor(input: {
    emisorId: string;
    limit: number;
    offset: number;
  }): Promise<FiscalBatchPendientesResponse> {
    const url = new URL(`${this.config.baseUrl}/consultar/${encodeURIComponent(input.emisorId)}/batch-pendientes`);
    url.searchParams.set("env", this.config.environment);
    url.searchParams.set("limit", String(input.limit));
    url.searchParams.set("offset", String(input.offset));

    const response = await this.fetchWithTimeout(url.toString(), {
      method: "GET",
      headers: this.buildHeaders()
    });

    const body = await readJson(response);
    if (!response.ok) {
      throw new FiscalGatewayError(
        response.status === 408 || response.status === 504 ? "TIMEOUT" : "UPSTREAM_ERROR",
        "Backend fiscal rechazo la consulta de pendientes batch.",
        { status: response.status, body }
      );
    }

    return mapFiscalBatchPendientesResponse(body);
  }

  async getFacturalistaByEmisor(input: {
    emisorId: string;
    offset: number;
    limit: number;
    q?: string;
  }): Promise<FiscalFacturalistaResponse> {
    const url = new URL(`${this.config.baseUrl}/consultar/${encodeURIComponent(input.emisorId)}/facturalista/${input.offset}`);
    url.searchParams.set("env", this.config.environment);
    url.searchParams.set("limit", String(input.limit));
    if (input.q?.trim()) {
      url.searchParams.set("q", input.q.trim());
    }

    const response = await this.fetchWithTimeout(url.toString(), {
      method: "GET",
      headers: this.buildHeaders()
    });

    const body = await readJson(response);
    if (!response.ok) {
      throw new FiscalGatewayError(
        response.status === 408 || response.status === 504 ? "TIMEOUT" : "UPSTREAM_ERROR",
        "Backend fiscal rechazo la consulta de lista fiscal.",
        { status: response.status, body }
      );
    }

    return mapFiscalFacturalistaResponse(body);
  }

  async validateDocumentoCdcImpactByDocumentId(input: {
    emisorId: string;
    documentId: string;
    json_input?: Record<string, unknown>;
  }): Promise<FiscalDocumentoValidateCdcImpactResponse> {
    const endpoint = `${this.config.baseUrl}/admin/emisores/${encodeURIComponent(input.emisorId)}/facturas/${encodeURIComponent(input.documentId)}/validate-cdc-impact`;
    const response = await this.fetchWithTimeout(endpoint, {
      method: "POST",
      headers: { ...this.buildHeaders(), "content-type": "application/json" },
      body: JSON.stringify(input.json_input ? { json_input: input.json_input } : {})
    });
    const body = await readJson(response);
    if (!response.ok) {
      throw new FiscalGatewayError(response.status === 408 || response.status === 504 ? "TIMEOUT" : "UPSTREAM_ERROR", "Backend fiscal rechazo la prevalidacion CDC.", { status: response.status, body });
    }
    return mapFiscalDocumentoValidateCdcImpactResponse(body);
  }

  async retryDocumentoSameCdcByDocumentId(input: {
    emisorId: string;
    documentId: string;
    mode?: "SYNC" | "BATCH" | "AUTO";
    send_now?: boolean;
    comment?: string;
    json_input?: Record<string, unknown>;
  }): Promise<FiscalDocumentoResendResponse> {
    const endpoint = `${this.config.baseUrl}/admin/emisores/${encodeURIComponent(input.emisorId)}/facturas/${encodeURIComponent(input.documentId)}/retry-same-cdc`;
    const response = await this.fetchWithTimeout(endpoint, {
      method: "POST",
      headers: { ...this.buildHeaders(), "content-type": "application/json" },
      body: JSON.stringify({
        ...(input.mode ? { mode: input.mode } : {}),
        ...(typeof input.send_now === "boolean" ? { send_now: input.send_now } : {}),
        ...(input.comment ? { comment: input.comment } : {}),
        ...(input.json_input ? { json_input: input.json_input } : {})
      })
    });
    const body = await readJson(response);
    if (!response.ok) {
      throw new FiscalGatewayError(response.status === 408 || response.status === 504 ? "TIMEOUT" : "UPSTREAM_ERROR", "Backend fiscal rechazo el reintento con mismo CDC.", { status: response.status, body });
    }
    return mapFiscalDocumentoResendResponse(body);
  }

  async createDocumentoDerivedByDocumentId(input: {
    emisorId: string;
    documentId: string;
    mode?: "SYNC" | "BATCH" | "AUTO";
    send_now?: boolean;
    comment?: string;
    json_input?: Record<string, unknown>;
  }): Promise<FiscalDocumentoCreateDerivedResponse> {
    const endpoint = `${this.config.baseUrl}/admin/emisores/${encodeURIComponent(input.emisorId)}/facturas/${encodeURIComponent(input.documentId)}/create-derived`;
    const response = await this.fetchWithTimeout(endpoint, {
      method: "POST",
      headers: { ...this.buildHeaders(), "content-type": "application/json" },
      body: JSON.stringify({
        ...(input.mode ? { mode: input.mode } : {}),
        ...(typeof input.send_now === "boolean" ? { send_now: input.send_now } : {}),
        ...(input.comment ? { comment: input.comment } : {}),
        ...(input.json_input ? { json_input: input.json_input } : {})
      })
    });
    const body = await readJson(response);
    if (!response.ok) {
      throw new FiscalGatewayError(response.status === 408 || response.status === 504 ? "TIMEOUT" : "UPSTREAM_ERROR", "Backend fiscal rechazo crear DE derivado.", { status: response.status, body });
    }
    return mapFiscalDocumentoCreateDerivedResponse(body);
  }

  async cancelDocumentoSendByDocumentId(input: {
    emisorId: string;
    documentId: string;
    comment?: string;
  }): Promise<FiscalDocumentoCancelSendResponse> {
    const endpoint = `${this.config.baseUrl}/admin/emisores/${encodeURIComponent(input.emisorId)}/facturas/${encodeURIComponent(input.documentId)}/cancel-send`;
    const response = await this.fetchWithTimeout(endpoint, {
      method: "POST",
      headers: { ...this.buildHeaders(), "content-type": "application/json" },
      body: JSON.stringify(input.comment ? { comment: input.comment } : {})
    });
    const body = await readJson(response);
    if (!response.ok) {
      throw new FiscalGatewayError(response.status === 408 || response.status === 504 ? "TIMEOUT" : "UPSTREAM_ERROR", "Backend fiscal rechazo cancelar envio local.", { status: response.status, body });
    }
    return mapFiscalDocumentoCancelSendResponse(body);
  }

  async voidDocumentoNumberByDocumentId(input: {
    emisorId: string;
    documentId: string;
    motivo: string;
  }): Promise<FiscalDocumentoVoidResponse> {
    const endpoint = `${this.config.baseUrl}/admin/emisores/${encodeURIComponent(input.emisorId)}/facturas/${encodeURIComponent(input.documentId)}/void-number`;
    const response = await this.fetchWithTimeout(endpoint, {
      method: "POST",
      headers: { ...this.buildHeaders(), "content-type": "application/json" },
      body: JSON.stringify({ motivo: input.motivo })
    });
    const body = await readJson(response);
    if (!response.ok) {
      throw new FiscalGatewayError(response.status === 408 || response.status === 504 ? "TIMEOUT" : "UPSTREAM_ERROR", "Backend fiscal rechazo inutilizacion de numeracion.", { status: response.status, body });
    }
    return mapFiscalDocumentoVoidResponse(body);
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal
      });
    } catch (error) {
      throw mapFetchError(error);
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildHeaders(): HeadersInit {
    return {
      accept: "application/json",
      ...(this.config.apiKey ? { "x-api-key": this.config.apiKey } : {})
    };
  }

  private async fetchArtifact(url: string, accept: string, filename: string): Promise<FiscalArtifactResponse> {
    const endpoint = new URL(url);
    endpoint.searchParams.set("env", this.config.environment);

    const response = await this.fetchWithTimeout(endpoint.toString(), {
      method: "GET",
      headers: {
        ...this.buildHeaders(),
        accept
      }
    });

    if (!response.ok) {
      throw new FiscalGatewayError(
        response.status === 408 || response.status === 504 ? "TIMEOUT" : "UPSTREAM_ERROR",
        "Backend fiscal no entrego el artefacto.",
        { status: response.status }
      );
    }

    const body = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") ?? accept;

    return {
      body,
      content_type: contentType,
      filename
    };
  }

  private buildEmitirFacturaPayload(request: FiscalEmitFacturaRequest): Record<string, unknown> {
    const suggestedDocumentNumber = this.config.serviceNumbering === true ? null : request.fiscal_context.documento_nro;
    const payload: Record<string, unknown> = {
      emisor_id: request.facturador.emisor_id,
      actividadEconomicaCodigo: request.fiscal_context.actividad_economica_codigo,
      timbrado: {
        timbrado: request.fiscal_context.timbrado,
        establecimiento: request.fiscal_context.establecimiento,
        puntoExpedicion: request.fiscal_context.punto_expedicion,
        documentoNro: suggestedDocumentNumber,
        fecIni: request.fiscal_context.timbrado_inicio
      },
      numbering: {
        mode: "ONLINE",
        authority: "SERVICE",
        requested_document_number: suggestedDocumentNumber
      },
      client_reference: buildClientReference("factura_operativa", request.external_ref, request.fiscal_context.perfil_emision_codigo),
      receptor: buildReceptor(request.cliente),
      fecha: new Date().toISOString(),
      tipoTransaccion: request.tipo_transaccion,
      condicionOperacion: buildCondicionOperacion(request),
      items: request.items.map((item) => ({
        codigo: item.codigo ?? `L${String(item.line_no).padStart(3, "0")}`,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precioUnitario: item.precio_unitario,
        ivaTipo: mapIvaTipo(item.iva_tipo)
      })),
      envio: buildEnvio(request.fiscal_context.fiscal_envio_modo)
    };

    if (this.config.sendEmissionProfileCode !== false) {
      payload.emission_profile_code = request.fiscal_context.perfil_emision_codigo;
    }

    return payload;
  }

  private buildEmitirNotaCreditoPayload(request: FiscalEmitNotaCreditoRequest): Record<string, unknown> {
    const suggestedDocumentNumber = this.config.serviceNumbering === true ? null : request.fiscal_context.documento_nro;
    const payload: Record<string, unknown> = {
      emisor_id: request.facturador.emisor_id,
      actividadEconomicaCodigo: request.fiscal_context.actividad_economica_codigo,
      timbrado: {
        timbrado: request.fiscal_context.timbrado,
        establecimiento: request.fiscal_context.establecimiento,
        puntoExpedicion: request.fiscal_context.punto_expedicion,
        documentoNro: suggestedDocumentNumber,
        fecIni: request.fiscal_context.timbrado_inicio
      },
      numbering: {
        mode: "ONLINE",
        authority: "SERVICE",
        requested_document_number: suggestedDocumentNumber
      },
      client_reference: buildClientReference("nota_credito_operativa", request.external_ref, request.fiscal_context.perfil_emision_codigo),
      receptor: buildReceptor(request.cliente),
      fecha: new Date().toISOString(),
      motivo: {
        codigo: 1,
        descripcion: request.motivo
      },
      referencia: {
        tipo: "ELECTRONICO",
        cdc: request.factura_referencia.cdc
      },
      items: request.items.map((item) => ({
        codigo: item.codigo ?? `L${String(item.line_no).padStart(3, "0")}`,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precioUnitario: item.precio_unitario,
        ivaTipo: mapIvaTipo(item.iva_tipo)
      })),
      envio: buildEnvio(request.fiscal_context.fiscal_envio_modo)
    };

    if (this.config.sendEmissionProfileCode !== false) {
      payload.emission_profile_code = request.fiscal_context.perfil_emision_codigo;
    }

    return payload;
  }
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function buildCondicionOperacion(request: FiscalEmitFacturaRequest) {
  if (request.condicion_venta === "CREDITO") {
    return {
      tipo: "CREDITO",
      credito: {
        modalidad: "PLAZO",
        plazoDias: request.fiscal_context.credito_plazo_dias
      }
    };
  }

  return {
    tipo: "CONTADO",
    pagos: [
      {
        medio: "EFECTIVO",
        monto: request.totals.total
      }
    ]
  };
}

function mapDocumentoTipo(tipo: string): string {
  if (tipo === "RUC") {
    return "RUC";
  }
  if (tipo === "CI") {
    return "CI";
  }
  return tipo;
}

function buildClientReference(entityType: string, externalRef: string, operationalSeries: string): Record<string, unknown> {
  const reference: Record<string, unknown> = {
    source_system: "facturacion-simple-cliente",
    entity_type: entityType,
    entity_id: externalRef,
    request_id: externalRef,
    idempotency_key: externalRef
  };

  if (operationalSeries) {
    reference.operational_series = operationalSeries;
  }

  return reference;
}

function buildReceptor(cliente: FiscalEmitFacturaRequest["cliente"]): Record<string, unknown> {
  const documento = cliente.documento.trim();
  const rucMatch = cliente.documento_tipo === "RUC" ? documento.match(/^(\d+)-?(\d)$/) : null;
  const email = cliente.email?.trim();

  return {
    tipoDocumento: mapDocumentoTipo(cliente.documento_tipo),
    docNro: rucMatch ? rucMatch[1] : documento,
    ...(rucMatch ? { dv: rucMatch[2] } : {}),
    razonSocial: cliente.razon_social,
    direccion: cliente.direccion ?? null,
    telefono: cliente.telefono ?? null,
    ...(email ? { email } : {})
  };
}

function buildEnvio(mode: unknown): Record<string, unknown> {
  const resolvedMode = resolveFiscalEnvioModo(mode);
  if (resolvedMode === "SYNC") {
    return {
      mode: resolvedMode,
      sendNow: true
    };
  }

  return {
    mode: "BATCH"
  };
}

function resolveFiscalEnvioModo(mode: unknown): "BATCH" | "SYNC" {
  return mode === "SYNC" ? "SYNC" : "BATCH";
}

function mapIvaTipo(tipo: string): string {
  if (tipo === "IVA_10") {
    return "IVA10";
  }
  if (tipo === "IVA_5") {
    return "IVA5";
  }
  return "EXENTO";
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function mapFiscalEmitResponse(body: unknown): FiscalEmitFacturaResponse {
  if (!body || typeof body !== "object") {
    throw new FiscalGatewayError("INVALID_RESPONSE", "Respuesta fiscal invalida.", body);
  }

  const data = body as Record<string, unknown>;
  const status = typeof data.status === "string" ? data.status : null;
  const fiscalCode = findNestedStringValue(data, "dCodRes") ?? stringOrNull(data.result_code);
  const timbrado = data.timbrado && typeof data.timbrado === "object" ? (data.timbrado as Record<string, unknown>) : null;

  return {
    fiscal_document_id: stringOrNull(data.document_id),
    document_uuid: stringOrNull(data.document_uuid),
    cdc: stringOrNull(data.cdc),
    numero_fiscal: stringOrNull(data.nro_factura) ?? buildNumeroFiscalFromTimbrado(timbrado),
    estado: mapDocumentStatusWithCode(status, fiscalCode),
    fiscal_envio_modo: mapFiscalEnvioModo(data),
    delivery_mode: mapDeliveryMode(data.delivery_mode),
    idempotent: booleanOrNull(data.idempotent),
    batch: mapBatchTransmissionInfo(data.batch),
    email_status: mapEmailStatus(data.email_status),
    raw: data
  };
}

function mapFiscalNotaCreditoResponse(body: unknown): FiscalEmitNotaCreditoResponse {
  if (!body || typeof body !== "object") {
    throw new FiscalGatewayError("INVALID_RESPONSE", "Respuesta fiscal invalida.", body);
  }

  const data = body as Record<string, unknown>;
  const fiscalCode = findNestedStringValue(data, "dCodRes") ?? stringOrNull(data.result_code);

  return {
    fiscal_document_id: stringOrNull(data.document_id),
    document_uuid: stringOrNull(data.document_uuid),
    cdc: stringOrNull(data.cdc),
    numero_fiscal: stringOrNull(data.nro_documento) ?? stringOrNull(data.nro_factura),
    estado: mapDocumentStatusWithCode(stringOrNull(data.status), fiscalCode),
    fiscal_envio_modo: mapFiscalEnvioModo(data),
    delivery_mode: mapDeliveryMode(data.delivery_mode),
    idempotent: booleanOrNull(data.idempotent),
    batch: mapBatchTransmissionInfo(data.batch),
    email_status: mapEmailStatus(data.email_status),
    raw: data
  };
}

function mapDocumentStatusWithCode(status: string | null, fiscalCode: string | null): FiscalEmitFacturaResponse["estado"] {
  if (isApprovedFiscalStatus(status) || isApprovedFiscalCode(fiscalCode)) {
    return "EMITIDA";
  }
  if (status === "REJECTED" || status === "RECHAZADO") {
    return "RECHAZADA";
  }
  return "PENDIENTE_SIFEN";
}

function mapFiscalEnvioModo(data: Record<string, unknown>): "BATCH" | "SYNC" {
  const deliveryMode = mapDeliveryMode(data.delivery_mode);
  if (deliveryMode === "SYNC") {
    return "SYNC";
  }

  return "BATCH";
}

function mapDeliveryMode(value: unknown): FiscalDeliveryMode | null {
  if (value === "SYNC" || value === "BATCH" || value === "AUTO_FALLBACK_BATCH") {
    return value;
  }

  return null;
}

function mapBatchTransmissionInfo(value: unknown): FiscalEmitFacturaResponse["batch"] {
  if (!value || typeof value !== "object") {
    return null;
  }

  const data = value as Record<string, unknown>;
  const status = stringOrNull(data.status);

  return {
    batch_id: stringOrNull(data.batch_id),
    did: stringOrNull(data.did),
    dProtConsLote: stringOrNull(data.dProtConsLote),
    dCodRes: stringOrNull(data.dCodRes),
    dMsgRes: stringOrNull(data.dMsgRes),
    dTpoProces: stringOrNull(data.dTpoProces),
    result_code: stringOrNull(data.result_code),
    result_message: stringOrNull(data.result_message),
    status:
      status === "CREATED" || status === "RECEIVED" || status === "PROCESSING" || status === "DONE" || status === "ERROR"
        ? status
        : null
  };
}

function isIdempotentDocumentConflict(status: number, body: unknown): boolean {
  if (status !== 409 || !body || typeof body !== "object") {
    return false;
  }

  const data = body as Record<string, unknown>;
  return data.idempotent === true && Boolean(stringOrNull(data.document_id) || stringOrNull(data.cdc));
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function mapFiscalRefreshStatusCanonicoResponse(body: unknown): FiscalRefreshStatusResponse {
  if (!body || typeof body !== "object") {
    throw new FiscalGatewayError("INVALID_RESPONSE", "Respuesta fiscal invalida.", body);
  }

  const data = body as Record<string, unknown>;
  const statusPayload = data.status && typeof data.status === "object" ? (data.status as Record<string, unknown>) : data;
  const status =
    stringOrNull(statusPayload.status) ??
    stringOrNull(statusPayload.estado) ??
    stringOrNull(statusPayload.document_status) ??
    stringOrNull(data.document_status);
  const sifenStatus =
    statusPayload.sifen_status && typeof statusPayload.sifen_status === "object"
      ? (statusPayload.sifen_status as Record<string, unknown>)
      : null;
  const fiscalCode =
    stringOrNull(sifenStatus?.code) ??
    findNestedStringValue(data, "dCodRes") ??
    stringOrNull(data.result_code) ??
    stringOrNull((statusPayload as Record<string, unknown>).result_code);

  return {
    estado: mapRefreshDocumentStatusWithCode(status, fiscalCode),
    current_cdc: stringOrNull(data.current_cdc),
    raw: data
  };
}

function mapFiscalByCdcResponse(body: unknown): FiscalByCdcResponse {
  if (!body || typeof body !== "object") {
    throw new FiscalGatewayError("INVALID_RESPONSE", "Respuesta fiscal invalida.", body);
  }

  const data = body as Record<string, unknown>;

  return {
    document_uuid: String(data.document_uuid ?? ""),
    document_id: String(data.document_id ?? ""),
    requested_cdc: String(data.requested_cdc ?? ""),
    current_cdc: stringOrNull(data.current_cdc),
    is_current: Boolean(data.is_current),
    lineage_status: mapLineageStatus(data.lineage_status),
    sifen_resolution: mapSifenResolution(data.sifen_resolution),
    status: stringOrNull(data.status) ?? "UNKNOWN",
    accepted_by_sifen: Boolean(data.accepted_by_sifen),
    nro_factura: stringOrNull(data.nro_factura),
    tipo_documento: stringOrNull(data.tipo_documento) ?? "FE",
    emisor_id: stringOrNull(data.emisor_id) ?? "",
    env: data.env === "prod" ? "prod" : "test",
    resolution_note: stringOrNull(data.resolution_note) ?? ""
  };
}

function mapRefreshDocumentStatusWithCode(status: string | null, fiscalCode: string | null): FiscalRefreshStatusResponse["estado"] {
  if (isApprovedFiscalStatus(status) || isApprovedFiscalCode(fiscalCode)) {
    return "EMITIDA";
  }
  if (status === "REJECTED" || status === "RECHAZADO") {
    return "RECHAZADA";
  }
  if (status === "CANCELLED" || status === "VOIDED" || status === "ANULADO" || status === "CANCELADO") {
    return "ANULADA";
  }
  return "PENDIENTE_SIFEN";
}

function isApprovedFiscalStatus(status: string | null): boolean {
  return status === "APPROVED" || status === "APPROVED_WITH_OBS" || status === "ACEPTADO" || status === "APROBADO";
}

function isApprovedFiscalCode(code: string | null): boolean {
  return code === "0260" || code === "0422";
}

function findNestedStringValue(value: unknown, targetKey: string): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.includes(":") ? key.split(":").at(-1) : key;
    if (normalizedKey === targetKey && (typeof nested === "string" || typeof nested === "number")) {
      return String(nested);
    }

    if (Array.isArray(nested)) {
      for (const item of nested) {
        const found = findNestedStringValue(item, targetKey);
        if (found) {
          return found;
        }
      }
      continue;
    }

    const found = findNestedStringValue(nested, targetKey);
    if (found) {
      return found;
    }
  }

  return null;
}

function mapFiscalCancelResponse(body: unknown): FiscalCancelFacturaResponse {
  if (!body || typeof body !== "object") {
    throw new FiscalGatewayError("INVALID_RESPONSE", "Respuesta fiscal invalida.", body);
  }

  const data = body as Record<string, unknown>;
  const status = stringOrNull(data.status) ?? stringOrNull(data.estado) ?? stringOrNull(data.event_status);

  return {
    event_id: stringOrNull(data.event_id),
    estado: mapCancelStatus(status),
    raw: data
  };
}

function mapCancelStatus(status: string | null): FiscalCancelFacturaResponse["estado"] {
  if (!status) {
    return "PENDIENTE_SIFEN";
  }

  if (
    status === "SENT" ||
    status === "RECEIVED" ||
    status === "PENDING" ||
    status === "PENDIENTE" ||
    status === "PROCESSING" ||
    status === "EN_PROCESO"
  ) {
    return "PENDIENTE_SIFEN";
  }

  if (status === "DONE" || status === "APPROVED" || status === "ACEPTADO" || status === "ANULADO" || status === "CANCELADO") {
    return "ANULADA";
  }

  return "PENDIENTE_SIFEN";
}

function mapEmailStatus(value: unknown): FiscalEmitFacturaResponse["email_status"] {
  return value === "NOT_APPLICABLE" ||
    value === "DELEGATED" ||
    value === "SENT" ||
    value === "FAILED" ||
    value === "UNKNOWN"
    ? value
    : "UNKNOWN";
}

function mapFiscalDocumentoEventosResponse(body: unknown): FiscalDocumentoEventosResponse {
  if (!body || typeof body !== "object") {
    throw new FiscalGatewayError("INVALID_RESPONSE", "Respuesta fiscal invalida.", body);
  }

  const data = body as Record<string, unknown>;
  const events = Array.isArray(data.events) ? data.events : [];

  return {
    events: events.map((event) => {
      const row = event && typeof event === "object" ? (event as Record<string, unknown>) : {};
      return {
        event_id: stringOrNull(row.event_id),
        type: stringOrNull(row.type),
        status: stringOrNull(row.status),
        created_at: stringOrNull(row.created_at),
        response: row.response && typeof row.response === "object" ? (row.response as Record<string, unknown>) : null
      };
    }),
    raw: data
  };
}

function mapFiscalDocumentoDecisionResponse(body: unknown): FiscalDocumentoDecisionResponse {
  if (!body || typeof body !== "object") {
    throw new FiscalGatewayError("INVALID_RESPONSE", "Respuesta fiscal invalida.", body);
  }

  const data = body as Record<string, unknown>;
  const allowedActions = data.allowed_actions && typeof data.allowed_actions === "object"
    ? Object.entries(data.allowed_actions as Record<string, unknown>).reduce<Record<string, boolean>>((acc, [key, value]) => {
      acc[key] = Boolean(value);
      return acc;
    }, {})
    : {};

  return {
    document_id: String(data.document_id ?? ""),
    emisor_id: String(data.emisor_id ?? ""),
    env: data.env === "prod" ? "prod" : "test",
    cdc: stringOrNull(data.cdc),
    nro_factura: stringOrNull(data.nro_factura),
    status: stringOrNull(data.status) ?? "UNKNOWN",
    transmission_evidence: data.transmission_evidence === "YES" || data.transmission_evidence === "NO" ? data.transmission_evidence : "UNKNOWN",
    number_state:
      data.number_state === "CONSUMED" || data.number_state === "REUSABLE" || data.number_state === "REQUIRES_VOID"
        ? data.number_state
        : "UNCERTAIN",
    decision_confidence:
      data.decision_confidence === "HIGH" || data.decision_confidence === "MEDIUM" ? data.decision_confidence : "LOW",
    reason_codes: Array.isArray(data.reason_codes)
      ? data.reason_codes.filter((value): value is string => typeof value === "string")
      : [],
    recommended_action:
      data.recommended_action === "RETRY" ||
      data.recommended_action === "CANCEL_SEND" ||
      data.recommended_action === "CANCEL_FISCAL" ||
      data.recommended_action === "VOID_NUMBER" ||
      data.recommended_action === "NO_ACTION"
        ? data.recommended_action
        : "WAIT_SYNC",
    next_step_hint: stringOrNull(data.next_step_hint),
    escalation_required: Boolean(data.escalation_required),
    allowed_actions: allowedActions,
    raw: data
  };
}

function mapFiscalDocumentoValidateCdcImpactResponse(body: unknown): FiscalDocumentoValidateCdcImpactResponse {
  if (!body || typeof body !== "object") {
    throw new FiscalGatewayError("INVALID_RESPONSE", "Respuesta fiscal invalida.", body);
  }
  const data = body as Record<string, unknown>;
  const allowedActions = data.allowed_actions && typeof data.allowed_actions === "object"
    ? Object.entries(data.allowed_actions as Record<string, unknown>).reduce<Record<string, boolean>>((acc, [key, value]) => {
      acc[key] = Boolean(value);
      return acc;
    }, {})
    : {};
  return {
    document_id: String(data.document_id ?? ""),
    current_cdc: stringOrNull(data.current_cdc),
    candidate_cdc: stringOrNull(data.candidate_cdc),
    cdc_impact: data.cdc_impact === "CDC_CHANGE" ? "CDC_CHANGE" : "CDC_NO_CHANGE",
    reason: stringOrNull(data.reason),
    allowed_actions: allowedActions,
    raw: data
  };
}

function mapFiscalDocumentoResendResponse(body: unknown): FiscalDocumentoResendResponse {
  if (!body || typeof body !== "object") {
    throw new FiscalGatewayError("INVALID_RESPONSE", "Respuesta fiscal invalida.", body);
  }
  const data = body as Record<string, unknown>;
  return {
    document_id: String(data.document_id ?? ""),
    status: stringOrNull(data.status) ?? "UNKNOWN",
    revision_number: numberOrNull(data.revision_number) ?? 0,
    accepted_by_sifen: Boolean(data.accepted_by_sifen),
    cdc: stringOrNull(data.cdc),
    queued_for_batch: typeof data.queued_for_batch === "boolean" ? data.queued_for_batch : null,
    raw: data
  };
}

function mapFiscalDocumentoCreateDerivedResponse(body: unknown): FiscalDocumentoCreateDerivedResponse {
  if (!body || typeof body !== "object") {
    throw new FiscalGatewayError("INVALID_RESPONSE", "Respuesta fiscal invalida.", body);
  }
  const data = body as Record<string, unknown>;
  return {
    source_document_id: String(data.source_document_id ?? ""),
    derived_document_id: String(data.derived_document_id ?? ""),
    status: stringOrNull(data.status) ?? "UNKNOWN",
    accepted_by_sifen: Boolean(data.accepted_by_sifen),
    cdc: stringOrNull(data.cdc),
    nro_factura: stringOrNull(data.nro_factura),
    raw: data
  };
}

function mapFiscalDocumentoCancelSendResponse(body: unknown): FiscalDocumentoCancelSendResponse {
  if (!body || typeof body !== "object") {
    throw new FiscalGatewayError("INVALID_RESPONSE", "Respuesta fiscal invalida.", body);
  }
  const data = body as Record<string, unknown>;
  return {
    document_id: String(data.document_id ?? ""),
    previous_status: stringOrNull(data.previous_status) ?? "UNKNOWN",
    status: stringOrNull(data.status) ?? "UNKNOWN",
    action_result: stringOrNull(data.action_result) ?? "UNKNOWN",
    reason_codes: Array.isArray(data.reason_codes) ? data.reason_codes.filter((v): v is string => typeof v === "string") : [],
    recommended_next_action: stringOrNull(data.recommended_next_action) ?? "UNKNOWN",
    raw: data
  };
}

function mapFiscalDocumentoVoidResponse(body: unknown): FiscalDocumentoVoidResponse {
  if (!body || typeof body !== "object") {
    throw new FiscalGatewayError("INVALID_RESPONSE", "Respuesta fiscal invalida.", body);
  }
  const data = body as Record<string, unknown>;
  return {
    document_id: String(data.document_id ?? ""),
    event_id: stringOrNull(data.event_id),
    status: stringOrNull(data.status) ?? "UNKNOWN",
    raw: data
  };
}

function mapFiscalBatchPendientesResponse(body: unknown): FiscalBatchPendientesResponse {
  if (!body || typeof body !== "object") {
    throw new FiscalGatewayError("INVALID_RESPONSE", "Respuesta fiscal invalida.", body);
  }

  const data = body as Record<string, unknown>;
  const documents = Array.isArray(data.documents) ? data.documents : [];
  const batches = Array.isArray(data.batches) ? data.batches : [];

  return {
    documents: documents.map((doc) => {
      const row = doc && typeof doc === "object" ? (doc as Record<string, unknown>) : {};
      return {
        document_id: stringOrNull(row.document_id),
        cdc: stringOrNull(row.cdc),
        nro_factura: stringOrNull(row.nro_factura),
        status: stringOrNull(row.status),
        fecha_emision: stringOrNull(row.fecha_emision),
        tipo_documento: stringOrNull(row.tipo_documento)
      };
    }),
    batches: batches.map((batch) => {
      const row = batch && typeof batch === "object" ? (batch as Record<string, unknown>) : {};
      return {
        batch_id: stringOrNull(row.batch_id),
        did: stringOrNull(row.did),
        dProtConsLote: stringOrNull(row.dProtConsLote),
        dCodRes: stringOrNull(row.dCodRes),
        status: stringOrNull(row.status),
        doc_count: numberOrNull(row.doc_count),
        result_code: stringOrNull(row.result_code),
        result_message: stringOrNull(row.result_message)
      };
    }),
    raw: data
  };
}

function mapFiscalFacturalistaResponse(body: unknown): FiscalFacturalistaResponse {
  if (!body || typeof body !== "object") {
    throw new FiscalGatewayError("INVALID_RESPONSE", "Respuesta fiscal invalida.", body);
  }

  const data = body as Record<string, unknown>;
  const items = Array.isArray(data.items) ? data.items : [];

  return {
    items: items.map((item) => {
      const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      return {
        document_id: stringOrNull(row.document_id),
        document_uuid: stringOrNull(row.document_uuid),
        cdc: stringOrNull(row.cdc),
        current_cdc: stringOrNull(row.current_cdc),
        nro_factura: stringOrNull(row.nro_factura),
        status: stringOrNull(row.status),
        fecha_emision: stringOrNull(row.fecha_emision),
        receptor_doc: stringOrNull(row.receptor_doc),
        receptor_nombre: stringOrNull(row.receptor_nombre)
      };
    }),
    next: numberOrNull(data.next),
    raw: data
  };
}

function buildNumeroFiscalFromTimbrado(timbrado: Record<string, unknown> | null): string | null {
  if (!timbrado) {
    return null;
  }

  const establecimiento = stringOrNull(timbrado.establecimiento);
  const puntoExpedicion = stringOrNull(timbrado.puntoExpedicion);
  const documentoNro = stringOrNull(timbrado.documentoNro);

  if (!establecimiento || !puntoExpedicion || !documentoNro) {
    return null;
  }

  return `${establecimiento}-${puntoExpedicion}-${documentoNro}`;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mapLineageStatus(value: unknown): import("./fiscal-gateway.types").FiscalLineageStatus {
  if (value === "ACTIVE" || value === "SUPERSEDED" || value === "INCONSISTENT") {
    return value;
  }
  return "INCONSISTENT";
}

function mapSifenResolution(value: unknown): import("./fiscal-gateway.types").FiscalSifenResolution {
  if (value === "APPROVED" || value === "APPROVED_WITH_OBS" || value === "REJECTED_OR_MISSING" || value === "PENDING_CHECK") {
    return value;
  }
  return "PENDING_CHECK";
}

function mapFetchError(error: unknown): FiscalGatewayError {
  if (error instanceof FiscalGatewayError) {
    return error;
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return new FiscalGatewayError("TIMEOUT", "Timeout al comunicarse con backend fiscal.");
  }

  if (error instanceof Error) {
    return new FiscalGatewayError("UNAVAILABLE", error.message);
  }

  return new FiscalGatewayError("UNAVAILABLE", "Backend fiscal no disponible.");
}

export const fiscalGateway = createFiscalGateway(buildFiscalGatewayConfig(env));
