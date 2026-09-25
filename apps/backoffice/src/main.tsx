import React, { FormEvent, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

import { apiLogin, ApiError, getToken, setToken } from "./api/client";
import { postImportApply, postImportPreview, type ActividadOpcion, type ContextoDiff, type EntidadDiff, type Hallazgo, type ImportApplyResponse, type ImportDiff, type ImportTarget } from "./api/import";
import { listTenants, getTenant, createTenant, updateTenant, type Tenant } from "./api/tenants";
import {
  listFacturadores,
  getFacturador,
  createFacturador,
  updateFacturador,
  getFacturadorReadiness,
  getFacturadorSaludFiscal,
  setFacturadorApiKey,
  type Facturador,
  type FacturadorReadiness,
  type FacturadorSaludFiscal,
} from "./api/facturadores";
import {
  listEstablecimientos,
  createEstablecimiento,
  updateEstablecimiento,
  type Establecimiento,
} from "./api/establecimientos";
import { listPuntos, createPunto, updatePunto, type Punto } from "./api/puntos";
import { listActividades, createActividad, updateActividad, type Actividad } from "./api/actividades";
import { listPerfiles, createPerfil, updatePerfil, type Perfil } from "./api/perfiles";
import {
  listContextos,
  createContexto,
  updateContexto,
  type Contexto,
} from "./api/contextos";
import {
  listUsers,
  getUser,
  createUser,
  updateUser,
  resetPassword,
  assignOperationConfig,
  deleteUser,
  type BackofficeUser,
} from "./api/usuarios";
import { listPlanes, type Plan } from "./api/planes";
import { Layout } from "./components/Layout";
import { FormField } from "./components/FormField";
import { CopyableSecret } from "./components/CopyableSecret";

// ─── Auth types ───────────────────────────────────────────────────────────────

interface SessionUser {
  id: string;
  username: string;
  role: string;
}

// ─── View type ────────────────────────────────────────────────────────────────

type AppView =
  | { tag: "checking-session" }
  | { tag: "login" }
  | { tag: "tenants-list" }
  | { tag: "tenant-create" }
  | { tag: "tenant-detail"; tenantId: string }
  | { tag: "facturador-create"; tenantId: string }
  | { tag: "facturador-detail"; facturadorId: string; tenantId: string }
  | { tag: "facturador-readiness"; facturadorId: string; tenantId: string }
  | { tag: "establecimiento-create"; facturadorId: string; tenantId: string }
  | { tag: "punto-create"; establecimientoId: string; facturadorId: string; tenantId: string }
  | { tag: "actividad-create"; facturadorId: string; tenantId: string }
  | { tag: "perfil-create"; facturadorId: string; tenantId: string }
  | { tag: "contexto-create"; facturadorId: string; tenantId: string }
  | { tag: "facturador-import"; tenantId?: string }
  | { tag: "usuarios-list" }
  | { tag: "usuario-create"; tenantId?: string; facturadorId?: string }
  | { tag: "usuario-detail"; userId: string };

type NavSection = "tenants" | "usuarios";

function navSectionFor(view: AppView): NavSection {
  if (view.tag === "usuarios-list" || view.tag === "usuario-create" || view.tag === "usuario-detail") {
    return "usuarios";
  }
  return "tenants";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Badge({ value }: { value: boolean | string }) {
  const ok = value === true || value === "ACTIVO";
  const label = typeof value === "boolean" ? (value ? "Activo" : "Inactivo") : value;
  return <span className={`badge ${ok ? "badge-ok" : "badge-warn"}`}>{label}</span>;
}

function formatRole(role: string): string {
  if (role === "OPERADOR_FACTURACION") return "Operador";
  if (role === "SOPORTE_INTERNO") return "Soporte";
  if (role === "ADMIN_INTERNO") return "Admin";
  return role;
}

// ─── App root ─────────────────────────────────────────────────────────────────

function App() {
  const [view, setView] = useState<AppView>({ tag: "checking-session" });
  const [user, setUser] = useState<SessionUser | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (token) {
      setView({ tag: "tenants-list" });
    } else {
      setView({ tag: "login" });
    }
  }, []);

  useEffect(() => {
    function handleUnauthorized() {
      setToken(null);
      setUser(null);
      setView({ tag: "login" });
    }
    window.addEventListener("backoffice:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("backoffice:unauthorized", handleUnauthorized);
  }, []);

  async function handleLogin(username: string, password: string) {
    const res = await apiLogin(username, password);
    const role = res.user.role;
    if (role !== "SOPORTE_INTERNO" && role !== "ADMIN_INTERNO") {
      throw new Error("Acceso denegado. Se requiere rol de soporte o administrador interno.");
    }
    setToken(res.access_token);
    setUser({ id: res.user.id, username: res.user.username, role: res.user.role });
    setView({ tag: "tenants-list" });
  }

  function handleLogout() {
    setToken(null);
    setUser(null);
    setView({ tag: "login" });
  }

  function navigate(nextView: AppView) {
    setErrorMessage(null);
    setView(nextView);
  }

  if (view.tag === "checking-session") {
    return <div className="loading-screen">Verificando sesion...</div>;
  }

  if (view.tag === "login") {
    return <LoginView errorMessage={errorMessage} onLogin={handleLogin} onError={setErrorMessage} />;
  }

  const breadcrumb = buildBreadcrumb(view, navigate);
  const activeSection = navSectionFor(view);

  return (
    <Layout
      username={user?.username ?? "backoffice"}
      role={formatRole(user?.role ?? "")}
      activeSection={activeSection}
      onNavigate={(section) => navigate(section === "tenants" ? { tag: "tenants-list" } : { tag: "usuarios-list" })}
      onLogout={handleLogout}
      breadcrumb={breadcrumb}
    >
      {view.tag === "tenants-list" ? (
        <TenantsListView onNavigate={navigate} />
      ) : view.tag === "tenant-create" ? (
        <TenantCreateView onNavigate={navigate} />
      ) : view.tag === "tenant-detail" ? (
        <TenantDetailView tenantId={view.tenantId} onNavigate={navigate} />
      ) : view.tag === "facturador-create" ? (
        <FacturadorCreateView tenantId={view.tenantId} onNavigate={navigate} />
      ) : view.tag === "facturador-detail" ? (
        <FacturadorDetailView facturadorId={view.facturadorId} tenantId={view.tenantId} onNavigate={navigate} />
      ) : view.tag === "facturador-readiness" ? (
        <FacturadorReadinessView facturadorId={view.facturadorId} tenantId={view.tenantId} onNavigate={navigate} />
      ) : view.tag === "establecimiento-create" ? (
        <EstablecimientoCreateView facturadorId={view.facturadorId} tenantId={view.tenantId} onNavigate={navigate} />
      ) : view.tag === "punto-create" ? (
        <PuntoCreateView establecimientoId={view.establecimientoId} facturadorId={view.facturadorId} tenantId={view.tenantId} onNavigate={navigate} />
      ) : view.tag === "actividad-create" ? (
        <ActividadCreateView facturadorId={view.facturadorId} tenantId={view.tenantId} onNavigate={navigate} />
      ) : view.tag === "perfil-create" ? (
        <PerfilCreateView facturadorId={view.facturadorId} tenantId={view.tenantId} onNavigate={navigate} />
      ) : view.tag === "contexto-create" ? (
        <ContextoCreateView facturadorId={view.facturadorId} tenantId={view.tenantId} onNavigate={navigate} />
      ) : view.tag === "facturador-import" ? (
        <FacturadorImportView tenantId={view.tenantId} onNavigate={navigate} />
      ) : view.tag === "usuarios-list" ? (
        <UsersListView onNavigate={navigate} />
      ) : view.tag === "usuario-create" ? (
        <UserCreateView tenantId={view.tenantId} facturadorId={view.facturadorId} onNavigate={navigate} />
      ) : view.tag === "usuario-detail" ? (
        <UserDetailView userId={view.userId} onNavigate={navigate} />
      ) : null}
    </Layout>
  );
}

function buildBreadcrumb(view: AppView, navigate: (v: AppView) => void): Array<{ label: string; onClick?: () => void }> {
  if (view.tag === "tenants-list") return [{ label: "Tenants" }];
  if (view.tag === "facturador-import") return [
    { label: "Tenants", onClick: () => navigate({ tag: "tenants-list" }) },
    { label: "Importar configuracion FE" },
  ];
  if (view.tag === "tenant-create") return [
    { label: "Tenants", onClick: () => navigate({ tag: "tenants-list" }) },
    { label: "Nuevo tenant" },
  ];
  if (view.tag === "tenant-detail") return [
    { label: "Tenants", onClick: () => navigate({ tag: "tenants-list" }) },
    { label: "Detalle tenant" },
  ];
  if (view.tag === "facturador-create") return [
    { label: "Tenants", onClick: () => navigate({ tag: "tenants-list" }) },
    { label: "Tenant", onClick: () => navigate({ tag: "tenant-detail", tenantId: view.tenantId }) },
    { label: "Nuevo facturador" },
  ];
  if (view.tag === "facturador-detail") return [
    { label: "Tenants", onClick: () => navigate({ tag: "tenants-list" }) },
    { label: "Tenant", onClick: () => navigate({ tag: "tenant-detail", tenantId: view.tenantId }) },
    { label: "Facturador" },
  ];
  if (view.tag === "facturador-readiness") return [
    { label: "Tenants", onClick: () => navigate({ tag: "tenants-list" }) },
    { label: "Tenant", onClick: () => navigate({ tag: "tenant-detail", tenantId: view.tenantId }) },
    { label: "Facturador", onClick: () => navigate({ tag: "facturador-detail", facturadorId: view.facturadorId, tenantId: view.tenantId }) },
    { label: "Readiness" },
  ];
  if (view.tag === "establecimiento-create") return [
    { label: "Tenants", onClick: () => navigate({ tag: "tenants-list" }) },
    { label: "Facturador", onClick: () => navigate({ tag: "facturador-detail", facturadorId: view.facturadorId, tenantId: view.tenantId }) },
    { label: "Nuevo establecimiento" },
  ];
  if (view.tag === "punto-create") return [
    { label: "Facturador", onClick: () => navigate({ tag: "facturador-detail", facturadorId: view.facturadorId, tenantId: view.tenantId }) },
    { label: "Nuevo punto" },
  ];
  if (view.tag === "actividad-create") return [
    { label: "Facturador", onClick: () => navigate({ tag: "facturador-detail", facturadorId: view.facturadorId, tenantId: view.tenantId }) },
    { label: "Nueva actividad" },
  ];
  if (view.tag === "perfil-create") return [
    { label: "Facturador", onClick: () => navigate({ tag: "facturador-detail", facturadorId: view.facturadorId, tenantId: view.tenantId }) },
    { label: "Nuevo perfil" },
  ];
  if (view.tag === "contexto-create") return [
    { label: "Facturador", onClick: () => navigate({ tag: "facturador-detail", facturadorId: view.facturadorId, tenantId: view.tenantId }) },
    { label: "Nuevo contexto" },
  ];
  if (view.tag === "usuarios-list") return [{ label: "Usuarios" }];
  if (view.tag === "usuario-create") return [
    { label: "Usuarios", onClick: () => navigate({ tag: "usuarios-list" }) },
    { label: "Nuevo usuario" },
  ];
  if (view.tag === "usuario-detail") return [
    { label: "Usuarios", onClick: () => navigate({ tag: "usuarios-list" }) },
    { label: "Detalle usuario" },
  ];
  return [];
}

// ─── LoginView ────────────────────────────────────────────────────────────────

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg fill="none" height="18" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      {crossed ? (
        <line stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" x1="2" x2="22" y1="21" y2="3" />
      ) : null}
    </svg>
  );
}

