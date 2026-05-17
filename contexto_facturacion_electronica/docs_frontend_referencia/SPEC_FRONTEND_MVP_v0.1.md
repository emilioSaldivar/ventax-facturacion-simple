# SPEC FRONTEND MVP v0.1 — Admin y Monitoreo SIFEN

Este documento define el alcance funcional del frontend administrativo del proyecto `facturacion-electronica`.

Se redacta en continuidad con:
- `AGENTS.md`
- `docs/SPEC_MVP_v0.1.md`
- `docs/PLAN_MVP_v0.1.md`
- `docs/SPEC_FRONTEND_FORMS_UX_v0.1.md`
- `docs/PLAN_FRONTEND_FORMS_UX_v0.1.md`
- `spec/openapi.yaml`

El frontend se construira sobre los endpoints ya disponibles del backend y debe permitir operar el sistema sin depender de SQL manual ni acceso directo a la base de datos.

## 1) Proposito

Construir un frontend administrativo y operativo que permita:
- ingresar al sistema con contexto de usuario administrativo,
- visualizar los facturadores permitidos para el usuario,
- configurar integralmente cada facturador,
- monitorear el estado de las facturas por facturador,
- verificar si una factura fue aceptada por SIFEN,
- corregir datos operativos permitidos de facturas no aceptadas,
- reenviar o anular documentos segun elegibilidad backend,
- ejecutar y seguir jobs de sincronizacion de estado,
- administrar usuarios y asignaciones de acceso.

El frontend debe servir tanto para onboarding de facturadores como para operacion diaria.

Debe separarse claramente en dos superficies:
- panel administrativo del facturador;
- panel operativo de facturas.

## 2) Objetivos del frontend

### OF-01 Operacion sin SQL manual
El usuario debe poder crear, corregir y mantener toda la configuracion necesaria para emitir desde pantallas del sistema.

### OF-02 Visibilidad operativa
El usuario debe poder entender rapidamente:
- que facturadores puede operar,
- cuales estan listos para emitir,
- que facturas estan aprobadas, rechazadas o pendientes,
- que facturas necesitan correccion o refresh de estado.

### OF-03 Seguridad por alcance
Un usuario no debe visualizar ni operar facturadores no asignados.

### OF-03.1 Seguridad por permiso funcional
Un usuario no debe visualizar ni ejecutar modulos, tabs o acciones que su rol no permita.

### OF-04 Trazabilidad
El frontend debe exponer historial suficiente para entender:
- cuando se verifico una factura,
- cuando se edito,
- quien la edito,
- cuando se reenviO,
- que ocurrio en un job de sync.

## 3) Perfiles de usuario

### 3.1 `ADMIN_GLOBAL`
Puede:
- ver todos los facturadores,
- crear y editar usuarios,
- asignar facturadores a usuarios,
- operar configuracion y monitoreo sobre cualquier emisor,
- ejecutar sync y acciones correctivas sobre cualquier facturador.

### 3.2 `OPERADOR_FACTURADOR`
Puede:
- ver solo emisores asignados,
- abrir configuracion agregada de sus emisores,
- operar monitoreo, verificacion, edicion y reenvio sobre emisores asignados,
- no puede administrar usuarios globales ni ver emisores no asignados.

## 3.3 Reglas de visibilidad y accion

La UI debe reflejar permisos en dos niveles:
- visibilidad de pantallas, menu, tabs y bloques;
- habilitacion de acciones operativas concretas.

Reglas minimas:
- `ADMIN_GLOBAL` ve y opera todos los modulos.
- `OPERADOR_FACTURADOR` no ve administracion global de usuarios.
- si un usuario no tiene permiso de configuracion, no debe ver formularios sensibles del panel del facturador.
- si un usuario no tiene permiso operativo, no debe ver acciones de correccion, reenvio o anulacion.
- si una accion esta visible pero bloqueada por estado del documento, la UI debe explicar por que.

## 4) Principios funcionales de UX

### 4.1 El frontend trabaja por agregado, no por tabla
La unidad principal es el `facturador`, no tablas sueltas.

Por lo tanto, la UI debe priorizar:
- ficha agregada del emisor,
- readiness,
- resumen de configuracion efectiva,
- accesos directos a componentes editables.

### 4.2 El monitoreo trabaja por bandeja operativa
La vista principal de facturas debe ser una bandeja filtrable y paginada, no un detalle aislado.

