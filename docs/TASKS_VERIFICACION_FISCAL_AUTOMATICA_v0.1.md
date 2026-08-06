# TASKS — Verificación Fiscal Automática (F0 + F9) v0.1

**Fecha:** 2026-07-31
**SPEC:** `docs/SPEC_BACKOFFICE_ALINEACION_FE_v0.2.md` | **PLAN:** `docs/PLAN_VERIFICACION_FISCAL_AUTOMATICA_v0.1.md`
**Estado:** LISTO PARA IMPLEMENTAR

---

## Bloque A — F0: correcciones precondición ✅ COMPLETADO 2026-08-01

- [x] **A-1** Migración `0027_fix_estado_check_cancelado_local.sql`: recreado `facturas_operativas_estado_check` con `CANCELADO_LOCAL` (sale `CANCELADA`). Pre-chequeo con UPDATE defensivo incluido.
- [x] **A-2** `web-operacion/main.tsx`: agregado `CANCELADO_LOCAL` a `DocumentoEstado`, `formatDocumentoEstado`, `formatDocumentoEstadoSimple`, `getDocumentoStatusIcon`, `getSimpleDocumentoEstado`, `getSimpleDocumentoHint`.
- [x] **A-3** Validación: typecheck OK; probado contra Postgres real (migración aplicada, UPDATE a `CANCELADO_LOCAL` en transacción revertida — constraint nuevo verificado con `pg_get_constraintdef`).

## Bloque B — Modelo de datos ✅ COMPLETADO 2026-08-01

- [x] **B-1** Migración `0028_verificacion_fiscal.sql`: columnas `fiscal_status_raw`, `sifen_result_code`, `sifen_result_message`, `sifen_last_checked_at`, `verificacion_next_at`, `verificacion_attempts`, `accion_notificada_at` en `facturas_operativas`; índice parcial; backfill de documentos en tránsito. Columna `tenants.email_administrativo citext`. Aplicada y verificada contra Postgres real.
- [x] **B-2** Gateway: `FiscalEmitFacturaResponse` y `FiscalRefreshStatusResponse` extendidos con `status_raw`/`result_code`/`result_message`; los 4 mappers del cliente (`mapFiscalEmitFacturaResponse`, NCE, `mapFiscalRefreshStatusCanonicoResponse`) los pueblan; `MockFiscalGateway` actualizado.
- [x] **B-3** Repository: `updateFiscalStatus` extendido (+3 params, `sifen_last_checked_at = now()` siempre); `completePendingEmission` y los 2 INSERT (`createFromEmission`, `createNotaCreditoFromFactura`) pueblan las columnas nuevas y agendan `verificacion_next_at` (+5min) cuando corresponde; nuevos métodos `claimNextVerificacion` (SKIP LOCKED con lease de 10min), `scheduleNextVerificacion`, `markAccionNotificada`, `getNotificationRecipients`.
- [x] **B-4** Backoffice: `tenants` PATCH acepta `email_administrativo` (nullable, clearable vía chequeo de presencia de clave); campo editable en `TenantDetailView`.
- [x] **B-5** Validación: typecheck en `api`/`web-operacion`/`backoffice` OK. Tests: 152 pasan / 6 fallan — **verificado que son los mismos 6 preexistentes en master** (comparación con `git stash` antes/después, sin regresiones). Prueba manual de `email_administrativo` contra Postgres real OK.

## Bloque C — Catálogo y derivación de acción ✅ COMPLETADO 2026-08-01

- [x] **C-1** `sifen-causa-catalogo.ts`: `resolveCausaSifen(code, message)` con carga inicial (1306 migrado de `getRejectedSifenMessage`, códigos de datos de receptor, patrón timbrado/numeración → SOPORTE, default → SOPORTE).
- [x] **C-2** `facturas.accion.ts`: `deriveAccion(doc)` → 4 valores + `accion_detalle`. **Desviación documentada respecto al texto del TASKS**: el contador "N intentos" del spec no existe en `DocumentoResponse` (vive en `factura_emision_outbox.attempts`, tabla distinta); se usa la antigüedad del documento (`created_at`) como proxy de persistencia — `ERROR_TEMPORAL` > 24h y `PENDIENTE_SIFEN`/`EMITIENDO` > 30 días → `REQUIERE_SOPORTE`. Documentado inline en el código.
- [x] **C-3** Expuesto en `GET /facturas` (vía `listDocumentos`) y `GET /facturas/:id` (vía `getDocumentoById`, reutilizado también por refresh-status y descargas). Confirmado que las rutas hacen `res.json(result)` directo, sin recortar los campos nuevos.
- [x] **C-4** 15 tests unitarios en `facturas.accion.test.ts`: matriz completa de estados, catálogo (1306, default a soporte, código desconocido), vencimientos por antigüedad, invariante "nunca fuera de los 4 valores". Todos pasan; suite completa 167/173 (mismos 6 preexistentes).

## Bloque D — Worker de verificación ✅ COMPLETADO 2026-08-01

