# PLAN MVP v0.1 — SIFEN (MT v150)

Este documento describe el diseno tecnico para implementar el MVP definido en `docs/SPEC_MVP_v0.1.md` y el contrato en `spec/openapi.yaml`.

## 1) Arquitectura general

### 1.1 Componentes
- API HTTP (Express).
- PostgreSQL para configuracion fiscal, documentos, eventos, lotes y cache de estado.
- Storage privado para certificados cargados por API.
- Scheduler/worker BATCH.
- Worker o job runner para refresh masivo de estado SIFEN.

### 1.2 Modulos funcionales
- `Admin Facturadores`
  - ABM y listado de emisores.
  - Configuracion fiscal/operativa por emisor.
  - Upload y rotacion de certificados.
  - Readiness operativo.
- `Seguridad y Acceso`
  - usuarios administrativos,
  - asignacion de emisores por usuario,
  - autorizacion por alcance.
- `Emision`
  - Pipeline `xmlgen -> xmlsign -> qrgen -> setapi`.
- `Monitoreo`
  - Consulta de facturas por facturador.
  - Resumen por estados.
  - Cache y refresh de estado SIFEN.
  - Verificacion de aceptacion por factura.
  - Reenvio y revisiones de documentos no aceptados.
- `Eventos`
  - Cancelacion e inutilizacion.
- `BATCH`
  - Despacho y polling de lotes.

## 2) Decisiones de diseno clave

### 2.1 Facturador como agregado operativo
El frontend no administrara tablas aisladas sino un agregado `facturador` compuesto por:
- emisor,
- actividad principal y actividades secundarias activas,
- establecimientos/puntos,
- timbrado vigente y su cobertura operativa,
- CSC vigente por ambiente,
- certificado vigente,
- numeradores,
- configuracion batch efectiva.

La API puede persistir sobre tablas separadas, pero debe exponer vistas agregadas para configuracion y readiness.

### 2.1B Actividades economicas vs timbrado
La relacion fiscal primaria es:
- `emisor -> actividades economicas declaradas en RUC`;
- `emisor -> timbrado -> establecimiento/punto/tipo_documento/numeracion`.

No se modelara una dependencia fiscal directa `actividad -> timbrado` como verdad SIFEN. La asociacion entre actividades y timbrado se tratara como una regla operativa configurable para evitar que una boca de emision use una actividad no prevista por el negocio.

Modelo propuesto:
- mantener `emisor_actividades` como catalogo activo por emisor;
- mantener `emisor_timbrados` como autorizacion del emisor, opcionalmente restringida por establecimiento;
- agregar una tabla puente `emisor_timbrado_actividades` para cubrir la asociacion operativa cuando el emisor necesite limitar actividades por timbrado/establecimiento/punto/tipo de DE;
- agregar `emisor_perfiles_emision` como unidad operativa consumible por clientes externos y por el frontend administrativo;
- permitir modo permisivo por defecto: si no hay filas puente para un timbrado, se consideran habilitadas todas las actividades activas del emisor;
- permitir modo estricto futuro por emisor o por timbrado: si el modo estricto esta activo, debe existir cobertura explicita antes de emitir.

La resolucion de emision debe devolver una lista `actividadesEconomicas` y no solo `actividadPrincipal`. Para compatibilidad, si el request no selecciona actividad, se usara la actividad principal. Si selecciona una actividad secundaria, el resolver debe validar que este activa y cubierta por la configuracion operativa aplicable.

### 2.1C Perfiles de emision, serie operativa y serie fiscal
Decision:
- FE debe ser la fuente de verdad de la identidad fiscal: timbrado, establecimiento, punto, tipo de documento, serie fiscal y numero fiscal.
- El sistema externo debe enviar `actividadEconomicaCodigo` obligatorio y, opcionalmente, `emission_profile_code`; no debe enviar como autoridad el correlativo fiscal final salvo modo administrativo `CLIENT`.
- El sistema externo puede mantener su serie comercial interna (`SERV`, `VENTA`, caja, canal, POS, etc.), pero esa serie no se envia como `dSerieNum` salvo que FE la haya mapeado a una serie fiscal valida.

