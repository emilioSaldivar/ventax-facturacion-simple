# SPEC Reintento De Emision Confirmado v0.1

## Alineacion

- `AGENTS.md`
- `docs/METODOLOGIA_SDD.md`
- `docs/SPEC_CONTROL_REINTENTOS_EMISION_v0.1.md` (outbox de emision, backoff y corte `FAILED_PERM`)
- `docs/SPEC_ALINEACION_CLAVE_VERIFICACION_FISCAL_v0.1.md` (dos claves de FE: compartida y de consumidor)
- `docs/facturacion-electronica-consumer-docs/GUIA_INTEGRACION_CONSUMIDORES.md` seccion 10 (`POST /v1/conciliacion/idempotency`)

## Objetivo

Que la accion **"Reintentar emision"** este disponible para el operador **solo** cuando el documento no fue recibido por `facturacion-electronica` (FE). Para un documento que FE ya recibio, la unica accion de estado es **"Verificar estado fiscal"**, y debe ser facil de encontrar.

## Hallazgo Que Origina Este Cambio

Caso real en produccion (2026-10-14), documento `document_uuid = 28751f7b-63dd-4f6d-a620-cc298f14990f`, CDC `01045436290001001000000212026101410920748257`:

- FE ya lo habia aprobado, pero el SaaS seguia mostrandolo pendiente. La ultima verificacion automatica habia sido 4 horas antes, lo que coincide con el backoff de 6h de `verificacion.worker.ts`.
- El operador presiono **"Volver a verificar"** y recibio `409 "El documento no tiene una emision fiscal recuperable en cola."`.
- Al presionar **"Verificar estado fiscal"**, el documento se actualizo correctamente. Esa accion consulta `GET /v1/documentos/{uuid}/sifen` por UUID con la clave compartida.

Causa en el codigo:

- El boton "Volver a verificar" (`apps/web-operacion/src/main.tsx`, bloque "Opciones avanzadas" del detalle) **no verifica**. Llama a `POST /facturas/:id/retry-emission`, que reencola el outbox de emision. Ese outbox ya estaba en `DONE`, porque FE habia recibido el documento, asi que `retryPendingEmission()` no encontro fila y devolvio el 409.
- El boton se habilita solo por `estado in (PENDIENTE_SIFEN, ERROR_TEMPORAL)`. `PENDIENTE_SIFEN` incluye documentos que FE ya recibio y que esperan respuesta SIFEN, para los cuales reintentar la emision no tiene sentido.
- El mismo endpoint aparece con otras dos etiquetas engañosas: "Reintentar" en el banner de accion y "Reintentar validacion" en la pantalla posterior a emitir.

Comprobado ademas: todas las consultas de estado y artefactos a FE van por `document_uuid` (`/documentos/{uuid}/sifen`, `/documentos/{uuid}/files/*`). El CDC solo se usa para resolver un UUID faltante (`/documentos/by-cdc/{cdc}`), conforme a `AGENTS.md`. Este SPEC no cambia esa regla.

## Definiciones

- **Documento no recibido por FE (candidato a reintento):** cumple todo lo siguiente:
  - `estado in ('ERROR_TEMPORAL', 'PENDIENTE_SIFEN')`;
  - `document_uuid is null` y `cdc is null`, es decir, FE nunca le asigno identidad;
  - `fiscal_status.code` es un string, lo que indica que el ultimo intento del outbox fallo y quedo registrado por `failPendingEmission()`.
- **Confirmacion con FE:** respuesta de `POST /v1/conciliacion/idempotency` para la `idempotency_key = external_ref` del documento.
  - `NOT_IMPACTED`: FE confirma que no lo recibio y se puede reintentar.
  - `IMPACTED`: FE si lo recibio, y no se reintenta.
  - `DUPLICATE_CONFLICT`: requiere soporte.

## Reglas De Negocio

