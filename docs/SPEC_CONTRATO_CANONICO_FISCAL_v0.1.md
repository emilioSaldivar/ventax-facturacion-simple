# SPEC — Contrato Canónico Fiscal v0.1

## Objetivo

Adaptar `facturacion-simple-cliente` al contrato canónico del backend fiscal `facturacion-electronica`, que introduce `document_uuid` como identidad estable e inmutable del documento fiscal, reemplazando al `CDC` como clave de consulta para artefactos, eventos y estado SIFEN.

El resultado debe garantizar que:

1. El link de descarga compartido con el cliente final (PDF/XML) funcione de forma robusta ante reconciliaciones de CDC en el backend fiscal.
2. Todo documento fiscal emitido quede inmediatamente con su `document_uuid` persistido en el SaaS.
3. Los documentos históricos reciban su `document_uuid` antes del deploy mediante backfill manual SQL.

---

## Contexto

### Por qué existe este SPEC

El backend fiscal genera un `CDC` (Código de Control) al emitir cada documento. Ese CDC puede cambiar:

- Soporte corrige el documento y regenera el XML → SIFEN asigna un nuevo CDC.
- El CDC anterior queda obsoleto en el sistema fiscal.
- Los endpoints legacy (`/files/xml/{cdc}`, `/files/kude/{cdc}.pdf`, etc.) retornan `404` para CDCs obsoletos.

El SaaS actualmente guarda solo el `cdc` y lo usa como clave para todos los endpoints de artefactos, eventos y estado. Si el backend fiscal reconcilia un documento, el link compartido con el cliente final deja de funcionar.

El nuevo contrato del backend fiscal separa:

- **`document_uuid`** — identidad inmutable del documento, generada en la primera emisión. Nunca cambia.
- **`cdc`** — representación fiscal vigente, puede cambiar ante reconciliaciones.

El backend fiscal expone endpoints canónicos bajo `/documentos/{uuid}/...` que resuelven siempre por `document_uuid` y devuelven el estado del CDC vigente en cada momento.

### Regla fiscal operativa

Una vez que SIFEN aprueba un documento, el CDC de aprobación es definitivo y no permutará. El estado del documento converge a `APPROVED` con el CDC que SIFEN aceptó. Los documentos en tránsito (BATCH, PENDING_SIFEN) pueden tener un CDC que cambie durante el proceso de conciliación; una vez aprobados, el CDC es el definitivo.

---

## Alcance

### Incluye

- Persistencia de `document_uuid` en `facturas_operativas` desde la respuesta de emisión.
- Migración de los flujos de descarga de artefactos (PDF/XML) del endpoint legacy CDC al endpoint canónico UUID.
- Migración del flujo de refresh de estado SIFEN al endpoint canónico UUID.
- Migración del flujo de consulta de eventos fiscales al endpoint canónico UUID.
- Actualización de `cdc` cuando el refresh canónico detecta un `current_cdc` diferente al almacenado.
- Actualización oportunista de `document_uuid` en `getReconciliacionFiscal` para registros que aún no lo tienen.
- Backfill manual de `document_uuid` en registros históricos (menos de 100 documentos), ejecutado con SQL antes del deploy.
- Nuevos tipos y métodos en el `FiscalGateway` para los endpoints canónicos.

### Fuera de alcance

- Exposición de `document_uuid` en la UI del operador o en el frontend (el frontend sigue viendo `cdc`).
- Renombramiento de la columna `cdc` en base de datos.
- Historial de linaje CDC en el SaaS (pertenece al backend fiscal).
- Automatización del backfill o proceso de migración continua.
- Cambios en el flujo de cancelación fiscal (sigue requiriendo `cdc` en el body del evento).
- Cambios en el flujo de gestión avanzada (decision, retry-same-cdc, etc.), que ya usan `fiscal_document_id` numérico.

---

## Reglas de Negocio

### RN-01 — `document_uuid` como identidad primaria del documento en el SaaS

