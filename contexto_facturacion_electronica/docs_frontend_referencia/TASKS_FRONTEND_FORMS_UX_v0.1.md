# TASKS FRONTEND FORMS UX v0.1

Backlog atomico alineado a:
- `docs/SPEC_FRONTEND_FORMS_UX_v0.1.md`
- `docs/PLAN_FRONTEND_FORMS_UX_v0.1.md`
- `docs/SPEC_FRONTEND_MVP_v0.1.md`
- `spec/openapi.yaml`

Este backlog incluye solo tareas implementables y sin ambiguedad dentro de las fases ejecutables actuales.

Queda explicitamente fuera de este archivo la implementacion completa de:
- correccion avanzada de `xml_unsigned`;
- prevalidacion CDC con bloqueo de flujo;
- reintento manteniendo CDC;
- inutilizacion guiada por cambio de CDC;
- creacion de nuevo DE derivado.

Esas capacidades deben quedar documentadas en `SPEC`, `PLAN` y `OpenAPI`, pero su implementacion detallada se programa en una iniciativa posterior.

## Segmentacion De Ejecucion

### Etapa UXF0 — Contratos Backend Y Runtime
Objetivo:
- dejar listos los contratos backend, reglas de secretos y runtime local antes de migrar formularios.

Tareas:
- `UXF001`
- `UXF002`
- `UXF003`
- `UXF004`

Resultado esperado:
- endpoints administrativos consistentes para formularios tipados,
- OpenAPI alineado,
- reglas de no sobrescritura para secretos/archivos,
- volumenes runtime documentados y coherentes.

### Etapa UXF1 — Fundacion De Formularios
Objetivo:
- crear la base comun de formularios reutilizables con `react-hook-form` y `zod`.

Tareas:
- `UXF005`
- `UXF006`
- `UXF007`
- `UXF008`

Resultado esperado:
- componentes compartidos,
- capa comun de validacion y mapeo,
- estilos base,
- integracion lista para reemplazar JSON.

### Etapa UXF2 — Reestructura De Facturador Detail
Objetivo:
- reorganizar la pantalla del facturador antes de reemplazar los CRUD JSON.

Tareas:
- `UXF009`
- `UXF010`
- `UXF011`

Resultado esperado:
- `FacturadorDetailPage` seccionada,
- resumen superior claro,
- diagnostico tecnico separado del flujo principal,
- identidad clara de panel de configuracion del facturador.

### Etapa UXF2.1 — Pulido Visual Y Estabilidad De Layout
Objetivo:
- corregir errores de visualizacion de formularios ya implementados y estabilizar layout, jerarquia y responsive.

Tareas:
- `UXF011A`
- `UXF011B`
- `UXF011C`
- `UXF011D`

Resultado esperado:
- formularios operativos con layout consistente;
- seleccion lateral clara;
- headers y acciones sin colisiones;
- viewport estrecho usable en operacion real.

### Etapa UXF3 — Formularios Basicos Del Facturador
Objetivo:
- reemplazar JSON en entidades operativas simples.

Tareas:
- `UXF012`
- `UXF013`
- `UXF014`
- `UXF015`

Resultado esperado:
- emisor,
- actividades,
- establecimientos,
- puntos de expedicion gestionados sin JSON.

### Etapa UXF4 — Formularios Fiscales Criticos
Objetivo:
- reducir errores en timbrados, CSC y certificados.

Tareas:
- `UXF016`
- `UXF017`
- `UXF018`
- `UXF019`

Resultado esperado:
- formularios guiados para datos fiscales sensibles,
- `IdCSC` sin padding,
- secretos y certificados con politica "no cambiar" si se omiten.

### Etapa UXF5 — Numeradores Y Batch Config
Objetivo:
- eliminar JSON en configuracion operativa recurrente.

Tareas:
- `UXF020`
- `UXF021`

Resultado esperado:
- numeradores y batch config operables desde formularios.

### Etapa UXF6 — Facturas Y Soporte Operativo Base
Objetivo:
- mejorar bandeja y detalle sin entrar aun en la correccion avanzada de XML/CDC.

Tareas:
- `UXF022`
- `UXF023`
- `UXF024`

Resultado esperado:
- bandeja mas legible,
- detalle con diagnostico y artefactos visibles,
- modo soporte base sin depender de JSON como vista principal,
- separacion clara con respecto al panel de configuracion del facturador.

