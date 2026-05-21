# TASKS Documentos Emision UX v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_DOCUMENTOS_EMISION_UX_v0.1.md`
- `docs/PLAN_DOCUMENTOS_EMISION_UX_v0.1.md`
- `docs/WIREFRAME_EDITOR_FACTURA_MVP_v0.1.md`
- `spec/openapi.yaml`

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
| --- | --- | --- | --- | --- |
| DUX-001 | SDD | Crear SPEC/PLAN/TASKS de refinamiento documentos/emision | DONE | Existe cadena documental versionada y referenciada desde `AGENTS.md` |
| DUX-002 | API documentos | Verificar busqueda `GET /facturas?q=` | PENDING | La busqueda cubre numero fiscal, CDC cuando aplique, documento receptor y razon social sin romper filtros existentes |
| DUX-003 | API documentos | Verificar filtros por fecha | PENDING | `desde` y `hasta` filtran por fecha de emision/creacion operativa segun contrato vigente y se combinan con `q` y tipo |
| DUX-004 | UI documentos | Separar estado lista y estado detalle | PENDING | Al seleccionar un documento desaparecen listado y filtros, quedando solo detalle y acciones |
| DUX-005 | UI documentos | Agregar controles fecha y buscador unificado | PENDING | El operador filtra por rango de fecha y busca por numero, RUC/CI o nombre desde un unico campo |
| DUX-006 | UI documentos | Implementar volver a resultados preservando filtros | PENDING | Desde detalle se vuelve a la lista anterior con filtros y busqueda conservados |
| DUX-007 | UI emision | Navegar a nueva factura en seccion accionable | PENDING | Desde pantalla principal, `Nueva factura`/`Emitir factura` deja visible el formulario operativo sin scroll manual por datos del facturador |
| DUX-008 | QA visual | Validar flujo mobile y desktop | PENDING | Playwright contra contenedores cubre filtros, busqueda, seleccion exclusiva, volver y entrada directa a emision |
| DUX-009 | Documentacion cierre | Registrar evidencia de validacion | PENDING | Esta matriz contiene comandos, entorno y resultado antes de cerrar tareas |

## Evidencia

- 2026-05-21: creada cadena SDD `DOCUMENTOS_EMISION_UX` para mapear seleccion exclusiva de documentos, filtros por fecha, busqueda por numero/documento/receptor y entrada directa al formulario de emision. No se implemento codigo funcional en esta tarea documental.
