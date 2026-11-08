# TASKS Nota De Credito Trabada v0.1

## Alineacion

- `docs/SPEC_NOTA_CREDITO_TRABADA_v0.1.md`
- `docs/PLAN_NOTA_CREDITO_TRABADA_v0.1.md`

## Estado

**Implementada y validada el 2026-11-08 (`a680ee2`).** Documentada el mismo dia. La implementa otra sesion, en el orden de la matriz, antes del despliegue de la segunda entrega en `segel-fs` (`TASKS_DESPLIEGUE_SEGEL_FS_v0.2`, SF2-013g). Cada tarea se cierra con su evidencia aqui. Linea base antes de empezar: registrar en E-0 el resultado de `npm run test`, `npm run typecheck` y `npm run lint` del workspace `api` y `npm run typecheck` y `npm run build` de `web-operacion`, para separar fallos previos de regresiones.

## Matriz

| ID | Fase | Tarea | Validacion | Estado |
|---|---|---|---|---|
| NCT-000 | 0 | Linea base de pruebas (E-0) | Salidas registradas | DONE: E-0 |
| NCT-001 | 1 | `esNotaTrabada` y los valores `REINTENTAR_NOTA_CREDITO` y `NUEVA_NOTA_CREDITO` en `facturas.accion.ts`; `puedeReintentarEmision` en `false` para `NOTA_CREDITO` (PLAN, secciones 3 y 4) | Tests unitarios de `facturas.accion`: nota trabada menor y mayor a 48 h, nota rechazada, nota sin marca | DONE: `facturas.accion.ts`; pruebas en `nota-credito.clasificacion.test.ts` y `facturas.service.test.ts` |
| NCT-002 | 1 | `clasificarRespuestaNotaCredito` en `nota-credito.clasificacion.ts` (PLAN, seccion 3) | `nota-credito.clasificacion.test.ts` con una prueba por fila de la tabla | DONE: 24 pruebas en `nota-credito.clasificacion.test.ts` |
| NCT-003 | 1 | Repositorio: `findNotasCreditoByOriginal`, `updateNotaCreditoTrasReintento`, `fiscal_status.code` en el `insert` de la nota (PLAN, seccion 2) | Test de integracion con Postgres: lista ordenada, `COALESCE` de identidad, relectura tras `23505` | DONE: `nota-credito-trabada.integration.test.ts` 4/4 contra Postgres de `fs-cm` (E-0). Necesito la migracion `0038` (PLAN, seccion 2) |
| NCT-004 | 1 | `emitNotaCreditoTotal` con clave derivada, intento, persistencia ante `502`/`504`/`500`, reintento idempotente y `reintentarNotaCredito` (PLAN, seccion 1) | Tests de servicio con el mock de NCT-005: CA-01, CA-02, CA-03, CA-05 y RN-10 | DONE: 11 pruebas nuevas en `facturas.service.test.ts` (CA-01 a CA-05, RN-09, RN-10) |
| NCT-005 | 1 | Escenarios del `MockFiscalGateway.emitNotaCredito` por marcador y conteo por clave (PLAN, seccion 6) | Tests existentes del mock en verde; test nuevo por marcador | DONE: marcadores `[FE-502]`, `[FE-504]`, `[FE-500]`, `[FE-DRAFT]`, `[FE-TF-409]`, `[FE-REJECTED]`, `[FE-TOTAL]` |
| NCT-006 | 2 | Rutas: `nota-credito` sin `Idempotency-Key` y `nota-credito/reintentar` (PLAN, seccion 5) | Test de ruta con fakes: `201`, `200` por reintento, `409` nota no trabada, `409` RN-10, `502` otros errores | DONE: `200` por reintento, `201` nueva; ruta `nota-credito/reintentar` |
| NCT-007 | 2 | `spec/openapi.yaml` (PLAN, seccion 5) | YAML valido; descripciones coherentes con NCT-006 | DONE: YAML valido con las dos rutas |
| NCT-008 | 2 | `listNotaCreditoCandidates` ignora notas `RECHAZADA` (PLAN, seccion 4) | Test: factura con nota rechazada vuelve elegible; con nota emitida o trabada, no | DONE: el servicio y la pantalla ignoran las notas `RECHAZADA` |
| NCT-009 | 2 | Worker de verificacion: excluir notas trabadas sin identidad, o evidencia de que ya las excluye (PLAN, seccion 8) | Test o lectura con `archivo:linea` registrada | DONE: el worker solo toma documentos con `document_uuid` y agenda (`facturas.repository.ts`, `claimNextVerificacion`); la nota trabada se guarda sin agenda. Ademas, verificar una nota trabada es reintentarla (PLAN, seccion 8) |
| NCT-010 | 3 | Pantalla: quitar la clave del navegador, boton "Reintentar nota de credito", `mensajeNotaCredito`, accion "Emitir nueva nota de credito", ventana de exito segun estado (PLAN, seccion 7) | `npm run typecheck` y `npm run build` de `web-operacion`; `grep` sin `notaCreditoIdempotencyKey` | DONE: typecheck y build en verde; sin `notaCreditoIdempotencyKey` |
| NCT-011 | 3 | `bash scripts/deploy.sh` y Playwright `scripts/playwright-nota-credito-trabada.cjs` en 390 y 1280 px (PLAN, seccion 9; CA-07) | Escenarios, viewports y resultado registrados en E-1 | DONE: E-1, 10/10 |
| NCT-012 | 3 | Validaciones completas del workspace `api` y de `web-operacion` (CA-06) | Sin regresiones frente a E-0 | DONE: E-0 |
| NCT-013 | 4 | CA-09 en el ensayo de volumen con `segel-rc4` (`TASKS_DESPLIEGUE_SEGEL_FS_v0.2`, SF2-018b) | Nota sobre factura de carga emitida; reintento real si FE presta el simulador; registrado en E-2 | DONE: E-2 |
| NCT-014 | 4 | Cierre: SPEC y PLAN repasados con lo implementado; `BACKLOG.md` FS-38 cerrado con el commit; `SPEC_CONTRATO_FE_SOBRECARGA_v0.1` RN-05 anotada como reemplazada | Documentos alineados | DONE |

