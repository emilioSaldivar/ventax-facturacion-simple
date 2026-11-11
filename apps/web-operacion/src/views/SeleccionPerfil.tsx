// Movido de main.tsx sin cambios (PLAN_UX_RESTO_APP_v0.1 §10.9, URA-023).
import { FormEvent, useEffect, useState } from "react";
import { CampoContrasena } from "../components/CampoContrasena";
import { Icono } from "../components/Icono";
import { actividadPunto, nombrePunto } from "../lib/punto";
import { ApiClientError, motivoDeError } from "../api/cliente";
import { type PerfilDisponible, type UserSummary } from "../tipos";
import { BrandMark } from "../components/BrandMark";

// ─── SPEC_MULTIPERFIL_USUARIO_v0.1 §C.1: elegir el punto de expedicion ───────
export function PerfilOpcionContenido({ perfil }: { perfil: PerfilDisponible }) {
  return (
    <>
      {/* URA-021 (P-P1, H-02): el punto es el titulo; la actividad, en dos renglones como maximo, va debajo. */}
      <span className="perfil-opcion-texto">
        <strong>{nombrePunto(perfil)}</strong>
        {actividadPunto(perfil) ? (
          <small className="perfil-opcion-actividad" title={actividadPunto(perfil)}>
            {actividadPunto(perfil)}
          </small>
        ) : null}
        <small>
          Establecimiento {perfil.establecimiento} · Timbrado {perfil.timbrado}
        </small>
        {/* SPEC_MULTIPERFIL_USUARIO_v0.2 D-13: sin "Ultimo numero" (es la referencia local, no el numerador de FE). */}
        {perfil.numeracion_facturas === "CLIENTE" ? <small className="perfil-opcion-numero">Solo carga de archivo</small> : null}
      </span>
    </>
  );
}

/** SPEC_MULTIPERFIL_USUARIO_v0.2 RN-15: el token de eleccion dura 10 minutos y no se renueva (D-8, D-15). */
export const PERFIL_SELECT_TTL_MS = 10 * 60 * 1000;

export const MENSAJE_ELECCION_VENCIDA = "La elección de punto venció. Volvé a entrar.";

export function SeleccionPerfilScreen({
  perfiles: perfilesIniciales,
  user,
  onElegir,
  onSalir,
  onVencida,
  onRefrescarLista
}: {
  perfiles: PerfilDisponible[];
  user: UserSummary | null;
  onElegir: (operacionConfigId: string) => Promise<void>;
  onSalir: () => Promise<void>;
  onVencida: (mensaje: string) => void;
  onRefrescarLista: () => Promise<PerfilDisponible[]>;
}) {
  const [perfiles, setPerfiles] = useState(perfilesIniciales);
  const [eligiendo, setEligiendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vencida, setVencida] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setVencida(true), PERFIL_SELECT_TTL_MS);
    return () => window.clearTimeout(id);
  }, []);

  async function elegir(id: string) {
    setEligiendo(id);
    setError(null);
    try {
      await onElegir(id);
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) {
        if (motivoDeError(e) !== "PERFIL_NO_DISPONIBLE") {
          onVencida(MENSAJE_ELECCION_VENCIDA);
          return;
        }
        // D-16: el backoffice quito ese punto mientras se elegia; se refresca la lista.
        try {
          const lista = await onRefrescarLista();
          if (lista.length === 0) {
            onVencida("No tenés puntos de expedición asignados. Contactá con soporte.");
            return;
          }
          if (lista.length === 1) {
            await elegir(lista[0]!.operacion_config_id);
            return;
          }
          setPerfiles(lista);
          setError("Ese punto ya no está disponible. Elegí otro.");
        } catch {
          onVencida(MENSAJE_ELECCION_VENCIDA);
          return;
        }
        setEligiendo(null);
        return;
      }
      setError(e instanceof Error ? e.message : "No se pudo elegir el punto de expedición.");
      setEligiendo(null);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel perfil-eleccion" aria-labelledby="perfil-titulo">
        <BrandMark />
        <div className="auth-copy">
          <p className="muted">Hola, {user?.display_name ?? user?.username ?? ""}</p>
          <h1 id="perfil-titulo">¿Desde qué punto vas a trabajar?</h1>
          <p className="muted perfil-eleccion-limite">{vencida ? "La elección venció." : "Tenés 10 minutos para elegir."}</p>
        </div>
        <div className="perfil-lista" role="list">
          {perfiles.map((perfil) => (
            <button
              aria-label={`Elegir ${nombrePunto(perfil)} ${actividadPunto(perfil)}`.trim()}
              className="perfil-opcion"
              disabled={eligiendo !== null || vencida}
              key={perfil.operacion_config_id}
              onClick={() => void elegir(perfil.operacion_config_id)}
              role="listitem"
              type="button"
            >
              <PerfilOpcionContenido perfil={perfil} />
              <Icono nombre="chevron-derecha" />
            </button>
          ))}
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        {vencida ? (
          <button className="primary-action" onClick={() => onVencida(MENSAJE_ELECCION_VENCIDA)} type="button">
            Volver a entrar
          </button>
        ) : (
          <button className="ghost-action" onClick={() => void onSalir()} type="button">
            Salir
          </button>
        )}
      </section>
    </main>
  );
}

