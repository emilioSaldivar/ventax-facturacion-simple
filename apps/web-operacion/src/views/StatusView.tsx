// Movido de main.tsx sin cambios (PLAN_UX_RESTO_APP_v0.1 §10.9, URA-023).
import { actividadPunto, nombrePunto } from "../lib/punto";
import { type UserSummary, type OperationView, type OperationalContextResponse, type ReadinessResponse } from "../tipos";
import { firstText } from "../lib/formato";
import { getOperationalTitle, mapBusinessReadinessChecks } from "../lib/contexto";

export function StatusView({
  canEmit,
  context,
  readiness,
  user,
  onGoTo,
  variosPerfiles,
  avisoPerfil,
  onCerrarAvisoPerfil,
  onCambiarPerfil,
  perfilesError = false
}: {
  canEmit: boolean;
  context: OperationalContextResponse | null;
  readiness: ReadinessResponse | null;
  user: UserSummary | null;
  onGoTo: (view: OperationView) => void;
  variosPerfiles?: boolean;
  avisoPerfil?: string | null;
  onCerrarAvisoPerfil?: () => void;
  onCambiarPerfil?: () => void;
  perfilesError?: boolean;
}) {
  const businessChecks = mapBusinessReadinessChecks(readiness?.checks ?? []);
  const statusLabel = canEmit ? "Listo para facturar" : "Faltan requisitos para facturar";

  return (
    <>
      {avisoPerfil ? (
        <section className="aviso-perfil aviso-perfil-banda" role="status">
          <span>{avisoPerfil}</span>
          <button className="ghost-action compact" onClick={onCerrarAvisoPerfil} type="button">
            Cerrar
          </button>
        </section>
      ) : null}
      <section className="facturador-band" aria-label="Contexto operativo">
        <div>
          <p className="eyebrow">Facturador</p>
          {/* URA-021 (H-01): el titulo es el facturador, no la descripcion fiscal del perfil. */}
          <h1>{context ? firstText(context.facturador.nombre_fantasia, context.facturador.razon_social) ?? getOperationalTitle(context) : getOperationalTitle(context)}</h1>
          <p className="muted">
            {context ? `${context.facturador.razon_social} · RUC ${context.facturador.ruc}` : "Configuración operativa incompleta"}
          </p>
          {context ? (
            <p className="punto-activo">
              Punto de expedición: <strong>{nombrePunto(context.fiscal_context)}</strong>
              {actividadPunto(context.fiscal_context) ? ` · ${actividadPunto(context.fiscal_context)}` : ""}
              {variosPerfiles ? (
                <button className="enlace-accion" onClick={onCambiarPerfil} type="button">
                  Cambiar punto de expedición
                </button>
              ) : null}
            </p>
          ) : null}
          {perfilesError ? <p className="form-error">No se pudo cargar la lista de puntos de expedición. Recargá la página.</p> : null}
        </div>
        <span className={canEmit ? "status-pill ready" : "status-pill blocked"}>{canEmit ? "Listo" : "Bloqueado"}</span>
      </section>

      <section className="readiness-grid">
        <article className="context-card">
          <p className="eyebrow">Sesión</p>
          <h2>{user?.display_name ?? user?.username ?? "Operador"}</h2>
          <dl>
            {/* URA-021 (H-03): sin el codigo del perfil; establecimiento y punto en un solo dato. */}
            <div>
              <dt>Punto de expedición</dt>
              <dd>{context ? nombrePunto(context.fiscal_context) : "-"}</dd>
            </div>
            <div>
              <dt>Actividad</dt>
              <dd>{formatActividadOperativa(context)}</dd>
            </div>
          </dl>
        </article>

        <article className="context-card">
          <p className="eyebrow">Estado para facturar</p>
          <h2>{statusLabel}</h2>
          <ul className="check-list">
            {businessChecks.map((check) => (
              <li key={check.code} className={check.ok ? "check-ok" : "check-fail"}>
                <span aria-hidden="true">{check.ok ? "✓" : "!"}</span>
                {check.message}
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="next-panel">
        <button className="primary-action wide" disabled={!canEmit} onClick={() => onGoTo("invoice")} type="button">
          Nueva factura
        </button>
        <button className="secondary-action wide" onClick={() => onGoTo("clients")} type="button">
          Agenda / Clientes
        </button>
        <button className="secondary-action wide" onClick={() => onGoTo("documents")} type="button">
          Documentos
        </button>
        <button className="secondary-action wide" onClick={() => onGoTo("catalog")} type="button">
          Catálogo
        </button>
        <button className="secondary-action wide" disabled={!canEmit} onClick={() => onGoTo("credit-note")} type="button">
          Nueva nota de crédito
        </button>
      </section>
    </>
  );
}

export function formatActividadOperativa(context: OperationalContextResponse | null): string {
  if (!context) {
    return "-";
  }

  const label = firstText(context.fiscal_context.actividad_economica_alias, context.fiscal_context.actividad_economica_descripcion);
  return label ? `${context.fiscal_context.actividad_economica_codigo} · ${label}` : context.fiscal_context.actividad_economica_codigo;
}
