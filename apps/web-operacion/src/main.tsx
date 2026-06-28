import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";
const ACCESS_TOKEN_STORAGE_KEY = "ventax_factura_access_token";
const BUILD_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "dev";

let _updatePending = false;
const _updateListeners: Array<() => void> = [];

function signalUpdatePending(): void {
  if (_updatePending) return;
  _updatePending = true;
  for (const fn of _updateListeners) fn();
}

function useUpdatePending(): boolean {
  const [pending, setPending] = useState(_updatePending);
  useEffect(() => {
    if (_updatePending) { setPending(true); return; }
    const handler = () => setPending(true);
    _updateListeners.push(handler);
    return () => {
      const idx = _updateListeners.indexOf(handler);
      if (idx !== -1) _updateListeners.splice(idx, 1);
    };
  }, []);
  return pending;
}

function checkVersionHeader(response: Response): void {
  if (BUILD_VERSION === "dev") return;
  const serverVersion = response.headers.get("X-App-Version");
  if (serverVersion && serverVersion !== BUILD_VERSION) {
    signalUpdatePending();
  }
}

async function pollVersion(): Promise<void> {
  if (BUILD_VERSION === "dev" || _updatePending) return;
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { cache: "no-store" });
    checkVersionHeader(res);
  } catch {
    // red sin conexion — ignorar
  }
}

function startVersionPolling(): () => void {
  const INTERVAL_MS = 5 * 60 * 1000; // cada 5 minutos
  void pollVersion();
  const id = window.setInterval(() => void pollVersion(), INTERVAL_MS);
  return () => window.clearInterval(id);
}

type ViewState = "checking-session" | "login" | "loading-context" | "operacion" | "onboarding";
type OperationView = "status" | "invoice" | "credit-note" | "documents" | "catalog" | "clients" | "notas" | "recibos";
type CondicionVenta = "CONTADO" | "CREDITO";
type TipoTransaccionServicio = 1 | 2 | 3;
type DocumentoIdentidadTipo = "RUC" | "CI" | "PASAPORTE" | "CEDULA_EXTRANJERA" | "NO_ESPECIFICADO";
type TipoIva = "IVA_10" | "IVA_5" | "EXENTA";
type DocumentoEstado = "EMITIENDO" | "EMITIDA" | "PENDIENTE_SIFEN" | "RECHAZADA" | "ERROR_OPERATIVO" | "ERROR_TEMPORAL" | "ANULADA";
type BeforeInstallPromptChoice = { outcome: "accepted" | "dismissed"; platform?: string };

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<BeforeInstallPromptChoice>;
  prompt: () => Promise<void>;
}

interface UserSummary {
  id: string;
  username: string;
  display_name: string | null;
  role: "OPERADOR_FACTURACION" | "SOPORTE_INTERNO" | "ADMIN_INTERNO";
}

interface AuthResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  user: UserSummary;
  pending_actions?: string[];
}

interface OperationalContextResponse {
  user: UserSummary;
  tenant: {
    id: string;
    name: string;
    status: "ACTIVE" | "SUSPENDED" | "CANCELLED";
  };
  facturador: {
    id: string;
    emisor_id: string;
    razon_social: string;
    ruc: string;
    nombre_fantasia?: string | null;
  };
  fiscal_context: {
    establecimiento: string;
    punto_expedicion: string;
    perfil_emision_codigo: string;
    perfil_emision_alias?: string | null;
    actividad_economica_codigo: string;
    actividad_economica_descripcion: string | null;
    actividad_economica_alias?: string | null;
    timbrado: string;
    timbrado_inicio: string;
    documento_nro: string;
    credito_plazo_dias: number;
    fiscal_envio_modo?: "BATCH" | "SYNC";
    batch_enabled?: boolean | null;
  };
  display?: {
    titulo_operativo: string;
  };
}

interface ReadinessResponse {
  ready: boolean;
  checks: Array<{
    code: string;
    ok: boolean;
    message: string;
  }>;
}

interface ApiErrorResponse {
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
}

class ApiClientError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
  }
}

interface FacturaClienteInput {
  cliente_id?: string | null;
  documento_tipo: DocumentoIdentidadTipo;
  documento: string;
  razon_social: string;
  direccion?: string | null;
  telefono?: string | null;
  email?: string | null;
}

interface FacturaItemInput {
  catalogo_item_id?: string | null;
  codigo?: string | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  iva_tipo: TipoIva;
}

interface FacturaPreviewRequest {
  condicion_venta: CondicionVenta;
  tipo_transaccion: TipoTransaccionServicio;
  credito_plazo_dias?: number | null;
  cliente: FacturaClienteInput;
  items: FacturaItemInput[];
}

interface FacturaPreviewResponse {
  items: Array<FacturaItemInput & {
    line_no: number;
    subtotal: number;
    base_imponible: number;
    iva_monto: number;
    catalogo_item_id: string | null;
  }>;
  totals: {
    subtotal: number;
    total_sin_iva: number;
    iva_5: number;
    iva_10: number;
    total_iva: number;
    total: number;
  };
}

interface DocumentoResponse {
  id: string;
  tipo: "FACTURA" | "NOTA_CREDITO";
  estado: DocumentoEstado;
  condicion_venta: CondicionVenta;
  numero_fiscal: string | null;
  cdc: string | null;
  fiscal_document_id: string | null;
  external_ref: string | null;
  fiscal_envio_modo?: "BATCH" | "SYNC";
  delivery_mode?: "SYNC" | "BATCH" | "AUTO_FALLBACK_BATCH" | null;
  fiscal_idempotent?: boolean | null;
  batch?: Record<string, unknown> | null;
  cliente: FacturaClienteInput;
  items: FacturaPreviewResponse["items"];
  totals: FacturaPreviewResponse["totals"];
  fiscal_status: Record<string, unknown> | null;
  documento_relacionado_id: string | null;
  nce_motivo: string | null;
  delivery: {
    public_url: string | null;
    whatsapp_url: string | null;
    email_status: string;
    artifacts: {
      kude_pdf: { available: boolean; url: string | null };
      xml: { available: boolean; url: string | null };
    };
  };
  created_at: string | null;
}

interface DocumentoListResponse {
  items: DocumentoResponse[];
  total: number;
}

interface NotaCreditoCandidate {
  documento: DocumentoResponse;
  elegible: boolean;
  motivo_no_elegible: string | null;
}

interface NotaCreditoCandidateListResponse {
  items: NotaCreditoCandidate[];
  total: number;
}

interface DeliveryLinkResponse {
  public_url: string;
  whatsapp_url: string;
  token_status: "ACTIVE" | "REVOKED";
}

interface EmailStatusResponse {
  status: DocumentoResponse["delivery"]["email_status"];
  message: string | null;
}

interface DocumentoEventoResponse {
  event_id: string | null;
  type: string | null;
  status: string | null;
  created_at: string | null;
}

interface DocumentoEventosListResponse {
  documento_id: string;
  cdc: string;
  events: DocumentoEventoResponse[];
}

interface DocumentoDecisionResponse {
  documento_id: string;
  emisor_id: string;
  env: "test" | "prod";
  cdc: string | null;
  nro_factura: string | null;
  status: string;
  transmission_evidence: "YES" | "NO" | "UNKNOWN";
  number_state: "CONSUMED" | "REUSABLE" | "REQUIRES_VOID" | "UNCERTAIN";
  decision_confidence: "HIGH" | "MEDIUM" | "LOW";
  reason_codes: string[];
  recommended_action: "RETRY" | "CANCEL_SEND" | "CANCEL_FISCAL" | "VOID_NUMBER" | "WAIT_SYNC" | "NO_ACTION";
  next_step_hint: string | null;
  escalation_required: boolean;
  allowed_actions: Record<string, boolean>;
}

interface DocumentoValidateCdcImpactResponse {
  documento_id: string;
  current_cdc: string | null;
  candidate_cdc: string | null;
  cdc_impact: "CDC_NO_CHANGE" | "CDC_CHANGE";
  reason: string | null;
  allowed_actions: Record<string, boolean>;
}

interface DocumentoGestionResendResponse {
  documento_id: string;
  status: string;
  revision_number: number;
  accepted_by_sifen: boolean;
  cdc: string | null;
  queued_for_batch: boolean | null;
}

interface DocumentoGestionCreateDerivedResponse {
  source_document_id: string;
  derived_document_id: string;
  status: string;
  accepted_by_sifen: boolean;
  cdc: string | null;
  nro_factura: string | null;
}

interface DocumentoGestionCancelSendResponse {
  documento_id: string;
  previous_status: string;
  status: string;
  action_result: string;
  reason_codes: string[];
  recommended_next_action: string;
}

interface DocumentoGestionVoidResponse {
  documento_id: string;
  event_id: string | null;
  status: string;
}

interface BatchPendientesGestionResponse {
  documents_pending: number;
  batches_pending: number;
  documents: Array<{
    document_id: string | null;
    cdc: string | null;
    nro_factura: string | null;
    status: string | null;
    fecha_emision: string | null;
    tipo_documento: string | null;
  }>;
  batches: Array<{
    batch_id: string | null;
    did: string | null;
    dProtConsLote: string | null;
    dCodRes: string | null;
    status: string | null;
    doc_count: number | null;
    result_code: string | null;
    result_message: string | null;
  }>;
}

interface ReconciliacionFiscalResponse {
  items: Array<{
    document_id: string | null;
    cdc: string | null;
    nro_factura: string | null;
    status: string | null;
    fecha_emision: string | null;
    receptor_doc: string | null;
    receptor_nombre: string | null;
  }>;
  next: number | null;
}

interface InvoiceLineDraft {
  id: string;
  catalogo_item_id: string | null;
  codigo: string;
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
  iva_tipo: TipoIva;
  lockedFromCatalog: boolean;
}

interface ClienteSearchResult {
  source: "AGENDA_FACTURADOR" | "IDENTIDAD_COMPARTIDA";
  cliente_id: string | null;
  documento_tipo: DocumentoIdentidadTipo;
  documento: string;
  razon_social: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
}

interface ClienteResponse extends ClienteSearchResult {
  cliente_id: string;
  activo: boolean;
}

interface ClienteListResponse {
  items: ClienteResponse[];
  total: number;
}

interface DnitAutocompleteResponse {
  found: boolean;
  ambiguous: boolean;
  message?: string;
  cliente?: {
    documento_tipo: "RUC" | "CI";
    documento: string;
    razon_social: string;
    nombre: string | null;
    apellido: string | null;
    codigo_dnit: string | null;
    estado: string | null;
  };
}

interface CatalogoItem {
  id: string;
  codigo: string;
  descripcion: string;
  precio_unitario: number;
  iva_tipo: TipoIva;
  activo: boolean;
}

interface CatalogoItemListResponse {
  items: CatalogoItem[];
  total: number;
}

interface CatalogoDraft {
  codigo: string;
  descripcion: string;
  precio_unitario: string;
  iva_tipo: TipoIva;
  activo: boolean;
}

interface InvoiceClientePrefillRequest {
  request_id: number;
  cliente: FacturaClienteInput;
}

function App() {
  const [view, setView] = useState<ViewState>("checking-session");
  const [accessToken, setAccessToken] = useState<string | null>(() => localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY));
  const [user, setUser] = useState<UserSummary | null>(null);
  const [context, setContext] = useState<OperationalContextResponse | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<string[]>([]);

  const api = useMemo(() => createApiClient(accessToken, setAccessToken), [accessToken]);

  useEffect(() => {
    if (accessToken) {
      localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken);
    } else {
      localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    }
  }, [accessToken]);

  useEffect(() => startVersionPolling(), []);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      if (accessToken && (view === "operacion" || view === "onboarding")) {
        return;
      }

      try {
        if (!accessToken) {
          const refreshed = await refreshSession();
          if (!active) {
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
      const [contextResult, readinessResult] = await Promise.allSettled([
        client.get<OperationalContextResponse>("/me/context"),
        client.get<ReadinessResponse>("/me/readiness")
      ]);

      if (!active) {
        return;
      }

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
  }, [accessToken]);

  async function handleLogin(username: string, password: string) {
    setErrorMessage(null);
    const response = await api.post<AuthResponse>("/auth/login", { username, password }, false);
    if (response.pending_actions && response.pending_actions.length > 0) {
      setPendingActions(response.pending_actions);
      setView("onboarding");
    }
    setAccessToken(response.access_token);
    setUser(response.user);
  }

  function handleOnboardingComplete(newAccessToken: string, newUser: UserSummary) {
    setView("loading-context");
    setAccessToken(newAccessToken);
    setUser(newUser);
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
      setView("login");
    }
  }

  if (view === "checking-session" || view === "loading-context") {
    return <LoadingScreen message={view === "checking-session" ? "Verificando sesion" : "Cargando contexto operativo"} />;
  }

  if (view === "login") {
    return <LoginScreen errorMessage={errorMessage} onLogin={handleLogin} onError={setErrorMessage} />;
  }

  if (view === "onboarding") {
    return <OnboardingFlow accessToken={accessToken} onComplete={handleOnboardingComplete} pendingActions={pendingActions} username={user?.username ?? ""} />;
  }

  return (
    <OperationHome
      accessToken={accessToken}
      context={context}
      readiness={readiness}
      setAccessToken={setAccessToken}
      user={user}
      onLogout={handleLogout}
    />
  );
}

function LoginScreen({
  errorMessage,
  onLogin,
  onError
}: {
  errorMessage: string | null;
  onLogin: (username: string, password: string) => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    onError(null);

    try {
      await onLogin(username.trim(), password);
    } catch (error) {
      onError(error instanceof Error ? error.message : "No se pudo iniciar sesion.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="login-title">
        <BrandMark />
        <div className="auth-copy">
          <p className="eyebrow">Operacion</p>
          <h1 id="login-title">Ingresar a facturacion</h1>
        </div>

        <form className="login-form" onSubmit={submit}>
          <label>
            Usuario
            <input
              autoComplete="username"
              inputMode="text"
              name="username"
              onChange={(event) => setUsername(event.target.value)}
              required
              value={username}
            />
          </label>
          <label>
            Contrasena
            <input
              autoComplete="current-password"
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {errorMessage ? <p className="form-error">{errorMessage}</p> : null}

          <button className="primary-action" disabled={submitting} type="submit">
            {submitting ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </section>
    </main>
  );
}

interface TycCurrentData {
  id: string;
  version: string;
  document_content: string;
  context: {
    tenant_nombre: string | null;
    facturador_ruc: string | null;
    facturador_razon_social: string | null;
    plan_nombre: string | null;
    username: string;
    email: string | null;
  };
}

function OnboardingFlow({
  accessToken,
  onComplete,
  pendingActions,
  username
}: {
  accessToken: string | null;
  onComplete: (newAccessToken: string, newUser: UserSummary) => void;
  pendingActions: string[];
  username: string;
}) {
  const needsPasswordChange = pendingActions.includes("CHANGE_PASSWORD");
  const api = useMemo(() => createApiClient(accessToken, () => undefined), [accessToken]);
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
      .catch((err) => setError(err instanceof Error ? err.message : "Error al cargar los Terminos y Condiciones."))
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
      setError(err instanceof Error ? err.message : "Error al cambiar contrasena.");
      setPhase("password");
    } finally {
      setSubmitting(false);
      setTycLoading(false);
    }
  }

  async function handleTycContinue() {
    if (!tycAccepted) {
      setError("Debes leer y aceptar los Terminos y Condiciones para continuar.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
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
        setError(`Tu cuenta (${username}) no tiene correo electronico configurado. Ya le avisamos a Ventax y te van a contactar. Si es urgente, escribi a facturacion@ventax.app indicando tu usuario.`);
      } else {
        setError(err instanceof Error ? err.message : "Error al solicitar codigo de verificacion.");
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
      onComplete(result.access_token, result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al completar la activacion.");
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
        setError(`Tu cuenta (${username}) no tiene correo electronico configurado. Ya le avisamos a Ventax y te van a contactar. Si es urgente, escribi a facturacion@ventax.app indicando tu usuario.`);
      } else {
        setError(err instanceof Error ? err.message : "Error al reenviar codigo.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const phaseTitle =
    phase === "password" ? "Crear nueva contrasena" :
    phase === "tyc" ? "Terminos y Condiciones" :
    "Verificacion por correo";

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="onboarding-title">
        <BrandMark />
        <div className="auth-copy">
          <p className="eyebrow">Activacion de cuenta</p>
          <h1 id="onboarding-title">{phaseTitle}</h1>
        </div>

        {phase === "password" ? (
          <form className="login-form" onSubmit={(e) => void handlePasswordSubmit(e)}>
            <p className="muted">Crea una contrasena segura. Minimo 8 caracteres.</p>
            <label>
              Nueva contrasena
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
              Confirmar contrasena
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
              <p className="muted">Cargando terminos...</p>
            ) : tyc ? (
              <>
                <section aria-label="Datos de tu cuenta">
                  <p className="eyebrow">Datos de tu cuenta</p>
                  <dl className="receipt-summary">
                    <div><dt>Empresa</dt><dd>{tyc.context.tenant_nombre ?? "-"}</dd></div>
                    <div><dt>RUC</dt><dd>{tyc.context.facturador_ruc ?? "-"}</dd></div>
                    <div><dt>Razon social</dt><dd>{tyc.context.facturador_razon_social ?? "-"}</dd></div>
                    <div><dt>Plan</dt><dd>{tyc.context.plan_nombre ?? "-"}</dd></div>
                    <div><dt>Usuario</dt><dd>{tyc.context.username}</dd></div>
                    <div><dt>Email</dt><dd>{tyc.context.email ?? "-"}</dd></div>
                  </dl>
                </section>
                <section aria-label="Documento de terminos" style={{ maxHeight: "40vh", overflowY: "auto", border: "1px solid var(--color-border, #ccc)", borderRadius: "8px", padding: "1rem", margin: "1rem 0" }}>
                  <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "0.85rem", margin: 0 }}>{tyc.document_content}</pre>
                </section>
                <label style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", cursor: "pointer", marginBottom: "1rem" }}>
                  <input
                    checked={tycAccepted}
                    onChange={(e) => setTycAccepted(e.target.checked)}
                    style={{ marginTop: "0.2rem", flexShrink: 0 }}
                    type="checkbox"
                  />
                  <span>He leido y acepto los Terminos y Condiciones (version {tyc.version})</span>
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
              <p className="form-error">No se pudo cargar los terminos. Recarga la pagina.</p>
            )}
          </div>
        ) : (
          <form className="login-form" onSubmit={(e) => void handleOtpSubmit(e)}>
            <p className="muted">
              Ingresa el codigo de 6 digitos enviado a {otpEmailMask ?? "tu correo electronico"}.
            </p>
            <label>
              Codigo de verificacion
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
              {otpCooldown > 0 ? `Reenviar en ${otpCooldown}s` : "Reenviar codigo"}
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
  setAccessToken,
  user,
  onLogout
}: {
  accessToken: string | null;
  context: OperationalContextResponse | null;
  readiness: ReadinessResponse | null;
  setAccessToken: (token: string | null) => void;
  user: UserSummary | null;
  onLogout: () => Promise<void>;
}) {
  const canEmit = Boolean(readiness?.ready);
  const [operationView, setOperationView] = useState<OperationView>(() => (canEmit ? "invoice" : "status"));
  const [menuOpen, setMenuOpen] = useState(false);
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
          email: cliente.email ?? ""
        }
      });
    }, 0);
  }

  const menuItems: Array<{
    label: string;
    view: OperationView;
    disabled?: boolean;
    icon: string;
    group: "primary" | "secondary" | "admin";
    featured?: boolean;
  }> = [
    { label: "Nueva factura", view: "invoice", disabled: !canEmit, icon: "🧾", group: "primary", featured: true },
    { label: "Agenda / Clientes", view: "clients", icon: "👥", group: "primary" },
    { label: "Documentos", view: "documents", icon: "📂", group: "primary" },
    { label: "Notas / Presupuestos", view: "notas", icon: "📋", group: "secondary" },
    { label: "Cobros / Recibos", view: "recibos", icon: "💵", group: "secondary" },
    { label: "Catalogo", view: "catalog", icon: "📦", group: "secondary" },
    { label: "Devolver factura", view: "credit-note", disabled: !canEmit, icon: "↩", group: "secondary" },
    { label: "Informacion y estado", view: "status", icon: "🛡", group: "admin" }
  ];
  const menuSections: Array<{ title: string; key: "primary" | "secondary" | "admin" }> = [
    { title: "Operaciones principales", key: "primary" },
    { title: "Operaciones secundarias", key: "secondary" },
    { title: "Administracion", key: "admin" }
  ];

  return (
    <main className="operation-shell">
      <header className="topbar">
        <button
          aria-expanded={menuOpen}
          aria-label="Abrir menu"
          className="hamburger-action"
          onClick={() => setMenuOpen((current) => !current)}
          type="button"
        >
          <span />
          <span />
          <span />
        </button>
        <div className="topbar-title">
          <strong>{context?.facturador.nombre_fantasia?.trim() || getOperationalTitle(context)}</strong>
          <BrandMark compact />
        </div>
        <button className="ghost-action compact" onClick={() => void onLogout()} type="button">
          Salir
        </button>
      </header>

      {menuOpen ? (
        <div className="menu-scrim" onClick={() => setMenuOpen(false)} role="presentation">
          <nav className="mobile-menu" aria-label="Navegacion principal" onClick={(event) => event.stopPropagation()}>
            <div>
              <p className="eyebrow">Menu</p>
              <h2>Operacion</h2>
              <p className="muted">{getOperationalTitle(context)}</p>
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
                        operationView === item.view ? "active" : "",
                        item.featured ? "menu-item-featured" : ""
                      ].filter(Boolean).join(" ")}
                      disabled={item.disabled}
                      key={item.view}
                      onClick={() => goTo(item.view)}
                      type="button"
                    >
                      <span className="menu-item-icon" aria-hidden="true">{item.icon}</span>
                      <span>{item.label}</span>
                      {item.featured ? <strong className="menu-item-badge">Recomendado</strong> : null}
                      <small>{getOperationViewHint(item.view)}</small>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <button className="menu-exit-action wide" onClick={() => void onLogout()} type="button">
              🚪 Salir
            </button>
          </nav>
        </div>
      ) : null}

      {updatePending ? (
        <section className="update-banner" aria-live="assertive">
          <div>
            <strong>Nueva version disponible</strong>
            <small>Hay una actualizacion lista. Toca el boton para cargarla ahora.</small>
          </div>
          <button className="primary-action" onClick={() => window.location.reload()} type="button">
            Actualizar
          </button>
        </section>
      ) : null}

      {showInstallHint && !isStandalone && !updatePending ? (
        <section className="install-banner" aria-live="polite">
          <div>
            <strong>Instala Ventax en tu dispositivo</strong>
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
          accessToken={accessToken}
          canEmit={canEmit}
          context={context}
          clientePrefillRequest={invoiceClientePrefill}
          initialDraft={invoiceInitialDraft}
          readiness={readiness}
          setAccessToken={setAccessToken}
          onBack={() => { setInvoiceInitialDraft(null); goTo("status"); }}
        />
      ) : operationView === "credit-note" ? (
        <CreditNoteView
          accessToken={accessToken}
          setAccessToken={setAccessToken}
          onBack={() => goTo("status")}
        />
      ) : operationView === "documents" ? (
        <DocumentsView
          accessToken={accessToken}
          setAccessToken={setAccessToken}
          onBack={() => goTo("invoice")}
          onGoTo={goTo}
          role={user?.role ?? "OPERADOR_FACTURACION"}
        />
      ) : operationView === "clients" ? (
        <ClientesAgendaView
          accessToken={accessToken}
          onBack={() => goTo("invoice")}
          onUseCliente={useClienteFromAgenda}
          setAccessToken={setAccessToken}
        />
      ) : operationView === "catalog" ? (
        <CatalogView accessToken={accessToken} setAccessToken={setAccessToken} onBack={() => goTo("invoice")} />
      ) : operationView === "notas" ? (
        <NotasView
          accessToken={accessToken}
          setAccessToken={setAccessToken}
          onBack={() => goTo("invoice")}
          onConvertirEnFactura={(draft) => { setInvoiceInitialDraft(draft); goTo("invoice"); }}
        />
      ) : operationView === "recibos" ? (
        <RecibosView accessToken={accessToken} setAccessToken={setAccessToken} onBack={() => goTo("invoice")} />
      ) : (
        <StatusView
          canEmit={canEmit}
          context={context}
          readiness={readiness}
          user={user}
          onGoTo={goTo}
        />
      )}
    </main>
  );
}

