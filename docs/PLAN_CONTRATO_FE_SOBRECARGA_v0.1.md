# PLAN Contrato FE: sobrecarga y correo en cola v0.1

## Alineacion

- `docs/SPEC_CONTRATO_FE_SOBRECARGA_v0.1.md`

## Cambios

- `fiscal-gateway.types.ts` y `fiscal-gateway.client.ts`: codigo `EMISSION_OVERLOADED`, tiempo de espera en `details`, y `PENDING` en `mapEmailStatus`.
- `facturas.service.ts`: rama propia en `processNextQueuedFiscalEmission`. La emision sincronica conserva `ERROR_TEMPORAL`: no tiene outbox que reintente, y el operador puede repetirla.
- `facturas.types.ts`, `entrega.service.ts` y `main.tsx`: tipo, mensaje y etiqueta de `PENDING`.
- `db/migrations/0036_email_estado_pending.sql`: amplia la restriccion de `email_estado`.
- `spec/openapi.yaml`: enum `EmailStatus`.
- `infra/segel-fs/fe.env.example`: banderas de FE-15, FE-16 y FE-17. La version `c337d9e` las ignora.
