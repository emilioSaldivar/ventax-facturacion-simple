# REVISION De La Implementacion Un Usuario Con Varios Perfiles De Emision v0.1

**Fecha:** 2026-11-10 · **Rama:** `feat/identidad-segel` · **Alcance revisado:** commits `0b24e51` a `e09d3d2` (52 archivos, +3295 / -329), contra `docs/SPEC_MULTIPERFIL_USUARIO_v0.1.md`, `docs/PLAN_MULTIPERFIL_USUARIO_v0.1.md` y `docs/TASKS_MULTIPERFIL_USUARIO_v0.1.md`. **Solo documenta.** No cambia codigo. Cada hallazgo se refina en SPEC/PLAN/TASKS antes de tocar nada.

## 1. Metodo

1. Lectura completa del diff `074d539..HEAD` por modulo: migraciones, token y middleware, auth (login, refresh, seleccion), contexto, persistencia del perfil en documentos, web del operador, backoffice (API y pantalla), contrato OpenAPI, guion de Playwright.
2. Cada pieza se contrasto con la regla o criterio de la SPEC que dice cumplir (RN-01 a RN-13, CA-01 a CA-13, D-1 a D-11) y con las evidencias de TASKS (pruebas unitarias, integracion, Playwright 51/51, confirmacion de FE).
3. Para cada duda que la lectura no resolvia se verifico en el codigo vigente (p. ej. como pide `carga-masiva.tsx`, si existe un refresh "single-flight", cuantos pedidos paralelos hace cada vista).

Clasificacion:

- **FIX**: comportamiento incorrecto o inconsistente con la SPEC; corregir antes de desplegar en `segel-fs`.
- **MEJORA**: funciona, pero deja un hueco de UX, robustez o cobertura que conviene cerrar en una v0.2.
- **DEUDA**: fuera del alcance de esta cadena; se anota para no perderlo.

## 2. Veredicto general

La implementacion cumple la SPEC en su camino principal y la prueba de punta a punta lo demuestra: eleccion al entrar, cambio con contraseña y bloqueo, perfil persistido en los cuatro tipos de documento, NC por otro punto aprobada en SIFEN test, backoffice con N puntos, compatibilidad con usuarios de un solo punto (regresion 41/41 y 31/31 sin tocar pruebas de emision). **Es apta para seguir a `segel-fs` despues de resolver los dos FIX de severidad alta (F-1 y F-2)**, que no aparecieron en la prueba por timing, no porque no existan.

| Severidad | Cantidad | Ids |
|---|---|---|
| FIX alta | 2 | F-1, F-2 |
| FIX media | 3 | F-3, F-4, F-5 |
| MEJORA | 8 | M-1 a M-8 |
| DEUDA | 4 | D-1 a D-4 |

## 3. Hallazgos FIX

### F-1 (alta) — Refresh concurrente: varios pedidos 401/409 a la vez rotan la misma cookie y el segundo manda al login

