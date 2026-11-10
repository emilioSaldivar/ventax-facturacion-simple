# TASKS Moneda Extranjera En La Factura Manual v0.1

## Alineacion

- `docs/SPEC_MONEDA_EXTRANJERA_v0.1.md`
- `docs/PLAN_MONEDA_EXTRANJERA_v0.1.md`

## Estado

Documentada el 2026-11-10. Implementada en la rama `feat/moneda-extranjera` (worktree), a la espera del commit de FS-51 para llevarla a `feat/identidad-segel`. MON-006 corrida contra FE `segel-rc4.27` el 2026-11-10: 19/19. Refinada el 2026-11-10 con la entrega de FE (`rc4.26` a `rc4.30`, secciones 33 y 35 del pedido) y las decisiones del usuario (D-4, D-6, D-7): MON-008, MON-009 y MON-011 quedan listas para implementar por otro agente, con pasos en el PLAN (7 y 8). Orden (PLAN 9): MON-008 y MON-011 -> MON-009 -> `TASKS_NOTA_CREDITO_PARCIAL_v0.1` -> `TASKS_EDITOR_FACTURA_PC_v0.1` -> MON-007 -> MON-012 -> MON-013. MON-010 (matriz RAJ) corre en paralelo.

Regla para quien implemente: trabajar en la rama `feat/moneda-extranjera` (worktree), un commit por tarea, con `npm run test`, `npm run typecheck`, `npm run lint` y `npm run build -w apps/web-operacion` antes de cada commit; la evidencia Playwright se corre contra el stack local de Segel (`.local/segel-ensayo`, FE `segel-rc4.30`) reconstruido con `FS_REF=feat/moneda-extranjera FE_REF=segel-rc4.30 bash scripts/segel-fs/build-images.sh` y `bash .local/segel-ensayo/bin/up.sh`.

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
| MON-008 | Cantidad con hasta 4 decimales (PLAN 7.1, A-1). Pasos: (1) `tax.ts`: `assertCantidad` y `subtotal = Math.round(cantidad x precio)`; pruebas; (2) `moneda.ts`: prueba 1,5 x 150,25; (3) `facturaPreviewSchema`: `cantidad` positiva con 4 decimales; `moneda.schema.test.ts`; (4) `main.tsx`: `normalizeDecimalInput(valor, decimales)`, campo Cantidad decimal, `cantidadValida`, formato en lineas y ficha; (5) `spec/openapi.yaml` `cantidad: number`, `multipleOf: 0.0001`; (6) Playwright: escenario CA-08 sumado a `playwright-moneda-extranjera.cjs` (factura USD con cantidad 1,5 aprobada en SIFEN test; 1,00005 no deja agregar) | `test`, `typecheck`, `lint`, `build`; Playwright 1440 y 390 | TODO (listo para implementar) |
| MON-009 | Totales oficiales de FE (PLAN 7.2, A-2). Pasos: (1) `TaxTotals` con `fuente`, `total_guaranies`, `redondeo`; (2) `FiscalGateway.getDocumentoTotales` en tipos, cliente HTTP (`/documentos/{uuid}/totales`, clave compartida) y `MockFiscalGateway`; (3) `totalesDesdeFe` con prueba; (4) `FacturaRepository.updateTotals`; (5) enganche en `refreshFiscalStatusForDocumento` y en la aprobacion inmediata, tolerante a fallos; (6) ficha: "Equivale a Gs." en moneda extranjera; (7) `spec/openapi.yaml` `DocumentoTotals`; (8) pruebas de servicio (guarda, no repite, no falla); (9) Playwright: CA-09 en `playwright-moneda-extranjera.cjs` (tras la aprobacion, el total de la ficha coincide con `GET /totales` de FE leido con la clave compartida del stack local, y aparece el equivalente en Gs.) | `test`, `typecheck`, `lint`, `build`; Playwright 1440 | TODO (listo para implementar; despues de MON-008) |
| MON-010 | Matriz RAJ de la entrega de FE en SIFEN test (SPEC CA-10), stack local `raj-fs` contra `fe-cargas-real` (`segel-rc4.30`). Casos de FS: 1, 2, 4, 6, 7, 8 (esta sesion), 3 (nuevo-repo-18), 10, 11, 12 y 13 (pendientes de asignar). Enviar numero, CDC y protocolo de cada uno a FE | Playwright `playwright-moneda-raj.cjs` y lectura de `/totales` y KUDE | EN CURSO: casos 1 y 2 emitidos desde FS y aprobados en SIFEN test (0260): `001-001-0000748` protocolo 50408443, `001-001-0000749` protocolo 50408444; caso 3 (nuevo-repo-18) `001-002-0000044` protocolo 50408448. FE verifico el XML contra MT150. La clave compartida de `fe-cargas-real` se cargo en el `.env.raj` local el 2026-11-10 con autorizacion del usuario (archivo del stack de prueba, fuera de git; no es configuracion por cliente); casos 1, 2, 4, 6, 7, 8, 12 y 13 cerrados desde FS (ver evidencia); faltan 10 y 11 (nuevo-repo-18) y los protocolos de 753/754 |
| MON-011 | Selector Guarani / Dolar y cambio de moneda con lineas (PLAN 8; SPEC D-4, RN-08, CA-11, CA-12). Pasos: (1) `MONEDAS_FACTURA` del editor en PYG y USD; (2) `setMoneda`: vaciar tipo de cambio en PYG, revalidar lineas, marcar invalidas, aviso y boton deshabilitado; (3) Playwright: escenarios CA-11 y CA-12 en `playwright-moneda-extranjera.cjs` | `typecheck`, `build`; Playwright 1440 y 390 | TODO (listo para implementar) |
| MON-012 | Llevar `feat/moneda-extranjera` a `feat/identidad-segel` (cherry-pick o merge) despues del commit de FS-51 (sesion `nuevo-repo-11`); resolver `main.tsx`, `facturas.*`, `fiscal-gateway.*`, `spec/openapi.yaml` y `AGENTS.md`; volver a correr `test`, `typecheck`, `lint`, `build` | Suite completa verde en la rama destino | TODO (espera FS-51) |
| MON-013 | Despliegue en `segel-fs` con FE `segel-rc4.30` y `FE_NC_MONEDA_EXTRANJERA=true` (SPEC D-3), segun `OPERACION_DESPLIEGUE_SEGEL_FS_v0.1`; alta de RAJ en produccion por import del export de FE (timbrado 16554107, actividad 52100, perfiles RAJ-*), sin variables por cliente; humo con una factura PYG minima antes de habilitar USD (lista de control de FE, seccion 5 de `VERIFICACION_PRODUCCION_MONEDA_EXTRANJERA_v0.1`) | Humo en produccion con el usuario | TODO (solo con pedido directo del usuario) |

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

