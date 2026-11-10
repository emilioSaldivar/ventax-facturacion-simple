# TASKS Editor De Factura En Modo Completo (PC) v0.1

## Alineacion

- `docs/SPEC_EDITOR_FACTURA_PC_v0.1.md`
- `docs/PLAN_EDITOR_FACTURA_PC_v0.1.md`

## Estado

Documentada el 2026-11-10 como borrador. No se implementa hasta que el usuario confirme D-1 a D-5 del SPEC y se cierren MON-008 (y MON-009 si corresponde) de `TASKS_MONEDA_EXTRANJERA_v0.1.md`.

## Matriz

| ID | Tarea | Validacion | Estado |
|---|---|---|---|
| EPC-001 | Estado unico de factura con `modoEditor`, preferencia en el navegador y corte en 1024 px (PLAN 1) | `typecheck`, `build` | TODO |
| EPC-002 | `GrillaLineas`: filas editables, fila vacia final, teclado, validacion por fila, catalogo desde la celda, casilla de guardado (PLAN 2) | `typecheck`, `build`, unitarias de validacion | TODO |
| EPC-003 | `EditorCompleto`: banda, cliente, grilla, totales y acciones; conmutador (PLAN 2 y 4) | `typecheck`, `build` | TODO |
| EPC-004 | Totales locales en vivo y vista previa del servidor al crear (PLAN 3, D-3) | unitarias | TODO |
| EPC-005 | Playwright 1440, 1280 y 390 con emision real en SIFEN test (PLAN 6, CA-01 a CA-07) | Resultado y capturas | TODO |
| EPC-006 | Repaso de SPEC, PLAN y wireframe; `AGENTS.md` y BACKLOG | Lectura cruzada | TODO |

## Evidencia

Se completa al cerrar cada tarea.
