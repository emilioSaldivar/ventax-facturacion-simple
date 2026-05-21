# PLAN Producto MVP v0.1 - Facturacion Simple Cliente

Este plan implementa `docs/SPEC_PRODUCTO_MVP_v0.1.md`.

## 1. Estrategia General

Construir el producto como una aplicacion SaaS separada del backend fiscal Ventax `facturacion-electronica`.

Arquitectura logica:

```text
Cliente operacion mobile-first
  -> Backend SaaS Node/Express
      -> PostgreSQL SaaS
      -> API facturacion-electronica Ventax

Cliente backoffice interno
  -> Backend SaaS Node/Express
      -> PostgreSQL SaaS
      -> API facturacion-electronica Ventax
```

El frontend operativo atiende al usuario sin experiencia digital. El backoffice queda separado y orientado a soporte interno.

## 2. Stack Tecnico Fijado Para MVP

- Frontend operativo: React + Vite como PWA mobile-first.
- Frontend backoffice: React + Vite, separado por app/ruta y permisos internos.
- Backend: Node.js + Express.
- Base de datos: PostgreSQL.
- Migraciones y queries: SQL directo versionado en el repo.
- Auth recomendado: access token JWT corto + refresh token en cookie httpOnly, con almacenamiento server-side de sesiones/refresh para revocacion.
- Estilo UI: identidad Ventax basada en los SVG oficiales de `ventax_logos/`, tipografia y sistema visual propio con CSS mantenible. Se evita sumar Tailwind si CSS propio resuelve el MVP con menor complejidad.
- Branding: usar `VENTAX-PRINCIPAL.svg`, `VENTAX-CELESTE.svg`, `VENTAX-BLANCO.svg`, `VENTAX-NEGRO.svg`, `VENTAX-NEGATIVO.svg` e isotipos `VENTAX-ISO-*` segun contraste y espacio disponible; no usar logos generados cuando exista asset oficial.
- OpenAPI propia del SaaS: `spec/openapi.yaml`.

Justificacion:

- Vite/React permite una PWA liviana y estable para celular/tablet.
- Express y SQL directo respetan la preferencia del proyecto y mantienen baja complejidad.
- JWT corto + refresh httpOnly equilibra UX mobile, seguridad y revocacion de sesiones.

## 3. Modulos

- `OperationApp`: pantalla mobile-first de emision, listado y entrega.
- `OperationApp` debe separar la operacion en pantallas: nueva factura, nueva nota de credito, informacion/estado, catalogo y documentos.
- `BackofficeApp`: configuracion interna de usuarios y asignaciones.
- `Platform`: tenants, planes y suscripciones.
- `Identity`: usuarios, sesiones, roles, permisos y asignacion operativa.
- `Facturadores`: vinculo con `emisor_id` fiscal y configuracion efectiva local.
- `Clientes`: base compartida por documento y agenda por facturador.
- `Catalogo`: productos/servicios reutilizables por facturador.
- `Facturacion`: emision contado/credito, snapshots, estados y entrega.
- `NotasCredito`: emision de NCE desde factura elegible.
- `FiscalGateway`: cliente HTTP hacia `facturacion-electronica`.
- `Auditoria`: eventos operativos y trazabilidad.

## 4. Modelo De Datos Inicial

Tablas sugeridas:

- `tenants`
- `planes`
- `suscripciones`
- `usuarios`
- `roles`
- `permisos`
- `usuario_roles`
- `usuario_operacion_config`
- `facturadores`
- `facturador_config_fe`
- `cliente_identidades`
- `facturador_clientes`
- `catalogo_items`
- `facturas_operativas`
- `factura_items_snapshot`
- `notas_credito_operativas`
- `documento_entrega_links`
- `sesiones`
- `refresh_tokens`
- `audit_events`

Campos obligatorios transversales:

- `tenant_id` en datos operativos;
- `facturador_id` en datos de emision;
- `created_at`, `updated_at`;
- `created_by` cuando aplique.

Decisiones de datos:

- `cliente_identidades` guarda informacion compartida por documento/RUC/CI para prediccion.
- `facturador_clientes` representa la agenda propia del facturador.
- La identidad compartida debe ser invisible para operadores y clientes finales: se usa solo para autocompletar y facilitar el alta en `facturador_clientes`. La experiencia, copys y respuestas operativas deben presentar siempre al cliente como parte de la agenda propia del facturador.
- `catalogo_items` pertenece a un solo facturador.
- No se modela catalogo global: la busqueda y edicion de productos/servicios siempre se aisla por `facturador_id`.
- `usuario_operacion_config` fija el unico facturador, establecimiento, punto, perfil y actividad efectiva del operador.
- No se persisten borradores.