- [x] **D-1** Env agregadas en `config/env.ts`: `FE_VERIFY_WORKER_ENABLED` (true), `FE_VERIFY_WORKER_INTERVAL_MS` (30000), `FE_VERIFY_BATCH_SIZE` (10), `VENTAX_NOTIFY_EMAIL` (opcional).
- [x] **D-2** Refactor: extraído `refreshFiscalStatusForDocumento(facturadorId, documentoId, repository, gateway)` — núcleo del refresh sin depender de `OperationalContextResponse`; `refreshDocumentoStatus` (endpoint manual) ahora es un wrapper delgado sobre esta función + `withAccion`. Mismo comportamiento, verificado con typecheck + suite completa (mismos 6 fallos preexistentes) tras el refactor.
- [x] **D-3** `verificacion.worker.ts`: mismo patrón que `facturas.worker.ts` (guard no reentrante, tick inmediato + interval). Backoff real implementado: primer check automático a los **5 min** (agendado por el repository al emitir/completar, no por el worker), luego el worker agenda **30m → 1h → 6h → 12h → 24h** (tope, se repite). Corte a 30 días: dejan de reprogramarse (`verificacion_next_at = null`); `deriveAccion` ya los refleja como `REQUIERE_SOPORTE` por antigüedad. Estados terminales (no `PENDIENTE_SIFEN`/`EMITIENDO`) también detienen la reprogramación. Falla de gateway: logueada, nunca propagada, reprograma igual (RN-V3). Conectado en `server.ts` junto al outbox worker.
- [x] **D-4** 6 tests en `verificacion.worker.test.ts`: transición automática a `EMITIDA`; `EMITIENDO` colgado se recupera; rechazo se retira de la agenda; error de gateway no propaga y reprograma con el backoff correcto (verificado el rango de tiempo exacto); documento vencido (>30 días) deja de reprogramarse; el worker respeta `stop()`. **Validado además end-to-end contra Postgres real** (no solo con fakes): se simuló claim con lease + join a `facturadores` + transición a estado terminal, confirmando que la query SQL del claim funciona correctamente (se corrigió un error real de sintaxis SQL detectado en esta validación — ver nota abajo).
- **Nota de correctness importante:** la primera versión de `claimNextVerificacion` tenía un JOIN inválido (`next_jobs join facturadores fa on fa.id = f.facturador_id`, donde `f` es la tabla objetivo del UPDATE) que Postgres rechaza en tiempo de ejecución (`invalid reference to FROM-clause entry for table "f"`) — no lo habría detectado ningún test con fakes/mocks. Se detectó y corrigió ejecutando la query contra Postgres real antes de dar el bloque por cerrado (moviendo `facturador_id` a la CTE `next_jobs` y uniendo por ahí).

## Bloque E — Notificación por correo ✅ COMPLETADO 2026-08-01

- [x] **E-1** Templates `accionRequeridaTemplate` / `requiereSoporteTemplate` agregados a `email.templates.ts` (mismo `buildLayout`/`escapeHtml` que OTP y admin-email-required): título + descripción en lenguaje simple, bloque de datos copiable para soporte (documento_id, document_uuid, cdc, numero_fiscal, sifen_result_code/message, fiscal_status_raw, created_at), botón/link a la app.
- [x] **E-2** `facturas.notificaciones.ts`: `notifyAccionRequerida(facturadorId, documento, detalle, esSoporte, repository)` resuelve destinatarios (dedupe case-insensitive de `getNotificationRecipients` + `VENTAX_NOTIFY_EMAIL`) y envía el template correspondiente a todos. Enganchado en `verificacion.worker.ts`: tras cada refresh, si `accion` ∈ {REQUIERE_ACCION, REQUIERE_SOPORTE} y `accionNotificadaAt` es null → notifica → `markAccionNotificada` (se marca aunque el envío falle, para no reintentar spam; el fallo queda logueado).
- [x] **E-3** 4 tests en `facturas.notificaciones.test.ts` (envío a múltiples destinatarios, template correcto según `esSoporte`, sin destinatarios no envía, dedupe case-insensitive) + 2 tests de gate anti-spam a nivel worker en `verificacion.worker.test.ts` (envía y marca en la primera transición; NO vuelve a enviar si `accionNotificadaAt` ya está seteado). `sendEmail` mockeado con `vi.mock` para no depender de red.

## Bloque F — UI web-operacion ✅ COMPLETADO 2026-08-01

