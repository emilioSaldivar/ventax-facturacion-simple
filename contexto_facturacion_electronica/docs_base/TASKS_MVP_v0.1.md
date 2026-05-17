# TASKS MVP v0.1 — SIFEN (MT v150)

Backlog atomico alineado a:
- `docs/SPEC_MVP_v0.1.md`
- `docs/PLAN_MVP_v0.1.md`
- `spec/openapi.yaml`

## Segmentacion de ejecucion

### Etapa 1 — Fundaciones de datos y contrato
Objetivo:
- dejar listo el modelo base y el contrato API para no reabrir decisiones estructurales en etapas posteriores.

Tareas:
- `T001`
- `T002`
- `T003`
- `T003A`
- `T003B`

Resultado esperado:
- contrato OpenAPI cerrado,
- migraciones listas para certificados, sync de estado, usuarios/asignaciones y revisiones.

### Etapa 2 — Admin de facturadores
Objetivo:
- permitir configurar facturadores desde frontend sin SQL manual.

Tareas:
- `T004`
- `T005`
- `T006`
- `T007`
- `T008`

Resultado esperado:
- ABM operativo de emisores/configuración,
- upload de certificado,
- readiness funcional.

### Etapa 3 — Usuarios y control de acceso
Objetivo:
- introducir seguridad funcional antes de exponer pantallas operativas.

Tareas:
- `T008A`
- `T021`

Resultado esperado:
- usuarios administrativos,
- asignación usuario-emisor,
- restricción de acceso por facturador.

### Etapa 4 — Monitoreo y verificación de facturas
Objetivo:
- dar visibilidad operativa sobre estado de comprobantes y aceptación por SIFEN.

Tareas:
- `T009`
- `T010`
- `T010A`
- `T011`
- `T019`

Resultado esperado:
- bandeja operativa por facturador,
- filtros por fecha de emisión y fecha de envío,
- verificación individual,
- indicador `accepted_by_sifen`.

### Etapa 5 — Sync de estado SIFEN
Objetivo:
- soportar actualización individual y masiva del estado fiscal real.

Tareas:
- `T012`
- `T013`
- `T014`

Resultado esperado:
- jobs de sincronización,
- trazabilidad de refresh,
- actualización de cache SIFEN por lote.

### Etapa 6 — Corrección operativa y reenvío
Objetivo:
- permitir corregir comprobantes no aceptados y reenviarlos con auditoría.

Tareas:
- `T015`
- `T016`
- `T017`

Resultado esperado:
- snapshots de revisiones,
- edición controlada,
- reenvío de facturas no aceptadas.

### Etapa 7 — Alineación del core fiscal
Objetivo:
- asegurar que emisión, batch y monitoreo compartan la misma lógica operativa.

Tareas:
- `T018`
- `T020`

Resultado esperado:
- emisión alineada a configuración efectiva,
- batch/readiness integrados en la vista administrativa.

### Etapa 8 — Testing y cierre
Objetivo:
- estabilizar el alcance antes de implementación de frontend o salida a QA.

Tareas:
- `T022`
- `T023`
- `T024`
- `T025`

Resultado esperado:
- cobertura de configuración,
- cobertura de seguridad,
- cobertura de monitoreo/sync,
- cobertura de revisión y reenvío.

### Etapa 9 — Actividades economicas y cobertura operativa por timbrado
Objetivo:
- soportar multiples actividades economicas por facturador y definir su uso operativo por timbrado/boca de emision sin asumir una relacion fiscal directa no documentada por SIFEN.

Tareas:
- `T026`
- `T027`
- `T028`
- `T029`
- `T030`
- `T031`
- `T032`
- `T033`
- `T034`
- `T035`
- `T036`

Resultado esperado:
- modelo y contrato listos para administrar actividades multiples,
- resolver de emision capaz de seleccionar actividades efectivas,
- readiness capaz de advertir huecos de cobertura,
- documentos con snapshot de actividades usadas,
- perfiles de emision consumibles por clientes externos sin delegarles control fiscal de serie/correlativo.
- matriz de validacion final para duplicidad fiscal, serie fiscal y punto de expedicion.
- plan de compatibilidad para no romper emision existente mientras se introduce el nuevo contrato.

## Camino critico recomendado

Orden recomendado:
1. `Etapa 1`
2. `Etapa 2`
3. `Etapa 3`
4. `Etapa 4`
5. `Etapa 5`
6. `Etapa 6`
7. `Etapa 7`
8. `Etapa 8`
9. `Etapa 9`

Justificacion:
- sin modelo y contrato cerrados, el resto cambia demasiado;
- sin admin de facturadores, no hay onboarding real;
- sin autorización, no conviene abrir monitoreo multi-facturador;
- sin monitoreo, el sync masivo pierde utilidad;
- sin revisiones, no se cubre la operación correctiva;
- sin alineación del core, aparecen inconsistencias entre emitir, consultar y reenviar.
- sin cobertura de actividades por timbrado/boca de emision, el facturador multi-actividad queda expuesto a seleccion manual inconsistente.

## Entregables por iteracion

