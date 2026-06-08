# SPEC_BACKOFFICE_ADMIN_v0.1

**Versión:** 0.1
**Fecha:** 2026-06-07
**Estado:** DRAFT

---

## 1. Objetivo

Construir un backoffice web interno para administrar tenants, facturadores y usuarios del SaaS, eliminando la dependencia de scripts SQL manuales para el alta, configuración y gestión continua de facturadores operativos.

---

## 2. Contexto y Motivación

El alta de un facturador hoy requiere ejecutar `scripts/sql/alta_facturador.sql` y `scripts/sql/create_usuario.sql` manualmente contra la base de datos. Esto implica:

- Acceso directo a producción con credenciales DB.
- Proceso propenso a errores (valores incorrectos en variables `\set`).
- Sin validaciones de negocio antes de persistir.
- Sin auditoría de quién hizo el alta ni cuándo.
- Cada modificación posterior (cambio de timbrado, nuevo punto, reset de password) también requiere SQL manual.

El backoffice reemplaza todos los scripts SQL con formularios web accesibles a roles internos (`SOPORTE_INTERNO`, `ADMIN_INTERNO`), cubiertos por el mismo sistema de autenticación JWT de la API pero con un login separado del login operativo.

El módulo `backoffice` en la API ya existe con tres endpoints (crear usuario, reset password, asignar config operativa) y el frontend `apps/backoffice` existe como placeholder vacío en puerto 5174. Esta spec define el alcance completo sobre esa base.

---

## 3. Alcance

### Incluido

**Backend (API) — nuevos endpoints REST bajo `/api/v1/backoffice/`:**
- CRUD completo de: tenants (con suscripción), facturadores, establecimientos, puntos de expedición, actividades económicas, perfiles de emisión, contextos operativos (`actividad_punto_perfiles`).
- Extensión de endpoints de usuarios: listado, detalle, actualización de datos/estado, soft-delete.
- Endpoint de readiness check por facturador.

**Frontend (`apps/backoffice`, port 5174):**
- Login propio con pantalla de acceso separada del login operativo (`web-operacion`).
- Navegación por estado React (sin router externo), patrón idéntico al de `web-operacion`.
- Vistas de listado y detalle para cada entidad.
- Formularios de creación y edición por entidad (formularios separados, no wizard).
- Vista de readiness del facturador.
- Vista de gestión de usuarios con reset de password y asignación de config operativa.

### Excluido

- Gestión de planes SaaS (los planes existen en DB; el backoffice los lista en selects pero no los crea ni edita).
- FE API key por facturador — sigue siendo global en `FE_API_KEY` env (Fase 2).
- Flags operativos por facturador (`send_emission_profile_code`, `service_numbering`) — siguen globales en env (Fase 2).
- Auditoría estructurada por cambio (tabla de audit log). Los logs de pino cubren la trazabilidad mínima.
- Permisos granulares por tenant entre usuarios de backoffice — todos los roles backoffice ven todos los tenants.
- Eliminación física (hard delete) de cualquier entidad.
- Pantallas de documentos fiscales, facturas o emision en el backoffice.
- Impersonación de usuarios operativos desde el backoffice.

---

## 4. Actores y Roles

| Actor | Rol | Acceso |
|---|---|---|
| Soporte interno | `SOPORTE_INTERNO` | CRUD completo sobre todas las entidades, excepto soft-delete de usuarios |
| Admin interno | `ADMIN_INTERNO` | Todo lo de soporte + soft-delete de usuarios |

El middleware `requireBackofficeRole` ya existe en `backoffice.routes.ts` y valida que el JWT contenga uno de estos dos roles. Se agrega un middleware adicional `requireAdminRole` para los endpoints de DELETE.

---

## 5. Flujos Principales

### Flujo A — Alta de facturador (formularios por entidad)

La jerarquía de entidades a crear sigue el orden de `alta_facturador.sql`:

```
1. Crear tenant (nombre, slug, plan_codigo)
   → crea también tenant_suscripciones en la misma transacción
2. Crear facturador en el tenant (emisor_id, ruc, razon_social, nombre_fantasia)
3. Crear establecimiento en el facturador (código 001..N, nombre, dirección)
4. Crear punto de expedición en el establecimiento (código 001..N, nombre)
5. Crear actividad económica en el facturador (código SIFEN, descripción, alias_operativo)
6. Crear perfil de emisión en el facturador (código, descripción)
7. Crear contexto operativo: vincula actividad + establecimiento + punto + perfil
   con timbrado, timbrado_inicio, documento_nro, credito_plazo_dias, alias_operativo
```

Cada paso es un formulario independiente. El usuario navega desde el detalle del tenant hacia abajo en la jerarquía.

### Flujo B — Alta de usuario operativo

```
1. Crear usuario (username, display_name, rol, temporary_password opcional)
   → el backend genera password si no se provee
2. El backoffice muestra la temporary_password una sola vez con botón "Copiar"
3. Asignar config operativa al usuario (facturador + establecimiento + punto + actividad + perfil)
4. Entregar credencial temporal al cliente
```

### Flujo C — Gestión continua

- Editar cualquier entidad: nombre, alias, dirección, activo/inactivo.
- Actualizar timbrado y `documento_nro` en un contexto operativo (equivale a `update_timbrado.sql`).
- Agregar un segundo punto de expedición a un establecimiento existente.
- Agregar una segunda actividad o perfil a un facturador existente.
- Resetear password de un usuario → muestra nueva `temporary_password` una sola vez.
- Reasignar config operativa de un usuario a un punto distinto.
- Desactivar un usuario o un facturador.

### Flujo D — Readiness check

Vista por facturador que verifica en tiempo real:
- Tenant activo.
- Suscripción activa.
- Facturador activo.
- Al menos un contexto operativo activo (`actividad_punto_perfiles`).
- Al menos un usuario con config operativa activa vinculada al facturador.
- Backend FE disponible (llamada a `gateway.health()`).

---

## 6. Contratos HTTP

Todos los endpoints requieren `Authorization: Bearer <access_token>` con rol `SOPORTE_INTERNO` o `ADMIN_INTERNO`. Los endpoints `DELETE` requieren adicionalmente `ADMIN_INTERNO`.

### 6.1 Tenants

```
GET    /backoffice/tenants
POST   /backoffice/tenants
GET    /backoffice/tenants/:tenantId
PATCH  /backoffice/tenants/:tenantId
```

**POST /backoffice/tenants — body:**
```json
{
  "nombre": "ACME S.A.",
  "slug": "acme-sa",
  "plan_codigo": "BASICO_MVP"
}
```

**Response (tenant):**
```json
{
  "id": "uuid",
  "nombre": "ACME S.A.",
  "slug": "acme-sa",
  "estado": "ACTIVO",
  "activo": true,
  "suscripcion": {
    "id": "uuid",
    "plan_codigo": "BASICO_MVP",
    "plan_nombre": "Basico MVP",
    "estado": "ACTIVA",
    "fecha_inicio": "2026-06-07",
    "fecha_fin": null
  }
}
```

**GET /backoffice/tenants — query params:** `limit` (default 20), `offset` (default 0), `q` (búsqueda por nombre o slug, ILIKE).

**PATCH /backoffice/tenants/:tenantId — body (parcial):**
```json
{
  "nombre": "ACME NUEVO",
  "estado": "SUSPENDIDO"
}
```

### 6.2 Facturadores

```
GET    /backoffice/tenants/:tenantId/facturadores
POST   /backoffice/tenants/:tenantId/facturadores
GET    /backoffice/facturadores/:facturadorId
PATCH  /backoffice/facturadores/:facturadorId
GET    /backoffice/facturadores/:facturadorId/readiness
```

**POST body:**
```json
{
  "emisor_id": "5057016-1",
  "ruc": "5057016-1",
  "razon_social": "EMILIO MATIAS SALDIVAR CAPUTO",
  "nombre_fantasia": "1811 BRANDING Y SOFTWARE"
}
```

