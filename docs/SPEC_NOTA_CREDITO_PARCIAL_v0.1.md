# SPEC Nota De Credito Parcial Con Lineas v0.1

**Fecha:** 2026-11-10 · **Decision del usuario:** entra, al menos en USD (`SPEC_MONEDA_EXTRANJERA_v0.1` D-7). · **Estado:** refinada para implementar. D-1 a D-4 son decisiones tecnicas tomadas en el refinamiento (2026-11-10), con su motivo; el usuario no tiene nada que confirmar en esta SPEC salvo el alcance ya decidido (entra; cuotas no).

## Alineacion

- `docs/SPEC_MONEDA_EXTRANJERA_v0.1.md` (moneda, tipo de cambio, `FE_NC_MONEDA_EXTRANJERA`, A-1 cantidad decimal, A-2 totales de FE).
- `docs/SPEC_NOTA_CREDITO_TRABADA_v0.1.md` (clave derivada por el servidor, reintento de una nota trabada, RN-02 una nota viva por factura: **esta SPEC la reemplaza por "varias notas por factura hasta cubrir el total"**).
- `docs/SPEC_TOTALES_FE_EN_CARGA_v0.1.md` RN-07 (facturas de carga con descuento, anticipo o exonerado: la nota va por referencia).
- Contrato de FE (`segel-rc4.27` o posterior, paquete v0.42+): `POST /v1/nota-credito` con `items[]` (`codigo`, `descripcion`, `cantidad`, `precioUnitario`, `ivaTipo`), `moneda` y `tipoCambio` (obligatorio fuera de PYG, hasta 4 decimales), `referencia { tipo: ELECTRONICO, cdc }`, `motivo { codigo, descripcion }`; clave compartida de la instancia. FE controla: moneda distinta de la factura -> `422 INVALID_REFERENCED_DOCUMENT` sin numerar; suma de notas mayor que la factura -> `CREDIT_NOTE_TOTAL_EXCEEDED` (SIFEN 2417), comparado en la moneda de la factura. Verificado por FE con RAJ en SIFEN test (NC 0000019 en EUR con lineas, `VERIFICACION_PRODUCCION_MONEDA_EXTRANJERA_v0.1`).

## Situacion actual

FS emite solo la **nota de credito total**: copia receptor y lineas de la factura (`buildFiscalNotaCreditoRequest`) o, por referencia, deja que FE las arme (`/nota-credito/total`). Una factura admite una sola nota viva (`emitNotaCreditoTotal`, RN-02); la elegibilidad (`getNotaCreditoIneligibility`) la saca de la lista en cuanto tiene una nota no rechazada. El motivo va con `codigo: 1` fijo y el texto del operador (BACKLOG FS-44).

## Objetivo

Que el operador pueda devolver o ajustar **parte** de una factura: elegir lineas y cantidades, y emitir una nota de credito por ese importe, en la moneda de la factura (guaranies o dolares), repitiendo hasta cubrir el total.

## Alcance (v0.1)

1. **Pantalla.** En la ficha de una factura aprobada, "Crear nota de credito" abre la ventana actual con dos opciones: **Total** (como hoy) y **Parcial**. En Parcial se listan las lineas de la factura con casilla, cantidad facturada, cantidad ya acreditada por notas anteriores, y un campo "Cantidad a acreditar" (hasta 4 decimales, menor o igual que lo que queda); el precio unitario es el de la factura y no se edita. Debajo, el total de la nota calculado en la moneda de la factura y el campo Motivo. En el listado de candidatas (Notas de credito > Nueva) la misma ventana.
2. **API.** `POST /facturas/:documentoId/nota-credito` suma `lineas?: [{ line_no, cantidad }]`. Sin `lineas`: total, sin cambios. Con `lineas`: nota parcial.
3. **Emision.** La nota parcial va a `POST /v1/nota-credito` con las lineas elegidas (cantidad acreditada, precio y IVA de la factura), `moneda` y `tipoCambio` de la factura cuando no es PYG, referencia por CDC y el motivo. Fuera de PYG requiere `FE_NC_MONEDA_EXTRANJERA=true` (mismo bloqueo que la total).
4. **Guardado.** La nota se guarda como documento `NOTA_CREDITO` con sus propias lineas y totales (calculo de FS en la moneda; con A-2, los de FE al aprobarse), `documento_relacionado_id`, `moneda` y `tipo_cambio` de la factura.
5. **Saldo acreditable.** Por linea: cantidad facturada menos la suma acreditada por notas de la factura en estado distinto de `RECHAZADA`. Una factura sigue elegible mientras le quede saldo en alguna linea; la nota total solo se ofrece si no tiene ninguna nota viva.
6. **Documentos.** La nota parcial se ve como cualquier nota (tabla, tarjeta, ficha con sus lineas y el enlace a la factura); la ficha de la factura lista sus notas con numero, estado y total.

## Fuera de alcance

- Cambiar el precio unitario en la nota (ajuste de precio por importe): v0.2 si el usuario lo pide.
- Elegir el motivo SIFEN (1 a 8): sigue `codigo: 1` hasta resolver FS-44.
- Nota parcial sobre facturas de carga marcadas `nota_credito_por_referencia` (descuento, anticipo, exonerado): FS no puede reproducir esas lineas; se responde `409` con mensaje "Esta factura solo admite nota de credito total".
- Nota de debito.

