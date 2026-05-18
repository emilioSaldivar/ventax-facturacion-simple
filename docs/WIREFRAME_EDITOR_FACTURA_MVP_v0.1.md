# Wireframe Editor Factura MVP v0.1

Este documento cierra el micro-wireframe tecnico previo a `UI-005`. El objetivo es implementar el editor sin improvisar estructura visual ni romper la similitud mental con una factura manual.

## Principios

- Mobile-first: el flujo principal debe funcionar comodamente en celular.
- Denso y escaneable: evitar una landing o composicion decorativa.
- Familiar para operador manual: mantener orden comprobante -> cliente -> lineas -> totales -> emitir.
- Sin campos fiscales editables: numeracion, timbrado, CDC, establecimiento y punto se muestran como datos resueltos.
- Feedback recuperable: errores operativos deben indicar que corregir antes de emitir; errores fiscales pendientes deben ofrecer refrescar/reintentar cuando sea seguro.

## Orden Mobile

### 1. Encabezado Fiscal Resuelto

Contenido:

- razon social del facturador;
- RUC;
- actividad economica;
- establecimiento y punto;
- perfil de emision;
- readiness operativo/fiscal.

Comportamiento:

- compacto, siempre visible al entrar;
- no editable;
- si readiness falla, mostrar bloqueo antes del formulario.

### 2. Comprobante Y Condicion

Contenido:

- fecha de emision;
- condicion `CONTADO` o `CREDITO`;
- numero fiscal como `pendiente`;
- timbrado/configuracion como texto secundario.

Controles:

- selector segmentado para contado/credito;
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
- guardar cliente antes o durante la emision, sin cliente ocasional.

### 4. Lineas

Mobile:

- usar tarjetas compactas por linea;
- mostrar cantidad, codigo, descripcion, precio unitario, IVA y subtotal;
- accion de eliminar linea;
- accion de agregar linea siempre cerca del final de la lista.

Tablet/desktop:

- puede usarse grilla compacta con columnas equivalentes a la factura manual.

Reglas:

- codigo busca catalogo por codigo/nombre/descripcion;
- item de catalogo bloquea descripcion/precio/IVA dentro de la factura;
- item nuevo sin codigo queda IVA 10%;
- IVA 5% o exenta debe venir de catalogo.

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
- emitir queda cerca de totales en mobile.

## Dependencias

- `UI-004A`: readiness fiscal visible.
- `INV-002`: preview backend.
- `CLI-002` y `CLI-003`: busqueda/alta rapida de cliente.
- `CAT-002` y `CAT-003`: busqueda/alta rapida de item.
- `TAX-004`: calculos fiscales probados.
