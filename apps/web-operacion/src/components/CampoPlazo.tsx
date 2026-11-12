import { useId } from "react";
import { Icono } from "./Icono";
import { PLAZO_CREDITO_MAX, PLAZO_CREDITO_MIN, limpiarPlazo, plazoValido, sumarPlazo } from "../lib/plazoCredito";

/**
 * SPEC_PLAZO_CREDITO_v0.1, RN-02 a RN-05: plazo de credito en dias, con botones de 5 en 5 y escritura directa.
 * Va dentro de una `.banda-campo` de la banda Comprobante, con su misma etiqueta y alto.
 */
export function CampoPlazo({
  etiqueta,
  valor,
  onCambio,
  deshabilitado = false,
  error
}: {
  etiqueta: string;
  valor: string;
  onCambio: (valor: string) => void;
  deshabilitado?: boolean;
  error?: string | null;
}) {
  const id = useId();
  const idError = error ? `${id}-error` : undefined;
  const dias = plazoValido(valor);
  return (
    <div className="banda-campo banda-plazo">
      <label className="banda-etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      <div className={["plazo-campo", error ? "invalido" : "", deshabilitado ? "deshabilitado" : ""].filter(Boolean).join(" ")}>
        <button
          aria-label="Restar 5 días"
          className="plazo-boton"
          disabled={deshabilitado || (dias !== null && dias <= PLAZO_CREDITO_MIN)}
          onClick={() => onCambio(sumarPlazo(valor, -1))}
          type="button"
        >
          <Icono nombre="menos" tamano={16} />
        </button>
        <input
          aria-describedby={idError}
          aria-invalid={error ? true : undefined}
          aria-label="Plazo en días"
          autoComplete="off"
          className="plazo-numero"
          disabled={deshabilitado}
          id={id}
          inputMode="numeric"
          onChange={(event) => onCambio(limpiarPlazo(event.target.value))}
          value={valor}
        />
        <button
          aria-label="Sumar 5 días"
          className="plazo-boton"
          disabled={deshabilitado || (dias !== null && dias >= PLAZO_CREDITO_MAX)}
          onClick={() => onCambio(sumarPlazo(valor, 1))}
          type="button"
        >
          <Icono nombre="mas" tamano={16} />
        </button>
      </div>
      {error && !deshabilitado ? (
        <small className="campo-error" id={idError}>
          {error}
        </small>
      ) : null}
    </div>
  );
}
