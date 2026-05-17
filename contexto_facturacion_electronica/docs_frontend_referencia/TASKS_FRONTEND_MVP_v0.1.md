# TASKS FRONTEND MVP v0.1 — Admin y Monitoreo SIFEN

Backlog atomico alineado a:
- `docs/SPEC_FRONTEND_MVP_v0.1.md`
- `docs/PLAN_FRONTEND_MVP_v0.1.md`
- `docs/SPEC_MVP_v0.1.md`
- `spec/openapi.yaml`

## Segmentacion de ejecucion

### Etapa F1 — Fundacion del frontend
Objetivo:
- dejar listo el proyecto frontend, layout base y capa de integracion con API.

Tareas:
- `FE001`
- `FE002`
- `FE003`
- `FE004`
- `FE005`

Resultado esperado:
- proyecto React/Vite inicializado,
- cliente API comun,
- rutas protegidas,
- sesion operativa y shell base.

### Etapa F2 — Dashboard y facturadores
Objetivo:
- dar una vista inicial del universo de emisores y su estado operativo.

Tareas:
- `FE006`
- `FE007`
- `FE008`
- `FE009`

Resultado esperado:
- dashboard funcional,
- listado de facturadores,
- ficha agregada del emisor,
- readiness visible.

### Etapa F3 — Configuracion operativa del facturador
Objetivo:
- permitir mantenimiento de configuracion desde frontend.

Tareas:
- `FE010`
- `FE011`
- `FE012`
- `FE013`
- `FE014`
- `FE015`
- `FE016`

Resultado esperado:
- formularios y mutaciones para emisor, actividades, establecimientos, puntos,
- timbrados, CSC, certificados, numeradores y batch config.

### Etapa F4 — Monitoreo de facturas
Objetivo:
- permitir operacion diaria sobre la bandeja de comprobantes.

Tareas:
- `FE017`
- `FE018`
- `FE019`
- `FE020`

Resultado esperado:
- bandeja con filtros,
- resumen por estados,
- detalle por factura,
- consulta operativa usable.

### Etapa F5 — Sync y verificacion fiscal
Objetivo:
- soportar refresh masivo y trazabilidad de jobs.

Tareas:
- `FE021`
- `FE022`
- `FE023`

Resultado esperado:
- launcher de sync,
- polling/seguimiento de jobs,
- detalle de resultados por documento.

### Etapa F6 — Correccion operativa
Objetivo:
- permitir editar y reenviar facturas no aceptadas.

Tareas:
- `FE024`
- `FE025`
- `FE026`

Resultado esperado:
- edicion del body,
- historial de revisiones,
- reenvio con feedback claro.

### Etapa F7 — Usuarios y permisos
Objetivo:
- permitir administracion de usuarios y asignaciones desde frontend.

Tareas:
- `FE027`
- `FE028`
- `FE029`

Resultado esperado:
- modulo de usuarios operativo,
- asignacion usuario-emisor,
- guardas de rol en la UI.

### Etapa F8 — Calidad, hardening y salida a QA
Objetivo:
- estabilizar el frontend antes de despliegue.

Tareas:
- `FE030`
- `FE031`
- `FE032`
- `FE033`

Resultado esperado:
- testing base,
- manejo uniforme de errores,
- build reproducible,
- documentacion de deploy del frontend.

## Camino critico recomendado

Orden recomendado:
1. `Etapa F1`
2. `Etapa F2`
3. `Etapa F4`
4. `Etapa F5`
5. `Etapa F6`
6. `Etapa F3`
7. `Etapa F7`
8. `Etapa F8`

Justificacion:
- sin shell, sesion y cliente API no hay base para nada;
- el valor operativo aparece rapido con dashboard + bandeja;
- sync y correccion tienen impacto directo en operacion diaria;
- la configuracion profunda puede entrar luego del esqueleto operacional;
- usuarios/permisos requiere ya tener el resto visible para probar alcance real.

## Entregables por iteracion

### Iteracion 1
- `Etapa F1`
- `Etapa F2`

Entrega:
- frontend navegable con dashboard, listado y detalle de facturadores.

### Iteracion 2
- `Etapa F4`
- `Etapa F5`

Entrega:
- frontend con bandeja de facturas, detalle y sync de estado.

### Iteracion 3
- `Etapa F6`
- `Etapa F3`

Entrega:
- frontend con correccion operativa y mantenimiento de configuracion.

### Iteracion 4
- `Etapa F7`
- `Etapa F8`

Entrega:
- frontend listo para QA/UAT y preparado para deploy.

## Bloque A — Fundacion del frontend

### FE001 — Crear proyecto frontend base
**Objetivo:** Crear la carpeta y toolchain inicial.
- crear `frontend/`,
- definir `package.json`,
- definir `tsconfig`,
- definir `vite.config`,
- definir entrypoint y estructura base.

