// SPEC_DESCUENTOS_FACTURA_v0.1 RN-18c y RN-19c: una sola fila "Descuento (x %)" en los totales del editor, del
// resultado y de la ficha, sin importar si el descuento fue de linea, global o los dos (D-8). `totals.descuento` es
// el total de descuentos (oficial de FE una vez aprobada) y `totals.subtotal` el bruto.

export type FilaDescuento = { etiqueta: string; monto: number };

type TotalsConDescuento = { subtotal: number; descuento?: number };

/** "12 %" si es entero, "3,1 %" si no; null sin descuento o sin subtotal. */
export function porcentajeDescuento(descuento: number, subtotal: number): string | null {
  if (!(subtotal > 0) || !(descuento > 0)) return null;
  const porcentaje = Math.round((descuento * 1000) / subtotal) / 10;
  const texto = new Intl.NumberFormat("es-PY", { maximumFractionDigits: Number.isInteger(porcentaje) ? 0 : 1 }).format(porcentaje);
  return `${texto} %`;
}

/** La fila "Descuento (x %)" con el total de descuentos, o null cuando no hay descuento. */
export function filaDescuento(totals: TotalsConDescuento): FilaDescuento | null {
  const monto = Math.round((totals.descuento ?? 0) * 100) / 100;
  if (!(monto > 0)) return null;
  const porcentaje = porcentajeDescuento(monto, totals.subtotal);
  return { etiqueta: porcentaje ? `Descuento (${porcentaje})` : "Descuento", monto };
}
