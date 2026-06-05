# PLAN Documentos Emision UX v0.1

## Referencias

- `AGENTS.md`
- `docs/SPEC_DOCUMENTOS_EMISION_UX_v0.1.md`
- `docs/WIREFRAME_EDITOR_FACTURA_MVP_v0.1.md`
- `docs/TASKS_IMPLEMENTACION_MVP_v0.1.md`
- `spec/openapi.yaml`

## Enfoque

Resolver la mejora como refinamiento de UX operativo, con cambios acotados en frontend y solo extender backend si el repositorio no cumple la busqueda requerida.

Adicionalmente, reorganizar navegacion para priorizar modulos de uso diario (`Nueva factura`, `Agenda/Clientes`, `Documentos`, `Catalogo`) y mover opciones menos frecuentes a capas secundarias.

## Documentos: Estado Lista Y Estado Detalle

La vista `Documentos` debe modelarse con un estado explicito:

- `list`: filtros + listado.
- `detail`: detalle del documento seleccionado.

Transiciones:

- seleccionar documento: cargar detalle y pasar a `detail`;
- volver: limpiar solo seleccion visual y volver a `list`;
- cambiar filtros: limpiar seleccion y cargar lista.

No se debe renderizar el listado debajo o al lado del detalle en mobile. En desktop se mantiene la misma regla para evitar ruido operacional.

## Filtros Y Busqueda

Frontend:

- exponer campos `desde` y `hasta` con controles tactiles;
- mantener filtros existentes por `tipo_operativo`, `tipo` o `estado` cuando existan;
- enviar `q` como texto libre;
- mantener `limit`/`offset` existentes.

Backend:

- normalizar traduccion de filtros de SaaS a FE sin ambiguedad:
  - `desde` SaaS -> `from` FE;
  - `hasta` SaaS -> `to` FE;
  - `q` SaaS -> `q` FE;
- verificar que `GET /facturas?q=` busque en:
  - numero fiscal;
  - CDC cuando sea util para soporte;
  - documento del receptor;
  - nombre o razon social del receptor.
- definir semantica operativa de `q`:
  - busqueda `contains` case-insensitive para texto;
  - busqueda por OR entre campos habilitados;
  - combinacion con `desde/hasta/tipo_operativo/estado` por AND global.
- si falta algun campo, ajustar repository/service sin cambiar el contrato HTTP.

OpenAPI:

- el contrato ya contempla `desde`, `hasta` y `q`;
- documentar explicitamente semantica de `q` y mapeo `desde/hasta` si aun no esta en el contrato.

## UX Comercial En Detalle De Documento

Objetivo de lenguaje:

- priorizar terminos entendibles para comerciante no tecnico;
- mantener terminos fiscales en secciones secundarias.

Cambios de presentacion:

- `KUDE/PDF` -> `Ver factura PDF`;
- `XML` -> `Documento electronico (XML firmado)`;
- `Copiar link` + `WhatsApp` + `correo` -> `Compartir factura` con menu de opciones;
- `Regenerar link` -> `Crear nuevo enlace`.

Jerarquia visual:

- principal: `Ver factura PDF`, `Compartir factura`;
- secundaria: `Descargar documento electronico`;
- administrativa: `Anular factura`, `Crear nota de credito`;
- tecnica colapsada: `Consultar estado fiscal`, `Reintentar envio`, `Crear nuevo enlace`.

## Menu Hamburguesa Y Segmentacion De Modulos

Orden recomendado del menu:

1. `Nueva factura`
2. `Agenda / Clientes`
3. `Documentos`
4. `Catalogo`
5. `Nueva nota de credito`
6. `Informacion y estado` (secundario)

Regla de simplicidad:

- mostrar al operador comun solo acciones de frecuencia alta;
- opciones avanzadas de autogestion en `Documentos` quedan dentro de bloque secundario y/o visibles por rol y alerta.

## Contenido Operativo Del Detalle

La vista de detalle debe mostrar lineas vendidas para contexto comercial:

- `cantidad x descripcion` + subtotal por item (tarjetas en mobile);
- tabla compacta en desktop/tablet.

Seccion `Informacion fiscal` expandible:

- CDC;
- timbrado;
- estado SIFEN;
- fecha de envio.

No se muestra este bloque expandido por defecto para no saturar.

## Alcance Relacionado Pero Separado

La autogestion avanzada de rechazos/correcciones basada en FE (`decision`, `retry-same-cdc`, `create-derived`, `void-number`, `cancel-send`) queda fuera de esta iniciativa DUX y debe abrirse como cadena SDD separada para `SOPORTE_INTERNO`, tomando como referencia:

