# SPEC Producto MVP v0.1 - Facturacion Simple Cliente

## 1. Proposito

Construir una aplicacion web SaaS mobile-first para emitir facturas electronicas y notas de credito en Paraguay, consumiendo `facturacion-electronica` como backend fiscal externo de Ventax.

El producto debe facilitar la transicion desde una factura manual escrita a una experiencia digital simple. El operador principal no tiene experiencia digital y no debe operar XML, SIFEN, certificados, CSC, timbrados ni numeracion fiscal.

## 2. Alcance Comercial Del MVP

El MVP incluye:

- Paraguay y SIFEN exclusivamente;
- Factura Electronica `CONTADO`;
- Factura Electronica `CREDITO`, solo emision, sin gestion posterior de recibos, cuotas, cobranza ni cuenta corriente;
- Nota de Credito Electronica;
- pantalla principal de facturacion/venta optimizada para celular y tablet, utilizable en PC/notebook;
- backoffice interno separado para soporte/configuracion, no prioritario frente al servicio principal;
- usuario operador asociado a un unico facturador, establecimiento, punto de expedicion, perfil de emision y actividad economica efectiva;
- clientes comerciales guardados siempre;
- catalogo reutilizable de productos/servicios por facturador;
- precios unitarios en guaranies enteros, con IVA incluido;
- IVA permitido: `10%`, `5%`, `EXENTA`;
- descarga o enlace de PDF/KUDE y XML usando endpoints del backend fiscal;
- envio por email automatico desde `facturacion-electronica` cuando el cliente tenga correo;
- opcion de copiar enlace o compartir por WhatsApp cuando no haya correo o cuando el operador lo elija.

## 3. Fuera De Alcance v0.1

- caja y cierre de caja;
- inventario, depositos, compras y proveedores;
- balanza o impresora local RAW;
- recibos, cobros, cuotas, estado de deuda o cuenta corriente para facturas credito;
- contingencia offline;
- generacion propia de XML, firma, QR o comunicacion directa con SIFEN;
- administracion directa de secretos fiscales en la UI operativa;
- POS completo;
- soporte automatizado ante rechazos SIFEN, salvo mostrar estado y accion de contacto con soporte en la matriz.

## 4. Actores

- `OPERADOR_FACTURACION`: usa celular/tablet para emitir facturas y consultar documentos. No requiere experiencia digital.
- `SOPORTE_INTERNO`: configura onboarding fiscal, usuarios, facturador, establecimiento, punto, perfil de emision y actividad economica desde backoffice interno.
- `ADMIN_INTERNO`: administra la plataforma y permisos internos.

Para el MVP operativo, un usuario de facturacion pertenece a un solo facturador. No se permite que un operador emita para varios facturadores.

## 5. Separacion De Superficies

El producto tendra dos superficies claramente separadas:

- `Operacion`: pantalla principal para emitir, consultar facturas/notas y entregar comprobantes.
- `Backoffice interno`: configuracion de usuarios, facturador, establecimiento, punto de expedicion, perfil de emision, actividad economica y vinculo con `facturacion-electronica`.

La implementacion debe priorizar `Operacion`. El backoffice se documenta y modela, pero puede implementarse despues de cerrar el flujo principal.

## 6. Reglas De Negocio

- Todo dato operativo debe pertenecer a un `tenant_id`.
- Toda emision debe pertenecer a un `facturador_id`.
- En el MVP, cada operador esta asociado a un unico `facturador_id`.
- Un `facturador` debe estar vinculado con un `emisor_id` fiscal valido del backend `facturacion-electronica`.
- El operador nunca escribe numero fiscal, timbrado, establecimiento, punto de expedicion ni CDC en la pantalla de emision.
- El sistema muestra numero fiscal como `pendiente de emision` hasta que `facturacion-electronica` responda.
- La numeracion fiscal final la asigna `facturacion-electronica`.
- El establecimiento, punto de expedicion, perfil de emision y actividad economica se seleccionan/configuran en backoffice antes de emitir.
- Una actividad economica debe estar previamente asociada a establecimientos, puntos y perfiles donde pueda emitirse.
- La emision se bloquea si el usuario no tiene configuracion operativa completa.
- La emision se bloquea si el backend fiscal informa readiness insuficiente.
- No se guardan borradores.
- Se permite editar la factura antes de emitir.
- Cada emision debe guardar snapshot de cliente, items, totales, usuario y respuesta fiscal resumida.
- Los secretos fiscales no se exponen a operadores.
- La experiencia de carga debe parecerse al orden mental de una factura manual: comprobante, cliente, lineas, totales e IVA.