### Etapa UXF6.1 — Roles, Permisos Y Visibilidad
Objetivo:
- reflejar permisos y roles tanto en navegacion como en acciones.

Tareas:
- `UXF028`
- `UXF029`
- `UXF030`

Resultado esperado:
- rutas, tabs y acciones alineadas a rol y permiso efectivo.

### Etapa UXF7 — Limpieza Y Salida A Validacion
Objetivo:
- cerrar la migracion principal y verificar que no queden dependencias operativas de JSON.

Tareas:
- `UXF025`
- `UXF026`
- `UXF027`

Resultado esperado:
- flujo principal sin `JsonCrudSection`,
- build estable,
- validacion manual minima cerrada.

## Camino Critico Recomendado

Orden recomendado:
1. `Etapa UXF0`
2. `Etapa UXF6` en su parte contractual/backend-base
3. `Etapa UXF1`
4. `Etapa UXF2`
5. `Etapa UXF4`
6. `Etapa UXF3`
7. `Etapa UXF5`
8. `Etapa UXF7`

Justificacion:
- sin contratos y reglas de secretos, el frontend corre riesgo de duplicar o romper payloads;
- la visibilidad operativa de facturas puede mejorar parcialmente antes de terminar toda la migracion de formularios;
- CSC y certificados son puntos de riesgo fiscal mas altos que el resto del CRUD;
- la limpieza final debe ejecutarse cuando ya no queden dependencias funcionales de JSON.

## Bloque A — Contratos Backend Y Runtime

### UXF001 — Ajustar contratos admin para secretos y archivos sensibles
**Objetivo:** soportar formularios sin sobrescribir valores sensibles por omision.
- revisar `src/domain/admin.schema.ts` para distinguir alta vs edicion en `CSC` y certificados;
- permitir que `csc_value` omitido en edicion signifique "no cambiar";
- permitir que password o archivo de certificado omitidos en edicion signifiquen "no cambiar" cuando aplique;
- alinear validaciones y mensajes de error con esta regla.

**Criterio de aceptacion**
- un `PATCH` administrativo no reemplaza secretos ni archivos por vacio cuando el cliente los omite.

### UXF002 — Reflejar contratos administrativos en OpenAPI
**Objetivo:** dejar trazables los contratos que consumira el frontend.
- actualizar `spec/openapi.yaml` para endpoints de:
  - `emisores`,
  - `actividades`,
  - `establecimientos`,
  - `puntos`,
  - `timbrados`,
  - `csc`,
  - `certificados`,
  - `numeradores`,
  - `batch-config`,
  - `facturas detalle` y artefactos base si corresponde;
- documentar campos opcionales de edicion sensible como "no cambiar";
- documentar responses utiles para formularios y diagnostico.

**Criterio de aceptacion**
- `spec/openapi.yaml` describe los payloads y responses necesarios para las pantallas de esta iniciativa.

### UXF003 — Revisar runtime y volumenes del proyecto para datos operativos
**Objetivo:** asegurar que secretos, certificados y artefactos relevantes tengan ubicacion clara en runtime local.
- revisar `Dockerfile`, `docker-compose.yml` y `docker-compose.prod.yml`;
- confirmar el uso de volumenes para:
  - secretos,
  - certificados runtime,
  - documentos de referencia,
  - persistencia de base;
- documentar cualquier ajuste necesario en `docs/OPERACION_GIT_DEPLOY.md` o documento operativo relacionado.

**Criterio de aceptacion**
- la configuracion de volumenes sensibles queda consistente y documentada para desarrollo y deploy.

### UXF004 — Exponer artefactos base de factura para soporte
**Objetivo:** dejar listo el backend para que el detalle frontend pueda mostrar diagnostico y XML sin editar aun el flujo avanzado.
- revisar `GET /admin/emisores/{id}/facturas/{documentId}` o equivalente;
- incluir de forma explicita `xml_unsigned`, `xml_signed`, `xml_qr`, `sifen_status`, `sifen_diagnostic` si no se exponen ya;
- sanitizar cualquier dato sensible que no deba salir al frontend;
- mantener control por alcance de `emisor`.

**Criterio de aceptacion**
- el detalle administrativo de factura devuelve artefactos y diagnostico suficientes para modo soporte base.

