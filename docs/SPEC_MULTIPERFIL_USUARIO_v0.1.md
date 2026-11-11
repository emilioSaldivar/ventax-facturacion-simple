# SPEC Un Usuario Con Varios Perfiles De Emision v0.1

**Fecha:** 2026-11-10 · **Rama:** `feat/identidad-segel` · **Estado:** diseño aceptado por el usuario el 2026-11-10 (D-1 a D-4 y las confirmaciones C-1 a C-3); refinado el mismo dia para implementacion fina. **No se implementa hasta que el usuario lo indique.**

## Alineacion

- `docs/SPEC_SEGMENTACION_PERFIL_EMISION_v0.1.md`: define el perfil de emision (`actividad_punto_perfiles`), la configuracion operativa del usuario (`usuario_operacion_config`) y las fases F0 a F8. Esta SPEC **modifica** dos de sus premisas: la exclusion "el perfil nunca se elige al emitir" (§3) y la regla de una sola configuracion activa por usuario. Los cambios estan anotados en esa SPEC (§3, RN-08, RN-11) y en SEG-014.
- `docs/SPEC_IDENTIDAD_OPERATIVA_FACTURADOR_v0.1.md`: `titulo_operativo` y linea fiscal derivados del contexto; con varios perfiles cambian al cambiar de perfil.
- `docs/SPEC_UX_NUEVA_FACTURA_v0.1.md`: barra superior de 56 px con el facturador y la linea fiscal "RUC · Timbrado · Establecimiento · Punto · actividad". Esta SPEC convierte ese bloque en la accion de cambio de perfil cuando hay mas de uno.
- `docs/SPEC_BACKOFFICE_ADMIN_v0.1.md` y `docs/SPEC_IMPORT_CONFIG_FACTURADOR_v0.1.md` (IMP-031, `OperationConfigPicker`): asignacion de la configuracion operativa.
- `docs/SPEC_CARGA_MASIVA_FACTURAS_v0.1.md`: cada carga guarda su `actividad_punto_perfil_id` (`0037`) y un punto con `numeracion_facturas = CLIENTE` no emite facturas manuales (RN-22). No cambia.
- `docs/SPEC_NOTA_CREDITO_PARCIAL_v0.1.md` y `docs/SPEC_NOTA_CREDITO_TRABADA_v0.1.md`: la NC se arma desde la factura original y FE la recibe con `referencia.cdc`. No cambian; D-1 solo fija con que perfil se envia.
- `spec/openapi.yaml`: cambia (§E).
- `facturacion-electronica`: **sin cambios.** Verificado en el codigo de FE (rama `9e8c2cb`, 2026-11-10): `tenant-config-resolver.ts` resuelve establecimiento, punto, timbrado y numerador desde `emission_profile_code`; `issue-nce.use-case.ts:103-137` valida que la factura referenciada exista, sea FE, este aceptada por SIFEN y tenga el mismo receptor, y **no compara establecimiento ni punto** entre la NC y la factura. El numerador de la NC se toma por `(establecimiento, punto, tipo 5)` del perfil enviado (`OPERACION_PERFILES_EMISION_NUMERACION_v0.1.md`, §"Resolucion").

## Situacion actual

1. Un usuario tiene **una sola** configuracion operativa activa: indice unico `usuario_operacion_config_usuario_activa_uidx (usuario_id) where activo and deleted_at is null` (`db/migrations/0004_operational_context.sql:118`).
2. El contexto fiscal de cada pedido se resuelve en `PgOperationalContextRepository.getOperationalContext(userId)` (`apps/api/src/modules/context/context.repository.ts:43`) con `join usuario_operacion_config ... activo = true ... limit 1`. Los 62 llamadores de rutas (`facturas` 24, `recibos` 11, `notas` 10, `catalogo` 6, `clientes` 6, `entrega` 3, `cargas` 2) hacen `getOperationalContext(req.user!.id, operationalContextRepository)`.
3. La sesion es un JWT HS256 de 15 minutos (`JWT_ACCESS_TTL_MINUTES`, `env.ts:13`) con `sub, tenant_id, username, role, scope` (`token.service.ts:6`) y un refresh token de 30 dias en cookie `httpOnly`, `sameSite: lax`, `path: /api/v1/auth` (`auth.routes.ts:30-34`), una fila por token en `refresh_tokens` (`0003_auth.sql:48`). Ya existe un alcance restringido `scope: "onboarding_only"` con lista blanca (`auth.middleware.ts:16`).
4. La web renueva el token sola: ante un 401, `createApiClient` llama `/auth/refresh` y repite el pedido (`main.tsx:7350-7353`). La cookie es compartida por todas las pestañas del mismo navegador.
5. Cambiar de punto a un usuario lo hace el backoffice con `PUT /backoffice/users/{userId}/operation-config`, que **desactiva la anterior e inserta una nueva** (`backoffice.repository.ts:538-544`). Para un usuario que debe emitir por cuatro puntos hoy hay dos salidas, ambas tediosas: cuatro usuarios, o reasignarlo a mano cada vez.
6. El perfil **no se guarda en el documento**: `facturas_operativas.actividad_punto_perfil_id` existe desde `0033` pero ninguno de los tres `insert into facturas_operativas` (`facturas.repository.ts:496, 653, 801`) la escribe. Lo mismo en `recibos_dinero` (`recibos.repository.ts:59`) y `notas_comerciales` (`notas.repository.ts:119, 359`). SEG-014/019/020 pendientes.
7. La idempotencia no depende del perfil: `buildExternalRef` usa `facturador.id` y la `Idempotency-Key` de la UI (`facturas.service.ts:1903`); `buildNotaCreditoExternalRef` usa `facturador.id:facturaId:intento` (`:1968`). Cambiar de perfil no altera ninguna clave.
8. Ningun proceso en segundo plano arma contexto por usuario: `getOperationalContext` solo se llama desde rutas. El worker de verificacion resuelve por `facturador_id` del documento.
9. La web carga `/me/context` y `/me/readiness` una vez tras el login o el refresh (`main.tsx:938`) y muestra `titulo_operativo` y la linea fiscal en la barra (`main.tsx:1623`). No hay selector.
10. El `username` es `citext` unico (`0003_auth.sql:17, 31`). El usuario recomienda usar el correo como `username`.