## 7. Clientes

### 7.1 Datos Obligatorios Y Opcionales

Campos obligatorios:

- RUC, CI u otro documento fiscal valido;
- nombre o razon social.

Campos opcionales:

- direccion;
- telefono;
- email.

### 7.2 Reglas

- No existe cliente ocasional sin guardar.
- Todo cliente usado en una factura queda guardado.
- Debe existir una base compartida de informacion fiscal de clientes por documento/RUC/CI, disponible para busqueda predictiva entre facturadores.
- Cada facturador mantiene su propia agenda/relacion comercial de clientes.
- Si el cliente no existe en la agenda del facturador, la pantalla de factura debe abrir un popup de carga rapida con los datos obligatorios.
- La busqueda por RUC/CI debe consultar primero la agenda del facturador y luego sugerir datos desde la base compartida.

## 8. Productos Y Servicios

### 8.1 Reglas

- Los productos/servicios se guardan para reutilizar por facturador.
- El codigo no es obligatorio.
- Si el operador carga una descripcion sin codigo, el sistema genera un codigo interno.
- Si el operador carga un codigo, se usa ese codigo para el facturador si no entra en conflicto.
- Desde el campo de codigo de la grilla se debe poder buscar por codigo, nombre o descripcion.
- Si el producto/servicio viene del catalogo, su descripcion, precio e IVA no se editan en la factura; deben editarse en la pantalla de productos/servicios.
- En la pantalla principal de facturacion, los productos nuevos cargados rapidamente quedan con IVA `10%` por defecto.
- Productos/servicios con IVA `5%` o `EXENTA` deben estar precargados desde la pantalla de productos/servicios.

### 8.2 Campos Minimos

- codigo;
- descripcion;
- precio unitario con IVA incluido;
- tipo de IVA: `10%`, `5%`, `EXENTA`;
- activo.

## 9. Totales E IVA

- Los precios unitarios se cargan con IVA incluido.
- No se permiten precios unitarios con decimales en el MVP.
- La cantidad debe ser positiva.
- El subtotal de linea es `cantidad * precio_unitario`.
- El subtotal de linea muestra precio final con IVA incluido.
- El total a pagar se expresa en guaranies enteros.
- El backend recalcula totales y es autoridad antes de emitir.
- La base imponible e IVA se calculan y redondean por linea.
- `ventas_iva`, liquidacion 5/10, total IVA e impresion se calculan sumando lineas ya redondeadas agrupadas por tasa.
- No se recalcula base imponible ni IVA desde el total agrupado por tasa.

El pie de la factura debe mostrar:

- subtotal general con IVA incluido;
- total general con IVA incluido;
- total sin IVA;
- liquidacion de IVA `5%`;
- liquidacion de IVA `10%`;
- total IVA.

Para precios con IVA incluido, en cada linea:

- base IVA 10% = monto gravado 10% / 1.10;
- IVA 10% = monto gravado 10% - base IVA 10%;
- base IVA 5% = monto gravado 5% / 1.05;
- IVA 5% = monto gravado 5% - base IVA 5%;
- exentas no generan IVA.

## 10. Flujo Feliz De Emision

1. El operador inicia sesion.
2. El sistema resuelve automaticamente su facturador, establecimiento, punto, perfil de emision y actividad economica.
3. El sistema verifica readiness fiscal y acceso operativo.
4. El operador carga o selecciona cliente.
5. Si el cliente no existe para el facturador, abre popup de carga rapida.
6. El operador carga lineas desde codigo/busqueda o descripcion nueva.
7. El sistema muestra subtotales, total, total sin IVA y liquidacion IVA.
8. El operador puede editar antes de emitir.
9. El operador presiona `Emitir`.
10. El backend SaaS genera `external_ref` idempotente.
11. El backend SaaS registra la solicitud y envia a `facturacion-electronica` en modo sincrono inicial o asincrono/resiliente cuando exista outbox/worker.
12. Se persisten snapshots, intentos fiscales, `document_id`, `cdc`, numero fiscal y estado cuando el backend fiscal los confirme.
13. Si la confirmacion queda pendiente, la UI muestra estado recuperable y acciones de refrescar/reintentar sin duplicar documento fiscal.
14. La UI muestra comprobante emitido y opciones de ver, descargar, copiar enlace, enviar por WhatsApp o enviar por email cuando existan artefactos.

