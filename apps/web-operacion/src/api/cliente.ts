// Cliente HTTP de la app del operador. Movido de main.tsx sin cambios (URA-018, PLAN_UX_RESTO_APP_v0.1 §10.4).
import type { ApiErrorResponse, ApiValidationDetails, AuthResponse } from "../tipos";
import { API_BASE_URL } from "./config";
import { checkVersionHeader } from "./version";

// ─── SPEC_MULTIPERFIL_USUARIO_v0.1: perfil de emision por sesion ──────────────
// El cliente HTTP vive en muchos componentes; cuando una renovacion cambia o pide el punto avisa a App por aca.
// SPEC_MULTIPERFIL_USUARIO_v0.2 B.4 (M-1): evento propio, sin valores sinteticos en pending_actions.
export type EventoPerfil = { tipo: "ELEGIR"; respuesta: AuthResponse } | { tipo: "RECARGAR"; respuesta: AuthResponse };

const _perfilListeners: Array<(evento: EventoPerfil) => void> = [];

// RN-14: con pedidos concurrentes todos reciben la misma renovacion; se avisa una sola vez por token.
let _ultimoTokenAvisado: string | null = null;

export function onEventoPerfil(fn: (evento: EventoPerfil) => void): () => void {
  _perfilListeners.push(fn);
  return () => {
    const i = _perfilListeners.indexOf(fn);
    if (i >= 0) _perfilListeners.splice(i, 1);
  };
}

export function emitirEventoPerfil(evento: EventoPerfil): void {
  if (_ultimoTokenAvisado === evento.respuesta.access_token) return;
  _ultimoTokenAvisado = evento.respuesta.access_token;
  for (const fn of [..._perfilListeners]) fn(evento);
}

export function requierePerfil(respuesta: AuthResponse): boolean {
  return respuesta.pending_actions?.includes("SELECT_PERFIL") ?? false;
}

export function motivoDeError(error: unknown): string | null {
  if (!(error instanceof ApiClientError)) return null;
  const details = error.details as { reason?: unknown } | undefined;
  return typeof details?.reason === "string" ? details.reason : null;
}

export function esErrorDePerfil(error: unknown): boolean {
  const motivo = motivoDeError(error);
  return motivo === "PERFIL_REQUERIDO" || motivo === "PERFIL_NO_DISPONIBLE";
}

/** Claims del JWT sin verificarlos: solo para decisiones de la UI (D-8, RN-06). */
export function claimsDeToken(token: string | null): { scope: string | null; uoc: string | null } {
  if (!token) return { scope: null, uoc: null };
  try {
    const payload = JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { scope?: unknown; uoc?: unknown };
    return {
      scope: typeof payload.scope === "string" ? payload.scope : null,
      uoc: typeof payload.uoc === "string" ? payload.uoc : null
    };
  } catch {
    return { scope: null, uoc: null };
  }
}

export function formatValidationDetails(details?: ApiValidationDetails): string {
  if (!details) return "";
  const parts: string[] = [];
  if (details.formErrors?.length) parts.push(...details.formErrors);
  if (details.fieldErrors) {
    for (const [field, msgs] of Object.entries(details.fieldErrors)) {
      if (msgs && msgs.length) parts.push(`${field}: ${msgs.join(", ")}`);
    }
  }
  return parts.join(" | ");
}

export class ApiClientError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.details = details;
  }
}

export function createApiClient(accessToken: string | null, setAccessToken: (token: string | null) => void) {
  /**
   * SPEC_MULTIPERFIL_USUARIO_v0.2 RN-17 (M-7): devuelve la respuesta cruda cuando es exitosa, con la misma
   * renovacion de sesion y el mismo manejo de errores de perfil que `request`. Sirve para descargas.
   */
  async function requestRaw(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers
      }
    });

    checkVersionHeader(response);

    if (response.status === 401 && retry) {
      const refreshed = await refreshSession();
      if (requierePerfil(refreshed)) {
        // SPEC_MULTIPERFIL_USUARIO_v0.1 §B.5: el punto de la sesion ya no esta; App muestra la eleccion.
        emitirEventoPerfil({ tipo: "ELEGIR", respuesta: refreshed });
        throw new ApiClientError(409, "Elegí el punto de expedición para continuar.", { reason: "PERFIL_REQUERIDO" });
      }
      setAccessToken(refreshed.access_token);
      const uocAnterior = claimsDeToken(accessToken).uoc;
      if (uocAnterior && claimsDeToken(refreshed.access_token).uoc !== uocAnterior) {
        // RN-06: el refresh asigno otro punto; no se reintenta el pedido con un punto que no esta en pantalla.
        emitirEventoPerfil({ tipo: "RECARGAR", respuesta: refreshed });
        throw new ApiClientError(409, "Tu punto de expedición cambió. Revisá el punto activo antes de continuar.", { reason: "PERFIL_NO_DISPONIBLE" });
      }
      return createApiClient(refreshed.access_token, setAccessToken).requestRaw(path, init, false);
    }

    if (!response.ok) {
      const copia = response.clone();
      const details = await copia.json().then((body: ApiErrorResponse) => body.error?.details, () => undefined);
      const error = new ApiClientError(response.status, await readApiError(response), details);
      if (response.status === 409 && retry && esErrorDePerfil(error)) {
        // §C.6: perfil no disponible (lo quito el backoffice) o token viejo sin perfil: el refresh decide.
        const refreshed = await refreshSession().catch(() => null);
        if (!refreshed) {
          throw new ApiClientError(401, "Tu punto de expedición cambió. Volvé a entrar.", { reason: "PERFIL_NO_DISPONIBLE" });
        }
        // RN-06: nunca se reintenta el pedido con otro punto. App recarga el contexto (o pide elegir)
        // y el operador ve el punto nuevo antes de volver a emitir.
        emitirEventoPerfil(requierePerfil(refreshed) ? { tipo: "ELEGIR", respuesta: refreshed } : { tipo: "RECARGAR", respuesta: refreshed });
        throw new ApiClientError(409, "Tu punto de expedición cambió. Revisá el punto activo antes de continuar.", { reason: motivoDeError(error) });
      }
      throw error;
    }

    return response;
  }

  async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    const response = await requestRaw(path, init, retry);
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
    request,
    requestRaw
  };
}

let _refreshEnVuelo: Promise<AuthResponse> | null = null;

/**
 * SPEC_MULTIPERFIL_USUARIO_v0.2 RN-14 (F-1): una sola llamada a /auth/refresh por pestaña mientras hay
 * una en curso. El refresh token se rota en cada llamada: dos llamadas con la misma cookie hacen que la
 * segunda falle y mande al login.
 */
export function refreshSession(): Promise<AuthResponse> {
  if (_refreshEnVuelo) return _refreshEnVuelo;
  _refreshEnVuelo = (async () => {
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

    return (await response.json()) as AuthResponse;
  })().finally(() => {
    _refreshEnVuelo = null;
  });
  return _refreshEnVuelo;
}

export async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorResponse;
    const message = body.error?.message ?? body.message ?? "Solicitud rechazada.";
    const detailsText = formatValidationDetails(body.error?.details);
    return detailsText ? `${message} (${detailsText})` : message;
  } catch {
    return "No se pudo completar la solicitud.";
  }
}