- **Donde:** `apps/web-operacion/src/main.tsx:7839` (401 → `refreshSession()`), `:7861` (409 de perfil → `refreshSession()`), `:7895` (`refreshSession`, sin estado compartido).
- **Que pasa:** el refresh token se **rota** en cada llamada (`rotateRefreshToken` revoca el actual). Si dos pedidos de la misma pantalla fallan a la vez (por ejemplo el token vencio y la vista Documentos dispara el listado y el detalle; o el backoffice quito el punto activo y una vista hace `Promise.all`, `main.tsx:2758` y `:5500`), ambos llaman `refreshSession()` con la **misma** cookie: el primero rota, el segundo recibe 401 "Refresh token invalido o expirado". En el camino 401 eso sube como error del pedido; en el camino 409 de perfil el `.catch(() => null)` convierte el fallo en 401 "Tu punto de expedicion cambio. Volve a entrar." y, en `bootstrap`, un `readinessResult` rechazado hace `clearSession` → login (`main.tsx:1084`).
- **Por que no salio en la prueba:** CA-11 se verifico navegando a Documentos justo despues de quitar el punto; el primer pedido que fallo fue uno solo. La condicion es de carrera y depende de que vista este abierta.
- **Preexistente en parte:** el camino 401 ya tenia este problema antes de la cadena; la cadena lo **amplia** al agregar el camino 409 y al hacer tres pedidos paralelos en `loadOperationalState` (`/me/context`, `/me/readiness`, `/me/perfiles`). Con el punto quitado, `/me/context` responde 409 y los otros dos 200, asi que el arranque no cae; otras vistas si.
- **Propuesta (PLAN v0.2):** `refreshSession` single-flight: una promesa compartida a nivel de modulo (`let refreshEnCurso: Promise<AuthResponse> | null`); todo llamador concurrente espera la misma rotacion y reusa su resultado. Al resolver, `emitirPerfilRequerido` se dispara una sola vez. Prueba: un caso de Playwright con el token de acceso vencido artificialmente (`JWT_ACCESS_TTL_MINUTES=1` en un stack de prueba, o borrando el token de `localStorage` y forzando dos pedidos) y otro con el punto quitado desde Documentos.
- **Verificacion sugerida:** CA nuevo "con el token vencido, dos pedidos paralelos renuevan una sola vez y ninguno termina en login".

### F-2 (alta) — Token de eleccion vencido deja la pantalla de eleccion sin salida clara

- **Donde:** `main.tsx:1356` (`SeleccionPerfilScreen`), `:1370` (`elegir`), `elegirPerfil` en `App` llama `/auth/perfil` con `retry=false`.
- **Que pasa:** el token `perfil_select` dura 10 minutos y **no tiene refresh (D-8)**. Si el operador deja la pantalla abierta mas de 10 minutos y elige un punto, la API responde 401 "Token de acceso invalido." y la pantalla lo muestra como error generico debajo de la lista; el boton sigue habilitado y cada clic repite el error. El unico camino es "Salir". Lo mismo si recarga la pagina: `bootstrap` no encuentra token en `localStorage`, el refresh no tiene cookie y vuelve al login sin explicar por que.
- **Propuesta:** en `elegir`, ante 401 (cualquier motivo) limpiar la sesion y volver al login con el mensaje "La eleccion de punto vencio. Volve a entrar." Opcional: un contador visible ("Tenes 10 minutos para elegir") o, mas simple, al cargar la pantalla guardar `Date.now()` y deshabilitar la lista al vencer. Documentar en la SPEC (§C.1) el comportamiento al recargar la pagina en esa pantalla.
- **Verificacion sugerida:** CA nuevo "token de eleccion vencido → login con mensaje", probado con `expiresIn` corto en la prueba unitaria y con un `page.clock` o un token manipulado en Playwright.

### F-3 (media) — El backoffice dice que "las sesiones abiertas se cierran", pero D-9 revisada dice lo contrario

- **Donde:** `apps/backoffice/src/main.tsx:2821` (texto del `confirm` al quitar un punto).
- **Que pasa:** tras la revision de D-9 (`6e78c34`), quitar un punto **no** revoca la sesion: el operador sigue con el punto restante o elige otro. El texto quedo del diseño anterior y le dice a soporte algo falso. Tambien queda desalineado el PLAN §5.1 original (ya corregido) y el comentario en `TASKS` MPU-013 ("revoca refresh del perfil").
- **Propuesta:** texto "Quitar el punto EST-PUNTO? El operador seguira con los puntos que le queden; si estaba usando este, la app le pedira elegir otro." Alinear MPU-013 en TASKS.

### F-4 (media) — `refreshSession` que asigna el unico punto restante registra la auditoria sin `facturador_id`

