import crypto from "node:crypto";
import { env } from "../../config/env";
import { buildFiscalGatewayConfig } from "./fiscal-gateway.config";
import {
  FiscalGatewayError,
  type FiscalEmitFacturaRequest,
  type FiscalEmitFacturaResponse,
  type FiscalArtifactResponse,
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
      email_status: request.cliente.email ? "DELEGATED" : "NOT_APPLICABLE",
      raw: {
        mode: "mock",
        external_ref: request.external_ref,
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

    if (!response.ok) {
      throw new FiscalGatewayError(
        response.status === 408 || response.status === 504 ? "TIMEOUT" : "UPSTREAM_ERROR",
        "Backend fiscal rechazo la emision.",
        { status: response.status, body }
      );
    }

    return mapFiscalEmitResponse(body);
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
    const suggestedDocumentNumber = request.fiscal_context.documento_nro;

    return {
      emisor_id: request.facturador.emisor_id,
      actividadEconomicaCodigo: request.fiscal_context.actividad_economica_codigo,
      emission_profile_code: request.fiscal_context.perfil_emision_codigo,
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
      client_reference: {
        source_system: "facturacion-simple-cliente",
        entity_type: "factura_operativa",
        entity_id: request.external_ref,
        request_id: request.external_ref,
        idempotency_key: request.external_ref,
        operational_series: request.fiscal_context.perfil_emision_codigo
      },
      receptor: {
        tipoDocumento: mapDocumentoTipo(request.cliente.documento_tipo),
        docNro: request.cliente.documento,
        razonSocial: request.cliente.razon_social,
        direccion: request.cliente.direccion ?? null,
        telefono: request.cliente.telefono ?? null
      },
      fecha: new Date().toISOString(),
      condicionOperacion: buildCondicionOperacion(request),
      items: request.items.map((item) => ({
        codigo: item.codigo ?? `L${String(item.line_no).padStart(3, "0")}`,
        descripcion: item.descripcion,
        cantidad: item.cantidad,
        precioUnitario: item.precio_unitario,
        ivaTipo: mapIvaTipo(item.iva_tipo)
      })),
      envio: {
        mode: "SYNC",
        sendNow: true
      }
    };
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
  const timbrado = data.timbrado && typeof data.timbrado === "object" ? (data.timbrado as Record<string, unknown>) : null;

  return {
    fiscal_document_id: stringOrNull(data.document_id),
    cdc: stringOrNull(data.cdc),
    numero_fiscal: stringOrNull(data.nro_factura) ?? buildNumeroFiscalFromTimbrado(timbrado),
    estado: mapDocumentStatus(status),
    email_status: mapEmailStatus(data.email_status),
    raw: data
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function mapDocumentStatus(status: string | null): FiscalEmitFacturaResponse["estado"] {
  if (status === "APPROVED" || status === "APPROVED_WITH_OBS" || status === "ACEPTADO" || status === "APROBADO") {
    return "EMITIDA";
  }
  if (status === "REJECTED" || status === "RECHAZADO") {
    return "RECHAZADA";
  }
  return "PENDIENTE_SIFEN";
}

function mapRefreshDocumentStatus(status: string | null): FiscalRefreshStatusResponse["estado"] {
  if (status === "APPROVED" || status === "APPROVED_WITH_OBS" || status === "ACEPTADO" || status === "APROBADO") {
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

  return {
    estado: mapRefreshDocumentStatus(status),
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
