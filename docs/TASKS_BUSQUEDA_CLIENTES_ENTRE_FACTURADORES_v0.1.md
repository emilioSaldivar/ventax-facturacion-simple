# TASKS Búsqueda de clientes entre facturadores v0.1

| ID | Tarea | Verificación | Estado | Evidencia |
|---|---|---|---|---|
| BCF-001 | Cambiar `search()` | CA-01 a CA-04 en integración | DONE | `capacidad.fixes.integration.test.ts`, contra Postgres |
| BCF-002 | Actualizar OpenAPI | Lectura contra el código | DONE | `spec/openapi.yaml`, `/clientes/search` |
| BCF-003 | Prueba de aislamiento y UI en stack aislado | CA-05; Playwright en móvil y escritorio | DONE | Stack `fs-fix`, modo mock, 2026-11-05. `isolation.cjs`: 98 casos, 0 accesos cruzados. `scripts/playwright-busqueda-clientes.cjs` en 390×844 y 1280×800: 10 de 10, con captura revisada a ojo. Falta repetir en modo real |