Modelo:
- `emisor_perfiles_emision.codigo`: identificador estable para integraciones, por ejemplo `SERV`, `VENTA`, `POS_C1`.
- `serie_operativa`: etiqueta interna/comercial libre, visible para UI e integraciones.
- `serie_fiscal`: valor SIFEN `C010 dSerieNum`, nullable, longitud 2, solo letras mayusculas permitidas por MT v150.
- `numerador_id`: numerador fiscal que FE consume para ese perfil.
- `actividad_id` o cobertura de actividades: actividades economicas permitidas para ese perfil.
- `separation_strategy`: politica operativa del perfil (`SHARED_SEQUENCE|FISCAL_SERIES|SEPARATE_EXPEDITION_POINT`).

Regla de control:
- FE controla `serie_fiscal` y `siguiente_numero`.
- El cliente externo controla, si lo necesita, su comprobante comercial propio y su `serie_operativa`, pero debe reconciliar contra la respuesta fiscal de FE.
- La actividad economica no participa en la unicidad fiscal. Cambiar solo la actividad no habilita reutilizar `documentoNro`.
- Si una actividad requiere correlativo independiente, se crea un perfil de emision propio y un numerador fiscal propio. Ese perfil no puede compartir simultaneamente `timbrado + establecimiento + punto + tipo_documento + serie_fiscal_normalizada + documentoNro` con otro perfil.
- Para independencia fiscal real, el perfil debe diferenciarse por una clave aceptada por SIFEN: preferentemente punto de expedicion distinto; alternativamente serie fiscal valida si su uso esta habilitado y confirmado.
- En `SHARED_SEQUENCE`, FE o el cliente en modo `CLIENT` deben mantener una sola secuencia fiscal compartida para todas las actividades que usan la misma clave fiscal.
- En `FISCAL_SERIES`, cada perfil debe usar una `serie_fiscal` valida y un numerador asociado a esa serie.
- En `SEPARATE_EXPEDITION_POINT`, cada perfil debe usar un punto de expedicion y numerador propios.

Recomendacion operativa:
- Para separar actividades antes de consumir `9999999`, preferir perfiles internos y, si hace falta correlativo fiscal independiente reconocido por SIFEN, usar puntos de expedicion distintos o confirmar formalmente con SET el uso anticipado de `dSerieNum`.
- No adoptar codigos fiscales largos como `SERV` o `VENTA` porque no coinciden con `C010 dSerieNum` del MT v150.

### 2.1D Snapshot fiscal de actividades
Cada documento debe conservar las actividades usadas en el XML. La persistencia recomendada es un campo JSONB en `de_documents` o una tabla historica de detalle, con:
- `codigo_actividad`,
- `descripcion_actividad`,
- `principal`,
- origen de seleccion (`DEFAULT_PRINCIPAL|REQUEST|OPERATIVE_RULE`),
- `emisor_actividad_id`,
- `perfil_emision_id`,
- `perfil_emision_codigo`,
- `serie_operativa`,
- `serie_fiscal`.

Esto evita que cambios posteriores en el RUC o en la configuracion administrativa alteren la evidencia del DE emitido.

### 2.1E Control de acceso por usuario
Se agregara un modelo de acceso por alcance:
- `ADMIN_GLOBAL`: ve todos los facturadores y administra asignaciones,
- `OPERADOR_FACTURADOR`: solo ve y opera sobre emisores asignados.

La autorizacion se evaluara por `user_id + emisor_id` en cada endpoint administrativo y de monitoreo.

### 2.2 Certificados: upload y storage
El upload de `.pfx/.p12` se resolvera en dos capas:
1. `multipart/form-data` para recibir archivo y metadata.
2. servicio de storage privado que:
   - valida extension,
   - genera nombre interno,
   - guarda el archivo fuera del alcance publico,
   - persiste en `emisor_certificados` la referencia (`cert_path`) y metadata adicional disponible.

