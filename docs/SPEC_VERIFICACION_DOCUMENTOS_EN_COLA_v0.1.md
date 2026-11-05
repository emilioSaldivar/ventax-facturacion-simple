# SPEC Verificación de documentos en cola v0.1

**Fecha:** 2026-11-05. **Origen:** hallazgo FS-13 de `real-e8`.

## Problema

Mientras FE tiene el documento sin enviar (`QUEUED_BATCH`), cada consulta del worker gasta un intento y agranda el backoff. Medido: 194 facturas con 3 intentos y su próxima consulta a 5 o 6 horas; a las 19:56 UTC, 37 aprobadas en FE seguían "Procesando" en la app. Un documento en cola no está fallando: todavía no empezó su ciclo.

## Reglas

- **RN-01.** Si el estado canónico de FE es `QUEUED_BATCH`, el único estado de cola del contrato publicado, el worker reprograma a 15 minutos, la frecuencia de los lotes, y deja `verificacion_attempts` en 0.
- **RN-02.** Al salir de la cola rige el backoff vigente (30 min, 1 h, 6 h, 12 h, 24 h), desde el primer intento.
- **RN-03.** El corte de 30 días se aplica igual.
- **RN-04.** Si la consulta canónica falla, rige el backoff vigente: no se sabe si sigue en cola.

## Criterios de aceptación

- **CA-01.** Con estado canónico `QUEUED_BATCH`, próxima consulta a 15 min y 0 intentos, por más consultas que lleve.
- **CA-02.** Con otro estado no terminal, backoff vigente.
- **CA-03.** Un documento de más de 30 días sale de la agenda aunque siga en cola.
- **CA-04.** Una factura que pasa de cola a aprobada se ve `EMITIDA` en la siguiente consulta.

## Fuera de alcance

- FS-07: documentos ya enviados y aprobados entre consultas (min 5, 35, 95). El backoff lo definió el usuario el 2026-07-31.
- Corregir el manejo del `409 DOCUMENT_QUEUED_BATCH`: se ignora igual que hoy y manda el estado canónico. FE lo documentará (FE-12).