**Response (facturador):**
```json
{
  "id": "uuid",
  "tenant_id": "uuid",
  "emisor_id": "5057016-1",
  "ruc": "5057016-1",
  "razon_social": "EMILIO MATIAS SALDIVAR CAPUTO",
  "nombre_fantasia": "1811 BRANDING Y SOFTWARE",
  "activo": true
}
```

### 6.3 Establecimientos

```
GET    /backoffice/facturadores/:facturadorId/establecimientos
POST   /backoffice/facturadores/:facturadorId/establecimientos
GET    /backoffice/establecimientos/:id
PATCH  /backoffice/establecimientos/:id
```

**POST body:**
```json
{
  "codigo": "001",
  "nombre": "CASA MATRIZ",
  "direccion": "BERNARDINO CABALLERO 112"
}
```

### 6.4 Puntos de Expedición

```
GET    /backoffice/establecimientos/:establecimientoId/puntos
POST   /backoffice/establecimientos/:establecimientoId/puntos
GET    /backoffice/puntos/:id
PATCH  /backoffice/puntos/:id
```

**POST body:**
```json
{
  "codigo": "001",
  "nombre": "TALLER CENTRAL"
}
```

### 6.5 Actividades Económicas

```
GET    /backoffice/facturadores/:facturadorId/actividades
POST   /backoffice/facturadores/:facturadorId/actividades
GET    /backoffice/actividades/:id
PATCH  /backoffice/actividades/:id
```

**POST body:**
```json
{
  "codigo": "45203",
  "descripcion": "TALLERES DE CHAPERIA Y PINTURA",
  "alias_operativo": "CHAPERIA"
}
```

### 6.6 Perfiles de Emisión

```
GET    /backoffice/facturadores/:facturadorId/perfiles
POST   /backoffice/facturadores/:facturadorId/perfiles
GET    /backoffice/perfiles/:id
PATCH  /backoffice/perfiles/:id
```

**POST body:**
```json
{
  "codigo": "AC445203-E001-P001-FE-PTO",
  "descripcion": "Chaperia y pintura - Punto 001"
}
```

### 6.7 Contextos Operativos (actividad_punto_perfiles)

```
GET    /backoffice/facturadores/:facturadorId/contextos
POST   /backoffice/facturadores/:facturadorId/contextos
GET    /backoffice/contextos/:id
PATCH  /backoffice/contextos/:id
```

**POST body:**
```json
{
  "actividad_id": "uuid",
  "establecimiento_id": "uuid",
  "punto_expedicion_id": "uuid",
  "perfil_emision_id": "uuid",
  "timbrado": "05057016",
  "timbrado_inicio": "2026-05-19",
  "documento_nro": "0000009",
  "credito_plazo_dias": 30,
  "alias_operativo": "CHAPERIA"
}
```

**PATCH body (parcial — campos actualizables):**
```json
{
  "timbrado": "05057017",
  "timbrado_inicio": "2026-06-01",
  "documento_nro": "0000001",
  "credito_plazo_dias": 30,
  "alias_operativo": "CHAPERIA NUEVA",
  "activo": true
}
```

**Response (contexto):**
```json
{
  "id": "uuid",
  "facturador_id": "uuid",
  "actividad": { "id": "uuid", "codigo": "45203", "descripcion": "...", "alias_operativo": "CHAPERIA" },
  "establecimiento": { "id": "uuid", "codigo": "001", "nombre": "CASA MATRIZ" },
  "punto_expedicion": { "id": "uuid", "codigo": "001", "nombre": "TALLER CENTRAL" },
  "perfil_emision": { "id": "uuid", "codigo": "AC445203-E001-P001-FE-PTO", "descripcion": "..." },
  "timbrado": "05057016",
  "timbrado_inicio": "2026-05-19",
  "documento_nro": "0000009",
  "credito_plazo_dias": 30,
  "alias_operativo": "CHAPERIA",
  "activo": true
}
```

