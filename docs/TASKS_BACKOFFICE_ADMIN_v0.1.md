# TASKS_BACKOFFICE_ADMIN_v0.1

**Versión:** 0.1
**Fecha:** 2026-06-07
**Estado:** PENDIENTE

---

## Bloque A — Backend: Types y contratos de repositorio

### A-1 Nuevos tipos de respuesta en `backoffice.types.ts`

Agregar:
- `BackofficeTenantResponse` — id, nombre, slug, estado, activo, suscripcion (id, plan_codigo, plan_nombre, estado, fecha_inicio, fecha_fin|null).
- `BackofficeFacturadorResponse` — id, tenant_id, emisor_id, ruc, razon_social, nombre_fantasia, activo.
- `BackofficeEstablecimientoResponse` — id, facturador_id, tenant_id, codigo, nombre, direccion|null, activo.
- `BackofficePuntoResponse` — id, establecimiento_id, facturador_id, tenant_id, codigo, nombre|null, activo.
- `BackofficeActividadResponse` — id, facturador_id, tenant_id, codigo, descripcion|null, alias_operativo|null, activo.
- `BackofficePerfilResponse` — id, facturador_id, tenant_id, codigo, descripcion|null, activo.
- `BackofficeContextoResponse` — id, facturador_id, actividad, establecimiento, punto_expedicion, perfil_emision (con id+codigo+descripcion cada uno), timbrado|null, timbrado_inicio|null, documento_nro|null, credito_plazo_dias, alias_operativo|null, activo.
- `BackofficeUserDetailResponse` — extiende `BackofficeUserResponse` con `operation_config?: BackofficeOperationConfigResponse | null`.
- `BackofficeReadinessResponse` — facturador_id, checks (tenant_activo, suscripcion_activa, facturador_activo, contextos_activos: number, usuarios_operativos: number, fiscal_backend_available), ready: boolean.

### A-2 Nuevos inputs en `backoffice.types.ts`

Agregar:
- `BackofficeTenantCreateInput` — nombre, slug, plan_codigo.
- `BackofficeTenantUpdateInput` — nombre?, estado?.
- `BackofficeFacturadorCreateInput` — emisor_id, ruc, razon_social, nombre_fantasia?.
- `BackofficeFacturadorUpdateInput` — razon_social?, ruc?, nombre_fantasia?, activo?.
- `BackofficeEstablecimientoCreateInput` — codigo, nombre, direccion?.
- `BackofficeEstablecimientoUpdateInput` — nombre?, direccion?, activo?.
- `BackofficePuntoCreateInput` — codigo, nombre?.
- `BackofficePuntoUpdateInput` — nombre?, activo?.
- `BackofficeActividadCreateInput` — codigo, descripcion?, alias_operativo?.
- `BackofficeActividadUpdateInput` — descripcion?, alias_operativo?, activo?.
- `BackofficePerfilCreateInput` — codigo, descripcion?.
- `BackofficePerfilUpdateInput` — descripcion?, activo?.
- `BackofficeContextoCreateInput` — actividad_id, establecimiento_id, punto_expedicion_id, perfil_emision_id, timbrado?, timbrado_inicio?, documento_nro?, credito_plazo_dias?, alias_operativo?.
- `BackofficeContextoUpdateInput` — timbrado?, timbrado_inicio?, documento_nro?, credito_plazo_dias?, alias_operativo?, activo?.
- `BackofficeUserUpdateInput` — display_name?, role?, activo?.
- `BackofficeUserListQuery` — tenant_id?, facturador_id?, role?, limit?, offset?.
- `BackofficeTenantListQuery` — q?, limit?, offset?.

### A-3 Extender `BackofficeRepository` interface

Agregar firmas de método para todas las operaciones nuevas (ver Bloques B–E).

**Validación:** `npm run typecheck` en `apps/api` pasa sin errores. No requiere deploy.

---

## Bloque B — Backend: Repository — Tenant + Facturador + Readiness

### B-1 `PgBackofficeRepository.createTenant`

