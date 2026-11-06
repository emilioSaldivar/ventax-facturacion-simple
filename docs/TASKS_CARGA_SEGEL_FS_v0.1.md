# TASKS Carga Segel en VPS v0.1

## Alineacion

- `docs/SPEC_CARGA_SEGEL_FS_v0.1.md`
- `docs/PLAN_CARGA_SEGEL_FS_v0.1.md`

## Matriz

| ID | Tarea | Estado |
| --- | --- | --- |
| CSF-001 | SPEC, PLAN y TASKS | DONE (2026-11-06) |
| CSF-002 | Herramientas | DONE (2026-11-06) |
| CSF-003 | E0 Humo | PENDIENTE |
| CSF-004 | E1 Base | EN ESPERA del tag de FE (decision del usuario) |
| CSF-005 | E2 Doble | PENDIENTE |
| CSF-006 | E3 Rafaga | PENDIENTE |
| CSF-007 | E4 Fallas | PENDIENTE |
| CSF-008 | Informe y limpieza | PENDIENTE |

## Decision de espera (2026-11-06)

FE avisó que `c337d9e` tiene FE-01 (una cancelacion simultanea puede firmar el evento de otra factura), FE-14 (dos emisiones simultaneas pueden compartir numero, y la segunda responde 200 con el documento de la primera), FE-15 y FE-16 (documento trabado bajo saturacion). El usuario decidio esperar que FE termine y anuncie su tag (SV-303), redesplegar y recien entonces correr E1 a E4.

Al retomar:

1. Redesplegar FE con `FE_REF=<tag>`, y actualizar el valor por defecto de `build-images.sh` y `deploy.sh`.
2. Con ese tag, quitar las sentencias de AWAPURA de `bootstrap.sh`; lo esperado en una base nueva son 0 emisores.
3. Atender en FS `503 EMISSION_OVERLOADED` con `Retry-After`, y `email_status: PENDING`.
4. Reportar los resultados como "sin correo": la emision con correo (FE-17) se mide aparte.

## Evidencia
