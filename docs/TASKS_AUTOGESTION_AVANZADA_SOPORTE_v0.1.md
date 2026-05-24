# TASKS Autogestion Avanzada Soporte v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_AUTOGESTION_AVANZADA_SOPORTE_v0.1.md`
- `docs/PLAN_AUTOGESTION_AVANZADA_SOPORTE_v0.1.md`
- `docs/API_FACTURACION_ELECTRONICA/OPERACION_RECHAZOS_Y_AUTOGESTION_v0.1.md`
- `spec/openapi.yaml`

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
| --- | --- | --- | --- | --- |
| AGS-001 | SDD | Crear cadena SPEC/PLAN/TASKS soporte | DONE | Documentos creados y alineados |
| AGS-002 | API soporte | Exponer `decision` y `eventos` en SaaS interno | PENDING | Endpoints protegidos y normalizados |
| AGS-003 | API soporte | Exponer `validate-cdc-impact` + `retry-same-cdc` | PENDING | Flujo de reintento CDC controlado |
| AGS-004 | API soporte | Exponer `void-number` + `create-derived` | PENDING | Flujo de reemplazo con inutilizacion |
| AGS-005 | API soporte | Exponer `cancel-send` para cola batch | PENDING | Solo documentos elegibles |
| AGS-006 | Seguridad | Enforzar permisos y guardrails de ventana | PENDING | Operador comercial no accede |
| AGS-007 | Auditoria | Registrar actor/motivo/request/response/resultado | PENDING | Trazabilidad completa |
| AGS-008 | UI soporte | Pantalla de autogestion por alerta | PENDING | Acciones guiadas y no ambiguas |
| AGS-009 | QA | Validar casos dentro/fuera de ventana | PENDING | Evidencia Playwright + API |