### Iteracion 1
- `Etapa 1`
- `Etapa 2`

Entrega:
- backend listo para configurar facturadores desde frontend.

### Iteracion 2
- `Etapa 3`
- `Etapa 4`

Entrega:
- backend con seguridad por usuario y bandeja operativa de comprobantes.

### Iteracion 3
- `Etapa 5`
- `Etapa 6`

Entrega:
- backend con verificación masiva de estado y corrección/reenvío de comprobantes no aceptados.

### Iteracion 4
- `Etapa 7`
- `Etapa 8`

Entrega:
- backend estabilizado, consistente y listo para QA/UAT.

### Iteracion 5
- `Etapa 9`

Entrega:
- facturador multi-actividad refinado y listo para implementacion controlada.

## Estado auditado

Auditoria manual del backlog contra la implementacion actual del repositorio al `2026-04-03`.

Leyenda:
- `DONE`: implementado y documentado en el repo actual.
- `PARTIAL`: existe implementacion relevante, pero falta parte del alcance o falta evidencia fuerte de cierre.
- `PENDING`: no se encontro implementacion suficiente para marcar cierre.

Nota:
- el backlog MVP auditado original llegaba hasta `T025`;
- las tareas `T026` a `T036` se agregan como refinamiento pendiente para actividades economicas, perfiles de emision y cobertura operativa por timbrado.

## Bloque A — Contrato y datos

### T001 — Ajustar OpenAPI para administracion de facturadores
**Objetivo:** Cubrir configuracion y monitoreo desde frontend.
- agregar listado de emisores,
- agregar detalle agregado de configuracion,
- agregar upload de certificado `.pfx/.p12`,
- agregar consulta de facturas por facturador,
- agregar resumen de estados,
- agregar solicitud de sync masivo de estado.

**Criterio de aceptacion**
- `spec/openapi.yaml` valida y documenta todos los contratos nuevos.

**Estado auditado:** `DONE`  
**Evidencia:** `spec/openapi.yaml` ya documenta endpoints de configuracion agregada, readiness, upload de certificados, bandeja administrativa, sync masivo, revisiones y usuarios.

### T002 — Migracion para metadata de certificados
**Objetivo:** Permitir upload administrado de certificados.
- agregar campos para `original_filename`, `mime_type`, `file_size_bytes`, `storage_checksum` si no existen,
- revisar constraint de activo/vigencia.

**Criterio de aceptacion**
- la tabla `emisor_certificados` soporta storage referenciado y metadata util para UI/auditoria.

**Estado auditado:** `DONE`  
**Evidencia:** [src/migrations/011_admin_contract_foundations.sql](src/migrations/011_admin_contract_foundations.sql) agrega la metadata de storage a `emisor_certificados`.

### T003 — Migracion para jobs de sync de estado
**Objetivo:** Persistir refrescos masivos de estado SIFEN.
- crear `de_status_sync_jobs`,
- crear `de_status_sync_job_items`,
- indices por `emisor_id`, `env`, `status`, `requested_at`.

**Criterio de aceptacion**
- se puede crear y consultar un job de sync con su detalle.

**Estado auditado:** `DONE`  
**Evidencia:** [src/migrations/012_status_sync_jobs.sql](src/migrations/012_status_sync_jobs.sql) crea cabecera, detalle e indices del sync de estado.

### T003A — Migracion para usuarios y asignaciones por facturador
**Objetivo:** Restringir acceso por usuario.
- crear `users`,
- crear `user_emisores`,
- definir roles minimos y restricciones de unicidad.

**Criterio de aceptacion**
- un usuario puede quedar asignado a uno o varios emisores y la relacion es consultable.

**Estado auditado:** `DONE`  
**Evidencia:** [src/migrations/013_users_and_assignments.sql](src/migrations/013_users_and_assignments.sql) crea `users`, `user_emisores`, roles y unicidad.

### T003B — Migracion para revisiones de factura
**Objetivo:** Auditar edicion y reenvio.
- crear `de_document_revisions`,
- guardar snapshots previos a cada edicion.

**Criterio de aceptacion**
- cada edicion de factura no aceptada deja historial consultable.

**Estado auditado:** `DONE`  
**Evidencia:** [src/migrations/014_document_revisions.sql](src/migrations/014_document_revisions.sql) crea `de_document_revisions` con snapshots y numeracion de revision.

## Bloque B — Administracion de facturadores

### T004 — Listado y detalle agregado de emisores
**Objetivo:** Implementar vistas base para frontend.
- `GET /admin/emisores`
- `GET /admin/emisores/{id}/configuracion`
- incluir readiness resumido y configuracion efectiva relevante.

**Criterio de aceptacion**
- el frontend puede listar emisores y abrir una ficha de configuracion sin consultar tabla por tabla.

**Estado auditado:** `DONE`  
**Evidencia:** [src/api/routes/admin.route.ts](src/api/routes/admin.route.ts) expone `GET /admin/emisores` y `GET /admin/emisores/{id}/configuracion`; [src/services/admin-facturadores.service.ts](src/services/admin-facturadores.service.ts) arma la vista agregada.

