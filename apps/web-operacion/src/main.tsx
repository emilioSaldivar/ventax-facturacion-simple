import React, { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

import { useConfirmar } from "./components/Dialogo";
import { Icono, type NombreIcono } from "./components/Icono";
import { CampoPlazo } from "./components/CampoPlazo";
import { PLAZO_CREDITO_DEFECTO, errorPlazo, plazoValido } from "./lib/plazoCredito";
import { MenuFila } from "./components/MenuFila";
import { MenuNuevo } from "./components/MenuNuevo";
import type { TipoDeCarga } from "./carga-masiva";
import { PastillaEstado } from "./components/PastillaEstado";
import { hayBorradorSinEmitir, useBorradorSinEmitir } from "./lib/borradores";
import { numeroCorrelativo } from "./lib/formato";
import { ETIQUETA_ESTADO_TIPO, TIPOS_EMISION, sinEntrada } from "./lib/tiposEmision";
import { actividadPunto, nombrePunto } from "./lib/punto";
import { estadoRecibo, etiquetaCondicionVenta, formatDocumentoTipo } from "./lib/estados";
import {
  ApiClientError,
  claimsDeToken,
  createApiClient,
  esErrorDePerfil, onEventoPerfil,
  refreshSession,
  requierePerfil
} from "./api/cliente";
import { _updatePending, applyUpdate, startVersionPolling, useUpdatePending } from "./api/version";
import { ApiProvider, useApi } from "./api/useApi";
import type { AuthResponse, PerfilDisponible, UserSummary } from "./tipos";
import { type ViewState, type OperationView, type CondicionVenta, type TipoTransaccionServicio, type DocumentoIdentidadTipo, type FacturaDocumentoTipo, type TipoIva, type DocumentoEstado, type BeforeInstallPromptEvent, type OperationalContextResponse, type ReadinessResponse, type ClienteNaturaleza, type FacturaClienteInput, type FacturaPreviewRequest, type FacturaPreviewResponse, type DocumentoResponse, type DeliveryLinkResponse, type EmailStatusResponse, type InvoiceLineDraft, type ClienteSearchResult, type ClienteResponse, type DnitAutocompleteResponse, type CatalogoItem, type InvoiceClientePrefillRequest, type TycCurrentData, type ClasePaso, type MonedaFactura, type NotaTipo, type NotaEstadoComercial, type NotaEstadoVisual, type NotaFilaTipo, type NotaFilaDraft, type NotaClienteDraft, type NotaListItem, type NotaConItems, type InvoiceInitialDraft, type ReciboFormaPago, type ReciboRecord } from "./tipos";
import { formatMonto, formatGuaranies, formatCantidad, fmtFecha, formatHora, formatIntegerInput, normalizeIntegerInput, buildWhatsAppShareUrl, firstText, iniciales } from "./lib/formato";
import { BrandMark } from "./components/BrandMark";
import { LoadingScreen } from "./components/LoadingScreen";
import { FilaDescuento, TotalRow } from "./components/TotalRow";
import { useEsEscritorio } from "./lib/useEsEscritorio";
import { cantidadValida, normalizeDecimalInput } from "./lib/formato";
import { mensajeResultadoReintento, formatEmailStatus, getDocumentoNombreLower, getSimpleDocumentoEstado, esEstadoFinalOperador } from "./lib/documentos";
import { getOperationalTitle, mapBusinessReadinessChecks } from "./lib/contexto";
import { FORMAS_PAGO_LABELS } from "./lib/etiquetas";
import { INNOMINADO_DOCUMENTO, INNOMINADO_NOMBRE, MENSAJE_TOPE_INNOMINADO, TOPE_INNOMINADO_GS, esClienteInnominado } from "./lib/innominado";
import { RemisionView } from "./views/RemisionView";
import { StatusView } from "./views/StatusView";
import { CreditNoteView } from "./views/CreditNoteView";
import { LoginScreen } from "./views/LoginScreen";
import { NotaPublicaView, ReciboPublicaView } from "./views/Publicas";
import { SeleccionPerfilScreen, CambioPerfilDialog, AvisoCambioExterno } from "./views/SeleccionPerfil";
import { DocumentsView } from "./views/DocumentsView";
import { CatalogView } from "./views/CatalogView";
import { AgendaView } from "./views/AgendaView";
import { normalizeDocKey, sugerirNaturalezaPorLongitudRuc } from "./lib/clientes";
import { revisarReceptor, type CampoReceptor } from "./lib/validacionReceptor";
import { Aviso } from "./components/Aviso";
import { formatIva } from "./lib/formato";
import { ResultadoEmision } from "./components/ResultadoEmision";

const ACCESS_TOKEN_STORAGE_KEY = "ventax_factura_access_token";

// ─── Root: routing entre app privada y páginas públicas ─────────────────────
function Root() {
  const notaMatch = window.location.pathname.match(/^\/verificar\/nota\/([0-9a-f-]{36})$/i);
  if (notaMatch?.[1]) return <NotaPublicaView token={notaMatch[1]} />;
  const reciboMatch = window.location.pathname.match(/^\/verificar\/recibo\/([0-9a-f-]{36})$/i);
  if (reciboMatch?.[1]) return <ReciboPublicaView token={reciboMatch[1]} />;
  return <App />;
}

// ─── App: shell autenticado ──────────────────────────────────────────────────
function App() {
  const [view, setView] = useState<ViewState>("checking-session");
  const [accessToken, setAccessToken] = useState<string | null>(() => localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY));
  const [user, setUser] = useState<UserSummary | null>(null);
  const [context, setContext] = useState<OperationalContextResponse | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<string[]>([]);
  // SPEC_MULTIPERFIL_USUARIO_v0.1: perfiles para la pantalla de eleccion y los de la sesion (barra).
  const [perfilesEleccion, setPerfilesEleccion] = useState<PerfilDisponible[] | null>(null);
  const [perfilesSesion, setPerfilesSesion] = useState<PerfilDisponible[]>([]);
  const [avisoPerfil, setAvisoPerfil] = useState<string | null>(null);
  const [recargaContexto, setRecargaContexto] = useState(0);
  // SPEC_MULTIPERFIL_USUARIO_v0.2 B.3 y B.5.
  const [avisoBloqueante, setAvisoBloqueante] = useState<{ respuesta: AuthResponse } | null>(null);
  const [perfilesError, setPerfilesError] = useState(false);

  const api = useMemo(() => createApiClient(accessToken, setAccessToken), [accessToken]);

  useEffect(() => {
    // D-8: el token de eleccion de perfil vence en 10 minutos y no sirve para operar: no se guarda.
    if (accessToken && claimsDeToken(accessToken).scope !== "perfil_select") {
      localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken);
    } else {
      localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    }
  }, [accessToken]);

  function mostrarEleccionPerfil(respuesta: AuthResponse) {
    setPerfilesEleccion(respuesta.perfiles ?? []);
    setUser(respuesta.user);
    setView("select-perfil");
    setAccessToken(respuesta.access_token);
  }

  /** El refresh asigno otro punto (el anterior ya no esta): se recarga todo el contexto. */
  function recargarConPunto(respuesta: AuthResponse) {
    setAvisoPerfil("Tu punto de expedición cambió. Revisá el punto activo antes de continuar.");
    setView("loading-context");
    setAccessToken(respuesta.access_token);
    setRecargaContexto((n) => n + 1);
  }

  useEffect(
    () =>
      onEventoPerfil((evento) => {
        if (evento.tipo === "ELEGIR") {
          mostrarEleccionPerfil(evento.respuesta);
          return;
        }
        // SPEC_MULTIPERFIL_USUARIO_v0.2 RN-16 (F-5): con un documento cargado, avisar antes de descartarlo.
        if (hayBorradorSinEmitir()) {
          setAvisoBloqueante({ respuesta: evento.respuesta });
          return;
        }
        recargarConPunto(evento.respuesta);
      }),
    []
  );

  useEffect(() => startVersionPolling(), []);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      if (accessToken && (view === "operacion" || view === "onboarding" || view === "select-perfil")) {
        return;
      }

      try {
        if (!accessToken) {
          const refreshed = await refreshSession();
          if (!active) {
            return;
          }
          if (requierePerfil(refreshed)) {
            mostrarEleccionPerfil(refreshed);
            return;
          }
          setAccessToken(refreshed.access_token);
          setUser(refreshed.user);
          await loadOperationalState(refreshed.access_token, refreshed.user);
          return;
        }

        await loadOperationalState(accessToken);
      } catch {
        if (!active) {
          return;
        }
        clearSession(setAccessToken);
        setView("login");
      }
    }

    async function loadOperationalState(token: string, sessionUser?: UserSummary) {
      setView("loading-context");
      const client = createApiClient(token, setAccessToken);
      const [contextResult, readinessResult, perfilesResult] = await Promise.allSettled([
        client.get<OperationalContextResponse>("/me/context"),
        client.get<ReadinessResponse>("/me/readiness"),
        client.get<{ perfiles: PerfilDisponible[] }>("/me/perfiles")
      ]);

      if (!active) {
        return;
      }

      if (contextResult.status === "rejected" && esErrorDePerfil(contextResult.reason)) {
        // El cliente HTTP ya aviso por onEventoPerfil: eleccion o recarga.
        return;
      }

      // SPEC_MULTIPERFIL_USUARIO_v0.2 B.5 (M-2): un reintento; si sigue fallando, se avisa y la barra no es boton.
      let perfiles: PerfilDisponible[] | null = perfilesResult.status === "fulfilled" ? perfilesResult.value.perfiles : null;
      if (!perfiles) {
        perfiles = await client
          .get<{ perfiles: PerfilDisponible[] }>("/me/perfiles")
          .then((r) => r.perfiles)
          .catch(() => null);
        if (!active) {
          return;
        }
      }
      setPerfilesSesion(perfiles ?? []);
      setPerfilesError(perfiles === null);

      if (readinessResult.status === "rejected") {
        throw readinessResult.reason;
      }

      if (contextResult.status === "rejected") {
        if (contextResult.reason instanceof ApiClientError && contextResult.reason.status === 409) {
          setUser((current) => sessionUser ?? current);
          setContext(null);
          setReadiness(readinessResult.value);
          setErrorMessage(null);
          setView("operacion");
          return;
        }

        throw contextResult.reason;
      }

      const contextResponse = contextResult.value;
      setUser(contextResponse.user);
      setContext(contextResponse);
      setReadiness(readinessResult.value);
      setErrorMessage(null);
      setView("operacion");
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [accessToken, recargaContexto]);

  async function handleLogin(username: string, password: string) {
    setErrorMessage(null);
    const response = await api.post<AuthResponse>("/auth/login", { username, password }, false);
    if (requierePerfil(response)) {
      mostrarEleccionPerfil(response);
      return;
    }
    if (response.pending_actions && response.pending_actions.length > 0) {
      setPendingActions(response.pending_actions);
      setView("onboarding");
    }
    setAccessToken(response.access_token);
    setUser(response.user);
  }

  function handleOnboardingComplete(newAccessToken: string, newUser: UserSummary, respuesta?: AuthResponse) {
    if (respuesta && requierePerfil(respuesta)) {
      mostrarEleccionPerfil(respuesta);
      return;
    }
    setView("loading-context");
    setAccessToken(newAccessToken);
    setUser(newUser);
  }

  /**
   * SPEC_MULTIPERFIL_USUARIO_v0.1 §B.2 y §B.3. Sin reintento automatico: un 401 por contraseña
   * incorrecta no debe disparar un refresh (contaria dos intentos).
   */
  async function elegirPerfil(operacionConfigId: string, password?: string) {
    const respuesta = await api.post<AuthResponse>(
      "/auth/perfil",
      { operacion_config_id: operacionConfigId, ...(password ? { password } : {}) },
      false
    );
    setPerfilesEleccion(null);
    setView("loading-context");
    setAccessToken(respuesta.access_token);
    setRecargaContexto((n) => n + 1);
  }

  async function cambiarPerfil(operacionConfigId: string, password: string) {
    const elegido = perfilesSesion.find((p) => p.operacion_config_id === operacionConfigId);
    await elegirPerfil(operacionConfigId, password);
    if (elegido) {
      setAvisoPerfil(`Ahora estás facturando por el ${[nombrePunto(elegido), actividadPunto(elegido)].filter(Boolean).join(" · ")}`);
    }
  }

  function terminarSesionConMensaje(mensaje: string) {
    clearSession(setAccessToken);
    setUser(null);
    setContext(null);
    setReadiness(null);
    setPerfilesSesion([]);
    setPerfilesEleccion(null);
    setErrorMessage(mensaje);
    setView("login");
  }

  async function handleLogout() {
    try {
      await api.post<void>("/auth/logout", {});
    } finally {
      clearSession(setAccessToken);
      if (_updatePending) {
        window.location.reload();
        return;
      }
      setUser(null);
      setContext(null);
      setReadiness(null);
      setPerfilesSesion([]);
      setPerfilesEleccion(null);
      setAvisoPerfil(null);
      setAvisoBloqueante(null);
      setPerfilesError(false);
      setView("login");
    }
  }

  if (view === "checking-session" || view === "loading-context") {
    return <LoadingScreen message={view === "checking-session" ? "Verificando sesión" : "Cargando contexto operativo"} />;
  }

  if (view === "login") {
    return <LoginScreen errorMessage={errorMessage} onLogin={handleLogin} onError={setErrorMessage} />;
  }

  if (view === "select-perfil") {
    return (
      <SeleccionPerfilScreen
        perfiles={perfilesEleccion ?? []}
        user={user}
        onElegir={(id) => elegirPerfil(id)}
        onSalir={handleLogout}
        onVencida={terminarSesionConMensaje}
        onRefrescarLista={async () => (await api.get<{ perfiles: PerfilDisponible[] }>("/me/perfiles")).perfiles}
      />
    );
  }

  if (view === "onboarding") {
    return (
      <ApiProvider accessToken={accessToken} setAccessToken={setAccessToken}>
        <OnboardingFlow onComplete={handleOnboardingComplete} pendingActions={pendingActions} username={user?.username ?? ""} userRole={user?.role ?? "OPERADOR_FACTURACION"} />
      </ApiProvider>
    );
  }

  return (
    <ApiProvider accessToken={accessToken} setAccessToken={setAccessToken}>
    <OperationHome
      accessToken={accessToken}
      context={context}
      readiness={readiness}
      user={user}
      onLogout={handleLogout}
      perfiles={perfilesSesion}
      avisoPerfil={avisoPerfil}
      onCerrarAvisoPerfil={() => setAvisoPerfil(null)}
      onCambiarPerfil={cambiarPerfil}
      onBloqueado={terminarSesionConMensaje}
      perfilesError={perfilesError}
    />
    {avisoBloqueante ? (
      <AvisoCambioExterno
        onEntendido={() => {
          const { respuesta } = avisoBloqueante;
          setAvisoBloqueante(null);
          recargarConPunto(respuesta);
        }}
      />
    ) : null}
    </ApiProvider>
  );
}

