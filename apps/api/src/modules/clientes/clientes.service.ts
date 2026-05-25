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

export async function autocompleteClienteFromDnit(
  data: { documento_tipo: "RUC" | "CI"; documento: string },
  repository: ClienteRepository
): Promise<
  | {
      found: true;
      ambiguous: false;
      cliente: {
        documento_tipo: "RUC" | "CI";
        documento: string;
        razon_social: string;
        nombre: string | null;
        apellido: string | null;
        codigo_dnit: string | null;
        estado: string | null;
      };
    }
  | {
      found: false;
      ambiguous: boolean;
      message: string;
    }
> {
  const parsed = parseRucCiDocumento(data.documento);

  if (!parsed) {
    throw new HttpError(400, "VALIDATION_ERROR", "Documento invalido para lookup DNIT.");
  }

  const result = await repository.findDnitByDocumento({
    documentoTipo: data.documento_tipo,
    rucSinDv: parsed.rucSinDv,
    dv: parsed.dv
  });

  if (result.status === "NOT_FOUND" || !result.item) {
    return { found: false, ambiguous: false, message: "Sin coincidencias DNIT." };
  }

  if (result.status === "AMBIGUOUS") {
    return { found: false, ambiguous: true, message: "Se encontraron multiples registros. Verifique el digito verificador." };
  }

  return {
    found: true,
    ambiguous: false,
    cliente: {
      documento_tipo: data.documento_tipo,
      documento: resolveAutocompleteDocumento(result.item),
      razon_social: result.item.razon_social,
      nombre: result.item.nombre,
      apellido: result.item.apellido,
      codigo_dnit: result.item.codigo_dnit,
      estado: result.item.estado
    }
  };
}

function resolveAutocompleteDocumento(item: {
  ruc_sin_dv: string;
  dv: string;
  ruc: string;
  estado: string | null;
  nombre: string | null;
  apellido: string | null;
}): string {
  const estado = (item.estado ?? "").trim().toUpperCase();
  const isJuridica = isJuridicaByRuc(item.ruc_sin_dv);

  if (isJuridica) {
    return item.ruc;
  }

  if (estado === "ACTIVO") {
    return item.ruc;
  }

  return item.ruc_sin_dv;
}

function isJuridicaByRuc(rucSinDv: string): boolean {
  return /^\d+$/.test(rucSinDv) && rucSinDv.length > 7;
}

function parseRucCiDocumento(documento: string): { rucSinDv: string; dv?: string } | null {
  const value = documento.trim();
  if (!value) {
    return null;
  }

  const cleaned = value.replace(/\s+/g, "").replace(/[^\d-]/g, "");
  if (!cleaned) {
    return null;
  }

  if (cleaned.includes("-")) {
    const [base, dv] = cleaned.split("-", 2);
    if (!base || !dv || !/^\d+$/.test(base) || !/^\d{1,2}$/.test(dv)) {
      return null;
    }
    return { rucSinDv: base, dv };
  }

  if (!/^\d+$/.test(cleaned)) {
    return null;
  }

  return { rucSinDv: cleaned };
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
