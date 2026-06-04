# TASKS — Contrato Canónico Fiscal v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_CONTRATO_CANONICO_FISCAL_v0.1.md`
- `docs/PLAN_CONTRATO_CANONICO_FISCAL_v0.1.md`
- `docs/API_FACTURACION_ELECTRONICA/facturacion-electronica-consumer-docs/OPERACION_CONTRATO_CANONICO_v0.1.md`
- `docs/API_FACTURACION_ELECTRONICA/facturacion-electronica-consumer-docs/GUIA_MIGRACION_CONTRATO_CANONICO_v0.1.md`
- `docs/API_FACTURACION_ELECTRONICA/facturacion-electronica-consumer-docs/openapi.yaml`
- `spec/openapi.yaml`

---

## Reglas De Validacion Aplicables

- Toda tarea backend cierra con `npm run typecheck`, `npm run test` y `npm run lint` del workspace `@facturacion-simple/api`.
- Toda tarea que afecte el sistema desplegado valida sobre contenedores levantados con `bash scripts/deploy.sh`, no contra proceso local de desarrollo.
- Toda tarea con cambio de contrato HTTP propio actualiza `spec/openapi.yaml`.
- La evidencia de validacion se registra en la seccion Evidencia de este documento al cerrar cada tarea.
- Si una validacion falla y no puede corregirse de inmediato: documentar bloqueo, impacto y decision temporal antes de continuar.

