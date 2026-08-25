# SPEC Control De Reintentos De Emision v0.1

## Alineacion

- `AGENTS.md`
- `docs/METODOLOGIA_SDD.md`
- `docs/TASKS_VERIFICACION_FISCAL_AUTOMATICA_v0.1.md` (precedente de backoff + notificacion que esta iniciativa reutiliza)

## Objetivo

Reemplazar el reintento fijo cada 60 segundos, indefinido, sin aviso, del outbox de emision fiscal pre-emision (`factura_emision_outbox`) por: backoff creciente, un corte definitivo a las 24 horas que deja de reintentar solo, y una notificacion proactiva por correo cuando un documento lleva mas de 1 hora sin poder emitirse — reutilizando la infraestructura de backoff/notificacion que ya existe para la verificacion fiscal post-emision (F9).

## Hallazgo Que Origina Este Cambio

Incidente real en produccion (facturador AWAPURA, documento `10fa7979-d881-4725-8e66-b818374e6965`, 2026-08-14 a 2026-08-24): un perfil de emision fue desactivado en `facturacion-electronica` el 2026-07-29 al reasignar un punto de expedicion de actividad. El siguiente intento de emision de AWAPURA (2026-08-14) fallo con `422 EMISSION_PROFILE_NOT_AVAILABLE` y quedo reintentando **cada 60 segundos, sin parar, durante 10 dias — 14.138 intentos** — porque nadie lo detecto hasta que se reviso manualmente la base de datos.

Causa tecnica confirmada en el codigo:

- `processNextQueuedFiscalEmission()` (`apps/api/src/modules/facturas/facturas.service.ts:1047-1088`) captura cualquier `FiscalGatewayError` y llama a `repository.failPendingEmission()` con `retryAfterSeconds = 60` **hardcodeado** (linea 1070) y `recoverable: true` **hardcodeado** (linea 1079) — no hay backoff creciente ni limite.
- `failPendingEmission()` (`apps/api/src/modules/facturas/facturas.repository.ts:1071-1139`) siempre escribe `factura_emision_outbox.estado = 'FAILED_TEMP'` (linea 1086) — nunca `'FAILED_PERM'`.
- `FAILED_PERM` existe en el check constraint de la tabla (`db/migrations/0010_factura_emision_outbox.sql:14`) y en la clausula `WHERE` de `retryPendingEmission()` (`facturas.repository.ts:1165`, que ya permite reintentar manualmente un outbox en `FAILED_PERM`) — pero **ningun codigo lo produce hoy**. Es un estado muerto en el modelo de datos.
- `deriveAccion()` (`apps/api/src/modules/facturas/facturas.accion.ts:77-96`) ya tiene una rama para `ERROR_TEMPORAL` que devuelve `REQUIERE_SOPORTE` cuando `ageHours > HORAS_PERSISTENCIA_ERROR_TEMPORAL` (constante en `24`, linea 5) — es decir, la senal ya existe en la logica de negocio, pero solo se ve si un operador entra a mirar la lista de documentos o el card "Salud fiscal" del backoffice. **No hay ningun disparo proactivo** desde el worker de outbox: `notifyAccionRequerida()` (`facturas.notificaciones.ts:17-50`, generica y reutilizable sin cambios de firma) solo se invoca hoy desde `verificacion.worker.ts:54` (post-emision, cuando el documento ya tiene `document_uuid`).
- El worker analogo de verificacion post-emision (`verificacion.worker.ts`) ya resuelve correctamente este mismo problema para su propio caso: backoff creciente (`BACKOFF_MS`, lineas 16-22), corte a los 30 dias (`DIAS_CORTE_VERIFICACION`, linea 24) y notificacion con guarda anti-spam (`accion_notificada_at`, columna ya existente en `facturas_operativas` desde la migracion `0028_verificacion_fiscal.sql`, F9). El patron correcto ya existe en el repo — simplemente nunca se aplico tambien al outbox de emision.

