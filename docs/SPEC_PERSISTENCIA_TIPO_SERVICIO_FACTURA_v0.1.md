# SPEC Persistencia Tipo Servicio Factura v0.1

## Alineacion

- `AGENTS.md`
- `docs/METODOLOGIA_SDD.md`
- `spec/openapi.yaml`

## Objetivo

Reemplazar el default hardcodeado de `tipo_transaccion` (`2` = "Prestacion de servicios") en la pantalla de creacion de factura por la ultima seleccion real del operador, persistida en base de datos, para que se mantenga entre facturas, entre sesiones y tras cerrar/volver a iniciar sesion.

## Hallazgo Que Origina Este Cambio

El campo "Tipo de servicio" del formulario de factura (`1` Venta de mercaderia, `2` Prestacion de servicios, `3` Mixto) esta hoy hardcodeado a `2` en dos capas independientes, sin ninguna persistencia:

- Frontend (`apps/web-operacion/src/main.tsx:3704`): `useState<TipoTransaccionServicio>(2)`, y se resetea a `2` en cada factura nueva (`main.tsx:4420`, dentro de `createNuevaFactura()`).
- Backend (`apps/api/src/modules/facturas/facturas.routes.ts:41`): validacion Zod con `.default(2)`; y `apps/api/src/modules/facturas/facturas.service.ts:1075`: `input.tipo_transaccion ?? 2` dentro de `buildFiscalEmitRequest()`.

No existe columna dedicada en base de datos: el valor solo queda enterrado dentro del jsonb `fiscal_request_snapshot` de `facturas_operativas` (`db/migrations/0007_facturacion_operativa.sql`), sin ser recuperable como preferencia.

Un facturador que factura mayormente "Venta de mercaderia" debe reseleccionar manualmente esa opcion en cada factura, ya que el sistema siempre vuelve a "Prestacion de servicios" por defecto.

## Precedente De Diseno En El Repositorio

Existe un caso estructuralmente equivalente ya resuelto: `credito_plazo_dias`. No vive en `facturadores` (el emisor/negocio), sino en `actividad_punto_perfiles` (tabla que combina actividad economica + establecimiento + punto de expedicion + perfil de emision, `db/migrations/0009_fiscal_context_effective_config.sql`), se expone al frontend dentro de `fiscal_context` (`context.repository.ts:70,163`, `context.types.ts:28`) y se usa como default en `buildFiscalEmitRequest()` (`facturas.service.ts:1079`: `input.credito_plazo_dias ?? context.fiscal_context.credito_plazo_dias`).

Diferencia clave con este caso: `credito_plazo_dias` es un valor de configuracion administrado por backoffice (`backoffice.routes.ts:155`) que no cambia por seleccion del operador en la pantalla de factura. `tipo_transaccion` en cambio debe actualizarse automaticamente con cada factura emitida, para reflejar siempre la ultima seleccion real del operador ("ultima opcion elegida"), sin pasar por backoffice.

**Nota de arquitectura verificada**: la emision de factura en este repo no es sincrona. `enqueueFacturaEmission()` (`facturas.service.ts:988`) valida y encola el documento (`repository.createQueuedEmission`); un worker separado (`processNextQueuedFiscalEmission()`, `facturas.service.ts:1023`) procesa la cola despues y confirma exito con `repository.completePendingEmission()`. Se decide actualizar la preferencia en el momento del encolado (cuando el operador confirma/envia la factura), no al confirmarse la emision fiscal, porque en ese punto ya se cuenta con todo el contexto resuelto (incluyendo el `actividad_punto_perfil` exacto) y la seleccion `1`/`2`/`3` no tiene relacion causal con un eventual fallo fiscal posterior (que responde a otros motivos: SIFEN, timeouts, etc.), por lo que no hay razon para condicionar la persistencia de esta preferencia de UI a esa confirmacion asincrona.

## Alcance

Incluye:

- agregar columna `tipo_transaccion_default` (`smallint`, `not null default 2`, check `in (1,2,3)`) a `actividad_punto_perfiles`, siguiendo el mismo patron de ubicacion que `credito_plazo_dias`;
- exponer `tipo_transaccion_default` dentro de `fiscal_context` en la respuesta de `GET` de contexto operativo (`context.repository.ts`, `context.types.ts`);
- en el frontend, inicializar el selector de "Tipo de servicio" con `context.fiscal_context.tipo_transaccion_default` en vez de `2` hardcodeado, tanto al cargar la pantalla como al resetear el formulario tras crear una factura (`createNuevaFactura()`);
- al encolar una factura (`enqueueFacturaEmission()`, momento en que el operador confirma el envio y el request pasa validacion), si `tipo_transaccion` enviado difiere del `tipo_transaccion_default` vigente en `actividad_punto_perfiles`, actualizar la columna con el nuevo valor, para que la proxima factura (en esta sesion o en una futura, de cualquier operador que comparta el mismo `actividad_punto_perfil`) parta de esa ultima seleccion. No se condiciona a la confirmacion asincrona posterior del worker fiscal (ver "Nota de arquitectura verificada").

