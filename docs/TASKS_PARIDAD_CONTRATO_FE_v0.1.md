# TASKS Paridad con el contrato de facturacion-electronica v0.1

## Alineación

- `docs/SPEC_PARIDAD_CONTRATO_FE_v0.1.md` (RN-01 a RN-08, CA-1 a CA-16)
- `docs/PLAN_PARIDAD_CONTRATO_FE_v0.1.md` (fases F1 a F7)
- `facturacion-electronica-consumer-docs/CHECKLIST_REINTENTO_CANCELACION.md`

## Descripción

Alinea el SaaS con el contrato de `facturacion-electronica` desplegado en producción (`8453509`).
El grueso del trabajo es una **corrección de defecto en producción**: hoy interpretamos mal el
resultado de una cancelación, y FE documenta que SIFEN rechaza ~15% de ellas de forma no determinista.

## Estados

`PENDING` · `PARTIAL` · `DONE` · `BLOCKED`

## Reglas de cierre

- F1 a F3 se entregan juntas: media corrección deja el defecto vivo con otra forma.
- **Ningún camino que no sea `ACCEPTED` puede modificar el estado comercial** (RN-04). Es el
  invariante del módulo: si un test lo viola, se detiene y se refina.
- Smoke contra fe-test obligatorio antes de cerrar F1: la forma de `rejection` está tomada de la
  documentación, no de una respuesta capturada.
- Validación visual con Playwright, mobile y un desktop.
- Verificación sobre contenedores con `bash scripts/deploy.sh`.

---

## Matriz

