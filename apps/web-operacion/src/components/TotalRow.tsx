// Movido de main.tsx sin cambios (PLAN_UX_RESTO_APP_v0.1 §10.9, URA-023).
import { formatMonto } from "../lib/formato";
import { desgloseDescuentos } from "../lib/descuentos";

export function TotalRow({
  label,
  value,
  strong = false,
  moneda = "PYG",
  resta = false,
  cierre = false
}: {
  label: string;
  value: number;
  strong?: boolean;
  moneda?: string;
  /** SPEC_DESCUENTOS_FACTURA_v0.1 RN-18: el descuento se muestra en negativo ("− Gs. 50.000"). */
  resta?: boolean;
  /** RN-18b: la fila que cierra el desglose de descuentos (tinta normal). */
  cierre?: boolean;
}) {
  return (
    <div className={strong ? "total-row strong" : resta ? (cierre ? "total-row resta cierre" : "total-row resta") : "total-row"}>
      <span>{label}</span>
      <strong>{resta ? `− ${formatMonto(value, moneda)}` : formatMonto(value, moneda)}</strong>
    </div>
  );
}

/** SPEC_DESCUENTOS_FACTURA_v0.1 RN-18b: filas del desglose de descuentos; nada sin descuentos. */
export function FilasDescuento({ totals, moneda }: { totals: { subtotal: number; descuento?: number; descuento_global?: number }; moneda: string }) {
  return (
    <>
      {desgloseDescuentos(totals).map((fila) => (
        <TotalRow cierre={fila.cierre} key={fila.etiqueta} label={fila.etiqueta} moneda={moneda} resta value={fila.monto} />
      ))}
    </>
  );
}
