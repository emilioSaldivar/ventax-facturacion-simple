# TASKS Planillas De Ejemplo Y Documentacion De La Planilla v0.1

## Alineacion

- `docs/SPEC_PLANILLAS_EJEMPLO_v0.1.md`
- `docs/PLAN_PLANILLAS_EJEMPLO_v0.1.md`

## Estado

**Implementada y validada el 2026-11-10** en el stack local contra el corte de FE `segel-rc4.25` (paquete v0.40). Sin despliegue: va con el lanzamiento del corte (paso 4 del orden del usuario).

## Matriz

| ID | Tarea | Validacion | Estado |
|---|---|---|---|
| PEJ-001 | Gateway real y mock (PLAN 1) | Pruebas de gateway y mock | DONE: `f50556c`; prueba de gateway real |
| PEJ-002 | Servicio y rutas (PLAN 2) | Pruebas de rutas; `test`, `typecheck`, `lint` | DONE: `f50556c`; prueba de rutas; 677 pasan en `api`, `typecheck` y `lint` sin errores |
| PEJ-003 | Pantalla (PLAN 3) | `typecheck`, `build` | DONE: `a7a6e43`; `typecheck` y `build` sin errores |
| PEJ-004 | `spec/openapi.yaml` (PLAN 4) | YAML valido | DONE: `a7a6e43`; YAML valido |
| PEJ-005 | Playwright con FE `segel-rc4.25` (PLAN 5) | Resultado y capturas | DONE: E-1, 11/11 |
| PEJ-006 | Repaso de SPEC, PLAN, TASKS y BACKLOG FS-46 | Lectura cruzada | DONE: BACKLOG FS-46 cerrado |

## Evidencia

### E-1. Playwright contra FE `segel-rc4.25` (2026-11-10)

Stack local con FS `a7a6e43` y FE `segel-rc4.25` (`fbc9cfc`, sin migraciones nuevas desde `rc4.21`). `scripts/segel-fs/playwright-planillas-ejemplo.cjs`: **11/11**. Capturas y archivos descargados en `test-results/planillas-ejemplo/`.

| Escenario | Resultado |
|---|---|
| CA-01: con Factura, 18 ejemplos de FE en cuatro grupos (Consumidor final, Empresas, Estado, Exterior) mas la documentacion | OK |
| CA-02: el ejemplo "Contado: empresa y persona" sale con 001-001-1010567 y 001-001-1010568 (siguientes del numerador del punto), se sube tal cual y valida sin `PUNTO_DISTINTO` ni `NUMERO_FUERA_DE_ORDEN`; la carga se cancela sin emitir | OK |
| CA-03: documentacion en PDF (102.500 bytes) y en Markdown | OK |
| CA-04: la plantilla de facturas sale con el punto 001-001 | OK |
| CA-01 y CA-02 con Nota de remision: los cuatro ejemplos `NRE_*`; el descargado trae `NOTA_REMISION;001-001-0000505` | OK |
| CA-05: menu visible sin desplazamiento horizontal en 1280 y 390 | OK |

Primera corrida 10/11: la prueba leia el menu antes de que llegara la lista y comparaba los titulos sin tener en cuenta que se ven en mayusculas. Corregido en la prueba.

