# PLAN Un Usuario Con Varios Perfiles De Emision v0.1

**Fecha:** 2026-11-10 · **SPEC:** `docs/SPEC_MULTIPERFIL_USUARIO_v0.1.md` · **Estado:** diseño aceptado y refinado; **no implementar hasta que el usuario lo indique.**

Principio: **el camino de emision no cambia**. Lo unico que cambia es que fila de `usuario_operacion_config` alimenta el contexto de cada pedido, y esa fila la elige el `uoc` del token. FE, calculo, numeracion, idempotencia y estados quedan igual.

Orden: A (datos) → B (API: token, login, perfil, contexto) → C (API: perfil en documentos y backfill) → D (web del operador) → E (backoffice) → F (contrato, docs, prueba conjunta). B y C son independientes; D depende de B y C; E depende de A. Cada fase se cierra con `npm run typecheck`, `npm run lint`, `npm run test` y `npm run build` en verde antes de la siguiente.

Otra sesion trabaja en la misma rama: antes de cada commit, `git status` y excluir `docs/*IDENTIDAD_MARCA_SEGEL*`, `scripts/guia-uso-segel.cjs` y `TMP/`.

## 1. Fase A — Datos

### 1.1 `db/migrations/0044_multiperfil_usuario.sql`

```sql
-- Verificacion previa: hoy no puede haber un usuario con dos facturadores activos.
do $$
begin
  if exists (
    select 1 from usuario_operacion_config
    where activo and deleted_at is null
    group by usuario_id having count(distinct facturador_id) > 1
  ) then
    raise exception 'MULTIPERFIL_PRECONDICION: hay usuarios con mas de un facturador activo';
  end if;
end $$;

drop index if exists usuario_operacion_config_usuario_activa_uidx;

create unique index usuario_operacion_config_usuario_perfil_uidx
  on usuario_operacion_config (usuario_id, actividad_punto_perfil_id)
  where activo = true and deleted_at is null;

-- RN-01: todas las configuraciones activas de un usuario son del mismo facturador.
create or replace function usuario_operacion_config_un_facturador() returns trigger as $$
begin
  if new.activo and new.deleted_at is null and exists (
    select 1 from usuario_operacion_config u
    where u.usuario_id = new.usuario_id and u.id <> new.id
      and u.activo and u.deleted_at is null
      and u.facturador_id <> new.facturador_id
  ) then
    raise exception 'USUARIO_CON_OTRO_FACTURADOR' using errcode = '23514';
  end if;
  return new;
end $$ language plpgsql;

create trigger usuario_operacion_config_un_facturador_trg
  before insert or update on usuario_operacion_config
  for each row execute function usuario_operacion_config_un_facturador();

alter table refresh_tokens
  add column operacion_config_id uuid references usuario_operacion_config(id);
create index refresh_tokens_operacion_config_idx
  on refresh_tokens (operacion_config_id) where revoked_at is null;
```

- Sin backfill: todas las filas actuales cumplen el indice nuevo.
- El `errcode 23514` (check_violation) lo mapea `pool.error-handler` a 422 como cualquier otra violacion; la API valida antes con mensaje propio (§5.1), el disparador es red de seguridad.
- Reversa documentada (no automatizada): `drop trigger`, `drop function`, `drop index ..._usuario_perfil_uidx`, recrear el indice de `0004` **solo si** no hay usuarios con dos configuraciones activas; `alter table refresh_tokens drop column operacion_config_id`.

### 1.2 `db/migrations/0045_backfill_perfil_documentos.sql`

- Copia literal de los pasos de `0034` (facturas por tupla del snapshot; facturas por establecimiento + punto cuando resuelven un unico contexto; recibos y presupuestos por la unica configuracion del `usuario_id`), con los mismos filtros `deleted_at is null` en las cinco tablas y la misma regla "ante la duda, null". Idempotente: solo toca filas con la columna en `null`.
- Se aplica **despues** de `0044` y **antes** del despliegue de la fase C en un entorno con datos; en el stack local de Segel, con los documentos del ensayo.
- Evidencia: conteo de `actividad_punto_perfil_id is null` por tabla antes y despues, guardado en TASKS.

## 2. Fase B — Token, login, seleccion y contexto (`apps/api`)

### 2.1 Token (`auth/token.service.ts`)