function StatusView({
  canEmit,
  context,
  readiness,
  user,
  onGoTo
}: {
  canEmit: boolean;
  context: OperationalContextResponse | null;
  readiness: ReadinessResponse | null;
  user: UserSummary | null;
  onGoTo: (view: OperationView) => void;
}) {
  const businessChecks = mapBusinessReadinessChecks(readiness?.checks ?? []);
  const statusLabel = canEmit ? "Listo para facturar" : "Faltan requisitos para facturar";

  return (
    <>
      <section className="facturador-band" aria-label="Contexto operativo">
        <div>
          <p className="eyebrow">Facturador</p>
          <h1>{getOperationalTitle(context)}</h1>
          <p className="muted">
            {context ? `${context.facturador.razon_social} · RUC ${context.facturador.ruc}` : "Configuracion operativa incompleta"}
          </p>
        </div>
        <span className={canEmit ? "status-pill ready" : "status-pill blocked"}>{canEmit ? "Listo" : "Bloqueado"}</span>
      </section>

      <section className="readiness-grid">
        <article className="context-card">
          <p className="eyebrow">Sesion</p>
          <h2>{user?.display_name ?? user?.username ?? "Operador"}</h2>
          <dl>
            <div>
              <dt>Establecimiento</dt>
              <dd>{context?.fiscal_context.establecimiento ?? "-"}</dd>
            </div>
            <div>
              <dt>Punto</dt>
              <dd>{context?.fiscal_context.punto_expedicion ?? "-"}</dd>
            </div>
            <div>
              <dt>Perfil</dt>
              <dd>{formatPerfilOperativo(context)}</dd>
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
          Catalogo
        </button>
        <button className="secondary-action wide" disabled={!canEmit} onClick={() => onGoTo("credit-note")} type="button">
          Nueva nota de credito
        </button>
      </section>
    </>
  );
}

