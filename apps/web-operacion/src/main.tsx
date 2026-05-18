import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function App() {
  return (
    <main className="app-shell">
      <section className="status-panel">
        <p className="eyebrow">Ventax Factura</p>
        <h1>Operacion lista para comenzar</h1>
        <p>La app operativa ya esta conectada al workspace. El editor de facturas se implementa en el siguiente bloque de UI.</p>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

