# PLAN Documentos Emision UX v0.1

## Referencias

- `AGENTS.md`
- `docs/SPEC_DOCUMENTOS_EMISION_UX_v0.1.md`
- `docs/WIREFRAME_EDITOR_FACTURA_MVP_v0.1.md`
- `docs/TASKS_IMPLEMENTACION_MVP_v0.1.md`
- `spec/openapi.yaml`

## Enfoque

Resolver la mejora como refinamiento de UX operativo, con cambios acotados en frontend y solo extender backend si el repositorio no cumple la busqueda requerida.

## Documentos: Estado Lista Y Estado Detalle

La vista `Documentos` debe modelarse con un estado explicito:

- `list`: filtros + listado.
- `detail`: detalle del documento seleccionado.

Transiciones:

- seleccionar documento: cargar detalle y pasar a `detail`;
- volver: limpiar solo seleccion visual y volver a `list`;
- cambiar filtros: limpiar seleccion y cargar lista.

No se debe renderizar el listado debajo o al lado del detalle en mobile. En desktop se mantiene la misma regla para evitar ruido operacional.

## Filtros Y Busqueda

Frontend:

- exponer campos `desde` y `hasta` con controles tactiles;
- mantener filtros existentes por `tipo_operativo`, `tipo` o `estado` cuando existan;
- enviar `q` como texto libre;
- mantener `limit`/`offset` existentes.

Backend:

- verificar que `GET /facturas?q=` busque en:
  - numero fiscal;
  - CDC cuando sea util para soporte;
  - documento del receptor;
  - nombre o razon social del receptor.
- si falta algun campo, ajustar repository/service sin cambiar el contrato HTTP.

OpenAPI:

- el contrato ya contempla `desde`, `hasta` y `q`;
- solo se actualiza si se necesita documentar semantica especifica de busqueda para `GET /facturas`.

## Nueva Factura Sin Scroll Inicial

La navegacion desde inicio a `Nueva factura` debe ubicar al operador en el editor accionable.

Opciones tecnicas aceptables:

- compactar aun mas el encabezado fiscal para que el formulario quede inmediatamente visible;
- usar ancla interna o foco inicial en la seccion de comprobante/cliente;
- separar datos del facturador en una banda colapsable o secundaria;
- mantener la accion de emision cerca de totales y resultado de validacion.

La decision final debe priorizar mobile.

Adicionalmente, el bloque `Comprobante` debe incluir un `select` simple para `tipo de servicio` fiscal:

- `1` Venta de mercaderia
- `2` Prestacion de servicios (default)
- `3` Mixto (mercaderia + servicios)

El valor seleccionado debe viajar en `POST /facturas/preview` y `POST /facturas` como `tipo_transaccion`, y el backend debe mapearlo al payload FE `tipoTransaccion`.

## Validacion

Minimo requerido al implementar:

- `npm run typecheck --workspace @facturacion-simple/web-operacion`;
- `npm run build --workspace @facturacion-simple/web-operacion`;
- si se toca API: `npm run test --workspace @facturacion-simple/api`, `npm run typecheck`, `npm run lint`;
- Playwright mobile contra contenedores desplegados con `bash scripts/deploy.sh`:
  - abrir documentos;
  - filtrar por fecha;
  - buscar por numero;
  - buscar por documento receptor;
  - buscar por razon social;
  - seleccionar documento y verificar que la lista desaparece;
  - volver y verificar filtros preservados;
- desde inicio presionar `Nueva factura` y verificar que el formulario accionable queda visible sin scroll manual.
- verificar `tipo de servicio` default en `Prestacion de servicios` y envio correcto de `tipo_transaccion`.