## Objetivo

Que un usuario con un solo correo y una sola contraseña pueda emitir por cualquiera de los puntos de expedicion de **su** facturador: elige el punto al iniciar sesion y puede cambiarlo dentro de la app confirmando su contraseña. El punto activo es siempre visible, cada documento registra con que punto se emitio, y los usuarios con un solo punto no notan ningun cambio. FE no cambia.

## Alcance (v0.1)

### A. Datos

1. Un usuario puede tener **N configuraciones operativas activas**, todas del **mismo facturador** (RN-01). Se reemplaza el indice unico por usuario por uno unico por `(usuario_id, actividad_punto_perfil_id)` sobre filas activas, y un disparador rechaza una fila activa de otro facturador para el mismo usuario.
2. `refresh_tokens.operacion_config_id` (nullable) guarda la configuracion con la que se emitio el token, para que el refresh conserve el perfil.
3. Toda factura, nota de credito, recibo y presupuesto nuevo persiste `actividad_punto_perfil_id` del contexto del pedido (adelanta la escritura de SEG-014, SEG-019 y SEG-020; D-7).
4. Backfill de los documentos emitidos entre `0034` y este despliegue con la misma regla de `0034` (migracion `0045`).

### B. Sesion y seleccion de perfil

1. **Login.** `POST /auth/login` con credenciales validas y sin acciones pendientes de onboarding cuenta las configuraciones **emitibles** del usuario (definicion en §B.4):
   - **una:** token completo (`scope: "full"`) con el claim `uoc` (id de `usuario_operacion_config`) y cookie de refresh con `operacion_config_id`. Identico al comportamiento actual (RN-02).
   - **dos o mas:** `pending_actions: ["SELECT_PERFIL"]`, la lista `perfiles` y un token de alcance `perfil_select` de 10 minutos, **sin** cookie de refresh (al vencer, la API responde 401 y la web vuelve al login con el motivo: `SPEC_MULTIPERFIL_USUARIO_v0.2` RN-15). Ese token solo sirve para `POST /auth/perfil`, `GET /me/perfiles` y `POST /auth/logout`; en cualquier otra ruta responde 403 `PERFIL_REQUERIDO`.
   - **ninguna:** token completo sin `uoc` y refresh sin `operacion_config_id`; `/me/context` sigue respondiendo 409 "Usuario sin configuracion operativa completa" como hoy.
2. **Seleccion tras el login.** `POST /auth/perfil { operacion_config_id }` con token `perfil_select`: valida que la configuracion este en la lista emitible del usuario; emite token completo con `uoc` y cookie de refresh. No pide contraseña: el usuario la acabo de escribir. Registra `PERFIL_SELECCIONADO` (RN-08).
3. **Cambio dentro de la app.** El mismo `POST /auth/perfil { operacion_config_id, password }` con token completo: `password` **obligatoria** (400 `VALIDATION_ERROR` si falta; RN-04). Contraseña correcta y configuracion emitible → token completo nuevo con el `uoc` nuevo, refresh nuevo, **revocacion del refresh anterior** (el de la cookie recibida), `PERFIL_CAMBIADO`. Contraseña incorrecta → 401 y suma un intento fallido con el **mismo contador y umbral del login** (5 intentos, `auth.service.ts:8`); al llegar al umbral, 423 y usuario bloqueado. Elegir el perfil ya activo → 200 con token nuevo, sin evento (no es un cambio).
4. **Lista de perfiles.** `GET /me/perfiles` (tokens `full` y `perfil_select`) devuelve, para cada configuracion **emitible** del usuario: `operacion_config_id`, `establecimiento`, `punto_expedicion`, `perfil_emision_codigo`, `perfil_emision_alias`, `actividad_economica_codigo`, `actividad_economica_descripcion`, `actividad_economica_alias`, `titulo_operativo` (misma derivacion que el contexto), `timbrado`, `numeracion_facturas`, `documento_nro` (solo con numeracion del servicio) y `activo_en_sesion`. **Emitible** = pasa exactamente las condiciones del `where` actual del contexto: usuario activo y no bloqueado, tenant activo con suscripcion vigente, facturador activo, perfil activo con `timbrado`, `timbrado_inicio`, `documento_nro` y `credito_plazo_dias > 0`, y las cuatro dimensiones activas. Ordenada por establecimiento y punto.
5. **Refresh.** `POST /auth/refresh` emite el access token con el `uoc` guardado en la fila del refresh token **si sigue emitible**. Si no (lo quito el backoffice, el perfil se desactivo, perdio timbrado): se aplica la regla de §B.1 sobre la lista actual: una → se asigna sola; dos o mas → `SELECT_PERFIL` con token `perfil_select` y **la cookie de refresh se limpia y la fila se revoca** (no debe quedar un refresh valido sin perfil); ninguna → token completo sin `uoc` como hoy.
6. **Onboarding.** El token que emite `onboarding.service.ts` (`:187`, `:283`) al terminar el cambio de contraseña y la aceptacion de terminos aplica la misma regla de §B.1.
7. **Contexto.** `GET /me/context`, `GET /me/readiness` y las 62 rutas usan el `uoc` del token. Un token completo **sin** `uoc` (emitido antes del despliegue, o de un usuario sin configuracion) se resuelve por compatibilidad (D-6): una emitible → esa; ninguna → 409 `CONFLICT` con el mensaje actual; varias → 409 `PERFIL_REQUERIDO` "Elegi el punto de expedicion para continuar. Cerra sesion y volve a entrar.". Un token **con** `uoc` cuya configuracion ya no es emitible → 409 `PERFIL_NO_DISPONIBLE` "El punto de expedicion de tu sesion ya no esta disponible." (la web reacciona forzando un refresh, §C.6).
8. **Logout.** Sin cambios: revoca el refresh de la cookie. Un token `perfil_select` no tiene refresh; el logout solo limpia la cookie si la hubiera.

