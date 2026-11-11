# PLAN Un Usuario Con Varios Perfiles De Emision v0.2 — Correcciones Tras La Revision

**Fecha:** 2026-11-10 · **SPEC:** `docs/SPEC_MULTIPERFIL_USUARIO_v0.2.md` · **Estado:** listo para implementar por otro agente **cuando el usuario lo indique**.

Contexto que el implementador necesita y no esta en el codigo:

- La v0.1 esta en `feat/identidad-segel`, commits `0b24e51` a `84a0dfc`; el stack local de Segel corre `2162094` (API y frontend). FE no se toca. Memoria del proyecto: `docs/TASKS_MULTIPERFIL_USUARIO_v0.1.md` §Evidencia tiene todo lo que ya se probo.
- Otra sesion trabaja en la misma rama: antes de cada commit, `git status` y excluir `docs/*IDENTIDAD_MARCA_SEGEL*`, `scripts/guia-uso-segel.cjs` y `TMP/`.
- Claves fuera del repo: operador de ensayo en `ENSAYO_PASSWORD_FILE` (ruta en la memoria del proyecto, no en documentos); `admin-backoffice` en `BACKOFFICE_PASSWORD_FILE` **solo si el usuario la autoriza**; nunca se copian valores a archivos ni a commits.
- Base de pruebas de integracion: `fs_multiperfil_test` en `segel-fs-postgres-1` (puerto `127.0.0.1:15494`), `DATABASE_URL_TEST=postgres://facturacion_simple:<clave del contenedor>@127.0.0.1:15494/fs_multiperfil_test`; la clave sale de `docker exec segel-fs-postgres-1 printenv POSTGRES_PASSWORD`, nunca de un archivo del repo.
- Despliegue local: construir `segel-fs-api`/`segel-fs-migrate`/`segel-fs-frontend` desde el commit (`git archive HEAD | tar -x -C <tmp>` + `infra/docker/api.Dockerfile` y `frontend.Dockerfile` con `--network host`), luego en `.local/segel-ensayo/fs`: `export APP_ENV_FILE=.env.segel; docker compose --env-file .env.segel -f docker-compose.yml up -d --no-build; docker compose ... restart frontend`. **API y frontend siempre del mismo commit**: si difieren, la app muestra "Nueva version disponible" y recarga en cada navegacion (hallazgo de la v0.1). Antes de recrear, etiquetar las imagenes actuales (`docker tag segel-fs-api:latest segel-fs-api:antes-v02`, idem migrate y frontend) y respaldar la base (`pg_dump` a `.local/segel-ensayo/backups/fs/`).

Orden: A (API) → B (web: cliente HTTP y sesion) → C (web: pantallas) → D (backoffice) → E (pruebas y docs). B es el nucleo; C depende de B.

## 1. Fase A — API

### 1.1 `facturador_id` en `PerfilDisponible` (SPEC A.1, A.3; F-4)

- `packages/shared/src/types/api.ts`, `interface PerfilDisponible`: agregar `facturador_id?: string;` (opcional en el tipo compartido; comentario "SPEC v0.2 A.3: la API siempre lo manda"). Rebuild de `packages/shared` (`npm run build -w packages/shared`) antes de `typecheck` de las apps.
- `apps/api/src/modules/context/context.repository.ts`, `listPerfilesDisponibles`: en el `select` agregar `uoc.facturador_id,`; en `PerfilRow` agregar `facturador_id: string`; en el `map` devolver `facturador_id: row.facturador_id`.
- `apps/api/src/modules/auth/auth.service.ts`, `refreshSession`, bloque `if (unico && audit)` (hoy `facturadorId: null`, linea ~263): `facturadorId: lista[0]!.facturador_id ?? null`.
- `apps/api/tests/auth.perfil.test.ts`: la funcion `perfil(id, punto)` agrega `facturador_id: "fac-1"`; en el caso "perfil no emitible y uno restante" (linea ~241) sumar `facturadorId: "fac-1"` al `objectContaining`. `tests/context.service.test.ts` y `tests/multiperfil.integration.test.ts` no requieren cambios (el campo es aditivo); en la integracion agregar `expect(perfiles.every((p) => p.facturador_id === facturadorId)).toBe(true)` en el primer caso.
- `spec/openapi.yaml`, `PerfilDisponible`: `facturador_id: { type: string, format: uuid }` y sumarlo a `required`.