### UXF004A — Exponer datos operativos y elegibilidad visible en detalle de factura
**Objetivo:** permitir que el frontend muestre por que fallo un documento y que puede hacer el operador.
- revisar el contrato de detalle de factura;
- incluir datos operativos del receptor/contacto que sean relevantes para soporte;
- incluir flags o campos claros de elegibilidad para:
  - editar datos operativos permitidos;
  - reenviar;
  - reencolar;
  - anular cuando aplique;
- incluir mensaje o motivo de bloqueo cuando una accion no este disponible.

**Criterio de aceptacion**
- el backend entrega informacion suficiente para renderizar acciones y bloqueos operativos sin inferencias fragiles.

## Bloque B — Fundacion De Formularios

### UXF005 — Instalar y registrar stack de formularios
**Objetivo:** adoptar la base definitiva de formularios.
- agregar `react-hook-form`;
- agregar `zod`;
- agregar el resolver/adaptador necesario para integracion entre ambos;
- actualizar `frontend/package.json` y lockfile.

**Criterio de aceptacion**
- el frontend compila con el nuevo stack de formularios instalado.

### UXF006 — Crear componentes base reutilizables de formularios
**Objetivo:** evitar implementaciones ad hoc por pantalla.
- crear `frontend/src/shared/components/forms/`;
- implementar como minimo:
  - `FormSection`,
  - `TextField`,
  - `NumberField`,
  - `SelectField`,
  - `DateField`,
  - `CheckboxField`,
  - `SecretField`,
  - `FormActions`,
  - `InlineAlert`;
- estandarizar props de label, hint, error y loading.

**Criterio de aceptacion**
- existe una libreria local de componentes suficiente para construir los formularios del facturador.

### UXF007 — Crear helpers comunes de formularios y errores
**Objetivo:** centralizar transformaciones repetidas.
- crear helpers para:
  - normalizar `'' -> null`,
  - parseo numerico seguro,
  - formateo de fechas para inputs,
  - extraccion de errores API;
- crear adaptadores `fromApi` y `toPayload` por patron comun.

**Criterio de aceptacion**
- los formularios nuevos pueden convertir datos API <-> UI sin logica duplicada en cada pagina.

### UXF008 — Agregar estilos base para navegacion y formularios
**Objetivo:** sostener la nueva UX sin romper la identidad actual.
- agregar estilos para:
  - section nav o tabs,
  - listas laterales de entidades,
  - grid de 2 columnas,
  - alerts inline,
  - badges de estado,
  - fallback usable en viewport estrecho.

**Criterio de aceptacion**
- los componentes base tienen soporte visual consistente en desktop y viewport estrecho.

## Bloque C — Reestructura De Facturador Detail

### UXF009 — Separar `FacturadorDetailPage` en bloques internos
**Objetivo:** reducir la pagina vertical monolitica actual.
- extraer componentes internos para:
  - header,
  - resumen,
  - navegacion por secciones,
  - diagnostico tecnico;
- mantener la query principal y el invalidation flow existentes.

**Criterio de aceptacion**
- la pagina queda seccionada sin perder funcionalidad actual.

### UXF010 — Implementar navegacion por secciones del facturador
**Objetivo:** ordenar el mantenimiento fiscal por dominio.
- crear secciones:
  - resumen,
  - datos fiscales,
  - actividades,
  - establecimientos y puntos,
  - timbrados,
  - CSC,
  - certificados,
  - numeradores,
  - batch,
  - diagnostico tecnico;
- usar tabs o nav interna simple y estable.

**Criterio de aceptacion**
- el operador puede navegar dentro del detalle del facturador sin depender de scroll largo continuo.

### UXF011 — Reubicar readiness y resolucion efectiva en diagnostico tecnico
**Objetivo:** dejar el flujo principal enfocado en operacion y formularios.
- mantener visible un resumen corto arriba;
- mover detalle tecnico y objetos crudos al bloque de diagnostico;
- preservar acceso a informacion util de soporte.

**Criterio de aceptacion**
- la vista principal prioriza operacion y el detalle tecnico queda separado.

