// Busqueda por numero completo (SPEC_UX_RESTO_APP_v0.1 C.6, D-15, RN-12; PLAN §9b, URA-025).
// "001-001-1010006" o "0010011010006": establecimiento, punto y numero. Cualquier otro texto no es numero completo.

export interface NumeroCompleto {
  establecimiento: string;
  punto: string;
  /** Digitos tal como los escribio el operador (1 a 7). */
  numero: string;
}

// Con guiones el numero puede ser corto (prefijo o sin ceros a la izquierda); sin guiones tiene que tener las 13
// cifras, si no "1010006" (un numero suelto, que se sigue buscando como antes) se leeria como 101-000-6.
const CON_GUIONES = /^(\d{3})-(\d{3})-(\d{1,7})$/;
const SIN_GUIONES = /^(\d{3})(\d{3})(\d{7})$/;

export function interpretarNumeroCompleto(texto: string | null | undefined): NumeroCompleto | null {
  const limpio = (texto ?? "").replace(/\s+/g, "");
  const m = CON_GUIONES.exec(limpio) ?? SIN_GUIONES.exec(limpio);
  if (!m) return null;
  return { establecimiento: m[1]!, punto: m[2]!, numero: m[3]! };
}
