# Spec: Onboarding — Cambio de Contraseña + Aceptación de T&C con Evidencia Electrónica

**Versión:** 1.2  
**Fecha:** 2026-06-09  
**Estado:** Implementado — en producción pendiente de migración

---

## 1. Contexto y Objetivo

Cuando el backoffice crea un usuario con contraseña temporal, ese usuario no ha aceptado formalmente los Términos y Condiciones ni ha establecido su propia contraseña. El objetivo de esta funcionalidad es interceptar el primer login de cada usuario y obligarlo a completar un flujo de onboarding en dos pasos antes de poder acceder a la aplicación:

1. **Cambio de contraseña** — reemplazar la contraseña temporal asignada por el administrador
2. **Aceptación de T&C** — leer los Términos y Condiciones, marcar el checkbox y validar con OTP enviado al correo declarado

Al finalizar, el sistema emite un **JWT de operación completo** y registra evidencia electrónica fuerte e inmutable del acto de aceptación.

---

## 2. Alcance

### Incluido
- Flag `must_change_password` en `usuarios`
- Campo `email` obligatorio al crear usuario desde backoffice
- Campo `telefono` en `facturadores` (nueva columna)
- Nuevo módulo `onboarding` en el API
- Tablas: `tyc_versiones`, `tyc_aceptaciones`, `tyc_otp_sessions`, `onboarding_sessions`
- Infraestructura de envío de email (nueva dependencia: Resend)
- JWT con claim `scope: "onboarding_only"` que bloquea todas las rutas operativas
- Pantallas del frontend `web-operacion`: bloqueo post-login, cambio de contraseña, lector de T&C con datos de contexto read-only, validación OTP
- Backoffice: al crear/resetear usuario, el flag `must_change_password` se activa automáticamente
- Seed de T&C v1.4 como migración SQL (`0018_tyc_seed_v1_4.sql`)

### Excluido
- Re-aceptación al publicar nueva versión de T&C (puede implementarse después con la misma infraestructura)
- Notificaciones por WhatsApp
- Panel de administración para versiones de T&C en backoffice — se gestionan vía migración SQL por ahora; la pantalla de mantenimiento se construye en una iteración futura
- Campos comerciales en `planes` (precio, costo de implementación, permanencia mínima) — se agregarán desde backoffice en iteración futura
- Pantalla de "confirmar datos" como paso separado — los datos fiscales del tenant se muestran como contexto read-only dentro de la pantalla de T&C; la aceptación (checkbox + OTP) constituye la confirmación implícita

---

## 3. Flujo UX

```
[Login con usuario + contraseña temporal]
          |
          v
   Login OK, contraseña válida
   must_change_password = true
          |
          v
   API responde JWT con scope="onboarding_only"
   + pending_actions: ["CHANGE_PASSWORD", "ACCEPT_TYC"]
          |
          v
┌─────────────────────────────────┐
│  PANTALLA 1: Cambiar contraseña │
│  - Campo nueva contraseña       │
│  - Confirmar contraseña         │
│  - Botón "Continuar"            │
└───────────────┬─────────────────┘
                │ POST /onboarding/password
                v
┌─────────────────────────────────────────────┐
│  PANTALLA 2: Términos y Condiciones         │
│  - Scroll del documento completo            │
│  - Versión y fecha del documento            │
│  - Checkbox "He leído y acepto los T&C"     │
│    (no premarcado, requiere scroll al final)│
│  - Email donde se enviará el OTP (readonly) │
│  - Botón "Enviar código de verificación"    │
└───────────────┬─────────────────────────────┘
                │ POST /onboarding/otp/request
                v
┌─────────────────────────────────────────────┐
│  PANTALLA 3: Validar OTP                    │
│  - "Ingresá el código enviado a tu correo"  │
│  - Campo de 6 dígitos                       │
│  - Reenviar código (cooldown 60s)           │
│  - Botón "Confirmar y aceptar"              │
└───────────────┬─────────────────────────────┘
                │ POST /onboarding/complete
                v
   Evidencia registrada en tyc_aceptaciones
   must_change_password = false
   API responde JWT operativo completo
          |
          v
   [Acceso normal a la aplicación]
```

### Restricción de acceso durante onboarding
Todo JWT con `scope: "onboarding_only"` es rechazado con `403 ONBOARDING_REQUIRED` en cualquier ruta operativa. Solo son accesibles las rutas `/api/v1/onboarding/*` y `/api/v1/auth/*`.