```sql
BEGIN;
  INSERT INTO tenants (nombre, slug, estado, activo)
  VALUES ($nombre, $slug, 'ACTIVO', true)
  ON CONFLICT (slug) WHERE deleted_at IS NULL → 409;
  -- Resuelve plan_id desde plan_codigo
  INSERT INTO tenant_suscripciones (tenant_id, plan_id, estado, activo)
  SELECT t.id, p.id, 'ACTIVA', true ...
COMMIT;
```
- Plan no encontrado → `HttpError(400, "VALIDATION_ERROR", "Plan no encontrado.")`.
- Slug duplicado → `HttpError(409, "CONFLICT", "Slug ya existe.")`.
- Devuelve `BackofficeTenantResponse`.

### B-2 `PgBackofficeRepository.listTenants`

- SELECT con LEFT JOIN a `tenant_suscripciones` (activa).
- Filtro `q` → ILIKE `%q%` en nombre o slug.
- Paginación con `limit` / `offset`.
- Devuelve array `BackofficeTenantResponse[]`.

### B-3 `PgBackofficeRepository.getTenant`

- SELECT por `id` con suscripción activa.
- Devuelve `BackofficeTenantResponse | null`.

### B-4 `PgBackofficeRepository.updateTenant`

- UPDATE parcial `nombre`, `estado` en `tenants`.
- Devuelve `BackofficeTenantResponse | null`.

### B-5 `PgBackofficeRepository.createFacturador`

- INSERT en `facturadores` con `tenant_id`.
- 23505 → `HttpError(409, "CONFLICT", "Emisor ya existe en este tenant.")`.
- Devuelve `BackofficeFacturadorResponse`.

### B-6 `PgBackofficeRepository.listFacturadores`

- SELECT por `tenant_id` (incluyendo inactivos).
- Devuelve `BackofficeFacturadorResponse[]`.

### B-7 `PgBackofficeRepository.getFacturador`

- SELECT por `id`.
- Devuelve `BackofficeFacturadorResponse | null`.

### B-8 `PgBackofficeRepository.updateFacturador`

- UPDATE parcial `razon_social`, `ruc`, `nombre_fantasia`, `activo`.
- Devuelve `BackofficeFacturadorResponse | null`.

### B-9 `PgBackofficeRepository.getReadinessData`

- Query que devuelve: `tenant_activo`, `suscripcion_activa`, `facturador_activo`, `contextos_activos` (count), `usuarios_operativos` (count).
- Puede ser un único SELECT con CTEs o queries separadas en `Promise.all`.
- Devuelve `{ tenant_activo: boolean, suscripcion_activa: boolean, facturador_activo: boolean, contextos_activos: number, usuarios_operativos: number } | null` (null si el facturador no existe).

**Validación:** `npm run typecheck` pasa. Tests unitarios del repository con `FakeBackofficeRepository` para createTenant y createFacturador.

---

## Bloque C — Backend: Repository — Establecimiento + Punto

### C-1 `PgBackofficeRepository.createEstablecimiento`

- Resuelve `tenant_id` desde el `facturador_id`.
- INSERT en `facturador_establecimientos`.
- 23505 → `HttpError(409, "CONFLICT", "Código de establecimiento ya existe.")`.
- Devuelve `BackofficeEstablecimientoResponse`.

### C-2 `PgBackofficeRepository.listEstablecimientos`

- SELECT por `facturador_id`.
- Devuelve `BackofficeEstablecimientoResponse[]`.

### C-3 `PgBackofficeRepository.getEstablecimiento`

- SELECT por `id`.
- Devuelve `BackofficeEstablecimientoResponse | null`.

### C-4 `PgBackofficeRepository.updateEstablecimiento`

- UPDATE parcial `nombre`, `direccion`, `activo`.
- Devuelve `BackofficeEstablecimientoResponse | null`.

### C-5 `PgBackofficeRepository.createPunto`

- Resuelve `facturador_id` y `tenant_id` desde el establecimiento padre.
- INSERT en `facturador_puntos_expedicion`.
- 23505 → `HttpError(409, "CONFLICT", "Código de punto ya existe en este establecimiento.")`.
- Devuelve `BackofficePuntoResponse`.

### C-6 `PgBackofficeRepository.listPuntos`

- SELECT por `establecimiento_id`.
- Devuelve `BackofficePuntoResponse[]`.

### C-7 `PgBackofficeRepository.getPunto`

- SELECT por `id`.
- Devuelve `BackofficePuntoResponse | null`.

### C-8 `PgBackofficeRepository.updatePunto`

