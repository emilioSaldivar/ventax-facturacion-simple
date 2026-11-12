// SPEC_DESCUENTOS_FACTURA_v0.1 RN-18b y RN-19b: desglose de los descuentos para los totales del editor, del
// resultado y de la ficha. `totals.descuento` es el total de descuentos (de linea mas global; oficial de FE una vez
// aprobada) y `totals.descuento_global` el monto cargado sobre el total; el de linea sale por diferencia.

export type FilaDescuento = {
  etiqueta: string;
  monto: number;
  /** La fila que cierra el desglose: lleva el porcentaje y va en tinta normal. */
  cierre: boolean;
};

type TotalsConDescuento = { subtotal: number; descuento?: number; descuento_global?: number };

const redondear2 = (valor: number) => Math.round(valor * 100) / 100;

/** "12 %" si es entero, "3,1 %" si no; null sin descuento o sin subtotal. */
export function porcentajeDescuento(descuento: number, subtotal: number): string | null {
  if (!(subtotal > 0) || !(descuento > 0)) return null;
  const porcentaje = Math.round((descuento * 1000) / subtotal) / 10;
  const texto = new Intl.NumberFormat("es-PY", { maximumFractionDigits: Number.isInteger(porcentaje) ? 0 : 1 }).format(porcentaje);
  return `${texto} %`;
}

/**
 * Filas en orden: "Descuento por línea" y "Descuento sobre el total" cuando cada una es mayor que cero, y
 * "Total descuentos" solo cuando hay de los dos. La ultima lleva el porcentaje sobre el subtotal bruto.
 * Sin descuentos devuelve una lista vacia.
 */
export function desgloseDescuentos(totals: TotalsConDescuento): FilaDescuento[] {
  const total = redondear2(totals.descuento ?? 0);
  const global = redondear2(totals.descuento_global ?? 0);
  const porLinea = redondear2(Math.max(0, total - global));
  const filas: FilaDescuento[] = [];
  if (porLinea > 0) filas.push({ etiqueta: "Descuento por línea", monto: porLinea, cierre: false });
  if (global > 0) filas.push({ etiqueta: "Descuento sobre el total", monto: global, cierre: false });
  if (filas.length === 0) return filas;
  if (filas.length === 2) filas.push({ etiqueta: "Total descuentos", monto: total, cierre: false });
  const ultima = filas[filas.length - 1]!;
  ultima.cierre = true;
  const porcentaje = porcentajeDescuento(ultima.monto, totals.subtotal);
  if (porcentaje) ultima.etiqueta = `${ultima.etiqueta} (${porcentaje})`;
  return filas;
}