## 5. API Propia Del SaaS

Contratos iniciales a documentar antes de implementar:

- login, refresh y logout;
- contexto operativo del usuario;
- readiness operativo;
- readiness fiscal agregado desde backend SaaS, no desde la UI;
- busqueda predictiva de clientes por documento;
- alta rapida de cliente desde factura;
- CRUD de agenda de clientes;
- busqueda de catalogo por codigo/nombre/descripcion;
- alta rapida de producto/servicio con IVA 10% desde factura;
- CRUD de productos/servicios para backoffice/gestion;
- emision de factura contado;
- emision de factura credito;
- listado y detalle de documentos emitidos;
- emision de nota de credito desde factura elegible;
- cancelacion/anulacion cuando backend fiscal lo permita;
- obtencion de enlaces/artefactos PDF/KUDE y XML;
- estado de envio por email delegado al backend fiscal;
- generacion/copia de link y link WhatsApp.

## 6. Integracion Fiscal

Crear una capa `FiscalGateway` con responsabilidades acotadas:

- construir request fiscal desde la factura operativa;
- enviar `external_ref` idempotente;
- permitir evolucion a emision asincrona/resiliente con outbox o worker;
- enviar condicion `CONTADO` o `CREDITO`;
- emitir NCE vinculada a una factura;
- manejar timeouts y errores normalizados;
- exponer feedback operativo claro y acciones recuperables sin requerir soporte cuando el fallo sea gestionable por el cliente;
- consultar estado por `document_id`, `cdc` o `external_ref`;
- resolver metadata y descarga de PDF/KUDE/XML;
- usar `/nota-credito` para NCE;
- usar `/files/xml/{cdc}` para XML final;
- usar `/files/kude/{cdc}.pdf` para PDF KUDE;
- delegar envio de email a `facturacion-electronica`;
- solicitar cancelacion/anulacion cuando aplique;
- no guardar ni loguear secretos fiscales.

## 7. UI Operativa

La primera pantalla debe ser la aplicacion operativa, no una landing.

Vistas iniciales:

- login;
- inicio operativo con facturador resuelto automaticamente;
- editor de factura simple;
- resultado de emision;
- listado de facturas/notas emitidas;
- nueva nota de credito;
- detalle de documento;
- productos/servicios;
- clientes.

No hay selector de facturador en la pantalla operativa del MVP.

### 7.1 Editor De Factura Simple

El editor sera la pantalla central del MVP. Debe organizarse en bandas similares al talonario manual:

1. encabezado fiscal resuelto;
2. datos del comprobante y condicion de venta;
3. datos del cliente;
4. grilla de productos/servicios;
5. resumen de totales y liquidacion de IVA;
6. boton principal `Emitir`.

Campos principales:

- fecha de emision;
- condicion de venta: `CONTADO` o `CREDITO`;
- RUC/documento del cliente;
- nombre o razon social;
- direccion opcional;
- telefono opcional;
- email opcional;
- cantidad;
- codigo de item;
- descripcion;
- precio unitario con IVA incluido;
- IVA por item;
- subtotal por linea;
- subtotal general;
- total sin IVA;
- liquidacion IVA 5%;
- liquidacion IVA 10%;
- total IVA;
- total a pagar.

Comportamiento:

- numero fiscal, timbrado, establecimiento, punto, perfil y actividad se muestran como datos resueltos;
- antes de emitir, el numero fiscal se muestra como pendiente;
- no hay guardado de borrador;
- se puede editar todo antes de emitir;
- clientes se buscan por RUC/CI y pueden crearse en popup;
- items se buscan desde el campo codigo por codigo, nombre o descripcion;
- item de catalogo no se edita desde factura;
- item nuevo desde factura queda con IVA 10% por defecto;
- los totales se recalculan en frontend para feedback inmediato y en backend como autoridad;
- el layout debe ser denso, escaneable y mobile-first.

### 7.2 Resultado Y Entrega

Luego de emitir se muestra:

- estado;
- numero fiscal;
- CDC;
- total;
- botones para ver comprobante, descargar PDF/KUDE, descargar XML, copiar enlace, WhatsApp y estado/accion informativa de email cuando haya correo.

Si no hay correo, la UI prioriza copiar enlace o WhatsApp. Si hay correo, el envio lo realiza `facturacion-electronica`; nuestro sistema solo muestra el resultado disponible o la accion informativa definida por el contrato fiscal.

### 7.2.1 Link Publico

El SaaS generara un link publico propio para el cliente final.

Decision:

