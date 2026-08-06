# SPEC Backoffice — Alineación con Facturación Electrónica v0.2

**Versión:** 0.2 (refina v0.1 y agrega Verificación Fiscal Automática con guía de acción)
**Fecha:** 2026-07-31
**Estado:** EN REFINAMIENTO — pendiente PLAN/TASKS
**Reemplaza:** `SPEC_BACKOFFICE_ALINEACION_FE_v0.1.md` (el estado verificado y el mapeo F1–F8 de esa versión siguen vigentes; acá se refinan y se agregan F0 y F9)

## Alineación

- `docs/facturacion-electronica-consumer-docs/GUIA_INTEGRACION_CONSUMIDORES_v0.2.md` (contenido v0.3)
- `docs/facturacion-electronica-consumer-docs/openapi.yaml` (auth por endpoint; `GET /documentos/{uuid}/sifen` con `?refresh=true`)
- `docs/facturacion-electronica-consumer-docs/OPERACION_CONTRATO_CANONICO_v0.1.md` (`sifen_resolution`, linaje, reglas de operación)
- `docs/SPEC_RESILIENCIA_EMISION_F1_v0.1.md` (estados `CANCELADO_LOCAL`, refresh en idempotencia — ya implementado)
- `docs/TASKS_ESTABILIZACION_OPERATIVA_v0.1.md` (EST-013: códigos 0260/0422 = aprobado)
- Código: `apps/api/src/modules/facturas/*`, `apps/api/src/modules/fiscal-gateway/*`, `apps/web-operacion/src/main.tsx`

**Principio rector:** no romper lo existente. Todo es aditivo o con fallback al comportamiento actual.

---

## 0. F0 — Correcciones precondición (bugs detectados en la auditoría 2026-07-31)

Deben resolverse antes o junto con F9; son deuda que el diseño nuevo pisaría.

1. **Check constraint desalineado (bug real):** `facturas_operativas.estado` permite `'CANCELADA'` (migración 0007) pero el código escribe `'CANCELADO_LOCAL'` (`facturas.service.ts:737`, tipo `DocumentoEstado`). El cancel-send falla con violación de constraint en Postgres real. Migración nueva: reemplazar `'CANCELADA'` por `'CANCELADO_LOCAL'` en el check.
2. **Tipo del frontend desincronizado:** `DocumentoEstado` en `web-operacion/main.tsx:79` no incluye `CANCELADO_LOCAL` y `formatDocumentoEstado` (Record exhaustivo) devolvería `undefined`. Agregar el estado y su label.
3. **`QUEUED_BATCH` colapsa a `PENDIENTE_SIFEN`:** el mapeo (`mapDocumentStatusWithCode`) no distingue "encolado sin transmitir" de "transmitido esperando SIFEN" ni de "timeout de emisión". F9 necesita esa distinción — se resuelve persistiendo el status FE crudo (ver F9.2), sin agregar estados locales nuevos.

---

## 1. Estado actual (resumen; detalle en v0.1 y en la auditoría)

- **Verificación fiscal hoy es 100% manual:** el operador debe abrir el documento, expandir "Opciones avanzadas" y pulsar "Verificar estado fiscal" (`POST /facturas/:id/refresh-status`). Ningún worker actualiza estados: el outbox (`facturas.worker.ts`) solo emite pendientes, un job por tick.
- Un documento `PENDIENTE_SIFEN` queda así **para siempre** si nadie lo consulta; el usuario no sabe si debe esperar, actuar o escalar.
- El diagnóstico depende de re-parsear `fiscal_response_snapshot` (JSON crudo SIFEN) recursivamente en cada render; no hay columnas estructuradas (`sifen_last_checked_at`, código de resultado).
- La guía al usuario es mínima: mensajes genéricos (`getRecoverableMessage`), un solo código especial casuístico (1306), y las acciones útiles están escondidas en `<details>`.

---

## 2. F9 — Verificación fiscal automática + guía de acción intuitiva (NUEVO — prioridad del negocio)

### 2.1 Objetivo

