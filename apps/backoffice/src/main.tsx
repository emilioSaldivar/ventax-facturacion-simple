import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function App() {
  return (
    <main className="app-shell">
      <section className="status-panel">
        <p className="eyebrow">Ventax Backoffice</p>
        <h1>Base interna preparada</h1>
        <p>La UI interna queda separada de la operacion para configurar usuarios y contexto fiscal en fases posteriores.</p>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