- UPDATE parcial `nombre`, `activo`.
- Devuelve `BackofficePuntoResponse | null`.

**Validación:** `npm run typecheck` pasa.

---

## Bloque D — Backend: Repository — Actividad + Perfil + Contexto

### D-1 `PgBackofficeRepository.createActividad`

- INSERT en `facturador_actividades`.
- 23505 → `HttpError(409, "CONFLICT", "Código de actividad ya existe.")`.
- Devuelve `BackofficeActividadResponse`.

### D-2 `PgBackofficeRepository.listActividades`

- SELECT por `facturador_id`.
- Devuelve `BackofficeActividadResponse[]`.

### D-3 `PgBackofficeRepository.getActividad`

- SELECT por `id`.
- Devuelve `BackofficeActividadResponse | null`.

### D-4 `PgBackofficeRepository.updateActividad`

- UPDATE parcial `descripcion`, `alias_operativo`, `activo`.
- Devuelve `BackofficeActividadResponse | null`.

### D-5 `PgBackofficeRepository.createPerfil`

- INSERT en `facturador_perfiles_emision`.
- 23505 → `HttpError(409, "CONFLICT", "Código de perfil ya existe.")`.
- Devuelve `BackofficePerfilResponse`.

### D-6 `PgBackofficeRepository.listPerfiles`

- SELECT por `facturador_id`.
- Devuelve `BackofficePerfilResponse[]`.

### D-7 `PgBackofficeRepository.getPerfil`

- SELECT por `id`.
- Devuelve `BackofficePerfilResponse | null`.

### D-8 `PgBackofficeRepository.updatePerfil`

- UPDATE parcial `descripcion`, `activo`.
- Devuelve `BackofficePerfilResponse | null`.

### D-9 `PgBackofficeRepository.createContexto`

- Query de resolución: verifica que `actividad_id`, `establecimiento_id`, `punto_expedicion_id`, `perfil_emision_id` pertenezcan al mismo `facturador_id` que viene por parámetro. Si no resuelve → devuelve `null` (el service lo convierte en 400).
- INSERT en `actividad_punto_perfiles`.
- 23505 → `HttpError(409, "CONFLICT", "Ya existe un contexto con esta combinación.")`.
- Devuelve `BackofficeContextoResponse`.

### D-10 `PgBackofficeRepository.listContextos`

- SELECT por `facturador_id` con JOINs a actividad, establecimiento, punto, perfil.
- Devuelve `BackofficeContextoResponse[]`.

### D-11 `PgBackofficeRepository.getContexto`

- SELECT por `id` con JOINs completos.
- Devuelve `BackofficeContextoResponse | null`.

### D-12 `PgBackofficeRepository.updateContexto`

- UPDATE parcial `timbrado`, `timbrado_inicio`, `documento_nro`, `credito_plazo_dias`, `alias_operativo`, `activo`.
- Devuelve `BackofficeContextoResponse | null`.

**Validación:** `npm run typecheck` pasa. Test unitario de createContexto con referencias cruzadas inválidas → null.

---

## Bloque E — Backend: Repository — Usuarios (extender)

### E-1 `PgBackofficeRepository.listUsers`

- SELECT con LEFT JOIN a `usuario_roles`, `usuario_operacion_config`, `facturadores`.
- Filtros opcionales: `tenant_id`, `facturador_id` (JOIN a config), `role`.
- Paginación `limit` / `offset`.
- Devuelve `BackofficeUserDetailResponse[]` (con `operation_config` si existe).

### E-2 `PgBackofficeRepository.getUserDetail`

- SELECT por `id` con config operativa completa (JOINs a `actividad_punto_perfiles`, `facturador_establecimientos`, `facturador_puntos_expedicion`, `facturador_actividades`, `facturador_perfiles_emision`).
- Devuelve `BackofficeUserDetailResponse | null`.

### E-3 `PgBackofficeRepository.updateUser`

- UPDATE `display_name`, `activo` en `usuarios`.
- Si viene `role`: DELETE de `usuario_roles` donde `usuario_id` + INSERT nuevo rol.
- Devuelve `BackofficeUserDetailResponse | null`.

### E-4 `PgBackofficeRepository.softDeleteUser`

