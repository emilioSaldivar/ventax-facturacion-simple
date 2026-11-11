import React from "react";

/** SPEC_UX_NUEVA_FACTURA_v0.1, E.1 y PLAN 2: iconos SVG de trazo, sin emojis ni dependencias. */
export type NombreIcono =
  | "factura" | "agenda" | "documentos" | "notas" | "recibos" | "catalogo" | "devolver" | "estado" | "menu" | "salir"
  | "buscar" | "mas" | "papelera" | "guardar" | "lapiz" | "tilde" | "reloj" | "alerta" | "whatsapp" | "copiar"
  | "compartir" | "pdf" | "chevron-abajo" | "chevron-derecha" | "chevron-izquierda"
  | "mas-opciones" | "ojo" | "ojo-tachado" | "punto";

const TRAZOS_ICONO: Record<NombreIcono, React.ReactNode> = {
  factura: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M12 18v-6" /><path d="M9 15h6" /></>,
  agenda: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
  documentos: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />,
  notas: <><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /></>,
  recibos: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M6 12h.01M18 12h.01" /></>,
  catalogo: <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.3 7 12 12l8.7-5" /><path d="M12 22V12" /></>,
  devolver: <><path d="M9 14 4 9l5-5" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></>,
  estado: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  salir: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>,
  buscar: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  mas: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  papelera: <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></>,
  guardar: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8" /><path d="M7 3v5h8" /></>,
  lapiz: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  tilde: <path d="M20 6 9 17l-5-5" />,
  reloj: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
  alerta: <><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></>,
  whatsapp: <path d="M21 11.5a8.4 8.4 0 0 1-9.2 8.4 8.6 8.6 0 0 1-3.6-1L3 21l2.1-5.2A8.4 8.4 0 1 1 21 11.5z" />,
  copiar: <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  compartir: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></>,
  pdf: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>,
  "chevron-abajo": <path d="m6 9 6 6 6-6" />,
  "chevron-derecha": <path d="m9 6 6 6-6 6" />,
  "chevron-izquierda": <path d="m15 6-6 6 6 6" />,
  // PAUTAS_FRONTEND_v0.1 P-I1 (URA-017): reemplazan a "⋮" y al EyeIcon propio.
  "mas-opciones": (
    <>
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="19" r="1" />
    </>
  ),
  ojo: (
    <>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  // URA-021: marcador de lugar para el punto de expedicion.
  punto: (
    <>
      <path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  "ojo-tachado": (
    <>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M2 21 22 3" />
    </>
  )
};

export function Icono({ nombre, tamano = 18, grosor = 2 }: { nombre: NombreIcono; tamano?: number; grosor?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="icono"
      fill="none"
      height={tamano}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={grosor}
      viewBox="0 0 24 24"
      width={tamano}
    >
      {TRAZOS_ICONO[nombre]}
    </svg>
  );
}
