import React, { FormEvent, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

import { apiLogin, ApiError, getToken, setToken } from "./api/client";
import { listTenants, getTenant, createTenant, updateTenant, type Tenant } from "./api/tenants";
import {
  listFacturadores,
  getFacturador,
  createFacturador,
  updateFacturador,
  getFacturadorReadiness,
  setFacturadorApiKey,
  type Facturador,
  type FacturadorReadiness,
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
  | { tag: "usuarios-list" }
  | { tag: "usuario-create" }
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
      ) : view.tag === "usuarios-list" ? (
        <UsersListView onNavigate={navigate} />
      ) : view.tag === "usuario-create" ? (
        <UserCreateView onNavigate={navigate} />
      ) : view.tag === "usuario-detail" ? (
        <UserDetailView userId={view.userId} onNavigate={navigate} />
      ) : null}
    </Layout>
  );
}

function buildBreadcrumb(view: AppView, navigate: (v: AppView) => void): Array<{ label: string; onClick?: () => void }> {
  if (view.tag === "tenants-list") return [{ label: "Tenants" }];
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
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
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
  const [plan, setPlan] = useState("BASICO");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            <select value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="BASICO">BASICO</option>
              <option value="PROFESIONAL">PROFESIONAL</option>
              <option value="ENTERPRISE">ENTERPRISE</option>
            </select>
          </FormField>
          <div className="form-actions">
            <button className="btn btn-primary" disabled={submitting} type="submit">
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
      const updated = await updateTenant(tenantId, { nombre: nombre.trim() || undefined, estado });
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

function UserCreateView({ onNavigate }: { onNavigate: (v: AppView) => void }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState("");
  const [username, setUsername] = useState("");
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
      const u = await createUser({
        tenant_id: tenantId,
        username: username.trim(),
        display_name: displayName.trim() || null,
        role,
        temporary_password: password.trim() || null,
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
            <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} required>
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
          <div className="form-actions">
            <button className="btn btn-primary" disabled={submitting} type="submit">{submitting ? "Creando..." : "Crear usuario"}</button>
            <button className="btn" onClick={() => onNavigate({ tag: "usuarios-list" })} type="button">Cancelar</button>
          </div>
        </form>
      </div>
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
  const [configTenantId, setConfigTenantId] = useState("");
  const [configFacturadorId, setConfigFacturadorId] = useState("");
  const [configEmisorId, setConfigEmisorId] = useState("");
  const [configEst, setConfigEst] = useState("");
  const [configPunto, setConfigPunto] = useState("");
  const [configPerfil, setConfigPerfil] = useState("");
  const [configActividad, setConfigActividad] = useState("");
  const [configSaving, setConfigSaving] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);

  useEffect(() => {
    void load();
    void listTenants().then(setTenants).catch(() => { /* noop */ });
  }, [userId]);

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
        setConfigEmisorId(u.operation_config.emisor_id);
        setConfigEst(u.operation_config.establecimiento);
        setConfigPunto(u.operation_config.punto_expedicion);
        setConfigPerfil(u.operation_config.perfil_emision_codigo);
        setConfigActividad(u.operation_config.actividad_economica_codigo);
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
    setConfigSaving(true);
    setError(null);
    try {
      await assignOperationConfig(userId, {
        tenant_id: configTenantId,
        facturador_id: configFacturadorId,
        emisor_id: configEmisorId,
        establecimiento: configEst,
        punto_expedicion: configPunto,
        perfil_emision_codigo: configPerfil,
        actividad_economica_codigo: configActividad,
      });
      setConfigMode(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error asignando configuracion operativa.");
    } finally {
      setConfigSaving(false);
    }
  }

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
          <button className="btn" onClick={() => setConfigMode(!configMode)} type="button">{configMode ? "Cancelar" : (user.operation_config ? "Editar" : "Asignar")}</button>
        </div>
        {!configMode && !user.operation_config ? (
          <div className="empty-state">Sin configuracion operativa asignada.</div>
        ) : null}
        {!configMode && user.operation_config ? (
          <dl className="detail-grid">
            <div className="detail-item"><dt>Tenant ID</dt><dd className="monospace" style={{ fontSize: 11 }}>{user.operation_config.tenant_id}</dd></div>
            <div className="detail-item"><dt>Facturador ID</dt><dd className="monospace" style={{ fontSize: 11 }}>{user.operation_config.facturador_id}</dd></div>
            <div className="detail-item"><dt>Emisor ID</dt><dd className="monospace" style={{ fontSize: 11 }}>{user.operation_config.emisor_id}</dd></div>
            <div className="detail-item"><dt>Establecimiento</dt><dd>{user.operation_config.establecimiento}</dd></div>
            <div className="detail-item"><dt>Punto expedicion</dt><dd>{user.operation_config.punto_expedicion}</dd></div>
            <div className="detail-item"><dt>Perfil emision</dt><dd>{user.operation_config.perfil_emision_codigo}</dd></div>
            <div className="detail-item"><dt>Actividad economica</dt><dd>{user.operation_config.actividad_economica_codigo}</dd></div>
          </dl>
        ) : null}
        {configMode ? (
          <form className="form" onSubmit={(e) => void saveConfig(e)}>
            <FormField label="Tenant" required>
              <select value={configTenantId} onChange={(e) => setConfigTenantId(e.target.value)} required>
                <option value="">Seleccionar tenant...</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.nombre} ({t.slug})</option>)}
              </select>
            </FormField>
            <FormField label="Facturador ID (UUID)" required>
              <input type="text" value={configFacturadorId} onChange={(e) => setConfigFacturadorId(e.target.value)} required />
            </FormField>
            <FormField label="Emisor ID (UUID del backend fiscal)" required>
              <input type="text" value={configEmisorId} onChange={(e) => setConfigEmisorId(e.target.value)} required />
            </FormField>
            <div className="form-row">
              <FormField label="Establecimiento (codigo, 3 digitos)" required>
                <input type="text" value={configEst} onChange={(e) => setConfigEst(e.target.value)} placeholder="001" required />
              </FormField>
              <FormField label="Punto expedicion (codigo, 3 digitos)" required>
                <input type="text" value={configPunto} onChange={(e) => setConfigPunto(e.target.value)} placeholder="001" required />
              </FormField>
            </div>
            <div className="form-row">
              <FormField label="Perfil emision (codigo)" required>
                <input type="text" value={configPerfil} onChange={(e) => setConfigPerfil(e.target.value)} required />
              </FormField>
              <FormField label="Actividad economica (codigo)" required>
                <input type="text" value={configActividad} onChange={(e) => setConfigActividad(e.target.value)} required />
              </FormField>
            </div>
            <div className="form-actions">
              <button className="btn btn-primary" disabled={configSaving} type="submit">{configSaving ? "Guardando..." : "Guardar configuracion"}</button>
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
