# PLAN FRONTEND MVP v0.1 — Admin y Monitoreo SIFEN

Este documento describe el diseno tecnico del frontend administrativo del proyecto `facturacion-electronica`.

Se apoya en:
- `docs/SPEC_FRONTEND_MVP_v0.1.md`
- `docs/SPEC_MVP_v0.1.md`
- `docs/PLAN_MVP_v0.1.md`
- `spec/openapi.yaml`

## 1) Arquitectura general

### 1.1 Tipo de aplicacion
Se propone una SPA administrativa:
- `React`
- `TypeScript`
- `Vite`

Motivos:
- time-to-market rapido,
- integracion simple con API REST existente,
- buena experiencia para bandejas, formularios y estados asincronicos.

### 1.2 Librerias base recomendadas

#### Routing
- `react-router-dom`

#### Data fetching / cache
- `@tanstack/react-query`

#### Formularios
- `react-hook-form`
- `zod`

#### UI base
- componentes propios o `shadcn/ui`
- tabla con soporte de paginacion/filtros

#### Utilidades
- cliente HTTP simple sobre `fetch`
- normalizadores de query params
- helpers de fechas

## 2) Decisiones de diseno

### 2.1 Backend-driven UI
El frontend debe reflejar el modelo operativo del backend y no inventar reglas de negocio paralelas.

Consecuencia:
- readiness viene del backend,
- elegibilidad de edicion/reenvio viene del backend,
- autorizacion real la decide el backend,
- el frontend solo mejora experiencia y composicion.

### 2.2 Dominio principal: `facturador`
La navegacion se estructura alrededor de `facturadores/:emisorId`.

Todo el monitoreo, configuracion y sync cuelga de ese contexto.

### 2.3 Shell unico con contexto de sesion
Se recomienda un layout principal con:
- barra lateral,
- topbar,
- selector de facturador cuando aplique,
- contexto de usuario y rol,
- feedback global de errores/acciones.

### 2.4 Mutaciones explicitas
Las acciones de impacto operativo deben modelarse como mutaciones con feedback claro:
- guardar configuracion,
- subir certificado,
- ejecutar sync,
- editar factura,
- reenviar factura,
- reemplazar asignaciones.

### 2.5 No duplicar cache fiscal sensible
El frontend no debe persistir localmente informacion sensible de certificados o CSC.
Solo debe mantener cache efimero de lectura de datos operativos.

## 3) Estructura propuesta del frontend

## 3.1 Modulos de codigo

Estructura sugerida:

```text
frontend/
  src/
    app/
    modules/
      auth/
      dashboard/
      facturadores/
      facturas/
      status-sync/
      revisions/
      users/
    shared/
      api/
      components/
      hooks/
      lib/
      schemas/
      types/
```

### 3.2 Criterio de modularizacion
- `modules/*`: dominio funcional.
- `shared/api`: cliente HTTP, manejo de headers, manejo de errores.
- `shared/components`: layout, tablas, filtros, estados vacios, formularios comunes.
- `shared/types`: tipos generados o alineados a OpenAPI.

## 4) Modelo de estado del frontend

## 4.1 Estado global ligero
Conviene mantener globalmente solo:
- sesion actual,
- usuario actual,
- rol,
- emisores accesibles,
- facturador seleccionado cuando aplique,
- configuracion de layout.

Esto puede vivir en:
- React Context simple, o
- un store liviano si luego hace falta.

## 4.2 Estado remoto
Debe gestionarse con `React Query`:
- listados,
- detalle de facturador,
- readiness,
- configuracion agregada,
- bandeja de facturas,
- detalle de factura,
- revisiones,
- jobs de sync,
- usuarios,
- asignaciones.

## 4.3 Estado de formularios
Cada formulario debe ser local y autocontenido con `react-hook-form`.

## 5) Cliente API

## 5.1 Requisitos del cliente
El cliente debe:
- inyectar `x-api-key`,
- inyectar `x-user-id` o el mecanismo vigente,
- soportar query params,
- mapear errores HTTP a errores de UI,
- exponer request id si el backend lo devuelve.

## 5.2 Capas recomendadas

### Capa 1: transport
Funcionalidad:
- `GET`, `POST`, `PATCH`, `PUT`, `DELETE`,
- serializacion de query params,
- parseo seguro de respuestas.

### Capa 2: endpoints por dominio
Ejemplos:
- `authApi`
- `facturadoresApi`
- `facturasApi`
- `statusSyncApi`
- `usersApi`

### Capa 3: hooks de React Query
Ejemplos:
- `useFacturadores`
- `useFacturadorConfiguracion`
- `useFacturasEstado`
- `useFacturaDetalle`
- `useFacturaRevisiones`
- `useCreateStatusSyncJob`
- `useStatusSyncJob`
- `useUsers`

## 6) Diseno de navegacion

## 6.1 Arbol principal de rutas

```text
/login
/dashboard
/facturadores
/facturadores/:emisorId
/facturadores/:emisorId/configuracion
/facturadores/:emisorId/facturas
/facturadores/:emisorId/facturas/:documentId
/facturadores/:emisorId/sync/:jobId
/usuarios
/usuarios/:userId
```

