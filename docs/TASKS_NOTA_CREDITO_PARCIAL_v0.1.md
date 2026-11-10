# TASKS Nota De Credito Parcial Con Lineas v0.1

## Alineacion

- `docs/SPEC_NOTA_CREDITO_PARCIAL_v0.1.md`
- `docs/PLAN_NOTA_CREDITO_PARCIAL_v0.1.md`

## Estado

Documentada el 2026-11-10 por decision del usuario (entra, al menos en USD). Lista para implementar por otro agente despues de MON-008 y MON-009, en la rama `feat/moneda-extranjera`. D-1 a D-5 del SPEC son decisiones tecnicas ya tomadas. **Instruccion del usuario (2026-11-10):** la implementacion de esta cadena y de las demas arranca recien cuando se cierre la matriz RAJ (MON-010 de `TASKS_MONEDA_EXTRANJERA_v0.1.md`, faltan los casos 10 y 11); el despliegue, solo cuando el usuario confirme todo. Misma regla de validacion por commit que `TASKS_MONEDA_EXTRANJERA_v0.1.md`.

## Matriz

| ID | Tarea | Validacion | Estado |
|---|---|---|---|
| NCP-001 | Tipos, esquema `lineas` y `saldoAcreditablePorLinea` con prueba (PLAN 1 y 2) | `test`, `typecheck` | DONE (89991f5) |
| NCP-002 | `emitNotaCredito` con lineas: validaciones RN-01/03/04/06, lineas y totales de la nota, `buildFiscalNotaCreditoRequest` con items propios y moneda, RN-05 (PLAN 2 y 3) | `test` (USD, PYG, rechazos), `typecheck`, `lint` | DONE (89991f5) |
| NCP-003 | Gateway: `moneda`/`tipoCambio` en el payload de NC, mock `[FE-2417]` (PLAN 3) | `test` de payload, `typecheck` | DONE (89991f5) |
| NCP-004 | Repositorio: la nota guarda sus propias lineas y totales (PLAN 4) | `test`, `typecheck` | DONE (89991f5, 3580544) |
| NCP-005 | Elegibilidad y saldo expuesto (candidatas o ficha), `canEmitNotaCredito` (PLAN 2 y 5) | `test`, `typecheck`, `build` | DONE (89991f5, a833b13) |
| NCP-006 | Ventana Total / Parcial con tabla de lineas; seccion de notas en la ficha de la factura (PLAN 5) | `typecheck`, `build` | DONE (a833b13) |
| NCP-007 | `spec/openapi.yaml` (PLAN 6) | YAML valido; la UI consume lo documentado | DONE (89991f5) |
| NCP-008 | Playwright CA-01 a CA-07 en SIFEN test, 1440/1280/390 (PLAN 7) | Resultado y capturas | DONE (2026-11-10, 12/13 + verificacion de la ficha) |
| NCP-009 | Repaso SPEC/PLAN/TASKS, `SPEC_NOTA_CREDITO_TRABADA_v0.1` (RN-02 reemplazada), BACKLOG FS-44 (motivo sigue en 1) | Lectura cruzada | DONE (2026-11-10) |

## Evidencia

Se completa al cerrar cada tarea.

- 2026-11-10, NCP-001 a NCP-007: `tests/nota-credito-parcial.test.ts` 14/14 (saldo con decimales, RN-01, RN-02, parcial USD con moneda y tipo de cambio sin referencia, segunda parcial con otra clave, 400 por saldo, PYG, bandera apagada, solo-total, trabada, RN-07, reintento de una parcial con sus lineas, payload a FE, 422 `INVALID_REFERENCED_DOCUMENT` como 409); suite 710 OK; `typecheck`, `lint`, `build`.
- 2026-11-10, NCP-008: stack local de Segel, FS `3580544`, FE `segel-rc4.30`, SIFEN test. `node scripts/segel-fs/playwright-nota-credito-parcial.cjs`: 12/13 en la ultima corrida; el unico fallo (la seccion "Acreditado" leida antes de que llegue el saldo) se corrigio en el script con una espera y se verifico aparte sobre la misma factura: "2 de 2 x Servicio A, Acreditada; 1 de 1 x Servicio B, Acreditada". Escenarios:
  - Factura USD 400,49 (2 x 150,25 y 1 x 99,99) `1010589` aprobada.
  - CA-01: parcial 1 x 150,25, ventana con total estimado USD 150,25, nota `1010017`.
  - RN-07: con una nota viva, Total deshabilitado. CA-03: 3 unidades sobre saldo 1 no se envia ("supera el saldo (1)").
  - CA-02: segunda parcial 1 x 150,25 + 1 x 99,99 = USD 250,24, nota `1010018`; despues "La factura ya esta acreditada por completo"; ambas notas en la lista en USD.
  - CA-04: factura PYG 385.000 `1010590`, parcial 1 x 110.000, nota `1010019`.
  - CA-07: ventana parcial en 1280 y 390 sin desplazamiento horizontal.
- **Defecto encontrado y corregido (`3580544`):** el indice unico `facturas_operativas_nce_total_uidx` (0038, una nota viva por factura) hacia que la segunda parcial, ya emitida en FE, no se guardara y la API devolviera la primera. Migracion `0043_nota_credito_parcial.sql` lo reemplaza por un indice no unico; la regla de la total queda en el servicio (RN-07) y el tope por importe en FE. Ademas `createNotaCreditoFromFactura` respondia con las lineas de la factura. En la corrida que lo mostro, la segunda parcial USD 250,24 quedo emitida solo en el FE local `fe-segel` (SIFEN test), sin registro en FS: dato de prueba, sin efecto.
- Desvio del PLAN: la ventana Total / Parcial esta en la ficha y en la lista de Documentos; la vista de candidatas ("Devolver factura") sigue emitiendo solo la total.
