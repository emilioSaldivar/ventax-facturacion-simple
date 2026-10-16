# TASKS Estado Fiscal Canonico v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_ESTADO_FISCAL_CANONICO_v0.1.md`
- `docs/PLAN_ESTADO_FISCAL_CANONICO_v0.1.md`

## Estado General

- `SPEC`: DONE (decisiones D-1 a D-4 del usuario, 2026-10-15)
- `PLAN`: DONE
- `TASKS`: EFC-001 a EFC-008 DONE. EFC-009 a EFC-012 PENDIENTE.

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
| --- | --- | --- | --- | --- |
| EFC-001 | SDD | SPEC/PLAN/TASKS | DONE | Los tres documentos existen, consistentes con D-1 a D-4 |
| EFC-002 | Gateway | `FiscalDocumentoCanonicoResponse`, `getDocumentoCanonico()` real y mock, y `mapDocumentStatusCanonico()` (PLAN §1) | DONE (2026-10-15) | Tests unitarios de la tabla de traduccion completa |
| EFC-003 | Gateway | Retirar la decision por codigo SIFEN del refresh (`mapRefreshDocumentStatusWithCode`); `isApprovedFiscalCode` queda solo en emision (CA-05) | DONE (2026-10-15) | `grep` muestra `isApprovedFiscalCode` solo en el mapeo de emision |
| EFC-004 | Servicio | `refreshFiscalStatusForDocumento` en dos pasos: SIFEN best-effort y canonico obligatorio (PLAN §2) | DONE (2026-10-15) | Tests de servicio de PLAN §5 en verde |
| EFC-005 | Repositorio | Agenda sin huerfanos en `updateFiscalStatus` (PLAN §3, RN-04) | DONE (2026-10-15) | Integracion con Postgres: agenda el pendiente sin agenda y desagenda el final |
| EFC-006 | Worker | Prueba de notificacion unica en el paso a `RECHAZADA`, y sin correo si ya estaba notificado | DONE (2026-10-15) | Test en `verificacion.worker.test.ts` |
| EFC-007 | Mock | `FE_MOCK_CANONICAL_STATUS` para el E2E | DONE (2026-10-15) | Con el valor `REJECTED`, el refresh mock da `RECHAZADA` |
| EFC-008 | QA | `test`/`typecheck`/`lint` de `api`; `typecheck`/`build` de `web-operacion`; Playwright sobre contenedores en mobile y desktop (documento `RECHAZADA` con causa) | DONE (2026-10-15) | Sin regresiones respecto a la linea base de 6 fallos preexistentes; Playwright en verde |
| EFC-009 | Staging | Deploy y smoke real: `GET /documentos/{uuid}` responde y la `0000004` de `4543629-0` queda "Rechazada" tras verificar | PENDIENTE | Evidencia registrada |
| EFC-010 | Prod, preparacion | Chequeo real de solo lectura de `GET /documentos/{uuid}` sobre la `0000047`; marcar como notificada la `0000003` de `80044279-2` (PLAN §4) **con OK del usuario**; backup | PENDIENTE | Respuesta `REJECTED`; `accion_notificada_at` marcado solo en 2823 |
| EFC-011 | Prod | Deploy, readiness y caso de prueba de la `0000047` (estado "Rechazada" y correo recibido) | PENDIENTE | CA-04 |
| EFC-012 | Cierre | Repasar SPEC/PLAN/TASKS | PENDIENTE | Sin desvios sin documentar |

## Evidencia

- 2026-10-15: hallazgo y medicion en el SPEC (99 pendientes en el SaaS de prod: 93 `APPROVED`, 5 `REJECTED`, 1 `DRAFT` en FE). Solo 2 pendientes de prod tienen agenda: la `0000047` (`5057016-1`) y la `0000003` (`80044279-2`), ambas `REJECTED` en FE y sin notificar.
- 2026-10-15: EFC-002 a EFC-008, implementacion y validacion local.
  - **Gateway:** `getDocumentoCanonico()` real (`GET /documentos/{uuid}?env=`, clave compartida) y mock. `mapDocumentStatusCanonico()` con la tabla del SPEC. El refresh SIFEN deja de decidir el estado: `mapRefreshDocumentStatusWithCode` eliminado, y `isApprovedFiscalCode` queda solo en el mapeo de emision (CA-05, verificado con `grep`).
  - **Servicio:** el paso SIFEN es best-effort y el canonico decide; con status desconocido se conserva el estado. **Repositorio:** la agenda sin huerfanos esta en `updateFiscalStatus`.
  - **Tests:** `typecheck` y `lint` de `api` limpios. **444 en verde** (antes 439) y los mismos 6 fallos preexistentes. Nuevos:
    - 22 casos del gateway: tabla completa de traduccion, URL y clave del canonico, error 404, y el 0422 que ya no aprueba;
    - 5 del servicio: REJECTED con 0420 da RECHAZADA, APPROVED con 0160 da EMITIDA, SIFEN caido con canonico OK, canonico caido da 502 sin actualizar, status desconocido conserva el estado;
    - integracion con Postgres `facturas.estado-canonico.integration.test.ts` 3/3: agenda un pendiente huerfano, respeta el backoff existente y desagenda el final.
  - Los dos tests anti-spam del worker (`verificacion.worker.test.ts`) cubren EFC-006 sin cambios. Los fakes derivan el status canonico del estado que declara cada test.
  - **Contenedores**, con el mismo desvio de build documentado en `TASKS_REINTENTO_EMISION_CONFIRMADO_v0.1.md` (`docker build --network host` + `compose up --no-build`):
    - `scripts/playwright-estado-canonico.cjs` con `FE_MOCK_CANONICAL_STATUS=REJECTED`: **10/10 en mobile 390x844 y desktop 1280x800**. Tras "Verificar estado fiscal", el documento pasa a "Requiere revision" con aviso de causa y "Copiar datos para soporte", sin "Reintentar emision" y con un solo "Verificar estado fiscal" (en opciones avanzadas). En base: `RECHAZADA`, `fiscal_status_raw = REJECTED`, sin agenda.
    - Regresion `scripts/playwright-reintento-emision.cjs` con el mock en `APPROVED`: 24/24.
