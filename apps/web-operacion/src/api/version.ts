// Aviso de version nueva del servidor (X-App-Version). Movido de main.tsx sin cambios (URA-018).
import { useEffect, useState } from "react";
import { API_BASE_URL, BUILD_VERSION } from "./config";

export let _updatePending = false;

const _updateListeners: Array<() => void> = [];

export function signalUpdatePending(): void {
  if (_updatePending) return;
  _updatePending = true;
  for (const fn of _updateListeners) fn();
}

export function useUpdatePending(): boolean {
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

export function checkVersionHeader(response: Response): void {
  if (BUILD_VERSION === "dev") return;
  const serverVersion = response.headers.get("X-App-Version");
  if (serverVersion && serverVersion !== BUILD_VERSION) {
    signalUpdatePending();
  }
}

export async function pollVersion(): Promise<void> {
  if (BUILD_VERSION === "dev" || _updatePending) return;
  try {
    const res = await fetch(`${API_BASE_URL}/health`, { cache: "no-store" });
    checkVersionHeader(res);
  } catch {
    // red sin conexion — ignorar
  }
}

export async function applyUpdate(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // si falla la limpieza, igual forzamos la recarga
  }
  window.location.reload();
}

export function startVersionPolling(): () => void {
  const INTERVAL_MS = 5 * 60 * 1000; // cada 5 minutos
  void pollVersion();
  const id = window.setInterval(() => void pollVersion(), INTERVAL_MS);
  return () => window.clearInterval(id);
}
