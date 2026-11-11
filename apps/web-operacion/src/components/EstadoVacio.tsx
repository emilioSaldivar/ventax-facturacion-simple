import type { ReactNode } from "react";

/** Lista o tabla sin resultados (PAUTAS_FRONTEND_v0.1 §3). Mismas clases que el texto que reemplaza. */
export function EstadoVacio({ children }: { children: ReactNode }) {
  return <p className="muted empty-state estado-vacio">{children}</p>;
}