### C. Pantalla del operador (`apps/web-operacion`)

1. **Pantalla "Elegir punto de expedicion"**, entre el login y la app, cuando la respuesta trae `SELECT_PERFIL`. Logo Segel, "Hola, <display_name o username>", "¿Desde que punto vas a trabajar?", y una tarjeta por perfil: `titulo_operativo` en negrita; debajo "Establecimiento EST · Punto PUNTO · Timbrado NNN"; con numeracion del servicio, "ultimo numero NNNNNNN"; con numeracion del cliente, "solo carga de archivo"; a la derecha una flecha. Un clic elige y entra. Abajo, "Salir". Se pregunta **siempre** que haya mas de un perfil (D-3): no hay "recordar" ni entrada directa al ultimo usado.
2. **Perfil activo en la barra superior.** En >= 1024 px, el bloque del facturador (`topbar-facturador`) pasa a ser un boton cuando hay mas de un perfil: conserva el nombre y la linea fiscal, agrega un chevron y el `title` "Cambiar punto de expedicion". Con un solo perfil sigue siendo texto. En celular, el mismo boton sobre el bloque compacto "Timbrado · EST-PUNTO".
3. **Ventana "Cambiar punto de expedicion".** Lista de perfiles como en C.1 con el activo marcado "Activo" y no seleccionable; campo "Tu contraseña" (`type="password"`, `autocomplete="current-password"`); "Cambiar" (deshabilitado hasta elegir un perfil y escribir la contraseña) y "Cancelar". Al confirmar: `POST /auth/perfil`; con exito, reemplazo del token, recarga de `/me/context`, `/me/readiness` y `/me/perfiles`, vuelta a "Informacion y estado" y aviso "Ahora estas facturando por EST-PUNTO · titulo". 401 → "Contraseña incorrecta" bajo el campo, la ventana sigue abierta, el campo se vacia. 423 → la ventana se cierra, la sesion termina y el login muestra el mensaje del backend. Otro error → mensaje generico en la ventana.
4. **Documento sin emitir.** Si Nueva factura, Nota de credito, Recibo o Presupuesto tiene datos sin emitir, la ventana advierte "Tenes un documento sin emitir. Si cambias de punto se descarta." y el boton pasa a "Descartar y cambiar" (RN-06). Al confirmar, el editor se remonta vacio con el proximo numero del perfil nuevo. Un documento **ya emitido** en pantalla (resultado) no cuenta como "sin emitir".
5. **Pantalla "Informacion y estado"** muestra "Punto de expedicion: EST-PUNTO · titulo" y, con mas de un perfil, el enlace "Cambiar punto de expedicion" que abre la misma ventana.
6. **Sesion con perfil no emitible.** Si un pedido responde 409 `PERFIL_NO_DISPONIBLE`, la web fuerza `/auth/refresh`; si la respuesta trae `SELECT_PERFIL`, muestra la pantalla C.1; si trae token completo, recarga el contexto. Si el refresh falla, va al login con "Tu punto de expedicion cambio. Volve a entrar.".
7. **Nota de credito (RN-05).** Al elegir la factura, si su `perfil_emision` difiere del activo, aviso informativo "La factura original se emitio por EST-PUNTO; la nota saldra por EST-PUNTO (punto activo)". No bloquea.
8. **Documentos.** Columna "Punto" (EST-PUNTO) en la tabla de escritorio cuando el facturador tiene mas de un perfil; oculta con uno solo. Lee `documento.perfil_emision`.
9. **Sin cambios** en el editor de factura, en la carga masiva, en el catalogo ni en la agenda: todos leen `context` como hoy.

