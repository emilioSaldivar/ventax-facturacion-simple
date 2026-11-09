# TASKS Carga: Comprobantes Que Requieren Atencion v0.1

## Alineacion

- `docs/SPEC_CARGA_ATENCION_COMPROBANTES_v0.1.md`
- `docs/PLAN_CARGA_ATENCION_COMPROBANTES_v0.1.md`

## Estado

En implementacion desde el 2026-11-09, autorizada por el usuario para el stack local de Segel. Sin despliegue.

## Matriz

| ID | Fase | Tarea | Validacion | Estado |
|---|---|---|---|---|
| CAC-000 | 0 | Linea base de pruebas de `api` y `web-operacion` (E-0) | Salidas registradas | TODO |
| CAC-001 | 1 | Tipos del gateway y metodo `inutilizarComprobanteCarga` (PLAN 1 y 2) | `typecheck`; prueba de URL, metodo y cuerpo en `cargas.real-gateway.test.ts` | TODO |
| CAC-002 | 1 | Mock: atencion, inutilizacion, acciones, totales y cierre (PLAN 3) | `cargas.mock.test.ts` | TODO |
| CAC-003 | 1 | `proximaSincronizacionMs` con `VALIDADA` y sus tres llamadores (PLAN 5) | `cargas-sync.worker.test.ts` | TODO |
| CAC-004 | 2 | Servicio, `409` en `traducirErrorFe`, evento de auditoria y ruta (PLAN 4) | `cargas.service.test.ts`, `cargas.routes.test.ts` | TODO |
| CAC-005 | 2 | `spec/openapi.yaml` (PLAN 7) | YAML valido | TODO |
| CAC-006 | 3 | Pantalla (PLAN 6) | `typecheck` y `build` de `web-operacion` | TODO |
| CAC-007 | 4 | Stack local: `fe-segel` desde `feat/carga-atencion-comprobantes`, FS desde esta rama, linea base de numeracion (PLAN 9) | Salud de los servicios; imagen anterior anotada | TODO |
| CAC-008 | 4 | Playwright CA-01 a CA-07 contra el stack local, 390 y 1280 (PLAN 8) | Resultado de Playwright con capturas | TODO |
| CAC-009 | 5 | Repaso de SPEC, PLAN y TASKS; BACKLOG FS-47; aviso a FE con `FE_REF` | Lectura cruzada | TODO |

## Evidencia

Se completa al cerrar cada tarea.
