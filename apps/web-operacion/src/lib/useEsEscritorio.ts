// Movido de main.tsx sin cambios (PLAN_UX_RESTO_APP_v0.1 §10.9, URA-023).
import { useEffect, useState } from "react";

/** SPEC_DOCUMENTOS_ESCRITORIO_v0.1, RN-01: 1024 px separa escritorio (menu lateral, tablas) de celular. */
export const MEDIA_ESCRITORIO = "(min-width: 1024px)";

export function useEsEscritorio(): boolean {
  const [esEscritorio, setEsEscritorio] = useState(() => typeof window !== "undefined" && window.matchMedia(MEDIA_ESCRITORIO).matches);
  useEffect(() => {
    const consulta = window.matchMedia(MEDIA_ESCRITORIO);
    const alCambiar = () => setEsEscritorio(consulta.matches);
    alCambiar();
    consulta.addEventListener("change", alCambiar);
    return () => consulta.removeEventListener("change", alCambiar);
  }, []);
  return esEscritorio;
}
