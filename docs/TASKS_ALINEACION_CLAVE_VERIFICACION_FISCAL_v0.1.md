# TASKS Alineacion De Clave En Verificacion Fiscal v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_ALINEACION_CLAVE_VERIFICACION_FISCAL_v0.1.md`
- `docs/PLAN_ALINEACION_CLAVE_VERIFICACION_FISCAL_v0.1.md`

## Estado General

- `SPEC`: DONE (verificado contra la VPS el 2026-08-28)
- `PLAN`: DONE
- `TASKS`: IMPLEMENTADO Y VALIDADO EN LOCAL. ACV-003 a ACV-009 DONE, ACV-010 parcial. Pendiente deploy (ACV-011/ACV-012).

Incidente activo en produccion al abrir esta iniciativa: la verificacion fiscal
automatica falla al 100% desde al menos `2026-08-26T05:55Z`.

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
| --- | --- | --- | --- | --- |
| ACV-001 | SDD | Crear cadena SPEC/PLAN/TASKS de esta iniciativa | DONE | Existen los tres documentos, alineados entre si y referenciados desde `docs/BACKLOG.md` |
| ACV-002 | Verificacion | Confirmar contra la VPS que el defecto sigue vigente y no fue resuelto en el backend fiscal | DONE | Prueba funcional en vivo con ambas claves + inspeccion del `dist` que corre en `fe-prod`/`fe-test` + estado git del repo fiscal |
| ACV-003 | Backend | `verificacion.worker.ts`: usar `options.gateway` (clave compartida) y eliminar `gatewayWithKey` de las opciones del worker, con comentario que documente el reparto de claves y referencie el SPEC | DONE | El worker no tiene ninguna ruta de codigo que construya un gateway con `fe_consumer_api_key` |
| ACV-004 | Backend | `server.ts`: quitar el argumento `gatewayWithKey` de `startVerificacionFiscalWorker`, sin tocar el wiring de `startFacturaEmissionWorker` | DONE | `npm run typecheck` limpio; el worker de emision conserva su `gatewayWithKey` |
| ACV-005 | Tipos | `facturas.types.ts`: eliminar `facturadorApiKey` de `PendingVerificacion`, conservandolo en `PendingFiscalEmission` | DONE | Typecheck del workspace `api` sin errores |
| ACV-006 | Backend | `facturas.repository.ts`: en `claimNextVerificacion`, quitar `fa.fe_consumer_api_key` del `returning`, el campo del mapeo y el `join facturadores fa` que queda sin uso | DONE | Verificado contra Postgres real: el conteo y los ids de filas reclamadas son identicos antes y despues del cambio |
| ACV-007 | QA | Ajustar fakes de `PendingVerificacion` en los tests existentes al nuevo shape | DONE | Suite del workspace `api` sin errores de compilacion en tests |
| ACV-008 | QA | Test de no-regresion: con un facturador que tiene `fe_consumer_api_key`, el worker debe usar el gateway compartido | DONE | El test falla si se restaura la seleccion por clave de facturador; en verde con la correccion |
| ACV-009 | QA | Suite completa del workspace `api` comparada contra la linea base de fallos preexistentes | DONE | Cero regresiones respecto de la linea base (6 fallos preexistentes conocidos), confirmado con `git stash` sobre el commit base |
| ACV-010 | QA real | Validar contra el backend fiscal real que el camino corregido responde 200 sobre un documento en `PENDIENTE_SIFEN` | PARCIAL — mitad local DONE, mitad contra backend fiscal real pendiente de ACV-011 | Evidencia de la llamada y su codigo HTTP registrada en este documento |
| ACV-011 | Deploy staging | Desplegar en staging con `bash scripts/deploy.sh` y verificar una verificacion real de punta a punta | PENDIENTE | Log de `fe-test` con 200 en `/documentos/:uuid/sifen` proveniente del worker; sin 401 nuevos |
| ACV-012 | Deploy produccion | Desplegar en produccion y observar el primer ciclo completo del worker | PENDIENTE | Sin `401` nuevos en los logs del api; la cola de 44 documentos drena (estado terminal o `sifen_last_checked_at` actualizado); emision y recibos sin regresion |
| ACV-013 | Backlog | Registrar las dos iniciativas derivadas: rediseño de clave-por-ruta en el cliente fiscal, y recuperacion de los 101 documentos retirados por el corte de 30 dias | PENDIENTE | Ambas filas presentes en `docs/BACKLOG.md` |
| ACV-014 | Cierre | Repasar SPEC/PLAN/TASKS contra lo realmente implementado y desplegado | PENDIENTE | Documentos sin desviaciones sin documentar |