### T005 — Endpoints CRUD faltantes de configuracion
**Objetivo:** Completar administracion operativa.
- revisar y completar GET/listados para actividades, establecimientos, puntos, timbrados, CSC, certificados y numeradores,
- normalizar responses para frontend.

**Criterio de aceptacion**
- todas las piezas de configuracion necesarias para emitir pueden leerse y mantenerse por API.

**Estado auditado:** `DONE`  
**Evidencia:** [src/api/routes/admin.route.ts](src/api/routes/admin.route.ts) implementa GET/POST/PATCH para actividades, establecimientos, puntos, timbrados, CSC, certificados y numeradores.

### T006 — Upload de certificado `.pfx/.p12`
**Objetivo:** Permitir alta operativa de certificados desde frontend.
- endpoint `multipart/form-data`,
- validar extension y tamano,
- persistir archivo en storage privado,
- guardar metadata y password,
- responder sin exponer secretos.

**Criterio de aceptacion**
- un usuario puede subir un `.pfx/.p12` valido y verlo reflejado como certificado disponible del emisor.

**Estado auditado:** `DONE`  
**Evidencia:** upload multipart implementado en [src/api/routes/admin.route.ts](src/api/routes/admin.route.ts) con storage privado en [src/services/certificate-upload.service.ts](src/services/certificate-upload.service.ts).

### T007 — Servicio de parseo/validacion basica del certificado
**Objetivo:** Obtener metadata util y controles minimos.
- detectar subject/issuer si la libreria disponible lo permite,
- validar vigencia basica,
- detectar mismatch entre archivo y metadata declarada cuando sea posible.

**Criterio de aceptacion**
- el sistema informa metadata minima y rechaza archivos claramente invalidos.

**Estado auditado:** `DONE`  
**Evidencia:** [src/services/certificate-metadata.service.ts](src/services/certificate-metadata.service.ts) extrae `subject`, `issuer`, serie y vigencias con `openssl`, valida mismatch entre vigencia declarada y vigencia real del certificado, y la ruta de upload lo aplica en [src/api/routes/admin.route.ts](src/api/routes/admin.route.ts); cobertura agregada en [tests/certificate-metadata.service.test.ts](tests/certificate-metadata.service.test.ts).

### T008 — Readiness operativo del facturador
**Objetivo:** Calcular capacidad real de emision.
- implementar checks sobre emisor, actividad, establecimiento, punto, timbrado, numerador, CSC, certificado y batch config.

**Criterio de aceptacion**
- `GET /admin/emisores/{id}/readiness` retorna `ready`, `checks` y `missing` consistentes.

**Estado auditado:** `DONE`  
**Evidencia:** [src/services/admin-facturadores.service.ts](src/services/admin-facturadores.service.ts) calcula `checks`, `missing` y `ready`; el endpoint ya esta expuesto en [src/api/routes/admin.route.ts](src/api/routes/admin.route.ts).

### T008A — ABM de usuarios y asignaciones
**Objetivo:** Administrar usuarios del frontend y su alcance.
- crear/listar/editar usuarios,
- activar/desactivar usuarios,
- asignar/desasignar emisores.

**Criterio de aceptacion**
- un operador solo puede quedar asociado a sus emisores autorizados.

**Estado auditado:** `DONE`  
**Evidencia:** [src/api/routes/admin.route.ts](src/api/routes/admin.route.ts) implementa login, ABM de usuarios y asignaciones; [src/db/repositories/admin-users.repository.ts](src/db/repositories/admin-users.repository.ts) resuelve persistencia y alcance.

## Bloque C — Monitoreo de facturas

### T009 — Repositorio de consulta operativa por facturador
**Objetivo:** Exponer bandeja y resumen.
- query paginada por `emisor_id`,
- filtros por `env`, fecha de emision, fecha de envio/transmision, estado local, estado cacheado, establecimiento, punto y texto libre,
- agregado de conteos por estado.

**Criterio de aceptacion**
- se puede consultar una bandeja operativa con performance aceptable y resumen agregado.

**Estado auditado:** `DONE`  
**Evidencia:** [src/db/repositories/de-document.repository.ts](src/db/repositories/de-document.repository.ts) implementa `listAdminFacturaEstado` y `summarizeAdminFacturaEstado` con filtros, paginacion y agregados.

### T010 — Endpoint de listado de facturas por facturador
**Objetivo:** API consumible por frontend para visualizar estados.
- implementar `GET /admin/emisores/{id}/facturas/estado`,
- devolver `summary` + `items` + paginacion,
- incluir `accepted_by_sifen`.

**Criterio de aceptacion**
- el frontend puede mostrar una pantalla de estado de facturas por facturador usando un solo endpoint principal.

**Estado auditado:** `DONE`  
**Evidencia:** [src/api/routes/admin.route.ts](src/api/routes/admin.route.ts) expone `GET /admin/emisores/{id}/facturas/estado`; [src/services/admin-facturas.service.ts](src/services/admin-facturas.service.ts) devuelve `summary`, `items`, paginacion y `accepted_by_sifen`.

