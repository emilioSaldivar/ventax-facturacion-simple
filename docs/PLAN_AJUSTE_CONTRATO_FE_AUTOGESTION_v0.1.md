# PLAN Ajuste Contrato FE y Autogestion v0.1

## Referencias

- `AGENTS.md`
- `docs/SPEC_AJUSTE_CONTRATO_FE_AUTOGESTION_v0.1.md`
- `docs/API_FACTURACION_ELECTRONICA/openapi.yaml`
- `spec/openapi.yaml`
- `apps/api/src/modules/fiscal-gateway/fiscal-gateway.client.ts`
- `docs/TASKS_IMPLEMENTACION_MVP_v0.1.md`

## Enfoque

Dividir el trabajo en dos tracks:

1. Track A: ajustes criticos de contrato para robustecer lo ya implementado.
2. Track B: nuevas capacidades de autogestion con alto impacto operativo y baja friccion UX.

## Track A - Ajustes Criticos

### A1. Mapeo de contrato FE actual vs FiscalGateway

- inventariar request/response reales usados por el SaaS en factura, NCE, cancelacion, refresh y artefactos;
- comparar con `docs/API_FACTURACION_ELECTRONICA/openapi.yaml`;
- marcar gaps de compatibilidad y riesgo operativo.

### A2. Alineacion de tipos y persistencia

- extender tipos SaaS para `delivery_mode` incluyendo `AUTO_FALLBACK_BATCH`;
- evaluar persistencia de bandera `idempotent` y trazabilidad minima de conflicto 409;
- reforzar parsing defensivo de respuestas FE en escenarios mixtos (`status`, `result_code`, `sifen_status`).

### A3. Alineacion de contrato SaaS

- actualizar `spec/openapi.yaml` donde el contrato externo impacte salida/semantica SaaS;
- explicitar semantica de `emisor_id` esperada por FE para configuracion operativa.

## Track B - Autogestion Incremental

### B1. Eventos por CDC

- agregar capacidad backend para consultar `GET /consultar/evento/{cdc}`;
- exponer endpoint SaaS de solo lectura en detalle de documento;
- UI: bloque simple de historial de eventos, sin payload tecnico crudo.

### B2. Cola/Lotes pendientes

- integrar `GET /consultar/{id}/batch-pendientes` con lectura por facturador activo;
- exponer resumen operacional: cantidad pendiente, ultimo lote, estado y codigos relevantes.

### B3. Reconciliacion fiscal

- evaluar endpoint operativo de conciliacion acotada con `GET /consultar/{id}/facturalista/{numero}`;
- uso inicial orientado a soporte interno y diagnostico de diferencias entre listado SaaS y FE.

### B4. Inutilizacion de rango (backoffice)

- no exponer en UI operativa principal;
- evaluar endpoint interno/backoffice protegido para `POST /evento/inutilizacionnumfactura`;
- incluir doble confirmacion y auditoria obligatoria.

## Orden De Ejecucion

1. Completar Track A (critico) antes de nuevas funciones.
2. Ejecutar B1 y B2 como primer paquete de autogestion cliente.
3. Dejar B3 y B4 como segundo paquete sujeto a validacion de uso real.

## Validacion

Por tarea implementada:

- API: `npm run test --workspace @facturacion-simple/api`, `npm run typecheck --workspace @facturacion-simple/api`, `npm run lint --workspace @facturacion-simple/api`;
- frontend (si aplica): `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion`;
- despliegue local integrado: `bash scripts/deploy.sh`;
- pruebas HTTP/flujo sobre contenedores desplegados;
- evidencia en `docs/TASKS_IMPLEMENTACION_MVP_v0.1.md` y en `docs/TASKS_AJUSTE_CONTRATO_FE_AUTOGESTION_v0.1.md`.