### D. Backoffice (`apps/backoffice`)

1. El detalle del usuario (`UserDetailView`, panel "Configuracion operativa") muestra una **tabla** de configuraciones activas (Establecimiento, Punto, Perfil, Actividad, Titulo operativo, Numeracion) con "Quitar" en cada fila y el boton "Agregar punto de expedicion", que abre `OperationConfigPicker` con el **facturador fijo** al de las configuraciones existentes (RN-01). Sin configuraciones, el picker elige tenant y facturador libremente, como hoy.
2. "Quitar" pide confirmacion; si es la ultima, la confirmacion advierte "El usuario quedara sin configuracion operativa y no podra facturar.". Quitar no cierra la sesion del operador (D-9): su proximo pedido responde 409 `PERFIL_NO_DISPONIBLE` y la renovacion reasigna o pide elegir (§B.5).
3. **Cambiar de facturador** a un usuario con configuraciones exige quitar todas primero. La API lo rechaza con 422 `FACTURADOR_DISTINTO` y el backoffice lo explica en pantalla con el texto fijo "Todas las configuraciones de un usuario son del mismo facturador (un RUC y un timbrado). Para otro facturador, el cliente necesita otro usuario y otro correo." (C-1).
4. El alta guiada (`UserCreateView`) sigue asignando **una** configuracion inicial; las demas se agregan desde el detalle.
5. Las metricas que cuentan "usuarios operativos" por facturador (`backoffice.repository.ts:725-731`) cuentan **usuarios distintos**, no configuraciones.
6. El `PUT` actual ("reemplazar por esta") se conserva un ciclo con el mismo comportamiento, marcado `deprecated`, para que `carga-seed.cjs` y los scripts de alta sigan funcionando hasta migrarlos.

### E. Contrato HTTP (`spec/openapi.yaml`)

1. `AuthResponse` gana `perfiles?: PerfilDisponible[]`; `pending_actions` admite `SELECT_PERFIL`.
2. Nuevo `POST /auth/perfil` (cuerpo `{ operacion_config_id: uuid, password?: string }`; 200 `AuthResponse` con `Set-Cookie`; 400 falta `password` con token completo; 401 contraseña incorrecta o perfil no disponible; 403 token de otro alcance; 423 bloqueado).
3. Nuevo `GET /me/perfiles` (200 `{ perfiles: PerfilDisponible[] }`).
4. `GET /me/context`: descripcion "el perfil activo de la sesion"; errores 409 `PERFIL_REQUERIDO` y `PERFIL_NO_DISPONIBLE` (campo `reason` en el detalle).
5. `GET /backoffice/users/{userId}/operation-config` (lista), `POST` (agrega, 201; 409 duplicado; 422 `FACTURADOR_DISTINTO`), `DELETE /backoffice/users/{userId}/operation-config/{configId}` (204). `PUT` conservado y `deprecated: true`.
6. `BackofficeUserDetail.operation_configs: UserOperationConfig[]` (con `id`); `operation_config` se conserva con la primera.
7. `DocumentoResponse.perfil_emision?: { establecimiento, punto_expedicion, perfil_emision_codigo, alias } | null`.

## Fuera de alcance (v0.1)

- **Alcance de lectura por perfil** (SEG-012 a SEG-022): documentos, catalogo, recibos y presupuestos siguen siendo **del facturador completo**. Cuando se implemente, el alcance del operador sera la **union de sus perfiles asignados** (D-2); se refina en esa cadena.
- **Rol de consulta** (SEG-023 a SEG-028) y cualquier rol de "administrador del cliente" (D-4).
- **Gestion de usuarios por el cliente**: la hace Segel desde el backoffice (D-4).
- **Recordar el ultimo punto** (D-3).
- **Elegir el punto por factura** dentro del editor. El punto es de la sesion.
- **Numeracion de recibos y presupuestos por perfil**: una serie por facturador (SPEC segmentacion RN-14).
- **Un usuario en varios facturadores o tenants** (C-1): otro RUC y timbrado es otro facturador, otro usuario y otro correo.
- **Invalidar todas las sesiones al cambiar de perfil** (C-3): se acepta que una pestaña con token viejo siga por el punto anterior hasta que expire.
- Cambios en FE, en el contrato con FE o en la logica fiscal.

## Decisiones