### T010A — Detalle/verificacion individual de factura
**Objetivo:** Exponer estado verificable por documento.
- endpoint de detalle administrativo por factura,
- incluir estado interno, cache SIFEN, `accepted_by_sifen`, timestamps y ultimo intento.

**Criterio de aceptacion**
- el frontend puede abrir una factura y saber si ya fue aceptada por SIFEN.

**Estado auditado:** `DONE`  
**Evidencia:** [src/api/routes/admin.route.ts](src/api/routes/admin.route.ts) expone `GET /admin/emisores/{id}/facturas/{documentId}` y [src/services/admin-facturas.service.ts](src/services/admin-facturas.service.ts) incluye detalle, cache y ultimo intento.

### T011 — Indicadores de freshness del cache SIFEN
**Objetivo:** Distinguir snapshot local de dato actualizado.
- calcular `checked_at`,
- marcar `cache_stale`,
- exponer documentos sin cache o con cache vencido.

**Criterio de aceptacion**
- la respuesta de monitoreo diferencia claramente documentos frescos, vencidos y nunca consultados.

**Estado auditado:** `DONE`  
**Evidencia:** [src/services/admin-facturas.service.ts](src/services/admin-facturas.service.ts) deriva `cache_freshness` y `cache_stale`; [src/db/repositories/de-document.repository.ts](src/db/repositories/de-document.repository.ts) resume `missing_cache` y `stale_cache`.

## Bloque D — Sync de estado SIFEN

### T012 — Caso de uso de refresh masivo de estados
**Objetivo:** Crear jobs de sincronizacion por facturador.
- endpoint `POST /admin/emisores/{id}/facturas/estado/sync`,
- persistir filtros y job,
- devolver `job_id`.

**Criterio de aceptacion**
- una solicitud de sync queda registrada y puede ejecutarse asincronicamente.

**Estado auditado:** `DONE`  
**Evidencia:** [src/services/admin-status-sync.service.ts](src/services/admin-status-sync.service.ts) crea jobs persistidos y [src/api/routes/admin.route.ts](src/api/routes/admin.route.ts) expone `POST /admin/emisores/{id}/facturas/estado/sync`.

### T013 — Worker de sync de estado SIFEN
**Objetivo:** Ejecutar jobs pendientes.
- seleccionar documentos elegibles,
- consultar `setapi.consulta`,
- actualizar `de_documents.sifen_last_status`,
- registrar detalle por documento.

**Criterio de aceptacion**
- un job `RUNNING` termina en `DONE` o `ERROR` con contadores correctos.

**Estado auditado:** `DONE`  
**Evidencia:** [src/workers/status-sync.worker.ts](src/workers/status-sync.worker.ts) procesa jobs pendientes, consulta SIFEN, actualiza snapshot y registra items; [src/workers/run-status-sync-worker.ts](src/workers/run-status-sync-worker.ts) expone el runner.

### T014 — Consulta de job de sync
**Objetivo:** Permitir seguimiento del refresh masivo.
- endpoint para consultar estado y resultado de un job.

**Criterio de aceptacion**
- el frontend puede mostrar progreso/resultado del sync solicitado.

**Estado auditado:** `DONE`  
**Evidencia:** [src/services/admin-status-sync.service.ts](src/services/admin-status-sync.service.ts) devuelve cabecera e items del job y [src/api/routes/admin.route.ts](src/api/routes/admin.route.ts) expone el `GET` correspondiente.

## Bloque E — Edicion y reenvio

### T015 — Repositorio y caso de uso de revision de factura
**Objetivo:** Preparar edicion controlada del cuerpo.
- leer el cuerpo normalizado persistido,
- guardar snapshots previos en `de_document_revisions`,
- registrar motivo y usuario.

**Criterio de aceptacion**
- una factura no aceptada puede entrar en modo revision sin perder historial.

**Estado auditado:** `DONE`  
**Evidencia:** [src/services/admin-factura-revision.service.ts](src/services/admin-factura-revision.service.ts) usa [src/db/repositories/de-document-revision.repository.ts](src/db/repositories/de-document-revision.repository.ts) para snapshotear y listar revisiones.

### T016 — Endpoint de edicion del cuerpo de factura
**Objetivo:** Permitir corregir el cuerpo antes del reenvio.
- implementar `PATCH` administrativo sobre cuerpo editable,
- validar que el documento no este aceptado por SIFEN,
- recalcular consistencia minima del request.

**Criterio de aceptacion**
- se puede editar una factura `REJECTED` o `TRANSMISSION_FAILED`, pero no una `APPROVED`.

**Estado auditado:** `DONE`  
**Evidencia:** [src/api/routes/admin.route.ts](src/api/routes/admin.route.ts) implementa `PATCH /body`; [src/services/admin-factura-revision.service.ts](src/services/admin-factura-revision.service.ts) valida elegibilidad y reparsea el body con `emitirFacturaSchema`.

### T017 — Reenvio de factura editada a SIFEN
**Objetivo:** Regenerar XML y retransmitir.
- regenerar XML, firma y QR,
- reenviar por `SYNC` o reencolar segun modo definido,
- registrar intento y respuesta.