- En transacción:
  1. UPDATE `usuarios` SET `deleted_at = now()`, `activo = false`.
  2. UPDATE `usuario_operacion_config` SET `activo = false`, `deleted_at = now()` WHERE `usuario_id`.
  3. UPDATE `refresh_tokens` SET `revoked_at = now()` WHERE `usuario_id` AND `revoked_at IS NULL`.
- Devuelve `true` si el usuario existía, `false` si no.

**Validación:** `npm run typecheck` pasa.

---

## Bloque F — Backend: Service

### F-1 Servicios de tenant (`backoffice.service.ts`)

- `createTenant(input, repository)`: normaliza slug (`trim().toLowerCase()`), valida regex, llama a `repository.createTenant`. Si null → 500.
- `listTenants(query, repository)`: llama con defaults.
- `getTenant(tenantId, repository)`: si null → `HttpError(404)`.
- `updateTenant(tenantId, input, repository)`: si null → `HttpError(404)`.

### F-2 Servicios de facturador

- `createBackofficeFacturador(tenantId, input, repository)`: normaliza `emisor_id.trim()`.
- `listBackofficeFacturadores(tenantId, repository)`.
- `getBackofficeFacturador(facturadorId, repository)`: si null → 404.
- `updateBackofficeFacturador(facturadorId, input, repository)`: si null → 404.
- `getBackofficeReadiness(facturadorId, repository, gateway)`:
  - Llama `repository.getReadinessData(facturadorId)` en paralelo con `gateway.health()` (con timeout de 5s).
  - Si `getReadinessData` devuelve null → `HttpError(404)`.
  - Si `gateway.health()` lanza → `fiscal_backend_available: false`.
  - Calcula `ready = tenant_activo && suscripcion_activa && facturador_activo && contextos_activos >= 1 && usuarios_operativos >= 1 && fiscal_backend_available`.

### F-3 Servicios de establecimiento + punto

- CRUD estándar por entidad.
- `createBackofficeEstablecimiento(facturadorId, input, repository)`.
- `createBackofficePunto(establecimientoId, input, repository)`.
- Get/Update → 404 si null.

### F-4 Servicios de actividad + perfil + contexto

- CRUD estándar.
- `createBackofficeContexto(facturadorId, input, repository)`: si `repository.createContexto` devuelve null por falla de resolución → `HttpError(400, "VALIDATION_ERROR", "Las referencias no corresponden al mismo facturador.")`.

### F-5 Servicios de usuarios (extender)

- `listBackofficeUsers(query, repository)`.
- `getBackofficeUserDetail(userId, repository)`: si null → 404.
- `updateBackofficeUser(userId, input, repository)`: si null → 404.
- `deleteBackofficeUser(userId, repository)`: si false → `HttpError(404)`.

**Validación:** `npm run test` (agregar tests unitarios con `FakeBackofficeRepository` para: createTenant normalización/validación, createContexto con IDs inválidos, getBackofficeReadiness con gateway que falla).

---

## Bloque G — Backend: Routes

### G-1 Tenants routes

```typescript
GET    /backoffice/tenants
POST   /backoffice/tenants               body: { nombre, slug, plan_codigo }
GET    /backoffice/tenants/:tenantId
PATCH  /backoffice/tenants/:tenantId     body parcial
```

### G-2 Facturadores routes

```typescript
GET    /backoffice/tenants/:tenantId/facturadores
POST   /backoffice/tenants/:tenantId/facturadores
GET    /backoffice/facturadores/:facturadorId
PATCH  /backoffice/facturadores/:facturadorId
GET    /backoffice/facturadores/:facturadorId/readiness
```

Readiness necesita el `fiscalGateway` — importar desde `fiscal-gateway.config.ts` (igual que otros routers que lo usan).

### G-3 Establecimientos routes

```typescript
GET    /backoffice/facturadores/:facturadorId/establecimientos
POST   /backoffice/facturadores/:facturadorId/establecimientos
GET    /backoffice/establecimientos/:id
PATCH  /backoffice/establecimientos/:id
```

### G-4 Puntos routes

```typescript
GET    /backoffice/establecimientos/:establecimientoId/puntos
POST   /backoffice/establecimientos/:establecimientoId/puntos
GET    /backoffice/puntos/:id
PATCH  /backoffice/puntos/:id
```

### G-5 Actividades routes