- `AccessTokenPayload`: `scope: "full" | "onboarding_only" | "perfil_select"`, `uoc?: string`.
- `signPerfilSelectToken(payload: Omit<AccessTokenPayload, "scope" | "uoc">)`: `scope: "perfil_select"`, `expiresIn: "10m"`.
- `isAccessTokenPayload`: acepta el alcance nuevo y `uoc` ausente o string (uuid). Un `uoc` con otro tipo invalida el token.

### 2.2 Middleware (`auth/auth.middleware.ts`, `auth/auth.types.ts`)

- `AuthenticatedUser` gana `operacionConfigId: string | null` y `scope: AccessTokenPayload["scope"]`. `findActiveUserById` no cambia; `createRequireAuth` compone `req.user = { ...user, operacionConfigId: payload.uoc ?? null, scope: payload.scope }`.
- `PERFIL_SELECT_WHITELIST = ["/auth/perfil", "/me/perfiles", "/auth/logout"]`; fuera de ella, `403 PERFIL_REQUERIDO` "Elegi el punto de expedicion para continuar.". Misma mecanica que `ONBOARDING_WHITELIST`.
- `auth.middleware.test.ts`: token `perfil_select` en `/facturas` → 403; en `/auth/perfil` → pasa; token `full` con `uoc` → `req.user.operacionConfigId` cargado.

### 2.3 Repositorio de contexto (`context/context.repository.ts`, `context.types.ts`)

- `getOperationalContext(userId: string, operacionConfigId: string | null)`: la consulta actual agrega `and ($2::uuid is null or uoc.id = $2)`; conserva `order by` y `limit 1`. Con `$2` nulo y una sola fila emitible se comporta como hoy.
- `listPerfilesDisponibles(userId): Promise<PerfilDisponible[]>`: misma cadena de `join` y el mismo `where` de emitibilidad del contexto, **sin** `limit`, `order by e.codigo, p.codigo`. Selecciona `uoc.id as operacion_config_id` y los campos de SPEC §B.4; `titulo_operativo` con `deriveTituloOperativo`. `activo_en_sesion` lo completa el servicio.
- `getReadinessChecks(userId, operacionConfigId)`: el `left join usuario_operacion_config` agrega `and ($2::uuid is null or uoc.id = $2)`. Sin ese filtro, con N filas la consulta devolveria N resultados y `rows[0]` seria arbitrario.
- `PerfilDisponible` se define en `packages/shared/src/types/api.ts` (lo consume la web) y se reexporta en `context.types.ts`.

### 2.4 Servicio de contexto (`context/context.service.ts`)

```ts
export async function getOperationalContext(
  user: Pick<AuthenticatedUser, "id" | "operacionConfigId">,
  repository: OperationalContextRepository
): Promise<OperationalContextResponse> {
  if (user.operacionConfigId) {
    const context = await repository.getOperationalContext(user.id, user.operacionConfigId);
    if (!context) throw new HttpError(409, "CONFLICT", "El punto de expedicion de tu sesion ya no esta disponible.", { reason: "PERFIL_NO_DISPONIBLE" });
    return context;
  }
  const perfiles = await repository.listPerfilesDisponibles(user.id);
  if (perfiles.length === 0) throw new HttpError(409, "CONFLICT", "Usuario sin configuracion operativa completa.");
  if (perfiles.length > 1) throw new HttpError(409, "CONFLICT", "Elegi el punto de expedicion para continuar. Cerra sesion y volve a entrar.", { reason: "PERFIL_REQUERIDO" });
  const context = await repository.getOperationalContext(user.id, perfiles[0].operacion_config_id);
  if (!context) throw new HttpError(409, "CONFLICT", "Usuario sin configuracion operativa completa.");
  return context;
}
```

- `getReadiness(user, repository, gateway)` con la misma firma.
- **Los 62 llamadores** cambian `getOperationalContext(req.user!.id, operationalContextRepository)` → `getOperationalContext(req.user!, operationalContextRepository)` con un `sed` sobre `apps/api/src/modules/*/*.routes.ts`; `getReadiness(req.user!.id, ...)` igual en `context.routes.ts`. Verificacion: `grep -rc "getOperationalContext(req.user!.id" apps/api/src` = 0 y `typecheck` en verde (la firma nueva no acepta `string`).
- `context.service.test.ts`: los fixtures pasan `{ id, operacionConfigId }`; casos nuevos: con `uoc` resuelve; con `uoc` y repositorio que devuelve `null` → 409 `PERFIL_NO_DISPONIBLE`; sin `uoc` y 0/1/2 perfiles → 409 / contexto / 409 `PERFIL_REQUERIDO`.