## Decisiones

| ID | Tema | Decision (tecnica, tomada) | Motivo |
|---|---|---|---|
| D-1 | Clave de idempotencia por nota | Se mantiene `buildNotaCreditoExternalRef(context, facturaId, intento)` con `intento = notas.length + 1`, contando todas las notas previas de la factura, rechazadas incluidas. Una nota trabada se reintenta con su clave guardada (como hoy, `SPEC_NOTA_CREDITO_TRABADA_v0.1`) | Dos notas parciales distintas llevan claves distintas porque cambia `intento`; un reintento de la misma nota conserva la suya. No hace falta un formato de clave nuevo ni un cambio en FE |
| D-2 | Varias notas en curso | Mientras la factura tenga una nota trabada (`esNotaTrabada`) no se emite otra: primero se reintenta o se resuelve. Con notas aprobadas o pendientes en SIFEN si se puede emitir otra parcial, dentro del saldo (las pendientes descuentan saldo) | Una trabada puede terminar aprobada o rechazada: emitir otra encima podria superar el total o duplicar. Una pendiente en SIFEN ya tiene numero y CDC: cuenta como emitida para el saldo |
| D-3 | Control del tope | FS valida por cantidades contra el saldo de cada linea (RN-01, RN-06). El tope por importe en la moneda de la factura lo controla FE (`CREDIT_NOTE_TOTAL_EXCEEDED`, SIFEN 2417) y FS lo muestra (RN-05) | Evita duplicar en FS una regla fiscal que vive en FE (limite de dominio de `AGENTS.md`); el control por cantidades alcanza para que el operador no pueda pedir mas de lo facturado |
| D-4 | Bandera para moneda extranjera | La parcial fuera de PYG usa la misma `FE_NC_MONEDA_EXTRANJERA` que la total; no se agrega otra | Es la misma capacidad de FE (`rc4.27`); una segunda bandera solo sumaria configuracion |
| D-5 | Precio de la linea | El precio unitario y el IVA de la nota son los de la factura; no se editan | El ajuste de precio por importe (motivo 8) es otro caso de uso; si el usuario lo pide va en v0.2 |

## Reglas

- **RN-01.** `lineas` no vacio; cada `line_no` existe en la factura y no se repite; `cantidad` mayor que cero, con hasta 4 decimales y menor o igual que el saldo de la linea. Si no, `400 VALIDATION_ERROR` con el detalle por linea.
- **RN-02.** Precio unitario e IVA de cada linea de la nota son los de la factura; la nota no inventa importes. Los totales de la nota se calculan con `calculateDocumentTotalsMoneda` sobre las lineas acreditadas.
- **RN-03.** La nota parcial nunca va por referencia (`/nota-credito/total` acredita todo). Si la factura exige referencia (`totals.nota_credito_por_referencia`), `409 CONFLICT`, `reason: NOTA_CREDITO_SOLO_TOTAL`.
- **RN-04.** Fuera de PYG, con `FE_NC_MONEDA_EXTRANJERA=false`: `409`, `reason: NOTA_CREDITO_MONEDA_EXTRANJERA` (como la total).
- **RN-05.** Un `422` o `409` de FE con `CREDIT_NOTE_TOTAL_EXCEEDED` o `INVALID_REFERENCED_DOCUMENT` se traduce a `409 CONFLICT` con el codigo de FE en `details.fe_code` y un mensaje para el operador ("La suma de las notas supera la factura" / "La moneda de la nota no coincide con la factura"); no consume numero en FE.
- **RN-06.** El saldo por linea se calcula en el servidor en cada emision (no se confia en la pantalla) a partir de las notas guardadas de la factura con estado distinto de `RECHAZADA`.
- **RN-07.** Una nota total no se ofrece ni se acepta si la factura ya tiene una nota viva (parcial o total); se ofrece la parcial por el saldo.

## Criterios de aceptacion

- **CA-01.** Factura USD de dos lineas (2 x 150,25 y 1 x 99,99): nota parcial por 1 x 150,25 emitida en USD con el tipo de cambio de la factura, aprobada en SIFEN test; la ficha de la nota muestra USD 150,25 y la de la factura lista la nota.
- **CA-02.** Segunda nota parcial por el saldo (1 x 150,25 y 1 x 99,99) aprobada; despues la factura ya no es elegible.
- **CA-03.** Pedir 3 x 150,25 responde `400` con el saldo disponible; pedir una linea inexistente responde `400`.
- **CA-04.** Factura en guaranies: nota parcial por una linea aprobada, importes enteros.
- **CA-05.** Con `FE_NC_MONEDA_EXTRANJERA=false`, la parcial de una factura USD responde `409 NOTA_CREDITO_MONEDA_EXTRANJERA` y la ventana lo dice.
- **CA-06.** Factura de carga con `nota_credito_por_referencia`: la opcion Parcial no se ofrece y la API responde `409 NOTA_CREDITO_SOLO_TOTAL`.
- **CA-07.** Playwright 1440 y 1280 (ventana de la ficha) y 390 (ventana en tarjeta), con las emisiones reales de CA-01, CA-02 y CA-04 en SIFEN test.