El SaaS debe persistir `document_uuid` en cada `facturas_operativas` que tenga correspondencia con un documento del backend fiscal. Este UUID es la referencia que el SaaS usa internamente para resolver artefactos fiscales; no es visible para el operador ni para el cliente final.

### RN-02 — El link de descarga del cliente final depende de `document_uuid`

El link público compartido con el cliente final (KUDE/PDF y XML) debe resolver artefactos usando `document_uuid`. Un `document_uuid` nulo en un documento con CDC implica que el link de descarga es potencialmente frágil ante reconciliaciones. Ningún documento debe quedar con CDC pero sin `document_uuid` después del deploy.

### RN-03 — `cdc` se actualiza cuando el refresh detecta divergencia

Cuando `refreshDocumentoStatus` consulta el estado canónico y la respuesta incluye un `current_cdc` diferente al `cdc` almacenado en `facturas_operativas`, el SaaS actualiza `facturas_operativas.cdc` con el valor nuevo. Esto mantiene el campo `cdc` siempre sincronizado con el CDC vigente en el backend fiscal.

Esta actualización aplica mientras el documento esté en tránsito (PENDING_SIFEN, BATCH). Una vez que el documento llega a estado `EMITIDA` (aprobado en SIFEN), el CDC queda fijo por regla fiscal y no debería cambiar nuevamente.

### RN-04 — `document_uuid` se persiste durante la emisión, no en consulta posterior

El `document_uuid` llega en la respuesta del backend fiscal a `POST /factura` y `POST /nota-credito`. El SaaS lo persiste en ese mismo momento, en la misma transacción de base de datos. No se diferencia un paso posterior de "resolución".

Para el flujo BATCH (outbox), el backend fiscal también devuelve `document_uuid` al procesar la cola; el SaaS lo persiste cuando procesa la respuesta del outbox.

### RN-05 — `getReconciliacionFiscal` actualiza `document_uuid` oportunistamente

El endpoint `/consultar/{id}/facturalista/{offset}` del backend fiscal ahora incluye `document_uuid` y `current_cdc` por ítem. Cuando el SaaS llama este endpoint para `getReconciliacionFiscal`, actualiza `facturas_operativas.document_uuid` para los registros que aún no lo tienen, si el ítem de la lista incluye un `document_uuid`. Esta actualización es silenciosa y no altera el resultado visible del endpoint.

El propósito es minimizar el tiempo que un registro queda sin `document_uuid` disponible para el link de descarga del cliente final.

### RN-06 — Backfill antes del deploy

Todos los documentos históricos deben recibir su `document_uuid` mediante backfill SQL manual antes del deploy a cada ambiente (staging y producción). El script toma como insumo un CSV exportado del backend fiscal con el mapeo `cdc → document_uuid`. Después del backfill, ningún registro con `cdc` debe quedar con `document_uuid` nulo.

### RN-07 — Comportamiento ante documento sin `document_uuid` post-backfill

Después de ejecutar el backfill, todo documento con `cdc` tendrá `document_uuid`. Si por alguna razón un registro quedara sin él (anomalía o falla del backfill), el sistema devuelve un error claro al operador en los flujos de refresh y eventos: `"Documento sin identidad fiscal canónica. Requiere sincronización."`. No hay fallback silencioso al endpoint legacy.

### RN-08 — Cancelación sigue con `cdc`

El flujo de cancelación fiscal (`POST /evento/cancelar`) requiere `cdc` en el body del evento. Este flujo no cambia. El guard de elegibilidad para cancelar (`documento.cdc is not null`) se mantiene con `cdc`.

---

## Comportamiento del Sistema por Flujo

### Flujo 1 — Emisión de factura (`SYNC` o `BATCH` con outbox)

**Antes:** El SaaS persiste `fiscal_document_id` (document_id numérico) y `cdc`. El `document_uuid` del backend no se captura.

**Después:** El SaaS persiste `fiscal_document_id`, `cdc` y `document_uuid` en la misma transacción de inserción. El `document_uuid` proviene directamente de la respuesta de `POST /factura`. El operador no ve cambio en pantalla.

