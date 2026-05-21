# TASKS Agendas Clientes Catalogo v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_PRODUCTO_MVP_v0.1.md`
- `docs/PLAN_PRODUCTO_MVP_v0.1.md`
- `docs/TASKS_PRODUCTO_MVP_v0.1.md`
- `docs/SPEC_AGENDAS_CLIENTES_CATALOGO_v0.1.md`
- `docs/PLAN_AGENDAS_CLIENTES_CATALOGO_v0.1.md`
- `spec/openapi.yaml`

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
| --- | --- | --- | --- | --- |
| ACC-001 | SDD | Crear SPEC/PLAN/TASKS de agendas y catalogo | DONE | Existe esta cadena documental y queda alineada con producto MVP |
| ACC-002 | Clientes globales | Verificar modelo `cliente_identidades` como base global | PENDING | La entidad global mantiene documento normalizado e identidad fiscal reutilizable sin representar relacion comercial |
| ACC-003 | Agenda facturador | Verificar modelo `facturador_clientes` como agenda privada | PENDING | La agenda diferencia clientes por `facturador_id`, permite datos personalizados y no modifica agendas ajenas |
| ACC-004 | Busqueda clientes | Validar prioridad agenda -> global -> carga manual | PENDING | La busqueda consulta primero agenda propia, luego identidad global, y permite alta manual cuando no hay datos |
| ACC-005 | Escritura clientes | Validar alta/edicion sincronizada | PENDING | Alta o edicion crea/actualiza identidad global y agenda propia sin propagar cambios a otros facturadores |
| ACC-006 | UX privacidad | Eliminar comunicacion visible de cliente compartido | PENDING | UI/copy/respuestas operativas no muestran "cliente compartido" ni comunican base global al operador o cliente final |
| ACC-007 | Catalogo aislamiento | Verificar catalogo exclusivo por facturador | PENDING | Busqueda, alta, edicion y listado de catalogo siempre filtran por `facturador_id` y no usan base global |
| ACC-008 | Indices | Revisar indices de agenda y catalogo | PENDING | Existen indices o constraints adecuados para busqueda por facturador/documento y codigo por facturador |
| ACC-009 | QA | Agregar pruebas de aislamiento y fallback | PENDING | Tests cubren agendas con mismo documento, fallback global, edicion sin propagacion y catalogo aislado |

## Evidencia

- 2026-05-21: creada cadena SDD `AGENDAS_CLIENTES_CATALOGO` para formalizar base global de clientes, agenda privada por facturador y catalogo exclusivo por facturador. No se implemento codigo en esta tarea documental.
