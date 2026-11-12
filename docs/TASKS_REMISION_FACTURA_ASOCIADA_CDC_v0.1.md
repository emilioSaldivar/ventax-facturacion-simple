# TASKS Nota De Remision: Factura Asociada Por CDC v0.1

## Alineacion

- `docs/SPEC_REMISION_FACTURA_ASOCIADA_CDC_v0.1.md`
- `docs/PLAN_REMISION_FACTURA_ASOCIADA_CDC_v0.1.md`
- BACKLOG FS-137 · FE BL-213 (NRE v0.2) · Absorbe NRE-019 y NRE-021 de `TASKS_NOTA_REMISION_v0.1`

## Estado

Cadena escrita el 2026-11-12 por pedido del usuario (primero CDC electronico a mano; la impresa despues). **FE respondio y D-NRE2-1 esta decidida (opcion A); no se implementa hasta que el usuario lo indique; la implementacion la hara otra sesion/agente, despues de FS-138** (regla `documentar-antes-de-implementar-con-fe`). Lo de FS no cambia nada para FE hasta BL-213; con FE sin BL-213 la nota con asociada externa queda `ERROR_OPERATIVO` sin consumir numero.

## Matriz

| ID | Tarea | Validacion | Estado |
|---|---|---|---|
| NRA-000 | Respuesta de FE a los puntos a-e; ajustar SPEC/PLAN | Lectura cruzada con `PEDIDO_... §12` del repo de FE | DONE (2026-11-12: respuesta a-e, verificacion §31 local y D-NRE2-1 = opcion A en la SPEC) |
| NRA-001 | CDC compartido: normalizar, DV, validar factura propia, partes (PLAN 1) | `test` shared con 12 CDC reales; `typecheck` | Se implementa en NCX-001 de `TASKS_NOTA_CREDITO_FACTURA_EXTERNA_v0.1` (FS-138 va primero, 2026-11-12) |
| NRA-002 | Gateway `consultarDeSifen` real y mock; mock de NRE con `documentosAsociados` y `404` (PLAN 2) | `test` de cliente con `fetch` simulado; `typecheck` | Se implementa en NCX-002 de `TASKS_NOTA_CREDITO_FACTURA_EXTERNA_v0.1` (FS-138 va primero, 2026-11-12) |
| NRA-003 | Lectura del `rDE` (PLAN 3) | `test` con un `rDE` real de SIFEN test | Se implementa en NCX-003 de `TASKS_NOTA_CREDITO_FACTURA_EXTERNA_v0.1` (FS-138 va primero, 2026-11-12) |
| NRA-004 | Servicio: verificar, validar, emitir con asociadas, resumen, worker RN-11 (PLAN 4) | `test`, `typecheck`, `lint` | PENDIENTE |
| NRA-005 | Rutas: verificar, asociables, esquema (PLAN 5) | `test`, `typecheck` | PENDIENTE |
| NRA-006 | Pantalla: seccion Facturas asociadas, fecha prevista condicional, panel, ficha (PLAN 6) | `typecheck`, `build` | PENDIENTE |
| NRA-007 | `spec/openapi.yaml` (PLAN 7) | YAML valido; la UI consume lo documentado | PENDIENTE |
| NRA-008 | Playwright CA-02 a CA-08 contra el stack local con el FE actual (CA-07 con el `404`), 1440/1280/390 (PLAN 8) | Resultado y capturas | PENDIENTE |
| NRA-009 | CA-01, CA-05 y CA-06 en SIFEN test con `fe-segel` **con BL-213**, aviso previo a FE | Numeros, CDC, KUDE con la asociada, capturas | ESPERA FE (`segel-rc4.35`, BL-213; arranca con la orden del usuario en la sesion de FE) |
| NRA-010 | Repaso SPEC/PLAN/TASKS; `TASKS_NOTA_REMISION_v0.1` (NRE-019/021 absorbidas); BACKLOG FS-137 | Lectura cruzada | PENDIENTE |

## Evidencia

Se completa al cerrar cada tarea.
