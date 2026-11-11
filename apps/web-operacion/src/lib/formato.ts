// Formatos compartidos (PAUTAS_FRONTEND_v0.1 P-E4). URA-022 empieza con el numero correlativo; URA-023 mueve aca el
// resto de los formatos de main.tsx.

/** Numero de presupuesto, pedido o recibo con siete cifras: 12 -> "0000012". */
export function numeroCorrelativo(numero: number | string): string {
  return String(numero).padStart(7, "0");
}