- **Donde:** `apps/api/src/modules/auth/auth.service.ts:263` (`facturadorId: null` en `PERFIL_SELECCIONADO` con `origen: "REFRESH"`); `seleccionarPerfil` si lo completa con `audit.facturadorDe(...)`.
- **Que pasa:** los eventos de perfil quedan con dos formas distintas: con facturador (login y app) y sin facturador (refresh). Cualquier consulta de auditoria por facturador pierde los cambios hechos por el refresh, que son justamente los que ocurren cuando el backoffice quita un punto (el caso que mas interesa auditar).
- **Propuesta:** pasar `audit.facturadorDe` tambien al refresh (o resolver el facturador desde `lista[0]`, que podria traer `facturador_id` en `PerfilDisponible`). Agregar a `auth.perfil.test.ts` la aserción de `facturadorId` en el caso "uno restante".

### F-5 (media) — Un pedido que cae en 409 de perfil se pierde sin aviso en las vistas que no son el arranque

- **Donde:** `main.tsx:7861-7868` (lanza `ApiClientError` 409 tras avisar a `App`); `App` cambia a `loading-context` y muestra `avisoPerfil`.
- **Que pasa:** D-10 es correcta (no reintentar un pedido con otro punto), pero el error lanzado llega al `catch` de la vista que hizo el pedido (por ejemplo `setMessage(error.message)` en Documentos o en el editor) **mientras App ya esta desmontando esa vista** para recargar el contexto. En la practica el operador ve un parpadeo del mensaje y luego "Informacion y estado" con el aviso. No es incorrecto, pero si el pedido era un `POST /facturas`, el editor pierde lo cargado sin la advertencia de RN-06 (no hubo ventana de cambio: el cambio lo hizo el backoffice).
- **Propuesta:** en el caso `RECARGAR_CONTEXTO`, antes de recargar, si `hayBorradorSinEmitir()` es verdadero, mostrar un aviso bloqueante "El backoffice cambio tu punto de expedicion. Lo que tenias cargado se descarta." con un solo boton "Entendido", y recien entonces recargar. Documentarlo como caso limite en la SPEC (hoy la tabla dice "la web fuerza refresh" sin hablar del borrador).

## 4. Hallazgos MEJORA

### M-1 — `pending_actions: ["RECARGAR_CONTEXTO"]` es un valor sintetico que no existe en el contrato

- **Donde:** `main.tsx:7849`, `:7867`; `spec/openapi.yaml:2835` restringe `pending_actions` a `CHANGE_PASSWORD | ACCEPT_TYC | SELECT_PERFIL`.
- **Que pasa:** la web reutiliza `AuthResponse.pending_actions` como canal interno para distinguir "elegir" de "recargar". Funciona, pero quien lea el contrato no encuentra ese valor y un cambio en `requierePerfil` podria confundirlos.
- **Propuesta:** que `emitirPerfilRequerido` reciba un evento tipado propio (`{ tipo: "ELEGIR", respuesta } | { tipo: "RECARGAR", respuesta }`) en lugar de mutar la respuesta de la API.

### M-2 — Si `/me/perfiles` falla, el operador con varios puntos no puede cambiar y el dialogo no sabe cual esta activo

- **Donde:** `main.tsx:1066-1075` (`perfilesSesion = []` si falla), `:1847` (`perfilActivo` sale de `activo_en_sesion`).
- **Que pasa:** por diseño "no bloquea la operacion", pero el operador no recibe ningun aviso de que la opcion de cambiar no esta. Ademas, si la lista llega pero sin `activo_en_sesion` (token sin `uoc`, D-6), el dialogo permite "cambiar" al mismo punto.
- **Propuesta:** reintentar `/me/perfiles` una vez; si sigue fallando, mostrar en "Informacion y estado" "No se pudo cargar la lista de puntos; recarga la pagina". Derivar `perfilActivo` tambien de `claimsDeToken(accessToken).uoc` como respaldo.

### M-3 — La contraseña del dialogo no tiene "mostrar contraseña" y no se limpia al cancelar