Decision MVP:
- El archivo se almacena en filesystem privado configurable (`CERT_UPLOAD_DIR`).
- En BD se guarda solo la referencia y la metadata.
- La password se almacena como valor operativo actual, con enmascarado estricto en respuestas.

### 2.3 Configuracion efectiva y versionado
Para timbrados, certificados y CSC se mantiene el modelo con:
- `activo`,
- `vigente_desde`,
- `vigente_hasta`.

La resolucion operativa usara siempre el registro activo/vigente mas reciente por emisor y ambiente.

### 2.4 Readiness
El readiness no sera un flag persistido fijo; se calculara al consultar combinando:
- existencia,
- vigencia,
- consistencia minima de configuracion.

Se puede cachear el resultado si luego hiciera falta, pero no es necesario para el MVP.

### 2.5 Estado por factura: snapshot + jobs
El snapshot actual seguira viviendo en `de_documents.sifen_last_status` y `sifen_last_checked_at`.

Para soportar refresco masivo por facturador se agregara:
- `de_status_sync_jobs`: cabecera del proceso.
- `de_status_sync_job_items` o equivalente: detalle por documento consultado.

Esto evita sobrecargar `de_send_attempts` con semantica operativa de monitoreo y da trazabilidad para UI/admin.

### 2.5A Verificacion y aceptacion por SIFEN
El frontend necesita una derivacion simple `accepted_by_sifen`.
Se calculara desde el ultimo snapshot conocido:
- `APPROVED` => `true`
- `APPROVED_WITH_OBS` => `true`
- `REJECTED` => `false`
- resto => `false` o `null` segun ausencia de respuesta concluyente

No se debe confundir `transport_success` con aceptacion fiscal.

### 2.5B Edicion y reenvio
La edicion de una factura no debe sobrescribir silenciosamente el original.

Decision:
- para documentos no aceptados por SIFEN, se permite editar `json_input` o cuerpo normalizado, regenerar XML y reenviar;
- antes de editar, se toma snapshot en `de_document_revisions`;
- para documentos `APPROVED` o `APPROVED_WITH_OBS`, el sistema bloquea edicion in-place y deriva a un flujo futuro de correccion fiscal.

### 2.5C Numerador integrado con POS externos
- Cuando el servicio se usa como backend fiscal de un POS que ya reserva su propio correlativo comercial/fiscal, el valor de `numeradores_documentos.siguiente_numero` debe mantenerse coherente con el siguiente correlativo reservado por ese POS.
- Para `pos-graciela`, la referencia equivalente es `series_timbrado.siguiente_numero`.
- La operacion de despliegue, restore o reseed debe incluir verificacion de esta coherencia antes de habilitar cobros.
- Si se detecta drift de numerador, el ajuste debe hacerse en FE antes de volver a emitir.

### 2.6 Consulta operativa por facturador
La pantalla principal del frontend requiere dos vistas:
- `resumen`: conteos por estado local y por estado SIFEN cacheado.
- `bandeja`: lista paginada de documentos con filtros.

La consulta debe soportar:
- `env`,
- fecha de emision desde/hasta,
- fecha de envio/transmision desde/hasta,
- estado interno,
- freshness del cache,
- texto libre,
- establecimiento/punto,
- paginacion.

### 2.7 Refresh individual vs masivo
- Individual:
  - ya existe por CDC con `refresh=true`.
  - se mantiene para drill-down.
- Masivo:
  - crea un job asincronico por facturador.
  - procesa documentos elegibles en lotes pequenos.
  - actualiza snapshot local y deja trazabilidad.

## 3) Diseno de datos

### 3.1 Reuso de tablas existentes
Se reutilizan:
- `users`
- `user_emisores`
- `emisores`
- `emisor_actividades`
- `establecimientos`
- `puntos_expedicion`
- `emisor_timbrados`
- `emisor_certificados`
- `emisor_csc`
- `numeradores_documentos`
- `de_documents`
- `de_send_attempts`
- `de_batches`
- `de_events`

