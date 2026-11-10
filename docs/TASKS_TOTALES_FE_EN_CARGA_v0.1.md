# TASKS Totales De FE En La Carga v0.1

## Alineacion

- `docs/SPEC_TOTALES_FE_EN_CARGA_v0.1.md`
- `docs/PLAN_TOTALES_FE_EN_CARGA_v0.1.md`

## Estado

**Implementada y validada el 2026-11-09** en el stack local de Segel (SIFEN test), autorizada por el usuario. Sin despliegue en `segel-fs`.

## Matriz

| ID | Fase | Tarea | Validacion | Estado |
|---|---|---|---|---|
| TFC-001 | 1 | Tipos (PLAN 1) | `typecheck` | DONE: `beffd18` |
| TFC-002 | 1 | Mapeo y marca de nota de credito (PLAN 2) | Pruebas de `comprobanteAFactura` | DONE: `beffd18`; 6 pruebas en `cargas-sync.worker.test.ts` (mas 1 de anticipo en `f2eec22`) |
| TFC-003 | 1 | Mock con totales (PLAN 5) | `cargas.mock.test.ts` | DONE: `beffd18`; marcadores `DESC`, `EXON`, `SINTOT` |
| TFC-004 | 2 | Nota de credito no elegible (PLAN 3, servicio) | `facturas.service.test.ts` | DONE: `beffd18`, reemplazada por TFC-008 |
| TFC-005 | 2 | Pantalla (PLAN 3) y `spec/openapi.yaml` (PLAN 4) | `typecheck` y `build` de `web-operacion`; YAML valido | DONE: `beffd18` y `f2eec22`; `typecheck` y `build` sin errores; YAML valido |
| TFC-006 | 3 | Prueba conjunta con FE en SIFEN test (CA-05) | Playwright y totales FS = FE | DONE: E-1 |
| TFC-008 | 2 | Nota de credito por referencia con FE `rc4.13` (PLAN 3, RN-07 y RN-08) | Pruebas del gateway real y del servicio; E2E en SIFEN test | DONE: `f2eec22`; E-2 |
| TFC-007 | 4 | Repaso de SPEC, PLAN, TASKS y BACKLOG FS-45 | Lectura cruzada | DONE: SPEC, PLAN y BACKLOG repasados |

## Evidencia

`api`: 669 pruebas pasan y 39 omitidas tras TFC-008 (665 tras TFC-005); `typecheck` y `lint` sin errores.

### E-1. Totales de FE en SIFEN test (2026-11-09)

Stack local con FS `beffd18` y FE `segel-rc4.12` (`13f4af5`). Ejemplos del paquete de FE sin correo, con fecha del dia, punto `001-001` y RUC ficticio cambiado por `80026570-0`. `playwright-ejemplos-planilla.cjs`: 5/6.

| Ejemplo | Factura | FS guardo | XML firmado de FE |
|---|---|---|---|
| `05-contado_descuentos` | 1010561 | total 200000, bruto 250000, descuento 50000, IVA 18182 | `dTotGralOpe` 200000, `dTotDesc` 20000 + `dTotDescGlotem` 30000, `dTotIVA` 18181,82 |
| `08-iva_exonerado_y_parcial` | 1010562 | total 1300000, IVA 29126 | `dTotGralOpe` 1300000, `dSubExo` 300000, `dTotIVA` 29126,21 |
| `06-anticipo_aplicado` | 1010563 | rechazada `2439`: el CDC de anticipo del ejemplo no es del emisor | Esperado. Queda con atencion; la carga sigue "En SIFEN" hasta inutilizar el numero |

### E-2. Nota de credito por referencia (2026-11-09)

Stack local con FS `f2eec22` y FE `segel-rc4.13` (`3c2a7a6`). `playwright-nota-credito-referencia.cjs` desde la ficha de cada factura (390 y 1280): notas 1010007 (de 1010561, total 200000) y 1010008 (de 1010562, total 1300000), las dos aprobadas en SIFEN test con el total de su factura. Dos fallas del guion en la primera corrida (leia el boton antes de que la ficha terminara de cargar) corregidas en el guion.

Hallazgo de pantalla (informado por el usuario): una carga sin nada en proceso y con numeros por resolver sigue mostrando la barra y "Esperando la respuesta de SIFEN: puede tardar horas". Propuesta de correccion pendiente de decision del usuario.