## 2. Fase B — Web: cliente HTTP y sesion (`apps/web-operacion/src/main.tsx`)

### 2.1 Evento tipado (SPEC B.4; M-1)

Reemplazar el bloque de listeners (lineas ~11-30):

```ts
type EventoPerfil = { tipo: "ELEGIR"; respuesta: AuthResponse } | { tipo: "RECARGAR"; respuesta: AuthResponse };
const _perfilListeners: Array<(evento: EventoPerfil) => void> = [];
function onEventoPerfil(fn: (evento: EventoPerfil) => void): () => void { /* igual que onPerfilRequerido */ }
function emitirEventoPerfil(evento: EventoPerfil): void { for (const fn of [..._perfilListeners]) fn(evento); }
```

- En `App`, el `useEffect` que hoy llama `onPerfilRequerido` (linea ~1013) pasa a `onEventoPerfil`: `tipo === "ELEGIR"` → `mostrarEleccionPerfil(respuesta)`; `tipo === "RECARGAR"` → ver 2.3.
- En `createApiClient` (lineas ~7839-7868) se reemplazan los tres `emitirPerfilRequerido(...)`: el del 401 con `SELECT_PERFIL` → `{ tipo: "ELEGIR" }`; el del 401 con `uoc` distinto → `{ tipo: "RECARGAR" }`; el del 409 → `requierePerfil(refreshed) ? { tipo: "ELEGIR" } : { tipo: "RECARGAR" }`. Desaparece toda construccion `{ ...refreshed, pending_actions: ["RECARGAR_CONTEXTO"] }` (CA-22).

### 2.2 Renovacion de un solo vuelo (SPEC B.1; F-1, RN-14)

Reemplazar `refreshSession` (linea ~7895) por:

```ts
let _refreshEnVuelo: Promise<AuthResponse> | null = null;

/** RN-14: una sola llamada a /auth/refresh por pestaña mientras hay una en curso. */
function refreshSession(): Promise<AuthResponse> {
  if (_refreshEnVuelo) return _refreshEnVuelo;
  _refreshEnVuelo = (async () => {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" } });
    if (!response.ok) throw new Error(await readApiError(response));
    return (await response.json()) as AuthResponse;
  })().finally(() => {
    _refreshEnVuelo = null;
  });
  return _refreshEnVuelo;
}
```

- **Aviso una sola vez por renovacion:** en `createApiClient`, los dos caminos (401 y 409) deciden el evento a partir de `refreshed`; con N pedidos concurrentes, N llamadores reciben la misma `refreshed` y emitirian N eventos. Para emitir uno solo, `emitirEventoPerfil` deduplica por `respuesta.access_token`: guarda el ultimo token emitido en una variable de modulo (`_ultimoTokenAvisado`) y, si coincide, no vuelve a avisar. Con eso no hace falta tocar los llamadores.
- `bootstrap` (linea ~1039) usa el mismo `refreshSession`; no cambia.
- `claimsDeToken(accessToken).uoc` en el camino 401 sigue comparando contra el token del cliente que hizo el pedido: correcto, porque cada `createApiClient` cierra sobre su `accessToken`.

### 2.3 Aviso bloqueante por cambio externo con borrador (SPEC B.3; F-5, RN-16)

