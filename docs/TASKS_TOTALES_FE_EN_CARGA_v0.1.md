# TASKS Totales De FE En La Carga v0.1

## Alineacion

- `docs/SPEC_TOTALES_FE_EN_CARGA_v0.1.md`
- `docs/PLAN_TOTALES_FE_EN_CARGA_v0.1.md`

## Estado

En implementacion desde el 2026-11-09, autorizada por el usuario. La prueba conjunta espera el tag de FE con `detalle.totales`.

## Matriz

| ID | Fase | Tarea | Validacion | Estado |
|---|---|---|---|---|
| TFC-001 | 1 | Tipos (PLAN 1) | `typecheck` | TODO |
| TFC-002 | 1 | Mapeo y marca de nota de credito (PLAN 2) | Pruebas de `comprobanteAFactura` | TODO |
| TFC-003 | 1 | Mock con totales (PLAN 5) | `cargas.mock.test.ts` | TODO |
| TFC-004 | 2 | Nota de credito no elegible (PLAN 3, servicio) | `facturas.service.test.ts` | TODO |
| TFC-005 | 2 | Pantalla (PLAN 3) y `spec/openapi.yaml` (PLAN 4) | `typecheck` y `build` de `web-operacion`; YAML valido | TODO |
| TFC-006 | 3 | Prueba conjunta con FE en SIFEN test (CA-05) | Playwright y totales FS = FE | BLOQUEADA: espera el tag de FE |
| TFC-007 | 4 | Repaso de SPEC, PLAN, TASKS y BACKLOG FS-45 | Lectura cruzada | TODO |

## Evidencia

Se completa al cerrar cada tarea.
