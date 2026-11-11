import { HttpError } from "../../shared/errors/http-error";
import type { OperationalContextResponse } from "../context/context.types";
import type {
  CatalogoItem,
  CatalogoItemListResponse,
  CatalogoItemPersistInput,
  CatalogoItemUpsertInput,
  CatalogoRepository,
  MonedaCatalogo
} from "./catalogo.types";
import { monedasCatalogo } from "./catalogo.types";
import { generateAutoCodigo, normalizeCodigo } from "./catalogo.utils";

export async function searchCatalogoItems(
  context: OperationalContextResponse,
  input: { q: string; limit: number; moneda?: MonedaCatalogo },
  repository: CatalogoRepository
): Promise<{ items: CatalogoItem[] }> {
  return {
    items: await repository.search({
      facturadorId: context.facturador.id,
      q: input.q,
      limit: input.limit,
      ...(input.moneda ? { moneda: input.moneda } : {})
    })
  };
}

export async function listCatalogoItems(
  context: OperationalContextResponse,
  input: { q?: string; activo?: boolean; moneda?: MonedaCatalogo; limit: number; offset: number },
  repository: CatalogoRepository
): Promise<CatalogoItemListResponse> {
  return repository.list({
    facturadorId: context.facturador.id,
    q: input.q,
    activo: input.activo,
    ...(input.moneda ? { moneda: input.moneda } : {}),
    limit: input.limit,
    offset: input.offset
  });
}

export async function createCatalogoItem(
  context: OperationalContextResponse,
  data: CatalogoItemUpsertInput,
  repository: CatalogoRepository
): Promise<CatalogoItem> {
  const normalized = await normalizeCatalogoInput(context.facturador.id, data, repository);

  return repository.create({
    tenantId: context.tenant.id,
    facturadorId: context.facturador.id,
    userId: context.user.id,
    data: normalized
  });
}

export async function updateCatalogoItem(
  context: OperationalContextResponse,
  itemId: string,
  data: CatalogoItemUpsertInput,
  repository: CatalogoRepository
): Promise<CatalogoItem> {
  const normalized = await normalizeCatalogoInput(context.facturador.id, data, repository, itemId);
  const item = await repository.update({
    itemId,
    facturadorId: context.facturador.id,
    userId: context.user.id,
    data: normalized
  });

  if (!item) {
    throw new HttpError(404, "NOT_FOUND", "Item de catalogo no encontrado.");
  }

  return item;
}

export async function deleteCatalogoItem(
  context: OperationalContextResponse,
  itemId: string,
  repository: Pick<CatalogoRepository, "hardDelete">
): Promise<void> {
  const deleted = await repository.hardDelete({
    itemId,
    facturadorId: context.facturador.id
  });

  if (!deleted) {
    throw new HttpError(404, "NOT_FOUND", "Item de catalogo no encontrado.");
  }
}

export async function normalizeCatalogoInput(
  facturadorId: string,
  data: CatalogoItemUpsertInput,
  repository: Pick<CatalogoRepository, "existsByCodigo">,
  excludeItemId?: string
): Promise<CatalogoItemPersistInput> {
  const descripcion = data.descripcion.trim();
  if (!descripcion) {
    throw new HttpError(400, "VALIDATION_ERROR", "Descripcion requerida.");
  }

  // SPEC_CATALOGO_MONEDA_v0.1 RN-04 y RN-05.
  const moneda = (data.moneda ?? "PYG").trim().toUpperCase();
  if (!(monedasCatalogo as readonly string[]).includes(moneda)) {
    throw new HttpError(400, "VALIDATION_ERROR", "Moneda no admitida. Por ahora el catálogo acepta Gs. y USD.");
  }
  if (!precioValidoSegunMoneda(data.precio_unitario, moneda)) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      moneda === "PYG" ? "En guaraníes el precio va sin decimales." : `En ${moneda} el precio va con hasta 2 decimales.`
    );
  }

  const codigo = await resolveCodigo(facturadorId, data.codigo, repository, excludeItemId);

  return {
    codigo,
    descripcion,
    precio_unitario: moneda === "PYG" ? data.precio_unitario : Math.round(data.precio_unitario * 100) / 100,
    moneda: moneda as MonedaCatalogo,
    iva_tipo: data.iva_tipo ?? "IVA_10",
    activo: data.activo ?? true
  };
}

/** Entero en PYG; hasta 2 decimales en otra moneda, con tolerancia para el error de punto flotante. */
export function precioValidoSegunMoneda(precio: number, moneda: string): boolean {
  if (!Number.isFinite(precio) || precio < 0) return false;
  if (moneda === "PYG") return Number.isInteger(precio);
  return Math.abs(precio * 100 - Math.round(precio * 100)) < 1e-6;
}

async function resolveCodigo(
  facturadorId: string,
  inputCodigo: string | null | undefined,
  repository: Pick<CatalogoRepository, "existsByCodigo">,
  excludeItemId?: string
): Promise<string> {
  const provided = inputCodigo?.trim();

  if (provided) {
    const exists = await repository.existsByCodigo({
      facturadorId,
      codigoNormalizado: normalizeCodigo(provided),
      excludeItemId
    });

    if (exists) {
      throw new HttpError(409, "CONFLICT", "Ya existe un item con ese codigo para el facturador.");
    }

    return provided;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const generated = generateAutoCodigo();
    const exists = await repository.existsByCodigo({
      facturadorId,
      codigoNormalizado: normalizeCodigo(generated),
      excludeItemId
    });

    if (!exists) {
      return generated;
    }
  }

  throw new HttpError(409, "CONFLICT", "No se pudo generar un codigo unico para el item.");
}
