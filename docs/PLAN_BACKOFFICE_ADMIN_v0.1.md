# PLAN_BACKOFFICE_ADMIN_v0.1

**Versión:** 0.1
**Fecha:** 2026-06-07
**Estado:** DRAFT

---

## 1. Decisiones de Diseño

### D-1: Auth — reutilizar el endpoint existente, token separado en localStorage

El backoffice usa `POST /api/v1/auth/login` sin cambios. No se crea un endpoint de login separado. La diferencia con `web-operacion`:
- El access token se guarda en `localStorage` con clave `ventax_backoffice_access_token` (distinta de la de web-operacion).
- El refresh cookie comparte path `/api/v1/auth` en el mismo dominio, lo cual es aceptable para MVP — el rol embebido en el JWT determina el acceso a cada router.
- `requireBackofficeRole` ya existe y protege todos los endpoints `/backoffice/*` para `SOPORTE_INTERNO` / `ADMIN_INTERNO`.

### D-2: Frontend — router por estado React, sin dependencia externa

Siguiendo el patrón de `web-operacion` (sin react-router, sin librerías de UI), el backoffice implementa un router por unión discriminada de estado:

```typescript
type View =
  | { name: "login" }
  | { name: "dashboard" }
  | { name: "tenants-list" }
  | { name: "tenant-detail"; tenantId: string }
  | { name: "facturador-create"; tenantId: string }
  | { name: "facturador-detail"; facturadorId: string }
  | { name: "establecimiento-create"; facturadorId: string }
  | { name: "establecimiento-detail"; establecimientoId: string }
  | { name: "punto-create"; establecimientoId: string; facturadorId: string }
  | { name: "punto-detail"; puntoId: string }
  | { name: "actividad-create"; facturadorId: string }
  | { name: "actividad-detail"; actividadId: string }
  | { name: "perfil-create"; facturadorId: string }
  | { name: "perfil-detail"; perfilId: string }
  | { name: "contexto-create"; facturadorId: string }
  | { name: "contexto-detail"; contextoId: string }
  | { name: "users-list" }
  | { name: "user-detail"; userId: string }
  | { name: "user-create" };
```

### D-3: Backend — extender el módulo `backoffice` existente

No se crean nuevos módulos. Se extiende el módulo `backoffice` existente:
- `backoffice.types.ts` — nuevos tipos e inputs.
- `backoffice.repository.ts` — nuevos métodos en `PgBackofficeRepository`, extender `BackofficeRepository` interface.
- `backoffice.service.ts` — nuevas funciones de servicio.
- `backoffice.routes.ts` — nuevos endpoints con schemas Zod.

### D-4: Creación de tenant — transacción atómica tenant + suscripción

Igual que en `alta_facturador.sql`: `INSERT tenants` + `INSERT tenant_suscripciones` en una transacción. Si falla cualquiera, rollback completo.

### D-5: Validación de contexto operativo — cross-entity antes de INSERT

Antes de insertar en `actividad_punto_perfiles`, verificar que todos los IDs referenciados pertenezcan al mismo `facturador_id` mediante una query de resolución. Si la resolución devuelve null → `HttpError(400)`.

### D-6: Readiness — consulta en tiempo real sin caché

El endpoint `/backoffice/facturadores/:facturadorId/readiness` ejecuta las queries de estado en paralelo (`Promise.all`) y llama a `gateway.health()`. Sin caching. Tiempo de respuesta esperado < 1s en condiciones normales.

### D-7: Estructura de archivos del frontend backoffice

```
apps/backoffice/src/
  main.tsx                   ← App root, router de estado, auth state
  styles.css                 ← CSS global (variables + componentes)
  api/
    client.ts                ← fetch wrapper con Authorization header y manejo de errores
    tenants.ts
    facturadores.ts
    establecimientos.ts
    puntos.ts
    actividades.ts
    perfiles.ts
    contextos.ts
    users.ts
  components/
    Layout.tsx               ← Shell con nav + breadcrumb + logout
    FormField.tsx            ← label + input/select + mensaje de error
    StatusBadge.tsx          ← badge ACTIVO/INACTIVO/SUSPENDIDO
    CopyableSecret.tsx       ← muestra temporary_password con botón copiar
    ReadinessCheck.tsx       ← lista de checks con íconos
  views/
    LoginView.tsx
    DashboardView.tsx
    tenants/
      TenantsListView.tsx
      TenantDetailView.tsx
      TenantCreateView.tsx
    facturadores/
      FacturadorCreateView.tsx
      FacturadorDetailView.tsx
      FacturadorReadinessView.tsx
    establecimientos/
      EstablecimientoCreateView.tsx
      EstablecimientoDetailView.tsx
    puntos/
      PuntoCreateView.tsx
      PuntoDetailView.tsx
    actividades/
      ActividadCreateView.tsx
      ActividadDetailView.tsx
    perfiles/
      PerfilCreateView.tsx
      PerfilDetailView.tsx
    contextos/
      ContextoCreateView.tsx
      ContextoDetailView.tsx
    users/
      UsersListView.tsx
      UserCreateView.tsx
      UserDetailView.tsx
```