/** SPEC_MULTIPERFIL_USUARIO_v0.2 B.3 (F-5, RN-16, D-14): un solo boton; no hay forma segura de conservar el borrador. */
export function AvisoCambioExterno({ onEntendido }: { onEntendido: () => void }) {
  return (
    <div className="menu-scrim dialog-perfil-scrim" role="presentation">
      <div aria-labelledby="aviso-cambio-titulo" aria-modal="true" className="dialog-perfil" role="dialog">
        <h2 id="aviso-cambio-titulo">Tu punto de expedición cambió</h2>
        <p className="aviso-perfil">El backoffice cambió tu punto de expedición. Lo que tenías cargado se descarta.</p>
        <div className="dialog-perfil-acciones">
          <button autoFocus className="primary-action" onClick={onEntendido} type="button">
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SPEC_MULTIPERFIL_USUARIO_v0.1 §C.3 y §C.4: cambiar de punto con contraseña ─
export function CambioPerfilDialog({
  perfiles,
  activoId,
  hayDocumentoSinEmitir,
  onConfirmar,
  onBloqueado,
  onCerrar
}: {
  perfiles: PerfilDisponible[];
  activoId: string | null;
  hayDocumentoSinEmitir: boolean;
  onConfirmar: (operacionConfigId: string, password: string) => Promise<void>;
  onBloqueado: (mensaje: string) => void;
  onCerrar: () => void;
}) {
  const [elegido, setElegido] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function alTeclear(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && !enviando) onCerrar();
    }
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [enviando, onCerrar]);

  async function confirmar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!elegido || !password) return;
    setEnviando(true);
    setError(null);
    try {
      await onConfirmar(elegido, password);
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 423) {
        onBloqueado(e.message);
        return;
      }
      setPassword("");
      setError(e instanceof ApiClientError && e.status === 401 && motivoDeError(e) === "PASSWORD_INCORRECTA"
        ? "Contraseña incorrecta."
        : e instanceof Error ? e.message : "No se pudo cambiar el punto de expedición.");
      setEnviando(false);
    }
  }

  return (
    <div className="menu-scrim dialog-perfil-scrim" role="presentation" onClick={() => (enviando ? null : onCerrar())}>
      <form
        aria-labelledby="cambio-perfil-titulo"
        aria-modal="true"
        className="dialog-perfil"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => void confirmar(event)}
        role="dialog"
      >
        <h2 id="cambio-perfil-titulo">Cambiar punto de expedición</h2>
        <div className="perfil-lista" role="radiogroup" aria-label="Puntos de expedición">
          {perfiles.map((perfil) => {
            const activo = perfil.operacion_config_id === activoId;
            const marcado = perfil.operacion_config_id === elegido;
            return (
              <button
                aria-checked={marcado}
                className={["perfil-opcion", marcado ? "elegido" : "", activo ? "activo" : ""].filter(Boolean).join(" ")}
                disabled={activo || enviando}
                key={perfil.operacion_config_id}
                onClick={() => setElegido(perfil.operacion_config_id)}
                role="radio"
                type="button"
              >
                <PerfilOpcionContenido perfil={perfil} />
                {activo ? <span className="perfil-opcion-activo">Activo</span> : marcado ? <Icono nombre="tilde" /> : null}
              </button>
            );
          })}
        </div>
        {/* SPEC_MULTIPERFIL_USUARIO_v0.2 B.6 (M-3): igual que el login; URA-017: CampoContrasena (H-05). */}
        <CampoContrasena disabled={enviando} etiqueta="Tu contraseña" onChange={setPassword} value={password} />
        {hayDocumentoSinEmitir ? (
          <p className="aviso-perfil" role="alert">Tenés un documento sin emitir. Si cambiás de punto se descarta.</p>
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}
        <div className="dialog-perfil-acciones">
          <button className="ghost-action" disabled={enviando} onClick={onCerrar} type="button">
            Cancelar
          </button>
          <button className="primary-action" disabled={!elegido || !password || enviando} type="submit">
            {enviando ? "Cambiando..." : hayDocumentoSinEmitir ? "Descartar y cambiar" : "Cambiar"}
          </button>
        </div>
      </form>
    </div>
  );
}
