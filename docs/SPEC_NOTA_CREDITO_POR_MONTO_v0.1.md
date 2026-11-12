# SPEC Nota De Credito Parcial Por Monto v0.1

**Fecha:** 2026-11-12 · **BACKLOG:** FS-136 · **Pedido del usuario (2026-11-12):** implementar la nota de credito parcial por monto que FE deja lista. **Decision del usuario (2026-11-12):** entra en guaranies **y en USD**. · **Pendiente de negocio:** el criterio del reparto por tasa lo valida el contador (FE lo pide expresamente); hasta tenerlo, no se despliega a produccion.

## Alineacion

- Guia de integracion de FE, **paquete v0.52, seccion 67** ("Nota de Credito Parcial por Monto"): repo de FE, rama `docs/nc-parcial-por-monto`, `86b85a1`. **Sin endpoint nuevo ni cambio de comportamiento en FE:** se usa `POST /v1/nota-credito` como siempre; `GET /v1/documentos/{uuid}/totales` (seccion 60) da los totales netos por tasa.
- `docs/SPEC_NOTA_CREDITO_PARCIAL_v0.1.md` (parcial por lineas; D-1 clave por intento, D-2 trabada bloquea, RN-07 la total solo sin notas vivas). Esta SPEC **agrega un tercer modo** y no cambia los otros dos salvo RN-10.
- `docs/SPEC_MONEDA_EXTRANJERA_v0.1.md` (A-2 totales de FE guardados al aprobar; `FE_NC_MONEDA_EXTRANJERA`).
- `docs/SPEC_DESCUENTOS_FACTURA_v0.1.md` RN-09 y `SPEC_TOTALES_FE_EN_CARGA_v0.1.md` RN-07: una factura con descuento o exonerado queda `nota_credito_por_referencia` y hoy solo admite la total. La nota por monto **si** la admite (es justamente el caso del ejemplo de FE).
- BACKLOG FS-44 (motivo SIFEN fijo en 1): esta SPEC lo resuelve **solo para la nota por monto**; la total y la parcial por lineas siguen con `codigo: 1`.
- BACKLOG FS-77 (dos pantallas para crear la nota): el modo nuevo va en las dos, sin unificarlas.

## Lo que dice FE (guia §67, resumido)

1. **Reparto por tasa.** Totales de la factura con `GET /v1/documentos/{uuid}/totales`. Monto de cada tasa, IVA incluido: `gravada_10 + iva_10`, `gravada_5 + iva_5`, `exenta + exonerada`. Parte de cada tasa = monto × tasa ÷ suma de las tres, redondeada; la diferencia del redondeo va a la ultima linea. Una linea por tasa con parte > 0, `cantidad` 1, `precioUnitario` = la parte, `ivaTipo` de la tasa. Lo exonerado va como `EXENTO`.
2. **Saldo.** `totales.total` de la factura menos `totales.total` de sus notas que no esten `REJECTED`, `CANCELLED` ni `VOIDED`. Una nota en cola cuenta. FE no lista las notas de una factura: FS lleva el registro.
3. **El saldo lo controla FS.** El `409 CREDIT_NOTE_TOTAL_EXCEEDED` de FE compara contra el total **bruto** (sin descuentos). Si la suma supera el neto pero no el bruto, FE numera y SIFEN rechaza con `2417`: el numero queda usado.
4. **Multiplos de 50 Gs.** En guaranies el total de la nota se redondea hacia abajo a multiplos de 50 (10.020 -> 10.000). Se piden montos multiplos de 50.
5. **Motivo:** 3 Descuento, 4 Bonificacion u 8 Ajuste de precio.
6. **Ejemplo verificado en SIFEN test** (2026-11-12): factura con totales 10 % 165.833, 5 % 48.623, exento 27.875 (total 242.300); nota de 100.000 -> lineas 68.432 / 20.065 / 11.503, aprobada. Tres notas que suman exactamente el total, aprobadas.

## Situacion actual

FS emite la nota total y la parcial por lineas (cantidades de la factura a su precio). No hay forma de acreditar un importe (descuento, bonificacion o ajuste de precio posterior a la venta), y una factura con descuento solo admite la total.

## Objetivo

