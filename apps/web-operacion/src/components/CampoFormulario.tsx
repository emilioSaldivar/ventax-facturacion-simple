import { cloneElement, isValidElement, useId, type ReactElement } from "react";

/**
 * Campo con etiqueta asociada por htmlFor, ayuda y error (PAUTAS_FRONTEND_v0.1 P-A5). El control va como unico
 * hijo; si no trae id, se le asigna uno. `className` permite conservar el estilo de la pantalla que lo adopta.
 */
export function CampoFormulario({
  etiqueta,
  ayuda,
  error,
  className,
  children
}: {
  etiqueta: string;
  ayuda?: string;
  error?: string | null;
  className?: string;
  children: ReactElement<{ id?: string; "aria-describedby"?: string }>;
}) {
  const generado = useId();
  const id = (isValidElement(children) && children.props.id) || generado;
  const idAyuda = ayuda ? `${id}-ayuda` : undefined;
  const control = cloneElement(children, { id, "aria-describedby": idAyuda });
  return (
    <div className={["campo-formulario", className].filter(Boolean).join(" ")}>
      <label htmlFor={id}>{etiqueta}</label>
      {control}
      {ayuda ? (
        <small className="campo-ayuda" id={idAyuda}>
          {ayuda}
        </small>
      ) : null}
      {error ? (
        <span className="campo-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
