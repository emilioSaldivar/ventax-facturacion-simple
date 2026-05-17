# PLAN Frontend Formularios Y UX v0.1

Este plan implementa `docs/SPEC_FRONTEND_FORMS_UX_v0.1.md` de forma incremental para no bloquear el uso actual del panel.

## Principios De Ejecucion

- Priorizar backend y contratos primero cuando el frontend dependa de endpoints insuficientes o ambiguos.
- Evitar doble trabajo: adoptar desde el inicio `react-hook-form` + `zod`.
- Mantener el alcance simple: si una fase exige demasiada complejidad visual o mobile, cumplir primero con usabilidad en viewport estrecho.
- Toda capacidad pensada para soporte debe diseñarse como contrato backend reutilizable por otros clientes, no solo por este frontend.
- Secretos y archivos sensibles omitidos en edicion significan "no cambiar".
- La navegacion y la arquitectura de pantalla deben separar claramente configuracion del facturador y operacion de facturas.
- La visibilidad y las acciones deben reflejar rol y permisos efectivos.
- Una fase funcional no se considera madura hasta cerrar layout, jerarquia visual y responsive operativo de la pantalla afectada.

## Ejes De Producto

Esta iniciativa debe reforzar dos ejes:

### Eje 1: Panel del facturador

Orientado a configuracion de emision:
- datos fiscales;
- `IdCSC`/`CSC`;
- certificados;
- timbrados;
- puntos de expedicion;
- numeradores;
- batch.

### Eje 2: Panel operativo de facturas

Orientado a gestion documental:
- bandeja con filtros;
- conteos de aprobadas, rechazadas y pendientes;
- detalle;
- diagnostico de rechazo;
- correcciones operativas permitidas;
- reenvio o anulacion segun elegibilidad backend.

## Fase 0 - Alineacion De Contratos Y Runtime

Objetivo: cerrar primero las dependencias backend, OpenAPI y runtime local para que la migracion de formularios no se apoye en JSON ad hoc.

Tareas:

- Revisar endpoints actuales del admin y detectar huecos para formularios tipados multi-facturador.
- Definir o refinar contratos OpenAPI para:
  - actualizacion segura de CSC;
  - actualizacion segura de certificados;
  - lectura de artefactos XML y respuesta SIFEN;
  - detalle de factura con datos operativos del receptor y diagnostico;
  - elegibilidad visible de acciones operativas por documento cuando corresponda;
  - revisiones documentales y prevalidacion CDC como backlog contractual;
  - acciones futuras de reintento, reencolado, inutilizacion y nuevo DE derivado.
- Revisar como se expresan roles y permisos en responses de sesion y recursos administrativos para que la UI pueda decidir que pantallas, tabs y acciones mostrar.
- Confirmar convencion de payload parcial para datos sensibles:
  - campo vacio u omitido en secreto => no cambiar;
  - archivo no enviado => no cambiar.
- Revisar `Dockerfile`, `docker-compose.yml` y `docker-compose.prod.yml` para asegurar volumenes claros en componentes importantes:
  - secretos;
  - certificados runtime;
  - documentos o artefactos relevantes;
  - persistencia de base de datos.
- Dejar documentado si hace falta separar mejor volumenes de certificados por runtime administrativo y operativo.

Entregable:

- Contratos backend y OpenAPI listos como base de implementacion.
- Runtime local/documentado sin ambiguedad en volumenes sensibles.
- Base suficiente para una UI separada entre configuracion del facturador y operacion de facturas.

## Fase 1 - Preparacion Frontend

Objetivo: dejar bases compartidas sin cambiar comportamiento.

Tareas:

- Agregar dependencias `react-hook-form`, `zod` y resolver/adaptador necesario.
- Crear componentes base en `frontend/src/shared/components/forms/`.
- Crear helpers de formulario:
  - normalizacion de strings vacios a `null`;
  - parseo numerico seguro;
  - formateo de fechas;
  - extraccion de mensajes de error API.
- Crear adaptadores base:
  - `fromApi`;
  - `toPayload`;
  - `zod schema`;
  - mapeo de errores.
- Agregar estilos CSS para:
  - tabs/section nav;
  - listas de entidades seleccionables;
  - grid de formularios de 2 columnas;
  - alerts inline;
  - badges de estado.
- Mantener `JsonCrudSection` sin borrar.

Entregable:

- Componentes base compilando y sin uso masivo todavia.

## Fase 2 - Reestructurar Facturador Detail

Objetivo: ordenar la pantalla antes de reemplazar todos los formularios.

Tareas:

- Dividir `FacturadorDetailPage` en componentes internos:
  - `FacturadorHeader`;
  - `ReadinessSummary`;
  - `FacturadorSectionNav`;
  - secciones por dominio fiscal.