Que el operador **nunca tenga que "ir a verificar"**: el sistema verifica solo, y cuando algo requiere intervención se lo dice en lenguaje de acción ("qué hacer"), no en lenguaje fiscal ("qué código devolvió SIFEN").

### 2.2 Modelo de datos (aditivo)

Migración sobre `facturas_operativas`:

| Columna nueva | Tipo | Uso |
|---|---|---|
| `fiscal_status_raw` | text | Último `status` crudo del backend FE (`APPROVED`, `QUEUED_BATCH`, `REJECTED`, ...) — resuelve F0.3 sin tocar el enum local |
| `sifen_result_code` | text | Último `dCodRes`/`result_code` estructurado (hoy solo vive dentro del JSON) |
| `sifen_result_message` | text | Último mensaje SIFEN legible |
| `sifen_last_checked_at` | timestamptz | Última verificación contra FE (manual o automática) |
| `verificacion_next_at` | timestamptz | Próxima verificación programada (backoff) |
| `verificacion_attempts` | int default 0 | Intentos de verificación desde el último cambio de estado |

`updateFiscalStatus` (repository) pasa a poblar estas columnas en **todos** los caminos (emisión, refresh manual, refresh silencioso, worker nuevo) — una sola función de persistencia, sin duplicar lógica.

### 2.3 Worker de verificación

Nuevo worker independiente del outbox, mismo patrón (`SKIP LOCKED`, lote propio, guard no reentrante):

- **Selección:** documentos con `document_uuid`, `estado IN ('PENDIENTE_SIFEN','EMITIENDO')`, `deleted_at IS NULL`, `verificacion_next_at <= now()`. Índice parcial nuevo sobre `(verificacion_next_at) WHERE estado IN (...)`.
- **Acción por documento:** `GET /documentos/{uuid}/sifen?refresh=true` vía el gateway (misma ruta que el refresh manual — reusa `refreshDocumentoStatus` internamente, no duplica mapeo).
- **Backoff (definido en refinamiento 2026-07-31):** 5m (primer check temprano, aprovecha que BATCH transmite en ~60s) → 30m → 1h → 6h → 12h → 24h (tope, sigue cada 24h). Se reinicia si el documento cambia de estado. Documentos > 30 días sin resolución dejan de verificarse automáticamente y pasan a `REQUIERE_SOPORTE` (ver 2.4).
- **Alcance:** `PENDIENTE_SIFEN` y también `EMITIENDO` con `document_uuid` (recupera documentos colgados por crash a mitad de emisión).
- **Config:** `FE_VERIFY_WORKER_ENABLED` (default `true`), `FE_VERIFY_WORKER_INTERVAL_MS` (default 30000), `FE_VERIFY_BATCH_SIZE` (default 10). Con la variable en `false`, el sistema queda exactamente como hoy (rollback trivial).
- **Clave:** usa la clave compartida según F1 (los endpoints `/documentos/*` son de clave compartida en el contrato FE). Mientras F1 no esté desplegado, usa la clave actual — el worker no depende de F1.

### 2.4 Estado de acción derivado (la capa "intuitiva")

Se agrega un campo **calculado** (no persistido como fuente de verdad) `accion`, derivado de `estado` + `fiscal_status_raw` + `sifen_result_code` + `verificacion_attempts`, con exactamente 4 valores:

| `accion` | Cuándo | Qué ve el usuario |
|---|---|---|
| `OK` | `EMITIDA` (aprobada 0260/0422), `ANULADA`/`CANCELADO_LOCAL` intencionales | Verde. Sin llamado a la acción. |
| `EN_PROCESO` | `EMITIENDO`, `PENDIENTE_SIFEN` dentro de la ventana de verificación (ej. < 24 h y con verificaciones automáticas activas) | Amarillo. "En verificación automática — no necesitás hacer nada." Muestra `sifen_last_checked_at` ("verificado hace 5 min"). |
| `REQUIERE_ACCION` | `RECHAZADA` con causa corregible por el usuario (catálogo 2.5), `ERROR_OPERATIVO` | Naranja. Mensaje de causa en lenguaje simple + **botones de la acción concreta** (reintentar / corregir y reemitir / crear NCE). |
| `REQUIERE_SOPORTE` | `RECHAZADA` sin acción de usuario posible, `ERROR_TEMPORAL` persistente (> N intentos), `PENDIENTE_SIFEN` vencido (> 30 días), linaje `INCONSISTENT`, `DUPLICATE_CONFLICT` | Rojo. "Necesita revisión de soporte" + botón **"Copiar datos para soporte"** (arma automáticamente: `document_uuid`, CDC, código y mensaje SIFEN, fecha — exactamente lo que la guía FE sección 17 pide al escalar). |

