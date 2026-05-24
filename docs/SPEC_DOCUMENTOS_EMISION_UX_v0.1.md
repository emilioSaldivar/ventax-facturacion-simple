# SPEC Documentos Emision UX v0.1

## Objetivo

Mejorar la operacion diaria de documentos para que el operador pueda:

- listar facturas sin saturacion visual;
- filtrar por fecha;
- buscar por numero fiscal, RUC/CI o nombre del receptor;
- abrir una factura en una vista exclusiva de detalle;
- iniciar una nueva factura entrando directo a la seccion accionable de envio del comprobante.
- entender y ejecutar acciones con lenguaje comercial no tecnico.

## Alcance

Esta iniciativa afecta la experiencia operativa de `web-operacion` y, si la implementacion actual de API no cubre todos los criterios de busqueda, el endpoint propio `GET /facturas`.
Tambien cubre simplificacion del menu hamburguesa y priorizacion de modulos mas usados por comercios pequenos.

No cambia responsabilidades fiscales:

- el SaaS no genera numeracion fiscal final;
- el SaaS no genera XML, firma, QR, KUDE/PDF ni consulta directa a SIFEN desde frontend;
- `facturacion-electronica` sigue siendo la fuente fiscal de estados y artefactos.

## Vista Documentos

La pantalla de documentos debe separar claramente dos estados:

1. Estado lista: muestra filtros, buscador y listado de documentos.
2. Estado detalle: al seleccionar un documento, oculta el listado y muestra solo el detalle y sus acciones.

El operador debe poder volver desde el detalle a la lista conservando filtros aplicados siempre que sea razonable.

## Navegacion Operativa Simple

El menu hamburguesa debe priorizar tareas de uso diario y lenguaje comercial:

- `Nueva factura`;
- `Agenda / Clientes`;
- `Documentos`;
- `Catalogo`;
- `Nueva nota de credito`.

`Informacion y estado` no debe competir visualmente como modulo primario. Debe quedar como opcion secundaria de soporte/configuracion operativa.

## Lenguaje UX Comercial

Para operador no tecnico, la interfaz debe priorizar terminos comerciales:

- mostrar `Ver factura PDF` en lugar de `KUDE/PDF`;
- mostrar `Documento electronico (XML firmado)` en lugar de `XML`;
- mostrar `Compartir factura` como accion agrupadora de:
  - `Enviar por WhatsApp`;
  - `Enviar por correo`;
  - `Copiar enlace`;
- mostrar `Crear nuevo enlace` en lugar de `Regenerar link`;
- ocultar `CDC`, `SIFEN`, `Reintentar` y `Consultar` como acciones primarias.

El lenguaje tecnico puede existir dentro de secciones secundarias (`Informacion fiscal`, `Opciones tecnicas`) para soporte y auditoria.

## Filtros Requeridos

La vista lista debe permitir:

- filtrar por rango de fecha `desde` y `hasta`;
- mantener filtros operativos existentes por tipo o condicion cuando apliquen;
- buscar por numero fiscal de factura;
- buscar por RUC, CI u otro documento del receptor;
- buscar por nombre o razon social del receptor.

El buscador debe ser unico y entendible para el operador. No debe obligar a elegir previamente si el texto es numero, documento o nombre.

## Seleccion De Documento

Al seleccionar una factura o nota:

- el listado deja de renderizarse en pantalla;
- los filtros dejan de ocupar espacio visual;
- el detalle muestra acciones permitidas segun estado;
- debe existir una accion clara para volver a resultados;
- no debe duplicarse informacion entre lista y detalle.

En mobile, esta regla es obligatoria. En desktop se puede usar la misma regla para mantener una experiencia consistente y menos saturada.

## Detalle Comercial De Factura

La vista detalle debe incluir siempre el detalle de lineas vendidas:

- cantidad;
- descripcion;
- subtotal por linea.

Esto es obligatorio para responder la pregunta operativa principal del comerciante: "que se vendio".

Presentacion recomendada:

- mobile: tarjetas por item con `cantidad x descripcion` y subtotal;
- desktop/tablet: tabla compacta con columnas `Cant`, `Descripcion`, `Total`.

## Jerarquia De Acciones

Las acciones deben agruparse por prioridad operacional:

- principal:
  - `Ver factura PDF`;
  - `Compartir factura`;
- secundaria:
  - `Descargar documento electronico (XML firmado)`;
- administrativa:
  - `Anular factura`;
  - `Crear nota de credito`;
- tecnica (colapsada por defecto):
  - `Consultar estado fiscal`;
  - `Reintentar envio`;
  - `Crear nuevo enlace`.

Los datos fiscales (`CDC`, timbrado, estado SIFEN, fecha de envio) viven en bloque expandible `Informacion fiscal`.

Las acciones avanzadas de autogestion de rechazos no deben mostrarse por defecto al operador comun. Se habilitan por rol/contexto y alerta operativa.

## Nueva Factura Desde Pantalla Principal

Cuando el operador presiona `Emitir factura` o `Nueva factura` desde la pantalla principal, la navegacion debe posicionar directamente al operador en la seccion accionable del editor para enviar el comprobante.

La entrada a emision debe evitar que el operador tenga que recorrer o scrollear informacion del facturador antes de llegar al formulario operativo.

Requisitos:

- mantener informacion fiscal minima visible o accesible sin bloquear el flujo;
- enfocar la carga del comprobante, cliente e items;
- incluir selector simple de `tipo de servicio` fiscal con opciones:
  - `1`: Venta de mercaderia;
  - `2`: Prestacion de servicios;
  - `3`: Mixto (mercaderia + servicios);
  - valor por defecto: `2` (`Prestacion de servicios`);
- enviar `tipo_transaccion` en preview/emision para que el backend SaaS lo delegue a `facturacion-electronica` como `tipoTransaccion`;
- dejar la accion de emision cerca del resumen/totales;
- preservar bloqueo por readiness si el facturador no puede emitir.

## Criterios De Aceptacion

- Desde `Documentos`, una seleccion muestra solo el detalle y no mantiene visible la lista completa.
- El boton volver desde detalle retorna a la lista con filtros vigentes.
- Los filtros de fecha funcionan combinados con tipo/condicion y busqueda.
- La busqueda encuentra documentos por numero fiscal, documento del receptor y nombre/razon social.
- La busqueda tambien soporta CDC cuando aplique para soporte operativo.
- La vista detalle muestra productos/servicios vendidos (cantidad, descripcion, subtotal) en mobile y desktop/tablet.
- Las acciones primarias visibles son comerciales (`Ver factura PDF`, `Compartir factura`) y no tecnicas.
- `CDC` y metadatos fiscales quedan dentro de `Informacion fiscal` expandible.
- La accion `Compartir factura` agrupa WhatsApp, correo y copiar enlace.
- El menu hamburguesa incluye `Agenda / Clientes` como acceso directo y visible.
- `Informacion y estado` queda como opcion secundaria, no como accion principal del flujo diario.
- En `Documentos`, las acciones avanzadas no aparecen por defecto para operador comun.
- `Nueva factura` desde inicio lleva al operador directamente al formulario accionable, sin scroll manual por datos del facturador.
- `Nueva factura` muestra `tipo de servicio` con default `Prestacion de servicios` y permite cambiar a mercaderia o mixto segun necesidad del cliente.
- La experiencia debe validarse primero en mobile y luego en desktop/tablet.