- Estado nuevo en `App`: `const [avisoBloqueante, setAvisoBloqueante] = useState<{ respuesta: AuthResponse } | null>(null);`
- En el listener, `tipo === "RECARGAR"`: si `hayBorradorSinEmitir()` → `setAvisoBloqueante({ respuesta })` y **no** recargar todavia; si no → el bloque actual (aviso, `loading-context`, `setAccessToken`, `setRecargaContexto`).
- Componente `AvisoCambioExterno({ onEntendido })`: misma estructura que `CambioPerfilDialog` (scrim + `role="dialog"` + `aria-modal`), titulo "Tu punto de expedicion cambio", texto "El backoffice cambio tu punto de expedicion. Lo que tenias cargado se descarta.", un boton `primary-action` "Entendido". Sin cierre por `Escape` ni por clic en el scrim (D-14). Se renderiza en `App` por encima de `OperationHome` cuando `avisoBloqueante` no es null.
- `onEntendido`: ejecuta el bloque de recarga con `avisoBloqueante.respuesta` y limpia el estado.
- Extraer el bloque de recarga a `function recargarConPunto(respuesta: AuthResponse)` para usarlo desde el listener y desde `onEntendido`.

### 2.4 Pantalla de eleccion: vencimiento y 401 (SPEC B.2; F-2, RN-15, D-16)

- `SeleccionPerfilScreen` (linea ~1356) gana props `onVencida: (mensaje: string) => void` y `onRefrescarLista: () => Promise<PerfilDisponible[]>`.
- Debajo del `h1`: `<p className="muted">Tenes 10 minutos para elegir.</p>`. Estado `vencida` que pasa a `true` con un `setTimeout` de `PERFIL_SELECT_TTL_MS = 10 * 60 * 1000` desde el montaje (limpiado en el cleanup). Con `vencida`: lista deshabilitada, texto "La eleccion vencio." y boton `primary-action` "Volver a entrar" que llama `onVencida("La eleccion de punto vencio. Volve a entrar.")`.
- En `elegir`, `catch`: si `e instanceof ApiClientError && e.status === 401`:
  - `motivoDeError(e) === "PERFIL_NO_DISPONIBLE"` → `setError("Ese punto ya no esta disponible.")`, `const lista = await onRefrescarLista()`; `lista.length === 1` → `void elegir(lista[0].operacion_config_id)`; `lista.length === 0` → `onVencida("No tenes puntos de expedicion asignados. Contacta con soporte.")`; si no, reemplazar `perfiles` (estado local inicializado desde la prop) y seguir.
  - cualquier otro 401 → `onVencida("La eleccion de punto vencio. Volve a entrar.")`.
- En `App`: `onVencida={(mensaje) => terminarSesionPorBloqueo(mensaje)}` (ya limpia sesion, estado y va al login con `errorMessage`; renombrar a `terminarSesionConMensaje` para que el nombre no mienta). `onRefrescarLista={async () => (await api.get<{ perfiles: PerfilDisponible[] }>("/me/perfiles")).perfiles}` (el token `perfil_select` tiene permitido `/me/perfiles`).
- `elegirPerfil` en `App` sigue con `retry=false`.

### 2.5 `/me/perfiles` con reintento y `perfilActivo` de respaldo (SPEC B.5; M-2)

- En `loadOperationalState`: si `perfilesResult.status === "rejected"`, un segundo `client.get("/me/perfiles")` dentro de `try/catch`; si tambien falla, `setPerfilesSesion([])` y `setPerfilesError(true)` (estado nuevo en `App`, pasado a `OperationHome` → `StatusView` como `perfilesError`).
- `StatusView`: con `perfilesError`, debajo de la linea "Punto de expedicion", `<p className="form-error">No se pudo cargar la lista de puntos de expedicion. Recarga la pagina.</p>`.
- `OperationHome`, `perfilActivo` (linea ~1847): `perfiles.find((p) => p.activo_en_sesion) ?? perfiles.find((p) => p.operacion_config_id === claimsDeToken(accessToken).uoc) ?? null`.

### 2.6 Cliente HTTP con respuesta cruda (SPEC B.7; M-7, RN-17)

- En `createApiClient`, extraer el cuerpo de `request` hasta el manejo de errores en `requestRaw<T = Response>(path, init, retry): Promise<Response>` que devuelve la `Response` sin leer el cuerpo cuando `response.ok`; `request` lo usa y luego hace el `json()`/204. Exponer `requestRaw` en el objeto devuelto.
- `carga-masiva.tsx`, `descargar` (linea ~272): `const respuesta = await api.requestRaw(ruta, {});` y seguir con `respuesta.blob()`. Quitar `apiBaseUrl` y `accessToken` de las props si ya no se usan para otra cosa (verificar con `grep`).

