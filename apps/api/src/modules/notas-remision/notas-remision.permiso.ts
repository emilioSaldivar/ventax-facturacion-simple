import { pool } from "../../db/pool";

/** SPEC_NOTA_REMISION_v0.1 RN-01: permisos de la clave de consumidor del facturador, tomados del export de FE. */
export async function permisosDelFacturador(facturadorId: string): Promise<{ permisos: string[]; apiKey: string | null }> {
  const r = await pool.query<{ fe_consumer_permisos: unknown; fe_consumer_api_key: string | null }>(
    "select fe_consumer_permisos, fe_consumer_api_key from facturadores where id = $1",
    [facturadorId]
  );
  const fila = r.rows[0];
  const permisos = Array.isArray(fila?.fe_consumer_permisos) ? (fila!.fe_consumer_permisos as unknown[]).filter((p): p is string => typeof p === "string") : [];
  return { permisos, apiKey: fila?.fe_consumer_api_key ?? null };
}

export async function notaRemisionHabilitada(facturadorId: string): Promise<boolean> {
  return (await permisosDelFacturador(facturadorId)).permisos.includes("NRE_EMIT");
}
