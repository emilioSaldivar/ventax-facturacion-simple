import { useEffect, useRef, type ReactNode } from "react";
import { Icono } from "./Icono";

/**
 * Menu "mas opciones" de una fila o tarjeta (PAUTAS_FRONTEND_v0.1 P-A3; PLAN_UX_RESTO_APP_v0.1 §10.3). El boton tiene
 * nombre, aria-haspopup y aria-expanded; al abrir, el foco pasa a la primera opcion; Escape cierra y devuelve el
 * foco al boton. Los hijos son <button role="menuitem">. Conserva las clases de antes para no cambiar estilos.
 */
export function MenuFila({
  etiqueta,
  abierto,
  onAbrir,
  onCerrar,
  children
}: {
  etiqueta: string;
  abierto: boolean;
  onAbrir: () => void;
  onCerrar: () => void;
  children: ReactNode;
}) {
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;

  useEffect(() => {
    if (!abierto) return undefined;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    const alTeclear = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cerrar.current();
      boton.current?.focus();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [abierto]);

  return (
    <div className="document-row-menu-wrapper menu-fila">
      <button
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-label={etiqueta}
        className="icon-menu-action"
        onClick={() => (abierto ? onCerrar() : onAbrir())}
        ref={boton}
        type="button"
      >
        <Icono nombre="mas-opciones" />
      </button>
      {abierto ? (
        <div aria-label={etiqueta} className="client-row-menu" ref={menu} role="menu">
          {children}
        </div>
      ) : null}
    </div>
  );
}
