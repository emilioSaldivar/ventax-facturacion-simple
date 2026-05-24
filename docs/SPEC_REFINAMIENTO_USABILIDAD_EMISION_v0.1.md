# SPEC Refinamiento Usabilidad Emision v0.1

## Alineacion

- `AGENTS.md`
- `docs/METODOLOGIA_SDD.md`
- `docs/SPEC_PRODUCTO_MVP_v0.1.md`
- `docs/SPEC_DOCUMENTOS_EMISION_UX_v0.1.md`
- `docs/WIREFRAME_EDITOR_FACTURA_MVP_v0.1.md`
- `spec/openapi.yaml`

## Objetivo

Reducir friccion operativa en `Nueva factura` para que el operador:

- decida en cada carga de item si desea guardar el producto/servicio en catalogo o usarlo solo en la factura actual;
- pase de forma directa a la seccion de envio/compartir despues de confirmar la carga de items, sin scroll manual adicional;
- termine el flujo de compartir con el formulario de `Nueva factura` limpio y listo para iniciar la siguiente emision.

Ademas, mejorar la pantalla de `Informacion` para que el estado de habilitacion para facturar se comunique en lenguaje de negocio, entendible para cliente final no tecnico.

## Problemas Detectados

1. La carga de producto/servicio no permite elegir entre `guardar en catalogo` o `usar solo esta vez`.
2. Luego de confirmar la carga, el operador debe hacer scroll adicional para llegar a `Envio de documentos`.
3. Despues de compartir, la pantalla conserva datos cacheados de la factura anterior y no queda lista para una nueva emision.
4. La pantalla de readiness usa terminos tecnicos (`tenant`, `backend`, `contexto fiscal local`) que no explican responsabilidades concretas del cliente final.
5. La cabecera de `Nueva factura` expone datos fiscales de forma permanente y muestra una nota tecnica no requerida para el operador final.
6. En la seccion de cliente, el placeholder actual del documento confunde y no guia bien la carga.
7. El teclado no se adapta por tipo de documento, lo que aumenta errores de carga.
8. Los campos obligatorios no tienen jerarquia visual suficiente frente a opcionales.
9. En el modal de `Agregar producto`, el teclado mobile tapa contenido y obliga a scroll manual para recuperar contexto.
10. `Opciones avanzadas` no comunica valor de negocio; IVA y codigo interno deben ser mas directos.

## Alcance Funcional

### 1) Guardado opcional de producto/servicio

- En el flujo de alta/edicion de item de factura se incorpora una decision explicita:
  - `Guardar en catalogo`.
  - `No guardar en catalogo (solo esta factura)`.
- Si el operador elige no guardar, el item se agrega a la factura sin persistirse en catalogo.
- Si elige guardar, se mantiene la persistencia actual en catalogo y se agrega a la factura.
- La opcion debe ser clara en mobile-first y no exponer complejidad fiscal extra al operador.

### 2) Salto directo a envio de documentos

- Al confirmar la carga de item(s), la interfaz debe llevar al operador directamente al bloque accionable de `Envio de documentos`.
- El comportamiento debe evitar que el usuario dependa de scroll manual para continuar el flujo principal.
- El salto debe funcionar en viewport mobile y desktop/tablet.

### 3) Limpieza post compartir

- Al completar exitosamente la accion de compartir/envio, el sistema debe reiniciar el estado operativo de `Nueva factura`.
- Deben limpiarse cliente, items, totales, observaciones y estados transitorios de la factura emitida/compartida.
- La vista debe quedar lista para iniciar una nueva factura sin residuos de la anterior.

### 4) Lenguaje no tecnico en pantalla de Informacion

- La seccion que hoy muestra readiness tecnico debe traducirse a criterios de negocio accionables para el cliente final.
- El objetivo es que el operador entienda si puede facturar y que accion debe tomar si algo falta, sin conocer arquitectura interna.
- Mapeo minimo esperado de lenguaje:
  - `Tenant activo` -> `Membresia activa`.
  - `Suscripcion activa` -> `Suscripcion al dia`.
  - `Usuario con configuracion operativa` -> no mostrar como check separado al cliente final.
  - `Facturador activo` -> `Facturador activo`.
  - `Contexto fiscal local completo` -> `Configuracion fiscal completa`.
  - `Backend fiscal disponible (real)` -> ocultar del bloque para cliente final y mover a vista tecnica/backoffice.
- La UI debe priorizar un resumen simple:
  - estado general: `Listo para facturar` o `Faltan requisitos para facturar`;
  - lista de requisitos en texto comun;
  - mensaje de accion recomendado cuando falle un requisito (por ejemplo: regularizar suscripcion, contactar soporte para configuracion fiscal).
- Debe existir separacion de audiencia:
  - vista operador/cliente final: solo lenguaje de negocio;
  - vista backoffice/soporte: detalle tecnico cuando sea necesario para diagnostico.

### 5) Cabecera fiscal colapsable en Nueva factura

