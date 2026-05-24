# PLAN Refinamiento Usabilidad Emision v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_REFINAMIENTO_USABILIDAD_EMISION_v0.1.md`
- `docs/SPEC_DOCUMENTOS_EMISION_UX_v0.1.md`
- `docs/WIREFRAME_EDITOR_FACTURA_MVP_v0.1.md`
- `docs/TASKS_REFINAMIENTO_USABILIDAD_EMISION_v0.1.md`

## Estrategia

Implementar refinamientos puntuales sobre el flujo existente de `Nueva factura` sin alterar responsabilidades fiscales ni contratos no necesarios.
Incluir refinamiento de la pantalla `Informacion` para alinear copy y jerarquia visual con operador no tecnico.

## Fase 1 - Decision de guardado de item

Objetivo:
- incorporar control de decision por item para guardar/no guardar en catalogo.

Diseno:
- extender estado del formulario de item con bandera de persistencia en catalogo;
- al confirmar item:
  - `guardar`: ejecuta persistencia de catalogo + agrega item a factura;
  - `no guardar`: agrega item solo al estado de factura actual.

Validacion:
- alta de item guardado: visible luego en catalogo y en factura.
- alta de item no guardado: visible en factura, no aparece en catalogo.

## Fase 2 - Transicion directa a envio de documentos

Objetivo:
- evitar scroll manual para continuar al bloque de compartir/envio.

Diseno:
- al confirmar carga de item(s), ejecutar foco o scroll programatico al contenedor de `Envio de documentos`;
- asegurar comportamiento consistente en mobile y desktop/tablet.

Validacion:
- tras confirmar item, el bloque de envio queda visible y listo para accion.

## Fase 3 - Limpieza operativa post compartir

Objetivo:
- dejar `Nueva factura` lista para una nueva emision tras compartir con exito.

Diseno:
- encapsular rutina de reset de estado operativo de factura;
- ejecutar reset en callback de exito de compartir/envio;
- conservar solo contexto global requerido (tenant/facturador autenticado), no datos de la factura emitida.

Validacion:
- despues de compartir exitosamente, el formulario se muestra limpio sin datos cacheados de la factura anterior.

## Fase 4 - QA y cierre documental

Objetivo:
- validar flujo real end-to-end y registrar evidencia.

Ejecucion:
- `npm run typecheck --workspace @facturacion-simple/web-operacion`
- `npm run build --workspace @facturacion-simple/web-operacion`
- `bash scripts/deploy.sh`
- Playwright contra contenedores (mobile primero + desktop/tablet):
  - item con guardado y sin guardado;
  - salto directo a envio;
  - compartir y reset de nueva factura.

Salida:
- actualizar estado final en `docs/TASKS_REFINAMIENTO_USABILIDAD_EMISION_v0.1.md`;
- registrar evidencia operativa en `docs/TASKS_IMPLEMENTACION_MVP_v0.1.md` al cerrar implementacion.

## Fase 5 - Redaccion de negocio para Informacion/Readiness

Objetivo:
- reemplazar lenguaje tecnico por lenguaje comercial/operativo comprensible para cliente final.

Diseno:
- definir un diccionario de terminos para UI cliente final:
  - `Membresia activa`.
  - `Suscripcion al dia`.
  - `Facturador activo`.
  - `Configuracion fiscal completa`.
- eliminar de la vista principal checks tecnicos que no agregan accion directa al cliente (`backend`, detalles de contexto interno, checks redundantes de usuario).
- agregar resumen superior unico:
  - `Listo para facturar` cuando todos los requisitos de negocio estan OK;
  - `Faltan requisitos para facturar` cuando haya bloqueantes.
- para cada requisito no cumplido, mostrar accion concreta en lenguaje simple.

Validacion:
- el operador puede explicar con lectura rapida por que puede/no puede facturar sin interpretar terminos tecnicos.

## Fase 6 - Separacion Cliente Final vs Backoffice

Objetivo:
- conservar diagnostico tecnico para soporte sin exponerlo en la vista principal del cliente final.

Diseno:
- mantener una capa de estado tecnico para uso interno/backoffice;
- exponer en UI cliente solo un estado derivado de negocio;
- si aplica, ubicar detalle tecnico en panel restringido o endpoint de soporte.