## Evidencia

### E-0. Linea base y validaciones (2026-11-08)

- Antes: `vitest` del workspace `api` 601 en verde y 35 omitidas; `tsc` limpio en `api` y `web-operacion`.
- Despues: 636 en verde y 39 omitidas (las de integracion sin `DATABASE_URL_TEST`); `typecheck` y `lint` de `api` limpios; `typecheck` y `build` de `web-operacion` limpios; `check-no-secrets` OK.
- Integracion contra el Postgres de `fs-cm` (stack de `bash scripts/deploy.sh` con `APP_ENV_FILE=.local/carga-masiva/env`, mock de FE), con la migracion `0038` aplicada: `nota-credito-trabada.integration.test.ts` 4/4.
- Regresion: `scripts/playwright-carga-masiva.cjs` 86/86 sobre el mismo stack.

### E-1. Playwright (2026-11-08)

`scripts/playwright-nota-credito-trabada.cjs` contra `fs-cm` (`bash scripts/deploy.sh`, mock de FE), 390 px y 1280 px: 10/10.

- `[FE-502]`: la nota queda "Nota de crédito sin confirmar" con boton de reintento.
- Tras recargar la pagina, el detalle de la nota muestra el aviso, el encabezado dice "Nota credito sin confirmar", no ofrece "Verificar estado fiscal" y no hay desplazamiento horizontal.
- El reintento la deja emitida: una sola fila, una sola clave.
- `[FE-REJECTED]`: la nota rechazada ofrece "Emitir nueva nota de crédito" y no "Corregir y emitir de nuevo".
- La segunda nota sobre esa factura se emite: filas `RECHAZADA,EMITIDA`, dos claves.

Capturas en `test-results/nota-credito-trabada/`, fuera de git.

### E-2. Ensayo de volumen (2026-11-08)

Nota de credito real sobre una factura de la carga C en el ensayo con FE `segel-rc4` en SIFEN test (`TASKS_DESPLIEGUE_SEGEL_FS_v0.2`, E-2): emitida en lote como 1010002, aprobada por FE en un minuto y emitida en FS por la verificacion automatica. El caso `TRANSMISSION_FAILED` real no se puede provocar: FS manda la nota en lote y FE solo responde `502`/`504` en envio sincronico (respuesta de FE, 2026-11-08). CA-09 se cubre con CA-01 y el mock, como preveia el SPEC.
