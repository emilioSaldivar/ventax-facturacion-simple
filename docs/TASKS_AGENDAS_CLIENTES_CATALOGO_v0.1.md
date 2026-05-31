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
| CLX-A4 | QA UX clientes | Validar flujo clientes en contenedores con Playwright mobile-first | DONE | Evidencia Playwright en stack desplegado cubre buscar, usar, editar y crear cliente sin perdida de contexto, en mobile + desktop |
| CLX-B1 | UX/UI agenda compacta | Redisenar lista de clientes a fila compacta con accion principal visible | DONE | Cada fila muestra nombre + documento + `Usar`; se reduce altura por cliente y se elimina ruido de multiples acciones visibles |
| CLX-B2 | UX/UI acciones contextuales | Mover acciones secundarias a menu `⋮` por cliente | DONE | Menu contextual incluye `Usar cliente`, `Editar`, `WhatsApp` y `Eliminar cliente` (destructivo), con orden consistente y sin botones secundarios fijos por fila |
| CLX-B3 | UX/UI formulario edicion | Eliminar bloques duplicados y normalizar jerarquia de acciones | DONE | Formulario conserva campos operativos y expone `Guardar` + `Eliminar cliente de mi agenda` con confirmacion |
| CLX-B4 | QA UX agenda compacta | Validar flujo completo por lote con Playwright mobile-first | DONE | Corrida Playwright valida buscar, usar, editar, WhatsApp contextual, eliminar cancelado y eliminar confirmado en contenedores + viewport desktop |
| CLX-C1 | UX/UI continuidad | Conectar `Usar cliente` desde agenda con navegacion a `Nueva factura` | DONE | Al tocar `Usar` o `Usar cliente` la app navega a `Nueva factura` y mantiene sesion/flujo operativo |
| CLX-C2 | UX/UI continuidad | Precargar cliente en formulario de factura | DONE | `InvoiceEditor` recibe cliente seleccionado y completa campos operativos (`documento_tipo`, `documento`, `razon_social`, contacto) |
| CLX-C3 | QA continuidad | Validar flujo agenda -> usar -> nueva factura con Playwright | DONE | Playwright mobile+desktop confirma navegacion y prefill del cliente sin romper el flujo manual |

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
- 2026-05-31: se incorpora bloque incremental `CLX-B1`..`CLX-B4` para densidad operativa de agenda: fila compacta, accion principal `Usar`, acciones secundarias en menu `⋮`, eliminacion destructiva con confirmacion y simplificacion de formulario sin duplicaciones.
- 2026-05-31: implementadas `CLX-B1`, `CLX-B2` y `CLX-B3` en `apps/web-operacion/src/main.tsx` + `apps/web-operacion/src/styles.css` y soporte backend/API para eliminacion operativa de agenda en `apps/api/src/modules/clientes/*` + `spec/openapi.yaml` (`DELETE /clientes/{clienteId}` soft-delete por `facturador_id`).
- 2026-05-31: validacion tecnica ejecutada en lote: `npm run test --workspace @facturacion-simple/api -- clientes.service.test.ts`, `npm run typecheck --workspace @facturacion-simple/api`, `npm run lint --workspace @facturacion-simple/api`, `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion`.
- 2026-05-31: validacion sobre contenedores (`CLX-A4` y `CLX-B4`): `FE_DOCKER_NETWORK=facturacion-electronica_default DATABASE_URL=postgres://facturacion_simple:facturacion_simple@nuevo_repo-postgres-1:5432/facturacion_simple bash scripts/deploy.sh`, healthchecks `GET /api/v1/health` y `GET /healthz`, Playwright mobile+desktop con `/tmp/clx-b4-agenda-playwright.cjs` (`search/use/menu/edit/whatsapp/delete-cancel` OK en Pixel 7 y 1280x800), y flujo destructivo confirmado con cliente temporal `/tmp/clx-b4-delete-confirm.cjs` (`deleted: true`).
- 2026-05-31: implementadas `CLX-C1` y `CLX-C2` en `apps/web-operacion/src/main.tsx` elevando estado de cliente seleccionado desde `ClientesAgendaView` hacia `InvoiceEditor` para navegar a `Nueva factura` y precargar formulario de cliente listo para emitir.
- 2026-05-31: validaciones `CLX-C3`: `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion`, redeploy con `FE_DOCKER_NETWORK=facturacion-electronica_default DATABASE_URL=postgres://facturacion_simple:facturacion_simple@nuevo_repo-postgres-1:5432/facturacion_simple bash scripts/deploy.sh` y Playwright mobile+desktop (`/tmp/clx-c3-agenda-to-invoice.cjs`) confirmando `Agenda -> Usar -> Nueva factura` con prefill efectivo (`CLIENTE CONTRIBUYENTE SA`, `80000000-1`).
