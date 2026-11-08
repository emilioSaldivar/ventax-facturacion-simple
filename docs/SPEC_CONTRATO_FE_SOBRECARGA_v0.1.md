# SPEC Contrato FE: sobrecarga y correo en cola v0.1

**Fecha:** 2026-11-06 · **Rama:** `feat/identidad-segel`. Si `master` adopta esa version de FE, se aplica alli por separado.

## Objetivo

FS debe entender dos respuestas nuevas de FE, publicadas en `GUIA_INTEGRACION_CONSUMIDORES.md` §32, sin mostrar un error falso al operador.

## Reglas

- **RN-01.** `POST /v1/factura` con HTTP 503 y `error: EMISSION_OVERLOADED` no es un fallo: la factura no se creo y no se consumio numero. Se reintenta con la misma clave. Se distingue por `error`, no por el 503.
- **RN-02.** El outbox espera lo que indica `Retry-After` (segundos enteros), o `details.retry_after_seconds`, o 5 s; acotado entre 1 y 300 s. El documento sigue `EMITIENDO` y no se notifica al operador. El corte por antiguedad existente no cambia.
- **RN-03.** `email_status: PENDING` se conserva como tal y se muestra "En cola". No indica nada sobre la aprobacion de SIFEN.
- **RN-04.** Mientras el correo este en `PENDING`, FS consulta `email_status` en `GET /v1/documentos/{uuid}` cuando se abre el documento. `SENT`, `FAILED` y `NOT_APPLICABLE` son finales, y un estado final no retrocede. Si FE no responde o no informa el campo, sigue "En cola", sin error. No hay sondeo de fondo: el estado solo se muestra al abrir el documento.
- **RN-05.** **Reemplazada (2026-11-08) por `SPEC_NOTA_CREDITO_TRABADA_v0.1`, RN-01: la clave la deriva el servidor.** Texto original: reenviar una nota de credito reutiliza la misma clave mientras la app siga abierta, porque tras un corte de red no se sabe si FE la creo. El `409` de FE con `idempotent: true` es la nota existente; otro `409`, como `CREDIT_NOTE_TOTAL_EXCEEDED`, es un error. Sin el tag de FE, la clave no protege en FE, y el reenvio tras un timeout debe revisarse a mano.

## Pendientes

- **P-1.** Resuelto por FE (2026-11-06): agrega `email_status` a `GET /v1/documentos/{uuid}`. Llega con el tag y se prueba contra el.

## Criterios de aceptacion

- **CA-01.** El gateway convierte ese 503 en `EMISSION_OVERLOADED`, y otro 503 sigue siendo `UPSTREAM_ERROR`.
- **CA-02.** El outbox reprograma con ese tiempo y el documento sigue `EMITIENDO`.
- **CA-03.** `PENDING` se guarda en la base y aparece en la API y la app.