### 3.2 Tablas nuevas sugeridas
`emisor_timbrado_actividades`
- `id`
- `emisor_id`
- `timbrado_id`
- `actividad_id`
- `establecimiento_id` nullable
- `punto_expedicion_id` nullable
- `tipo_documento` nullable
- `activo`
- `vigente_desde`
- `vigente_hasta`
- `created_at`
- `updated_at`

Restricciones sugeridas:
- FK a `emisores`, `emisor_timbrados`, `emisor_actividades`, `establecimientos`, `puntos_expedicion`.
- Unique parcial o compuesto que evite duplicar la misma cobertura activa.
- Validacion de coherencia: actividad, timbrado, establecimiento y punto deben pertenecer al mismo emisor.

`emisor_perfiles_emision`
- `id`
- `emisor_id`
- `codigo`
- `descripcion`
- `timbrado_id`
- `establecimiento_id`
- `punto_expedicion_id`
- `tipo_documento`
- `numerador_id`
- `serie_operativa` nullable
- `serie_fiscal` nullable
- `separation_strategy` (`SHARED_SEQUENCE|FISCAL_SERIES|SEPARATE_EXPEDITION_POINT`)
- `modo_actividad` (`PRINCIPAL|SELECCIONADA|MULTIPLE`)
- `activo`
- `vigente_desde`
- `vigente_hasta`
- `created_at`
- `updated_at`

Restricciones sugeridas:
- `codigo` unico por emisor.
- `serie_fiscal` nullable, longitud 2, mayusculas sin `Ñ`.
- `numerador_id` debe pertenecer al mismo emisor/establecimiento/punto/tipo y, si se agrega serie fiscal al numerador, debe coincidir.
- Un perfil activo debe resolver al menos una actividad economica activa.
- `FISCAL_SERIES` requiere `serie_fiscal` no null.
- `SHARED_SEQUENCE` debe usar el numerador compartido de la clave fiscal base o de la serie fiscal configurada.
- `SEPARATE_EXPEDITION_POINT` requiere que el punto pertenezca al establecimiento del emisor y tenga numerador propio.

`de_status_sync_jobs`
- `id`
- `emisor_id`
- `env`
- `status`
- `filters_json`
- `requested_by`
- `requested_at`
- `started_at`
- `finished_at`
- `total_documents`
- `updated_documents`
- `error_count`
- `last_error`

`de_status_sync_job_items`
- `id`
- `job_id`
- `document_id`
- `cdc`
- `previous_status_json`
- `new_status_json`
- `result` (`UPDATED|SKIPPED|ERROR`)
- `error_message`
- `checked_at`

`de_document_revisions`
- `id`
- `document_id`
- `revision_number`
- `edited_by`
- `edit_reason`
- `json_input_snapshot`
- `xml_unsigned_snapshot`
- `xml_signed_snapshot`
- `xml_qr_snapshot`
- `created_at`

### 3.3 Cambios menores recomendados
En `emisor_certificados` considerar metadata adicional:
- `original_filename`
- `mime_type`
- `file_size_bytes`
- `storage_checksum`

En `de_documents` considerar campos derivados para consulta:
- mantener `sifen_last_checked_at`,
- opcionalmente `sifen_last_code` y `sifen_last_result` desnormalizados si la UI lo exige.
- agregar `actividades_economicas_snapshot` JSONB si se implementa seleccion multi-actividad.
- agregar `perfil_emision_snapshot` JSONB para conservar codigo de perfil, serie operativa y serie fiscal efectiva.

En `numeradores_documentos` considerar:
- agregar `serie_fiscal` nullable;
- ampliar la unicidad a `emisor_id + establecimiento_id + punto_expedicion_id + tipo_documento + serie_fiscal_normalizada`;
- mantener `serie_fiscal = null` como numeracion base sin serie.
- no incluir `actividad_id` en la clave unica del numerador fiscal; la actividad se controla por perfil y snapshot, no por numeracion.