- Implementar tabs/secciones:
  - Resumen;
  - Datos fiscales;
  - Actividades;
  - Establecimientos;
  - Timbrados;
  - CSC;
  - Certificados;
  - Numeradores;
  - Batch;
  - Diagnostico tecnico.
- Mover `Readiness` y `Resolucion efectiva` a diagnostico tecnico.
- dejar visible que esta pantalla pertenece al panel de configuracion del facturador.

Entregable:

- Misma funcionalidad actual, mejor organizada.

## Fase 2.1 - Pulido Visual Y Estabilidad De Layout

Objetivo: corregir errores de visualizacion de formularios ya implementados y estabilizar la pantalla del facturador para uso operativo diario.

Tareas:

- revisar `frontend/src/styles.css` para consolidar:
  - `form-grid`;
  - `summary-grid`;
  - `button-row`;
  - `panel-header`;
  - listas seleccionables;
  - estados activos e inactivos;
  - separacion visual entre formulario, preview y metadatos.
- implementar una grilla real de formularios de 2 columnas en desktop;
- corregir paneles anidados cuando no aporten jerarquia real;
- hacer mas visible la seleccion activa en listas laterales;
- ordenar encabezados y acciones para evitar compresion o quiebres visuales;
- revisar comportamiento en viewport estrecho para que sea realmente usable;
- priorizar visualmente campos y bloques criticos:
  - secretos;
  - previews fiscales;
  - metadatos de certificados;
  - warnings y errores inline.

Entregable:

- pantalla del facturador funcional y visualmente consistente.

## Fase 3 - Formularios De Configuracion Fiscal Basica

Objetivo: reemplazar JSON en entidades simples.

Tareas:

- Implementar `EmisorForm`.
- Implementar `ActividadForm` con lista lateral.
- Implementar `EstablecimientoForm`.
- Implementar `PuntoExpedicionForm`.
- Agregar validaciones frontend basicas.
- Reemplazar `JsonCrudSection` en estas secciones.
- Agregar una suite Playwright E2E minima para validar UX/UI del flujo administrativo:
  - login con usuario administrativo configurado por entorno;
  - navegacion a facturadores y bandeja de facturas;
  - presencia de filtros criticos, grupos de fechas y columnas operativas;
  - ejecucion en viewport desktop y mobile;
  - uso automatico de `API_HOST_PORT` del `.env` raiz como proxy backend local cuando no se define `PLAYWRIGHT_API_TARGET`;
  - screenshots de evidencia como artefactos de test.

Entregable:

- Emisor, actividades, establecimientos y puntos se crean/editan sin JSON.

## Fase 4 - Formularios Fiscales Criticos

Objetivo: reducir riesgo en campos que impactan aprobacion SIFEN.

Tareas:

- Implementar `TimbradoForm`.
- Implementar `CscForm`.
  - `IdCSC` se conserva exactamente con `trim`.
  - No aplicar padding.
  - Secret field para CSC.
  - si `CSC` va vacio en edicion, no se reemplaza el valor existente.
  - Texto corto de prevencion: "Usar exactamente el valor habilitado por SET".
- Implementar `CertificadoUploadForm` mejorado.
  - si no se adjunta archivo nuevo, no cambiar certificado vigente.
- Ocultar o mover edicion manual de certificados a modo tecnico.

Entregable:

- Timbrados, CSC y certificados se gestionan con formularios guiados.

## Fase 5 - Numeradores Y Batch Config

Objetivo: mejorar controles operativos recurrentes.

Tareas:

- Implementar `NumeradorForm`.
  - selects dependientes establecimiento -> punto.
  - select para tipo documento.
  - preview fiscal.
  - warning al guardar.
- Implementar `BatchConfigForm`.
  - campos condicionales CRON/INTERVAL.
  - reset con confirmacion.
  - limites `max_docs <= 50`.

Entregable:

- Numeradores y batch config sin JSON.

## Fase 6 - Facturas Y Soporte Operativo Base

Objetivo: mejorar monitoreo y dejar base contractual y visual para soporte sin mezclar aun toda la correccion avanzada en una sola tanda.

Tareas:

- En `FacturasPage`:
  - usar badges para estados;
  - selects para estados comunes;
  - formatear fechas;
  - separar visualmente filtros de fecha por grupo (`emision` y `envio`) para lectura operativa clara;
  - mostrar tipo de DE y condicion de operacion por fila (`FE`/`NCE`, `CONTADO`/`CREDITO`);
  - boton copiar CDC;
  - hacer visibles conteos de aprobadas, rechazadas y pendientes;
  - hacer tabla responsive con overflow.
