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
| IOF-002 | Modelo | Verificar campos actuales de facturador y actividad | PENDING | Se identifica si ya existe nombre fantasia/alias o si se requiere migracion |
| IOF-003 | Modelo | Agregar alias/nombre operativo si falta | PENDING | Facturador o actividad/perfil pueden almacenar alias visible sin modificar datos fiscales oficiales ni contrato con `fe-api` |
| IOF-004 | API contexto | Exponer `titulo_operativo` derivado | PENDING | `GET /me/context` devuelve titulo listo para UI segun actividad economica/perfil asignado al usuario y fallback deterministico |
| IOF-005 | OpenAPI | Documentar nuevos campos de contexto | PENDING | `spec/openapi.yaml` refleja alias/titulo operativo sin romper clientes existentes |
| IOF-006 | UI principal | Mostrar titulo operativo como encabezado | PENDING | Pantalla principal usa titulo operativo y deja razon social/RUC como secundarios |
| IOF-007 | UI actividad | Mostrar actividad economica activa claramente | PENDING | Codigo/descripcion/alias de actividad y perfil son visibles para confirmar contexto de emision |
| IOF-008 | Backoffice/checklist | Registrar nombre fantasia y alias de actividad | PENDING | Alta manual de facturador contempla estos datos |
| IOF-009 | QA | Validar fallback y no alteracion fiscal | PENDING | Tests y smoke confirman alias visible por actividad/perfil sin cambiar payload fiscal oficial ni contrato `fe-api` |

## Evidencia

- 2026-05-21: creada cadena SDD `IDENTIDAD_OPERATIVA_FACTURADOR` para refinar titulo principal por nombre fantasia, alias o actividad economica. No se implemento codigo funcional en esta tarea documental.
- 2026-05-21: refinado alcance: nombre fantasia y alias son solo visualizacion/UX del SaaS; el alias se discrimina por actividad economica/perfil del contexto operativo del usuario y no cambia contrato ni payload con `fe-api`.
