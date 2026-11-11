# SPEC Un Usuario Con Varios Perfiles De Emision v0.2 — Correcciones Tras La Revision

**Fecha:** 2026-11-10 · **Rama:** `feat/identidad-segel` · **Estado:** refinada para implementacion por otro agente; **no implementar hasta que el usuario lo indique** · **Base:** `docs/SPEC_MULTIPERFIL_USUARIO_v0.1.md` (sigue vigente; esta v0.2 solo la corrige y la amplia en los puntos que nombra) y `docs/REVISION_MULTIPERFIL_USUARIO_v0.1.md` (hallazgos F-1 a F-5, M-1 a M-8).

## Alineacion

- `docs/SPEC_MULTIPERFIL_USUARIO_v0.1.md`: reglas RN-01 a RN-13, decisiones D-1 a D-11 y criterios CA-01 a CA-13 se mantienen. Esta v0.2 agrega RN-14 a RN-18, D-12 a D-16 y CA-14 a CA-23.
- `docs/REVISION_MULTIPERFIL_USUARIO_v0.1.md`: cada punto de alcance cita el hallazgo que resuelve.
- `docs/SPEC_UX_NUEVA_FACTURA_v0.1.md`: la barra y el marco no cambian; solo se agrega un aviso bloqueante (§B.3) con los tokens visuales existentes.
- `spec/openapi.yaml`: sin cambios de contrato. `PerfilDisponible` gana un campo opcional (`facturador_id`, §A.3) que se documenta.
- `facturacion-electronica`: sin cambios.

## Objetivo

Cerrar los dos caminos por los que un operador real termina en el login sin entender por que (renovacion concurrente de sesion y token de eleccion vencido), alinear textos y auditoria con la decision D-9 revisada, proteger lo cargado cuando el punto cambia desde el backoffice, y completar la cobertura de prueba que la v0.1 dejo abierta. Todo sin cambiar el contrato con FE ni el comportamiento de los usuarios con un solo punto.

## Alcance (v0.2)

### A. API (`apps/api`)

1. **Auditoria del refresh con facturador (F-4).** El evento `PERFIL_SELECCIONADO` con `origen: "REFRESH"` lleva `facturador_id`, igual que los eventos de login y de la app. Para eso `PerfilDisponible` gana `facturador_id` (uuid, obligatorio en la API, opcional en el tipo compartido para no romper clientes) y el refresh lo toma de la lista, sin consulta extra.
2. **Mensaje del 401 por token de eleccion vencido.** Sin cambio de codigo: la API ya responde 401 `AUTH_REQUIRED` "Token de acceso invalido." cuando vence el `perfil_select`; la web lo trata (§B.2). Se documenta en la SPEC v0.1 §B.1 como comportamiento esperado.
3. `PerfilDisponible.facturador_id` se agrega a `listPerfilesDisponibles` y al contrato (`spec/openapi.yaml`).

### B. Web del operador (`apps/web-operacion`)

1. **Renovacion de sesion de un solo vuelo (F-1, RN-14).** `refreshSession` comparte una unica promesa mientras hay una renovacion en curso: todo pedido que caiga en 401 o en 409 de perfil durante esa ventana espera el mismo resultado y no vuelve a llamar a `/auth/refresh`. Al resolver, el aviso a `App` (`onPerfilRequerido`) se emite **una sola vez** por renovacion. Una renovacion fallida libera el vuelo para la siguiente.
2. **Token de eleccion vencido (F-2, RN-15).** En la pantalla "¿Desde que punto vas a trabajar?", si `POST /auth/perfil` responde 401 por cualquier motivo que no sea `PERFIL_NO_DISPONIBLE`, la app cierra la sesion y vuelve al login con el mensaje "La eleccion de punto vencio. Volve a entrar.". Si responde 401 con `PERFIL_NO_DISPONIBLE` (el backoffice quito ese punto mientras elegia), muestra "Ese punto ya no esta disponible" y vuelve a pedir `/me/perfiles` para refrescar la lista; si queda uno solo, lo elige; si no queda ninguno, va al login con "No tenes puntos de expedicion asignados". Ademas, la pantalla muestra debajo del titulo "Tenes 10 minutos para elegir" y, pasados 10 minutos desde que se mostro, deshabilita la lista y ofrece solo "Volver a entrar".
3. **Cambio de punto desde el backoffice con un documento sin emitir (F-5, RN-16).** Cuando la renovacion asigna otro punto (`RECARGAR_CONTEXTO`) y `hayBorradorSinEmitir()` es verdadero, antes de recargar el contexto la app muestra un aviso bloqueante "El backoffice cambio tu punto de expedicion. Lo que tenias cargado se descarta." con un unico boton "Entendido". Al confirmar, recarga como hoy. Sin borrador, recarga directo como hoy.
4. **Evento tipado en lugar de `pending_actions` sintetico (M-1).** `emitirPerfilRequerido` emite `{ tipo: "ELEGIR", respuesta }` o `{ tipo: "RECARGAR", respuesta }`. `pending_actions` queda tal como lo manda la API.
5. **`/me/perfiles` caido o incompleto (M-2).** Si `/me/perfiles` falla al cargar el contexto, se reintenta una vez; si vuelve a fallar, "Informacion y estado" muestra "No se pudo cargar la lista de puntos de expedicion. Recarga la pagina." y la barra no es boton. `perfilActivo` se deriva de `activo_en_sesion` y, si ninguno lo trae, del claim `uoc` del token.
6. **Mostrar contraseña en la ventana de cambio (M-3).** El campo "Tu contraseña" usa el mismo `password-input` con `EyeIcon` del login.
7. **Descarga de archivos en carga masiva (M-7).** `descargar` de `carga-masiva.tsx` deja de usar `fetch` directo con el token de la prop y pasa por el cliente HTTP comun (renueva el token y entiende el 409 de perfil). Se agrega al cliente una forma de pedir la respuesta cruda (`requestRaw`) para descargas.
8. **"Ultimo numero" en la eleccion (M-8, D-13).** Se quita la linea "Ultimo numero NNNNNNN" de las tarjetas de eleccion y del dialogo de cambio. Se conserva "Solo carga de archivo" para los puntos con numeracion del cliente.

