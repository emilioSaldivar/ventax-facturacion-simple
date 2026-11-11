# PLAN - Validaciones del receptor antes de emitir v0.1

SPEC: `docs/SPEC_VALIDACIONES_RECEPTOR_v0.1.md`. TASKS: `docs/TASKS_VALIDACIONES_RECEPTOR_v0.1.md`.

## Principio

Un solo algoritmo por regla, escrito dos veces con los mismos casos de prueba: en la API (`apps/api/src/shared/validation/receptor.ts`) y en la web (`apps/web-operacion/src/lib/validacionReceptor.ts`). Las dos tablas de casos (valido, invalido, mensaje esperado) se mantienen iguales a mano y se listan en TASKS; una divergencia se detecta porque el mismo caso falla en un lado y pasa en el otro.

## Base y despliegue

- Sin migracion: no cambia el esquema. Los campos de domicilio codificado los agrega `PLAN_NOTA_REMISION_v0.1`.
- Los datos existentes se dejan como estan (RV-11). Consulta de diagnostico para `OPERACION`: clientes con RUC sin guion o con DV que no cumple el modulo 11, nombres de menos de 4 caracteres, correos con espacios y telefonos fuera de 6 a 15 digitos. Se corre en el stack local y, con confirmacion del usuario, en `segel-fs` solo lectura, para dimensionar cuantos clientes veran "Revisar datos".

## API (`apps/api`)

1. `shared/validation/receptor.ts`, nuevo:
   - `normalizarDocumento(tipo, valor)`, `normalizarTelefono(valor)`, `normalizarNombre(valor)`, `normalizarCorreo(valor)` (RV-07).
   - `calcularDvRuc(base)` (modulo 11 de SIFEN con letras expandidas a los digitos de su codigo ASCII, como `calcularDigitoVerificadorModulo11` de FE) y `validarRuc(valor)` que devuelve `{ ok, base, dv, dvEsperado, mensaje }` (RV-01).
   - `validarDocumento(tipo, valor)` (RV-02), `validarCorreo`, `validarTelefono`, `validarNombre`, `validarDireccion`, `validarNumeroCasa` (RV-03 a RV-06).
   - `observacionesReceptor(cliente)` devuelve los mensajes de todo lo que incumple, para RV-11.
   - Todos devuelven el mensaje exacto de la SPEC; no lanzan.
2. Esquemas Zod: `clientes.routes.ts` (`clienteUpsertSchema`), `facturas.routes.ts` (`cliente` de `facturaBaseSchema`, que usan `POST /facturas` y `/facturas/preview`) y `recibos.routes.ts` (`createBodySchema`, `updateBodySchema`: `pagador_documento` con tipo `RUC`, `pagador_nombre`) suman `superRefine` que llama a esas funciones y agrega el error con `path` del campo. La respuesta sigue siendo la de `validateRequest` (`400 VALIDATION_ERROR`); verificar que el cuerpo incluya campo y mensaje y, si hoy solo trae un texto generico, extenderlo sin romper a los consumidores actuales (la web ya muestra `err.message`).
3. `clientes.service.ts`: `normalizeClienteInput` usa las funciones nuevas; `parseRucCiDocumento` queda para el padron. `GET /clientes` agrega `observaciones` por fila (RV-11) calculadas al listar, sin guardar nada.
4. Padron (RV-10): la respuesta de autocompletado ya trae `dv` y estado; se agrega `estado_dnit` legible si no esta, y el servicio **deja de cambiar** `documento_tipo` de RUC a CI (hoy `clientes.service.ts` lo hace al no encontrar el RUC activo; ver FS-60); devuelve `sugerencias` y el frontend decide.
5. `spec/openapi.yaml`: `observaciones` en la fila del cliente; descripcion de las reglas en `cliente`, `pagador_*` y errores 400 con ejemplos de mensaje.

## Web (`apps/web-operacion`)

1. `lib/validacionReceptor.ts`, nuevo, espejo de la API, mas `mensajesReceptor(cliente)` para pintar los errores por campo.
2. Agenda (`views/AgendaView.tsx`): errores bajo cada campo al salir y al guardar; "Guardar" deshabilitado con el motivo; pastilla "Revisar datos" en la fila con los `observaciones` (tono `atencion`) y, en el panel, un aviso con la lista. Aviso del DV de la DNIT con el boton "Usar 80012345-0" (RV-10).
3. Editor de factura (`main.tsx`, bloque Cliente): mismas validaciones en linea; `puedeCrear` suma "Corregí los datos del cliente" como motivo de bloqueo; al elegir un cliente de la agenda con observaciones se muestran de entrada. El telefono se muestra normalizado despues de salir del campo.
4. Recibo desde la ficha (`views/DocumentsView.tsx`) y formulario de recibos: el pagador que viene del snapshot de la factura ya pasó la validacion; si el operador lo edita, aplica RV-01 y RV-05.
5. Textos segun `docs/PAUTAS_FRONTEND_v0.1.md` (voseo, sin emojis, tildes en la interfaz).

## Pruebas

- `apps/api/tests/receptor.validacion.test.ts`: tabla de casos (ver TASKS VAL-002) para cada funcion; `clientes.service.test.ts`, `facturas.*.test.ts` y `recibos.*.test.ts` suman los rechazos 400 y CA-06 (mock de gateway con contador de llamadas).
- `apps/web-operacion`: prueba unitaria de `lib/validacionReceptor.ts` con la misma tabla (vitest del paquete web, si existe; si no, se corre con `node --test` sobre el build de la lib: verificar al implementar).
- `scripts/segel-fs/playwright-validaciones-receptor.cjs`, nuevo: CA-01 a CA-05, CA-07 y CA-08 en 1440, 1280 y 390 contra `.local/segel-ensayo` (crea y borra un cliente de prueba "Prueba VAL ..."). Regresion: `playwright-ux-resto-app.cjs` (`agenda`, `nuevo`, `ficha`) y `playwright-nc-cuerpo.cjs`.
- Sin emisiones en SIFEN test: la cadena no cambia lo que se manda a FE cuando los datos son validos.

## Riesgos

- Clientes existentes con datos invalidos en `segel-fs` (al menos el `RUC XXX` de FS-64 y los que muestre la consulta): veran "Revisar datos" y tendran que corregirse al usarlos. Se avisa al usuario con la cifra antes de desplegar.
- Telefonos guardados con texto ("int. 12"): se normalizan al editar; en el listado se muestran como estan.
- Divergencia entre los dos algoritmos: mitigada con la tabla unica de casos.

## Coordinacion con FE

- Regla de letras en el modulo 11: confirmada por FE el 2026-11-11 (D-1 cerrada).
- FE registro como defecto propio que valida el DV del receptor despues de numerar; no bloquea esta cadena.
- No se pide ningun cambio de contrato.