## 6.2 Rutas protegidas
Todas salvo `/login` deben requerir sesion/contexto valido.

## 6.3 Guards de rol
- `/usuarios*` solo `ADMIN_GLOBAL`
- resto segun alcance permitido por backend

## 7) Diseno por pantallas

## 7.1 Login

### Objetivo
Inicializar contexto operativo.

### Contenido
- identificador de usuario
- API key o mecanismo operativo del MVP

### Resultado esperado
- cargar usuario
- cargar rol
- cargar emisores accesibles
- redirigir a dashboard

## 7.2 Dashboard

### Objetivo
Resumen ejecutivo de operacion.

### Widgets recomendados
- cantidad de facturadores visibles
- cantidad listos/no listos
- accesos rapidos a ultimos facturadores usados
- accesos rapidos a facturas con problemas
- accesos a sync recientes

### Fuente principal
- listado de emisores
- readiness resumido

## 7.3 Listado de facturadores

### Objetivo
Dar entrada a la configuracion y operacion por emisor.

### Componentes
- tabla/lista de emisores
- badges de readiness
- filtro por ambiente o texto si aplica
- accion de crear emisor para `ADMIN_GLOBAL`

## 7.4 Ficha de facturador

### Objetivo
Mostrar configuracion agregada y estado operativo del emisor.

### Secciones
- datos base
- readiness
- configuracion efectiva de emision
- actividades
- establecimientos y puntos
- timbrados
- CSC
- certificados
- numeradores
- batch config

### Patrones UI recomendados
- cards por bloque
- badges de estado
- CTA de correccion por bloque faltante

## 7.5 Bandeja de facturas

### Objetivo
Ser la pantalla central de operacion.

### Layout recomendado
- encabezado con emisor y ambiente
- bloque de filtros
- bloque resumen
- tabla principal

### Filtros
- `env`
- `from`
- `to`
- `sentFrom`
- `sentTo`
- `status`
- `sifenStatus`
- `freshness`
- `establecimiento`
- `punto`
- `q`

### Tabla
Columnas recomendadas:
- numero
- CDC
- receptor
- fecha emision
- fecha envio
- estado interno
- estado SIFEN
- aceptacion
- freshness
- acciones

### Acciones
- ver detalle
- abrir revisiones
- editar si aplica
- reenviar si aplica

## 7.6 Detalle de factura

### Objetivo
Resolver investigacion operativa de un caso.

### Secciones
- identificacion general
- estado interno y fiscal
- timestamps
- ultima respuesta SIFEN
- XML/artefactos si luego se expone acceso
- elegibilidad de edicion/reenvio
- revisiones historicas

## 7.7 Formulario de edicion y reenvio

### Objetivo
Permitir correccion controlada.

### Requisitos
- cargar body editable actual
- mostrar motivo obligatorio
- guardar cambios
- reenviar con modo seleccionado
- refrescar detalle luego del resultado

### Riesgos UX a evitar
- editar sin contexto
- reenviar sin confirmar
- perder trazabilidad visual del cambio

## 7.8 Pantalla de job de sync

### Objetivo
Seguir el resultado de sincronizacion masiva.

### Secciones
- cabecera del job
- estado actual
- contadores
- lista de items procesados
- errores

### Patron recomendado
Polling mientras el job este `PENDING` o `RUNNING`.

## 7.9 Listado y detalle de usuarios

### Objetivo
Administrar acceso.

### Elementos
- tabla de usuarios
- formulario de alta/edicion
- selector multiple de emisores
- estado activo/inactivo
- rol

## 8) Mapas de integracion con API

## 8.1 Modulo auth/contexto
Endpoints relevantes:
- `GET /admin/users/{userId}`
- `GET /admin/users/{userId}/emisores`

Nota:
- el backend hoy resuelve autorizacion por headers; el frontend debe encapsular esto para facilitar futura migracion a auth real.

## 8.2 Modulo facturadores
Endpoints relevantes:
- `GET /admin/emisores`
- `POST /admin/emisores`
- `GET /admin/emisores/{id}`
- `PATCH /admin/emisores/{id}`
- `GET /admin/emisores/{id}/configuracion`
- `GET /admin/emisores/{id}/readiness`
- `POST/GET/PATCH` de actividades
- `POST/GET/PATCH` de establecimientos
- `POST/GET/PATCH` de puntos
- `POST/GET/PATCH` de timbrados
- `POST/GET/PATCH` de CSC
- `POST/GET/PATCH` de certificados
- `POST /admin/emisores/{id}/certificados/upload`
- `POST/GET/PATCH` de numeradores
- `PUT/DELETE /admin/emisores/{id}/batch-config`
- `GET /admin/emisores/{id}/batch-config-efectiva`

## 8.3 Modulo monitoreo
Endpoints relevantes:
- `GET /admin/emisores/{id}/facturas/estado`
- `GET /admin/emisores/{id}/facturas/{documentId}`
- `GET /consultar/comprobante/{cdc}`
- `GET /consultar/comprobantexml/{cdc}`
- `GET /consultar/comprobanteSifen/{cdc}`

