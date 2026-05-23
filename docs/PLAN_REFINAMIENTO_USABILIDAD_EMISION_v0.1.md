# PLAN Refinamiento Usabilidad Emision v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_REFINAMIENTO_USABILIDAD_EMISION_v0.1.md`
- `docs/SPEC_DOCUMENTOS_EMISION_UX_v0.1.md`
- `docs/WIREFRAME_EDITOR_FACTURA_MVP_v0.1.md`
- `docs/TASKS_REFINAMIENTO_USABILIDAD_EMISION_v0.1.md`

## Estrategia

Implementar refinamientos puntuales sobre el flujo existente de `Nueva factura` sin alterar responsabilidades fiscales ni contratos no necesarios.

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

## Riesgos Y Mitigaciones

- Riesgo: confundir al operador con nueva decision de guardado.
  - Mitigacion: labels explicitos y opcion por defecto segura definida en UI.
- Riesgo: scroll/foco inconsistente por cambios de layout responsive.
  - Mitigacion: anclar por `ref` estable del bloque de envio y cubrir viewports.
- Riesgo: reset incompleto deje residuos de estado.
  - Mitigacion: centralizar la limpieza en una sola rutina reutilizable.