- Los datos de cabecera fiscal de `Nueva factura` (facturador legal, RUC, establecimiento/punto, fecha, timbrado, siguiente estimado) deben estar ocultos por defecto.
- La visualizacion de esta cabecera se activa/desactiva solo mediante el boton de cabecera con icono de ojo.
- Debe mostrarse estado claro de visibilidad (`Ver datos de cabecera` / `Ocultar datos de cabecera`).
- Se elimina el texto: `Numero fiscal pendiente de emision. El sistema lo asigna al confirmar con SIFEN.`.
- El resto del flujo por debajo de la cabecera se mantiene sin cambios funcionales.

### 6) Formulario de cliente mas claro y guiado

- El campo de numero de documento usa placeholder neutro: `Ingrese numero de documento`.
- Cuando tipo de documento sea `RUC` o `CI`, el input debe abrir teclado numerico en mobile.
- Para otros tipos de documento, el input puede mantenerse alfanumerico.
- Campos obligatorios visibles y destacados:
  - `Documento` (tipo + numero).
  - `Nombre o razon social`.
- Campos opcionales identificados como opcionales:
  - `Correo`.
  - `Telefono`.
  - `Direccion`.

### 7) Modal de agregar producto orientado a uso real mobile

- Orden visual del formulario:
  - primer campo visible: `Cantidad`;
  - el foco inicial del cursor al abrir modal debe estar en `Descripcion`.
- `Descripcion` usa placeholder claro (una de estas estrategias):
  - fijo: `Ingrese descripcion`; o
  - rotativo con ejemplos de negocio, por ejemplo:
    - `Ej. Coca Cola 1L descartable`
    - `Ej. Por servicios de consultoria`
    - `Ej. Por servicio de mantenimiento`
- En mobile, al abrir modal y levantar teclado:
  - el modal debe reposicionarse para que titulo + `Descripcion` + accion principal no queden cortados;
  - no debe exigir scroll manual para recuperar el inicio del formulario.

### 8) IVA y codigo interno simplificados

- Reemplazar etiqueta `Opciones avanzadas` por una etiqueta de negocio:
  - `+ Agregar codigo`; o
  - `+ Codigo interno`.
- El selector de IVA debe verse como 3 opciones tactiles pequenas y visibles:
  - `IVA 5%`
  - `IVA 10%` (default)
  - `EX`
- La seleccion de IVA debe resolverse con un solo touch.
- `Codigo interno` se despliega al tocar la accion y permite carga opcional.
- El campo `Descripcion` debe aceptar texto que incluya codigo interno y descripcion cuando el operador prefiera cargar ambos juntos.

## No Alcance

- Cambios en logica fiscal SIFEN o numeracion fiscal.
- Cambios de dominio fuera de `Nueva factura` y flujo de compartir.
- Rediseno integral de catalogo o de documentos historicos.
- Exponer detalles de infraestructura interna al cliente final.

## Reglas Y Restricciones

- Se preserva limite de dominio: la persistencia fiscal sigue en `facturacion-electronica`.
- `tenant_id` y `facturador_id` permanecen obligatorios en toda operacion.
- No exponer certificados, CSC ni secretos en UI o logs.
- Si cambia contrato HTTP para catalogo/items, actualizar `spec/openapi.yaml`.

## Criterios De Aceptacion

1. El operador puede agregar un item y decidir si se guarda o no en catalogo sin bloquear la emision.
2. Al confirmar la carga, la UI posiciona de forma directa al usuario en `Envio de documentos`.
3. Tras compartir con exito, al abrir/volver a `Nueva factura` el formulario aparece limpio.
4. El flujo completo funciona en mobile primero y al menos un viewport desktop/tablet.
5. La pantalla de `Informacion` evita terminos tecnicos y muestra requisitos de habilitacion en lenguaje de negocio comprensible para operador no tecnico.
6. Los detalles tecnicos (disponibilidad de servicios internos) quedan fuera de la vista principal del cliente final y reservados a soporte/backoffice.
7. En `Nueva factura`, la cabecera fiscal inicia oculta y solo se muestra al usar el icono de ojo.
8. La nota `Numero fiscal pendiente de emision...` no se muestra en la interfaz.
9. El placeholder del documento en cliente es `Ingrese numero de documento`.
10. Con `RUC` o `CI`, el teclado mobile del documento es numerico; con otros tipos, alfanumerico.
11. `Documento` y `Nombre o razon social` se perciben como obligatorios; `Correo`, `Telefono` y `Direccion` como opcionales.
12. En el modal de producto, `Cantidad` es el primer campo visible y el foco inicial queda en `Descripcion`.
13. El modal no queda tapado por teclado en mobile en su zona superior critica.
14. El IVA se elige con un touch entre `5%`, `10%` y `EX`, con `10%` preseleccionado.
15. `Opciones avanzadas` deja de usarse y se reemplaza por `+ Agregar codigo` o `+ Codigo interno`.

## Validacion Minima Esperada

- Frontend:
  - `npm run typecheck --workspace @facturacion-simple/web-operacion`
  - `npm run build --workspace @facturacion-simple/web-operacion`
- Aplicacion desplegada:
  - `bash scripts/deploy.sh`
- Verificacion visual/E2E con Playwright contra contenedores:
  - alta de item con y sin guardado en catalogo;
  - salto directo a `Envio de documentos`;
  - compartir y limpieza automatica de `Nueva factura`.
  - lectura de `Informacion` en mobile: textos no tecnicos, estado general claro y mensajes de accion.