No incluye:

- historizar todas las selecciones pasadas de `tipo_transaccion` (solo se guarda la ultima, no un historial);
- exponer `tipo_transaccion_default` como campo editable en backoffice (a diferencia de `credito_plazo_dias`, este valor solo cambia por uso real en la pantalla de factura, no por configuracion administrativa manual);
- variar la preferencia por cliente/receptor — es una preferencia del punto operativo de emision (`actividad_punto_perfil`), no del cliente facturado; no hay evidencia en el codigo actual de que un mismo facturador necesite alternar el default por cliente.

## Reglas De Negocio

- `tipo_transaccion_default` tiene default `2` para todo `actividad_punto_perfil` existente o nuevo, preservando el comportamiento actual como fallback (sin regresion para quien nunca cambio el valor).
- La actualizacion de `tipo_transaccion_default` ocurre al encolar una factura valida (`enqueueFacturaEmission()` supera validacion y se acepta para procesamiento), nunca al solo tipear/cambiar el selector sin enviar la factura. No se revierte si la emision fiscal falla despues de forma asincrona (ver Errores Relevantes).
- Si dos o mas operadores comparten el mismo `actividad_punto_perfil` (mismo punto de expedicion), el default es compartido entre ellos — es una preferencia del punto operativo, no del usuario individual, siguiendo el mismo alcance que ya tiene `credito_plazo_dias` en ese nivel.
- El campo sigue siendo editable en cada factura individual: el default solo prellenar el selector, el operador puede cambiarlo libremente para esa factura puntual.

## Entidades Afectadas

- `actividad_punto_perfiles` (migracion nueva, columna `tipo_transaccion_default`);
- `OperationalContextResponse["fiscal_context"]` (`apps/api/src/modules/context/context.types.ts`);
- `PgOperationalContextRepository.getOperationalContext()` (`apps/api/src/modules/context/context.repository.ts`);
- `buildFiscalEmitRequest()` y logica de actualizacion post-emision (`apps/api/src/modules/facturas/facturas.service.ts`);
- formulario de factura en `apps/web-operacion/src/main.tsx` (estado `tipoTransaccion`, `createNuevaFactura()`).

## Contratos Esperados

- `spec/openapi.yaml`: `fiscal_context` en la respuesta de contexto operativo incluye `tipo_transaccion_default` (`1` | `2` | `3`).
- Respuesta de `GET` contexto operativo: siempre incluye `tipo_transaccion_default`, reflejando la ultima seleccion real (o `2` si nunca hubo una).

## Casos Felices

1. Operador nunca cambio el tipo de servicio → sigue viendo `2 - Prestacion de servicios` por defecto, sin cambios respecto al comportamiento actual.
2. Operador selecciona `1 - Venta de mercaderia` y emite la factura exitosamente → la siguiente factura (misma sesion) ya parte de `1` preseleccionado.
3. Operador cierra sesion y vuelve a ingresar al dia siguiente → el selector sigue mostrando `1 - Venta de mercaderia` (la ultima seleccion persistida), no vuelve a `2`.
4. Otro operador del mismo negocio, mismo punto de expedicion, inicia sesion → ve el mismo default actualizado (`1`), porque la preferencia es del punto operativo, no del usuario.

## Errores Relevantes

- `tipo_transaccion` fuera de `1`/`2`/`3` → sigue siendo `422` por la validacion Zod existente en `facturas.routes.ts`, sin cambios; en ese caso el encolado nunca ocurre, por lo tanto `tipo_transaccion_default` tampoco se actualiza.
- Emision fiscal falla despues de forma asincrona (error SIFEN, timeout, rechazo) una vez la factura ya fue encolada exitosamente → `tipo_transaccion_default` NO se revierte; queda con el valor que el operador selecciono al encolar, porque el fallo posterior no tiene relacion causal con esa preferencia de UI (ver "Nota de arquitectura verificada").
- Falla el `UPDATE` de `tipo_transaccion_default` en si (error de base de datos al persistir la preferencia) → no debe abortar ni afectar el encolado/respuesta de la factura, que ya fue aceptada; se loguea y se continua (mejor esfuerzo).

## Criterios De Aceptacion

- Existe cadena SDD completa (`SPEC`, `PLAN`, `TASKS`) para esta iniciativa.
- El selector de tipo de servicio en la pantalla de factura parte de la ultima seleccion persistida, no de `2` hardcodeado.
- La persistencia sobrevive a cierre de sesion / nuevo inicio de sesion (columna en base de datos, no estado de frontend ni cookie/localStorage).
- No se rompe el comportamiento actual para `actividad_punto_perfiles` que nunca tuvieron una seleccion distinta a `2`.
- `spec/openapi.yaml` actualizado y consistente con el schema real.
