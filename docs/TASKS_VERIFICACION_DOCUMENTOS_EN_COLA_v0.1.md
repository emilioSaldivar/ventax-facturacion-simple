# TASKS Verificación de documentos en cola v0.1

| ID | Tarea | Verificación | Estado | Evidencia |
|---|---|---|---|---|
| VDC-001 | Reprogramar en cola | CA-01 a CA-03 en `verificacion.worker.test.ts` | DONE | 4 casos nuevos, incluida RN-04 |
| VDC-002 | Prueba en stack aislado | CA-04, con `FE_MOCK_CANONICAL_STATUS` | DONE | Stack `fs-fix`, modo mock, 2026-11-05. En cola: 3 intentos pasaron a 0, próxima consulta a 15 min. Al cambiar a `APPROVED`: `EMITIDA` y fuera de la agenda |
| VDC-003 | Confirmar con FE real en la repetición | Sin facturas aprobadas en FE con verificación a horas | PENDIENTE | Depende de la corrida conjunta |
