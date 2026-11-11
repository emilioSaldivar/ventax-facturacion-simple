// Movido de main.tsx sin cambios (PLAN_UX_RESTO_APP_v0.1 §10.9, URA-023).

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "brand-mark compact" : "brand-mark"} aria-label="Segel Factura">
      <img
        alt="Segel"
        className="brand-logo"
        src={compact ? "/app/brand/segel-isotipo.svg" : "/app/brand/segel-logo-fondo-claro.svg"}
      />
    </div>
  );
}
