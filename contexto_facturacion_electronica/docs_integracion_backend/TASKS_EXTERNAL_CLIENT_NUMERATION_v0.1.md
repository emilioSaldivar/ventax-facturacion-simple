# TASKS EXTERNAL CLIENT NUMERATION v0.1

Este archivo lista tareas atomicas para implementar:
- `docs/SPEC_EXTERNAL_CLIENT_NUMERATION_v0.1.md`
- `docs/PLAN_EXTERNAL_CLIENT_NUMERATION_v0.1.md`

---

## FECN001 - Extender contrato de factura para clientes externos
**Estado:** implementado
**Objetivo:** aceptar metadata de numeracion delegada y referencia externa.
- extender schema para `numbering`
- extender schema para `client_reference`
- mantener compatibilidad con payload actual

**Criterio de aceptacion**
- `POST /fcws/factura` acepta request enriquecido sin romper requests legacy.

---

## FECN002 - Desacoplar numeracion online del numero sugerido
**Estado:** implementado
**Objetivo:** que FE use siempre su propio numerador online.
- adaptar `TenantConfigResolver`
- distinguir numero sugerido vs numero oficial

**Criterio de aceptacion**
- el flujo online normal no rechaza por `NUMERATION_MISMATCH` cuando un cliente manda numero sugerido distinto.

---

## FECN003 - Persistir referencia externa y numero sugerido
**Estado:** implementado
**Objetivo:** conservar auditabilidad.
- guardar `requested_document_number`
- guardar `source_system`, `entity_type`, `entity_id`, `request_id`, `idempotency_key`
- decidir si va en columnas o en `json_input`

**Criterio de aceptacion**
- soporte puede auditar request de cliente y numero fiscal final asignado.

---

## FECN004 - Implementar idempotencia por referencia externa
**Estado:** implementado
**Objetivo:** evitar duplicados al reprocesar desde clientes externos.
- resolver lookup previo por referencia externa
- devolver mismo documento cuando corresponda

**Criterio de aceptacion**
- dos envios del mismo `request_id` no consumen nuevo numero fiscal.

---

## FECN005 - Enriquecer respuesta de emision
**Estado:** implementado
**Objetivo:** devolver identidad fiscal completa al cliente.
- incluir bloque `timbrado` final
- incluir `number_source`

**Criterio de aceptacion**
- el cliente puede persistir el numero oficial sin reconstruirlo desde otros campos.

---

## FECN006 - Logging estructurado de integracion externa
**Estado:** implementado
**Objetivo:** mejorar trazabilidad operativa.
- loggear referencia externa
- loggear numero sugerido
- loggear numero asignado
- loggear resultado idempotente

**Criterio de aceptacion**
- los logs del `api` permiten reconstruir la asignacion fiscal de un request externo.

---

## FECN007 - Tests de request enriquecido
**Estado:** implementado
**Objetivo:** cubrir contrato nuevo.
- test request legacy
- test request con `numbering.authority = SERVICE`
- test request con `client_reference`

**Criterio de aceptacion**
- el contrato nuevo queda cubierto por tests automatizados.

---

## FECN008 - Tests de numeracion autonoma
**Estado:** implementado
**Objetivo:** validar que FE usa su numerador online.
- caso con numero sugerido distinto al siguiente local
- caso con numero sugerido omitido

**Criterio de aceptacion**
- FE asigna el numero oficial esperado desde su numerador interno.

---

## FECN009 - Tests de idempotencia
**Estado:** implementado
**Objetivo:** validar retries desde clientes externos.
- mismo `request_id`
- misma `idempotency_key`
- no consumo doble de correlativo

**Criterio de aceptacion**
- retries devuelven mismo documento funcional.

---

## FECN010 - Alinear OpenAPI y Postman
**Estado:** implementado
**Objetivo:** reflejar el contrato neutral real.
- actualizar `spec/openapi.yaml`
- actualizar `postman/facturacion-electronica-mvp.postman_collection.json`

**Criterio de aceptacion**
- OpenAPI y Postman documentan request y response enriquecidos para integracion de clientes externos.
