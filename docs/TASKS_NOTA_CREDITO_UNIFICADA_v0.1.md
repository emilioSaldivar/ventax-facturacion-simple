# TASKS Nota De Credito Unificada v0.1

## Alineacion

- `docs/SPEC_NOTA_CREDITO_UNIFICADA_v0.1.md`
- `docs/PLAN_NOTA_CREDITO_UNIFICADA_v0.1.md`
- Canvas de diseño: https://claude.ai/artifact/Ddpq1BqK7ddWyqDM3p3vod (privado del usuario)
- BACKLOG FS-141 (resuelve FS-77). Bloquea el despliegue a produccion de FS-136, FS-138 y FS-139 (decision del usuario del 2026-11-12)

## Estado

Implementada y validada en el stack local (`.local/segel-ensayo`, FS `ncu-local3`, FE `fe-segel` `segel-rc4.36`, SIFEN test) el 2026-11-12/13. Sin commit. Falta la prueba manual del usuario (NCU-008) y el plan de despliegue (NCU-009). FE no necesito cambios.

## Matriz

| ID | Tarea | Validacion | Estado |
|---|---|---|---|
| NCU-000 | Revision del canvas por el usuario (01 PC, 02 estados, 03 celular, 04 armado para SIFEN); ajustar SPEC si cambia algo | Comentarios del usuario | PENDIENTE |
| NCU-001 | Calculo compartido `armarNotaCombinada` con prueba (PLAN 1) | `test` shared con el ejemplo del canvas 04; `typecheck` | DONE |
| NCU-002 | Migracion 0052 (`linea_factura`, `origen_nc`, `COMBINADA`) y repositorio (PLAN 2 y 3) | `test`, `typecheck`; migracion aplicada en el stack local | DONE |
| NCU-003 | Servicio: pedido unificado, normalizacion de cuerpos viejos, topes, saldo por linea, reintento (PLAN 3) | `test` (suite completa verde), `typecheck`, `lint` | DONE |
| NCU-004 | Ruta y esquema (PLAN 3) | `test`, `typecheck` | DONE |
| NCU-005 | Pantalla: `NotaCreditoEditor` (PC y celular), `CreditNoteView` con factura inicial, ficha que navega a la pantalla, borrar la ventana corta y `NotaCreditoPorMonto` (PLAN 4) | `typecheck`, `build` | DONE |
| NCU-006 | `spec/openapi.yaml` (PLAN 5) | YAML valido; la UI consume lo documentado | DONE |
| NCU-007 | Playwright CA-01 a CA-09 en `fe-segel` `segel-rc4.36` (SIFEN test), 1440/1280/390; regresion de factura externa (PLAN 6) | Resultado, capturas, numeros aprobados | DONE |
| NCU-008 | Prueba manual del usuario en el stack local antes del despliegue | Visto bueno del usuario | Reemplazada por la revision en produccion (CA-08 de la cadena de despliegue v0.4, decision del usuario del 2026-11-13) |
| NCU-009 | Repaso SPEC/PLAN/TASKS; BACKLOG FS-141 y FS-77; preparar el plan de despliegue de FS-136/138/139/141 con `segel-rc4.36` | Lectura cruzada; plan presentado al usuario | DONE: desplegada en `segel-fs` el 2026-11-13 (`TASKS_DESPLIEGUE_SEGEL_FS_v0.4` E-1) |
| NCU-010 | Nombre "Ajuste" en pantalla y en las lineas enviadas a SIFEN (SPEC D-10, PLAN §7) | `test` shared y API, `typecheck`, `build`; Playwright con las etiquetas nuevas | DONE |

## Evidencia

- **NCU-001** `packages/shared` `nota-credito-combinada.test.ts`: 10/10 (canvas 04: 83.150 con 3.546 / 745 / 709; motivos; % sobre el total 21.150; redondeo 3.170 → 3.150; D-4; D-5; D-6 82.916; USD 18,08). Suite del paquete 43/43.
- **NCU-002 a NCU-004** migracion `0052_nota_credito_combinada.sql` (aplicada en el stack local: `applied ["0052"]`, columnas `linea_factura` y `origen_nc`); `apps/api/tests/nota-credito-combinada.test.ts` 7/7 (CA-01 con 5 lineas y guardado, motivo elegido, D-4 400 y D-5 409 sin llamar a FE, saldo por linea tras una combinada, reintento COMBINADA, cuerpos viejos por sus caminos, D-6 al neto). Suite API 987 OK / 48 omitidas; `typecheck` y `lint` en 0.
- **NCU-005** `typecheck` y `build` de `web-operacion` en 0. Se borraron `NotaCreditoPorMonto.tsx`, `lib/notaCreditoMonto.ts` y la ventana corta de Documentos.
- **NCU-006** `spec/openapi.yaml`: YAML valido; `redocly lint` con los mismos 34 errores previos (ninguno nuevo).
- **NCU-007** Playwright `scripts/segel-fs/playwright-nc-unificada.cjs`, viewports 1440, 1280 y 390, `fe-segel` `segel-rc4.36`, `FE_NC_DESCUENTOS=true`:
  - Pasada 1 (`ENSAYO_CREAR_FACTURAS=1 ENSAYO_SIN_EMITIR=1`): facturas nuevas 1010672 (canvas), 1010673 (una linea) y 1010674 (con descuentos) aprobadas en SIFEN test; **18/18**.
  - Pasada 2 (emitiendo): **29/29**. CA-01 NC **1010045** COMBINADA motivo 1, Gs. 83.150, lineas `L001`, `AJ-L002` "Ajuste 10 % · ...", `AJ-IVA10` 3.546, `AJ-IVA5` 745, `AJ-EXE` 709 ("Ajuste sobre el total de la factura"); saldo 128.350 (CA-06 por linea [1,1,75000], [2,0,3150]). CA-02 NC **1010046** TOTAL Gs. 10.350 por `{motivo}`, motivo 1 fijo. CA-05 NC **1010047** COMBINADA motivo 2, Gs. 82.900 (devolucion al neto de una linea con descuento). CA-03 tope por item y total bloquean; CA-04 10 % = 21.150 por tasa y USD 26,37; CA-05 sobre la externa 9300008 (vista previa); CA-07 desde la ficha; CA-09 sin desborde ni emojis, 390 con tarjetas y campos de 44 px. Todas con SIFEN 0422.
  - Corrida previa (textos "Acreditar", antes de D-10): NC 1010042 (combinada 83.150), 1010043 (total) y 1010044 (externa con descuento) aprobadas.
  - Regresion `playwright-nc-factura-externa.cjs` adaptado: **22/22**, NC **1010048** sobre factura impresa aprobada. `playwright-nc-externa-cdc.cjs` adaptado pero no corrido (necesita CDC nuevos emitidos fuera de FS).
  - CA-08 (cuerpos anteriores): prueba API D-9 y suite completa verde. Con la bandera `FE_NC_DESCUENTOS` apagada (D-6, celda deshabilitada) se cubre en pruebas unitarias; el stack local la tiene encendida.
  - Ajuste hallado en la prueba: la factura entera va por la nota total, que manda motivo 1; la pantalla mostraba 2. Corregido (SPEC D-7).
  - Hallazgo fuera de esta cadena: FS-142 (busqueda por numero de facturas externas).
- **NCU-010** textos "Ajuste" (SPEC D-10) verificados en las pasadas 1 y 2.
