# TASKS NCE + FE CREDITO v0.1

Este archivo lista tareas atomicas para implementar:
- `docs/SPEC_NCE_CREDITO_v0.1.md`
- `docs/PLAN_NCE_CREDITO_v0.1.md`

Orden de prioridad:
1. Nota de Credito Electronica
2. Factura a credito - Plazo
3. Factura a credito - Cuotas

---

## TNC001 — Definir tipos documentales extendidos
**Objetivo:** preparar el dominio para `FE` y `NCE`.
- Crear tipo comun de documento fiscal.
- Identificar codigo interno y su correspondencia MT v150.
- Revisar usos hardcodeados de `FE`.

**Criterio de aceptacion**
- El dominio ya no asume que todo documento emitido es `FE`.

---

## TNC002 — Schema de NCE
**Objetivo:** definir request validable para `POST /nota-credito`.
- Crear `nota-credito.schema.ts`.
- Modelar referencia discriminada:
  - `ELECTRONICO`
  - `IMPRESO`
- Exigir `motivo`.

**Criterio de aceptacion**
- Requests invalidos por referencia incompleta o ambigua fallan con `422`.

---

## TNC003 — Tipos TS de NCE
**Objetivo:** crear tipos reutilizables para mapper y use case.
- Crear `nota-credito.types.ts`.
- Definir estructura de referencia y salida normalizada.

**Criterio de aceptacion**
- Mapper y use case pueden trabajar sin `any`.

---

## TNC004 — Reglas de validacion de referencia NCE
**Objetivo:** aplicar reglas locales alineadas con MT v150.
- Si referencia es electronica:
  - `cdc` obligatorio
  - tipo asociado debe ser `FE`
- Si referencia es impresa:
  - tipo documento impreso debe ser `FACTURA`
  - exigir timbrado, establecimiento, punto y numero
- Rechazar mas de un documento asociado.

**Criterio de aceptacion**
- Las reglas se cubren con tests unitarios.

---

## TNC005 — Repositorio: busqueda de documento referenciado
**Objetivo:** resolver FE asociada por CDC o clave local.
- Extender `DeDocumentRepository`.
- Permitir consultar FE candidata para referencia de NCE.

**Criterio de aceptacion**
- Se puede obtener localmente la FE asociada para validaciones de moneda y monto.

---

## TNC006 — Repositorio: acumulado de NCE por FE
**Objetivo:** prevenir sobregiro documental.
- Agregar query para sumar NCE asociadas a una FE.
- Definir que estados computan para la suma.

**Criterio de aceptacion**
- El sistema puede rechazar una NCE cuyo acumulado excede el total de la FE.

---

## TNC007 — Migracion de persistencia para referencias
**Objetivo:** dejar trazabilidad consultable entre NCE y FE.
- Agregar `referenced_document_id` y/o `referenced_document_cdc`.
- Agregar indices de consulta.

**Criterio de aceptacion**
- Desde una NCE se puede identificar el documento origen.

---

## TNC008 — Mapper NCE a xmlgen
**Objetivo:** construir `params/data` para `C002=5`.
- Crear `src/services/nce.mapper.ts`.
- Poblar grupo NCE.
- Poblar documento asociado.
- Reutilizar parametros de emisor.

**Criterio de aceptacion**
- Genera estructura compatible con `xmlgen` para NCE.

---

## TNC009 — Servicio/use case de emision NCE
**Objetivo:** emitir NCE con el mismo pipeline de FE.
- Crear `IssueNCEUseCase`.
- Reutilizar `xmlgen`, `xmlsign`, `qrgen`, `setapi`.
- Soportar `SYNC`, `BATCH`, `AUTO`.

**Criterio de aceptacion**
- NCE puede emitirse y persistirse end-to-end.

---

## TNC010 — Ruta API para NCE
**Objetivo:** exponer `POST /fcws/nota-credito`.
- Crear ruta express.
- Manejar validaciones y errores con el mismo patron de FE.

**Criterio de aceptacion**
- Endpoint responde `200`, `202`, `409`, `422` segun el caso.

---

## TNC011 — Tests de NCE
**Objetivo:** cubrir lo critico antes de tocar FE credito.
- Unit:
  - schema
  - referencia
  - mapper
  - validacion de acumulado
- Integration:
  - ruta
  - use case con mocks

**Criterio de aceptacion**
- Existe cobertura minima para emision NCE y sus rechazos locales.

---

## TNC012 — Refactor de schema FE credito
**Objetivo:** separar `PLAZO` y `CUOTAS`.
- Actualizar `factura.schema.ts`.
- Introducir `condicionOperacion.credito`.
- Mantener compatibilidad transitoria si se decide.

**Criterio de aceptacion**
- Un request `CREDITO` ambiguo ya no pasa validacion.

---

## TNC013 — Refactor de tipos FE credito
**Objetivo:** reflejar explicitamente las dos modalidades.
- Actualizar `factura.types.ts`.
- Eliminar ambiguedad del modelo actual.

**Criterio de aceptacion**
- TypeScript obliga a informar los campos correctos para cada modalidad.

---

## TNC014 — Mapper FE credito a plazo
**Objetivo:** generar correctamente `E641=1`.
- Actualizar `fe.mapper.ts`.
- Exigir `plazo`.
- No informar cuotas.

**Criterio de aceptacion**
- XML data de FE credito plazo cumple con la regla del MT v150.

---

## TNC015 — Mapper FE credito a cuotas
**Objetivo:** generar correctamente `E641=2`.
- Actualizar `fe.mapper.ts`.
- Exigir `cantidadCuotas`.
- No informar `plazo`.

**Criterio de aceptacion**
- XML data de FE credito cuotas cumple con la regla del MT v150.

---

## TNC016 — Persistencia normalizada de credito FE
**Objetivo:** mejorar consultas y trazabilidad.
- Evaluar agregar:
  - `credito_modalidad`
  - `credito_plazo_dias`
  - `credito_cantidad_cuotas`

**Criterio de aceptacion**
- Puede distinguirse localmente FE contado, FE credito plazo y FE credito cuotas.

---

## TNC017 — Tests FE credito plazo
**Objetivo:** validar regresion de la modalidad plazo.
- Unit del schema
- Unit del mapper
- Integration del endpoint `/factura`

**Criterio de aceptacion**
- FE credito plazo emite correctamente sin romper contado.

---

## TNC018 — Tests FE credito cuotas
**Objetivo:** validar la modalidad cuotas.
- Unit del schema
- Unit del mapper
- Integration del endpoint `/factura`

**Criterio de aceptacion**
- FE credito cuotas emite correctamente y valida campos obligatorios.

---

## TNC019 — OpenAPI y documentacion
**Objetivo:** alinear contrato publico y docs centrales.
- Actualizar `spec/openapi.yaml`
- Enlazar con `docs/SPEC_MVP_v0.1.md`
- Enlazar con `docs/PLAN_MVP_v0.1.md`
- Enlazar con `docs/TASKS_MVP_v0.1.md`

**Criterio de aceptacion**
- La documentacion publica refleja `NCE`, `PLAZO` y `CUOTAS`.

---

## TNC020 — Verificacion operativa de conexion SIFEN
**Objetivo:** dejar claro el impacto de esta fase en la integracion real.
- Verificar que NCE usa el mismo certificado por emisor.
- Verificar que no requiere un canal distinto en `setapi`.
- Documentar la restriccion operativa de la ventana general de 72 horas.

**Criterio de aceptacion**
- La documentacion tecnica deja claro como encaja esta fase con la conexion actual a SIFEN.