- En `FacturaDetailPage`:
  - mover JSON a panel colapsable "Modo soporte";
  - agregar panel "Modo soporte XML" para ver `xml_unsigned`, `xml_signed`, `xml_qr` y respuesta SIFEN;
  - mostrar datos operativos relevantes del receptor y contacto para soporte;
  - mostrar razon visible de rechazo o fallo de envio cuando exista;
  - mostrar placeholders o estados para capacidades futuras de:
    - validar impacto CDC;
    - reintentar manteniendo CDC;
    - inutilizar numeracion;
    - crear nuevo DE desde correccion;
  - dejar `xml_signed` y `xml_qr` en solo lectura;
  - agregar confirmacion para reenvio SYNC/BATCH;
  - mostrar resultado de mutaciones;
  - mejorar diagnostico SIFEN visualmente.

Entregable:

- Bandeja y detalle mas claros para monitoreo y soporte base.

Dependencia backend:

- Definir desde ya los contratos para:
  - correcciones operativas permitidas sobre datos de receptor/contacto;
  - revision de XML base editado;
  - prevalidacion de correccion con `cdc_impact`;
  - reintento manteniendo CDC;
  - reencolado para batch;
  - inutilizacion por cambio de CDC;
  - creacion de nuevo DE derivado.
- Implementar primero solo lo que tenga soporte backend estable y no mezcle demasiados cambios documentales en la misma tanda.

## Fase 7 - Correccion Avanzada De XML Y CDC

Objetivo: ejecutar la capacidad avanzada una vez que backend, OpenAPI y trazabilidad esten cerrados.

Tareas:

- habilitar edicion de `xml_unsigned` o equivalente base seguro;
- exigir motivo de revision;
- agregar accion "Guardar correccion y validar CDC";
- agregar accion "Reintentar manteniendo CDC";
- agregar estado visual `CDC conservado / CDC cambiaria / Requiere revision`;
- bloquear reenvio cuando la correccion cambia CDC;
- agregar CTA hacia "Inutilizar numeracion" cuando el CDC cambia;
- agregar CTA "Crear nuevo DE desde correccion" cuando corresponda nueva numeracion;
- preparar payload de reenvio para que backend re-firme y regenere QR antes de transmitir;
- persistir snapshots y revisiones.

Entregable:

- Flujo completo de correccion documental controlada.

## Fase 8 - Limpieza Y Deprecacion

Objetivo: remover dependencia operativa de JSON CRUD y cerrar consistencia visual basica.

Tareas:

- Verificar que `JsonCrudSection` no se use en configuracion principal.
- Mantener una pantalla o bloque tecnico si se decide conservar JSON para soporte.
- Revisar que las secciones migradas tengan layout consistente y seleccion visual clara.
- Revisar estilos para eliminar clases no usadas.
- Agregar tests de componentes si se incorpora framework de testing frontend.
- Actualizar screenshots/manual operativo si existe.

Entregable:

- Flujo principal completo con formularios.

## Orden Recomendado De Implementacion

1. Fase 0.
2. Fase 6, solo definicion de contratos backend y soporte base si ya hay endpoints.
3. Fase 1.
4. Fase 2.
5. Fase 4, seccion CSC y certificados, por ser riesgo fiscal ya confirmado.
6. Fase 3.
7. Fase 5.
8. Fase 2.1 para estabilizar visualmente lo ya migrado.
9. Fase 7.
10. Fase 8.

## Riesgos

- Formularios grandes pueden duplicar transformaciones del backend. Mitigacion: usar `fromApi`/`toPayload` por entidad.
- Edicion de secretos puede sobrescribir valores si se manda vacio. Mitigacion: contrato explicito "vacio u omitido = no cambiar".
- Algunos endpoints actuales exigen payload completo. Mitigacion: inicializar formulario desde datos API y enviar todos los campos requeridos.
- El usuario puede necesitar edicion avanzada en soporte. Mitigacion: conservar JSON como modo tecnico, no como flujo principal.
- La capacidad avanzada de XML y CDC puede contaminar la iniciativa de formularios. Mitigacion: separar soporte base de correccion avanzada.
- Mejoras mobile pueden consumir demasiado tiempo. Mitigacion: exigir primero usabilidad en viewport estrecho, no optimizacion completa.
- Si permisos y roles no se reflejan correctamente en la UI, puede haber pantallas o acciones expuestas de mas. Mitigacion: guardas de ruta, seccion y accion basadas en sesion y respuestas del backend.
- Formularios funcionales pero visualmente inestables pueden aumentar errores operativos igual que JSON mal guiado. Mitigacion: incluir una fase explicita de pulido visual antes del cierre.

## Validacion Por Fase

Cada fase debe ejecutar:

```bash
npm run build
```

Si se reparan permisos de `node_modules`, tambien:

```bash
npm test
```

Para frontend:

```bash
cd frontend
npm run build
npx playwright test
```

Validacion manual minima:

- cargar facturador;
- editar una entidad;
- ver mensaje de exito/error;
- refrescar y confirmar persistencia;
- probar mobile o viewport estrecho.
- cuando una fase toque backend u OpenAPI, verificar tambien el contrato correspondiente y el flujo del contenedor local si cambia runtime.
