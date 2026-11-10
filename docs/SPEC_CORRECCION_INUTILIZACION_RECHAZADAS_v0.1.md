# SPEC Correccion vinculada e inutilizacion de facturas rechazadas v0.1

**Fecha:** 2026-11-10. **Estado:** aprobado por el usuario para implementar (fases A y B).
**Origen:** caso de la factura `1010565` (carga, rechazada con `0420`), corregida con "Corregir y emitir de nuevo" como `1010566`. La original quedo "Requiere revision" para siempre, sin vinculo con la nueva y con su numero sin inutilizar.

Refina:

- `SPEC_DESPLIEGUE_SEGEL_FS_v0.2`, D-11, y `SPEC_AUTOGESTION_OPERADOR_v0.1`, D-3 y 9.2: los numeros rechazados ya no los inutiliza solo soporte. El operador los inutiliza desde FS (decision del usuario, 2026-11-10). Es el minimo de 9.2; la correccion con el mismo numero (seccion 0 de ese SPEC) sigue para una etapa siguiente, cuando FE la publique.
- `SPEC_CARGA_ATENCION_COMPROBANTES_v0.1`, D-3: inutilizar el numero de un comprobante rechazado ahora si se refleja en la factura de FS, si se hace desde la factura (ver RN-B6).
- `SPEC_CORRECCIONES_TRAS_FIXES_FE_v0.1`, FS-36: el aviso "lo gestiona soporte" se reemplaza por la accion.

## 1. Objetivo

1. **Fase A.** Que una factura rechazada y su correccion queden vinculadas: la original dice por cual se corrigio y deja de ofrecer corregirla; la nueva dice a cual corrige.
2. **Fase B.** Que el operador inutilice por su cuenta el numero de una factura rechazada, sin soporte, desde el detalle de la factura, sea emitida en linea o por carga.

## 2. Contrato de FE usado

`POST /v1/evento/inutilizacionnumfactura` de `segel-rc4.25`, **con la clave compartida** (`requireApiKey`): decision del usuario del 2026-11-10. La ruta por facturador (`EVENTO_INUTILIZAR`, `SPEC_EVENTO_CONSUMER_SCOPE_v0.1` de FE) esta escrita y no implementada; cuando FE la publique se cambia la clave sin tocar la pantalla.

- Cuerpo: `emisor_id`, `establecimiento`, `puntoExpedicion`, `desdeNumero`, `hastaNumero`, `motivo` (1 a 150), `tipoDocumento` opcional (`FE` por defecto).
- Respuesta sincronica `200 { event_id, status, sifen, notification }`. `status`: `VOIDED` si SIFEN acepto; si no, el estado del evento (`REJECTED` u otro).
- Errores: `409 EVENT_ALREADY_EXISTS` (el numero ya esta inutilizado, con `details.event_id`), `409 EVENT_IN_PROGRESS`, `409 RANGE_ALREADY_USED` (hay un documento aprobado con ese numero), `409 RANGE_POSSIBLY_CONSUMED` (hay un documento con numero tomado y sin rechazo confirmado), `422 VALIDATION_ERROR`; sin respuesta de SIFEN, `5xx` y FE marca el evento `FAILED` (no bloquea un intento nuevo).
- FE acepta inutilizar el numero de un `REJECTED` con rechazo confirmado por SIFEN (`dEstRes` rechazado o `0420`, `PLAN_INUTILIZAR_RECHAZADOS_v0.1` de FE). Lo decide FE, no FS.

## 3. Reglas

### Fase A: correccion vinculada

- **RN-A1.** "Corregir y emitir de nuevo" manda en la emision el id de la factura que corrige (`corrige_documento_id`). FS lo guarda en `documento_relacionado_id` de la factura nueva, la misma columna con la que una nota de credito apunta a su factura.
- **RN-A2.** Se puede corregir una factura (`tipo = FACTURA`) del mismo facturador en estado `RECHAZADA` o `ERROR_OPERATIVO` que todavia no tenga correccion. Si no cumple, la emision responde `409` y no se crea nada.
- **RN-A3.** Una factura tiene a lo sumo una correccion. Si la correccion tambien se rechaza, se corrige la correccion: la cadena sigue desde la ultima.
- **RN-A4.** La original muestra "Corregida por la factura N" con enlace a la nueva, y deja de ofrecer "Corregir y emitir de nuevo". La nueva muestra "Corrige a la factura N" con enlace a la original.
- **RN-A5.** Corregir no inutiliza ni exige inutilizar: son acciones independientes. El numero de la original queda pendiente hasta que alguien lo inutilice (fase B).
- **RN-A6.** Las correcciones hechas antes de esta version no se vinculan: FS no guardaba a cual corregian (`1010566` no queda vinculada a `1010565`). Su numero se puede inutilizar igual.

### Fase B: inutilizacion por el operador