---

## 4. Cambios en Base de Datos

### 4.1 Migración: `0017_onboarding_tyc.sql`  
Estructura de tablas y flags.

### 4.2 Migración: `0018_tyc_seed_v1_4.sql`  
Inserción de la versión inicial del documento de T&C con su hash SHA-256. El contenido es el markdown del contrato v1.4. Al activarse con `activo = true`, todos los nuevos onboardings apuntarán a este registro. Si en el futuro se publica una v1.5, se inserta una nueva fila y se desactiva esta.

```sql
-- Flag de cambio de contraseña obligatorio
alter table usuarios
  add column if not exists must_change_password boolean not null default false;

-- Teléfono del facturador (dato fiscal que se muestra en pantalla de T&C como contexto)
alter table facturadores
  add column if not exists telefono text;

-- Al crear usuarios desde backoffice, este flag siempre será true.
-- Al resetear contraseña desde backoffice, también se activa.

-- Versiones de T&C
create table tyc_versiones (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  document_hash text not null,      -- SHA-256 hex del contenido del documento
  document_content text not null,   -- Texto completo del documento (markdown o HTML)
  activo boolean not null default false,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index tyc_versiones_activo_uidx
  on tyc_versiones (activo)
  where activo = true;

-- Sesiones OTP para aceptación de T&C
create table tyc_otp_sessions (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id) on delete cascade,
  otp_hash text not null,
  email_destino citext not null,
  intentos_fallidos int not null default 0,
  enviado_at timestamptz not null default now(),
  validado_at timestamptz,
  revocado_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint tyc_otp_sessions_expiry_check check (expires_at > created_at)
);

create index tyc_otp_sessions_usuario_idx on tyc_otp_sessions (usuario_id);

-- Registro de aceptaciones (inmutable, solo INSERT)
create table tyc_aceptaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios(id),
  tenant_id uuid not null references tenants(id),
  tyc_version_id uuid not null references tyc_versiones(id),

  -- Snapshots inmutables al momento de la aceptación
  tyc_version_texto text not null,   -- copia del campo version
  tyc_document_hash text not null,   -- copia del hash del documento
  plan_snapshot jsonb not null,      -- snapshot del plan vigente del tenant

  -- Datos del usuario al momento de aceptación
  username_snapshot text not null,
  email_snapshot text,               -- email declarado del usuario
  display_name_snapshot text,

  -- Evidencia técnica
  ip inet,
  user_agent text,
  aceptado_at timestamptz not null default now(),

  -- Estado del checkbox
  checkbox_marcado boolean not null default true,

  -- Traza del OTP
  otp_session_id uuid references tyc_otp_sessions(id),
  otp_email_destino text not null,
  otp_enviado_at timestamptz not null,
  otp_validado_at timestamptz not null,
  otp_intentos_fallidos int not null default 0,

  -- Confirmación de cambio de contraseña en mismo flujo
  password_cambiado_en_flujo boolean not null default false
);

create index tyc_aceptaciones_usuario_idx on tyc_aceptaciones (usuario_id);
create index tyc_aceptaciones_tenant_idx on tyc_aceptaciones (tenant_id);
create index tyc_aceptaciones_version_idx on tyc_aceptaciones (tyc_version_id);
```

> **Nota:** `tyc_aceptaciones` no tiene UPDATE ni DELETE. Es append-only. Cualquier re-aceptación agrega una nueva fila.

---

## 5. Cambios en el Módulo de Auth

### 5.1 Campo nuevo en JWT

El `accessToken` incluirá el claim `scope`. El campo `pending_actions` **no va dentro del JWT** — se devuelve solo en el body de la respuesta HTTP para mantener el token lean:

```
// JWT normal (operación)
{ sub, tenant_id, username, role, scope: "full" }

// JWT de onboarding (después de login con must_change_password = true)
{ sub, tenant_id, username, role, scope: "onboarding_only" }

// Respuesta HTTP de /auth/login cuando must_change_password = true
{
  access_token: "...",
  token_type: "Bearer",
  expires_in: 1800,
  user: { id, username, display_name, role },
  pending_actions: ["CHANGE_PASSWORD", "ACCEPT_TYC"]
}
```

### 5.2 Cambio en `login()` en `auth.service.ts`

Después de verificar la contraseña correctamente, si `user.mustChangePassword === true`:
- Emitir JWT con `scope: "onboarding_only"` y TTL corto (30 min)
- NO crear refresh token (el usuario no tiene acceso completo todavía)
- Responder con `pending_actions: ["CHANGE_PASSWORD", "ACCEPT_TYC"]`

