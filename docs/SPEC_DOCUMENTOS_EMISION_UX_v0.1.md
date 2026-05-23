# SPEC Documentos Emision UX v0.1

## Objetivo

Mejorar la operacion diaria de documentos para que el operador pueda:

- listar facturas sin saturacion visual;
- filtrar por fecha;
- buscar por numero fiscal, RUC/CI o nombre del receptor;
- abrir una factura en una vista exclusiva de detalle;
- iniciar una nueva factura entrando directo a la seccion accionable de envio del comprobante.

## Alcance

Esta iniciativa afecta la experiencia operativa de `web-operacion` y, si la implementacion actual de API no cubre todos los criterios de busqueda, el endpoint propio `GET /facturas`.

No cambia responsabilidades fiscales:

- el SaaS no genera numeracion fiscal final;
- el SaaS no genera XML, firma, QR, KUDE/PDF ni consulta directa a SIFEN desde frontend;
- `facturacion-electronica` sigue siendo la fuente fiscal de estados y artefactos.

## Vista Documentos

La pantalla de documentos debe separar claramente dos estados:

1. Estado lista: muestra filtros, buscador y listado de documentos.
2. Estado detalle: al seleccionar un documento, oculta el listado y muestra solo el detalle y sus acciones.

El operador debe poder volver desde el detalle a la lista conservando filtros aplicados siempre que sea razonable.

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
- `Nueva factura` desde inicio lleva al operador directamente al formulario accionable, sin scroll manual por datos del facturador.
- `Nueva factura` muestra `tipo de servicio` con default `Prestacion de servicios` y permite cambiar a mercaderia o mixto segun necesidad del cliente.
- La experiencia debe validarse primero en mobile y luego en desktop/tablet.