### 2.5 Login y seleccion (`auth/auth.service.ts`, `auth/auth.routes.ts`, `context/context.routes.ts`)

- `emitirSesion({ user, ip, userAgent }, repository, contextRepository): Promise<LoginResult>`:
  1. `perfiles = await contextRepository.listPerfilesDisponibles(user.id)`.
  2. `perfiles.length === 1` → `signAccessToken({..., scope: "full", uoc: perfiles[0].operacion_config_id})`, `createRefreshToken()` y `repository.createRefreshToken({..., operacionConfigId})`.
  3. `> 1` → `signPerfilSelectToken(...)`, `response.pending_actions = ["SELECT_PERFIL"]`, `response.perfiles = perfiles`, `response.expires_in = 600`, `refreshToken: null`.
  4. `0` → `signAccessToken({..., scope: "full"})` sin `uoc`, refresh sin `operacionConfigId` (comportamiento actual).
- `login(...)`: el bloque final (`auth.service.ts:135-165`) se reemplaza por `return emitirSesion(...)`. Los dos retornos de onboarding (`:85-133`) no cambian.
- `seleccionarPerfil(input: { user: AuthenticatedUser; operacionConfigId: string; password?: string; refreshCookie?: string; ip?: string; userAgent?: string }, repository, contextRepository, auditRepository)`:
  1. `user.scope === "full"`: `password` obligatoria → 400 `VALIDATION_ERROR` si falta. `record = await repository.findUserForLogin(user.username)`; si `record.bloqueadoAt` → 423. `verifyPassword(record.passwordHash, password)`; incorrecta → `recordFailedLogin({ reason: blockUser ? "USER_BLOCKED_BY_FAILED_ATTEMPTS" : "INVALID_PASSWORD_PERFIL", nextFailedCount, blockUser })` y 401 / 423, reutilizando `maxFailedAttempts`. Correcta → `recordSuccessfulLogin` **no** se llama (no es un login; el contador se reinicia igual porque `recordFailedLogin` solo suma y el exito del login ya lo pone en cero; se agrega `resetFailedLogin(userId)` al repositorio para ponerlo en cero tras un cambio exitoso).
  2. `perfiles = listPerfilesDisponibles(user.id)`; si no contiene `operacionConfigId` → 401 `AUTH_REQUIRED` "Punto de expedicion no disponible para este usuario." (mismo codigo y texto para ajeno, inexistente y no emitible; RN-04).
  3. `user.scope === "perfil_select"`: sin contraseña (el token de 10 min es la prueba).
  4. Token completo con `uoc = operacionConfigId`; `createRefreshToken` con `operacionConfigId`; si `refreshCookie` viene, `revokeRefreshToken({ tokenHash: hashRefreshToken(refreshCookie) })`.
  5. Si `user.operacionConfigId !== operacionConfigId`: `audit_events` con `event_type = scope === "full" ? "PERFIL_CAMBIADO" : "PERFIL_SELECCIONADO"`, `entity_type = "usuario_operacion_config"`, `entity_id = operacionConfigId`, `metadata = { anterior, nuevo, establecimiento, punto_expedicion, ip, user_agent, origen: scope === "full" ? "APP" : "LOGIN" }`. Repositorio: `auditRepository.insertEvent` (nuevo, `apps/api/src/shared/audit/audit.repository.ts`, mismo `insert into audit_events` que usa `facturas.repository.ts`).
  6. Si `scope === "full"` y la contraseña fue correcta → `resetFailedLogin`.
