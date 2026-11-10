# TASKS Moneda Extranjera En La Factura Manual v0.1

## Alineacion

- `docs/SPEC_MONEDA_EXTRANJERA_v0.1.md`
- `docs/PLAN_MONEDA_EXTRANJERA_v0.1.md`

## Estado

Documentada el 2026-11-10. Implementada en la rama `feat/moneda-extranjera` (worktree), a la espera del commit de FS-51 para llevarla a `feat/identidad-segel`. Falta la corrida de MON-006 contra FE `segel-rc4.27`.

## Matriz

| ID | Tarea | Validacion | Estado |
|---|---|---|---|
| MON-001 | Calculo y formato en `packages/shared` (PLAN 1) | Pruebas unitarias | DONE (fb2d08d) |
| MON-002 | Migracion `0042` (PLAN 2) | Aplicada en el stack local | DONE (dfb51fd; falta aplicarla en el stack local con MON-006) |
| MON-003 | API: validacion, preview, persistencia, gateway, bloqueo de NC (PLAN 3) | `test`, `typecheck`, `lint` | DONE (dfb51fd, 33a30c2, 91f0334) |
| MON-004 | Pantalla (PLAN 4) | `typecheck`, `build` | DONE (40efc89, 7a481fb, 33a30c2, 91f0334) |
| MON-005 | `spec/openapi.yaml` (PLAN 5) | YAML valido | DONE (40efc89, 33a30c2, 91f0334) |
| MON-006 | Playwright con FE `segel-rc4.27` en SIFEN test (PLAN 6): con `ENSAYO_NC_MONEDA=1` y `FE_NC_MONEDA_EXTRANJERA=true` suma NC y recibo en USD | Resultado y capturas | TODO |
| MON-007 | Repaso y BACKLOG FS-49 | Lectura cruzada | TODO |

## Evidencia

Se completa al cerrar cada tarea.

- 2026-11-10, MON-001 a MON-005: `npm run test` 686 OK / 39 omitidas; `typecheck` y `lint` sin errores; `npm run build -w apps/web-operacion` OK. Pruebas nuevas: `moneda.test.ts` (9), `moneda.schema.test.ts`, preview USD, bloqueo de NC con la bandera apagada, NC por referencia con moneda guardada con la bandera encendida, payload de FE con y sin moneda, verificacion publica del recibo con moneda.
