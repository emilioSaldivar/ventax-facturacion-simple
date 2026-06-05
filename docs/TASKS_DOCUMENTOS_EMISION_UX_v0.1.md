# TASKS Documentos Emision UX v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_DOCUMENTOS_EMISION_UX_v0.1.md`
- `docs/PLAN_DOCUMENTOS_EMISION_UX_v0.1.md`
- `docs/WIREFRAME_EDITOR_FACTURA_MVP_v0.1.md`
- `spec/openapi.yaml`

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
| --- | --- | --- | --- | --- |
| DUX-001 | SDD | Crear SPEC/PLAN/TASKS de refinamiento documentos/emision | DONE | Existe cadena documental versionada y referenciada desde `AGENTS.md` |
| DUX-002 | API documentos | Verificar busqueda `GET /facturas?q=` | DONE | La busqueda cubre numero fiscal, CDC cuando aplique, documento receptor y razon social sin romper filtros existentes; combina `q` por OR interno y por AND con filtros restantes |
| DUX-003 | API documentos | Verificar filtros por fecha | DONE | `desde` y `hasta` filtran por fecha operativa definida y se combinan con `q`, `tipo_operativo` y `estado`; se documenta traduccion SaaS `desde/hasta` a FE `from/to` |
| DUX-004 | UI documentos | Separar estado lista y estado detalle | DONE | Al seleccionar un documento desaparecen listado y filtros, quedando solo detalle y acciones |
| DUX-005 | UI documentos | Agregar controles fecha y buscador unificado | DONE | El operador filtra por rango de fecha y busca por numero, RUC/CI o nombre desde un unico campo |
| DUX-006 | UI documentos | Implementar volver a resultados preservando filtros | DONE | Desde detalle se vuelve a la lista anterior con filtros y busqueda conservados |
| DUX-007 | UI emision | Navegar a nueva factura en seccion accionable | DONE | Desde pantalla principal, `Nueva factura`/`Emitir factura` deja visible el formulario operativo sin scroll manual por datos del facturador |
| DUX-008 | QA visual | Validar flujo mobile y desktop | DONE | Playwright contra contenedores cubre filtros, busqueda, seleccion exclusiva, volver y entrada directa a emision |
| DUX-009 | Documentacion cierre | Registrar evidencia de validacion | DONE | Esta matriz contiene comandos, entorno y resultado antes de cerrar tareas |
| DUX-010 | UI emision/API | Selector tipo de servicio y envio a FE | DONE | `Nueva factura` expone `tipo de servicio` 1/2/3 con default `2` y el backend delega `tipo_transaccion` como `tipoTransaccion` al backend fiscal |
| DUX-011 | UI detalle comercial | Mostrar productos/servicios vendidos en detalle | DONE | El detalle de documento muestra lineas con cantidad, descripcion y subtotal; mobile en tarjetas y desktop/tablet en tabla compacta sin overflow |
| DUX-012 | UX copy comercial | Renombrar acciones tecnicas a lenguaje comercial | DONE | UI usa `Ver factura PDF`, `Documento electronico (XML firmado)`, `Compartir factura` y `Crear nuevo enlace`; no muestra `KUDE/PDF`, `XML` ni `Regenerar link` como textos primarios |
| DUX-013 | UI acciones | Agrupar acciones por prioridad operacional | DONE | Acciones primarias: `Ver factura PDF` y `Compartir factura`; secundarias, administrativas y tecnicas separadas visualmente; tecnicas colapsadas por defecto |
| DUX-014 | UI fiscal | Mover CDC y metadatos a bloque expandible | DONE | `CDC`, timbrado, estado SIFEN y fecha envio viven en `Informacion fiscal` expandible y cerrado por defecto |
| DUX-015 | UI compartir | Consolidar compartir en menu unico | DONE | `Compartir factura` abre opciones `WhatsApp`, `Correo` y `Copiar enlace`; mantiene permiso/estado segun disponibilidad del documento |
| DUX-016 | UI publica | Simplificar pantalla publica de comprobante | DONE | Pantalla publica prioriza `Ver factura PDF` y `Descargar documento electronico`; agrega ayuda breve para comerciante y reduce terminos tecnicos visibles |
| DUX-017 | API batch gestion | Verificar mapeo de diagnostico batch FE | DONE | `/facturas/gestion/batch-pendientes` conserva y expone `dProtConsLote`, `dCodRes`, `result_code`, `status`, `batch_id`, `did` con semantica estable para UI |
| DUX-018 | SDD separado | Definir iniciativa de autogestion avanzada soporte | DONE | Se crea cadena SPEC/PLAN/TASKS separada para `SOPORTE_INTERNO` usando `OPERACION_RECHAZOS_Y_AUTOGESTION_v0.1.md`; no se mezcla con flujo operador comercial |
| DUX-019 | UI navegacion | Simplificar menu hamburguesa por frecuencia de uso | DONE | El menu prioriza `Nueva factura`, `Agenda/Clientes`, `Documentos`, `Catalogo`, `Nueva nota de credito`; `Informacion y estado` queda como opcion secundaria |
| DUX-020 | UI agenda | Exponer acceso directo a `Agenda / Clientes` en menu | DONE | Existe entrada clara a agenda de clientes, con iconografia legible tipo contacto y copy comercial simple |
| DUX-021 | UI documentos | Ocultar acciones avanzadas en primera vista | DONE | `Documentos` muestra primero acciones comerciales; autogestion avanzada queda en bloque secundario o por rol/contexto de alerta |
| DUX-022 | UX microcopy | Reescribir subtitulos de modulos del menu en lenguaje comercial | DONE | Los subtitulos evitan jerga tecnica y describen accion de negocio (`Emitir`, `Cobrar/compartir`, `Gestionar clientes`, etc.) |
| DUX-023 | QA navegacion | Validar flujo operativo simplificado mobile-first | DONE | Playwright valida apertura menu, acceso a `Agenda/Clientes`, acceso a `Documentos`, ausencia de saturacion tecnica en primera vista y regreso fluido a `Nueva factura` |
| DUX-024 | UI emision mobile | Auto-scroll al bloque Cliente al enfocar documento/campos | DONE | Con teclado abierto en mobile, foco en `Documento` y campos de cliente ancla la vista en seccion `Cliente` sin que el teclado tape el contexto |
| DUX-025 | UI emision mobile | Mantener anclaje en Cliente al seleccionar agenda/sugerencia | DONE | Al tocar un cliente sugerido/agenda, la pantalla queda posicionada en bloque `Cliente`, evitando quedar entre cabecera y formulario |
| DUX-026 | UI productos mobile | Bottom sheet fullscreen util con teclado | DONE | Popup `Agregar producto` usa alto util completo (`visualViewport`) y elimina espacio superior innecesario con teclado abierto |
| DUX-027 | UI emision mobile | Auto-scroll al resultado tras emitir | DONE | Luego de emitir factura, la vista se desplaza automaticamente a `Resultado` para ver/compartir comprobante sin scroll manual |
| DUX-028 | QA UX por secciones | Validar flujo `Cabecera -> Cliente -> Productos -> Resultado` | DONE | Playwright mobile valida anclajes de foco, seleccion de cliente, comportamiento del popup de productos y scroll final a resultado |