- `docs/API_FACTURACION_ELECTRONICA/OPERACION_RECHAZOS_Y_AUTOGESTION_v0.1.md`

## Nueva Factura Sin Scroll Inicial

La navegacion desde inicio a `Nueva factura` debe ubicar al operador en el editor accionable.

Opciones tecnicas aceptables:

- compactar aun mas el encabezado fiscal para que el formulario quede inmediatamente visible;
- usar ancla interna o foco inicial en la seccion de comprobante/cliente;
- separar datos del facturador en una banda colapsable o secundaria;
- mantener la accion de emision cerca de totales y resultado de validacion.

La decision final debe priorizar mobile.

Adicionalmente, el bloque `Comprobante` debe incluir un `select` simple para `tipo de servicio` fiscal:

- `1` Venta de mercaderia
- `2` Prestacion de servicios (default)
- `3` Mixto (mercaderia + servicios)

El valor seleccionado debe viajar en `POST /facturas/preview` y `POST /facturas` como `tipo_transaccion`, y el backend debe mapearlo al payload FE `tipoTransaccion`.

## Refinamiento De Flujo Por Secciones (Mobile)

Para evitar friccion con teclado y scroll en emision mobile, implementar anclaje por secciones:

1. `Cabecera/Comprobante`: entrada inicial al editor.
2. `Cliente`: foco prioritario al capturar documento y seleccionar sugerencias.
3. `Productos`: carga en bottom sheet fullscreen.
4. `Resultado`: foco automatico tras emision.

Implementacion:

- agregar refs por seccion en el editor;
- al `focus` de campos de cliente, ejecutar `scrollIntoView` suave hacia seccion `Cliente`;
- al aplicar sugerencia de agenda/cliente, re-anclar `Cliente`;
- en bottom sheet de productos, usar `height` dinamico ligado a `visualViewport` para ocupar area util con teclado;
- al registrar `emittedDocumento`, hacer scroll automatico al bloque de resultado.

## Plan UXS De Usabilidad No Tecnica

### UXS-Menu

- introducir cards de menu con icono, titulo y subtitulo corto;
- separar visualmente grupos `principal`, `secundario`, `administracion`;
- aplicar color semantico:
  - principal: azul Ventax;
  - informativo/secundario: gris suave;
  - administracion: gris neutro;
  - salida: rojo suave;
- destacar `Nueva factura` con mayor tamano/contraste y badge `Recomendado`.

### UXS-Cabecera Contextual

- eliminar patron ambiguo de boton + mensaje separados (`Ver` + `Datos ... ocultos`);
- reemplazar por control unico tipo accordion:
  - colapsado: `Mostrar datos` (facturador/fiscales);
  - expandido: `Ocultar datos`;
- mantener estado inicial colapsado en mobile.

### UXS-Flujo Primero Cliente/Productos

- reordenar secciones para mostrar primero `Cliente` y luego `Productos/Servicios`;
- mover `contado/credito`, `tipo de servicio` y ajustes fiscales a bloque `Opciones de factura` colapsable;
- mantener validaciones fiscales existentes sin alterar contrato API.

### UXS-Resumen Operativo Superior

- reemplazar encabezado tecnico por resumen corto de operacion:
  - `Nueva factura`
  - fecha actual
  - cliente seleccionado/no seleccionado
  - condicion de venta visible
- dejar metadatos fiscales en `Informacion fiscal` expandible.

### UXS-Uso Una Mano

- acercar acciones frecuentes a zona inferior:
  - `Agregar producto`
  - `Guardar`
  - `Crear factura`/`Emitir factura`
- desplazar acciones secundarias (`Volver`, opciones tecnicas) a zona superior o menus de menor prioridad.

### UXS-Lenguaje Comercial

- aplicar diccionario de reemplazos en labels, botones, titulos y microcopy;
- conservar terminos tecnicos solo como apoyo secundario (tooltip, texto aclaratorio o panel tecnico).

## Validacion

Minimo requerido al implementar:

- `npm run typecheck --workspace @facturacion-simple/web-operacion`;
- `npm run build --workspace @facturacion-simple/web-operacion`;
- si se toca API: `npm run test --workspace @facturacion-simple/api`, `npm run typecheck`, `npm run lint`;
- Playwright mobile contra contenedores desplegados con `bash scripts/deploy.sh`:
  - abrir documentos;
  - filtrar por fecha;
  - buscar por numero;
  - buscar por documento receptor;
  - buscar por razon social;
  - buscar por CDC cuando exista;
  - seleccionar documento y verificar que la lista desaparece;
  - volver y verificar filtros preservados;
  - validar detalle de productos/servicios con cantidad y subtotal;
  - validar jerarquia de acciones (principal/secundaria/administrativa/tecnica);
  - validar `Informacion fiscal` colapsada por defecto y expandible;
  - validar menu hamburguesa con `Agenda / Clientes` visible y `Informacion y estado` en posicion secundaria;