- **D-1 — Nota de credito por el punto activo** (usuario, 2026-11-10). La NC se emite con el perfil activo de la sesion aunque la factura original sea de otro punto del mismo emisor. Los perfiles y la separacion por rubro son de cara al publico (nombre de fantasia, KUDE); de cara a SIFEN, FS y FE no bloquean lo que SIFEN permite. FE no lo bloquea (verificado en codigo, ver Alineacion); SIFEN se verifica en MPU-016 antes de cerrar. La NC persiste el perfil **activo**, y la UI avisa cuando difiere (RN-05). Reemplaza "la NC hereda el perfil de la factura original" de SEG-014.
- **D-2 — Alcance futuro = union de perfiles** (usuario, 2026-11-10). Anotado en la SPEC de segmentacion (RN-08, RN-11).
- **D-3 — Preguntar siempre** (usuario, 2026-11-10). Obliga al emisor a tomar conciencia del punto por el que va a operar.
- **D-4 — Sin rol nuevo ni autogestion** (usuario, 2026-11-10). La "administradora" del cliente es una operadora con todos los puntos. Los usuarios los gestiona Segel.
- **D-5 — El perfil viaja en el token.** Un token = un punto. Descartados: header por pedido (el cliente elegiria el perfil en cada llamada; una pestaña vieja emitiria por el punto equivocado; contradice SEG-012) y columna "seleccionada" en la base (estado por usuario y no por dispositivo: un cambio en el celular alteraria la factura a medio hacer en la PC).
- **D-6 — Compatibilidad con tokens anteriores al despliegue** (§B.7). No se fuerza cierre de sesion.
- **D-7 — Perfil en recibos y presupuestos** ademas de facturas y NC (confirmado C-2): las columnas existen y el dato ya viaja en el contexto; evita un backfill despues.
- **D-8 — `perfil_select` sin refresh.** Un usuario que no eligio perfil no tiene sesion persistente: si cierra la pestaña, vuelve a loguearse. Evita una cookie valida que no sabe por que punto operar.
- **D-9 — Quitar un perfil NO revoca la sesion** (revisada el 2026-11-10 al implementar; la version original decia lo contrario y contradecia CA-11). El contexto filtra por configuracion activa, asi que el pedido siguiente responde 409 `PERFIL_NO_DISPONIBLE`; el refresh valida que el punto siga emitible y reasigna el unico restante o pide elegir (§B.5). Revocar los refresh mandaba al operador al login, que es justo lo que CA-11 evita.
- **D-10 — La web nunca reintenta un pedido con otro punto** (agregada el 2026-11-10). Si un pedido responde 409 `PERFIL_NO_DISPONIBLE`/`PERFIL_REQUERIDO`, o si un refresh por 401 devuelve un `uoc` distinto al del token anterior, el cliente HTTP renueva la sesion, recarga el contexto (o muestra la eleccion) y **lanza el error** en lugar de repetir el pedido: un `POST /facturas` repetido saldria por un punto que no estaba en pantalla (RN-06).
- **D-11 — Codigos de error** (agregada el 2026-11-10). La API usa los codigos existentes y el motivo va en `error.details.reason`: token `perfil_select` fuera de la lista blanca → 403 `FORBIDDEN` con `reason: PERFIL_REQUERIDO`; contexto sin punto con varias configuraciones → 409 `CONFLICT` con `reason: PERFIL_REQUERIDO`; punto de la sesion no emitible → 409 `CONFLICT` con `reason: PERFIL_NO_DISPONIBLE`; contraseña incorrecta en `/auth/perfil` → 401 `AUTH_REQUIRED` con `reason: PASSWORD_INCORRECTA`; punto ajeno/inexistente/no emitible → 401 con `reason: PERFIL_NO_DISPONIBLE`. Donde esta SPEC dice "403 `PERFIL_REQUERIDO`" o "409 `PERFIL_*`" se refiere a esa forma.

Confirmaciones del usuario (2026-11-10):

- **C-1** Un solo facturador por usuario (RN-01). Otro facturador = otro RUC y timbrado = otro usuario con otro correo.
- **C-2** Perfil persistido tambien en recibos y presupuestos (D-7).
- **C-3** Pestaña con token viejo sigue por el punto anterior hasta que su token expire (RN-09); la barra siempre muestra el punto real.

## Reglas