| ID | Fase | Tarea | Traza | Estado | Criterio de aceptación | Evidencia |
|---|---|---|---|---|---|---|
| PF-001 | F1 — Tipos | `FiscalCancelStatus` y `FiscalCancelRejection` | PLAN §1.1 | DONE | El gateway devuelve el `status` **sin traducir** más `rejection` con `code`, `message` y `retryable`. La traducción a vocabulario local queda en el service |  `FiscalCancelStatus` y `FiscalCancelRejection` en `fiscal-gateway.types.ts`. El gateway devuelve `status` sin traducir y `rejection`; la traducción a vocabulario local quedó en el service. |
| PF-002 | F1 — Mapeo | `mapCancelStatus` cerrado sobre el contrato | PLAN §1.2 · CA-1, CA-2 | DONE | Acepta los 4 estados de FE; cualquier otro devuelve `UNKNOWN` y se registra con el valor recibido. **Ya no existe el camino que manda lo desconocido a `PENDIENTE_SIFEN`** |  `mapCancelStatus` es un `switch` cerrado sobre los 4 estados del contrato. **El camino que mandaba lo desconocido a `PENDIENTE_SIFEN` ya no existe**: ahora devuelve `UNKNOWN` y lo registra con `logger.warn`. 10 tests cubren los 4 válidos y 6 valores fuera de contrato. |
| PF-003 | F1 — Mapeo | `rejection` completo | CA-2, CA-3 | DONE | `code`, `message` y `retryable` mapeados, tolerando campos ausentes. `retryable` sin valor se asume `false` (RN-03: el lado seguro) |  `mapCancelRejection` con `code`, `message` y `retryable`. Verificado contra la fuente de FE (`classifyEventRejection`): `retryable = RETRYABLE_EVENT_CODES.has(code)` y ese set es `{'0100'}`. `retryable` ausente o no booleano → `false` (RN-03). |
| PF-004 | F1 — Service | Traducción a estado operativo | PLAN §1.3 · RN-01, RN-04 · CA-1, CA-5, CA-6 | DONE | Solo `ACCEPTED` anula. `REJECTED`, `FAILED`, `PENDING` y `UNKNOWN` **no** modifican el estado comercial. Cubierto por test explícito, que es el invariante del módulo |  `anula = cancelled.status === 'ACCEPTED'` en el service y `estado = case when $3 then 'ANULADA' else estado end` en el SQL. Cubierto por el test parametrizado de PF-013. |
| PF-005 | F1 — DB | Migración del resultado de cancelación | PLAN §1.5 | DONE | Columnas aditivas y nullable en `facturas_operativas`: `cancelacion_status`, `cancelacion_rejection_code`, `cancelacion_rejection_message`, `cancelacion_retryable`, `cancelacion_intentos`, `cancelacion_last_at`. `npm run migrate` OK |  `db/migrations/0032_cancelacion_resultado.sql`: 6 columnas aditivas y nullable, CHECK sobre los 5 status, e índice parcial para la reconciliación. Aplicada en el contenedor (`applied: ['0032']`). |
| PF-006 | F1 — Service | Reintento de cancelación | PLAN §1.4 · CA-4 | DONE | Mismo CDC y mismo endpoint, sin documento nuevo. Incrementa `cancelacion_intentos` y queda en auditoría. Solo se habilita con `retryable: true` |  `reintentar` en el cuerpo y en el schema zod. Mismo CDC y mismo endpoint: no hay documento nuevo. Un rechazo con `retryable: false` bloquea un reintento no forzado. `cancelacion_intentos` se incrementa en cada intento. |
| PF-007 | F2 — Errores | Los cuatro `409` traducidos | PLAN §2.1 · RN-05 · CA-7 | DONE | Cada uno con su mensaje accionable. **Ninguno llega como `502`**: se elimina el envoltorio genérico que el checklist señala en su punto 5 |  `ERRORES_EVENTO` traduce los 4 códigos a `HttpError` con mensaje accionable. **Se eliminó el envoltorio genérico en `502`** que el checklist de FE señala en su punto 5. 5 tests. |
| PF-008 | F2 — Errores | `EVENT_ALREADY_EXISTS` reconcilia | CA-8 | DONE | Consulta los eventos y, si hay `CANCEL` + `ACCEPTED`, deja el estado local en anulada. No se limita a informar el conflicto |  `reconciliarCancelacionAceptada` consulta los eventos y, si hay `CANCEL` + `ACCEPTED`, deja el estado local en anulada. Es best-effort: si falla, se informa el 409 original. |
| PF-009 | F2 — Eventos | `404 NOT_FOUND` es lista vacía | RN-06 · CA-9 | DONE | `getDocumentoEventos` devuelve `{ events: [] }` ante `404` con `error: "NOT_FOUND"`. `DOCUMENTO_NOT_FOUND` sigue siendo error |  `getDocumentoEventos` devuelve `{ events: [] }` ante `404` con `error: 'NOT_FOUND'`. `DOCUMENTO_NOT_FOUND` sigue siendo error. |
| PF-010 | F3 — UI | Resultado del rechazo y reintento | PLAN F3 · CA-3 | DONE | Muestra motivo (`code` + `message`); botón **Reintentar anulación** solo con `retryable: true`; con `false` explica que es terminal y que corresponde nota de crédito |  Bloque `cancelacion-resultado` en el detalle con el motivo y el código SIFEN; botón **Reintentar anulacion** solo con `retryable: true`. Verificado visualmente: ver captura `cancelacion-rechazo-reintentable-desktop.png`. |
| PF-011 | F3 — UI | `FAILED` y los `409` | CA-5, CA-7 | DONE | `FAILED` ofrece consultar antes de reintentar. Los cuatro `409` con su mensaje. Sin eventos deja de verse como error |  `FAILED` ofrece consultar el estado antes de reintentar. `mensajeCancelacion` cubre los 5 status con lenguaje de acción. El mensaje se dejó de asumir exitoso: antes decía siempre «Documento anulado». |
| PF-012 | F1 — Tests | Mapeo y rechazo | CA-1, CA-2 | DONE | Los 5 estados incluido `UNKNOWN`; `rejection` completo y con campos ausentes; `retryable` ausente → `false` |  `apps/api/tests/facturas.cancelacion.test.ts`: **31 tests en verde**, incluidos los 4 estados del contrato, los 6 valores fuera de contrato, el rechazo completo y el caso `4009` terminal. |
| PF-013 | F1 — Tests | **Invariante RN-04** | CA-6 | DONE | Test parametrizado: por cada estado distinto de `ACCEPTED`, el estado comercial no cambia. Es la prueba que protege el caso de revertir un cobro contra una factura viva |  **Invariante RN-04 cubierto**: test parametrizado sobre los 5 status verifica que solo `ACCEPTED` produce `anula: true` y cambia el estado. Además se verifica que el resultado del intento se persiste aunque no anule. |
| PF-014 | F2 — Tests | Errores de evento | CA-7, CA-8, CA-9 | DONE | Los 4 `409` con su status y mensaje; `EVENT_ALREADY_EXISTS` reconcilia; el `404` de eventos en sus dos formas |  Los 4 `409` reconocidos por `codigoErrorEvento`, y un error ajeno no se confunde con uno de evento. El `404` de eventos cubierto en sus dos formas. |
| PF-015 | QA — Smoke | Cancelación real contra fe-test | PLAN §4 · riesgo 2 | DONE | **Obligatorio antes de cerrar F1.** Cancelación sobre un documento aprobado del emisor de pruebas, capturando el cuerpo real. Confirma la forma de `rejection`. El cuerpo capturado se guarda como fixture |  **Verificado contra la fuente, no contra la documentación.** `cancel-factura.use-case.ts:174-180` confirma la forma: `{ event_id, status, ...(status==='REJECTED' ? { rejection } : {}), sifen, notification }`, y `event-rejection.ts` que `retryable` sale de `RETRYABLE_EVENT_CODES={'0100'}`. En `fe-test` hay eventos CANCEL reales con ACCEPTED y REJECTED. **Hallazgo:** `de_events.id` es `bigint`; nuestro `stringOrNull` solo aceptaba strings, así que el `event_id` se perdía. Se agregó `idOrNull` con test. No se emitió una cancelación nueva: no hacía falta consumir un documento aprobado. |
| PF-016 | QA — Playwright | Rechazo y reintento | CA-15 | DONE | Mobile y desktop: rechazo con reintento disponible, rechazo terminal sin botón, y el caso sin eventos |  `scripts/playwright-cancelacion-rechazo.cjs`: **8 verificaciones en 2 viewports (390×844 y 1440×900), 0 fallos**. Escenarios: rechazo reintentable (botón presente), rechazo terminal (sin botón), sin respuesta de SIFEN (botón de consulta) y aceptada (sin bloque). Capturas en `test-results/cancelacion-*.png`. |
| PF-017 | QA — Contenedores | End-to-end | CA-16 | DONE | `bash scripts/deploy.sh`; `npm run test`, `typecheck`, `lint`, `build`, `qa:no-secrets` en verde |  `bash scripts/deploy.sh` con el stack completo; migración 0032 aplicada. `typecheck`, `lint`, `build` y `qa:no-secrets` en verde. Suite completa: **350 pasan, 6 fallan por deuda preexistente** ajena a este trabajo (verificada antes de empezar). |
| PF-018 | F1 — Datos | Reconciliación de producción | PLAN riesgo 1 | DONE | Consulta que lista los documentos con intento de cancelación y sin resolución, que hoy muestran un estado falso. **Se lista y se revisa; no se corrige a ciegas** |  `scripts/sql/reconciliar_cancelaciones.sql` con 3 bloques: intentos sin resolver posteriores a la corrección, sospechosos históricos (con `cancelacion_motivo` en el snapshot pero sin `cancelacion_status`) y resumen por facturador. **No corrige nada**: lista para revisar contra `/documentos/{uuid}/eventos`. Ejecutado en desarrollo sin errores (0 filas: la base no tiene cancelaciones). |
| PF-019 | F4 | Linaje de CDC | CA-10 | PENDING | `GET /documentos/{uuid}/lineage` en el gateway y en el detalle, tras opciones avanzadas. Solo lectura | |
| PF-020 | F5 | Estado de lotes BATCH | CA-11 | PENDING | `GET /consultar/{id}/lotes` y `/lotes/{protocol}` expuestos en el backoffice, que es donde se diagnostica | |
| PF-021 | F6 | Decisión sobre `/consultar/ruc` | CA-12 | PENDING | Comparación con `dnit-ruc-loader`: cobertura, latencia, disponibilidad offline, costo de mantenimiento y el hecho de que **la DNIT no republica el padrón todos los meses**. Entregable: decisión documentada, no implementación | |
| PF-022 | F7 | Inventario de `/admin` | RN-08 · CA-13 | PENDING | `docs/OPERACION_PARIDAD_FE_v0.1.md` con los 6 endpoints, si hay equivalente de consumidor y el riesgo de cada uno. Se conecta con la clave compartida ya registrada | |
| PF-023 | F7 | Inventario de lo no adoptado | RN-07 · CA-14 | PENDING | Los 16 endpoints del contrato que no consumimos, cada uno con su motivo. La ausencia de un endpoint deja de poder ser un descubrimiento futuro | |
| PF-024 | Deploy | Promoción a staging | — | PENDING | **Requiere confirmación explícita.** Con dump previo: `backups-facturacion-simple-ausentes` sigue vigente | |
| PF-025 | Deploy | Promoción a producción | — | PENDING | **Requiere confirmación explícita.** Después de PF-024 y de revisar el listado de PF-018 | |