- validar que opciones avanzadas de documentos no saturan la primera vista.
- desde inicio presionar `Nueva factura` y verificar que el formulario accionable queda visible sin scroll manual.
- verificar `tipo de servicio` default en `Prestacion de servicios` y envio correcto de `tipo_transaccion`.
- validar en mobile que foco en `Documento` lleve a la seccion `Cliente` con teclado abierto.
- validar que al seleccionar cliente desde sugerencias la pantalla permanezca anclada en `Cliente`.
- validar que popup `Agregar producto` ocupe alto util completo con teclado, sin hueco superior.
- validar que tras emitir se haga scroll automatico a `Resultado` (`Ver/Compartir comprobante`).
- test de descubrimiento rapido: usuario nuevo ubica `Nueva factura` en <= 2 segundos.
- test de comprension: usuario no tecnico entiende acciones principales sin capacitacion previa.

## Plan UX-009 (Detalle De Facturas Emitidas)

### Objetivo

Unificar la pantalla de detalle emitida con el patron UX de emision: rapido arriba, avanzado abajo, tecnico colapsado.

### Implementacion Frontend (Sin Cambios De Contrato)

1. Reorganizar bloque de acciones del detalle en tres grupos visuales:
   - frecuentes;
   - gestion comercial;
   - opciones avanzadas colapsables.
2. Aplicar copy comercial consistente en botones, subtitulos y confirmaciones.
3. Mantener `Informacion fiscal` expandible y cerrada por defecto.
4. Ocultar URL completa y mostrar solo estado de comparticion (`Factura lista para compartir`).
5. Garantizar ergonomia mobile:
   - botones full-width;
   - separacion tactil clara;
   - acciones sensibles no adyacentes a compartir.

### Guardrails De Primera Etapa

- No modificar endpoints, payloads ni reglas fiscales.
- Exponer para operador solo acciones avanzadas esenciales (verificar/volver a verificar/crear enlace/documento electronico).
- Mantener acciones de regularizacion avanzada segun rol interno y alerta, en linea con:
  - `docs/API_FACTURACION_ELECTRONICA/OPERACION_RECHAZOS_Y_AUTOGESTION_v0.1.md`
  - cadena SDD separada `AUTOGESTION_AVANZADA_SOPORTE`.

### Validacion UX-009

- `npm run typecheck --workspace @facturacion-simple/web-operacion`
- `npm run build --workspace @facturacion-simple/web-operacion`
- Playwright mobile-first sobre contenedores desplegados:
  - jerarquia de 3 grupos visible y comprensible;
  - `Opciones avanzadas` colapsada al abrir detalle;
  - `Informacion fiscal` colapsada al abrir detalle;
  - confirmacion previa para `Anular` y `Crear nota de credito`;
- URL completa no visible en primera vista.

## Plan UX-010 (Recientes + Filtros Progresivos)

### Objetivo

Reducir carga cognitiva en mobile para `Documentos` con estrategia de descubrimiento progresivo.

### Implementacion

1. Lista inicial recent-first:
   - aplicar rango por defecto `ultimos 7 dias` (incluye hoy);
   - agrupar visualmente en `Hoy` y `Ultimos 7 dias`.
2. Filtros:
   - mantener un solo buscador visible;
   - mover estado/fechas/tipo operativo a bloque colapsable `Mas filtros`.
3. Tabs de nivel negocio:
   - `Facturas`;
   - `Notas de credito`;
   - `Contado/Credito` queda como filtro avanzado.
4. Lista:
   - priorizar estado (icono/jerarquia) sobre numero fiscal;
   - incluir acciones rapidas por menu contextual `⋮` (`Ver detalle`, `Compartir`, `WhatsApp`, `Nota de credito`, `Anular`).
5. Detalle:
   - renombrar `Gestion comercial` a `Acciones sobre esta factura`;
   - encapsular herramientas internas en `Administracion fiscal`.
6. Reemplazar `window.prompt` por modal propio para motivos de:
   - nota de credito;
   - anulacion;
   - inutilizacion de numeracion.

### Validacion UX-010

- `npm run typecheck --workspace @facturacion-simple/web-operacion`
- `npm run build --workspace @facturacion-simple/web-operacion`
- Playwright mobile+desktop contra contenedores:
  - vista inicial con recientes y buscador unico;
  - despliegue de filtros avanzados;
  - tabs `Facturas/Notas de credito`;
  - menu `⋮` con acciones rapidas;
  - detalle con `Acciones sobre esta factura` y `Administracion fiscal`.