### 6.8 Usuarios (extensión de los ya existentes)

```
GET    /backoffice/users                         — Lista (filtros: ?tenant_id=, ?facturador_id=, ?role=)
GET    /backoffice/users/:userId                  — Detalle con config operativa
PATCH  /backoffice/users/:userId                  — Actualizar display_name, role, activo
DELETE /backoffice/users/:userId                  — Soft-delete (solo ADMIN_INTERNO)

# Ya existentes:
POST   /backoffice/users
POST   /backoffice/users/:userId/reset-password
PUT    /backoffice/users/:userId/operation-config
```

**GET /backoffice/users — query params:** `tenant_id`, `facturador_id`, `role`, `limit` (default 20), `offset` (default 0).

**Response (usuario detalle):**
```json
{
  "id": "uuid",
  "username": "operador.acme",
  "display_name": "Operador Principal",
  "role": "OPERADOR_FACTURACION",
  "active": true,
  "operation_config": {
    "facturador_id": "uuid",
    "emisor_id": "5057016-1",
    "tenant_id": "uuid",
    "establecimiento": "001",
    "punto_expedicion": "001",
    "perfil_emision_codigo": "AC445203-E001-P001-FE-PTO",
    "actividad_economica_codigo": "45203",
    "active": true
  }
}
```

### 6.9 Readiness

**GET /backoffice/facturadores/:facturadorId/readiness**

```json
{
  "facturador_id": "uuid",
  "checks": {
    "tenant_activo": true,
    "suscripcion_activa": true,
    "facturador_activo": true,
    "contextos_activos": 2,
    "usuarios_operativos": 1,
    "fiscal_backend_available": true
  },
  "ready": true
}
```

`ready = true` cuando todos los checks booleanos son `true` y `contextos_activos >= 1` y `usuarios_operativos >= 1`.

---

## 7. Reglas de Negocio

- `slug` de tenant: solo minúsculas, números y guiones; mínimo 2 caracteres; validado con `^[a-z0-9][a-z0-9-]*[a-z0-9]$`.
- `emisor_id` de facturador: único por tenant (constraint existente en DB).
- `codigo` de establecimiento y punto: exactamente 3 dígitos `^[0-9]{3}$`.
- `documento_nro` en contexto: exactamente 7 dígitos `^[0-9]{7}$`.
- `timbrado`: solo dígitos `^[0-9]+$`.
- `timbrado_inicio`: fecha ISO 8601 (YYYY-MM-DD).
- `credito_plazo_dias`: entero > 0.
- La creación de contexto valida que `actividad_id`, `establecimiento_id`, `punto_expedicion_id` y `perfil_emision_id` pertenezcan todos al mismo `facturador_id`; si no → 400 VALIDATION_ERROR.
- Soft-delete de usuario desactiva su config operativa activa y revoca todos sus refresh tokens.
- Reset de password desbloquea al usuario (anula `bloqueado_at`, resetea `failed_login_count` a 0).
- La `temporary_password` se devuelve en texto plano en el response de creación y reset, una sola vez. El backoffice la muestra con botón de copiar antes de navegar a otra vista.
- El backoffice usa el mismo endpoint `POST /api/v1/auth/login` que la app operativa. El access token se guarda en `localStorage` con clave `ventax_backoffice_access_token` (diferente a la de web-operacion).
- Los endpoints backoffice retornan 403 para tokens con rol `OPERADOR_FACTURACION`.

---

## 8. Fuera de Alcance

- FE API key por facturador (Fase 2).
- Flags operativos por facturador (Fase 2).
- Gestión de la tabla `planes` (alta/modificación de planes SaaS).
- Hard delete de cualquier entidad.
- Auditoría estructurada (tabla de audit log).
- Impersonación de usuarios operativos.
- Pantallas de facturación, documentos o emision en el backoffice.
- Hash-routing o URL-based navigation en el frontend (Fase 2).