### 3.4 Impacto sobre implementacion existente
La implementacion actual del repositorio debe migrarse de forma explicita porque hoy:
- `factura.schema`/`factura.types` no exigen `actividadEconomicaCodigo`;
- `TenantConfigResolver` resuelve solo `actividadPrincipal`;
- `NumeradorRepository` reserva por `emisor + establecimiento + punto + tipo_documento`, sin `serie_fiscal`;
- `de_documents` tiene unicidad por `emisor + env + tipo_documento + establecimiento + punto + numero`, sin `serie_fiscal`;
- `DeDocumentRepository.findByFiscalKey` no considera serie fiscal;
- los snapshots de actividad/perfil no existen como columnas dedicadas;
- los mappers no reciben `serie_fiscal`/`dSerieNum`.

La migracion debe mantener compatibilidad con datos existentes:
- registros actuales se interpretan como `serie_fiscal = null`;
- numeradores existentes se migran con `serie_fiscal = null`;
- documentos existentes se migran con `perfil_emision_snapshot = null` y `actividades_economicas_snapshot` inferible solo desde `json_input` si aplica;
- endpoints legacy o clientes no migrados deben tener una decision explicita: rechazo por contrato nuevo o adaptador temporal hacia actividad principal.

## 4) Flujos principales

### 4.1 Onboarding / configuracion del facturador
1. Crear emisor.
2. Registrar actividad principal y actividades secundarias declaradas.
3. Registrar establecimiento y punto.
4. Registrar timbrado.
5. Asociar actividades al timbrado/boca de emision si el facturador requiere control operativo estricto.
6. Registrar numerador base o numeradores por serie fiscal si aplica.
7. Crear perfiles de emision que el frontend y los clientes externos puedan consumir.
8. Registrar CSC para `test` y/o `prod`.
9. Subir certificado `.pfx/.p12`.
10. Obtener `readiness`.

La API debe permitir ejecutar estos pasos en cualquier orden razonable, pero el readiness solo sera `true` cuando todo lo critico este resuelto.

### 4.2 Emision FE
1. Resolver configuracion efectiva por emisor.
2. Validar `actividadEconomicaCodigo` obligatorio contra actividades activas del emisor.
3. Resolver perfil de emision por `emission_profile_code`, actividad solicitada o default.
4. Resolver actividades economicas efectivas segun perfil, request, principal y cobertura operativa.
5. Reservar numeracion desde el numerador fiscal del perfil, incluyendo serie fiscal si existe.
6. Generar XML.
7. Firmar usando certificado vigente.
8. Insertar QR usando CSC vigente.
9. Persistir documento local con snapshot de actividades y perfil usados.
10. Transmitir segun `SYNC`, `BATCH` o `AUTO`.

### 4.3 Consulta operativa de facturas por facturador
1. Seleccionar documentos por emisor y ambiente.
2. Aplicar filtros.
3. Construir resumen por estado.
4. Devolver bandeja paginada con:
   - estado interno,
   - estado SIFEN cacheado,
   - `accepted_by_sifen`,
   - fecha de ultima verificacion,
   - receptor,
   - CDC,
   - numero,
   - flags de freshness.

### 4.4 Verificacion y refresh individual
1. Abrir detalle de factura.
2. Mostrar snapshot local actual.
3. Permitir refresh individual contra SIFEN.
4. Recalcular `accepted_by_sifen` y persistir `sifen_last_checked_at`.

### 4.5 Edicion y reenvio de factura no aceptada
1. Seleccionar documento elegible.
2. Validar que no este `APPROVED` ni `APPROVED_WITH_OBS`.
3. Guardar snapshot en `de_document_revisions`.
4. Aplicar cambios al cuerpo normalizado.
5. Regenerar XML, firma y QR.
6. Registrar intento de reenvio.
7. Actualizar estado segun respuesta o nueva cola.