- Ruta `POST /auth/perfil` en `auth.routes.ts`: `requireAuth`, `validateRequest("body", z.object({ operacion_config_id: z.string().uuid(), password: z.string().min(1).optional() }))`, llama `seleccionarPerfil` con `req.cookies?.[refreshCookieName]`, setea la cookie como `/auth/login`, responde `AuthResponse`.
- Ruta `GET /me/perfiles` en `context.routes.ts`: `requireAuth`; `listPerfilesDisponibles(req.user.id)` y `activo_en_sesion = p.operacion_config_id === req.user.operacionConfigId`.
- `auth.perfil.test.ts` (nuevo, repositorio en memoria como `auth.service.test.ts`): CA-02, CA-03, RN-04 (mismo 401 para ajeno e inexistente), "elegir el activo no registra evento", `perfil_select` sin contraseña, `full` sin contraseña → 400.

### 2.6 Refresh (`auth/auth.repository.ts`, `auth/auth.service.ts`)

- `createRefreshToken(input)` del repositorio recibe `operacionConfigId?: string | null` y lo inserta.
- `rotateRefreshToken` copia `operacion_config_id` a la fila nueva y lo devuelve en `LoginUserRecord.operacionConfigId`.
- `revokeRefreshTokensByOperacionConfig(operacionConfigId)` (nuevo): `update refresh_tokens set revoked_at = now() where operacion_config_id = $1 and revoked_at is null`. Lo usa el backoffice (§5.1).
- `refreshSession(rawRefreshToken, repository, contextRepository)`:
  1. rota como hoy; obtiene `user` con `operacionConfigId`.
  2. `perfiles = listPerfilesDisponibles(user.id)`.
  3. si `operacionConfigId` esta en `perfiles` → token completo con ese `uoc`; respuesta como hoy.
  4. si no (nulo o no emitible) → `emitirSesion` sobre `perfiles`: una → token completo con ese `uoc` y la fila rotada se **actualiza** con `operacion_config_id` nuevo; varias → `perfil_select` y la fila rotada se **revoca** (la ruta limpia la cookie con `clearRefreshCookie` cuando `result.refreshToken === null`); cero → token completo sin `uoc`.
  5. `audit_events PERFIL_SELECCIONADO` con `origen: "REFRESH"` cuando asigna el unico restante.
- `auth.routes.ts /auth/refresh`: si `result.refreshToken` es `null`, `clearRefreshCookie(res)`; si no, `setRefreshCookie`.
- `auth.service.test.ts` extendido con los tres casos (CA-05).

### 2.7 Onboarding (`onboarding/onboarding.service.ts:182-190, 278-286`)

- Los dos bloques que emiten token completo y refresh usan `emitirSesion`. La respuesta ya tiene la forma `AuthResponse`; la web la trata igual que la del login (§4.1).

## 3. Fase C — Perfil en los documentos (`apps/api`)

- `facturas.repository.ts`: los `insert into facturas_operativas` de `:496` (encolada), `:653` (segundo camino) y `:801` (NC) agregan `actividad_punto_perfil_id` con el valor que viene en el input del repositorio; `facturas.service.ts` lo toma de `context.actividad_punto_perfil_id` en `createQueuedEmission`, en el camino sincrono y en `createNotaCreditoFromFactura` (**del contexto**, D-1). Los tipos de entrada (`CreateQueuedEmissionInput`, etc.) ganan el campo obligatorio.
- `recibos.repository.ts:59` y `notas.repository.ts:119, 359`: idem con el contexto (D-7). Las firmas de `recibos.service.ts` y `notas.service.ts` ya reciben `context`.
- Lecturas: `facturas.repository.ts` agrega `left join actividad_punto_perfiles app on app.id = f.actividad_punto_perfil_id` con sus dimensiones en `getDocumento`, el listado y los candidatos de NC, y mapea `perfil_emision: { establecimiento, punto_expedicion, perfil_emision_codigo, alias }` o `null`. `DocumentoResponse` (`facturas.types.ts`) gana el campo opcional.
- Pruebas: `facturas.service.test.ts` (el input del repositorio en memoria recibe el perfil del contexto; la NC lleva el del contexto aunque el fixture de la factura tenga otro), `recibos.service.test.ts`, `notas.service.test.ts`. Integracion contra Postgres (`DATABASE_URL_TEST`): una factura y una NC insertadas quedan con la columna cargada y `perfil_emision` se lee.

## 4. Fase D — Web del operador (`apps/web-operacion/src/main.tsx`, `styles.css`, `packages/shared`)

### 4.1 Tipos y sesion

