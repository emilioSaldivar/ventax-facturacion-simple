# TASKS Estado Fiscal Canonico v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_ESTADO_FISCAL_CANONICO_v0.1.md`
- `docs/PLAN_ESTADO_FISCAL_CANONICO_v0.1.md`

## Estado General

- `SPEC`: DONE (decisiones D-1 a D-4 del usuario, 2026-10-15)
- `PLAN`: DONE
- `TASKS`: EFC-001 a EFC-010 DONE. EFC-011 PARTIAL: desplegado en produccion el 2026-10-19, falta observar CA-04. EFC-012 PENDIENTE.

## Retomar aqui (estado al 2026-10-19)

**Actualizacion 2026-10-19:** `7fe6ae8` quedo desplegado en produccion (ver EFC-010/EFC-011). Solo falta el paso 6: observar CA-04 en la verificacion agendada de la `0000047`, el 2026-10-19 a las 13:34 UTC. Despues, el paso 7. Los pasos 1 a 5 de abajo quedan como registro historico.

**Donde quedamos (2026-10-16):**
- El codigo esta en `master` (`7fe6ae8`) y desplegado y validado en **staging**.
- **Produccion sigue en `0deef35`**, sin este cambio. El usuario postergo el deploy porque se entro en horario transaccional: hay que hacerlo fuera de ese horario.

**Mientras no se despliegue no hay riesgo:**
- El worker de prod, con el codigo viejo, sigue viendo la `0000047` (`5057016-1`) y la `0000003` (`80044279-2`) como `PENDIENTE_SIFEN`, asi que no envia correos por ellas.
- Su agenda sigue corriendo cada 24 h, y el backoff ya esta en el maximo.

**Pasos para el deploy a produccion, en este orden:**

1. **Decision pendiente del usuario (D-4, Ibanez).** La `0000003` de `80044279-2` (`fiscal_document_id = '2823'`) esta `REJECTED` en FE pero ya se regularizo operativamente. Tras el deploy, el worker la pasaria a "Requiere revision" y **enviaria el correo de accion requerida a sus 6 operadores** en su proxima verificacion agendada. Opciones:
   - (a) marcarla como notificada antes del deploy, que es lo recomendado:
     `update facturas_operativas set accion_notificada_at = now() where fiscal_document_id = '2823' and accion_notificada_at is null;`
   - (b) aceptar que llegue el correo.
2. Confirmar que el outbox de prod no tiene trabajo en vuelo (`PENDING`/`PROCESSING`).
3. Backup: `pg_dump -Fc` de `ventax-facturacion-simple-prod-postgres-1` a `~/backups/facturacion-simple-prod/`, y verificarlo con `pg_restore --list`.
4. En la VPS (`ssh hetzner-jump` o `ssh hetzner`), dentro de `~/apps/ventax-facturacion-simple`: `git pull --ff-only`, y despues `APP_ENV_FILE=.env.production bash scripts/deploy.sh`. No hay migraciones.
5. Verificar:
   - version `7fe6ae8` o posterior, api y frontend healthy, y 0 errores en el log;
   - readiness de los 6 facturadores con `python3 /tmp/check_facturadores.py 8191 ~/.config/ventax/prod-backoffice.env ventax-facturacion-simple-prod-postgres-1`. Si el script ya no esta en `/tmp`, esta descrito en la evidencia de SEG-037.
6. **Caso de prueba (CA-04):** la `0000047` de `5057016-1` debe pasar a `RECHAZADA` ("Requiere revision", causa `0420`) en su proxima verificacion automatica, o antes si un operador presiona "Verificar estado fiscal".
   - Confirmar que `accion_notificada_at` quede marcado y que llegue el correo de accion requerida a los operadores de `5057016-1`.
   - Ojo: el refresh **manual** no envia correo, solo el worker. Para probar el correo hay que esperar la verificacion automatica (agenda alrededor de las 13:34 UTC).
7. Cerrar EFC-010, EFC-011 y EFC-012 con la evidencia, y repasar el SPEC.