- **Donde:** `main.tsx:1415` (`CambioPerfilDialog`).
- **Que pasa:** el login tiene el boton de ojo (`EyeIcon`); el dialogo no. Al cancelar y reabrir, el dialogo se remonta (estado limpio), asi que lo segundo no es un problema real; lo primero es una inconsistencia de UX que en celular pesa.
- **Propuesta:** reutilizar `password-input` + `EyeIcon` del login.

### M-4 — El onboarding con varios puntos no tiene prueba de punta a punta

- **Donde:** `onboarding.routes.ts` (los dos `emitirSesion`), `OnboardingFlow` → `handleOnboardingComplete(…, respuesta)`.
- **Que pasa:** esta cubierto por la lectura del codigo y por las unitarias de `emitirSesion`, pero no hay un recorrido real "usuario nuevo con dos puntos → cambia contraseña → acepta TyC → elige punto". Es el camino que vera un cliente nuevo con varios puntos el primer dia.
- **Propuesta:** caso de Playwright con un usuario de ensayo creado con `must_change_password = true` y dos configuraciones (el OTP se registra por base como hace `carga-seed.cjs`).

### M-5 — El Playwright del backoffice (MPU-014) sigue pendiente

- **Donde:** `TASKS` MPU-014 PARCIAL. La API esta cubierta por `multiperfil.integration.test.ts`; la pantalla (tabla, "Agregar punto", 422 visible, "Quitar") solo por `typecheck` y `build`.
- **Propuesta:** con la clave de `admin-backoffice` autorizada, `scripts/playwright-backoffice-multiperfil.cjs` en 1440 px segun PLAN §7.3. Hasta entonces, la regla de validacion visual del proyecto no esta cumplida para esa pantalla.

### M-6 — Dos pestañas: no hay prueba del desfase de 15 minutos (C-3)

- **Que pasa:** C-3 acepta que una pestaña con token viejo siga por el punto anterior hasta que expire; el codigo lo contempla (`uocAnterior !== uoc nuevo` → recarga con aviso). No hay prueba que lo ejercite.
- **Propuesta:** Playwright con dos `BrowserContext` que comparten cookies (mismo `storageState`), cambio de punto en A, token de B vencido artificialmente → B recarga con "Tu punto de expedicion cambio".

### M-7 — `carga-masiva.tsx` descarga archivos con `fetch` directo y el token de la prop

- **Donde:** `apps/web-operacion/src/carga-masiva.tsx:272`.
- **Que pasa:** preexistente; no pasa por `createApiClient`, asi que no renueva el token ni entiende el 409 de perfil. Con varios puntos, una descarga tras un cambio de punto por el backoffice falla con un error crudo.
- **Propuesta:** usar `api.request` con `response` cruda, o al menos tratar 401/409 igual que el cliente.

### M-8 — "Ultimo numero" en la eleccion muestra la referencia local, no el numerador de FE

- **Donde:** `PerfilOpcionContenido` (`documento_nro` de `actividad_punto_perfiles`); mismo dato que ya usaba el pie del menu.
- **Que pasa:** en el stack local dice "0000001" cuando FE ya va por 8487. Para elegir punto, el numero no aporta y puede confundir.
- **Propuesta:** o quitar la linea de la eleccion, o mostrar el proximo numero real pidiendo a FE (`getNextFiscalNumber` ya existe en el editor). Decision de producto; va a FS-52.

## 5. DEUDA (fuera de esta cadena)

