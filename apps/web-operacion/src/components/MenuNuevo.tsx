import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icono, type NombreIcono } from "./Icono";

export interface OpcionNuevo {
  clave: string;
  nombre: string;
  descripcion: string;
  icono: NombreIcono;
  /** "Próximamente", "No habilitado" o "Por planilla". */
  etiqueta?: string;
  deshabilitado?: boolean;
  onElegir: () => void;
}

/**
 * Boton "Nuevo" de la barra de escritorio (SPEC_UX_RESTO_APP_v0.1 A.3, D-4; PLAN §3, URA-004): un solo lugar con todo
 * lo que se puede emitir. aria-haspopup y aria-expanded; al abrir, el foco pasa a la primera opcion habilitada; Escape
 * o un clic afuera cierran y el foco vuelve al boton. Las opciones "Próximamente" y "No habilitado" no se pueden elegir (RN-02).
 */
export function MenuNuevo({ bloques, pie }: { bloques: Array<{ titulo: string; opciones: OpcionNuevo[] }>; pie?: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return undefined;
    raiz.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key !== "Escape") return;
      evento.preventDefault();
      setAbierto(false);
      boton.current?.focus();
    };
    const alTocarAfuera = (evento: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(evento.target as Node)) setAbierto(false);
    };
    document.addEventListener("keydown", alTeclear);
    document.addEventListener("mousedown", alTocarAfuera);
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.removeEventListener("mousedown", alTocarAfuera);
    };
  }, [abierto]);

  return (
    <div className="menu-nuevo" ref={raiz}>
      <button
        aria-expanded={abierto}
        aria-haspopup="menu"
        className="primary-action menu-nuevo-boton"
        onClick={() => setAbierto((v) => !v)}
        ref={boton}
        type="button"
      >
        <Icono nombre="mas" /> Nuevo
      </button>
      {abierto ? (
        <div aria-label="Nuevo documento" className="menu-nuevo-panel" role="menu">
          {bloques.map((bloque) => (
            <div className="menu-nuevo-bloque" key={bloque.titulo} role="group" aria-label={bloque.titulo}>
              <p className="menu-nuevo-titulo">{bloque.titulo}</p>
              {bloque.opciones.map((opcion) => (
                <button
                  aria-disabled={opcion.deshabilitado || undefined}
                  className="menu-nuevo-opcion"
                  disabled={opcion.deshabilitado}
                  key={opcion.clave}
                  onClick={() => {
                    setAbierto(false);
                    opcion.onElegir();
                  }}
                  role="menuitem"
                  type="button"
                >
                  <span className="menu-nuevo-icono"><Icono nombre={opcion.icono} /></span>
                  <span className="menu-nuevo-texto">
                    <span className="menu-texto">
                      <strong className="menu-nombre">{opcion.nombre}</strong>
                      {opcion.etiqueta ? <span className="menu-tag">{opcion.etiqueta}</span> : null}
                    </span>
                    <small>{opcion.descripcion}</small>
                  </span>
                </button>
              ))}
            </div>
          ))}
          {pie ? <p className="menu-nuevo-pie">{pie}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