- URL no autenticada;
- token opaco aleatorio de alta entropia;
- no usar CDC puro como URL publica;
- sin expiracion obligatoria para MVP;
- revocable/regenerable desde soporte/backoffice;
- pantalla publica limitada a ver/descargar KUDE/PDF y XML.

### 7.3 Listado De Documentos

El listado debe permitir:

- filtrar por `Todos`, `Contado`, `Credito` y `Nota de credito`;
- filtrar por estado y fecha;
- ver detalle;
- descargar/ver link cliente;
- cancelar/anular si es elegible;
- iniciar nota de credito si es elegible;
- ver rechazo y accion `Contactar soporte`.

### 7.4 Nueva Nota De Credito

La NCE debe tener pantalla propia dentro de la app operativa.

La pantalla debe permitir:

- buscar facturas emitidas elegibles;
- filtrar/ubicar por cliente, documento, numero, fecha o total cuando el backend lo permita;
- seleccionar una factura origen;
- ver resumen de cliente, condicion, fecha, numero fiscal, estado y total;
- cargar motivo obligatorio;
- emitir NCE total;
- mostrar resultado y entrega con las mismas acciones rapidas de comprobante.

Reglas:

- no se reutiliza el editor de `Nueva factura`;
- solo facturas `EMITIDA` con CDC y sin NCE total previa son elegibles;
- documentos `NOTA_CREDITO`, `ANULADA`, `RECHAZADA` o pendientes no pueden ser origen;
- la NCE parcial queda fuera del MVP.

## 8. Backoffice Interno

Backoffice no es la prioridad de implementacion del servicio principal, pero debe existir en el modelo.

Debe permitir:

- crear usuarios;
- asociar usuario a un unico facturador;
- asociar establecimiento, punto, perfil de emision y actividad economica efectiva;
- verificar readiness;
- bloquear/desbloquear acceso operativo.

El onboarding fiscal lo realiza soporte interno.

## 9. Validaciones

- usuario activo;
- sesion valida;
- usuario con configuracion operativa unica;
- readiness fiscal antes de emitir;
- cliente con documento y nombre/razon social;
- items con cantidad positiva, descripcion, precio entero e IVA permitido;
- precio unitario sin decimales;
- productos 5% o exentos solo desde catalogo precargado;
- totales recalculados en backend;
- totales de UI consistentes con backend antes de emitir;
- base imponible e IVA redondeados por linea;
- liquidaciones agrupadas por tasa como suma de lineas ya redondeadas;
- idempotencia por `external_ref`;
- reintentos controlados para documentos pendientes sin duplicar documento fiscal;
- NCE solo desde factura elegible.
- filtros de documentos por contado, credito y nota de credito.

## 10. Riesgos

- NCE, XML y KUDE/PDF ya figuran en el OpenAPI de `facturacion-electronica` actualizado;
- WhatsApp directo depende del link publico propio generado por el SaaS;
- email queda delegado a `facturacion-electronica`, sin proveedor transaccional propio en este sistema.
- La emision fiscal sincrona puede ser un paso tecnico inicial, pero el diseno debe converger a envio asincrono/recuperable para reducir intervencion de soporte.

## 11. Orden Recomendado

1. Mantener `spec/openapi.yaml` alineado con cada cambio de contrato.
2. Modelo SaaS base y auth.
3. Configuracion operativa unica por usuario.
4. Clientes y catalogo.
5. Calculos de totales e IVA.
6. FiscalGateway con mocks.
7. Emision contado y credito.
8. Resultado, entrega y artefactos.
9. Listado, filtros, cancelacion/anulacion y NCE.
10. UI mobile-first completa con pantallas separadas.
11. Testing end-to-end.

La iteracion de UI debe incluir una verificacion visual de marca para confirmar que encabezado, login, PWA, menu y pantallas operativas usan assets oficiales desde `ventax_logos/`.

## 12. Estrategia De Testing

- unitarios para calculo de totales, IVA redondeado por linea y sumatoria agrupada por tasa;
- unitarios para permisos/configuracion operativa unica;
- integracion para clientes compartidos y agenda por facturador;
- integracion para catalogo por facturador;
- integracion para FiscalGateway con mock;
- integracion para emision contado, credito y NCE;
- tests de aislamiento entre facturadores;
- smoke test contra ambiente local/staging del backend fiscal;
- pruebas visuales del editor en celular, tablet y desktop;
- prueba visual especifica para verificar que cliente, lineas y totales no se solapen.
- pruebas de flujo completo con Playwright usando la UI contra backend local/mock para login, cliente, item, preview, emision, entrega, listado filtrado y nueva nota de credito.
