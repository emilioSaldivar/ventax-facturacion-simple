# TASKS Nota De Credito Parcial Con Lineas v0.1

## Alineacion

- `docs/SPEC_NOTA_CREDITO_PARCIAL_v0.1.md`
- `docs/PLAN_NOTA_CREDITO_PARCIAL_v0.1.md`

## Estado

Documentada el 2026-11-10 por decision del usuario (entra, al menos en USD). Lista para implementar por otro agente despues de MON-008 y MON-009, en la rama `feat/moneda-extranjera`, una vez confirmadas D-1 a D-4 del SPEC. Misma regla de validacion por commit que `TASKS_MONEDA_EXTRANJERA_v0.1.md`.

## Matriz

| ID | Tarea | Validacion | Estado |
|---|---|---|---|
| NCP-001 | Tipos, esquema `lineas` y `saldoAcreditablePorLinea` con prueba (PLAN 1 y 2) | `test`, `typecheck` | TODO |
| NCP-002 | `emitNotaCredito` con lineas: validaciones RN-01/03/04/06, lineas y totales de la nota, `buildFiscalNotaCreditoRequest` con items propios y moneda, RN-05 (PLAN 2 y 3) | `test` (USD, PYG, rechazos), `typecheck`, `lint` | TODO |
| NCP-003 | Gateway: `moneda`/`tipoCambio` en el payload de NC, mock `[FE-2417]` (PLAN 3) | `test` de payload, `typecheck` | TODO |
| NCP-004 | Repositorio: la nota guarda sus propias lineas y totales (PLAN 4) | `test`, `typecheck` | TODO |
| NCP-005 | Elegibilidad y saldo expuesto (candidatas o ficha), `canEmitNotaCredito` (PLAN 2 y 5) | `test`, `typecheck`, `build` | TODO |
| NCP-006 | Ventana Total / Parcial con tabla de lineas; seccion de notas en la ficha de la factura (PLAN 5) | `typecheck`, `build` | TODO |
| NCP-007 | `spec/openapi.yaml` (PLAN 6) | YAML valido; la UI consume lo documentado | TODO |
| NCP-008 | Playwright CA-01 a CA-07 en SIFEN test, 1440/1280/390 (PLAN 7) | Resultado y capturas | TODO |
| NCP-009 | Repaso SPEC/PLAN/TASKS, `SPEC_NOTA_CREDITO_TRABADA_v0.1` (RN-02 reemplazada), BACKLOG FS-44 (motivo sigue en 1) | Lectura cruzada | TODO |

## Evidencia

Se completa al cerrar cada tarea.