Tipo de respuesta extendido:

```typescript
interface AuthResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  user: { id, username, display_name, role };
  pending_actions?: string[];  // presente cuando scope = onboarding_only
}
```

### 5.3 Middleware de scope

En `auth.middleware.ts`, después de verificar el JWT, si `req.jwtPayload.scope === "onboarding_only"` y la ruta no está en el whitelist de onboarding → responder `403 ONBOARDING_REQUIRED`.

Whitelist:
- `POST /api/v1/onboarding/password`
- `POST /api/v1/onboarding/otp/request`
- `POST /api/v1/onboarding/otp/verify` _(opcional, para validación previa)_
- `POST /api/v1/onboarding/complete`
- `GET  /api/v1/onboarding/tyc/current`
- `POST /api/v1/auth/logout`

### 5.4 Cambio en `BackofficeUserCreateInput` y `resetPassword`

Al crear o resetear contraseña desde backoffice, siempre se setea `must_change_password = true` en la misma transacción.

---

## 6. Módulo `onboarding` (nuevo)

### Archivos a crear:
```
apps/api/src/modules/onboarding/
  onboarding.routes.ts
  onboarding.service.ts
  onboarding.repository.ts
  onboarding.types.ts
```

### 6.1 `GET /onboarding/tyc/current`

**Auth:** JWT onboarding_only o full  
**Response:**

```json
{
  "id": "uuid",
  "version": "1.4",
  "document_hash": "sha256hex...",
  "document_content": "# TÉRMINOS Y CONDICIONES...",
  "published_at": "2026-06-01T00:00:00Z"
}
```

Retorna la versión con `activo = true`. Si no hay ninguna, 404.

---

### 6.2 `POST /onboarding/password`

**Auth:** JWT onboarding_only  
**Body:**

```json
{
  "new_password": "string (min 8, max 200)",
  "confirm_password": "string"
}
```

**Lógica:**
1. Verificar que `new_password === confirm_password`
2. Hashear con argon2
3. Guardar el hash en `onboarding_sessions.new_password_hash` (NO actualizar `usuarios` todavía)
4. Marcar `onboarding_sessions.password_step_at = now()`

> **Decisión:** No se verifica que la nueva contraseña sea distinta a la temporal. El usuario puede elegir la misma si lo desea; lo importante es que `must_change_password = false` al finalizar el flujo completo. Este caso de borde es improbable en la práctica.

**Alternativa más simple:** guardar el estado del flujo en una tabla temporal `onboarding_sessions` vinculada al `usuario_id`, con los pasos completados. Evita estado en JWT.

**Response:** `200 { step_completed: "CHANGE_PASSWORD", next_step: "ACCEPT_TYC" }`

---

### 6.3 `POST /onboarding/otp/request`

**Auth:** JWT onboarding_only  
**Body:** _(vacío, el email se obtiene del usuario autenticado)_

**Lógica:**
1. Obtener el email del usuario (`usuarios.email`). Si no tiene email, devolver error `412 EMAIL_REQUIRED` con instrucción de contactar soporte.
2. Invalidar cualquier OTP activo anterior para ese usuario
3. Generar OTP de 6 dígitos (criptográficamente aleatorio)
4. Hashear el OTP con SHA-256
5. Insertar en `tyc_otp_sessions` con `expires_at = now() + 15 minutes`
6. Enviar email con el OTP (ver sección 8)

**Cooldown:** Si hay un OTP vigente enviado hace menos de 60 segundos, rechazar con `429 TOO_MANY_REQUESTS`.

**Response:**

```json
{
  "email_destino": "u***@dominio.com",  // ofuscado: primeros 2 chars + ***
  "expires_in_seconds": 900,
  "otp_session_id": "uuid"
}
```

---

### 6.4 `POST /onboarding/complete`

**Auth:** JWT onboarding_only  
**Body:**

```json
{
  "otp_session_id": "uuid",
  "otp_code": "123456",
  "checkbox_aceptado": true
}
```

**Lógica (transacción atómica):**

1. Verificar `checkbox_aceptado === true`
2. Obtener el OTP session activo por `otp_session_id` y `usuario_id` del JWT
3. Verificar que no esté expirado ni revocado
4. Si el OTP hash no coincide:
   - Incrementar `intentos_fallidos` en la sesión OTP
   - Si `intentos_fallidos >= 5`, revocar la sesión → el usuario debe pedir nuevo OTP
   - Devolver `400 INVALID_OTP`