- `packages/shared/src/types/api.ts`: `PerfilDisponible` (SPEC §B.4) y `AuthResponse.perfiles?: PerfilDisponible[]`. Rebuild de `packages/shared` antes de `typecheck` de las apps.
- `ViewState` gana `"select-perfil"`. Estado nuevo `perfiles: PerfilDisponible[] | null` y `perfilesSesion: PerfilDisponible[]` (los de `/me/perfiles` para la barra).
- `handleLogin`: si `response.pending_actions?.includes("SELECT_PERFIL")` → `setPerfiles(response.perfiles ?? [])`, `setAccessToken(response.access_token)` **sin** persistir en `localStorage` (D-8; `useEffect` de persistencia salta cuando `view === "select-perfil"`), `setUser(response.user)`, `setView("select-perfil")`. Si trae `CHANGE_PASSWORD`/`ACCEPT_TYC` sigue a `onboarding` como hoy.
- `refreshSession()` (helper global) devuelve la respuesta completa; `bootstrap` y `createApiClient` la examinan: con `SELECT_PERFIL` → mismo camino que el login; con token completo → como hoy.
- `handleOnboardingComplete(token, user, pendingActions?)`: `OnboardingFlow` pasa `result.pending_actions`; con `SELECT_PERFIL` → `select-perfil`.
- `seleccionarPerfil(id, password?)`: `POST /auth/perfil`; exito → `setAccessToken`, `setPerfiles(null)`, `setView("loading-context")`; el efecto existente recarga contexto y readiness, y ahora tambien `/me/perfiles` (§4.3).
- 409 `PERFIL_NO_DISPONIBLE`/`PERFIL_REQUERIDO` en cualquier pedido (`ApiClientError` con `details.reason`): `createApiClient` fuerza `refreshSession()`; si trae `SELECT_PERFIL` → avisa a App (`onPerfilRequerido`) y App muestra la eleccion; si trae token → App recarga el contexto con el aviso "Tu punto de expedicion cambio"; en ambos casos **lanza el error sin reintentar** (D-10). Lo mismo cuando un refresh por 401 devuelve un `uoc` distinto al anterior. Si el refresh falla → error 401 "Tu punto de expedicion cambio. Volve a entrar.".

### 4.2 `SeleccionPerfilScreen`

- Props: `perfiles`, `user`, `onElegir(id)`, `onSalir()`. Misma estructura que `LoginScreen` (logo Segel, tarjeta centrada de 520 px en PC, a lo ancho en celular).
- Lista `<button class="perfil-opcion" aria-label="Elegir {titulo} {est}-{punto}">` con `titulo_operativo` (700), linea "Establecimiento {est} · Punto {punto} · Timbrado {timbrado}", tercera linea "ultimo numero {documento_nro}" (SERVICIO) o "solo carga de archivo" (CLIENTE), `<Icono nombre="chevron-derecha" />`.
- Estado `eligiendo` deshabilita la lista; error en linea. "Salir": `POST /auth/logout` + `clearSession`.

### 4.3 Barra superior (`OperationHome`, `main.tsx:1623`)

- `loadOperationalState` agrega `client.get<{ perfiles: PerfilDisponible[] }>("/me/perfiles")` al `Promise.allSettled`; si falla, `perfilesSesion = []` (la barra no es boton; no bloquea).
- `perfilesSesion.length > 1` → `<button type="button" class="topbar-facturador topbar-facturador--boton" title="Cambiar punto de expedicion" aria-haspopup="dialog" onClick={abrirCambio}>` con el mismo contenido y `<Icono nombre="chevron-abajo" />`. En celular, el bloque compacto igual. Con uno, el `div` actual.

### 4.4 `CambioPerfilDialog`

