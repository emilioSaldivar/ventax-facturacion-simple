# Wireframe Editor Factura MVP v0.1

Este documento cierra el micro-wireframe tecnico previo a `UI-005`. El objetivo es implementar el editor sin improvisar estructura visual ni romper la similitud mental con una factura manual.

## Principios

- Mobile-first: el flujo principal debe funcionar comodamente en celular.
- Denso y escaneable: evitar una landing o composicion decorativa.
- Modular: el menu hamburguesa separa `Nueva factura`, `Nueva nota de credito`, `Informacion y estado`, `Catalogo` y `Documentos`; la pantalla principal no debe cargar todo el producto a la vez.
- Familiar para operador manual: mantener orden comprobante -> cliente -> lineas -> totales -> emitir.
- Sin campos fiscales editables: numeracion, timbrado, CDC, establecimiento y punto se muestran como datos resueltos.
- Persistente ante refresh: renovaciones de token o revalidaciones de sesion no deben recargar ni limpiar el formulario en curso.
- Feedback recuperable: errores operativos deben indicar que corregir antes de emitir; errores fiscales pendientes deben ofrecer refrescar/reintentar cuando sea seguro.

## Navegacion Operativa

La app operativa debe separar pantallas:

- `Nueva factura`: editor directo de emision y pantalla principal despues de login cuando el usuario esta listo.
- `Nueva nota de credito`: busqueda de factura elegible, confirmacion de datos y emision de NCE total.
- `Informacion y estado`: facturador, sesion, contexto operativo, readiness y accesos a las otras vistas.
- `Catalogo`: productos/servicios.
- `Documentos`: facturas, notas, detalle, entrega y filtros por contado/credito/nota de credito.

La vista `Informacion y estado` reemplaza al inicio saturado. Puede mantener los botones `Nueva factura`, `Nueva nota de credito`, `Catalogo` y `Ver documentos`, pero cada boton navega a su pantalla.

## Orden Mobile

### 1. Encabezado Fiscal Resuelto

Contenido:

- razon social del facturador;
- RUC;
- establecimiento y punto;
- timbrado;
- fecha;
- siguiente numero fiscal estimado.

Comportamiento:

- compacto, visible al entrar al editor;
- no editable;
- no repetir checklist de readiness en esta pantalla;
- si readiness falla, redirigir o mostrar bloqueo con acceso a `Informacion y estado`;
- el siguiente numero fiscal estimado se calcula con el ultimo numero conocido para el mismo establecimiento/punto y no reemplaza la numeracion final de FE.

### 2. Comprobante Y Condicion

Contenido:

- fecha de emision;
- condicion `CONTADO` o `CREDITO`;
- plazo credito `30`, `60` o `90` dias cuando FE/contexto lo soporte;
- numero fiscal como `pendiente`;
- timbrado/configuracion como texto secundario.

Controles:

- selector segmentado para contado/credito;
- selector de plazo solo visible para credito cuando haya opciones disponibles;
- fecha solo lectura en MVP, generada por sistema.

### 3. Cliente

Contenido:

- RUC/CI/documento;
- razon social;
- direccion;
- telefono;
- email.

Comportamiento:

- campo documento dispara busqueda por agenda y base compartida;
- si no existe relacion para el facturador, abrir popup de alta rapida;
- si se selecciona un cliente existente y se editan sus datos, el boton primario debe decir `Actualizar`;
- guardar cliente antes o durante la emision, sin cliente ocasional.

### 4. Lineas

Mobile:

- mostrar lineas agregadas como registros compactos bajo cabecera `CANT | COD | DESCRIPCION | SUBTOTAL`;
- no mostrar multiples tarjetas de linea abiertas simultaneamente;
- truncar descripcion larga con accion `Ver mas` o `Ver +`;
- cada registro tiene accion de editar con lapiz y eliminar con basurero;
- tocar/clickear una fila abre el formulario compacto de edicion;
- debajo de los registros debe existir una fila vacia de carga para buscar por codigo o descripcion.

Tablet/desktop:

- usar grilla compacta con columnas equivalentes a la factura manual y acciones por fila.

Reglas:

- codigo busca catalogo por codigo/nombre/descripcion;
- descripcion tambien puede iniciar busqueda por nombre/descripcion;
- item de catalogo bloquea descripcion/precio/IVA dentro de la factura;
- item nuevo sin codigo queda IVA 10%;
- IVA 5% o exenta debe venir de catalogo.
- si la busqueda no encuentra resultado util, se abre el formulario compacto de alta rapida reutilizando el card actual.

### 5. Totales

Contenido:

- subtotal general;
- total sin IVA;
- liquidacion IVA 5%;
- liquidacion IVA 10%;
- total IVA;
- total a pagar.

Comportamiento:

- visible cerca del boton `Emitir`;
- recalculo frontend para feedback inmediato;
- backend `POST /facturas/preview` es autoridad antes de emitir;
- si backend difiere, mostrar totales corregidos y bloquear emision hasta que el operador confirme.

### 6. Acciones

Acciones principales:

- `Preview` implicito o automatico;
- `Emitir factura`;
- `Limpiar`.

Estados:

- `Ready`: emitir habilitado.
- `Sin readiness`: emitir bloqueado con mensaje claro.
- `Validacion local`: mostrar campo a corregir.
- `Preview backend falla`: mostrar causa operativa.
- `Emision pendiente`: mostrar seguimiento, refrescar estado y reintento seguro si aplica.

## Pantalla Posterior A Emision

Debe ser una vista de resultado operativa, no una pantalla explicativa. Contenido minimo:

- estado, numero fiscal/CDC cuando existan, cliente y total;
- boton para abrir/ver comprobante;
- descarga KUDE/PDF;
- descarga XML cuando corresponda;
- copiar link;
- compartir por WhatsApp;
- campo editable de numero WhatsApp destino.

El telefono del cliente se usa por defecto si existe. El operador puede reemplazarlo solo para ese envio sin actualizar la agenda.

## Nueva Nota De Credito

Pantalla separada de `Nueva factura`.

Contenido:

- buscador/lista de facturas emitidas elegibles;
- filtros rapidos para ubicar factura por numero, cliente, documento, fecha o total;
- resumen de factura seleccionada: cliente, fecha, numero fiscal, condicion, total y estado;
- motivo obligatorio;
- accion principal `Emitir nota de credito`;
- resultado usando la misma vista simplificada de entrega.

Reglas UX:

- no mostrar el editor de factura completo;
- no permitir seleccionar NCE ni documentos anulados/rechazados como origen;
- si una factura ya tiene NCE total, mostrar bloqueo claro;
- la pantalla debe dejar claro que la NCE es total en este MVP.

## Documentos

El listado de documentos debe exponer filtros visibles y tactiles:

- `Todos`;
- `Contado`;
- `Credito`;
- `Nota de credito`.

Los filtros deben combinarse con busqueda/estado/fecha cuando existan. En mobile no deben generar scroll horizontal ni ocultar la accion de ver detalle.

## Layout Desktop

Desktop no debe cambiar el flujo mental. Se permite:

- encabezado y comprobante en una banda horizontal;
- cliente y totales en columnas;
- lineas como grilla;
- acciones fijas al final del contenido, no flotantes invasivas.

## Validacion Visual

Para cerrar `UI-005` se debe verificar con Playwright:

- mobile 390x844;
- tablet aproximado 768x1024;
- desktop 1280x800;
- sin solapamiento entre cliente, lineas, totales y acciones;
- textos largos de cliente/item no rompen tarjetas ni botones;
- filas de productos en mobile no generan scroll horizontal;
- filtros de documentos `Contado`, `Credito` y `Nota de credito` son usables en mobile;
- `Nueva nota de credito` permite seleccionar factura elegible y bloquea casos no elegibles;
- el refresh de token no limpia cliente ni lineas cargadas;
- la pantalla posterior a emision muestra acciones rapidas sin textos largos de instruccion;
- emitir queda cerca de totales en mobile.

## Dependencias

- `UI-004A`: readiness fiscal visible.
- `INV-002`: preview backend.
- `CLI-002` y `CLI-003`: busqueda/alta rapida de cliente.
- `CAT-002` y `CAT-003`: busqueda/alta rapida de item.
- `TAX-004`: calculos fiscales probados.
