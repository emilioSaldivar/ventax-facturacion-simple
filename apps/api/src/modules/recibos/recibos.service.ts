import { HttpError } from "../../shared/errors/http-error.js";
import type {
  ReciboRecord,
  ReciboCreateInput,
  ReciboListFilters,
  ReciboListResponse,
  ReciboUpdateInput,
  RecibosRepository,
} from "./recibos.types.js";

export async function createRecibo(
  facturadorId: string,
  input: ReciboCreateInput,
  repository: RecibosRepository
): Promise<ReciboRecord> {
  if (!input.pagador_nombre?.trim()) {
    throw new HttpError(400, "VALIDATION_ERROR", "El nombre del pagador es requerido.");
  }
  if (!input.concepto?.trim()) {
    throw new HttpError(400, "VALIDATION_ERROR", "El concepto es requerido.");
  }
  if (!input.importe || input.importe <= 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "El importe debe ser mayor a cero.");
  }
  return repository.create(facturadorId, input);
}

export async function getRecibo(
  id: string,
  facturadorId: string,
  repository: RecibosRepository
): Promise<ReciboRecord> {
  const recibo = await repository.findById(id, facturadorId);
  if (!recibo) throw new HttpError(404, "NOT_FOUND", "Recibo no encontrado.");
  return recibo;
}

export async function listRecibos(
  facturadorId: string,
  filters: ReciboListFilters,
  repository: RecibosRepository
): Promise<ReciboListResponse> {
  return repository.list(facturadorId, filters);
}

export async function updateRecibo(
  id: string,
  facturadorId: string,
  input: ReciboUpdateInput,
  repository: RecibosRepository
): Promise<ReciboRecord> {
  const recibo = await repository.findById(id, facturadorId);
  if (!recibo) throw new HttpError(404, "NOT_FOUND", "Recibo no encontrado.");
  if (recibo.estado === "EMITIDO") {
    throw new HttpError(409, "CONFLICT", "No se puede modificar un recibo ya emitido.");
  }
  if (input.importe !== undefined && input.importe <= 0) {
    throw new HttpError(400, "VALIDATION_ERROR", "El importe debe ser mayor a cero.");
  }
  return repository.update(id, facturadorId, input);
}

export async function emitirRecibo(
  id: string,
  facturadorId: string,
  repository: RecibosRepository
): Promise<ReciboRecord> {
  const recibo = await repository.findById(id, facturadorId);
  if (!recibo) throw new HttpError(404, "NOT_FOUND", "Recibo no encontrado.");
  if (recibo.estado === "EMITIDO") {
    throw new HttpError(409, "CONFLICT", "El recibo ya fue emitido.");
  }
  return repository.emitir(id, facturadorId);
}

export async function deleteRecibo(
  id: string,
  facturadorId: string,
  repository: RecibosRepository
): Promise<void> {
  const recibo = await repository.findById(id, facturadorId);
  if (!recibo) throw new HttpError(404, "NOT_FOUND", "Recibo no encontrado.");
  if (recibo.estado === "EMITIDO") {
    throw new HttpError(409, "CONFLICT", "No se puede eliminar un recibo ya emitido.");
  }
  return repository.softDelete(id, facturadorId);
}

export async function verificarRecibo(
  token: string,
  repository: RecibosRepository
): Promise<{ valido: boolean; recibo?: ReciboRecord }> {
  const recibo = await repository.findByVerificationToken(token);
  if (!recibo || recibo.estado !== "EMITIDO") {
    return { valido: false };
  }
  return { valido: true, recibo };
}