function DocumentsView({
  accessToken,
  setAccessToken,
  onBack,
  onGoTo,
  role
}: {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  onBack: () => void;
  onGoTo?: (view: OperationView) => void;
  role: UserSummary["role"];
}) {
  const api = useMemo(() => createApiClient(accessToken, setAccessToken), [accessToken, setAccessToken]);
  const todayYmd = useMemo(() => formatYmdFromDate(new Date()), []);
  const last7DaysYmd = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 6);
    return formatYmdFromDate(date);
  }, []);
  const [documents, setDocuments] = useState<DocumentoResponse[]>([]);
  const [selected, setSelected] = useState<DocumentoResponse | null>(null);
  const [estadoFilter, setEstadoFilter] = useState<DocumentoEstado | "">("");
  const [docKindTab, setDocKindTab] = useState<"FACTURAS" | "NOTAS_CREDITO">("FACTURAS");
  const [tipoOperativoFilter, setTipoOperativoFilter] = useState<"TODOS" | "CONTADO" | "CREDITO">("TODOS");
  const [query, setQuery] = useState("");
  const [desde, setDesde] = useState(last7DaysYmd);
  const [hasta, setHasta] = useState(todayYmd);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [quickMenuDocId, setQuickMenuDocId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveryLink, setDeliveryLink] = useState<DeliveryLinkResponse | null>(null);
  const [emailStatus, setEmailStatus] = useState<EmailStatusResponse | null>(null);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [eventos, setEventos] = useState<DocumentoEventosListResponse | null>(null);
  const [batchPendientes, setBatchPendientes] = useState<BatchPendientesGestionResponse | null>(null);
  const [reconciliacion, setReconciliacion] = useState<ReconciliacionFiscalResponse | null>(null);
  const [gestionTab, setGestionTab] = useState<"STATUS" | "EVENTOS" | "PENDIENTES" | "RECONCILIACION">("STATUS");
  const [gestionLoading, setGestionLoading] = useState(false);
  const [decision, setDecision] = useState<DocumentoDecisionResponse | null>(null);
  const [cdcImpact, setCdcImpact] = useState<DocumentoValidateCdcImpactResponse | null>(null);
  const [reasonModal, setReasonModal] = useState<{
    action: "CANCEL_DETAIL" | "CANCEL_LIST" | "CREDIT_NOTE_DETAIL" | "CREDIT_NOTE_LIST" | "VOID_NUMBER";
    documentoId: string;
    tipo?: DocumentoResponse["tipo"];
  } | null>(null);
  const [reasonDraft, setReasonDraft] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [notaCreditoPopup, setNotaCreditoPopup] = useState<DocumentoResponse | null>(null);
  const isInternalSupport = role !== "OPERADOR_FACTURACION";

  useEffect(() => {
    void loadDocuments();
  }, [estadoFilter, tipoOperativoFilter, desde, hasta, docKindTab]);

  async function loadDocuments(nextQuery = query) {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ limit: "30", offset: "0" });
    params.set("tipo", docKindTab === "NOTAS_CREDITO" ? "NOTA_CREDITO" : "FACTURA");
    if (estadoFilter) {
      params.set("estado", estadoFilter);
    }
    if (docKindTab === "FACTURAS" && tipoOperativoFilter !== "TODOS") {
      params.set("tipo_operativo", tipoOperativoFilter);
    }
    if (nextQuery.trim()) {
      params.set("q", nextQuery.trim());
    }
    if (desde) {
      params.set("desde", desde);
    }
    if (hasta) {
      params.set("hasta", hasta);
    }

    try {
      const result = await api.get<DocumentoListResponse>(`/facturas?${params.toString()}`);
      setDocuments(result.items);
      setSelected((current) => (current ? result.items.find((item) => item.id === current.id) ?? current : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el listado.");
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(documentoId: string) {
    setActionLoading(true);
    setError(null);
    setMessage(null);
    setDeliveryLink(null);
    setEmailStatus(null);

    try {
      const detail = await api.get<DocumentoResponse>(`/facturas/${documentoId}`);
      setSelected(detail);
      await loadDeliveryFor(detail);
      if (isInternalSupport) {
        try {
          const detailDecision = await api.get<DocumentoDecisionResponse>(`/facturas/${documentoId}/gestion/decision`);
          setDecision(detailDecision);
        } catch {
          setDecision(null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el detalle.");
    } finally {
      setActionLoading(false);
    }
  }

  async function validateSelectedCdcImpact() {
    if (!selected || !isInternalSupport) {
      return;
    }
    setActionLoading(true);
    try {
      const result = await api.post<DocumentoValidateCdcImpactResponse>(`/facturas/${selected.id}/gestion/validate-cdc-impact`, {});
      setCdcImpact(result);
      setMessage(`Impacto CDC: ${result.cdc_impact}.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo validar impacto CDC.");
    } finally {
      setActionLoading(false);
    }
  }

  async function retrySameCdcAction() {
    if (!selected || !isInternalSupport) {
      return;
    }
    const comment = window.prompt("Comentario de soporte (opcional)", "") ?? "";
    setActionLoading(true);
    try {
      const result = await api.post<DocumentoGestionResendResponse>(`/facturas/${selected.id}/gestion/retry-same-cdc`, {
        mode: "BATCH",
        send_now: false,
        comment: comment.trim() || undefined
      });
      setMessage(`Reintento enviado. Revision ${result.revision_number}.`);
      await openDetail(selected.id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo reintentar con mismo CDC.");
    } finally {
      setActionLoading(false);
    }
  }

  async function createDerivedAction() {
    if (!selected || !isInternalSupport) {
      return;
    }
    const comment = window.prompt("Motivo/Comentario de derivación", "");
    if (!comment?.trim()) {
      return;
    }
    setActionLoading(true);
    try {
      const result = await api.post<DocumentoGestionCreateDerivedResponse>(`/facturas/${selected.id}/gestion/create-derived`, {
        mode: "BATCH",
        send_now: false,
        comment: comment.trim()
      });
      setMessage(`DE derivado creado: ${result.derived_document_id}.`);
      await loadDocuments();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo crear DE derivado.");
    } finally {
      setActionLoading(false);
    }
  }

  async function cancelSendAction() {
    if (!selected || !isInternalSupport) {
      return;
    }
    if (!window.confirm("Cancelar envío local del documento en cola batch?")) {
      return;
    }
    setActionLoading(true);
    try {
      const result = await api.post<DocumentoGestionCancelSendResponse>(`/facturas/${selected.id}/gestion/cancel-send`, {});
      setMessage(`Envio cancelado. Resultado: ${result.action_result}.`);
      await openDetail(selected.id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo cancelar envío local.");
    } finally {
      setActionLoading(false);
    }
  }

  async function voidNumberAction() {
    if (!selected || !isInternalSupport) {
      return;
    }
    openReasonModal("VOID_NUMBER", selected.id);
  }

  function openReasonModal(
    action: "CANCEL_DETAIL" | "CANCEL_LIST" | "CREDIT_NOTE_DETAIL" | "CREDIT_NOTE_LIST" | "VOID_NUMBER",
    documentoId: string,
    tipo?: DocumentoResponse["tipo"]
  ) {
    setReasonModal({ action, documentoId, tipo });
    setReasonDraft("");
    setReasonError(null);
  }

  function closeReasonModal() {
    setReasonModal(null);
    setReasonDraft("");
    setReasonError(null);
  }

  async function submitReasonModal() {
    if (!reasonModal) {
      return;
    }
    const motivo = reasonDraft.trim();
    if (!motivo) {
      setReasonError("Ingrese un motivo para continuar.");
      return;
    }
    if (motivo.length < 3) {
      setReasonError("El motivo debe tener al menos 3 caracteres.");
      return;
    }

    setReasonError(null);
    setActionLoading(true);
    setMessage(null);

    try {
      if (reasonModal.action === "CANCEL_DETAIL") {
        const updated = await api.post<DocumentoResponse>(`/facturas/${reasonModal.documentoId}/cancelar`, { motivo });
        setSelected(updated);
        setDocuments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setMessage("Documento anulado.");
        await loadDeliveryFor(updated);
      } else if (reasonModal.action === "CANCEL_LIST") {
        await api.post<DocumentoResponse>(`/facturas/${reasonModal.documentoId}/cancelar`, { motivo });
        setMessage("Documento anulado.");
        await loadDocuments();
      } else if (reasonModal.action === "CREDIT_NOTE_DETAIL") {
        const notaCredito = await api.request<DocumentoResponse>(`/facturas/${reasonModal.documentoId}/nota-credito`, {
          method: "POST",
          headers: {
            "Idempotency-Key": createIdempotencyKey()
          },
          body: JSON.stringify({ motivo })
        });
        setSelected(notaCredito);
        setDocuments((current) => [notaCredito, ...current.filter((item) => item.id !== notaCredito.id)]);
        setDeliveryLink(null);
        setEmailStatus(null);
        setNotaCreditoPopup(notaCredito);
        await loadDeliveryFor(notaCredito);
      } else if (reasonModal.action === "CREDIT_NOTE_LIST") {
        const notaCredito = await api.request<DocumentoResponse>(`/facturas/${reasonModal.documentoId}/nota-credito`, {
          method: "POST",
          headers: {
            "Idempotency-Key": createIdempotencyKey()
          },
          body: JSON.stringify({ motivo })
        });
        setSelected(notaCredito);
        setDocuments((current) => [notaCredito, ...current.filter((item) => item.id !== notaCredito.id)]);
        setDeliveryLink(null);
        setEmailStatus(null);
        setNotaCreditoPopup(notaCredito);
        await loadDeliveryFor(notaCredito);
      } else {
        const result = await api.post<DocumentoGestionVoidResponse>(`/facturas/${reasonModal.documentoId}/gestion/void-number`, {
          motivo
        });
        setMessage(`Inutilización solicitada. Evento: ${result.event_id ?? "sin id"}.`);
        await loadEventosDocumento();
      }
      closeReasonModal();
    } catch (err) {
      setReasonError(err instanceof Error ? err.message : "No se pudo procesar la acción.");
    } finally {
      setActionLoading(false);
    }
  }

  async function loadDeliveryFor(documento: DocumentoResponse, regenerate = false) {
    try {
      const [link, email] = await Promise.all([
        api.post<DeliveryLinkResponse>(`/facturas/${documento.id}/delivery-link`, { regenerate }),
        api.get<EmailStatusResponse>(`/facturas/${documento.id}/email-status`)
      ]);
      setDeliveryLink(link);
      setEmailStatus(email);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudieron cargar acciones de entrega.");
    }
  }

  async function refreshSelectedStatus() {
    if (!selected) {
      return;
    }

    setActionLoading(true);
    setMessage(null);

    try {
      const updated = await api.post<DocumentoResponse>(`/facturas/${selected.id}/refresh-status`, {});
      setSelected(updated);
      setDocuments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      await loadDeliveryFor(updated);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo refrescar estado.");
    } finally {
      setActionLoading(false);
    }
  }

  async function retrySelectedEmission() {
    if (!selected) {
      return;
    }

    setActionLoading(true);
    setMessage(null);

    try {
      const updated = await api.post<DocumentoResponse>(`/facturas/${selected.id}/retry-emission`, {});
      setSelected(updated);
      setDocuments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo reintentar emision.");
    } finally {
      setActionLoading(false);
    }
  }

  async function cancelSelectedDocumento() {
    if (!selected) {
      return;
    }
    openReasonModal("CANCEL_DETAIL", selected.id, selected.tipo);
  }

  async function emitSelectedNotaCredito() {
    if (!selected) {
      return;
    }
    openReasonModal("CREDIT_NOTE_DETAIL", selected.id);
  }

  async function emitNotaCreditoFromList(documentoId: string) {
    openReasonModal("CREDIT_NOTE_LIST", documentoId);
  }

  async function cancelDocumentoFromList(documentoId: string, tipo?: DocumentoResponse["tipo"]) {
    openReasonModal("CANCEL_LIST", documentoId, tipo);
  }

  async function openQuickShare(documento: DocumentoResponse, mode: "public" | "whatsapp") {
    setActionLoading(true);
    setMessage(null);
    try {
      const link = await api.post<DeliveryLinkResponse>(`/facturas/${documento.id}/delivery-link`, {});
      const targetUrl = mode === "whatsapp" ? link.whatsapp_url : link.public_url;
      window.open(targetUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo abrir accion rapida.");
    } finally {
      setActionLoading(false);
      setQuickMenuDocId(null);
    }
  }

  async function copyDetailLink() {
    if (!deliveryLink?.public_url) {
      return;
    }

    try {
      await navigator.clipboard.writeText(deliveryLink.public_url);
      setMessage("Link copiado.");
    } catch {
      setMessage(deliveryLink.public_url);
    }
  }

  async function loadEventosDocumento() {
    if (!selected) {
      setMessage("Seleccione un documento para consultar historial.");
      return;
    }

    setGestionLoading(true);
    setGestionTab("EVENTOS");
    try {
      const result = await api.get<DocumentoEventosListResponse>(`/facturas/${selected.id}/eventos`);
      setEventos(result);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo consultar historial del documento.");
    } finally {
      setGestionLoading(false);
    }
  }

  async function loadBatchPendientes() {
    setGestionLoading(true);
    setGestionTab("PENDIENTES");
    try {
      const result = await api.get<BatchPendientesGestionResponse>("/facturas/gestion/batch-pendientes?limit=20&offset=0");
      setBatchPendientes(result);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo consultar documentos en espera.");
    } finally {
      setGestionLoading(false);
    }
  }

  async function loadReconciliacion() {
    setGestionLoading(true);
    setGestionTab("RECONCILIACION");
    try {
      const result = await api.get<ReconciliacionFiscalResponse>("/facturas/gestion/reconciliacion?limit=20&offset=0");
      setReconciliacion(result);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo comparar con registro fiscal.");
    } finally {
      setGestionLoading(false);
    }
  }

  const selectedSifenSummary = selected ? getSifenSummary(selected) : null;
  const selectedKudeUrl = selected && deliveryLink && selected.delivery.artifacts.kude_pdf.available ? `${deliveryLink.public_url}/kude.pdf` : null;
  const selectedXmlUrl = selected && deliveryLink && selected.delivery.artifacts.xml.available ? `${deliveryLink.public_url}/xml` : null;
  const hasRecentWindow = Boolean(desde || hasta);
  const [todayDocs, weekDocs] = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const tomorrowStart = todayStart + 24 * 60 * 60 * 1000;
    const currentWeekDocs: DocumentoResponse[] = [];
    const currentTodayDocs: DocumentoResponse[] = [];

    for (const documento of documents) {
      const rawDate = documento.created_at ? Date.parse(documento.created_at) : NaN;
      if (Number.isNaN(rawDate)) {
        currentWeekDocs.push(documento);
        continue;
      }
      if (rawDate >= todayStart && rawDate < tomorrowStart) {
        currentTodayDocs.push(documento);
      } else {
        currentWeekDocs.push(documento);
      }
    }

    return [currentTodayDocs, currentWeekDocs];
  }, [documents]);

  return (
    <section className="documents-view" aria-labelledby="documents-title">
      <div className="editor-heading">
        <div>
          <p className="eyebrow">Documentos</p>
          <h2 id="documents-title">Facturas y notas</h2>
        </div>
        <button className="ghost-action" onClick={onBack} type="button">
          Volver
        </button>
      </div>

      {!selected ? (
      <section className="documents-filters">
        <div className="filter-tabs" role="group" aria-label="Tipo de documento">
          {(["FACTURAS", "NOTAS_CREDITO"] as const).map((value) => (
            <button
              className={docKindTab === value ? "active" : ""}
              key={value}
              onClick={() => setDocKindTab(value)}
              type="button"
            >
              {value === "FACTURAS" ? "Facturas" : "Notas de credito"}
            </button>
          ))}
        </div>
        <label>
          Buscar
          <input
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void loadDocuments();
              }
            }}
            placeholder="Buscar factura..."
            value={query}
          />
        </label>
        <div className="quick-actions-row compact">
          <button className="secondary-action" disabled={loading} onClick={() => void loadDocuments()} type="button">
            {loading ? "Cargando..." : "Buscar"}
          </button>
          <button className="secondary-action" onClick={() => setShowAdvancedFilters((current) => !current)} type="button">
            {showAdvancedFilters ? "Ocultar filtros" : "Mas filtros"}
          </button>
          {!showAdvancedFilters ? (
            <button
              className="secondary-action"
              onClick={() => {
                setShowAdvancedFilters(true);
                setDesde("");
                setHasta("");
              }}
              type="button"
            >
              Buscar mas documentos
            </button>
          ) : null}
        </div>
        {showAdvancedFilters ? (
          <div className="documents-advanced-filters">
            <label>
              Estado
              <select onChange={(event) => setEstadoFilter(event.target.value as DocumentoEstado | "")} value={estadoFilter}>
                <option value="">Todos</option>
                <option value="EMITIENDO">Emitiendo</option>
                <option value="EMITIDA">Emitida</option>
                <option value="PENDIENTE_SIFEN">Pendiente SIFEN</option>
                <option value="RECHAZADA">Rechazada</option>
                <option value="ERROR_TEMPORAL">Error temporal</option>
                <option value="ERROR_OPERATIVO">Error operativo</option>
                <option value="ANULADA">Anulada</option>
              </select>
            </label>
            {docKindTab === "FACTURAS" ? (
              <label>
                Tipo factura
                <select onChange={(event) => setTipoOperativoFilter(event.target.value as "TODOS" | "CONTADO" | "CREDITO")} value={tipoOperativoFilter}>
                  <option value="TODOS">Todas</option>
                  <option value="CONTADO">Contado</option>
                  <option value="CREDITO">Credito</option>
                </select>
              </label>
            ) : null}
            <label>
              Desde
              <input onChange={(event) => setDesde(event.target.value)} type="date" value={desde} />
            </label>
            <label>
              Hasta
              <input onChange={(event) => setHasta(event.target.value)} type="date" value={hasta} />
            </label>
          </div>
        ) : null}
      </section>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}

      {!selected && role !== "OPERADOR_FACTURACION" ? (
      <section className="document-management" aria-label="Gestion de documentos">
        <header className="document-management-header">
          <h3>Gestion de documentos</h3>
          <p className="muted">Accesos rapidos para seguimiento y autogestion operativa.</p>
        </header>
        <div className="document-management-grid">
          <article className="document-management-card">
            <h4>Estado de mis documentos</h4>
            <p className="muted">Revise emision, pendientes y rechazados en un solo lugar.</p>
            <button className="secondary-action" onClick={() => setGestionTab("STATUS")} type="button">
              Ver estado
            </button>
          </article>
          <article className="document-management-card">
            <h4>Historial del documento</h4>
            <p className="muted">Consulte eventos y cambios de estado por comprobante.</p>
            <button className="secondary-action" onClick={() => void loadEventosDocumento()} type="button">
              Consultar historial
            </button>
          </article>
          <article className="document-management-card">
            <h4>Documentos en espera de confirmacion</h4>
            <p className="muted">Identifique comprobantes pendientes de respuesta fiscal.</p>
            <button className="secondary-action" onClick={() => void loadBatchPendientes()} type="button">
              Ver pendientes
            </button>
          </article>
          <article className="document-management-card">
            <h4>Comparar con registro fiscal</h4>
            <p className="muted">Contraste documentos operativos contra el registro fiscal.</p>
            <button className="secondary-action" onClick={() => void loadReconciliacion()} type="button">
              Comparar
            </button>
          </article>
        </div>
        {gestionLoading ? <p className="muted">Consultando gestion de documentos...</p> : null}
        {gestionTab === "EVENTOS" && eventos ? (
          <div className="document-management-results">
            <strong>Historial del documento</strong>
            {eventos.events.length === 0 ? <p className="muted">Sin eventos registrados para este documento.</p> : null}
            {eventos.events.map((event) => (
              <p className="muted" key={`${event.event_id ?? "evt"}-${event.created_at ?? "time"}`}>
                {(event.type ?? "EVENTO")} · {(event.status ?? "SIN_ESTADO")} · {event.created_at ?? "sin fecha"}
              </p>
            ))}
          </div>
        ) : null}
        {gestionTab === "PENDIENTES" && batchPendientes ? (
          <div className="document-management-results">
            <strong>Documentos en espera de confirmacion</strong>
            <p className="muted">
              Documentos: {batchPendientes.documents_pending} · Lotes: {batchPendientes.batches_pending}
            </p>
          </div>
        ) : null}
        {gestionTab === "RECONCILIACION" && reconciliacion ? (
          <div className="document-management-results">
            <strong>Comparar con registro fiscal</strong>
            {reconciliacion.items.length === 0 ? <p className="muted">Sin diferencias visibles para la consulta actual.</p> : null}
            {reconciliacion.items.slice(0, 3).map((item) => (
              <p className="muted" key={`${item.document_id ?? "doc"}-${item.cdc ?? "cdc"}`}>
                {(item.nro_factura ?? "sin numero")} · {(item.status ?? "sin estado")} · {(item.receptor_nombre ?? "sin receptor")}
              </p>
            ))}
          </div>
        ) : null}
      </section>
      ) : null}

      {!selected ? (
      <section className="documents-layout">
        <div className="documents-list">
          {documents.length === 0 && !loading ? <p className="muted empty-state">Sin documentos para los filtros actuales.</p> : null}
          {hasRecentWindow ? <h3 className="documents-group-title">Hoy</h3> : null}
          {todayDocs.map((documento) => (
            <article className="document-row document-row-rich" key={documento.id}>
              <button className="document-row-main" onClick={() => void openDetail(documento.id)} type="button">
                <span>
                  <strong>{`${getDocumentoStatusIcon(documento.estado)} ${formatDocumentoTipo(documento.tipo)} ${documento.numero_fiscal ?? "pendiente"}`}</strong>
                  <small>{documento.cliente.razon_social}</small>
                </span>
                <span>
                  <strong>{formatGuaranies(documento.totals.total)}</strong>
                  <small>{formatShortDate(documento.created_at)}</small>
                </span>
              </button>
              <div className="document-row-menu-wrapper">
                <button className="icon-menu-action" onClick={() => setQuickMenuDocId((current) => current === documento.id ? null : documento.id)} type="button">⋮</button>
                {quickMenuDocId === documento.id ? (
                  <div className="client-row-menu" role="menu" aria-label="Acciones del documento">
                    <button onClick={() => void openDetail(documento.id)} role="menuitem" type="button">Ver detalle</button>
                    <button onClick={() => void openQuickShare(documento, "public")} role="menuitem" type="button">Compartir</button>
                    <button onClick={() => void openQuickShare(documento, "whatsapp")} role="menuitem" type="button">WhatsApp</button>
                    <button onClick={() => void emitNotaCreditoFromList(documento.id)} role="menuitem" type="button">Nota de credito</button>
                    <button className="destructive-item" onClick={() => void cancelDocumentoFromList(documento.id, documento.tipo)} role="menuitem" type="button">Anular</button>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
          {hasRecentWindow ? <h3 className="documents-group-title">Ultimos 7 dias</h3> : null}
          {(hasRecentWindow ? weekDocs : documents).map((documento) => (
            <button
              className="document-row"
              key={documento.id}
              onClick={() => void openDetail(documento.id)}
              type="button"
            >
              <span>
                <strong>{`${getDocumentoStatusIcon(documento.estado)} ${documento.numero_fiscal ?? "Numero pendiente"}`}</strong>
                <small>{documento.cliente.razon_social}</small>
              </span>
              <span>
                <strong>{formatGuaranies(documento.totals.total)}</strong>
                <small>{formatShortDate(documento.created_at)}</small>
              </span>
            </button>
          ))}
        </div>
      </section>
      ) : null}

        {selected ? (
        <aside className="document-detail" aria-live="polite">
          {selected ? (
            <>
              <div className="receipt-heading">
                <div>
                  <p className="eyebrow">Documento</p>
                  <h3>{formatDocumentoEstadoSimple(selected.estado, selected.tipo)}</h3>
                  <p className="muted">{formatDocumentoTipo(selected.tipo)} · Numero {selected.numero_fiscal ?? "pendiente"}</p>
                </div>
                <span className={selected.estado === "EMITIDA" ? "status-pill ready" : "status-pill blocked"}>
                  {formatDocumentoEstadoSimple(selected.estado, selected.tipo)}
                </span>
              </div>
              <button className="ghost-action" onClick={() => setSelected(null)} type="button">
                ← Volver a resultados
              </button>

              <div className="receipt-summary">
                <div>
                  <dt>Cliente</dt>
                  <dd>{selected.cliente.razon_social}</dd>
                </div>
                <div>
                  <dt>Documento</dt>
                  <dd>{selected.cliente.documento}</dd>
                </div>
                <div>
                  <dt>Total</dt>
                  <dd>{formatGuaranies(selected.totals.total)}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{formatEmailStatus(emailStatus?.status ?? selected.delivery.email_status)}</dd>
                </div>
              </div>

              <section className="invoice-lines" aria-label="Productos vendidos">
                <h4>Productos vendidos</h4>
                <div className="invoice-lines-list">
                  {selected.items.map((item) => (
                    <article className="invoice-line-card" key={`${selected.id}-${item.line_no}`}>
                      <strong>
                        {item.cantidad} x {item.descripcion}
                      </strong>
                      <small>{formatGuaranies(item.subtotal)}</small>
                    </article>
                  ))}
                </div>
              </section>

              {getRecoverableMessage(selected) ? <p className="editor-alert blocked">{getRecoverableMessage(selected)}</p> : null}
              {selected.estado === "RECHAZADA" ? (
                <p className="editor-alert blocked">{getRejectedSifenMessage(selectedSifenSummary)}</p>
              ) : null}
              {emailStatus?.message ? <p className="editor-alert ready">{emailStatus.message}</p> : null}

              <div className="delivery-actions">
                <div className="action-group action-group-primary">
                  <h4 className="group-title">Acciones frecuentes</h4>
                  <a className={selectedKudeUrl ? "secondary-link" : "secondary-link disabled"} href={selectedKudeUrl ?? "#"} rel="noreferrer" target="_blank">
                    📄 Ver {getDocumentoNombreLower(selected.tipo)} PDF
                  </a>
                  <a className={deliveryLink ? "secondary-link" : "secondary-link disabled"} href={deliveryLink?.whatsapp_url ?? "#"} rel="noreferrer" target="_blank">
                    📱 Enviar por WhatsApp
                  </a>
                  <a className={deliveryLink ? "secondary-link" : "secondary-link disabled"} href={deliveryLink?.public_url ?? "#"} rel="noreferrer" target="_blank">
                    🔗 Compartir {getDocumentoNombreLower(selected.tipo)}
                  </a>
                  <button className="secondary-action" disabled={!deliveryLink} onClick={() => void copyDetailLink()} type="button">
                    📋 Copiar enlace
                  </button>
                </div>
              </div>

              <div className="action-group action-group-secondary">
                <h4 className="group-title">Acciones sobre esta {getDocumentoNombreLower(selected.tipo)}</h4>
                {selected.tipo === "FACTURA" && selected.condicion_venta === "CREDITO" ? (
                  <button
                    className="secondary-action"
                    disabled={actionLoading}
                    onClick={() => {
                      void (async () => {
                        try {
                          await api.request(`/facturas/${selected.id}/recibo`, { method: "POST" });
                          onGoTo?.("recibos");
                        } catch {
                          // error silencioso — el usuario puede ir manualmente a Cobros
                        }
                      })();
                    }}
                    type="button"
                  >
                    💵 Emitir recibo de cobro
                  </button>
                ) : null}
                <button className="secondary-action" disabled={actionLoading || !canEmitNotaCredito(selected, documents)} onClick={() => void emitSelectedNotaCredito()} type="button">
                  ↩ Crear nota de credito
                </button>
                <button className="secondary-action" disabled={actionLoading || !canCancelDocumento(selected)} onClick={() => void cancelSelectedDocumento()} type="button">
                  ⚠ Anular {getDocumentoNombreLower(selected.tipo)}
                </button>
              </div>
              <details className="tech-block">
                <summary>Informacion fiscal</summary>
                <dl className="receipt-summary">
                  <div>
                    <dt>Codigo fiscal</dt>
                    <dd>{selected.cdc ?? "Pendiente"}</dd>
                  </div>
                  <div>
                    <dt>Estado fiscal</dt>
                    <dd>{formatSifenSummary(selectedSifenSummary)}</dd>
                  </div>
                  <div>
                    <dt>Estado email</dt>
                    <dd>{formatEmailStatus(emailStatus?.status ?? selected.delivery.email_status)}</dd>
                  </div>
                </dl>
              </details>
              <details className="tech-block">
                <summary>Opciones avanzadas</summary>
                <div className="result-actions">
                  <button className="secondary-action" disabled={actionLoading || !selected.cdc} onClick={() => void refreshSelectedStatus()} type="button">
                    Verificar estado fiscal
                  </button>
                  <button className="secondary-action" disabled={actionLoading || !["PENDIENTE_SIFEN", "ERROR_TEMPORAL"].includes(selected.estado)} onClick={() => void retrySelectedEmission()} type="button">
                    Volver a verificar
                  </button>
                  <button className="secondary-action" disabled={actionLoading} onClick={() => void loadDeliveryFor(selected, true)} type="button">
                    Crear nuevo enlace
                  </button>
                  <a className={selectedXmlUrl ? "secondary-link" : "secondary-link disabled"} href={selectedXmlUrl ?? "#"} rel="noreferrer" target="_blank">
                    Descargar documento electronico
                  </a>
                </div>
              </details>
              {isInternalSupport ? (
                <details className="tech-block">
                  <summary>Administracion fiscal</summary>
                <section className="action-group action-group-internal" aria-label="Autogestion soporte">
                  <h4 className="group-title">Eventos y regularizacion fiscal</h4>
                  <p className="muted">Flujo sugerido: decision → validar impacto CDC → ejecutar acción.</p>
                  {decision ? (
                    <div className="support-decision-box">
                      <p><strong>Accion recomendada:</strong> {decision.recommended_action}</p>
                      <p><strong>Confianza:</strong> {decision.decision_confidence}</p>
                      <p><strong>Motivos:</strong> {decision.reason_codes.join(", ") || "sin codigos"}</p>
                    </div>
                  ) : (
                    <p className="muted">Sin decision disponible para este documento.</p>
                  )}
                  {cdcImpact ? (
                    <p className="muted">
                      Impacto CDC: <strong>{cdcImpact.cdc_impact}</strong> {cdcImpact.reason ? `· ${cdcImpact.reason}` : ""}
                    </p>
                  ) : null}
                  <div className="result-actions">
                    <button className="secondary-action" disabled={actionLoading} onClick={() => void validateSelectedCdcImpact()} type="button">
                      Validar impacto CDC
                    </button>
                    <button className="secondary-action" disabled={actionLoading} onClick={() => void retrySameCdcAction()} type="button">
                      Reintentar mismo CDC
                    </button>
                    <button className="secondary-action" disabled={actionLoading} onClick={() => void createDerivedAction()} type="button">
                      Crear DE derivado
                    </button>
                    <button className="secondary-action" disabled={actionLoading} onClick={() => void cancelSendAction()} type="button">
                      Cancelar envío local
                    </button>
                    <button className="secondary-action" disabled={actionLoading} onClick={() => void voidNumberAction()} type="button">
                      Inutilizar numeración
                    </button>
                  </div>
                </section>
                </details>
              ) : null}
              {message ? <p className="inline-message">{message}</p> : null}
            </>
          ) : (
            <p className="muted empty-state">Seleccione un documento para ver detalle y acciones.</p>
          )}
        </aside>
        ) : null}
      {reasonModal ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel" aria-labelledby="reason-modal-title" role="dialog" aria-modal="true">
            <header>
              <p className="eyebrow">Confirmacion</p>
              <h3 id="reason-modal-title">{getReasonModalTitle(reasonModal.action, reasonModal.tipo)}</h3>
              <p className="muted">Ingrese un motivo para continuar.</p>
            </header>
            <label className="credit-note-motivo">
              Motivo
              <textarea
                autoFocus
                maxLength={150}
                onChange={(event) => setReasonDraft(event.target.value)}
                placeholder={getReasonModalPlaceholder(reasonModal.action)}
                rows={4}
                value={reasonDraft}
              />
            </label>
            {reasonError ? <p className="form-error">{reasonError}</p> : null}
            <div className="result-actions">
              <button className="secondary-action" disabled={actionLoading} onClick={closeReasonModal} type="button">
                Cancelar
              </button>
              <button className="primary-action" disabled={actionLoading} onClick={() => void submitReasonModal()} type="button">
                {actionLoading ? "Procesando..." : "Confirmar"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {notaCreditoPopup ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel" aria-labelledby="nc-success-title" role="dialog" aria-modal="true">
            <header>
              <p className="eyebrow">Nota de credito</p>
              <h3 id="nc-success-title">{getSimpleDocumentoEstado(notaCreditoPopup.estado, notaCreditoPopup.tipo)}</h3>
              <p className="muted">
                {notaCreditoPopup.numero_fiscal ? `Numero ${notaCreditoPopup.numero_fiscal}` : "Numero pendiente"}
                {" · "}{notaCreditoPopup.cliente.razon_social}
              </p>
            </header>
            <p className={notaCreditoPopup.estado === "EMITIDA" ? "editor-alert ready" : "editor-alert blocked"}>
              {getNotaCreditoSuccessMessage(notaCreditoPopup.estado)}
            </p>
            <div className="result-actions">
              <button className="primary-action" onClick={() => setNotaCreditoPopup(null)} type="button">
                Ver nota de credito
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function ClientesAgendaView({
  accessToken,
  setAccessToken,
  onBack,
  onUseCliente
}: {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  onBack: () => void;
  onUseCliente: (cliente: ClienteResponse) => void;
}) {
  const api = useMemo(() => createApiClient(accessToken, setAccessToken), [accessToken, setAccessToken]);
  const [items, setItems] = useState<ClienteResponse[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ClienteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<ClienteSearchResult[]>([]);
  const [autocompleting, setAutocompleting] = useState(false);
  const [rowMenuClienteId, setRowMenuClienteId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClienteResponse | null>(null);
  const rowMenuRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<FacturaClienteInput>({
    documento_tipo: "CI",
    documento: "",
    razon_social: "",
    direccion: "",
    telefono: "",
    email: ""
  });

  useEffect(() => {
    void loadClientes();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadClientes(query);
    }, 220);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (!editorOpen) {
      return;
    }
    const documento = draft.documento.trim();
    if (!documento) {
      setSearchSuggestions([]);
      return;
    }
    const timeout = setTimeout(() => {
      void findSuggestions(documento);
    }, 180);
    return () => clearTimeout(timeout);
  }, [draft.documento, editorOpen]);

  useEffect(() => {
    if (!rowMenuClienteId) {
      return;
    }
    function handleClickOutside(event: MouseEvent) {
      if (rowMenuRef.current && !rowMenuRef.current.contains(event.target as Node)) {
        setRowMenuClienteId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [rowMenuClienteId]);

  async function loadClientes(nextQuery = query) {
    setLoading(true);
    setMessage(null);
    const params = new URLSearchParams({ limit: "30", offset: "0" });
    if (nextQuery.trim()) {
      params.set("q", nextQuery.trim());
    }
    try {
      const result = await api.get<ClienteListResponse>(`/clientes?${params.toString()}`);
      setItems(result.items);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cargar la agenda.");
    } finally {
      setLoading(false);
    }
  }

  function openEditor(cliente?: ClienteResponse) {
    if (cliente) {
      setSelected(cliente);
      setDraft({
        cliente_id: cliente.cliente_id,
        documento_tipo: cliente.documento_tipo,
        documento: cliente.documento,
        razon_social: cliente.razon_social,
        direccion: cliente.direccion,
        telefono: cliente.telefono,
        email: cliente.email
      });
    } else {
      setSelected(null);
      setDraft({
        documento_tipo: "CI",
        documento: "",
        razon_social: "",
        direccion: "",
        telefono: "",
        email: ""
      });
    }
    setEditorOpen(true);
  }

  function useCliente(cliente: ClienteResponse) {
    setSelected(cliente);
    setRowMenuClienteId(null);
    onUseCliente(cliente);
  }

  function openDeleteConfirm(cliente: ClienteResponse) {
    setDeleteTarget(cliente);
    setRowMenuClienteId(null);
  }

  function applySuggestion(suggestion: ClienteSearchResult) {
    setDraft((current) => ({
      ...current,
      cliente_id: suggestion.cliente_id ?? current.cliente_id ?? null,
      documento_tipo: suggestion.documento_tipo,
      documento: suggestion.documento,
      razon_social: suggestion.razon_social,
      direccion: suggestion.direccion ?? current.direccion ?? "",
      telefono: suggestion.telefono ?? current.telefono ?? "",
      email: suggestion.email ?? current.email ?? ""
    }));
    setSearchSuggestions([]);
  }

  async function findSuggestions(documento: string) {
    setAutocompleting(true);
    try {
      const result = await api.get<{ items: ClienteSearchResult[] }>(`/clientes/search?q=${encodeURIComponent(documento)}&limit=5`);
      setSearchSuggestions(result.items);
    } catch {
      setSearchSuggestions([]);
    } finally {
      setAutocompleting(false);
    }
  }

  async function autocompleteFromDnit() {
    if (!["RUC", "CI"].includes(draft.documento_tipo)) {
      return;
    }
    const documento = draft.documento.trim();
    if (!documento) {
      return;
    }
    const alreadyExists = items.some((cliente) => normalizeDocKey(cliente.documento) === normalizeDocKey(documento));
    if (alreadyExists) {
      setMessage("Cliente encontrado en la agenda.");
      return;
    }
    setAutocompleting(true);
    try {
      const result = await api.get<DnitAutocompleteResponse>(
        `/clientes/dnit/autocomplete?documento_tipo=${draft.documento_tipo}&documento=${encodeURIComponent(documento)}`
      );
      if (!result.found || !result.cliente) {
        return;
      }
      setDraft((current) => ({
        ...current,
        documento_tipo: result.cliente?.documento_tipo ?? current.documento_tipo,
        documento: result.cliente?.documento ?? current.documento,
        razon_social: result.cliente?.razon_social ?? current.razon_social
      }));
    } catch {
      // No interrumpir carga manual cuando DNIT no esta disponible.
    } finally {
      setAutocompleting(false);
    }
  }

  async function saveCliente() {
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        documento_tipo: draft.documento_tipo,
        documento: draft.documento.trim(),
        razon_social: draft.razon_social.trim(),
        direccion: draft.direccion?.trim() || null,
        telefono: draft.telefono?.trim() || null,
        email: draft.email?.trim() || null
      };
      const result = selected
        ? await api.request<ClienteResponse>(`/clientes/${selected.cliente_id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await api.post<ClienteResponse>("/clientes", payload);
      setMessage(selected ? "Cliente actualizado." : "Cliente agregado a la agenda.");
      setSelected(result);
      setEditorOpen(false);
      setSearchSuggestions([]);
      await loadClientes();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar el cliente.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCliente() {
    if (!deleteTarget) {
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await api.request<void>(`/clientes/${deleteTarget.cliente_id}`, { method: "DELETE" });
      setMessage("Cliente eliminado de la agenda.");
      if (selected?.cliente_id === deleteTarget.cliente_id) {
        setSelected(null);
      }
      if (draft.cliente_id === deleteTarget.cliente_id) {
        setEditorOpen(false);
      }
      setDeleteTarget(null);
      await loadClientes();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo eliminar el cliente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="documents-view" aria-labelledby="clientes-title">
      <div className="editor-heading">
        <div>
          <p className="eyebrow">Agenda</p>
          <h2 id="clientes-title">Clientes</h2>
        </div>
        <button className="ghost-action" onClick={onBack} type="button">
          Volver
        </button>
      </div>
      <section className="documents-filters">
        <label>
          Buscar cliente
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar cliente..."
            value={query}
          />
        </label>
      </section>
      <section className="documents-layout">
        <div className="documents-list">
          {items.length === 0 && !loading ? (
            <article className="empty-callout">
              <strong>No encontramos clientes.</strong>
              <p className="muted">Puede crear uno nuevo.</p>
              <button className="primary-action wide" onClick={() => openEditor()} type="button">
                + Crear cliente
              </button>
            </article>
          ) : null}
          {items.map((cliente) => (
            <article className={selected?.cliente_id === cliente.cliente_id ? "document-row client-row active" : "document-row client-row"} key={cliente.cliente_id}>
              <span>
                <strong>👤 {cliente.razon_social}</strong>
                <small>{cliente.documento_tipo} {cliente.documento}</small>
              </span>
              <div className="client-row-actions" ref={rowMenuClienteId === cliente.cliente_id ? rowMenuRef : null}>
                <button className="secondary-action compact" onClick={() => useCliente(cliente)} type="button">
                  Usar
                </button>
                <button
                  aria-expanded={rowMenuClienteId === cliente.cliente_id}
                  aria-label={`Abrir acciones de ${cliente.razon_social}`}
                  className="icon-menu-action"
                  onClick={() => setRowMenuClienteId((current) => current === cliente.cliente_id ? null : cliente.cliente_id)}
                  type="button"
                >
                  ⋮
                </button>
                {rowMenuClienteId === cliente.cliente_id ? (
                  <div className="client-row-menu" role="menu" aria-label={`Acciones para ${cliente.razon_social}`}>
                    <button onClick={() => useCliente(cliente)} role="menuitem" type="button">Usar cliente</button>
                    <button onClick={() => openEditor(cliente)} role="menuitem" type="button">Editar</button>
                    <button
                      disabled={!cliente.telefono}
                      onClick={() => {
                        if (!cliente.telefono) {
                          return;
                        }
                        window.open(`https://wa.me/${cliente.telefono.replace(/\D/g, "")}`, "_blank", "noopener,noreferrer");
                        setRowMenuClienteId(null);
                      }}
                      role="menuitem"
                      type="button"
                    >
                      WhatsApp
                    </button>
                    <hr />
                    <button className="destructive-item" onClick={() => openDeleteConfirm(cliente)} role="menuitem" type="button">
                      Eliminar cliente
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        <button className="primary-action wide floating-create-client" onClick={() => openEditor()} type="button">
          + Nuevo cliente
        </button>
      </section>
      {message ? <p className="inline-message">{message}</p> : null}
      {editorOpen ? (
        <div className="modal-backdrop">
          <section className="modal-panel" aria-labelledby="cliente-editor-title" role="dialog" aria-modal="true">
            <header className="editor-heading">
              <div>
                <p className="eyebrow">Cliente</p>
                <h3 id="cliente-editor-title">{selected ? "Editar cliente" : "Nuevo cliente"}</h3>
              </div>
              <button className="ghost-action" onClick={() => setEditorOpen(false)} type="button">
                Cerrar
              </button>
            </header>
            <div className="documents-filters">
              <label>
                Tipo documento
                <select value={draft.documento_tipo} onChange={(event) => setDraft((current) => ({ ...current, documento_tipo: event.target.value as DocumentoIdentidadTipo }))}>
                  <option value="CI">CI</option>
                  <option value="RUC">RUC</option>
                  <option value="PASAPORTE">Pasaporte</option>
                  <option value="CEDULA_EXTRANJERA">Cedula extranjera</option>
                  <option value="NO_ESPECIFICADO">No especificado</option>
                </select>
              </label>
              <label>
                Documento
                <input
                  onBlur={() => void autocompleteFromDnit()}
                  value={draft.documento}
                  onChange={(event) => setDraft((current) => ({ ...current, documento: event.target.value }))}
                />
              </label>
              {autocompleting ? <small className="muted">Autocompletando...</small> : null}
              {searchSuggestions.length > 0 ? (
                <div className="suggestion-list">
                  {searchSuggestions.map((suggestion) => (
                    <button
                      key={`${suggestion.source}-${suggestion.cliente_id ?? suggestion.documento}`}
                      onClick={() => applySuggestion(suggestion)}
                      type="button"
                    >
                      <strong>{suggestion.documento}</strong>
                      <span>{suggestion.razon_social}</span>
                      <small>{suggestion.source === "AGENDA_FACTURADOR" ? "Agenda" : "Sugerencia"}</small>
                    </button>
                  ))}
                </div>
              ) : null}
              <label>
                Nombre o razon social
                <input value={draft.razon_social} onChange={(event) => setDraft((current) => ({ ...current, razon_social: event.target.value }))} />
              </label>
              <label>
                Telefono
                <input value={draft.telefono ?? ""} onChange={(event) => setDraft((current) => ({ ...current, telefono: event.target.value }))} />
              </label>
              <label>
                Correo
                <input value={draft.email ?? ""} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} />
              </label>
              <label>
                Direccion
                <input value={draft.direccion ?? ""} onChange={(event) => setDraft((current) => ({ ...current, direccion: event.target.value }))} />
              </label>
            </div>
            <div className="result-actions">
              <button className="primary-action" disabled={saving || !draft.documento.trim() || !draft.razon_social.trim()} onClick={() => void saveCliente()} type="button">
                {saving ? "Guardando..." : "Guardar"}
              </button>
              {selected ? (
                <button className="danger-action" disabled={saving} onClick={() => openDeleteConfirm(selected)} type="button">
                  Eliminar cliente de mi agenda
                </button>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
      {deleteTarget ? (
        <div className="modal-backdrop">
          <section className="modal-panel" aria-labelledby="cliente-delete-title" role="dialog" aria-modal="true">
            <header>
              <h3 id="cliente-delete-title">¿Eliminar cliente de tu agenda?</h3>
              <p className="muted">Esta accion quita a {deleteTarget.razon_social} de la agenda de este facturador.</p>
            </header>
            <div className="result-actions">
              <button className="secondary-action" disabled={saving} onClick={() => setDeleteTarget(null)} type="button">
                Cancelar
              </button>
              <button className="danger-action" disabled={saving} onClick={() => void deleteCliente()} type="button">
                {saving ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function CreditNoteView({
  accessToken,
  setAccessToken,
  onBack
}: {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  onBack: () => void;
}) {
  const api = useMemo(() => createApiClient(accessToken, setAccessToken), [accessToken, setAccessToken]);
  const [candidates, setCandidates] = useState<NotaCreditoCandidate[]>([]);
  const [selected, setSelected] = useState<NotaCreditoCandidate | null>(null);
  const [query, setQuery] = useState("");
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState(false);
  const [emitting, setEmitting] = useState(false);
  const [result, setResult] = useState<DocumentoResponse | null>(null);
  const [deliveryLink, setDeliveryLink] = useState<DeliveryLinkResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadCandidates();
  }, []);

  async function loadCandidates(nextQuery = query) {
    setLoading(true);
    setMessage(null);
    const params = new URLSearchParams({ limit: "30", offset: "0" });
    if (nextQuery.trim()) {
      params.set("q", nextQuery.trim());
    }

    try {
      const response = await api.get<NotaCreditoCandidateListResponse>(`/facturas/nce-candidatas?${params.toString()}`);
      setCandidates(response.items);
      setSelected((current) => (current ? response.items.find((item) => item.documento.id === current.documento.id) ?? current : current));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudieron cargar facturas candidatas.");
    } finally {
      setLoading(false);
    }
  }

  async function emitNotaCredito() {
    if (!selected?.elegible) {
      setMessage(selected?.motivo_no_elegible ?? "Seleccione una factura elegible.");
      return;
    }
    if (!motivo.trim()) {
      setMessage("Motivo requerido.");
      return;
    }

    setEmitting(true);
    setMessage(null);
    setDeliveryLink(null);

    try {
      const notaCredito = await api.request<DocumentoResponse>(`/facturas/${selected.documento.id}/nota-credito`, {
        method: "POST",
        headers: {
          "Idempotency-Key": createIdempotencyKey()
        },
        body: JSON.stringify({ motivo: motivo.trim() })
      });
      setResult(notaCredito);
      const link = await api.post<DeliveryLinkResponse>(`/facturas/${notaCredito.id}/delivery-link`, { regenerate: false });
      setDeliveryLink(link);
      setMessage("Nota de credito emitida.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo emitir la nota de credito.");
    } finally {
      setEmitting(false);
    }
  }

  return (
    <section className="documents-view" aria-labelledby="credit-note-title">
      <div className="editor-heading">
        <div>
          <p className="eyebrow">Nueva nota de credito</p>
          <h2 id="credit-note-title">Seleccionar factura</h2>
        </div>
        <button className="ghost-action" onClick={onBack} type="button">
          Volver
        </button>
      </div>
      <section className="documents-filters">
        <label>
          Buscar factura
          <input
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void loadCandidates();
              }
            }}
            placeholder="Cliente, documento, numero o total"
            value={query}
          />
        </label>
        <button className="secondary-action" disabled={loading} onClick={() => void loadCandidates()} type="button">
          {loading ? "Cargando..." : "Buscar"}
        </button>
      </section>

      {message ? <p className={message.includes("emitida") ? "editor-alert ready" : "form-error"}>{message}</p> : null}

      <section className="documents-layout">
        <div className="documents-list">
          {candidates.length === 0 && !loading ? <p className="muted empty-state">Sin facturas para los filtros actuales.</p> : null}
          {candidates.map((candidate) => (
            <button
              className={selected?.documento.id === candidate.documento.id ? "document-row active" : "document-row"}
              key={candidate.documento.id}
              onClick={() => {
                setSelected(candidate);
                setResult(null);
                setDeliveryLink(null);
              }}
              type="button"
            >
              <span>
                <strong>{candidate.documento.numero_fiscal ?? "Numero pendiente"}</strong>
                <small>{candidate.documento.cliente.razon_social}</small>
              </span>
              <span>
                <strong>{formatGuaranies(candidate.documento.totals.total)}</strong>
                <small>{candidate.elegible ? "Elegible" : candidate.motivo_no_elegible}</small>
              </span>
            </button>
          ))}
        </div>

        <aside className="document-detail">
          {selected ? (
            <>
              <div className="receipt-heading">
                <div>
                  <p className="eyebrow">Factura origen</p>
                  <h3>{selected.documento.cliente.razon_social}</h3>
                  <p className="muted">
                    {selected.documento.numero_fiscal ?? "Numero pendiente"} · {selected.documento.condicion_venta} · {formatDocumentoEstado(selected.documento.estado)}
                  </p>
                </div>
                <span className={selected.elegible ? "status-pill ready" : "status-pill blocked"}>
                  {selected.elegible ? "Elegible" : "Bloqueada"}
                </span>
              </div>
              <div className="receipt-summary">
                <div>
                  <dt>Documento</dt>
                  <dd>{selected.documento.cliente.documento}</dd>
                </div>
                <div>
                  <dt>Total</dt>
                  <dd>{formatGuaranies(selected.documento.totals.total)}</dd>
                </div>
              </div>
              {!selected.elegible ? <p className="editor-alert blocked">{selected.motivo_no_elegible}</p> : null}
              <label className="credit-note-motivo">
                Motivo
                <textarea onChange={(event) => setMotivo(event.target.value)} rows={4} value={motivo} />
              </label>
              <button className="primary-action wide" disabled={emitting || !selected.elegible} onClick={() => void emitNotaCredito()} type="button">
                {emitting ? "Emitiendo..." : "Emitir nota de credito"}
              </button>

              {result ? (
                <div className="public-link-box">
                  <dt>Nota de credito</dt>
                  <dd>
                    {formatDocumentoEstado(result.estado)} · Numero {result.numero_fiscal ?? "pendiente"} · {deliveryLink?.public_url ?? "Link en proceso"}
                  </dd>
                </div>
              ) : null}
            </>
          ) : (
            <p className="muted empty-state">Seleccione una factura emitida elegible para emitir una nota de credito total.</p>
          )}
        </aside>
      </section>
    </section>
  );
}

function CatalogView({
  accessToken,
  setAccessToken,
  onBack
}: {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  onBack: () => void;
}) {
  const api = useMemo(() => createApiClient(accessToken, setAccessToken), [accessToken, setAccessToken]);
  const [items, setItems] = useState<CatalogoItem[]>([]);
  const [query, setQuery] = useState("");
  const [statusChip, setStatusChip] = useState<"ACTIVE" | "ARCHIVED" | "ALL">("ACTIVE");
  const [draft, setDraft] = useState<CatalogoDraft>(() => createCatalogoDraft());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"CREATE" | "EDIT">("CREATE");
  const [selectedItem, setSelectedItem] = useState<CatalogoItem | null>(null);
  const [menuItemId, setMenuItemId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CatalogoItem | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadItems(query);
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [query, statusChip]);

  async function loadItems(nextQuery = query) {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ limit: "50", offset: "0" });
    if (nextQuery.trim()) {
      params.set("q", nextQuery.trim());
    }
    if (statusChip === "ACTIVE") {
      params.set("activo", "true");
    } else if (statusChip === "ARCHIVED") {
      params.set("activo", "false");
    }

    try {
      const result = await api.get<CatalogoItemListResponse>(`/catalogo/items?${params.toString()}`);
      setItems(result.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el catalogo.");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditorMode("CREATE");
    setSelectedItem(null);
    setDraft(createCatalogoDraft());
    setAdvancedOpen(false);
    setEditorOpen(true);
    setMenuItemId(null);
    setError(null);
  }

  function openEdit(item: CatalogoItem) {
    setEditorMode("EDIT");
    setSelectedItem(item);
    setDraft({
      codigo: item.codigo,
      descripcion: item.descripcion,
      precio_unitario: String(item.precio_unitario),
      iva_tipo: item.iva_tipo,
      activo: item.activo
    });
    setAdvancedOpen(false);
    setEditorOpen(true);
    setMenuItemId(null);
    setError(null);
  }

  function duplicateItem(item: CatalogoItem) {
    setEditorMode("CREATE");
    setSelectedItem(null);
    setDraft({
      codigo: "",
      descripcion: `${item.descripcion} (copia)`,
      precio_unitario: String(item.precio_unitario),
      iva_tipo: item.iva_tipo,
      activo: true
    });
    setAdvancedOpen(true);
    setEditorOpen(true);
    setMenuItemId(null);
  }

  async function archiveItem(item: CatalogoItem) {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await api.request<CatalogoItem>(`/catalogo/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          codigo: item.codigo || null,
          descripcion: item.descripcion,
          precio_unitario: item.precio_unitario,
          iva_tipo: item.iva_tipo,
          activo: false
        })
      });
      setMenuItemId(null);
      setMessage("Item archivado.");
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo archivar el item.");
    } finally {
      setSaving(false);
    }
  }

  function openDeleteConfirm(item: CatalogoItem) {
    setMenuItemId(null);
    setDeleteTarget(item);
    setError(null);
    setMessage(null);
  }

  async function deleteItem() {
    if (!deleteTarget) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api.request(`/catalogo/items/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      if (selectedItem?.id === deleteTarget.id) {
        setEditorOpen(false);
        setSelectedItem(null);
      }
      setMessage("Item eliminado permanentemente.");
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el item.");
    } finally {
      setSaving(false);
    }
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    const payload = {
      codigo: draft.codigo.trim() || null,
      descripcion: draft.descripcion.trim(),
      precio_unitario: Number(draft.precio_unitario),
      iva_tipo: draft.iva_tipo,
      activo: draft.activo
    };

    if (!payload.descripcion || !Number.isInteger(payload.precio_unitario) || payload.precio_unitario <= 0) {
      setSaving(false);
      setError("Complete descripcion y precio entero mayor a cero.");
      return;
    }

    try {
      await (editorMode === "EDIT" && selectedItem
        ? api.request<CatalogoItem>(`/catalogo/items/${selectedItem.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
          })
        : api.post<CatalogoItem>("/catalogo/items", payload));
      setEditorOpen(false);
      setMessage(editorMode === "EDIT" ? "Item actualizado." : "Item creado.");
      await loadItems();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el item.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="catalog-view" aria-labelledby="catalog-title">
      <div className="editor-heading">
        <div>
          <p className="eyebrow">Catalogo</p>
          <h2 id="catalog-title">Productos y servicios</h2>
        </div>
        <button className="ghost-action" onClick={onBack} type="button">
          Volver
        </button>
      </div>

      <section className="documents-filters">
        <label>
          Buscar
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar producto o servicio..."
            value={query}
          />
        </label>
        <div className="filter-tabs" role="group" aria-label="Estado del catalogo">
          <button className={statusChip === "ALL" ? "active" : ""} onClick={() => setStatusChip("ALL")} type="button">Todos</button>
          <button className={statusChip === "ACTIVE" ? "active" : ""} onClick={() => setStatusChip("ACTIVE")} type="button">Activos</button>
          <button className={statusChip === "ARCHIVED" ? "active" : ""} onClick={() => setStatusChip("ARCHIVED")} type="button">Archivados</button>
        </div>
      </section>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="editor-alert ready">{message}</p> : null}

      <section className="documents-layout">
        <div className="documents-list">
          {items.length === 0 && !loading ? <p className="muted empty-state">Sin items para los filtros actuales.</p> : null}
          {items.map((item) => (
            <article className="document-row document-row-rich" key={item.id}>
              <button className="document-row-main" onClick={() => openEdit(item)} type="button">
                <span>
                  <strong>{item.descripcion}</strong>
                  <small>{item.codigo || "Sin codigo"}</small>
                </span>
                <span>
                  <strong>{formatGuaranies(item.precio_unitario)}</strong>
                  <small>{formatIva(item.iva_tipo)}</small>
                </span>
              </button>
              <div className="document-row-menu-wrapper">
                <button className="icon-menu-action" onClick={() => setMenuItemId((current) => (current === item.id ? null : item.id))} type="button">⋮</button>
                {menuItemId === item.id ? (
                  <div className="client-row-menu" role="menu" aria-label="Acciones del item">
                    <button onClick={() => openEdit(item)} role="menuitem" type="button">Editar</button>
                    <button onClick={() => duplicateItem(item)} role="menuitem" type="button">Duplicar</button>
                    {item.activo ? (
                      <button onClick={() => void archiveItem(item)} role="menuitem" type="button">Archivar</button>
                    ) : (
                      <button disabled role="menuitem" type="button">Archivado</button>
                    )}
                    <hr />
                    <button className="destructive-item" onClick={() => openDeleteConfirm(item)} role="menuitem" type="button">
                      Eliminar permanentemente
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <button className="primary-action wide floating-create-client" onClick={openCreate} type="button">
        + Nuevo
      </button>

      {editorOpen ? (
        <div className="modal-backdrop">
          <section className="modal-panel" aria-labelledby="catalog-editor-title" role="dialog" aria-modal="true">
            <header className="editor-heading">
              <div>
                <p className="eyebrow">Catalogo</p>
                <h3 id="catalog-editor-title">{editorMode === "EDIT" ? "Editar producto o servicio" : "Nuevo producto o servicio"}</h3>
              </div>
              <button className="ghost-action" onClick={() => setEditorOpen(false)} type="button">
                Cerrar
              </button>
            </header>

            <form className="catalog-form" onSubmit={(event) => void saveItem(event)}>
              <div className="documents-filters">
                <label>
                  Nombre o descripcion
                  <input
                    onChange={(event) => setDraft((current) => ({ ...current, descripcion: event.target.value }))}
                    required
                    value={draft.descripcion}
                  />
                </label>
                <label>
                  Precio
                  <input
                    inputMode="numeric"
                    min="0"
                    onChange={(event) => setDraft((current) => ({ ...current, precio_unitario: event.target.value }))}
                    required
                    value={draft.precio_unitario}
                  />
                </label>
                <label>
                  IVA
                  <select onChange={(event) => setDraft((current) => ({ ...current, iva_tipo: event.target.value as TipoIva }))} value={draft.iva_tipo}>
                    <option value="IVA_10">IVA 10%</option>
                    <option value="IVA_5">IVA 5%</option>
                    <option value="EXENTA">Exenta</option>
                  </select>
                </label>
                <button className="secondary-action" onClick={() => setAdvancedOpen((current) => !current)} type="button">
                  {advancedOpen ? "Ocultar opciones avanzadas" : "Opciones avanzadas"}
                </button>
                {advancedOpen ? (
                  <>
                    <label>
                      Codigo
                      <input
                        onChange={(event) => setDraft((current) => ({ ...current, codigo: event.target.value }))}
                        placeholder="SERV-001"
                        value={draft.codigo}
                      />
                    </label>
                    <label>
                      Estado
                      <select
                        onChange={(event) => setDraft((current) => ({ ...current, activo: event.target.value === "true" }))}
                        value={draft.activo ? "true" : "false"}
                      >
                        <option value="true">Activo</option>
                        <option value="false">Archivado</option>
                      </select>
                    </label>
                  </>
                ) : null}
              </div>
              <div className="result-actions">
                <button className="primary-action" disabled={saving} type="submit">
                  {saving ? "Guardando..." : editorMode === "EDIT" ? "Guardar cambios" : "Guardar"}
                </button>
                {editorMode === "EDIT" && selectedItem?.activo ? (
                  <button className="danger-action" disabled={saving} onClick={() => void archiveItem(selectedItem)} type="button">
                    Archivar
                  </button>
                ) : null}
                {editorMode === "EDIT" && selectedItem ? (
                  <button className="danger-action" disabled={saving} onClick={() => openDeleteConfirm(selectedItem)} type="button">
                    Eliminar permanentemente
                  </button>
                ) : null}
              </div>
            </form>
          </section>
        </div>
      ) : null}
      {deleteTarget ? (
        <div className="modal-backdrop">
          <section className="modal-panel" aria-labelledby="catalog-delete-title" role="dialog" aria-modal="true">
            <header>
              <h3 id="catalog-delete-title">¿Eliminar item del catalogo?</h3>
              <p className="muted">
                Esta accion eliminara permanentemente <strong>{deleteTarget.descripcion}</strong> de este facturador.
              </p>
            </header>
            <div className="result-actions">
              <button className="secondary-action" disabled={saving} onClick={() => setDeleteTarget(null)} type="button">
                Cancelar
              </button>
              <button className="danger-action" disabled={saving} onClick={() => void deleteItem()} type="button">
                {saving ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function InvoiceEditor({
  accessToken,
  canEmit,
  clientePrefillRequest,
  initialDraft,
  context,
  readiness,
  setAccessToken,
  onBack
}: {
  accessToken: string | null;
  canEmit: boolean;
  clientePrefillRequest: InvoiceClientePrefillRequest | null;
  initialDraft?: InvoiceInitialDraft | null;
  context: OperationalContextResponse | null;
  readiness: ReadinessResponse | null;
  setAccessToken: (token: string | null) => void;
  onBack: () => void;
}) {
  const [condicionVenta, setCondicionVenta] = useState<CondicionVenta>("CONTADO");
  const [tipoTransaccion, setTipoTransaccion] = useState<TipoTransaccionServicio>(2);
  const [creditoPlazoDias, setCreditoPlazoDias] = useState<number>(context?.fiscal_context.credito_plazo_dias ?? 30);
  const [cliente, setCliente] = useState<FacturaClienteInput>({
    documento_tipo: "RUC",
    documento: "",
    razon_social: "",
    direccion: "",
    telefono: "",
    email: ""
  });
  const [lines, setLines] = useState<InvoiceLineDraft[]>(() => []);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [expandedLineIds, setExpandedLineIds] = useState<Set<string>>(() => new Set());
  const [lineSheetOpen, setLineSheetOpen] = useState(false);
  const [lineCodeOpen, setLineCodeOpen] = useState(false);
  const [headerDetailsOpen, setHeaderDetailsOpen] = useState(false);
  const [clienteSuggestions, setClienteSuggestions] = useState<ClienteSearchResult[]>([]);
  const [clienteSearching, setClienteSearching] = useState(false);
  const [clienteAutocompleting, setClienteAutocompleting] = useState(false);
  const [clienteSaving, setClienteSaving] = useState(false);
  const [clienteMessage, setClienteMessage] = useState<string | null>(null);
  const [clienteModalOpen, setClienteModalOpen] = useState(false);
  const [catalogSuggestions, setCatalogSuggestions] = useState<Record<string, CatalogoItem[]>>({});
  const [catalogSearching, setCatalogSearching] = useState<Record<string, boolean>>({});
  const [catalogSaving, setCatalogSaving] = useState<Record<string, boolean>>({});
  const [catalogMessage, setCatalogMessage] = useState<Record<string, string | null>>({});
  const [preview, setPreview] = useState<FacturaPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [emitting, setEmitting] = useState(false);
  const [emissionError, setEmissionError] = useState<string | null>(null);
  const [emittedDocumento, setEmittedDocumento] = useState<DocumentoResponse | null>(null);
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
  const emissionResultRef = useRef<HTMLElement | null>(null);
  const lastAppliedClientePrefillIdRef = useRef<number | null>(null);
  const initialDraftAppliedRef = useRef(false);

  const api = useMemo(() => createApiClient(accessToken, setAccessToken), [accessToken, setAccessToken]);
  const today = useMemo(() => new Date().toLocaleDateString("es-PY"), []);
  const nextFiscalNumber = useMemo(() => getNextFiscalNumber(context?.fiscal_context.documento_nro), [context?.fiscal_context.documento_nro]);

  const request = useMemo<FacturaPreviewRequest | null>(() => {
    const items = lines
      .map((line) => ({
        catalogo_item_id: line.catalogo_item_id,
        codigo: line.codigo.trim() || null,
        descripcion: line.descripcion.trim(),
        cantidad: Number(line.cantidad),
        precio_unitario: Number(line.precio_unitario),
        iva_tipo: line.iva_tipo
      }))
      .filter(
        (line) =>
          line.descripcion &&
          Number.isInteger(line.cantidad) &&
          line.cantidad > 0 &&
          Number.isInteger(line.precio_unitario) &&
          line.precio_unitario > 0
      );

    if (!cliente.documento.trim() || !cliente.razon_social.trim() || items.length === 0) {
      return null;
    }

    return {
      condicion_venta: condicionVenta,
      tipo_transaccion: tipoTransaccion,
      credito_plazo_dias: condicionVenta === "CREDITO" ? creditoPlazoDias : null,
      cliente: {
        ...cliente,
        documento: cliente.documento.trim(),
        razon_social: cliente.razon_social.trim(),
        direccion: cliente.direccion?.trim() || null,
        telefono: cliente.telefono?.trim() || null,
        email: cliente.email?.trim() || null
      },
      items
    };
  }, [cliente, condicionVenta, creditoPlazoDias, lines, tipoTransaccion]);
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
      email: clientePrefillRequest.cliente.email ?? ""
    });
    setClienteSuggestions([]);
    setClienteMessage(`Cliente cargado desde agenda: ${clientePrefillRequest.cliente.razon_social}.`);
    lastAppliedClientePrefillIdRef.current = clientePrefillRequest.request_id;
    scrollSection(clientSectionRef);
  }, [clientePrefillRequest]);

  useEffect(() => {
    if (!initialDraft || initialDraftAppliedRef.current) return;
    initialDraftAppliedRef.current = true;

    setCliente(prev => ({
      ...prev,
      razon_social: initialDraft.cliente_nombre,
      documento: initialDraft.cliente_ruc ?? "",
      documento_tipo: initialDraft.cliente_ruc ? "RUC" : "RUC",
    }));

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

  useEffect(() => {
    if (!emittedDocumento || !emissionResultRef.current) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const element = emissionResultRef.current;
      if (!element) {
        return;
      }
      scrollToElement(element);
    }, 120);

    return () => window.clearTimeout(timeout);
  }, [emittedDocumento?.id]);

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
  }, [api, cliente.documento]);

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
          const result = await api.get<{ items: CatalogoItem[] }>(`/catalogo/items/search?q=${encodeURIComponent(q)}&limit=5`);
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

  useEffect(() => {
    if (!emittedDocumento || !lastEmittedRequestFingerprint || !requestFingerprint) {
      return;
    }

    if (requestFingerprint === lastEmittedRequestFingerprint) {
      return;
    }

    setEmittedDocumento(null);
    setDeliveryLink(null);
    setEmailStatus(null);
    setDeliveryMessage(null);
    setEmissionError(null);
    setIdempotencyKey(createIdempotencyKey());
    setLastEmittedRequestFingerprint(null);
  }, [emittedDocumento, lastEmittedRequestFingerprint, requestFingerprint]);

  async function runPreview(nextRequest = request) {
    if (!nextRequest) {
      setPreviewError("Complete cliente y al menos una linea para calcular.");
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
      setEmissionError("Complete cliente y lineas antes de emitir.");
      return;
    }

    setEmitting(true);
    setEmissionError(null);

    try {
      const result = await api.request<DocumentoResponse>("/facturas", {
        method: "POST",
        headers: {
          "Idempotency-Key": idempotencyKey
        },
        body: JSON.stringify(request)
      });
      setEmittedDocumento(result);
      setLastEmittedRequestFingerprint(requestFingerprint ?? JSON.stringify(request));
      setDeliveryLink(null);
      setEmailStatus(null);
      window.setTimeout(() => {
        const element = emissionResultRef.current;
        if (element) {
          scrollToElement(element);
          return;
        }
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      }, 220);
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
    } catch (error) {
      setEmissionError(error instanceof Error ? error.message : "No se pudo reintentar la emision.");
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
      title: "Factura Ventax",
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
      email: suggestion.email ?? ""
    });
    setClienteMessage(suggestion.source === "AGENDA_FACTURADOR" ? "Cliente seleccionado de la agenda." : "Datos encontrados para agregar a tu agenda.");
    setClienteSuggestions([]);
    scrollSection(clientSectionRef);
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
        return;
      }

      setCliente((current) => ({
        ...current,
        documento_tipo: result.cliente?.documento_tipo ?? current.documento_tipo,
        documento: result.cliente?.documento ?? current.documento,
        razon_social: result.cliente?.razon_social ?? current.razon_social
      }));
      setClienteMessage("Nombre o razon social autocompletado.");
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
        documento_tipo: cliente.documento_tipo,
        documento: cliente.documento,
        razon_social: cliente.razon_social,
        direccion: cliente.direccion || null,
        telefono: cliente.telefono || null,
        email: cliente.email || null
      };
      const saved = cliente.cliente_id
        ? await api.request<ClienteResponse>(`/clientes/${cliente.cliente_id}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
          })
        : await api.post<ClienteResponse>("/clientes", payload);
      applyClienteSuggestion(saved);
      setClienteModalOpen(false);
      setClienteMessage(cliente.cliente_id ? "Cliente actualizado." : "Cliente guardado para este facturador.");
    } catch (error) {
      setClienteMessage(error instanceof Error ? error.message : "No se pudo guardar el cliente.");
    } finally {
      setClienteSaving(false);
    }
  }

  function applyCatalogItem(lineId: string, item: CatalogoItem) {
    updateLine(lineId, {
      catalogo_item_id: item.id,
      codigo: item.codigo,
      descripcion: item.descripcion,
      precio_unitario: String(item.precio_unitario),
      iva_tipo: item.iva_tipo,
      lockedFromCatalog: true
    });
    setCatalogSuggestions((current) => ({ ...current, [lineId]: [] }));
    setCatalogMessage((current) => ({ ...current, [lineId]: "Item seleccionado del catalogo." }));
  }

  async function saveQuickCatalogItem(line: InvoiceLineDraft): Promise<boolean> {
    setCatalogSaving((current) => ({ ...current, [line.id]: true }));
    setCatalogMessage((current) => ({ ...current, [line.id]: null }));

    if (!Number.isInteger(Number(line.precio_unitario)) || Number(line.precio_unitario) <= 0) {
      setCatalogMessage((current) => ({ ...current, [line.id]: "Ingrese un precio entero mayor a cero." }));
      setCatalogSaving((current) => ({ ...current, [line.id]: false }));
      return false;
    }

    try {
      const saved = await api.post<CatalogoItem>("/catalogo/items", {
        codigo: line.codigo.trim() || null,
        descripcion: line.descripcion.trim(),
        precio_unitario: Number(line.precio_unitario),
        iva_tipo: line.iva_tipo,
        activo: true
      });
      applyCatalogItem(line.id, saved);
      setCatalogMessage((current) => ({ ...current, [line.id]: "Item guardado en catalogo." }));
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
        Number.isInteger(Number(line.cantidad)) &&
        Number(line.cantidad) > 0 &&
        Number.isInteger(Number(line.precio_unitario)) &&
        Number(line.precio_unitario) > 0
    )
    .forEach((line, index) => {
      previewSubtotalsByLineId.set(line.id, preview?.items[index]?.subtotal ?? 0);
    });

  function createNuevaFactura() {
    setCondicionVenta("CONTADO");
    setTipoTransaccion(2);
    setCreditoPlazoDias(context?.fiscal_context.credito_plazo_dias ?? 30);
    setCliente({
      documento_tipo: "RUC",
      documento: "",
      razon_social: "",
      direccion: "",
      telefono: "",
      email: ""
    });
    setLines([]);
    setActiveLineId(null);
    setExpandedLineIds(new Set());
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

  return (
    <section className="invoice-editor" aria-labelledby="invoice-title">
      <div className="editor-heading">
        <div>
          <p className="eyebrow">Nueva factura</p>
          <h2 id="invoice-title">Nueva factura</h2>
        </div>
        <div className="header-actions">
          <button
            aria-label={headerDetailsOpen ? "Ocultar datos del facturador" : "Mostrar datos del facturador"}
            className="ghost-action icon-eye"
            onClick={() => setHeaderDetailsOpen((current) => !current)}
            type="button"
          >
            {headerDetailsOpen ? "🙈 Ocultar datos" : "👁 Mostrar datos"}
          </button>
          <button className="ghost-action" onClick={onBack} type="button">
            Volver
          </button>
        </div>
      </div>

      {headerDetailsOpen ? (
        <section className="invoice-band" ref={comprobanteSectionRef}>
          <div>
            <dt>Facturador</dt>
            <dd>{context?.facturador.razon_social ?? "-"}</dd>
          </div>
          <div>
            <dt>RUC</dt>
            <dd>{context?.facturador.ruc ?? "-"}</dd>
          </div>
          <div>
            <dt>Est./Punto</dt>
            <dd>{context ? `${context.fiscal_context.establecimiento}-${context.fiscal_context.punto_expedicion}` : "-"}</dd>
          </div>
          <div>
            <dt>Fecha</dt>
            <dd>{today}</dd>
          </div>
          <div>
            <dt>Timbrado</dt>
            <dd>{context?.fiscal_context.timbrado ?? "-"}</dd>
          </div>
          <div>
            <dt>Siguiente estimado</dt>
            <dd>{nextFiscalNumber}</dd>
          </div>
        </section>
      ) : null}

      <section className="form-section comprobante-section" ref={comprobanteSectionRef}>
        <div>
          <p className="eyebrow">Factura</p>
          <h3>
            {cliente.razon_social.trim()
              ? cliente.razon_social.trim()
              : context?.facturador.nombre_fantasia?.trim() || context?.facturador.razon_social || "Cliente no seleccionado"}
          </h3>
          <p className="muted">Fecha {today} · Timbrado {context?.fiscal_context.timbrado ?? "-"}</p>
        </div>
        <div className="invoice-options" aria-label="Opciones de factura">
          <p className="invoice-options-title">Opciones de factura</p>
          <div className="invoice-options-body">
            <div className="segmented-control" role="group" aria-label="Condicion de venta">
              {(["CONTADO", "CREDITO"] as const).map((value) => (
                <button
                  className={condicionVenta === value ? "active" : ""}
                  key={value}
                  onClick={() => setCondicionVenta(value)}
                  type="button"
                >
                  {value === "CONTADO" ? "Contado" : "Credito"}
                </button>
              ))}
            </div>
            {condicionVenta === "CREDITO" ? (
              <label className="credit-term-field">
                Plazo
                <select onChange={(event) => setCreditoPlazoDias(Number(event.target.value))} value={creditoPlazoDias}>
                  {[30, 60, 90].map((days) => (
                    <option key={days} value={days}>
                      {days} dias
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="credit-term-field">
              Tipo de servicio
              <select onChange={(event) => setTipoTransaccion(Number(event.target.value) as TipoTransaccionServicio)} value={tipoTransaccion}>
                <option value={1}>1 - Venta de mercadería</option>
                <option value={2}>2 - Prestación de servicios</option>
                <option value={3}>3 - Mixto (mercadería + servicios)</option>
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="form-section client-section" ref={clientSectionRef}>
        <p className="eyebrow">Cliente</p>
        <div className="field-grid">
          <label className="required-field">
            Documento
            <div className="inline-fields">
              <select
                onChange={(event) => setCliente((current) => ({ ...current, documento_tipo: event.target.value as DocumentoIdentidadTipo }))}
                value={cliente.documento_tipo}
              >
                <option value="RUC">RUC</option>
                <option value="CI">CI</option>
                <option value="PASAPORTE">Pasaporte</option>
                <option value="CEDULA_EXTRANJERA">Cedula extranjera</option>
                <option value="NO_ESPECIFICADO">No especificado</option>
              </select>
              <input
                inputMode={cliente.documento_tipo === "RUC" || cliente.documento_tipo === "CI" ? "numeric" : "text"}
                onFocus={() => scrollSection(clientSectionRef)}
                onBlur={() => void tryAutocompleteDnit()}
                onChange={(event) =>
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
                      email: ""
                    };
                  })
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === "Tab") {
                    void tryAutocompleteDnit();
                  }
                }}
                placeholder="Ingrese numero de documento"
                value={cliente.documento}
              />
            </div>
            {clienteSearching || clienteAutocompleting ? (
              <span className="field-hint">{clienteSearching ? "Buscando cliente..." : "Autocompletando..."}</span>
            ) : null}
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
          </label>
          <label className="required-field">
            Nombre o razon social
            <input onFocus={() => scrollSection(clientSectionRef)} onChange={(event) => setCliente((current) => ({ ...current, razon_social: event.target.value }))} value={cliente.razon_social} />
          </label>
          <label>
            Direccion <small>(opcional)</small>
            <input onFocus={() => scrollSection(clientSectionRef)} onChange={(event) => setCliente((current) => ({ ...current, direccion: event.target.value }))} value={cliente.direccion ?? ""} />
          </label>
          <label>
            Telefono <small>(opcional)</small>
            <input inputMode="tel" onFocus={() => scrollSection(clientSectionRef)} onChange={(event) => setCliente((current) => ({ ...current, telefono: event.target.value }))} value={cliente.telefono ?? ""} />
          </label>
          <label>
            Correo <small>(opcional)</small>
            <input inputMode="email" onFocus={() => scrollSection(clientSectionRef)} onChange={(event) => setCliente((current) => ({ ...current, email: event.target.value }))} value={cliente.email ?? ""} />
          </label>
        </div>
        <div className="quick-actions-row">
          <button
            className="secondary-action"
            disabled={!cliente.documento.trim() || !cliente.razon_social.trim()}
            onClick={() => cliente.cliente_id ? void saveClienteRapido() : setClienteModalOpen(true)}
            type="button"
          >
            {cliente.cliente_id ? "Actualizar" : "Guardar cliente"}
          </button>
          {clienteMessage ? <p className="inline-message">{clienteMessage}</p> : null}
        </div>
      </section>

      <section className="form-section products-section" ref={productsSectionRef}>
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Productos</p>
            <h3>Productos/Servicios</h3>
          </div>
        </div>

        <div className="sale-list" aria-label="Productos o servicios agregados">
          {visibleLines.length === 0 ? (
            <button className="empty-sale-list" onClick={addLineAndEdit} type="button">
              <strong>+ Agregar producto</strong>
              <span>Descripcion, cantidad y precio.</span>
            </button>
          ) : null}
          {visibleLines.map((line, index) => {
            const expanded = expandedLineIds.has(line.id);
            const description = line.descripcion.trim() || line.codigo.trim() || "Producto";
            const isLong = description.length > 58;
            const quantity = Number(line.cantidad) || 1;
            const price = Number(line.precio_unitario) || 0;
            const subtotal = previewSubtotalsByLineId.get(line.id) ?? quantity * price;
            return (
              <article className="sale-item-card" key={line.id}>
                <button className="sale-item-main" onClick={() => editLine(line.id)} type="button">
                  <strong>
                    {expanded || !isLong ? description : `${description.slice(0, 58)}...`}
                    {isLong ? (
                      <small
                        className="sale-more"
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpandedLineIds((current) => {
                            const next = new Set(current);
                            if (next.has(line.id)) {
                              next.delete(line.id);
                            } else {
                              next.add(line.id);
                            }
                            return next;
                          });
                        }}
                      >
                        {expanded ? " Ver menos" : " Ver +"}
                      </small>
                    ) : null}
                  </strong>
                  <span>{quantity} x {formatGuaranies(price)}</span>
                  <b>{formatGuaranies(subtotal)}</b>
                </button>
                <div className="sale-item-actions">
                  <button aria-label={`Editar producto ${index + 1}`} className="icon-action" onClick={() => editLine(line.id)} type="button">
                    Lapiz
                  </button>
                  <button aria-label={`Eliminar producto ${index + 1}`} className="icon-action danger" onClick={() => removeLine(line.id)} type="button">
                    Basura
                  </button>
                </div>
              </article>
            );
          })}
          {visibleLines.length > 0 ? (
            <button className="add-product-action" onClick={addLineAndEdit} type="button">
              + Agregar producto
            </button>
          ) : null}
        </div>
      </section>

      {lineSheetOpen && activeLine ? (
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
                Descripcion
                <input
                  ref={descriptionInputRef}
                  autoFocus
                  onChange={(event) =>
                    updateLine(activeLine.id, { catalogo_item_id: null, descripcion: event.target.value, lockedFromCatalog: false })
                  }
                  placeholder="Ingrese descripcion"
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
                    <input inputMode="numeric" min="1" onChange={(event) => updateLine(activeLine.id, { cantidad: event.target.value })} value={activeLine.cantidad} />
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
                  Precio
                  <input
                    inputMode="decimal"
                    min="0"
                    onChange={(event) =>
                      updateLine(activeLine.id, {
                        catalogo_item_id: null,
                        precio_unitario: normalizePriceInput(event.target.value),
                        lockedFromCatalog: false
                      })
                    }
                    placeholder="0"
                    value={formatPriceInput(activeLine.precio_unitario)}
                  />
                </label>
              </div>

              {catalogSearching[activeLine.id] ? <span className="field-hint">Buscando catalogo...</span> : null}
              {(catalogSuggestions[activeLine.id] ?? []).length > 0 ? (
                <div className="suggestion-list catalog">
                  {(catalogSuggestions[activeLine.id] ?? []).map((item) => (
                    <button key={item.id} onClick={() => applyCatalogItem(activeLine.id, item)} type="button">
                      <strong>{item.codigo}</strong>
                      <span>{item.descripcion}</span>
                      <small>{formatGuaranies(item.precio_unitario)} · {formatIva(item.iva_tipo)}</small>
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
                {lineCodeOpen ? "Ocultar codigo interno" : "+ Agregar codigo interno"}
              </button>

              {lineCodeOpen ? (
                <div className="advanced-fields">
                  <label>
                    Codigo interno
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
                <strong>{formatGuaranies(previewSubtotalsByLineId.get(activeLine.id) ?? (Number(activeLine.cantidad) || 1) * (Number(activeLine.precio_unitario) || 0))}</strong>
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
                    catalogSaving[activeLine.id] ||
                    !activeLine.descripcion.trim() ||
                    !Number.isInteger(Number(activeLine.precio_unitario)) ||
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
                    !Number.isInteger(Number(activeLine.precio_unitario)) ||
                    Number(activeLine.precio_unitario) <= 0
                  }
                  onClick={() => void confirmLine(activeLine, false)}
                  type="button"
                >
                  AGREGAR Y NO GUARDAR
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
      <section className="totals-section" aria-live="polite" ref={sendSectionRef}>
        <div className="totals-grid">
          <TotalRow label="Subtotal" value={preview?.totals.subtotal ?? 0} />
          <TotalRow label="Total sin IVA" value={preview?.totals.total_sin_iva ?? 0} />
          <TotalRow label="IVA 5%" value={preview?.totals.iva_5 ?? 0} />
          <TotalRow label="IVA 10%" value={preview?.totals.iva_10 ?? 0} />
          <TotalRow label="Total IVA" value={preview?.totals.total_iva ?? 0} />
          <TotalRow strong label="Total a pagar" value={preview?.totals.total ?? 0} />
        </div>
        {previewError ? <p className="form-error">{previewError}</p> : null}
        <div className="editor-actions">
          <button className="secondary-action wide" disabled={previewing} onClick={() => void runPreview()} type="button">
            {previewing ? "Calculando..." : "Calcular"}
          </button>
          <button
            className="primary-action wide"
            disabled={!canEmit || !preview || emitting || hasEmissionResult}
            onClick={() => void emitFactura()}
            type="button"
          >
            {emitting ? "Procesando..." : "Crear factura"}
          </button>
        </div>
        {emissionError ? <p className="form-error">{emissionError}</p> : null}
      </section>

      {emittedDocumento ? (
        <section className="emission-result" aria-live="polite" ref={emissionResultRef}>
          <div className="receipt-heading">
            <div>
              <p className="eyebrow">{formatDocumentoTipo(emittedDocumento.tipo)}</p>
              <h3>{getSimpleDocumentoEstado(emittedDocumento.estado, emittedDocumento.tipo)}</h3>
              <p className="muted">Numero {emittedDocumento.numero_fiscal ?? "pendiente"}</p>
            </div>
            <span className={emittedDocumento.estado === "EMITIDA" ? "status-pill ready" : "status-pill blocked"}>
              {getSimpleDocumentoEstado(emittedDocumento.estado, emittedDocumento.tipo)}
            </span>
          </div>

          <div className="receipt-summary">
            <div>
              <dt>Cliente</dt>
              <dd>{emittedDocumento.cliente.razon_social}</dd>
            </div>
            <div>
              <dt>Documento</dt>
              <dd>{emittedDocumento.cliente.documento}</dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{formatGuaranies(emittedDocumento.totals.total)}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{formatEmailStatus(emailStatus?.status ?? emittedDocumento.delivery.email_status)}</dd>
            </div>
          </div>

          <p className="editor-alert blocked">{getSimpleDocumentoHint(emittedDocumento.estado, emittedDocumento.tipo)}</p>
          {emailStatus?.message ? <p className="editor-alert ready">{emailStatus.message}</p> : null}

          <div className="action-group">
            <p className="group-title">Acciones mas frecuentes</p>
            <div className="delivery-inline-form">
              <label>
                📱 WhatsApp
                <input inputMode="tel" onChange={(event) => setWhatsappPhone(event.target.value)} placeholder="Ingrese numero" value={whatsappPhone} />
              </label>
            </div>
            <a
              className={deliveryLink ? "primary-action wide secondary-link-as-button" : "primary-action wide secondary-link-as-button disabled"}
              href={deliveryLink ? buildWhatsAppShareUrl(deliveryLink.public_url, whatsappPhone) : "#"}
              rel="noreferrer"
              target="_blank"
            >
              Enviar por WhatsApp
            </a>
            <div className="delivery-actions">
              <button className="secondary-action" disabled={!deliveryLink} onClick={() => void sharePublicLink()} type="button">
                Compartir {getDocumentoNombreLower(emittedDocumento.tipo)}
              </button>
              <button className="secondary-action" disabled={!deliveryLink} onClick={() => void copyPublicLink()} type="button">
                Copiar enlace
              </button>
            </div>
          </div>

          <div className="action-group">
            <button className="primary-action wide" onClick={createNuevaFactura} type="button">
              Crear nueva factura
            </button>
          </div>

          <details className="action-group">
            <summary className="group-title">Mas opciones</summary>
            <div className="result-actions">
              <a
                className={emittedXmlUrl ? "secondary-link" : "secondary-link disabled"}
                href={emittedXmlUrl ?? "#"}
                rel="noreferrer"
                target="_blank"
              >
                Descargar documento electronico (XML)
              </a>
              <button
                className="secondary-action"
                disabled={deliveryLoading}
                onClick={() => void loadDeliveryData(emittedDocumento.id, true)}
                type="button"
              >
                Regenerar enlace
              </button>
              <button
                className="secondary-action"
                disabled={emitting || !emittedDocumento.cdc}
                onClick={() => void refreshEmittedDocumento()}
                type="button"
              >
                Consultar estado fiscal
              </button>
              <button
                className="secondary-action"
                disabled={emitting || !["PENDIENTE_SIFEN", "ERROR_TEMPORAL"].includes(emittedDocumento.estado)}
                onClick={() => void retryEmittedDocumento()}
                type="button"
              >
                Reintentar validacion
              </button>
            </div>
          </details>

          {deliveryMessage ? <p className="inline-message">{deliveryMessage}</p> : null}
        </section>
      ) : null}

      {clienteModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-panel" aria-labelledby="cliente-modal-title" role="dialog" aria-modal="true">
            <div className="editor-heading">
              <div>
                <p className="eyebrow">Alta rapida</p>
                <h2 id="cliente-modal-title">Guardar cliente</h2>
              </div>
              <button className="ghost-action" onClick={() => setClienteModalOpen(false)} type="button">
                Cerrar
              </button>
            </div>
            <dl className="confirm-dl">
              <div>
                <dt>Documento</dt>
                <dd>{cliente.documento || "-"}</dd>
              </div>
              <div>
                <dt>Razon social</dt>
                <dd>{cliente.razon_social || "-"}</dd>
              </div>
            </dl>
            {clienteMessage ? <p className="form-error">{clienteMessage}</p> : null}
            <button className="primary-action wide" disabled={clienteSaving} onClick={() => void saveClienteRapido()} type="button">
              {clienteSaving ? "Guardando..." : "Confirmar alta"}
            </button>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function TotalRow({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={strong ? "total-row strong" : "total-row"}>
      <span>{label}</span>
      <strong>{formatGuaranies(value)}</strong>
    </div>
  );
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <main className="auth-shell">
      <section className="loading-panel" aria-live="polite">
        <BrandMark />
        <div className="spinner" aria-hidden="true" />
        <p>{message}</p>
      </section>
    </main>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "brand-mark compact" : "brand-mark"} aria-label="Ventax Factura">
      <img
        alt="Ventax"
        className="brand-logo"
        src={compact ? "/app/brand/VENTAX-ISO-CELESTE.svg" : "/app/brand/VENTAX-PRINCIPAL.svg"}
      />
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

function createCatalogoDraft(): CatalogoDraft {
  return {
    codigo: "",
    descripcion: "",
    precio_unitario: "",
    iva_tipo: "IVA_10",
    activo: true
  };
}

function createIdempotencyKey(): string {
  return `ui-${Date.now()}-${crypto.randomUUID()}`;
}

function getNextFiscalNumber(current: string | undefined): string {
  if (!current) {
    return "-";
  }

  const numeric = Number(current);
  if (!Number.isInteger(numeric)) {
    return current;
  }

  return String(numeric + 1).padStart(current.length, "0");
}

function buildWhatsAppShareUrl(publicUrl: string, phone: string): string {
  const digits = normalizeParaguayWhatsAppDigits(phone);
  const text = encodeURIComponent(`Comprobante Ventax: ${publicUrl}`);
  if (!digits) {
    return `https://wa.me/?text=${text}`;
  }
  return `https://wa.me/${digits}?text=${text}`;
}

function normalizeParaguayWhatsAppDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) {
    return "";
  }
  if (digits.startsWith("00")) {
    return digits.slice(2);
  }
  if (digits.startsWith("595")) {
    return digits;
  }
  if (digits.startsWith("09")) {
    return `595${digits.slice(1)}`;
  }
  if (digits.startsWith("9") && digits.length === 9) {
    return `595${digits}`;
  }
  if (digits.startsWith("0")) {
    return `595${digits.slice(1)}`;
  }
  return digits;
}

function mapBusinessReadinessChecks(
  checks: Array<{
    code: string;
    ok: boolean;
    message: string;
  }>
): Array<{ code: string; ok: boolean; message: string }> {
  const byCode = new Map(checks.map((check) => [check.code, check]));

  const tenant = byCode.get("tenant_activo");
  const suscripcion = byCode.get("suscripcion_activa");
  const facturador = byCode.get("facturador_activo");
  const contexto = byCode.get("fiscal_context_local") ?? byCode.get("contexto_fiscal_local_completo");
  const backendFiscal = byCode.get("fiscal_backend_ready");
  const integracionFiscalOk = Boolean(contexto?.ok) && Boolean(backendFiscal?.ok);

  return [
    {
      code: "membresia_activa",
      ok: tenant?.ok ?? false,
      message: tenant?.ok ? "Membresia activa" : "Membresia inactiva. Contacte a soporte para reactivarla."
    },
    {
      code: "suscripcion_al_dia",
      ok: suscripcion?.ok ?? false,
      message: suscripcion?.ok ? "Suscripcion al dia" : "Suscripcion con pagos pendientes. Regularice para facturar."
    },
    {
      code: "facturador_activo",
      ok: facturador?.ok ?? false,
      message: facturador?.ok ? "Facturador activo" : "Facturador inactivo. Solicite activacion al administrador."
    },
    {
      code: "operacion_fiscal_habilitada",
      ok: integracionFiscalOk,
      message: integracionFiscalOk
        ? "Integracion con facturacion-electronica lista para operar"
        : !contexto?.ok
          ? "Faltan datos fiscales. Contacte al equipo de configuracion."
          : "Conexion con facturacion-electronica no disponible. Intente nuevamente o contacte a soporte."
    }
  ];
}

function formatGuaranies(value: number): string {
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: "PYG",
    maximumFractionDigits: 0
  }).format(value);
}

function formatYmdFromDate(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(value: string | null): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleDateString("es-PY");
}

function getDocumentoStatusIcon(value: DocumentoEstado): string {
  if (value === "EMITIDA") {
    return "🟢";
  }
  if (value === "RECHAZADA" || value === "ERROR_OPERATIVO" || value === "ERROR_TEMPORAL" || value === "ANULADA") {
    return "🔴";
  }
  return "🟡";
}

function formatIva(value: TipoIva): string {
  if (value === "IVA_10") {
    return "IVA 10%";
  }
  if (value === "IVA_5") {
    return "IVA 5%";
  }
  return "Exenta";
}

function formatDocumentoEstado(value: DocumentoEstado, tipo?: DocumentoResponse["tipo"]): string {
  const nombre = formatDocumentoTipo(tipo ?? "FACTURA");
  const labels: Record<DocumentoEstado, string> = {
    EMITIENDO: "Emision en proceso",
    EMITIDA: `${nombre} emitida`,
    PENDIENTE_SIFEN: "Pendiente SIFEN",
    RECHAZADA: "Rechazada",
    ERROR_OPERATIVO: "Error operativo",
    ERROR_TEMPORAL: "Error temporal",
    ANULADA: "Anulada"
  };
  return labels[value];
}

function getSimpleDocumentoEstado(value: DocumentoEstado, tipo?: DocumentoResponse["tipo"]): string {
  const nombre = formatDocumentoTipo(tipo ?? "FACTURA");
  if (value === "EMITIDA") {
    return `🟢 ${nombre} emitida`;
  }
  if (value === "RECHAZADA" || value === "ERROR_OPERATIVO" || value === "ERROR_TEMPORAL" || value === "ANULADA") {
    return "🔴 Requiere revision";
  }
  return `🟡 Procesando ${nombre.toLowerCase()}`;
}

function getSimpleDocumentoHint(value: DocumentoEstado, tipo?: DocumentoResponse["tipo"]): string {
  const nombre = formatDocumentoTipo(tipo ?? "FACTURA");
  if (value === "EMITIDA") {
    return `${nombre} lista para enviar por WhatsApp, compartir enlace o abrir PDF.`;
  }
  if (value === "RECHAZADA" || value === "ERROR_OPERATIVO" || value === "ERROR_TEMPORAL" || value === "ANULADA") {
    return "El documento requiere revision antes de continuar.";
  }
  return `Estamos procesando la ${nombre.toLowerCase()}. Puede compartir el enlace al cliente.`;
}

function formatDocumentoTipo(value: DocumentoResponse["tipo"]): string {
  return value === "NOTA_CREDITO" ? "Nota credito" : "Factura";
}

function getDocumentoNombreLower(tipo: DocumentoResponse["tipo"]): string {
  return tipo === "NOTA_CREDITO" ? "nota de credito" : "factura";
}

function formatOperationViewTitle(value: OperationView): string {
  const labels: Record<OperationView, string> = {
    status: "Informacion",
    invoice: "Nueva factura",
    clients: "Agenda clientes",
    "credit-note": "Devolver factura",
    catalog: "Catalogo",
    documents: "Documentos",
    notas: "Notas / Presupuestos",
    recibos: "Cobros / Recibos"
  };
  return labels[value];
}

function getOperationViewHint(value: OperationView): string {
  const hints: Record<OperationView, string> = {
    status: "Estado del facturador",
    invoice: "Crear factura electronica",
    clients: "Agenda de contactos",
    "credit-note": "Devolver una factura",
    catalog: "Productos y servicios",
    documents: "Facturas y notas emitidas",
    notas: "Notas de pedido y presupuesto",
    recibos: "Cobros y recibos de dinero"
  };
  return hints[value];
}

function getReasonModalTitle(
  action: "CANCEL_DETAIL" | "CANCEL_LIST" | "CREDIT_NOTE_DETAIL" | "CREDIT_NOTE_LIST" | "VOID_NUMBER",
  tipo?: DocumentoResponse["tipo"]
): string {
  if (action === "VOID_NUMBER") {
    return "Inutilizar numeracion";
  }
  if (action === "CREDIT_NOTE_DETAIL" || action === "CREDIT_NOTE_LIST") {
    return "Crear nota de credito";
  }
  return `Anular ${getDocumentoNombreLower(tipo ?? "FACTURA")}`;
}

function getReasonModalPlaceholder(
  action: "CANCEL_DETAIL" | "CANCEL_LIST" | "CREDIT_NOTE_DETAIL" | "CREDIT_NOTE_LIST" | "VOID_NUMBER"
): string {
  if (action === "VOID_NUMBER") {
    return "Explique por que necesita inutilizar la numeracion.";
  }
  if (action === "CREDIT_NOTE_DETAIL" || action === "CREDIT_NOTE_LIST") {
    return "Ej: devolucion de mercaderia, error en monto o cliente.";
  }
  return "Ej: error en datos del comprobante o anulacion solicitada por cliente.";
}

function getNotaCreditoSuccessMessage(estado: DocumentoEstado): string {
  if (estado === "EMITIDA") {
    return "La nota de credito fue aceptada por SIFEN. El PDF ya esta disponible para compartir.";
  }
  if (estado === "PENDIENTE_SIFEN" || estado === "EMITIENDO") {
    return "La nota de credito fue enviada al sistema fiscal y esta pendiente de confirmacion SIFEN. Refrescar el estado es seguro — se usa la misma referencia idempotente.";
  }
  return "La nota de credito fue procesada. Verificar el estado fiscal para continuar.";
}

function getOperationalTitle(context: OperationalContextResponse | null): string {
  return (
    firstText(
      context?.display?.titulo_operativo,
      context?.fiscal_context.perfil_emision_alias,
      context?.facturador.nombre_fantasia,
      context?.fiscal_context.actividad_economica_alias,
      context?.fiscal_context.actividad_economica_descripcion,
      context?.facturador.razon_social
    ) ?? "Sin facturador asignado"
  );
}

function formatPerfilOperativo(context: OperationalContextResponse | null): string {
  if (!context) {
    return "-";
  }

  return context.fiscal_context.perfil_emision_alias
    ? `${context.fiscal_context.perfil_emision_codigo} · ${context.fiscal_context.perfil_emision_alias}`
    : context.fiscal_context.perfil_emision_codigo;
}

function formatActividadOperativa(context: OperationalContextResponse | null): string {
  if (!context) {
    return "-";
  }

  const label = firstText(context.fiscal_context.actividad_economica_alias, context.fiscal_context.actividad_economica_descripcion);
  return label ? `${context.fiscal_context.actividad_economica_codigo} · ${label}` : context.fiscal_context.actividad_economica_codigo;
}

function firstText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function canCancelDocumento(documento: DocumentoResponse): boolean {
  return documento.tipo === "FACTURA" && documento.estado === "EMITIDA" && Boolean(documento.cdc);
}

function canEmitNotaCredito(documento: DocumentoResponse, documents: DocumentoResponse[]): boolean {
  if (documento.tipo !== "FACTURA" || documento.estado !== "EMITIDA" || !documento.cdc) {
    return false;
  }

  return !documents.some((item) => item.tipo === "NOTA_CREDITO" && item.documento_relacionado_id === documento.id);
}

function formatEmailStatus(value: string): string {
  if (value === "DELEGATED") {
    return "Delegado";
  }
  if (value === "SENT") {
    return "Enviado";
  }
  if (value === "FAILED") {
    return "Fallido";
  }
  if (value === "NOT_APPLICABLE") {
    return "Sin email";
  }
  return "Desconocido";
}

interface SifenSummary {
  code: string | null;
  message: string | null;
  status: string | null;
  processedAt: string | null;
}

function getSifenSummary(documento: DocumentoResponse): SifenSummary | null {
  const source = documento.fiscal_status;
  if (!source) {
    return null;
  }

  const summary: SifenSummary = {
    code: findNestedFiscalValue(source, "dCodRes"),
    message: findNestedFiscalValue(source, "dMsgRes"),
    status: findNestedFiscalValue(source, "dEstRes"),
    processedAt: findNestedFiscalValue(source, "dFecProc")
  };

  if (!summary.code && !summary.message && !summary.status && !summary.processedAt) {
    return null;
  }

  return summary;
}

function findNestedFiscalValue(value: unknown, targetKey: string): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = key.includes(":") ? key.split(":").at(-1) : key;
    if (normalizedKey === targetKey && (typeof nestedValue === "string" || typeof nestedValue === "number")) {
      return String(nestedValue);
    }

    if (Array.isArray(nestedValue)) {
      for (const item of nestedValue) {
        const found = findNestedFiscalValue(item, targetKey);
        if (found) {
          return found;
        }
      }
      continue;
    }

    const found = findNestedFiscalValue(nestedValue, targetKey);
    if (found) {
      return found;
    }
  }

  return null;
}

function formatSifenSummary(summary: SifenSummary | null): string {
  if (!summary) {
    return "Sin respuesta fiscal resumida";
  }

  const status = summary.status ? `${summary.status} · ` : "";
  if (summary.code && summary.message) {
    return `${status}${summary.code} · ${summary.message}`;
  }
  if (summary.message) {
    return `${status}${summary.message}`;
  }
  if (summary.code) {
    return `${status}${summary.code}`;
  }
  return summary.status ?? "Sin respuesta fiscal resumida";
}

function getRejectedSifenMessage(summary: SifenSummary | null): string {
  const base = `Documento rechazado por SIFEN: ${formatSifenSummary(summary)}.`;
  if (summary?.code === "1306") {
    return `${base} Use un receptor existente en Marangatu test o un receptor ya validado para pruebas aprobadas.`;
  }
  return `${base} Revise los datos del receptor y el detalle fiscal antes de reintentar.`;
}

function getRecoverableMessage(documento: DocumentoResponse): string | null {
  if (documento.estado === "EMITIENDO") {
    return "La factura quedo en cola. Puede consultar el detalle o refrescar cuando el backend fiscal responda.";
  }
  if (documento.estado === "PENDIENTE_SIFEN") {
    return "La confirmacion fiscal esta pendiente. Refrescar estado o reintentar es seguro porque se usa la misma referencia idempotente.";
  }
  if (documento.estado === "ERROR_TEMPORAL") {
    return "Hubo un error temporal de comunicacion fiscal. Puede reintentar sin duplicar el documento operativo.";
  }
  return null;
}

function normalizeDocKey(value: string): string {
  return value.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
}

function normalizePriceInput(value: string): string {
  return value.replace(/[^\d]/g, "");
}

function formatPriceInput(value: string): string {
  const digits = normalizePriceInput(value);
  if (!digits) {
    return "";
  }
  return Number(digits).toLocaleString("es-PY");
}

function createApiClient(accessToken: string | null, setAccessToken: (token: string | null) => void) {
  async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers
      }
    });

    checkVersionHeader(response);

    if (response.status === 401 && retry) {
      const refreshed = await refreshSession();
      setAccessToken(refreshed.access_token);
      return createApiClient(refreshed.access_token, setAccessToken).request<T>(path, init, false);
    }

    if (!response.ok) {
      throw new ApiClientError(response.status, await readApiError(response));
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  return {
    get: <T,>(path: string) => request<T>(path),
    post: <T,>(path: string, body: unknown, retry = true) =>
      request<T>(
        path,
        {
          method: "POST",
          body: JSON.stringify(body)
        },
        retry
      ),
    request
  };
}

async function refreshSession(): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(await readApiError(response));
  }

  return response.json() as Promise<AuthResponse>;
}

async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorResponse;
    return body.error?.message ?? body.message ?? "Solicitud rechazada.";
  } catch {
    return "No se pudo completar la solicitud.";
  }
}

function formatDocumentoEstadoSimple(value: DocumentoEstado, tipo?: DocumentoResponse["tipo"]): string {
  const nombre = formatDocumentoTipo(tipo ?? "FACTURA");
  switch (value) {
    case "EMITIDA":
      return `🟢 ${nombre} emitida`;
    case "EMITIENDO":
    case "PENDIENTE_SIFEN":
      return `🟡 Procesando ${nombre.toLowerCase()}`;
    case "ANULADA":
      return "⚪ Anulada";
    default:
      return "🔴 Requiere revision";
  }
}

function clearSession(setAccessToken: (token: string | null) => void) {
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  setAccessToken(null);
}

// ─── Tipos locales del módulo notas ───────────────────────────────────────────

type NotaTipo = "PRESUPUESTO" | "PEDIDO";
type NotaEstado = "BORRADOR" | "EMITIDO";
type NotaEstadoComercial = "PENDIENTE_RESPUESTA" | "ACEPTADO" | "RECHAZADO";
type NotaEstadoVisual = "BORRADOR" | "PENDIENTE" | "VENCIDO" | "ACEPTADO" | "RECHAZADO";
type NotaFilaTipo = "CONTEXTO" | "ITEM" | "ITEM_SIN_PRECIO";

interface NotaFilaDraft {
  _id: string;
  fila_tipo: NotaFilaTipo;
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
  catalog_item_id: string | null;
  catalog_iva_tipo: string | null;
}

interface NotaClienteDraft {
  documento_tipo: "RUC" | "CI";
  documento: string;
  nombre: string;
  cliente_id: string | null;
}

interface NotaListItem {
  id: string;
  tipo: NotaTipo;
  numero: number | null;
  estado: NotaEstado;
  estado_comercial: NotaEstadoComercial | null;
  fecha_emision: string | null;
  valido_hasta: string | null;
  cliente_nombre: string;
  cliente_ruc: string | null;
  observaciones: string | null;
  created_at: string;
  total?: number;
  verification_token?: string;
}

interface NotaConItems extends NotaListItem {
  items: Array<{
    id: string;
    orden: number;
    fila_tipo: NotaFilaTipo;
    descripcion: string;
    cantidad: number | null;
    precio_unitario: number | null;
    precio_total: number | null;
    catalog_item_id: string | null;
    catalog_iva_tipo: string | null;
  }>;
  total: number;
}

interface InvoiceInitialDraft {
  cliente_nombre: string;
  cliente_ruc: string | null;
  items: Array<{
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    iva_tipo: TipoIva;
    catalog_item_id: string | null;
  }>;
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
  accessToken,
  setAccessToken,
  onBack,
  onConvertirEnFactura,
}: {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  onBack: () => void;
  onConvertirEnFactura: (draft: InvoiceInitialDraft) => void;
}) {
  const api = useMemo(() => createApiClient(accessToken, setAccessToken), [accessToken, setAccessToken]);
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
      setMessage(`Borrador creado a partir de ${nota.tipo === "PRESUPUESTO" ? "presupuesto" : "pedido"} N° ${String(nota.numero ?? "").padStart(7, "0")}.`);
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
    updateFila(filaId, { descripcion: item.descripcion, precio_unitario: String(item.precio_unitario), catalog_item_id: item.id, catalog_iva_tipo: item.iva_tipo });
    setCatalogSuggestions(c => ({ ...c, [filaId]: [] }));
    setCatalogMessage(c => ({ ...c, [filaId]: null }));
    setFilaSheetOpen(false);
  }

  async function saveQuickCatalogItem(fila: NotaFilaDraft): Promise<boolean> {
    const precio = Number(fila.precio_unitario);
    if (!Number.isInteger(precio) || precio <= 0) {
      setCatalogMessage(c => ({ ...c, [fila._id]: "Ingrese un precio entero mayor a cero." }));
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
    if (andEmit && !formFilas.some(f => f.fila_tipo === "ITEM")) {
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
        items: formFilas.map((f, i) => ({
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
        const res = await fetch(`/api/v1/notas/${nota.id}/pdf`, { headers: { Authorization: `Bearer ${accessToken ?? ""}` } });
        if (!res.ok) throw new Error("No se pudo generar el PDF.");
        window.open(URL.createObjectURL(await res.blob()), "_blank");
      } catch (e) { setError(e instanceof Error ? e.message : "Error al abrir el PDF."); }
    })();
  }

  // ── Sub-vista: detalle ──

  if (subView === "detail" && selectedNota) {
    const nroStr = selectedNota.numero != null ? String(selectedNota.numero).padStart(7, "0") : "-------";
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
        if (navigator.share) { await navigator.share({ title: `${tipoLabel} Ventax`, url: notaPublicUrl }); return; }
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
          </div>
          <dl className="receipt-summary">
            {(selectedNota.total ?? 0) > 0 ? <div><dt>Total</dt><dd><strong>{formatGuaranies(selectedNota.total ?? 0)}</strong></dd></div> : null}
            <div><dt>Fecha</dt><dd>{selectedNota.fecha_emision ?? "Borrador"}</dd></div>
            {selectedNota.valido_hasta ? <div><dt>Validez</dt><dd>{selectedNota.valido_hasta}</dd></div> : null}
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

        {/* Estado comercial */}
        {puedeMarcarEstado ? (
          <section className="nota-detail-section">
            <p className="eyebrow">Estado del presupuesto</p>
            <div className="delivery-actions">
              <button
                className={`secondary-action${selectedNota.estado_comercial === "ACEPTADO" ? " active-state-btn" : ""}`}
                onClick={() => void handleEstadoComercial(selectedNota.id, "ACEPTADO")}
                disabled={estadoComercialLoading || selectedNota.estado_comercial === "ACEPTADO"}
                type="button"
              >Aceptado</button>
              <button
                className={`secondary-action${selectedNota.estado_comercial === "RECHAZADO" ? " active-state-btn" : ""}`}
                onClick={() => void handleEstadoComercial(selectedNota.id, "RECHAZADO")}
                disabled={estadoComercialLoading || selectedNota.estado_comercial === "RECHAZADO"}
                type="button"
              >Rechazado</button>
              <button
                className="secondary-action"
                onClick={() => void handleEstadoComercial(selectedNota.id, "PENDIENTE_RESPUESTA")}
                disabled={estadoComercialLoading || selectedNota.estado_comercial == null || selectedNota.estado_comercial === "PENDIENTE_RESPUESTA"}
                type="button"
              >Pendiente</button>
            </div>
          </section>
        ) : null}

        {/* Convertir en factura */}
        {puedeConvertir && notaFull ? (
          <div className="action-group">
            <button className="primary-action wide" onClick={() => handleConvertirEnFactura(notaFull)} type="button">
              Convertir en factura
            </button>
          </div>
        ) : null}

        {/* Compartir */}
        <div className="action-group">
          <p className="group-title">Compartir</p>
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
            <button className="secondary-action" disabled={!notaPublicUrl} onClick={() => void shareNotaLink()} type="button">Compartir enlace</button>
            <button className="secondary-action" disabled={!notaPublicUrl} onClick={() => void copyNotaLink()} type="button">Copiar enlace</button>
            <button className="secondary-action" onClick={() => openPdf(selectedNota)} type="button">Ver PDF</button>
          </div>
          {deliveryMessage ? <p className="inline-message">{deliveryMessage}</p> : null}
        </div>

        {/* Nueva nota */}
        <div className="action-group">
          <button className="primary-action wide" onClick={openCreate} type="button">
            {filtroTipo === "PRESUPUESTO" ? "Nuevo presupuesto" : "Nuevo pedido"}
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
                      <textarea className="nota-fila-textarea" rows={2} placeholder="Descripción de sección (aparece en negrita en el PDF)..." value={fila.descripcion} onChange={e => updateFila(fila._id, { descripcion: e.target.value })} />
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
                      <textarea className="nota-fila-textarea" rows={2} placeholder="Descripción del item (sin precio)..." value={fila.descripcion} onChange={e => updateFila(fila._id, { descripcion: e.target.value })} />
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
                    <div className="nota-item-header">
                      <span className="nota-fila-badge nota-fila-badge-item">Item</span>
                      <strong>{fila.descripcion.trim() || "Item con precio"}</strong>
                    </div>
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
                        <input inputMode="numeric" min="1" value={activeFila.cantidad} onChange={e => updateFila(activeFila._id, { cantidad: e.target.value })} />
                        <button type="button" aria-label="Sumar" onClick={() => updateFila(activeFila._id, { cantidad: String((Number(activeFila.cantidad) || 0) + 1) })}>+</button>
                      </div>
                    </label>
                    <label>
                      Precio (Gs.)
                      <input inputMode="decimal" min="0" placeholder="0" value={formatPriceInput(activeFila.precio_unitario)} onChange={e => updateFila(activeFila._id, { precio_unitario: normalizePriceInput(e.target.value) })} />
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
    const mesLabel = new Date(mes + "-01").toLocaleString("es-PY", { month: "long", year: "numeric" });
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
          <h2 id="notas-list-title">Presupuestos</h2>
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
                const nroStr = nota.numero != null ? String(nota.numero).padStart(7, "0") : "Borrador";
                const estadoVisual = calcularEstadoVisualNota(nota);
                const isMenuOpen = menuOpenId === nota.id;
                return (
                  <div key={nota.id} className="invoice-card">
                    <button
                      className="invoice-card-main"
                      type="button"
                      onClick={() => nota.estado === "BORRADOR" ? openEdit(nota) : void openDetail(nota)}
                    >
                      <div className="invoice-card-top">
                        <span className="invoice-card-nro">{nroStr}</span>
                        <span className={ESTADO_VISUAL_CLASS[estadoVisual]}>{ESTADO_VISUAL_LABEL[estadoVisual]}</span>
                      </div>
                      <div className="invoice-card-cliente">{nota.cliente_nombre}</div>
                      <div className="invoice-card-meta">
                        <span className="muted">{nota.fecha_emision ?? nota.created_at.slice(0, 10)}</span>
                        {(nota.total ?? 0) > 0 ? <strong>{formatGuaranies(nota.total ?? 0)}</strong> : null}
                      </div>
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
                                  ? navigator.share({ title: `${filtroTipo === "PRESUPUESTO" ? "Presupuesto" : "Pedido"} Ventax`, url })
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

// ─── Tipos locales del módulo recibos ────────────────────────────────────────

type ReciboFormaPago = "EFECTIVO" | "TRANSFERENCIA" | "CHEQUE" | "TARJETA_CREDITO" | "TARJETA_DEBITO" | "OTRO";

const FORMAS_PAGO_LABELS: Record<ReciboFormaPago, string> = {
  EFECTIVO: "Efectivo",
  TRANSFERENCIA: "Transferencia",
  CHEQUE: "Cheque",
  TARJETA_CREDITO: "Tarjeta de Crédito",
  TARJETA_DEBITO: "Tarjeta de Débito",
  OTRO: "Otro",
};

interface ReciboRecord {
  id: string;
  numero: number | null;
  estado: "BORRADOR" | "EMITIDO";
  fecha_cobro: string;
  pagador_nombre: string;
  pagador_documento_tipo: string | null;
  pagador_documento: string | null;
  concepto: string;
  importe: number;
  forma_pago: ReciboFormaPago;
  referencia_bancaria: string | null;
  factura_id: string | null;
  factura_numero_display: string | null;
  verification_token: string;
  emitido_at: string | null;
  created_at: string;
}

// ─── Componente RecibosView ───────────────────────────────────────────────────

function RecibosView({
  accessToken,
  setAccessToken,
  onBack,
}: {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  onBack: () => void;
}) {
  const api = useMemo(() => createApiClient(accessToken, setAccessToken), [accessToken, setAccessToken]);
  const [recibos, setRecibos] = useState<ReciboRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  type SubView = "list" | "form" | "detail";
  const [subView, setSubView] = useState<SubView>("list");
  const [selectedRecibo, setSelectedRecibo] = useState<ReciboRecord | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReciboRecord | null>(null);

  const [formPagadorNombre, setFormPagadorNombre] = useState("");
  const [formPagadorDocTipo, setFormPagadorDocTipo] = useState("");
  const [formPagadorDoc, setFormPagadorDoc] = useState("");
  const [formConcepto, setFormConcepto] = useState("");
  const [formImporte, setFormImporte] = useState("");
  const [formFormaPago, setFormFormaPago] = useState<ReciboFormaPago>("EFECTIVO");
  const [formFechaCobro, setFormFechaCobro] = useState(() => new Date().toISOString().slice(0, 10));
  const [formRefBancaria, setFormRefBancaria] = useState("");

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

  const openNew = () => {
    setEditingId(null);
    setFormPagadorNombre("");
    setFormPagadorDocTipo("");
    setFormPagadorDoc("");
    setFormConcepto("");
    setFormImporte("");
    setFormFormaPago("EFECTIVO");
    setFormFechaCobro(new Date().toISOString().slice(0, 10));
    setFormRefBancaria("");
    setError(null);
    setSubView("form");
  };

  const openEdit = (r: ReciboRecord) => {
    setEditingId(r.id);
    setFormPagadorNombre(r.pagador_nombre);
    setFormPagadorDocTipo(r.pagador_documento_tipo ?? "");
    setFormPagadorDoc(r.pagador_documento ?? "");
    setFormConcepto(r.concepto);
    setFormImporte(String(r.importe));
    setFormFormaPago(r.forma_pago);
    setFormFechaCobro(r.fecha_cobro);
    setFormRefBancaria(r.referencia_bancaria ?? "");
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
      if (!confirm(`¿Emitir el recibo para ${r.pagador_nombre}? Esta accion no se puede deshacer.`)) return;
      const emitido = await api.request<ReciboRecord>(`/recibos/${r.id}/emitir`, { method: "POST" });
      setSelectedRecibo(emitido);
      await loadRecibos();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al emitir.");
    } finally {
      setSaving(false);
    }
  };

  const openPdf = (r: ReciboRecord) => {
    const token = accessToken ?? "";
    window.open(`/api/v1/recibos/${r.id}/pdf?token=${token}`, "_blank");
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

  if (subView === "form") {
    return (
      <div className="module-view">
        <div className="view-header">
          <button type="button" className="ghost-action" onClick={() => setSubView("list")}>← Volver</button>
          <h2>{editingId ? "Editar recibo" : "Nuevo recibo"}</h2>
        </div>
        {error ? <p className="error-banner">{error}</p> : null}
        <div className="form-section">
          <label>
            Fecha de cobro
            <input type="date" value={formFechaCobro} onChange={(e) => setFormFechaCobro(e.target.value)} />
          </label>
          <label>
            Pagador (nombre o razon social) *
            <input type="text" value={formPagadorNombre} onChange={(e) => setFormPagadorNombre(e.target.value)} placeholder="Juan Perez" />
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            <label style={{ flex: "0 0 120px" }}>
              Tipo documento
              <select value={formPagadorDocTipo} onChange={(e) => setFormPagadorDocTipo(e.target.value)}>
                <option value="">—</option>
                <option value="CI">CI</option>
                <option value="RUC">RUC</option>
                <option value="PASAPORTE">Pasaporte</option>
              </select>
            </label>
            <label style={{ flex: 1 }}>
              Numero documento
              <input type="text" value={formPagadorDoc} onChange={(e) => setFormPagadorDoc(e.target.value)} placeholder="1234567" />
            </label>
          </div>
          <label>
            Concepto *
            <input type="text" value={formConcepto} onChange={(e) => setFormConcepto(e.target.value)} placeholder="Pago de servicio mensual" />
          </label>
          <label>
            Importe (Gs.) *
            <input type="number" min="1" value={formImporte} onChange={(e) => setFormImporte(e.target.value)} placeholder="0" />
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
              Referencia bancaria / numero de cheque
              <input type="text" value={formRefBancaria} onChange={(e) => setFormRefBancaria(e.target.value)} placeholder="Nro. transferencia, cheque, etc." />
            </label>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
          <button type="button" className="secondary-action" disabled={saving} onClick={() => void saveRecibo(false)}>
            {saving ? "Guardando…" : "Guardar borrador"}
          </button>
          <button type="button" className="primary-action" disabled={saving} onClick={() => void saveRecibo(true)}>
            {saving ? "Emitiendo…" : "Guardar y emitir"}
          </button>
        </div>
      </div>
    );
  }

  if (subView === "detail" && selectedRecibo) {
    const r = selectedRecibo;
    return (
      <div className="module-view">
        <div className="view-header">
          <button type="button" className="ghost-action" onClick={() => setSubView("list")}>← Volver</button>
          <h2>Recibo {r.numero != null ? `N° ${String(r.numero).padStart(7, "0")}` : "(borrador)"}</h2>
          <span className={r.estado === "EMITIDO" ? "status-pill ready" : "status-pill blocked"}>{r.estado}</span>
        </div>
        {error ? <p className="error-banner">{error}</p> : null}
        <dl className="receipt-summary">
          <div><dt>Pagador</dt><dd>{r.pagador_nombre}</dd></div>
          {r.pagador_documento ? <div><dt>{r.pagador_documento_tipo ?? "Doc."}</dt><dd>{r.pagador_documento}</dd></div> : null}
          <div><dt>Concepto</dt><dd>{r.concepto}</dd></div>
          <div><dt>Importe</dt><dd>{formatGuaranies(r.importe)}</dd></div>
          <div><dt>Forma de pago</dt><dd>{FORMAS_PAGO_LABELS[r.forma_pago]}</dd></div>
          <div><dt>Fecha cobro</dt><dd>{r.fecha_cobro}</dd></div>
          {r.referencia_bancaria ? <div><dt>Referencia</dt><dd>{r.referencia_bancaria}</dd></div> : null}
          {r.factura_numero_display ? <div><dt>Factura ref.</dt><dd>{r.factura_numero_display}</dd></div> : null}
        </dl>
        <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
          {r.estado === "BORRADOR" ? (
            <>
              <button type="button" className="secondary-action" onClick={() => openEdit(r)}>Editar</button>
              <button type="button" className="primary-action" disabled={saving} onClick={() => void emitirRecibo(r)}>
                {saving ? "Emitiendo…" : "Emitir"}
              </button>
              <button type="button" className="danger-action" onClick={() => setDeleteTarget(r)}>Eliminar</button>
            </>
          ) : (
            <button type="button" className="secondary-action" onClick={() => openPdf(r)}>Descargar PDF</button>
          )}
        </div>
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
        <p className="muted empty-state">No hay recibos aun. Crea el primero con el boton de arriba.</p>
      ) : (
        <div className="notas-list">
          {recibos.map((r) => (
            <div key={r.id} className="nota-card">
              <div className="nota-card-main">
                <strong>{r.pagador_nombre}</strong>
                <span className={r.estado === "EMITIDO" ? "status-pill ready" : "status-pill blocked"}>{r.estado}</span>
              </div>
              <div className="nota-card-meta">
                <span>{r.concepto}</span>
                <span>{formatGuaranies(r.importe)}</span>
                <span>{FORMAS_PAGO_LABELS[r.forma_pago]}</span>
                {r.numero != null ? <span>N° {String(r.numero).padStart(7, "0")}</span> : null}
              </div>
              <div className="nota-card-actions">
                <button type="button" className="ghost-action compact" onClick={() => { setSelectedRecibo(r); setSubView("detail"); }}>Ver</button>
                {r.estado === "EMITIDO" ? (
                  <button type="button" className="ghost-action compact" onClick={() => openPdf(r)}>PDF</button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="muted" style={{ marginTop: "8px", fontSize: "11px" }}>{total} recibo(s) en total</p>

      {deleteTarget ? (
        <div className="modal-scrim" role="dialog" aria-modal="true">
          <div className="modal-card">
            <h2>Eliminar recibo</h2>
            <p>¿Eliminar el borrador de recibo para <strong>{deleteTarget.pagador_nombre}</strong>? Esta accion no se puede deshacer.</p>
            {error ? <p className="error-banner">{error}</p> : null}
            <div className="modal-actions">
              <button type="button" className="ghost-action" onClick={() => setDeleteTarget(null)}>Cancelar</button>
              <button type="button" className="danger-action" onClick={() => void deleteRecibo()} disabled={saving}>{saving ? "Eliminando…" : "Eliminar"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/app/sw.js", { scope: "/app/" });
  });
}