Que el operador acredite **un monto** de una factura aprobada, en guaranies o en dolares, con motivo Descuento, Bonificacion o Ajuste de precio, repitiendo hasta cubrir el total neto, sin que FS deje salir una nota que SIFEN rechace por superar la factura.

## Alcance (v0.1)

1. **Pantalla.** En las dos ventanas de nota de credito (ficha/lista de Documentos y Notas de credito > Nueva) se suma un tercer modo, **"Por monto"**, junto a Total y Parcial (por lineas). Muestra: total de la factura, ya acreditado, **saldo disponible**; campo **Monto**; selector **Tipo de ajuste** (Descuento, Bonificacion, Ajuste de precio; por defecto Descuento); vista previa del reparto por tasa (10 %, 5 %, Exento) y el motivo (texto para el cliente).
2. **API.** `POST /facturas/:documentoId/nota-credito` suma `monto?: number` y `motivo_codigo?: 3 | 4 | 8`. `monto` y `lineas` son excluyentes. Sin ninguno: la total, como hoy.
3. **Saldo expuesto.** `GET /facturas/:documentoId/nota-credito/saldo` suma `monto: { admite, motivo_no_admite, total_factura, acreditado, saldo, tasas: { iva_10, iva_5, exenta }, fuente }`.
4. **Emision.** FS pide `/totales` de la factura a FE, controla el saldo neto, reparte el monto por tasa y llama a `POST /v1/nota-credito` con las lineas del reparto, `motivo.codigo` elegido, la referencia por CDC y, fuera de PYG, `moneda` y `tipoCambio` de la factura.
5. **Guardado.** Documento `NOTA_CREDITO` con sus lineas (las del reparto), totales, motivo SIFEN y el modo `MONTO`, para que el saldo por lineas no las cuente y el reintento repita lo mismo.

## Fuera de alcance

- Motivo SIFEN elegible en la total y en la parcial por lineas (sigue FS-44).
- Repartir un monto sobre lineas concretas de la factura (siempre por tasa).
- Facturas con anticipo (FE no documenta el caso en §67): `409 NOTA_CREDITO_CON_ANTICIPO`, como hoy.
- Unificar las dos ventanas (FS-77).

## Decisiones

| ID | Tema | Decision | Motivo |
|---|---|---|---|
| D-1 | Moneda | PYG y USD (decision del usuario). En USD: monto con hasta 2 decimales, sin regla de 50, reparto redondeado a centavos; requiere `FE_NC_MONEDA_EXTRANJERA=true` como los otros modos | El usuario lo pidio. FE solo verifico PYG: CA-02 lo prueba en SIFEN test |
| D-2 | Multiplos de 50 en PYG | FS **rechaza** un monto que no sea multiplo de 50 (`400`), no lo redondea en silencio. La pantalla avisa antes de enviar | Si FS mandara 10.020, la nota saldria por 10.000 y el saldo de FS no coincidiria con lo que el operador escribio |
| D-3 | Saldo neto | `saldo = total de FE de la factura − Σ total de sus notas en estado distinto de RECHAZADA, ANULADA y CANCELADO_LOCAL`. El total de cada nota es el de FE si esta guardado (`fuente: FE`) o el calculado por FS. En la emision el total de la factura sale siempre de `/totales` en el momento | Es la regla de FE §67.3 traducida a los estados de FS. Una nota pendiente en SIFEN cuenta |
| D-4 | Residuo | En PYG un saldo menor que 50 cuenta como cero (no se puede emitir); en USD, menor que 0,01 | Evita ofrecer un saldo imposible de acreditar por el redondeo de las notas por lineas |
| D-5 | Mezcla de modos | Se pueden combinar notas por lineas y por monto en una misma factura. Si la factura ya tiene una nota por monto, la parcial por lineas **ademas** controla que su importe no supere el saldo neto (RN-10). La total sigue solo sin notas vivas | Una nota por monto no descuenta cantidades: sin RN-10 una parcial por lineas posterior podria superar el neto y caer en 2417 |
| D-6 | Facturas `nota_credito_por_referencia` | Admiten nota por monto (no la parcial por lineas) | Es el caso de §67 (factura con descuentos); el reparto sale de los totales netos de FE |
| D-7 | Codigos y descripcion de las lineas | `AJ-IVA10`, `AJ-IVA5`, `AJ-EXE` (los del ejemplo de FE); descripcion segun el tipo: "Descuento posterior sobre la factura", "Bonificación sobre la factura", "Ajuste de precio sobre la factura" | Iguales al ejemplo verificado; el cliente lee en el KUDE que es un ajuste, no un articulo |
| D-8 | Totales de FE no disponibles | Si `/totales` de la factura falla, la emision por monto responde `502` sin llamar a `POST /v1/nota-credito` (no consume numero). La ventana muestra el saldo con los totales guardados y marca `fuente` | Sin los netos por tasa no se puede repartir ni controlar el saldo con certeza |