### UXF011A — Hacer explicita la separacion entre panel del facturador y panel operativo
**Objetivo:** evitar que la UI mezcle configuracion de emision con gestion de documentos.
- ajustar labels, breadcrumbs, encabezados o accesos rapidos;
- dejar visible que `FacturadorDetailPage` pertenece a configuracion;
- dejar visible que `FacturasPage` y `FacturaDetailPage` pertenecen a operacion documental.

**Criterio de aceptacion**
- un usuario distingue sin ambiguedad si esta configurando el facturador o gestionando facturas.

### UXF011B — Corregir grilla visual de formularios y bloques derivados
**Objetivo:** estabilizar la composicion visual de formularios ya migrados.
- revisar `frontend/src/styles.css`;
- definir grilla real de 2 columnas para `form-grid` en desktop;
- asegurar que `field-wide` funcione de forma consistente;
- separar visualmente formulario, preview y metadatos secundarios.

**Criterio de aceptacion**
- los formularios del facturador mantienen alineacion y ancho consistentes en desktop.

### UXF011C — Hacer evidente la seleccion activa y la jerarquia lista/formulario
**Objetivo:** reducir ambiguedad en listas laterales y bloques de edicion.
- agregar estilo claro para el item seleccionado;
- distinguir mejor estado seleccionado, principal, activo e inactivo;
- revisar contraste y espaciado entre lista y formulario.

**Criterio de aceptacion**
- el usuario identifica de inmediato que registro esta editando.

### UXF011D — Ajustar headers, acciones y viewport estrecho del panel
**Objetivo:** evitar colisiones visuales y mejorar uso en pantallas estrechas.
- revisar `panel-header`, `button-row` e `inline-field`;
- evitar quiebres poco claros entre titulos, ambiente y acciones;
- revisar apilado de secciones en viewport estrecho;
- evitar overflow horizontal innecesario en controles operativos.

**Criterio de aceptacion**
- los encabezados y acciones se leen con claridad y la pantalla sigue siendo usable en viewport estrecho.

## Bloque D — Formularios Basicos Del Facturador

### UXF012 — Reemplazar JSON de emisor por `EmisorForm`
**Objetivo:** editar datos fiscales base con formulario tipado.
- reemplazar el textarea JSON de emisor en `FacturadorDetailPage`;
- mapear `data.emisor` a `defaultValues`;
- validar:
  - `ruc_base`,
  - `ruc_dv`,
  - `razon_social`,
  - `sifen_ambiente`,
  - `activo`;
- guardar via `adminApi.updateEmisor`.

**Criterio de aceptacion**
- el emisor se edita sin JSON y persiste correctamente tras refrescar.

### UXF013 — Reemplazar JSON CRUD de actividades por formulario con lista lateral
**Objetivo:** simplificar el mantenimiento de actividades economicas.
- reemplazar `JsonCrudSection` de actividades;
- mostrar lista lateral de items y formulario de alta/edicion;
- validar `codigo_actividad`, `descripcion`, `principal`, `activo`;
- asegurar que la UX haga visible la actividad principal.

**Criterio de aceptacion**
- actividades se crean y editan sin JSON y con seleccion clara del item activo.

### UXF014 — Reemplazar JSON CRUD de establecimientos por `EstablecimientoForm`
**Objetivo:** bajar errores de carga en datos de ubicacion.
- reemplazar `JsonCrudSection` de establecimientos;
- validar:
  - `codigo_establecimiento`,
  - `direccion`,
  - codigos geograficos,
  - `email` si existe;
- mantener alta y edicion desde la misma seccion.

**Criterio de aceptacion**
- establecimientos se gestionan sin editar payloads crudos.

### UXF015 — Reemplazar JSON CRUD de puntos por `PuntoExpedicionForm`
**Objetivo:** operar puntos de expedicion con contexto de establecimiento.
- reemplazar `JsonCrudSection` de puntos;
- usar selector obligatorio de establecimiento;
- mostrar preview fiscal `001-001`;
- validar `codigo_punto` y `descripcion`.

**Criterio de aceptacion**
- puntos de expedicion se crean y editan sin JSON y con preview fiscal visible.

## Bloque E — Formularios Fiscales Criticos

### UXF016 — Reemplazar JSON CRUD de timbrados por `TimbradoForm`
**Objetivo:** reducir errores de vigencia y asociacion.
- reemplazar `JsonCrudSection` de timbrados;
- validar:
  - `numero_timbrado`,
  - `fecha_inicio`,
  - coherencia de fechas;