La derivación vive en el backend (`facturas.service.ts`), se expone en `GET /facturas` y `GET /facturas/:id` como `accion` + `accion_detalle { titulo, descripcion, acciones_sugeridas[] }` — el frontend renderiza, no decide.

### 2.5 Catálogo de causas SIFEN → acción (data-driven, extensible)

Tabla en código (no DB) `sifen-causa-catalogo.ts`: `{ codigo | patron, categoria: USUARIO | SOPORTE, titulo, descripcion, acciones: [REINTENTAR | CORREGIR_REEMITIR | CREAR_NCE | CONTACTAR_SOPORTE] }`.

Carga inicial mínima (se amplía con casuística real):

- `0260`, `0422` → aprobado (ya cubierto por EST-013).
- `1306` (ya casuístico hoy en `getRejectedSifenMessage`) → migra al catálogo.
- Errores de datos del receptor (RUC inexistente/inválido) → `USUARIO`: "Corregí el documento del cliente y volvé a emitir".
- Timbrado/numeración → `SOPORTE`.
- **Default sin match:** `SOPORTE` (nunca dejar al usuario sin salida).

### 2.6 UI en web-operacion (alcance mínimo de esta iteración)

- **Lista de documentos:** el semáforo emoji actual pasa a reflejar `accion` (4 colores) en vez del estado interno; tooltip con `accion_detalle.titulo`.
- **Detalle:** banner de acción arriba del todo (no dentro de `<details>`): título + descripción + botones de las acciones sugeridas. Las acciones ya existen como endpoints (retry-emission, NCE, anular) — solo se promueven fuera de "Opciones avanzadas" cuando aplican.
- **"Verificar estado fiscal" manual se mantiene** (dentro de avanzadas) como override, mostrando "última verificación automática: hace X".
- La pantalla post-emisión usa el mismo `accion_detalle` (reemplaza `getSimpleDocumentoHint` casuístico).

### 2.7 Backoffice (visibilidad operativa)

- En `FacturadorDetailView` / readiness: contadores por `accion` (cuántos documentos `REQUIERE_SOPORTE` / `REQUIERE_ACCION` / `EN_PROCESO` vencidos) para que soporte interno vea la salud fiscal de cada facturador sin entrar documento por documento.

### 2.8 Reglas de negocio

- RN-V1: la verificación automática **nunca** cambia un estado terminal (`EMITIDA`, `ANULADA`, `CANCELADO_LOCAL`, `RECHAZADA` ya diagnosticada) — solo estados en tránsito.
- RN-V2: toda verificación (manual o automática) actualiza `sifen_last_checked_at` y las columnas estructuradas.
- RN-V3: el fallo de una verificación automática no genera error visible al usuario; reprograma con backoff y loguea.
- RN-V4: `accion` jamás devuelve un valor fuera de los 4 definidos; sin información suficiente → `REQUIERE_SOPORTE`.
- RN-V5 (RN-03 existente se mantiene): si FE devuelve `current_cdc` distinto, se actualiza el CDC local.

### 2.9 Notificación por correo (definido en refinamiento 2026-07-31)

Cuando la verificación automática hace transicionar un documento a `REQUIERE_ACCION` o `REQUIERE_SOPORTE`, se envía un correo usando el **servicio de email existente** (`apps/api/src/shared/email/email.service.ts` — `sendEmail(to, template)`, SMTP Zoho / Resend ya configurados, remitente `facturacion@ventax.app`).