---

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
|---|---|---|---|---|
| CCF-001 | Backfill | Crear script `scripts/backfill_document_uuid.sql` | PENDIENTE | El script existe, es idempotente (`WHERE document_uuid IS NULL`), incluye la query de cobertura al final y tiene instrucciones para cargar el CSV. No ejecuta aun. |
| CCF-002 | Backfill | Ejecutar backfill en staging antes del deploy | PENDIENTE | La query de cobertura arroja `sin_uuid_con_cdc = 0` en la DB de staging. Evidencia con resultado de la query queda registrada en este documento. |
| CCF-003 | Schema | Crear migration `db/migrations/0015_document_uuid.sql` | PENDIENTE | La migration agrega `document_uuid TEXT` nullable a `facturas_operativas` y crea el indice `facturas_operativas_document_uuid_idx`. `npm run test` pasa incluyendo tests de migrations. No existe dato perdido ni restriccion no nullable que bloquee el `ALTER`. |
| CCF-004 | Tipos gateway | Actualizar tipos en `fiscal-gateway.types.ts` | PENDIENTE | (1) `FiscalEmitFacturaResponse` tiene `document_uuid: string \| null`. (2) `FiscalRefreshStatusRequest` tiene `documentUuid: string` reemplazando `cdc`. (3) `FiscalRefreshStatusResponse` tiene `current_cdc: string \| null`. (4) `FiscalByCdcResponse` definido con los campos: `document_uuid`, `requested_cdc`, `current_cdc`, `is_current`, `lineage_status` (`ACTIVE\|SUPERSEDED\|INCONSISTENT`), `sifen_resolution` (`APPROVED\|APPROVED_WITH_OBS\|REJECTED_OR_MISSING\|PENDING_CHECK`). (5) `FiscalFacturalistaItem` tiene `document_uuid: string \| null` y `current_cdc: string \| null`. (6) `FiscalGateway` interface tiene firmas actualizadas: `getXml(documentUuid)`, `getKudePdf(documentUuid)`, `getDocumentoEventos(documentUuid)`, `refreshFacturaStatus({documentUuid})` y nuevo `resolveDocumentoByCdc(cdc)`. `npm run typecheck` ejecuta — errores esperados en call sites de Fase 2-4 son aceptables en esta tarea. |
| CCF-005 | Tipos operativos | Actualizar tipos en `facturas.types.ts` | PENDIENTE | (1) `DocumentoResponse` tiene `document_uuid: string \| null`. (2) `FacturaRepository` interface tiene `bulkUpdateDocumentUuidByCdc(items: Array<{cdc:string, documentUuid:string}>): Promise<void>`. (3) `updateFiscalStatus` acepta `cdc?: string \| null` opcional en su input. `npm run typecheck` pasa o reporta solo errores de implementacion pendiente en Fases 3-4. |
| CCF-006 | Tipos entrega | Actualizar tipos en `entrega.types.ts` | PENDIENTE | `PublicDocumentRecord.documento` tiene `document_uuid: string \| null`. `PublicDocumentResponse` no cambia (el UUID no se expone al frontend). `npm run typecheck` del workspace pasa o reporta solo errores de implementacion pendiente en Fase 3-4. |
| CCF-007 | Gateway | Actualizar `mapFiscalEmitResponse` y `mapFiscalNotaCreditoResponse` para extraer `document_uuid` | PENDIENTE | Ambos mappers leen `stringOrNull(data.document_uuid)` y lo incluyen en la respuesta. Test unitario: dado un body con `document_uuid: "abc-123"` el mapper devuelve `result.document_uuid === "abc-123"`. Dado un body sin ese campo, `result.document_uuid === null`. `npm run typecheck` del modulo fiscal-gateway pasa. |
| CCF-008 | Gateway | Migrar `getXml`, `getKudePdf` y `getDocumentoEventos` a endpoints canonicos | PENDIENTE | `getXml(documentUuid)` construye `GET /documentos/{uuid}/files/xml?env=...` (no `/files/xml/{cdc}`). `getKudePdf(documentUuid)` construye `GET /documentos/{uuid}/files/kude.pdf?env=...` (no `/files/kude/{cdc}.pdf`). `getDocumentoEventos(documentUuid)` construye `GET /documentos/{uuid}/eventos?env=...` (no `/consultar/evento/{cdc}`). Tests unitarios verifican que la URL construida contiene `/documentos/` y el UUID como segmento de ruta, no el CDC. |
| CCF-009 | Gateway | Migrar `refreshFacturaStatus` al endpoint canonico y mapear `current_cdc` | PENDIENTE | `refreshFacturaStatus({documentUuid})` construye `GET /documentos/{uuid}/sifen?refresh=true&env=...` (no `/consultar/comprobanteSifen/{cdc}`). La respuesta mapea `current_cdc: stringOrNull(data.current_cdc)`. Test: body con `current_cdc: "01050..."` devuelve `result.current_cdc === "01050..."`. Body sin `current_cdc` devuelve `result.current_cdc === null`. |
| CCF-010 | Gateway | Implementar `resolveDocumentoByCdc(cdc)` en `RealFiscalGateway` | PENDIENTE | Construye `GET /documentos/by-cdc/{cdc}?env=...`. Mapea los campos de `ByCdcResponse` segun el schema del OpenAPI: `document_uuid`, `requested_cdc`, `current_cdc`, `is_current` (boolean), `lineage_status`, `sifen_resolution`, `resolution_note`. Test CDC vigente: `is_current: true`, `lineage_status: "ACTIVE"`. Test CDC historico: `is_current: false`, `lineage_status: "SUPERSEDED"`, `current_cdc` diferente de `requested_cdc`. Error 404 del backend lanza `FiscalGatewayError("UPSTREAM_ERROR")`. |
| CCF-011 | Gateway | Actualizar `mapFiscalFacturalistaResponse` para incluir `document_uuid` y `current_cdc` | PENDIENTE | El mapper lee `stringOrNull(row.document_uuid)` y `stringOrNull(row.current_cdc)` de cada item. Si el backend no los devuelve, los campos son `null` sin error. Test: item con `document_uuid` y `current_cdc` → campos presentes. Item sin ellos → campos `null`. |
| CCF-012 | Gateway | Actualizar `MockFiscalGateway` para paridad con la interfaz actualizada | PENDIENTE | `emitFactura` devuelve `document_uuid` mock: UUID v4 determinístico derivado del hash del `external_ref` (formato `xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx`). `emitNotaCredito` idem. `getXml(documentUuid)` acepta UUID y devuelve XML mock. `getKudePdf(documentUuid)` idem. `getDocumentoEventos(documentUuid)` devuelve `events: []`. `refreshFacturaStatus({documentUuid})` devuelve `{estado:"EMITIDA", current_cdc:null, raw:{...}}`. `resolveDocumentoByCdc(cdc)` devuelve respuesta mock con `is_current:true`, `lineage_status:"ACTIVE"`. `npm run typecheck` pasa sin errores en el modulo. |
| CCF-013 | Gateway | Tests de gateway para los cambios de Fase 2 | PENDIENTE | `npm run test --workspace @facturacion-simple/api -- fiscal-gateway` verde. Cobertura minima: (a) `mapFiscalEmitResponse` con y sin `document_uuid`. (b) `mapFiscalRefreshStatusCanonicoResponse` con y sin `current_cdc`. (c) `resolveDocumentoByCdc` con CDC vigente, CDC historico y error 404. (d) mock cumple la interfaz completa — `npm run typecheck` confirma. |
| CCF-014 | Repositorio | Actualizar `facturas.repository.ts` para leer/escribir `document_uuid` | PENDIENTE | (1) `FacturaRow` tiene `document_uuid: string \| null`. (2) `findById`, `findByIdempotencyKey`, `findNotaCreditoByOriginal` y `list` seleccionan la columna `document_uuid`. (3) `createFromEmission` inserta `document_uuid` desde `input.fiscalResponse?.document_uuid ?? null`. (4) `createNotaCreditoFromFactura` idem. (5) `completePendingEmission` usa `SET document_uuid = COALESCE(document_uuid, $N)` para no sobreescribir UUID ya valido. (6) `updateFiscalStatus` usa `SET cdc = COALESCE($N, cdc)` — actualiza cdc solo cuando se pasa valor. (7) `bulkUpdateDocumentUuidByCdc` implementado: hace `UPDATE ... FROM (VALUES ...) WHERE fo.cdc = v.cdc AND fo.document_uuid IS NULL`. (8) `mapFacturaRow` devuelve `document_uuid`. Smoke local: emitir factura en modo mock, consultar `SELECT document_uuid FROM facturas_operativas WHERE id = '{id}'` — resultado no nulo. `npm run test` verde. |
| CCF-015 | Repositorio | Actualizar `entrega.repository.ts` para leer `document_uuid` | PENDIENTE | (1) `PublicDocumentRow` tiene `document_uuid: string \| null`. (2) `findPublicByToken` SELECT incluye `fo.document_uuid`. (3) `mapPublicRow` asigna `documento.document_uuid = row.document_uuid`. El dato viaja a `getPublicArtifact` sin cambios adicionales. `npm run typecheck` pasa. |
| CCF-016 | Servicio | Migrar `refreshDocumentoStatus` a identidad canonica + actualizacion de CDC (RN-03) | PENDIENTE | Guard: `if (!documento.document_uuid)` lanza `HttpError(409, "CONFLICT", "Documento sin identidad fiscal canonica. Requiere sincronizacion.")`. Llamada al gateway: `gateway.refreshFacturaStatus({ documentUuid: documento.document_uuid })`. Logica RN-03: si `refreshed.current_cdc` no es null y difiere de `documento.cdc`, se pasa `cdc: refreshed.current_cdc` a `updateFiscalStatus`; si son iguales o `current_cdc` es null, se omite el campo (COALESCE no altera el valor). Test unitario: (a) documento sin `document_uuid` → error 409. (b) refresh devuelve `current_cdc` diferente → `updateFiscalStatus` recibe `cdc` nuevo. (c) refresh devuelve `current_cdc` igual → `updateFiscalStatus` no recibe `cdc`. `npm run test` verde. |
| CCF-017 | Servicio | Migrar `getDocumentoEventos` a identidad canonica | PENDIENTE | Guard: `if (!documento.document_uuid)` lanza `HttpError(409, "CONFLICT", "Documento sin identidad fiscal canonica. Requiere sincronizacion.")`. Llamada al gateway: `gateway.getDocumentoEventos(documento.document_uuid)`. Test unitario: documento sin `document_uuid` → error 409. `npm run test` verde. |
| CCF-018 | Servicio | Actualizar `getReconciliacionFiscal` para actualizacion oportunista de `document_uuid` (RN-05) | PENDIENTE | Firma agrega `repository: FacturaRepository` como cuarto parametro. Call site en routes actualizado para pasar `facturasRepository`. Despues de obtener la respuesta del gateway, filtra items con `document_uuid` y `cdc` no nulos, llama `repository.bulkUpdateDocumentUuidByCdc(...)`. La llamada esta envuelta en `.catch(() => {})` — fallo en el update no bloquea la respuesta. El resultado visible del endpoint para el operador no cambia. Test: mock de repository captura llamada a `bulkUpdateDocumentUuidByCdc` con los UUID presentes en la respuesta. `npm run test` verde. |
| CCF-019 | Servicio | Migrar `getPublicArtifact` a identidad canonica sin fallback (RN-07) | PENDIENTE | Guard: `if (!record || !record.documento.document_uuid)` lanza `HttpError(404, "NOT_FOUND", "Artefacto publico no disponible.")`. Llamada al gateway: `gateway.getKudePdf(record.documento.document_uuid)` y `gateway.getXml(record.documento.document_uuid)`. Log de error actualiza el campo identificador a `document_uuid`. Test unitario: (a) `findPublicByToken` devuelve `null` → error 404. (b) `findPublicByToken` devuelve documento con `document_uuid: null` → error 404. (c) `findPublicByToken` devuelve documento con `document_uuid: "abc"` → gateway se llama con `"abc"`. `npm run test` verde incluyendo `entrega.service.test.ts`. |
| CCF-020 | QA tecnico | Validacion tecnica completa de la rama | PENDIENTE | `npm run typecheck --workspace @facturacion-simple/api` → 0 errores. `npm run test --workspace @facturacion-simple/api` → todos verdes. `npm run lint --workspace @facturacion-simple/api` → 0 errores relevantes. `npm run build` → 0 errores. |
| CCF-021 | QA contenedores | Deploy y smoke sobre contenedores (`bash scripts/deploy.sh`) | PENDIENTE | `bash scripts/deploy.sh` completa sin errores. `curl http://127.0.0.1:{PORT}/healthz` → `200`. `curl http://127.0.0.1:{PORT}/api/v1/health` → `{"status":"ok","db":true}`. Smoke emision: emitir factura → consultar `SELECT document_uuid FROM facturas_operativas WHERE id='{id}'` → valor no nulo. Smoke artefactos: `GET /public/d/{token}/kude.pdf` → `200`, `content-type: application/pdf`, body no vacio. `GET /public/d/{token}/xml` → `200`, `content-type: application/xml`, body no vacio. Smoke refresh: `PATCH /facturas/{id}/refresh-status` → `200`, sin error 502/504. |
| CCF-022 | QA visual | Playwright: flujo emision + link publico en mobile y tablet | PENDIENTE | Escenario 1 — mobile 390px: emitir factura desde UI → navegar al documento emitido → abrir link publico compartido → verificar que la pagina del comprobante carga y que los botones de descarga PDF y XML estan visibles y habilitados. Escenario 2 — tablet 768px: mismo flujo. Ambos escenarios pasan sin error Playwright. Evidencia: nombre del test, viewport y resultado `passed` quedan registrados en este documento. |
| CCF-023 | Backfill prod | Ejecutar backfill en produccion antes del deploy a produccion | PENDIENTE | La query de cobertura arroja `sin_uuid_con_cdc = 0` en la DB de produccion. Evidencia con resultado de la query queda registrada en este documento. |

