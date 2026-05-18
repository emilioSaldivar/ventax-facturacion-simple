import { HttpError } from "../../shared/errors/http-error";
import type { OperationalContextResponse } from "../context/context.types";
import type {
  ClienteListResponse,
  ClienteRepository,
  ClienteResponse,
  ClienteSearchResult,
  ClienteUpsertInput
} from "./clientes.types";
import { normalizeDocumento, normalizeOptional } from "./clientes.utils";

export async function searchClientes(
  context: OperationalContextResponse,
  input: { q: string; limit: number },
  repository: ClienteRepository
): Promise<{ items: ClienteSearchResult[] }> {
  return {
    items: await repository.search({
      tenantId: context.tenant.id,
      facturadorId: context.facturador.id,
      q: input.q,
      limit: input.limit
    })
  };
}

export async function listClientes(
  context: OperationalContextResponse,
  input: { q?: string; limit: number; offset: number },
  repository: ClienteRepository
): Promise<ClienteListResponse> {
  return repository.list({
    facturadorId: context.facturador.id,
    q: input.q,
    limit: input.limit,
    offset: input.offset
  });
}

export async function createCliente(
  context: OperationalContextResponse,
  data: ClienteUpsertInput,
  repository: ClienteRepository
): Promise<ClienteResponse> {
  const normalized = normalizeClienteInput(data);

  return repository.upsertForFacturador({
    tenantId: context.tenant.id,
    facturadorId: context.facturador.id,
    userId: context.user.id,
    data: normalized
  });
}

export async function updateCliente(
  context: OperationalContextResponse,
  clienteId: string,
  data: ClienteUpsertInput,
  repository: ClienteRepository
): Promise<ClienteResponse> {
  const cliente = await repository.updateForFacturador({
    clienteId,
    facturadorId: context.facturador.id,
    userId: context.user.id,
    data: normalizeClienteInput(data)
  });

  if (!cliente) {
    throw new HttpError(404, "NOT_FOUND", "Cliente no encontrado.");
  }

  return cliente;
}

export function normalizeClienteInput(data: ClienteUpsertInput): ClienteUpsertInput {
  const documento = data.documento.trim();
  const razonSocial = data.razon_social.trim();

  if (normalizeDocumento(documento).length < 2) {
    throw new HttpError(400, "VALIDATION_ERROR", "Documento invalido.");
  }

  if (razonSocial.length < 2) {
    throw new HttpError(400, "VALIDATION_ERROR", "Nombre o razon social invalido.");
  }

  return {
    documento_tipo: data.documento_tipo,
    documento,
    razon_social: razonSocial,
    direccion: normalizeOptional(data.direccion),
    telefono: normalizeOptional(data.telefono),
    email: normalizeOptional(data.email)
  };
}

