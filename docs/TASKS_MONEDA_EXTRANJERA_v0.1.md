# TASKS Moneda Extranjera En La Factura Manual v0.1

## Alineacion

- `docs/SPEC_MONEDA_EXTRANJERA_v0.1.md`
- `docs/PLAN_MONEDA_EXTRANJERA_v0.1.md`

## Estado

Documentada el 2026-11-10. Implementada en la rama `feat/moneda-extranjera` (worktree), a la espera del commit de FS-51 para llevarla a `feat/identidad-segel`. MON-006 corrida contra FE `segel-rc4.27` el 2026-11-10: 19/19.

## Matriz

| ID | Tarea | Validacion | Estado |
|---|---|---|---|
| MON-001 | Calculo y formato en `packages/shared` (PLAN 1) | Pruebas unitarias | DONE (fb2d08d) |
| MON-002 | Migracion `0042` (PLAN 2) | Aplicada en el stack local | DONE (dfb51fd; aplicada en el stack local el 2026-11-10) |
| MON-003 | API: validacion, preview, persistencia, gateway, bloqueo de NC (PLAN 3) | `test`, `typecheck`, `lint` | DONE (dfb51fd, 33a30c2, 91f0334) |
| MON-004 | Pantalla (PLAN 4) | `typecheck`, `build` | DONE (40efc89, 7a481fb, 33a30c2, 91f0334) |
| MON-005 | `spec/openapi.yaml` (PLAN 5) | YAML valido | DONE (40efc89, 33a30c2, 91f0334) |
| MON-006 | Playwright con FE `segel-rc4.27` en SIFEN test (PLAN 6): con `ENSAYO_NC_MONEDA=1` y `FE_NC_MONEDA_EXTRANJERA=true` suma NC y recibo en USD | Resultado y capturas | DONE (2026-11-10, 19/19) |
| MON-007 | Repaso y BACKLOG FS-49 | Lectura cruzada | TODO |

## Evidencia

Se completa al cerrar cada tarea.

- 2026-11-10, MON-001 a MON-005: `npm run test` 686 OK / 39 omitidas; `typecheck` y `lint` sin errores; `npm run build -w apps/web-operacion` OK. Pruebas nuevas: `moneda.test.ts` (9), `moneda.schema.test.ts`, preview USD, bloqueo de NC con la bandera apagada, NC por referencia con moneda guardada con la bandera encendida, payload de FE con y sin moneda, verificacion publica del recibo con moneda.

- 2026-11-10, MON-006: stack local de Segel (`.local/segel-ensayo`) con FS `2fe7d70` (`feat/moneda-extranjera`) y FE `segel-rc4.27` (`3f3499c`), SIFEN test, `FE_NC_MONEDA_EXTRANJERA=true`. `ENSAYO_NC_MONEDA=1 node scripts/segel-fs/playwright-moneda-extranjera.cjs`: **19/19 OK**. Escenarios:
  - 1440: factura contado USD 2 x 150,25 = USD 300,50 (sin tipo de cambio no se puede crear; tipo de cambio 7350,5), aprobada por SIFEN test (`1010577`); credito USD 2 x 99,99 = USD 199,98; contado Gs. 220.000 sigue en PYG.
  - 1440: tabla de Documentos con Moneda USD y total USD 300,50; ficha con total en USD y tipo de cambio 7.350,5.
  - 1440, D-1: nota de credito de la factura USD habilitada sin aviso, emitida por referencia (`1010011`) y listada en USD 300,50.
  - 1440, D-2: "Emitir recibo de cobro" de la factura credito deja un recibo en USD 199,98 y se emite con centavos.
  - 1280 y 390: editor en USD y Documentos con USD, sin desplazamiento horizontal.
  - Capturas en `test-results/moneda-extranjera/` (sin versionar).
  - Ajustes del script durante la corrida: "Crear nueva factura" entre facturas (el editor conserva la emitida), espera de aprobacion SIFEN antes de la nota (hasta 8 min), recarga tras el aviso de exito y aceptar el `confirm()` de "Emitir" recibo. Sin cambios de producto.