- **D-1** Alcance de lectura por perfil (SEG-012 a SEG-022): un operador con varios puntos ve todo el facturador. Es lo deseado hoy (D-2 de la SPEC), pero la segmentacion sigue pendiente y ahora tiene que contemplar la union de perfiles.
- **D-2** `PUT /backoffice/users/{id}/operation-config` deprecado: `carga-seed.cjs` y el alta guiada siguen por ese camino. Retirarlo cuando los guiones pasen a `POST`.
- **D-3** Fallas de integracion previas y ajenas a la cadena (`nota-credito-trabada`, `cargas`, `capacidad.fixes`) y dos `$ref` rotos en `openapi.yaml` (`responses/BadRequest`, `responses/Conflict`). Conviene una cadena corta de saneamiento.
- **D-4** El refresh sin single-flight (F-1) tambien afecta a flujos sin multiperfil; corregirlo beneficia a toda la app.

## 6. Lo que se reviso y esta bien (para no volver a dudar)

- `0044`: precondicion, indice `(usuario_id, actividad_punto_perfil_id)`, disparador RN-01 con `errcode 23514`, columna e indice en `refresh_tokens`. Reversa documentada.
- `0045`: copia literal de los pasos de perfil de `0034`, idempotente; los 2 presupuestos que quedan en `null` cumplen la regla "ante la duda, null".
- Token: `perfil_select` con lista blanca exacta (`req.path === ruta`), `uoc` validado como string; `isAccessTokenPayload` rechaza `uoc` vacio.
- `seleccionarPerfil`: valida el usuario por id ademas de username, bloqueo 423 antes de verificar la contraseña, mismo 401 para ajeno/inexistente/no emitible (RN-04), `resetFailedLogin` solo tras contraseña correcta, revoca la cookie anterior, auditoria sin contraseña (CA-13 verificado en logs).
- `refreshSession`: conserva el `uoc` si sigue emitible; con varias restantes revoca el refresh rotado y limpia la cookie (D-8); con una la asigna y actualiza la fila; con cero vuelve al comportamiento previo. `rotateRefreshToken` copia `operacion_config_id`.
- Contexto: `getOperationalContext` y `getReadinessChecks` filtran por `uoc`; `listPerfilesDisponibles` repite exactamente las condiciones de emitibilidad del contexto (no hay forma de elegir un punto que luego no resuelva).
- Persistencia: facturas (3 inserts), NC con perfil activo (D-1), recibos (`COALESCE` para no pisar en upserts), presupuestos (crear y duplicar). `perfil_emision` sale de una subconsulta en `COLUMNAS_DOCUMENTO`, asi que alcanza a listados, `returning` y candidatos de NC.
- Idempotencia intacta (RN-12): `external_ref` de facturas y NC no incluye el perfil; probado.
- Backoffice: `addOperationConfig` valida facturador con mensaje antes del disparador, duplicado → 409, rollback en todo error; `USER_DETAIL_SELECT` con `lateral ... limit 1` evita usuarios duplicados; metricas por `count(distinct usuario_id)`.
- Web: el token `perfil_select` no se guarda en `localStorage` (D-8, verificado); `useBorradorSinEmitir` en los cuatro editores; el aviso tras el cambio vuelve a "Informacion y estado"; la columna Punto solo con varios perfiles; el aviso RN-05 en la NC se mostro en la prueba real.
- Contrato: `/auth/perfil`, `/me/perfiles`, `operation-config` GET/POST/DELETE con `PUT deprecated`, `perfil_emision` en `DocumentoResponse`, `pending_actions` y `PerfilDisponible` documentados.

## 7. Orden sugerido para la v0.2

1. F-1 (single-flight del refresh) y F-2 (token de eleccion vencido): juntos, porque tocan `refreshSession` y `App`; nueva CA para cada uno.
2. F-3, F-4, F-5: chicos; pueden ir en el mismo commit que M-1.
3. M-4 y M-6: dos casos mas en `playwright-multiperfil.cjs`.
4. M-5 cuando se autorice la clave del backoffice.
5. M-2, M-3, M-7, M-8: UX; agrupar con FS-52/FS-53.

Nada de lo anterior bloquea el funcionamiento verificado; F-1 y F-2 si condicionan el despliegue en `segel-fs`, porque son los dos caminos por los que un operador real termina en el login sin entender por que.
