import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";
const ACCESS_TOKEN_STORAGE_KEY = "ventax_factura_access_token";

type ViewState = "checking-session" | "login" | "loading-context" | "operacion";

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
          await loadOperationalState(refreshed.access_token);
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

    async function loadOperationalState(token: string) {
      setView("loading-context");
      const client = createApiClient(token, setAccessToken);
      const [contextResponse, readinessResponse] = await Promise.all([
        client.get<OperationalContextResponse>("/me/context"),
        client.get<ReadinessResponse>("/me/readiness")
      ]);

      if (!active) {
        return;
      }

      setUser(contextResponse.user);
      setContext(contextResponse);
      setReadiness(readinessResponse);
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
      context={context}
      readiness={readiness}
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
  context,
  readiness,
  user,
  onLogout
}: {
  context: OperationalContextResponse | null;
  readiness: ReadinessResponse | null;
  user: UserSummary | null;
  onLogout: () => Promise<void>;
}) {
  const canEmit = Boolean(readiness?.ready);

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

      <section className="next-panel">
        <button className="primary-action wide" disabled={!canEmit} type="button">
          Nueva factura
        </button>
        <button className="secondary-action wide" type="button">
          Ver documentos
        </button>
      </section>
    </main>
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
      throw new Error(await readApiError(response));
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