- mostrar estado de vigencia y alertas basicas visuales.

**Criterio de aceptacion**
- timbrados se gestionan sin JSON y con validacion minima de fechas.

### UXF017 — Reemplazar JSON CRUD de CSC por `CscForm`
**Objetivo:** evitar errores fiscales en `IdCSC` y manejo de secreto.
- reemplazar `JsonCrudSection` de CSC;
- usar `SecretField` para `csc_value`;
- mostrar microcopy: "Usar exactamente el valor habilitado por SET";
- aplicar `trim` a `IdCSC` sin padding;
- no reenviar `csc_value` cuando el campo quede vacio en edicion.

**Criterio de aceptacion**
- el formulario permite cargar `IdCSC=1` exactamente y no sobreescribe el CSC si el operador no lo reemplaza.

### UXF018 — Reemplazar carga manual de certificados por `CertificadoUploadForm`
**Objetivo:** mantener el upload como flujo principal y reducir errores operativos.
- usar formulario con:
  - `alias`,
  - `password_value`,
  - `vigente_desde`,
  - `vigente_hasta`,
  - `activo`,
  - archivo `.pfx/.p12`;
- mostrar metadatos si el backend ya los devuelve;
- ocultar o relegar `cert_path` manual al bloque tecnico.

**Criterio de aceptacion**
- el operador puede cargar un certificado por formulario sin editar rutas manuales.

### UXF019 — Ajustar update de certificados para politica "no cambiar"
**Objetivo:** alinear la UI con el contrato sensible del backend.
- revisar si existe edicion de certificado sin upload completo;
- si la pantalla expone password o archivo en edicion, omitirlos cuando el usuario no los cambie;
- mostrar claramente que secretos/certificados son administrables por usuarios autorizados del facturador.

**Criterio de aceptacion**
- la UI no manda vacios destructivos en campos de certificado ni induce a error operativo.

## Bloque F — Numeradores Y Batch Config

### UXF020 — Reemplazar JSON CRUD de numeradores por `NumeradorForm`
**Objetivo:** operar numeracion fiscal con menos riesgo.
- reemplazar `JsonCrudSection` de numeradores;
- usar selects dependientes establecimiento -> punto;
- usar select de tipo documento;
- mostrar preview de factura `001-001-0000001`;
- validar `siguiente_numero`, `activo`, `bloqueado`.

**Criterio de aceptacion**
- numeradores se crean y editan sin JSON y con preview fiscal visible.

### UXF021 — Reemplazar JSON de batch config por `BatchConfigForm`
**Objetivo:** eliminar payload manual en configuracion batch.
- reemplazar textarea JSON de batch;
- soportar `CRON` e `INTERVAL` con campos condicionales;
- validar `max_docs <= 50`, `poll_seconds`, `poll_max_tries`;
- mantener accion de reset/borrado con confirmacion.

**Criterio de aceptacion**
- batch config se gestiona con formulario tipado y reglas visibles para cada modo.

## Bloque G — Facturas Y Soporte Operativo Base

### UXF022 — Mejorar `FacturasPage` para lectura operativa
**Objetivo:** hacer mas clara la bandeja diaria.
- usar badges para estados;
- usar selects o filtros mas guiados para estados frecuentes;
- separar filtros de fechas en bloques claros para `emision` y `envio`;
- mostrar tipo de DE (`FE`/`NCE`) y condicion de operacion (`CONTADO`/`CREDITO`) en filtros y tabla;
- formatear fechas;
- agregar accion de copiar CDC;
- mostrar conteos de aprobadas, rechazadas y pendientes;
- asegurar overflow horizontal en pantallas chicas.

**Criterio de aceptacion**
- la bandeja de facturas es mas legible y usable sin cambiar su funcionalidad central.

**Estado actual**
- `DONE`
- `FacturasPage` separa filtros de emision/envio, expone filtros de tipo de DE y condicion de operacion, muestra columnas operativas nuevas y conserva tabla con overflow horizontal.
- Contrato alineado en `spec/openapi.yaml`, tipos frontend y servicio backend administrativo.
- Correccion operativa: la columna SIFEN usa diagnostico normalizado y no renderiza snapshots crudos ni XML embebido de respuestas SIFEN.