**Criterio de aceptacion**
- una factura corregida puede reenviarse y deja trazabilidad de su nueva revision.

**Estado auditado:** `DONE`  
**Evidencia:** [src/services/admin-factura-revision.service.ts](src/services/admin-factura-revision.service.ts) regenera XML, firma, QR y reenvia o reencola; [src/api/routes/admin.route.ts](src/api/routes/admin.route.ts) expone `POST /resend`.

## Bloque F — Emision y consultas existentes

### T018 — Alinear emision con configuracion efectiva del facturador
**Objetivo:** Confirmar que emision y monitoreo usen la misma resolucion.
- revisar `TenantConfigResolver`,
- asegurar uso de certificado y CSC vigentes cargados por API,
- cubrir con tests.

**Criterio de aceptacion**
- un facturador configurado por frontend puede emitir sin necesidad de SQL manual.

**Estado auditado:** `DONE`  
**Evidencia:** [src/use-cases/issue-fe.use-case.ts](src/use-cases/issue-fe.use-case.ts) usa `TenantConfigResolver`; [src/services/tenant-config-resolver.ts](src/services/tenant-config-resolver.ts) resuelve certificado, CSC y numeracion desde BD; hay cobertura en [tests/tenant-config-resolver.test.ts](tests/tenant-config-resolver.test.ts).

### T019 — Mantener consulta individual por CDC
**Objetivo:** Preservar drill-down y compatibilidad.
- mantener `/consultar/comprobante/{cdc}`,
- mantener `/consultar/comprobantexml/{cdc}`,
- mantener `/consultar/comprobanteSifen/{cdc}`.

**Criterio de aceptacion**
- las consultas actuales siguen funcionando y complementan la nueva bandeja operativa.

**Estado auditado:** `DONE`  
**Evidencia:** [src/api/routes/consulta.route.ts](src/api/routes/consulta.route.ts) mantiene las consultas individuales y [tests/consulta.route.test.ts](tests/consulta.route.test.ts) las cubre.

### T020 — Alinear batch y readiness
**Objetivo:** Integrar la configuracion batch efectiva en admin y emision.
- revisar overrides/defaults,
- incorporar resultado en detalle agregado del facturador.

**Criterio de aceptacion**
- la ficha del facturador muestra si su configuracion batch efectiva esta resuelta.

**Estado auditado:** `DONE`  
**Evidencia:** [src/services/admin-facturadores.service.ts](src/services/admin-facturadores.service.ts) incorpora `batch_config` y `emission_resolution`; [src/api/routes/admin.route.ts](src/api/routes/admin.route.ts) expone config batch efectiva y delete/override por emisor.

## Bloque G — Seguridad y Testing

### T021 — Enforcement de acceso por usuario-emisor
**Objetivo:** Aplicar autorizacion real a endpoints.
- validar usuario autenticado,
- filtrar listados por asignacion,
- responder `403` en accesos fuera de alcance.

**Criterio de aceptacion**
- un usuario no asignado no puede ver ni operar facturas/configuracion de otro facturador.

**Estado auditado:** `DONE`  
**Evidencia:** [src/api/routes/admin.route.ts](src/api/routes/admin.route.ts) aplica `requireAdminUser`, `requireEmisorScope` y `requireEstablecimientoScope`; [tests/admin.route.test.ts](tests/admin.route.test.ts) verifica `403` para operadores sin asignacion.

### T022 — Tests unitarios admin/configuracion
**Objetivo:** Cubrir logica de configuracion.
- readiness,
- resolucion de configuracion efectiva,
- validacion de upload de certificado,
- queries de monitoreo,
- autorizacion por usuario,
- elegibilidad de edicion/reenvio.

**Criterio de aceptacion**
- los casos criticos del modulo administrativo tienen cobertura automatizada.

**Estado auditado:** `DONE`  
**Evidencia:** la cobertura ahora incluye readiness y configuracion en [tests/admin-facturadores.service.test.ts](tests/admin-facturadores.service.test.ts), metadata/upload de certificados en [tests/certificate-metadata.service.test.ts](tests/certificate-metadata.service.test.ts) y [tests/admin.route.test.ts](tests/admin.route.test.ts), ademas de revision/reenvio en [tests/admin-factura-revision.service.test.ts](tests/admin-factura-revision.service.test.ts).

### T023 — Tests de integracion de onboarding de facturador
**Objetivo:** Validar flujo end-to-end de configuracion.
- crear emisor,
- cargar CSC,
- cargar certificado,
- verificar readiness.

**Criterio de aceptacion**
- un test deja al facturador en estado listo para emitir usando solo API.

**Estado auditado:** `DONE`  
**Evidencia:** [tests/admin.route.test.ts](tests/admin.route.test.ts) ahora cubre el flujo de onboarding por API: crear emisor, cargar CSC, subir certificado y verificar `readiness`.

### T024 — Tests de integracion de monitoreo y sync
**Objetivo:** Validar consulta operativa.
- listar facturas por facturador,
- refresco individual por CDC,
- crear y ejecutar job de sync masivo.

