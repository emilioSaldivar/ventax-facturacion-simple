# TASKS Documentos En Escritorio v0.1

## Alineacion

- `docs/SPEC_DOCUMENTOS_ESCRITORIO_v0.1.md`
- `docs/PLAN_DOCUMENTOS_ESCRITORIO_v0.1.md`

## Estado

**Fase A implementada y validada el 2026-11-09** en el stack local (FS `789a588`, FE `segel-rc4.13`), sin despliegue. Fase B espera el contrato de la nota de remision de FE (VE-F04); el de tipos ya existe (catalogo `CARGA_TIPO_DOCUMENTO`, FE `segel-rc4.18`).

## Matriz

| ID | Fase | Tarea | Validacion | Estado |
|---|---|---|---|---|
| DES-001 | A | `useEsEscritorio` y menu lateral (PLAN 1 y 2) | `typecheck`; Playwright 1280 y 390 | DONE: `d1b3afa`; E-1 |
| DES-002 | A | Pestañas con "Próximamente" (PLAN 3) | Playwright CA-04 | DONE: `d1b3afa` y `74a8132` (pestañas que pasan de linea en celular); E-1 |
| DES-003 | A | Tabla de documentos y menu de fila compartido (PLAN 3) | Playwright CA-01 y CA-03 | DONE: `d1b3afa` y `789a588` (RUC y numero sin cortar); E-1 |
| DES-004 | A | Filtros en fila y paginacion (PLAN 3) | Playwright CA-05 | DONE: `d1b3afa` y `789a588`; E-1 |
| DES-005 | A | Helper de navegacion en los guiones de Playwright y repeticion de los E2E (PLAN 2 y 5) | CA-06 | DONE: `scripts/lib/navegacion.cjs` en los cuatro guiones de `scripts/segel-fs`; E-2 |
| DES-006 | A | Repaso de SPEC, PLAN, TASKS; BACKLOG FS-37 | Lectura cruzada | DONE: SPEC, PLAN y BACKLOG FS-37 y FS-50 repasados |
| DES-101 | B1 | Migracion `0040` y tipos (PLAN 6) | `test`, `typecheck` y `lint` de `api` | DONE: `f1aa2e2`; migracion `0040` aplicada en el stack local |
| DES-102 | B1 | Gateway, mock, ruta de subida y plantilla por tipo (PLAN 6) | Pruebas de gateway, mock y ruta | DONE: `f1aa2e2`; pruebas de gateway real, mock y ruta |
| DES-103 | B1 | Incorporacion de comprobantes NRE (PLAN 6) | Pruebas del mapeo y del worker | DONE: `f1aa2e2`; pruebas del mapeo y del resumen (675 pasan en `api`) |
| DES-104 | B1 | Pantalla: selector de tipo, pestaña y ficha de NRE (PLAN 6) | `typecheck` y `build` | DONE: `ff50496`; `typecheck` y `build` sin errores |
| DES-105 | B1 | `spec/openapi.yaml` | YAML valido | DONE: `ff50496`; YAML valido |
| DES-106 | B1 | Playwright con FE `segel-rc4.21` en SIFEN test, 1440, 1280 y 390 | Resultado y capturas | DONE: E-3, 8/8 y 31/31 |
| DES-107 | B | Nota de debito y autofactura | Espera contratos de FE | BLOQUEADA |

## Evidencia

### E-1. Documentos en escritorio (2026-11-09)

`scripts/segel-fs/playwright-documentos-escritorio.cjs`, solo lectura, contra el stack local: **23/23**. Capturas en `test-results/documentos-escritorio/`.