```typescript
GET    /backoffice/facturadores/:facturadorId/actividades
POST   /backoffice/facturadores/:facturadorId/actividades
GET    /backoffice/actividades/:id
PATCH  /backoffice/actividades/:id
```

### G-6 Perfiles routes

```typescript
GET    /backoffice/facturadores/:facturadorId/perfiles
POST   /backoffice/facturadores/:facturadorId/perfiles
GET    /backoffice/perfiles/:id
PATCH  /backoffice/perfiles/:id
```

### G-7 Contextos routes

```typescript
GET    /backoffice/facturadores/:facturadorId/contextos
POST   /backoffice/facturadores/:facturadorId/contextos
GET    /backoffice/contextos/:id
PATCH  /backoffice/contextos/:id
```

### G-8 Usuarios routes (extender los existentes)

```typescript
GET    /backoffice/users                 query: tenant_id?, facturador_id?, role?, limit?, offset?
GET    /backoffice/users/:userId
PATCH  /backoffice/users/:userId         body parcial
DELETE /backoffice/users/:userId         solo ADMIN_INTERNO
```

### G-9 `requireAdminRole` middleware

Variante de `requireBackofficeRole` que rechaza con 403 si el rol no es `ADMIN_INTERNO`.

**Validación:** `npm run typecheck` + `npm run lint` + `npm run build` en `apps/api` — todos pasan sin errores.

---

## Bloque H — Frontend: API client + auth + layout + estilos

### H-1 `apps/backoffice/src/api/client.ts`

- Fetch wrapper con `Authorization: Bearer` desde localStorage.
- Manejo de errores: extrae `{ code, message }` del body.
- Emite `backoffice:unauthorized` en 401 → escuchado en `main.tsx` para forzar logout.

### H-2 Módulos API por entidad

- `api/tenants.ts`, `api/facturadores.ts`, `api/establecimientos.ts`, `api/puntos.ts`, `api/actividades.ts`, `api/perfiles.ts`, `api/contextos.ts`, `api/users.ts`.
- Cada archivo exporta funciones tipadas que llaman a `apiGet`/`apiPost`/`apiPatch`/`apiDelete`.

### H-3 `main.tsx` — auth state + router de estado

- Lee `localStorage[ACCESS_TOKEN_KEY]` al montar.
- Decodifica el payload del JWT (sin verificar firma — solo para leer `role` y `username`).
- Si no hay token → view `login`.
- Escucha `backoffice:unauthorized` → fuerza logout.
- `navigate(view)` reemplaza el estado de view.

### H-4 `components/Layout.tsx`

- Shell con barra lateral izquierda: enlaces "Tenants", "Usuarios".
- Breadcrumb dinámico según la view activa.
- Header con nombre de usuario + botón logout.
- Responsive: en tablet colapsa la barra lateral.

### H-5 `components/FormField.tsx`

```tsx
interface FormFieldProps {
  label: string;
  error?: string;
  children: React.ReactNode;
}
```
Envuelve `<label>`, el input (pasado como children) y el mensaje de error.

### H-6 `components/CopyableSecret.tsx`

Muestra un valor secreto (temporary_password) en un campo de texto de solo lectura con botón "Copiar al portapapeles". Cambia el botón a "Copiado ✓" por 2 segundos.

### H-7 `styles.css` — variables + componentes base

- Variables CSS de la paleta Ventax.
- Clases: `.panel`, `.form`, `.form-actions`, `.table`, `.btn`, `.btn-primary`, `.btn-danger`, `.btn-secondary`, `.badge`, `.badge-activo`, `.badge-inactivo`, `.breadcrumb`, `.sidebar`, `.layout`.

**Validación:** `npm run typecheck` + `npm run build` en `apps/backoffice` — ambos pasan.

---

## Bloque I — Frontend: Tenants

### I-1 `TenantsListView`

- `useEffect` que llama `listTenants()` al montar.
- Tabla: nombre, slug, estado (badge), suscripcion.estado (badge), botón "Ver".
- Botón "Nuevo tenant" → navega a `tenant-create`.
- Campo de búsqueda `q` que filtra en el listado con debounce de 300ms.

### I-2 `TenantCreateView`