## Matriz UXS (Nueva Iteracion Usabilidad)

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
| --- | --- | --- | --- | --- |
| UXS-001 | SDD | Consolidar especificacion UX no tecnica en SPEC/PLAN/TASKS | DONE | La cadena SDD define alcance de menu, lenguaje, cabecera contextual, flujo prioritario y ergonomia mobile |
| UXS-002 | UI menu | Simplificar menu principal con jerarquia por frecuencia | DONE | `Nueva factura`, `Agenda/Clientes` y `Documentos` aparecen primero y con mayor contraste que modulos secundarios/administrativos |
| UXS-003 | UI menu | Incorporar iconografia consistente por modulo | DONE | Cada modulo principal/secundario usa icono estable, reconocible y coherente con su accion de negocio |
| UXS-004 | UI menu | Aplicar color semantico y destacar accion principal | DONE | `Nueva factura` queda destacada con mayor peso visual y badge `Recomendado`; `Salir` usa variante visual diferenciada |
| UXS-005 | UX copy | Reducir texto secundario y orientar subtitulos a negocio | DONE | Subtitulos evitan jerga administrativa y explican accion concreta (`Crear factura electronica`, `Facturas y notas emitidas`) |
| UXS-006 | UI emision | Reemplazar `Ver` + mensaje de oculto por control contextual unico | DONE | Existe un solo control para mostrar/ocultar datos del facturador; se elimina mensaje separado de oculto |
| UXS-007 | UI emision | Priorizar carga `Cliente` y `Productos` sobre configuracion fiscal | DONE | `Cliente` y `Productos` quedan antes en el flujo visual; configuracion fiscal vive en `Opciones de factura` colapsable |
| UXS-008 | UI emision | Convertir cabecera superior en resumen operativo | DONE | Encabezado muestra estado operativo breve (`Nueva factura`, cliente seleccionado/no seleccionado, fecha) y deja detalle tecnico secundario |
| UXS-009 | UI emision mobile | Optimizar acciones para uso con una sola mano | DONE | Flujo visual prioriza `Cliente`/`Productos` y mantiene acciones de carga/emision en tramo inferior operativo del editor |
| UXS-010 | UX lenguaje | Aplicar diccionario comercial reemplazando terminos tecnicos | DONE | Se reemplazan labels primarios visibles por copy comercial en menu y emision (`Factura`, `Crear factura`, `Devolver factura`) |
| UXS-011 | QA usabilidad | Validar descubrimiento y comprension con usuarios no tecnicos | TODO | Evidencia de prueba: descubrimiento de `Nueva factura` <=2s y comprension de acciones sin capacitacion tecnica |
| UXS-012 | QA visual | Validar mobile-first con Playwright sobre stack desplegado | TODO | Playwright cubre menu, flujo emision, copy comercial, jerarquia visual y ergonomia de acciones |
| UXS-013 | PWA instalacion | Recomendar instalacion de la app en navegadores/dispositivos | DONE | Con `beforeinstallprompt` disponible se muestra banner con CTA `Instalar app`; en iOS Safari se muestra guia `Compartir -> Agregar a pantalla de inicio`; se permite descartar persistente |
| UX9-001 | UI detalle emitidas | Unificar acciones rapidas/comerciales/avanzadas en 3 grupos | DONE | Detalle emitido muestra acciones frecuentes visibles, gestion comercial separada y `Opciones avanzadas` colapsada por defecto |
| UX9-002 | UX copy | Aplicar diccionario comercial en detalle emitidas | DONE | Labels visibles usan `Factura PDF`, `Documento electronico`, `Verificar estado fiscal`, `Volver a verificar`, `Codigo fiscal` |
| UX9-003 | UI fiscal | Mantener `Informacion fiscal` expandible y no intrusiva | DONE | Bloque tecnico permanece disponible para soporte pero cerrado por defecto en primera vista |
| UX9-004 | Guardrails etapa 1 | Limitar autogestion avanzada en vista operador | DONE | Primera etapa expone solo avanzado esencial; acciones sensibles (`invalidar numeracion`, `decision`, `retry-same-cdc`, etc.) se reservan por rol/contexto interno |
| UX9-005 | QA UX detalle | Validar jerarquia y ergonomia mobile-first en detalle | PENDING | Playwright en contenedores confirma orden de acciones, confirmaciones de riesgo y ausencia de URL completa en vista principal |
| DUX-029 | UI documentos | Priorizar recientes con rango por defecto 7 dias | DONE | `Documentos` inicia con `hoy` y `ultimos 7 dias`, evitando historico completo en primera vista |
| DUX-030 | UI filtros | Aplicar filtros progresivos mobile-first | DONE | Buscador unico visible; filtros avanzados (`estado`, `desde`, `hasta`, `tipo factura`) viven en `Mas filtros` |
| DUX-031 | UI tabs | Simplificar tabs a nivel de negocio | DONE | Tabs principales: `Facturas` y `Notas de credito`; `Contado/Credito` queda como filtro avanzado |
| DUX-032 | UI listado | Mejorar jerarquia y acciones rapidas por documento | DONE | Estado gana jerarquia visual y cada fila ofrece menu `⋮` con `Ver detalle`, `Compartir`, `WhatsApp`, `Nota de credito`, `Anular` |
| DUX-033 | UI detalle | Reetiquetar acciones y aislar capa fiscal interna | DONE | Seccion `Acciones sobre esta factura` reemplaza `Gestion comercial`; capa interna se agrupa en `Administracion fiscal` |
| DUX-034 | QA UX documentos | Validar flujo mobile/desktop de UX-010 | PENDING_VALIDATION | Playwright confirma recientes, filtros progresivos y tabs negocio; queda pendiente evidenciar menu `⋮` + detalle en entorno con documentos visibles |
| DUX-035 | UI modal motivos | Reemplazar prompts nativos por modal app mobile-first | DONE | Motivos de nota de credito, anulacion e inutilizacion se capturan en modal propio con validacion, sin `window.prompt` |

