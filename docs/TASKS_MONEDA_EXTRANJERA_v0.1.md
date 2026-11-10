# TASKS Moneda Extranjera En La Factura Manual v0.1

## Alineacion

- `docs/SPEC_MONEDA_EXTRANJERA_v0.1.md`
- `docs/PLAN_MONEDA_EXTRANJERA_v0.1.md`

## Estado

Documentada el 2026-11-10. Implementada en la rama `feat/moneda-extranjera` (worktree), a la espera del commit de FS-51 para llevarla a `feat/identidad-segel`. MON-006 corrida contra FE `segel-rc4.27` el 2026-11-10: 19/19. Refinada el 2026-11-10 con la entrega de FE (`rc4.26` a `rc4.30`) y el pedido del usuario: MON-008 y MON-009 cierran la alineacion de contratos; el modo completo en PC va en `TASKS_EDITOR_FACTURA_PC_v0.1.md`, despues de estas.

Orden propuesto: MON-008 -> MON-009 -> MON-011 (D-4, selector) -> MON-010 (matriz RAJ, en paralelo) -> MON-007 -> editor PC -> merge a `feat/identidad-segel` tras FS-51 -> despliegue (D-3, decision del usuario).

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
| MON-008 | Cantidad con hasta 4 decimales (PLAN 7, A-1) | `test`, `typecheck`, `lint`, `build` | TODO |
| MON-009 | Totales oficiales de FE con `GET /totales` (PLAN 7, A-2) | `test`, `typecheck`, `lint` | TODO |
| MON-010 | Matriz RAJ de la entrega de FE en SIFEN test (SPEC CA-10) | Playwright y numeros/CDC enviados a FE | EN CURSO: casos 1 y 2 emitidos desde FS y aprobados en SIFEN test (0260): `001-001-0000748` protocolo 50408443, `001-001-0000749` protocolo 50408444; caso 3 (nuevo-repo-18) `001-002-0000044` protocolo 50408448. FE verifico el XML contra MT150 (`cMoneOpe` USD, `dTiCam`, pagos en USD, `dTotalGs`). Caso 6 en espera de FE (firma del PDF del recibo con el certificado de RAJ, `PDF_SIGNATURE_FAILED`). bloqueado por 401 en la verificacion de estado del stack local `raj-fs`: su `.env.raj` (archivo del stack de prueba, no configuracion por cliente; ver SPEC, seccion de alineacion) necesita la clave compartida de `fe-cargas-real` en `FE_API_KEY`; cambio de entorno local que espera al usuario. Caso 6 habilitado por FE `rc4.30` |
| MON-011 | Selector con Guarani y Dolar (SPEC D-4) y aviso al cambiar de moneda con lineas cargadas (RN-08, CA-11) | `typecheck`, `build`, Playwright 1440 y 390 | TODO, espera D-4 |

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
