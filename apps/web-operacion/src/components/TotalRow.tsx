// Movido de main.tsx sin cambios (PLAN_UX_RESTO_APP_v0.1 §10.9, URA-023).
import { formatMonto } from "../lib/formato";

export function TotalRow({ label, value, strong = false, moneda = "PYG" }: { label: string; value: number; strong?: boolean; moneda?: string }) {
  return (
    <div className={strong ? "total-row strong" : "total-row"}>
      <span>{label}</span>
      <strong>{formatMonto(value, moneda)}</strong>
    </div>
  );
}