5. Si el OTP es válido:
   - Marcar `tyc_otp_sessions.validado_at = now()`
   - Obtener la versión activa de T&C
   - Obtener el plan snapshot del tenant (JOIN con `tenants` y `planes`)
   - Verificar que el paso `CHANGE_PASSWORD` fue completado (via `onboarding_sessions` o campo en DB)
   - Insertar en `tyc_aceptaciones` con todos los campos de evidencia
   - Setear `usuarios.must_change_password = false`
   - Emitir refresh token + JWT full operativo
   - Devolver respuesta de `AuthResponse` completo (mismo formato que `/auth/login`)

**Response:** igual a `POST /auth/login` exitoso (JWT full + refresh cookie)

---

## 7. Tabla de Estado del Flujo (`onboarding_sessions`)

Para rastrear que el paso de contraseña fue completado antes de `complete`, sin depender del JWT:

```sql
create table onboarding_sessions (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null unique references usuarios(id) on delete cascade,
  password_step_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
```

- Se crea al primer login con `must_change_password = true`
- Se actualiza `password_step_at` cuando se completa el paso 1
- Se elimina cuando se completa el flujo con éxito
- `expires_at = now() + 2 hours` — si expira, el usuario debe volver a hacer login

---

## 8. Infraestructura de Email

### 8.1 Dependencia

**Resend** (`npm install resend`) — proveedor transaccional con SDK TypeScript nativo, logs de entrega y excelente deliverability.

Variables de entorno en `env.ts`:

```
RESEND_API_KEY=re_...           # si no está definida, los emails se loguean en consola (modo dev)
EMAIL_FROM=facturacion@ventax.app
EMAIL_FROM_NAME=Ventax Facturación Simple
```

### 8.2 Arquitectura del módulo

```
apps/api/src/shared/email/
  email.types.ts       # EmailTemplate, OtpPurpose
  email.templates.ts   # otpTemplate(), buildLayout(), logo SVG inline
  email.service.ts     # sendEmail() genérico + sendOtpEmail() wrapper
```

**`email.types.ts`**
```typescript
interface EmailTemplate { subject: string; html: string; text: string; }
type OtpPurpose = "onboarding" | "password_reset";
```

**`email.service.ts`** — interfaz pública:
```typescript
// Función genérica: cualquier template puede enviarse por aquí
sendEmail(to: string, template: EmailTemplate): Promise<void>

// Wrapper de conveniencia para flujos OTP
sendOtpEmail(to: string, otpCode: string, displayName: string, purpose?: OtpPurpose): Promise<void>
//            ^                                                  ^
//          email destino                           "onboarding" por defecto
```

En **desarrollo** (sin `RESEND_API_KEY`): el email no se envía, el código OTP aparece en los logs del servidor con `logger.info`.

### 8.3 Diseño del email OTP

El email utiliza **SVG inline** (el isotipo X de Ventax en blanco sobre fondo celeste `#07a7e1`) para máxima compatibilidad con clientes de email modernos. Los dígitos del OTP se muestran en **6 cajas individuales** para facilitar la copia y lectura:

```
┌─────────────────────────────────────────────┐
│  [X]  Ventax Facturación Simple             │  ← header celeste, logo SVG inline
├─────────────────────────────────────────────┤
│  VERIFICACIÓN DE IDENTIDAD                  │
│  Hola, Juan Pérez                           │
│                                             │
│  Ingresá este código en la aplicación...    │
│                                             │
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐      │
│  │ 4 │ │ 8 │ │ 3 │ │ 1 │ │ 0 │ │ 9 │      │  ← 6 cajas individuales
│  └───┘ └───┘ └───┘ └───┘ └───┘ └───┘      │     borde celeste, fuente monospace
│                                             │
│       ⏱ Válido por 15 minutos              │
│  Si no solicitaste esto, ignorá el mensaje  │
├─────────────────────────────────────────────┤
│  Ventax Facturación Simple · email          │  ← footer gris
└─────────────────────────────────────────────┘
```

### 8.4 Textos por propósito (`OtpPurpose`)

| Propósito | `subject` | `headline` | `description` |
|---|---|---|---|
| `onboarding` | "Tu código de verificación — Ventax Facturación Simple" | "Verificación de identidad" | Confirmar aceptación de T&C |
| `password_reset` | "Código para restablecer tu contraseña — Ventax" | "Restablecer contraseña" | Continuar con el proceso de restablecimiento |

