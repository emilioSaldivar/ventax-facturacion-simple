import React from "react";

type NavSection = "tenants" | "usuarios";

interface LayoutProps {
  username: string;
  role: string;
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
  onLogout: () => void;
  breadcrumb?: Array<{ label: string; onClick?: () => void }>;
  children: React.ReactNode;
}

export function Layout({ username, role, activeSection, onNavigate, onLogout, breadcrumb, children }: LayoutProps) {
  return (
    <div className="app-layout">
      <aside className="sidebar" aria-label="Navegacion">
        <div className="sidebar-brand">
          <div className="brand-label">Ventax</div>
          <div className="brand-name">Backoffice</div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-title">Entidades</div>
          <button
            className={`nav-item${activeSection === "tenants" ? " active" : ""}`}
            onClick={() => onNavigate("tenants")}
            type="button"
          >
            Tenants y Facturadores
          </button>

          <div className="nav-section-title">Administracion</div>
          <button
            className={`nav-item${activeSection === "usuarios" ? " active" : ""}`}
            onClick={() => onNavigate("usuarios")}
            type="button"
          >
            Usuarios
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <strong>{username}</strong>
            <br />
            <span style={{ fontSize: 11 }}>{role}</span>
          </div>
          <button className="btn btn-ghost btn-sm btn-wide" onClick={onLogout} type="button">
            Salir
          </button>
        </div>
      </aside>

      <div className="main-content">
        {breadcrumb && breadcrumb.length > 0 ? (
          <div className="topbar">
            <nav className="breadcrumb" aria-label="Ubicacion">
              {breadcrumb.map((crumb, i) => (
                <React.Fragment key={i}>
                  {i > 0 ? <span className="bc-sep" aria-hidden="true">/</span> : null}
                  <button
                    className={`bc-btn${i === breadcrumb.length - 1 ? " current" : ""}`}
                    onClick={crumb.onClick}
                    type="button"
                    disabled={!crumb.onClick || i === breadcrumb.length - 1}
                  >
                    {crumb.label}
                  </button>
                </React.Fragment>
              ))}
            </nav>
          </div>
        ) : null}

        <div className="page-content">{children}</div>
      </div>
    </div>
  );
}