- 2026-11-10, MON-010 (matriz RAJ, SPEC CA-10): stack local `raj-fs` (FS `2fe7d70`, imagen `segel-fs-*:moneda-2fe7d70`, `FE_NC_MONEDA_EXTRANJERA=true`) contra `fe-cargas-real` (FE `segel-rc4.30`, SIFEN test), emisor RAJ S.A. 80120841-6 con su certificado real, timbrado de test 80120841, actividad 77290, perfil `RAJ-001-001-FE`, operador `operador-raj-3d`. Script `scripts/segel-fs/playwright-moneda-raj.cjs` (corrida inicial, reanudada con `RAJ_REANUDAR=1` tras cargar la clave compartida: 7/7). Protocolos leidos por FE de su base.
  - Caso 1: `001-001-0000748`, USD contado 1 x 605 con TC 6329,77, CDC `01801208416001001000074822026111016055332772`, aprobada 0260, protocolo 50408443. FE verifico el XML contra MT150 (`cMoneOpe`, `dTiCam`, pagos en USD, `dTotalGs` 3829511).
  - Caso 2: `001-001-0000749`, USD credito a 30 dias 1 x 150,50, CDC `01801208416001001000074922026111019280679779`, aprobada, protocolo 50408444.
  - Caso 3 (nuevo-repo-18): `001-002-0000044`, PYG, protocolo 50408448.
  - Caso 4: NC total por referencia sobre la 748 desde la ficha, NCE `001-001-0000002`, CDC `05801208416001001000000222026111012302419498`, en USD con TC 6329,77, aprobada 0260, protocolo 50408542 (FE: `dCdCDERef` = CDC de la 748, `iMotEmi` 1). En FS se lista en Notas de credito como USD 605,00.
  - Caso 6: recibo N.º 0000002 creado desde la ficha de la 749 ("Emitir recibo de cobro") y emitido: EMITIDO, USD 150,50, referencia 0000749; el PDF (bajado por `GET /recibos/:id/pdf` de FS) muestra "USD 150,50", "CIENTO CINCUENTA DOLARES ESTADOUNIDENSES CON 50/100", logo y STALBURO. Requiere FE `rc4.30` (firma con el certificado real de RAJ).
  - Caso 7: `GET /v1/documentos/{uuid}/totales` (clave compartida) de la 748: moneda USD, tipo_cambio 6329.77, total 605, iva_10 55, gravada_10 550, total_guaranies 3829511; de la 749: total 150.5, iva_10 13.68, gravada_10 136.82, total_guaranies 952630. Identicos a `totals_snapshot` de FS (605/55/550 y 150,50/13,68/136,82): la formula de la vista previa coincide con SIFEN en estos casos; A-2 guardara ademas `total_guaranies`.
  - Caso 8: KUDE de 748 y 749 (46 KB). El de la 748 muestra logo y STALBURO, RUC 80120841-6, timbrado 80120841, Moneda USD, Tipo Cambio 6329.77 (global), total de la operacion 605,00, total en guaranies 3.829.511, total en letras y CDC completo; leyenda "Ambiente de PRUEBA" por `KUDE_JASPER_AMBIENTE` del stack de test.
  - Caso 12 (`RAJ_CASOS_12_13=1`, 5/5): factura PYG por 001-001, 1 x 110.000, `001-001-0000753`, CDC `01801208416001001000075322026111014368280514`, aprobada; sin `moneda` en el pedido, como siempre.
  - Caso 13: factura USD 20,10 (TC 6329,77) `001-001-0000754`, CDC `01801208416001001000075422026111013951938449`, aprobada y anulada desde la ficha ("Anular factura") dentro de las 48 h; ANULADA en FS al primer intento, sin 4009. Protocolos de 753, 754 y del evento: pedidos a FE.
  - Casos 10 y 11: nuevo-repo-18. Caso 9: FE (422 sin numerar). 2b y 5: fuera (cuotas no; NC parcial en su cadena).
  - Capturas y JSON en el scratchpad de la sesion (`test-results/moneda-raj/`, `raj-evidencia/`), sin versionar.
