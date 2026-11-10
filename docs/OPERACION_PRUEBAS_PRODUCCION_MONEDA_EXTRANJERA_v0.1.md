# OPERACION Pruebas En Produccion: Factura Manual, Moneda, Nota De Credito Y Editor PC v0.1

**Fecha:** 2026-11-10 · **Para:** el usuario, que emite en `segel-fs` (produccion) con su propio facturador, a sus clientes reales, con montos chicos. · **Cuando:** despues del despliegue de MON-013 (`TASKS_MONEDA_EXTRANJERA_v0.1.md`), nunca antes.

## Alineacion

- `docs/SPEC_MONEDA_EXTRANJERA_v0.1.md`, `docs/SPEC_NOTA_CREDITO_PARCIAL_v0.1.md`, `docs/SPEC_EDITOR_FACTURA_PC_v0.1.md`.
- `docs/OPERACION_DESPLIEGUE_SEGEL_FS_v0.1.md` (despliegue y vuelta atras).
- Evidencia previa en SIFEN test: `TASKS_MONEDA_EXTRANJERA_v0.1.md` (MON-006, MON-008 a MON-011), `TASKS_NOTA_CREDITO_PARCIAL_v0.1.md` (NCP-008), `TASKS_EDITOR_FACTURA_PC_v0.1.md` (EPC-005).

## Reglas antes de empezar

1. **Todo lo que se emite tiene efecto fiscal.** Solo facturas reales a clientes reales, por ventas que existen. No se inventan ventas para probar.
2. **Montos chicos**, como los que tenias pendientes de facturar.
3. **Notas de credito y anulaciones solo con motivo real**: una devolucion, un ajuste acordado con el cliente o un error de carga. Si no hay ninguno, esos casos se saltean y quedan para cuando ocurran. FS manda el motivo SIFEN 1 ("Devolucion y ajuste de precios") con tu texto como descripcion (BACKLOG FS-44).
4. **Un error de carga se anula dentro de las 48 h** desde la ficha ("Anular factura") y se emite de nuevo. Pasadas las 48 h, va nota de credito.
5. **Una factura rechazada no se vuelve a emitir a mano**: se usa "Corregir y emitir de nuevo" y se inutiliza el numero (FS-51). Ante la duda, anota el numero y me lo pasas antes de seguir.
6. **Tipo de cambio en dolares:** el que use tu contador para esa fecha. El sistema lo pide con hasta 4 decimales y no lo calcula.
7. Hace los casos **en este orden**, uno por vez, y no pases al siguiente si el anterior quedo raro.

## Que mirar en cada documento

| Donde | Que tiene que estar |
|---|---|
| Documentos > fila | Pasa de "Procesando" a "Factura emitida" (con lote puede tardar hasta unos 10 minutos). Moneda y total correctos |
| Ficha | Cliente, productos con cantidad, total; en dolares, "Tipo de cambio" y, ya aprobada, "Equivale a Gs." |
| KUDE (PDF) | **Sin** la leyenda "Documento generado en Ambiente de PRUEBA de la SET"; CDC completo; tu nombre y datos; en dolares, moneda, tipo de cambio, total en guaranies y en letras |
| ekuatia.set.gov.py/consultas | Con el CDC del KUDE, el documento figura aprobado |
| Cliente | Le llega el correo (si tiene) o el enlace por WhatsApp abre el KUDE y el XML |

## Casos

| # | Caso | Como | Que comprobar ademas |
|---|---|---|---|
| P1 | Factura en guaranies, contado, **modo completo** (PC) | Nueva factura en la PC: se abre la grilla. Carga cliente y 2 productos en filas distintas | Sin ventanas por producto; total correcto; KUDE sin leyenda de prueba |
| P2 | Factura en guaranies, contado, **modo simple** | Boton "Modo simple" arriba a la derecha, una factura con 1 producto | Que vuelva a abrir en simple la proxima vez en esa PC; despues volve a "Modo completo" |
| P3 | Factura en guaranies con **cantidad con decimales** | Solo si el producto lo admite (horas, kilos): por ejemplo 1,5 | En la ficha y el KUDE la cantidad 1,5 y el subtotal redondeado al guarani |
| P4 | Factura en guaranies a **credito** 30 dias | Credito, plazo 30 dias | Condicion credito en el KUDE |
| P5 | **Recibo** de la factura P4 | Cuando el cliente pague: ficha de P4 > "Emitir recibo de cobro" > Emitir | Importe en guaranies, referencia a la factura, PDF firmado |
| P6 | Factura desde el **celular** | Entra desde el telefono | Modo simple, sin desplazamiento de costado |
| P7 | Factura en **dolares**, contado | Solo si tenes un cliente al que le facturas en dolares. Moneda: USD, tipo de cambio, precio con centavos | "Equivale a Gs." en la ficha; en el KUDE moneda, tipo de cambio y total en guaranies |
| P8 | Factura en **dolares a credito** y su **recibo** | Como P4 y P5, en USD | Recibo "USD 0,00" con centavos y en letras "... DOLARES ... CON nn/100" |
| P9 | **Anulacion** dentro de las 48 h | Solo ante un error real: ficha > "Anular factura" con el motivo | Estado "Anulada"; si SIFEN responde que todavia no puede (4009), reintentar a los pocos minutos |
| P10 | **Nota de credito parcial** | Solo ante una devolucion o ajuste real: ficha > "Crear nota de credito" > Parcial > cantidad por producto | La nota sale en la moneda de la factura; la ficha de la factura muestra "Acreditado por notas de credito" y el saldo |
| P11 | **Nota de credito total** | Solo si se anula toda la venta pasadas las 48 h | La factura queda sin saldo |

## Que me pasas al terminar cada caso

| Caso | Numero | CDC | Estado en FS | Llego al cliente | Observaciones |
|---|---|---|---|---|---|
| P1 | | | | | |

Con eso reviso en la base de FS y de FE que todo quedo igual que lo que viste, y lo anoto como evidencia en `TASKS_MONEDA_EXTRANJERA_v0.1.md` (MON-014).

## Si algo sale mal

- **Rechazada por SIFEN:** no emitas de nuevo. Pasame el numero y el mensaje; se resuelve con "Corregir y emitir de nuevo".
- **"Procesando" por mas de 30 minutos:** "Verificar estado fiscal" en la ficha; si sigue, pasame el numero.
- **El KUDE dice "Ambiente de PRUEBA":** se frena todo; es configuracion de FE (`KUDE_JASPER_AMBIENTE`), no se emite mas hasta corregirlo.
- **Algo de pantalla que no esperabas:** captura y numero; no repitas la accion.
