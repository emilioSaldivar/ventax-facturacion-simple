import { pool } from "../../db/pool";

/** SPEC_NOTA_REMISION_v0.1 RN-01: permisos de la clave de consumidor del facturador, tomados del export de FE. */
const textos = (valor: unknown): string[] => (Array.isArray(valor) ? valor.filter((p): p is string => typeof p === "string") : []);

export async function permisosDelFacturador(
  facturadorId: string
): Promise<{ permisos: string[]; tiposDocumento: string[]; apiKey: string | null }> {
  const r = await pool.query<{ fe_consumer_permisos: unknown; fe_tipos_documento: unknown; fe_consumer_api_key: string | null }>(
    "select fe_consumer_permisos, fe_tipos_documento, fe_consumer_api_key from facturadores where id = $1",
    [facturadorId]
  );
  const fila = r.rows[0];
  return { permisos: textos(fila?.fe_consumer_permisos), tiposDocumento: textos(fila?.fe_tipos_documento), apiKey: fila?.fe_consumer_api_key ?? null };
}

/**
 * RN-01 y RN-01b: la clave tiene NRE_EMIT **y** el emisor tiene un numerador tipo 7 ("NRE" en
 * `tipos_documento_habilitados` del export). FE no exporta numeradores por punto: si el punto activo no tiene
 * numerador tipo 7, FE rechaza antes de numerar (sin hueco) y FS lo muestra como error.
 */
export function remisionHabilitada(datos: { permisos: string[]; tiposDocumento: string[] }): boolean {
  return datos.permisos.includes("NRE_EMIT") && datos.tiposDocumento.includes("NRE");
}

export async function notaRemisionHabilitada(facturadorId: string): Promise<boolean> {
  return remisionHabilitada(await permisosDelFacturador(facturadorId));
}
