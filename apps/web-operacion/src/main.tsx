import React, { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";
const ACCESS_TOKEN_STORAGE_KEY = "ventax_factura_access_token";

type ViewState = "checking-session" | "login" | "loading-context" | "operacion";
type OperationView = "status" | "invoice" | "credit-note" | "documents" | "catalog" | "clients";
type CondicionVenta = "CONTADO" | "CREDITO";
type TipoTransaccionServicio = 1 | 2 | 3;
type DocumentoIdentidadTipo = "RUC" | "CI" | "PASAPORTE" | "CEDULA_EXTRANJERA" | "NO_ESPECIFICADO";
type TipoIva = "IVA_10" | "IVA_5" | "EXENTA";
type DocumentoEstado = "EMITIENDO" | "EMITIDA" | "PENDIENTE_SIFEN" | "RECHAZADA" | "ERROR_OPERATIVO" | "ERROR_TEMPORAL" | "ANULADA";

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

function App() {
  const [view, setView] = useState<ViewState>("checking-session");
  const [accessToken, setAccessToken] = useState<string | null>(() => localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY));
  const [user, setUser] = useState<UserSummary | null>(null);
  const [context, setContext] = useState<OperationalContextResponse | null>(null);
  const [readiness, setReadiness] = useState<ReadinessResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const api = useMemo(() => createApiClient(accessToken, setAccessToken), [accessToken]);

  useEffect(() => {
    if (accessToken) {
      localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, accessToken);
    } else {
      localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    }
  }, [accessToken]);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      if (accessToken && view === "operacion") {
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
    setAccessToken(response.access_token);
    setUser(response.user);
  }

  async function handleLogout() {
    try {
      await api.post<void>("/auth/logout", {});
    } finally {
      clearSession(setAccessToken);
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

  useEffect(() => {
    if (!canEmit) {
      setOperationView("status");
    }
  }, [canEmit]);

  function goTo(view: OperationView) {
    setOperationView(view);
    setMenuOpen(false);
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

      {operationView === "invoice" ? (
        <InvoiceEditor
          accessToken={accessToken}
          canEmit={canEmit}
          context={context}
          readiness={readiness}
          setAccessToken={setAccessToken}
          onBack={() => goTo("status")}
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
          role={user?.role ?? "OPERADOR_FACTURACION"}
        />
      ) : operationView === "clients" ? (
        <ClientesAgendaView accessToken={accessToken} setAccessToken={setAccessToken} onBack={() => goTo("invoice")} />
      ) : operationView === "catalog" ? (
        <CatalogView accessToken={accessToken} setAccessToken={setAccessToken} onBack={() => goTo("invoice")} />
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
  role
}: {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  onBack: () => void;
  role: UserSummary["role"];
}) {
  const api = useMemo(() => createApiClient(accessToken, setAccessToken), [accessToken, setAccessToken]);
  const [documents, setDocuments] = useState<DocumentoResponse[]>([]);
  const [selected, setSelected] = useState<DocumentoResponse | null>(null);
  const [estadoFilter, setEstadoFilter] = useState<DocumentoEstado | "">("");
  const [tipoOperativoFilter, setTipoOperativoFilter] = useState<"TODOS" | "CONTADO" | "CREDITO" | "NOTA_CREDITO">("TODOS");
  const [query, setQuery] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
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

  useEffect(() => {
    void loadDocuments();
  }, [estadoFilter, tipoOperativoFilter, desde, hasta]);

  async function loadDocuments(nextQuery = query) {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ limit: "30", offset: "0" });
    if (estadoFilter) {
      params.set("estado", estadoFilter);
    }
    if (tipoOperativoFilter !== "TODOS") {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir el detalle.");
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

    const motivo = window.prompt("Motivo de anulacion", "");
    if (!motivo?.trim()) {
      return;
    }

    setActionLoading(true);
    setMessage(null);

    try {
      const updated = await api.post<DocumentoResponse>(`/facturas/${selected.id}/cancelar`, { motivo: motivo.trim() });
      setSelected(updated);
      setDocuments((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMessage("Documento anulado.");
      await loadDeliveryFor(updated);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo anular el documento.");
    } finally {
      setActionLoading(false);
    }
  }

  async function emitSelectedNotaCredito() {
    if (!selected) {
      return;
    }

    const motivo = window.prompt("Motivo de nota de credito", "");
    if (!motivo?.trim()) {
      return;
    }

    setActionLoading(true);
    setMessage(null);

    try {
      const notaCredito = await api.request<DocumentoResponse>(`/facturas/${selected.id}/nota-credito`, {
        method: "POST",
        headers: {
          "Idempotency-Key": createIdempotencyKey()
        },
        body: JSON.stringify({ motivo: motivo.trim() })
      });
      setSelected(notaCredito);
      setDocuments((current) => [notaCredito, ...current.filter((item) => item.id !== notaCredito.id)]);
      setDeliveryLink(null);
      setEmailStatus(null);
      setMessage("Nota de credito emitida.");
      await loadDeliveryFor(notaCredito);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "No se pudo emitir la nota de credito.");
    } finally {
      setActionLoading(false);
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
          {(["TODOS", "CONTADO", "CREDITO", "NOTA_CREDITO"] as const).map((value) => (
            <button
              className={tipoOperativoFilter === value ? "active" : ""}
              key={value}
              onClick={() => setTipoOperativoFilter(value)}
              type="button"
            >
              {value === "TODOS" ? "Todos" : value === "NOTA_CREDITO" ? "Nota credito" : value === "CONTADO" ? "Contado" : "Credito"}
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
            placeholder="Cliente, RUC, CDC o numero"
            value={query}
          />
        </label>
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
        <label>
          Desde
          <input onChange={(event) => setDesde(event.target.value)} type="date" value={desde} />
        </label>
        <label>
          Hasta
          <input onChange={(event) => setHasta(event.target.value)} type="date" value={hasta} />
        </label>
        <button className="secondary-action" disabled={loading} onClick={() => void loadDocuments()} type="button">
          {loading ? "Cargando..." : "Aplicar"}
        </button>
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
          {documents.map((documento) => (
            <button
              className="document-row"
              key={documento.id}
              onClick={() => void openDetail(documento.id)}
              type="button"
            >
              <span>
                <strong>{documento.numero_fiscal ?? "Numero pendiente"}</strong>
                <small>{formatDocumentoTipo(documento.tipo)} · {documento.cliente.razon_social}</small>
              </span>
              <span>
                <strong>{formatGuaranies(documento.totals.total)}</strong>
                <small>{formatDocumentoEstado(documento.estado)}</small>
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
                  <h3>{formatDocumentoEstado(selected.estado)}</h3>
                  <p className="muted">{formatDocumentoTipo(selected.tipo)} · Numero {selected.numero_fiscal ?? "pendiente"}</p>
                </div>
                <span className={selected.estado === "EMITIDA" ? "status-pill ready" : "status-pill blocked"}>
                  {formatDocumentoEstado(selected.estado)}
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
                <a className={selectedKudeUrl ? "secondary-link" : "secondary-link disabled"} href={selectedKudeUrl ?? "#"} rel="noreferrer" target="_blank">
                  Ver factura PDF
                </a>
                <details className="share-block">
                  <summary>Compartir factura</summary>
                  <div className="result-actions">
                    <a className={deliveryLink ? "secondary-link" : "secondary-link disabled"} href={deliveryLink?.whatsapp_url ?? "#"} rel="noreferrer" target="_blank">
                      Enviar por WhatsApp
                    </a>
                    <button className="secondary-action" disabled={!deliveryLink} onClick={() => void copyDetailLink()} type="button">
                      Copiar enlace
                    </button>
                    <a className={selectedXmlUrl ? "secondary-link" : "secondary-link disabled"} href={selectedXmlUrl ?? "#"} rel="noreferrer" target="_blank">
                      Documento electronico (XML firmado)
                    </a>
                  </div>
                </details>
              </div>

              <div className="result-actions">
                <button className="secondary-action" disabled={actionLoading || !canCancelDocumento(selected)} onClick={() => void cancelSelectedDocumento()} type="button">
                  Anular factura
                </button>
                <button className="secondary-action" disabled={actionLoading || !canEmitNotaCredito(selected, documents)} onClick={() => void emitSelectedNotaCredito()} type="button">
                  Crear nota de credito
                </button>
              </div>
              <details className="tech-block">
                <summary>Informacion fiscal</summary>
                <dl className="receipt-summary">
                  <div>
                    <dt>CDC</dt>
                    <dd>{selected.cdc ?? "Pendiente"}</dd>
                  </div>
                  <div>
                    <dt>SIFEN</dt>
                    <dd>{formatSifenSummary(selectedSifenSummary)}</dd>
                  </div>
                  <div>
                    <dt>Estado email</dt>
                    <dd>{formatEmailStatus(emailStatus?.status ?? selected.delivery.email_status)}</dd>
                  </div>
                </dl>
              </details>
              {(role === "SOPORTE_INTERNO" || role === "ADMIN_INTERNO") ? (
                <details className="tech-block">
                  <summary>Opciones tecnicas</summary>
                  <div className="result-actions">
                    <button className="secondary-action" disabled={actionLoading || !selected.cdc} onClick={() => void refreshSelectedStatus()} type="button">
                      Consultar estado fiscal
                    </button>
                    <button className="secondary-action" disabled={actionLoading || !["PENDIENTE_SIFEN", "ERROR_TEMPORAL"].includes(selected.estado)} onClick={() => void retrySelectedEmission()} type="button">
                      Reintentar envio
                    </button>
                    <button className="secondary-action" disabled={actionLoading} onClick={() => void loadDeliveryFor(selected, true)} type="button">
                      Crear nuevo enlace
                    </button>
                  </div>
                </details>
              ) : null}
              {message ? <p className="inline-message">{message}</p> : null}
            </>
          ) : (
            <p className="muted empty-state">Seleccione un documento para ver detalle y acciones.</p>
          )}
        </aside>
        ) : null}
    </section>
  );
}

function ClientesAgendaView({
  accessToken,
  setAccessToken,
  onBack
}: {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  onBack: () => void;
}) {
  const api = useMemo(() => createApiClient(accessToken, setAccessToken), [accessToken, setAccessToken]);
  const [items, setItems] = useState<ClienteResponse[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ClienteResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
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

  function useCliente(cliente: ClienteResponse) {
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
      setDraft({
        cliente_id: result.cliente_id,
        documento_tipo: result.documento_tipo,
        documento: result.documento,
        razon_social: result.razon_social,
        direccion: result.direccion,
        telefono: result.telefono,
        email: result.email
      });
      await loadClientes();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo guardar el cliente.");
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
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void loadClientes();
              }
            }}
            placeholder="RUC, CI o nombre"
            value={query}
          />
        </label>
        <button className="secondary-action" disabled={loading} onClick={() => void loadClientes()} type="button">
          {loading ? "Buscando..." : "Buscar"}
        </button>
      </section>
      <section className="documents-layout">
        <div className="documents-list">
          {items.map((cliente) => (
            <button
              className={selected?.cliente_id === cliente.cliente_id ? "document-row active" : "document-row"}
              key={cliente.cliente_id}
              onClick={() => useCliente(cliente)}
              type="button"
            >
              <span>
                <strong>👤 {cliente.razon_social}</strong>
                <small>{cliente.documento_tipo} · {cliente.documento}</small>
              </span>
            </button>
          ))}
        </div>
        <aside className="document-detail">
          <div className="receipt-heading">
            <div>
              <p className="eyebrow">Cliente</p>
              <h3>{selected ? "Editar cliente" : "Nuevo cliente"}</h3>
            </div>
          </div>
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
              <input value={draft.documento} onChange={(event) => setDraft((current) => ({ ...current, documento: event.target.value }))} />
            </label>
            <label>
              Nombre o razon social
              <input value={draft.razon_social} onChange={(event) => setDraft((current) => ({ ...current, razon_social: event.target.value }))} />
            </label>
            <label>
              Telefono
              <input value={draft.telefono ?? ""} onChange={(event) => setDraft((current) => ({ ...current, telefono: event.target.value }))} />
            </label>
          </div>
          <div className="result-actions">
            <button className="primary-action" disabled={saving} onClick={() => void saveCliente()} type="button">
              {saving ? "Guardando..." : selected ? "Actualizar cliente" : "Agregar cliente"}
            </button>
            {selected ? (
              <button
                className="secondary-action"
                onClick={() => {
                  setSelected(null);
                  setDraft({
                    documento_tipo: "CI",
                    documento: "",
                    razon_social: "",
                    direccion: "",
                    telefono: "",
                    email: ""
                  });
                }}
                type="button"
              >
                Nuevo cliente
              </button>
            ) : null}
          </div>
          {message ? <p className="inline-message">{message}</p> : null}
        </aside>
      </section>
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
  const [selected, setSelected] = useState<CatalogoItem | null>(null);
  const [query, setQuery] = useState("");
  const [activoFilter, setActivoFilter] = useState<"true" | "false" | "">("true");
  const [draft, setDraft] = useState<CatalogoDraft>(() => createCatalogoDraft());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadItems();
  }, [activoFilter]);

  async function loadItems(nextQuery = query) {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ limit: "50", offset: "0" });
    if (nextQuery.trim()) {
      params.set("q", nextQuery.trim());
    }
    if (activoFilter) {
      params.set("activo", activoFilter);
    }

    try {
      const result = await api.get<CatalogoItemListResponse>(`/catalogo/items?${params.toString()}`);
      setItems(result.items);
      setSelected((current) => (current ? result.items.find((item) => item.id === current.id) ?? current : current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el catalogo.");
    } finally {
      setLoading(false);
    }
  }

  function startCreate() {
    setSelected(null);
    setDraft(createCatalogoDraft());
    setMessage(null);
    setError(null);
  }

  function startEdit(item: CatalogoItem) {
    setSelected(item);
    setDraft({
      codigo: item.codigo,
      descripcion: item.descripcion,
      precio_unitario: String(item.precio_unitario),
      iva_tipo: item.iva_tipo,
      activo: item.activo
    });
    setMessage(null);
    setError(null);
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

    if (!payload.descripcion || !Number.isInteger(payload.precio_unitario) || payload.precio_unitario < 0) {
      setSaving(false);
      setError("Complete descripcion y precio entero valido.");
      return;
    }

    try {
      const saved = selected
        ? await api.request<CatalogoItem>(`/catalogo/items/${selected.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
          })
        : await api.post<CatalogoItem>("/catalogo/items", payload);

      setSelected(saved);
      setDraft({
        codigo: saved.codigo,
        descripcion: saved.descripcion,
        precio_unitario: String(saved.precio_unitario),
        iva_tipo: saved.iva_tipo,
        activo: saved.activo
      });
      setMessage(selected ? "Item actualizado." : "Item creado.");
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
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void loadItems();
              }
            }}
            placeholder="Codigo o descripcion"
            value={query}
          />
        </label>
        <label>
          Estado
          <select onChange={(event) => setActivoFilter(event.target.value as "true" | "false" | "")} value={activoFilter}>
            <option value="true">Activos</option>
            <option value="">Todos</option>
            <option value="false">Inactivos</option>
          </select>
        </label>
        <button className="secondary-action" disabled={loading} onClick={() => void loadItems()} type="button">
          {loading ? "Cargando..." : "Aplicar"}
        </button>
      </section>

      {error ? <p className="form-error">{error}</p> : null}
      {message ? <p className="editor-alert ready">{message}</p> : null}

      <section className="documents-layout catalog-layout">
        <div className="documents-list">
          <button className={!selected ? "document-row active" : "document-row"} onClick={startCreate} type="button">
            <span>
              <strong>Nuevo item</strong>
              <small>Crear producto o servicio</small>
            </span>
            <span>
              <strong>+</strong>
              <small>Alta</small>
            </span>
          </button>

          {items.length === 0 && !loading ? <p className="muted empty-state">Sin items para los filtros actuales.</p> : null}
          {items.map((item) => (
            <button
              className={selected?.id === item.id ? "document-row active" : "document-row"}
              key={item.id}
              onClick={() => startEdit(item)}
              type="button"
            >
              <span>
                <strong>{item.codigo || "Sin codigo"}</strong>
                <small>{item.descripcion}</small>
              </span>
              <span>
                <strong>{formatGuaranies(item.precio_unitario)}</strong>
                <small>{item.activo ? "Activo" : "Inactivo"} · {formatIva(item.iva_tipo)}</small>
              </span>
            </button>
          ))}
        </div>

        <form className="document-detail catalog-form" onSubmit={(event) => void saveItem(event)}>
          <div className="receipt-heading">
            <div>
              <p className="eyebrow">{selected ? "Edicion" : "Alta"}</p>
              <h3>{selected ? selected.descripcion : "Nuevo item"}</h3>
              <p className="muted">Se usa en la busqueda del editor de factura.</p>
            </div>
            <span className={draft.activo ? "status-pill ready" : "status-pill blocked"}>
              {draft.activo ? "Activo" : "Inactivo"}
            </span>
          </div>

          <div className="field-grid">
            <label>
              Codigo
              <input
                onChange={(event) => setDraft((current) => ({ ...current, codigo: event.target.value }))}
                placeholder="SERV-001"
                value={draft.codigo}
              />
            </label>
            <label>
              Precio unitario
              <input
                inputMode="numeric"
                min="0"
                onChange={(event) => setDraft((current) => ({ ...current, precio_unitario: event.target.value }))}
                required
                value={draft.precio_unitario}
              />
            </label>
            <label className="span-2">
              Descripcion
              <input
                onChange={(event) => setDraft((current) => ({ ...current, descripcion: event.target.value }))}
                required
                value={draft.descripcion}
              />
            </label>
            <label>
              IVA
              <select onChange={(event) => setDraft((current) => ({ ...current, iva_tipo: event.target.value as TipoIva }))} value={draft.iva_tipo}>
                <option value="IVA_10">10%</option>
                <option value="IVA_5">5%</option>
                <option value="EXENTA">Exenta</option>
              </select>
            </label>
            <label>
              Estado
              <select
                onChange={(event) => setDraft((current) => ({ ...current, activo: event.target.value === "true" }))}
                value={draft.activo ? "true" : "false"}
              >
                <option value="true">Activo</option>
                <option value="false">Inactivo</option>
              </select>
            </label>
          </div>

          <div className="result-actions">
            <button className="primary-action" disabled={saving} type="submit">
              {saving ? "Guardando..." : selected ? "Guardar cambios" : "Crear item"}
            </button>
            <button className="secondary-action" onClick={startCreate} type="button">
              Limpiar
            </button>
          </div>
        </form>
      </section>
    </section>
  );
}

function InvoiceEditor({
  accessToken,
  canEmit,
  context,
  readiness,
  setAccessToken,
  onBack
}: {
  accessToken: string | null;
  canEmit: boolean;
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
      .filter((line) => line.descripcion && Number.isInteger(line.cantidad) && line.cantidad > 0 && Number.isInteger(line.precio_unitario));

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
    if (!activeLineId && lines[0]) {
      setActiveLineId(lines[0].id);
    }
  }, [activeLineId, lines]);

  useEffect(() => {
    if (!lineSheetOpen) {
      return;
    }

    const timeout = window.setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
      lineSheetRef.current?.scrollTo({ top: 0, behavior: "auto" });
      descriptionInputRef.current?.focus();
    }, 80);

    return () => window.clearTimeout(timeout);
  }, [lineSheetOpen, activeLineId]);

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

  function resetInvoice() {
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
    setPreview(null);
    setPreviewError(null);
    setEmissionError(null);
    setEmittedDocumento(null);
    setDeliveryLink(null);
    setEmailStatus(null);
    setDeliveryMessage(null);
    setIdempotencyKey(createIdempotencyKey());
    setLastEmittedRequestFingerprint(null);
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
    if (activeLine) {
      const emptyDraft = !activeLine.codigo.trim() && !activeLine.descripcion.trim() && !activeLine.precio_unitario.trim();
      if (emptyDraft) {
        setLines((current) => current.filter((line) => line.id !== activeLine.id));
        setActiveLineId(null);
      }
    }
    setLineSheetOpen(false);
    setLineCodeOpen(false);
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

  const emittedSifenSummary = emittedDocumento ? getSifenSummary(emittedDocumento) : null;
  const emittedKudeUrl =
    emittedDocumento && deliveryLink && emittedDocumento.delivery.artifacts.kude_pdf.available ? `${deliveryLink.public_url}/kude.pdf` : null;
  const emittedXmlUrl = emittedDocumento && deliveryLink && emittedDocumento.delivery.artifacts.xml.available ? `${deliveryLink.public_url}/xml` : null;
  const activeLine = lines.find((line) => line.id === activeLineId) ?? lines[0] ?? null;
  const activeLineIndex = activeLine ? lines.findIndex((line) => line.id === activeLine.id) : -1;
  const visibleLines = lines.filter((line) => line.descripcion.trim() || line.codigo.trim() || line.precio_unitario.trim());
  const previewSubtotalsByLineId = new Map<string, number>();
  lines
    .filter((line) => line.descripcion.trim() && Number.isInteger(Number(line.cantidad)) && Number(line.cantidad) > 0 && Number.isInteger(Number(line.precio_unitario)))
    .forEach((line, index) => {
      previewSubtotalsByLineId.set(line.id, preview?.items[index]?.subtotal ?? 0);
    });

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
            {headerDetailsOpen ? "🙈 Ocultar datos del facturador" : "👁 Mostrar datos del facturador"}
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
          <h3>{cliente.razon_social.trim() ? cliente.razon_social.trim() : "Cliente no seleccionado"}</h3>
          <p className="muted">Fecha {today} · Timbrado {context?.fiscal_context.timbrado ?? "-"}</p>
        </div>
        <details className="invoice-options">
          <summary>Opciones de factura</summary>
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
        </details>
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
                onChange={(event) => setCliente((current) => ({ ...current, documento: event.target.value }))}
                placeholder="Ingrese numero de documento"
                value={cliente.documento}
              />
            </div>
            {clienteSearching ? <span className="field-hint">Buscando cliente...</span> : null}
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
                    inputMode="numeric"
                    min="0"
                    onChange={(event) =>
                      updateLine(activeLine.id, { catalogo_item_id: null, precio_unitario: event.target.value, lockedFromCatalog: false })
                    }
                    placeholder="0"
                    value={activeLine.precio_unitario}
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
                    !Number.isInteger(Number(activeLine.precio_unitario))
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
                    !Number.isInteger(Number(activeLine.precio_unitario))
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
          <button className="primary-action wide" disabled={!canEmit || !preview || emitting} onClick={() => void emitFactura()} type="button">
            {emitting ? "Procesando..." : "Crear factura"}
          </button>
        </div>
        {emissionError ? <p className="form-error">{emissionError}</p> : null}
      </section>

      {emittedDocumento ? (
        <section className="emission-result" aria-live="polite" ref={emissionResultRef}>
          <div className="receipt-heading">
            <div>
              <p className="eyebrow">Factura</p>
              <h3>{formatDocumentoEstado(emittedDocumento.estado)}</h3>
              <p className="muted">
                Numero {emittedDocumento.numero_fiscal ?? "pendiente"} · CDC {emittedDocumento.cdc ?? "pendiente"}
              </p>
            </div>
            <span className={emittedDocumento.estado === "EMITIDA" ? "status-pill ready" : "status-pill blocked"}>
              {formatDocumentoEstado(emittedDocumento.estado)}
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
            <div>
              <dt>SIFEN</dt>
              <dd>{formatSifenSummary(emittedSifenSummary)}</dd>
            </div>
          </div>

          {getRecoverableMessage(emittedDocumento) ? <p className="editor-alert blocked">{getRecoverableMessage(emittedDocumento)}</p> : null}
          {emittedDocumento.estado === "RECHAZADA" ? (
            <p className="editor-alert blocked">{getRejectedSifenMessage(emittedSifenSummary)}</p>
          ) : null}
          {emailStatus?.message ? <p className="editor-alert ready">{emailStatus.message}</p> : null}

          <div className="delivery-actions">
            <a
              className={emittedKudeUrl ? "secondary-link" : "secondary-link disabled"}
              href={emittedKudeUrl ?? "#"}
              rel="noreferrer"
              target="_blank"
            >
              KUDE/PDF
            </a>
            <a
              className={emittedXmlUrl ? "secondary-link" : "secondary-link disabled"}
              href={emittedXmlUrl ?? "#"}
              rel="noreferrer"
              target="_blank"
            >
              XML
            </a>
            <button className="secondary-action" disabled={!deliveryLink} onClick={() => void copyPublicLink()} type="button">
              Copiar link
            </button>
            <a
              className={deliveryLink ? "secondary-link" : "secondary-link disabled"}
              href={deliveryLink ? buildWhatsAppShareUrl(deliveryLink.public_url, whatsappPhone) : "#"}
              rel="noreferrer"
              target="_blank"
            >
              WhatsApp
            </a>
          </div>

          <div className="delivery-inline-form">
            <label>
              Numero WhatsApp
              <input inputMode="tel" onChange={(event) => setWhatsappPhone(event.target.value)} value={whatsappPhone} />
            </label>
            <div className="public-link-box">
              <dt>Link publico</dt>
              <dd>{deliveryLink?.public_url ?? (deliveryLoading ? "Generando link..." : "No disponible")}</dd>
            </div>
          </div>
          {deliveryMessage ? <p className="inline-message">{deliveryMessage}</p> : null}

          <div className="result-actions">
            <button
              className="secondary-action"
              disabled={emitting || !emittedDocumento.cdc}
              onClick={() => void refreshEmittedDocumento()}
              type="button"
            >
              Consultar SIFEN
            </button>
            <button
              className="secondary-action"
              disabled={emitting || !["PENDIENTE_SIFEN", "ERROR_TEMPORAL"].includes(emittedDocumento.estado)}
              onClick={() => void retryEmittedDocumento()}
              type="button"
            >
              Reintentar emision
            </button>
            <button
              className="secondary-action"
              disabled={deliveryLoading}
              onClick={() => void loadDeliveryData(emittedDocumento.id, true)}
              type="button"
            >
              Regenerar link
            </button>
            <button className="primary-action" onClick={resetInvoice} type="button">
              Nueva factura
            </button>
          </div>
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

function formatIva(value: TipoIva): string {
  if (value === "IVA_10") {
    return "IVA 10%";
  }
  if (value === "IVA_5") {
    return "IVA 5%";
  }
  return "Exenta";
}

function formatDocumentoEstado(value: DocumentoEstado): string {
  const labels: Record<DocumentoEstado, string> = {
    EMITIENDO: "Emision en proceso",
    EMITIDA: "Factura emitida",
    PENDIENTE_SIFEN: "Pendiente SIFEN",
    RECHAZADA: "Rechazada",
    ERROR_OPERATIVO: "Error operativo",
    ERROR_TEMPORAL: "Error temporal",
    ANULADA: "Anulada"
  };
  return labels[value];
}

function formatDocumentoTipo(value: DocumentoResponse["tipo"]): string {
  return value === "NOTA_CREDITO" ? "Nota credito" : "Factura";
}

function formatOperationViewTitle(value: OperationView): string {
  const labels: Record<OperationView, string> = {
    status: "Informacion",
    invoice: "Nueva factura",
    clients: "Agenda clientes",
    "credit-note": "Devolver factura",
    catalog: "Catalogo",
    documents: "Documentos"
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
    documents: "Facturas y notas emitidas"
  };
  return hints[value];
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

function clearSession(setAccessToken: (token: string | null) => void) {
  localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  setAccessToken(null);
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