### 8.5 Cómo agregar un nuevo tipo de email

**Para un nuevo flujo OTP** (ej. `"2fa"`, `"confirm_email"`):
1. Agregar la entrada en `OTP_PURPOSE_CONFIG` dentro de `email.templates.ts`
2. Agregar el literal al tipo `OtpPurpose` en `email.types.ts`
3. Llamar `sendOtpEmail(to, otp, name, "nuevo_proposito")`

**Para un template completamente diferente** (ej. email de bienvenida, notificación):
1. Crear una función en `email.templates.ts` que llame a `buildLayout()`
2. Enviar con `sendEmail(to, miTemplate())`

---

## 9. Evidencia Recolectada (campo a campo)

| Campo en `tyc_aceptaciones`  | Fuente |
|-------------------------------|--------|
| `usuario_id`                 | JWT sub |
| `tenant_id`                  | JWT tenant_id |
| `tyc_version_id`             | versión activa |
| `tyc_version_texto`          | snapshot de `tyc_versiones.version` |
| `tyc_document_hash`          | snapshot de `tyc_versiones.document_hash` |
| `plan_snapshot`              | JOIN tenant → plan al momento de aceptación |
| `username_snapshot`          | `usuarios.username` |
| `email_snapshot`             | `usuarios.email` |
| `display_name_snapshot`      | `usuarios.display_name` |
| `ip`                         | `req.ip` del request a `/onboarding/complete` |
| `user_agent`                 | `req.get('user-agent')` |
| `checkbox_marcado`           | body del request |
| `otp_session_id`             | FK a `tyc_otp_sessions` |
| `otp_email_destino`          | `tyc_otp_sessions.email_destino` |
| `otp_enviado_at`             | `tyc_otp_sessions.enviado_at` |
| `otp_validado_at`            | now() al momento de validar |
| `otp_intentos_fallidos`      | `tyc_otp_sessions.intentos_fallidos` al momento de éxito |
| `password_cambiado_en_flujo` | `onboarding_sessions.password_step_at is not null` |

**Campos del contrato que se cubren con datos del usuario/tenant:**
- RUC / C.I. — disponibles en el `plan_snapshot` o datos del tenant
- Teléfono — disponible en datos del tenant
- Plan contratado, precio, implementación, certificado, permanencia mínima — en `plan_snapshot`

---

## 10. Cambios en Frontend (`web-operacion`)

### Estado global de auth

El store de auth debe manejar el estado:

```typescript
type AuthState = 
  | { status: "unauthenticated" }
  | { status: "onboarding"; token: string; pendingActions: string[] }
  | { status: "authenticated"; token: string; user: UserSummary }
```

Si `pending_actions` viene en la respuesta del login, el estado pasa a `onboarding` y el router redirige a `/onboarding`.

### Pantallas nuevas

- `/onboarding/password` — formulario de nueva contraseña
- `/onboarding/tyc` — visor del documento + checkbox
- `/onboarding/otp` — campo de 6 dígitos + reenvío

El acceso a cualquier ruta no-onboarding con estado `onboarding` redirige a `/onboarding/password`.

---

## 11. Cambios en Backoffice

### `POST /backoffice/tenants/:tenantId/usuarios`
- Al crear usuario, siempre insertar con `must_change_password = true`
- Si el campo `email` es parte del input de creación, guardarlo en `usuarios.email`

### `POST /backoffice/usuarios/:userId/reset-password`
- Al resetear contraseña, siempre setear `must_change_password = true` en la misma transacción

---

## 12. Orden de Implementación Sugerido

1. **Migración** `0017_onboarding_tyc.sql` — tablas y flag en usuarios
2. **Seed** inicial de la primera versión de T&C en `tyc_versiones` (via script o migración separada)
3. **Auth changes** — claim `scope` en JWT, middleware de bloqueo, login detecta `must_change_password`
4. **Email service** — módulo `shared/email` con Resend
5. **Módulo `onboarding`** — repository, service, routes (en orden: `tyc/current`, `password`, `otp/request`, `complete`)
6. **Backoffice** — setear flag al crear/resetear usuarios
7. **Frontend** — estado de auth, pantallas de onboarding, guard de ruta

---

## 13. Historial de Versiones