---

## 2. Orden de Implementación

```
Bloque A — Backend: types + contratos de repositorio
Bloque B — Backend: repository tenant + facturador + readiness DB queries
Bloque C — Backend: repository establecimiento + punto
Bloque D — Backend: repository actividad + perfil + contexto
Bloque E — Backend: repository usuarios (extender)
Bloque F — Backend: service layer (todas las entidades)
Bloque G — Backend: routes (todos los endpoints)
Bloque H — Frontend: API client + auth + layout + estilos base
Bloque I — Frontend: tenants (list + create + detail)
Bloque J — Frontend: facturador (create + detail + readiness)
Bloque K — Frontend: establecimiento + punto (create + detail)
Bloque L — Frontend: actividad + perfil + contexto (create + detail)
Bloque M — Frontend: usuarios (list + create + detail)
Bloque N — Validación integrada end-to-end
```

Los bloques A→G pueden implementarse de forma secuencial. Los bloques H→M pueden avanzar en paralelo con G una vez que los tipos estén definidos. El bloque N es el último paso.

---

## 3. Diseño de la API Client en el Frontend

```typescript
// apps/backoffice/src/api/client.ts
const ACCESS_TOKEN_KEY = "ventax_backoffice_access_token";
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

type ApiError = { code: string; message: string; details?: unknown };

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers
    }
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err: ApiError = { code: body.code ?? "UNKNOWN", message: body.message ?? "Error inesperado." };
    if (res.status === 401) window.dispatchEvent(new Event("backoffice:unauthorized"));
    throw err;
  }
  return res.json() as Promise<T>;
}

export const apiGet    = <T>(path: string)                       => apiFetch<T>(path);
export const apiPost   = <T>(path: string, body: unknown)        => apiFetch<T>(path, { method: "POST", body: JSON.stringify(body) });
export const apiPatch  = <T>(path: string, body: unknown)        => apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const apiDelete = (path: string)                          => apiFetch<void>(path, { method: "DELETE" });
export const apiPut    = <T>(path: string, body: unknown)        => apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body) });
```

El evento `backoffice:unauthorized` es escuchado en `main.tsx` para forzar logout y redirigir al login.

---

## 4. CSS — Variables y Componentes Base

El CSS sigue la paleta existente en `entrega.service.ts` (colores Ventax) y no añade dependencias externas:

```css
:root {
  --color-bg: #f4f8fa;
  --color-surface: #ffffff;
  --color-border: #d7e5ea;
  --color-primary: #07a7e1;
  --color-primary-dark: #006b86;
  --color-text: #18242a;
  --color-muted: #65747b;
  --color-success-bg: #e7f7ef;
  --color-success-text: #087f5b;
  --color-warning-bg: #fff1e8;
  --color-warning-text: #9a3412;
  --color-danger: #dc2626;
  --radius: 8px;
  --font: Inter, ui-sans-serif, system-ui, sans-serif;
}
```

Viewport objetivo: tablet (1024px) y desktop (1280px). El backoffice no es mobile-first.

---

## 5. Convenciones de Routes Backend

Todos los routes requieren `requireBackofficeRole`. Los DELETE además requieren `requireAdminRole` (nuevo middleware, variante que solo acepta `ADMIN_INTERNO`).

Schemas Zod para params UUID:
```typescript
const uuidParam = z.object({ id: z.string().uuid() });
const tenantIdParam = z.object({ tenantId: z.string().uuid() });
// etc.
```

Paginación estándar en listados:
```typescript
const paginationSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
});
```

---

## 6. Riesgos y Mitigaciones

| Riesgo | Mitigación |
|---|---|
| `slug` duplicado al crear tenant | `23505` capturado en repository → `HttpError(409, "CONFLICT", "Slug ya existe.")` |
| `emisor_id` duplicado en tenant | `23505` capturado → `HttpError(409, "CONFLICT", "Emisor ya existe en este tenant.")` |
| Contexto con IDs de facturadores diferentes | Query de resolución previa al INSERT; si no resuelve → `HttpError(400)` |
| `temporary_password` vista solo una vez | El frontend tiene `CopyableSecret` que persiste en pantalla hasta que el usuario navega explícitamente |
| Recargar el frontend pierde el contexto de navegación | Aceptado para MVP; el localStorage mantiene el token, la vista vuelve al dashboard |
| gateway.health() lento bloquea readiness | Timeout de 5s en la llamada al gateway; si falla → `fiscal_backend_available: false`, no 502 |
| El backoffice y web-operacion comparten el mismo refresh cookie | Aceptable para MVP: el rol en el JWT impide que un operador acceda a endpoints de backoffice |