## Definiciones Cerradas Para Implementacion

- Fecha operativa de `GET /facturas`: usar `fecha_emision` como base primaria para `desde/hasta`; si no existe, fallback a `created_at` solo para consistencia historica documentada.
- Rango de fechas: inclusivo (`>= desde` y `<= hasta`) en `America/Asuncion`.
- Semantica de `q`: OR entre `numero_fiscal`, `cdc`, `receptor_doc`, `receptor_nombre`.
- Semantica de filtros combinados: AND entre `q`, fechas, `tipo_operativo` y `estado`.
- Traduccion SaaS->FE en consultas equivalentes: `desde->from`, `hasta->to`, `q->q`.
- Jerarquia UX obligatoria de acciones: principal, secundaria, administrativa y tecnica.
- Bloque fiscal: `Informacion fiscal` cerrado por defecto, expandible bajo demanda.
- Autogestion avanzada: exclusiva para `SOPORTE_INTERNO` en iniciativa SDD separada.
- Segmentacion menu: `Informacion y estado` se conserva para soporte/readiness, pero no se prioriza como modulo principal diario.
- Entrada de agenda: `Agenda / Clientes` es acceso de primer nivel en menu hamburguesa.
- Scope operativo de emision mobile: `Cabecera`, `Cliente`, `Productos` y `Resultado` son secciones guiadas con anclaje automatico segun accion del operador.
- Diccionario UX no tecnico de referencia: `Factura`, `Archivo fiscal`, `Factura PDF`, `Codigo fiscal`, `Crear factura`, `Volver a enviar`, `Crear nuevo enlace`, `Verificar estado con SET`, `Devolver factura`.