- Props: `perfiles`, `activoId`, `hayDocumentoSinEmitir`, `onConfirmar(id, password)`, `onCerrar`. Ventana modal (mismo patron que la ventana del modo simple, con `role="dialog"`, foco inicial en la lista, `Escape` cierra).
- Lista con `aria-checked`; el activo con etiqueta "Activo" y `disabled`. `<input type="password" autocomplete="current-password" aria-label="Tu contraseña">`. Si `hayDocumentoSinEmitir`: parrafo "Tenes un documento sin emitir. Si cambias de punto se descarta." y boton "Descartar y cambiar"; si no, "Cambiar". Deshabilitado hasta tener perfil y contraseña.
- Resultado: 401 → mensaje bajo el campo, campo vacio, ventana abierta. 423 → `onCerrar`, `clearSession`, `setView("login")`, `errorMessage` del backend. Exito → `onCerrar`, `setActiveView("status")`, `avisoPerfil = "Ahora estas facturando por {est}-{punto} · {titulo}"` (se muestra en `StatusView` y se limpia al navegar).
- `hayDocumentoSinEmitir`: `InvoiceEditor`, `CreditNoteView`, `RecibosView` y `NotasView` reciben `registrarEstadoSinEmitir(fn)` y registran una funcion que devuelve `true` cuando hay datos cargados y nada emitido (en `InvoiceEditor`: alguna linea con descripcion o un cliente con documento, y `emittedDocumento === null`). `OperationHome` la consulta al abrir la ventana. Tras confirmar, `OperationHome` incrementa `editorKey` para remontar la vista activa vacia.

### 4.5 Nota de credito (RN-05)

- `CreditNoteView`: `NotaCreditoCandidate` gana `perfil_emision` (lo devuelve el listado de candidatos). Al seleccionar, si existe y `(establecimiento, punto_expedicion)` difiere de `context.fiscal_context`, `<p class="aviso-perfil">La factura original se emitio por {est}-{punto}; la nota saldra por {est_a}-{punto_a} (punto activo).</p>`. Informativo.

### 4.6 `StatusView`

- Debajo del titulo: "Punto de expedicion: {est}-{punto} · {titulo}" y, con `perfilesSesion.length > 1`, `<button class="link">Cambiar punto de expedicion</button>` que abre la ventana. `avisoPerfil` se muestra arriba cuando existe.

### 4.7 `DocumentsView`

- Columna "Punto" (`{perfil_emision.establecimiento}-{perfil_emision.punto_expedicion}` o "—") en la tabla de escritorio solo con `perfilesSesion.length > 1`. Sin cambios en celular.

### 4.8 Estilos

- `.perfil-opcion`, `.topbar-facturador--boton` (cursor, hover con `--color-ground-card`, foco visible), `.aviso-perfil`, `.dialog-perfil`. Tokens existentes; sin colores nuevos.

## 5. Fase E — Backoffice (`apps/api/src/modules/backoffice`, `apps/backoffice/src/main.tsx`)

### 5.1 Repositorio

- `listOperationConfigs(userId)`: `findOperationConfigRow` (`backoffice.repository.ts:1193`) sin `limit`, devuelve `BackofficeOperationConfigResponse[]` con `id` (de `usuario_operacion_config`), `titulo_operativo` y `numeracion_facturas`.
- `addOperationConfig({ userId, data })`: `begin`; `resolveOperationConfigTarget` como hoy (incluye la validacion de API key del facturador); `select facturador_id from usuario_operacion_config where usuario_id = $1 and activo and deleted_at is null limit 1`; si existe y difiere → `rollback` y 422 `VALIDATION_ERROR` `{ motivo: "FACTURADOR_DISTINTO", facturador_actual: razon_social }`; `insert`; si el indice unico salta (`23505`) → 409 `CONFLICT` "El usuario ya tiene ese punto de expedicion."; `commit`; devuelve la lista.
- `removeOperationConfig({ userId, configId })`: `update usuario_operacion_config set activo = false, deleted_at = now(), updated_at = now() where id = $2 and usuario_id = $1 and activo and deleted_at is null returning id`; sin fila → 404; devuelve la lista. **No revoca refresh tokens** (D-9 revisada).
- `USER_DETAIL_SELECT` (listado y detalle de usuarios): el `left join usuario_operacion_config` pasa a `left join lateral (... order by created_at limit 1)`. Sin esto, un usuario con dos configuraciones aparecia **dos veces** en el listado (hallazgo al implementar).
- `assignOperationConfig` (el `PUT`) se conserva y se marca `/** @deprecated SPEC_MULTIPERFIL_USUARIO_v0.1 §D.6 */`.
- `findUserRow` / `BackofficeUserDetail` (`backoffice.types.ts:254`): `operation_configs: BackofficeOperationConfigResponse[]`; `operation_config` = primera o `null`.
- Metricas (`:725-731`): `select count(distinct uoc.usuario_id)`.
- `deleteUser` (`:1150`) ya desactiva todas las configuraciones y revoca todos los refresh: no cambia.