### C. Backoffice (`apps/backoffice`)

1. **Texto al quitar un punto (F-3).** El `confirm` dice: con mas de un punto, "Quitar el punto EST-PUNTO? El operador seguira con los puntos que le queden; si estaba usando este, la app le pedira elegir otro."; con uno solo, el texto actual ("quedara sin configuracion operativa y no podra facturar").
2. **Playwright del backoffice (M-5).** `scripts/playwright-backoffice-multiperfil.cjs` en 1440 px: agregar un segundo punto, intento con otro facturador (422 visible), quitar, lista actualizada. Requiere la clave de `admin-backoffice` en `BACKOFFICE_PASSWORD_FILE`, fuera del repo.

### D. Pruebas (todas las apps)

1. **Unitarias (API):** `auth.perfil.test.ts` asegura `facturadorId` en el evento de refresh.
2. **Playwright del operador (`scripts/segel-fs/playwright-multiperfil.cjs`, ampliado):**
   - **Renovacion concurrente (CA-14):** con el token de acceso vencido artificialmente, dos pedidos paralelos renuevan una sola vez y ninguno termina en el login.
   - **Punto quitado desde una vista con pedidos paralelos (CA-15):** abrir Documentos con el detalle de un documento (dos pedidos), quitar el punto activo por backoffice (o SQL equivalente), navegar: la app recarga con el punto restante sin pasar por el login.
   - **Token de eleccion vencido (CA-16):** en la pantalla de eleccion, con el token manipulado a vencido, elegir → login con el mensaje.
   - **Borrador y cambio desde el backoffice (CA-17):** tres lineas cargadas, se quita el punto activo, el siguiente pedido dispara el aviso bloqueante; "Entendido" → recarga con el punto restante y editor vacio.
   - **Dos pestañas (CA-18, C-3):** dos contextos de navegador con las mismas cookies; cambio de punto en A; en B, con el token vencido, el siguiente pedido recarga con "Tu punto de expedicion cambio".
   - **Onboarding con dos puntos (CA-19, M-4):** usuario nuevo con `must_change_password` y dos configuraciones: cambia contraseña, acepta TyC (OTP registrado por base como en `carga-seed.cjs`), elige punto, entra.
3. **Regresion:** `playwright-ux-nueva-factura.cjs` y `playwright-documentos-escritorio.cjs` con el usuario de un solo punto, como en la v0.1.

## Fuera de alcance (v0.2)

- Alcance de lectura por perfil (SEG-012+), retiro del `PUT` deprecado, saneamiento de las pruebas de integracion previas y de los `$ref` rotos del contrato (DEUDA D-1 a D-3 de la revision).
- Mostrar el proximo numero real de FE en la eleccion (se decidio quitar la linea, D-13).
- Cualquier cambio en FE o en el contrato de emision.

## Decisiones

