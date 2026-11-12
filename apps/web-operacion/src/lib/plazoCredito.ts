/**
 * SPEC_PLAZO_CREDITO_v0.1: plazo de credito escrito por el operador.
 * SIFEN (E643 dPlazoCre) y FE no tienen tope; el rango de 1 a 365 es de FS (D-2).
 */
export const PLAZO_CREDITO_DEFECTO = 30;
export const PLAZO_CREDITO_PASO = 5;
export const PLAZO_CREDITO_MIN = 1;
export const PLAZO_CREDITO_MAX = 365;

export const MENSAJE_PLAZO_INVALIDO = `Escribí un plazo de ${PLAZO_CREDITO_MIN} a ${PLAZO_CREDITO_MAX} días`;

/** RN-04: solo digitos, sin ceros a la izquierda, hasta 3 cifras. Puede quedar vacio mientras se escribe. */
export function limpiarPlazo(texto: string): string {
  return texto.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 3);
}

/** RN-03: el plazo como entero si esta en rango; si no, null. */
export function plazoValido(texto: string): number | null {
  if (!/^\d+$/.test(texto)) return null;
  const dias = Number(texto);
  return Number.isInteger(dias) && dias >= PLAZO_CREDITO_MIN && dias <= PLAZO_CREDITO_MAX ? dias : null;
}

/** RN-05. */
export function errorPlazo(texto: string): string | null {
  return plazoValido(texto) === null ? MENSAJE_PLAZO_INVALIDO : null;
}

/** RN-02 y RN-03: suma o resta 5 dias dentro del rango; con un texto invalido parte del valor por defecto. */
export function sumarPlazo(texto: string, signo: 1 | -1): string {
  const actual = plazoValido(texto) ?? PLAZO_CREDITO_DEFECTO;
  const siguiente = Math.min(PLAZO_CREDITO_MAX, Math.max(PLAZO_CREDITO_MIN, actual + signo * PLAZO_CREDITO_PASO));
  return String(siguiente);
}