## Alcance

Incluye:

- Backoff creciente en `factura_emision_outbox`, indexado por `attempts` (columna ya existente), reemplazando el `retryAfterSeconds = 60` fijo.
- Corte definitivo a las **24 horas** de antiguedad del documento sin lograr emitir: el outbox pasa a `FAILED_PERM` (deja de ser reclamado por el worker) y `facturas_operativas.estado` se fuerza a `ERROR_TEMPORAL` (para que `deriveAccion()` lo refleje de inmediato como `REQUIERE_SOPORTE`, ver mas abajo).
- Notificacion proactiva por correo, reutilizando `notifyAccionRequerida()` + el guard anti-spam `accion_notificada_at` ya existentes: se dispara la primera vez que, tras un intento fallido, `deriveAccion()` sobre el documento resultante devuelve `REQUIERE_ACCION` o `REQUIERE_SOPORTE` — igual que ya hace `verificacion.worker.ts:50-67`.
- Bajar `HORAS_PERSISTENCIA_ERROR_TEMPORAL` (`facturas.accion.ts:5`) de `24` a `1`, para que el aviso temprano llegue en la primera hora en vez de a las 24 horas (decision de negocio, 2026-08-24: alertar rapido es mas valioso que evitar ruido por un fallo aislado — con reintentos cada pocos minutos, "sigue fallando pasada 1 hora" ya es una senal fuerte de que no se va a autorresolver).
- Agregar `attempts`, `documento_created_at` y `accion_notificada_at` al resultado de `claimNextPendingEmission()` y al tipo `PendingFiscalEmission`, necesarios para calcular backoff/corte/guard sin queries adicionales.
- Agregar el parametro `outboxEstado: "FAILED_TEMP" | "FAILED_PERM"` a `failPendingEmission()`, reemplazando el `'FAILED_TEMP'` hardcodeado.

No incluye:

- Clasificar errores de `facturacion-electronica` como recuperables/no recuperables por codigo (ej. tratar `EMISSION_PROFILE_NOT_AVAILABLE` distinto de un timeout). Se descarta deliberadamente: mantener un catalogo de codigos de error para clasificar recuperabilidad requeriria mantenimiento continuo y quedaria desactualizado ante cambios en `facturacion-electronica` (exactamente el tipo de acoplamiento fragil que origino este incidente). El corte por tiempo/intentos es agnostico al codigo de error y no tiene ese riesgo.
- Cambios en el endpoint de reintento manual (`retryDocumentoEmission` / `retryPendingEmission`, `facturas.repository.ts:1141-1213`): ya soporta reintentar un outbox en `FAILED_PERM` sin cambios (linea 1165), es la via de recuperacion manual una vez que soporte corrige la causa raiz.
- Nueva migracion de base de datos: no hace falta ninguna columna nueva; `FAILED_PERM` ya existe en el constraint (migracion `0010`) y `accion_notificada_at` ya existe en `facturas_operativas` (migracion `0028`).
- Cambios en el frontend: `deriveAccion()`/`accion_detalle` ya se sirven al frontend sin cambios de contrato; el badge/semaforo ya sabe pintar `REQUIERE_SOPORTE`.
- Aplicar backoff/corte a la verificacion post-emision (`verificacion.worker.ts`): ya tiene su propio mecanismo (30 dias), fuera de alcance, no se toca.
- Segunda notificacion "definitiva" separada de la de corte a las 24h: se decide reusar el mismo guard `accion_notificada_at` de una sola notificacion por documento (ver Reglas De Negocio), consistente con el diseño ya existente de F9 ("a lo sumo una vez por documento").

## Reglas De Negocio

