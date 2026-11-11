import type { Estado } from "../lib/estados";

/**
 * Pastilla de estado unica (PAUTAS_FRONTEND_v0.1 P-E1; PLAN_UX_RESTO_APP_v0.1 §10.3). Conserva las clases
 * `status-pill estado-documento <tono>` y `data-estado`, que leen los guiones de Playwright.
 */
export function PastillaEstado({ texto, tono, codigo }: Estado) {
  return (
    <small className={`status-pill estado-documento ${tono}`} data-estado={codigo}>
      {texto}
    </small>
  );
}