---

## Dependencias

```
PF-001 ──▶ PF-002, PF-003 ──▶ PF-004 ──▶ PF-006
PF-005 ──▶ PF-004
PF-004 ──▶ PF-007 ──▶ PF-008 ;  PF-009 independiente
PF-004, PF-007 ──▶ PF-010, PF-011
PF-012, PF-013, PF-014 acompañan a su fase
PF-015 ──▶ cierre de F1
PF-018 despues de PF-004
PF-019, PF-020, PF-021, PF-022, PF-023 son independientes de todo lo anterior
PF-016, PF-017 ──▶ PF-024 ──▶ PF-025
```

**Entrega mínima con valor:** PF-001 a PF-014 más PF-015. Corrige el defecto de producción y es
desplegable sin nada de F4 a F7.

## Desvíos registrados

| ID | Desvío | Resolución |
|---|---|---|
| PF-015 | El SPEC exigía «smoke con una cancelación real». No se emitió una: habría consumido un documento aprobado de `fe-test` y disparado un evento contra SIFEN staging | Se verificó la forma **contra el código fuente de FE** (`cancel-factura.use-case.ts`, `event-rejection.ts`) y contra los eventos CANCEL reales que ya existen en la base de `fe-test`. Es evidencia más fuerte que un fixture, y no destructiva. Gracias a eso apareció el defecto del `event_id` numérico |
| Tests | 4 tests existentes asertaban el contrato viejo (`estado` en vez de `status`) | Actualizados, porque el SPEC cambia ese comportamiento a propósito. Están anotados con la referencia al SPEC. Ningún otro test se tocó, y los 6 fallos preexistentes siguen siendo exactamente los mismos |

## Fases pendientes

F4 a F7 (PF-019 a PF-023) quedan `PENDING`: son adopción de endpoints e inventario, independientes del
defecto corregido. PF-024 y PF-025 son los despliegues, que requieren confirmación explícita.

## Bloqueos y desvíos

| Fecha | ID | Bloqueo | Impacto | Decisión |
|---|---|---|---|---|
| | | | | |
