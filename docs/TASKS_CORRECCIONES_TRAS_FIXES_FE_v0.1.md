# TASKS Correcciones de FS tras los fixes de FE v0.1

## Alineacion

- `docs/SPEC_CORRECCIONES_TRAS_FIXES_FE_v0.1.md`
- `docs/PLAN_CORRECCIONES_TRAS_FIXES_FE_v0.1.md`

## Matriz

| ID | Error | Tarea | Hecho cuando | Estado |
|---|---|---|---|---|
| CFF-001 | Todos | SPEC, PLAN y TASKS | Documentos en `AGENTS.md` | DONE (2026-11-06) |
| CFF-002 | FS-20, FS-21, FS-23 | Codigo y pruebas unitarias | 480 pruebas pasan, typecheck sin errores | DONE (2026-11-06), E-1 |
| CFF-003 | FS-24 | Bandera `VERIFICACION_LOTE_SIN_REFRESH` y opcion `omitirRefreshEnLote` en el servicio | Pruebas CA-24.1, CA-24.2 y CA-24.6 | DONE (2026-11-07), con la bandera apagada en la segunda entrega |
| CFF-004 | FS-24 | Reprogramacion a 15 min sin gastar intentos, con tope de 48 h | Pruebas CA-24.3, CA-24.4 y CA-24.5 | DONE (2026-11-07), vale con o sin bandera (RN-24.0) |
| CFF-005 | FS-25 | Confirmar en local que las 6 acciones responden error de autenticacion | Respuesta de cada ruta registrada en la evidencia | FUERA: FS-25 pasa a la cadena de autogestion del operador |
| CFF-006 | FS-25 | Retirar interfaz, rutas, metodos del gateway y contrato | CA-25.1 a CA-25.3; `spec/openapi.yaml` sin las 6 rutas | FUERA: idem CFF-005 |
| CFF-007 | FS-20, FS-23, FS-25 | Playwright en 390 px y 1280 px: rechazo con su causa, mensaje de `0100`, detalle sin las 6 acciones | Capturas y resultado en la evidencia | TODO |
| CFF-008 | FS-20, FS-24 | Plantillas, `FE_REF` y runbook | PLAN, seccion 5 | Absorbida por `TASKS_DESPLIEGUE_SEGEL_FS_v0.2` (SF2-004, SF2-006, SF2-008). `RECONCILE_DEFERRED_ENABLED` y `VERIFICACION_LOTE_SIN_REFRESH` quedan en `false` por decision del usuario (2026-11-07) |
| CFF-009 | FS-20, FS-21, FS-23 | Validacion en stack local con el tag de FE y SIFEN test | PLAN, seccion 6 | Es el paso 7 del guion de SF2-011; FS-24 incluido, con la bandera apagada |
| CFF-010 | FS-20, FS-21, FS-23 | Despliegue en `segel-fs` | Versiones desplegadas y banderas registradas | Viaja con la segunda entrega (SF2-014 a SF2-016) |
| CFF-012 | FS-27 | `updateEmailEstadoPendiente` guarda nulo para `NOT_APPLICABLE`; mensaje de factura rechazada | Pruebas CA-27.1 y CA-27.2 en `contrato-fe-sobrecarga.test.ts` | DONE (2026-11-07), con pruebas unitarias; se observa en el ensayo local |
| CFF-013 | FS-28 | Precarga del editor desde la factura rechazada, con aviso de correccion | CA-28.1 y CA-28.2 por Playwright en 390 y 1280 px | TODO |
| CFF-014 | FS-29 | Texto de `1306` valido en los dos ambientes, en el catalogo y en la ficha | Prueba en `facturas.accion.test.ts`; CA-29.1 por Playwright | TODO |
| CFF-015 | FS-30 | Aviso al facturador con destinatario y estado del correo del cliente | Prueba en `facturas.notificaciones.test.ts` | TODO |
| CFF-011 | Todos | Cierre: repasar SPEC, PLAN, TASKS y `docs/BACKLOG.md` | Documentos alineados con lo desplegado | TODO |

## Notas de FE

### N-1. Lotes por ciclo y FS-24 (2026-11-07)

Para el despliegue con `segel-rc3`, FE informa: con `BATCH_LOTES_POR_CICLO=5`, cada documento sigue en `SENT_BATCH` lo mismo que hoy (10 a 90 s medidos por FE), pero puede haber hasta 250 a la vez por emisor, en vez de 50. `SENT_BATCH` significa "en proceso", no fallo. `RECONCILE_DEFERRED_ENABLED` y `SIFEN_CONSULT_DETECTS_CANCEL_ENABLED` estan en rc3, apagadas por defecto, y su valor en `segel-fs` lo decide el usuario. FS-24 aplica con cualquiera de los dos valores. Decision del usuario (2026-11-07): las dos banderas quedan apagadas en la segunda entrega, y el worker no retira el `refresh`, porque sin `RECONCILE_DEFERRED_ENABLED` es lo que destraba un documento (RN-24.6). `SENT_BATCH` ya no gasta intentos (RN-24.0). Las facturas de carga masiva no pasan por ese worker (RN-17).

## Evidencia

### E-1. FS-20, FS-21 y FS-23 (2026-11-06)

Commit `2b1eed9`. `npm run test` de la API: 480 pasan, 0 fallan, 28 omitidas. `npm run typecheck` sin errores. Solo pruebas unitarias: sin validar contra FE real ni SIFEN, y sin Playwright.
