# SPEC Recuperación de emisión trabada v0.1

**Fecha:** 2026-11-05. **Origen:** hallazgo FS-03, fallo F5 de `real-fallos`.

## Problema

El worker marca el trabajo `PROCESSING` antes de llamar a FE. Si la API muere durante esa llamada, nada lo retoma. Medido: FE recibió la factura y la tiene en cola, mientras la app quedó en `EMITIENDO`, sin `document_uuid` ni verificación agendada, diciendo "No necesitás hacer nada".

## Reglas

- **RN-01.** Un trabajo en `PROCESSING` con `locked_at` más viejo que 5 minutos se puede volver a reclamar.
- **RN-02.** 5 minutos supera con margen a `FE_API_TIMEOUT_MS` (20 s): un trabajo vivo no se reclama dos veces.
- **RN-03.** Se reenvía el mismo `fiscal_request_snapshot`, con la misma `idempotency_key`. FE devuelve el documento existente (guía de integración §9): no se duplica.
- **RN-04.** Se aplican el backoff y el corte de 24 h de `SPEC_CONTROL_REINTENTOS_EMISION_v0.1.md`, sin cambios.

## Criterios de aceptación

- **CA-01.** Un trabajo `PROCESSING` vencido se reclama; uno reciente, no.
- **CA-02.** Con la API muerta en plena emisión, la factura termina con `document_uuid`, sin que nadie haga nada, tras el vencimiento.
- **CA-03.** FE queda con un solo documento para esa clave. Se confirma en la repetición con FE real; en modo mock se verifica lo local.

## Fuera de alcance

El texto de la pantalla mientras está trabada: con esta corrección el estado se resuelve solo en minutos.
