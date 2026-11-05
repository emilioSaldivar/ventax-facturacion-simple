# PLAN Verificación de documentos en cola v0.1

- `verificacion.worker.ts`, `processOne`: guardar `fiscal_status_raw` del documento actualizado. Si el refresh lanza error, queda `null` y rige RN-04.
- Tras los cortes por estado terminal y por 30 días: si el estado canónico está en cola, `scheduleNextVerificacion({ nextAt: ahora + 15 min, attempts: 0 })`.
- Sin migración.

**Carga:** con 200 documentos en cola son unas 13 consultas por minuto, por debajo del tope del worker (20 por minuto). Cada una termina rápido, porque FE responde el 409 sin consultar a SIFEN, según su respuesta del 2026-11-05.