---

## Dependencias Entre Tareas

```
CCF-001                              (script backfill — sin dependencia de codigo)
CCF-002 depende de CCF-001           (ejecutar backfill en staging)
CCF-003                              (migration schema — independiente del codigo)
CCF-004                              (tipos gateway — base de todo lo siguiente)
CCF-005 depende de CCF-004           (tipos operativos referencian tipos gateway)
CCF-006 depende de CCF-004           (tipos entrega independientes pero requieren Fase 1 lista)
CCF-007 depende de CCF-004           (mapper usa tipo actualizado)
CCF-008 depende de CCF-004           (firma usa documentUuid)
CCF-009 depende de CCF-004           (firma y respuesta actualizadas)
CCF-010 depende de CCF-004           (nuevo metodo y tipo)
CCF-011 depende de CCF-004           (item de lista actualizado)
CCF-012 depende de CCF-004           (mock implementa interfaz completa)
CCF-013 depende de CCF-007 a CCF-012 (tests validan toda la Fase 2)
CCF-014 depende de CCF-003, CCF-005  (repo necesita columna y tipos)
CCF-015 depende de CCF-006           (repo entrega necesita tipo actualizado)
CCF-016 depende de CCF-009, CCF-014  (servicio usa gateway y repo actualizados)
CCF-017 depende de CCF-008, CCF-014  (servicio usa gateway y repo actualizados)
CCF-018 depende de CCF-011, CCF-014  (servicio usa facturalista y bulk update)
CCF-019 depende de CCF-008, CCF-015  (servicio entrega usa gateway y repo actualizados)
CCF-020 depende de CCF-016 a CCF-019 (validacion tecnica final de toda la cadena)
CCF-021 depende de CCF-002, CCF-020  (backfill staging hecho + codigo validado)
CCF-022 depende de CCF-021           (Playwright sobre contenedores desplegados)
CCF-023 depende de CCF-022           (backfill produccion — ultimo paso antes de deploy a prod)
```