**Flujo BATCH (outbox):** El worker que procesa la cola obtiene la respuesta de `POST /factura` y la persiste con `document_uuid`. Si el backend devuelve un `document_uuid`, se almacena. Si no lo devuelve (caso de error), el campo queda nulo.

### Flujo 2 — Emisión de nota de crédito

Igual que Flujo 1. El `document_uuid` se extrae de la respuesta de `POST /nota-credito` y se persiste en la inserción de la nota de crédito. La referencia `factura_referencia.cdc` que el SaaS envía al backend sigue siendo el `cdc` de la factura original (el backend lo requiere para el XML de la NCE).

### Flujo 3 — Descarga pública de artefactos (link cliente final)

**Antes:** `getPublicArtifact` llama `gateway.getKudePdf(cdc)` o `gateway.getXml(cdc)` con el CDC almacenado. Si el CDC fue reconciliado, retorna `404`.

**Después:**
- Si el documento tiene `document_uuid`: `gateway.getKudePdf(document_uuid)` → `GET /documentos/{uuid}/files/kude.pdf`
- Si el documento no tiene `document_uuid` (no debe ocurrir después del backfill): error `404` claro.

El `document_uuid` viaja por la cadena: `facturas_operativas.document_uuid` → `findPublicByToken` → `PublicDocumentRecord` → `getPublicArtifact`.

### Flujo 4 — Refresh de estado SIFEN

**Antes:** `refreshDocumentoStatus` llama `gateway.refreshFacturaStatus({ cdc })` → `GET /consultar/comprobanteSifen/{cdc}`. Si el CDC fue reconciliado, retorna `404`.

**Después:**
- Guard: si `documento.document_uuid` es nulo → error `409`: `"Documento sin identidad fiscal canónica. Requiere sincronización."`.
- Llamada: `gateway.refreshFacturaStatus({ documentUuid })` → `GET /documentos/{uuid}/sifen`.
- Si la respuesta incluye `current_cdc` diferente al `facturas_operativas.cdc` almacenado → actualizar `cdc` junto al `estado`.
- El operador no ve cambio en el flujo visible; el refresh sigue funcionando igual, pero resuelve correctamente ante CDCs reconciliados.

### Flujo 5 — Consulta de eventos fiscales

**Antes:** `getDocumentoEventos` llama `gateway.getDocumentoEventos(cdc)` → `GET /consultar/evento/{cdc}`. Si el CDC fue reconciliado, retorna `404`.

**Después:**
- Guard: si `documento.document_uuid` es nulo → error `409`: `"Documento sin identidad fiscal canónica. Requiere sincronización."`.
- Llamada: `gateway.getDocumentoEventos(documentUuid)` → `GET /documentos/{uuid}/eventos`.
- Este flujo es solo para roles de soporte interno. El comportamiento visible no cambia.

### Flujo 6 — Reconciliación fiscal (soporte interno)

**Antes:** `getReconciliacionFiscal` devuelve los ítems del facturalista fiscal. No actualiza nada en el SaaS.

**Después:**
- El backend ahora incluye `document_uuid` y `current_cdc` por ítem.
- El SaaS cruza los ítems con `facturas_operativas` por `cdc`.
- Para los que encuentre con `document_uuid` nulo, realiza `UPDATE facturas_operativas SET document_uuid = ... WHERE cdc = ... AND document_uuid IS NULL`.
- El resultado visible del endpoint para soporte no cambia.

### Flujo 7 — Cancelación fiscal

Sin cambio. El SaaS verifica `documento.cdc is not null`, llama `gateway.cancelFactura({ cdc })` y el backend fiscal sigue recibiendo `cdc` en el body de `/evento/cancelar`.

### Flujo 8 — Backfill de históricos (operación de deploy)

1. El equipo exporta el CSV del backend fiscal: `SELECT cdc, document_uuid FROM de_documents WHERE cdc IS NOT NULL AND document_uuid IS NOT NULL`.
2. Se ejecuta el script `scripts/backfill_document_uuid.sql` en la DB del SaaS:
   - Crea tabla temporal con el mapeo.
   - Actualiza `facturas_operativas.document_uuid` donde `cdc` coincide y `document_uuid IS NULL`.
   - Ejecuta la consulta de verificación de cobertura.
