import crypto from "node:crypto";
import { env } from "../../config/env";
import { buildFiscalGatewayConfig } from "./fiscal-gateway.config";
import {
  FiscalGatewayError,
  type FiscalEmitFacturaRequest,
  type FiscalEmitFacturaResponse,
  type FiscalGateway,
  type FiscalGatewayConfig,
  type FiscalGatewayHealth
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

  private buildEmitirFacturaPayload(request: FiscalEmitFacturaRequest): Record<string, unknown> {
    return {
      emisor_id: request.facturador.emisor_id,
      actividadEconomicaCodigo: request.fiscal_context.actividad_economica_codigo,
      timbrado: {
        timbrado: this.config.defaultTimbrado,
        establecimiento: request.fiscal_context.establecimiento || this.config.defaultEstablecimiento,
        puntoExpedicion: request.fiscal_context.punto_expedicion || this.config.defaultPuntoExpedicion,
        documentoNro: this.config.defaultDocumentoNro,
        fecIni: this.config.defaultTimbradoInicio
      },
      numbering: {
        mode: "ONLINE",
        authority: "SERVICE"
      },
      client_reference: {
        source_system: "facturacion-simple-cliente",
        entity_type: "factura_operativa",
        entity_id: request.external_ref,
        request_id: request.external_ref,
        idempotency_key: request.external_ref
      },
      receptor: {
        tipoDocumento: mapDocumentoTipo(request.cliente.documento_tipo),
        docNro: request.cliente.documento,
        razonSocial: request.cliente.razon_social,
        direccion: request.cliente.direccion ?? null,
        telefono: request.cliente.telefono ?? null
      },
      fecha: new Date().toISOString(),
      condicionOperacion: buildCondicionOperacion(request, this.config.defaultCreditoPlazoDias),
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

function buildCondicionOperacion(request: FiscalEmitFacturaRequest, defaultCreditoPlazoDias: number) {
  if (request.condicion_venta === "CREDITO") {
    return {
      tipo: "CREDITO",
      credito: {
        modalidad: "PLAZO",
        plazoDias: defaultCreditoPlazoDias
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

  return {
    fiscal_document_id: stringOrNull(data.document_id),
    cdc: stringOrNull(data.cdc),
    numero_fiscal: stringOrNull(data.nro_factura),
    estado: mapDocumentStatus(status),
    email_status: "UNKNOWN",
    raw: data
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function mapDocumentStatus(status: string | null): FiscalEmitFacturaResponse["estado"] {
  if (status === "APPROVED" || status === "APPROVED_WITH_OBS") {
    return "EMITIDA";
  }
  if (status === "REJECTED") {
    return "RECHAZADA";
  }
  return "PENDIENTE_SIFEN";
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