- **Contenido:** el mismo `accion_detalle` que ve la UI (título, causa en lenguaje simple, acciones sugeridas) + los datos para soporte (`document_uuid`, CDC, número, código y mensaje SIFEN) + link directo al documento en la app.
- **Destinatarios (definido en refinamiento 2026-07-31):** unión deduplicada de: (a) usuarios operativos activos del facturador con `usuarios.email` cargado; (b) correo administrativo del tenant — columna nueva `tenants.email_administrativo`, editable desde backoffice; (c) correo interno de Ventax — env `VENTAX_NOTIFY_EMAIL` — que recibe **todas** estas notificaciones (tanto `REQUIERE_ACCION` como `REQUIERE_SOPORTE`) para actuar proactivamente. Si (a) y (b) están vacíos, igual se envía a (c); si no hay ninguno → log y no bloquea.
- **Anti-spam:** el correo se envía **solo en la transición** de estado de acción (no en cada verificación), y máximo una vez por documento y por tipo de transición. Registro en columna `accion_notificada_at` (o tabla de notificaciones si se quiere auditoría completa).
- **Falla de envío:** nunca afecta la verificación ni el estado del documento (mismo criterio que RN-V3).

### 2.10 Validación

- Tests unitarios: derivación de `accion` (matriz estado × código × intentos), catálogo (default a soporte), backoff.
- Test del worker con `FakeRepository` + `MockFiscalGateway` (transición `PENDIENTE_SIFEN` → `EMITIDA` automática; rechazo → `REQUIERE_ACCION`).
- Playwright: lista y detalle muestran banner de acción; botón "Copiar datos para soporte".
- Smoke en staging: documento en batch pasa a aprobado sin intervención manual.

---

## 3. F1–F8 (refinados de v0.1 — sin cambios de fondo)

| Ítem | Refinamiento respecto a v0.1 |
|---|---|
| F1 dos claves | Confirmado contra `openapi.yaml`: `ApiConsumerKeyAuth` → `/factura`, `/conciliacion/*`, `/recibos/*`; `ApiKeyAuth` (compartida) → `/documentos/*`, `/consultar/*`, `/files/*`, `/nota-credito`, `/evento/*`. El worker F9 consume `/documentos/{uuid}/sifen` → clase compartida. |
| F2 panel integración FE | Sin cambios. Sumar al panel el estado del worker F9 (última corrida, documentos pendientes de verificar). |
| F3 verificador de integración | La sonda de consultas (`/consultar/ruc`) valida también la clave que usará F9. |
| F4 actividades | Sin cambios. |
| F5 usuarios | Sin cambios (incluye fix `updatePunto`). |
| F6 ayuda contextual | Sumar glosario de estados fiscales y de `accion` (el usuario final ve "acción", soporte ve el detalle fiscal). |
| F7 endpoints /admin | Sin cambios — conversación con FE. |
| F8 higiene | Sumar F0 (bugs precondición). Migración `/v1` en prod sigue pendiente. |

---

## 4. Priorización actualizada

| Orden | Ítem | Motivo |
|---|---|---|
| 1 | **F0** (bugs precondición) | `CANCELADO_LOCAL` es un bug latente en producción; barato |
| 2 | **F9** (verificación automática + acción) | Prioridad explícita de negocio; independiente de F1 |
| 3 | F1 (dos claves) | Desbloquea alineación de contrato; retrocompatible |
| 4 | F3 (verificador integración) | Diagnóstico staging + valida claves de F1/F9 |
| 5 | F2 (panel integración) | Base operativa |
| 6 | F5 (usuarios) / F6 (ayuda contextual) | Claridad |
| 7 | F4, F7, F8 | Cierre |

---

## 5. Fuera de alcance

- Suscripciones/cobros → `docs/INICIATIVA_SUSCRIPCIONES_COBROS_v0.1.md` (backlog, pendiente de refinamiento).
- Notificaciones push/WhatsApp (el correo SÍ está en alcance — ver 2.9).
- Verificación automática de **recibos** (el módulo ya obtiene estado real tras anular; evaluar en iteración posterior).
- Cambios del lado FE.
