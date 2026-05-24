# SPEC Ajuste Contrato FE y Autogestion v0.1

## Objetivo

Alinear el SaaS `facturacion-simple-cliente` con el contrato actual de `facturacion-electronica` para evitar desfasajes operativos en emision, eventos y consultas, y definir capacidades de autogestion fiscal que agreguen valor al cliente final sin complejizar la experiencia.

## Alcance

Incluye:

- ajuste de contrato entre `apps/api` (FiscalGateway) y `docs/API_FACTURACION_ELECTRONICA/openapi.yaml`;
- ajuste de contrato HTTP propio del SaaS en `spec/openapi.yaml` cuando aplique;
- matriz de tareas criticas para mantener estable lo ya implementado;
- matriz de tareas incrementales para exponer consultas/eventos de autogestion prioritarios.

No incluye:

- mover responsabilidades fiscales de `facturacion-electronica` al SaaS;
- reescritura de flujos de emision ya estables sin evidencia de gap;
- UI administrativa compleja para operaciones de bajo uso.

## Estado Actual Verificado

Integraciones FE ya implementadas y en uso:

- emision factura: `POST /factura`;
- emision nota credito: `POST /nota-credito`;
- cancelacion: `POST /evento/cancelar`;
- refresh estado: `GET /consultar/comprobanteSifen/{cdc}`;
- artefactos: `GET /files/xml/{cdc}`, `GET /files/kude/{cdc}.pdf`.

Endpoints FE relevantes aun no integrados por el SaaS:

- `GET /consultar/evento/{cdc}`;
- `GET /consultar/{id}/batch-pendientes`;
- `GET /consultar/{id}/facturalista/{numero}`;
- `POST /evento/inutilizacionnumfactura`.

## Ajustes Criticos De Contrato

Se consideran criticos los ajustes que pueden causar errores operativos, estados ambiguos o perdida de trazabilidad en lo ya implementado.

1. Normalizar de forma explicita `delivery_mode` FE (`SYNC`, `BATCH`, `AUTO_FALLBACK_BATCH`) en el modelo SaaS.
2. Persistir/mostrar `idempotent` y metadatos minimos de respuesta FE cuando existan, para soporte de conflictos 409.
3. Revisar y documentar semantica de `emisor_id` (RUC completo FE) en contrato SaaS para evitar configuraciones incompatibles.
4. Asegurar que consultas de archivos/eventos/estado soporten `env` cuando la operacion requiera multi-ambiente.
5. Alinear mapping de estados/eventos FE->SaaS para evitar falsos `ANULADA` o `EMITIDA` en escenarios intermedios.

## Autogestion Priorizada

Se priorizan funciones que reduzcan tickets de soporte y permitan al operador resolver dudas comunes desde la app:

1. Ver historial de eventos de un documento (consulta por CDC).
2. Ver estado de cola/lote por facturador (pendientes batch).
3. Consultar listado fiscal FE para reconciliacion simple cuando existan diferencias operativas.
4. Exponer inutilizacion de rango solo para perfiles internos/backoffice y con guardas operativas.

## Criterios De Aceptacion

- Existe cadena SDD completa (`SPEC`, `PLAN`, `TASKS`) para la iniciativa.
- Las tareas diferencian claramente `ajuste critico` vs `autogestion incremental`.
- Toda tarea que altere contrato SaaS incluye actualizacion de `spec/openapi.yaml`.
- No se introducen cambios que invadan responsabilidades fiscales del backend FE.
- La priorizacion final mantiene UX simple para operador final (mobile-first).