- Campos: nombre (text), slug (text, auto-derivado del nombre con `slugify`, editable), plan_codigo (select de planes — hardcoded `BASICO_MVP` por ahora).
- Submit → `POST /backoffice/tenants` → navega a `tenant-detail`.
- Error inline si slug duplicado (409 → mensaje en formulario).

### I-3 `TenantDetailView`

- Muestra: id, nombre, slug, estado, suscripcion.
- Formulario inline editable: nombre, estado (select ACTIVO/SUSPENDIDO) con botón "Guardar".
- Lista de facturadores del tenant con columnas: emisor_id, razon_social, activo (badge), botón "Ver".
- Botón "Nuevo facturador" → navega a `facturador-create`.

---

## Bloque J — Frontend: Facturador

### J-1 `FacturadorCreateView`

- Campos: emisor_id, ruc, razon_social, nombre_fantasia (opcional).
- Submit → `POST /backoffice/tenants/:tenantId/facturadores` → navega a `facturador-detail`.

### J-2 `FacturadorDetailView`

- Muestra: emisor_id, ruc, razon_social, nombre_fantasia, activo (badge).
- Formulario inline: razon_social, nombre_fantasia, activo (checkbox) con botón "Guardar".
- Cuatro secciones con listas + botón "Agregar" cada una:
  - Establecimientos (codigo, nombre, activo).
  - Actividades (codigo, descripcion, alias_operativo, activo).
  - Perfiles (codigo, descripcion, activo).
  - Contextos operativos (actividad.alias, establecimiento.codigo+punto.codigo, timbrado, documento_nro, activo).
- Botón "Ver Readiness" → navega a `facturador-readiness`.

### J-3 `FacturadorReadinessView`

- Fetch al montar: `GET /backoffice/facturadores/:id/readiness`.
- Muestra checks con íconos ✓/✗ por cada key del objeto `checks`.
- Badge grande LISTO / NO LISTO según `ready`.
- Botón "Verificar de nuevo" (refetch).

---

## Bloque K — Frontend: Establecimiento + Punto

### K-1 `EstablecimientoCreateView`

- Campos: codigo (text, max 3 dígitos), nombre, direccion (opcional).
- Submit → navega a `establecimiento-detail`.

### K-2 `EstablecimientoDetailView`

- Muestra datos del establecimiento.
- Formulario inline: nombre, direccion, activo.
- Lista de puntos (codigo, nombre, activo) con botón "Ver" y "Nuevo punto".

### K-3 `PuntoCreateView`

- Campos: codigo (text, max 3 dígitos), nombre.
- Submit → navega a `punto-detail`.

### K-4 `PuntoDetailView`

- Muestra datos del punto.
- Formulario inline: nombre, activo.

---

## Bloque L — Frontend: Actividad + Perfil + Contexto

### L-1 `ActividadCreateView`

- Campos: codigo, descripcion, alias_operativo.
- Submit → navega a `actividad-detail`.

### L-2 `ActividadDetailView`

- Formulario inline: descripcion, alias_operativo, activo.

### L-3 `PerfilCreateView`

- Campos: codigo, descripcion.
- Submit → navega a `perfil-detail`.

### L-4 `PerfilDetailView`

- Formulario inline: descripcion, activo.

### L-5 `ContextoCreateView`

- Precarga actividades, establecimientos, perfiles del facturador en selects.
- Cuando se selecciona establecimiento → carga puntos del establecimiento.
- Campos adicionales: timbrado, timbrado_inicio (date input), documento_nro, credito_plazo_dias, alias_operativo.
- Submit → navega a `contexto-detail`.

### L-6 `ContextoDetailView`

- Muestra la combinación actividad + establecimiento + punto + perfil (no editables).
- Formulario inline editable: timbrado, timbrado_inicio, documento_nro, credito_plazo_dias, alias_operativo, activo.

---

## Bloque M — Frontend: Usuarios

### M-1 `UsersListView`

- Tabla: username, display_name, role (badge), activo (badge), botón "Ver".
- Filtros: `facturador_id` (select de facturadores) y `role` (select).
- Botón "Nuevo usuario".

### M-2 `UserCreateView`

