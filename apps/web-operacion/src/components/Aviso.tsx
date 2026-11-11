import type { ReactNode } from "react";

export type TonoAviso = "error" | "atencion" | "info" | "exito";

/**
 * Aviso dentro de la pantalla (PAUTAS_FRONTEND_v0.1 P-D3, P-L7). Reemplaza a form-error, error-banner, inline-error,
 * inline-message, editor-alert y carga-aviso a medida que cada pantalla lo adopta. El error se anuncia con
 * role="alert"; el resto con role="status".
 */
export function Aviso({ tono, children, rol }: { tono: TonoAviso; children: ReactNode; rol?: "alert" | "status" }) {
  return (
    <p className={`aviso aviso-${tono}`} role={rol ?? (tono === "error" ? "alert" : "status")}>
      {children}
    </p>
  );
}