| Escenario | Viewport | Resultado |
|---|---|---|
| Menu lateral visible, sin boton de menu, Documentos marcado | 1440 y 1280 | OK |
| CA-01: tabla con Fecha, Numero, Cliente, RUC o CI, Condicion, Estado, CDC, Moneda y Total; sin tarjetas; sin desplazamiento horizontal | 1440 y 1280 | OK |
| CA-04: Notas de debito, Notas de remision y Autofacturas "Próximamente", deshabilitadas | 1440 y 1280 | OK |
| CA-05: filtros a la vista; paginacion avanza ("Página 2 de 19 · 565 documentos") | 1440 y 1280 | OK |
| CA-03: menu de la fila con "Ver detalle"; clic en la fila abre la ficha | 1440 y 1280 | OK |
| CA-02: boton de menu, tarjetas y sin tabla, sin desplazamiento horizontal | 390 | OK; la primera corrida fallo por las seis pestañas en una linea, corregido en `74a8132` |

Ajustes por revision de las capturas: el RUC y el numero no se cortan en dos lineas, y "Mas filtros" no se muestra en escritorio porque los filtros ya estan a la vista (`789a588`).

### E-2. Recorridos existentes con el menu lateral (CA-06)

`playwright-atencion-comprobantes.cjs` con el helper de navegacion: **21/21** (1010565 rechazado con `1306` e inutilizado; carga invalida cerrada sola). Los guiones anteriores fuera de `scripts/segel-fs` siguen usando el boton de menu: corren en 390 px o hay que pasarles el helper si se repiten en escritorio.

### E-3. Fase B1: notas de remision en SIFEN test (2026-11-10)

Stack local con FS `ff50496` y FE `segel-rc4.21` (`bb60df4`; migraciones FE 047 y 048, FS 0040). Numerador de nota de remision (tipo 7) del punto 001-001 creado por la API de administracion de FE (`POST /v1/admin/emisores/1/numeradores`, siguiente 501), como indico FE; sin escrituras a mano en su base.

Ejemplos del paquete `planilla-carga-nre-csv-v1` de FE con los ajustes que pidio FE: numero al punto 001-001, hora del momento, receptor y transportista con RUC existentes en SIFEN test (`80003110-5`; B2G `80000905-3`; entre locales, el propio emisor `5057016-1`). `playwright-ejemplos-planilla.cjs` con `ENSAYO_TIPO=NOTA_REMISION`: **8/8**, las cuatro cargas finalizadas y aprobadas (`0260`).

| Ejemplo | Nota | Destinatario | Motivo |
|---|---|---|---|
| `NRE_VENTA` | 0000501 | CAVALLARO S.A.C.E.I | Traslado por ventas |
| `NRE_ESTADO_LOTE_VENCIMIENTO` | 0000502 | Ministerio de Salud (B2G, DNCP, lote y vencimiento) | Traslado por ventas |
| `NRE_ENTRE_LOCALES` | 0000503 | el propio emisor | Traslado entre locales de la empresa |
| `NRE_EXPORTACION` | 0000504 | CAVALLARO S.A.C.E.I | Exportación |

En FS quedaron como `NOTA_REMISION`, sin condicion de venta, con sus lineas y el detalle de FE. La 504 se vio "Procesando" hasta la pasada siguiente de la carga (07:25), como la factura 1010559 en E-4 de `TASKS_CARGA_ATENCION_COMPROBANTES_v0.1`: FE actualiza el comprobante de la carga un poco despues de aprobar el documento, y FS agenda otra pasada mientras la carga no termina.

`playwright-documentos-escritorio.cjs`: **31/31**. Pestaña "Notas de remision" con Fecha, Numero, Destinatario, RUC o CI, Motivo, Estado y CDC, sin Total; ficha con motivo, traslado (fechas y km), transportista, vehiculo y mercaderia, sin nota de credito ni anular; selector de tipo en "Nueva carga" con Factura y Nota de remision habilitadas y el resto proximamente; la plantilla y el aviso cambian con el tipo. Capturas en `test-results/documentos-escritorio/`.

Pendiente menor: en la ficha de una remision la etiqueta dice "Cliente"; podria decir "Destinatario".