### 4.6 Refresh masivo de estado
1. Crear job `PENDING`.
2. Worker toma el job y selecciona documentos elegibles.
3. Por cada documento:
   - consulta SIFEN,
   - actualiza snapshot en `de_documents`,
   - registra item del job.
4. Cierra job con resumen final.

Reglas:
- limitar concurrencia,
- evitar refresh de documentos cancelados/voided si no aporta valor operativo,
- permitir filtro `only_stale=true`.

### 4.7 Seguridad por usuario
1. Autenticar usuario.
2. Resolver rol y emisores asignados.
3. Filtrar listados y accesos a detalle por alcance.
4. Rechazar con `403` accesos a emisores no asignados.

## 5) API y contratos

### 5.1 Endpoints administrativos a consolidar
El `openapi.yaml` debe cubrir al menos:
- listado de emisores,
- detalle agregado de configuracion del emisor,
- usuarios y asignaciones,
- upload de certificado,
- readiness,
- configuracion batch efectiva,
- cobertura operativa de actividades por timbrado/boca de emision,
- perfiles de emision y series fiscales validas,
- `actividadEconomicaCodigo` obligatorio en requests de emision,
- listado operativo de facturas por facturador,
- resumen de estados por facturador,
- verificacion y detalle editable de factura,
- reenvio de factura no aceptada,
- solicitud de sync de estados por facturador.

### 5.2 Upload de certificado
Se recomienda `multipart/form-data` con:
- `alias`
- `password_value`
- `vigente_desde`
- `vigente_hasta`
- `activo`
- `file`

Respuesta:
- `id`
- `alias`
- `original_filename`
- `valid_from`
- `valid_to`
- `activo`
- `is_current`

### 5.3 Consulta de estados por facturador
El response debe incluir:
- `summary`
  - totales por estado interno,
  - totales por estado SIFEN cacheado,
  - documentos sin cache,
  - documentos con cache vencido.
- `items`
  - identificadores,
  - datos principales,
  - estado interno,
  - estado cacheado,
  - `accepted_by_sifen`,
  - `checked_at`,
  - `cache_stale`.

### 5.4 Edicion y reenvio
Se recomienda separar:
- `PATCH` del cuerpo editable normalizado,
- `POST` de reenvio.

Esto permite validar y auditar la edicion antes de transmitir.

### 5.5 Usuarios y asignaciones
La API debe permitir:
- listar usuarios,
- crear/editar usuarios,
- asignar emisores a usuarios,
- consultar los emisores visibles por usuario.

## 6) Riesgos y mitigaciones
- Riesgo: exponer secretos en responses.
  - Mitigacion: enmascarar campos sensibles y separar metadata de secreto.
- Riesgo: saturar SIFEN con refresh masivo.
  - Mitigacion: job asincronico, limites por lote y filtros por stale.
- Riesgo: certificados invalidos o vencidos.
  - Mitigacion: parseo basico de metadata, readiness y validacion al activar.
- Riesgo: frontend dependa de muchos endpoints atomicos.
  - Mitigacion: agregar endpoints agregados de `configuracion` y `estado`.
- Riesgo: sobrescribir una factura aprobada.
  - Mitigacion: bloquear edicion in-place de documentos aceptados y mantener snapshots de revision.
- Riesgo: fuga de informacion entre facturadores.
  - Mitigacion: control de acceso por usuario-emisor en cada endpoint.

## 7) Estrategia de implementacion
1. Cerrar contrato OpenAPI.
2. Crear migraciones para tablas de jobs de sync y metadata de certificados si hace falta.
3. Crear migraciones para usuarios, asignaciones y revisiones de documentos.
4. Implementar servicios/repositorios administrativos.
5. Implementar upload de certificados.
6. Implementar consultas operativas y resumenes.
7. Implementar verificacion, edicion y reenvio controlado.
8. Implementar jobs de refresh de estado.
9. Cubrir con tests unitarios e integracion.