function OnboardingFlow({
  onComplete,
  pendingActions,
  username,
  userRole
}: {
  onComplete: (newAccessToken: string, newUser: UserSummary, respuesta?: AuthResponse) => void;
  pendingActions: string[];
  username: string;
  userRole: string;
}) {
  const isAdminRole = userRole === "ADMIN_INTERNO" || userRole === "SOPORTE_INTERNO";
  const needsPasswordChange = pendingActions.includes("CHANGE_PASSWORD");
  // URA-018 (H-20): el onboarding usa el cliente de la sesion; antes descartaba el token renovado.
  const api = useApi();
  const [phase, setPhase] = useState<"password" | "tyc" | "otp">(needsPasswordChange ? "password" : "tyc");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [tyc, setTyc] = useState<TycCurrentData | null>(null);
  const [tycLoading, setTycLoading] = useState(false);
  const [tycAccepted, setTycAccepted] = useState(false);

  const [otpSessionId, setOtpSessionId] = useState<string | null>(null);
  const [otpEmailMask, setOtpEmailMask] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpCooldown, setOtpCooldown] = useState(0);

  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setTimeout(() => setOtpCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [otpCooldown]);

  useEffect(() => {
    if (needsPasswordChange) return;
    setTycLoading(true);
    api.get<TycCurrentData>("/onboarding/tyc/current")
      .then((data) => setTyc(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar los Términos y Condiciones."))
      .finally(() => setTycLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post("/onboarding/password", { new_password: newPassword, confirm_password: confirmPassword });
      setTycLoading(true);
      setPhase("tyc");
      const tycData = await api.get<TycCurrentData>("/onboarding/tyc/current");
      setTyc(tycData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cambiar contraseña.");
      setPhase("password");
    } finally {
      setSubmitting(false);
      setTycLoading(false);
    }
  }

  async function handleAdminBypass() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.post<AuthResponse>("/onboarding/admin/accept-direct", {});
      onComplete(result.access_token, result.user, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al completar la activación.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTycContinue() {
    if (!tycAccepted) {
      setError("Debes leer y aceptar los Términos y Condiciones para continuar.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      if (isAdminRole) {
        await handleAdminBypass();
        return;
      }
      const result = await api.post<{ otp_session_id: string; email_destino_ofuscado: string; expires_in_seconds: number }>(
        "/onboarding/otp/request",
        {}
      );
      setOtpSessionId(result.otp_session_id);
      setOtpEmailMask(result.email_destino_ofuscado);
      setOtpCooldown(60);
      setPhase("otp");
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 412) {
        setError(`Tu cuenta (${username}) no tiene correo electrónico configurado. Ya le avisamos a Segel y te van a contactar. Si es urgente, escribi a no-reply-facturacion@segel.com.py indicando tu usuario.`);
      } else {
        setError(err instanceof Error ? err.message : "Error al solicitar código de verificación.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOtpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!otpSessionId) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.post<AuthResponse>("/onboarding/complete", {
        otp_session_id: otpSessionId,
        otp_code: otpCode,
        checkbox_aceptado: true
      });
      onComplete(result.access_token, result.user, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al completar la activación.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOtpResend() {
    if (otpCooldown > 0) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.post<{ otp_session_id: string; email_destino_ofuscado: string; expires_in_seconds: number }>(
        "/onboarding/otp/request",
        {}
      );
      setOtpSessionId(result.otp_session_id);
      setOtpEmailMask(result.email_destino_ofuscado);
      setOtpCode("");
      setOtpCooldown(60);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 412) {
        setError(`Tu cuenta (${username}) no tiene correo electrónico configurado. Ya le avisamos a Segel y te van a contactar. Si es urgente, escribi a no-reply-facturacion@segel.com.py indicando tu usuario.`);
      } else {
        setError(err instanceof Error ? err.message : "Error al reenviar código.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const phaseTitle =
    phase === "password" ? "Crear nueva contraseña" :
    phase === "tyc" ? "Términos y Condiciones" :
    "Verificación por correo";

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="onboarding-title">
        <BrandMark />
        <div className="auth-copy">
          <p className="eyebrow">Activación de cuenta</p>
          <h1 id="onboarding-title">{phaseTitle}</h1>
        </div>

        {phase === "password" ? (
          <form className="login-form" onSubmit={(e) => void handlePasswordSubmit(e)}>
            <p className="muted">Creá una contraseña segura. Mínimo 8 caracteres.</p>
            <label>
              Nueva contraseña
              <input
                autoComplete="new-password"
                minLength={8}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                type="password"
                value={newPassword}
              />
            </label>
            <label>
              Confirmar contraseña
              <input
                autoComplete="new-password"
                minLength={8}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                type="password"
                value={confirmPassword}
              />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="primary-action" disabled={submitting} type="submit">
              {submitting ? "Guardando..." : "Continuar"}
            </button>
          </form>
        ) : phase === "tyc" ? (
          <div>
            {tycLoading ? (
              <p className="muted">Cargando términos...</p>
            ) : tyc ? (
              <>
                <section aria-label="Datos de tu cuenta">
                  <p className="eyebrow">Datos de tu cuenta</p>
                  <dl className="receipt-summary">
                    <div><dt>Empresa</dt><dd>{tyc.context.tenant_nombre ?? "-"}</dd></div>
                    <div><dt>RUC</dt><dd>{tyc.context.facturador_ruc ?? "-"}</dd></div>
                    <div><dt>Razón social</dt><dd>{tyc.context.facturador_razon_social ?? "-"}</dd></div>
                    <div><dt>Plan</dt><dd>{tyc.context.plan_nombre ?? "-"}</dd></div>
                    <div><dt>Usuario</dt><dd>{tyc.context.username}</dd></div>
                    <div><dt>Email</dt><dd>{tyc.context.email ?? "-"}</dd></div>
                  </dl>
                </section>
                <section aria-label="Documento de términos" style={{ maxHeight: "40vh", overflowY: "auto", border: "1px solid var(--color-border, #ccc)", borderRadius: "8px", padding: "1rem", margin: "1rem 0" }}>
                  <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "0.85rem", margin: 0 }}>{tyc.document_content}</pre>
                </section>
                <label style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", cursor: "pointer", marginBottom: "1rem" }}>
                  <input
                    checked={tycAccepted}
                    onChange={(e) => setTycAccepted(e.target.checked)}
                    style={{ marginTop: "0.2rem", flexShrink: 0 }}
                    type="checkbox"
                  />
                  <span>He leído y acepto los Términos y Condiciones (versión {tyc.version})</span>
                </label>
                {error ? <p className="form-error">{error}</p> : null}
                <button
                  className="primary-action"
                  disabled={submitting || !tycAccepted}
                  onClick={() => void handleTycContinue()}
                  type="button"
                >
                  {submitting ? "Procesando..." : "Aceptar y continuar"}
                </button>
              </>
            ) : (
              <p className="form-error">No se pudo cargar los términos. Recargá la página.</p>
            )}
          </div>
        ) : (
          <form className="login-form" onSubmit={(e) => void handleOtpSubmit(e)}>
            <p className="muted">
              Ingresá el código de 6 dígitos enviado a {otpEmailMask ?? "tu correo electrónico"}.
            </p>
            <label>
              Código de verificación
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                minLength={6}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                pattern="\d{6}"
                placeholder="000000"
                required
                type="text"
                value={otpCode}
              />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="primary-action" disabled={submitting || otpCode.length !== 6} type="submit">
              {submitting ? "Verificando..." : "Verificar y activar cuenta"}
            </button>
            <button
              className="ghost-action"
              disabled={otpCooldown > 0 || submitting}
              onClick={() => void handleOtpResend()}
              type="button"
            >
              {otpCooldown > 0 ? `Reenviar en ${otpCooldown}s` : "Reenviar código"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

function OperationHome({
  accessToken,
  context,
  readiness,
  user,
  onLogout,
  perfiles,
  avisoPerfil,
  onCerrarAvisoPerfil,
  onCambiarPerfil,
  onBloqueado,
  perfilesError = false
}: {
  accessToken: string | null;
  context: OperationalContextResponse | null;
  readiness: ReadinessResponse | null;
  user: UserSummary | null;
  onLogout: () => Promise<void>;
  /** SPEC_MULTIPERFIL_USUARIO_v0.1: perfiles emitibles del usuario; con mas de uno se puede cambiar. */
  perfiles: PerfilDisponible[];
  avisoPerfil: string | null;
  onCerrarAvisoPerfil: () => void;
  onCambiarPerfil: (operacionConfigId: string, password: string) => Promise<void>;
  onBloqueado: (mensaje: string) => void;
  /** SPEC_MULTIPERFIL_USUARIO_v0.2 B.5: /me/perfiles fallo dos veces. */
  perfilesError?: boolean;
}) {
  const canEmit = Boolean(readiness?.ready);
  // SPEC_CARGA_MASIVA_FACTURAS_v0.1 RN-22: el backend tambien lo rechaza.
  const numeracionDelCliente = context?.fiscal_context.numeracion_facturas === "CLIENTE";
  // §C.3: tras un cambio de punto se vuelve a "Informacion y estado" con el aviso.
  const [operationView, setOperationView] = useState<OperationView>(() => (avisoPerfil ? "status" : canEmit ? "invoice" : "status"));
  const variosPerfiles = perfiles.length > 1;
  // B.5: si la lista no marca el activo (token sin punto, D-6), se usa el claim `uoc` del token.
  const perfilActivo =
    perfiles.find((p) => p.activo_en_sesion) ?? perfiles.find((p) => p.operacion_config_id === claimsDeToken(accessToken).uoc) ?? null;
  const [cambioPerfil, setCambioPerfil] = useState<{ sinEmitir: boolean } | null>(null);
  const abrirCambioPerfil = () => setCambioPerfil({ sinEmitir: hayBorradorSinEmitir() });
  const [menuOpen, setMenuOpen] = useState(false);
  // URA-003: "Notas de remisión" (por planilla) abre Documentos en su pestaña hasta que tenga espacio propio (URA-006).
  const [pestanaDocumentos, setPestanaDocumentos] = useState<"FACTURAS" | "NOTAS_CREDITO" | "NOTAS_REMISION" | "CARGA_MASIVA">("FACTURAS");
  // URA-004: el menu "Nuevo" abre la carga masiva con el tipo elegido.
  const [tipoCarga, setTipoCarga] = useState<TipoDeCarga | undefined>(undefined);
  // URA-006: Notas de remision puede abrir "Nueva carga" y ver un documento en Documentos.
  const [remisionNuevaCarga, setRemisionNuevaCarga] = useState(false);
  const [documentoInicialId, setDocumentoInicialId] = useState<string | null>(null);
  // URA-019 (P-A3): Escape cierra el menu de celular.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const alTeclear = (evento: globalThis.KeyboardEvent) => {
      if (evento.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [menuOpen]);
  const esEscritorio = useEsEscritorio();
  const updatePending = useUpdatePending();
  const [invoiceClientePrefill, setInvoiceClientePrefill] = useState<InvoiceClientePrefillRequest | null>(null);
  const invoiceClientePrefillSeqRef = useRef(0);
  const [invoiceInitialDraft, setInvoiceInitialDraft] = useState<InvoiceInitialDraft | null>(null);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallHint, setShowInstallHint] = useState(false);
  const [installing, setInstalling] = useState(false);

  const isStandalone = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.matchMedia("(display-mode: standalone)").matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  }, []);
  const isIosSafari = useMemo(() => {
    if (typeof navigator === "undefined") {
      return false;
    }
    const ua = navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua) && /safari/.test(ua) && !/crios|fxios/.test(ua);
  }, []);

  useEffect(() => {
    if (!canEmit) {
      setOperationView("status");
    }
  }, [canEmit]);

  useEffect(() => {
    if (isStandalone) {
      return;
    }
    if (localStorage.getItem("ventax_pwa_install_dismissed") === "1") {
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
      setShowInstallHint(true);
    };

    const onInstalled = () => {
      setShowInstallHint(false);
      setInstallPromptEvent(null);
      localStorage.setItem("ventax_pwa_install_dismissed", "1");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if (isIosSafari) {
      setShowInstallHint(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [isStandalone, isIosSafari]);

  async function promptInstall() {
    if (!installPromptEvent) {
      return;
    }
    setInstalling(true);
    try {
      await installPromptEvent.prompt();
      const choice = await installPromptEvent.userChoice;
      if (choice.outcome === "accepted") {
        setShowInstallHint(false);
        localStorage.setItem("ventax_pwa_install_dismissed", "1");
      }
      setInstallPromptEvent(null);
    } finally {
      setInstalling(false);
    }
  }

  function dismissInstallHint() {
    setShowInstallHint(false);
    localStorage.setItem("ventax_pwa_install_dismissed", "1");
  }

  function goTo(view: OperationView) {
    if (updatePending) {
      window.location.reload();
      return;
    }
    setOperationView(view);
    setMenuOpen(false);
    setDocumentoInicialId(null);
    if (avisoPerfil && view !== "status") onCerrarAvisoPerfil();
  }

  function useClienteFromAgenda(cliente: ClienteResponse) {
    goTo("invoice");
    window.setTimeout(() => {
      invoiceClientePrefillSeqRef.current += 1;
      setInvoiceClientePrefill({
        request_id: invoiceClientePrefillSeqRef.current,
        cliente: {
          cliente_id: cliente.cliente_id,
          documento_tipo: cliente.documento_tipo,
          documento: cliente.documento,
          razon_social: cliente.razon_social,
          direccion: cliente.direccion ?? "",
          telefono: cliente.telefono ?? "",
          email: cliente.email ?? "",
          naturaleza: cliente.naturaleza
        }
      });
    }, 0);
  }

  // SPEC_UX_NUEVA_FACTURA_v0.1, A.1: contexto fiscal en la barra; el operador con sus iniciales.
  const fc = context?.fiscal_context;
  const actividad = fc ? firstText(fc.actividad_economica_alias, fc.actividad_economica_descripcion) : null;
  const lineaFiscal = fc
    ? [
        context?.facturador.ruc ? `RUC ${context.facturador.ruc}` : null,
        `Timbrado ${fc.timbrado}`,
        `Establecimiento ${fc.establecimiento}`,
        `Punto ${fc.punto_expedicion}`,
        actividad
      ].filter(Boolean).join(" · ")
    : "";
  const lineaFiscalCorta = fc ? `Timbrado ${fc.timbrado} · ${fc.establecimiento}-${fc.punto_expedicion}` : "";
  const operadorNombre = user?.display_name?.trim() || user?.username || "";
  // SPEC_UX_NUEVA_FACTURA_v0.1, A.3: iconos SVG por nombre (PLAN 2) y grupos renombrados.
  // SPEC_UX_RESTO_APP_v0.1 A.1, A.2 y A.4 (URA-003): cuatro grupos; "Emitir" sale del catalogo TIPOS_EMISION, con un
  // espacio por tipo aunque todavia no se emita ("Próximamente" no navega ni consulta la API, RN-02).
  type GrupoMenu = "emitir" | "consultar" | "comercial" | "admin";
  const menuItems: Array<{
    clave: string;
    label: string;
    view: OperationView | null;
    disabled?: boolean;
    icon: NombreIcono;
    group: GrupoMenu;
    etiqueta?: string;
    hint: string;
    abrir: () => void;
  }> = [
    ...TIPOS_EMISION.map((t) => {
      const estado = t.estado(context);
      const bloqueado = t.tipo === "FACTURA" ? !canEmit || numeracionDelCliente : t.tipo === "NOTA_CREDITO" ? !canEmit : false;
      return {
        clave: t.tipo,
        label: t.etiquetaMenu,
        view: t.vista,
        icon: t.icono,
        group: "emitir" as GrupoMenu,
        disabled: sinEntrada(estado) || t.vista === null || bloqueado,
        etiqueta: estado === "DISPONIBLE" ? undefined : ETIQUETA_ESTADO_TIPO[estado],
        hint: t.tipo === "FACTURA" && numeracionDelCliente ? "Este punto emite por carga masiva" : t.descripcion,
        abrir: () => {
          if (!t.vista) return;
          if (t.vista === "remision") abrirRemision(false);
          else goTo(t.vista);
        }
      };
    }),
    { clave: "documents", label: "Documentos", view: "documents", icon: "documentos", group: "consultar", hint: getOperationViewHint("documents"), abrir: () => abrirDocumentos("FACTURAS") },
    { clave: "clients", label: "Agenda / Clientes", view: "clients", icon: "agenda", group: "consultar", hint: getOperationViewHint("clients"), abrir: () => goTo("clients") },
    { clave: "catalog", label: "Catálogo", view: "catalog", icon: "catalogo", group: "consultar", hint: getOperationViewHint("catalog"), abrir: () => goTo("catalog") },
    { clave: "notas", label: "Presupuestos / Pedidos", view: "notas", icon: "notas", group: "comercial", hint: getOperationViewHint("notas"), abrir: () => goTo("notas") },
    { clave: "recibos", label: "Cobros / Recibos", view: "recibos", icon: "recibos", group: "comercial", hint: getOperationViewHint("recibos"), abrir: () => goTo("recibos") },
    { clave: "status", label: "Información y estado", view: "status", icon: "estado", group: "admin", hint: getOperationViewHint("status"), abrir: () => goTo("status") }
  ];
  const menuSections: Array<{ title: string; key: GrupoMenu }> = [
    { title: "Emitir", key: "emitir" },
    { title: "Consultar", key: "consultar" },
    { title: "Comercial", key: "comercial" },
    { title: "Administración", key: "admin" }
  ];
  function abrirDocumentos(pestana: "FACTURAS" | "NOTAS_CREDITO" | "NOTAS_REMISION" | "CARGA_MASIVA", tipo?: TipoDeCarga, documentoId: string | null = null) {
    goTo("documents");
    // Despues de goTo, que limpia el documento inicial: React aplica el ultimo valor.
    setPestanaDocumentos(pestana);
    setTipoCarga(tipo);
    setDocumentoInicialId(documentoId);
  }
  function abrirRemision(nuevaCarga: boolean) {
    setRemisionNuevaCarga(nuevaCarga);
    goTo("remision");
  }
  // SPEC_UX_RESTO_APP_v0.1 A.3 (URA-004): el menu "Nuevo" lista lo que se puede emitir, con el estado de cada tipo.
  const bloquesNuevo = [
    {
      titulo: "Documentos electrónicos (SIFEN)",
      opciones: TIPOS_EMISION.map((t) => {
        const estado = t.estado(context);
        const bloqueado = t.tipo === "FACTURA" ? !canEmit || numeracionDelCliente : t.tipo === "NOTA_CREDITO" ? !canEmit : false;
        return {
          clave: t.tipo,
          nombre: t.etiquetaSingular,
          descripcion: t.tipo === "FACTURA" && numeracionDelCliente ? "Este punto emite por carga masiva" : t.descripcion,
          icono: t.icono,
          etiqueta: estado === "DISPONIBLE" ? undefined : ETIQUETA_ESTADO_TIPO[estado],
          deshabilitado: sinEntrada(estado) || t.vista === null || bloqueado,
          onElegir: () => {
            // SPEC_NOTA_REMISION_v0.1: con NRE_EMIT abre "Nueva nota de remisión"; sin el, la planilla.
            if (t.tipo === "NOTA_REMISION") abrirRemision(estado !== "DISPONIBLE");
            else if (t.vista) goTo(t.vista);
          }
        };
      })
    },
    {
      titulo: "Comprobantes comerciales (no van a SIFEN)",
      opciones: [
        { clave: "presupuesto", nombre: "Presupuesto o pedido", descripcion: "Para el cliente; no tiene valor fiscal", icono: "notas" as NombreIcono, onElegir: () => goTo("notas") },
        { clave: "recibo", nombre: "Recibo de dinero", descripcion: "Cobro de una factura o de otro concepto", icono: "recibos" as NombreIcono, onElegir: () => goTo("recibos") }
      ]
    },
    ...(context?.carga_masiva_habilitada
      ? [
          {
            titulo: "Carga masiva",
            opciones: [
              { clave: "carga", nombre: "Carga masiva por planilla", descripcion: "Muchos documentos desde un archivo", icono: "documentos" as NombreIcono, onElegir: () => abrirDocumentos("CARGA_MASIVA") }
            ]
          }
        ]
      : [])
  ];
  const esActivo = (item: { clave: string; view: OperationView | null }) => item.view === operationView;

  return (
    <main className="operation-shell">
      {/* SPEC_UX_NUEVA_FACTURA_v0.1, A.1 y A.2: barra a lo ancho con el logo, el facturador, su linea fiscal y el operador. */}
      <header className="topbar">
        {/* SPEC_DOCUMENTOS_ESCRITORIO_v0.1: en escritorio el menu esta siempre a la vista, al costado. */}
        {esEscritorio ? null : (
          <button
            aria-expanded={menuOpen}
            aria-label="Abrir menu"
            className="hamburger-action"
            onClick={() => setMenuOpen((current) => !current)}
            type="button"
          >
            <Icono nombre="menu" tamano={22} />
          </button>
        )}
        <img
          alt="Segel Factura"
          className={esEscritorio ? "topbar-logo" : "topbar-isotipo"}
          src={esEscritorio ? "/app/brand/segel-logo-fondo-claro.svg" : "/app/brand/segel-isotipo.svg"}
        />
        {esEscritorio ? <span className="topbar-separador" aria-hidden="true" /> : null}
        {variosPerfiles ? (
          <button
            aria-haspopup="dialog"
            className="topbar-facturador topbar-facturador--boton"
            onClick={abrirCambioPerfil}
            title="Cambiar punto de expedición"
            type="button"
          >
            <span className="topbar-facturador-texto">
              <strong>{firstText(context?.facturador.nombre_fantasia, context?.facturador.razon_social) ?? getOperationalTitle(context)}</strong>
              <small>{esEscritorio ? lineaFiscal : lineaFiscalCorta}</small>
            </span>
            <Icono nombre="chevron-abajo" tamano={16} />
          </button>
        ) : (
          <div className="topbar-facturador">
            <strong>{firstText(context?.facturador.nombre_fantasia, context?.facturador.razon_social) ?? getOperationalTitle(context)}</strong>
            <small>{esEscritorio ? lineaFiscal : lineaFiscalCorta}</small>
          </div>
        )}
        {esEscritorio ? (
          <MenuNuevo
            bloques={bloquesNuevo}
            pie={fc ? `Se emite por el ${[nombrePunto(fc), actividadPunto(fc)].filter(Boolean).join(" · ")}` : undefined}
          />
        ) : null}
        {esEscritorio && operadorNombre ? (
          <div className="topbar-operador" title={operadorNombre}>
            <span className="topbar-avatar" aria-hidden="true">{iniciales(operadorNombre)}</span>
            <span>{operadorNombre}</span>
          </div>
        ) : null}
        <button className="ghost-action compact" onClick={() => void onLogout()} type="button">
          Salir
        </button>
      </header>

      {menuOpen && !esEscritorio ? (
        <div className="menu-scrim" onClick={() => setMenuOpen(false)} role="presentation">
          <nav className="mobile-menu" aria-label="Navegación principal" onClick={(event) => event.stopPropagation()}>
            {/* URA-021 (H-06): operador y punto activo, sin la descripcion fiscal del perfil. */}
            <div>
              <p className="eyebrow">Menú</p>
              <h2>{operadorNombre || "Operación"}</h2>
              <p className="muted">{fc ? [nombrePunto(fc), actividadPunto(fc)].filter(Boolean).join(" · ") : getOperationalTitle(context)}</p>
            </div>
            <div className="menu-list">
              {menuSections.map((section) => (
                <div className="menu-group" key={section.key}>
                  <p className="menu-group-title">{section.title}</p>
                  {menuItems.filter((item) => item.group === section.key).map((item) => (
                    <button
                      className={[
                        "menu-item",
                        `menu-item-${item.group}`,
                        esActivo(item) ? "active" : ""
                      ].filter(Boolean).join(" ")}
                      disabled={item.disabled}
                      key={item.clave}
                      onClick={item.abrir}
                      type="button"
                    >
                      <span className="menu-item-icon"><Icono nombre={item.icon} tamano={20} /></span>
                      <span className="menu-texto">
                        <span className="menu-nombre">{item.label}</span>
                        {item.etiqueta ? <span className="menu-tag">{item.etiqueta}</span> : null}
                      </span>
                      <small>{item.hint}</small>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            {/* URA-021 (SPEC_UX_RESTO_APP §F.1): cambiar de punto desde el celular, solo con mas de uno. */}
            {variosPerfiles ? (
              <button
                className="menu-item menu-cambiar-punto"
                onClick={() => {
                  setMenuOpen(false);
                  abrirCambioPerfil();
                }}
                type="button"
              >
                <span className="menu-item-icon"><Icono nombre="punto" tamano={20} /></span>
                <span>Cambiar punto de expedición</span>
                <small>{fc ? `Ahora: ${nombrePunto(fc)}` : ""}</small>
              </button>
            ) : null}
            <button className="menu-exit-action wide" onClick={() => void onLogout()} type="button">
              <Icono nombre="salir" /> Salir
            </button>
          </nav>
        </div>
      ) : null}

      <div className="operation-cuerpo">
      {esEscritorio ? (
        <nav className="side-nav" aria-label="Navegación principal">
          {menuSections.map((section) => (
            <div className="side-nav-grupo" key={section.key}>
              <p className="side-nav-titulo">{section.title}</p>
              {menuItems.filter((item) => item.group === section.key).map((item) => (
                <button
                  aria-current={esActivo(item) ? "page" : undefined}
                  className={["side-nav-item", esActivo(item) ? "active" : ""].filter(Boolean).join(" ")}
                  disabled={item.disabled}
                  key={item.clave}
                  onClick={item.abrir}
                  title={item.hint}
                  type="button"
                >
                  <Icono nombre={item.icon} />
                  <span className="menu-texto">
                    <span className="menu-nombre">{item.label}</span>
                    {item.etiqueta ? <span className="menu-tag">{item.etiqueta}</span> : null}
                  </span>
                </button>
              ))}
            </div>
          ))}
          {/* SPEC_UX_NUEVA_FACTURA_v0.1, A.3: pie de estado del menu. */}
          <div className={readiness?.ready ? "side-nav-pie listo" : "side-nav-pie revisar"}>
            <span className="side-nav-punto" aria-hidden="true" />
            <span>
              {readiness?.ready ? "Listo para facturar" : "Revisar estado"}
              {/* URA-021 (H-04, P-P6): el punto activo; documento_nro es una referencia local, no el ultimo numero. */}
              {context ? ` · ${nombrePunto(context.fiscal_context)}` : ""}
            </span>
          </div>
        </nav>
      ) : null}
      <div className="operation-content">
      {updatePending ? (
        <section className="update-banner" aria-live="assertive">
          <div>
            <strong>Nueva versión disponible</strong>
            <small>Hay una actualización lista. Tocá el botón para cargarla ahora.</small>
          </div>
          <button className="primary-action" onClick={() => void applyUpdate()} type="button">
            Actualizar
          </button>
        </section>
      ) : null}

      {showInstallHint && !isStandalone && !updatePending ? (
        <section className="install-banner" aria-live="polite">
          <div>
            <strong>Instala Segel en tu dispositivo</strong>
            <small>
              {installPromptEvent
                ? "Acceso rapido desde pantalla de inicio, como una app."
                : "En iPhone/iPad usa Compartir -> Agregar a pantalla de inicio."}
            </small>
          </div>
          <div className="install-banner-actions">
            {installPromptEvent ? (
              <button className="primary-action" disabled={installing} onClick={() => void promptInstall()} type="button">
                {installing ? "Abriendo..." : "Instalar app"}
              </button>
            ) : null}
            <button className="ghost-action" onClick={dismissInstallHint} type="button">
              Cerrar
            </button>
          </div>
        </section>
      ) : null}

      {operationView === "invoice" ? (
        <InvoiceEditor
          key={invoiceInitialDraft?.corrige_numero ?? "factura"}
          canEmit={canEmit}
          context={context}
          clientePrefillRequest={invoiceClientePrefill}
          initialDraft={invoiceInitialDraft}
          readiness={readiness}
          onBack={() => { setInvoiceInitialDraft(null); goTo("status"); }}
          onVerDocumentos={() => { setInvoiceInitialDraft(null); goTo("documents"); }}
        />
      ) : operationView === "credit-note" ? (
        <CreditNoteView
          context={context}
          mostrarPunto={variosPerfiles}
          onBack={() => goTo("status")}
          onVerEmitidas={() => abrirDocumentos("NOTAS_CREDITO")}
          onFacturaExternaGuardada={(documento) => abrirDocumentos("FACTURAS", undefined, documento.id)}
        />
      ) : operationView === "remision" && context ? (
        <RemisionView
          abrirNuevaCarga={remisionNuevaCarga}
          context={context}
          key={remisionNuevaCarga ? "nueva" : "listado"}
          onBack={() => goTo("status")}
          onVerDocumento={(documentoId) => abrirDocumentos("NOTAS_REMISION", undefined, documentoId)}
          onVerEmitidas={() => abrirDocumentos("NOTAS_REMISION")}
          role={user?.role ?? "OPERADOR_FACTURACION"}
        />
      ) : operationView === "documents" ? (
        <DocumentsView
          onBack={() => goTo("invoice")}
          onGoTo={goTo}
          onCorregirFactura={(draft) => { setInvoiceInitialDraft(draft); goTo("invoice"); }}
          role={user?.role ?? "OPERADOR_FACTURACION"}
          context={context}
          mostrarPunto={variosPerfiles}
          documentoInicialId={documentoInicialId}
          key={`${pestanaDocumentos}-${tipoCarga ?? ""}-${documentoInicialId ?? ""}`}
          pestanaInicial={pestanaDocumentos}
          tipoCargaInicial={tipoCarga}
        />
      ) : operationView === "clients" ? (
        <AgendaView
          onBack={() => goTo("invoice")}
          onUseCliente={useClienteFromAgenda}
        />
      ) : operationView === "catalog" ? (
        <CatalogView onBack={() => goTo("invoice")} />
      ) : operationView === "notas" ? (
        <NotasView
         
          onBack={() => goTo("invoice")}
          onConvertirEnFactura={(draft) => { setInvoiceInitialDraft(draft); goTo("invoice"); }}
          numeracionDelCliente={numeracionDelCliente}
        />
      ) : operationView === "recibos" ? (
        <RecibosView onBack={() => goTo("invoice")} />
      ) : (
        <StatusView
          canEmit={canEmit}
          context={context}
          readiness={readiness}
          user={user}
          onGoTo={goTo}
          variosPerfiles={variosPerfiles}
          avisoPerfil={avisoPerfil}
          onCerrarAvisoPerfil={onCerrarAvisoPerfil}
          onCambiarPerfil={abrirCambioPerfil}
          perfilesError={perfilesError}
        />
      )}
      </div>
      </div>
      {cambioPerfil ? (
        <CambioPerfilDialog
          activoId={perfilActivo?.operacion_config_id ?? null}
          hayDocumentoSinEmitir={cambioPerfil.sinEmitir}
          onBloqueado={onBloqueado}
          onCerrar={() => setCambioPerfil(null)}
          onConfirmar={onCambiarPerfil}
          perfiles={perfiles}
        />
      ) : null}
    </main>
  );
}

function InvoiceEditor({
  canEmit,
  clientePrefillRequest,
  initialDraft,
  context,
  readiness,
  onBack,
  onVerDocumentos
}: {
  canEmit: boolean;
  clientePrefillRequest: InvoiceClientePrefillRequest | null;
  initialDraft?: InvoiceInitialDraft | null;
  context: OperationalContextResponse | null;
  readiness: ReadinessResponse | null;
  onBack: () => void;
  onVerDocumentos?: () => void;
}) {
  const [condicionVenta, setCondicionVenta] = useState<CondicionVenta>("CONTADO");
  // SPEC_MONEDA_EXTRANJERA_v0.1: moneda y tipo de cambio global de la factura.
  const [moneda, setMoneda] = useState<MonedaFactura>("PYG");
  const [tipoCambio, setTipoCambio] = useState("");
  const enMonedaExtranjera = moneda !== "PYG";
  const tipoCambioValido = !enMonedaExtranjera || (Number(tipoCambio) > 0 && /^\d+(\.\d{1,4})?$/.test(tipoCambio));
  function cambiarMoneda(nueva: MonedaFactura) {
    setMoneda(nueva);
    if (nueva === "PYG") setTipoCambio("");
  }
  const [tipoTransaccion, setTipoTransaccion] = useState<TipoTransaccionServicio>(
    context?.fiscal_context.tipo_transaccion_default ?? 2
  );
  // SPEC_PLAZO_CREDITO_v0.1, RN-01 y D-1: arranca en 30 dias, no en el plazo del punto; se guarda como texto para poder escribirlo.
  const [creditoPlazoTexto, setCreditoPlazoTexto] = useState<string>(String(PLAZO_CREDITO_DEFECTO));
  const creditoPlazoDias = plazoValido(creditoPlazoTexto);
  const errorPlazoCredito = condicionVenta === "CREDITO" ? errorPlazo(creditoPlazoTexto) : null;
  const [cliente, setCliente] = useState<FacturaClienteInput>({
    documento_tipo: "RUC",
    documento: "",
    razon_social: "",
    direccion: "",
    telefono: "",
    email: "",
    naturaleza: undefined
  });
  const [clienteNaturalezaTouched, setClienteNaturalezaTouched] = useState(false);
  const [lines, setLines] = useState<InvoiceLineDraft[]>(() => []);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  // SPEC_EDITOR_FACTURA_PC_v0.1: modo completo en >= 1024 px salvo que el operador elija el simple en este navegador.
  const esEscritorio = useEsEscritorio();
  const [modoPreferido, setModoPreferido] = useState<"simple" | "completo">(() => leerModoEditor());
  const modoCompleto = esEscritorio && modoPreferido === "completo";
  function cambiarModoEditor(modo: "simple" | "completo") {
    setModoPreferido(modo);
    guardarModoEditor(modo);
    setLineSheetOpen(false);
  }
  const [lineSheetOpen, setLineSheetOpen] = useState(false);
  const [lineCodeOpen, setLineCodeOpen] = useState(false);
  // SPEC_UX_NUEVA_FACTURA_v0.1, B.3 y D-3: origen del cliente, opcionales plegados y guardado en la agenda al emitir.
  const [clienteOrigen, setClienteOrigen] = useState<"AGENDA" | "PADRON" | null>(null);
  const [opcionalesAbiertos, setOpcionalesAbiertos] = useState(false);
  const [guardarEnAgenda, setGuardarEnAgenda] = useState(true);
  const esInnominado = esClienteInnominado(cliente);
  const [clienteSuggestions, setClienteSuggestions] = useState<ClienteSearchResult[]>([]);
  const [clienteSearching, setClienteSearching] = useState(false);
  const [clienteAutocompleting, setClienteAutocompleting] = useState(false);
  const [clienteSaving, setClienteSaving] = useState(false);
  const [clienteMessage, setClienteMessage] = useState<string | null>(null);
  // SPEC_VALIDACIONES_RECEPTOR_v0.1 RV-09 y RV-10: errores por campo al salir del campo; aviso del padron.
  const [clienteTocados, setClienteTocados] = useState<Set<CampoReceptor>>(new Set());
  const [avisoDnitCliente, setAvisoDnitCliente] = useState<{ texto: string; documento?: string } | null>(null);
  const [catalogSuggestions, setCatalogSuggestions] = useState<Record<string, CatalogoItem[]>>({});
  const [catalogSearching, setCatalogSearching] = useState<Record<string, boolean>>({});
  const [catalogSaving, setCatalogSaving] = useState<Record<string, boolean>>({});
  const [catalogMessage, setCatalogMessage] = useState<Record<string, string | null>>({});
  const [preview, setPreview] = useState<FacturaPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // SPEC_DESCUENTOS_FACTURA_v0.1 RN-13 y RN-15.
  const [descuentoModo, setDescuentoModo] = useState<ModoDescuento>("PORCENTAJE");
  const [descuentoGlobal, setDescuentoGlobal] = useState("");
  // RN-24 (D-9): los controles de descuento van ocultos hasta que el operador elija agregar uno.
  const [descuentosVisibles, setDescuentosVisibles] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [emitting, setEmitting] = useState(false);
  const [emissionError, setEmissionError] = useState<string | null>(null);
  const [emittedDocumento, setEmittedDocumento] = useState<DocumentoResponse | null>(null);
  // SPEC_MULTIPERFIL_USUARIO_v0.1 RN-06: datos cargados y nada emitido.
  useBorradorSinEmitir(
    "factura",
    () => !emittedDocumento && Boolean(cliente.documento.trim() || cliente.razon_social.trim() || lines.some((linea) => linea.descripcion.trim()))
  );
  const [idempotencyKey, setIdempotencyKey] = useState(() => createIdempotencyKey());
  const [lastEmittedRequestFingerprint, setLastEmittedRequestFingerprint] = useState<string | null>(null);
  const [deliveryLink, setDeliveryLink] = useState<DeliveryLinkResponse | null>(null);
  const [emailStatus, setEmailStatus] = useState<EmailStatusResponse | null>(null);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const descriptionInputRef = useRef<HTMLInputElement | null>(null);
  const lineSheetRef = useRef<HTMLElement | null>(null);
  const sendSectionRef = useRef<HTMLElement | null>(null);
  const comprobanteSectionRef = useRef<HTMLElement | null>(null);
  const clientSectionRef = useRef<HTMLElement | null>(null);
  const productsSectionRef = useRef<HTMLElement | null>(null);
  const lastAppliedClientePrefillIdRef = useRef<number | null>(null);
  const initialDraftAppliedRef = useRef(false);
  const correccionEmitidaRef = useRef(false);

  const api = useApi();
  const today = useMemo(() => new Date().toLocaleDateString("es-PY"), []);

  // SPEC_MONEDA_EXTRANJERA_v0.1, RN-08: cambiar la moneda no convierte montos; las lineas que dejan de ser validas
  // se marcan y bloquean la emision hasta corregirlas (antes la vista previa las omitia en silencio).
  // SPEC_EDITOR_FACTURA_PC_v0.1, RN-02: una linea con algo cargado pero incompleta tambien bloquea; antes la vista
  // previa la omitia y la factura salia sin ella.
  const lineasInvalidasIds = new Set(
    lines
      .filter((line) => line.descripcion.trim() || line.codigo.trim() || line.precio_unitario.trim())
      .filter(
        (line) =>
          !line.descripcion.trim() ||
          !cantidadValida(Number(line.cantidad)) ||
          !precioValido(Number(line.precio_unitario), moneda) ||
          Number(line.precio_unitario) <= 0 ||
          // SPEC_DESCUENTOS_FACTURA_v0.1 RN-16.
          descuentoDeLinea(line, descuentoModo, moneda).error !== null
      )
      .map((line) => line.id)
  );
  // RN-15: descuento sobre el total, en la moneda de la factura.
  const descuentoGlobalNumero = Number((descuentoGlobal || "0").replace(",", "."));
  const errorDescuentoGlobal =
    descuentoGlobal.trim() && (!Number.isFinite(descuentoGlobalNumero) || descuentoGlobalNumero < 0 || !precioValido(descuentoGlobalNumero, moneda))
      ? moneda === "PYG"
        ? "En guaraníes, el descuento va sin decimales"
        : "El descuento admite hasta 2 decimales"
      : null;
  // RN-24: con algun descuento cargado los controles se muestran siempre.
  const hayDescuentos = lines.some((line) => (line.descuento_ingresado ?? "").trim() !== "") || descuentoGlobal.trim() !== "";
  const mostrarDescuentos = descuentosVisibles || hayDescuentos;
  function alternarDescuentos() {
    if (hayDescuentos) {
      // "Quitar descuentos": borra los de todas las lineas y el global, y oculta los controles.
      setLines((current) => current.map((line) => ((line.descuento_ingresado ?? "") === "" ? line : { ...line, descuento_ingresado: "" })));
      setDescuentoGlobal("");
      setDescuentosVisibles(false);
      return;
    }
    const mostrar = !descuentosVisibles;
    setDescuentosVisibles(mostrar);
    if (mostrar && modoCompleto) {
      window.setTimeout(() => document.querySelector<HTMLInputElement>(".descuento-global input")?.focus(), 0);
    }
  }
  const request = useMemo<FacturaPreviewRequest | null>(() => {
    const items = lines
      .map((line) => ({
        catalogo_item_id: line.catalogo_item_id,
        codigo: line.codigo.trim() || null,
        descripcion: line.descripcion.trim(),
        cantidad: Number(line.cantidad),
        precio_unitario: Number(line.precio_unitario),
        iva_tipo: line.iva_tipo,
        // SPEC_DESCUENTOS_FACTURA_v0.1 RN-13: monto por unidad, calculado al armar el pedido.
        ...(() => {
          const d = descuentoDeLinea(line, descuentoModo, moneda);
          return d.monto > 0 && !d.error ? { descuento: d.monto } : {};
        })()
      }))
      .filter(
        (line) =>
          line.descripcion &&
          cantidadValida(line.cantidad) &&
          precioValido(line.precio_unitario, moneda) &&
          line.precio_unitario > 0
      );

    if (!cliente.documento.trim() || !cliente.razon_social.trim() || items.length === 0 || !tipoCambioValido) {
      return null;
    }
    // SPEC_PLAZO_CREDITO_v0.1, RN-05: con Credito y un plazo fuera de 1 a 365 no hay vista previa ni emision.
    if (condicionVenta === "CREDITO" && creditoPlazoDias === null) {
      return null;
    }
    // SPEC_VALIDACIONES_RECEPTOR_v0.1 RV-08: sin receptor valido no hay vista previa ni emision.
    const revision = revisarReceptor({
      ...cliente,
      direccion: cliente.direccion ?? null,
      telefono: cliente.telefono ?? null,
      email: cliente.email ?? null
    });
    if (revision.errores.length > 0) {
      return null;
    }

    return {
      ...(enMonedaExtranjera ? { moneda, tipo_cambio: Number(tipoCambio) } : {}),
      condicion_venta: condicionVenta,
      tipo_transaccion: tipoTransaccion,
      credito_plazo_dias: condicionVenta === "CREDITO" ? creditoPlazoDias : null,
      cliente: {
        ...revision.normalizado,
        direccion: revision.normalizado.direccion ?? null,
        telefono: revision.normalizado.telefono ?? null,
        email: revision.normalizado.email ?? null
      },
      items,
      ...(descuentoGlobalNumero > 0 && !errorDescuentoGlobal ? { descuento_global: descuentoGlobalNumero } : {})
    };
  }, [cliente, condicionVenta, creditoPlazoDias, lines, tipoTransaccion, moneda, tipoCambio, enMonedaExtranjera, tipoCambioValido, descuentoModo, descuentoGlobalNumero, errorDescuentoGlobal]);
  const requestFingerprint = useMemo(() => (request ? JSON.stringify(request) : null), [request]);

  useEffect(() => {
    if (!clientePrefillRequest) {
      return;
    }
    if (lastAppliedClientePrefillIdRef.current === clientePrefillRequest.request_id) {
      return;
    }

    setCliente({
      cliente_id: clientePrefillRequest.cliente.cliente_id ?? null,
      documento_tipo: clientePrefillRequest.cliente.documento_tipo,
      documento: clientePrefillRequest.cliente.documento ?? "",
      razon_social: clientePrefillRequest.cliente.razon_social ?? "",
      direccion: clientePrefillRequest.cliente.direccion ?? "",
      telefono: clientePrefillRequest.cliente.telefono ?? "",
      email: clientePrefillRequest.cliente.email ?? "",
      naturaleza: clientePrefillRequest.cliente.naturaleza
    });
    setClienteNaturalezaTouched(true);
    setClienteSuggestions([]);
    setClienteOrigen(clientePrefillRequest.cliente.cliente_id ? "AGENDA" : null);
    setGuardarEnAgenda(!clientePrefillRequest.cliente.cliente_id);
    setOpcionalesAbiertos(Boolean(clientePrefillRequest.cliente.direccion || clientePrefillRequest.cliente.telefono || clientePrefillRequest.cliente.email));
    setClienteMessage(null);
    lastAppliedClientePrefillIdRef.current = clientePrefillRequest.request_id;
    scrollSection(clientSectionRef);
  }, [clientePrefillRequest]);

  useEffect(() => {
    if (!initialDraft || initialDraftAppliedRef.current) return;
    initialDraftAppliedRef.current = true;

    setCliente(prev => initialDraft.cliente
      ? { ...prev, ...initialDraft.cliente, cliente_id: null }
      : {
          ...prev,
          razon_social: initialDraft.cliente_nombre,
          documento: initialDraft.cliente_ruc ?? "",
          documento_tipo: initialDraft.cliente_ruc ? "RUC" : "RUC",
        });

    if (initialDraft.items.length > 0) {
      setLines(initialDraft.items.map(item => ({
        id: crypto.randomUUID(),
        catalogo_item_id: item.catalog_item_id,
        codigo: "",
        descripcion: item.descripcion,
        cantidad: String(item.cantidad),
        precio_unitario: String(item.precio_unitario),
        iva_tipo: item.iva_tipo,
        lockedFromCatalog: item.catalog_item_id != null,
      })));
    }
  }, [initialDraft]);

  useEffect(() => {
    if (!activeLineId && lines[0]) {
      setActiveLineId(lines[0].id);
    }
  }, [activeLineId, lines]);

  useEffect(() => {
    if (!lineSheetOpen) {
      return;
    }

    const timeout = window.setTimeout(() => {
      lineSheetRef.current?.scrollTo({ top: 0, behavior: "auto" });
      descriptionInputRef.current?.focus();
    }, 80);

    return () => window.clearTimeout(timeout);
  }, [lineSheetOpen, activeLineId]);

  useEffect(() => {
    if (!lineSheetOpen) {
      return;
    }

    const scrollY = window.scrollY;
    document.body.classList.add("sheet-scroll-lock");
    document.body.style.top = `-${scrollY}px`;

    return () => {
      document.body.classList.remove("sheet-scroll-lock");
      document.body.style.top = "";
      window.scrollTo({ top: scrollY, behavior: "auto" });
    };
  }, [lineSheetOpen]);

  useEffect(() => {
    if (!lineSheetOpen || !lineSheetRef.current) {
      return;
    }

    const sheetElement = lineSheetRef.current;
    const updateSheetMaxHeight = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      sheetElement.style.height = `${Math.max(320, Math.floor(viewportHeight))}px`;
    };

    updateSheetMaxHeight();
    window.visualViewport?.addEventListener("resize", updateSheetMaxHeight);
    window.visualViewport?.addEventListener("scroll", updateSheetMaxHeight);
    window.addEventListener("resize", updateSheetMaxHeight);

    return () => {
      window.visualViewport?.removeEventListener("resize", updateSheetMaxHeight);
      window.visualViewport?.removeEventListener("scroll", updateSheetMaxHeight);
      window.removeEventListener("resize", updateSheetMaxHeight);
      sheetElement.style.removeProperty("height");
    };
  }, [lineSheetOpen]);

  function getScrollableParent(element: HTMLElement): HTMLElement | null {
    let current: HTMLElement | null = element.parentElement;
    while (current) {
      const style = window.getComputedStyle(current);
      const canScroll = /(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight;
      if (canScroll) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  }

  function scrollToElement(element: HTMLElement) {
    const scrollParent = getScrollableParent(element);
    if (scrollParent) {
      const parentRect = scrollParent.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const top = Math.max(0, scrollParent.scrollTop + elementRect.top - parentRect.top - 12);
      scrollParent.scrollTo({ top, behavior: "smooth" });
      return;
    }
    const top = Math.max(0, window.scrollY + element.getBoundingClientRect().top - 12);
    window.scrollTo({ top, behavior: "smooth" });
  }

  function scrollSection(ref: React.RefObject<HTMLElement>) {
    window.setTimeout(() => {
      const element = ref.current;
      if (!element) {
        return;
      }
      scrollToElement(element);
    }, 120);
  }

  useEffect(() => {
    if (!request) {
      setPreview(null);
      return;
    }

    const timeout = window.setTimeout(() => {
      void runPreview(request);
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [request]);

  useEffect(() => {
    const q = cliente.documento.trim();
    // SPEC_COMPRADOR_INNOMINADO_v0.1, RN-01: el comprador sin nombre no se busca en la agenda.
    if (q.length < 2 || cliente.documento_tipo === "INNOMINADO") {
      setClienteSuggestions([]);
      return;
    }

    const timeout = window.setTimeout(async () => {
      setClienteSearching(true);
      try {
        const result = await api.get<{ items: ClienteSearchResult[] }>(`/clientes/search?q=${encodeURIComponent(q)}&limit=5`);
        setClienteSuggestions(result.items);
      } catch {
        setClienteSuggestions([]);
      } finally {
        setClienteSearching(false);
      }
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [api, cliente.documento, cliente.documento_tipo]);

  useEffect(() => {
    const timeouts = lines.map((line) => {
      const q = (line.codigo || line.descripcion).trim();
      if (q.length < 1 || line.lockedFromCatalog) {
        setCatalogSuggestions((current) => ({ ...current, [line.id]: [] }));
        return null;
      }

      return window.setTimeout(async () => {
        setCatalogSearching((current) => ({ ...current, [line.id]: true }));
        try {
          // RN-07: los articulos de la moneda de la factura primero.
          const result = await api.get<{ items: CatalogoItem[] }>(`/catalogo/items/search?q=${encodeURIComponent(q)}&limit=5&moneda=${moneda}`);
          setCatalogSuggestions((current) => ({ ...current, [line.id]: result.items }));
        } catch {
          setCatalogSuggestions((current) => ({ ...current, [line.id]: [] }));
        } finally {
          setCatalogSearching((current) => ({ ...current, [line.id]: false }));
        }
      }, 300);
    });

    return () => {
      timeouts.forEach((timeout) => {
        if (timeout) {
          window.clearTimeout(timeout);
        }
      });
    };
  }, [api, lines]);

  useEffect(() => {
    if (!emittedDocumento) {
      setDeliveryLink(null);
      setEmailStatus(null);
      setDeliveryMessage(null);
      setWhatsappPhone("");
      return;
    }

    setWhatsappPhone(emittedDocumento.cliente.telefono ?? "");
    void loadDeliveryData(emittedDocumento.id);
  }, [emittedDocumento?.id, emittedDocumento?.cdc, emittedDocumento?.estado]);

  // SPEC_UX_NUEVA_FACTURA_v0.1, RN-11: el resultado relee el estado guardado por FS hasta llegar a un estado final.
  useEffect(() => {
    if (!emittedDocumento || esEstadoFinalOperador(emittedDocumento.estado)) return;
    const id = emittedDocumento.id;
    const intervalo = window.setInterval(() => {
      api
        .get<DocumentoResponse>(`/facturas/${id}`)
        .then((actual) => {
          setEmittedDocumento((previo) =>
            previo && previo.id === actual.id &&
            (previo.estado !== actual.estado || previo.numero_fiscal !== actual.numero_fiscal || previo.cdc !== actual.cdc || previo.accion !== actual.accion)
              ? actual
              : previo
          );
        })
        .catch(() => undefined);
    }, 15000);
    return () => window.clearInterval(intervalo);
  }, [api, emittedDocumento?.id, emittedDocumento?.estado]);

  // SPEC_UX_NUEVA_FACTURA_v0.1, D-4: con el resultado en pantalla el formulario no se edita, asi que ya no hace falta
  // descartar el documento creado cuando cambia el pedido (ademas, guardar el cliente al emitir cambia el cliente_id).
  // "Crear nueva factura" es el unico camino de vuelta al formulario y renueva la clave de idempotencia.

  async function runPreview(nextRequest = request) {
    if (!nextRequest) {
      setPreviewError("Completá cliente y al menos una línea para calcular.");
      return;
    }

    setPreviewing(true);
    setPreviewError(null);

    try {
      const result = await api.post<FacturaPreviewResponse>("/facturas/preview", nextRequest);
      setPreview(result);
    } catch (error) {
      setPreview(null);
      setPreviewError(error instanceof Error ? error.message : "No se pudo calcular la factura.");
    } finally {
      setPreviewing(false);
    }
  }

  async function emitFactura() {
    if (!request) {
      setEmissionError("Completá cliente y líneas antes de emitir.");
      return;
    }

    setEmitting(true);
    setEmissionError(null);

    // SPEC_UX_NUEVA_FACTURA_v0.1, D-3: la casilla guarda o actualiza el cliente en la agenda antes de emitir;
    // si falla, la factura sale igual y el aviso queda en la tarjeta Cliente.
    let clienteGuardado: ClienteResponse | null = null;
    if (guardarEnAgenda && !esInnominado && cliente.documento.trim() && cliente.razon_social.trim()) {
      clienteGuardado = await saveClienteRapido();
    }

    try {
      // RN-A1: solo la primera emision del editor corrige; otra factura emitida despues no.
      const corrige = initialDraft?.corrige_documento_id && !correccionEmitidaRef.current ? initialDraft.corrige_documento_id : null;
      const result = await api.request<DocumentoResponse>("/facturas", {
        method: "POST",
        headers: {
          "Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify({
          ...request,
          ...(clienteGuardado ? { cliente: { ...request.cliente, cliente_id: clienteGuardado.cliente_id } } : {}),
          ...(corrige ? { corrige_documento_id: corrige } : {})
        })
      });
      if (corrige) correccionEmitidaRef.current = true;
      setEmittedDocumento(result);
      setLastEmittedRequestFingerprint(requestFingerprint ?? JSON.stringify(request));
      setDeliveryLink(null);
      setEmailStatus(null);
      // SPEC_UX_NUEVA_FACTURA_v0.1, D-4: el resultado reemplaza al formulario; se vuelve arriba.
      window.scrollTo({ top: 0 });
    } catch (error) {
      setEmissionError(error instanceof Error ? error.message : "No se pudo emitir la factura.");
    } finally {
      setEmitting(false);
    }
  }

  async function refreshEmittedDocumento() {
    if (!emittedDocumento) {
      return;
    }

    setEmitting(true);
    setEmissionError(null);

    try {
      const result = await api.post<DocumentoResponse>(`/facturas/${emittedDocumento.id}/refresh-status`, {});
      setEmittedDocumento(result);
    } catch (error) {
      setEmissionError(error instanceof Error ? error.message : "No se pudo refrescar el estado fiscal.");
    } finally {
      setEmitting(false);
    }
  }

  async function retryEmittedDocumento() {
    if (!emittedDocumento) {
      return;
    }

    setEmitting(true);
    setEmissionError(null);

    try {
      const result = await api.post<DocumentoResponse>(`/facturas/${emittedDocumento.id}/retry-emission`, {});
      setEmittedDocumento(result);
      setDeliveryMessage(mensajeResultadoReintento(result));
    } catch (error) {
      setEmissionError(error instanceof Error ? error.message : "No se pudo reintentar la emisión.");
    } finally {
      setEmitting(false);
    }
  }

  async function loadDeliveryData(documentoId: string, regenerate = false) {
    setDeliveryLoading(true);
    setDeliveryMessage(null);

    try {
      const [link, email] = await Promise.all([
        api.post<DeliveryLinkResponse>(`/facturas/${documentoId}/delivery-link`, { regenerate }),
        api.get<EmailStatusResponse>(`/facturas/${documentoId}/email-status`)
      ]);
      setDeliveryLink(link);
      setEmailStatus(email);
    } catch (error) {
      setDeliveryMessage(error instanceof Error ? error.message : "No se pudieron cargar las acciones de entrega.");
    } finally {
      setDeliveryLoading(false);
    }
  }

  async function copyPublicLink() {
    const url = deliveryLink?.public_url;
    if (!url) {
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setDeliveryMessage("Link copiado.");
    } catch {
      setDeliveryMessage(url);
    }
  }

  async function sharePublicLink() {
    const url = deliveryLink?.public_url;
    if (!url) {
      return;
    }

    const payload = {
      title: "Factura Segel",
      text: "Factura disponible para compartir",
      url
    };

    try {
      if (navigator.share) {
        await navigator.share(payload);
        return;
      }
      await navigator.clipboard.writeText(url);
      setDeliveryMessage("Enlace copiado para compartir.");
    } catch {
      setDeliveryMessage("No se pudo abrir el menu de compartir.");
    }
  }

  useEffect(() => {
    if (!modoCompleto) return;
    const ultima = lines[lines.length - 1];
    if (!ultima || ultima.descripcion.trim() || ultima.codigo.trim() || ultima.precio_unitario.trim()) {
      setLines((current) => [...current, createInvoiceLine()]);
    }
  }, [modoCompleto, lines]);

  function updateLine(lineId: string, patch: Partial<InvoiceLineDraft>) {
    setLines((current) => current.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));
  }

  function removeLine(lineId: string) {
    setLines((current) => current.filter((line) => line.id !== lineId));
    if (activeLineId === lineId) {
      setActiveLineId(null);
      setLineSheetOpen(false);
    }
  }

  /**
   * SPEC_COMPRADOR_INNOMINADO_v0.1, RN-01/RN-02: "Sin nombre" fija 0 y Sin Nombre, sin agenda ni DNIT;
   * al salir de "Sin nombre" documento y nombre quedan vacios.
   */
  function cambiarTipoDocumento(tipo: FacturaDocumentoTipo) {
    setClienteNaturalezaTouched(false);
    setClienteOrigen(null);
    setClienteSuggestions([]);
    setClienteMessage(null);
    if (tipo === "INNOMINADO") {
      setGuardarEnAgenda(false);
      setCliente((current) => ({
        ...current,
        documento_tipo: "INNOMINADO",
        cliente_id: null,
        documento: INNOMINADO_DOCUMENTO,
        razon_social: INNOMINADO_NOMBRE,
        naturaleza: undefined
      }));
      return;
    }
    setGuardarEnAgenda(true);
    setCliente((current) =>
      current.documento_tipo === "INNOMINADO"
        ? { ...current, documento_tipo: tipo, cliente_id: null, documento: "", razon_social: "" }
        : { ...current, documento_tipo: tipo }
    );
  }

  /** SPEC_UX_NUEVA_FACTURA_v0.1, B.3: editar un cliente de la agenda vuelve a marcar la casilla de actualizar. */
  function editarCliente(patch: Partial<FacturaClienteInput>) {
    setCliente((current) => ({ ...current, ...patch }));
    if (cliente.cliente_id) setGuardarEnAgenda(true);
  }

  /** SPEC_UX_NUEVA_FACTURA_v0.1, B.4: "Agregar linea" enfoca la fila vacia del final (la agrega si hace falta). */
  function agregarLinea() {
    const ultima = lines[lines.length - 1];
    const indice = !ultima || lineaTieneDatos(ultima) ? lines.length : lines.length - 1;
    if (indice === lines.length) setLines((current) => [...current, createInvoiceLine()]);
    window.setTimeout(() => {
      document.querySelector<HTMLInputElement>(`[data-grilla-fila="${indice}"] input[data-celda="descripcion"]`)?.focus();
    }, 0);
  }

  function addLineAndEdit() {
    const nextLine = createInvoiceLine();
    setLines((current) => [...current, nextLine]);
    setActiveLineId(nextLine.id);
    setLineCodeOpen(false);
    setLineSheetOpen(true);
  }

  function editLine(lineId: string) {
    setActiveLineId(lineId);
    setLineCodeOpen(false);
    setLineSheetOpen(true);
  }

  function closeLineSheet() {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }

    if (activeLine) {
      const emptyDraft = !activeLine.codigo.trim() && !activeLine.descripcion.trim() && !activeLine.precio_unitario.trim();
      if (emptyDraft) {
        setLines((current) => current.filter((line) => line.id !== activeLine.id));
        setActiveLineId(null);
      }
    }
    setLineSheetOpen(false);
    setLineCodeOpen(false);
    scrollSection(productsSectionRef);
  }

  function applyClienteSuggestion(suggestion: ClienteSearchResult) {
    setCliente({
      cliente_id: suggestion.cliente_id,
      documento_tipo: suggestion.documento_tipo,
      documento: suggestion.documento,
      razon_social: suggestion.razon_social,
      direccion: suggestion.direccion ?? "",
      telefono: suggestion.telefono ?? "",
      email: suggestion.email ?? "",
      naturaleza: suggestion.naturaleza
    });
    setClienteNaturalezaTouched(true);
    setClienteOrigen(suggestion.source === "AGENDA_FACTURADOR" ? "AGENDA" : "PADRON");
    setGuardarEnAgenda(!suggestion.cliente_id);
    if (suggestion.direccion || suggestion.telefono || suggestion.email) setOpcionalesAbiertos(true);
    setClienteMessage(null);
    setClienteSuggestions([]);
  }

  async function tryAutocompleteDnit() {
    const documentoTipo = cliente.documento_tipo;
    if (documentoTipo !== "RUC" && documentoTipo !== "CI") {
      return;
    }

    const rawDocumento = cliente.documento.trim();
    if (rawDocumento.length < 3) {
      return;
    }

    const normalizedInput = normalizeDocKey(rawDocumento);
    const exactAgendaOrGlobalMatch = clienteSuggestions.some((suggestion) => normalizeDocKey(suggestion.documento) === normalizedInput);
    if (exactAgendaOrGlobalMatch) {
      return;
    }

    setClienteAutocompleting(true);
    try {
      const result = await api.get<DnitAutocompleteResponse>(
        `/clientes/dnit/autocomplete?documento_tipo=${documentoTipo}&documento=${encodeURIComponent(rawDocumento)}`
      );

      if (!result.found || !result.cliente) {
        if (result.message && result.ambiguous) {
          setClienteMessage(result.message);
        }
        if (documentoTipo === "RUC" && !clienteNaturalezaTouched) {
          setCliente((current) => ({ ...current, naturaleza: sugerirNaturalezaPorLongitudRuc(rawDocumento) }));
        }
        return;
      }

      // RV-10: un DV escrito distinto al del padron se avisa y se ofrece; un RUC no activo se informa.
      const padron = result.cliente;
      const dvDistinto = documentoTipo === "RUC" && rawDocumento.includes("-") && normalizeDocKey(padron.documento) !== normalizedInput;
      const estadoPadron = (padron.estado ?? "").trim().toUpperCase();
      if (dvDistinto) {
        setAvisoDnitCliente({ texto: `Según la DNIT el RUC es ${padron.documento}.`, documento: padron.documento });
      } else if (padron.documento_tipo === "RUC" && estadoPadron && estadoPadron !== "ACTIVO") {
        setAvisoDnitCliente({ texto: `Este RUC figura como ${estadoPadron.toLowerCase()} en la DNIT. Verificá con el cliente cómo facturarle.` });
      } else {
        setAvisoDnitCliente(null);
      }
      setCliente((current) => ({
        ...current,
        documento_tipo: padron.documento_tipo ?? current.documento_tipo,
        documento: dvDistinto ? current.documento : padron.documento ?? current.documento,
        razon_social: padron.razon_social ?? current.razon_social,
        naturaleza: !clienteNaturalezaTouched && padron.documento_tipo === "RUC"
          ? padron.naturaleza_sugerida
          : current.naturaleza
      }));
      setClienteOrigen("PADRON");
      setGuardarEnAgenda(true);
      setClienteMessage(null);
    } catch {
      // No interrumpir el flujo operativo cuando DNIT no esta disponible.
      if (documentoTipo === "RUC" && !clienteNaturalezaTouched) {
        setCliente((current) => ({ ...current, naturaleza: sugerirNaturalezaPorLongitudRuc(rawDocumento) }));
      }
    } finally {
      setClienteAutocompleting(false);
    }
  }

  async function saveClienteRapido(): Promise<ClienteResponse | null> {
    setClienteSaving(true);
    setClienteMessage(null);

    try {
      const payload = {
        documento_tipo: cliente.documento_tipo,
        documento: cliente.documento,
        razon_social: cliente.razon_social,
        direccion: cliente.direccion || null,
        telefono: cliente.telefono || null,
        email: cliente.email || null,
        ...(cliente.naturaleza ? { naturaleza: cliente.naturaleza } : {})
      };
      const saved = cliente.cliente_id
        ? await api.request<ClienteResponse>(`/clientes/${cliente.cliente_id}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
          })
        : await api.post<ClienteResponse>("/clientes", payload);
      applyClienteSuggestion(saved);
      setGuardarEnAgenda(false);
      setClienteMessage(cliente.cliente_id ? "Cliente actualizado en la agenda." : "Cliente guardado en la agenda.");
      return saved;
    } catch (error) {
      setClienteMessage(`No se pudo guardar el cliente en la agenda: ${error instanceof Error ? error.message : "error desconocido"}`);
      return null;
    } finally {
      setClienteSaving(false);
    }
  }

  function applyCatalogItem(lineId: string, item: CatalogoItem) {
    // SPEC_CATALOGO_MONEDA_v0.1 RN-13 y RN-14: el precio se completa solo si el articulo es de la moneda de la factura.
    const monedaItem = item.moneda ?? "PYG";
    const mismaMoneda = monedaItem === moneda;
    updateLine(lineId, {
      catalogo_item_id: item.id,
      codigo: item.codigo,
      descripcion: item.descripcion,
      precio_unitario: mismaMoneda ? (moneda === "PYG" ? String(item.precio_unitario) : Number(item.precio_unitario).toFixed(2)) : "",
      iva_tipo: item.iva_tipo,
      lockedFromCatalog: mismaMoneda
    });
    setCatalogSuggestions((current) => ({ ...current, [lineId]: [] }));
    setCatalogMessage((current) => ({
      ...current,
      [lineId]: mismaMoneda
        ? "Item seleccionado del catálogo."
        : `Item del catálogo en ${monedaItem === "PYG" ? "Gs." : monedaItem}: cargá el precio en ${moneda === "PYG" ? "Gs." : moneda}.`
    }));
  }

  async function saveQuickCatalogItem(line: InvoiceLineDraft): Promise<boolean> {
    setCatalogSaving((current) => ({ ...current, [line.id]: true }));
    setCatalogMessage((current) => ({ ...current, [line.id]: null }));

    // SPEC_CATALOGO_MONEDA_v0.1 RN-16: se guarda en la moneda de la factura.
    if (!precioValidoEnMoneda(Number(line.precio_unitario), moneda) || Number(line.precio_unitario) <= 0) {
      setCatalogMessage((current) => ({
        ...current,
        [line.id]: moneda === "PYG" ? "En guaraníes el precio va sin decimales." : `En ${moneda} el precio va con hasta 2 decimales.`
      }));
      setCatalogSaving((current) => ({ ...current, [line.id]: false }));
      return false;
    }

    try {
      const saved = await api.post<CatalogoItem>("/catalogo/items", {
        codigo: line.codigo.trim() || null,
        descripcion: line.descripcion.trim(),
        precio_unitario: Number(line.precio_unitario),
        moneda,
        iva_tipo: line.iva_tipo,
        activo: true
      });
      applyCatalogItem(line.id, saved);
      setCatalogMessage((current) => ({ ...current, [line.id]: "Item guardado en catálogo." }));
      return true;
    } catch (error) {
      setCatalogMessage((current) => ({
        ...current,
        [line.id]: error instanceof Error ? error.message : "No se pudo guardar el item."
      }));
      return false;
    } finally {
      setCatalogSaving((current) => ({ ...current, [line.id]: false }));
    }
  }

  async function confirmLine(line: InvoiceLineDraft, saveInCatalog: boolean) {
    if (line.catalogo_item_id || line.lockedFromCatalog) {
      setLineSheetOpen(false);
      window.setTimeout(() => {
        sendSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
      return;
    }

    if (saveInCatalog) {
      const saved = await saveQuickCatalogItem(line);
      if (!saved) {
        return;
      }
    }

    setLineSheetOpen(false);
    window.setTimeout(() => {
      sendSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  const emittedXmlUrl = emittedDocumento && deliveryLink && emittedDocumento.delivery.artifacts.xml.available ? `${deliveryLink.public_url}/xml` : null;
  const hasEmissionResult = Boolean(emittedDocumento);
  const activeLine = lines.find((line) => line.id === activeLineId) ?? lines[0] ?? null;
  const activeLineIndex = activeLine ? lines.findIndex((line) => line.id === activeLine.id) : -1;
  const visibleLines = lines.filter((line) => line.descripcion.trim() || line.codigo.trim() || line.precio_unitario.trim());
  const previewSubtotalsByLineId = new Map<string, number>();
  lines
    .filter(
      (line) =>
        line.descripcion.trim() &&
        cantidadValida(Number(line.cantidad)) &&
        precioValido(Number(line.precio_unitario), moneda) &&
        Number(line.precio_unitario) > 0
    )
    .forEach((line, index) => {
      previewSubtotalsByLineId.set(line.id, preview?.items[index]?.subtotal ?? 0);
    });

  function createNuevaFactura() {
    setCondicionVenta("CONTADO");
    // SPEC_MONEDA_EXTRANJERA_v0.1, RN-01: la factura nueva arranca en guaranies, como el resto de sus datos.
    setMoneda("PYG");
    setTipoCambio("");
    setTipoTransaccion(context?.fiscal_context.tipo_transaccion_default ?? 2);
    setCreditoPlazoTexto(String(PLAZO_CREDITO_DEFECTO));
    setCliente({
      documento_tipo: "RUC",
      documento: "",
      razon_social: "",
      direccion: "",
      telefono: "",
      email: "",
      naturaleza: undefined
    });
    setClienteNaturalezaTouched(false);
    setClienteOrigen(null);
    setOpcionalesAbiertos(false);
    setGuardarEnAgenda(true);
    setLines([]);
    setActiveLineId(null);
    setLineSheetOpen(false);
    setLineCodeOpen(false);
    setClienteSuggestions([]);
    setClienteMessage(null);
    setCatalogSuggestions({});
    setCatalogMessage({});
    setPreview(null);
    setPreviewError(null);
    setEmissionError(null);
    setEmittedDocumento(null);
    setLastEmittedRequestFingerprint(null);
    setDeliveryLink(null);
    setEmailStatus(null);
    setDeliveryMessage(null);
    setWhatsappPhone("");
    setIdempotencyKey(createIdempotencyKey());
    scrollSection(comprobanteSectionRef);
  }

  // SPEC_AJUSTES_TEXTOS_OPERADOR_v0.1, A-1: sin numero estimado. documento_nro es una referencia fija y el numero
  // lo asigna el servicio fiscal al emitir; con numeracion del cliente lo trae el archivo.
  const numeracionDelCliente = context?.fiscal_context.numeracion_facturas === "CLIENTE";
  const lineasConDatos = lines.filter(lineaTieneDatos);
  const primeraInvalida = lines.findIndex((line) => lineasInvalidasIds.has(line.id));
  const equivalenteGs = enMonedaExtranjera && tipoCambioValido && preview ? Math.round(preview.totals.total * Number(tipoCambio)) : null;
  // SPEC_COMPRADOR_INNOMINADO_v0.1, RN-04: el tope se mira sobre las lineas validas, sin esperar la vista previa.
  const totalLineasGs = request
    ? Math.round(request.items.reduce((suma, item) => suma + item.cantidad * item.precio_unitario, 0) * (enMonedaExtranjera ? Number(tipoCambio) : 1))
    : 0;
  const innominadoSobreTope = esInnominado && totalLineasGs >= TOPE_INNOMINADO_GS;
  const crearDeshabilitado = !canEmit || !preview || emitting || hasEmissionResult || lineasInvalidasIds.size > 0 || innominadoSobreTope;
  // SPEC_VALIDACIONES_RECEPTOR_v0.1 RV-09: errores del cliente por campo (se muestran al salir del campo).
  const revisionCliente = revisarReceptor({
    ...cliente,
    direccion: cliente.direccion ?? null,
    telefono: cliente.telefono ?? null,
    email: cliente.email ?? null
  });
  const errorCliente = (campo: CampoReceptor): string | null => revisionCliente.errores.find((e) => e.campo === campo)?.mensaje ?? null;
  const errorClienteVisible = (campo: CampoReceptor) => {
    const mensaje = clienteTocados.has(campo) ? errorCliente(campo) : null;
    return mensaje ? (
      <small className="campo-error" data-campo-error={campo} role="alert">
        {mensaje}
      </small>
    ) : null;
  };
  const tocarCliente = (campo: CampoReceptor) => setClienteTocados((actual) => new Set(actual).add(campo));
  const erroresOpcionalesCliente = revisionCliente.errores.some((e) => e.campo === "direccion" || e.campo === "telefono" || e.campo === "email");
  // SPEC_UX_NUEVA_FACTURA_v0.1, RN-04: un unico motivo, el primero que aplica.
  const motivoBloqueo: string | null = (() => {
    if (hasEmissionResult || emitting) return null;
    if (!canEmit) {
      const falla = mapBusinessReadinessChecks(readiness?.checks ?? []).find((check) => !check.ok);
      return `No se puede facturar: ${falla?.message ?? "revisá Información y estado."}`;
    }
    if (!cliente.documento.trim() || !cliente.razon_social.trim()) return "Falta el cliente (documento y nombre)";
    if (revisionCliente.errores.length > 0) return `Corregí los datos del cliente: ${revisionCliente.errores[0]!.mensaje}`;
    if (innominadoSobreTope) return MENSAJE_TOPE_INNOMINADO;
    if (!tipoCambioValido) return "Falta el tipo de cambio";
    if (errorPlazoCredito) return `Plazo de crédito: ${errorPlazoCredito.charAt(0).toLowerCase()}${errorPlazoCredito.slice(1)}`;
    if (errorDescuentoGlobal) return `Descuento sobre el total: ${errorDescuentoGlobal}`;
    if (lineasConDatos.length === 0) return "Agregá al menos una línea";
    if (primeraInvalida >= 0) return `Corregí la línea ${primeraInvalida + 1} para poder crear la factura`;
    if (!preview) return "Calculando…";
    return null;
  })();
  const textoCrear = emitting ? "Procesando..." : "Crear factura";
  const etiquetaMoneda = moneda === "PYG" ? "Gs." : moneda;
  const textoOrigenCliente = esInnominado
    ? "Consumidor final sin datos: no se guarda en la agenda y no admite nota de crédito"
    : clienteOrigen === "AGENDA"
      ? guardarEnAgenda ? "En tu agenda: se actualiza al emitir" : "En tu agenda"
      : clienteOrigen === "PADRON"
        ? "Del padron de la DNIT: se guarda en tu agenda al emitir"
        : cliente.documento.trim() && cliente.razon_social.trim()
          ? guardarEnAgenda ? "Cliente nuevo: se guarda en tu agenda al emitir" : "Cliente nuevo"
          : null;
  const hayOpcionales = Boolean(cliente.direccion?.trim() || cliente.telefono?.trim() || cliente.email?.trim());

  const encabezado = (
    <div className="editor-heading">
      <div>
        <h2 id="invoice-title">Nueva factura</h2>
        <p className="muted editor-subtitulo">
          {today}
          {context && !numeracionDelCliente ? " · el número lo asigna el sistema al emitir" : ""}
        </p>
      </div>
      <div className="header-actions">
        {esEscritorio ? (
          <div className="modo-editor-toggle" role="group" aria-label="Modo del editor">
            <button aria-pressed={!modoCompleto} className={!modoCompleto ? "active" : ""} onClick={() => cambiarModoEditor("simple")} type="button">
              Modo simple
            </button>
            <button aria-pressed={modoCompleto} className={modoCompleto ? "active" : ""} onClick={() => cambiarModoEditor("completo")} type="button">
              Modo completo
            </button>
          </div>
        ) : null}
        <button className="ghost-action" onClick={onBack} type="button">
          Volver
        </button>
      </div>
    </div>
  );

  const selectorTipoPersona = cliente.documento_tipo === "RUC" ? (
    <label className="campo-inline">
      Tipo de persona
      <select
        title="Sugerido según RUC o razón social; verificar con el cliente."
        value={cliente.naturaleza ?? "FISICA"}
        onChange={(event) => {
          setClienteNaturalezaTouched(true);
          editarCliente({ naturaleza: event.target.value as ClienteNaturaleza });
        }}
      >
        <option value="FISICA">Física</option>
        <option value="JURIDICA">Jurídica</option>
      </select>
    </label>
  ) : null;

  const camposOpcionales = (
    <div className="cliente-opcionales-campos">
      {!modoCompleto ? selectorTipoPersona : null}
      <label>
        Dirección
        <input aria-invalid={errorCliente("direccion") ? true : undefined} onBlur={() => tocarCliente("direccion")} onChange={(event) => editarCliente({ direccion: event.target.value })} value={cliente.direccion ?? ""} />
        {errorClienteVisible("direccion")}
      </label>
      <label>
        Teléfono
        <input aria-invalid={errorCliente("telefono") ? true : undefined} inputMode="tel" onBlur={() => tocarCliente("telefono")} onChange={(event) => editarCliente({ telefono: event.target.value })} value={cliente.telefono ?? ""} />
        {errorClienteVisible("telefono")}
      </label>
      <label>
        Correo
        <input aria-invalid={errorCliente("email") ? true : undefined} inputMode="email" onBlur={() => tocarCliente("email")} onChange={(event) => editarCliente({ email: event.target.value })} value={cliente.email ?? ""} />
        {errorClienteVisible("email")}
      </label>
    </div>
  );

  const casillaAgenda = (
    <label className="casilla-agenda">
      <input checked={guardarEnAgenda} onChange={(event) => setGuardarEnAgenda(event.target.checked)} type="checkbox" />
      {cliente.cliente_id ? "Actualizar en la agenda al emitir" : "Guardar en la agenda al emitir"}
    </label>
  );

  const formulario = (
    <>
      {encabezado}

      {initialDraft?.corrige_numero !== undefined ? (
        <p className="editor-alert ready" role="status">
          Corrigiendo la factura rechazada {initialDraft.corrige_numero ?? "sin número"}. Revisá los datos del cliente:
          la factura se emite con número nuevo y queda vinculada a la rechazada. El número de la rechazada se inutiliza
          desde su detalle.
        </p>
      ) : null}

      {/* SPEC_UX_NUEVA_FACTURA_v0.1, B.2 y D.2: banda Comprobante en una fila (apilada en modo simple). */}
      <section className="form-section banda-comprobante" aria-label="Comprobante" ref={comprobanteSectionRef}>
        <div className="banda-campo banda-condicion">
          <span className="banda-etiqueta">Condición de venta</span>
          <div className="segmented-control" role="group" aria-label="Condición de venta">
            {(["CONTADO", "CREDITO"] as const).map((value) => (
              <button
                aria-pressed={condicionVenta === value}
                className={condicionVenta === value ? "active" : ""}
                key={value}
                onClick={() => setCondicionVenta(value)}
                type="button"
              >
                {value === "CONTADO" ? "Contado" : "Crédito"}
              </button>
            ))}
          </div>
        </div>
        {condicionVenta === "CREDITO" || modoCompleto ? (
          <CampoPlazo
            deshabilitado={condicionVenta !== "CREDITO"}
            error={errorPlazoCredito}
            etiqueta="Plazo (días)"
            onCambio={setCreditoPlazoTexto}
            valor={creditoPlazoTexto}
          />
        ) : null}
        <label className="banda-campo banda-servicio">
          <span className="banda-etiqueta">Tipo de servicio</span>
          <select onChange={(event) => setTipoTransaccion(Number(event.target.value) as TipoTransaccionServicio)} value={tipoTransaccion}>
            <option value={1}>1 - Venta de mercadería</option>
            <option value={2}>2 - Prestación de servicios</option>
            <option value={3}>3 - Mixto (mercadería + servicios)</option>
          </select>
        </label>
        <label className="banda-campo banda-moneda">
          <span className="banda-etiqueta">Moneda</span>
          <select aria-label="Moneda" onChange={(event) => cambiarMoneda(event.target.value as MonedaFactura)} value={moneda}>
            {MONEDAS_FACTURA.map((opcion) => (
              <option key={opcion.codigo} value={opcion.codigo}>{opcion.codigo} - {opcion.nombre}</option>
            ))}
          </select>
        </label>
        {enMonedaExtranjera ? (
          <label className="banda-campo banda-cambio">
            <span className="banda-etiqueta">
              Tipo de cambio <small>Gs. por 1 {moneda}</small>
            </span>
            <input
              aria-label="Tipo de cambio"
              className="cifra"
              inputMode="decimal"
              onChange={(event) => setTipoCambio(event.target.value.replace(/[^\d.,]/g, "").replace(",", "."))}
              placeholder="Ej.: 7.350,50"
              value={tipoCambio.replace(".", ",")}
            />
            {/* SPEC_MONEDA_EXTRANJERA_v0.1, RN-02: el tipo de cambio va en guaranies (hasta 4 decimales, MT150 D018). */}
            {/* SPEC_AJUSTES_TEXTOS_OPERADOR_v0.1, A-7: regla informada por el usuario (cotizacion del dia anterior, DNIT). */}
            {tipoCambioValido ? (
              <small className="field-hint">Según la DNIT, va la cotización del día anterior.</small>
            ) : (
              <small className="field-hint">Obligatorio al facturar en {moneda}. Hasta 4 decimales.</small>
            )}
          </label>
        ) : null}
      </section>

      {/* SPEC_UX_NUEVA_FACTURA_v0.1, B.3 y D.3: cliente compacto. */}
      <section className="form-section client-section" aria-label="Cliente" ref={clientSectionRef}>
        <div className="tarjeta-cabecera">
          <h3>Cliente</h3>
          <span className="muted">Obligatorio</span>
          <span className="tarjeta-cabecera-espacio" />
          {modoCompleto ? selectorTipoPersona : null}
        </div>
        <div className="cliente-fila">
          <label>
            Documento
            <select
              onChange={(event) => cambiarTipoDocumento(event.target.value as FacturaDocumentoTipo)}
              value={cliente.documento_tipo}
            >
              <option value="RUC">RUC</option>
              <option value="CI">CI</option>
              <option value="PASAPORTE">Pasaporte</option>
              <option value="CEDULA_EXTRANJERA">Cédula extranjera</option>
              <option value="NO_ESPECIFICADO">No especificado</option>
              <option value="INNOMINADO">Sin nombre</option>
            </select>
          </label>
          <label className="cliente-numero">
            Número
            <span className="campo-con-icono">
              <input
                inputMode={cliente.documento_tipo === "RUC" || cliente.documento_tipo === "CI" ? "numeric" : "text"}
                aria-invalid={clienteTocados.has("documento") && errorCliente("documento") ? true : undefined}
                onBlur={() => {
                  tocarCliente("documento");
                  void tryAutocompleteDnit();
                }}
                readOnly={esInnominado}
                onChange={(event) => {
                  setAvisoDnitCliente(null);
                  setClienteNaturalezaTouched(false);
                  setClienteOrigen(null);
                  setGuardarEnAgenda(true);
                  setCliente((current) => {
                    const nextDocumento = event.target.value;
                    if (nextDocumento === current.documento) {
                      return current;
                    }

                    return {
                      ...current,
                      cliente_id: null,
                      documento: nextDocumento,
                      razon_social: "",
                      direccion: "",
                      telefono: "",
                      email: "",
                      naturaleza: undefined
                    };
                  });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === "Tab") {
                    void tryAutocompleteDnit();
                  }
                }}
                placeholder="Ingresá el número de documento"
                value={cliente.documento}
              />
              {clienteOrigen ? <span className="campo-tilde" title={clienteOrigen === "AGENDA" ? "En tu agenda" : "Del padron de la DNIT"}><Icono nombre="tilde" tamano={16} grosor={2.5} /></span> : null}
            </span>
            {clienteSuggestions.length > 0 ? (
              <div className="suggestion-list">
                {clienteSuggestions.map((suggestion) => (
                  <button
                    key={`${suggestion.source}-${suggestion.cliente_id ?? suggestion.documento}`}
                    onClick={() => applyClienteSuggestion(suggestion)}
                    type="button"
                  >
                    <strong>{suggestion.documento}</strong>
                    <span>{suggestion.razon_social}</span>
                    <small>{suggestion.source === "AGENDA_FACTURADOR" ? "Agenda" : "Sugerencia"}</small>
                  </button>
                ))}
              </div>
            ) : null}
            {errorClienteVisible("documento")}
          </label>
          <label className="cliente-nombre">
            Nombre o razón social
            <input
              aria-invalid={clienteTocados.has("razon_social") && errorCliente("razon_social") ? true : undefined}
              onBlur={() => tocarCliente("razon_social")}
              onChange={(event) => editarCliente({ razon_social: event.target.value })}
              readOnly={esInnominado}
              value={cliente.razon_social}
            />
            {errorClienteVisible("razon_social")}
          </label>
        </div>
        <div className="cliente-estado">
          {clienteSearching || clienteAutocompleting ? (
            <span className="muted">{clienteSearching ? "Buscando cliente..." : "Autocompletando..."}</span>
          ) : textoOrigenCliente ? (
            <span className={clienteOrigen ? "cliente-origen ok" : "cliente-origen"}>
              {clienteOrigen ? <Icono nombre="tilde" tamano={14} grosor={2.5} /> : null}
              {textoOrigenCliente}
            </span>
          ) : !modoCompleto ? (
            <span className="muted">Se completa desde tu agenda o el padron de la DNIT al escribir el documento.</span>
          ) : null}
          {clienteMessage ? <span className={/no se pudo|error|invalid/i.test(clienteMessage) ? "cliente-mensaje error" : "cliente-mensaje"}>{clienteMessage}</span> : null}
        </div>
        <div className="cliente-acciones">
          <button
            aria-expanded={opcionalesAbiertos}
            className="link-action cliente-opcionales"
            onClick={() => setOpcionalesAbiertos((current) => !current)}
            type="button"
          >
            <Icono nombre={opcionalesAbiertos ? "chevron-abajo" : "chevron-derecha"} tamano={14} />
            {modoCompleto ? "Dirección, teléfono y correo (opcionales)" : "Tipo de persona, dirección, teléfono y correo"}
          </button>
          {modoCompleto && !esInnominado ? casillaAgenda : null}
        </div>
        {avisoDnitCliente ? (
          <Aviso tono="atencion">
            {avisoDnitCliente.texto}{" "}
            {avisoDnitCliente.documento ? (
              <button
                className="secondary-action compact"
                onClick={() => {
                  editarCliente({ documento: avisoDnitCliente.documento! });
                  setAvisoDnitCliente(null);
                }}
                type="button"
              >
                Usar {avisoDnitCliente.documento}
              </button>
            ) : null}
          </Aviso>
        ) : null}
        {opcionalesAbiertos || erroresOpcionalesCliente ? camposOpcionales : null}
        {!modoCompleto && !esInnominado ? casillaAgenda : null}
      </section>

      <section className="form-section products-section" aria-label="Productos y servicios" ref={productsSectionRef}>
        <div className="tarjeta-cabecera">
          <h3>Productos y servicios</h3>
          <span className="muted">
            {lineasConDatos.length === 1 ? "1 línea" : `${lineasConDatos.length} líneas`}
            {modoCompleto ? (enMonedaExtranjera ? ` · precios en ${moneda} con hasta 2 decimales` : " · precios en guaranies") : ""}
          </span>
          <span className="tarjeta-cabecera-espacio" />
          {/* SPEC_DESCUENTOS_FACTURA_v0.1 RN-24: descuentos ocultos por defecto. */}
          <button className="ghost-action compact con-icono" onClick={alternarDescuentos} type="button">
            <Icono nombre={hayDescuentos ? "papelera" : mostrarDescuentos ? "ojo-tachado" : "mas"} tamano={14} />{" "}
            {hayDescuentos ? "Quitar descuentos" : mostrarDescuentos ? "Ocultar descuentos" : "Agregar descuento"}
          </button>
          {modoCompleto ? (
            <button className="ghost-action compact con-icono" onClick={agregarLinea} type="button">
              <Icono nombre="buscar" tamano={14} /> Buscar en el catálogo
            </button>
          ) : null}
        </div>

        {modoCompleto ? (
          <GrillaLineas
            catalogSuggestions={catalogSuggestions}
            catalogSearching={catalogSearching}
            catalogSaving={catalogSaving}
            catalogMessage={catalogMessage}
            invalidas={lineasInvalidasIds}
            lines={lines}
            moneda={moneda}
            onAgregar={agregarLinea}
            onAplicarCatalogo={applyCatalogItem}
            onGuardarCatalogo={(line) => void saveQuickCatalogItem(line)}
            onQuitar={removeLine}
            onUpdate={updateLine}
            subtotales={previewSubtotalsByLineId}
            descuentoModo={descuentoModo}
            onCambiarDescuentoModo={setDescuentoModo}
            conDescuento={mostrarDescuentos}
          />
        ) : (
        <div className="sale-list" aria-label="Productos o servicios agregados">
          {visibleLines.length === 0 ? (
            <button className="empty-sale-list" onClick={addLineAndEdit} type="button">
              <strong>+ Agregar producto</strong>
              <span>Descripción, cantidad y precio.</span>
            </button>
          ) : null}
          {visibleLines.map((line, index) => {
            const description = line.descripcion.trim() || line.codigo.trim() || "Producto";
            const quantity = Number(line.cantidad) || 1;
            const price = Number(line.precio_unitario) || 0;
            const subtotal = previewSubtotalsByLineId.get(line.id) ?? quantity * price;
            return (
              <article className={lineasInvalidasIds.has(line.id) ? "sale-item-card line-invalid" : "sale-item-card"} key={line.id}>
                <button className="sale-item-main" onClick={() => editLine(line.id)} type="button">
                  <strong title={description}>{description}</strong>
                  <span>{formatCantidad(quantity)} x {formatMonto(price, moneda)} · {formatIva(line.iva_tipo)}</span>
                  {lineasInvalidasIds.has(line.id) ? (
                    <small className="line-invalid-hint">
                      {motivoLineaInvalida(line, moneda, descuentoModo)}
                    </small>
                  ) : null}
                  <b className="cifra">{formatMonto(subtotal, moneda)}</b>
                </button>
                <button aria-label={`Editar producto ${index + 1}`} className="icon-action" onClick={() => editLine(line.id)} type="button">
                  <Icono nombre="lapiz" />
                </button>
              </article>
            );
          })}
          {visibleLines.length > 0 ? (
            <button className="add-product-action" onClick={addLineAndEdit} type="button">
              + Agregar producto
            </button>
          ) : null}
        </div>
        )}
        {/* SPEC_DESCUENTOS_FACTURA_v0.1 RN-15: descuento sobre el total, en los dos modos (RN-24: solo si se pidio). */}
        {mostrarDescuentos ? <label className="descuento-global">
          Descuento sobre el total ({moneda === "PYG" ? "Gs." : moneda})
          <input
            aria-invalid={errorDescuentoGlobal ? true : undefined}
            className="cifra"
            inputMode="decimal"
            onChange={(event) => setDescuentoGlobal(enMonedaExtranjera ? normalizeDecimalInput(event.target.value) : normalizeIntegerInput(event.target.value))}
            placeholder={enMonedaExtranjera ? "0,00" : "0"}
            value={enMonedaExtranjera ? descuentoGlobal.replace(".", ",") : formatIntegerInput(descuentoGlobal)}
          />
          <small className="field-hint">Se reparte en proporción entre todas las líneas, como lo exige SIFEN.</small>
          {errorDescuentoGlobal ? <small className="campo-error">{errorDescuentoGlobal}</small> : null}
        </label> : null}
      </section>

      {lineSheetOpen && activeLine && !modoCompleto ? (
        <div className="bottom-sheet-backdrop" role="presentation" onClick={closeLineSheet}>
          <section
            aria-label="Agregar producto"
            aria-modal="true"
            className="bottom-sheet"
            ref={lineSheetRef}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="sheet-handle" />
            <div className="sheet-header">
              <h3>{activeLine.descripcion.trim() || activeLine.precio_unitario.trim() ? "Producto" : "Agregar producto"}</h3>
              <button aria-label="Cerrar" className="sheet-close" onClick={closeLineSheet} type="button">
                Cerrar
              </button>
            </div>

            <div className="sheet-grid">
              <label className="sheet-description">
                Descripción
                <input
                  ref={descriptionInputRef}
                  autoFocus
                  onChange={(event) =>
                    updateLine(activeLine.id, { catalogo_item_id: null, descripcion: event.target.value, lockedFromCatalog: false })
                  }
                  placeholder="Ingresá descripción"
                  value={activeLine.descripcion}
                />
              </label>

              <div className="quantity-price-grid">
                <label>
                  Cantidad
                  <div className="quantity-stepper">
                    <button
                      aria-label="Restar cantidad"
                      onClick={() => updateLine(activeLine.id, { cantidad: String(Math.max(1, Number(activeLine.cantidad || 1) - 1)) })}
                      type="button"
                    >
                      -
                    </button>
                    <input
                      aria-label="Cantidad"
                      inputMode="decimal"
                      onChange={(event) => updateLine(activeLine.id, { cantidad: normalizeDecimalInput(event.target.value, 4) })}
                      value={activeLine.cantidad.replace(".", ",")}
                    />
                    <button
                      aria-label="Sumar cantidad"
                      onClick={() => updateLine(activeLine.id, { cantidad: String((Number(activeLine.cantidad) || 0) + 1) })}
                      type="button"
                    >
                      +
                    </button>
                  </div>
                </label>

                <label>
                  Precio{enMonedaExtranjera ? ` (${moneda})` : ""}
                  <input
                    inputMode="decimal"
                    min="0"
                    onChange={(event) =>
                      updateLine(activeLine.id, {
                        catalogo_item_id: null,
                        precio_unitario: enMonedaExtranjera ? normalizeDecimalInput(event.target.value) : normalizeIntegerInput(event.target.value),
                        lockedFromCatalog: false
                      })
                    }
                    placeholder={enMonedaExtranjera ? "0,00" : "0"}
                    value={enMonedaExtranjera ? activeLine.precio_unitario.replace(".", ",") : formatIntegerInput(activeLine.precio_unitario)}
                  />
                  {enMonedaExtranjera ? <small className="field-hint">En {moneda === "USD" ? "dólares" : moneda}, con hasta 2 decimales (centavos).</small> : null}
                </label>

                {/* SPEC_DESCUENTOS_FACTURA_v0.1 RN-14: descuento de la linea con el mismo conmutador de la grilla (RN-24: solo si se pidio). */}
                {mostrarDescuentos ? <label>
                  <span className="descuento-cabecera">
                    Descuento
                    <span className="descuento-modo" role="group" aria-label="Descuento en porcentaje o monto">
                      <button aria-label="Porcentaje" aria-pressed={descuentoModo === "PORCENTAJE"} className={descuentoModo === "PORCENTAJE" ? "active" : ""} onClick={(event) => { event.preventDefault(); setDescuentoModo("PORCENTAJE"); }} type="button">
                        %
                      </button>
                      <button aria-pressed={descuentoModo === "MONTO"} className={descuentoModo === "MONTO" ? "active" : ""} onClick={(event) => { event.preventDefault(); setDescuentoModo("MONTO"); }} type="button">
                        {moneda === "PYG" ? "Gs." : moneda}
                      </button>
                    </span>
                  </span>
                  <input
                    aria-label="Descuento de la línea"
                    inputMode="decimal"
                    onChange={(event) => updateLine(activeLine.id, { descuento_ingresado: normalizeDecimalInput(event.target.value) })}
                    placeholder={descuentoModo === "PORCENTAJE" ? "0 %" : "0"}
                    value={(activeLine.descuento_ingresado ?? "").replace(".", ",")}
                  />
                  {descuentoDeLinea(activeLine, descuentoModo, moneda).error ? (
                    <small className="campo-error">{descuentoDeLinea(activeLine, descuentoModo, moneda).error}</small>
                  ) : null}
                </label> : null}
              </div>

              {catalogSearching[activeLine.id] ? <span className="field-hint">Buscando catálogo...</span> : null}
              {(catalogSuggestions[activeLine.id] ?? []).length > 0 ? (
                <div className="suggestion-list catalog">
                  {(catalogSuggestions[activeLine.id] ?? []).map((item) => (
                    <button key={item.id} onClick={() => applyCatalogItem(activeLine.id, item)} type="button">
                      <strong>{item.codigo}</strong>
                      <span>{item.descripcion}</span>
                      <small>{formatMonto(item.precio_unitario, item.moneda)} · {formatIva(item.iva_tipo)}</small>
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="iva-chip-row" role="group" aria-label="IVA del producto">
                {[
                  { value: "IVA_5" as const, label: "IVA 5%" },
                  { value: "IVA_10" as const, label: "IVA 10%" },
                  { value: "EXENTA" as const, label: "EX" }
                ].map((option) => (
                  <button
                    className={activeLine.iva_tipo === option.value ? "active" : ""}
                    disabled={activeLine.lockedFromCatalog}
                    key={option.value}
                    onClick={() => updateLine(activeLine.id, { catalogo_item_id: null, iva_tipo: option.value, lockedFromCatalog: false })}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <button className="advanced-toggle" onClick={() => setLineCodeOpen((current) => !current)} type="button">
                {lineCodeOpen ? "Ocultar código interno" : "+ Agregar código interno"}
              </button>

              {lineCodeOpen ? (
                <div className="advanced-fields">
                  <label>
                    Código interno
                    <input
                      disabled={activeLine.lockedFromCatalog}
                      onChange={(event) =>
                        updateLine(activeLine.id, { catalogo_item_id: null, codigo: event.target.value, lockedFromCatalog: false })
                      }
                      value={activeLine.codigo}
                    />
                  </label>
                </div>
              ) : null}

              <div className="sheet-total-row">
                <span>Total</span>
                <strong>{formatMonto(previewSubtotalsByLineId.get(activeLine.id) ?? (Number(activeLine.cantidad) || 1) * (Number(activeLine.precio_unitario) || 0), moneda)}</strong>
              </div>

              {activeLine.lockedFromCatalog ? (
                <button
                  className="secondary-action wide"
                  onClick={() => updateLine(activeLine.id, { catalogo_item_id: null, lockedFromCatalog: false })}
                  type="button"
                >
                  Editar como producto nuevo
                </button>
              ) : null}
              {catalogMessage[activeLine.id] ? <p className="inline-message">{catalogMessage[activeLine.id]}</p> : null}
              <div className="catalog-save-choice" role="group" aria-label="Agregar producto y decidir guardado">
                <button
                  className="primary-action save-catalog"
                  disabled={
                    // SPEC_CATALOGO_MONEDA_v0.1 RN-16: disponible en cualquier moneda.
                    catalogSaving[activeLine.id] ||
                    !activeLine.descripcion.trim() ||
                    !cantidadValida(Number(activeLine.cantidad)) ||
                    !precioValidoEnMoneda(Number(activeLine.precio_unitario), moneda) ||
                    Number(activeLine.precio_unitario) <= 0
                  }
                  onClick={() => void confirmLine(activeLine, true)}
                  type="button"
                >
                  {catalogSaving[activeLine.id] ? "Guardando..." : "AGREGAR Y GUARDAR"}
                </button>
                <button
                  className="secondary-action"
                  disabled={
                    catalogSaving[activeLine.id] ||
                    !activeLine.descripcion.trim() ||
                    !cantidadValida(Number(activeLine.cantidad)) ||
                    !precioValido(Number(activeLine.precio_unitario), moneda) ||
                    Number(activeLine.precio_unitario) <= 0
                  }
                  onClick={() => void confirmLine(activeLine, false)}
                  type="button"
                >
                  AGREGAR Y NO GUARDAR
                </button>
              </div>
              {lineaTieneDatos(activeLine) ? (
                <button className="link-action quitar-producto" onClick={() => removeLine(activeLine.id)} type="button">
                  <Icono nombre="papelera" tamano={14} /> Quitar producto
                </button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}

      {/* SPEC_UX_NUEVA_FACTURA_v0.1, B.5 y D.5: totales; en modo completo, tarjeta fija a la derecha; en simple, pie fijo. */}
      {modoCompleto ? (
        <aside className="totals-section totales-fija" aria-live="polite" ref={sendSectionRef}>
          <h3>Totales en {etiquetaMoneda === "Gs." ? "Gs." : moneda}</h3>
          <div className="totals-grid">
            <TotalRow label="Subtotal" moneda={moneda} value={preview?.totals.subtotal ?? 0} />
            {/* SPEC_DESCUENTOS_FACTURA_v0.1 RN-18c: una sola fila "Descuento (x %)". */}
            {preview ? <FilaDescuento moneda={moneda} totals={preview.totals} /> : null}
            <TotalRow label="Total sin IVA" moneda={moneda} value={preview?.totals.total_sin_iva ?? 0} />
            <div className="totales-iva">
              <TotalRow label="IVA 5%" moneda={moneda} value={preview?.totals.iva_5 ?? 0} />
              <TotalRow label="IVA 10%" moneda={moneda} value={preview?.totals.iva_10 ?? 0} />
              <TotalRow label="Total IVA" moneda={moneda} value={preview?.totals.total_iva ?? 0} />
            </div>
            <TotalRow strong label="Total a pagar" moneda={moneda} value={preview?.totals.total ?? 0} />
          </div>
          {equivalenteGs !== null || primeraInvalida >= 0 ? (
            <p className="muted totales-nota">
              {equivalenteGs !== null ? `equivale a ${formatGuaranies(equivalenteGs)} al cambio de ${tipoCambio.replace(".", ",")}` : ""}
              {equivalenteGs !== null && primeraInvalida >= 0 ? " · " : ""}
              {primeraInvalida >= 0 ? `la línea ${primeraInvalida + 1} no se cuenta` : ""}
            </p>
          ) : null}
          <button className="primary-action wide crear-factura" disabled={crearDeshabilitado} onClick={() => void emitFactura()} type="button">
            {textoCrear}
          </button>
          {previewError || emissionError ? (
            <p className="motivo-bloqueo error" role="alert"><Icono nombre="alerta" tamano={14} /><span>{previewError ?? emissionError}</span></p>
          ) : motivoBloqueo ? (
            <p className="motivo-bloqueo"><Icono nombre="alerta" tamano={14} /><span>{motivoBloqueo}</span></p>
          ) : null}
          <p className="muted totales-pie">Al crear, la factura se envia a SIFEN y se verifica sola. Vas a poder enviarla por WhatsApp o correo desde la pantalla siguiente.</p>
        </aside>
      ) : (
        <>
          <section className="totals-section" aria-live="polite" ref={sendSectionRef}>
            <div className="totals-grid">
              <TotalRow label="Subtotal" moneda={moneda} value={preview?.totals.subtotal ?? 0} />
              {preview ? <FilaDescuento moneda={moneda} totals={preview.totals} /> : null}
              <TotalRow label="Total sin IVA" moneda={moneda} value={preview?.totals.total_sin_iva ?? 0} />
              <div className="totales-iva">
                <TotalRow label="IVA 5%" moneda={moneda} value={preview?.totals.iva_5 ?? 0} />
                <TotalRow label="IVA 10%" moneda={moneda} value={preview?.totals.iva_10 ?? 0} />
                <TotalRow label="Total IVA" moneda={moneda} value={preview?.totals.total_iva ?? 0} />
              </div>
            </div>
            {equivalenteGs !== null ? <p className="muted totales-nota">equivale a {formatGuaranies(equivalenteGs)} al cambio de {tipoCambio.replace(".", ",")}</p> : null}
            {previewError ? <p className="form-error">{previewError}</p> : null}
            <button className="secondary-action wide" disabled={previewing} onClick={() => void runPreview()} type="button">
              {previewing ? "Calculando..." : "Calcular"}
            </button>
          </section>
          <div className="pie-crear">
            <TotalRow strong label="Total a pagar" moneda={moneda} value={preview?.totals.total ?? 0} />
            <button className="primary-action wide crear-factura" disabled={crearDeshabilitado} onClick={() => void emitFactura()} type="button">
              {textoCrear}
            </button>
            {emissionError ? (
              <p className="motivo-bloqueo error" role="alert"><Icono nombre="alerta" tamano={14} /><span>{emissionError}</span></p>
            ) : motivoBloqueo ? (
              <p className="motivo-bloqueo"><Icono nombre="alerta" tamano={14} /><span>{motivoBloqueo}</span></p>
            ) : null}
          </div>
        </>
      )}
    </>
  );

  return (
    <section
      className={[modoCompleto ? "invoice-editor completo" : "invoice-editor", emittedDocumento ? "con-resultado" : ""].filter(Boolean).join(" ")}
      aria-labelledby="invoice-title"
    >
      {/* SPEC_UX_NUEVA_FACTURA_v0.1, C.1 y D-4: el resultado reemplaza al formulario. */}
      {emittedDocumento ? (
        <ResultadoEmision
          context={context}
          deliveryLink={deliveryLink}
          deliveryLoading={deliveryLoading}
          deliveryMessage={deliveryMessage}
          documento={emittedDocumento}
          emailStatus={emailStatus}
          emitting={emitting}
          onCompartir={() => void sharePublicLink()}
          onCopiar={() => void copyPublicLink()}
          onCrearNueva={createNuevaFactura}
          onRegenerarEnlace={() => void loadDeliveryData(emittedDocumento.id, true)}
          onReintentar={() => void retryEmittedDocumento()}
          onVerDocumentos={onVerDocumentos}
          onVerificar={() => void refreshEmittedDocumento()}
          setWhatsappPhone={setWhatsappPhone}
          whatsappPhone={whatsappPhone}
        />
      ) : (
        formulario
      )}
    </section>
  );
}

/** SPEC_EDITOR_FACTURA_PC_v0.1, D-1: preferencia del modo del editor en este navegador. */
const CLAVE_MODO_EDITOR = "fs.editor.modo";

function leerModoEditor(): "simple" | "completo" {
  try {
    return window.localStorage.getItem(CLAVE_MODO_EDITOR) === "simple" ? "simple" : "completo";
  } catch {
    return "completo";
  }
}

function guardarModoEditor(modo: "simple" | "completo"): void {
  try {
    window.localStorage.setItem(CLAVE_MODO_EDITOR, modo);
  } catch {
    // Sin almacenamiento (ventana privada): el modo vale solo para esta pantalla.
  }
}

function lineaTieneDatos(line: InvoiceLineDraft): boolean {
  return Boolean(line.descripcion.trim() || line.codigo.trim() || line.precio_unitario.trim());
}

function motivoLineaInvalida(line: InvoiceLineDraft, moneda: string, modoDescuento: ModoDescuento = "PORCENTAJE"): string {
  if (!line.descripcion.trim()) return "Falta la descripción";
  if (!cantidadValida(Number(line.cantidad))) return "Cantidad no válida (hasta 4 decimales)";
  if (!line.precio_unitario.trim() || Number(line.precio_unitario) <= 0) return "Falta el precio";
  if (!precioValido(Number(line.precio_unitario), moneda)) {
    return moneda === "PYG" ? "Precio con decimales: no válido en guaraníes" : "Precio con más de 2 decimales";
  }
  const descuento = descuentoDeLinea(line, modoDescuento, moneda);
  if (descuento.error) return descuento.error;
  return "Línea no válida";
}

/**
 * SPEC_EDITOR_FACTURA_PC_v0.1: grilla de lineas del modo completo. Edita el mismo estado que el modo simple
 * (RN-02); la ultima fila vacia sirve para agregar. Enter pasa a la descripcion de la fila siguiente (RN-06).
 */
/** SPEC_CATALOGO_MONEDA_v0.1 RN-05 y RN-16: entero en PYG; hasta 2 decimales en otra moneda. */
function precioValidoEnMoneda(precio: number, monedaPrecio: string): boolean {
  if (!Number.isFinite(precio) || precio < 0) return false;
  if (monedaPrecio === "PYG") return Number.isInteger(precio);
  return Math.abs(precio * 100 - Math.round(precio * 100)) < 1e-6;
}

function GrillaLineas({
  lines,
  moneda,
  invalidas,
  subtotales,
  catalogSuggestions,
  catalogSearching,
  catalogSaving,
  catalogMessage,
  onAgregar,
  onUpdate,
  onQuitar,
  onAplicarCatalogo,
  onGuardarCatalogo,
  descuentoModo,
  onCambiarDescuentoModo,
  conDescuento
}: {
  lines: InvoiceLineDraft[];
  moneda: MonedaFactura;
  descuentoModo: ModoDescuento;
  onCambiarDescuentoModo: (modo: ModoDescuento) => void;
  /** RN-24: la columna "Descuento" solo cuando el operador la pidio o hay descuentos cargados. */
  conDescuento: boolean;
  invalidas: Set<string>;
  subtotales: Map<string, number>;
  catalogSuggestions: Record<string, CatalogoItem[]>;
  catalogSearching: Record<string, boolean>;
  catalogSaving: Record<string, boolean>;
  catalogMessage: Record<string, string | null>;
  onAgregar: () => void;
  onUpdate: (lineId: string, patch: Partial<InvoiceLineDraft>) => void;
  onQuitar: (lineId: string) => void;
  onAplicarCatalogo: (lineId: string, item: CatalogoItem) => void;
  onGuardarCatalogo: (line: InvoiceLineDraft) => void;
}) {
  const [filaConFoco, setFilaConFoco] = useState<string | null>(null);
  const [confirmar, dialogoConfirmar] = useConfirmar();
  const enMonedaExtranjera = moneda !== "PYG";

  function enfocarDescripcion(indice: number) {
    window.setTimeout(() => {
      document.querySelector<HTMLInputElement>(`[data-grilla-fila="${indice}"] input[data-celda="descripcion"]`)?.focus();
    }, 0);
  }

  function alPresionar(event: KeyboardEvent<HTMLElement>, indice: number) {
    if (event.key === "Enter") {
      event.preventDefault();
      enfocarDescripcion(indice + 1);
    }
  }

  async function quitar(line: InvoiceLineDraft) {
    if (lineaTieneDatos(line) && !(await confirmar({ titulo: "¿Quitar esta línea?", textoConfirmar: "Quitar" }))) return;
    onQuitar(line.id);
  }

  return (
    <div className="grilla-lineas-wrap">
      <table className="grilla-lineas" aria-label="Productos o servicios">
        <thead>
          <tr>
            <th className="col-numero">#</th>
            <th className="col-codigo">Código</th>
            <th className="col-descripcion">Descripción</th>
            <th className="col-cantidad">Cantidad</th>
            <th className="col-precio">Precio ({moneda === "PYG" ? "Gs." : moneda})</th>
            {/* SPEC_DESCUENTOS_FACTURA_v0.1 RN-13: conmutador % / moneda para toda la grilla (RN-24: solo si se pidio). */}
            {conDescuento ? <th className="col-descuento">
              <span className="descuento-cabecera">
                Descuento
                <span className="descuento-modo" role="group" aria-label="Descuento en porcentaje o monto">
                  <button aria-label="Porcentaje" aria-pressed={descuentoModo === "PORCENTAJE"} className={descuentoModo === "PORCENTAJE" ? "active" : ""} onClick={() => onCambiarDescuentoModo("PORCENTAJE")} type="button">
                    %
                  </button>
                  <button aria-pressed={descuentoModo === "MONTO"} className={descuentoModo === "MONTO" ? "active" : ""} onClick={() => onCambiarDescuentoModo("MONTO")} type="button">
                    {moneda === "PYG" ? "Gs." : moneda}
                  </button>
                </span>
              </span>
            </th> : null}
            <th className="col-iva">IVA</th>
            <th className="col-subtotal">Subtotal</th>
            <th className="col-acciones"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, indice) => {
            const conDatos = lineaTieneDatos(line);
            const invalida = invalidas.has(line.id);
            const cantidad = Number(line.cantidad) || 0;
            const precio = Number(line.precio_unitario) || 0;
            // RN-17: el subtotal de la linea es el neto del descuento por unidad (sin el prorrateo del global).
            const descuentoLinea = descuentoDeLinea(line, descuentoModo, moneda);
            const precioNeto = precio - (descuentoLinea.error ? 0 : descuentoLinea.monto);
            const subtotal =
              descuentoLinea.monto > 0 || !subtotales.has(line.id)
                ? enMonedaExtranjera
                  ? Math.round(cantidad * precioNeto * 100) / 100
                  : Math.round(cantidad * precioNeto)
                : subtotales.get(line.id)!;
            const sugerencias = filaConFoco === line.id ? catalogSuggestions[line.id] ?? [] : [];
            const puedeGuardar =
              !line.catalogo_item_id && !line.lockedFromCatalog && conDatos && !invalida && precioValidoEnMoneda(precio, moneda);
            const claseFila = [invalida ? "fila-invalida" : "", !conDatos ? "fila-nueva" : ""].filter(Boolean).join(" ") || undefined;
            return (
              <React.Fragment key={line.id}>
              <tr className={claseFila} data-grilla-fila={indice}>
                <td className="col-numero">{indice + 1}</td>
                <td className="col-codigo">
                  <input
                    aria-label={`Código, línea ${indice + 1}`}
                    onChange={(event) => onUpdate(line.id, { codigo: event.target.value, catalogo_item_id: null, lockedFromCatalog: false })}
                    onFocus={() => setFilaConFoco(line.id)}
                    onKeyDown={(event) => alPresionar(event, indice)}
                    value={line.codigo}
                  />
                </td>
                <td className="col-descripcion">
                  <input
                    aria-label={`Descripción, línea ${indice + 1}`}
                    data-celda="descripcion"
                    onBlur={() => window.setTimeout(() => setFilaConFoco((actual) => (actual === line.id ? null : actual)), 200)}
                    onChange={(event) => onUpdate(line.id, { descripcion: event.target.value, catalogo_item_id: null, lockedFromCatalog: false })}
                    onFocus={() => setFilaConFoco(line.id)}
                    onKeyDown={(event) => alPresionar(event, indice)}
                    placeholder={conDatos ? undefined : "Escribí o buscá en el catálogo"}
                    value={line.descripcion}
                  />
                  {sugerencias.length > 0 ? (
                    <ul className="grilla-sugerencias" role="listbox" aria-label="Catálogo">
                      {sugerencias.map((item) => (
                        <li key={item.id}>
                          <button
                            onMouseDown={(event) => {
                              event.preventDefault();
                              onAplicarCatalogo(line.id, item);
                              setFilaConFoco(null);
                            }}
                            type="button"
                          >
                            {item.codigo ? <small>{item.codigo}</small> : null} {item.descripcion}
                            <small> · {formatMonto(item.precio_unitario, item.moneda)}</small>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {catalogSearching[line.id] && filaConFoco === line.id ? <small className="field-hint">Buscando…</small> : null}
                  {catalogMessage[line.id] ? <small className="field-hint">{catalogMessage[line.id]}</small> : null}
                </td>
                <td className="col-cantidad">
                  <input
                    aria-label={`Cantidad, línea ${indice + 1}`}
                    className="cifra"
                    inputMode="decimal"
                    onChange={(event) => onUpdate(line.id, { cantidad: normalizeDecimalInput(event.target.value, 4) })}
                    onKeyDown={(event) => alPresionar(event, indice)}
                    value={line.cantidad.replace(".", ",")}
                  />
                </td>
                <td className="col-precio">
                  <input
                    aria-invalid={invalida && conDatos ? true : undefined}
                    aria-label={`Precio, línea ${indice + 1}`}
                    className="cifra"
                    disabled={line.lockedFromCatalog}
                    inputMode={enMonedaExtranjera ? "decimal" : "numeric"}
                    onChange={(event) =>
                      onUpdate(line.id, {
                        precio_unitario: enMonedaExtranjera ? normalizeDecimalInput(event.target.value) : normalizeIntegerInput(event.target.value)
                      })
                    }
                    onKeyDown={(event) => alPresionar(event, indice)}
                    value={enMonedaExtranjera ? line.precio_unitario.replace(".", ",") : formatIntegerInput(line.precio_unitario)}
                  />
                </td>
                {conDescuento ? <td className="col-descuento">
                  <input
                    aria-invalid={descuentoLinea.error ? true : undefined}
                    aria-label={`Descuento, línea ${indice + 1}`}
                    className="cifra"
                    inputMode="decimal"
                    onChange={(event) => onUpdate(line.id, { descuento_ingresado: normalizeDecimalInput(event.target.value) })}
                    onKeyDown={(event) => alPresionar(event, indice)}
                    placeholder={descuentoModo === "PORCENTAJE" ? "0 %" : "0"}
                    value={(line.descuento_ingresado ?? "").replace(".", ",")}
                  />
                </td> : null}
                <td className="col-iva">
                  <select
                    aria-label={`IVA, línea ${indice + 1}`}
                    disabled={line.lockedFromCatalog}
                    onChange={(event) => onUpdate(line.id, { iva_tipo: event.target.value as TipoIva })}
                    onKeyDown={(event) => alPresionar(event, indice)}
                    value={line.iva_tipo}
                  >
                    <option value="IVA_10">10%</option>
                    <option value="IVA_5">5%</option>
                    <option value="EXENTA">Exenta</option>
                  </select>
                </td>
                <td className="col-subtotal cifra">{conDatos && !invalida ? formatMonto(subtotal, moneda).replace(/^(Gs\.|[A-Z]{3}) /, "") : "—"}</td>
                <td className="col-acciones">
                  {conDatos ? (
                    <div className="grilla-acciones">
                      {puedeGuardar ? (
                        <button
                          aria-label={`Guardar en catálogo, línea ${indice + 1}`}
                          className="icon-action grilla-icono"
                          disabled={catalogSaving[line.id]}
                          onClick={() => onGuardarCatalogo(line)}
                          title="Guardar en catálogo"
                          type="button"
                        >
                          {catalogSaving[line.id] ? "…" : <Icono nombre="guardar" tamano={16} />}
                        </button>
                      ) : null}
                      <button aria-label={`Quitar línea ${indice + 1}`} className="icon-action grilla-icono" onClick={() => quitar(line)} title="Quitar" type="button">
                        <Icono nombre="papelera" tamano={16} />
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
              {invalida ? (
                <tr className="fila-motivo" data-grilla-motivo={indice}>
                  <td colSpan={conDescuento ? 8 : 7}>
                    <Icono nombre="alerta" tamano={14} /> {motivoLineaInvalida(line, moneda, descuentoModo)}
                  </td>
                </tr>
              ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      <div className="grilla-pie">
        <button className="ghost-action compact con-icono" onClick={onAgregar} type="button">
          <Icono nombre="mas" tamano={14} grosor={2.5} /> Agregar línea
        </button>
        <span className="muted">Enter en la última celda agrega una fila · Supr quita la fila</span>
        <span className="tarjeta-cabecera-espacio" />
      </div>
      {dialogoConfirmar}
    </div>
  );
}

function createInvoiceLine(): InvoiceLineDraft {
  return {
    id: crypto.randomUUID(),
    catalogo_item_id: null,
    codigo: "",
    descripcion: "",
    cantidad: "1",
    precio_unitario: "",
    iva_tipo: "IVA_10",
    lockedFromCatalog: false
  };
}

function createIdempotencyKey(): string {
  return `ui-${Date.now()}-${crypto.randomUUID()}`;
}

// SPEC_NOTA_CREDITO_TRABADA_v0.1, RN-01: la clave de la nota de credito la deriva el servidor a partir de la
// factura y el intento. Reemplaza la clave por factura en memoria de la pagina (SPEC_CONTRATO_FE_SOBRECARGA RN-05).

/** SPEC_MONEDA_EXTRANJERA_v0.1, D-4: el selector ofrece Guarani y Dolar; la API sigue aceptando EUR y BRL. */
const MONEDAS_FACTURA: Array<{ codigo: MonedaFactura; nombre: string }> = [
  { codigo: "PYG", nombre: "Guaraní" },
  { codigo: "USD", nombre: "Dólar estadounidense" }
];

/** RN-02: guaranies enteros; otra moneda hasta 2 decimales. */
function precioValido(valor: number, moneda: string): boolean {
  if (!Number.isFinite(valor)) return false;
  if (moneda === "PYG") return Number.isInteger(valor);
  return Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-6;
}

/** SPEC_DESCUENTOS_FACTURA_v0.1 RN-13: el conmutador de la grilla vale para todas las lineas. */
type ModoDescuento = "PORCENTAJE" | "MONTO";

/**
 * RN-13 y RN-16: descuento por unidad de la linea a partir de lo escrito. Devuelve el monto (0 sin descuento) o un
 * mensaje de error. En porcentaje: hasta 2 decimales y menor que 100; el monto se redondea a la moneda.
 */
function descuentoDeLinea(line: InvoiceLineDraft, modo: ModoDescuento, moneda: string): { monto: number; error: string | null } {
  const texto = (line.descuento_ingresado ?? "").trim().replace(",", ".");
  if (!texto || Number(texto) === 0) return { monto: 0, error: null };
  const valor = Number(texto);
  if (!Number.isFinite(valor) || valor < 0) return { monto: 0, error: "Descuento no válido" };
  const precio = Number(line.precio_unitario);
  let monto = valor;
  if (modo === "PORCENTAJE") {
    if (valor >= 100 || Math.abs(valor * 100 - Math.round(valor * 100)) > 1e-6) return { monto: 0, error: "El porcentaje va de 0 a 99,99" };
    monto = moneda === "PYG" ? Math.round((precio * valor) / 100) : Math.round(precio * valor) / 100;
  } else if (!precioValido(valor, moneda)) {
    return { monto: 0, error: moneda === "PYG" ? "En guaraníes, el descuento va sin decimales" : "El descuento admite hasta 2 decimales" };
  }
  if (precio > 0 && monto >= precio) return { monto, error: "El descuento tiene que ser menor que el precio" };
  return { monto, error: null };
}

function getOperationViewHint(value: OperationView): string {
  const hints: Record<OperationView, string> = {
    status: "Estado del facturador",
    invoice: "Crear factura electrónica",
    clients: "Agenda de contactos",
    "credit-note": "Devolución total o parcial de una factura aprobada",
    remision: "Traslado de mercadería",
    catalog: "Productos y servicios",
    documents: "Facturas y notas emitidas",
    notas: "Presupuestos y pedidos (no van a SIFEN)",
    recibos: "Cobros y recibos de dinero"
  };
  return hints[value];
}

function clearSession(setAccessToken: (token: string | null) => void) {
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  setAccessToken(null);
}

function calcularEstadoVisualNota(nota: Pick<NotaListItem, "estado" | "estado_comercial" | "valido_hasta">): NotaEstadoVisual {
  if (nota.estado === "BORRADOR") return "BORRADOR";
  if (nota.estado_comercial === "ACEPTADO") return "ACEPTADO";
  if (nota.estado_comercial === "RECHAZADO") return "RECHAZADO";
  if (nota.valido_hasta) {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    if (new Date(nota.valido_hasta) < hoy) return "VENCIDO";
  }
  return "PENDIENTE";
}

const ESTADO_VISUAL_LABEL: Record<NotaEstadoVisual, string> = {
  BORRADOR: "Borrador", PENDIENTE: "Pendiente", VENCIDO: "Vencido", ACEPTADO: "Aceptado", RECHAZADO: "Rechazado",
};
const ESTADO_VISUAL_CLASS: Record<NotaEstadoVisual, string> = {
  BORRADOR: "status-pill draft", PENDIENTE: "status-pill pending", VENCIDO: "status-pill vencido",
  ACEPTADO: "status-pill ready", RECHAZADO: "status-pill rechazado",
};

function createNotaFila(tipo: NotaFilaTipo): NotaFilaDraft {
  return { _id: crypto.randomUUID(), fila_tipo: tipo, descripcion: "", cantidad: "1", precio_unitario: "", catalog_item_id: null, catalog_iva_tipo: null };
}

// ─── Componente NotasView ──────────────────────────────────────────────────────

function NotasView({
  onBack,
  onConvertirEnFactura,
  numeracionDelCliente = false,
}: {
  onBack: () => void;
  onConvertirEnFactura: (draft: InvoiceInitialDraft) => void;
  numeracionDelCliente?: boolean;
}) {
  const api = useApi();
  type SubView = "list" | "form" | "detail";
  const [subView, setSubView] = useState<SubView>("list");

  // Listado
  const [notas, setNotas] = useState<NotaListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState<NotaTipo>("PRESUPUESTO");
  const [busqueda, setBusqueda] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<NotaListItem | null>(null);
  const [selectedNota, setSelectedNota] = useState<NotaListItem | null>(null);
  const [selectedNotaFull, setSelectedNotaFull] = useState<NotaConItems | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // Formulario — general
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTipo, setFormTipo] = useState<NotaTipo>("PRESUPUESTO");
  const [formValidoHasta, setFormValidoHasta] = useState("");
  const [formObservaciones, setFormObservaciones] = useState("");
  const [saving, setSaving] = useState(false);
  const [estadoComercialLoading, setEstadoComercialLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Post-emisión
  const [notaPublicUrl, setNotaPublicUrl] = useState<string | null>(null);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);
  const emissionResultRef = useRef<HTMLElement | null>(null);

  // Formulario — cliente
  const [cliente, setCliente] = useState<NotaClienteDraft>({ documento_tipo: "RUC", documento: "", nombre: "", cliente_id: null });
  const [clienteAutocompleting, setClienteAutocompleting] = useState(false);
  const [clienteSearching, setClienteSearching] = useState(false);
  const [clienteMessage, setClienteMessage] = useState<string | null>(null);
  const [clienteSuggestions, setClienteSuggestions] = useState<ClienteSearchResult[]>([]);

  // Formulario — filas
  const [formFilas, setFormFilas] = useState<NotaFilaDraft[]>([]);
  // SPEC_MULTIPERFIL_USUARIO_v0.1 RN-06
  useBorradorSinEmitir(
    "presupuesto",
    () => subView === "form" && Boolean(cliente.nombre.trim() || formObservaciones.trim() || formFilas.some((fila) => fila.descripcion.trim()))
  );
  const [activeFilaId, setActiveFilaId] = useState<string | null>(null);
  const [filaSheetOpen, setFilaSheetOpen] = useState(false);

  // Catálogo por fila
  const [catalogSuggestions, setCatalogSuggestions] = useState<Record<string, CatalogoItem[]>>({});
  const [catalogMessage, setCatalogMessage] = useState<Record<string, string | null>>({});
  const [catalogSaving, setCatalogSaving] = useState<Record<string, boolean>>({});
  const [catalogSearching, setCatalogSearching] = useState<Record<string, boolean>>({});

  // Derivado
  const activeFila = formFilas.find(f => f._id === activeFilaId) ?? null;
  const activeFilaDescripcion = activeFila?.descripcion ?? "";

  // ── Effects ──

  useEffect(() => {
    if (subView === "list") void loadNotas();
  }, [subView, filtroTipo]);

  // Cerrar menu de tarjeta al hacer click fuera
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = () => setMenuOpenId(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [menuOpenId]);

  // Búsqueda de agenda al tipear documento
  useEffect(() => {
    const q = cliente.documento.trim();
    if (q.length < 2) { setClienteSuggestions([]); return; }
    const t = window.setTimeout(async () => {
      setClienteSearching(true);
      try {
        const r = await api.get<{ items: ClienteSearchResult[] }>(`/clientes/search?q=${encodeURIComponent(q)}&limit=5`);
        setClienteSuggestions(r.items);
      } catch { setClienteSuggestions([]); }
      finally { setClienteSearching(false); }
    }, 300);
    return () => window.clearTimeout(t);
  }, [api, cliente.documento]);

  // Búsqueda de catálogo al tipear en fila ITEM activa
  useEffect(() => {
    if (!activeFilaId || !activeFila || activeFila.fila_tipo !== "ITEM") return;
    const q = activeFilaDescripcion.trim();
    if (q.length < 2) { setCatalogSuggestions(c => ({ ...c, [activeFilaId]: [] })); return; }
    const t = window.setTimeout(async () => {
      setCatalogSearching(c => ({ ...c, [activeFilaId]: true }));
      try {
        const r = await api.get<{ items: CatalogoItem[] }>(`/catalogo/items/search?q=${encodeURIComponent(q)}&limit=5`);
        setCatalogSuggestions(c => ({ ...c, [activeFilaId]: r.items }));
      } catch { setCatalogSuggestions(c => ({ ...c, [activeFilaId]: [] })); }
      finally { setCatalogSearching(c => ({ ...c, [activeFilaId]: false })); }
    }, 300);
    return () => window.clearTimeout(t);
  }, [api, activeFilaId, activeFilaDescripcion]);

  // ── Handlers ──

  async function loadNotas() {
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams({ limit: "100", offset: "0", tipo: filtroTipo });
      const r = await api.get<{ items: NotaListItem[]; total: number }>(`/notas?${p.toString()}`);
      setNotas(r.items);
      setTotalCount(r.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar.");
    } finally { setLoading(false); }
  }

  function resetForm() {
    setEditingId(null);
    setFormTipo(filtroTipo);
    setFormValidoHasta("");
    setFormObservaciones("");
    setCliente({ documento_tipo: "RUC", documento: "", nombre: "", cliente_id: null });
    setClienteMessage(null);
    setClienteSuggestions([]);
    setFormFilas([]);
    setActiveFilaId(null);
    setFilaSheetOpen(false);
    setCatalogSuggestions({});
    setCatalogMessage({});
    setCatalogSaving({});
    setCatalogSearching({});
    setError(null);
    setMessage(null);
    setNotaPublicUrl(null);
    setDeliveryMessage(null);
    setWhatsappPhone("");
  }

  function openCreate() {
    resetForm();
    const d = new Date();
    d.setDate(d.getDate() + 30);
    setFormValidoHasta(d.toISOString().slice(0, 10));
    setSubView("form");
  }

  async function openEdit(nota: NotaListItem) {
    resetForm();
    setSaving(true);
    try {
      const full = await api.get<NotaConItems>(`/notas/${nota.id}`);
      setEditingId(full.id);
      setFormTipo(full.tipo);
      setFormValidoHasta(full.valido_hasta ?? "");
      setFormObservaciones(full.observaciones ?? "");
      setCliente({ documento_tipo: "RUC", documento: full.cliente_ruc ?? "", nombre: full.cliente_nombre, cliente_id: null });
      setFormFilas(full.items.map(it => ({
        _id: crypto.randomUUID(),
        fila_tipo: it.fila_tipo,
        descripcion: it.descripcion,
        cantidad: it.cantidad != null ? String(it.cantidad) : "1",
        precio_unitario: it.precio_unitario != null ? String(it.precio_unitario) : "",
        catalog_item_id: it.catalog_item_id,
        catalog_iva_tipo: it.catalog_iva_tipo,
      })));
      setSubView("form");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar.");
    } finally { setSaving(false); }
  }

  async function openDetail(nota: NotaListItem) {
    setSelectedNota(nota);
    setSelectedNotaFull(null);
    setNotaPublicUrl(nota.verification_token ? `${window.location.origin}/verificar/nota/${nota.verification_token}` : null);
    setDeliveryMessage(null);
    setWhatsappPhone("");
    setSubView("detail");
    try {
      const full = await api.get<NotaConItems>(`/notas/${nota.id}`);
      setSelectedNotaFull(full);
      setSelectedNota(full);
    } catch { /* usar datos del listado si falla */ }
  }

  async function handleDuplicar(nota: NotaListItem) {
    try {
      const nuevo = await api.request<NotaListItem>(`/notas/${nota.id}/duplicar`, { method: "POST" });
      setMessage(`Borrador creado a partir de ${nota.tipo === "PRESUPUESTO" ? "presupuesto" : "pedido"} N° ${numeroCorrelativo(nota.numero ?? "")}.`);
      void openEdit(nuevo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo duplicar.");
    }
  }

  async function handleEstadoComercial(id: string, estado: NotaEstadoComercial) {
    setEstadoComercialLoading(true);
    try {
      const updated = await api.request<NotaListItem>(`/notas/${id}/estado-comercial`, {
        method: "PATCH",
        body: JSON.stringify({ estado_comercial: estado }),
      });
      setSelectedNota(updated);
      setNotas(prev => prev.map(n => n.id === id ? updated : n));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar el estado.");
    } finally { setEstadoComercialLoading(false); }
  }

  function handleConvertirEnFactura(nota: NotaConItems) {
    const items = nota.items
      .filter(f => f.fila_tipo === "ITEM" && f.precio_unitario != null && f.precio_unitario > 0)
      .map(f => ({
        descripcion: f.descripcion,
        cantidad: f.cantidad ?? 1,
        precio_unitario: f.precio_unitario!,
        iva_tipo: (f.catalog_iva_tipo ?? "IVA_10") as TipoIva,
        catalog_item_id: f.catalog_item_id,
      }));
    onConvertirEnFactura({
      cliente_nombre: nota.cliente_nombre,
      cliente_ruc: nota.cliente_ruc,
      items,
    });
  }

  async function tryAutocompleteDnit() {
    if (cliente.documento_tipo !== "RUC" && cliente.documento_tipo !== "CI") return;
    const doc = cliente.documento.trim();
    if (doc.length < 3) return;
    if (clienteSuggestions.some(s => normalizeDocKey(s.documento) === normalizeDocKey(doc))) return;
    setClienteAutocompleting(true);
    try {
      const r = await api.get<DnitAutocompleteResponse>(
        `/clientes/dnit/autocomplete?documento_tipo=${cliente.documento_tipo}&documento=${encodeURIComponent(doc)}`
      );
      if (r.found && r.cliente) {
        setCliente(c => ({ ...c, nombre: r.cliente?.razon_social ?? c.nombre }));
        setClienteMessage("Nombre autocompletado desde SET/DNIT.");
      }
    } catch { /* no interrumpir flujo */ }
    finally { setClienteAutocompleting(false); }
  }

  function applyClienteSuggestion(s: ClienteSearchResult) {
    setCliente({
      documento_tipo: (s.documento_tipo === "RUC" || s.documento_tipo === "CI") ? s.documento_tipo : "RUC",
      documento: s.documento,
      nombre: s.razon_social,
      cliente_id: s.cliente_id,
    });
    setClienteMessage(s.source === "AGENDA_FACTURADOR" ? "Cliente seleccionado de la agenda." : "Cliente encontrado.");
    setClienteSuggestions([]);
  }

  async function saveClienteRapido() {
    if (!cliente.documento.trim() || !cliente.nombre.trim()) return;
    try {
      const payload = { documento_tipo: cliente.documento_tipo, documento: cliente.documento.trim(), razon_social: cliente.nombre.trim(), direccion: null, telefono: null, email: null };
      const saved = cliente.cliente_id
        ? await api.request<ClienteResponse>(`/clientes/${cliente.cliente_id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await api.post<ClienteResponse>("/clientes", payload);
      setCliente(c => ({ ...c, cliente_id: saved.cliente_id }));
      setClienteMessage(cliente.cliente_id ? "Cliente actualizado." : "Cliente guardado en agenda.");
    } catch (e) { setClienteMessage(e instanceof Error ? e.message : "No se pudo guardar."); }
  }

  function addFila(tipo: NotaFilaTipo) {
    const fila = createNotaFila(tipo);
    setFormFilas(prev => [...prev, fila]);
    if (tipo === "ITEM") { setActiveFilaId(fila._id); setFilaSheetOpen(true); }
  }

  function removeFila(id: string) {
    setFormFilas(prev => prev.filter(f => f._id !== id));
    if (activeFilaId === id) { setActiveFilaId(null); setFilaSheetOpen(false); }
  }

  function moveFila(id: string, dir: -1 | 1) {
    setFormFilas(prev => {
      const idx = prev.findIndex(f => f._id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return next;
    });
  }

  function updateFila(id: string, patch: Partial<NotaFilaDraft>) {
    setFormFilas(prev => prev.map(f => f._id === id ? { ...f, ...patch } : f));
  }

  function applyCatalogItem(filaId: string, item: CatalogoItem) {
    // SPEC_CATALOGO_MONEDA_v0.1 RN-17: presupuestos y pedidos siguen en guaranies.
    const enGs = (item.moneda ?? "PYG") === "PYG";
    updateFila(filaId, { descripcion: item.descripcion, precio_unitario: enGs ? String(item.precio_unitario) : "", catalog_item_id: item.id, catalog_iva_tipo: item.iva_tipo });
    setCatalogSuggestions(c => ({ ...c, [filaId]: [] }));
    setCatalogMessage(c => ({ ...c, [filaId]: enGs ? null : `Item del catálogo en ${item.moneda}: cargá el precio en Gs.` }));
    setFilaSheetOpen(false);
  }

  async function saveQuickCatalogItem(fila: NotaFilaDraft): Promise<boolean> {
    const precio = Number(fila.precio_unitario);
    if (!Number.isInteger(precio) || precio <= 0) {
      setCatalogMessage(c => ({ ...c, [fila._id]: "Ingresá un precio entero mayor a cero." }));
      return false;
    }
    setCatalogSaving(c => ({ ...c, [fila._id]: true }));
    try {
      await api.post<CatalogoItem>("/catalogo/items", { descripcion: fila.descripcion.trim(), precio_unitario: precio, iva_tipo: "IVA_10", activo: true });
      setCatalogMessage(c => ({ ...c, [fila._id]: "Item guardado en catálogo." }));
      return true;
    } catch (e) {
      setCatalogMessage(c => ({ ...c, [fila._id]: e instanceof Error ? e.message : "No se pudo guardar." }));
      return false;
    } finally { setCatalogSaving(c => ({ ...c, [fila._id]: false })); }
  }

  async function confirmFila(fila: NotaFilaDraft, saveInCatalog: boolean) {
    if (saveInCatalog) { const ok = await saveQuickCatalogItem(fila); if (!ok) return; }
    setFilaSheetOpen(false);
  }

  const totalNota = formFilas
    .filter(f => f.fila_tipo === "ITEM")
    .reduce((acc, f) => {
      const cant = Number(f.cantidad); const precio = Number(f.precio_unitario);
      return cant > 0 && precio > 0 ? acc + Math.round(cant * precio) : acc;
    }, 0);

  async function saveForm(andEmit: boolean) {
    if (!cliente.nombre.trim()) { setError("El nombre del cliente es requerido."); return; }
    const filasUtiles = formFilas.filter(f => f.descripcion.trim() !== "");
    if (andEmit && !filasUtiles.some(f => f.fila_tipo === "ITEM")) {
      setError("Se requiere al menos un item con precio para emitir.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        tipo: formTipo,
        cliente_nombre: cliente.nombre.trim(),
        cliente_ruc: cliente.documento.trim() || null,
        valido_hasta: formValidoHasta || null,
        observaciones: formObservaciones.trim() || null,
        items: filasUtiles.map((f, i) => ({
          orden: i + 1,
          fila_tipo: f.fila_tipo,
          descripcion: f.descripcion,
          cantidad: f.fila_tipo === "ITEM" ? (Number(f.cantidad) || null) : null,
          precio_unitario: f.fila_tipo === "ITEM" ? (Number(f.precio_unitario) || null) : null,
          catalog_item_id: f.catalog_item_id ?? null,
        })),
      };
      let nota: NotaListItem = editingId
        ? await api.request<NotaListItem>(`/notas/${editingId}`, { method: "PATCH", body: JSON.stringify(body) })
        : await api.post<NotaListItem>("/notas", body);
      if (andEmit) {
        nota = await api.request<NotaListItem>(`/notas/${nota.id}/emitir`, { method: "POST" });
        const token = nota.verification_token;
        setNotaPublicUrl(token ? `${window.location.origin}/verificar/nota/${token}` : null);
        setWhatsappPhone("");
        setDeliveryMessage(null);
        void openDetail(nota);
      } else {
        setMessage("Borrador guardado.");
        setSubView("list");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally { setSaving(false); }
  }

  async function deleteNota() {
    if (!deleteTarget) return;
    setSaving(true);
    setError(null);
    try {
      await api.request(`/notas/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      setMessage(`${filtroTipo === "PRESUPUESTO" ? "Presupuesto" : "Pedido"} eliminado.`);
      void loadNotas();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar.");
    } finally { setSaving(false); }
  }

  function openPdf(nota: NotaListItem) {
    void (async () => {
      try {
        // URA-018 (H-20): por el cliente, con renovacion de sesion y manejo del punto (PAUTAS P-D1).
        const res = await api.requestRaw(`/notas/${nota.id}/pdf`);
        window.open(URL.createObjectURL(await res.blob()), "_blank");
      } catch (e) { setError(e instanceof Error ? e.message : "Error al abrir el PDF."); }
    })();
  }

  // ── Sub-vista: detalle ──

  if (subView === "detail" && selectedNota) {
    const nroStr = selectedNota.numero != null ? numeroCorrelativo(selectedNota.numero) : "-------";
    const tipoLabel = selectedNota.tipo === "PRESUPUESTO" ? "Presupuesto" : "Pedido";
    const estadoVisual = calcularEstadoVisualNota(selectedNota);
    const notaFull = selectedNotaFull;
    const itemsConcepto = notaFull ? notaFull.items.filter(f => f.fila_tipo === "ITEM") : [];
    const puedeConvertir = selectedNota.estado === "EMITIDO" && selectedNota.estado_comercial !== "RECHAZADO";
    const puedeMarcarEstado = selectedNota.estado === "EMITIDO";

    async function copyNotaLink() {
      if (!notaPublicUrl) return;
      try { await navigator.clipboard.writeText(notaPublicUrl); setDeliveryMessage("Enlace copiado."); }
      catch { setDeliveryMessage(notaPublicUrl); }
    }
    async function shareNotaLink() {
      if (!notaPublicUrl) return;
      try {
        if (navigator.share) { await navigator.share({ title: `${tipoLabel} Segel`, url: notaPublicUrl }); return; }
        await navigator.clipboard.writeText(notaPublicUrl);
        setDeliveryMessage("Enlace copiado.");
      } catch { setDeliveryMessage(notaPublicUrl); }
    }

    return (
      <section className="invoice-editor" aria-labelledby="nota-detail-title">
        <div className="editor-heading">
          <div>
            <p className="eyebrow">{tipoLabel}</p>
            <h2 id="nota-detail-title">{tipoLabel} N° {nroStr}</h2>
          </div>
          <button className="ghost-action" onClick={() => { setSubView("list"); setMessage(null); setNotaPublicUrl(null); setSelectedNotaFull(null); }} type="button">Volver</button>
        </div>

        {error ? <p className="inline-error" role="alert">{error}</p> : null}

        {/* Resumen */}
        <section className="nota-detail-resumen">
          <div className="nota-detail-resumen-header">
            <span className={ESTADO_VISUAL_CLASS[estadoVisual]}>{ESTADO_VISUAL_LABEL[estadoVisual]}</span>
            {/* Estado comercial como select inline */}
            {puedeMarcarEstado ? (
              <select
                className="nota-estado-select"
                value={selectedNota.estado_comercial ?? ""}
                disabled={estadoComercialLoading}
                onChange={e => {
                  const v = e.target.value as NotaEstadoComercial;
                  if (v) void handleEstadoComercial(selectedNota.id, v);
                }}
                aria-label="Estado del presupuesto"
              >
                <option value="">Marcar estado…</option>
                <option value="PENDIENTE_RESPUESTA">Pendiente</option>
                <option value="ACEPTADO">Aceptado</option>
                <option value="RECHAZADO">Rechazado</option>
              </select>
            ) : null}
          </div>
          <dl className="receipt-summary">
            {(selectedNota.total ?? 0) > 0 ? <div><dt>Total</dt><dd><strong>{formatGuaranies(selectedNota.total ?? 0)}</strong></dd></div> : null}
            <div><dt>Fecha</dt><dd>{fmtFecha(selectedNota.fecha_emision) || "Borrador"}</dd></div>
            {selectedNota.valido_hasta ? <div><dt>Válido hasta</dt><dd>{fmtFecha(selectedNota.valido_hasta)}</dd></div> : null}
            <div><dt>Cliente</dt><dd>{selectedNota.cliente_nombre}</dd></div>
            {selectedNota.cliente_ruc ? <div><dt>RUC/CI</dt><dd>{selectedNota.cliente_ruc}</dd></div> : null}
            {itemsConcepto.length > 0 ? <div><dt>Conceptos</dt><dd>{itemsConcepto.length} item{itemsConcepto.length !== 1 ? "s" : ""}</dd></div> : null}
          </dl>
        </section>

        {/* Conceptos */}
        {notaFull && notaFull.items.length > 0 ? (
          <section className="nota-detail-section">
            <p className="eyebrow">Conceptos presupuestados</p>
            <div className="nota-detail-items">
              {notaFull.items.map(it => {
                if (it.fila_tipo === "CONTEXTO") return (
                  <div key={it.id} className="nota-fila-contexto"><strong>{it.descripcion}</strong></div>
                );
                if (it.fila_tipo === "ITEM_SIN_PRECIO") return (
                  <div key={it.id} className="nota-fila-item">
                    <span className="nota-fila-desc">{it.descripcion}</span>
                    <span className="nota-fila-precio muted">—</span>
                  </div>
                );
                return (
                  <div key={it.id} className="nota-fila-item">
                    <span className="nota-fila-desc">{it.descripcion}</span>
                    <span className="nota-fila-precio">{it.cantidad != null && it.cantidad !== 1 ? `${it.cantidad} × ` : ""}{formatGuaranies(it.precio_total ?? 0)}</span>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* Observaciones */}
        {selectedNota.observaciones ? (
          <section className="nota-detail-section">
            <p className="eyebrow">Observaciones</p>
            <p className="nota-observaciones-text">{selectedNota.observaciones}</p>
          </section>
        ) : null}

        {/* Convertir en factura */}
        {puedeConvertir && notaFull ? (
          <div className="action-group">
            <button className="primary-action wide" disabled={numeracionDelCliente} onClick={() => handleConvertirEnFactura(notaFull)} type="button">
              Convertir en factura
            </button>
            {numeracionDelCliente ? <p className="muted">Este punto emite por carga masiva</p> : null}
          </div>
        ) : null}

        {/* Compartir por WhatsApp */}
        <div className="action-group">
          <div className="delivery-inline-form">
            <label>
              WhatsApp
              <input inputMode="tel" placeholder="Número de celular" value={whatsappPhone} onChange={e => setWhatsappPhone(e.target.value)} />
            </label>
          </div>
          <a
            className={notaPublicUrl ? "primary-action wide secondary-link-as-button" : "primary-action wide secondary-link-as-button disabled"}
            href={notaPublicUrl ? buildWhatsAppShareUrl(notaPublicUrl, whatsappPhone) : "#"}
            rel="noreferrer"
            target="_blank"
          >
            Enviar por WhatsApp
          </a>
          <div className="delivery-actions">
            <button className="secondary-action" onClick={() => openPdf(selectedNota)} type="button">Ver PDF</button>
          </div>
          {deliveryMessage ? <p className="inline-message">{deliveryMessage}</p> : null}
        </div>

        {/* Nueva nota */}
        <div className="action-group">
          <button className="primary-action wide" onClick={openCreate} type="button">
            {selectedNota.tipo === "PRESUPUESTO" ? "Nuevo presupuesto" : "Nuevo pedido"}
          </button>
        </div>
      </section>
    );
  }

  // ── Sub-vista: formulario ──

  if (subView === "form") {
    const isSavingCatalog = activeFilaId ? (catalogSaving[activeFilaId] ?? false) : false;
    const catalogSugg = activeFilaId ? (catalogSuggestions[activeFilaId] ?? []) : [];
    const catalogMsg = activeFilaId ? (catalogMessage[activeFilaId] ?? null) : null;
    const isCatalogSearching = activeFilaId ? (catalogSearching[activeFilaId] ?? false) : false;
    const canEmitir = formFilas.some(f => f.fila_tipo === "ITEM") && !saving;
    const tipoLabel = formTipo === "PRESUPUESTO" ? "Nota de Presupuesto" : "Nota de Pedido";

    return (
      <section className="invoice-editor" aria-labelledby="nota-form-title">
        <div className="editor-heading">
          <div>
            <p className="eyebrow">{editingId ? "Editar" : "Nueva"} nota</p>
            <h2 id="nota-form-title">{tipoLabel}{cliente.nombre.trim() ? ` · ${cliente.nombre.trim()}` : ""}</h2>
          </div>
          <button className="ghost-action" onClick={() => setSubView("list")} type="button">Volver</button>
        </div>

        {/* Tipo de documento */}
        <section className="form-section comprobante-section">
          <div>
            <p className="eyebrow">Documento</p>
            <h3>{tipoLabel}</h3>
          </div>
          <div className="invoice-options">
            <p className="invoice-options-title">Tipo de nota</p>
            <div className="invoice-options-body">
              <div className="segmented-control" role="group" aria-label="Tipo de nota">
                {(["PRESUPUESTO", "PEDIDO"] as const).map(t => (
                  <button key={t} className={formTipo === t ? "active" : ""} onClick={() => setFormTipo(t)} type="button" disabled={!!editingId}>
                    {t === "PRESUPUESTO" ? "Presupuesto" : "Pedido"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Cliente */}
        <section className="form-section client-section">
          <p className="eyebrow">Cliente</p>
          <div className="field-grid">
            <label className="required-field">
              Documento
              <div className="inline-fields">
                <select value={cliente.documento_tipo} onChange={e => setCliente(c => ({ ...c, documento_tipo: e.target.value as "RUC" | "CI", nombre: "", cliente_id: null }))}>
                  <option value="RUC">RUC</option>
                  <option value="CI">CI</option>
                </select>
                <input
                  inputMode="numeric"
                  placeholder="Número de documento"
                  value={cliente.documento}
                  onChange={e => setCliente(c => ({ ...c, documento: e.target.value, nombre: "", cliente_id: null }))}
                  onBlur={() => void tryAutocompleteDnit()}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === "Tab") void tryAutocompleteDnit(); }}
                />
              </div>
              {clienteSearching || clienteAutocompleting ? (
                <span className="field-hint">{clienteSearching ? "Buscando..." : "Autocompletando..."}</span>
              ) : null}
              {clienteSuggestions.length > 0 ? (
                <div className="suggestion-list">
                  {clienteSuggestions.map(s => (
                    <button key={`${s.source}-${s.cliente_id ?? s.documento}`} onClick={() => applyClienteSuggestion(s)} type="button">
                      <strong>{s.documento}</strong>
                      <span>{s.razon_social}</span>
                      <small>{s.source === "AGENDA_FACTURADOR" ? "Agenda" : "Sugerencia"}</small>
                    </button>
                  ))}
                </div>
              ) : null}
            </label>
            <label className="required-field">
              Nombre o razón social
              <input placeholder="Nombre del cliente" value={cliente.nombre} onChange={e => setCliente(c => ({ ...c, nombre: e.target.value, cliente_id: null }))} />
            </label>
          </div>
          <div className="quick-actions-row">
            <button className="secondary-action" disabled={!cliente.documento.trim() || !cliente.nombre.trim()} onClick={() => void saveClienteRapido()} type="button">
              {cliente.cliente_id ? "Actualizar en agenda" : "Guardar en agenda"}
            </button>
            {clienteMessage ? <p className="inline-message">{clienteMessage}</p> : null}
          </div>
        </section>

        {/* Filas del documento */}
        <section className="form-section products-section">
          <div className="section-title-row">
            <div>
              <p className="eyebrow">Contenido</p>
              <h3>Items del documento</h3>
            </div>
          </div>

          <div className="sale-list" aria-label="Filas del documento">
            {formFilas.length === 0 ? (
              <button className="empty-sale-list" onClick={() => addFila("ITEM")} type="button">
                <strong>+ Agregar primer item</strong>
                <span>Descripción, cantidad y precio.</span>
              </button>
            ) : null}

            {formFilas.map((fila, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === formFilas.length - 1;

              if (fila.fila_tipo === "CONTEXTO") {
                return (
                  <article key={fila._id} className="sale-item-card nota-fila-contexto">
                    <div className="nota-fila-inline">
                      <span className="nota-fila-badge">Título</span>
                      <textarea aria-label="Título de la sección" className="nota-fila-textarea" rows={2} placeholder="Descripción de sección (aparece en negrita en el PDF)..." value={fila.descripcion} onChange={e => updateFila(fila._id, { descripcion: e.target.value })} />
                    </div>
                    <div className="sale-item-actions">
                      <button type="button" className="icon-action" onClick={() => moveFila(fila._id, -1)} disabled={isFirst} aria-label="Subir">↑</button>
                      <button type="button" className="icon-action" onClick={() => moveFila(fila._id, 1)} disabled={isLast} aria-label="Bajar">↓</button>
                      <button type="button" className="icon-action danger" onClick={() => removeFila(fila._id)} aria-label="Eliminar">✕</button>
                    </div>
                  </article>
                );
              }

              if (fila.fila_tipo === "ITEM_SIN_PRECIO") {
                return (
                  <article key={fila._id} className="sale-item-card nota-fila-sin-precio">
                    <div className="nota-fila-inline">
                      <span className="nota-fila-badge">Sin precio</span>
                      <textarea aria-label="Descripción del ítem sin precio" className="nota-fila-textarea" rows={2} placeholder="Descripción del item (sin precio)..." value={fila.descripcion} onChange={e => updateFila(fila._id, { descripcion: e.target.value })} />
                    </div>
                    <div className="sale-item-actions">
                      <button type="button" className="icon-action" onClick={() => moveFila(fila._id, -1)} disabled={isFirst} aria-label="Subir">↑</button>
                      <button type="button" className="icon-action" onClick={() => moveFila(fila._id, 1)} disabled={isLast} aria-label="Bajar">↓</button>
                      <button type="button" className="icon-action danger" onClick={() => removeFila(fila._id)} aria-label="Eliminar">✕</button>
                    </div>
                  </article>
                );
              }

              const cant = Number(fila.cantidad) || 1;
              const precio = Number(fila.precio_unitario) || 0;
              return (
                <article key={fila._id} className="sale-item-card">
                  <button className="sale-item-main" onClick={() => { setActiveFilaId(fila._id); setFilaSheetOpen(true); }} type="button">
                    <span className="nota-item-header">
                      <span className="nota-fila-badge nota-fila-badge-item">Item</span>
                      <strong>{fila.descripcion.trim() || "Item con precio"}</strong>
                    </span>
                    <span>{cant} × {formatGuaranies(precio)}</span>
                    <b>{precio > 0 ? formatGuaranies(Math.round(cant * precio)) : "—"}</b>
                  </button>
                  <div className="sale-item-actions">
                    <button type="button" className="icon-action" onClick={() => moveFila(fila._id, -1)} disabled={isFirst} aria-label="Subir">↑</button>
                    <button type="button" className="icon-action" onClick={() => moveFila(fila._id, 1)} disabled={isLast} aria-label="Bajar">↓</button>
                    <button type="button" className="icon-action danger" onClick={() => removeFila(fila._id)} aria-label="Eliminar">✕</button>
                  </div>
                </article>
              );
            })}

            {formFilas.length > 0 ? (
              <button className="add-product-action" onClick={() => addFila("ITEM")} type="button">+ Agregar item</button>
            ) : null}
          </div>

          <div className="nota-add-fila-row">
            <button type="button" className="secondary-action" onClick={() => addFila("CONTEXTO")}>+ Descripción</button>
            <button type="button" className="secondary-action" onClick={() => addFila("ITEM_SIN_PRECIO")}>+ Item sin precio</button>
          </div>
        </section>

        {/* Validez y observaciones */}
        <section className="form-section">
          <p className="eyebrow">Detalles</p>
          <div className="field-grid">
            <label>
              Válido hasta
              <input type="date" value={formValidoHasta} onChange={e => setFormValidoHasta(e.target.value)} />
              <span className="field-hint">Si no se indica, se asignará 30 días desde hoy al emitir.</span>
            </label>
            <label>
              Observaciones
              <textarea rows={3} placeholder="Condiciones, notas adicionales..." value={formObservaciones} onChange={e => setFormObservaciones(e.target.value)} style={{ resize: "vertical" }} />
            </label>
          </div>
        </section>

        {/* Total */}
        <section className="totals-section" aria-live="polite">
          <div className="totals-grid">
            <div className="total-row">
              <span>Total estimado</span>
              <strong>{formatGuaranies(totalNota)}</strong>
            </div>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="editor-actions">
            <button className="secondary-action wide" onClick={() => void saveForm(false)} disabled={saving} type="button">
              {saving ? "Guardando…" : "Guardar borrador"}
            </button>
            <button className="primary-action wide" onClick={() => void saveForm(true)} disabled={!canEmitir || saving} type="button">
              {saving ? "Emitiendo…" : "Emitir"}
            </button>
          </div>
        </section>

        {/* Bottom sheet para filas ITEM */}
        {filaSheetOpen && activeFila ? (
          <div className="bottom-sheet-backdrop" role="presentation" onClick={() => setFilaSheetOpen(false)}>
            <section className="bottom-sheet" aria-label={activeFila.fila_tipo === "ITEM" ? "Agregar item con precio" : "Editar fila"} aria-modal="true" role="dialog" onClick={e => e.stopPropagation()}>
              <div className="sheet-handle" />
              <div className="sheet-header">
                <h3>{activeFila.fila_tipo === "CONTEXTO" ? "Descripción de sección" : activeFila.fila_tipo === "ITEM_SIN_PRECIO" ? "Item sin precio" : "Item con precio"}</h3>
                <button className="sheet-close" onClick={() => setFilaSheetOpen(false)} aria-label="Cerrar" type="button">Cerrar</button>
              </div>

              {activeFila.fila_tipo !== "ITEM" ? (
                <div className="sheet-grid">
                  <label className="sheet-description">
                    Descripción
                    <textarea autoFocus rows={4} value={activeFila.descripcion} onChange={e => updateFila(activeFila._id, { descripcion: e.target.value })} placeholder={activeFila.fila_tipo === "CONTEXTO" ? "Título de sección (aparece en negrita)..." : "Descripción del item..."} />
                  </label>
                  <button className="primary-action wide" onClick={() => setFilaSheetOpen(false)} type="button">Confirmar</button>
                </div>
              ) : (
                <div className="sheet-grid">
                  <label className="sheet-description">
                    Descripción
                    <input autoFocus value={activeFila.descripcion} onChange={e => updateFila(activeFila._id, { descripcion: e.target.value })} placeholder="Descripción del producto o servicio" />
                  </label>

                  {isCatalogSearching ? <span className="field-hint">Buscando catálogo...</span> : null}
                  {catalogSugg.length > 0 ? (
                    <div className="suggestion-list catalog">
                      {catalogSugg.map(item => (
                        <button key={item.id} onClick={() => applyCatalogItem(activeFila._id, item)} type="button">
                          {item.codigo ? <strong>{item.codigo}</strong> : null}
                          <span>{item.descripcion}</span>
                          <small>{formatGuaranies(item.precio_unitario)}</small>
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className="quantity-price-grid">
                    <label>
                      Cantidad
                      <div className="quantity-stepper">
                        <button type="button" aria-label="Restar" onClick={() => updateFila(activeFila._id, { cantidad: String(Math.max(1, Number(activeFila.cantidad || 1) - 1)) })}>-</button>
                        <input
                          inputMode="numeric"
                          onChange={e => updateFila(activeFila._id, { cantidad: normalizeIntegerInput(e.target.value) })}
                          value={formatIntegerInput(activeFila.cantidad)}
                        />
                        <button type="button" aria-label="Sumar" onClick={() => updateFila(activeFila._id, { cantidad: String((Number(activeFila.cantidad) || 0) + 1) })}>+</button>
                      </div>
                    </label>
                    <label>
                      Precio (Gs.)
                      <input inputMode="decimal" min="0" placeholder="0" value={formatIntegerInput(activeFila.precio_unitario)} onChange={e => updateFila(activeFila._id, { precio_unitario: normalizeIntegerInput(e.target.value) })} />
                    </label>
                  </div>

                  <div className="sheet-total-row">
                    <span>Total</span>
                    <strong>{formatGuaranies(Math.round((Number(activeFila.cantidad) || 1) * (Number(activeFila.precio_unitario) || 0)))}</strong>
                  </div>

                  {catalogMsg ? <p className="inline-message">{catalogMsg}</p> : null}

                  <div className="catalog-save-choice" role="group" aria-label="Confirmar item">
                    <button
                      className="primary-action save-catalog"
                      disabled={isSavingCatalog || !activeFila.descripcion.trim() || !Number.isInteger(Number(activeFila.precio_unitario)) || Number(activeFila.precio_unitario) <= 0}
                      onClick={() => void confirmFila(activeFila, true)}
                      type="button"
                    >
                      {isSavingCatalog ? "Guardando..." : "AGREGAR Y GUARDAR EN CATÁLOGO"}
                    </button>
                    <button
                      className="secondary-action"
                      disabled={isSavingCatalog || !activeFila.descripcion.trim() || !Number.isInteger(Number(activeFila.precio_unitario)) || Number(activeFila.precio_unitario) <= 0}
                      onClick={() => void confirmFila(activeFila, false)}
                      type="button"
                    >
                      AGREGAR SIN GUARDAR
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : null}

      </section>
    );
  }

  // ── Sub-vista: listado ──

  const notasFiltradas = notas.filter(n => {
    if (!busqueda.trim()) return true;
    const q = busqueda.toLowerCase();
    return n.cliente_nombre.toLowerCase().includes(q) || (n.cliente_ruc ?? "").includes(q) || String(n.numero ?? "").includes(q);
  });

  // Agrupar por mes
  const gruposPorMes: Array<{ label: string; notas: NotaListItem[] }> = [];
  for (const nota of notasFiltradas) {
    const fecha = nota.fecha_emision ?? nota.created_at.slice(0, 7);
    const mes = fecha.slice(0, 7);
    const mesLabel = new Date(mes + "-02T00:00:00").toLocaleString("es-PY", { month: "long", year: "numeric" });
    const label = nota.estado === "BORRADOR" ? "Borradores" : mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);
    const ultimo = gruposPorMes[gruposPorMes.length - 1];
    if (ultimo && ultimo.label === label) ultimo.notas.push(nota);
    else gruposPorMes.push({ label, notas: [nota] });
  }

  return (
    <section className="documents-view" aria-labelledby="notas-list-title">
      <div className="editor-heading">
        <div>
          <p className="eyebrow">Documentos comerciales</p>
          {/* SPEC_AJUSTES_TEXTOS_OPERADOR_v0.1, A-6: el titulo sigue a la pestaña activa. */}
          <h2 id="notas-list-title">{filtroTipo === "PEDIDO" ? "Pedidos" : "Presupuestos"}</h2>
        </div>
        <button className="ghost-action" onClick={onBack} type="button">Volver</button>
      </div>

      {/* Tabs */}
      <div className="filter-tabs" role="tablist" aria-label="Tipo de documento">
        {(["PRESUPUESTO", "PEDIDO"] as const).map(t => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={filtroTipo === t}
            className={filtroTipo === t ? "active" : ""}
            onClick={() => { setFiltroTipo(t); setBusqueda(""); }}
          >
            {t === "PRESUPUESTO" ? "Presupuestos" : "Pedidos"}
          </button>
        ))}
      </div>

      {/* Barra de búsqueda + acción */}
      <div className="list-toolbar">
        <input
          className="list-search-input"
          type="search"
          placeholder="Buscar por cliente, RUC o número..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          aria-label="Buscar"
        />
        <button className="primary-action" onClick={openCreate} type="button">
          + {filtroTipo === "PRESUPUESTO" ? "Nuevo presupuesto" : "Nuevo pedido"}
        </button>
      </div>

      {message ? <p className="editor-alert ready">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {loading ? (
        <p className="muted" style={{ padding: "24px 0" }}>Cargando…</p>
      ) : notasFiltradas.length === 0 ? (
        <div className="empty-state-box">
          <p>{busqueda ? "Sin resultados para esa búsqueda." : `No hay ${filtroTipo === "PRESUPUESTO" ? "presupuestos" : "pedidos"} aún.`}</p>
          {!busqueda ? <button className="primary-action" onClick={openCreate} type="button">+ {filtroTipo === "PRESUPUESTO" ? "Nuevo presupuesto" : "Nuevo pedido"}</button> : null}
        </div>
      ) : (
        <div className="invoice-list-groups">
          {gruposPorMes.map(grupo => (
            <div key={grupo.label} className="invoice-list-group">
              <p className="invoice-list-group-label">{grupo.label}</p>
              {grupo.notas.map(nota => {
                const nroStr = nota.numero != null ? numeroCorrelativo(nota.numero) : "Borrador";
                const estadoVisual = calcularEstadoVisualNota(nota);
                const isMenuOpen = menuOpenId === nota.id;
                return (
                  <div key={nota.id} className="invoice-card">
                    <button
                      className="invoice-card-main"
                      type="button"
                      onClick={() => nota.estado === "BORRADOR" ? openEdit(nota) : void openDetail(nota)}
                    >
                      <span className="invoice-card-top">
                        <span className="invoice-card-nro">{nroStr}</span>
                        <span className={ESTADO_VISUAL_CLASS[estadoVisual]}>{ESTADO_VISUAL_LABEL[estadoVisual]}</span>
                      </span>
                      <span className="invoice-card-cliente">{nota.cliente_nombre}</span>
                      <span className="invoice-card-meta">
                        <span className="muted">{fmtFecha(nota.fecha_emision ?? nota.created_at.slice(0, 10))}</span>
                        {(nota.total ?? 0) > 0 ? <strong>{formatGuaranies(nota.total ?? 0)}</strong> : null}
                      </span>
                    </button>
                    <div className="invoice-card-menu-wrapper">
                      <button
                        className="invoice-card-menu-btn"
                        type="button"
                        aria-label="Más opciones"
                        aria-expanded={isMenuOpen}
                        onClick={e => { e.stopPropagation(); setMenuOpenId(isMenuOpen ? null : nota.id); }}
                      >⋯</button>
                      {isMenuOpen ? (
                        <div className="invoice-card-menu" role="menu" onClick={e => e.stopPropagation()}>
                          {nota.estado === "EMITIDO" ? (
                            <button role="menuitem" type="button" onClick={() => { setMenuOpenId(null); void openDetail(nota); }}>Ver detalle</button>
                          ) : (
                            <button role="menuitem" type="button" onClick={() => { setMenuOpenId(null); void openEdit(nota); }}>Editar</button>
                          )}
                          {nota.estado === "EMITIDO" && nota.verification_token ? (
                            <>
                              <button role="menuitem" type="button" onClick={() => {
                                setMenuOpenId(null);
                                const url = `${window.location.origin}/verificar/nota/${nota.verification_token!}`;
                                void (navigator.share
                                  ? navigator.share({ title: `${filtroTipo === "PRESUPUESTO" ? "Presupuesto" : "Pedido"} Segel`, url })
                                  : navigator.clipboard.writeText(url));
                              }}>Compartir enlace</button>
                              <button role="menuitem" type="button" onClick={() => {
                                setMenuOpenId(null);
                                const url = `${window.location.origin}/verificar/nota/${nota.verification_token!}`;
                                const wa = buildWhatsAppShareUrl(url, "");
                                window.open(wa, "_blank");
                              }}>Enviar por WhatsApp</button>
                              <button role="menuitem" type="button" onClick={() => { setMenuOpenId(null); openPdf(nota); }}>Ver PDF</button>
                            </>
                          ) : null}
                          <button role="menuitem" type="button" onClick={() => { setMenuOpenId(null); void handleDuplicar(nota); }}>Duplicar</button>
                          {nota.estado === "BORRADOR" ? (
                            <button role="menuitem" type="button" className="menu-danger" onClick={() => { setMenuOpenId(null); setDeleteTarget(nota); }}>Eliminar</button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {deleteTarget ? (
        <div className="modal-scrim" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h2>Eliminar {filtroTipo === "PRESUPUESTO" ? "presupuesto" : "pedido"}</h2>
            <p>¿Eliminar el borrador de <strong>{deleteTarget.cliente_nombre}</strong>? Esta acción no se puede deshacer.</p>
            {error ? <p className="error-banner">{error}</p> : null}
            <div className="modal-actions">
              <button type="button" className="ghost-action" onClick={() => { setDeleteTarget(null); setError(null); }}>Cancelar</button>
              <button type="button" className="danger-action" onClick={() => void deleteNota()} disabled={saving}>{saving ? "Eliminando…" : "Eliminar"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ─── Componente RecibosView ───────────────────────────────────────────────────

function RecibosView({
  onBack,
}: {
  onBack: () => void;
}) {
  const api = useApi();
  const [recibos, setRecibos] = useState<ReciboRecord[]>([]);
  const [confirmar, dialogoConfirmar] = useConfirmar();
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  type SubView = "list" | "form" | "detail";
  const [subView, setSubView] = useState<SubView>("list");
  const [selectedRecibo, setSelectedRecibo] = useState<ReciboRecord | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReciboRecord | null>(null);
  const [quickMenuReciboId, setQuickMenuReciboId] = useState<string | null>(null);
  const [anularTarget, setAnularTarget] = useState<ReciboRecord | null>(null);
  const [anularMotivo, setAnularMotivo] = useState("");

  const [formPagadorNombre, setFormPagadorNombre] = useState("");
  const [formPagadorDocTipo, setFormPagadorDocTipo] = useState<DocumentoIdentidadTipo>("RUC");
  const [formPagadorDoc, setFormPagadorDoc] = useState("");
  const [formConcepto, setFormConcepto] = useState("");
  const [formImporte, setFormImporte] = useState("");
  // SPEC_MONEDA_EXTRANJERA_v0.1: el recibo desde una factura en moneda extranjera conserva esa moneda.
  const [formMoneda, setFormMoneda] = useState("PYG");
  const [formFormaPago, setFormFormaPago] = useState<ReciboFormaPago>("EFECTIVO");
  const [formFechaCobro, setFormFechaCobro] = useState(() => new Date().toISOString().slice(0, 10));
  const [formRefBancaria, setFormRefBancaria] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");

  const [formPagadorClienteId, setFormPagadorClienteId] = useState<string | null>(null);
  const [formPagadorDireccion, setFormPagadorDireccion] = useState("");
  const [formPagadorTelefono, setFormPagadorTelefono] = useState("");
  const [formPagadorEmail, setFormPagadorEmail] = useState("");
  // SPEC_MULTIPERFIL_USUARIO_v0.1 RN-06
  useBorradorSinEmitir(
    "recibo",
    () => subView === "form" && Boolean(formPagadorNombre.trim() || formConcepto.trim() || formImporte.trim())
  );
  const [clienteSuggestions, setClienteSuggestions] = useState<ClienteSearchResult[]>([]);
  const [clienteSearching, setClienteSearching] = useState(false);
  const [clienteAutocompleting, setClienteAutocompleting] = useState(false);
  const [clienteMessage, setClienteMessage] = useState<string | null>(null);
  const [clienteSaving, setClienteSaving] = useState(false);
  const [clienteModalOpen, setClienteModalOpen] = useState(false);

  const loadRecibos = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<{ items: ReciboRecord[]; total: number }>("/recibos?limit=50&offset=0");
      setRecibos(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar los recibos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadRecibos(); }, []);

  useEffect(() => {
    const q = formPagadorDoc.trim();
    if (q.length < 2) {
      setClienteSuggestions([]);
      return;
    }
    const timeout = window.setTimeout(async () => {
      setClienteSearching(true);
      try {
        const result = await api.get<{ items: ClienteSearchResult[] }>(`/clientes/search?q=${encodeURIComponent(q)}&limit=5`);
        setClienteSuggestions(result.items);
      } catch {
        setClienteSuggestions([]);
      } finally {
        setClienteSearching(false);
      }
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [api, formPagadorDoc]);

  function applyClienteSuggestion(suggestion: ClienteSearchResult | ClienteResponse) {
    setFormPagadorClienteId(suggestion.cliente_id);
    setFormPagadorDocTipo(suggestion.documento_tipo);
    setFormPagadorDoc(suggestion.documento);
    setFormPagadorNombre(suggestion.razon_social);
    setFormPagadorDireccion(suggestion.direccion ?? "");
    setFormPagadorTelefono(suggestion.telefono ?? "");
    setFormPagadorEmail(suggestion.email ?? "");
    setClienteMessage(
      "source" in suggestion && suggestion.source === "AGENDA_FACTURADOR"
        ? "Cliente seleccionado de la agenda."
        : "Datos encontrados para agregar a tu agenda."
    );
    setClienteSuggestions([]);
  }

  async function tryAutocompleteDnit() {
    if (formPagadorDocTipo !== "RUC" && formPagadorDocTipo !== "CI") return;

    const rawDocumento = formPagadorDoc.trim();
    if (rawDocumento.length < 3) return;

    const normalizedInput = normalizeDocKey(rawDocumento);
    const exactMatch = clienteSuggestions.some((s) => normalizeDocKey(s.documento) === normalizedInput);
    if (exactMatch) return;

    setClienteAutocompleting(true);
    try {
      const result = await api.get<DnitAutocompleteResponse>(
        `/clientes/dnit/autocomplete?documento_tipo=${formPagadorDocTipo}&documento=${encodeURIComponent(rawDocumento)}`
      );
      if (!result.found || !result.cliente) {
        if (result.message && result.ambiguous) setClienteMessage(result.message);
        return;
      }
      setFormPagadorDocTipo(result.cliente.documento_tipo);
      setFormPagadorDoc(result.cliente.documento);
      setFormPagadorNombre(result.cliente.razon_social);
      setClienteMessage("Nombre o razón social autocompletado.");
    } catch {
      // No interrumpir el flujo operativo cuando DNIT no esta disponible.
    } finally {
      setClienteAutocompleting(false);
    }
  }

  async function saveClienteRapido() {
    setClienteSaving(true);
    setClienteMessage(null);
    try {
      const payload = {
        documento_tipo: formPagadorDocTipo,
        documento: formPagadorDoc,
        razon_social: formPagadorNombre,
        direccion: formPagadorDireccion || null,
        telefono: formPagadorTelefono || null,
        email: formPagadorEmail || null
      };
      const saved = formPagadorClienteId
        ? await api.request<ClienteResponse>(`/clientes/${formPagadorClienteId}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await api.post<ClienteResponse>("/clientes", payload);
      applyClienteSuggestion(saved);
      setClienteModalOpen(false);
      setClienteMessage(formPagadorClienteId ? "Cliente actualizado." : "Cliente guardado para este facturador.");
    } catch (error) {
      setClienteMessage(error instanceof Error ? error.message : "No se pudo guardar el cliente.");
    } finally {
      setClienteSaving(false);
    }
  }

  const openNew = () => {
    setEditingId(null);
    setFormPagadorNombre("");
    setFormPagadorDocTipo("RUC");
    setFormPagadorDoc("");
    setFormConcepto("");
    setFormImporte("");
    setFormMoneda("PYG");
    setFormFormaPago("EFECTIVO");
    setFormFechaCobro(new Date().toISOString().slice(0, 10));
    setFormRefBancaria("");
    setFormPagadorClienteId(null);
    setFormPagadorDireccion("");
    setFormPagadorTelefono("");
    setFormPagadorEmail("");
    setClienteSuggestions([]);
    setClienteMessage(null);
    setError(null);
    setSubView("form");
  };

  const openEdit = (r: ReciboRecord) => {
    setEditingId(r.id);
    setFormPagadorNombre(r.pagador_nombre);
    setFormPagadorDocTipo((r.pagador_documento_tipo as DocumentoIdentidadTipo) || "RUC");
    setFormPagadorDoc(r.pagador_documento ?? "");
    setFormConcepto(r.concepto);
    setFormImporte(String(r.importe));
    setFormMoneda(r.moneda ?? "PYG");
    setFormFormaPago(r.forma_pago);
    setFormFechaCobro(r.fecha_cobro);
    setFormRefBancaria(r.referencia_bancaria ?? "");
    // El recibo no persiste direccion/telefono/email/cliente_id — quedan vacios aunque
    // el pagador ya exista en la agenda (ver SPEC_RECIBO_DINERO_v0.3.md, seccion 3).
    setFormPagadorClienteId(null);
    setFormPagadorDireccion("");
    setFormPagadorTelefono("");
    setFormPagadorEmail("");
    setClienteSuggestions([]);
    setClienteMessage(null);
    setError(null);
    setSubView("form");
  };

  const saveRecibo = async (emitirDespues?: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const body = {
        pagador_nombre: formPagadorNombre.trim(),
        pagador_documento_tipo: formPagadorDocTipo.trim() || null,
        pagador_documento: formPagadorDoc.trim() || null,
        concepto: formConcepto.trim(),
        importe: Number(formImporte),
        moneda: formMoneda,
        forma_pago: formFormaPago,
        fecha_cobro: formFechaCobro,
        referencia_bancaria: formRefBancaria.trim() || null,
      };
      let recibo: ReciboRecord;
      if (editingId) {
        recibo = await api.request<ReciboRecord>(`/recibos/${editingId}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        recibo = await api.request<ReciboRecord>("/recibos", { method: "POST", body: JSON.stringify(body) });
      }
      if (emitirDespues) {
        recibo = await api.request<ReciboRecord>(`/recibos/${recibo.id}/emitir`, { method: "POST" });
      }
      setSelectedRecibo(recibo);
      setWhatsappPhone("");
      setFormPagadorClienteId(null);
      setFormPagadorDireccion("");
      setFormPagadorTelefono("");
      setFormPagadorEmail("");
      await loadRecibos();
      setSubView("detail");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar.");
    } finally {
      setSaving(false);
    }
  };

  const emitirRecibo = async (r: ReciboRecord) => {
    setSaving(true);
    setError(null);
    try {
      if (!(await confirmar({ titulo: `¿Emitir el recibo para ${r.pagador_nombre}?`, texto: "Esta acción no se puede deshacer.", textoConfirmar: "Emitir" }))) return;
      const emitido = await api.request<ReciboRecord>(`/recibos/${r.id}/emitir`, { method: "POST" });
      setSelectedRecibo(emitido);
      setWhatsappPhone("");
      await loadRecibos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al emitir.");
    } finally {
      setSaving(false);
    }
  };

  const openPdf = (r: ReciboRecord) => {
    void (async () => {
      try {
        const res = await api.requestRaw(`/recibos/${r.id}/pdf`);
        window.open(URL.createObjectURL(await res.blob()), "_blank");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al abrir el PDF.");
      }
    })();
  };

  const openXml = (r: ReciboRecord) => {
    void (async () => {
      try {
        const res = await api.requestRaw(`/recibos/${r.id}/xml`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const nroStr = r.numero != null ? numeroCorrelativo(r.numero) : "borrador";
        const link = document.createElement("a");
        link.href = url;
        link.download = `recibo-${nroStr}.xml`;
        link.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al descargar el documento electrónico.");
      }
    })();
  };

  const deleteRecibo = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await api.request(`/recibos/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      await loadRecibos();
      setSubView("list");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar.");
    } finally {
      setSaving(false);
    }
  };

  const openAnularModal = (r: ReciboRecord) => {
    setAnularTarget(r);
    setAnularMotivo("");
    setError(null);
    setQuickMenuReciboId(null);
  };

  const submitAnular = async () => {
    if (!anularTarget) return;
    if (anularMotivo.trim().length < 3) {
      setError("Ingresá un motivo de al menos 3 caracteres.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api.request<ReciboRecord>(`/recibos/${anularTarget.id}/anular`, {
        method: "POST",
        body: JSON.stringify({ motivo: anularMotivo.trim() }),
      });
      setAnularTarget(null);
      await loadRecibos();
      if (selectedRecibo?.id === updated.id) setSelectedRecibo(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo anular el recibo.");
    } finally {
      setSaving(false);
    }
  };

  const buildReciboPublicUrl = (r: ReciboRecord) => `${window.location.origin}/verificar/recibo/${r.verification_token}`;

  const quickShare = (r: ReciboRecord) => {
    window.open(buildReciboPublicUrl(r), "_blank", "noopener,noreferrer");
    setQuickMenuReciboId(null);
  };

  const quickWhatsApp = (r: ReciboRecord) => {
    window.open(`https://wa.me/?text=${encodeURIComponent(buildReciboPublicUrl(r))}`, "_blank", "noopener,noreferrer");
    setQuickMenuReciboId(null);
  };

  // Se define una sola vez y se incluye en cada "return" de subView (form/detail/list):
  // eliminar y anular se pueden disparar tanto desde el detalle como desde la lista, y al
  // haber "return" separados por subView, un modal que solo viviera en el return de la lista
  // no se renderizaba cuando se abria desde el detalle (bug reportado por el usuario).
  const modals = (
    <>
      {dialogoConfirmar}
      {deleteTarget ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel" aria-labelledby="recibo-delete-title" role="dialog" aria-modal="true">
            <header>
              <h3 id="recibo-delete-title">Eliminar recibo</h3>
              <p className="muted">¿Eliminar el borrador de recibo para {deleteTarget.pagador_nombre}? Esta acción no se puede deshacer.</p>
            </header>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="result-actions">
              <button className="secondary-action" disabled={saving} onClick={() => setDeleteTarget(null)} type="button">
                Cancelar
              </button>
              <button className="danger-action" disabled={saving} onClick={() => void deleteRecibo()} type="button">
                {saving ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {anularTarget ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel" aria-labelledby="recibo-anular-title" role="dialog" aria-modal="true">
            <header>
              <p className="eyebrow">Confirmación</p>
              <h3 id="recibo-anular-title">Anular recibo</h3>
              <p className="muted">
                El recibo N° {anularTarget.numero != null ? numeroCorrelativo(anularTarget.numero) : ""} para {anularTarget.pagador_nombre} quedará anulado.
                Se genera un recibo de anulación firmado; el original no se modifica.
              </p>
            </header>
            <label className="credit-note-motivo">
              Motivo
              <textarea
                autoFocus
                maxLength={500}
                rows={4}
                value={anularMotivo}
                onChange={(event) => setAnularMotivo(event.target.value)}
                placeholder="Ej: Importe incorrecto, se emitio uno nuevo"
              />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="result-actions">
              <button className="secondary-action" disabled={saving} onClick={() => setAnularTarget(null)} type="button">
                Cancelar
              </button>
              <button className="danger-action" disabled={saving} onClick={() => void submitAnular()} type="button">
                {saving ? "Anulando..." : "Anular recibo"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );

  if (subView === "form") {
    return (
      <div className="module-view">
        <div className="view-header">
          <button type="button" className="ghost-action" onClick={() => setSubView("list")}>← Volver</button>
          <h2>{editingId ? "Editar recibo" : "Nuevo recibo"}</h2>
        </div>
        {error ? <p className="error-banner">{error}</p> : null}
        <div className="form-section">
          <div className="field-grid">
            <label>
              Fecha de cobro
              <input type="date" value={formFechaCobro} onChange={(e) => setFormFechaCobro(e.target.value)} />
            </label>
            <label className="required-field">
              Documento
              <div className="inline-fields">
                <select
                  value={formPagadorDocTipo}
                  onChange={(e) => setFormPagadorDocTipo(e.target.value as DocumentoIdentidadTipo)}
                >
                  <option value="RUC">RUC</option>
                  <option value="CI">CI</option>
                  <option value="PASAPORTE">Pasaporte</option>
                  <option value="CEDULA_EXTRANJERA">Cédula extranjera</option>
                  <option value="NO_ESPECIFICADO">No especificado</option>
                </select>
                <input
                  type="text"
                  inputMode={formPagadorDocTipo === "RUC" || formPagadorDocTipo === "CI" ? "numeric" : "text"}
                  value={formPagadorDoc}
                  onChange={(e) => {
                    const next = e.target.value;
                    setFormPagadorDoc(next);
                    setFormPagadorClienteId(null);
                    setFormPagadorNombre("");
                    setFormPagadorDireccion("");
                    setFormPagadorTelefono("");
                    setFormPagadorEmail("");
                  }}
                  onBlur={() => void tryAutocompleteDnit()}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Tab") void tryAutocompleteDnit(); }}
                  placeholder="Ingresá el número de documento"
                />
              </div>
              {clienteSearching || clienteAutocompleting ? (
                <span className="field-hint">{clienteSearching ? "Buscando cliente..." : "Autocompletando..."}</span>
              ) : null}
              {clienteSuggestions.length > 0 ? (
                <div className="suggestion-list">
                  {clienteSuggestions.map((s) => (
                    <button key={`${s.source}-${s.cliente_id ?? s.documento}`} onClick={() => applyClienteSuggestion(s)} type="button">
                      <strong>{s.documento}</strong>
                      <span>{s.razon_social}</span>
                      <small>{s.source === "AGENDA_FACTURADOR" ? "Agenda" : "Sugerencia"}</small>
                    </button>
                  ))}
                </div>
              ) : null}
            </label>
            <label className="required-field">
              Pagador (nombre o razón social)
              <input type="text" value={formPagadorNombre} onChange={(e) => setFormPagadorNombre(e.target.value)} placeholder="Juan Perez" />
            </label>
            <label>
              Dirección <small>(opcional)</small>
              <input type="text" value={formPagadorDireccion} onChange={(e) => setFormPagadorDireccion(e.target.value)} />
            </label>
            <label>
              Teléfono <small>(opcional)</small>
              <input type="text" inputMode="tel" value={formPagadorTelefono} onChange={(e) => setFormPagadorTelefono(e.target.value)} />
            </label>
            <label>
              Correo <small>(opcional)</small>
              <input type="text" inputMode="email" value={formPagadorEmail} onChange={(e) => setFormPagadorEmail(e.target.value)} />
            </label>
            <div className="quick-actions-row">
              <button
                type="button"
                className="secondary-action"
                disabled={!formPagadorDoc.trim() || !formPagadorNombre.trim()}
                onClick={() => (formPagadorClienteId ? void saveClienteRapido() : setClienteModalOpen(true))}
              >
                {formPagadorClienteId ? "Actualizar" : "Guardar cliente"}
              </button>
              {clienteMessage ? <p className="inline-message">{clienteMessage}</p> : null}
            </div>
            <label>
              Concepto *
              <input type="text" value={formConcepto} onChange={(e) => setFormConcepto(e.target.value)} placeholder="Pago de servicio mensual" />
            </label>
            <label>
              Importe ({formMoneda === "PYG" ? "Gs." : formMoneda}) *
              <input
                inputMode={formMoneda === "PYG" ? "numeric" : "decimal"}
                onChange={(e) => setFormImporte(formMoneda === "PYG" ? normalizeIntegerInput(e.target.value) : normalizeDecimalInput(e.target.value))}
                placeholder="0"
                value={formMoneda === "PYG" ? formatIntegerInput(formImporte) : formImporte.replace(".", ",")}
              />
            </label>
            <label>
              Forma de pago
              <select value={formFormaPago} onChange={(e) => setFormFormaPago(e.target.value as ReciboFormaPago)}>
                {(Object.keys(FORMAS_PAGO_LABELS) as ReciboFormaPago[]).map((fp) => (
                  <option key={fp} value={fp}>{FORMAS_PAGO_LABELS[fp]}</option>
                ))}
              </select>
            </label>
            {formFormaPago !== "EFECTIVO" ? (
              <label>
                Referencia bancaria / número de cheque
                <input type="text" value={formRefBancaria} onChange={(e) => setFormRefBancaria(e.target.value)} placeholder="Nro. transferencia, cheque, etc." />
              </label>
            ) : null}
          </div>
        </div>
        <div className="result-actions" style={{ marginTop: "16px" }}>
          <button type="button" className="secondary-action" disabled={saving} onClick={() => void saveRecibo(false)}>
            {saving ? "Guardando…" : "Guardar borrador"}
          </button>
          <button type="button" className="primary-action" disabled={saving} onClick={() => void saveRecibo(true)}>
            {saving ? "Emitiendo…" : "Guardar y emitir"}
          </button>
        </div>
        {clienteModalOpen ? (
          <div className="modal-backdrop" role="presentation">
            <section className="modal-panel" aria-labelledby="recibo-cliente-modal-title" role="dialog" aria-modal="true">
              <div className="editor-heading">
                <div>
                  <p className="eyebrow">Alta rápida</p>
                  <h2 id="recibo-cliente-modal-title">Guardar cliente</h2>
                </div>
                <button className="ghost-action" onClick={() => setClienteModalOpen(false)} type="button">Cerrar</button>
              </div>
              <dl className="confirm-dl">
                <div><dt>Documento</dt><dd>{formPagadorDoc || "-"}</dd></div>
                <div><dt>Razón social</dt><dd>{formPagadorNombre || "-"}</dd></div>
              </dl>
              {clienteMessage ? <p className="form-error">{clienteMessage}</p> : null}
              <button className="primary-action wide" disabled={clienteSaving} onClick={() => void saveClienteRapido()} type="button">
                {clienteSaving ? "Guardando..." : "Confirmar alta"}
              </button>
            </section>
          </div>
        ) : null}
      </div>
    );
  }

  if (subView === "detail" && selectedRecibo) {
    const r = selectedRecibo;
    return (
      <div className="module-view">
        <div className="view-header">
          <button type="button" className="ghost-action" onClick={() => setSubView("list")}>← Volver</button>
          <h2>Recibo {r.numero != null ? `N° ${numeroCorrelativo(r.numero)}` : "(borrador)"}</h2>
          <PastillaEstado {...estadoRecibo(r.estado)} />
        </div>
        {error ? <p className="error-banner">{error}</p> : null}
        <dl className="receipt-summary">
          <div><dt>Pagador</dt><dd>{r.pagador_nombre}</dd></div>
          {r.pagador_documento ? <div><dt>{r.pagador_documento_tipo ?? "Doc."}</dt><dd>{r.pagador_documento}</dd></div> : null}
          <div><dt>Concepto</dt><dd>{r.concepto}</dd></div>
          <div><dt>Importe</dt><dd>{formatMonto(r.importe, r.moneda)}</dd></div>
          <div><dt>Forma de pago</dt><dd>{FORMAS_PAGO_LABELS[r.forma_pago]}</dd></div>
          <div><dt>Fecha cobro</dt><dd>{r.fecha_cobro}</dd></div>
          {r.referencia_bancaria ? <div><dt>Referencia</dt><dd>{r.referencia_bancaria}</dd></div> : null}
          {r.referencia_documento_numero_display ? <div><dt>Factura ref.</dt><dd>{r.referencia_documento_numero_display}</dd></div> : null}
          {r.anulacion_motivo ? <div><dt>Motivo de anulación</dt><dd>{r.anulacion_motivo}</dd></div> : null}
        </dl>
        {r.estado === "BORRADOR" ? (
          <div className="result-actions" style={{ marginTop: "12px" }}>
            <button type="button" className="secondary-action" onClick={() => openEdit(r)}>Editar</button>
            <button type="button" className="primary-action" disabled={saving} onClick={() => void emitirRecibo(r)}>
              {saving ? "Emitiendo…" : "Emitir"}
            </button>
            <button type="button" className="danger-action" onClick={() => setDeleteTarget(r)}>Eliminar</button>
          </div>
        ) : (
          <div className="action-group" style={{ marginTop: "12px" }}>
            <div className="delivery-inline-form">
              <label>
                WhatsApp
                <input inputMode="tel" placeholder="Número de celular" value={whatsappPhone} onChange={(e) => setWhatsappPhone(e.target.value)} />
              </label>
            </div>
            <a
              className="primary-action wide secondary-link-as-button"
              href={buildWhatsAppShareUrl(`${window.location.origin}/verificar/recibo/${r.verification_token}`, whatsappPhone)}
              rel="noreferrer"
              target="_blank"
            >
              Enviar por WhatsApp
            </a>
            <div className="delivery-actions">
              <button className="secondary-action" onClick={() => openPdf(r)} type="button">Ver PDF</button>
              <button className="secondary-action" onClick={() => openXml(r)} type="button">Descargar documento electrónico</button>
              {r.estado === "EMITIDO" ? (
                <button className="danger-action" onClick={() => openAnularModal(r)} type="button">Anular</button>
              ) : null}
            </div>
          </div>
        )}
        {modals}
      </div>
    );
  }

  return (
    <div className="module-view">
      <div className="view-header">
        <button type="button" className="ghost-action" onClick={onBack}>← Volver</button>
        <h2>Cobros / Recibos</h2>
        <button type="button" className="primary-action" onClick={openNew}>+ Nuevo recibo</button>
      </div>
      {error ? <p className="error-banner">{error}</p> : null}
      {loading ? (
        <p className="muted">Cargando recibos...</p>
      ) : recibos.length === 0 ? (
        <p className="muted empty-state">No hay recibos aún. Creá el primero con el botón de arriba.</p>
      ) : (
        <div className="notas-list">
          {recibos.map((r) => (
            <div key={r.id} className="nota-card">
              <div className="nota-card-main">
                <strong>{r.pagador_nombre}</strong>
                <PastillaEstado {...estadoRecibo(r.estado)} />
              </div>
              <div className="nota-card-meta">
                <span>{r.concepto}</span>
                <span>{formatMonto(r.importe, r.moneda)}</span>
                <span>{FORMAS_PAGO_LABELS[r.forma_pago]}</span>
                {r.numero != null ? <span>N° {numeroCorrelativo(r.numero)}</span> : null}
              </div>
              <div className="nota-card-actions">
                <button type="button" className="ghost-action compact" onClick={() => { setSelectedRecibo(r); setWhatsappPhone(""); setSubView("detail"); }}>Ver</button>
                <MenuFila
                  abierto={quickMenuReciboId === r.id}
                  etiqueta={`Acciones para el recibo de ${r.pagador_nombre}`}
                  onAbrir={() => setQuickMenuReciboId(r.id)}
                  onCerrar={() => setQuickMenuReciboId(null)}
                >
                      <button
                        onClick={() => { setSelectedRecibo(r); setWhatsappPhone(""); setSubView("detail"); setQuickMenuReciboId(null); }}
                        role="menuitem"
                        type="button"
                      >
                        Ver detalle
                      </button>
                      {r.estado === "BORRADOR" ? (
                        <>
                          <button onClick={() => { openEdit(r); setQuickMenuReciboId(null); }} role="menuitem" type="button">Editar</button>
                          <button onClick={() => { setQuickMenuReciboId(null); void emitirRecibo(r); }} role="menuitem" type="button">Emitir</button>
                          <button
                            className="destructive-item"
                            onClick={() => { setDeleteTarget(r); setQuickMenuReciboId(null); }}
                            role="menuitem"
                            type="button"
                          >
                            Eliminar
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => quickShare(r)} role="menuitem" type="button">Compartir</button>
                          <button onClick={() => quickWhatsApp(r)} role="menuitem" type="button">WhatsApp</button>
                          <button onClick={() => { setQuickMenuReciboId(null); openPdf(r); }} role="menuitem" type="button">Ver PDF</button>
                          <button onClick={() => { setQuickMenuReciboId(null); openXml(r); }} role="menuitem" type="button">Descargar documento electrónico</button>
                          {r.estado === "EMITIDO" ? (
                            <button className="destructive-item" onClick={() => openAnularModal(r)} role="menuitem" type="button">Anular</button>
                          ) : null}
                        </>
                      )}
                </MenuFila>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="muted" style={{ marginTop: "8px", fontSize: "11px" }}>{total} recibo(s) en total</p>
      {modals}
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/app/sw.js", { scope: "/app/" });
  });
}