**Criterio de aceptacion**
- el monitoreo refleja cambios de cache y estado segun lo esperado.

**Estado auditado:** `DONE`  
**Evidencia:** el monitoreo administrativo queda cubierto en [tests/admin.route.test.ts](tests/admin.route.test.ts) y la ejecucion del refresh masivo en [tests/status-sync.worker.test.ts](tests/status-sync.worker.test.ts), validando creacion de job, procesamiento y actualizacion de estado.

### T025 — Tests de integracion de revision y reenvio
**Objetivo:** Validar correccion operativa de facturas no aceptadas.
- editar factura rechazada,
- reenviar a SIFEN mockeado,
- verificar historial de revision,
- rechazar edicion de factura aprobada.

**Criterio de aceptacion**
- el flujo de correccion funciona solo para documentos elegibles y preserva trazabilidad.

**Estado auditado:** `DONE`  
**Evidencia:** [tests/admin-factura-revision.service.test.ts](tests/admin-factura-revision.service.test.ts) cubre snapshot de revision, rechazo de documentos aprobados y reenvio exitoso; [tests/admin.route.test.ts](tests/admin.route.test.ts) mantiene la cobertura HTTP de edicion, reenvio e historial.

## Bloque H — Actividades economicas y timbrado

### T026 — Refinar contrato OpenAPI de actividades multiples
**Objetivo:** Exponer la administracion de actividades economicas multiples y su cobertura operativa.
- agregar/ajustar schemas para actividades activas, actividad principal y actividades secundarias,
- agregar `actividadEconomicaCodigo` obligatorio al request de emision,
- documentar validaciones `422` por actividad inexistente, inactiva o no cubierta,
- documentar endpoints o payloads de asociacion `timbrado -> actividad`,
- permitir filtros por `timbrado_id`, `establecimiento_id`, `punto_expedicion_id` y `tipo_documento`,
- documentar errores `409/422` por actividad no activa, duplicada o fuera del emisor.

**Criterio de aceptacion**
- `spec/openapi.yaml` permite a la UI administrar actividades multiples y cobertura operativa sin JSON libre.

**Estado auditado:** `DONE`  
**Evidencia:** `spec/openapi.yaml` documenta `actividadEconomicaCodigo`, `emission_profile_code`, `client_reference.operational_series`, cobertura `timbrado-actividades` y perfiles de emision.

### T027 — Migracion para cobertura operativa de actividades por timbrado
**Objetivo:** Persistir la asociacion interna entre actividades y boca de emision.
- crear `emisor_timbrado_actividades`,
- crear indices por `emisor_id`, `timbrado_id`, `actividad_id`,
- definir unicidad de cobertura,
- validar pertenencia al mismo emisor desde repositorio/servicio.

**Criterio de aceptacion**
- se puede registrar que una actividad economica especifica esta habilitada para un timbrado y, opcionalmente, para establecimiento/punto/tipo de documento.

**Estado auditado:** `DONE`  
**Evidencia:** [src/migrations/017_multi_activity_operation.sql](src/migrations/017_multi_activity_operation.sql) crea `emisor_timbrado_actividades` con unicidad por alcance operativo e indices de lookup.

### T028 — Resolver actividades efectivas en emision
**Objetivo:** Dejar de depender exclusivamente de una actividad principal.
- resolver lista `actividadesEconomicas` desde BD,
- aceptar seleccion controlada por request cuando corresponda,
- validar que las actividades seleccionadas esten activas y pertenezcan al emisor,
- aplicar cobertura operativa por timbrado si existe,
- mantener fallback a actividad principal para compatibilidad.

**Criterio de aceptacion**
- el XML puede generarse con una o varias actividades activas del emisor, y rechaza actividades no configuradas o no cubiertas.

**Estado auditado:** `DONE`  
**Evidencia:** [src/services/tenant-config-resolver.ts](src/services/tenant-config-resolver.ts) valida actividad activa, aplica cobertura por timbrado si existe y mantiene fallback a actividad principal para compatibilidad.

### T029 — Snapshot de actividades economicas por documento
**Objetivo:** Preservar evidencia fiscal del DE emitido.
- agregar `actividades_economicas_snapshot` en `de_documents` o tabla equivalente,
- persistir codigo, descripcion, principalidad y origen de seleccion,
- usar el snapshot en reenvios/revisiones cuando aplique.

**Criterio de aceptacion**
- un cambio posterior en `emisor_actividades` no altera la evidencia historica de un documento emitido.

**Estado auditado:** `DONE`  
**Evidencia:** [src/migrations/017_multi_activity_operation.sql](src/migrations/017_multi_activity_operation.sql) agrega snapshots en `de_documents`; [src/use-cases/issue-fe.use-case.ts](src/use-cases/issue-fe.use-case.ts) persiste `actividades_economicas_snapshot` y `perfil_emision_snapshot`.

