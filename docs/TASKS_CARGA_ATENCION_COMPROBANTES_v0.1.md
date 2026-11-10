# TASKS Carga: Comprobantes Que Requieren Atencion v0.1

## Alineacion

- `docs/SPEC_CARGA_ATENCION_COMPROBANTES_v0.1.md`
- `docs/PLAN_CARGA_ATENCION_COMPROBANTES_v0.1.md`

## Estado

**Implementada y validada el 2026-11-09** en el stack local de Segel (SIFEN test), autorizada por el usuario. Sin despliegue: llevarla a `segel-fs` junto con la rama de FE es decision del usuario (CAT-010 de FE).

## Matriz

| ID | Fase | Tarea | Validacion | Estado |
|---|---|---|---|---|
| CAC-000 | 0 | Linea base de pruebas de `api` y `web-operacion` (E-0) | Salidas registradas | DONE: E-0 |
| CAC-001 | 1 | Tipos del gateway y metodo `inutilizarComprobanteCarga` (PLAN 1 y 2) | `typecheck`; prueba de URL, metodo y cuerpo en `cargas.real-gateway.test.ts` | DONE: `917d197`; 2 pruebas nuevas en `cargas.real-gateway.test.ts` |
| CAC-002 | 1 | Mock: atencion, inutilizacion, acciones, totales y cierre (PLAN 3) | `cargas.mock.test.ts` | DONE: `917d197`; 4 pruebas nuevas y 1 ajustada en `cargas.mock.test.ts` (el rechazado deja la carga abierta hasta inutilizarlo) |
| CAC-003 | 1 | `proximaSincronizacionMs` con `VALIDADA` y sus tres llamadores (PLAN 5) | `cargas-sync.worker.test.ts` | DONE: `917d197`; 2 pruebas nuevas y 1 ajustada en `cargas-sync.worker.test.ts` |
| CAC-004 | 2 | Servicio, `409` en `traducirErrorFe`, evento de auditoria y ruta (PLAN 4) | `cargas.service.test.ts`, `cargas.routes.test.ts` | DONE: `917d197`; 3 pruebas en `cargas.service.test.ts`, 1 en `cargas.routes.test.ts` |
| CAC-005 | 2 | `spec/openapi.yaml` (PLAN 7) | YAML valido | DONE: `145e318`; YAML valido |
| CAC-006 | 3 | Pantalla (PLAN 6) | `typecheck` y `build` de `web-operacion` | DONE: `145e318`; `typecheck` y `build` de `web-operacion` sin errores |
| CAC-007 | 4 | Stack local: `fe-segel` desde `feat/carga-atencion-comprobantes`, FS desde esta rama, linea base de numeracion (PLAN 9) | Salud de los servicios; imagen anterior anotada | DONE: E-1 |
| CAC-008 | 4 | Playwright CA-01 a CA-07 contra el stack local, 390 y 1280 (PLAN 8) | Resultado de Playwright con capturas | DONE: E-2, 19/19 |
| CAC-010 | 6 | RN-10: estado "Requiere atención" sin barra de espera (decision del usuario) | `typecheck`, `build`; Playwright sobre la carga de anticipo del stack local, 390 y 1280 | TODO |
| CAC-009 | 5 | Repaso de SPEC, PLAN y TASKS; BACKLOG FS-47; aviso a FE con `FE_REF` | Lectura cruzada | DONE: SPEC y PLAN repasados (ver E-3); BACKLOG FS-47 cerrado; aviso a FE |

## Evidencia

### E-0. Linea base (2026-11-09, antes de tocar codigo)

`api`: `npm run test` 647 pasan y 39 omitidas; `typecheck` y `lint` sin errores. `web-operacion`: `typecheck` sin errores.

Despues de CAC-001 a CAC-004: 659 pasan y 39 omitidas (12 nuevas); `typecheck` y `lint` sin errores.

### E-1. Stack local (2026-11-09)

- Imagenes anteriores etiquetadas `:antes-cac` (once imagenes `segel-fs-*` y `fe-segel-*`), para volver atras.
- Linea base de numeracion de FE antes de la prueba: factura siguiente `1010554`, nota de credito `1010007`.
- `FE_REF=5da7707 bash scripts/segel-fs/build-images.sh` (FS `145e318`, FE `5da7707`, rama `feat/carga-atencion-comprobantes`) y `.local/segel-ensayo/bin/up.sh`. Sin migraciones de FE entre `segel-rc4.3` y `5da7707`. Salud: FE `ok`, `java` ok; FS `healthy`.
- Las dos lineas de perfil locales usan numeracion del servicio y no se cambiaron: `NUMERO_SIN_USAR` (numeracion del cliente) queda cubierto por las pruebas del mock, no por la prueba E2E.

