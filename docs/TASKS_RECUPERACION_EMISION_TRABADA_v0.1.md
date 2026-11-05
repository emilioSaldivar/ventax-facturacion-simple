# TASKS Recuperación de emisión trabada v0.1

| ID | Tarea | Verificación | Estado | Evidencia |
|---|---|---|---|---|
| RET-001 | Reclamar `PROCESSING` vencido | CA-01 en integración | DONE | `capacidad.fixes.integration.test.ts` |
| RET-002 | Prueba en stack aislado | CA-02 | DONE | Stack `fs-fix`, modo mock, 2026-11-05. Trabajo forzado a `PROCESSING` vencido, sin uuid: quedó `DONE` y `EMITIDA`, con uuid, en 2 intentos, sin intervención |
| RET-003 | Confirmar con FE real en la repetición | CA-03 | PENDIENTE | Depende de la corrida conjunta |
