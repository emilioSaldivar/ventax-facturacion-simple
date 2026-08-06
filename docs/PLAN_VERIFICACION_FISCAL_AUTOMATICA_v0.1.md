# PLAN — Verificación Fiscal Automática (F0 + F9) v0.1

**Fecha:** 2026-07-31
**SPEC:** `docs/SPEC_BACKOFFICE_ALINEACION_FE_v0.2.md` (secciones 0 y 2)
**Alcance de este plan:** solo F0 (bugs precondición) y F9 (verificación automática + guía de acción + correo). F1–F8 tendrán su propio plan después.
**Estado:** PENDIENTE DE APROBACIÓN → luego TASKS

---

## Fase 0 — F0: correcciones precondición

**0.1 Migración `00XX_fix_estado_check.sql`**
- `ALTER TABLE facturas_operativas DROP CONSTRAINT facturas_operativas_estado_check` y recrear con la lista real del tipo TS: `EMITIENDO, EMITIDA, PENDIENTE_SIFEN, RECHAZADA, ERROR_OPERATIVO, ERROR_TEMPORAL, ANULADA, CANCELADO_LOCAL` (sale `CANCELADA`, entra `CANCELADO_LOCAL`).
- Verificar antes con un SELECT si existe alguna fila con `estado='CANCELADA'` (no debería — el estado era inalcanzable); si existiera, migrar a `CANCELADO_LOCAL`.

**0.2 Frontend: tipo y labels**
- `web-operacion/main.tsx`: agregar `CANCELADO_LOCAL` a `DocumentoEstado` (línea ~79), a `formatDocumentoEstado`, `formatDocumentoEstadoSimple`, `getDocumentoStatusIcon` y al filtro de estados de la vista Documentos si lista estados.

**Validación fase 0:** typecheck ambos workspaces; test manual del cancel-send contra Postgres real (hoy falla, debe pasar).

---

## Fase 1 — Modelo de datos y persistencia

**1.1 Migración `00XX_verificacion_fiscal.sql`**
- Columnas en `facturas_operativas`: `fiscal_status_raw text`, `sifen_result_code text`, `sifen_result_message text`, `sifen_last_checked_at timestamptz`, `verificacion_next_at timestamptz`, `verificacion_attempts int not null default 0`, `accion_notificada_at timestamptz`.
- Índice parcial: `(verificacion_next_at) WHERE estado IN ('PENDIENTE_SIFEN','EMITIENDO') AND deleted_at IS NULL AND document_uuid IS NOT NULL`.
- Backfill: `verificacion_next_at = now()` para documentos ya en tránsito (así el worker los agarra al arrancar), `attempts = 0`.

**1.2 Repository (`facturas.repository.ts`)**
- Extender `updateFiscalStatus` para poblar `fiscal_status_raw`, `sifen_result_code`, `sifen_result_message`, `sifen_last_checked_at = now()` en todos los caminos (emisión, refresh manual, silencioso, worker). El código/mensaje ya se extraen en el gateway (`mapRefreshDocumentStatusWithCode` + `findNestedStringValue`) — hay que devolverlos estructurados en el resultado del gateway en vez de solo dentro del snapshot.
- Nuevos métodos: `claimNextVerificacion(batchSize)` (patrón `FOR UPDATE SKIP LOCKED` del outbox, sobre el índice parcial), `scheduleNextVerificacion(id, nextAt, attempts)`, `markAccionNotificada(id)`.

**1.3 Gateway (`fiscal-gateway.client.ts` / types)**
- `refreshFacturaStatus` devuelve además `{ status_raw, result_code, result_message }` (hoy ya los calcula internamente; solo exponerlos). Mock actualizado igual.

---

## Fase 2 — Derivación de `accion` y catálogo

**2.1 `apps/api/src/modules/facturas/sifen-causa-catalogo.ts`** (nuevo)
- Estructura: `{ match: { codes?: string[], pattern?: RegExp }, categoria: "USUARIO"|"SOPORTE", titulo, descripcion, acciones: AccionSugerida[] }`.
- Carga inicial: 0260/0422 aprobado; 1306 (migrar el texto de `getRejectedSifenMessage`); códigos de datos de receptor → USUARIO; default → SOPORTE.

**2.2 `deriveAccion(documento)` en `facturas.service.ts`** (o módulo propio `facturas.accion.ts`)
- Entrada: estado, `fiscal_status_raw`, `sifen_result_code`, `verificacion_attempts`, `sifen_last_checked_at`, edad del documento.
- Salida: `accion` (4 valores) + `accion_detalle { titulo, descripcion, acciones_sugeridas[], soporte_payload? }`.
- Reglas RN-V1..V5 del SPEC. Umbral `REQUIERE_SOPORTE` por persistencia: `ERROR_TEMPORAL` con `attempts >= 5`, o en tránsito > 30 días.
- Exponer en `GET /facturas` (lista) y `GET /facturas/:id`. En la lista, calcular en memoria sobre las filas ya traídas (sin query extra).

**2.3 Tests unitarios** de catálogo y derivación (matriz de casos), antes de tocar worker/UI.