### E-2. Playwright contra el stack local (2026-11-09)

`scripts/segel-fs/playwright-atencion-comprobantes.cjs`, archivos de una fila sin correo de comprador. Resultado: **19/19**. Capturas en `test-results/atencion-comprobantes/`.

| Escenario | Viewport | Resultado |
|---|---|---|
| Carga con un comprobante invalido (numeracion del servicio): sin "Confirmar", FE la cierra sola, FS la muestra "Finalizada", sin atencion (CA-05) | 1280 y 390 | OK. FE la cerro antes de la primera lectura, asi que la pantalla no llego a usar el refresco de `VALIDADA`; esa agenda queda cubierta por la prueba del worker |
| Carga con RUC `80000000-5`: SIFEN test rechaza con `1306`, "Requieren atención 1", aviso, "Número sin resolver: 001-001-1010554 (rechazado por SIFEN)", carga "En SIFEN" (CA-01) | 390 | OK |
| "Editar" deshabilitado con "Edición no disponible todavía" (CA-04) | 390 | OK |
| Motivo de 3 caracteres no se envia; el dialogo advierte que no se deshace (CA-03, RN-02) | 390 | OK |
| Inutilizar: "Inutilización del número 001-001-1010554 enviada: Aceptada", la carga pasa a "Finalizada", el comprobante muestra "Inutilización: Aceptada" y no queda el boton (CA-02) | 390 y 1280 | OK |
| Sin desplazamiento horizontal (CA-07) | 390 y 1280 | OK |

Numeracion despues: el `1010554` quedo rechazado e inutilizado en SIFEN test; la siguiente factura es `1010555`.

### E-3. Repaso

SPEC y PLAN reflejan lo implementado. Ajustes descubiertos: (1) PLAN 4 traduce los `409` y el `404` del comprobante solo en la inutilizacion, para no cambiar el resto de las acciones; (2) PLAN 6 deja sin filtro nuevo "Requieren atención"; (3) la prueba del caso `NUMERO_SIN_USAR` contra FE real queda para cuando haya un contexto con numeracion del cliente.

### E-4. Repeticion con FE combinada y ejemplos de `segel-rc4.6` (2026-11-09)

Stack local reconstruido con FS `102783e` y FE `97d89b6` (rama de FE `test/fs-rc4.6-atencion`: `segel-rc4.6` mas `5da7707`, solo para pruebas). SIFEN test.

- `playwright-atencion-comprobantes.cjs`: **19/19** de nuevo. `1010556` rechazado con `1306` e inutilizado (`Aceptada`).
- `scripts/segel-fs/playwright-ejemplos-planilla.cjs` con cuatro ejemplos del paquete de FE, sin correos, fecha del dia, RUC ficticio `80000000-5` cambiado por `80026570-0` (SEGEL SA) y numero al punto `001-001` (los ejemplos traen `001-003`; un primer intento sin cambiarlo dio `PUNTO_DISTINTO`, bien informado por FE y por FS). Resultado **8/8**, todos aprobados (`0260`):

| Ejemplo | Factura | Total FS | Total FE | Nota |
|---|---|---|---|---|
| `ESTADO_B2G_COMPRAS_PUBLICAS` | 1010557 | 17010000 | 17010000 | Credito a plazo de 60 dias, 2 items con lote |
| `EMPRESA_B2B_DOMICILIO` | 1010558 | 3300000 | 3300000 | Contado |
| `RASTREO_LOTE_VENCIMIENTO` | 1010559 | 650000 | 650000 | IVA 5 y 10; FS la vio emitida en la pasada siguiente (unos 4,5 min tras la aprobacion) |
| `CREDITO_CUOTAS_DETALLE` | 1010560 | 2500000 | 2500000 | 3 cuotas guardadas en el pedido fiscal de FS |

Ningun aviso "el total calculado difiere" en el log de FS. FS no muestra en pantalla tipo de operacion, compras publicas ni lote y vencimiento: quedan en el pedido fiscal guardado. Numeracion despues: siguiente factura `1010561`.
