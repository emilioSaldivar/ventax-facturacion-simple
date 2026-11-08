# TASKS Indices Del Padron DNIT v0.1

## Alineacion

- `docs/SPEC_INDICES_PADRON_DNIT_v0.1.md`
- `docs/PLAN_INDICES_PADRON_DNIT_v0.1.md`

## Matriz

| ID | Tarea | Validacion | Estado |
|---|---|---|---|
| IPD-001 | SPEC, PLAN y TASKS; `AGENTS.md`; `BACKLOG.md` | Documentos consistentes | DONE (2026-11-08) |
| IPD-002 | Prueba previa en transaccion revertida (PLAN, validacion 1) | Planes y tamanos registrados en E-1 | DONE (2026-11-08) |
| IPD-003 | Migracion `0039` y SQL del cargador | Suites de `api`; `deploy.sh` aplica `0039` | TODO |
| IPD-004 | Ensayo: tamanos, planes, consulta por API e importacion completa | CA-01 a CA-03 en E-2 | TODO |

## Evidencia

### E-1. Antes y prueba revertida (2026-11-08)

- Tabla 328 MB, indices 330 MB, total 658 MB; base 671 MB.
- Con todos los indices, las dos consultas usan `idx_dnit_ruc_sin_dv` (0,9 ms y 0,1 ms).
- Sin los cuatro indices (transaccion revertida): las dos usan `uq_dnit_ruc` (1,2 ms y 1,3 ms); indices 129 MB.
