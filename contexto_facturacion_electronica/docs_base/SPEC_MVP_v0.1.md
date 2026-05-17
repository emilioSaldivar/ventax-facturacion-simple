# SPEC MVP v0.1 — SIFEN (MT v150)
Servicio Node.js para emision y gestion de Factura Electronica (FE), administracion operativa de facturadores y monitoreo de estado por emisor.

## 1) Proposito
Implementar un MVP operable en produccion que permita:
- Emitir FE (CONTADO y CREDITO).
- Generar XML (v150), firmar (PKCS#12/PFX), insertar QR AA002.
- Enviar a SIFEN con estrategias `SYNC`, `BATCH` y `AUTO`.
- Administrar desde frontend la configuracion de cada facturador.
- Consultar el estado de las facturas por facturador con cache local y refresco controlado hacia SIFEN.
- Verificar si cada factura ya fue aceptada por SIFEN y mantener trazabilidad de esa verificacion.
- Editar controladamente el cuerpo de facturas no aceptadas y reenviarlas a SIFEN sin perder historial.
- Restringir la visibilidad de facturadores por usuario.
- Gestionar eventos de cancelacion e inutilizacion.

## 2) Alcance refinado del modulo de facturadores
Para este MVP, un `facturador` es la unidad operativa compuesta por:
- datos fiscales del emisor,
- actividades economicas,
- establecimientos y puntos de expedicion,
- timbrados,
- numeradores,
- CSC por ambiente,
- certificado cualificado vigente,
- configuracion operativa de despacho BATCH,
- readiness operativo para emitir.

El frontend debe poder operar sobre esta unidad sin depender de scripts SQL manuales.

Adicionalmente, el sistema debe manejar:
- usuarios administrativos,
- asignacion de facturadores por usuario,
- permisos para consultar/editar/reenviar segun el alcance asignado.

## 3) Fuera de alcance
- KUDE.
- Envio de correo.
- Gestion documental avanzada del certificado fuera del storage interno del sistema.
- Firma remota/HSM/KMS. El MVP trabajara con archivo `.pfx/.p12` cargado al sistema.
- Sincronizacion masiva continua contra SIFEN en tiempo real.

## 4) Dependencias obligatorias
- `facturacionelectronicapy-xmlgen`
- `facturacionelectronicapy-xmlsign`
- `facturacionelectronicapy-qrgen`
- `facturacionelectronicapy-setapi`

## 4.1) Estandar de exposicion para LAN
- El servicio debe poder exponerse hacia el host en un puerto fijo configurable por `.env`.
- El puerto host por defecto para API FE es `9988`.
- El puerto host por defecto para frontend admin FE es `8099`.
- La URL recomendada para otros contenedores del mismo host es `http://host.docker.internal:9988`.
- El puerto interno del contenedor API puede mantenerse en `8080`; el estándar aplica al puerto publicado hacia el host.
- La integracion no debe depender de IPs efimeras del bridge Docker.

## 4.2) Autonomia de numeracion para clientes externos
- Cuando `facturacion-electronica` opera integrado con clientes externos, la fuente de verdad de numeracion online debe ser `numeradores_documentos.siguiente_numero`.
- Clientes externos pueden enviar un numero sugerido o de referencia, pero FE no debe depender de ese valor para asignar el correlativo online normal.
- Si FE expone integracion con metadata de cliente, el numero sugerido debe tratarse como referencia/auditoria y no como autoridad fiscal.
- Los rechazos estrictos por mismatch de numeracion pueden mantenerse para flujos administrativos o manuales, pero no deben ser la dependencia central del contrato online general con clientes externos.
- La reconciliacion de ambientes restaurados o migrados debe incluir ajuste explicito del numerador FE antes de reanudar emisiones.

## 5) Requisitos funcionales

### RF-01 Emision FE (CONTADO/CREDITO)
El sistema debe:
1. Normalizar el request y construir `params + data`.
2. Generar XML con `xmlgen`.
3. Firmar XML con certificado PKCS#12.
4. Insertar QR AA002 con `qrgen`.
5. Generar el CDC localmente conforme al Manual Tecnico v150.
6. Persistir artefactos y metadatos (`cdc`, `nro_factura`, estado, timestamps).
7. Resolver `envio.mode`:
   - `SYNC`: envio inmediato.
   - `BATCH`: encolado para lote.
   - `AUTO`: intenta `SYNC`; si hay error tecnico, encola.
8. Resolver toda la configuracion efectiva desde BD por `facturador/emisor`.

**Idempotencia:** un documento se identifica por:
`(emisor_id, env, tipo_documento, establecimiento, punto_expedicion, numero)`.

### RF-02 Configuracion de facturadores desde frontend
El sistema debe permitir administrar desde API:
- alta, baja logica, edicion y listado de emisores,
- actividades economicas,
- establecimientos y puntos de expedicion,
- timbrados,
- numeradores,
- CSC por ambiente,
- configuracion BATCH efectiva,
- readiness operativo del facturador.

La API debe exponer respuestas utilizables por un frontend administrativo, no solo endpoints de alta puntual.

### RF-02A Asociacion operativa de actividades economicas y timbrado
El sistema debe soportar mas de una actividad economica activa para un mismo facturador.

Base normativa/documental:
- En el XML SIFEN, `gActEco` admite de 1 a 9 actividades economicas del emisor.
- Cada actividad informada debe corresponder a lo declarado en el RUC y su descripcion debe corresponder al codigo.
- El timbrado se valida operativamente contra RUC del contribuyente, medio de generacion, establecimiento, punto de expedicion, tipo de documento, numero y vigencia.
- No se adopta como regla fiscal que una actividad economica pertenezca directamente a un timbrado especifico, salvo evidencia documental posterior de SET/Marangatu.

Decision MVP:
- La actividad economica pertenece al `emisor`.
- El timbrado pertenece al `emisor` y puede restringirse por `establecimiento`.
- La asociacion entre actividad economica y timbrado sera una regla operativa interna para definir que actividades puede usar una boca de emision (`establecimiento + punto + tipo_documento`) al emitir.
- Si no existe configuracion operativa explicita, el sistema usara todas las actividades activas del emisor, con una actividad principal obligatoria.
- La separacion comercial por actividad no debe depender de usar libremente la serie fiscal SIFEN como `SERV`, `VENTA` u otros codigos largos.
- Segun MT v150, la serie fiscal del timbrado corresponde a `C010 dSerieNum`, longitud 2, opcional, y su uso esta ligado a la continuidad de numeracion del timbrado.
- Para separar actividades, el MVP debe usar un `perfil de emision` interno: actividad(es), timbrado, establecimiento, punto, tipo de documento, numerador y serie fiscal opcional valida.
- La actividad economica no forma parte de la clave de numeracion fiscal ni debe usarse para permitir duplicidad de numeros.
- Todo request de emision debe informar `actividadEconomicaCodigo` como codigo valido declarado/configurado para el emisor.

Reglas funcionales:
- Un emisor debe tener exactamente una actividad principal activa.
- Un emisor puede tener actividades secundarias activas.
- Una emision puede seleccionar una o varias actividades activas del emisor, hasta el maximo permitido por SIFEN.
- La seleccion de actividades para el XML debe provenir de actividades declaradas/configuradas para el emisor; no debe aceptarse texto libre en el request externo.
- `actividadEconomicaCodigo` es obligatorio y debe existir como actividad activa del emisor.
- Si el codigo no existe, esta inactivo o no esta cubierto por el perfil/boca de emision, la API debe responder `422`.
- Si se configura una asociacion operativa por timbrado/boca de emision, la emision solo puede usar actividades incluidas en esa asociacion.
- No se debe emitir dos DE con el mismo `timbrado + establecimiento + puntoExpedicion + tipo_documento + serie_fiscal_normalizada + documentoNro`, aunque usen actividades economicas distintas.
- Si dos actividades requieren secuencias independientes, cada una debe resolverse por un perfil de emision distinto con una identidad fiscal distinta: preferentemente punto de expedicion distinto; alternativamente serie fiscal SIFEN valida si su uso esta habilitado y confirmado.
- Un cliente externo no debe decidir el numero fiscal ni la serie fiscal final; debe enviar una referencia de perfil/canal o actividad solicitada, y FE debe resolver la identidad fiscal efectiva.
- El cliente externo puede mantener series comerciales propias, pero esas series no sustituyen `dSerieNum` ni el numerador fiscal controlado por FE.
- Estrategias soportadas por perfil:
  - `SHARED_SEQUENCE`: varias actividades comparten misma clave fiscal y una unica secuencia; no se repiten numeros entre actividades.
  - `FISCAL_SERIES`: varias actividades comparten establecimiento/punto, pero cada perfil usa una `serie_fiscal` SIFEN valida y su numerador.
  - `SEPARATE_EXPEDITION_POINT`: cada actividad/perfil usa un punto de expedicion distinto y su numerador.
- El readiness debe advertir:
  - ausencia de actividad principal,
  - actividad activa sin asociacion operativa cuando el modo estricto este habilitado,
  - timbrado vigente sin cobertura para el establecimiento/punto/tipo requerido,
  - perfil de emision sin numerador fiscal asociado.
- Todo documento debe persistir snapshot de las actividades efectivamente usadas, para auditoria y reemision.
- Todo documento debe persistir snapshot del perfil de emision efectivo, incluyendo serie fiscal si fue usada.
- Compatibilidad: los documentos y numeradores existentes antes de este cambio se consideran `serie_fiscal = null` hasta que una migracion los enriquezca.
- Contrato nuevo: las emisiones nuevas deben enviar `actividadEconomicaCodigo`; cualquier adaptador legacy que infiera actividad principal debe quedar explicitamente versionado o limitado a transicion.

### RF-03 Carga de certificado cualificado `.pfx/.p12`
El sistema debe permitir:
- subir un archivo `.pfx` o `.p12` por API administrativa,
- registrar `alias`, password, vigencia, metadata parseada disponible y estado activo,
- persistir referencia segura al archivo almacenado,
- impedir exponer el binario o el password en logs o respuestas,
- marcar un certificado como vigente para emision.

El frontend no debe requerir acceso al filesystem ni inserciones SQL manuales.

### RF-04 Configuracion CSC / idCSC por ambiente
El sistema debe permitir:
- registrar y editar `csc_id` y `csc_value`,
- soportar ambientes `test` y `prod`,
- mantener vigencias y estado activo,
- resolver el CSC efectivo por emisor y ambiente al momento de emitir.

### RF-05 Readiness operativo del facturador
El sistema debe informar si un facturador esta listo para emitir segun checks minimos:
- emisor activo,
- actividad principal definida,
- establecimiento y punto validos,
- timbrado vigente,
- numerador disponible,
- certificado activo y no vencido,
- CSC activo para el ambiente,
- configuracion batch efectiva resoluble.

La respuesta debe indicar faltantes concretos para guiar al frontend.

### RF-06 Consulta operativa de facturas por facturador
El sistema debe permitir consultar facturas por facturador con:
- filtros por `env`, rango de fechas de emision, rango de fechas de envio/transmision a SIFEN, estado interno, estado SIFEN cacheado, texto libre y establecimiento/punto,
- paginacion,
- resumen agregado por estado,
- indicadores de frescura del cache SIFEN,
- indicador de `aceptada_por_sifen`,
- acceso a detalle por CDC usando endpoints ya existentes.

La vista debe servir para pantallas tipo bandeja operativa o dashboard administrativo.

### RF-07 Cache de estado SIFEN por factura
El sistema debe manejar dos niveles de estado:
- `estado interno`: ciclo local del documento,
- `estado SIFEN cacheado`: ultimo resultado conocido desde SIFEN.

El cache debe soportar:
- consulta simple sin pegarle a SIFEN,
- refresh individual por CDC,
- refresh masivo por facturador bajo demanda o por job,
- timestamp de ultima verificacion,
- trazabilidad de errores de consulta.

El snapshot actual puede residir en `de_documents.sifen_last_status`, pero el MVP debe contemplar tablas adicionales para jobs/historial si se requiere refresco masivo.

### RF-08 Verificacion operativa del estado de factura
El sistema debe permitir verificar por documento si la factura:
- aun no fue enviada,
- fue enviada pero no tiene respuesta concluyente,
- fue aceptada por SIFEN,
- fue aceptada con observaciones,
- fue rechazada,
- requiere reenvio o correccion.

La verificacion debe exponer:
- `status` interno,
- `sifen_last_status`,
- `accepted_by_sifen` derivado,
- `last_verified_at`,
- `last_sent_at`,
- ultima respuesta resumida de SIFEN.

### RF-09 Refresh masivo de estado por facturador
El sistema debe permitir solicitar una sincronizacion de estados para un facturador con filtros opcionales:
- `env`,
- rango de fechas,
- estados locales,
- solo documentos con cache vencido.

El proceso puede ejecutarse asincronicamente y debe persistir:
- solicitud/job,
- cantidad de documentos evaluados,
- cantidad actualizada,
- errores.

### RF-10 Edicion controlada de factura y reenvio
El sistema debe permitir editar el cuerpo persistido de una factura y reenviarla a SIFEN bajo reglas estrictas:
- el documento original no debe perder su version/historial previo,
- la edicion debe quedar auditada con usuario, fecha, motivo y diff o snapshot,
- el reenvio debe regenerar XML, firma y QR antes de volver a transmitir.

Reglas funcionales:
- si la factura esta en `REJECTED`, `TRANSMISSION_FAILED`, `QUEUED_BATCH`, `SENT_BATCH` sin resultado final o equivalente no aprobado, se permite editar y reenviar la misma entidad documental con nueva revision interna;
- si la factura esta `APPROVED` o `APPROVED_WITH_OBS`, no se debe sobrescribir ni reenviar el DE original aprobado; en ese caso solo se permite una accion derivada de correccion definida por negocio en una iteracion posterior.

Para el MVP, la capacidad de edicion/reenvio se limitara a documentos no aceptados por SIFEN.

### RF-11 Envio SIFEN SYNC
- Enviar un XML final con `setapi.recibe`.
- Persistir request/response y actualizar estado del DE.
- Si falla la transmision tecnica:
  - persistir el DE y el intento,
  - marcar `TRANSMISSION_FAILED`,
  - no hacer fallback salvo `AUTO`.

### RF-12 Envio SIFEN por Lote (BATCH)
- Worker agrupa documentos listos para lote:
  - maximo 50,
  - mismo tipo,
  - mismo emisor,
  - mismo ambiente.
- Enviar lote con `setapi.recibeLote`.
- Consultar resultados con `setapi.consultaLote`.
- El `dId` es secuencial por `emisor_id + env`.

### RF-13 Eventos — Cancelacion FE
- Solo documentos `APPROVED` o `APPROVED_WITH_OBS`.
- Validar ventana operativa de 48h.
- Enviar evento con `setapi.evento`.
- Registrar trazabilidad.

### RF-14 Eventos — Inutilizacion de numeracion FE
- Motivo requerido (`<=150 chars`).
- Rango secuencial valido.
- Maximo 1000 numeros.
- No inutilizar numeros usados por documentos aprobados.

### RF-15 Usuarios y autorizacion por facturador
El sistema debe permitir:
- crear usuarios administrativos,
- activar/desactivar usuarios,
- asignar uno o varios facturadores/emisores a cada usuario,
- limitar consultas y operaciones solo a los facturadores asignados,
- diferenciar al menos perfiles `ADMIN_GLOBAL` y `OPERADOR_FACTURADOR`.

Reglas:
- un usuario `OPERADOR_FACTURADOR` solo puede ver y operar sobre sus emisores asignados,
- un usuario no asignado no puede consultar ni editar facturas de otro facturador,
- las asignaciones deben ser consultables por API para frontend.

### RF-16 Consultas
El sistema debe soportar:
- comprobante por CDC,
- XML por CDC,
- estado SIFEN por CDC (`cache` o `refresh`),
- listado de facturas,
- eventos por CDC,
- cola/lotes pendientes,
- listado operativo de facturas por facturador,
- resumen de estados por facturador,
- verificacion individual de aceptacion por SIFEN,
- edicion controlada del cuerpo de factura para reenvio,
- historial de revisiones/reenvios,
- usuarios y asignaciones de facturadores,
- estado/readiness de configuracion por facturador.

## 6) Estados internos
Estados del DE:
- `DRAFT`
- `XML_GENERATED`
- `XML_SIGNED`
- `QR_ATTACHED`
- `TRANSMISSION_FAILED`
- `QUEUED_SYNC`
- `SENT_SYNC`
- `QUEUED_BATCH`
- `SENT_BATCH`
- `APPROVED`
- `APPROVED_WITH_OBS`
- `REJECTED`
- `CANCEL_REQUESTED`
- `CANCELLED`
- `VOID_REQUESTED`
- `VOIDED`

Reglas:
- La firma ocurre antes del QR.
- El envio a SIFEN solo se permite a partir de `QR_ATTACHED`.
- En `SYNC`, error tecnico deja `TRANSMISSION_FAILED`.
- En `AUTO`, error tecnico deja `QUEUED_BATCH`.
- El estado SIFEN cacheado no reemplaza al estado interno; ambos deben convivir.
- Un documento `APPROVED` no puede ser editado in-place para reenvio.

## 7) Requisitos no funcionales

### RNF-01 Seguridad
- Secretos y passwords nunca en logs.
- El password del certificado y el `csc_value` deben enmascararse en respuestas.
- El upload de certificado debe validar extension y contenido esperado.
- Los accesos a facturadores deben respetar asignacion por usuario.
- Las operaciones de edicion/reenvio deben auditar usuario autenticado.

### RNF-02 Resiliencia
- Idempotencia por clave fiscal y por CDC.
- Reintentos en BATCH y polling.
- El refresco masivo de estados debe ejecutarse con limites por job para no saturar SIFEN.

### RNF-03 Observabilidad
- Logs estructurados con `emisor_id`, `cdc`, `document_id`, `batch_id`, `event_id`, `status_sync_job_id`.
- Persistir request/response relevantes sin secretos.

### RNF-04 UX API para frontend
- Las respuestas administrativas deben incluir suficiente metadata para construir formularios y pantallas de seguimiento.
- Los endpoints administrativos deben devolver identificadores, estado activo, vigencias y readiness.

## 8) Configuracion minima (ENV)
- `APP_ENV`
- `APP_TIMEZONE`
- `SIFEN_ENV`
- `DATABASE_URL`
- `SETAPI_TIMEOUT_MS`
- `BATCH_WORKER_LOOP_SECONDS`
- `CERT_UPLOAD_DIR` o storage equivalente privado

El `.env` no debe almacenar configuracion fiscal efectiva de los emisores.

## 9) Persistencia minima
Tablas existentes o requeridas:
- `users`
- `user_emisores`
- `emisores`
- `emisor_actividades`
- `emisor_timbrado_actividades`
- `emisor_perfiles_emision`
- `establecimientos`
- `puntos_expedicion`
- `emisor_timbrados`
- `emisor_certificados`
- `emisor_csc`
- `numeradores_documentos`
- `de_documents`
- `de_send_attempts`
- `de_batches`
- `de_batch_documents`
- `de_events`
- `de_sequences`
- `batch_dispatch_config`
- `batch_dispatch_defaults`

Tablas adicionales recomendadas para control de revisiones:
- `de_document_revisions`
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

Tablas adicionales recomendadas para monitoreo/cache:
- `de_status_sync_jobs`
  - `id`
  - `emisor_id`
  - `env`
  - `status` (`PENDING|RUNNING|DONE|ERROR`)
  - `filters_json`
  - `requested_at`, `started_at`, `finished_at`
  - `requested_by`
  - `total_documents`, `updated_documents`, `error_count`
- `de_status_sync_job_items` o `de_document_status_history`
  - detalle por documento consultado,
  - estado previo/nuevo,
  - respuesta resumida,
  - error de consulta, si aplica.

## 10) Contrato de API (OpenAPI)
La API definida en `spec/openapi.yaml` debe cubrir:
- emision y eventos del MVP,
- ABM/listado de facturadores,
- ABM/listado de usuarios y asignaciones,
- upload de certificado `.pfx/.p12`,
- configuracion de CSC, timbrado, numerador y agenda batch,
- readiness de facturador,
- consulta operativa de facturas por facturador,
- verificacion individual de facturas,
- edicion controlada de factura y reenvio,
- refresco individual y masivo del estado SIFEN cacheado.
- asociacion operativa de actividades economicas habilitadas por timbrado/boca de emision, cuando aplique.
- perfiles de emision para clientes externos y series fiscales controladas por FE.

## 11) Criterios de aceptacion
1. Un facturador puede configurarse completamente desde API sin SQL manual.
2. El sistema permite subir certificado `.pfx/.p12` y dejarlo operativo para emision.
3. El sistema permite configurar `csc_id` y `csc_value` por ambiente.
4. El frontend puede obtener un readiness claro del facturador.
5. El frontend puede listar facturas por facturador con resumen por estado y estado SIFEN cacheado.
6. El sistema permite verificar si una factura ya fue aceptada por SIFEN.
7. El sistema permite editar y reenviar facturas no aceptadas sin perder historial.
8. Un usuario solo ve los facturadores que tiene asignados, salvo rol global.
9. El sistema permite refrescar estado SIFEN por CDC y por lote de documentos del facturador.
10. Emision, eventos y consultas actuales se mantienen alineadas con el nuevo modelo.
11. Un facturador puede tener varias actividades economicas activas y emitir usando solo actividades declaradas para su RUC.
12. El sistema puede restringir operativamente actividades por timbrado/boca de emision sin confundir esa regla interna con una validacion fiscal directa del timbrado.
13. Los clientes externos pueden solicitar un perfil de emision, pero FE conserva el control de serie fiscal y numeracion final.
