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
| DES-101 | B1 | Migracion `0040` y tipos (PLAN 6) | `test`, `typecheck` y `lint` de `api` | TODO |
| DES-102 | B1 | Gateway, mock, ruta de subida y plantilla por tipo (PLAN 6) | Pruebas de gateway, mock y ruta | TODO |
| DES-103 | B1 | Incorporacion de comprobantes NRE (PLAN 6) | Pruebas del mapeo y del worker | TODO |
| DES-104 | B1 | Pantalla: selector de tipo, pestaña y ficha de NRE (PLAN 6) | `typecheck` y `build` | TODO |
| DES-105 | B1 | `spec/openapi.yaml` | YAML valido | TODO |
| DES-106 | B1 | Playwright con FE `segel-rc4.21` en SIFEN test, 1440, 1280 y 390 | Resultado y capturas | TODO |
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