## Evidencia

- 2026-05-21: creada cadena SDD `DOCUMENTOS_EMISION_UX` para mapear seleccion exclusiva de documentos, filtros por fecha, busqueda por numero/documento/receptor y entrada directa al formulario de emision. No se implemento codigo funcional en esta tarea documental.
- 2026-05-23: cerrado `DUX-010` con cambios en `apps/web-operacion`, `apps/api`, `spec/openapi.yaml` y pruebas API para soportar selector de tipo de servicio (1/2/3), default UI `Prestacion de servicios` y mapeo a `tipoTransaccion` en FE.
- 2026-05-24: refinada matriz con enfoque comercial no tecnico para `Documentos`/detalle/publico, se agregan tareas `DUX-011`..`DUX-018` y definiciones cerradas de busqueda/filtros/mapeo FE para eliminar ambiguedad antes de implementar.
- 2026-05-24: se extiende refinamiento UX con navegacion operativa simple y agenda visible en menu; se agregan tareas `DUX-019`..`DUX-023` para simplificar modulos y reducir acciones avanzadas en primera vista.
- 2026-05-24: implementadas `DUX-002`..`DUX-023` en `apps/api`, `apps/web-operacion`, `apps/api/src/modules/entrega` y `spec/openapi.yaml`. Validaciones ejecutadas: `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run typecheck --workspace @facturacion-simple/api`, `npx vitest run apps/api/tests/facturas.service.test.ts apps/api/tests/entrega.service.test.ts`, `npm run typecheck`, `npm run lint`, `npm run build`, `bash scripts/deploy.sh` (fallo inicial por red `bridge`, re-ejecucion OK con `FE_DOCKER_NETWORK=facturacion-electronica_default` y `DATABASE_URL=postgres://facturacion_simple:facturacion_simple@nuevo_repo-postgres-1:5432/facturacion_simple`), healthchecks `GET /api/v1/health` y `/healthz` OK, Playwright mobile+desktop con script `/tmp/dux-playwright.cjs` validando menu simplificado, acceso `Agenda/Clientes`, flujo `Documentos` lista->detalle->volver, acciones comerciales y bloque fiscal expandible.
- 2026-05-24: implementadas `DUX-024`..`DUX-028` en `apps/web-operacion/src/main.tsx` y `apps/web-operacion/src/styles.css` con enfoque mobile-first por secciones de emision (`Cabecera`, `Cliente`, `Productos`, `Resultado`). Validaciones: `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion` y Playwright mobile sobre stack local para comprobar anclajes con teclado, bottom sheet fullscreen y scroll automatico post-emision.
- 2026-05-24: creada matriz `UXS-001`..`UXS-012` para nueva iteracion de usabilidad no tecnica (menu, cabecera contextual, flujo primero cliente/productos, ergonomia una mano y diccionario comercial). Pendiente de implementacion.
- 2026-05-24: implementadas `UXS-002`..`UXS-010` en `apps/web-operacion/src/main.tsx` y `apps/web-operacion/src/styles.css` sin modificar comportamientos base ya cerrados en `DUX-024`..`DUX-028` (auto-anclajes cliente, popup fullscreen con `visualViewport`, auto-scroll de resultado). Cambios: menu agrupado con iconografia y semantica visual, accion principal destacada, copy comercial, control unico de datos del facturador y bloque `Opciones de factura` colapsable. Validaciones: `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion`.
- 2026-05-24: implementado `UXS-013` en `apps/web-operacion/src/main.tsx` y `apps/web-operacion/src/styles.css` para recomendacion de instalacion PWA en dispositivos: captura `beforeinstallprompt`, CTA `Instalar app`, fallback iOS Safari y descarte persistente local. Validaciones: `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion`.
- 2026-05-24: ajuste UX correctivo post-refinamiento visual en `apps/web-operacion`: boton `Mostrar datos` compactado para evitar sobredimension en cabecera y eliminacion de reordenamiento por `order` en secciones del editor que afectaba despliegue del bloque de productos en mobile. Validaciones: `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion`.
- 2026-05-28: se incorpora iniciativa `UX-009` como bloque `UX9-001..UX9-005` para detalle de facturas emitidas. Se fija alcance de primera etapa: reorganizacion UX/UI y copy comercial sin cambios de backend/API; autogestion avanzada sensible se mantiene restringida por rol interno y alerta operativa segun `OPERACION_RECHAZOS_Y_AUTOGESTION_v0.1.md`.
- 2026-05-28: implementadas `UX9-001`..`UX9-004` en `apps/web-operacion/src/main.tsx` y `apps/web-operacion/src/styles.css`: detalle emitidas ahora separa `Acciones frecuentes`, `Gestion comercial` y `Opciones avanzadas`; `Informacion fiscal` mantiene bloque colapsable con `Codigo fiscal`; copy tecnico principal se simplifica (`Verificar estado fiscal`, `Volver a verificar`, `Descargar documento electronico`); y se preservan guardrails de etapa 1 sin exponer acciones sensibles de regularizacion en vista operador. Validaciones ejecutadas: `npm run typecheck --workspace @facturacion-simple/web-operacion` y `npm run build --workspace @facturacion-simple/web-operacion`.
- 2026-05-28: `UX9-005` queda `PENDING` hasta ejecutar Playwright mobile-first sobre stack de staging desplegado por contenedores para validar jerarquia visual y ergonomia en flujo real sin riesgo colateral sobre el despliegue productivo actual.
- 2026-05-31: implementadas `DUX-029`..`DUX-033` en `apps/web-operacion/src/main.tsx` y `apps/web-operacion/src/styles.css` con enfoque `Documentos recientes` + filtros progresivos + tabs negocio + acciones rapidas por fila + separacion de capa fiscal interna.
- 2026-05-31: validaciones tecnicas de iteracion UX-010: `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion`.
- 2026-05-31: validacion UX-010 en contenedores (`DUX-034`) con Playwright mobile/desktop sobre `http://127.0.0.1:8092/app/`, cubriendo recientes (`Hoy`/`Ultimos 7 dias`), buscador unico, apertura de `Mas filtros` y tabs `Facturas/Notas de credito`. En este entorno no habia filas de documentos visibles para cerrar evidencia de `menu ⋮ -> Ver detalle`; se mantiene `PENDING_VALIDATION` para ese tramo.
- 2026-05-31: implementado `DUX-035` en `apps/web-operacion/src/main.tsx`: reemplazo de `window.prompt` por modal de motivo para `Crear nota de credito`, `Anular factura` e `Inutilizar numeracion`; incluye validacion de longitud minima y copy orientado a operador mobile. Validaciones: `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion`.
