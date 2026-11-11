import type { ReactNode } from "react";

/**
 * Encabezado unico de pantalla (PAUTAS_FRONTEND_v0.1 P-L1; PLAN_UX_RESTO_APP_v0.1 §10.3): titulo y subtitulo a la
 * izquierda, acciones a la derecha y "Volver" solo si la pantalla es un paso dentro de otra. `rotulo` mantiene el
 * texto chico de arriba del titulo mientras las pantallas no pasen por R-1 (URA-002), que lo quita.
 */
export function EncabezadoPantalla({
  titulo,
  subtitulo,
  rotulo,
  acciones,
  onVolver,
  nivel = "h2",
  id
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  rotulo?: string;
  acciones?: ReactNode;
  onVolver?: () => void;
  nivel?: "h1" | "h2";
  id?: string;
}) {
  const Titulo = nivel;
  const volver = onVolver ? (
    <button className="ghost-action" onClick={onVolver} type="button">
      Volver
    </button>
  ) : null;
  return (
    <div className="editor-heading encabezado-pantalla">
      <div>
        {rotulo ? <p className="eyebrow">{rotulo}</p> : null}
        <Titulo id={id}>{titulo}</Titulo>
        {subtitulo ? <p className="muted">{subtitulo}</p> : null}
      </div>
      {acciones ? (
        <div className="header-actions">
          {acciones}
          {volver}
        </div>
      ) : (
        volver
      )}
    </div>
  );
}