### 4.3 Las acciones destructivas o sensibles deben estar contextualizadas
Editar body, reenviar o ejecutar sync deben mostrar:
- emisor,
- ambiente,
- factura objetivo o conjunto objetivo,
- motivo y resultado esperado.

### 4.4 El sistema debe ser explicativo
Cuando un facturador no este listo o una factura no sea editable, la UI debe explicar por que.

## 5) Modulos funcionales del frontend

## 5.0 Separacion funcional del frontend

El frontend debe presentar claramente dos dominios:
- **Configuracion del facturador**
- **Operacion de facturas**

La navegacion, labels, breadcrumbs y permisos deben reflejar esta separacion.

## 5.1 Modulo de acceso y sesion operativa

### Alcance
- identificacion del usuario administrativo,
- carga de contexto inicial,
- conocimiento del rol y emisores permitidos,
- persistencia de sesion del frontend.

### Comportamiento esperado
- el usuario ingresa con credenciales operativas definidas para el MVP,
- el frontend obtiene el perfil y emisores accesibles,
- el layout se adapta segun rol y alcance.

### Datos minimos de contexto
- `user_id`
- `role`
- `activo`
- `emisores asignados`

### Reglas
- si el usuario esta inactivo, no puede operar,
- si no tiene emisores asignados y no es `ADMIN_GLOBAL`, la UI debe mostrar estado vacio explicativo,
- el frontend debe enviar siempre el contexto necesario para autorización del backend.

## 5.2 Modulo de dashboard

### Alcance
Pantalla de entrada con foco operativo.

### Debe mostrar
- resumen de emisores visibles,
- cantidad de emisores listos/no listos,
- accesos rapidos a configuracion,
- accesos rapidos a monitoreo por facturador,
- opcionalmente ultimos jobs de sync o ultimas facturas con problemas.

### Objetivo UX
Permitir que el usuario entienda en segundos donde hay accion pendiente.

## 5.3 Modulo de facturadores

### Alcance
- listado de emisores,
- ficha agregada de configuracion,
- CRUD de componentes operativos.

### Perfil principal
- `ADMIN_GLOBAL`
- usuarios con permiso de configuracion sobre el facturador

### Pantallas requeridas
- listado de facturadores,
- detalle/ficha de facturador,
- formularios de mantenimiento.

### La ficha del facturador debe exponer
- datos base del emisor,
- actividades,
- establecimientos y puntos,
- timbrados,
- CSC por ambiente,
- certificados,
- numeradores,
- batch config efectiva,
- readiness,
- emission resolution efectiva.

### Acciones requeridas
- crear emisor,
- editar emisor,
- crear/editar actividad,
- crear/editar establecimiento,
- crear/editar punto,
- crear/editar timbrado,
- crear/editar CSC,
- crear/editar certificado,
- subir certificado `.pfx/.p12`,
- crear/editar numerador,
- editar o resetear batch config.

### Reglas UX
- readiness debe estar visible siempre en la ficha,
- cada bloque debe indicar si esta resuelto o faltante,
- los secretos no deben mostrarse en claro,
- el upload de certificado debe mostrar metadata util y errores de validacion.
- la pantalla debe dejar claro que esta area configura la capacidad de emision del facturador.

## 5.4 Modulo de monitoreo de facturas

### Alcance
- bandeja operativa por facturador,
- resumen por estados,
- detalle por factura.

### Perfil principal
- contadores,
- operadores de facturas,
- administradores con permiso operativo sobre el facturador

### La bandeja debe soportar
- seleccion de facturador,
- filtro por `env`,
- filtro por fecha de emision `from/to`,
- filtro por fecha de envio `sentFrom/sentTo`,
- filtro por estado interno,
- filtro por estado SIFEN,
- filtro por freshness de cache,
- filtro por establecimiento,
- filtro por punto,
- busqueda por texto libre,
- paginacion.

### Cada fila debe mostrar
- numero de factura,
- CDC,
- receptor,
- fecha de emision,
- fecha de ultimo envio,
- estado interno,
- estado SIFEN cacheado,
- `accepted_by_sifen`,
- `checked_at`,
- `cache_stale`,
- acciones disponibles.

### Acciones por fila
- ver detalle,
- refrescar estado si se habilita desde la vista de detalle,
- editar/reenviar si aplica.

### Resumen requerido
- total de comprobantes filtrados,
- conteo por estado interno,
- conteo por estado SIFEN,
- cantidad de aprobadas,
- cantidad de rechazadas,
- cantidad de pendientes,
- cantidad sin cache,
- cantidad con cache vencido.