**Tambien pendiente de esta sesion (fuera de esta iniciativa):**
- `TASKS_REINTENTO_EMISION_CONFIRMADO_v0.1.md` REC-014: cierre, despues de la validacion manual del usuario.
- La corrida unica de Playwright y verificaciones de las matrices viejas que quedaron sin evidencia (UX9-005, DUX-034, RUX-006/011/015/024, ADR-018, AGS-009, UXS-012).
- La auditoria de matrices desactualizadas con codigo ya implementado (Contrato canonico, Presupuestos v0.2, Scripts ABM, Backoffice admin, Resiliencia F1).
- SPEC de backups automatizados de las DB (ultimo backup automatico: ninguno; solo dumps manuales pre-deploy).
- F4 de segmentacion: debe repetir el backfill de `0034` (hallazgo H-3).
- Los 93 aprobados y los rechazados historicos en prod quedan como estan, por decision D-2. Un operador puede actualizarlos uno a uno con "Verificar estado fiscal".

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
| EFC-009 | Staging | Deploy y smoke real: `GET /documentos/{uuid}` responde y la `0000004` de `4543629-0` queda "Rechazada" tras verificar | DONE (2026-10-15) | Evidencia registrada |
| EFC-010 | Prod, preparacion | Chequeo real de solo lectura de `GET /documentos/{uuid}` sobre la `0000047`; marcar como notificada la `0000003` de `80044279-2` (PLAN §4) **con OK del usuario**; backup | DONE (2026-10-19) | Respuesta `REJECTED`; `accion_notificada_at` marcado solo en 2823 |
| EFC-011 | Prod | Deploy, readiness y caso de prueba de la `0000047` (estado "Rechazada" y correo recibido) | PARTIAL (deploy y readiness DONE el 2026-10-19; falta observar CA-04 a las 13:34 UTC) | CA-04 |
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
- 2026-10-15: EFC-009, staging. `7fe6ae8` desplegado: api y frontend healthy, 0 errores. Contra el FE real de pruebas, `GET /documentos/{uuid}` de la `0000004` de `4543629-0` responde `REJECTED`. El mismo refresh del boton "Verificar estado fiscal" (`refreshFiscalStatusForDocumento`, ejecutado desde el contenedor) la llevo de `PENDIENTE_SIFEN` sin agenda a `RECHAZADA`, con `fiscal_status_raw = REJECTED`, causa `0160 XML Mal Formado.` y sin agenda.
- 2026-10-15/16: EFC-010, preparacion de produccion.
  - Chequeo de solo lectura desde el contenedor `api` de prod con la clave compartida: `GET /documentos/{uuid}` de FE prod responde 200 con `status: REJECTED` para la `0000047` de `5057016-1` y para la `0000003` de `80044279-2`.
  - El usuario decidio **no desplegar todavia**. Prod sigue en `0deef35`, no se marco la 2823 y no se tomo backup.
  - Mientras tanto, el worker de prod (codigo viejo) sigue viendo ambas como `PENDIENTE_SIFEN`, asi que no hay riesgo de correo hasta el deploy.
- 2026-10-15/16: EFC-010, preparacion de produccion. Chequeo de solo lectura desde el contenedor `api` de prod con la clave compartida: `GET /documentos/{uuid}` de FE prod responde 200 con `status: REJECTED` para la `0000047` de `5057016-1` y para la `0000003` de `80044279-2`. El usuario decidio no desplegar todavia (horario transaccional). Prod sigue en `0deef35`; no se marco la 2823 ni se tomo el backup previo.
- 2026-10-19, EFC-010 y EFC-011 (deploy), produccion. Domingo 18 a las 22:40 hora de Paraguay (01:40 UTC del 19), fuera del horario transaccional, con OK del usuario.
  - **Pre-chequeos:**
    - prod en `0deef35`, healthy, 41 GB libres;
    - outbox `factura_emision_outbox` sin trabajo en vuelo (282 `DONE`, ultimo movimiento el 2026-10-17 19:14 UTC);
    - 7 documentos con agenda. 5 de ellos estan `EMITIDA` con agenda vieja, inocuos porque `claimNextVerificacion` solo toma `PENDIENTE_SIFEN`/`EMITIENDO`.
  - **Backup:** `~/backups/facturacion-simple-prod/facturacion_simple-20261019-023937-pre-estado-canonico.dump`, 63876144 bytes, permisos 600, sha256 `dce6dd0e...454eb3f7`.
    - `pg_restore --list`: 36 `TABLE DATA`.
    - Restaurado en un `postgres:16-alpine` descartable con `--network none`. Los conteos dan identicos a prod: 36 tablas, 286 facturas, 282 outbox, 6 facturadores, 7 tenants, y la misma ultima `created_at`.
  - **D-4, opcion (a), por decision del usuario:** `accion_notificada_at` marcado solo en `fiscal_document_id = '2823'` (UPDATE 1). La `2826` (`0000047`) quedo sin marcar.
  - **Deploy:** `APP_ENV_FILE=.env.production bash scripts/deploy.sh` con la VPS en `7fe6ae8` (`origin/master`). Migraciones: `applied: []`, 0001-0034 omitidas.
    - api y frontend healthy;
    - 0 logs de nivel >= 40 en los primeros minutos, worker de verificacion activo;
    - `getDocumentoCanonico` presente en el `dist` de la imagen;
    - staging intacto.
    - Se ignoro `limpieza.sql`, un archivo sin versionar en la VPS que no es de este cambio.
  - **Readiness:** `/tmp/check_facturadores.py` da `TODOS_LISTOS`, los 6 facturadores `ready=True` y sin fallas.
  - **Canonico desde el contenedor nuevo**, en solo lectura: `GET /documentos/{uuid}?env=prod` de la `0000047` responde HTTP 200 con `status: REJECTED` (`FE_GATEWAY_MODE=real`).
  - **Playwright smoke** sobre `https://factura.ventax.app/app/` (el frontend no cambio en este commit): mobile 390x844 y desktop 1280x800 cargan el login con HTTP 200 y sin scroll horizontal. El unico error de consola es el 401 esperado del chequeo de sesion sin login.
    - `scripts/smoke-deploy.cjs` no se corrio completo porque requiere credenciales de operador de prod.
  - **Pendiente CA-04:** la proxima verificacion agendada de la `0000047` es el 2026-10-19 a las 13:34:51 UTC. Ahi debe pasar a `RECHAZADA`, quedar con `accion_notificada_at` y enviar el correo a los operadores de `5057016-1`.
    - La `0000003` (`2823`) tiene agenda el 2026-10-19 a las 12:50 UTC: debe pasar a `RECHAZADA` sin correo.