- Campos: username, display_name, role (select), temporary_password (opcional; si vacío, el backend genera uno).
- Submit → si OK, muestra `CopyableSecret` con la `temporary_password` devuelta.
- Botón "Asignar configuración" → navega al form de operation-config embebido o como paso siguiente.
- Form de operation-config: selects de tenant → facturador → establecimiento → punto → actividad+perfil. Carga dinámica en cascada.
- Submit operation-config → `PUT /backoffice/users/:userId/operation-config`.

### M-3 `UserDetailView`

- Muestra: username, display_name, role, activo.
- Config operativa activa (si existe): facturador.emisor_id, establecimiento, punto, actividad, perfil.
- Formulario inline: display_name, activo.
- Botón "Resetear password" → llama `POST /users/:id/reset-password` → muestra `CopyableSecret`.
- Botón "Reasignar config" → muestra form de operation-config (igual que en UserCreateView).
- Botón "Eliminar" (solo visible si el usuario logueado tiene `ADMIN_INTERNO`) → confirm dialog → `DELETE /backoffice/users/:id`.

---

## Bloque N — Validación Integrada

### N-1 Build y typecheck

```bash
npm run typecheck --workspace=apps/api
npm run typecheck --workspace=apps/backoffice
npm run build     --workspace=apps/backoffice
npm run test      --workspace=apps/api          # incluye backoffice.service.test.ts
```
Todos deben pasar sin errores.

### N-2 Smoke API contra contenedores

```bash
bash scripts/deploy.sh

# Login con usuario soporte interno
TOKEN=$(curl -s -X POST http://localhost/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"soporte","password":"<password>"}' | jq -r .access_token)

# Crear tenant
curl -s -X POST http://localhost/api/v1/backoffice/tenants \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Smoke Test","slug":"smoke-test","plan_codigo":"BASICO_MVP"}' | jq .

# Crear facturador
TENANT_ID=$(...)
curl -s -X POST http://localhost/api/v1/backoffice/tenants/$TENANT_ID/facturadores \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"emisor_id":"99999999-9","ruc":"99999999-9","razon_social":"SMOKE SA"}' | jq .

# Readiness (parcial — sin contextos)
FACT_ID=$(...)
curl -s http://localhost/api/v1/backoffice/facturadores/$FACT_ID/readiness \
  -H "Authorization: Bearer $TOKEN" | jq .

# Verificar que OPERADOR_FACTURACION recibe 403
curl -s http://localhost/api/v1/backoffice/tenants \
  -H "Authorization: Bearer $OPERADOR_TOKEN" | jq .code
# Esperado: "FORBIDDEN"
```

### N-3 Validación visual con Playwright

Escenarios mínimos a cubrir:

1. **Login y acceso:** Login con `SOPORTE_INTERNO` → dashboard visible. Login con `OPERADOR_FACTURACION` → acceso denegado.
2. **Alta completa:** Crear tenant → crear facturador → crear establecimiento → crear punto → crear actividad → crear perfil → crear contexto (con timbrado y documento_nro).
3. **Readiness check:** Después del alta completa → readiness muestra todos los checks en verde excepto `usuarios_operativos` (aún no hay usuario) → crear usuario + asignar config → readiness completamente verde.
4. **Gestión:** Editar nombre_fantasia de un facturador → verificar que el cambio se refleja. Resetear password de un usuario → `CopyableSecret` aparece.
5. **Regresión:** Login como operador en `web-operacion` → flujo de emisión de factura normal → OK sin regresiones.

Viewports: `1280x800` (desktop), `1024x768` (tablet).

Evidencia: screenshot o video de Playwright para cada escenario.

---

## Estado de la Matriz

| Bloque | Estado |
|---|---|
| A — Types + contratos | PENDIENTE |
| B — Repository: tenant + facturador + readiness | PENDIENTE |
| C — Repository: establecimiento + punto | PENDIENTE |
| D — Repository: actividad + perfil + contexto | PENDIENTE |
| E — Repository: usuarios (extender) | PENDIENTE |
| F — Service layer | PENDIENTE |
| G — Routes | PENDIENTE |
| H — Frontend: API client + auth + layout | PENDIENTE |
| I — Frontend: tenants | PENDIENTE |
| J — Frontend: facturador | PENDIENTE |
| K — Frontend: establecimiento + punto | PENDIENTE |
| L — Frontend: actividad + perfil + contexto | PENDIENTE |
| M — Frontend: usuarios | PENDIENTE |
| N — Validación integrada | PENDIENTE |
