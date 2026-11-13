import { HttpError } from "../../shared/errors/http-error";
import type { FiscalGateway, FiscalGeografiaResponse } from "../fiscal-gateway/fiscal-gateway.types";

/**
 * SPEC_NOTA_REMISION_v0.1 RN-08: geografia del MT150 proxeada desde FE, en memoria 24 horas por nivel y padre.
 * FE confirmo (2026-11-11) que los codigos son estables y cambian solo con una `version` nueva del catalogo.
 */
const VEINTICUATRO_HORAS = 24 * 60 * 60 * 1000;
/** FS-155: maximo de `tDesCiudad` (DE_Types_v150.xsd); FE marca estas ciudades en segel-rc4.38 (DIR-017). */
export const MAX_DESCRIPCION_CIUDAD = 30;
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
    const respuesta = await gateway.getGeografia(filtro);
    // SPEC_DIRECCION_RECEPTOR_v0.1 RN-07 (FS-155): SIFEN admite hasta 30 caracteres en la descripcion de la ciudad
    // (tDesCiudad) y xmlgen no la recorta; esas ciudades se rechazarian despues de numerar. Misma regla que FE.
    const valor = filtro.distrito ? { ...respuesta, items: respuesta.items.filter((c) => c.descripcion.length <= MAX_DESCRIPCION_CIUDAD) } : respuesta;
    cache.set(clave, { valor, expiraEn: ahora + VEINTICUATRO_HORAS });
    return valor;
  } catch {
    // Con FE caido sirve lo ultimo que haya, aunque este vencido.
    if (guardado) return guardado.valor;
    throw new HttpError(503, "INTERNAL_ERROR", MENSAJE_GEOGRAFIA_NO_DISPONIBLE);
  }
}

/**
 * SPEC_DIRECCION_RECEPTOR_v0.1 RN-04: ciudades de un departamento, ordenadas por descripcion, con su distrito.
 * FE (segel-rc4.36) las publica solo por distrito: se unen las de cada distrito del departamento, con la misma
 * cache por distrito. En segel-rc4.38 FE las publica por departamento (DIR-017).
 */
export async function leerCiudadesDeDepartamento(
  gateway: FiscalGateway,
  departamento: number,
  ahora = Date.now()
): Promise<FiscalGeografiaResponse> {
  const distritos = await leerGeografia(gateway, { departamento }, ahora);
  const porDistrito = await Promise.all(distritos.items.map((d) => leerGeografia(gateway, { distrito: d.codigo }, ahora)));
  const items = porDistrito
    .flatMap((r, i) => r.items.map((c) => ({ ...c, distrito: c.distrito ?? distritos.items[i]!.codigo, departamento })))
    .sort((a, b) => a.descripcion.localeCompare(b.descripcion, "es"));
  return { version: distritos.version, items };
}

/** Solo para pruebas. */
export function limpiarCacheGeografia(): void {
  cache.clear();
}
