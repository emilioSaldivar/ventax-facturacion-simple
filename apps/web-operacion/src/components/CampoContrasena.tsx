import { useState } from "react";
import { Icono } from "./Icono";

/**
 * Campo de contraseña con "Mostrar contraseña" dentro del campo (PAUTAS_FRONTEND_v0.1 P-A5; SPEC_UX_RESTO_APP H-05).
 * El boton se alcanza con Tab y dice si esta activo (aria-pressed). Lo usan el login y el cambio de punto.
 */
export function CampoContrasena({
  etiqueta,
  value,
  onChange,
  name,
  autoComplete = "current-password",
  required,
  disabled
}: {
  etiqueta: string;
  value: string;
  onChange: (valor: string) => void;
  name?: string;
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="campo-contrasena">
      {etiqueta}
      <span className="password-input">
        <input
          autoComplete={autoComplete}
          disabled={disabled}
          name={name}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          type={visible ? "text" : "password"}
          value={value}
        />
        <button
          aria-label="Mostrar contraseña"
          aria-pressed={visible}
          className="password-toggle"
          onClick={() => setVisible((v) => !v)}
          type="button"
        >
          <Icono nombre={visible ? "ojo-tachado" : "ojo"} grosor={1.6} />
        </button>
      </span>
    </label>
  );
}
