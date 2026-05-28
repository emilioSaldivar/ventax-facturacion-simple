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
| ACC-002 | Clientes globales | Verificar modelo `cliente_identidades` como base global | DONE | La entidad global mantiene documento normalizado e identidad fiscal reutilizable sin representar relacion comercial |
| ACC-003 | Agenda facturador | Verificar modelo `facturador_clientes` como agenda privada | DONE | La agenda diferencia clientes por `facturador_id`, permite datos personalizados y no modifica agendas ajenas |
| ACC-004 | Busqueda clientes | Validar prioridad agenda -> global -> carga manual | DONE | La busqueda consulta primero agenda propia, luego identidad global, y permite alta manual cuando no hay datos |
| ACC-005 | Escritura clientes | Validar alta/edicion sincronizada | DONE | Alta o edicion crea/actualiza identidad global y agenda propia sin propagar cambios a otros facturadores |
| ACC-006 | UX privacidad | Eliminar comunicacion visible de cliente compartido | DONE | UI/copy/respuestas operativas no muestran "cliente compartido" ni comunican base global al operador o cliente final |
| ACC-007 | Catalogo aislamiento | Verificar catalogo exclusivo por facturador | DONE | Busqueda, alta, edicion y listado de catalogo siempre filtran por `facturador_id` y no usan base global |
| ACC-008 | Indices | Revisar indices de agenda y catalogo | DONE | Existen indices o constraints adecuados para busqueda por facturador/documento y codigo por facturador |
| ACC-009 | QA | Agregar pruebas de aislamiento y fallback | DONE | Tests cubren agendas con mismo documento, fallback global, edicion sin propagacion y catalogo aislado |
| CLX-A1 | UX/UI clientes | Redisenar gestion de clientes para seleccion rapida y edicion inmediata | DONE | Lista en tarjetas con `Usar`/`Editar`, busqueda instantanea, sin formulario fijo al final, y CTA `+ Nuevo cliente` en modal/sheet |
| CLX-A2 | UX/UI clientes | Integrar reuso de autocompletado actual en flujo clientes | DONE | Al escribir documento (`RUC/CI`) se reutiliza autocompletado existente para sugerir existentes, completar nombre/tipo doc y evitar duplicados |
| CLX-A3 | UX/UI clientes | Optimizar experiencia mobile y estados vacios | DONE | Tarjetas tactiles de una mano, estado vacio amigable con `+ Crear cliente`, y jerarquia visual nombre/documento/acciones consistente |
| CLX-A4 | QA UX clientes | Validar flujo clientes en contenedores con Playwright mobile-first | PENDING | Evidencia de buscar, usar, editar y crear cliente sin scroll excesivo ni perdida de contexto, sobre stack desplegado |

## Evidencia

- 2026-05-21: creada cadena SDD `AGENDAS_CLIENTES_CATALOGO` para formalizar base global de clientes, agenda privada por facturador y catalogo exclusivo por facturador. No se implemento codigo en esta tarea documental.
- 2026-05-21: verificada implementacion existente de `cliente_identidades`, `facturador_clientes` y `catalogo_items`; agregada migracion `db/migrations/0012_agendas_catalogo_indexes.sql` con indices activos por documento, facturador e item.
- 2026-05-21: ajustada UI operativa para no exponer "identidad compartida"; el fallback global se muestra como sugerencia neutral para agregar a la agenda.
- 2026-05-21: agregadas pruebas de fallback global de clientes, no creacion implicita de agenda, y validacion de unicidad de catalogo por `facturador_id`.
- 2026-05-21: validaciones ejecutadas: `npm run test -w @facturacion-simple/api -- clientes.service.test.ts catalogo.service.test.ts`, `npm run typecheck -w @facturacion-simple/web-operacion`, `npm run typecheck -w @facturacion-simple/api`, `npm run build -w @facturacion-simple/web-operacion`, `npm run qa:no-secrets`, `rg -n "Identidad compartida|identidad compartida|cliente compartido|cliente compartida|base compartida|compartido|compartida" apps/web-operacion/src`.
- 2026-05-21: validacion final de repo ejecutada: `npm run test`, `npm run lint`, `npm run build`.
- 2026-05-27: se agrega bloque de trabajo UX clientes (`CLX-A1`..`CLX-A4`) para redisenar seleccion/edicion en agenda sin cambios de API/backend. Se documenta reuso de autocompletado actual de documento (`RUC/CI`) y foco mobile-first con busqueda instantanea y estado vacio accionable.
- 2026-05-28: implementadas `CLX-A1`, `CLX-A2` y `CLX-A3` en `apps/web-operacion/src/main.tsx` + `apps/web-operacion/src/styles.css`. Cambios: tarjetas interactivas con acciones `Usar`/`Editar`/`WhatsApp`, busqueda instantanea `Buscar cliente...`, eliminacion del formulario fijo, boton principal `+ Nuevo cliente` y editor en modal con autocompletado por agenda + fallback DNIT por `RUC/CI`. Validacion ejecutada: `npm run typecheck --workspace @facturacion-simple/web-operacion` y `npm run build --workspace @facturacion-simple/web-operacion`.
- 2026-05-28: `CLX-A4` queda `PENDING` hasta validar Playwright mobile-first sobre contenedores desplegados por staging (`bash scripts/deploy.sh`) para evitar afectar el entorno productivo actual durante pruebas automatizadas.