### 5.2 Rutas y servicio

- `GET /backoffice/users/:userId/operation-config` → `{ items: [...] }`. `POST` (mismo `operationConfigSchema`) → 201 con la lista. `DELETE /backoffice/users/:userId/operation-config/:configId` → 204. `PUT` queda.
- Servicio: `listBackofficeOperationConfigs`, `addBackofficeOperationConfig`, `removeBackofficeOperationConfig`, reutilizando `normalizeOperationConfig`.
- `backoffice.service.test.ts`: CA-07 completo con el repositorio en memoria; integracion contra Postgres: disparador RN-01 y revocacion de refresh al quitar.

### 5.3 Pantalla

- `UserDetailView` (`main.tsx:2749`), panel "Configuracion operativa" (`:2970`): tabla `user.operation_configs` (Establecimiento, Punto, Perfil, Actividad, Titulo operativo, Numeracion, accion "Quitar"). Vacio: "Sin configuracion operativa asignada.". Boton "Agregar punto de expedicion" → `OperationConfigPicker` con `facturadorFijo={{ tenantId, facturadorId }}` cuando hay configuraciones (oculta los pasos tenant y facturador; muestra "Facturador: {razon_social}"); sin configuraciones, picker completo. Guardar → `POST`; error 422 `FACTURADOR_DISTINTO` → texto del backend. "Quitar" → `confirm` con el texto de SPEC §D.2 → `DELETE` → recarga.
- Texto fijo bajo la tabla (SPEC §D.3).
- `BackofficeUser` (tipo del front) gana `operation_configs`.

## 6. Fase F — Contrato, documentos y prueba conjunta

- `spec/openapi.yaml`: `PerfilDisponible`; `AuthResponse.perfiles`; `pending_actions` enum con `SELECT_PERFIL`; `/auth/perfil`; `/me/perfiles`; `/me/context` 409 con `reason`; `operation-config` GET/POST/DELETE y `PUT deprecated: true`; `BackofficeUserDetail.operation_configs`; `DocumentoResponse.perfil_emision`. Validar con la herramienta del repo (`npm run openapi:lint` o la que use `TASKS_PARIDAD_CONTRATO_FE`).
- Documentos: ya anotados `SPEC_SEGMENTACION_PERFIL_EMISION_v0.1.md` (§3, RN-08, RN-11) y `TASKS_SEGMENTACION_PERFIL_EMISION_v0.1.md` (SEG-014). Al cerrar, SEG-019/020 se anotan igual.
- Despliegue local: imagen de FS desde el commit (`git archive` + `infra/docker/*.Dockerfile`), `.local/segel-ensayo/bin/up.sh`; el servicio `migrate` aplica `0044` y `0045`. Verificar la tabla de migraciones antes de probar.

## 7. Guiones de prueba

### 7.1 Unitarias e integracion (`apps/api/tests`)

| Archivo | Cubre |
|---|---|
| `auth.middleware.test.ts` (ext.) | `perfil_select` fuera y dentro de la lista blanca; `uoc` en `req.user` |
| `context.service.test.ts` (ext.) | resolucion con `uoc`; sin `uoc` con 0/1/2 perfiles; `PERFIL_NO_DISPONIBLE` |
| `auth.perfil.test.ts` (nuevo) | CA-02, CA-03, RN-04, sin evento al elegir el activo, `full` sin contraseña → 400 |
| `auth.service.test.ts` (ext.) | login con 1 / 2 / 0 perfiles; refresh CA-05 |
| `facturas.service.test.ts`, `recibos.service.test.ts`, `notas.service.test.ts` (ext.) | perfil del contexto en el input del repositorio; NC con perfil del contexto |
| `backoffice.service.test.ts` (ext.) | CA-07 |
| `multiperfil.integration.test.ts` (nuevo, `DATABASE_URL_TEST`) | indice y disparador de `0044`; `listPerfilesDisponibles` con un perfil sin timbrado; `getReadinessChecks` con dos filas; revocacion por `operacion_config_id`; backfill `0045` sobre fixtures |

### 7.2 Playwright `scripts/segel-fs/playwright-multiperfil.cjs`