## 11. Editor De Factura Inspirado En Talonario Manual

### 11.1 Objetivo UX

La pantalla de emision debe facilitar la transicion desde una factura manual escrita. El operador debe reconocer la disposicion general del formulario:

1. encabezado del facturador y datos fiscales resueltos;
2. datos del comprobante;
3. datos del cliente;
4. grilla de cantidad, codigo, descripcion, precio, IVA y subtotales;
5. totales y liquidacion de IVA;
6. acciones de emision y entrega.

No se requiere copiar el diseno grafico exacto del talonario, pero si mantener una disposicion familiar, densa, clara y mobile-first.

### 11.2 Encabezado Visible

El editor debe mostrar:

- nombre o razon social del facturador;
- actividad economica efectiva;
- RUC del facturador;
- establecimiento y punto de expedicion;
- timbrado vigente;
- numero de factura como `pendiente de emision` antes de emitir y numero final luego de emitir;
- fecha de emision;
- condicion de venta: `CONTADO` o `CREDITO`.

### 11.3 Datos Del Cliente

El bloque de cliente debe incluir:

- RUC, CI u otro documento;
- nombre o razon social;
- direccion opcional;
- telefono opcional;
- correo opcional.

### 11.4 Grilla De Productos O Servicios

Columnas equivalentes a la factura manual:

- cantidad;
- codigo de producto o servicio;
- descripcion;
- precio unitario;
- IVA;
- subtotal.

En mobile, la grilla puede adaptarse a filas expandibles o tarjetas compactas, siempre que preserve el orden de carga y no oculte totales criticos.

### 11.5 Totales

El pie del editor debe mostrar:

- subtotal general;
- total sin IVA;
- liquidacion IVA 5%;
- liquidacion IVA 10%;
- total IVA;
- total a pagar.

### 11.6 Criterio De Aceptacion UX

- un operador acostumbrado a completar el talonario manual puede ubicar los mismos campos principales sin capacitacion extensa;
- los campos aparecen en el mismo orden logico que el documento manual;
- el sistema reduce escritura manual mediante busqueda de clientes e items;
- la pantalla deja claro que numero fiscal, timbrado, CDC y estado SIFEN son generados o confirmados por el sistema;
- en celular no hay solapamiento entre cliente, lineas y totales.

## 12. Listado De Facturas Emitidas

El sistema debe incluir una seccion de facturas/notas emitidas.

Debe permitir:

- ver detalle;
- ver estado simple;
- descargar o abrir el mismo link visible para cliente final;
- copiar enlace;
- compartir por WhatsApp;
- enviar por email automaticamente desde el backend fiscal si existe correo;
- cancelar/anular cuando el backend fiscal lo permita;
- ver rechazos SIFEN.

Si una factura es rechazada por SIFEN:

- se muestra el estado `RECHAZADA`;
- se ofrece accion de contactar soporte;
- la implementacion de soporte automatizado queda fuera de MVP y se registra en tareas.

Si corresponde reintentar o corregir, la nueva emision debe usar otra numeracion fiscal. No se reutiliza el numero fiscal rechazado desde la UI operativa.

## 13. Estados UI Iniciales

- `EMITIENDO`
- `EMITIDA`
- `PENDIENTE_SIFEN`
- `RECHAZADA`
- `ERROR_OPERATIVO`
- `ERROR_TEMPORAL`
- `ANULADA`

Acciones por estado:

- `EMITIDA`: ver, descargar, copiar enlace, WhatsApp, email automatico si fue enviado por backend fiscal, cancelar/anular si es elegible.
- `PENDIENTE_SIFEN`: ver detalle, refrescar estado, reintentar envio controlado si el backend confirma que no duplica `external_ref`, contactar soporte solo si no se resuelve.
- `RECHAZADA`: ver detalle, mostrar causa operativa resumida, permitir corregir y emitir un nuevo documento cuando corresponda, contactar soporte solo si la causa no es gestionable.
- `ERROR_TEMPORAL`: reintentar si no hubo numero fiscal confirmado, refrescar estado o contactar soporte si persiste.
- `ERROR_OPERATIVO`: corregir datos antes de emitir si aun no se genero documento fiscal.
- `ANULADA`: ver detalle y descargar constancia/artefactos si aplica.

## 14. Nota De Credito Electronica

El MVP incluye emision de Nota de Credito Electronica.

Alcance minimo:

- seleccionar factura emitida elegible;
- indicar motivo;
- emitir NCE contra el documento relacionado usando `facturacion-electronica`;
- guardar snapshot y estado;
- mostrar, descargar y compartir artefactos igual que una factura.

La UI de NCE puede vivir dentro del listado/detalle de facturas emitidas, no en la pantalla principal de carga de factura.

## 15. Integracion Con Backend Fiscal

El SaaS debe consumir contratos HTTP documentados por `facturacion-electronica` para:

- readiness de emisor/facturador;
- emision de factura contado;
- emision de factura credito;
- emision de nota de credito;
- consulta por `document_id`, `cdc` o `external_ref`;
- obtencion de PDF/KUDE y XML;
- envio automatico de email cuando el payload fiscal incluya correo del receptor y el backend fiscal tenga esa politica activa;
- cancelacion/anulacion cuando aplique;
- refresco de estado cuando corresponda.

La app no debe enviar XML ni manipular estructuras internas SIFEN.

## 15.1 Enlace Publico De Comprobante

El enlace compartible para cliente final sera publico, sin login, para no complicar WhatsApp ni la descarga desde celular.

Reglas:

- no debe usar un ID secuencial ni solo el CDC como identificador publico;
- debe usar un token opaco aleatorio de alta entropia generado por el SaaS;
- la URL publica debe permitir ver o descargar KUDE/PDF y XML;
- la URL publica no debe exponer datos internos del tenant, usuario, configuracion fiscal ni trazas tecnicas;
- el token debe poder revocarse o regenerarse desde soporte/backoffice si se comparte por error;
- no se define expiracion obligatoria en MVP, para preservar facilidad de uso del cliente final.

## 16. Errores Relevantes

- usuario sin configuracion operativa;
- usuario sin permiso;
- facturador sin readiness fiscal;
- cliente con datos fiscales insuficientes;
- item sin descripcion, cantidad, precio o IVA valido;
- intento de editar item de catalogo desde la factura;
- timeout o error tecnico del backend fiscal;
- rechazo fiscal de SIFEN;
- reintento con `external_ref` ya usado;
- artefacto PDF/XML no disponible.

Los errores recuperables deben presentar una accion concreta: corregir datos, refrescar estado, reintentar envio seguro o abrir detalle. Contactar soporte queda como ultima salida, no como accion principal para fallos gestionables.

## 17. Criterios De Aceptacion MVP

- un operador autorizado puede emitir Factura Electronica contado;
- un operador autorizado puede emitir Factura Electronica credito sin modulo de cobranza posterior;
- un operador autorizado puede emitir Nota de Credito Electronica desde una factura elegible;
- el editor presenta campos principales con disposicion equivalente a la factura manual de referencia;
- la experiencia principal funciona de forma optima en celular;
- la factura queda asociada al tenant, facturador, usuario, cliente y snapshots;
- el numero fiscal, CDC y estado provienen del backend fiscal;
- un operador no puede emitir para mas de un facturador;
- el sistema bloquea emision cuando readiness o configuracion operativa no permiten operar;
- el sistema permite recuperar documentos pendientes o errores temporales mediante acciones idempotentes y feedback claro;
- los estados fiscales se traducen a estados simples para UI;
- el operador puede ver, descargar, copiar enlace, compartir por WhatsApp y ver el estado/resultado del email delegado al backend fiscal cuando corresponda;
- no se implementa logica SIFEN propia dentro del SaaS.