- **RN-01 — Un facturador por usuario.** Todas las configuraciones activas de un usuario pertenecen al mismo `facturador_id` (y por tanto al mismo tenant). La API lo valida con mensaje (422 `FACTURADOR_DISTINTO`); la base lo refuerza con un disparador.
- **RN-02 — Un perfil, cero cambios.** Un usuario con una sola configuracion emitible inicia sesion, refresca y opera exactamente como hoy. Ninguna pantalla nueva aparece. Las pruebas de emision existentes pasan sin modificacion.
- **RN-03 — El servidor decide el perfil.** El unico dato que el cliente manda es `operacion_config_id` en `POST /auth/perfil`, validado contra la lista emitible del usuario. Ningun otro endpoint acepta un perfil desde el cliente. El contexto de cada pedido sale del `uoc` del token.
- **RN-04 — Contraseña para cambiar.** Cambiar de perfil con una sesion completa exige la contraseña. Un intento fallido cuenta como intento fallido de login y bloquea con el mismo umbral. El mensaje de error no distingue "contraseña incorrecta" de "perfil ajeno" cuando el perfil no es del usuario (ambos 401 con el mismo texto), para no revelar ids validos.
- **RN-05 — Documento con perfil.** Toda factura, NC, recibo y presupuesto nuevo guarda el `actividad_punto_perfil_id` del contexto del pedido. La NC guarda el perfil activo; si difiere del de la factura, la UI avisa. La carga masiva ya lo guardaba (`0037`).
- **RN-06 — Cambiar descarta lo no emitido.** El cambio de perfil con un documento sin emitir en pantalla pide confirmacion explicita y descarta el borrador en memoria. Nunca se emite un documento con un contexto distinto al que estaba en pantalla al cargarlo.
- **RN-07 — Perfil no emitible, fuera de la lista.** Una configuracion cuyo perfil se desactivo, perdio timbrado o cuyo facturador se desactivo no aparece en `perfiles` ni se puede elegir; si era la de la sesion, el refresh vuelve a pedir eleccion y los pedidos en curso responden 409 `PERFIL_NO_DISPONIBLE`.
- **RN-08 — Trazabilidad.** Cada seleccion y cambio deja un `audit_event` (`tenant_id`, `facturador_id`, `usuario_id`, `entity_type = "usuario_operacion_config"`, `entity_id = nuevo`, `event_type = "PERFIL_SELECCIONADO" | "PERFIL_CAMBIADO"`, `metadata = { anterior, nuevo, establecimiento, punto_expedicion, ip, user_agent, origen: "LOGIN" | "APP" | "REFRESH" }`).
- **RN-09 — Un token, un punto.** El token de acceso lleva el `uoc`; cambiar de punto emite un token nuevo y rota el refresh. Dos pestañas con tokens distintos operan por puntos distintos sin interferir; la pestaña vieja sigue con su punto hasta que su token expire (15 min) y el refresh compartido le entregue el `uoc` vigente. La barra muestra siempre el punto del token en uso.
- **RN-10 — Numeracion intacta.** Cada perfil tiene su `documento_nro` en `actividad_punto_perfiles`; la numeracion fiscal la asigna FE por `(establecimiento, punto, tipo de documento)`. FS no la decide ni la adelanta. Un perfil con `numeracion_facturas = CLIENTE` sigue sin emitir facturas manuales (409 `NUMERACION_DEL_CLIENTE`, `facturas.service.ts:1539`) aunque este activo en la sesion.
- **RN-11 — Preferencias por perfil.** `tipo_transaccion_default` se guarda en el perfil activo (`updateTipoTransaccionDefault(context.actividad_punto_perfil_id)`), como hoy; cambiar de perfil cambia el valor por defecto que ve el operador. Es el comportamiento de `SPEC_PERSISTENCIA_TIPO_SERVICIO_FACTURA_v0.1`.
- **RN-12 — La idempotencia no cambia.** `external_ref` de facturas y NC no incluye el perfil (`facturas.service.ts:1903, 1968`). Un reintento tras cambiar de perfil no crea un segundo documento.
- **RN-13 — Sin secretos nuevos.** `POST /auth/perfil` no devuelve ni registra la contraseña; `audit_events.metadata` no la incluye; los logs de la API no imprimen el cuerpo del pedido.

## Casos limite

| Caso | Comportamiento |
|---|---|
| Usuario con dos configuraciones, una de un perfil sin timbrado | Login directo con la unica emitible (RN-07); la otra no aparece. |
| Backoffice quita el perfil activo mientras el operador trabaja | El pedido siguiente responde 409 `PERFIL_NO_DISPONIBLE`; la web renueva la sesion, que pide elegir o asigna el unico restante, recarga el contexto con el aviso "Tu punto de expedicion cambio" y no reintenta el pedido (§C.6, D-9, D-10). Si habia un documento cargado, antes muestra un aviso bloqueante (`SPEC_MULTIPERFIL_USUARIO_v0.2` RN-16). |
| Backoffice agrega un segundo perfil a un usuario con sesion abierta | Nada cambia hasta el proximo login o hasta que abra la ventana de cambio: `GET /me/perfiles` se consulta al cargar el contexto y al abrir la ventana. |
| Token completo sin `uoc` (anterior al despliegue), usuario con dos perfiles | 409 `PERFIL_REQUERIDO`; la web muestra "Cerra sesion y volve a entrar" (D-6). |
| Token `perfil_select` vencido (10 min) | 401 en `/auth/perfil`; la web vuelve al login. |
| Contraseña incorrecta cinco veces en la ventana de cambio | Usuario bloqueado (423) igual que en el login; soporte lo desbloquea. |
| Dos pestañas, se cambia de punto en una | La otra sigue con su token (hasta 15 min) y su barra muestra su punto; al refrescar toma el `uoc` nuevo y recarga el contexto (RN-09, C-3). |
| NC desde 001-002 sobre factura de 001-001 | FE la emite por 001-002 con numerador tipo 5 de 001-002; FS persiste el perfil 001-002; la UI avisa (D-1, RN-05). SIFEN: MPU-016. |
| Recibo imputado a facturas de dos puntos distintos | Permitido: recibos y presupuestos son del facturador (RN-14 de segmentacion); el recibo persiste el perfil activo solo como atribucion. |
| Carga masiva con sesion en un perfil `SERVICIO` | La carga toma el perfil activo (como hoy toma el unico); el operador elige el punto antes de subir el archivo. |
| Perfil activo con `numeracion_facturas = CLIENTE` | Nueva factura muestra el mensaje actual de 409 `NUMERACION_DEL_CLIENTE`; la pantalla C.1 ya lo anticipa con "solo carga de archivo". |
| Usuario `SOPORTE_INTERNO` o `ADMIN_INTERNO` con configuraciones | Misma regla: son usuarios como cualquier otro para el contexto operativo. |
| `DELETE` de la ultima configuracion | 204; el usuario queda sin contexto; `/me/context` 409 como hoy. |
| `POST` de una configuracion duplicada (misma `actividad_punto_perfil_id` activa) | 409 `CONFLICT`. |
| `POST` de una configuracion de otro facturador | 422 `FACTURADOR_DISTINTO` (RN-01, C-1). |
| Reintento de emision tras cambiar de perfil | Misma `external_ref` → FE responde idempotente; no se crea otro documento (RN-12). |