---

## Contratos Fiscales De Referencia Para Validacion

Los siguientes contratos del backend fiscal son la fuente de verdad para validar que los endpoints canonicos del SaaS los consumen correctamente:

**`POST /factura` — respuesta incluye `document_uuid`:**
```json
{
  "document_id": "59",
  "document_uuid": "9f5c0b3f-6a6a-4d4b-9a31-2a9d0b0c4a11",
  "cdc": "01050570161001001000000312026060212337391944",
  "nro_factura": "0000003",
  "status": "APPROVED"
}
```

**`GET /documentos/{uuid}/sifen` — respuesta incluye `current_cdc`:**
El endpoint devuelve la misma estructura que `/consultar/comprobanteSifen/{cdc}` enriquecida. El SaaS extrae `current_cdc` de `data.current_cdc` en la respuesta.

**`GET /documentos/{uuid}/files/kude.pdf` y `/files/xml`:**
Respuesta binaria directa. `content-type: application/pdf` y `application/xml` respectivamente. Equivalentes legados: `/files/kude/{cdc}.pdf` y `/files/xml/{cdc}`.

**`GET /documentos/by-cdc/{cdc}` — CDC vigente:**
```json
{
  "document_uuid": "9f5c0b3f-...",
  "requested_cdc": "01050570...",
  "current_cdc": "01050570...",
  "is_current": true,
  "lineage_status": "ACTIVE",
  "sifen_resolution": "APPROVED"
}
```

