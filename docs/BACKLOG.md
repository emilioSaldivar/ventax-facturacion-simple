# Backlog de Iniciativas

Registro de iniciativas pendientes, con su estado. Cada iniciativa se refina a SPEC → PLAN → TASKS antes de implementarse (flujo SDD).

| Iniciativa | Documento | Estado | Registrada |
|---|---|---|---|
| Backoffice — Alineación con facturacion-electronica + Verificación Fiscal Automática | [SPEC_BACKOFFICE_ALINEACION_FE_v0.2.md](SPEC_BACKOFFICE_ALINEACION_FE_v0.2.md) (reemplaza v0.1) | SPEC refinado — pendiente PLAN/TASKS | 2026-07-31 |
| Gestión de Suscripciones y Cobros (reportes, notificaciones, bloqueos por impago, días de cobro) | [INICIATIVA_SUSCRIPCIONES_COBROS_v0.1.md](INICIATIVA_SUSCRIPCIONES_COBROS_v0.1.md) | PENDIENTE DE REFINAMIENTO | 2026-07-31 |
| Loader DNIT — deteccion de padron sin cambios en origen y aviso de vigencia en UI | Pendiente de SPEC | PENDIENTE DE REFINAMIENTO | 2026-08-22 |
| Loader DNIT — separar `data/` por ambiente (staging y prod comparten bind mount) | Pendiente de SPEC | PENDIENTE DE REFINAMIENTO | 2026-08-22 |
| Loader DNIT — recuperar las 12 lineas del padron descartadas por parseo | Pendiente de SPEC | PENDIENTE DE REFINAMIENTO | 2026-08-22 |
| Loader DNIT — evitar ventana de lock por `TRUNCATE + INSERT` de 2M filas | Pendiente de SPEC | PENDIENTE DE REFINAMIENTO | 2026-08-22 |
| Loader DNIT — agregar `.dockerignore` y destrackear `data/logs/import-2026-05.log` | Pendiente de SPEC | PENDIENTE DE REFINAMIENTO | 2026-08-22 |
| Control de reintentos de emision fiscal — backoff creciente, corte a 24h (`FAILED_PERM`) y notificacion proactiva a 1h en el outbox de emision (`factura_emision_outbox`), originado por incidente AWAPURA (14.138 reintentos en 10 dias sin aviso) | [SPEC_CONTROL_REINTENTOS_EMISION_v0.1.md](SPEC_CONTROL_REINTENTOS_EMISION_v0.1.md) | SPEC + PLAN + TASKS listos — pendiente IMPLEMENT | 2026-08-24 |