### UXF023 — Reorganizar `FacturaDetailPage` en modo operativo y soporte
**Objetivo:** separar diagnostico, revision JSON y reenvio.
- mover la edicion JSON a bloque colapsable "Modo soporte";
- mantener resumen y diagnostico arriba;
- mostrar datos operativos relevantes del receptor;
- mostrar razon visible del rechazo o falla de envio cuando exista;
- mejorar visualizacion de estado, aceptacion SIFEN, diagnostico y ultima transmision;
- conservar acciones actuales de revision y reenvio con feedback visible.

**Criterio de aceptacion**
- el detalle de factura prioriza lectura y operacion antes que la edicion cruda del JSON.

### UXF024 — Agregar panel de artefactos XML y snapshot SIFEN en detalle
**Objetivo:** exponer soporte base sin habilitar aun correccion avanzada.
- mostrar `xml_unsigned`, `xml_signed`, `xml_qr` y snapshot/respuesta SIFEN cuando existan;
- dejar `xml_signed` y `xml_qr` en solo lectura;
- si una capacidad avanzada aun no existe, mostrar estado o placeholder no interactivo en vez de un boton roto.

**Criterio de aceptacion**
- el operador puede inspeccionar artefactos documentales y diagnostico SIFEN desde el detalle.

## Bloque H — Roles, Permisos Y Visibilidad

### UXF028 — Reflejar roles en menu, rutas y modulos visibles
**Objetivo:** que la UI no exponga pantallas fuera del alcance del usuario.
- revisar sesion frontend y rol actual;
- ocultar administracion de usuarios para quien no corresponda;
- condicionar accesos a panel de configuracion del facturador y panel operativo segun rol o permisos disponibles.

**Criterio de aceptacion**
- un usuario no ve modulos que no puede operar.

### UXF029 — Reflejar permisos en tabs, formularios y acciones
**Objetivo:** alinear visibilidad fina con capacidad operativa real.
- ocultar o deshabilitar tabs sensibles del facturador cuando el usuario no tenga permiso;
- ocultar o deshabilitar acciones de revision, reenvio o anulacion cuando no correspondan;
- mostrar motivo de bloqueo cuando la accion sea visible pero no elegible por estado.

**Criterio de aceptacion**
- tabs y botones reflejan rol, permiso y elegibilidad del documento.

### UXF030 — Validar guardas de rol y alcance en flujo completo
**Objetivo:** comprobar consistencia entre sesion, alcance de emisor y acciones disponibles.
- verificar acceso de `ADMIN_GLOBAL`;
- verificar acceso de `OPERADOR_FACTURADOR`;
- verificar ausencia de administracion de usuarios para operadores;
- verificar que el usuario no pueda navegar visualmente a pantallas no permitidas.

**Criterio de aceptacion**
- la experiencia de navegacion y accion es consistente con rol y alcance.

## Bloque H — Limpieza Y Validacion

### UXF025 — Retirar `JsonCrudSection` del flujo principal del facturador
**Objetivo:** cerrar la migracion de formularios operativos.
- verificar que actividades, establecimientos, puntos, timbrados, CSC, certificados, numeradores y batch ya no dependan de `JsonCrudSection`;
- conservar JSON solo en diagnostico tecnico o soporte cuando corresponda.

**Criterio de aceptacion**
- el flujo principal del facturador no usa `JsonCrudSection`.

**Estado actual**
- `DONE`
- [frontend/src/modules/facturadores/FacturadorDetailPage.tsx](frontend/src/modules/facturadores/FacturadorDetailPage.tsx) ya no usa `JsonCrudSection` en el flujo principal.

### UXF025A — Cerrar consistencia visual minima del flujo principal
**Objetivo:** evitar que el retiro de JSON deje una pantalla funcional pero visualmente inestable.
- revisar consistencia de layout en:
  - actividades,
  - establecimientos,
  - puntos,
  - timbrados,
  - CSC,
  - certificados,
  - numeradores,
  - batch;
- verificar jerarquia clara entre lista, formulario, preview y metadatos;
- documentar cualquier excepcion temporal de UX que quede fuera del cierre.

**Criterio de aceptacion**
- el flujo principal del facturador es coherente visualmente, no solo funcionalmente.

