# TASKS Control De Reintentos De Emision v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_CONTROL_REINTENTOS_EMISION_v0.1.md`
- `docs/PLAN_CONTROL_REINTENTOS_EMISION_v0.1.md`

## Estado General

- `SPEC`: DONE
- `PLAN`: DONE
- `TASKS`: PENDIENTE DE IMPLEMENTACION

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
| --- | --- | --- | --- | --- |
| CRE-001 | SDD | Crear cadena SPEC/PLAN/TASKS de esta iniciativa | DONE | Existen los tres documentos versionados y referenciados entre si |
| CRE-002 | Tipos | Agregar `attempts`, `documentoCreatedAt`, `accionNotificadaAt` a `PendingFiscalEmission` y `outboxEstado` a la firma de `failPendingEmission` en `FacturaRepository` (`facturas.types.ts`) | PENDIENTE | Typecheck del workspace `api` compila sin errores tras el cambio de tipos |
| CRE-003 | Backend | `claimNextPendingEmission()`: agregar `o.attempts`, `f.created_at`, `f.accion_notificada_at` al `select`/`returning` y al mapeo de retorno (`facturas.repository.ts`) | PENDIENTE | Verificado contra Postgres real: el resultado incluye los tres campos con valores correctos (attempts post-incremento, created_at del documento, accion_notificada_at null en un documento nuevo) |
| CRE-004 | Backend | `failPendingEmission()`: reemplazar `'FAILED_TEMP'` hardcodeado por parametro `outboxEstado` (`facturas.repository.ts`) | PENDIENTE | Verificado contra Postgres real: invocar con `outboxEstado='FAILED_PERM'` deja la fila en ese estado y `claimNextPendingEmission()` deja de reclamarla en una corrida posterior |
| CRE-005 | Backend | Bajar `HORAS_PERSISTENCIA_ERROR_TEMPORAL` de `24` a `1` en `facturas.accion.ts` + actualizar comentario de cabecera | PENDIENTE | Test unitario existente/nuevo de `deriveAccion` para `ERROR_TEMPORAL` confirma `REQUIERE_SOPORTE` a partir de 1h de antiguedad, `EN_PROCESO` antes |
| CRE-006 | Backend | Agregar constantes `EMISION_BACKOFF_SECONDS`, `HORAS_CORTE_REINTENTO_EMISION` y helper `nextEmisionBackoffSeconds()` en `facturas.service.ts` | PENDIENTE | Test unitario de la tabla completa de backoff (attempts 1 a 9, confirma que 9 repite el valor de 8) |
| CRE-007 | Backend | Reescribir el bloque `catch` de `processNextQueuedFiscalEmission()`: calcular `cutover` por antiguedad, `outboxEstado`/`estado`/`recoverable` segun RN-2/RN-3, invocar `deriveAccion`+`notifyAccionRequerida`+`markAccionNotificada` segun RN-4/RN-5/RN-6 | PENDIENTE | Tests unitarios (CRE-009) en verde; revision de que `logger` y los imports nuevos (`deriveAccion`, `notifyAccionRequerida`) no generan ciclo de imports (`npm run typecheck` limpio) |
| CRE-008 | QA | Actualizar fakes/mocks de `FacturaRepository` en `apps/api/tests/facturas.service.test.ts` y `apps/api/tests/entrega.service.test.ts` para cumplir la interfaz nueva (`claimNextPendingEmission` devuelve los 3 campos nuevos, `failPendingEmission` acepta `outboxEstado`) | PENDIENTE | `npm run typecheck --workspace @facturacion-simple/api` sin errores; suite existente sigue en verde (sin regresiones respecto a los 6 fallos preexistentes ya documentados en memoria de proyecto, si siguen presentes) |
| CRE-009 | QA | Tests unitarios nuevos: backoff por `attempts`, corte a 24h (incluyendo caso `TIMEOUT` forzado a `ERROR_TEMPORAL`), disparo de notificacion guardado por `accionNotificadaAt`, notificacion que falla no revierte el fallo de emision | PENDIENTE | Casos descritos en PLAN, seccion "Estrategia De Testing", todos en verde en `apps/api/tests/facturas.service.test.ts` |
| CRE-010 | QA real | Validacion manual contra Postgres real (no solo fakes): forzar un fallo de emision repetido (mock/stub del gateway o error real controlado), confirmar backoff creciente en `next_attempt_at`, simular antiguedad >=24h (o reducir temporalmente el umbral para la prueba) y confirmar transicion a `FAILED_PERM`, confirmar que `retryDocumentoEmission` recupera el documento desde `FAILED_PERM` | PENDIENTE | Evidencia de la secuencia completa registrada en este documento (queries `psql` o logs), siguiendo el precedente de rigor de `TASKS_PERSISTENCIA_TIPO_SERVICIO_FACTURA_v0.1.md` (TSF-012) |
| CRE-011 | Cierre | Repasar `SPEC`/`PLAN`/`TASKS` contra la implementacion real y actualizar estados; registrar si `HORAS_PERSISTENCIA_ERROR_TEMPORAL=1` tuvo efectos secundarios inesperados en el badge de otros documentos `ERROR_TEMPORAL` no relacionados al outbox (ver Riesgos en PLAN) | PENDIENTE | Este documento actualizado; SPEC/PLAN sin desviaciones sin documentar |

## Evidencia

_(a completar durante la implementacion)_