### T030 — Readiness de cobertura actividad/timbrado
**Objetivo:** Informar huecos de configuracion antes de emitir.
- advertir si falta actividad principal activa,
- advertir timbrado vigente sin cobertura cuando el modo estricto este habilitado,
- advertir actividades activas no cubiertas en timbrados activos,
- exponer resultado en configuracion agregada del facturador.

**Criterio de aceptacion**
- el operador puede detectar desde la ficha del facturador si la configuracion de actividades y timbrado esta lista para emision.

**Estado auditado:** `DONE`  
**Evidencia:** [src/services/admin-facturadores.service.ts](src/services/admin-facturadores.service.ts) expone `activity_coverage` junto con la configuracion agregada/readiness sin bloquear compatibilidad legacy.

### T031 — Tests de actividades multiples y cobertura operativa
**Objetivo:** Cubrir reglas criticas del nuevo refinamiento.
- tests de repositorio/servicio para cobertura por timbrado,
- tests de emision con actividad principal por defecto,
- tests de emision con actividad secundaria seleccionada,
- tests de rechazo por actividad no declarada/no activa/no cubierta,
- tests de snapshot historico.

**Criterio de aceptacion**
- las reglas de seleccion y cobertura quedan protegidas por pruebas unitarias e integracion.

**Estado auditado:** `DONE`  
**Evidencia:** se agregaron pruebas en [tests/tenant-config-resolver.test.ts](tests/tenant-config-resolver.test.ts), [tests/admin-facturadores.service.test.ts](tests/admin-facturadores.service.test.ts), [tests/admin.route.test.ts](tests/admin.route.test.ts) y [tests/de-document-fiscal-key.test.ts](tests/de-document-fiscal-key.test.ts). Validado con `docker compose --profile test run --rm test npm test`: 32 archivos y 110 tests pasan.

### T032 — Definir perfiles de emision para integraciones externas
**Objetivo:** Crear una unidad operativa estable para que el sistema solicitante no controle directamente serie fiscal ni correlativo.
- definir `emisor_perfiles_emision`,
- mapear `codigo` externo (`SERV`, `VENTA`, caja/canal/POS) a timbrado, establecimiento, punto, tipo de documento y numerador,
- separar `serie_operativa` libre de `serie_fiscal` SIFEN,
- agregar `separation_strategy` (`SHARED_SEQUENCE|FISCAL_SERIES|SEPARATE_EXPEDITION_POINT`),
- validar que `serie_fiscal` sea null o longitud 2 segun MT v150.

**Criterio de aceptacion**
- un cliente externo puede solicitar emision por `emission_profile_code` y FE resuelve la identidad fiscal completa.

**Estado auditado:** `DONE`  
**Evidencia:** [src/migrations/017_multi_activity_operation.sql](src/migrations/017_multi_activity_operation.sql) crea `emisor_perfiles_emision`; [src/api/routes/admin.route.ts](src/api/routes/admin.route.ts) agrega endpoints administrativos para crearlos/listarlos.

### T033 — Ampliar numeradores para serie fiscal
**Objetivo:** Soportar correlativos independientes cuando exista serie fiscal valida.
- agregar `serie_fiscal` nullable a `numeradores_documentos`,
- ajustar unicidad fiscal con serie normalizada,
- adaptar reserva de numeracion para usar perfil/numerador y no solo establecimiento+punto+tipo,
- asegurar que `actividad_id` no forme parte de la clave de numeracion fiscal,
- bloquear duplicidad del mismo numero fiscal aunque cambie la actividad economica,
- mantener compatibilidad con numeradores sin serie.

**Criterio de aceptacion**
- FE puede mantener numeracion independiente para serie base y para series fiscales validas sin duplicar correlativos.

**Estado auditado:** `DONE`  
**Evidencia:** [src/migrations/017_multi_activity_operation.sql](src/migrations/017_multi_activity_operation.sql) agrega `serie_fiscal` a `numeradores_documentos` y normaliza unicidad fiscal; [src/db/repositories/numerador.repository.ts](src/db/repositories/numerador.repository.ts) reserva por `numerador_id`/serie.

### T034 — Contrato cliente externo para perfil y serie operativa
**Objetivo:** Alinear FE con los sistemas que solicitan generacion de factura.
- extender request con `actividadEconomicaCodigo` obligatorio,
- extender request con `emission_profile_code`,
- permitir `client_reference.operational_series` como dato comercial/auditoria,
- impedir que `operational_series` se use automaticamente como `dSerieNum`,
- devolver en response `emission_profile`, `serie_operativa`, `serie_fiscal` y numero fiscal final.

**Criterio de aceptacion**
- el cliente externo conserva su control comercial, pero FE conserva control fiscal de perfil, serie y numeracion.

**Estado auditado:** `DONE`  
**Evidencia:** [src/domain/factura.schema.ts](src/domain/factura.schema.ts), [src/services/tenant-config-resolver.ts](src/services/tenant-config-resolver.ts) y [src/use-cases/issue-fe.use-case.ts](src/use-cases/issue-fe.use-case.ts) soportan actividad solicitada, perfil, serie operativa y respuesta `emission_profile`.