## Reglas

- **RN-01.** `monto` > 0. PYG: entero y multiplo de 50. USD (u otra moneda no PYG): hasta 2 decimales. Si no: `400 VALIDATION_ERROR`.
- **RN-02.** `monto` y `lineas` juntos: `400 VALIDATION_ERROR`. `motivo_codigo` solo con `monto`; sin el, 3. Valores admitidos 3, 4 y 8.
- **RN-03.** Factura `FACTURA`, `EMITIDA`, con CDC y `document_uuid`; no innominada; sin anticipo; moneda extranjera solo con la bandera; sin notas trabadas (D-2 de la parcial). Mismos codigos `409` que hoy.
- **RN-04.** `monto` <= saldo (D-3, D-4) calculado en el servidor en cada emision. Si no: `409 CONFLICT`, `reason: NOTA_CREDITO_SUPERA_SALDO`, `details.saldo`, mensaje "El monto supera el saldo de la factura (X)". No se llama a FE.
- **RN-05.** Reparto por tasa como §67.2 (funcion pura compartida por API y pantalla). Si la suma de tasas es 0, `409` "La factura no tiene montos para acreditar".
- **RN-06.** La moneda de `/totales` tiene que ser la de la factura; si no, `502` sin emitir.
- **RN-07.** La nota guarda `nce_modo = 'MONTO'` y `nce_motivo_codigo`. El saldo por lineas ignora las notas `MONTO`. El reintento de una nota `MONTO` trabada repite sus lineas, su motivo SIFEN y su clave.
- **RN-08.** El `CREDIT_NOTE_TOTAL_EXCEEDED` de FE se traduce a `409` con `details.fe_code` (como hoy) y mensaje "La suma de las notas de crédito supera el total de la factura. Requiere soporte si no hay otras notas en Documentos." (conserva la indicacion del caso residual de `SPEC_NOTA_CREDITO_TRABADA_v0.1` RN-10).
- **RN-09.** La factura es candidata a nota mientras tenga saldo por lineas **o** saldo por monto (D-4).
- **RN-10.** Parcial por lineas sobre una factura con alguna nota `MONTO` viva: su total calculado <= saldo neto (D-3 con los totales guardados de la factura); si no, `409 NOTA_CREDITO_SUPERA_SALDO`.

## Criterios de aceptacion

- **CA-01.** Factura PYG con lineas al 10 %, 5 % y exenta y descuento global (como el ejemplo de FE): nota por monto de 100.000, motivo Descuento, reparto en tres lineas que suman 100.000, aprobada en SIFEN test; la ficha de la nota muestra 100.000 y las tres lineas.
- **CA-02.** Factura USD: nota por monto de USD 50,25, motivo Bonificacion, con tipo de cambio de la factura, aprobada en SIFEN test.
- **CA-03.** Monto 10.020 en PYG: `400` y la ventana avisa "multiplo de 50" sin enviar. Monto mayor que el saldo: la ventana no deja enviar y la API responde `409 NOTA_CREDITO_SUPERA_SALDO` sin llamar a FE.
- **CA-04.** Segunda nota por el saldo exacto: aprobada; despues la factura sale de las candidatas y el modo "Por monto" dice "La factura ya esta acreditada por completo".
- **CA-05.** La nota por monto no cambia el saldo por lineas de la ventana (Parcial sigue mostrando las cantidades facturadas sin acreditar); una parcial por lineas que supere el saldo neto se rechaza (RN-10).
- **CA-06.** Las pruebas existentes de la total y la parcial por lineas siguen verdes.
- **CA-07.** Playwright 1440 y 1280 (ventana de la ficha y pantalla Notas de credito) y 390, con las emisiones reales de CA-01, CA-02 y CA-04 en SIFEN test.