- **RN-B1.** El detalle de una factura `RECHAZADA` con numero fiscal y CDC, sin una inutilizacion aceptada, ofrece "Inutilizar numero". Lo puede hacer cualquier usuario que ve la factura en su contexto (el mismo permiso que emitir una nota de credito), sin contexto listo para emitir: inutilizar no emite.
- **RN-B2.** FS arma el pedido solo con datos guardados de la factura, nunca con datos del pedido del operador: el emisor del facturador, y establecimiento, punto y numero leidos del CDC. Si el RUC del CDC no es el del facturador, o el numero del CDC no es el numero fiscal guardado, responde `409` sin llamar a FE. Del operador solo se toma el motivo.
- **RN-B3.** El motivo es obligatorio, de 5 a 150 caracteres, y la pantalla pide confirmar nombrando el numero y advirtiendo que no se puede deshacer y que el numero no se vuelve a usar.
- **RN-B4.** FS guarda el resultado del ultimo intento en la factura: estado (`ACCEPTED`, `REJECTED`, `FAILED`), evento de FE, motivo, codigo y mensaje del rechazo, intentos, fecha y usuario. Cada intento queda en `audit_events` como `FACTURA_NUMERO_INUTILIZADO`.
- **RN-B5.** Respuestas de FE:
  - `VOIDED`: `ACCEPTED`. El boton desaparece.
  - `REJECTED` u otro estado: `REJECTED`, con codigo y mensaje de SIFEN si vinieron. El boton sigue: se puede reintentar.
  - `409 EVENT_ALREADY_EXISTS`: el numero ya estaba inutilizado (desde la carga, el backoffice o la API). FS lo guarda `ACCEPTED` con ese evento y lo dice.
  - `409 EVENT_IN_PROGRESS`, `RANGE_ALREADY_USED`, `RANGE_POSSIBLY_CONSUMED`: `409` al operador con el mensaje de FE en lenguaje simple. No cambia la factura.
  - Sin respuesta (`5xx`, tiempo agotado): `FAILED`, `502` o `504` al operador. Se puede reintentar.
- **RN-B6.** Inutilizar no cambia el `estado` de la factura: sigue `RECHAZADA`, que es lo que dice SIFEN. Lo que cambia es lo que se muestra (RN-C1). Si la factura vino de una carga, FE refleja la inutilizacion en el comprobante de la carga (`inutilizacion` cubre las hechas por la API); la inutilizacion hecha desde la pantalla de la carga no actualiza la factura de FS (sigue D-3 de esa cadena) y, si el operador lo intenta luego desde la factura, recibe `EVENT_ALREADY_EXISTS` y queda `ACCEPTED`.
- **RN-B7.** Solo facturas en esta version. Las notas de credito rechazadas siguen su flujo (`NUEVA_NOTA_CREDITO`).

### Lo que ve el operador

- **RN-C1.** Estado de una factura rechazada en el listado y en el detalle:
  - sin correccion ni inutilizacion: "Requiere revision", como hoy;
  - corregida, numero sin inutilizar: "Corregida, falta inutilizar";
  - numero inutilizado, sin correccion: "Numero inutilizado";
  - corregida y numero inutilizado: "Resuelta".
- **RN-C2.** El bloque de acciones del detalle (`accion_detalle`) lo calcula el servidor. Una rechazada corregida y con numero inutilizado queda `accion = OK`, sin acciones. Una inutilizada sin correccion queda `OK` y mantiene "Corregir y emitir de nuevo", por si la venta todavia se factura. En los demas casos sigue la causa de SIFEN de hoy, mas `INUTILIZAR_NUMERO` cuando aplica RN-B1 y sin `CORREGIR_REEMITIR` si ya hay correccion.
- **RN-C3.** Se quita el aviso "lo gestiona soporte" (FS-36). Una rechazada sin inutilizar dice que su numero queda sin usar y que conviene inutilizarlo antes del dia 15 del mes siguiente (plazo de SIFEN; FE no lo controla y SIFEN puede rechazar una inutilizacion fuera de plazo).

## 4. Fuera de alcance

- Corregir con el mismo numero (seccion 0 de `SPEC_AUTOGESTION_OPERADOR_v0.1`): espera a FE.
- Un modelo general de documentos asociados a una factura (notas de credito, recibos, notas de remision): pedido del usuario para mas adelante. Esta version reutiliza `documento_relacionado_id`, que ya usan las notas de credito; el modelo general se disena en su propia cadena.
- Inutilizar rangos o numeros sin factura en FS.
- Vincular correcciones anteriores a esta version.

## 5. Decisiones

| ID | Tema | Decision |
|---|---|---|
| D-1 | Ruta de FE | `/v1/evento/inutilizacionnumfactura` con la clave compartida, con todos los datos sacados de la factura guardada (decision del usuario, 2026-11-10) |
| D-2 | Vinculo | `documento_relacionado_id` en la factura nueva y un indice unico de una correccion por factura |
| D-3 | Orden | Corregir e inutilizar son independientes; ninguna exige la otra |
| D-4 | Estado | La factura sigue `RECHAZADA`; la resolucion se muestra aparte |

## 6. Criterios de aceptacion

- **CA-01.** Corregir una rechazada y emitir deja la nueva con `documento_relacionado_id` de la original; la original muestra "Corregida por la factura N" y no ofrece corregir; la nueva muestra "Corrige a la factura N".
- **CA-02.** Emitir con `corrige_documento_id` de una factura aprobada, de otro facturador o ya corregida responde `409` y no crea factura.
- **CA-03.** Una rechazada muestra "Inutilizar numero"; con motivo valido y confirmacion, FS llama a FE con emisor, establecimiento, punto y numero del CDC, guarda `ACCEPTED` y el boton desaparece.
- **CA-04.** Un rechazo de SIFEN a la inutilizacion se muestra con su codigo y deja reintentar; un `EVENT_ALREADY_EXISTS` queda como inutilizado.
- **CA-05.** Una factura aprobada, en proceso o anulada no ofrece inutilizar, y el `POST` responde `409`.
- **CA-06.** El listado muestra los cuatro estados de RN-C1.
- **CA-07.** Ningun dato fiscal del pedido sale del cuerpo del operador: un `POST` con establecimiento, punto o numero en el cuerpo los ignora.