## Orden De Ejecucion

1. `ACV-001`, `ACV-002` (hechos)
2. `ACV-003` a `ACV-006`
3. `ACV-007` a `ACV-010`
4. `ACV-011`
5. `ACV-012`
6. `ACV-013`, `ACV-014`

## Dependencias Y Puertas De Avance

- No desplegar a staging (`ACV-011`) sin `ACV-009` y `ACV-010` en verde.
- No desplegar a produccion (`ACV-012`) sin `ACV-011` verificado con una
  verificacion real de punta a punta.
- El deploy de produccion arrastra tambien el commit `71c6f41` (flag del cron
  DNIT) y cualquier otro cambio pendiente de esa rama: produccion esta hoy en
  `9fe452f`. Antes de `ACV-012` hay que decidir explicitamente si se acepta ese
  arrastre o se aisla el fix, y dejar la decision registrada aqui.
- La cola de produccion no requiere migracion ni script de recuperacion: los 44
  documentos se resuelven solos. Si tras el primer ciclo no drenan, detener y
  documentar antes de intentar correcciones manuales.

## Evidencia

- 2026-08-28: `ACV-002` completado contra la VPS Hetzner. El defecto **sigue
  vigente**, no fue resuelto en el backend fiscal:
  - `dist` en ejecucion de `fe-prod-api-1` y `fe-test-api-1`:
    `router.get('/documentos/:uuid/sifen', requireApiKey, ...)`, y el middleware
    compilado compara `provided !== env.API_KEY`. `requireApiConsumer` (el otro
    sistema) resuelve estrictamente contra `api_consumers`, sin fallback en
    ninguna direccion.
  - Repo `~/apps/facturacion-electronica` en `ea261b7`, rama `main`, sin commits
    pendientes en su `origin`: no hay fix aguas arriba esperando deploy.
  - Prueba funcional en vivo contra `fe-prod`, documento real de produccion
    `9e4dd3a1-f812-4e06-8eab-d08b5781ddda` (`env=prod`, sin `refresh`, para no
    disparar consulta a SIFEN): clave compartida -> **200**; clave de consumidor
    del facturador -> **401**; sin clave -> 401.
  - Comparacion de claves sin exponer valores: `FE_API_KEY` del SaaS coincide con
    `API_KEY` del backend fiscal en staging y en produccion; las 4
    `fe_consumer_api_key` por facturador difieren de la compartida en ambos
    ambientes.
  - Los 5 consumidores de `api_consumers` estan activos y tienen
    `SIFEN_STATUS_READ`, lo que confirma que el permiso no habilita esa ruta
    porque pertenece al otro sistema de autenticacion.
  - Impacto en produccion: 103 fallos en 7 dias, 43 documentos distintos, 3
    facturadores; 44 documentos `PENDIENTE_SIFEN` en cola (2026-08-01 a
    2026-08-29), todos con `document_uuid`, hasta 18 intentos acumulados.
  - Staging: mismo `dist`, mismas condiciones de clave; no acusa el error solo
    porque su cola tiene 1 documento y ninguno vencido. Defecto latente.
  - Auditoria de puntos de llamada: el defecto es unico y acotado al worker de
    verificacion. Emision (`/factura`) y recibos (`/recibos/*`) usan clave de
    consumidor correctamente; el refresh manual y el resto de rutas usan la
    compartida correctamente.
- 2026-08-28: `ACV-003` a `ACV-005` implementados:
  - `verificacion.worker.ts`: `processOne` usa `options.gateway` (clave compartida);
    `gatewayWithKey` eliminado de la interfaz de opciones del worker. Se agrego un
    comentario de cabecera que documenta el reparto de claves del backend fiscal y
    referencia este SPEC, para que la seleccion por facturador no se "restaure"
    creyendo que falta.
  - `server.ts`: quitado el argumento `gatewayWithKey` de
    `startVerificacionFiscalWorker`. El bloque `FE_OUTBOX_WORKER_ENABLED` quedo
    intacto: la emision si necesita la clave de consumidor.
  - `facturas.types.ts`: `PendingVerificacion` ya no transporta `facturadorApiKey`
    (con comentario que explica por que). `PendingFiscalEmission` lo conserva.
  - Auditoria posterior: las unicas referencias vivas a `facturadorApiKey`/
    `gatewayWithKey` son las del camino de emision (`facturas.service.ts:1082`,
    `facturas.worker.ts`, `server.ts:23`) y el schema homonimo del backoffice.
    El camino de verificacion quedo sin ninguna.