---

## Fase 3 — Worker de verificación

**3.1 `apps/api/src/modules/facturas/verificacion.worker.ts`** (nuevo, espejo de `facturas.worker.ts`)
- Env nuevas en `config/env.ts`: `FE_VERIFY_WORKER_ENABLED` (default true), `FE_VERIFY_WORKER_INTERVAL_MS` (default 30000), `FE_VERIFY_BATCH_SIZE` (default 10).
- Tick: `claimNextVerificacion(batch)` → por cada doc, invocar la misma ruta interna que el refresh manual (`refreshDocumentoStatus` refactorizada para aceptar contexto de sistema, sin auth de usuario) → reprogramar con backoff **30m → 1h → 6h → 12h → 24h** (tope 24h, reintenta cada 24h hasta el corte de 30 días).
- Falla de gateway: no propaga, reprograma igual (RN-V3), loguea con `document_uuid`.
- Registro en `server.ts` junto al outbox; apagable por env.

**3.2 Test del worker** con `FakeRepository` + `MockFiscalGateway`: transición automática `PENDIENTE_SIFEN → EMITIDA`; rechazo → deriva `REQUIERE_ACCION`; error de gateway → reprograma sin romper.

---

## Fase 4 — Notificación por correo

**4.1 Template** en `email.templates.ts`: `accion_requerida` (naranja) y `requiere_soporte` (rojo) con: título/causa, acciones sugeridas, bloque copiable de datos de soporte, link `PUBLIC_APP_BASE_URL/app/` al documento.
**4.2 Envío en el worker**: cuando la verificación produce transición a `REQUIERE_ACCION`/`REQUIERE_SOPORTE` y `accion_notificada_at IS NULL` → resolver destinatarios (usuarios operativos activos del facturador con `email` no nulo, vía query nueva en repository) → `sendEmail` a cada uno → `markAccionNotificada`. Falla de envío: log y sigue (no marca, reintenta en la próxima transición… **no**: marca igual para no spamear; el log alcanza).
**4.3 Test unitario** del gate anti-spam (una sola vez por documento).

---

## Fase 5 — UI web-operacion

**5.1 Lista de documentos:** semáforo por `accion` (4 colores) + tooltip `accion_detalle.titulo`. El campo llega del backend — sin lógica nueva en front.
**5.2 Detalle:** banner de acción arriba (fuera de `<details>`): título, descripción, botones según `acciones_sugeridas` (mapean a handlers existentes: retry-emission, NCE, anular) + botón "Copiar datos para soporte" (clipboard con `soporte_payload` formateado).
**5.3 Post-emisión:** reemplazar `getSimpleDocumentoHint` por `accion_detalle` del response.
**5.4 "Verificar estado fiscal"** queda en avanzadas, mostrando "última verificación: hace X" (`sifen_last_checked_at`).

---

## Fase 6 — Backoffice + validación integrada

**6.1 Contadores por facturador:** endpoint `GET /backoffice/facturadores/:id/salud-fiscal` (counts por `accion`) + card en `FacturadorDetailView`.
**6.2 Validación:** typecheck + tests todos los workspaces; Playwright (lista con semáforos, banner de acción, copiar soporte); smoke en staging: emitir en BATCH y verificar transición automática sin tocar nada; verificar recepción del correo.

---

## Orden de ejecución y entregas

Cada fase es deployable por separado. F0 puede ir a producción de inmediato (bugfix). Fases 1–3 no cambian nada visible (el worker corre y las columnas se pueblan); la fase 5 es el switch visible al usuario. Rollback: apagar `FE_VERIFY_WORKER_ENABLED`.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Carga sobre FE por `refresh=true` masivo | Batch chico (10), backoff desde 30m, solo estados en tránsito |
| Estados FE no contemplados en el mapeo | Default conservador: queda `PENDIENTE_SIFEN` + `fiscal_status_raw` visible para soporte |
| Correos a destinatarios equivocados | Confirmar destinatarios antes de TASKS (pregunta abierta 1) |
| Doble worker en múltiples instancias | `SKIP LOCKED` ya lo cubre (mismo patrón outbox) |

## Decisiones de refinamiento (resueltas 2026-07-31 con el usuario)

1. **Destinatarios del correo:** usuarios operativos del facturador con email + correo administrativo del tenant (columna nueva `tenants.email_administrativo`, editable en backoffice) + correo interno de Ventax (`VENTAX_NOTIFY_EMAIL`), deduplicados. Ventax recibe todas las notificaciones (ACCION y SOPORTE).
2. **Copia interna Ventax:** sí, siempre.
3. **Backoff:** primer check temprano a los **5m**, luego 30m → 1h → 6h → 12h → 24h.
4. **Alcance del worker:** `PENDIENTE_SIFEN` **y** `EMITIENDO` con `document_uuid`.

Impacto en fases: la migración 1.1 suma `tenants.email_administrativo citext`; el backoffice (fase 6) suma el campo editable en `TenantDetailView`; env nueva `VENTAX_NOTIFY_EMAIL` en `config/env.ts` (fase 4).