3. Se verifica que `sin_uuid_con_cdc = 0` antes de aprobar el deploy.
4. Se repite el proceso en producción antes del deploy a producción.

---

## Invariantes

- La columna `cdc` en `facturas_operativas` no se renombra ni se elimina.
- El frontend no recibe ni muestra `document_uuid`.
- La autenticación, tenants, permisos y contexto operativo no cambian.
- Los endpoints de gestión avanzada (`decision`, `validate-cdc-impact`, `retry-same-cdc`, `create-derived`, `cancel-send`, `void-number`) no cambian; ya usan `fiscal_document_id` numérico.
- El contrato HTTP del SaaS con el frontend es aditivo: se agregan campos a las respuestas existentes, no se rompe ni elimina ningún campo.
- Los endpoints legacy del backend fiscal siguen activos durante la transición; el SaaS simplemente deja de usarlos para los flujos cubiertos en este SPEC.

---

## Criterios de Aceptación

1. Todo documento emitido (factura o nota de crédito) tiene `document_uuid` persistido en `facturas_operativas` al finalizar la transacción de inserción.
2. El link público de descarga de KUDE/PDF y XML funciona para documentos emitidos después del deploy.
3. El link público de descarga funciona para documentos históricos después del backfill.
4. `refreshDocumentoStatus` llama `GET /documentos/{uuid}/sifen` y no el endpoint legacy CDC.
5. `getDocumentoEventos` llama `GET /documentos/{uuid}/eventos` y no el endpoint legacy CDC.
6. Si el refresh detecta `current_cdc` diferente al almacenado, `facturas_operativas.cdc` se actualiza.
7. `getReconciliacionFiscal` actualiza `document_uuid` para los registros que no lo tienen.
8. La consulta de cobertura post-backfill arroja `sin_uuid_con_cdc = 0` en staging antes del deploy.
9. La consulta de cobertura post-backfill arroja `sin_uuid_con_cdc = 0` en producción antes del deploy.
10. `npm run typecheck` pasa sin errores en toda la cadena de cambios.
11. `npm run test` pasa con los módulos `fiscal-gateway`, `facturas` y `entrega`.
12. `npm run build` limpio.
13. Validación visual Playwright: flujo completo de emisión + descarga de link público en mobile y desktop.

---

## Archivos Clave Involucrados

| Archivo | Área |
|---|---|
| `db/migrations/0015_document_uuid.sql` | Schema — nueva columna |
| `scripts/backfill_document_uuid.sql` | Backfill manual |
| `apps/api/src/modules/fiscal-gateway/fiscal-gateway.types.ts` | Tipos del gateway |
| `apps/api/src/modules/fiscal-gateway/fiscal-gateway.client.ts` | Implementación real y mock |
| `apps/api/src/modules/facturas/facturas.types.ts` | Tipos operativos |
| `apps/api/src/modules/facturas/facturas.repository.ts` | Persistencia y lectura |
| `apps/api/src/modules/facturas/facturas.service.ts` | Lógica de flujos |
| `apps/api/src/modules/entrega/entrega.types.ts` | Tipos de entrega pública |
| `apps/api/src/modules/entrega/entrega.repository.ts` | Query pública |
| `apps/api/src/modules/entrega/entrega.service.ts` | Resolución de artefactos |

---

## Referencias

- `docs/API_FACTURACION_ELECTRONICA/facturacion-electronica-consumer-docs/OPERACION_CONTRATO_CANONICO_v0.1.md`
- `docs/API_FACTURACION_ELECTRONICA/facturacion-electronica-consumer-docs/GUIA_MIGRACION_CONTRATO_CANONICO_v0.1.md`
- `docs/API_FACTURACION_ELECTRONICA/facturacion-electronica-consumer-docs/openapi.yaml`
- `AGENTS.md`
