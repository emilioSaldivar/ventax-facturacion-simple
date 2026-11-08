# TASKS Nota De Credito Trabada v0.1

## Alineacion

- `docs/SPEC_NOTA_CREDITO_TRABADA_v0.1.md`
- `docs/PLAN_NOTA_CREDITO_TRABADA_v0.1.md`

## Estado

**Documentada el 2026-11-08; sin implementar.** La implementa otra sesion, en el orden de la matriz, antes del despliegue de la segunda entrega en `segel-fs` (`TASKS_DESPLIEGUE_SEGEL_FS_v0.2`, SF2-013g). Cada tarea se cierra con su evidencia aqui. Linea base antes de empezar: registrar en E-0 el resultado de `npm run test`, `npm run typecheck` y `npm run lint` del workspace `api` y `npm run typecheck` y `npm run build` de `web-operacion`, para separar fallos previos de regresiones.

## Matriz

| ID | Fase | Tarea | Validacion | Estado |
|---|---|---|---|---|
| NCT-000 | 0 | Linea base de pruebas (E-0) | Salidas registradas | TODO |
| NCT-001 | 1 | `esNotaTrabada` y los valores `REINTENTAR_NOTA_CREDITO` y `NUEVA_NOTA_CREDITO` en `facturas.accion.ts`; `puedeReintentarEmision` en `false` para `NOTA_CREDITO` (PLAN, secciones 3 y 4) | Tests unitarios de `facturas.accion`: nota trabada menor y mayor a 48 h, nota rechazada, nota sin marca | TODO |
| NCT-002 | 1 | `clasificarRespuestaNotaCredito` en `nota-credito.clasificacion.ts` (PLAN, seccion 3) | `nota-credito.clasificacion.test.ts` con una prueba por fila de la tabla | TODO |
| NCT-003 | 1 | Repositorio: `findNotasCreditoByOriginal`, `updateNotaCreditoTrasReintento`, `fiscal_status.code` en el `insert` de la nota (PLAN, seccion 2) | Test de integracion con Postgres: lista ordenada, `COALESCE` de identidad, relectura tras `23505` | TODO |
| NCT-004 | 1 | `emitNotaCreditoTotal` con clave derivada, intento, persistencia ante `502`/`504`/`500`, reintento idempotente y `reintentarNotaCredito` (PLAN, seccion 1) | Tests de servicio con el mock de NCT-005: CA-01, CA-02, CA-03, CA-05 y RN-10 | TODO |
| NCT-005 | 1 | Escenarios del `MockFiscalGateway.emitNotaCredito` por marcador y conteo por clave (PLAN, seccion 6) | Tests existentes del mock en verde; test nuevo por marcador | TODO |
| NCT-006 | 2 | Rutas: `nota-credito` sin `Idempotency-Key` y `nota-credito/reintentar` (PLAN, seccion 5) | Test de ruta con fakes: `201`, `200` por reintento, `409` nota no trabada, `409` RN-10, `502` otros errores | TODO |
| NCT-007 | 2 | `spec/openapi.yaml` (PLAN, seccion 5) | YAML valido; descripciones coherentes con NCT-006 | TODO |
| NCT-008 | 2 | `listNotaCreditoCandidates` ignora notas `RECHAZADA` (PLAN, seccion 4) | Test: factura con nota rechazada vuelve elegible; con nota emitida o trabada, no | TODO |
| NCT-009 | 2 | Worker de verificacion: excluir notas trabadas sin identidad, o evidencia de que ya las excluye (PLAN, seccion 8) | Test o lectura con `archivo:linea` registrada | TODO |
| NCT-010 | 3 | Pantalla: quitar la clave del navegador, boton "Reintentar nota de credito", `mensajeNotaCredito`, accion "Emitir nueva nota de credito", ventana de exito segun estado (PLAN, seccion 7) | `npm run typecheck` y `npm run build` de `web-operacion`; `grep` sin `notaCreditoIdempotencyKey` | TODO |
| NCT-011 | 3 | `bash scripts/deploy.sh` y Playwright `scripts/playwright-nota-credito-trabada.cjs` en 390 y 1280 px (PLAN, seccion 9; CA-07) | Escenarios, viewports y resultado registrados en E-1 | TODO |
| NCT-012 | 3 | Validaciones completas del workspace `api` y de `web-operacion` (CA-06) | Sin regresiones frente a E-0 | TODO |
| NCT-013 | 4 | CA-09 en el ensayo de volumen con `segel-rc4` (`TASKS_DESPLIEGUE_SEGEL_FS_v0.2`, SF2-018b) | Nota sobre factura de carga emitida; reintento real si FE presta el simulador; registrado en E-2 | TODO |
| NCT-014 | 4 | Cierre: SPEC y PLAN repasados con lo implementado; `BACKLOG.md` FS-38 cerrado con el commit; `SPEC_CONTRATO_FE_SOBRECARGA_v0.1` RN-05 anotada como reemplazada | Documentos alineados | TODO |

## Evidencia

### E-0. Linea base

Pendiente.

### E-1. Playwright

Pendiente.

### E-2. Ensayo de volumen

Pendiente.