## 3. Fase C — Web: pantallas

### 3.1 Mostrar contraseña (SPEC B.6; M-3)

- `CambioPerfilDialog` (linea ~1415): estado `mostrar`; el `input` dentro de `<div className="password-input">` con `type={mostrar ? "text" : "password"}` y el boton `password-toggle` con `EyeIcon` (linea ~1234), igual que `LoginScreen` (linea ~1303).

### 3.2 Sin "Ultimo numero" (SPEC B.8; D-13, M-8)

- `PerfilOpcionContenido`: la tercera linea solo muestra "Solo carga de archivo" cuando `numeracion_facturas === "CLIENTE"`; en otro caso no se renderiza. `documento_nro` deja de usarse en la pantalla (sigue en el contrato por el pie del menu).

## 4. Fase D — Backoffice

### 4.1 Texto al quitar (SPEC C.1; F-3, RN-18)

- `apps/backoffice/src/main.tsx`, `quitarConfig` (linea ~2821): el texto con otros restantes pasa a "Quitar el punto EST-PUNTO? El operador seguira con los puntos que le queden; si estaba usando este, la app le pedira elegir otro.".

### 4.2 Playwright del backoffice (SPEC C.2; M-5)

- `scripts/playwright-backoffice-multiperfil.cjs`: login en `http://127.0.0.1:18492/backoffice/` con `admin-backoffice` y `BACKOFFICE_PASSWORD_FILE`; ir a Usuarios → `operador-ensayo`; verificar tabla con dos filas; "Quitar" 001-002 → una fila; "Agregar punto de expedicion" → tenant y facturador deshabilitados, contexto 001-002 disponible, guardar → dos filas; crear por API (con el token del admin) un intento de `POST operation-config` con otro facturador y verificar el mensaje 422 en pantalla no aplica (la pantalla fija el facturador): en su lugar verificar que el selector de facturador esta deshabilitado y que el texto fijo de RN-01 esta visible. Capturas en `test-results/backoffice-multiperfil/`. Deja los datos como estaban (dos puntos).
- Si el usuario no autoriza la clave: la tarea queda BLOQUEADA y se documenta, no se simula.

## 5. Fase E — Pruebas, docs y despliegue local

### 5.1 `playwright-multiperfil.cjs` ampliado (SPEC D.2)

Agregar al final del recorrido de 1440, antes de cerrar el contexto, y reutilizando `MPU_FACTURA_ID` para no emitir:

- **CA-14 (token vencido, dos pedidos):** obtener el token de `localStorage`, reemplazarlo por uno vencido. Como la API firma con HS256 y el secreto no esta disponible en el guion, la forma de "vencer" el token es **esperar**: no viable (15 min). Alternativa adoptada: borrar `ventax_factura_access_token` de `localStorage` y poner uno **invalido** (`"x.y.z"`); la API responde 401 igual que con uno vencido. Luego `page.evaluate` con dos `fetch` concurrentes a `/api/v1/facturas?limit=1` y `/api/v1/me/context` usando el cliente de la app no es posible desde fuera; en su lugar navegar a Documentos (listado + filtros hacen pedidos paralelos) y contar con `page.on("request")` las llamadas a `/auth/refresh` durante 5 s: debe ser **1**. Verificar que no aparece `input[name="username"]`.
- **CA-15 (punto quitado con pedidos paralelos):** `quitarPunto("002")` con la sesion en 002, luego abrir Documentos y el detalle del primer documento; contar `/auth/refresh` = 1; esperar `.aviso-perfil-banda`; barra en 001; sin login. `agregarPunto("002")` al final.
- **CA-17 (borrador + cambio externo):** sesion en 002, Nueva factura con tres lineas, `quitarPunto("002")`, disparar un pedido (por ejemplo escribir en el campo RUC, que busca en la agenda) → esperar `role=dialog` con "El backoffice cambio tu punto de expedicion"; clic "Entendido"; barra en 001; Nueva factura vacia. `agregarPunto("002")`.
- **CA-16 (eleccion vencida):** Playwright del repo es 1.61.1 (soporta `page.clock`). Nuevo contexto; `await page.clock.install()` **antes** de `page.goto`; login; en la pantalla de eleccion `await page.clock.fastForward(10 * 60 * 1000 + 1000)` → lista deshabilitada y boton "Volver a entrar" → login con "La eleccion de punto vencio. Volve a entrar.". Segundo caso, el 401 real: otro contexto, login, en la eleccion `page.route("**/auth/perfil", r => r.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { code: "AUTH_REQUIRED", message: "Token de acceso invalido." } }) }))` una sola vez, elegir → login con el mismo mensaje.
- **CA-18 (dos pestañas):** `ctxA` hace login y elige 002; `const estado = await ctxA.storageState()`; `ctxB = browser.newContext({ storageState: estado })` (cookies compartidas; `localStorage` tambien se copia, con el token de A). En A cambiar a 001 con contraseña. En B, invalidar el token en `localStorage` (`"x.y.z"`), navegar a Documentos: B renueva, recibe `uoc` de 001 distinto al anterior → aviso "Tu punto de expedicion cambio" y barra en 001. Nota: como `localStorage` de B tiene el token viejo de A (valido), hay que invalidarlo para forzar el refresh.
- **CA-19 (onboarding):** crear por SQL un usuario `mpu-onboarding@segel.invalid` con `must_change_password = true`, contraseña temporal conocida solo en memoria del guion (generada al vuelo, no escrita), rol operador y dos configuraciones (001 y 002) en el tenant del facturador de ensayo; recorrer `OnboardingFlow` como hace `carga-seed.cjs` (el OTP se registra por base: `update tyc_otp_sessions set otp_hash = encode(sha256('123456'), 'hex') ...`); verificar la pantalla de eleccion y la entrada. Borrar el usuario y sus filas al final (refresh_tokens, audit_events, login_attempts, usuario_operacion_config, tyc_aceptaciones, usuarios).
- **CA-23:** quitar del guion la verificacion de "Ultimo numero" si la hubiera (hoy no hay una explicita; la captura de la eleccion la mostraba).

### 5.2 Regresion

- `playwright-ux-nueva-factura.cjs` y `playwright-documentos-escritorio.cjs` con el usuario de un solo punto. Como en la v0.1, `operador-ensayo` tiene dos puntos: usar `ENSAYO_USER=carga.c01` si existe con un punto y clave disponible; si no, quitar temporalmente 001-002 a `operador-ensayo` por SQL antes de la regresion y reponerlo despues (documentar).

### 5.3 Documentacion

- `docs/SPEC_MULTIPERFIL_USUARIO_v0.1.md`: anotar en §B.1 el 401 al vencer el `perfil_select`; en la tabla de casos limite, la fila "Backoffice quita el perfil activo" pasa a decir que con borrador hay aviso bloqueante (RN-16).
- `docs/TASKS_MULTIPERFIL_USUARIO_v0.1.md` MPU-013: quitar "(revoca refresh del perfil)".
- `docs/REVISION_MULTIPERFIL_USUARIO_v0.1.md`: marcar cada hallazgo con el commit que lo cierra.
- `docs/BACKLOG.md` FS-54.

## 6. Riesgos

| Riesgo | Mitigacion |
|---|---|
| El single-flight oculta una renovacion fallida a los llamadores que esperaban | La promesa compartida rechaza para todos; cada llamador conserva su manejo actual del error. `finally` libera el vuelo. |
| Deduplicar el aviso por `access_token` deja sin aviso a un segundo cambio real con el mismo token | Imposible: un cambio real emite un token nuevo. |
| `page.clock` no disponible en la version de Playwright del repo | PLAN 5.1 CA-16 trae el camino alternativo con `page.route`. |
| CA-19 deja un usuario de prueba en la base si el guion falla a medias | Limpieza en `finally` y por `username` fijo, idempotente. |
| Cambiar `descargar` rompe la descarga de la plantilla | `playwright-planillas-ejemplo.cjs` existe y descarga; correrlo como regresion de M-7. |