- **RN-1 (backoff)**: cada fallo de emision recalcula `next_attempt_at` segun una tabla de backoff creciente indexada por `attempts` (1-based, ya incrementado por `claimNextPendingEmission()` antes de fallar): 1m -> 5m -> 15m -> 30m -> 1h -> 2h -> 4h -> 6h (se repite el ultimo valor para intentos posteriores). El primer intento (`attempts=1`) mantiene el mismo `60s` que ya existia como default, sin regresion en el peor caso mas comun (fallo aislado que se autorresuelve rapido).
- **RN-2 (corte a 24h)**: en cada fallo, si `now() - facturas_operativas.created_at >= 24 horas`, el outbox pasa a `estado = 'FAILED_PERM'` en vez de `'FAILED_TEMP'` — deja de ser reclamado por `claimNextPendingEmission()` (que solo selecciona `'PENDING'`/`'FAILED_TEMP'`). No se programa un nuevo `next_attempt_at` util; el documento requiere reintento manual (`retryDocumentoEmission`) despues de que soporte corrija la causa.
- **RN-3 (estado local tras el corte)**: cuando ocurre el corte (RN-2), `facturas_operativas.estado` se fuerza a `'ERROR_TEMPORAL'` sin importar la clasificacion original del error (incluye el caso `TIMEOUT`, que hoy deja el documento en `'PENDIENTE_SIFEN'`) — una vez que el sistema deja de reintentar solo, `'PENDIENTE_SIFEN'` ("en cola, esperando") deja de ser una descripcion honesta del estado. `error.recoverable` pasa a `false` y `error.retry_after_seconds` a `null` en el jsonb persistido, para que quede trazable que fue un corte definitivo y no un fallo mas.
- **RN-4 (aviso temprano)**: tras cada fallo (recorte o no), si `deriveAccion()` sobre el documento resultante devuelve `REQUIERE_ACCION` o `REQUIERE_SOPORTE` y `accion_notificada_at` es `null`, se dispara `notifyAccionRequerida()` (mismos destinatarios y plantillas que F9: usuarios operativos del facturador + `email_administrativo` del tenant + `VENTAX_NOTIFY_EMAIL`) y se marca `accion_notificada_at`. Con `HORAS_PERSISTENCIA_ERROR_TEMPORAL = 1`, esto dispara la primera vez que un documento sigue en `ERROR_TEMPORAL` pasada una hora de creado — mucho antes del corte de 24h, dando margen para corregir sin llegar al `FAILED_PERM`.
- **RN-5 (una sola notificacion por documento)**: igual que en F9, `accion_notificada_at` es un guard de una sola vez por documento — si ya se noto a la 1h y el documento sigue fallando hasta el corte de 24h, no se envia un segundo correo. Se acepta este comportamiento (ya establecido en el repo) porque el primer correo ya informa que el sistema sigue reintentando y puede requerir revision; evita duplicar el mecanismo de notificacion para este caso.
- **RN-6 (fallo al notificar no bloquea el flujo)**: si `notifyAccionRequerida()` lanza una excepcion (ej. SMTP caido), se loguea y se continua — igual que `verificacion.worker.ts:61-63`. El fallo de emision ya se persistio correctamente antes de intentar notificar; nunca se revierte por un error de correo.
- **RN-7 (sin cambios para el flujo feliz)**: un documento que emite exitosamente en el primer intento, o que se recupera antes de llegar a la 1h, no ve ningun cambio de comportamiento visible mas alla del backoff (que de todas formas no llega a activarse si el intento 1 tiene exito).

## Entidades Afectadas

- `apps/api/src/modules/facturas/facturas.service.ts` (`processNextQueuedFiscalEmission()`).
- `apps/api/src/modules/facturas/facturas.repository.ts` (`claimNextPendingEmission()`, `failPendingEmission()`).
- `apps/api/src/modules/facturas/facturas.types.ts` (`PendingFiscalEmission`, firma de `failPendingEmission` en `FacturaRepository`).
- `apps/api/src/modules/facturas/facturas.accion.ts` (constante `HORAS_PERSISTENCIA_ERROR_TEMPORAL`).
- Sin cambios en `apps/api/src/modules/facturas/facturas.worker.ts` (el `tick()` no cambia, toda la logica nueva vive dentro de `processNextQueuedFiscalEmission()`).
- Sin cambios en `spec/openapi.yaml` (no hay contrato HTTP nuevo ni modificado; `FAILED_PERM` es interno al outbox, nunca expuesto como valor de `DocumentoEstado`).