- 2026-08-28: `ACV-006` completado y verificado contra Postgres real
  (`nuevo_repo-postgres-1`, puerto 5433, 30 migraciones). Se quitaron
  `fa.fe_consumer_api_key` del `returning`, el campo del mapeo y el
  `join facturadores fa`. Equivalencia de filas demostrada con tres variantes
  ejecutadas dentro de transacciones con `ROLLBACK` (sin mutar datos), sobre 3
  documentos sinteticos elegibles (`PENDIENTE_SIFEN` y `EMITIENDO`, distintos
  `verificacion_next_at` y `verificacion_attempts`):
  - Variante A (query vieja, con join) y Variante B (query nueva, sin join)
    devolvieron **los mismos 3 ids**, con el mismo `facturador_id`, `document_uuid`,
    `estado` y el mismo incremento de `verificacion_attempts` (2->3, 0->1, 7->8).
  - Variante C (query nueva, con el facturador sin `fe_consumer_api_key`) reclamo
    igual la fila: se confirma que el join era un inner join por clave primaria y
    su remocion no puede cambiar el conjunto reclamado.
  - Estado final verificado: 0 filas sinteticas remanentes y el conteo de
    facturadores con clave sin cambios.
- 2026-08-28: `ACV-007` a `ACV-009` completados:
  - `apps/api/tests/verificacion.worker.test.ts`: `buildPendingVerificacion` sin
    `facturadorApiKey` y los 7 `startVerificacionFiscalWorker` sin `gatewayWithKey`.
  - `ACV-008`, dos tests nuevos: (1) el worker usa siempre el gateway compartido —
    se le pasa a proposito una fabrica `gatewayWithKey` espia y se afirma que
    **nunca** se invoca, mientras el gateway compartido recibe la llamada;
    (2) el trabajo reclamado no expone `facturadorApiKey`.
  - Guard verificado por mutacion: reintroduciendo temporalmente la seleccion por
    clave en el worker, el test (1) **falla** (`1 failed | 9 passed`); restaurada
    la correccion, vuelve a `10 passed`. El test muerde de verdad.
  - `npm run typecheck --workspace @facturacion-simple/api`: limpio.
  - `ACV-009`, suite completa: **214 passed | 6 failed (220)**. Los 6 fallos son
    exactamente los preexistentes ya documentados (`entrega.service.test.ts` x2,
    `facturas.service.test.ts` x4), mismos nombres que la linea base de `CRE-009`.
    Cero regresiones; el total sube de 218 a 220 por los 2 tests nuevos.
- 2026-08-28: `ACV-010` mitad local completada. Se ejercitaron el **repositorio y
  el worker reales** (`PgFacturaRepository`, `startVerificacionFiscalWorker`,
  `createFiscalGateway` en modo `real`) contra Postgres real, con un servidor HTTP
  que replica literalmente el middleware `requireApiKey` del backend fiscal
  (`provided !== API_KEY` -> `401 {"error":"UNAUTHORIZED","message":"API key invalida"}`).
  Documento sintetico en `PENDIENTE_SIFEN` con el facturador teniendo clave de
  consumidor propia seteada:
  - `claimNextVerificacion()` devolvio el shape nuevo — campos `documentoId`,
    `facturadorId`, `documentUuid`, `estado`, `attempts`, `accionNotificadaAt`,
    `createdAt`; `"facturadorApiKey" in item === false`.
  - Unica llamada saliente: `GET /documentos/acv010-uuid/sifen?env=test&refresh=true`
    con la clave **COMPARTIDA** -> **200**. Con la clave de consumidor el servidor
    habria respondido 401, igual que el backend real.
  - El documento transiciono `PENDIENTE_SIFEN` -> `EMITIDA`, se retiro de la agenda
    (`verificacion_next_at = null`), con `sifen_last_checked_at` y
    `sifen_result_code = 0260` persistidos.
  - Datos sinteticos eliminados al terminar (0 filas remanentes).
  - Pendiente de esta tarea: la corrida equivalente contra el backend fiscal real,
    que solo es alcanzable desde la VPS y se hace junto con `ACV-011`.
  - Nota de higiene: el script dejo `facturadores.fe_consumer_api_key` del
    facturador local de smoke (`754f72f1`, "Facturador Smoke") con el valor de
    prueba `clave-de-consumidor-de-prueba`; el valor previo no se capturo antes de
    sobrescribirlo. Afecta solo a la base de desarrollo local, no a staging ni a
    produccion.