## 5.5 Modulo de detalle y verificacion de factura

### Alcance
Pantalla de drill-down para un comprobante concreto.

### Debe mostrar
- identificadores del documento,
- estado interno,
- snapshot SIFEN,
- `accepted_by_sifen`,
- timestamps relevantes,
- ultima respuesta resumida,
- datos operativos relevantes del receptor o contacto,
- elegibilidad de edicion,
- elegibilidad de reenvio,
- historial de revisiones.

### Objetivo UX
Responder rapidamente:
- si ya fue aceptada por SIFEN,
- si el problema es tecnico o fiscal,
- que dato operativo podria estar causando el rechazo,
- si puede corregirse sin editar el contenido fiscal completo,
- si ya fue corregida antes.

### Alcance de correcciones operativas
La UI debe privilegiar correcciones acotadas sobre datos operativos cuando el backend lo soporte, por ejemplo:
- RUC o CI;
- nombre;
- correo;
- direccion.

La UI no debe asumir edicion libre de cualquier campo del documento.

## 5.6 Modulo de sync de estado SIFEN

### Alcance
- solicitud de sync masivo,
- seguimiento de job,
- lectura de resultados.

### La UI debe permitir
- lanzar sync desde la vista del facturador,
- elegir filtros basicos,
- seguir el job hasta `DONE` o `ERROR`,
- abrir el resultado por documento.

### Datos requeridos del job
- `job_id`
- `status`
- `requested_at`
- `started_at`
- `finished_at`
- `total_documents`
- `updated_documents`
- `error_count`
- `last_error`
- detalle de items.

### Reglas UX
- un sync masivo no debe bloquear toda la interfaz,
- debe quedar visible como proceso asincronico,
- si hay errores parciales, la UI debe permitir inspeccionarlos.

## 5.7 Modulo de correccion operativa

### Alcance
- edicion del body de factura,
- inspeccion y edicion avanzada del XML de facturas enviadas y rechazadas,
- reenvio,
- historial de revisiones.

### La UI debe permitir
- abrir el body editable,
- abrir artefactos XML (`xml_unsigned`, `xml_signed`, `xml_qr`) en modo soporte,
- editar XML base de una factura no aceptada por SIFEN,
- validar si la correccion mantiene o cambia el CDC,
- registrar motivo de edicion,
- guardar cambios,
- disparar reenvio en `SYNC`, `BATCH` o modo que se defina disponible hasta lograr aprobacion,
- inutilizar numeracion cuando la correccion requiere nuevo CDC,
- crear un nuevo DE desde una correccion cuando corresponda nueva numeracion,
- consultar revisiones previas.

### Reglas funcionales
- no debe permitir editar una `APPROVED` o `APPROVED_WITH_OBS`,
- debe advertir claramente cuando la accion modifica una revision operativa,
- si se modifica XML, el backend debe volver a firmar y regenerar QR antes de reenviar,
- no debe reenviar XML firmado o XML con QR editado manualmente sin re-firma y re-generacion de QR,
- si el CDC resultante cambia, debe bloquear el reenvio con la misma numeracion y guiar a inutilizacion/nuevo DE,
- debe mostrar el resultado del reenvio y el nuevo estado.

Nota de alcance:
- la correccion avanzada de XML y CDC puede quedar documentada aunque no toda entre en la primera tanda implementable;
- las correcciones operativas simples sobre datos del receptor deben priorizarse cuando existan contratos backend.

### Requisitos UX
- separar visualmente datos originales, datos editados y resultado,
- mostrar motivo de revision como campo obligatorio,
- mostrar XML original y XML editado en secciones diferenciadas,
- advertir que cambios en `Signature`, `DigestValue`, `dCarQR`, `IdCSC` o `cHashQR` invalidan firma/hash si no se regeneran,
- mostrar estado de impacto CDC: `CDC conservado`, `CDC cambiaria` o `Requiere revision`,
- evitar edicion accidental con confirmaciones explicitas.

## 5.8 Modulo de usuarios y permisos

### Alcance
- listado de usuarios,
- alta/edicion,
- activacion/desactivacion,
- asignacion de emisores.

### La UI debe permitir
- crear usuario,
- cambiar rol,
- activar/desactivar,
- ver emisores asignados,
- reemplazar asignaciones.

### Reglas UX
- solo `ADMIN_GLOBAL` debe ver este modulo,
- los cambios de asignacion deben ser claros y auditables para operacion,
- la UI debe reflejar rapidamente el alcance real del usuario.