- **D-12 — Un solo vuelo de renovacion por pestaña.** La promesa compartida vive en el modulo de la web (una por pestaña). Entre pestañas sigue valiendo C-3: la primera que renueva gana y la otra, si pierde la carrera, recibe 401 del refresh; eso ya ocurria antes de esta cadena y se acepta (M-6 solo lo cubre con prueba).
- **D-13 — Sin "Ultimo numero" en la eleccion.** El dato es la referencia local de FS y confunde; el proximo numero real ya se muestra en el editor. Se quita en vez de consultar a FE desde la pantalla de login.
- **D-14 — El aviso bloqueante por cambio desde el backoffice no ofrece "conservar".** No existe forma segura de conservar un borrador y emitirlo por otro punto (RN-06). Un solo boton evita decisiones a medias.
- **D-15 — La eleccion no se renueva.** Se mantiene D-8 (el token `perfil_select` no tiene refresh). La mejora es avisar el limite y salir limpio al vencer, no extenderlo.
- **D-16 — El 401 `PERFIL_NO_DISPONIBLE` durante la eleccion refresca la lista en vez de ir al login.** Es el caso en que el backoffice quita un punto mientras el operador lo mira; perder la sesion por eso seria desproporcionado.

## Reglas

- **RN-14 — Renovacion de un solo vuelo.** Mientras hay una llamada a `/auth/refresh` en curso en la pestaña, ningun otro pedido inicia otra: espera la misma promesa. El aviso a `App` por cambio o eleccion de punto se emite una vez por renovacion.
- **RN-15 — Eleccion con limite visible y salida limpia.** La pantalla de eleccion muestra el limite de 10 minutos; al vencer (por tiempo en pantalla o por 401 de la API) la app cierra la sesion y vuelve al login con un mensaje que explica el motivo. Nunca deja la pantalla en un estado donde cada clic repite un error.
- **RN-16 — Cambio externo con borrador avisa antes de descartar.** Si el punto cambia por accion del backoffice y hay un documento cargado sin emitir, la app lo dice en un aviso bloqueante antes de recargar. Nunca descarta en silencio.
- **RN-17 — Un solo cliente HTTP.** Toda llamada a la API desde la web del operador, incluidas las descargas de archivos, pasa por `createApiClient` (o por su variante de respuesta cruda), para que la renovacion y los errores de perfil se traten en un solo lugar.
- **RN-18 — Textos coherentes con D-9.** Ningun texto de la app ni del backoffice afirma que quitar un punto cierra sesiones.

## Criterios de aceptacion

- **CA-14** Con el token de acceso vencido, dos pedidos paralelos de la misma vista producen **una** llamada a `/auth/refresh` (verificado por `page.waitForRequest`/contador de red), ambos pedidos terminan bien y la app no pasa por el login.
- **CA-15** Con el punto activo quitado y una vista que hace dos pedidos paralelos, la app recarga con el punto restante, muestra "Tu punto de expedicion cambio" y no pasa por el login; `/auth/refresh` se llamo una vez.
- **CA-16** En la pantalla de eleccion con el token vencido, elegir lleva al login con "La eleccion de punto vencio. Volve a entrar."; la lista se deshabilita a los 10 minutos con el texto "Volver a entrar".
- **CA-17** Con tres lineas cargadas y el punto activo quitado por el backoffice, el siguiente pedido muestra el aviso bloqueante; "Entendido" recarga con el punto restante y el editor vacio. Sin borrador, no hay aviso bloqueante.
- **CA-18** Dos pestañas con las mismas cookies: cambio de punto en A; en B, al vencer su token, el siguiente pedido recarga el contexto con el punto de A y el aviso, sin login.
- **CA-19** Usuario nuevo con dos puntos completa el onboarding y llega a la pantalla de eleccion; elige y entra.
- **CA-20** El evento `PERFIL_SELECCIONADO` con `origen: "REFRESH"` tiene `facturador_id` igual al del punto asignado (unitaria e integracion).
- **CA-21** El `confirm` del backoffice al quitar un punto con otros restantes no menciona cierre de sesiones; `playwright-backoffice-multiperfil.cjs` en 1440 px: agregar, 422 visible, quitar, lista.
- **CA-22** `grep -n "pending_actions: \[\"RECARGAR_CONTEXTO\"\]" apps/web-operacion/src/main.tsx` no devuelve nada; `grep -n "fetch(" apps/web-operacion/src/carga-masiva.tsx` no devuelve nada.
- **CA-23** Las tarjetas de eleccion y del dialogo no muestran "Ultimo numero"; siguen mostrando "Solo carga de archivo" cuando corresponde. Regresion de la v0.1 (`playwright-multiperfil.cjs` original, 51 verificaciones, con la verificacion de "Ultimo numero" quitada) en verde.

## Limitaciones conocidas

- Dos pestañas que renuevan en el mismo instante siguen compitiendo por la cookie (D-12); la que pierde vuelve al login. Es el comportamiento previo a la cadena.
- La pantalla de eleccion no persiste el token (D-8): recargar la pagina en esa pantalla lleva al login. Con RN-15 el operador al menos recibe el motivo.
