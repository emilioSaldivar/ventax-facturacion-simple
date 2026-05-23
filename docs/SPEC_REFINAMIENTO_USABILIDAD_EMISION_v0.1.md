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

## Problemas Detectados

1. La carga de producto/servicio no permite elegir entre `guardar en catalogo` o `usar solo esta vez`.
2. Luego de confirmar la carga, el operador debe hacer scroll adicional para llegar a `Envio de documentos`.
3. Despues de compartir, la pantalla conserva datos cacheados de la factura anterior y no queda lista para una nueva emision.

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

## No Alcance

- Cambios en logica fiscal SIFEN o numeracion fiscal.
- Cambios de dominio fuera de `Nueva factura` y flujo de compartir.
- Rediseno integral de catalogo o de documentos historicos.

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