- [x] **F-1** `getDocumentoAccionIcon(documento)` (4 colores: 🟢🟡🟠🔴, fallback al semáforo por estado si `accion` no viene) + `title={documento.accion_detalle?.titulo}` en los dos puntos de la lista.
- [x] **F-2** Banner `.accion-banner` (4 variantes de color, con nuevas variables CSS `--color-danger`/`--color-info`) arriba del todo en el detalle, fuera de `<details>`. Botones mapeados a handlers existentes: `REINTENTAR`→`retrySelectedEmission`, `CORREGIR_REEMITIR`→navega a "Nueva factura" (no existe flujo de edición in-place), `CREAR_NCE`→`emitSelectedNotaCredito`, `CONTACTAR_SOPORTE`→`copySoportePayload` (nuevo, copia al portapapeles). Fallback a las alertas antiguas (`getRecoverableMessage`/`getRejectedSifenMessage`) si `accion_detalle` no viene (deploy parcial).
- [x] **F-3** Post-emisión: `emittedDocumento.accion_detalle` reemplaza `getSimpleDocumentoHint` (con el mismo fallback defensivo).
- [x] **F-4** "Verificar estado fiscal" muestra "Última verificación automática: hace X" desde `sifen_last_checked_at` (`formatUltimaVerificacion`).
- **Trabajo adicional de backend requerido para que F llegue con datos reales:** `accion`/`accion_detalle` solo se calculaban en `listDocumentos`/`getDocumentoById`. Se extendió `withAccion` a **todos** los endpoints de mutación que el frontend consume directamente: `enqueueFacturaEmission` (POST /facturas), `retryDocumentoEmission`, `cancelDocumento`, `cancelDocumentoSend`, `emitNotaCreditoTotal` (incluyendo sus ramas de idempotencia). Typecheck + suite completa verificados sin regresiones (179/185, mismos 6 preexistentes) después de este cambio, por tocar el core transaccional de emisión/cancelación/NCE.
- **Validación visual con Playwright** (dev server + mocks de `/me/context`, `/facturas`, `/facturas/:id`, `/delivery-link`, `/email-status`): confirmado el semáforo con 2 colores distintos en la lista (🔴 REQUIERE_SOPORTE, 🟠 REQUIERE_ACCION), el banner rojo con botón "Copiar datos para soporte" (contenido copiado verificado vía `clipboard-read`), y el banner naranja con botón "Corregir y emitir de nuevo". Capturas revisadas y descartadas tras la validación.

## Bloque G — Backoffice + validación integrada ✅ COMPLETADO 2026-08-01 (excepto G-4)

- [x] **G-1** `GET /backoffice/facturadores/:id/salud-fiscal` (counts por `accion`) + card "Salud fiscal" en `FacturadorDetailView`. Implementación: `deriveAccion` se generalizó a aceptar `DeriveAccionInput` (Pick de los campos que realmente usa, no el `DocumentoResponse` completo) para poder invocarla desde una query de agregación en `backoffice.repository.ts` sin construir cliente/items/totals/delivery falsos. La query SQL filtra por `estado IN ('RECHAZADA','ERROR_OPERATIVO','ERROR_TEMPORAL','PENDIENTE_SIFEN','EMITIENDO')` (los únicos estados que pueden derivar en algo distinto de OK) y agrupa en JS con `deriveAccion`. Validado contra Postgres real: 4 documentos insertados (RECHAZADA×2, PENDIENTE_SIFEN, EMITIDA) → la query devolvió exactamente los 3 no-EMITIDA.
- [x] **G-2** Typecheck limpio en `api`/`web-operacion`/`backoffice`. Suite completa: 179/185 (mismos 6 fallos preexistentes en `entrega.service.test.ts`/`facturas.service.test.ts`, verificados contra master sin estos cambios — cero regresiones en todo el trabajo de F0→G1).
- [x] **G-3** Validación visual con Playwright (dev server + mocks): semáforos de 2 colores distintos en la lista de documentos, banner rojo REQUIERE_SOPORTE con botón "Copiar datos para soporte" (contenido del portapapeles verificado), banner naranja REQUIERE_ACCION con botón "Corregir y emitir de nuevo"; en backoffice, campo "Email administrativo" editable en `TenantDetailView` y card "Salud fiscal" con los 3 contadores coloreados en `FacturadorDetailView`. Capturas revisadas y descartadas tras la validación (no se conservan).
- [ ] **G-4** Smoke en staging (emisión BATCH pasa a verde sin intervención manual; correo recibido en las tres categorías de destinatarios) — **no ejecutable en esta sesión**: requiere acceso de deploy/SSH a la VPS de staging que este entorno no tiene. Pendiente de que el usuario lo corra manualmente o autorice una sesión con ese acceso.

---

## Matriz de estado

| Bloque | Estado |
|---|---|
| A — F0 precondición | ✅ COMPLETADO |
| B — Modelo de datos | ✅ COMPLETADO |
| C — Catálogo + derivación | ✅ COMPLETADO |
| D — Worker | ✅ COMPLETADO |
| E — Correo | ✅ COMPLETADO |
| F — UI web-operacion | ✅ COMPLETADO |
| G — Backoffice + validación | ✅ COMPLETADO salvo G-4 (smoke staging, requiere acceso de deploy) |

**Migraciones nuevas:** `0027_fix_estado_check_cancelado_local.sql`, `0028_verificacion_fiscal.sql` — pendientes de aplicar en staging/producción (`npm run migrate -w @facturacion-simple/api`).
**Env nuevas a configurar en despliegue:** `FE_VERIFY_WORKER_ENABLED`, `FE_VERIFY_WORKER_INTERVAL_MS`, `FE_VERIFY_BATCH_SIZE`, `VENTAX_NOTIFY_EMAIL` (todas opcionales con default seguro; el worker arranca solo con `true` por defecto).
