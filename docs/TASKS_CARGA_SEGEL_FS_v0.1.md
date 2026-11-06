# TASKS Carga Segel en VPS v0.1

## Alineacion

- `docs/SPEC_CARGA_SEGEL_FS_v0.1.md`
- `docs/PLAN_CARGA_SEGEL_FS_v0.1.md`

## Matriz

| ID | Tarea | Estado |
| --- | --- | --- |
| CSF-001 | SPEC, PLAN y TASKS | DONE (2026-11-06) |
| CSF-002 | Herramientas | DONE (2026-11-06) |
| CSF-003 | E0 Humo | DONE (2026-11-06), E-1 |
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

### E-1. Humo `e0b` (2026-11-06)

FE `c337d9e`, SIFEN test real, 2 operadores, sin correo, cancelaciones en serie. Es una validacion de circuito: no mide capacidad.

- 7 facturas creadas y aprobadas (`0001096` a `0001102`), con su KuDE. 2 reintentos con la misma clave devolvieron el mismo documento. 478 llamadas, sin 5xx ni errores de conexion.
- 3 cancelaciones: 2 aceptadas y 1 rechazada por SIFEN con `0100 Error Inesperado`, marcada como reintentable. El documento sigue emitido y no se reintento (RN-05).
- 1 nota de credito creada (`0001009`), todavia en lote al cerrar: la corrida no espera su aprobacion.
- Cruces: 0 documentos ajenos, 0 trabados, 0 numeros repetidos, 0 CDC repetidos. Los 3 eventos de cancelacion firman su CDC segun la base de FE; no se consulto SIFEN directamente.
- Unos 20 min hasta el estado final. Los lotes de FE salieron cada 15 min: es una demora del ciclo, no de la carga.
- p95 de `POST /facturas` 231 ms, KuDE unos 3 s. VPS: minimo 2264 MiB disponibles, sin swap relevante, carga 1,28, `/var` 62 %.
- **Hallazgo:** FE guarda la nota de credito con `client_idempotency_key` vacio. El primer resumen lo conto como "documento ajeno"; se corrigio el control. Comunicado a FE, por el riesgo de duplicar notas de credito.
- Primer intento `e0-humo`: rechazado con 400 por un error del simulador (faltaba el precio del item). No emitio nada.
- Reintento unico de la cancelacion de `0001102`, a pedido de FE: otra vez `0100 Error Inesperado`, 2 intentos en total. El evento firma el CDC pedido y SIFEN no muestra la cancelacion. No se insiste (RN-05). Segun FE, ese codigo es no determinista: unas 9 de 61 cancelaciones en produccion.
- Por lectura de codigo, FS no reintenta notas de credito de forma automatica: el outbox es solo de facturas. Hasta el tag de FE, que agrega su clave, un reintento de NC podria duplicarla.
- Tercer intento sobre `0001102`, con mas de 2 horas de separacion: no se hizo. El usuario pidio dejarlo para despues y priorizar una version estable de FE y FS. La factura sigue sin cancelar en SIFEN test.

