# TASKS Identidad Operativa Facturador v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_IDENTIDAD_OPERATIVA_FACTURADOR_v0.1.md`
- `docs/PLAN_IDENTIDAD_OPERATIVA_FACTURADOR_v0.1.md`
- `docs/WIREFRAME_EDITOR_FACTURA_MVP_v0.1.md`
- `spec/openapi.yaml`

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
| --- | --- | --- | --- | --- |
| IOF-001 | SDD | Crear SPEC/PLAN/TASKS de identidad operativa | DONE | Existe cadena documental para titulo operativo, actividad economica visible y fallback |
| IOF-002 | Modelo | Verificar campos actuales de facturador y actividad | DONE | Se identifica si ya existe nombre fantasia/alias o si se requiere migracion |
| IOF-003 | Modelo | Agregar alias/nombre operativo si falta | DONE | Facturador o actividad/perfil pueden almacenar alias visible sin modificar datos fiscales oficiales ni contrato con `fe-api` |
| IOF-004 | API contexto | Exponer `titulo_operativo` derivado | DONE | `GET /me/context` devuelve titulo listo para UI segun actividad economica/perfil asignado al usuario y fallback deterministico |
| IOF-005 | OpenAPI | Documentar nuevos campos de contexto | DONE | `spec/openapi.yaml` refleja alias/titulo operativo sin romper clientes existentes |
| IOF-006 | UI principal | Mostrar titulo operativo como encabezado | DONE | Pantalla principal usa titulo operativo y deja razon social/RUC como secundarios |
| IOF-007 | UI actividad | Mostrar actividad economica activa claramente | DONE | Codigo/descripcion/alias de actividad y perfil son visibles para confirmar contexto de emision |
| IOF-008 | Backoffice/checklist | Registrar nombre fantasia y alias de actividad | DONE | Alta manual de facturador contempla estos datos |
| IOF-009 | QA | Validar fallback y no alteracion fiscal | DONE | Tests y smoke confirman alias visible por actividad/perfil sin cambiar payload fiscal oficial ni contrato `fe-api` |

## Evidencia

- 2026-05-21: creada cadena SDD `IDENTIDAD_OPERATIVA_FACTURADOR` para refinar titulo principal por nombre fantasia, alias o actividad economica. No se implemento codigo funcional en esta tarea documental.
- 2026-05-21: refinado alcance: nombre fantasia y alias son solo visualizacion/UX del SaaS; el alias se discrimina por actividad economica/perfil del contexto operativo del usuario y no cambia contrato ni payload con `fe-api`.
- 2026-05-21: implementado `db/migrations/0013_identidad_operativa_facturador.sql`; `facturadores.nombre_fantasia` ya existia y se agregaron alias en `facturador_actividades` y `actividad_punto_perfiles`.
- 2026-05-21: `GET /me/context` ahora expone `facturador.nombre_fantasia`, alias de actividad/perfil y `display.titulo_operativo` derivado con fallback actividad/perfil -> nombre fantasia -> actividad -> razon social.
- 2026-05-21: UI operativa usa `titulo_operativo` como titulo principal y muestra razon social/RUC como datos secundarios; actividad y perfil muestran alias cuando existen.
- 2026-05-21: `spec/openapi.yaml` y `docs/CHECKLIST_ALTA_FACTURADOR_MVP_v0.1.md` actualizados para dejar claro que alias/nombre fantasia son solo UX y no cambian `fe-api`.
- 2026-05-21: validaciones iniciales ejecutadas: `npm run test -w @facturacion-simple/api -- context.service.test.ts migrations.test.ts`, `npm run typecheck -w @facturacion-simple/api`, `npm run typecheck -w @facturacion-simple/web-operacion`.
- 2026-05-21: validacion final ejecutada: `npm run test`, `npm run lint`, `npm run build`, `npm run qa:no-secrets`.
