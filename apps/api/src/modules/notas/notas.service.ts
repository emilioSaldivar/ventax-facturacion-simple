import { HttpError } from "../../shared/errors/http-error.js";
import { numeroALetras } from "../../shared/utils/numero-letras.js";
import type {
  NotaConItems,
  NotaCreateInput,
  NotaListFilters,
  NotaListResponse,
  NotaRecord,
  NotasRepository,
  NotaUpdateInput,
} from "./notas.types.js";

export { numeroALetras };

export async function createNota(
  facturadorId: string,
  input: NotaCreateInput,
  repository: NotasRepository
): Promise<NotaConItems> {
  if (!input.cliente_nombre?.trim()) {
    throw new HttpError(400, "VALIDATION_ERROR", "El nombre del cliente es requerido.");
  }
  return repository.create(facturadorId, input);
}

export async function getNota(
  id: string,
  facturadorId: string,
  repository: NotasRepository
): Promise<NotaConItems> {
  const nota = await repository.findById(id, facturadorId);
  if (!nota) throw new HttpError(404, "NOT_FOUND", "Nota no encontrada.");
  return nota;
}

export async function listNotas(
  facturadorId: string,
  filters: NotaListFilters,
  repository: NotasRepository
): Promise<NotaListResponse> {
  return repository.list(facturadorId, filters);
}

export async function updateNota(
  id: string,
  facturadorId: string,
  input: NotaUpdateInput,
  repository: NotasRepository
): Promise<NotaConItems> {
  return repository.update(id, facturadorId, input);
}

export async function emitirNota(
  id: string,
  facturadorId: string,
  repository: NotasRepository
): Promise<NotaConItems> {
  const nota = await repository.findById(id, facturadorId);
  if (!nota) throw new HttpError(404, "NOT_FOUND", "Nota no encontrada.");

  const tieneItemConPrecio = nota.items.some(it => it.fila_tipo === "ITEM");
  if (!tieneItemConPrecio) {
    throw new HttpError(400, "VALIDATION_ERROR", "La nota debe tener al menos un item con precio para emitirse.");
  }

  return repository.emitir(id, facturadorId);
}

export async function deleteNota(
  id: string,
  facturadorId: string,
  repository: NotasRepository
): Promise<void> {
  return repository.softDelete(id, facturadorId);
}

export async function verificarNota(
  token: string,
  repository: NotasRepository
): Promise<{ valido: boolean; nota?: NotaRecord }> {
  const nota = await repository.findByVerificationToken(token);
  if (!nota || nota.estado !== "EMITIDO") {
    return { valido: false };
  }
  return { valido: true, nota };
}
