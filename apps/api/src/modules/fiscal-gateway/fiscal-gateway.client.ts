import crypto from "node:crypto";
import { env } from "../../config/env";
import { buildFiscalGatewayConfig } from "./fiscal-gateway.config";
import {
  FiscalGatewayError,
  type FiscalEmitFacturaRequest,
  type FiscalEmitFacturaResponse,
  type FiscalEmitNotaCreditoRequest,
  type FiscalEmitNotaCreditoResponse,
  type FiscalArtifactResponse,
  type FiscalCancelFacturaRequest,
  type FiscalCancelFacturaResponse,
  type FiscalGateway,
  type FiscalGatewayConfig,
  type FiscalGatewayHealth,
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
    const numeric = String(Number.parseInt(digest.slice(0, 8), 16) % 10_000_000).padStart(7, "0");
    const cdc = digest.padEnd(44, "0").slice(0, 44);

    return {
      fiscal_document_id: `mock-${request.external_ref}`,
      cdc,
      numero_fiscal: `${request.fiscal_context.establecimiento}-${request.fiscal_context.punto_expedicion}-${numeric}`,
      estado: "EMITIDA",
      fiscal_envio_modo: resolveFiscalEnvioModo(request.fiscal_context.fiscal_envio_modo),
      delivery_mode: "BATCH",
      batch: null,
      email_status: request.cliente.email ? "DELEGATED" : "NOT_APPLICABLE",
      raw: {
        mode: "mock",
        fiscal_envio_modo: resolveFiscalEnvioModo(request.fiscal_context.fiscal_envio_modo),
        delivery_mode: "BATCH",
        external_ref: request.external_ref,
        total: request.totals.total
      }
    };
  }

  async emitNotaCredito(request: FiscalEmitNotaCreditoRequest): Promise<FiscalEmitNotaCreditoResponse> {
    const digest = crypto.createHash("sha256").update(request.external_ref).digest("hex").toUpperCase();
    const numeric = String(Number.parseInt(digest.slice(0, 8), 16) % 10_000_000).padStart(7, "0");
    const cdc = digest.padEnd(44, "0").slice(0, 44);

    return {
      fiscal_document_id: `mock-${request.external_ref}`,
      cdc,
      numero_fiscal: `${request.fiscal_context.establecimiento}-${request.fiscal_context.punto_expedicion}-${numeric}`,
      estado: "EMITIDA",
      fiscal_envio_modo: resolveFiscalEnvioModo(request.fiscal_context.fiscal_envio_modo),
      delivery_mode: "BATCH",
      batch: null,
      email_status: request.cliente.email ? "DELEGATED" : "NOT_APPLICABLE",
      raw: {
        mode: "mock",
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
      raw: {
        mode: "mock",
        cdc: request.cdc,
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

  async getXml(cdc: string): Promise<FiscalArtifactResponse> {
    return {
      body: Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><mockFiscalDocument cdc="${escapeXml(cdc)}"/>`, "utf8"),
      content_type: "application/xml; charset=utf-8",
      filename: `${cdc}.xml`
    };
  }

  async getKudePdf(cdc: string): Promise<FiscalArtifactResponse> {
    return {
      body: Buffer.from(`Mock KUDE/PDF ${cdc}`, "utf8"),
      content_type: "application/pdf",
      filename: `${cdc}.pdf`
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
    const url = new URL(`${this.config.baseUrl}/consultar/comprobanteSifen/${encodeURIComponent(request.cdc)}`);
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

    return mapFiscalRefreshStatusResponse(body);
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

  async getXml(cdc: string): Promise<FiscalArtifactResponse> {
    return this.fetchArtifact(`${this.config.baseUrl}/files/xml/${encodeURIComponent(cdc)}`, "application/xml", `${cdc}.xml`);
  }

  async getKudePdf(cdc: string): Promise<FiscalArtifactResponse> {
    return this.fetchArtifact(
      `${this.config.baseUrl}/files/kude/${encodeURIComponent(cdc)}.pdf`,
      "application/pdf",
      `${cdc}.pdf`
    );
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
    const response = await this.fetchWithTimeout(url, {
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
    const suggestedDocumentNumber = request.fiscal_context.documento_nro;
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
    cdc: stringOrNull(data.cdc),
    numero_fiscal: stringOrNull(data.nro_factura) ?? buildNumeroFiscalFromTimbrado(timbrado),
    estado: mapDocumentStatusWithCode(status, fiscalCode),
    fiscal_envio_modo: mapFiscalEnvioModo(data),
    delivery_mode: stringOrNull(data.delivery_mode),
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
    cdc: stringOrNull(data.cdc),
    numero_fiscal: stringOrNull(data.nro_documento) ?? stringOrNull(data.nro_factura),
    estado: mapDocumentStatusWithCode(stringOrNull(data.status), fiscalCode),
    fiscal_envio_modo: mapFiscalEnvioModo(data),
    delivery_mode: stringOrNull(data.delivery_mode),
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
  const deliveryMode = stringOrNull(data.delivery_mode);
  if (deliveryMode === "SYNC") {
    return "SYNC";
  }

  return "BATCH";
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

function mapFiscalRefreshStatusResponse(body: unknown): FiscalRefreshStatusResponse {
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
    raw: data
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
    estado: status === "PENDING" || status === "PENDIENTE" || status === "PROCESSING" ? "PENDIENTE_SIFEN" : "ANULADA",
    raw: data
  };
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
