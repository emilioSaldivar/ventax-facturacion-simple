// Movido de main.tsx sin cambios (PLAN_UX_RESTO_APP_v0.1 §10.9, URA-023).
import { BrandMark } from "./BrandMark";

export function LoadingScreen({ message }: { message: string }) {
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