Validacion:
- vista cliente no muestra `tenant`, `backend` ni labels tecnicos equivalentes;
- soporte sigue teniendo datos suficientes para diagnosticar incidentes.

## Fase 7 - Cabecera fiscal colapsable en Nueva factura

Objetivo:
- reducir ruido visual y exponer datos fiscales de cabecera solo cuando el operador lo solicite.

Diseno:
- renderizar la cabecera fiscal en estado colapsado por defecto;
- incorporar toggle por boton con icono de ojo en la cabecera de pantalla;
- mantener visibles solo titulo y acciones principales cuando la cabecera este oculta;
- eliminar del UI la nota `Numero fiscal pendiente de emision. El sistema lo asigna al confirmar con SIFEN.`.

Validacion:
- al abrir `Nueva factura`, la cabecera fiscal no aparece expandida;
- al tocar el icono de ojo, la cabecera aparece/desaparece correctamente;
- la nota eliminada no se renderiza en mobile ni desktop/tablet.

## Fase 8 - Claridad de formulario de cliente

Objetivo:
- reducir errores de carga del cliente con placeholders y teclado contextual por tipo de documento.

Diseno:
- cambiar placeholder del numero de documento a `Ingrese numero de documento`;
- definir `inputmode`/mascara segun tipo:
  - `RUC`, `CI`: numerico;
  - otros tipos: alfanumerico;
- reforzar visualmente obligatorios (`Documento`, `Nombre o razon social`);
- marcar `Correo`, `Telefono`, `Direccion` como opcionales.

Validacion:
- operador carga documento sin ambiguedad de formato inicial;
- mobile abre teclado correcto para `RUC`/`CI`.

## Fase 9 - Modal de producto mobile-first

Objetivo:
- optimizar carga de producto para pantallas pequenas con teclado visible.

Diseno:
- dejar `Cantidad` como primer campo visual;
- aplicar autofocus inicial a `Descripcion`;
- definir placeholder fijo o rotativo de `Descripcion`;
- ajustar comportamiento del modal ante teclado (reposicion, altura, safe-area) para evitar corte del bloque superior.

Validacion:
- al tocar `+ Agregar producto` en mobile, la cabecera del modal y `Descripcion` siguen visibles con teclado abierto;
- no se requiere scroll manual para recuperar el inicio del modal.

## Fase 10 - IVA y codigo interno en lenguaje de negocio

Objetivo:
- simplificar decisiones tributarias operativas sin tecnicismo de `opciones avanzadas`.

Diseno:
- reemplazar `Opciones avanzadas` por `+ Agregar codigo` o `+ Codigo interno`;
- mostrar IVA como chips/botones tactiles: `5%`, `10%`, `EX` con default `10%`;
- mantener carga opcional de codigo interno desplegable;
- conservar compatibilidad con descripcion que incluya codigo + texto.

Validacion:
- seleccion de IVA se realiza con un toque;
- operador entiende como cargar codigo interno sin abrir opciones tecnicas.

## Riesgos Y Mitigaciones

- Riesgo: confundir al operador con nueva decision de guardado.
  - Mitigacion: labels explicitos y opcion por defecto segura definida en UI.
- Riesgo: scroll/foco inconsistente por cambios de layout responsive.
  - Mitigacion: anclar por `ref` estable del bloque de envio y cubrir viewports.
- Riesgo: reset incompleto deje residuos de estado.
  - Mitigacion: centralizar la limpieza en una sola rutina reutilizable.
- Riesgo: perder capacidad de soporte al ocultar tecnicismos.
  - Mitigacion: separar explicitamente la vista/telemetria de soporte de la vista cliente final.
- Riesgo: ocultar demasiado informacion y generar dudas en operadores nuevos.
  - Mitigacion: mantener acceso inmediato por icono de ojo con etiqueta clara de `Ver datos de cabecera`.
- Riesgo: cambios de teclado por tipo documental rompan casos edge de entrada.
  - Mitigacion: fallback alfanumerico para tipos no `RUC`/`CI` y validacion por Playwright mobile real.
- Riesgo: modal siga cortado en ciertos Android/iOS.
  - Mitigacion: pruebas en viewport mobile con teclado virtual y ajuste de contenedor con `max-height` dinamico + `overflow` interno controlado.