## Casos Felices

1. Documento emite exitosamente en el primer intento (caso normal, mayoria de los casos) → sin cambios, `completePendingEmission()` corre igual que hoy.
2. Documento falla 2 veces por un problema transitorio real (ej. blip de red de 3 minutos) y emite exitosamente en el tercer intento (a los ~6 minutos con el nuevo backoff, antes de la 1h) → nunca se notifica a nadie, el sistema se autorresuelve como se espera.
3. Documento falla de forma persistente por una causa real que requiere correccion humana (como AWAPURA) → a la hora, un correo llega a los usuarios operativos + `email_administrativo` + Ventax con el detalle del error; a las 24h, si nadie corrigio, el outbox deja de reintentar (`FAILED_PERM`) sin generar mas carga ni logs.
4. Soporte corrige la causa raiz (ej. reconfigura el perfil de emision) y usa `retryDocumentoEmission` sobre el documento en `FAILED_PERM` → reintenta exitosamente sin cambios respecto al comportamiento actual de ese endpoint.

## Errores Relevantes

- `notifyAccionRequerida()` falla (SMTP caido, etc.) → se loguea, no revierte el fallo de emision ya persistido, no vuelve a intentar notificar en este mismo fallo (RN-6).
- El corte a 24h ocurre en medio de una ventana donde `facturacion-electronica` esta caida por completo (no es un error de configuracion, es una caida real de infraestructura) → el documento igual pasa a `FAILED_PERM` a las 24h; se acepta como tradeoff (ver RN-2): 24 horas de reintentos con backoff creciente es tiempo suficiente para que alguien reaccione a la alerta de la 1h, y el reintento manual sigue disponible una vez que el proveedor se recupera.
- Un documento con `error.code === "TIMEOUT"` llega al corte de 24h (nunca obtuvo `document_uuid`, por lo que el worker de verificacion post-emision jamas lo hubiera visto — su query exige `document_uuid is not null`) → RN-3 fuerza su estado a `'ERROR_TEMPORAL'` en el corte para que `deriveAccion()` lo refleje correctamente como `REQUIERE_SOPORTE` de inmediato, en vez de quedar mostrando `PENDIENTE_SIFEN`/`EN_PROCESO` hasta el umbral de 30 dias de la rama `PENDIENTE_SIFEN` (que no aplica aqui porque ese documento nunca sera tocado por el worker de verificacion).

## Criterios De Aceptacion

- Existe cadena SDD completa (`SPEC`, `PLAN`, `TASKS`) para esta iniciativa.
- Un documento que falla repetidamente en el outbox de emision ya no reintenta cada 60 segundos indefinidamente: el intervalo crece segun `attempts` y se corta a las 24 horas.
- Pasada 1 hora de fallos sin exito, los destinatarios configurados reciben un correo con el detalle del error (mismo mecanismo ya validado por F9).
- Pasadas 24 horas de fallos sin exito, el outbox queda en `FAILED_PERM` y dejo de generar nuevos intentos automaticos ni logs de reintento.
- El reintento manual (`retryDocumentoEmission`) sigue funcionando sin cambios sobre un documento en `FAILED_PERM`.
- No se requiere ninguna migracion de base de datos nueva.
- Tests unitarios cubren: calculo de backoff por `attempts`, transicion a `FAILED_PERM` al cruzar las 24h, disparo de notificacion guardado por `accion_notificada_at`, y que un fallo de notificacion no revierte ni bloquea el registro del fallo de emision.