**Criterio de aceptacion**
- el proyecto frontend compila localmente con comando de build.

### FE002 — Implementar shell base y layout principal
**Objetivo:** Tener navegacion base reutilizable.
- layout con sidebar y topbar,
- zonas para contenido, loading global y errores,
- soporte a sesion actual.

**Criterio de aceptacion**
- el usuario autenticado puede navegar entre modulos principales.

### FE003 — Implementar cliente API comun
**Objetivo:** Centralizar integracion con backend.
- wrapper sobre `fetch`,
- inyeccion de `x-api-key` y `x-user-id`,
- manejo comun de errores,
- soporte de query params.

**Criterio de aceptacion**
- todos los modulos consumen el backend mediante una sola capa compartida.

### FE004 — Implementar sesion operativa del MVP
**Objetivo:** Resolver contexto de usuario actual.
- formulario simple de ingreso,
- persistencia local de contexto,
- carga de usuario y emisores asignados,
- logout.

**Criterio de aceptacion**
- el frontend puede operar usando el modelo actual de headers del backend.

### FE005 — Implementar routing protegido
**Objetivo:** Restringir acceso segun contexto.
- rutas publicas y privadas,
- guardas de sesion,
- redireccion al login si no hay contexto valido.

**Criterio de aceptacion**
- ninguna pantalla operativa es accesible sin sesion.

## Bloque B — Dashboard y facturadores

### FE006 — Implementar dashboard inicial
**Objetivo:** Ofrecer una vista ejecutiva de entrada.
- cantidad de emisores visibles,
- cantidad listos/no listos,
- accesos rapidos a facturadores.

**Criterio de aceptacion**
- el dashboard se alimenta de datos reales del backend.

### FE007 — Implementar listado de facturadores
**Objetivo:** Permitir descubrir emisores y su readiness.
- tabla/lista de emisores,
- paginacion,
- badges de readiness,
- acceso al detalle.

**Criterio de aceptacion**
- el usuario puede ver solo los emisores que el backend le devuelve.

### FE008 — Implementar ficha agregada del facturador
**Objetivo:** Mostrar configuracion operativa consolidada.
- datos base,
- configuracion agregada,
- readiness,
- emission resolution,
- batch config efectiva.

**Criterio de aceptacion**
- la ficha del facturador se construye casi totalmente con `GET /admin/emisores/{id}/configuracion`.

### FE009 — Implementar bloque visual de readiness
**Objetivo:** Mostrar faltantes operativos de forma clara.
- checks positivos,
- faltantes,
- estado `ready`.

**Criterio de aceptacion**
- el usuario entiende por que un facturador no esta listo.

## Bloque C — Configuracion operativa del facturador

### FE010 — Formularios de emisor y actividad
**Objetivo:** Permitir alta/edicion de datos base.
- crear/editar emisor,
- crear/editar actividad principal.

**Criterio de aceptacion**
- el usuario puede crear un facturador y definir actividad principal desde UI.

### FE011 — Formularios de establecimientos y puntos
**Objetivo:** Mantener sedes operativas del emisor.
- alta/edicion de establecimientos,
- alta/edicion de puntos de expedicion.

**Criterio de aceptacion**
- la ficha permite administrar establecimientos y puntos sin SQL.

### FE012 — Formularios de timbrados y numeradores
**Objetivo:** Mantener secuencia fiscal y vigencia.
- alta/edicion de timbrados,
- alta/edicion de numeradores.

**Criterio de aceptacion**
- el frontend cubre las entidades necesarias para emitir.

### FE013 — Formularios de CSC
**Objetivo:** Mantener CSC por ambiente.
- crear/editar CSC,
- distinguir `test` y `prod`,
- ocultar valores sensibles.

**Criterio de aceptacion**
- el usuario puede mantener CSC sin ver el secreto en claro.

### FE014 — Upload y gestion de certificados
**Objetivo:** Cubrir alta operativa de certificado.
- formulario `multipart`,
- upload `.pfx/.p12`,
- metadata basica,
- listado de certificados disponibles.

**Criterio de aceptacion**
- el usuario puede subir y verificar un certificado desde UI.

### FE015 — Gestion de batch config
**Objetivo:** Mostrar y mantener la configuracion efectiva de lotes.
- ver configuracion efectiva,
- setear override,
- resetear a default.

**Criterio de aceptacion**
- el usuario puede entender y cambiar la politica batch del emisor.

### FE016 — Invalidacion y refresco de configuracion
**Objetivo:** Mantener consistencia de UI tras mutaciones.
- invalidar queries relevantes,
- refrescar readiness,
- refrescar ficha agregada.

**Criterio de aceptacion**
- la UI refleja cambios sin recargas manuales.

## Bloque D — Monitoreo de facturas

### FE017 — Implementar bandeja operativa de facturas
**Objetivo:** Exponer la consulta principal por facturador.
- tabla paginada,
- resumen,
- acciones por fila.

