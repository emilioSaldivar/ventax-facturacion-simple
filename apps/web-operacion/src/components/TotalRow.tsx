// Movido de main.tsx sin cambios (PLAN_UX_RESTO_APP_v0.1 §10.9, URA-023).
import { formatMonto } from "../lib/formato";

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