**`GET /documentos/by-cdc/{cdc}` — CDC historico reemplazado:**
```json
{
  "document_uuid": "9f5c0b3f-...",
  "requested_cdc": "CDC_VIEJO",
  "current_cdc": "CDC_NUEVO",
  "is_current": false,
  "lineage_status": "SUPERSEDED",
  "sifen_resolution": "REJECTED_OR_MISSING"
}
```

**`GET /consultar/{id}/facturalista/{offset}` — items ahora incluyen:**
```json
{
  "document_id": "59",
  "document_uuid": "9f5c0b3f-...",
  "cdc": "01050570...",
  "current_cdc": "01050570...",
  "nro_factura": "0000003",
  "status": "APPROVED"
}
```

---

## Evidencia

- 2026-06-04: CCF-001 cerrado — creado `scripts/backfill_document_uuid.sql` con script idempotente, query de cobertura y comentarios de uso.
- 2026-06-04: CCF-003 cerrado — creada `db/migrations/0015_document_uuid.sql`: columna `document_uuid TEXT` nullable en `facturas_operativas` + índice `facturas_operativas_document_uuid_idx`.
- 2026-06-04: CCF-004 cerrado — `fiscal-gateway.types.ts`: `FiscalEmitFacturaResponse.document_uuid`, `FiscalRefreshStatusRequest.documentUuid`, `FiscalRefreshStatusResponse.current_cdc`, nuevos tipos `FiscalByCdcResponse` / `FiscalLineageStatus` / `FiscalSifenResolution`, `FiscalFacturalistaItem.document_uuid` + `current_cdc`, `FiscalGateway` interface con `resolveDocumentoByCdc` y firmas canónicas en `getXml`/`getKudePdf`/`getDocumentoEventos`/`refreshFacturaStatus`.
- 2026-06-04: CCF-005 cerrado — `facturas.types.ts`: `DocumentoResponse.document_uuid`, `FacturaRepository.bulkUpdateDocumentUuidByCdc`, `updateFiscalStatus` con `cdc?` opcional, `DocumentoEventosListResponse.cdc` cambiado a `string | null`.
- 2026-06-04: CCF-006 cerrado — `entrega.types.ts`: `PublicDocumentRecord.documento.document_uuid` agregado.
- 2026-06-04: CCF-007 a CCF-013 cerrados — `fiscal-gateway.client.ts`: `mapFiscalEmitResponse` y `mapFiscalNotaCreditoResponse` extraen `document_uuid`; `RealFiscalGateway` migra `getXml`/`getKudePdf` a `/documentos/{uuid}/files/...`, `getDocumentoEventos` a `/documentos/{uuid}/eventos`, `refreshFacturaStatus` a `/documentos/{uuid}/sifen` con extracción de `current_cdc`; nuevo `resolveDocumentoByCdc` → `/documentos/by-cdc/{cdc}`; `mapFiscalFacturalistaResponse` incluye `document_uuid` y `current_cdc`; `MockFiscalGateway` actualizado con `document_uuid` determinístico (UUID derivado de hash) y nuevos métodos canónicos; helpers `mapLineageStatus`/`mapSifenResolution` agregados.
- 2026-06-04: CCF-014 cerrado — `facturas.repository.ts`: `FacturaRow.document_uuid`, todos los `SELECT` actualizados, `createFromEmission` y `createNotaCreditoFromFactura` persisten `document_uuid`, `completePendingEmission` usa `COALESCE(document_uuid, $N)`, `updateFiscalStatus` usa `COALESCE($N, cdc)` para actualización condicional de CDC (RN-03), nuevo método `bulkUpdateDocumentUuidByCdc` con `VALUES JOIN`, `mapFacturaRow` expone `document_uuid`.
- 2026-06-04: CCF-015 cerrado — `entrega.repository.ts`: `PublicDocumentRow.document_uuid`, `findPublicByToken` SELECT incluye `fo.document_uuid`, `mapPublicRow` mapea el campo.
- 2026-06-04: CCF-016 cerrado — `facturas.service.ts refreshDocumentoStatus`: guard migrado a `!documento.document_uuid`, argumento al gateway cambiado a `{ documentUuid }`, lógica RN-03 actualiza `cdc` cuando `refreshed.current_cdc` difiere del almacenado.
- 2026-06-04: CCF-017 cerrado — `facturas.service.ts getDocumentoEventos`: guard migrado a `!documento.document_uuid`, argumento al gateway cambiado a `documento.document_uuid`.
- 2026-06-04: CCF-018 cerrado — `facturas.service.ts getReconciliacionFiscal`: agregado `repository: FacturaRepository` como cuarto parámetro, actualización oportunista via `bulkUpdateDocumentUuidByCdc` con `.catch(() => {})`, call site en `facturas.routes.ts` actualizado.
- 2026-06-04: CCF-019 cerrado — `entrega.service.ts getPublicArtifact`: guard unificado sobre `document_uuid`, llamadas al gateway usan `document_uuid`, log de error actualizado.
- 2026-06-04: CCF-020 cerrado — validación técnica: `npm run typecheck` 0 errores, `npm run test` 118/118 verde, `npm run lint` limpio, `npm run build` limpio. Tests de gateway, facturas y entrega actualizados para reflejar el nuevo contrato canónico. Falla pre-existente `created_at` hardcodeado en fixtures de facturas corregida con `Date.now() - 1h`.
- 2026-06-04: CCF-021 y CCF-022 — PENDIENTE validación sobre contenedores (deploy) y Playwright. Requieren `bash scripts/deploy.sh` con los cambios deployados.
- 2026-06-04: CCF-002 y CCF-023 — PENDIENTE ejecución de backfill en staging y producción respectivamente. Requieren CSV exportado del backend fiscal.
