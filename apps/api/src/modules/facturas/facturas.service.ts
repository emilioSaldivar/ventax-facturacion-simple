import crypto from "node:crypto";
import { calculateDocumentTotals, type TaxInputLine } from "@facturacion-simple/shared";
import { HttpError } from "../../shared/errors/http-error";
import type { OperationalContextResponse } from "../context/context.types";
import { FiscalGatewayError, type FiscalGateway, type FiscalEmitFacturaRequest, type FiscalEmitFacturaResponse } from "../fiscal-gateway/fiscal-gateway.types";
import type {
  DocumentoEstado,
  DocumentoResponse,
  FacturaItemPreview,
  FacturaPreviewInput,
  FacturaPreviewResponse,
  FacturaRepository
} from "./facturas.types";

export function previewFactura(
  _context: OperationalContextResponse,
  input: FacturaPreviewInput
): FacturaPreviewResponse {
  validateCliente(input);

  const taxLines: TaxInputLine[] = input.items.map((item) => {
    const descripcion = item.descripcion.trim();
    if (!descripcion) {
      throw new HttpError(400, "VALIDATION_ERROR", "Descripcion de item requerida.");
    }

    return {
      codigo: item.codigo?.trim() || null,
      descripcion,
      cantidad: item.cantidad,
      precio_unitario: item.precio_unitario,
      iva_tipo: item.iva_tipo ?? "IVA_10"
    };
  });

  try {
    const calculated = calculateDocumentTotals(taxLines);
    const items: FacturaItemPreview[] = calculated.items.map((item, index) => ({
      ...item,
      catalogo_item_id: input.items[index]?.catalogo_item_id?.trim() || null
    }));

    return {
      items,
      totals: calculated.totals
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new HttpError(400, "VALIDATION_ERROR", error.message);
    }
    throw error;
  }
}

function validateCliente(input: FacturaPreviewInput): void {
  if (!input.cliente.documento.trim()) {
    throw new HttpError(400, "VALIDATION_ERROR", "Documento de cliente requerido.");
  }

  if (!input.cliente.razon_social.trim()) {
    throw new HttpError(400, "VALIDATION_ERROR", "Razon social de cliente requerida.");
  }
}

export async function emitFacturaAgainstFiscalGateway(
  context: OperationalContextResponse,
  input: FacturaPreviewInput,
  repository: FacturaRepository,
  gateway: FiscalGateway,
  options: { idempotencyKey?: string } = {}
): Promise<DocumentoResponse> {
  if (options.idempotencyKey) {
    const existing = await repository.findByIdempotencyKey({
      facturadorId: context.facturador.id,
      idempotencyKey: options.idempotencyKey
    });

    if (existing) {
      return existing;
    }
  }

  const preview = previewFactura(context, input);
  const externalRef = options.idempotencyKey
    ? `fac_${crypto.createHash("sha256").update(`${context.facturador.id}:${options.idempotencyKey}`).digest("hex").slice(0, 32)}`
    : `fac_${crypto.randomUUID()}`;
  const fiscalRequest = buildFiscalEmitRequest(context, input, preview, externalRef);

  let fiscalResponse: FiscalEmitFacturaResponse | null = null;
  let fiscalError: Record<string, unknown> | null = null;
  let estado: DocumentoEstado = "EMITIENDO";

  try {
    fiscalResponse = await gateway.emitFactura(fiscalRequest);
    estado = fiscalResponse.estado;
  } catch (error) {
    if (error instanceof FiscalGatewayError) {
      estado = error.code === "TIMEOUT" ? "PENDIENTE_SIFEN" : "ERROR_TEMPORAL";
      fiscalError = {
        code: error.code,
        message: error.message,
        details: error.details ?? null
      };
    } else {
      throw error;
    }
  }

  return repository.createFromEmission({
    tenantId: context.tenant.id,
    facturadorId: context.facturador.id,
    userId: context.user.id,
    externalRef,
    idempotencyKey: options.idempotencyKey,
    input,
    preview,
    fiscalRequest: fiscalRequest as unknown as Record<string, unknown>,
    fiscalResponse,
    fiscalError,
    estado
  });
}

function buildFiscalEmitRequest(
  context: OperationalContextResponse,
  input: FacturaPreviewInput,
  preview: FacturaPreviewResponse,
  externalRef: string
): FiscalEmitFacturaRequest {
  return {
    external_ref: externalRef,
    condicion_venta: input.condicion_venta,
    facturador: context.facturador,
    fiscal_context: context.fiscal_context,
    cliente: input.cliente,
    items: preview.items,
    totals: preview.totals
  };
}
