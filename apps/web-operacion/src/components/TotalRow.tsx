// Movido de main.tsx sin cambios (PLAN_UX_RESTO_APP_v0.1 §10.9, URA-023).
import { formatMonto } from "../lib/formato";
import { filaDescuento } from "../lib/descuentos";

export function TotalRow({
  label,
  value,
  strong = false,
  moneda = "PYG",
  resta = false
}: {
  label: string;
  value: number;
  strong?: boolean;
  moneda?: string;
  /** SPEC_DESCUENTOS_FACTURA_v0.1 RN-18: el descuento se muestra en negativo ("− Gs. 50.000"). */
  resta?: boolean;
}) {
  return (
    <div className={strong ? "total-row strong" : resta ? "total-row resta" : "total-row"}>
      <span>{label}</span>
      <strong>{resta ? `− ${formatMonto(value, moneda)}` : formatMonto(value, moneda)}</strong>
    </div>
  );
}

/** SPEC_DESCUENTOS_FACTURA_v0.1 RN-18c: la fila "Descuento (x %)"; nada sin descuentos. */
export function FilaDescuento({ totals, moneda }: { totals: { subtotal: number; descuento?: number }; moneda: string }) {
  const fila = filaDescuento(totals);
  return fila ? <TotalRow label={fila.etiqueta} moneda={moneda} resta value={fila.monto} /> : null;
}
