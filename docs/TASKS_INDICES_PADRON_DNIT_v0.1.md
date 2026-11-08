# TASKS Indices Del Padron DNIT v0.1

## Alineacion

- `docs/SPEC_INDICES_PADRON_DNIT_v0.1.md`
- `docs/PLAN_INDICES_PADRON_DNIT_v0.1.md`

## Matriz

| ID | Tarea | Validacion | Estado |
|---|---|---|---|
| IPD-001 | SPEC, PLAN y TASKS; `AGENTS.md`; `BACKLOG.md` | Documentos consistentes | DONE (2026-11-08) |
| IPD-002 | Prueba previa en transaccion revertida (PLAN, validacion 1) | Planes y tamanos registrados en E-1 | DONE (2026-11-08) |
| IPD-003 | Migracion `0039` y SQL del cargador | Suites de `api`; `deploy.sh` aplica `0039` | DONE (2026-11-08, `97f7164`): 647 pruebas en verde, `typecheck` y `lint` limpios; en fs-cm la tabla queda con `pkey` y `uq_dnit_ruc` |
| IPD-004 | Ensayo: tamanos, planes, consulta por API e importacion completa | CA-01 a CA-03 en E-2 | DONE (2026-11-08): E-2 |

## Evidencia

### E-1. Antes y prueba revertida (2026-11-08)

- Tabla 328 MB, indices 330 MB, total 658 MB; base 671 MB.
- Con todos los indices, las dos consultas usan `idx_dnit_ruc_sin_dv` (0,9 ms y 0,1 ms).
- Sin los cuatro indices (transaccion revertida): las dos usan `uq_dnit_ruc` (1,2 ms y 1,3 ms); indices 129 MB.

### E-2. Despues de `0039` en el ensayo (2026-11-08)

FS `97f7164` reconstruido en `.local/segel-ensayo`; `up.sh` aplico `0039`.

| Medida | Antes | Despues |
|---|---|---|
| Indices de la tabla | 330 MB | 129 MB |
| Tabla mas indices | 658 MB | 457 MB |
| Base de FS | 671 MB | 470 MB |
| Importacion completa (2.028.067 filas) | 142 s | 99 s |

- **CA-01:** quedan `dnit_ruc_contribuyentes_pkey` y `uq_dnit_ruc`; la consulta por RUC y digito usa `uq_dnit_ruc` (0,05 ms).
- **CA-02:** `GET /api/v1/clientes/dnit/autocomplete` encuentra 4732402-3 (con digito) y 1160463 (sin digito) igual que antes; la API arma el nombre como "GRACIELA LUCIA AREVALOS NARVAEZ" y "ANIBAL RAMON AREVALO". La CI 5057036 no esta en el padron de RUC, como antes.
- **CA-03:** importacion sin errores (12 lineas invalidas del archivo, como antes), sin reinicios ni `OOMKilled`, 30 % mas rapida porque mantiene dos indices en vez de seis.