function LoginView({
  errorMessage,
  onLogin,
  onError,
}: {
  errorMessage: string | null;
  onLogin: (u: string, p: string) => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    onError(null);
    try {
      await onLogin(username.trim(), password);
    } catch (err) {
      onError(err instanceof Error ? err.message : "No se pudo iniciar sesion.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-eyebrow">Ventax Backoffice</div>
        <div className="auth-title">Acceso interno</div>
        <form className="auth-form" onSubmit={(e) => void submit(e)}>
          <FormField label="Usuario" required>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
          </FormField>
          <FormField label="Contraseña" required>
            <div className="password-input">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="password-toggle"
                onClick={() => setShowPassword((value) => !value)}
                tabIndex={-1}
                type="button"
              >
                <EyeIcon crossed={showPassword} />
              </button>
            </div>
          </FormField>
          {errorMessage ? <div className="error-msg">{errorMessage}</div> : null}
          <button className="btn btn-primary btn-wide" disabled={submitting} type="submit">
            {submitting ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </section>
    </main>
  );
}

// ─── TenantsListView ──────────────────────────────────────────────────────────

function TenantsListView({ onNavigate }: { onNavigate: (v: AppView) => void }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    void load();
  }, []);

  async function load(query = q) {
    setLoading(true);
    setError(null);
    try {
      setTenants(await listTenants(query || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando tenants.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="panel-header">
        <h1 className="panel-title">Tenants</h1>
        <button className="btn btn-primary" onClick={() => onNavigate({ tag: "tenant-create" })} type="button">
          + Nuevo tenant
        </button>
        <button className="btn" onClick={() => onNavigate({ tag: "facturador-import" })} type="button" data-testid="nav-import">
          Importar configuracion FE
        </button>
      </div>
      <div className="panel">
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Buscar por nombre o slug..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: 1 }}
            onKeyDown={(e) => { if (e.key === "Enter") void load(q); }}
          />
          <button className="btn" onClick={() => void load(q)} type="button">Buscar</button>
        </div>
        {error ? <div className="error-msg">{error}</div> : null}
        {loading ? <div className="empty-state">Cargando...</div> : null}
        {!loading && tenants.length === 0 ? <div className="empty-state">Sin tenants registrados.</div> : null}
        {tenants.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Slug</th>
                  <th>Plan</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id}>
                    <td><strong>{t.nombre}</strong></td>
                    <td className="monospace">{t.slug}</td>
                    <td>{t.suscripcion?.plan_codigo ?? "-"}</td>
                    <td><Badge value={t.estado} /></td>
                    <td>
                      <button className="btn btn-sm" onClick={() => onNavigate({ tag: "tenant-detail", tenantId: t.id })} type="button">
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </>
  );
}

// ─── TenantCreateView ─────────────────────────────────────────────────────────

function TenantCreateView({ onNavigate }: { onNavigate: (v: AppView) => void }) {
  const [nombre, setNombre] = useState("");
  const [slug, setSlug] = useState("");
  const [plan, setPlan] = useState("");
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [loadingPlanes, setLoadingPlanes] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPlanes()
      .then((data) => {
        setPlanes(data);
        if (data.length > 0) setPlan(data[0]!.codigo);
      })
      .catch(() => setError("No se pudieron cargar los planes."))
      .finally(() => setLoadingPlanes(false));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const t = await createTenant({ nombre: nombre.trim(), slug: slug.trim(), plan_codigo: plan });
      onNavigate({ tag: "tenant-detail", tenantId: t.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando tenant.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>Nuevo tenant</h1>
      <div className="panel">
        {error ? <div className="error-msg">{error}</div> : null}
        <form className="form" onSubmit={(e) => void submit(e)}>
          <FormField label="Nombre" required>
            <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </FormField>
          <FormField label="Slug (identificador URL)" required>
            <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="ej: mi-empresa" required />
          </FormField>
          <FormField label="Plan" required>
            <select value={plan} onChange={(e) => setPlan(e.target.value)} disabled={loadingPlanes}>
              {loadingPlanes
                ? <option value="">Cargando...</option>
                : planes.map((p) => (
                    <option key={p.codigo} value={p.codigo}>{p.nombre}</option>
                  ))
              }
            </select>
          </FormField>
          <div className="form-actions">
            <button className="btn btn-primary" disabled={submitting || loadingPlanes || !plan} type="submit">
              {submitting ? "Creando..." : "Crear tenant"}
            </button>
            <button className="btn" onClick={() => onNavigate({ tag: "tenants-list" })} type="button">Cancelar</button>
          </div>
        </form>
      </div>
    </>
  );
}

// ─── TenantDetailView ─────────────────────────────────────────────────────────

function TenantDetailView({ tenantId, onNavigate }: { tenantId: string; onNavigate: (v: AppView) => void }) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [facturadores, setFacturadores] = useState<Facturador[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [nombre, setNombre] = useState("");
  const [estado, setEstado] = useState<"ACTIVO" | "SUSPENDIDO">("ACTIVO");
  const [emailAdministrativo, setEmailAdministrativo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void load();
  }, [tenantId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [t, fs] = await Promise.all([getTenant(tenantId), listFacturadores(tenantId)]);
      setTenant(t);
      setFacturadores(fs);
      setNombre(t.nombre);
      setEstado(t.estado as "ACTIVO" | "SUSPENDIDO");
      setEmailAdministrativo(t.email_administrativo ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando tenant.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!tenant) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateTenant(tenantId, {
        nombre: nombre.trim() || undefined,
        estado,
        email_administrativo: emailAdministrativo.trim() || null
      });
      setTenant(updated);
      setEditMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error actualizando tenant.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="empty-state">Cargando...</div>;
  if (error && !tenant) return <div className="error-msg">{error}</div>;
  if (!tenant) return null;

  return (
    <>
      <div className="panel-header">
        <h1>{tenant.nombre} <Badge value={tenant.estado} /></h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setEditMode(!editMode)} type="button">
            {editMode ? "Cancelar" : "Editar"}
          </button>
          <button className="btn btn-primary" onClick={() => onNavigate({ tag: "facturador-create", tenantId })} type="button">
            + Facturador
          </button>
        </div>
      </div>

      {error ? <div className="error-msg">{error}</div> : null}

      <div className="panel">
        {editMode ? (
          <div className="form">
            <div className="form-row">
              <FormField label="Nombre">
                <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </FormField>
              <FormField label="Estado">
                <select value={estado} onChange={(e) => setEstado(e.target.value as "ACTIVO" | "SUSPENDIDO")}>
                  <option value="ACTIVO">ACTIVO</option>
                  <option value="SUSPENDIDO">SUSPENDIDO</option>
                </select>
              </FormField>
              <FormField label="Email administrativo">
                <input
                  onChange={(e) => setEmailAdministrativo(e.target.value)}
                  placeholder="admin@cliente.com"
                  type="email"
                  value={emailAdministrativo}
                />
              </FormField>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" disabled={saving} onClick={() => void save()} type="button">
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        ) : (
          <dl className="detail-grid">
            <div className="detail-item"><dt>Slug</dt><dd className="monospace">{tenant.slug}</dd></div>
            <div className="detail-item"><dt>Estado</dt><dd><Badge value={tenant.estado} /></dd></div>
            <div className="detail-item"><dt>Plan</dt><dd>{tenant.suscripcion?.plan_codigo ?? "-"}</dd></div>
            <div className="detail-item"><dt>Plan nombre</dt><dd>{tenant.suscripcion?.plan_nombre ?? "-"}</dd></div>
            <div className="detail-item"><dt>Suscripcion estado</dt><dd>{tenant.suscripcion?.estado ?? "-"}</dd></div>
            <div className="detail-item"><dt>Email administrativo</dt><dd>{tenant.email_administrativo ?? "-"}</dd></div>
            <div className="detail-item"><dt>ID</dt><dd className="monospace" style={{ fontSize: 11 }}>{tenant.id}</dd></div>
          </dl>
        )}
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Facturadores</h2>
        </div>
        {facturadores.length === 0 ? (
          <div className="empty-state">Sin facturadores. Crea uno con el boton de arriba.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Razon social</th>
                  <th>RUC</th>
                  <th>Emisor ID</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {facturadores.map((f) => (
                  <tr key={f.id}>
                    <td><strong>{f.razon_social}</strong></td>
                    <td>{f.ruc}</td>
                    <td className="monospace" style={{ fontSize: 12 }}>{f.emisor_id}</td>
                    <td><Badge value={f.activo} /></td>
                    <td>
                      <button className="btn btn-sm" onClick={() => onNavigate({ tag: "facturador-detail", facturadorId: f.id, tenantId })} type="button">
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ─── FacturadorCreateView ─────────────────────────────────────────────────────

function FacturadorCreateView({ tenantId, onNavigate }: { tenantId: string; onNavigate: (v: AppView) => void }) {
  const [emisorId, setEmisorId] = useState("");
  const [ruc, setRuc] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [nombreFantasia, setNombreFantasia] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const f = await createFacturador(tenantId, {
        emisor_id: emisorId.trim(),
        ruc: ruc.trim(),
        razon_social: razonSocial.trim(),
        nombre_fantasia: nombreFantasia.trim() || null,
      });
      onNavigate({ tag: "facturador-detail", facturadorId: f.id, tenantId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando facturador.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>Nuevo facturador</h1>
      <div className="panel">
        {error ? <div className="error-msg">{error}</div> : null}
        <form className="form" onSubmit={(e) => void submit(e)}>
          <FormField label="Emisor ID (UUID del backend fiscal)" required>
            <input type="text" value={emisorId} onChange={(e) => setEmisorId(e.target.value)} placeholder="uuid del emisor en FE" required />
          </FormField>
          <div className="form-row">
            <FormField label="RUC" required>
              <input type="text" value={ruc} onChange={(e) => setRuc(e.target.value)} placeholder="ej: 80136968-0" required />
            </FormField>
            <FormField label="Nombre fantasia">
              <input type="text" value={nombreFantasia} onChange={(e) => setNombreFantasia(e.target.value)} />
            </FormField>
          </div>
          <FormField label="Razon social" required>
            <input type="text" value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} required />
          </FormField>
          <div className="form-actions">
            <button className="btn btn-primary" disabled={submitting} type="submit">
              {submitting ? "Creando..." : "Crear facturador"}
            </button>
            <button className="btn" onClick={() => onNavigate({ tag: "tenant-detail", tenantId })} type="button">Cancelar</button>
          </div>
        </form>
      </div>
    </>
  );
}

// ─── FacturadorDetailView ─────────────────────────────────────────────────────

type FacturadorTab = "info" | "establecimientos" | "actividades" | "perfiles" | "contextos";

function FacturadorDetailView({
  facturadorId,
  tenantId,
  onNavigate,
}: {
  facturadorId: string;
  tenantId: string;
  onNavigate: (v: AppView) => void;
}) {
  const [facturador, setFacturador] = useState<Facturador | null>(null);
  const [establecimientos, setEstablecimientos] = useState<Establecimiento[]>([]);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [contextos, setContextos] = useState<Contexto[]>([]);
  const [puntosByEst, setPuntosByEst] = useState<Record<string, Punto[]>>({});
  const [tab, setTab] = useState<FacturadorTab>("info");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [razonSocial, setRazonSocial] = useState("");
  const [ruc, setRuc] = useState("");
  const [nombreFantasia, setNombreFantasia] = useState("");
  const [activo, setActivo] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [apiKeyOk, setApiKeyOk] = useState(false);
  const [saludFiscal, setSaludFiscal] = useState<FacturadorSaludFiscal | null>(null);

  useEffect(() => {
    void load();
  }, [facturadorId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [f, ests, acts, prfs, ctxs] = await Promise.all([
        getFacturador(facturadorId),
        listEstablecimientos(facturadorId),
        listActividades(facturadorId),
        listPerfiles(facturadorId),
        listContextos(facturadorId),
      ]);
      setFacturador(f);
      setEstablecimientos(ests);
      setActividades(acts);
      setPerfiles(prfs);
      setContextos(ctxs);
      setRazonSocial(f.razon_social);
      setRuc(f.ruc);
      setNombreFantasia(f.nombre_fantasia ?? "");
      setActivo(f.activo);

      const puntosMap: Record<string, Punto[]> = {};
      await Promise.all(
        ests.map(async (est) => {
          try {
            puntosMap[est.id] = await listPuntos(est.id);
          } catch {
            puntosMap[est.id] = [];
          }
        })
      );
      setPuntosByEst(puntosMap);

      try {
        setSaludFiscal(await getFacturadorSaludFiscal(facturadorId));
      } catch {
        setSaludFiscal(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando facturador.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!facturador) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateFacturador(facturadorId, {
        razon_social: razonSocial.trim() || undefined,
        ruc: ruc.trim() || undefined,
        nombre_fantasia: nombreFantasia.trim() || null,
        activo,
      });
      setFacturador(updated);
      setEditMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error actualizando facturador.");
    } finally {
      setSaving(false);
    }
  }

  async function saveApiKey() {
    if (!apiKeyInput.trim()) return;
    setApiKeySaving(true);
    setApiKeyOk(false);
    setError(null);
    try {
      await setFacturadorApiKey(facturadorId, apiKeyInput.trim());
      setFacturador((f) => f ? { ...f, has_api_key: true } : f);
      setApiKeyInput("");
      setApiKeyOk(true);
      setTimeout(() => setApiKeyOk(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando API key.");
    } finally {
      setApiKeySaving(false);
    }
  }

  if (loading) return <div className="empty-state">Cargando...</div>;
  if (error && !facturador) return <div className="error-msg">{error}</div>;
  if (!facturador) return null;

  const tabs: Array<{ key: FacturadorTab; label: string }> = [
    { key: "info", label: "Informacion" },
    { key: "establecimientos", label: `Establecimientos (${establecimientos.length})` },
    { key: "actividades", label: `Actividades (${actividades.length})` },
    { key: "perfiles", label: `Perfiles (${perfiles.length})` },
    { key: "contextos", label: `Contextos (${contextos.length})` },
  ];

  return (
    <>
      <div className="panel-header">
        <h1>{facturador.nombre_fantasia ?? facturador.razon_social} <Badge value={facturador.activo} /></h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => onNavigate({ tag: "facturador-readiness", facturadorId, tenantId })} type="button">
            Readiness
          </button>
          <button className="btn" onClick={() => setEditMode(!editMode)} type="button">
            {editMode ? "Cancelar" : "Editar"}
          </button>
        </div>
      </div>

      {error ? <div className="error-msg">{error}</div> : null}

      <nav className="sub-nav">
        {tabs.map((t) => (
          <button key={t.key} className={`sub-nav-item${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)} type="button">
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "info" ? (
        <div className="panel">
          {editMode ? (
            <div className="form">
              <div className="form-row">
                <FormField label="Razon social">
                  <input type="text" value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} />
                </FormField>
                <FormField label="RUC">
                  <input type="text" value={ruc} onChange={(e) => setRuc(e.target.value)} />
                </FormField>
              </div>
              <FormField label="Nombre fantasia">
                <input type="text" value={nombreFantasia} onChange={(e) => setNombreFantasia(e.target.value)} />
              </FormField>
              <FormField label="Estado">
                <select value={activo ? "true" : "false"} onChange={(e) => setActivo(e.target.value === "true")}>
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </select>
              </FormField>
              <div className="form-actions">
                <button className="btn btn-primary" disabled={saving} onClick={() => void save()} type="button">
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          ) : (
            <dl className="detail-grid">
              <div className="detail-item"><dt>Razon social</dt><dd>{facturador.razon_social}</dd></div>
              <div className="detail-item"><dt>RUC</dt><dd>{facturador.ruc}</dd></div>
              <div className="detail-item"><dt>Nombre fantasia</dt><dd>{facturador.nombre_fantasia ?? "-"}</dd></div>
              <div className="detail-item"><dt>Emisor ID</dt><dd className="monospace" style={{ fontSize: 11 }}>{facturador.emisor_id}</dd></div>
              <div className="detail-item"><dt>ID</dt><dd className="monospace" style={{ fontSize: 11 }}>{facturador.id}</dd></div>
            </dl>
          )}

          <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "var(--text-muted)" }}>API Key FE Consumer</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <span style={{
                fontSize: 13,
                padding: "4px 10px",
                borderRadius: 4,
                background: facturador.has_api_key ? "var(--success-bg, #e6f9f0)" : "var(--warn-bg, #fff8e1)",
                color: facturador.has_api_key ? "var(--success, #1a7a4a)" : "var(--warn, #7a5200)"
              }}>
                {facturador.has_api_key ? "● Configurada" : "○ Sin API key"}
              </span>
              {apiKeyOk && <span style={{ fontSize: 13, color: "var(--success, #1a7a4a)" }}>Guardada correctamente</span>}
            </div>
            <div className="form-row" style={{ alignItems: "flex-end", gap: 8 }}>
              <div style={{ flex: 1 }}>
              <FormField label={facturador.has_api_key ? "Reemplazar API key" : "Cargar API key"}>
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="Pegar la API key del FE consumer..."
                  autoComplete="new-password"
                />
              </FormField>
              </div>
              <button
                className="btn btn-primary"
                disabled={apiKeySaving || !apiKeyInput.trim()}
                onClick={() => void saveApiKey()}
                type="button"
                style={{ marginBottom: 0 }}
              >
                {apiKeySaving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>

          <div style={{ marginTop: 24, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14, color: "var(--text-muted)" }}>Salud fiscal</h3>
            {saludFiscal ? (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, padding: "8px 14px", borderRadius: 6, background: "var(--danger-bg, #fdeceb)", color: "var(--danger, #b42318)" }}>
                  {saludFiscal.requiere_soporte} requiere soporte
                </span>
                <span style={{ fontSize: 13, padding: "8px 14px", borderRadius: 6, background: "var(--warn-bg, #fff8e1)", color: "var(--warn, #7a5200)" }}>
                  {saludFiscal.requiere_accion} requiere acción
                </span>
                <span style={{ fontSize: 13, padding: "8px 14px", borderRadius: 6, background: "var(--info-bg, #eaf6fb)", color: "var(--info, #0f5b78)" }}>
                  {saludFiscal.en_proceso} en verificación
                </span>
              </div>
            ) : (
              <p className="muted" style={{ fontSize: 13 }}>No se pudo cargar la salud fiscal.</p>
            )}
          </div>
        </div>
      ) : tab === "establecimientos" ? (
        <EstablecimientosTab
          establecimientos={establecimientos}
          puntosByEst={puntosByEst}
          facturadorId={facturadorId}
          tenantId={tenantId}
          onNavigate={onNavigate}
          onRefresh={() => void load()}
        />
      ) : tab === "actividades" ? (
        <ActividadesTab actividades={actividades} facturadorId={facturadorId} tenantId={tenantId} onNavigate={onNavigate} onRefresh={() => void load()} />
      ) : tab === "perfiles" ? (
        <PerfilesTab perfiles={perfiles} facturadorId={facturadorId} tenantId={tenantId} onNavigate={onNavigate} onRefresh={() => void load()} />
      ) : tab === "contextos" ? (
        <ContextosTab contextos={contextos} establecimientos={establecimientos} actividades={actividades} perfiles={perfiles} facturadorId={facturadorId} tenantId={tenantId} onNavigate={onNavigate} onRefresh={() => void load()} />
      ) : null}
    </>
  );
}

// ─── EstablecimientosTab ──────────────────────────────────────────────────────

function EstablecimientosTab({
  establecimientos,
  puntosByEst,
  facturadorId,
  tenantId,
  onNavigate,
  onRefresh,
}: {
  establecimientos: Establecimiento[];
  puntosByEst: Record<string, Punto[]>;
  facturadorId: string;
  tenantId: string;
  onNavigate: (v: AppView) => void;
  onRefresh: () => void;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [editDir, setEditDir] = useState("");
  const [editActivo, setEditActivo] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(est: Establecimiento) {
    setEditId(est.id);
    setEditNombre(est.nombre ?? "");
    setEditDir(est.direccion ?? "");
    setEditActivo(est.activo);
  }

  async function saveEdit() {
    if (!editId) return;
    setSaving(true);
    try {
      await updateEstablecimiento(editId, { nombre: editNombre || undefined, direccion: editDir || null, activo: editActivo });
      setEditId(null);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error actualizando establecimiento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Establecimientos</h2>
        <button className="btn btn-primary" onClick={() => onNavigate({ tag: "establecimiento-create", facturadorId, tenantId })} type="button">
          + Establecimiento
        </button>
      </div>
      {error ? <div className="error-msg">{error}</div> : null}
      {establecimientos.length === 0 ? <div className="empty-state">Sin establecimientos.</div> : null}
      {establecimientos.map((est) => (
        <div key={est.id} style={{ marginBottom: 16, padding: "12px 0", borderBottom: "1px solid var(--border-light)" }}>
          {editId === est.id ? (
            <div className="form">
              <div className="form-row">
                <FormField label="Nombre">
                  <input type="text" value={editNombre} onChange={(e) => setEditNombre(e.target.value)} />
                </FormField>
                <FormField label="Direccion">
                  <input type="text" value={editDir} onChange={(e) => setEditDir(e.target.value)} />
                </FormField>
              </div>
              <FormField label="Estado">
                <select value={editActivo ? "true" : "false"} onChange={(e) => setEditActivo(e.target.value === "true")}>
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </select>
              </FormField>
              <div className="form-actions">
                <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => void saveEdit()} type="button">Guardar</button>
                <button className="btn btn-sm" onClick={() => setEditId(null)} type="button">Cancelar</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <strong>Codigo {est.codigo}</strong> — {est.nombre ?? "sin nombre"} <Badge value={est.activo} />
                {est.direccion ? <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{est.direccion}</div> : null}
                <div style={{ marginTop: 6 }}>
                  <strong style={{ fontSize: 12 }}>Puntos: </strong>
                  {(puntosByEst[est.id] ?? []).map((p) => (
                    <span key={p.id} style={{ fontSize: 12, marginRight: 6 }}>{p.codigo}{p.nombre ? ` (${p.nombre})` : ""} <Badge value={p.activo} /></span>
                  ))}
                  <button className="btn btn-sm" style={{ marginLeft: 4 }} onClick={() => onNavigate({ tag: "punto-create", establecimientoId: est.id, facturadorId, tenantId })} type="button">+ Punto</button>
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => startEdit(est)} type="button">Editar</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── ActividadesTab ───────────────────────────────────────────────────────────

function ActividadesTab({
  actividades,
  facturadorId,
  tenantId,
  onNavigate,
  onRefresh,
}: {
  actividades: Actividad[];
  facturadorId: string;
  tenantId: string;
  onNavigate: (v: AppView) => void;
  onRefresh: () => void;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editAlias, setEditAlias] = useState("");
  const [editActivo, setEditActivo] = useState(true);
  const [saving, setSaving] = useState(false);

  function startEdit(a: Actividad) {
    setEditId(a.id);
    setEditDesc(a.descripcion ?? "");
    setEditAlias(a.alias_operativo ?? "");
    setEditActivo(a.activo);
  }

  async function saveEdit() {
    if (!editId) return;
    setSaving(true);
    try {
      await updateActividad(editId, { descripcion: editDesc || null, alias_operativo: editAlias || null, activo: editActivo });
      setEditId(null);
      onRefresh();
    } catch { /* noop */ }
    finally { setSaving(false); }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Actividades economicas</h2>
        <button className="btn btn-primary" onClick={() => onNavigate({ tag: "actividad-create", facturadorId, tenantId })} type="button">
          + Actividad
        </button>
      </div>
      {actividades.length === 0 ? <div className="empty-state">Sin actividades.</div> : null}
      <div className="table-wrap">
        {actividades.length > 0 ? (
          <table>
            <thead><tr><th>Codigo</th><th>Descripcion</th><th>Alias</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {actividades.map((a) => (
                <tr key={a.id}>
                  {editId === a.id ? (
                    <td colSpan={5}>
                      <div className="form">
                        <div className="form-row">
                          <FormField label="Descripcion"><input type="text" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} /></FormField>
                          <FormField label="Alias"><input type="text" value={editAlias} onChange={(e) => setEditAlias(e.target.value)} /></FormField>
                        </div>
                        <FormField label="Estado">
                          <select value={editActivo ? "true" : "false"} onChange={(e) => setEditActivo(e.target.value === "true")}>
                            <option value="true">Activo</option>
                            <option value="false">Inactivo</option>
                          </select>
                        </FormField>
                        <div className="form-actions">
                          <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => void saveEdit()} type="button">Guardar</button>
                          <button className="btn btn-sm" onClick={() => setEditId(null)} type="button">Cancelar</button>
                        </div>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className="monospace">{a.codigo}</td>
                      <td>{a.descripcion ?? "-"}</td>
                      <td>{a.alias_operativo ?? "-"}</td>
                      <td><Badge value={a.activo} /></td>
                      <td><button className="btn btn-sm" onClick={() => startEdit(a)} type="button">Editar</button></td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </div>
  );
}

// ─── PerfilesTab ──────────────────────────────────────────────────────────────

function PerfilesTab({
  perfiles,
  facturadorId,
  tenantId,
  onNavigate,
  onRefresh,
}: {
  perfiles: Perfil[];
  facturadorId: string;
  tenantId: string;
  onNavigate: (v: AppView) => void;
  onRefresh: () => void;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editActivo, setEditActivo] = useState(true);
  const [saving, setSaving] = useState(false);

  function startEdit(p: Perfil) {
    setEditId(p.id);
    setEditDesc(p.descripcion ?? "");
    setEditActivo(p.activo);
  }

  async function saveEdit() {
    if (!editId) return;
    setSaving(true);
    try {
      await updatePerfil(editId, { descripcion: editDesc || null, activo: editActivo });
      setEditId(null);
      onRefresh();
    } catch { /* noop */ }
    finally { setSaving(false); }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Perfiles de emision</h2>
        <button className="btn btn-primary" onClick={() => onNavigate({ tag: "perfil-create", facturadorId, tenantId })} type="button">
          + Perfil
        </button>
      </div>
      {perfiles.length === 0 ? <div className="empty-state">Sin perfiles.</div> : null}
      {perfiles.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Codigo</th><th>Descripcion</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {perfiles.map((p) => (
                <tr key={p.id}>
                  {editId === p.id ? (
                    <td colSpan={4}>
                      <div className="form">
                        <FormField label="Descripcion"><input type="text" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} /></FormField>
                        <FormField label="Estado">
                          <select value={editActivo ? "true" : "false"} onChange={(e) => setEditActivo(e.target.value === "true")}>
                            <option value="true">Activo</option>
                            <option value="false">Inactivo</option>
                          </select>
                        </FormField>
                        <div className="form-actions">
                          <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => void saveEdit()} type="button">Guardar</button>
                          <button className="btn btn-sm" onClick={() => setEditId(null)} type="button">Cancelar</button>
                        </div>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className="monospace">{p.codigo}</td>
                      <td>{p.descripcion ?? "-"}</td>
                      <td><Badge value={p.activo} /></td>
                      <td><button className="btn btn-sm" onClick={() => startEdit(p)} type="button">Editar</button></td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

// ─── ContextosTab ─────────────────────────────────────────────────────────────

function ContextosTab({
  contextos,
  establecimientos,
  actividades,
  perfiles,
  facturadorId,
  tenantId,
  onNavigate,
  onRefresh,
}: {
  contextos: Contexto[];
  establecimientos: Establecimiento[];
  actividades: Actividad[];
  perfiles: Perfil[];
  facturadorId: string;
  tenantId: string;
  onNavigate: (v: AppView) => void;
  onRefresh: () => void;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [editTimbrado, setEditTimbrado] = useState("");
  const [editTimbradoInicio, setEditTimbradoInicio] = useState("");
  const [editDocNro, setEditDocNro] = useState("");
  const [editCreditoDias, setEditCreditoDias] = useState("");
  const [editAlias, setEditAlias] = useState("");
  const [editActivo, setEditActivo] = useState(true);
  const [saving, setSaving] = useState(false);

  function startEdit(c: Contexto) {
    setEditId(c.id);
    setEditTimbrado(c.timbrado ?? "");
    setEditTimbradoInicio(c.timbrado_inicio ?? "");
    setEditDocNro(c.documento_nro ?? "");
    setEditCreditoDias(String(c.credito_plazo_dias ?? 0));
    setEditAlias(c.alias_operativo ?? "");
    setEditActivo(c.activo);
  }

  async function saveEdit() {
    if (!editId) return;
    setSaving(true);
    try {
      await updateContexto(editId, {
        timbrado: editTimbrado || null,
        timbrado_inicio: editTimbradoInicio || null,
        documento_nro: editDocNro || null,
        credito_plazo_dias: editCreditoDias ? parseInt(editCreditoDias, 10) : null,
        alias_operativo: editAlias || null,
        activo: editActivo,
      });
      setEditId(null);
      onRefresh();
    } catch { /* noop */ }
    finally { setSaving(false); }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Contextos operativos</h2>
        <button className="btn btn-primary" onClick={() => onNavigate({ tag: "contexto-create", facturadorId, tenantId })} type="button">
          + Contexto
        </button>
      </div>
      {contextos.length === 0 ? (
        <div className="empty-state">Sin contextos. Se necesitan actividad, establecimiento, punto y perfil primero.</div>
      ) : null}
      {contextos.map((c) => (
        <div key={c.id} style={{ marginBottom: 12, padding: "12px 0", borderBottom: "1px solid var(--border-light)" }}>
          {editId === c.id ? (
            <div className="form">
              <div className="form-row">
                <FormField label="Timbrado">
                  <input type="text" value={editTimbrado} onChange={(e) => setEditTimbrado(e.target.value)} />
                </FormField>
                <FormField label="Timbrado inicio (YYYY-MM-DD)">
                  <input type="date" value={editTimbradoInicio} onChange={(e) => setEditTimbradoInicio(e.target.value)} />
                </FormField>
              </div>
              <div className="form-row">
                <FormField label="Documento Nro (7 digitos)">
                  <input type="text" value={editDocNro} onChange={(e) => setEditDocNro(e.target.value)} />
                </FormField>
                <FormField label="Credito plazo dias">
                  <input type="number" value={editCreditoDias} onChange={(e) => setEditCreditoDias(e.target.value)} min="0" />
                </FormField>
              </div>
              <FormField label="Alias operativo">
                <input type="text" value={editAlias} onChange={(e) => setEditAlias(e.target.value)} />
              </FormField>
              <FormField label="Estado">
                <select value={editActivo ? "true" : "false"} onChange={(e) => setEditActivo(e.target.value === "true")}>
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </select>
              </FormField>
              <div className="form-actions">
                <button className="btn btn-primary btn-sm" disabled={saving} onClick={() => void saveEdit()} type="button">Guardar</button>
                <button className="btn btn-sm" onClick={() => setEditId(null)} type="button">Cancelar</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <strong>{c.alias_operativo ?? "Contexto"}</strong> <Badge value={c.activo} />
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                  Act: {c.actividad.codigo} · Est: {c.establecimiento.codigo} · Punto: {c.punto_expedicion.codigo} · Perfil: {c.perfil_emision.codigo}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  Timbrado: {c.timbrado ?? "-"} · DocNro: {c.documento_nro ?? "-"} · Credito: {c.credito_plazo_dias}d
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => startEdit(c)} type="button">Editar</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── FacturadorReadinessView ──────────────────────────────────────────────────

function FacturadorReadinessView({
  facturadorId,
  tenantId,
  onNavigate,
}: {
  facturadorId: string;
  tenantId: string;
  onNavigate: (v: AppView) => void;
}) {
  const [data, setData] = useState<FacturadorReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [facturadorId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await getFacturadorReadiness(facturadorId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando readiness.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="empty-state">Verificando readiness...</div>;
  if (error) return <div className="error-msg">{error}</div>;
  if (!data) return null;

  const checks: Array<{ key: keyof typeof data.checks; label: string }> = [
    { key: "tenant_activo", label: "Tenant activo" },
    { key: "suscripcion_activa", label: "Suscripcion activa" },
    { key: "facturador_activo", label: "Facturador activo" },
    { key: "contextos_activos", label: "Contextos operativos activos" },
    { key: "usuarios_operativos", label: "Usuarios operativos asignados" },
    { key: "fiscal_backend_available", label: "Backend fiscal disponible" },
  ];

  return (
    <>
      <div className="panel-header">
        <h1>Readiness del facturador</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => void load()} type="button">Actualizar</button>
          <button className="btn" onClick={() => onNavigate({ tag: "facturador-detail", facturadorId, tenantId })} type="button">Volver</button>
        </div>
      </div>

      <div className={`readiness-banner ${data.ready ? "ok" : "nok"}`}>
        {data.ready ? "Listo para operar" : "No esta listo — revisa los items a continuacion"}
      </div>

      <div className="panel">
        <div className="readiness-list">
          {checks.map(({ key, label }) => {
            const val = data.checks[key];
            const ok = typeof val === "boolean" ? val : (val as number) > 0;
            return (
              <div key={key} className="readiness-item">
                <span className="readiness-icon">{ok ? "✓" : "✗"}</span>
                <span className="readiness-label">{label}</span>
                <span className="readiness-value">
                  {typeof val === "boolean" ? (val ? "Si" : "No") : String(val)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ─── EstablecimientoCreateView ────────────────────────────────────────────────

function EstablecimientoCreateView({
  facturadorId,
  tenantId,
  onNavigate,
}: {
  facturadorId: string;
  tenantId: string;
  onNavigate: (v: AppView) => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [direccion, setDireccion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createEstablecimiento(facturadorId, { codigo: codigo.trim(), nombre: nombre.trim(), direccion: direccion.trim() || null });
      onNavigate({ tag: "facturador-detail", facturadorId, tenantId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando establecimiento.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>Nuevo establecimiento</h1>
      <div className="panel">
        {error ? <div className="error-msg">{error}</div> : null}
        <form className="form" onSubmit={(e) => void submit(e)}>
          <div className="form-row">
            <FormField label="Codigo (3 digitos)" required>
              <input type="text" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="001" maxLength={3} required />
            </FormField>
            <FormField label="Nombre" required>
              <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </FormField>
          </div>
          <FormField label="Direccion">
            <input type="text" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </FormField>
          <div className="form-actions">
            <button className="btn btn-primary" disabled={submitting} type="submit">{submitting ? "Creando..." : "Crear"}</button>
            <button className="btn" onClick={() => onNavigate({ tag: "facturador-detail", facturadorId, tenantId })} type="button">Cancelar</button>
          </div>
        </form>
      </div>
    </>
  );
}

// ─── PuntoCreateView ──────────────────────────────────────────────────────────

function PuntoCreateView({
  establecimientoId,
  facturadorId,
  tenantId,
  onNavigate,
}: {
  establecimientoId: string;
  facturadorId: string;
  tenantId: string;
  onNavigate: (v: AppView) => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [nombre, setNombre] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createPunto(establecimientoId, { codigo: codigo.trim(), nombre: nombre.trim() || null });
      onNavigate({ tag: "facturador-detail", facturadorId, tenantId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando punto.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>Nuevo punto de expedicion</h1>
      <div className="panel">
        {error ? <div className="error-msg">{error}</div> : null}
        <form className="form" onSubmit={(e) => void submit(e)}>
          <div className="form-row">
            <FormField label="Codigo (3 digitos)" required>
              <input type="text" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="001" maxLength={3} required />
            </FormField>
            <FormField label="Nombre">
              <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </FormField>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" disabled={submitting} type="submit">{submitting ? "Creando..." : "Crear"}</button>
            <button className="btn" onClick={() => onNavigate({ tag: "facturador-detail", facturadorId, tenantId })} type="button">Cancelar</button>
          </div>
        </form>
      </div>
    </>
  );
}

// ─── ActividadCreateView ──────────────────────────────────────────────────────

function ActividadCreateView({
  facturadorId,
  tenantId,
  onNavigate,
}: {
  facturadorId: string;
  tenantId: string;
  onNavigate: (v: AppView) => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [alias, setAlias] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createActividad(facturadorId, { codigo: codigo.trim(), descripcion: descripcion.trim() || null, alias_operativo: alias.trim() || null });
      onNavigate({ tag: "facturador-detail", facturadorId, tenantId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando actividad.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>Nueva actividad economica</h1>
      <div className="panel">
        {error ? <div className="error-msg">{error}</div> : null}
        <form className="form" onSubmit={(e) => void submit(e)}>
          <div className="form-row">
            <FormField label="Codigo SIFEN" required>
              <input type="text" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="ej: 85000" required />
            </FormField>
            <FormField label="Alias operativo">
              <input type="text" value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="nombre corto para la UI" />
            </FormField>
          </div>
          <FormField label="Descripcion">
            <input type="text" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </FormField>
          <div className="form-actions">
            <button className="btn btn-primary" disabled={submitting} type="submit">{submitting ? "Creando..." : "Crear"}</button>
            <button className="btn" onClick={() => onNavigate({ tag: "facturador-detail", facturadorId, tenantId })} type="button">Cancelar</button>
          </div>
        </form>
      </div>
    </>
  );
}

// ─── PerfilCreateView ─────────────────────────────────────────────────────────

function PerfilCreateView({
  facturadorId,
  tenantId,
  onNavigate,
}: {
  facturadorId: string;
  tenantId: string;
  onNavigate: (v: AppView) => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createPerfil(facturadorId, { codigo: codigo.trim(), descripcion: descripcion.trim() || null });
      onNavigate({ tag: "facturador-detail", facturadorId, tenantId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando perfil.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>Nuevo perfil de emision</h1>
      <div className="panel">
        {error ? <div className="error-msg">{error}</div> : null}
        <form className="form" onSubmit={(e) => void submit(e)}>
          <div className="form-row">
            <FormField label="Codigo SIFEN" required>
              <input type="text" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="ej: B2B" required />
            </FormField>
            <FormField label="Descripcion">
              <input type="text" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </FormField>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" disabled={submitting} type="submit">{submitting ? "Creando..." : "Crear"}</button>
            <button className="btn" onClick={() => onNavigate({ tag: "facturador-detail", facturadorId, tenantId })} type="button">Cancelar</button>
          </div>
        </form>
      </div>
    </>
  );
}

// ─── ContextoCreateView ───────────────────────────────────────────────────────

function ContextoCreateView({
  facturadorId,
  tenantId,
  onNavigate,
}: {
  facturadorId: string;
  tenantId: string;
  onNavigate: (v: AppView) => void;
}) {
  const [establecimientos, setEstablecimientos] = useState<Establecimiento[]>([]);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [perfiles, setPerfiles] = useState<Perfil[]>([]);
  const [puntos, setPuntos] = useState<Punto[]>([]);
  const [selectedEst, setSelectedEst] = useState("");
  const [actividadId, setActividadId] = useState("");
  const [puntoId, setPuntoId] = useState("");
  const [perfilId, setPerfilId] = useState("");
  const [timbrado, setTimbrado] = useState("");
  const [timbradoInicio, setTimbradoInicio] = useState("");
  const [docNro, setDocNro] = useState("");
  const [creditoDias, setCreditoDias] = useState("0");
  const [alias, setAlias] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadDependencies();
  }, [facturadorId]);

  useEffect(() => {
    if (!selectedEst) { setPuntos([]); setPuntoId(""); return; }
    void listPuntos(selectedEst).then((ps) => { setPuntos(ps); setPuntoId(""); }).catch(() => { setPuntos([]); });
  }, [selectedEst]);

  async function loadDependencies() {
    setLoading(true);
    try {
      const [ests, acts, prfs] = await Promise.all([
        listEstablecimientos(facturadorId),
        listActividades(facturadorId),
        listPerfiles(facturadorId),
      ]);
      setEstablecimientos(ests);
      setActividades(acts);
      setPerfiles(prfs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando dependencias.");
    } finally {
      setLoading(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createContexto(facturadorId, {
        actividad_id: actividadId,
        establecimiento_id: selectedEst,
        punto_expedicion_id: puntoId,
        perfil_emision_id: perfilId,
        timbrado: timbrado.trim() || null,
        timbrado_inicio: timbradoInicio || null,
        documento_nro: docNro.trim() || null,
        credito_plazo_dias: creditoDias ? parseInt(creditoDias, 10) : null,
        alias_operativo: alias.trim() || null,
      });
      onNavigate({ tag: "facturador-detail", facturadorId, tenantId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando contexto. Verifica que actividad, establecimiento, punto y perfil pertenecen al mismo facturador.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="empty-state">Cargando dependencias...</div>;

  return (
    <>
      <h1>Nuevo contexto operativo</h1>
      <div className="panel">
        {error ? <div className="error-msg">{error}</div> : null}
        <form className="form" onSubmit={(e) => void submit(e)}>
          <div className="form-row">
            <FormField label="Actividad economica" required>
              <select value={actividadId} onChange={(e) => setActividadId(e.target.value)} required>
                <option value="">Seleccionar...</option>
                {actividades.map((a) => <option key={a.id} value={a.id}>{a.codigo} — {a.alias_operativo ?? a.descripcion ?? a.codigo}</option>)}
              </select>
            </FormField>
            <FormField label="Perfil de emision" required>
              <select value={perfilId} onChange={(e) => setPerfilId(e.target.value)} required>
                <option value="">Seleccionar...</option>
                {perfiles.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.descripcion ?? p.codigo}</option>)}
              </select>
            </FormField>
          </div>
          <div className="form-row">
            <FormField label="Establecimiento" required>
              <select value={selectedEst} onChange={(e) => setSelectedEst(e.target.value)} required>
                <option value="">Seleccionar...</option>
                {establecimientos.map((e) => <option key={e.id} value={e.id}>{e.codigo} — {e.nombre ?? e.codigo}</option>)}
              </select>
            </FormField>
            <FormField label="Punto de expedicion" required>
              <select value={puntoId} onChange={(e) => setPuntoId(e.target.value)} required disabled={!selectedEst || puntos.length === 0}>
                <option value="">Seleccionar...</option>
                {puntos.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.nombre ?? p.codigo}</option>)}
              </select>
            </FormField>
          </div>
          <hr className="section-sep" />
          <div className="form-row">
            <FormField label="Timbrado">
              <input type="text" value={timbrado} onChange={(e) => setTimbrado(e.target.value)} placeholder="ej: 12345678" />
            </FormField>
            <FormField label="Timbrado inicio (YYYY-MM-DD)">
              <input type="date" value={timbradoInicio} onChange={(e) => setTimbradoInicio(e.target.value)} />
            </FormField>
          </div>
          <div className="form-row">
            <FormField label="Documento Nro inicial (7 digitos)">
              <input type="text" value={docNro} onChange={(e) => setDocNro(e.target.value)} placeholder="0000001" maxLength={7} />
            </FormField>
            <FormField label="Credito plazo dias">
              <input type="number" value={creditoDias} onChange={(e) => setCreditoDias(e.target.value)} min="0" />
            </FormField>
          </div>
          <FormField label="Alias operativo">
            <input type="text" value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Nombre para identificar este contexto" />
          </FormField>
          <div className="form-actions">
            <button className="btn btn-primary" disabled={submitting} type="submit">{submitting ? "Creando..." : "Crear contexto"}</button>
            <button className="btn" onClick={() => onNavigate({ tag: "facturador-detail", facturadorId, tenantId })} type="button">Cancelar</button>
          </div>
        </form>
      </div>
    </>
  );
}

// ─── UsersListView ────────────────────────────────────────────────────────────


// ─── Import de configuracion FE ───────────────────────────────────────────────

function accionChipClass(accion: string): string {
  if (accion === "CREAR") return "diff-chip diff-chip-crear";
  if (accion === "ACTUALIZAR") return "diff-chip diff-chip-actualizar";
  return "diff-chip diff-chip-sin-cambios";
}

function valorLegible(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

function CamposDiff({ campos }: { campos: Array<{ campo: string; actual: unknown; nuevo: unknown }> }) {
  if (campos.length === 0) return null;
  return (
    <table className="diff-tabla">
      <thead>
        <tr><th>Campo</th><th>Actual</th><th>Nuevo</th></tr>
      </thead>
      <tbody>
        {campos.map((c) => (
          <tr key={c.campo}>
            <td data-label="Campo">{c.campo}</td>
            <td data-label="Actual" className="diff-actual">{valorLegible(c.actual)}</td>
            <td data-label="Nuevo" className="diff-nuevo">{valorLegible(c.nuevo)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EntidadesDiff({ titulo, items }: { titulo: string; items: EntidadDiff[] }) {
  if (items.length === 0) return null;
  return (
    <section className="panel" aria-label={titulo}>
      <h3>{titulo}</h3>
      {items.map((e) => (
        <article key={e.codigo} className="diff-item">
          <header>
            <span className={accionChipClass(e.accion)}>{e.accion.replace("_", " ")}</span>
            <strong className="monospace">{e.codigo}</strong>
          </header>
          <CamposDiff campos={e.campos} />
        </article>
      ))}
    </section>
  );
}

function HallazgosLista({ titulo, items, tono, colapsado }: { titulo: string; items: Hallazgo[]; tono: string; colapsado?: boolean }) {
  if (items.length === 0) return null;
  const cuerpo = (
    <ul className="hallazgo-lista">
      {items.map((h, i) => (
        <li key={`${h.codigo}-${i}`} className={`hallazgo-item hallazgo-${tono}`}>
          <strong>{h.codigo}</strong>
          <span>{h.mensaje}</span>
          {h.ruta ? <code className="hallazgo-ruta">{h.ruta}</code> : null}
          {h.sugerencia ? <em className="hallazgo-sugerencia">{h.sugerencia}</em> : null}
        </li>
      ))}
    </ul>
  );
  if (colapsado) {
    return (
      <details className="panel">
        <summary>{titulo} ({items.length})</summary>
        {cuerpo}
      </details>
    );
  }
  return (
    <section className="panel" aria-label={titulo}>
      <h3>{titulo} ({items.length})</h3>
      {cuerpo}
    </section>
  );
}

function FacturadorImportView({ tenantId, onNavigate }: { tenantId?: string; onNavigate: (v: AppView) => void }) {
  type Paso = "archivo" | "destino" | "preview" | "resultado";
  const [paso, setPaso] = useState<Paso>("archivo");
  const [archivo, setArchivo] = useState<{ filename: string; content: string; format: "json" | "yaml" | "auto"; size: number } | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [modo, setModo] = useState<"EXISTENTE" | "NUEVO">(tenantId ? "EXISTENTE" : "EXISTENTE");
  const [tenantSel, setTenantSel] = useState(tenantId ?? "");
  const [nombre, setNombre] = useState("");
  const [slug, setSlug] = useState("");
  const [planCodigo, setPlanCodigo] = useState("");
  const [diff, setDiff] = useState<ImportDiff | null>(null);
  const [resultado, setResultado] = useState<ImportApplyResponse | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [actividadOverrides, setActividadOverrides] = useState<Record<string, string>>({});
  const [forzarAmbiente, setForzarAmbiente] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listTenants().then(setTenants).catch(() => undefined);
    void listPlanes().then((p) => {
      setPlanes(p);
      if (p[0]) setPlanCodigo(p[0].codigo);
    }).catch(() => undefined);
  }, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    const format: "json" | "yaml" | "auto" = /\.ya?ml$/i.test(file.name) ? "yaml" : /\.json$/i.test(file.name) ? "json" : "auto";
    setArchivo({ filename: file.name, content, format, size: file.size });
    setError(null);

    // Precarga del destino solo para JSON: no se agrega un parser YAML al bundle.
    if (format === "json") {
      try {
        const doc = JSON.parse(content) as Record<string, any>;
        const razon = doc?.emisor?.razon_social?.valor ?? doc?.emisor?.razon_social;
        if (typeof razon === "string" && razon.length > 0) {
          setNombre(razon);
          setSlug(razon.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60));
        }
      } catch { /* la precarga es best-effort */ }
    }
    setPaso("destino");
  }

  function target(): ImportTarget {
    return modo === "EXISTENTE"
      ? { mode: "EXISTENTE", tenant_id: tenantSel }
      : { mode: "NUEVO", nombre, slug, plan_codigo: planCodigo };
  }

  async function previsualizar() {
    if (!archivo) return;
    setBusy(true);
    setError(null);
    try {
      const d = await postImportPreview({ filename: archivo.filename, format: archivo.format, content: archivo.content, target: target() });
      setDiff(d);
      setOverrides(Object.fromEntries(d.contextos.filter((c) => c.documento_nro_editable).map((c) => [c.clave.perfil, c.documento_nro_sugerido])));
      setActividadOverrides(
        Object.fromEntries(d.contextos.filter((c) => c.actividad_editable).map((c) => [c.clave.perfil, c.actividad_codigo]))
      );
      setForzarAmbiente(false);
      setPaso("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo previsualizar el archivo.");
    } finally {
      setBusy(false);
    }
  }

  async function aplicar() {
    if (!archivo || !diff) return;
    setBusy(true);
    setError(null);
    try {
      const r = await postImportApply({
        filename: archivo.filename,
        format: archivo.format,
        content: archivo.content,
        target: target(),
        preview_token: diff.preview_token,
        permitir_ambiente_distinto: forzarAmbiente,
        documento_nro_overrides: overrides,
        actividad_overrides: actividadOverrides,
      });
      setResultado(r);
      setPaso("resultado");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo aplicar el import.");
    } finally {
      setBusy(false);
    }
  }

  const tieneAmbienteDistinto = diff?.bloqueantes.some((b) => b.codigo === "AMBIENTE_DISTINTO") ?? false;
  const puedeAplicar = Boolean(diff && (diff.puede_aplicar || (tieneAmbienteDistinto && forzarAmbiente && diff.bloqueantes.length === 1)));

  return (
    <div className="view" data-testid="import-view">
      <header className="view-header">
        <h2>Importar configuracion FE</h2>
        <p className="muted">Subi el archivo exportado por facturacion-electronica. Nada se aplica hasta que confirmes.</p>
      </header>

      <ol className="import-pasos" aria-label="Pasos del import">
        <li className={paso === "archivo" ? "activo" : "hecho"}>1. Archivo</li>
        <li className={paso === "destino" ? "activo" : paso === "archivo" ? "" : "hecho"}>2. Destino</li>
        <li className={paso === "preview" ? "activo" : paso === "resultado" ? "hecho" : ""}>3. Revision</li>
        <li className={paso === "resultado" ? "activo" : ""}>4. Resultado</li>
      </ol>

      {error ? <p className="form-error" data-testid="import-error">{error}</p> : null}

      {paso === "archivo" ? (
        <section className="panel">
          <FormField label="Archivo de configuracion (.json o .yaml)" required>
            <input type="file" accept=".json,.yaml,.yml" onChange={(e) => void onFile(e)} data-testid="import-file" />
          </FormField>
        </section>
      ) : null}

      {paso === "destino" && archivo ? (
        <section className="panel">
          <p className="muted">
            Archivo: <strong>{archivo.filename}</strong> ({Math.ceil(archivo.size / 1024)} KB, formato {archivo.format})
          </p>
          <FormField label="Destino" required>
            <label className="radio-inline">
              <input type="radio" checked={modo === "EXISTENTE"} onChange={() => setModo("EXISTENTE")} /> Tenant existente
            </label>
            <label className="radio-inline">
              <input type="radio" checked={modo === "NUEVO"} onChange={() => setModo("NUEVO")} /> Crear tenant nuevo
            </label>
          </FormField>

          {modo === "EXISTENTE" ? (
            <FormField label="Tenant" required>
              <select value={tenantSel} onChange={(e) => setTenantSel(e.target.value)} data-testid="import-tenant">
                <option value="">Seleccionar tenant...</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.nombre} ({t.slug})</option>)}
              </select>
            </FormField>
          ) : (
            <>
              <FormField label="Nombre del tenant" required>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </FormField>
              <FormField label="Slug" required>
                <input value={slug} onChange={(e) => setSlug(e.target.value)} />
              </FormField>
              <FormField label="Plan" required>
                <select value={planCodigo} onChange={(e) => setPlanCodigo(e.target.value)}>
                  {planes.map((p) => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)}
                </select>
              </FormField>
            </>
          )}

          <div className="form-actions">
            <button type="button" onClick={() => setPaso("archivo")}>Cambiar archivo</button>
            <button
              type="button"
              className="primary"
              disabled={busy || (modo === "EXISTENTE" ? !tenantSel : !nombre || !slug || !planCodigo)}
              onClick={() => void previsualizar()}
              data-testid="import-preview-btn"
            >
              {busy ? "Analizando..." : "Ver que va a pasar"}
            </button>
          </div>
        </section>
      ) : null}

      {paso === "preview" && diff ? (
        <>
          <section className={`panel import-banner ${diff.puede_aplicar ? "ok" : "bloqueado"}`} data-testid="import-banner">
            <h3>{diff.puede_aplicar ? "Listo para aplicar" : `${diff.bloqueantes.length} problema(s) impiden aplicar`}</h3>
            <p className="muted">
              Crear {diff.resumen.crear} · Actualizar {diff.resumen.actualizar} · Sin cambios {diff.resumen.sin_cambios} · Sin tocar {diff.resumen.no_tocados}
            </p>
            {diff.timbrado_elegido ? (
              <p className="muted">
                Timbrado <strong>{diff.timbrado_elegido.numero}</strong> (desde {diff.timbrado_elegido.fecha_inicio ?? "—"}) — {diff.timbrado_elegido.motivo}
              </p>
            ) : null}
          </section>

          <HallazgosLista titulo="Bloqueantes" items={diff.bloqueantes} tono="bloqueante" />
          <HallazgosLista titulo="Advertencias" items={diff.advertencias} tono="advertencia" />

          <section className="panel" aria-label="Facturador">
            <h3>Facturador</h3>
            <article className="diff-item">
              <header>
                <span className={accionChipClass(diff.facturador.accion)}>{diff.facturador.accion.replace("_", " ")}</span>
                <strong className="monospace">{diff.facturador.emisor_id}</strong>
              </header>
              <CamposDiff campos={diff.facturador.campos} />
            </article>
          </section>

          <EntidadesDiff titulo="Establecimientos" items={diff.establecimientos} />
          <EntidadesDiff titulo="Puntos de expedicion" items={diff.puntos} />
          <EntidadesDiff titulo="Actividades economicas" items={diff.actividades} />
          <EntidadesDiff titulo="Perfiles de emision" items={diff.perfiles} />

          <section className="panel" aria-label="Contextos operativos">
            <h3>Contextos operativos</h3>
            {diff.contextos.map((c: ContextoDiff) => (
              <article key={c.clave.perfil} className={`diff-item ${c.usuarios_asignados > 0 ? "diff-item-en-uso" : ""}`}>
                <header>
                  <span className={accionChipClass(c.accion)}>{c.accion.replace("_", " ")}</span>
                  <strong className="monospace">{c.clave.perfil}</strong>
                  <span className="muted">
                    Act {c.clave.actividad} · Est {c.clave.establecimiento} · Punto {c.clave.punto}
                  </span>
                </header>
                {c.usuarios_asignados > 0 ? (
                  <p className="hallazgo-item hallazgo-advertencia">
                    {c.usuarios_asignados} usuario(s) operando con este contexto.
                  </p>
                ) : null}
                {c.actividad_editable ? (
                  <FormField label="Actividad economica del contexto">
                    <select
                      value={actividadOverrides[c.clave.perfil] ?? c.actividad_codigo}
                      onChange={(e) => setActividadOverrides({ ...actividadOverrides, [c.clave.perfil]: e.target.value })}
                      data-testid={`import-actividad-${c.clave.perfil}`}
                    >
                      {c.actividad_opciones.map((a: ActividadOpcion) => (
                        <option key={a.codigo} value={a.codigo}>
                          {a.codigo} — {a.descripcion ?? "sin descripcion"}
                        </option>
                      ))}
                    </select>
                    <p className="muted">
                      Este perfil no fija actividad: FE la deja a eleccion. El contexto queda fijado en la elegida;
                      si despues hace falta otra, se agrega un contexto nuevo.
                    </p>
                  </FormField>
                ) : null}
                {c.documento_nro_editable ? (
                  <FormField label="Numero inicial de documento">
                    <input
                      value={overrides[c.clave.perfil] ?? c.documento_nro_sugerido}
                      onChange={(e) => setOverrides({ ...overrides, [c.clave.perfil]: e.target.value })}
                      pattern="[0-9]{7}"
                      maxLength={7}
                      data-testid={`import-docnro-${c.clave.perfil}`}
                    />
                  </FormField>
                ) : (
                  <p className="muted">Numeracion existente preservada.</p>
                )}
                <CamposDiff campos={c.campos} />
              </article>
            ))}
          </section>

          <HallazgosLista titulo="Datos del archivo que no se importan" items={diff.ignorados} tono="ignorado" colapsado />

          {tieneAmbienteDistinto ? (
            <section className="panel import-banner bloqueado">
              <label className="radio-inline">
                <input type="checkbox" checked={forzarAmbiente} onChange={(e) => setForzarAmbiente(e.target.checked)} data-testid="import-forzar-ambiente" />
                Entiendo que estoy importando configuracion de otro ambiente y quiero continuar.
              </label>
            </section>
          ) : null}

          <div className="form-actions">
            <button type="button" onClick={() => setPaso("destino")}>Volver</button>
            <button type="button" className="primary" disabled={!puedeAplicar || busy} onClick={() => void aplicar()} data-testid="import-apply-btn">
              {busy ? "Aplicando..." : "Aplicar cambios"}
            </button>
          </div>
        </>
      ) : null}

      {paso === "resultado" && resultado ? (
        <section className="panel import-banner ok" data-testid="import-resultado">
          <h3>Importacion aplicada</h3>
          <p className="muted">
            {resultado.resumen.crear} creados · {resultado.resumen.actualizar} actualizados
          </p>
          <ul className="hallazgo-lista">
            {resultado.proximos_pasos.map((p) => <li key={p} className="hallazgo-item">{p}</li>)}
          </ul>
          <div className="form-actions">
            <button type="button" className="primary" onClick={() => onNavigate({ tag: "usuario-create", tenantId: resultado.tenant_id, facturadorId: resultado.facturador_id })} data-testid="import-crear-usuario">
              Crear usuario operativo
            </button>
            <button type="button" onClick={() => onNavigate({ tag: "facturador-detail", facturadorId: resultado.facturador_id, tenantId: resultado.tenant_id })}>
              Ver facturador
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function UsersListView({ onNavigate }: { onNavigate: (v: AppView) => void }) {
  const [users, setUsers] = useState<BackofficeUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setUsers(await listUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando usuarios.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="panel-header">
        <h1 className="panel-title">Usuarios</h1>
        <button className="btn btn-primary" onClick={() => onNavigate({ tag: "usuario-create" })} type="button">
          + Nuevo usuario
        </button>
      </div>
      <div className="panel">
        {error ? <div className="error-msg">{error}</div> : null}
        {loading ? <div className="empty-state">Cargando...</div> : null}
        {!loading && users.length === 0 ? <div className="empty-state">Sin usuarios registrados.</div> : null}
        {users.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Nombre</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Config operativa</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="monospace"><strong>{u.username}</strong></td>
                    <td>{u.display_name ?? "-"}</td>
                    <td>{formatRole(u.role)}</td>
                    <td><Badge value={u.active} /></td>
                    <td>{u.operation_config ? <Badge value="ok" /> : <span className="badge badge-neutral">Sin config</span>}</td>
                    <td>
                      <button className="btn btn-sm" onClick={() => onNavigate({ tag: "usuario-detail", userId: u.id })} type="button">Ver</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </>
  );
}

// ─── UserCreateView ───────────────────────────────────────────────────────────

function UserCreateView({
  tenantId: tenantIdInicial,
  facturadorId: facturadorIdInicial,
  onNavigate,
}: {
  tenantId?: string;
  facturadorId?: string;
  onNavigate: (v: AppView) => void;
}) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(tenantIdInicial ?? "");
  // Alta guiada: si venimos del import, facturador y perfil ya estan resueltos.
  const [config, setConfig] = useState<OperationConfigValue>({
    facturadorId: facturadorIdInicial ?? "",
    contextoId: "",
  });
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<BackofficeUser["role"]>("OPERADOR_FACTURACION");
  const [password, setPassword] = useState("");
  const [created, setCreated] = useState<BackofficeUser | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listTenants().then(setTenants).catch(() => { /* noop */ });
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      // Los codigos salen del contexto elegido: la UI nunca los compone a mano.
      const operationConfig =
        config.contexto && config.facturador
          ? {
              facturador_id: config.facturador.id,
              emisor_id: config.facturador.emisor_id,
              establecimiento: config.contexto.establecimiento.codigo,
              punto_expedicion: config.contexto.punto_expedicion.codigo,
              perfil_emision_codigo: config.contexto.perfil_emision.codigo,
              actividad_economica_codigo: config.contexto.actividad.codigo,
            }
          : undefined;

      const u = await createUser({
        tenant_id: tenantId,
        username: username.trim(),
        email: email.trim(),
        display_name: displayName.trim() || null,
        role,
        temporary_password: password.trim() || null,
        ...(operationConfig ? { operation_config: operationConfig } : {}),
      });
      setCreated(u);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando usuario.");
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <>
        <h1>Usuario creado</h1>
        <div className="panel">
          <div className="success-msg">El usuario fue creado exitosamente.</div>
          <dl className="detail-grid" style={{ marginBottom: 16 }}>
            <div className="detail-item"><dt>Username</dt><dd className="monospace">{created.username}</dd></div>
            <div className="detail-item"><dt>Rol</dt><dd>{formatRole(created.role)}</dd></div>
          </dl>
          {created.temporary_password ? (
            <CopyableSecret label="Contrasena temporal" value={created.temporary_password} />
          ) : null}
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={() => onNavigate({ tag: "usuario-detail", userId: created.id })} type="button">
              Ver usuario
            </button>
            <button className="btn" onClick={() => onNavigate({ tag: "usuarios-list" })} type="button">Volver a lista</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Nuevo usuario</h1>
      <div className="panel">
        {error ? <div className="error-msg">{error}</div> : null}
        <form className="form" onSubmit={(e) => void submit(e)}>
          <FormField label="Tenant" required>
            <select
              value={tenantId}
              onChange={(e) => {
                setTenantId(e.target.value);
                setConfig({ facturadorId: "", contextoId: "" });
              }}
              disabled={Boolean(tenantIdInicial)}
              required
              data-testid="user-tenant"
            >
              <option value="">Seleccionar tenant...</option>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.nombre} ({t.slug})</option>)}
            </select>
          </FormField>
          <div className="form-row">
            <FormField label="Username" required>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" required />
            </FormField>
            <FormField label="Nombre visible">
              <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </FormField>
          </div>
          <div className="form-row">
            <FormField label="Email" required>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required />
            </FormField>
          </div>
          <div className="form-row">
            <FormField label="Rol" required>
              <select value={role} onChange={(e) => setRole(e.target.value as BackofficeUser["role"])}>
                <option value="OPERADOR_FACTURACION">Operador</option>
                <option value="SOPORTE_INTERNO">Soporte interno</option>
                <option value="ADMIN_INTERNO">Admin interno</option>
              </select>
            </FormField>
            <FormField label="Contrasena temporal">
              <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="dejar vacio para generar automaticamente" />
            </FormField>
          </div>
          <fieldset className="panel" style={{ marginTop: 8 }} data-testid="user-operacion">
            <legend>Configuracion operativa (opcional)</legend>
            <p className="muted">
              Elegi el facturador y su perfil de emision. Todo sale de listas: no hay datos fiscales para tipear.
            </p>
            <OperationConfigPicker
              tenantId={tenantId}
              value={config}
              onChange={setConfig}
              facturadorLocked={Boolean(facturadorIdInicial)}
            />
          </fieldset>

          <div className="form-actions">
            <button className="btn btn-primary" disabled={submitting} type="submit" data-testid="user-submit">{submitting ? "Creando..." : "Crear usuario"}</button>
            <button className="btn" onClick={() => onNavigate({ tag: "usuarios-list" })} type="button">Cancelar</button>
          </div>
        </form>
      </div>
    </>
  );
}

// ─── Alta guiada: selector de facturador y perfil ─────────────────────────────
//
// El alias operativo que muestra este selector lo completa el import desde la descripcion
// del perfil, asi que despues de importar se leen nombres y no codigos.

function contextoLabel(c: Contexto): string {
  const alias = c.alias_operativo ?? c.actividad.alias_operativo;
  if (alias) return alias;
  return `Est:${c.establecimiento.codigo} · Punto:${c.punto_expedicion.codigo} · Act:${c.actividad.codigo} · Perfil:${c.perfil_emision.codigo}`;
}

interface OperationConfigValue {
  facturadorId: string;
  contextoId: string;
  facturador?: Facturador;
  contexto?: Contexto;
}

function OperationConfigPicker({
  tenantId,
  value,
  onChange,
  facturadorLocked,
  onSinContextos,
}: {
  tenantId: string;
  value: OperationConfigValue;
  onChange: (v: OperationConfigValue) => void;
  facturadorLocked?: boolean;
  onSinContextos?: () => void;
}) {
  const [facturadores, setFacturadores] = useState<Facturador[]>([]);
  const [contextos, setContextos] = useState<Contexto[]>([]);
  const [loadingF, setLoadingF] = useState(false);
  const [loadingC, setLoadingC] = useState(false);

  useEffect(() => {
    if (!tenantId) {
      setFacturadores([]);
      return;
    }
    setLoadingF(true);
    void listFacturadores(tenantId)
      .then((f) => {
        setFacturadores(f);
        // Autoseleccion: con un solo facturador no hay nada que elegir.
        if (f.length === 1 && !value.facturadorId) {
          onChange({ facturadorId: f[0]!.id, contextoId: "", facturador: f[0] });
        }
      })
      .catch(() => setFacturadores([]))
      .finally(() => setLoadingF(false));
  }, [tenantId]);

  useEffect(() => {
    if (!value.facturadorId) {
      setContextos([]);
      return;
    }
    setLoadingC(true);
    void listContextos(value.facturadorId)
      .then((c) => {
        const activos = c.filter((x) => x.activo);
        setContextos(activos);
        if (activos.length === 0) onSinContextos?.();
        if (activos.length === 1 && !value.contextoId) {
          onChange({ ...value, contextoId: activos[0]!.id, contexto: activos[0] });
        }
      })
      .catch(() => setContextos([]))
      .finally(() => setLoadingC(false));
  }, [value.facturadorId]);

  const facturadorSel = facturadores.find((f) => f.id === value.facturadorId);

  return (
    <>
      <FormField label="Facturador" required>
        {facturadorLocked && facturadorSel ? (
          <p className="monospace">{facturadorSel.razon_social} — {facturadorSel.emisor_id}</p>
        ) : (
          <select
            value={value.facturadorId}
            onChange={(e) => {
              const f = facturadores.find((x) => x.id === e.target.value);
              onChange({ facturadorId: e.target.value, contextoId: "", facturador: f });
            }}
            disabled={!tenantId || loadingF}
            data-testid="picker-facturador"
          >
            <option value="">
              {!tenantId ? "Seleccionar tenant primero..." : loadingF ? "Cargando..." : "Seleccionar facturador..."}
            </option>
            {facturadores.map((f) => (
              <option key={f.id} value={f.id}>{f.razon_social} — {f.emisor_id}</option>
            ))}
          </select>
        )}
      </FormField>

      <FormField label="Perfil de emision" required>
        {value.facturadorId && !loadingC && contextos.length === 0 ? (
          <p className="muted" data-testid="picker-sin-contextos">
            Este facturador no tiene perfiles configurados. Importa su configuracion o creale un contexto operativo.
          </p>
        ) : (
          <select
            value={value.contextoId}
            onChange={(e) => {
              const c = contextos.find((x) => x.id === e.target.value);
              onChange({ ...value, contextoId: e.target.value, contexto: c });
            }}
            disabled={!value.facturadorId || loadingC}
            data-testid="picker-contexto"
          >
            <option value="">
              {!value.facturadorId ? "Seleccionar facturador primero..." : loadingC ? "Cargando..." : "Seleccionar perfil..."}
            </option>
            {contextos.map((c) => <option key={c.id} value={c.id}>{contextoLabel(c)}</option>)}
          </select>
        )}
      </FormField>

      {value.contexto && facturadorSel ? (
        <dl className="detail-grid" style={{ marginTop: 8, opacity: 0.75 }} data-testid="picker-resumen">
          <div className="detail-item"><dt>Emisor</dt><dd className="monospace">{facturadorSel.emisor_id}</dd></div>
          <div className="detail-item"><dt>Establecimiento</dt><dd>{value.contexto.establecimiento.codigo}</dd></div>
          <div className="detail-item"><dt>Punto</dt><dd>{value.contexto.punto_expedicion.codigo}</dd></div>
          <div className="detail-item"><dt>Actividad</dt><dd>{value.contexto.actividad.codigo}</dd></div>
          <div className="detail-item"><dt>Perfil</dt><dd className="monospace">{value.contexto.perfil_emision.codigo}</dd></div>
        </dl>
      ) : null}
    </>
  );
}

// ─── UserDetailView ───────────────────────────────────────────────────────────

function UserDetailView({ userId, onNavigate }: { userId: string; onNavigate: (v: AppView) => void }) {
  const [user, setUser] = useState<BackofficeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<BackofficeUser["role"]>("OPERADOR_FACTURACION");
  const [activo, setActivo] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [configMode, setConfigMode] = useState(false);

  // Cascading selection state — reemplaza los 7 campos de texto libre
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [configTenantId, setConfigTenantId] = useState("");
  const [facturadores, setFacturadores] = useState<Facturador[]>([]);
  const [loadingFacturadores, setLoadingFacturadores] = useState(false);
  const [configFacturadorId, setConfigFacturadorId] = useState("");
  const [contextos, setContextos] = useState<Contexto[]>([]);
  const [loadingContextos, setLoadingContextos] = useState(false);
  const [configContextoId, setConfigContextoId] = useState("");

  const [configSaving, setConfigSaving] = useState(false);

  // Carga inicial del usuario y de todos los tenants
  useEffect(() => {
    void load();
    void listTenants().then(setTenants).catch(() => { /* noop */ });
  }, [userId]);

  // Tenant seleccionado → carga facturadores, resetea selección inferior
  useEffect(() => {
    if (!configTenantId) { setFacturadores([]); setConfigFacturadorId(""); return; }
    setLoadingFacturadores(true);
    listFacturadores(configTenantId)
      .then(setFacturadores)
      .catch(() => setError("Error cargando facturadores."))
      .finally(() => setLoadingFacturadores(false));
  }, [configTenantId]);

  // Facturador seleccionado → carga contextos, resetea selección inferior
  useEffect(() => {
    if (!configFacturadorId) { setContextos([]); setConfigContextoId(""); return; }
    setLoadingContextos(true);
    listContextos(configFacturadorId)
      .then(setContextos)
      .catch(() => setError("Error cargando contextos."))
      .finally(() => setLoadingContextos(false));
  }, [configFacturadorId]);

  // Cuando los contextos cargan, intenta auto-seleccionar si hay config existente
  useEffect(() => {
    if (!contextos.length || configContextoId) return;
    const cfg = user?.operation_config;
    if (!cfg || cfg.facturador_id !== configFacturadorId) return;
    const match = contextos.find(
      (c) =>
        c.establecimiento.codigo === cfg.establecimiento &&
        c.punto_expedicion.codigo === cfg.punto_expedicion &&
        c.perfil_emision.codigo === cfg.perfil_emision_codigo &&
        c.actividad.codigo === cfg.actividad_economica_codigo
    );
    if (match) setConfigContextoId(match.id);
  }, [contextos, user, configFacturadorId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const u = await getUser(userId);
      setUser(u);
      setDisplayName(u.display_name ?? "");
      setRole(u.role);
      setActivo(u.active);
      if (u.operation_config) {
        setConfigTenantId(u.operation_config.tenant_id);
        setConfigFacturadorId(u.operation_config.facturador_id);
        // configContextoId se auto-selecciona vía el useEffect de contextos
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error cargando usuario.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateUser(userId, { display_name: displayName || null, role, activo });
      setUser(updated);
      setEditMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error actualizando usuario.");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword() {
    setResetting(true);
    setError(null);
    try {
      const updated = await resetPassword(userId, {});
      setUser(updated);
      setNewPassword(updated.temporary_password ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error reseteando contrasena.");
    } finally {
      setResetting(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Eliminar este usuario? Esta accion es irreversible.")) return;
    setDeleting(true);
    try {
      await deleteUser(userId);
      onNavigate({ tag: "usuarios-list" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error eliminando usuario.");
      setDeleting(false);
    }
  }

  async function saveConfig(e: FormEvent) {
    e.preventDefault();
    const facturador = facturadores.find((f) => f.id === configFacturadorId);
    const contexto = contextos.find((c) => c.id === configContextoId);
    if (!facturador || !contexto) return;
    setConfigSaving(true);
    setError(null);
    try {
      await assignOperationConfig(userId, {
        tenant_id: configTenantId,
        facturador_id: facturador.id,
        emisor_id: facturador.emisor_id,
        establecimiento: contexto.establecimiento.codigo,
        punto_expedicion: contexto.punto_expedicion.codigo,
        perfil_emision_codigo: contexto.perfil_emision.codigo,
        actividad_economica_codigo: contexto.actividad.codigo,
      });
      setConfigMode(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error asignando configuracion operativa.");
    } finally {
      setConfigSaving(false);
    }
  }

  const canSubmitConfig = !!configTenantId && !!configFacturadorId && !!configContextoId;

  if (loading) return <div className="empty-state">Cargando...</div>;
  if (error && !user) return <div className="error-msg">{error}</div>;
  if (!user) return null;

  return (
    <>
      <div className="panel-header">
        <h1>{user.display_name ?? user.username} <Badge value={user.active} /></h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={() => setEditMode(!editMode)} type="button">{editMode ? "Cancelar" : "Editar"}</button>
          <button className="btn btn-danger" disabled={deleting} onClick={() => void handleDelete()} type="button">
            {deleting ? "Eliminando..." : "Eliminar"}
          </button>
        </div>
      </div>

      {error ? <div className="error-msg">{error}</div> : null}

      <div className="panel">
        {editMode ? (
          <div className="form">
            <div className="form-row">
              <FormField label="Nombre visible">
                <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
              </FormField>
              <FormField label="Rol">
                <select value={role} onChange={(e) => setRole(e.target.value as BackofficeUser["role"])}>
                  <option value="OPERADOR_FACTURACION">Operador</option>
                  <option value="SOPORTE_INTERNO">Soporte interno</option>
                  <option value="ADMIN_INTERNO">Admin interno</option>
                </select>
              </FormField>
            </div>
            <FormField label="Estado">
              <select value={activo ? "true" : "false"} onChange={(e) => setActivo(e.target.value === "true")}>
                <option value="true">Activo</option>
                <option value="false">Inactivo</option>
              </select>
            </FormField>
            <div className="form-actions">
              <button className="btn btn-primary" disabled={saving} onClick={() => void save()} type="button">{saving ? "Guardando..." : "Guardar"}</button>
            </div>
          </div>
        ) : (
          <dl className="detail-grid">
            <div className="detail-item"><dt>Username</dt><dd className="monospace">{user.username}</dd></div>
            <div className="detail-item"><dt>Nombre visible</dt><dd>{user.display_name ?? "-"}</dd></div>
            <div className="detail-item"><dt>Rol</dt><dd>{formatRole(user.role)}</dd></div>
            <div className="detail-item"><dt>ID</dt><dd className="monospace" style={{ fontSize: 11 }}>{user.id}</dd></div>
          </dl>
        )}
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Contrasena</h2>
        </div>
        {newPassword ? <CopyableSecret label="Nueva contrasena temporal" value={newPassword} /> : null}
        <button className="btn" disabled={resetting} onClick={() => void handleResetPassword()} type="button">
          {resetting ? "Reseteando..." : "Resetear contrasena"}
        </button>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Configuracion operativa</h2>
          <button className="btn" onClick={() => setConfigMode(!configMode)} type="button">
            {configMode ? "Cancelar" : (user.operation_config ? "Editar" : "Asignar")}
          </button>
        </div>

        {!configMode && !user.operation_config ? (
          <div className="empty-state">Sin configuracion operativa asignada.</div>
        ) : null}

        {!configMode && user.operation_config ? (
          <dl className="detail-grid">
            <div className="detail-item"><dt>Tenant ID</dt><dd className="monospace" style={{ fontSize: 11 }}>{user.operation_config.tenant_id}</dd></div>
            <div className="detail-item"><dt>Facturador ID</dt><dd className="monospace" style={{ fontSize: 11 }}>{user.operation_config.facturador_id}</dd></div>
            <div className="detail-item"><dt>Emisor ID</dt><dd className="monospace">{user.operation_config.emisor_id}</dd></div>
            <div className="detail-item"><dt>Establecimiento</dt><dd>{user.operation_config.establecimiento}</dd></div>
            <div className="detail-item"><dt>Punto expedicion</dt><dd>{user.operation_config.punto_expedicion}</dd></div>
            <div className="detail-item"><dt>Perfil emision</dt><dd>{user.operation_config.perfil_emision_codigo}</dd></div>
            <div className="detail-item"><dt>Actividad economica</dt><dd>{user.operation_config.actividad_economica_codigo}</dd></div>
          </dl>
        ) : null}

        {configMode ? (
          <form className="form" onSubmit={(e) => void saveConfig(e)}>
            {/* Paso 1: Tenant */}
            <FormField label="Tenant" required>
              <select
                value={configTenantId}
                onChange={(e) => { setConfigTenantId(e.target.value); setConfigFacturadorId(""); setConfigContextoId(""); }}
                required
              >
                <option value="">Seleccionar tenant...</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>{t.nombre} ({t.slug})</option>
                ))}
              </select>
            </FormField>

            {/* Paso 2: Facturador — carga cuando hay tenant */}
            <FormField label="Facturador" required>
              <select
                value={configFacturadorId}
                onChange={(e) => { setConfigFacturadorId(e.target.value); setConfigContextoId(""); }}
                disabled={!configTenantId || loadingFacturadores}
                required
              >
                <option value="">
                  {!configTenantId ? "Seleccionar tenant primero..." : loadingFacturadores ? "Cargando..." : "Seleccionar facturador..."}
                </option>
                {facturadores.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.razon_social} — {f.emisor_id}
                  </option>
                ))}
              </select>
            </FormField>

            {/* Paso 3: Contexto — carga cuando hay facturador */}
            <FormField label="Contexto operativo" required>
              <select
                value={configContextoId}
                onChange={(e) => setConfigContextoId(e.target.value)}
                disabled={!configFacturadorId || loadingContextos}
                required
              >
                <option value="">
                  {!configFacturadorId ? "Seleccionar facturador primero..." : loadingContextos ? "Cargando..." : "Seleccionar contexto..."}
                </option>
                {contextos.map((c) => (
                  <option key={c.id} value={c.id}>{contextoLabel(c)}</option>
                ))}
              </select>
            </FormField>

            {/* Resumen de los valores que se enviarán, solo informativo */}
            {configContextoId && (() => {
              const f = facturadores.find((x) => x.id === configFacturadorId);
              const c = contextos.find((x) => x.id === configContextoId);
              if (!f || !c) return null;
              return (
                <dl className="detail-grid" style={{ marginTop: 8, opacity: 0.75 }}>
                  <div className="detail-item"><dt>Emisor ID</dt><dd className="monospace">{f.emisor_id}</dd></div>
                  <div className="detail-item"><dt>Establecimiento</dt><dd>{c.establecimiento.codigo}</dd></div>
                  <div className="detail-item"><dt>Punto</dt><dd>{c.punto_expedicion.codigo}</dd></div>
                  <div className="detail-item"><dt>Perfil</dt><dd>{c.perfil_emision.codigo}</dd></div>
                  <div className="detail-item"><dt>Actividad</dt><dd>{c.actividad.codigo}</dd></div>
                </dl>
              );
            })()}

            <div className="form-actions">
              <button className="btn btn-primary" disabled={configSaving || !canSubmitConfig} type="submit">
                {configSaving ? "Guardando..." : "Guardar configuracion"}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </>
  );
}

// ─── Mount ────────────────────────────────────────────────────────────────────

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
