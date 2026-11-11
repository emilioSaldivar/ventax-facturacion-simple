import { HttpError } from "../../shared/errors/http-error";
import type { FiscalGateway, FiscalGeografiaResponse } from "../fiscal-gateway/fiscal-gateway.types";

/**
 * SPEC_NOTA_REMISION_v0.1 RN-08: geografia del MT150 proxeada desde FE, en memoria 24 horas por nivel y padre.
 * FE confirmo (2026-11-11) que los codigos son estables y cambian solo con una `version` nueva del catalogo.
 */
const VEINTICUATRO_HORAS = 24 * 60 * 60 * 1000;
const cache = new Map<string, { valor: FiscalGeografiaResponse; expiraEn: number }>();

export const MENSAJE_GEOGRAFIA_NO_DISPONIBLE = "No se pudo cargar la lista de ciudades. Reintentá en unos segundos.";

export async function leerGeografia(
  gateway: FiscalGateway,
  filtro: { departamento?: number; distrito?: number },
  ahora = Date.now()
): Promise<FiscalGeografiaResponse> {
  const clave = filtro.distrito ? `ciudades:${filtro.distrito}` : filtro.departamento ? `distritos:${filtro.departamento}` : "departamentos";
  const guardado = cache.get(clave);
  if (guardado && guardado.expiraEn > ahora) return guardado.valor;
  if (!gateway.getGeografia) throw new HttpError(503, "INTERNAL_ERROR", MENSAJE_GEOGRAFIA_NO_DISPONIBLE);
  try {
    const valor = await gateway.getGeografia(filtro);
    cache.set(clave, { valor, expiraEn: ahora + VEINTICUATRO_HORAS });
    return valor;
  } catch {
    // Con FE caido sirve lo ultimo que haya, aunque este vencido.
    if (guardado) return guardado.valor;
    throw new HttpError(503, "INTERNAL_ERROR", MENSAJE_GEOGRAFIA_NO_DISPONIBLE);
  }
}

/** Solo para pruebas. */
export function limpiarCacheGeografia(): void {
  cache.clear();
}
