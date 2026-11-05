# TASKS API tras reinicio de PostgreSQL v0.1

| ID | Tarea | Verificación | Estado | Evidencia |
|---|---|---|---|---|
| ATR-001 | Manejador de error del pool | Unitaria | DONE | `pool.error-handler.test.ts` |
| ATR-002 | Política de reinicio en compose | `RestartPolicy` del contenedor | DONE | `unless-stopped` en `fs-fix-api-1` |
| ATR-003 | Prueba en stack aislado | CA-01 a CA-03 | PARCIAL | Stack `fs-fix`, modo mock, 2026-11-05. CA-01: mismo `StartedAt` tras reiniciar postgres. CA-02: login y factura emitida después. CA-03: solo por configuración: `docker kill` cuenta como detención manual y no reinicia, y no se pudo provocar una caída real sin root |