**Criterio de aceptacion**
- la bandeja usa `GET /admin/emisores/{id}/facturas/estado`.

### FE018 — Implementar filtros avanzados de facturas
**Objetivo:** Soportar busqueda operativa real.
- `env`,
- `from/to`,
- `sentFrom/sentTo`,
- `status`,
- `sifenStatus`,
- `freshness`,
- `establecimiento`,
- `punto`,
- `q`.

**Criterio de aceptacion**
- el usuario puede acotar la bandeja por fechas y estados.

### FE019 — Implementar detalle de factura
**Objetivo:** Exponer verificacion individual del comprobante.
- estado interno,
- snapshot SIFEN,
- `accepted_by_sifen`,
- timestamps,
- flags operativos.

**Criterio de aceptacion**
- el usuario puede saber si la factura ya fue aceptada por SIFEN.

### FE020 — Integrar consultas complementarias por CDC
**Objetivo:** Mantener drill-down tecnico disponible.
- acceso a endpoints de consulta existentes,
- vista complementaria para XML/estado por CDC si aplica.

**Criterio de aceptacion**
- el frontend no pierde cobertura de consultas actuales.

## Bloque E — Sync y verificacion

### FE021 — Implementar launcher de sync
**Objetivo:** Poder solicitar refresh masivo.
- formulario de filtros basicos,
- disparo de `POST /admin/emisores/{id}/facturas/estado/sync`.

**Criterio de aceptacion**
- desde UI se crea un job y se obtiene `job_id`.

### FE022 — Implementar seguimiento de job
**Objetivo:** Mostrar evolucion del sync.
- polling mientras el job no finalice,
- estado y contadores,
- errores globales.

**Criterio de aceptacion**
- el usuario puede seguir un sync hasta `DONE` o `ERROR`.

### FE023 — Implementar detalle de items del job
**Objetivo:** Ver resultado documento por documento.
- `previous_status_json`,
- `new_status_json`,
- `result`,
- `error_message`.

**Criterio de aceptacion**
- el usuario puede auditar el refresh masivo.

## Bloque F — Correccion operativa

### FE024 — Implementar vista de revisiones
**Objetivo:** Exponer historial de cambios.
- lista de revisiones,
- motivo,
- usuario,
- timestamps.

**Criterio de aceptacion**
- el usuario ve el historial de una factura editada o reenviada.

### FE025 — Implementar formulario de edicion del body
**Objetivo:** Permitir correccion controlada.
- editar body,
- capturar motivo,
- enviar `PATCH`.

**Criterio de aceptacion**
- el frontend solo habilita la accion si la factura es elegible.

### FE026 — Implementar reenvio de factura
**Objetivo:** Completar el ciclo correctivo.
- accion de resend,
- seleccion de modo,
- feedback de resultado.

**Criterio de aceptacion**
- el usuario puede reenviar y ver reflejado el nuevo estado.

## Bloque G — Usuarios y permisos

### FE027 — Implementar listado y detalle de usuarios
**Objetivo:** Exponer administracion de usuarios.
- listado,
- alta,
- edicion,
- estado activo.

**Criterio de aceptacion**
- `ADMIN_GLOBAL` puede mantener usuarios desde UI.

### FE028 — Implementar asignacion usuario-emisor
**Objetivo:** Administrar alcance por operador.
- listar emisores asignados,
- reemplazar asignaciones.

**Criterio de aceptacion**
- el usuario admin puede ajustar el alcance de un operador desde UI.

### FE029 — Guardas de rol y visibilidad en la UI
**Objetivo:** Evitar accesos inconsistentes del lado cliente.
- ocultar modulo usuarios para operadores,
- controlar menus y acciones visibles segun rol.

**Criterio de aceptacion**
- la UI acompana el enforcement del backend.

## Bloque H — Calidad y salida a QA

### FE030 — Testing base del frontend
**Objetivo:** Cubrir cimientos de UI.
- pruebas de cliente API,
- pruebas de guards,
- pruebas de componentes/paginas clave.

**Criterio de aceptacion**
- existe una base minima de testing automatizado.

### FE031 — Manejo transversal de errores y estados vacios
**Objetivo:** Hacer la UI operable.
- loaders,
- errores HTTP,
- empty states,
- forbidden states.

**Criterio de aceptacion**
- todas las pantallas principales tienen feedback claro.

### FE032 — Build y configuracion de entorno
**Objetivo:** Preparar integracion con deploy.
- variables `VITE_*`,
- build reproducible,
- base URL configurable.

**Criterio de aceptacion**
- el frontend puede construirse por ambiente.

### FE033 — Documentacion de deploy frontend
**Objetivo:** Preparar salida a QA/produccion.
- runbook de frontend,
- variables necesarias,
- recomendaciones de reverse proxy y CORS.

**Criterio de aceptacion**
- existe documentacion suficiente para desplegar el frontend.