## Restricciones para las pruebas de punta a punta

Estas condiciones son obligatorias para que MPU-016 y MPU-017 sean validas. Si alguna no se cumple, la prueba se declara no concluyente y se documenta en TASKS.

**Entorno**

1. Stack local de Segel levantado con `.local/segel-ensayo/bin/up.sh`: `segel-fs-api-1` (`127.0.0.1:18491`), `segel-fs-frontend-1` (`127.0.0.1:18492`), `fe-segel-api-1` (`127.0.0.1:18489`) con sus workers `worker-batch`, `worker-status-sync`, `worker-correo`, `worker-cargas`. FE apunta a **SIFEN test**. Nunca contra `segel-fs` (la VPS) ni contra produccion.
2. Imagen de FS construida desde el commit que se valida (`git archive` + `infra/docker/*.Dockerfile`), migraciones `0044` y `0045` aplicadas por el servicio `migrate` del compose. Se verifica con `select * from schema_migrations` o la tabla equivalente antes de empezar.
3. FE en la version desplegada en el stack local al momento de la prueba (hoy `segel-rc4.31`); se registra el tag en la evidencia. FE **no se modifica**.
4. Clave del usuario de ensayo en `ENSAYO_PASSWORD_FILE`, fuera del repo. Ninguna clave en guiones, documentos ni capturas.

**Datos del facturador de ensayo** (verificados el 2026-11-10 en `segel-fs-postgres-1` y `fe-segel-postgres-1`)

5. Facturador `5057016-1` con dos perfiles activos `SERVICIO` con timbrado: `AC445203-E001-P001-FE-PTO` (001-001, actividad 45203) y `AC496099-E001-P002-FE-PTO` (001-002, actividad 96099).
6. En FE, el emisor tiene numeradores para **factura (tipo 1) y NCE (tipo 5)** en 001-001 y 001-002, ninguno bloqueado. Ambos perfiles son `SEPARATE_EXPEDITION_POINT` con `tipo_documento = 1`: la NC cae al numerador `(establecimiento, punto, 5)`, que existe. Esto se vuelve a comprobar antes de MPU-016 con la misma consulta.
7. `operador-ensayo` tiene hoy **una** configuracion (001-001). La segunda (001-002) se agrega con el `POST` nuevo del backoffice (MPU-013) una vez aplicada `0044`, **no por SQL**, para probar el camino real. Si el backoffice aun no esta, la prueba de API (MPU-005) puede insertar por SQL y lo registra como tal.
8. Un segundo usuario de ensayo con **una sola** configuracion (por ejemplo `carga.c01`, 001-002) para la regresion de RN-02 y CA-10.

**Lo que la prueba debe cubrir, en este orden**

9. Regresion con el usuario de un perfil (CA-01, CA-10) **antes** de tocar al de dos: si falla, el cambio rompio el caso base y no se sigue.
10. Login del usuario de dos perfiles → pantalla C.1 → eleccion de 001-002 → barra, titulo y ultimo numero de 001-002 (CA-08).
11. Factura por 001-002 hasta "Aprobada" en SIFEN test (espera por lote: hasta 10 minutos, patron `esperarAprobada` de `playwright-ux-nueva-factura.cjs`); se registra el numero fiscal `001-002-NNNNNNN` y se verifica en la base que `actividad_punto_perfil_id` es el de 001-002 y que `fiscal_request_snapshot -> 'fiscal_context' ->> 'punto_expedicion' = '002'` (CA-04).
12. Cambio a 001-001 desde la barra con contraseña; aviso; proximo numero de 001-001 (CA-08). Contraseña incorrecta una vez antes, verificando el mensaje y que `login_attempts` registra el intento con `reason = 'INVALID_PASSWORD_PERFIL'` (CA-03). **No** se llega al quinto intento en el stack con datos reales: el bloqueo se prueba en las unitarias.
13. NC por 001-001 sobre la factura del paso 11 (emitida por 001-002): aviso RN-05 visible; NC hasta "Aprobada" en SIFEN test; perfil persistido 001-001; numero `001-001-NNNNNNN` del numerador tipo 5 de 001-001 (CA-04, D-1). **Si SIFEN rechaza, se detiene la cadena y se refina D-1 con el usuario.**
14. Tres lineas cargadas en Nueva factura → ventana de cambio → advertencia y "Descartar y cambiar" → editor vacio con el proximo numero del otro perfil (CA-09).
15. Backoffice: quitar 001-002 al usuario de dos perfiles con su sesion abierta → el siguiente pedido de esa sesion responde 409 `PERFIL_NO_DISPONIBLE` → la web entra al unico perfil restante sin pedir eleccion (§C.6, RN-07, D-9). Volver a agregar 001-002 al terminar para dejar el dato como estaba.
16. Mismo recorrido de 10 a 14 en 1280 px y, 10, 12 y 14 en 390 px.
17. Al terminar, la base de FS del stack local queda con `operador-ensayo` en **dos** configuraciones (es el estado util para futuras pruebas) y se anota en la evidencia.