**Estado actual**
- `DONE`
- validado funcionalmente por operacion: la edicion de formularios del facturador es posible y no rompe la operativa actual.

### UXF026 — Ejecutar validacion tecnica minima
**Objetivo:** asegurar integridad basica del cambio.
- ejecutar `npm run build`;
- ejecutar `cd frontend && npm run build`;
- ejecutar `cd frontend && npx playwright test` cuando el backend local este disponible;
- ejecutar tests por parte del agente cuando el flujo sea directo y no complejo;
- si la validacion depende de operacion manual, dejar checklist concreto para el usuario.

**Criterio de aceptacion**
- builds pasan y la validacion requerida queda registrada.

**Estado actual**
- `DONE`
- Validado el 2026-05-15:
  - `npm run build`: OK en la raiz del proyecto.
  - `cd frontend && npm run build`: OK.
  - `docker compose --profile test run --rm test npm test`: OK, 32 archivos y 110 tests.
  - `cd frontend && npx playwright test`: OK, desktop y mobile.
- Ajuste derivado de validacion: la tabla de facturadores y la bandeja de facturas conservan overflow horizontal y acciones clicables en viewport estrecho.

### UXF026A — Agregar validacion Playwright UI/UX
**Objetivo:** automatizar una validacion minima de UX antes de cerrar cambios frontend.
- instalar y registrar Playwright en el frontend;
- agregar configuracion reusable para `npx playwright test`;
- cubrir login administrativo con credenciales de entorno;
- validar navegacion a bandeja de facturas;
- comprobar filtros de tipo de DE, condicion, rangos de emision/envio y columnas operativas;
- ejecutar en viewport desktop y mobile;
- resolver proxy backend desde `PLAYWRIGHT_API_TARGET`, `VITE_DEV_PROXY_TARGET` o `API_HOST_PORT` del `.env` raiz;
- generar screenshot de evidencia por ejecucion.

**Criterio de aceptacion**
- `cd frontend && npx playwright test` ejecuta la suite UI/UX contra frontend y backend locales.

**Estado actual**
- `DONE`
- suite agregada en `frontend/tests/e2e/admin-ux.spec.ts`.
- Validado el 2026-05-15 contra API local en Docker con usuario administrativo bootstrap:
  - `cd frontend && npx playwright test`: OK.
  - `chromium-desktop`: login, navegacion a facturas, filtros y columnas operativas visibles.
  - `chromium-mobile`: login, navegacion a facturas, filtros y columnas operativas visibles.

### UXF027 — Ejecutar validacion manual minima del flujo
**Objetivo:** comprobar que la migracion sirva en operacion real.
- validar:
  - carga de facturador,
  - edicion de emisor,
  - alta/edicion de una entidad simple,
  - carga de CSC sin padding,
  - upload de certificado,
  - edicion de numerador,
  - guardado de batch config,
  - detalle de factura con diagnostico y artefactos visibles;
- verificar usabilidad en viewport estrecho.

**Criterio de aceptacion**
- existe evidencia manual minima de que el flujo principal funciona sin JSON operativo.

**Estado actual**
- `PARTIAL`
- validacion automatizada de navegacion y viewport estrecho cubierta por `cd frontend && npx playwright test` el 2026-05-15.
- sigue pendiente la checklist manual CRUD completa por operador o administrador del facturador, porque incluye acciones con datos sensibles reales o semi-reales: CSC, certificado, numerador y batch config.

**Checklist manual sugerido**
- abrir `FacturadorDetailPage` y verificar carga completa del resumen superior y secciones sin JSON editable.
- editar `Emisor` y confirmar guardado sin errores.
- crear o editar una `Actividad` y verificar que solo una quede marcada como principal.
- crear o editar un `Establecimiento`.
- crear o editar un `Punto de expedicion` filtrando por `Establecimiento`.
- crear o editar `CSC` dejando vacio el secreto en edicion para confirmar politica `no cambiar`.
- subir un `Certificado` `.pfx/.p12` con `password_value` y verificar metadatos visibles.
- editar un `Numerador` y verificar el preview fiscal `001-001-0000001`.
- guardar `Batch config` en modo `INTERVAL` y en modo `CRON`.
- abrir detalle de factura y verificar diagnostico, receptor y artefactos visibles.
- verificar uso aceptable en viewport estrecho.
