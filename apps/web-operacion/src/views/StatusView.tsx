// Informacion y estado (SPEC_UX_RESTO_APP_v0.1 D R-8; PLAN §5, URA-008): encabezado con el facturador y la accion
// principal, dos columnas ("Facturador y sesión" y "Estado para facturar", con iconos) y "Documentos que podés emitir"
// desde TIPOS_EMISION. Sin los botones que repetian el menu (H-15). Conserva la banda .aviso-perfil-banda y el enlace
// "Cambiar punto de expedición" de SPEC_MULTIPERFIL_USUARIO (C.5).
import { EncabezadoPantalla } from "../components/EncabezadoPantalla";
import { Icono } from "../components/Icono";
import { PastillaEstado } from "../components/PastillaEstado";
import { getOperationalTitle, mapBusinessReadinessChecks } from "../lib/contexto";
import { firstText, formatShortDate } from "../lib/formato";
import { actividadPunto, nombrePunto } from "../lib/punto";
import { ETIQUETA_ESTADO_TIPO, TIPOS_EMISION, sinEntrada } from "../lib/tiposEmision";
import { type OperationalContextResponse, type OperationView, type ReadinessResponse, type UserSummary } from "../tipos";

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
  const fc = context?.fiscal_context;
  const numeracionDelCliente = fc?.numeracion_facturas === "CLIENTE";
  const titulo = context ? firstText(context.facturador.nombre_fantasia, context.facturador.razon_social) ?? getOperationalTitle(context) : getOperationalTitle(context);

  return (
    <section className="nc-espacio estado-espacio" aria-labelledby="estado-title">
      {avisoPerfil ? (
        <section className="aviso-perfil aviso-perfil-banda" role="status">
          <span>{avisoPerfil}</span>
          <button className="ghost-action compact" onClick={onCerrarAvisoPerfil} type="button">
            Cerrar
          </button>
        </section>
      ) : null}
      <EncabezadoPantalla
        acciones={
          <button className="primary-action" disabled={!canEmit || numeracionDelCliente} onClick={() => onGoTo("invoice")} type="button">
            Nueva factura
          </button>
        }
        id="estado-title"
        nivel="h1"
        subtitulo={context ? `${context.facturador.razon_social} · RUC ${context.facturador.ruc}` : "Configuración operativa incompleta"}
        titulo={titulo}
      />

      <div className="estado-grilla">
        <section className="nc-tarjeta" aria-labelledby="estado-facturador">
          <h2 id="estado-facturador">Facturador y sesión</h2>
          <dl className="estado-datos">
            <div>
              <dt>Operador</dt>
              <dd>{user?.display_name ?? user?.username ?? "Operador"}</dd>
            </div>
            <div className="punto-activo">
              <dt>Punto de expedición</dt>
              <dd>
                <strong>{fc ? nombrePunto(fc) : "-"}</strong>
                {variosPerfiles ? (
                  <button className="enlace-accion" onClick={onCambiarPerfil} type="button">
                    Cambiar punto de expedición
                  </button>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>Actividad</dt>
              <dd>{fc ? [fc.actividad_economica_codigo, actividadPunto(fc)].filter(Boolean).join(" · ") : "-"}</dd>
            </div>
            <div>
              <dt>Timbrado</dt>
              <dd>{fc ? `${fc.timbrado}${fc.timbrado_inicio ? ` · vigente desde ${formatShortDate(fc.timbrado_inicio)}` : ""}` : "-"}</dd>
            </div>
          </dl>
          {perfilesError ? <p className="form-error">No se pudo cargar la lista de puntos de expedición. Recargá la página.</p> : null}
        </section>

        <section className="nc-tarjeta" aria-labelledby="estado-facturar">
          <div className="estado-titulo">
            <h2 id="estado-facturar">Estado para facturar</h2>
            <PastillaEstado codigo={canEmit ? "LISTO" : "BLOQUEADO"} texto={canEmit ? "Listo" : "Bloqueado"} tono={canEmit ? "ready" : "blocked"} />
          </div>
          <p className="estado-resumen">{statusLabel}</p>
          <ul className="check-list estado-checks">
            {businessChecks.map((check) => (
              <li key={check.code} className={check.ok ? "check-ok" : "check-fail"}>
                <Icono nombre={check.ok ? "tilde" : "alerta"} tamano={16} />
                {check.message}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="nc-tarjeta" aria-labelledby="estado-documentos">
        <h2 id="estado-documentos">Documentos que podés emitir</h2>
        <ul className="estado-tipos">
          {TIPOS_EMISION.map((t) => {
            const estado = t.estado(context);
            const bloqueado = t.tipo === "FACTURA" ? !canEmit || numeracionDelCliente : t.tipo === "NOTA_CREDITO" ? !canEmit : false;
            const deshabilitado = sinEntrada(estado) || t.vista === null || bloqueado;
            return (
              <li key={t.tipo}>
                <button className="estado-tipo" disabled={deshabilitado} onClick={() => (t.vista ? onGoTo(t.vista) : undefined)} type="button">
                  <span className="menu-nuevo-icono"><Icono nombre={t.icono} /></span>
                  <span className="menu-nuevo-texto">
                    <span className="menu-texto">
                      <strong className="menu-nombre">{t.etiquetaSingular}</strong>
                      <span className="menu-tag">{estado === "DISPONIBLE" ? "Disponible" : ETIQUETA_ESTADO_TIPO[estado]}</span>
                    </span>
                    <small>{t.tipo === "FACTURA" && numeracionDelCliente ? "Este punto emite por carga masiva" : t.descripcion}</small>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </section>
  );
}
