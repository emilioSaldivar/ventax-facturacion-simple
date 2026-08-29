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
| Control de reintentos de emision fiscal — backoff creciente, corte a 24h (`FAILED_PERM`) y notificacion proactiva a 1h en el outbox de emision (`factura_emision_outbox`), originado por incidente AWAPURA (14.138 reintentos en 10 dias sin aviso) | [SPEC_CONTROL_REINTENTOS_EMISION_v0.1.md](SPEC_CONTROL_REINTENTOS_EMISION_v0.1.md) | IMPLEMENTADO y validado (local + Postgres real) — pendiente commit/deploy | 2026-08-24 |
| Alineacion de clave en verificacion fiscal — el worker F9 manda la clave de consumidor a `/documentos/:uuid/sifen`, que exige la clave compartida (401) — INCIDENTE ACTIVO EN PRODUCCION | [SPEC_ALINEACION_CLAVE_VERIFICACION_FISCAL_v0.1.md](SPEC_ALINEACION_CLAVE_VERIFICACION_FISCAL_v0.1.md) | DESPLEGADO en produccion (2026-08-29), verificado con documento real (401->200, EMITIDA) | 2026-08-28 |
| Cliente fiscal — resolver la clase de clave (compartida vs consumidor) por ruta de forma centralizada, para que el desalineamiento F0 no pueda repetirse en un punto de llamada nuevo | Pendiente de SPEC | PENDIENTE DE REFINAMIENTO | 2026-08-28 |
| Recuperar 101 documentos `PENDIENTE_SIFEN` de produccion retirados por el corte de 30 dias (2026-05-23 a 2026-07-23, 43 sin `document_uuid`) — anteriores al worker F9, requieren barrido o cierre administrativo | Pendiente de SPEC | PENDIENTE DE REFINAMIENTO | 2026-08-28 |
| Backups — no hay dump automatizado de las DB de facturacion simple en la VPS; el ultimo es del 2026-05-23 y `scripts/install-backup-cron.sh` nunca se instalo para este stack | Pendiente de SPEC | PENDIENTE DE REFINAMIENTO | 2026-08-28 |
| Red compartida con facturacion-electronica — migrar de fe-{prod,test}_default a ventax_fiscal_{prod,test} con alias facturacion-electronica, estandar declarado por el proveedor (precedente pos-graciela: 50s -> 476ms) | [SPEC_RED_COMPARTIDA_FISCAL_v0.1.md](SPEC_RED_COMPARTIDA_FISCAL_v0.1.md) | CERRADA — staging y produccion migrados a ventax_fiscal_{test,prod}, verificado funcional (2026-08-29) | 2026-08-29 |