- Variables: `ENSAYO_USER` (dos perfiles), `ENSAYO_USER_UNO` (un perfil), `ENSAYO_PASSWORD_FILE`, `ENSAYO_PASSWORD_FILE_UNO`, `FS_URL` (`http://localhost:18492/app/`), `ESPERA_APROBACION_MS` (600000), `BACKOFFICE_URL` y `BACKOFFICE_TOKEN_FILE` para el paso 15.
- Sigue el orden 9 a 17 de SPEC §"Restricciones": regresion con un perfil → eleccion → factura 001-002 aprobada → cambio con contraseña (una incorrecta, luego la correcta) → NC por 001-001 aprobada → descarte de borrador → quitar y volver a agregar 001-002 desde el backoffice con la sesion abierta → viewports 1280 y 390.
- Verificaciones en base por `docker exec segel-fs-postgres-1 psql` (como `carga-seed.cjs`): `actividad_punto_perfil_id` de la factura y la NC, `fiscal_request_snapshot -> 'fiscal_context' ->> 'punto_expedicion'`, `login_attempts` con `INVALID_PASSWORD_PERFIL`, `audit_events` con `PERFIL_CAMBIADO`, `refresh_tokens.operacion_config_id`.
- Salida: `test-results/multiperfil/` con capturas por paso y viewport, y `resumen.json` con numeros fiscales y tiempos de aprobacion.
- Regresion al final: `playwright-ux-nueva-factura.cjs`, `playwright-editor-pc.cjs`, `playwright-documentos-escritorio.cjs` con `ENSAYO_USER_UNO`.

### 7.3 Backoffice

- `scripts/playwright-backoffice-multiperfil.cjs` en 1440 px contra `apps/backoffice` del stack local: agregar segundo perfil, intento con otro facturador (422 visible), quitar, lista actualizada.

## 8. Riesgos y mitigaciones

| Riesgo | Mitigacion |
|---|---|
| Un llamador de `getOperationalContext` sigue pasando `req.user!.id` | La firma nueva no acepta `string`: `typecheck` falla. `grep` adicional en MPU-004. |
| `getReadinessChecks` con N filas devuelve una arbitraria | Filtro por `uoc` (§2.3); caso en `multiperfil.integration.test.ts`. |
| Refresh token sin `operacion_config_id` tras el despliegue | §2.6 paso 4: una → se asigna sola; varias → pide elegir; cero → como hoy. |
| Cookie `perfil_select` colgada | D-8: `perfil_select` nunca tiene refresh; el refresh que termina en `perfil_select` se revoca y limpia la cookie. |
| Dos pestañas, puntos distintos | Comportamiento aceptado (C-3). La barra muestra el punto del token; 15 min de desfase maximo. |
| Cambio de perfil con factura a medio hacer | RN-06, §4.4: advertencia, "Descartar y cambiar", remonte del editor. |
| SIFEN rechaza la NC por otro punto | FE no la bloquea (verificado); SIFEN se prueba en MPU-016. Si rechaza: detener, documentar el codigo de rechazo, refinar D-1 (alternativa: NC por el punto de la factura, lo que exige que el operador tenga ese perfil asignado). |
| Numerador NCE ausente en un punto del cliente real | En el stack local existe (tipo 5 en 001-001 y 001-002). Para un cliente nuevo, el alta desde el export de FE (`OPERACION_ALTA_FACTURADOR_DESDE_EXPORT_FE`) debe verificar que cada punto por el que se emitiran NC tenga numerador tipo 5; se agrega a esa guia en MPU-018. |
| `main.tsx` de 9.311 lineas | Componentes nuevos autocontenidos; cambios en `OperationHome` acotados a la barra, `perfilesSesion` y `editorKey`. |
| El disparador RN-01 bloquea una operacion legitima del backoffice | La API valida antes con 422 y mensaje; el disparador solo salta ante datos inconsistentes. |
| Brute force por `POST /auth/perfil` | Mismo contador y bloqueo del login; `login_attempts` registra cada intento con `reason` propio para auditarlo. |
| Pruebas de integracion saltadas por falta de `DATABASE_URL_TEST` | MPU-000 deja la base de pruebas (Postgres del compose o `segel-fs-postgres-1` con una base aparte) y el comando documentado; la evidencia incluye el conteo de pruebas ejecutadas, no solo "verde". |