| Versión | Fecha | Cambios |
|---|---|---|
| 1.0 | 2026-06-09 | Spec inicial |
| 1.1 | 2026-06-09 | Decisiones cerradas: email obligatorio, snapshot JSONB, seed vía migración |
| 1.2 | 2026-06-09 | Sección 8 reescrita: arquitectura genérica de email (`email.templates.ts`, `sendEmail()`, `OtpPurpose`), SVG inline, cajas de dígitos. Sección 5.1 corregida: `pending_actions` va en el body de la respuesta, no dentro del JWT. Sección 6.2 actualizada: se eliminó la verificación de contraseña igual a la temporal (decisión explícita). |

---

## 14. Decisiones Cerradas (acumuladas)

| Pregunta | Decisión |
|---|---|
| ¿Email obligatorio al crear usuario? | **Sí, obligatorio.** Validación en backoffice service + DB constraint. |
| ¿RUC/teléfono en `plan_snapshot`? | **Sí.** Se hace JOIN con `facturadores` al momento de aceptación y se captura todo en el snapshot JSONB. Se agrega `telefono` a `facturadores`. |
| ¿Confirmar datos como paso separado? | **No.** Los datos fiscales se muestran como bloque read-only dentro de la pantalla de T&C. La aceptación (checkbox + OTP) es la confirmación. |
| ¿Seed de T&C en migración? | **Sí, migración `0018_tyc_seed_v1_4.sql`.** Reproducible en todos los entornos. |
| ¿Pantalla de mantenimiento de T&C en backoffice? | **Iteración futura.** Por ahora se gestiona vía migración SQL. |
| ¿Campos comerciales en `planes` (precio, implementación, permanencia)? | **Iteración futura.** Se construye la pantalla de mantenimiento en backoffice más adelante. El `plan_snapshot` captura lo que haya disponible al momento de aceptación. |
| ¿`pending_actions` va dentro del JWT? | **No.** Va solo en el body de la respuesta HTTP. Los JWT deben mantenerse lean; el frontend lo lee una sola vez y no necesita que el claim persista en el token. |
| ¿Validar que la nueva contraseña sea distinta a la temporal? | **No.** El usuario puede elegir la misma si quiere. Lo importante es el flujo completo (T&C + OTP + `must_change_password = false`). Caso de borde improbable en práctica. |
| ¿Servicio de email hardcoded para T&C o genérico? | **Genérico.** `sendEmail(to, template)` + `sendOtpEmail(to, otp, name, purpose)` con `OtpPurpose` extensible. Reutilizable para recuperación de contraseña y futuros flujos sin duplicar infraestructura. |
| ¿SVG en email vía `<img src="data:...">` o inline? | **SVG inline** en el `<body>`. Los data URI son bloqueados por Gmail. El isotipo (un solo `<polygon>`) se embebe directamente en el HTML, compatible con Apple Mail, webmail moderno y clientes móviles. |

### Estructura del `plan_snapshot` (JSONB)

```json
{
  "tenant_id": "uuid",
  "tenant_nombre": "EMPRESA SA",
  "plan_id": "uuid",
  "plan_codigo": "PROFESIONAL",
  "plan_nombre": "Plan Profesional",
  "suscripcion_id": "uuid",
  "suscripcion_estado": "ACTIVA",
  "suscripcion_fecha_inicio": "2026-06-01",
  "facturador_id": "uuid",
  "facturador_ruc": "1234567-8",
  "facturador_razon_social": "EMPRESA SA",
  "facturador_nombre_fantasia": "Empresa",
  "facturador_telefono": "0984XXXXXX"
}
```

> Los campos `facturador_*` se toman del primer facturador activo del tenant al momento de la aceptación. Si el tenant tiene más de un facturador, se captura el primero por fecha de creación. Si no tiene ninguno todavía, esos campos van como `null`.

### Bloque de contexto en pantalla de T&C (frontend)

```
┌──────────────────────────────────────────────────────┐
│  Estás aceptando como:                               │
│  ┌──────────────────────────────────────────────┐   │
│  │ Empresa:   EMPRESA SA                        │   │
│  │ RUC:       1234567-8                         │   │
│  │ Plan:      Plan Profesional                  │   │
│  │ Usuario:   juan.perez  (juan@empresa.com)    │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  Si estos datos no son correctos, contactá a         │
│  soporte antes de aceptar.                           │
└──────────────────────────────────────────────────────┘
```

Este bloque se renderiza con los datos del endpoint `GET /onboarding/tyc/current` que ya devuelve contexto del usuario autenticado.