- **RN-01 (visibilidad):** el backend expone `puede_reintentar_emision: boolean` en `DocumentoResponse`, calculado con la definicion de candidato. La UI muestra "Reintentar emision" **solo** si es `true`. No hay otra condicion de visibilidad en el frontend.
- **RN-02 (confirmacion obligatoria):** al ejecutar el reintento, el backend consulta primero a FE por idempotencia **antes** de reencolar. Solo reencola con `NOT_IMPACTED`. Asi se cubre el timeout, donde no se sabe si FE lo recibio (decision del usuario, 2026-10-14: "Consultar FE primero").
- **RN-03 (FE ya lo tenia):** con `IMPACTED`, el backend **no** reencola. Adopta la identidad que devuelve FE (`document_uuid`, `current_cdc`, `nro_factura`), marca el outbox `DONE`, deja el documento en `PENDIENTE_SIFEN`, agenda la verificacion automatica y ejecuta en el momento el refresh de estado por UUID. Responde `200` con el documento actualizado. La UI informa: "La factura ya habia llegado a facturacion electronica. Actualizamos su estado."
- **RN-04 (no confirmable):** con `DUPLICATE_CONFLICT` o `INVALID_KEY`, el backend responde `409 CONFLICT` con `details.motivo = REQUIERE_SOPORTE` sin reencolar. Si la consulta de idempotencia falla (timeout, 401, 403, 5xx), responde `503 INTERNAL_ERROR` con `details.motivo = CONFIRMACION_NO_DISPONIBLE` sin reencolar y con el mensaje "No pudimos confirmar con facturacion electronica si la factura llego. Intenta de nuevo en unos minutos." Nunca se reintenta a ciegas.
- **RN-05 (no candidato):** si el documento no cumple la definicion de candidato, responde `409` con "Este documento ya fue recibido por facturacion electronica. Usa 'Verificar estado fiscal'." si tiene `document_uuid` o `cdc`, o con el mensaje actual en otro caso.
- **RN-06 (sugerencia de accion):** `deriveAccion()` incluye `REINTENTAR` en `acciones_sugeridas` solo si el documento es candidato (RN-01). Se mantienen los demas valores y textos.
- **RN-07 (nombres en UI):**
  - La accion de reencolar se llama siempre **"Reintentar emision"**, en los tres lugares donde hoy aparece.
  - La accion de consultar estado se llama siempre **"Verificar estado fiscal"**. Hoy en la pantalla posterior a emitir se llama "Consultar estado fiscal".
  - Desaparecen "Volver a verificar", "Reintentar" a secas y "Reintentar validacion".
- **RN-08 (verificar, intuitivo):**
  - Cuando el documento esta en `EMITIENDO` o `PENDIENTE_SIFEN` y tiene `document_uuid` o `cdc`, el banner de accion del detalle muestra el boton **"Verificar estado fiscal"** junto al texto de verificacion automatica. No queda solo dentro de "Opciones avanzadas".
  - El texto del banner pasa a decir: "Estamos verificando el estado fiscal automaticamente. Ultima verificacion: X. Si ya deberia estar aprobada, podes verificar ahora."
  - El boton se habilita con `document_uuid || cdc`. Hoy exige `cdc`, pero el backend ya resuelve por UUID.
- **RN-09 (seguridad de claves):** la consulta de idempotencia usa la **clave de consumidor** del facturador (`facturadores.fe_consumer_api_key`, permiso `IDEMPOTENCY_RECONCILE`), igual que `/factura`. Si el facturador no tiene clave propia, se usa el gateway por defecto, igual que el worker de outbox. No se loguean claves.

## Alcance

Incluye:

- Campo derivado `puede_reintentar_emision` en `DocumentoResponse` (backend, OpenAPI y tipo del frontend).
- Confirmacion por idempotencia con FE dentro de `POST /facturas/:id/retry-emission` y adopcion del documento existente con `IMPACTED`.
- Cambios de etiqueta, visibilidad y ubicacion en los tres puntos de UI de `apps/web-operacion` y el boton "Verificar estado fiscal" en el banner.
- Ajuste de `deriveAccion()` (RN-06).

No incluye:

- Cambios en `facturacion-electronica`. Se usa solo el contrato publicado (`/v1/conciliacion/idempotency`).
- Cambios en el backoff de los workers (verificacion ni outbox).
- Consulta proactiva de idempotencia desde el worker de outbox. Se evalua en otra iniciativa si hace falta.
- Migraciones de base de datos: no se requieren columnas nuevas.
- Backoffice.

## Prerrequisito Operativo

Cada consumidor de FE asociado a un facturador activo debe tener el permiso `IDEMPOTENCY_RECONCILE` en staging y produccion. Sin ese permiso aplica RN-04 (`503`) y el reintento queda bloqueado, lo cual es seguro pero degrada la experiencia. Debe verificarse antes del deploy (ver TASKS T0).

## Criterios De Aceptacion

- **CA-01:** un documento con `document_uuid` o `cdc` nunca muestra "Reintentar emision" en ninguna pantalla.
- **CA-02:** un documento `ERROR_TEMPORAL` sin identidad fiscal y con fallo registrado muestra "Reintentar emision". Con FE `NOT_IMPACTED`, queda `EMITIENDO` y el outbox `PENDING`.
- **CA-03:** el mismo documento con FE `IMPACTED` no se reencola. Queda con `document_uuid` y `cdc` de FE, outbox `DONE` y estado refrescado, y la UI muestra el mensaje de RN-03.
- **CA-04:** si la consulta de idempotencia falla, la respuesta es `503` (`details.motivo = CONFIRMACION_NO_DISPONIBLE`), no se reencola y la UI muestra el mensaje de RN-04.
- **CA-05:** el detalle de un documento `PENDIENTE_SIFEN` con UUID muestra "Verificar estado fiscal" en el banner, y al presionarlo el estado se actualiza.
- **CA-07:** "Verificar estado fiscal" aparece una sola vez por pantalla, y nunca en documentos `EMITIDA`, `ANULADA` o `CANCELADO_LOCAL` (RN-10).
- **CA-06:** ya no existen en la UI las etiquetas "Volver a verificar", "Reintentar validacion" ni "Reintentar" sin calificar.

## Ajustes Durante La Implementacion (2026-10-15)

- **Codigos de error:** `ApiErrorCode` (`packages/shared`) es un conjunto cerrado que comparten API y frontend. En lugar de agregar `REQUIERE_SOPORTE` y `CONFIRMACION_NO_DISPONIBLE` como codigos nuevos, se usan los existentes (`CONFLICT` con 409 e `INTERNAL_ERROR` con 503) y el motivo viaja en `details.motivo`. El frontend muestra el `message` igual que antes.
- **Sin `external_ref`:** si el documento no tiene clave de idempotencia, no se puede confirmar con FE. Responde `409` con `details.motivo = REQUIERE_SOPORTE` y `details.result = SIN_IDEMPOTENCY_KEY`.

## RN-10 — Un solo "Verificar estado fiscal" (agregado 2026-10-15, tras validacion del usuario en prod)

Hallazgo del usuario en el uso real: en un documento en proceso, "Verificar estado fiscal" aparecia dos veces, en el aviso y en "Opciones avanzadas". En documentos ya emitidos seguia en "Opciones avanzadas" sin aportar nada.

- **Documento en `EMITIENDO` o `PENDIENTE_SIFEN` con identidad fiscal:** el boton aparece **solo en el aviso** (RN-08).
- **Documento `EMITIDA`, `ANULADA` o `CANCELADO_LOCAL`:** el boton **no aparece**. El estado es final para el operador, y la verificacion automatica ya no lo agenda.
- **Cualquier otro estado con identidad fiscal** (por ejemplo `RECHAZADA` o `ERROR_TEMPORAL` con UUID): el boton queda en "Opciones avanzadas", como hasta ahora.
- La leyenda "Ultima verificacion automatica: ..." se sigue mostrando en "Opciones avanzadas" aunque el boton no este ahi.
- La pantalla posterior a emitir aplica la misma regla. Esa pantalla no tiene aviso de accion, asi que el boton se muestra para `EMITIENDO`/`PENDIENTE_SIFEN` con identidad y para los demas estados no finales con identidad.