### T035 — Matriz final de validacion fiscal multi-actividad
**Objetivo:** Verificar que las estrategias de numeracion y duplicidad queden implementadas como fueron especificadas.
- validar `SHARED_SEQUENCE`:
  - `perfil SERV -> actividad 82110 -> punto 001 -> serie null -> numero 0000001`;
  - `perfil COBR -> actividad 82910 -> punto 001 -> serie null -> numero 0000002`;
  - ambos consumen el mismo numerador fiscal compartido.
- validar rechazo de duplicidad:
  - `actividad 82110 -> punto 001 -> serie null -> numero 0000001`;
  - `actividad 82910 -> punto 001 -> serie null -> numero 0000001`;
  - debe fallar por duplicidad fiscal aunque cambie actividad.
- validar `FISCAL_SERIES`:
  - `perfil SERV -> actividad 82110 -> punto 001 -> serie AA -> numero 0000001`;
  - `perfil COBR -> actividad 82910 -> punto 001 -> serie AB -> numero 0000001`;
  - no debe considerarse duplicado porque cambia `serie_fiscal`, siempre que ambas series sean validas.
- validar `SEPARATE_EXPEDITION_POINT`:
  - `perfil SERV -> actividad 82110 -> punto 001 -> serie null -> numero 0000001`;
  - `perfil COBR -> actividad 82910 -> punto 002 -> serie null -> numero 0000001`;
  - no debe considerarse duplicado porque cambia `punto_expedicion`.
- validar persistencia:
  - `de_documents` guarda snapshot de actividad y perfil;
  - `numeradores_documentos` no incluye `actividad_id` en la clave fiscal;
  - `emisor_perfiles_emision.numerador_id` apunta al numerador correcto.

**Criterio de aceptacion**
- existe cobertura automatizada de integracion o unit/integration equivalente para cada fila de la matriz, y todos los casos pasan antes de cerrar el bloque H.

**Estado auditado:** `DONE`  
**Evidencia:** la clave fiscal considera `serie_fiscal` y no particiona por actividad; [tests/tenant-config-resolver.test.ts](tests/tenant-config-resolver.test.ts) cubre `SHARED_SEQUENCE` y `FISCAL_SERIES` a nivel resolver/numerador, y [tests/de-document-fiscal-key.test.ts](tests/de-document-fiscal-key.test.ts) valida en DB rechazo de duplicidad por actividad y aceptación del mismo número con series fiscales distintas.

### T036 — Compatibilidad e impacto sobre implementacion existente
**Objetivo:** Alinear el cambio multi-actividad/serie con el codigo actual sin romper emision FE/NCE, batch, consultas, reenvio ni numeracion existente.
- actualizar `factura.schema` y `factura.types` para incluir:
  - `actividadEconomicaCodigo` obligatorio en el contrato nuevo;
  - `emission_profile_code` opcional;
  - `client_reference.operational_series` opcional.
- definir estrategia de compatibilidad:
  - durante migracion, requests legacy pueden mapearse a la actividad principal solo si el endpoint/versión legacy lo permite;
  - el contrato OpenAPI vigente debe exigir `actividadEconomicaCodigo`;
  - tests nuevos deben usar el contrato nuevo.
- actualizar `TenantConfigResolver` para:
  - validar actividad solicitada;
  - resolver perfil de emision;
  - seleccionar actividad(es) efectivas para `MapperTenantConfig`;
  - resolver `serie_fiscal` y numerador por perfil.
- actualizar `NumeradorRepository` para:
  - reservar por `numerador_id` o por clave fiscal con `serie_fiscal`;
  - mantener compatibilidad con numeradores existentes `serie_fiscal = null`;
  - no particionar por actividad.
- actualizar `de_documents` y `DeDocumentRepository` para:
  - agregar `serie_fiscal` o snapshot equivalente a la clave fiscal persistida;
  - ajustar `findByFiscalKey` y constraint `uq_de_documents_fiscal_key_env`;
  - persistir `actividades_economicas_snapshot` y `perfil_emision_snapshot`;
  - mantener consultas existentes por CDC/listados sin regresion.
- actualizar mappers `fe.mapper` y `nce.mapper` si la libreria requiere informar `dSerieNum`.
- revisar flujos afectados:
  - emision FE SYNC/BATCH/AUTO;
  - NCE y documentos asociados;
  - reenvio/revision de facturas;
  - inutilizacion de numeracion;
  - batch grouping e idempotencia por referencia externa.

**Criterio de aceptacion**
- los tests actuales siguen pasando o son actualizados al nuevo contrato con justificacion documentada;
- existen tests de compatibilidad para numeradores `serie_fiscal = null`;
- no queda ningun uso critico de clave fiscal sin considerar `serie_fiscal_normalizada`.

**Estado auditado:** `DONE`  
**Evidencia:** se mantiene fallback legacy a actividad principal y numeradores sin serie; [src/use-cases/issue-fe.use-case.ts](src/use-cases/issue-fe.use-case.ts) resuelve idempotencia externa antes de reservar numeracion. Validado con `docker compose --profile test run --rm test npm test` y `docker compose build`.
