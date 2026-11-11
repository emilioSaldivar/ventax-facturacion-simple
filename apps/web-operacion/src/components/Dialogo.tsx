import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

const ENFOCABLES =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Ventana modal unica (PAUTAS_FRONTEND_v0.1 P-A4, P-L6; PLAN_UX_RESTO_APP_v0.1 §10.3): role="dialog", aria-modal,
 * titulo enlazado, foco inicial (el elemento con data-foco-inicial o el primero), foco atrapado con Tab y
 * Shift+Tab, Escape cierra y, al cerrar, el foco vuelve a donde estaba al abrir. Capa --z-dialogo.
 */
export function Dialogo({
  titulo,
  onCerrar,
  children,
  acciones,
  cerrarConEscape = true,
  ancho = "mediano"
}: {
  titulo: string;
  onCerrar: () => void;
  children?: ReactNode;
  acciones?: ReactNode;
  cerrarConEscape?: boolean;
  ancho?: "chico" | "mediano";
}) {
  const panel = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  const cerrar = useRef(onCerrar);
  cerrar.current = onCerrar;

  useEffect(() => {
    const previo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const raiz = panel.current;
    if (!raiz) return undefined;
    const enfocables = () => [...raiz.querySelectorAll<HTMLElement>(ENFOCABLES)];
    (raiz.querySelector<HTMLElement>("[data-foco-inicial]") ?? enfocables()[0] ?? raiz).focus();

    const alTeclear = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (!cerrarConEscape) return;
        event.preventDefault();
        event.stopPropagation();
        cerrar.current();
        return;
      }
      if (event.key !== "Tab") return;
      const lista = enfocables();
      if (lista.length === 0) {
        event.preventDefault();
        return;
      }
      const primero = lista[0]!;
      const ultimo = lista[lista.length - 1]!;
      const actual = document.activeElement;
      if (!raiz.contains(actual)) {
        event.preventDefault();
        primero.focus();
      } else if (event.shiftKey && actual === primero) {
        event.preventDefault();
        ultimo.focus();
      } else if (!event.shiftKey && actual === ultimo) {
        event.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener("keydown", alTeclear, true);
    return () => {
      document.removeEventListener("keydown", alTeclear, true);
      if (previo && previo.isConnected) previo.focus();
    };
  }, [cerrarConEscape]);

  return (
    <div className="dialogo-fondo" role="presentation">
      <div aria-labelledby={tituloId} aria-modal="true" className={`dialogo dialogo-${ancho}`} ref={panel} role="dialog" tabIndex={-1}>
        <h2 id={tituloId}>{titulo}</h2>
        {children}
        {acciones ? <div className="dialogo-acciones">{acciones}</div> : null}
      </div>
    </div>
  );
}

export interface OpcionesConfirmar {
  titulo: string;
  texto?: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  peligro?: boolean;
}

/** Confirmacion con Dialogo, en lugar de window.confirm (P-L6). Con `peligro`, el foco empieza en Cancelar. */
export function ConfirmarDialogo({
  titulo,
  texto,
  textoConfirmar = "Confirmar",
  textoCancelar = "Cancelar",
  peligro = false,
  onConfirmar,
  onCancelar
}: OpcionesConfirmar & { onConfirmar: () => void; onCancelar: () => void }) {
  return (
    <Dialogo
      acciones={
        <>
          <button className="ghost-action" data-foco-inicial={peligro ? "" : undefined} onClick={onCancelar} type="button">
            {textoCancelar}
          </button>
          <button className={peligro ? "danger-action" : "primary-action"} data-foco-inicial={peligro ? undefined : ""} onClick={onConfirmar} type="button">
            {textoConfirmar}
          </button>
        </>
      }
      ancho="chico"
      onCerrar={onCancelar}
      titulo={titulo}
    >
      {texto ? <p className="dialogo-texto">{texto}</p> : null}
    </Dialogo>
  );
}

/**
 * Pide una confirmacion y espera la respuesta, como window.confirm pero con Dialogo:
 * `if (!(await confirmar({ titulo: "¿Quitar esta línea?" }))) return;`. El elemento devuelto se pone en el JSX.
 */
export function useConfirmar(): [(opciones: OpcionesConfirmar) => Promise<boolean>, ReactNode] {
  const [pedido, setPedido] = useState<(OpcionesConfirmar & { resolver: (ok: boolean) => void }) | null>(null);
  const confirmar = useCallback(
    (opciones: OpcionesConfirmar) => new Promise<boolean>((resolver) => setPedido({ ...opciones, resolver })),
    []
  );
  const elemento = pedido ? (
    <ConfirmarDialogo
      {...pedido}
      onCancelar={() => {
        pedido.resolver(false);
        setPedido(null);
      }}
      onConfirmar={() => {
        pedido.resolver(true);
        setPedido(null);
      }}
    />
  ) : null;
  return [confirmar, elemento];
}
