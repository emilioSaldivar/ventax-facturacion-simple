import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";
const ACCESS_TOKEN_STORAGE_KEY = "ventax_factura_access_token";

type ViewState = "checking-session" | "login" | "loading-context" | "operacion";
type OperationView = "home" | "invoice" | "documents";
type CondicionVenta = "CONTADO" | "CREDITO";
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
  };
  fiscal_context: {
    establecimiento: string;
    punto_expedicion: string;
    perfil_emision_codigo: string;
    actividad_economica_codigo: string;
    actividad_economica_descripcion: string | null;
    timbrado: string;
    timbrado_inicio: string;
    documento_nro: string;
    credito_plazo_dias: number;
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
  cliente: FacturaClienteInput;
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

interface DeliveryLinkResponse {
  public_url: string;
  whatsapp_url: string;
  token_status: "ACTIVE" | "REVOKED";
}

interface EmailStatusResponse {
  status: DocumentoResponse["delivery"]["email_status"];
  message: string | null;
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

interface CatalogoItem {
  id: string;
  codigo: string;
  descripcion: string;
  precio_unitario: number;
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
  const [operationView, setOperationView] = useState<OperationView>("home");

  return (
    <main className="operation-shell">
      <header className="topbar">
        <BrandMark compact />
        <button className="ghost-action" onClick={() => void onLogout()} type="button">
          Salir
        </button>
      </header>

      <section className="facturador-band" aria-label="Contexto operativo">
        <div>
          <p className="eyebrow">Facturador</p>
          <h1>{context?.facturador.razon_social ?? "Sin facturador asignado"}</h1>
          <p className="muted">{context ? `RUC ${context.facturador.ruc}` : "Configuracion operativa incompleta"}</p>
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
              <dd>{context?.fiscal_context.perfil_emision_codigo ?? "-"}</dd>
            </div>
            <div>
              <dt>Actividad</dt>
              <dd>{context?.fiscal_context.actividad_economica_codigo ?? "-"}</dd>
            </div>
          </dl>
        </article>

        <article className="context-card">
          <p className="eyebrow">Readiness</p>
          <h2>{canEmit ? "Puede emitir" : "No puede emitir todavia"}</h2>
          <ul className="check-list">
            {(readiness?.checks ?? []).map((check) => (
              <li key={check.code} className={check.ok ? "check-ok" : "check-fail"}>
                <span aria-hidden="true">{check.ok ? "✓" : "!"}</span>
                {check.message}
              </li>
            ))}
          </ul>
        </article>
      </section>

      {operationView === "invoice" ? (
        <InvoiceEditor
          accessToken={accessToken}
          canEmit={canEmit}
          context={context}
          readiness={readiness}
          setAccessToken={setAccessToken}
          onBack={() => setOperationView("home")}
        />
      ) : operationView === "documents" ? (
        <DocumentsView accessToken={accessToken} setAccessToken={setAccessToken} onBack={() => setOperationView("home")} />
      ) : (
        <section className="next-panel">
          <button className="primary-action wide" disabled={!canEmit} onClick={() => setOperationView("invoice")} type="button">
            Nueva factura
          </button>
          <button className="secondary-action wide" onClick={() => setOperationView("documents")} type="button">
            Ver documentos
          </button>
        </section>
      )}
    </main>
  );
}

function DocumentsView({
  accessToken,
  setAccessToken,
  onBack
}: {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
  onBack: () => void;
}) {
  const api = useMemo(() => createApiClient(accessToken, setAccessToken), [accessToken, setAccessToken]);
  const [documents, setDocuments] = useState<DocumentoResponse[]>([]);
  const [selected, setSelected] = useState<DocumentoResponse | null>(null);
  const [estadoFilter, setEstadoFilter] = useState<DocumentoEstado | "">("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveryLink, setDeliveryLink] = useState<DeliveryLinkResponse | null>(null);
  const [emailStatus, setEmailStatus] = useState<EmailStatusResponse | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadDocuments();
  }, [estadoFilter]);

  async function loadDocuments(nextQuery = query) {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ limit: "30", offset: "0" });
    if (estadoFilter) {
      params.set("estado", estadoFilter);
    }
    if (nextQuery.trim()) {
      params.set("q", nextQuery.trim());
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

      <section className="documents-filters">
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
        <button className="secondary-action" disabled={loading} onClick={() => void loadDocuments()} type="button">
          {loading ? "Cargando..." : "Aplicar"}
        </button>
      </section>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="documents-layout">
        <div className="documents-list">
          {documents.length === 0 && !loading ? <p className="muted empty-state">Sin documentos para los filtros actuales.</p> : null}
          {documents.map((documento) => (
            <button
              className={selected?.id === documento.id ? "document-row active" : "document-row"}
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

        <aside className="document-detail" aria-live="polite">
          {selected ? (
            <>
              <div className="receipt-heading">
                <div>
                  <p className="eyebrow">Detalle</p>
                  <h3>{formatDocumentoEstado(selected.estado)}</h3>
                  <p className="muted">
                    {formatDocumentoTipo(selected.tipo)} · Numero {selected.numero_fiscal ?? "pendiente"} · CDC {selected.cdc ?? "pendiente"}
                  </p>
                </div>
                <span className={selected.estado === "EMITIDA" ? "status-pill ready" : "status-pill blocked"}>
                  {formatDocumentoEstado(selected.estado)}
                </span>
              </div>

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

              {getRecoverableMessage(selected) ? <p className="editor-alert blocked">{getRecoverableMessage(selected)}</p> : null}
              {selected.estado === "RECHAZADA" ? <p className="editor-alert blocked">Documento rechazado por SIFEN. Revise la causa resumida y contacte soporte si no es gestionable.</p> : null}
              {emailStatus?.message ? <p className="editor-alert ready">{emailStatus.message}</p> : null}

              <div className="delivery-actions">
                <a className={selected.cdc && deliveryLink ? "secondary-link" : "secondary-link disabled"} href={deliveryLink ? `${deliveryLink.public_url}/kude.pdf` : "#"} rel="noreferrer" target="_blank">
                  KUDE/PDF
                </a>
                <a className={selected.cdc && deliveryLink ? "secondary-link" : "secondary-link disabled"} href={deliveryLink ? `${deliveryLink.public_url}/xml` : "#"} rel="noreferrer" target="_blank">
                  XML
                </a>
                <button className="secondary-action" disabled={!deliveryLink} onClick={() => void copyDetailLink()} type="button">
                  Copiar link
                </button>
                <a className={deliveryLink ? "secondary-link" : "secondary-link disabled"} href={deliveryLink?.whatsapp_url ?? "#"} rel="noreferrer" target="_blank">
                  WhatsApp
                </a>
              </div>

              <div className="result-actions">
                <button className="secondary-action" disabled={actionLoading || !selected.cdc} onClick={() => void refreshSelectedStatus()} type="button">
                  Refrescar estado
                </button>
                <button className="secondary-action" disabled={actionLoading || !["PENDIENTE_SIFEN", "ERROR_TEMPORAL"].includes(selected.estado)} onClick={() => void retrySelectedEmission()} type="button">
                  Reintentar
                </button>
                <button className="secondary-action" disabled={actionLoading || !canCancelDocumento(selected)} onClick={() => void cancelSelectedDocumento()} type="button">
                  Anular
                </button>
                <button className="secondary-action" disabled={actionLoading || !canEmitNotaCredito(selected, documents)} onClick={() => void emitSelectedNotaCredito()} type="button">
                  Nota credito
                </button>
                <button className="secondary-action" disabled={actionLoading} onClick={() => void loadDeliveryFor(selected, true)} type="button">
                  Regenerar link
                </button>
              </div>
              {message ? <p className="inline-message">{message}</p> : null}
            </>
          ) : (
            <p className="muted empty-state">Seleccione un documento para ver detalle y acciones.</p>
          )}
        </aside>
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
  const [cliente, setCliente] = useState<FacturaClienteInput>({
    documento_tipo: "RUC",
    documento: "",
    razon_social: "",
    direccion: "",
    telefono: "",
    email: ""
  });
  const [lines, setLines] = useState<InvoiceLineDraft[]>(() => [createInvoiceLine()]);
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
  const [deliveryLink, setDeliveryLink] = useState<DeliveryLinkResponse | null>(null);
  const [emailStatus, setEmailStatus] = useState<EmailStatusResponse | null>(null);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);

  const api = useMemo(() => createApiClient(accessToken, setAccessToken), [accessToken, setAccessToken]);
  const today = useMemo(() => new Date().toLocaleDateString("es-PY"), []);
  const readyMessage = readiness?.checks.find((check) => !check.ok)?.message ?? "La configuracion operativa esta lista.";

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
  }, [cliente, condicionVenta, lines]);

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
      return;
    }

    void loadDeliveryData(emittedDocumento.id);
  }, [emittedDocumento?.id, emittedDocumento?.cdc, emittedDocumento?.estado]);

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
      setDeliveryLink(null);
      setEmailStatus(null);
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
    setCliente({
      documento_tipo: "RUC",
      documento: "",
      razon_social: "",
      direccion: "",
      telefono: "",
      email: ""
    });
    setLines([createInvoiceLine()]);
    setPreview(null);
    setPreviewError(null);
    setEmissionError(null);
    setEmittedDocumento(null);
    setDeliveryLink(null);
    setEmailStatus(null);
    setDeliveryMessage(null);
    setIdempotencyKey(createIdempotencyKey());
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
    setLines((current) => (current.length === 1 ? current : current.filter((line) => line.id !== lineId)));
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
    setClienteMessage(suggestion.source === "AGENDA_FACTURADOR" ? "Cliente seleccionado de la agenda." : "Datos sugeridos desde identidad compartida.");
    setClienteSuggestions([]);
  }

  async function saveClienteRapido() {
    setClienteSaving(true);
    setClienteMessage(null);

    try {
      const saved = await api.post<ClienteResponse>("/clientes", {
        documento_tipo: cliente.documento_tipo,
        documento: cliente.documento,
        razon_social: cliente.razon_social,
        direccion: cliente.direccion || null,
        telefono: cliente.telefono || null,
        email: cliente.email || null
      });
      applyClienteSuggestion(saved);
      setClienteModalOpen(false);
      setClienteMessage("Cliente guardado para este facturador.");
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

  async function saveQuickCatalogItem(line: InvoiceLineDraft) {
    setCatalogSaving((current) => ({ ...current, [line.id]: true }));
    setCatalogMessage((current) => ({ ...current, [line.id]: null }));

    try {
      const saved = await api.post<CatalogoItem>("/catalogo/items", {
        codigo: line.codigo.trim() || null,
        descripcion: line.descripcion.trim(),
        precio_unitario: Number(line.precio_unitario),
        iva_tipo: "IVA_10",
        activo: true
      });
      applyCatalogItem(line.id, saved);
      setCatalogMessage((current) => ({ ...current, [line.id]: "Item rapido guardado con IVA 10%." }));
    } catch (error) {
      setCatalogMessage((current) => ({
        ...current,
        [line.id]: error instanceof Error ? error.message : "No se pudo guardar el item."
      }));
    } finally {
      setCatalogSaving((current) => ({ ...current, [line.id]: false }));
    }
  }

  return (
    <section className="invoice-editor" aria-labelledby="invoice-title">
      <div className="editor-heading">
        <div>
          <p className="eyebrow">Nueva factura</p>
          <h2 id="invoice-title">Editor de emision</h2>
        </div>
        <button className="ghost-action" onClick={onBack} type="button">
          Volver
        </button>
      </div>

      <section className="invoice-band">
        <div>
          <dt>Razon social</dt>
          <dd>{context?.facturador.razon_social ?? "-"}</dd>
        </div>
        <div>
          <dt>RUC</dt>
          <dd>{context?.facturador.ruc ?? "-"}</dd>
        </div>
        <div>
          <dt>Actividad</dt>
          <dd>{context?.fiscal_context.actividad_economica_descripcion ?? context?.fiscal_context.actividad_economica_codigo ?? "-"}</dd>
        </div>
        <div>
          <dt>Est./Punto</dt>
          <dd>{context ? `${context.fiscal_context.establecimiento}-${context.fiscal_context.punto_expedicion}` : "-"}</dd>
        </div>
      </section>

      <section className={canEmit ? "editor-alert ready" : "editor-alert blocked"}>
        {canEmit ? "Numero fiscal pendiente de emision. El sistema lo asigna al confirmar con SIFEN." : readyMessage}
      </section>

      <section className="form-section comprobante-section">
        <div>
          <p className="eyebrow">Comprobante</p>
          <h3>Factura electronica</h3>
          <p className="muted">Fecha {today} · Timbrado {context?.fiscal_context.timbrado ?? "-"}</p>
        </div>
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
      </section>

      <section className="form-section">
        <p className="eyebrow">Cliente</p>
        <div className="field-grid">
          <label>
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
                inputMode="text"
                onChange={(event) => setCliente((current) => ({ ...current, cliente_id: null, documento: event.target.value }))}
                placeholder="80123456-7"
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
                    <small>{suggestion.source === "AGENDA_FACTURADOR" ? "Agenda" : "Identidad compartida"}</small>
                  </button>
                ))}
              </div>
            ) : null}
          </label>
          <label>
            Nombre o razon social
            <input onChange={(event) => setCliente((current) => ({ ...current, cliente_id: null, razon_social: event.target.value }))} value={cliente.razon_social} />
          </label>
          <label>
            Direccion
            <input onChange={(event) => setCliente((current) => ({ ...current, cliente_id: null, direccion: event.target.value }))} value={cliente.direccion ?? ""} />
          </label>
          <label>
            Telefono
            <input inputMode="tel" onChange={(event) => setCliente((current) => ({ ...current, cliente_id: null, telefono: event.target.value }))} value={cliente.telefono ?? ""} />
          </label>
          <label>
            Correo
            <input inputMode="email" onChange={(event) => setCliente((current) => ({ ...current, cliente_id: null, email: event.target.value }))} value={cliente.email ?? ""} />
          </label>
        </div>
        <div className="quick-actions-row">
          <button
            className="secondary-action"
            disabled={!cliente.documento.trim() || !cliente.razon_social.trim() || Boolean(cliente.cliente_id)}
            onClick={() => setClienteModalOpen(true)}
            type="button"
          >
            Guardar cliente
          </button>
          {clienteMessage ? <p className="inline-message">{clienteMessage}</p> : null}
        </div>
      </section>

      <section className="form-section">
        <div className="section-title-row">
          <div>
            <p className="eyebrow">Lineas</p>
            <h3>Productos o servicios</h3>
          </div>
          <button className="secondary-action" onClick={() => setLines((current) => [...current, createInvoiceLine()])} type="button">
            Agregar
          </button>
        </div>

        <div className="invoice-lines">
          {lines.map((line, index) => (
            <article className="line-card" key={line.id}>
              <div className="line-card-header">
                <strong>Linea {index + 1}</strong>
                <button className="link-action" disabled={lines.length === 1} onClick={() => removeLine(line.id)} type="button">
                  Quitar
                </button>
              </div>
              <div className="line-grid">
                <label>
                  Cant.
                  <input inputMode="numeric" min="1" onChange={(event) => updateLine(line.id, { cantidad: event.target.value })} value={line.cantidad} />
                </label>
                <label>
                  Codigo
                  <input
                    disabled={line.lockedFromCatalog}
                    onChange={(event) =>
                      updateLine(line.id, { catalogo_item_id: null, codigo: event.target.value, lockedFromCatalog: false })
                    }
                    value={line.codigo}
                  />
                </label>
                <label className="span-2">
                  Descripcion
                  <input
                    disabled={line.lockedFromCatalog}
                    onChange={(event) =>
                      updateLine(line.id, { catalogo_item_id: null, descripcion: event.target.value, lockedFromCatalog: false })
                    }
                    value={line.descripcion}
                  />
                </label>
                <label>
                  Precio unit.
                  <input
                    disabled={line.lockedFromCatalog}
                    inputMode="numeric"
                    min="0"
                    onChange={(event) =>
                      updateLine(line.id, { catalogo_item_id: null, precio_unitario: event.target.value, lockedFromCatalog: false })
                    }
                    value={line.precio_unitario}
                  />
                </label>
                <label>
                  IVA
                  <select
                    disabled={line.lockedFromCatalog}
                    onChange={(event) =>
                      updateLine(line.id, { catalogo_item_id: null, iva_tipo: event.target.value as TipoIva, lockedFromCatalog: false })
                    }
                    value={line.iva_tipo}
                  >
                    <option value="IVA_10">10%</option>
                    <option value="IVA_5">5%</option>
                    <option value="EXENTA">Exenta</option>
                  </select>
                </label>
                <div className="line-subtotal">
                  <dt>Subtotal</dt>
                  <dd>{formatGuaranies(preview?.items[index]?.subtotal ?? 0)}</dd>
                </div>
              </div>
              {catalogSearching[line.id] ? <span className="field-hint">Buscando catalogo...</span> : null}
              {(catalogSuggestions[line.id] ?? []).length > 0 ? (
                <div className="suggestion-list catalog">
                  {(catalogSuggestions[line.id] ?? []).map((item) => (
                    <button key={item.id} onClick={() => applyCatalogItem(line.id, item)} type="button">
                      <strong>{item.codigo}</strong>
                      <span>{item.descripcion}</span>
                      <small>{formatGuaranies(item.precio_unitario)} · {formatIva(item.iva_tipo)}</small>
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="quick-actions-row compact">
                {line.lockedFromCatalog ? (
                  <button
                    className="secondary-action"
                    onClick={() => updateLine(line.id, { catalogo_item_id: null, lockedFromCatalog: false })}
                    type="button"
                  >
                    Editar como nuevo
                  </button>
                ) : (
                  <button
                    className="secondary-action"
                    disabled={!line.descripcion.trim() || !Number.isInteger(Number(line.precio_unitario)) || catalogSaving[line.id]}
                    onClick={() => void saveQuickCatalogItem(line)}
                    type="button"
                  >
                    {catalogSaving[line.id] ? "Guardando..." : "Guardar item 10%"}
                  </button>
                )}
                {catalogMessage[line.id] ? <p className="inline-message">{catalogMessage[line.id]}</p> : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="totals-section" aria-live="polite">
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
            {emitting ? "Procesando..." : "Emitir factura"}
          </button>
        </div>
        {emissionError ? <p className="form-error">{emissionError}</p> : null}
      </section>

      {emittedDocumento ? (
        <section className="emission-result" aria-live="polite">
          <div className="receipt-heading">
            <div>
              <p className="eyebrow">Comprobante</p>
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
          </div>

          {getRecoverableMessage(emittedDocumento) ? <p className="editor-alert blocked">{getRecoverableMessage(emittedDocumento)}</p> : null}
          {emailStatus?.message ? <p className="editor-alert ready">{emailStatus.message}</p> : null}

          <div className="delivery-actions">
            <a
              className={emittedDocumento.cdc && deliveryLink ? "secondary-link" : "secondary-link disabled"}
              href={deliveryLink ? `${deliveryLink.public_url}/kude.pdf` : "#"}
              rel="noreferrer"
              target="_blank"
            >
              KUDE/PDF
            </a>
            <a
              className={emittedDocumento.cdc && deliveryLink ? "secondary-link" : "secondary-link disabled"}
              href={deliveryLink ? `${deliveryLink.public_url}/xml` : "#"}
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
              href={deliveryLink?.whatsapp_url ?? "#"}
              rel="noreferrer"
              target="_blank"
            >
              WhatsApp
            </a>
          </div>

          <div className="public-link-box">
            <dt>Link publico</dt>
            <dd>{deliveryLink?.public_url ?? (deliveryLoading ? "Generando link..." : "No disponible")}</dd>
          </div>
          {deliveryMessage ? <p className="inline-message">{deliveryMessage}</p> : null}

          <div className="result-actions">
            <button
              className="secondary-action"
              disabled={emitting || !emittedDocumento.cdc}
              onClick={() => void refreshEmittedDocumento()}
              type="button"
            >
              Refrescar estado
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
      <span className="brand-symbol">V</span>
      <span className="brand-word">VENTAX</span>
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