## 8.4 Modulo sync
Endpoints relevantes:
- `POST /admin/emisores/{id}/facturas/estado/sync`
- `GET /admin/emisores/{id}/facturas/estado/sync/{jobId}`

## 8.5 Modulo revisiones
Endpoints relevantes:
- `PATCH /admin/emisores/{id}/facturas/{documentId}/body`
- `POST /admin/emisores/{id}/facturas/{documentId}/resend`
- `GET /admin/emisores/{id}/facturas/{documentId}/revisiones`

## 8.6 Modulo usuarios
Endpoints relevantes:
- `GET /admin/users`
- `POST /admin/users`
- `GET /admin/users/{userId}`
- `PATCH /admin/users/{userId}`
- `GET /admin/users/{userId}/emisores`
- `PUT /admin/users/{userId}/emisores`

## 9) Estrategia de cache e invalidacion

## 9.1 Listados
Cache corto y revalidacion por foco.

## 9.2 Detalles
Cache por `emisorId` o `documentId`, invalidado luego de mutaciones.

## 9.3 Mutaciones que deben invalidar

### Facturadores
- crear/editar emisor
- editar actividades/establecimientos/puntos/timbrados/CSC/certificados/numeradores
- upload de certificado
- cambio batch config

Invalidar:
- listado de emisores
- configuracion agregada
- readiness

### Facturas
- editar body
- resend
- sync individual o masivo

Invalidar:
- bandeja del emisor
- detalle de factura
- revisiones
- job de sync si aplica

### Usuarios
- alta/edicion
- cambio de asignaciones

Invalidar:
- listado de usuarios
- detalle usuario
- asignaciones

## 10) Manejo de errores

## 10.1 Tipos de error a contemplar
- `401 UNAUTHORIZED`
- `403 FORBIDDEN`
- `404 NOT_FOUND`
- `409 CONFLICT`
- `422` errores de validacion o certificado invalido
- `500 INTERNAL_ERROR`

## 10.2 Estrategia UI
- errores de formulario cerca del campo,
- errores de negocio como alertas contextuales,
- errores globales con mensaje y request id si existe,
- `403` con mensaje explicativo de alcance insuficiente.

## 11) Estrategia de seguridad del frontend

### 11.1 Para el MVP
Mientras no exista auth real, encapsular:
- `x-api-key`
- `x-user-id`

en una sola capa del cliente API.

### 11.2 Para evolucion futura
Disenar el frontend de modo que luego pueda migrar a:
- login real,
- token bearer,
- refresh token,
- RBAC mas formal

sin reescribir las pantallas.

## 12) Estrategia de testing del frontend

### 12.1 Unitario
- componentes puros,
- helpers de estado,
- parseo de query params,
- guards de permisos.

### 12.2 Integracion
- paginas con mocks de API,
- formularios,
- transiciones de estado,
- invalidacion de queries.

### 12.3 E2E
Flujos minimos:
- login/contexto,
- listar facturadores,
- abrir configuracion,
- abrir bandeja de facturas,
- ver detalle,
- editar y reenviar una factura elegible,
- ejecutar sync y ver resultado,
- administrar usuario y asignaciones.

## 13) Riesgos y mitigaciones

### Riesgo 1: demasiados formularios desconectados
Mitigacion:
- ficha agregada por facturador,
- navegacion consistente por bloques.

### Riesgo 2: UI compleja por exceso de estados fiscales
Mitigacion:
- badges normalizados,
- textos explicativos,
- detalle de factura como fuente de verdad.

### Riesgo 3: duplicar reglas del backend en frontend
Mitigacion:
- usar flags del backend como `ready`, `accepted_by_sifen`, `editable`, `resend_allowed`.

### Riesgo 4: errores por cache stale
Mitigacion:
- invalidaciones claras,
- polling solo donde tiene sentido,
- indicadores de freshness visibles.

### Riesgo 5: acoplamiento al mecanismo actual de headers
Mitigacion:
- wrapper de autenticacion aislado.

## 14) Orden recomendado de implementacion

### Fase 1
- scaffold del proyecto
- layout base
- cliente API
- contexto de sesion
- routing protegido

### Fase 2
- listado de facturadores
- dashboard basico
- ficha de configuracion agregada
- readiness

### Fase 3
- formularios de configuracion operativa
- upload de certificado
- batch config

### Fase 4
- bandeja de facturas
- filtros por fechas y estados
- detalle de factura

### Fase 5
- sync de estado
- job detail

### Fase 6
- edicion y reenvio
- revisiones

### Fase 7
- usuarios y asignaciones
- endurecimiento de permisos UI

### Fase 8
- tests E2E
- pulido UX
- preparacion para deploy del frontend

## 15) Definicion de listo para implementacion

El frontend queda listo para arrancar cuando:
1. este spec y este plan sean aceptados,
2. se elija stack definitivo de UI,
3. se defina el repositorio o carpeta de destino del frontend,
4. se acuerde si el frontend vivira:
   - dentro del monorepo actual,
   - en carpeta `frontend/`,
   - o en repositorio separado.
