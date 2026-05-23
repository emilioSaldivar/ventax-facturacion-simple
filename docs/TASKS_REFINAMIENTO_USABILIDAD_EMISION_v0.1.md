# TASKS Refinamiento Usabilidad Emision v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_REFINAMIENTO_USABILIDAD_EMISION_v0.1.md`
- `docs/PLAN_REFINAMIENTO_USABILIDAD_EMISION_v0.1.md`
- `docs/WIREFRAME_EDITOR_FACTURA_MVP_v0.1.md`
- `docs/TASKS_IMPLEMENTACION_MVP_v0.1.md`

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
| --- | --- | --- | --- | --- |
| RUX-001 | SDD | Crear cadena SPEC/PLAN/TASKS de refinamiento de usabilidad | DONE | Existen documentos versionados para alcance de guardado opcional, salto a envio y limpieza post compartir |
| RUX-002 | UI nueva factura | Agregar decision guardar/no guardar item en catalogo | PENDING | El operador puede confirmar item con `guardar` o `no guardar` sin romper carga de factura |
| RUX-003 | UI/catalogo | Aplicar persistencia condicional de item | PENDING | `Guardar` persiste en catalogo; `No guardar` agrega solo a factura actual |
| RUX-004 | UI navegacion | Implementar salto directo a bloque `Envio de documentos` tras confirmar item | PENDING | El operador no requiere scroll manual adicional para continuar flujo |
| RUX-005 | UI estado | Limpiar formulario `Nueva factura` luego de compartir con exito | PENDING | Cliente, items y totales quedan reiniciados y el menu queda listo para nueva factura |
| RUX-006 | QA visual/E2E | Validar flujo mobile y desktop/tablet contra contenedores | PENDING | Playwright confirma guardado opcional, salto directo a envio y reset post compartir |
| RUX-007 | Cierre documental | Registrar evidencia en TASKS de implementacion MVP | PENDING | `docs/TASKS_IMPLEMENTACION_MVP_v0.1.md` contiene comandos, fecha y resultado de validaciones |

## Evidencia

- 2026-05-23: definida iniciativa `REFINAMIENTO_USABILIDAD_EMISION` con cadena SDD completa para resolver feedback de usuario final sobre carga de items, continuidad a envio y limpieza post compartir. Sin implementacion de codigo en esta tarea documental.