**Lo que no se prueba contra FE real** (se prueba en unitarias e integracion contra Postgres con `DATABASE_URL_TEST`)

18. Bloqueo al quinto intento (CA-03), token `perfil_select` en rutas prohibidas (CA-02), refresh con perfil no emitible (CA-05), token sin `uoc` (CA-06), `FACTURADOR_DISTINTO` y duplicado (CA-07), disparador RN-01, backfill `0045`.

## Criterios de aceptacion

- **CA-01** Usuario con una configuracion: login, refresh, `/me/context`, emision de factura y NC identicos a hoy; `npm run test -w apps/api` en verde **sin modificar ninguna prueba de emision** (solo cambia la firma en `context.service.test.ts`); `playwright-ux-nueva-factura.cjs` pasa sin cambios.
- **CA-02** Usuario con dos configuraciones: el login responde `SELECT_PERFIL` con dos `perfiles`, token `perfil_select` y **sin** `Set-Cookie`; con ese token `GET /facturas` responde 403 `PERFIL_REQUERIDO`; `POST /auth/perfil` con un `operacion_config_id` ajeno responde 401; con uno propio responde token completo con `Set-Cookie`, `GET /me/context` devuelve ese perfil y `refresh_tokens.operacion_config_id` lo guarda.
- **CA-03** Con token completo: `POST /auth/perfil` sin `password` → 400; contraseña incorrecta → 401 y `login_attempts` suma una fila con `reason = 'INVALID_PASSWORD_PERFIL'`; al quinto → 423 y `usuarios.bloqueado_at` seteado; contraseña correcta → token nuevo, refresh anterior con `revoked_at`, `audit_events PERFIL_CAMBIADO` con `anterior` y `nuevo`.
- **CA-04** Factura emitida con sesion en 001-002 persiste el `actividad_punto_perfil_id` de 001-002, su `fiscal_request_snapshot` lleva `punto_expedicion = '002'`, FE la numera `001-002-NNNNNNN` y SIFEN la aprueba; NC con sesion en 001-001 sobre esa factura persiste el perfil de 001-001, FE la numera `001-001-NNNNNNN` (tipo 5) y **SIFEN la aprueba**.
- **CA-05** Refresh con `operacion_config_id` que dejo de ser emitible: con dos o mas restantes responde `SELECT_PERFIL`, sin `Set-Cookie` de refresh (cookie limpiada) y la fila rotada queda revocada; con una restante responde token completo con ese `uoc`.
- **CA-06** Token completo sin `uoc`: con una configuracion, `/me/context` la resuelve; con dos, 409 `PERFIL_REQUERIDO`; con cero, 409 `CONFLICT` con el mensaje actual.
- **CA-07** Backoffice: `POST` de una segunda configuracion del mismo facturador → 201 y `GET` lista dos; `POST` de otro facturador → 422 `FACTURADOR_DISTINTO`; `POST` duplicado → 409; `DELETE` → 204 y la lista queda en una (la sesion del operador sigue, D-9); `PUT` deprecado deja una sola; el listado de usuarios muestra **una fila por usuario** aunque tenga varias configuraciones.
- **CA-08** Web, 1440 y 1280 px: pantalla C.1 tras el login con dos perfiles; un clic entra; la barra muestra el perfil elegido; el boton del facturador abre la ventana; contraseña incorrecta → error en la ventana; correcta → barra, titulo, ultimo numero y aviso cambian. En 390 px, lo mismo desde el bloque compacto.
- **CA-09** Web: con tres lineas en Nueva factura, la ventana muestra la advertencia y "Descartar y cambiar"; al confirmar, el editor queda vacio con el proximo numero del perfil nuevo.
- **CA-10** Web: usuario con un solo perfil no ve C.1, el bloque del facturador no es boton, no hay enlace "Cambiar punto de expedicion" ni columna "Punto".
- **CA-11** Backoffice quita el perfil activo de una sesion abierta: el siguiente pedido responde 409 `PERFIL_NO_DISPONIBLE` y la web continua con el perfil restante sin intervencion.
- **CA-12** `spec/openapi.yaml` valida (herramienta que ya usa el repo) y refleja §E; el cliente de la web y del backoffice consumen solo rutas documentadas.
- **CA-13** Ningun log de la API ni fila de `audit_events` contiene la contraseña ni el token (RN-13); se verifica con `docker logs segel-fs-api-1 | grep -c <contraseña>` = 0 durante la prueba.

## Limitaciones conocidas

- Una pestaña con un token viejo sigue operando por el punto anterior hasta 15 minutos (C-3). La barra siempre muestra el punto real del token.
- El `PUT` deprecado del backoffice se retira cuando `carga-seed.cjs` y los guiones de alta pasen a `POST`.
- La segmentacion de lectura (SEG-012 en adelante) sigue pendiente; hasta entonces un operador con varios puntos ve todo el facturador, que es lo deseado para el caso que motiva esta SPEC.
- `GET /me/perfiles` se consulta al cargar el contexto y al abrir la ventana; un perfil agregado por el backoffice no aparece en la barra hasta una de esas dos acciones.
