import type { ClienteNaturaleza } from "../tipos";

export function normalizeDocKey(value: string): string {
  return value.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
}

// Unico fallback de naturaleza permitido en frontend (solo longitud de RUC): la sugerencia
// combinada con sufijos societarios vive exclusivamente en el backend (naturaleza_sugerida),
// para evitar heuristicas divergentes entre cliente y servidor.
export function sugerirNaturalezaPorLongitudRuc(documento: string): ClienteNaturaleza {
  const rucSinDv = documento.trim().split("-")[0] ?? documento;
  return /^\d+$/.test(rucSinDv) && rucSinDv.length > 7 ? "JURIDICA" : "FISICA";
}