## 5.9 Reglas de permisos en pantalla

La UI debe implementar guardas de visibilidad y accion, como minimo, para:
- menu lateral;
- rutas protegidas;
- tabs o secciones del facturador;
- acciones de crear/editar;
- acciones de sync;
- acciones de revision, reenvio y anulacion.

## 6) Navegacion funcional requerida

Rutas funcionales sugeridas:
- `/login`
- `/dashboard`
- `/facturadores`
- `/facturadores/:emisorId`
- `/facturadores/:emisorId/configuracion`
- `/facturadores/:emisorId/facturas`
- `/facturadores/:emisorId/facturas/:documentId`
- `/facturadores/:emisorId/sync/:jobId`
- `/usuarios`
- `/usuarios/:userId`

## 7) Flujos principales de usuario

## 7.1 Onboarding de facturador
1. Abrir modulo de facturadores.
2. Crear emisor.
3. Completar actividad principal.
4. Crear establecimiento y punto.
5. Cargar timbrado.
6. Cargar numerador.
7. Cargar CSC.
8. Subir certificado.
9. Validar readiness.
10. Corregir faltantes hasta quedar listo.

## 7.2 Monitoreo diario
1. Seleccionar facturador.
2. Abrir bandeja de facturas.
3. Filtrar por fecha y estado.
4. Detectar rechazadas o pendientes.
5. Abrir detalle si hace falta.

## 7.3 Verificacion y sync
1. Seleccionar facturador.
2. Ejecutar sync masivo con filtros.
3. Seguir job.
4. Revisar items actualizados y errores.

## 7.4 Correccion operativa
1. Abrir factura rechazada o no aceptada.
2. Revisar detalle y respuesta SIFEN.
3. Editar body o XML base con motivo.
4. Guardar revision y validar impacto CDC.
5. Si el CDC se conserva, re-firmar, regenerar QR y reenviar.
6. Si el CDC cambia, bloquear reenvio con la misma numeracion y ofrecer inutilizar numeracion.
7. Crear nuevo DE desde la correccion cuando corresponda.
8. Repetir correccion y reenvio hasta lograr aprobacion o cerrar por inutilizacion.
9. Verificar nuevo estado e historial.

## 7.5 Administracion de usuarios
1. Abrir modulo de usuarios.
2. Crear o editar usuario.
3. Definir rol.
4. Asignar emisores.
5. Validar que el alcance quede restringido.

## 8) Requisitos no funcionales del frontend

### RNF-FE-01 Compatibilidad
- Desktop primero.
- Debe funcionar correctamente en mobile para consultas basicas y aprobaciones operativas simples.

### RNF-FE-02 Performance percibida
- listados con loaders claros,
- filtros con respuesta razonable,
- navegacion sin recargas completas.

### RNF-FE-03 Seguridad
- no persistir secretos sensibles en logs del navegador,
- no mostrar `csc_value` ni passwords en claro,
- respetar siempre el alcance de backend.

### RNF-FE-04 Trazabilidad visual
- toda accion sensible debe dejar feedback visible:
  - exito,
  - error,
  - estado intermedio.

### RNF-FE-05 Claridad operativa
- los estados deben estar normalizados y ser entendibles,
- el usuario no debe necesitar conocer internamente las tablas del backend.

## 9) Dependencias contractuales del frontend

El frontend depende directamente de:
- `spec/openapi.yaml`
- headers de autenticacion operativa definidos por backend,
- endpoints administrativos `/admin/*`,
- endpoints de consulta `/consultar/*`,
- reglas de autorizacion por usuario/emisor.

## 10) Criterios de aceptacion del frontend MVP

El frontend MVP se considera funcional cuando:
1. Un `ADMIN_GLOBAL` puede operar configuracion completa de un facturador desde UI.
2. Un `OPERADOR_FACTURADOR` solo ve sus emisores asignados.
3. La bandeja de facturas permite filtrar por fechas, estados y ambiente.
4. El detalle de factura informa claramente si fue aceptada por SIFEN.
5. Se puede lanzar y seguir un sync de estado por facturador.
6. Se puede editar y reenviar una factura no aceptada desde la UI.
7. Se puede administrar usuarios y asignaciones desde la UI.
8. No se requieren scripts SQL manuales para la operacion diaria.
9. La UI diferencia claramente entre panel del facturador y panel operativo de facturas.
10. Las pantallas, tabs y acciones visibles reflejan rol, alcance y permisos efectivos.
