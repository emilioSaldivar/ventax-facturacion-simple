# SPEC Nota De Credito Unificada v0.1

**Fecha:** 2026-11-12 · **BACKLOG:** FS-141 (y resuelve FS-77) · **Decision del usuario (2026-11-12):** una sola pantalla de nota de credito con la usabilidad del editor de factura con descuentos (acreditaciones en lugar de descuentos), en lugar de tres pestañas; **el despliegue a produccion de FS-136/FS-138/FS-139 espera esta cadena**. · **Diseño:** canvas "Nota de crédito unificada" (https://claude.ai/artifact/Ddpq1BqK7ddWyqDM3p3vod, privado del usuario): 01 PC, 02 estados, 03 celular, 04 armado para SIFEN. · **Estado:** implementada en la rama y validada en el stack local con SIFEN test (2026-11-12, TASKS NCU-001 a NCU-007); falta la prueba del usuario (NCU-008).

## Alineacion

- Reemplaza la ventana de tres modos de `SPEC_NOTA_CREDITO_PARCIAL_v0.1` (lineas), `SPEC_NOTA_CREDITO_POR_MONTO_v0.1` (monto) y la total; conserva sus reglas de saldo, idempotencia, trabadas y moneda (D-1 a D-8 de por monto, RN-01 a RN-10 de las dos).
- `SPEC_NOTA_CREDITO_FACTURA_EXTERNA_v0.1`: las facturas externas usan la misma pantalla; D-3/D-4 (descuentos con y sin `FE_NC_DESCUENTOS`) siguen valiendo.
- `SPEC_DESCUENTOS_FACTURA_v0.1`: misma usabilidad (RN-13 conmutador "%" / moneda en la columna, RN-15 campo sobre el total, D-9/RN-24 ocultos por defecto con "Agregar descuento", RN-18c fila unica en totales).
- FE `segel-rc4.36` (guias §6, §67, §68; respuesta de FE del 2026-11-12, BACKLOG FS-141): SIFEN no vincula lineas de la NC con las de la factura; controla suma ≤ total (2417), moneda (2438), receptor (2441), factura no cancelada (2404). Cuidados de FE: lineas positivas; el % lo convierte FS a monto (entero en PYG, 2 decimales en USD); descuento copiado < precio y ninguna linea en neto ≤ 0 con descuento global; el tope de FE compara en bruto para facturas propias y en neto redondeado para externas.

## Situacion actual

La ventana ofrece "Toda la factura", "Algunas lineas" (cantidades) y "Un monto" (sobre toda la factura); una nota es de un solo modo. No hay acreditacion por item ni porcentajes. La ficha de Documentos abre una ventana corta distinta de la pantalla Notas de credito (FS-77).

## Objetivo

Que el operador arme la nota de credito en una sola pantalla, como arma una factura con descuentos: devolver cantidades de cada item, acreditar un monto o un porcentaje sobre cada item y acreditar un monto o un porcentaje sobre el total, combinando lo que necesite en una sola nota, con los topes fiscales controlados antes de emitir.

## Alcance (v0.1)

1. **Pantalla unica** (canvas 01 y 03), la misma desde Notas de credito y desde la ficha de una factura (la ficha deja de abrir la ventana corta: navega a esta pantalla con la factura elegida; FS-77):
   - tarjeta de la factura (numero, cliente, fecha, condicion, total, origen si es externa; "Cambiar factura");
   - grilla **"Qué se devuelve o ajusta"** con las lineas de la factura: descripcion, facturado, precio, IVA, **ya devuelto o ajustado**, **Devolver** (cantidad, hasta 4 decimales, ≤ saldo de la linea) y **Ajuste** (monto o %, con el conmutador "%" / moneda en el encabezado de la columna, como el descuento de la factura), importe de la linea;
   - **Ajuste sobre el total** (monto o %) debajo de la grilla, "Se reparte en proporción a lo que la factura tiene en cada tasa";
   - la columna Ajuste y el campo sobre el total **ocultos por defecto** ("Agregar ajuste" / "Ocultar ajustes"; "Quitar ajustes" si tienen algo cargado), como D-9 de descuentos; visibles siempre que tengan algo cargado;
   - atajo **"Toda la factura"**: llena Devolver con el saldo de cada linea y vacia los ajustes;
   - **Motivo en SIFEN** sugerido y editable (RN-07) y "Detalle para el cliente";
   - panel **Resumen**: devolucion de items, ajuste por item, ajuste sobre el total, **total de la nota**, desglose por tasa, saldo de la factura, **saldo despues de la nota**, "Emitir nota de crédito" y el motivo de bloqueo.
   - factura con descuentos (canvas 02 D): columna Neto por unidad; Devolver devuelve al neto.
2. **API.** `POST /facturas/:id/nota-credito` acepta el pedido unificado (RN-01) y sigue aceptando los cuerpos actuales (`{motivo}`, `{motivo, lineas}`, `{motivo, monto, motivo_codigo}`), que se traducen al unificado. `GET /facturas/:id/nota-credito/saldo` suma, por linea, el importe neto, lo ya acreditado por importe y el saldo por importe.
3. **Calculo compartido** (`packages/shared`): una funcion arma las lineas de la nota y sus totales a partir del pedido, para la vista previa de la pantalla y para la emision en la API (una sola implementacion).
4. **Guardado:** cada linea de la nota guarda su origen (devolucion de la linea N, acreditacion de la linea N, reparto sobre el total) y la linea de la factura a la que corresponde.

## Fuera de alcance

- Notas de debito; anular una nota; acreditar sobre una linea que no esta en la factura (siempre parte de sus lineas o del total).
- IVA gravado parcial (`iAfecIVA` 4), como en factura externa.
- Cambiar el precio de la factura en una devolucion (se acredita por monto).

## Decisiones

| ID | Tema | Decision | Motivo |
|---|---|---|---|
| D-1 | Una nota combinada | Una sola nota puede tener devoluciones, acreditaciones por item y acreditacion sobre el total. Se siguen permitiendo varias notas sobre la misma factura | SIFEN solo ve lineas; decision del usuario |
| D-2 | Porcentajes | FS convierte cada % a monto: % de un item = importe neto del item (cantidad facturada × precio − descuentos) × %; % sobre el total = saldo neto de la factura × %. Redondeo a la unidad de la moneda (entero en PYG, 2 decimales en USD) | FE no tiene campo de % y no valida enteros en `precioUnitario` en PYG |
| D-3 | Redondeo del total en PYG | La pantalla muestra el total ya redondeado hacia abajo a multiplo de 50 (como FE) y, si difiere, una fila "Redondeo SIFEN − Gs. N". No se bloquea; el saldo usa el total de FE de la nota | Reemplaza D-2 de por monto (que rechazaba): con combinaciones, exigir multiplo de 50 en cada monto no tiene sentido |
| D-4 | Tope por item | Devolucion × neto por unidad + acreditacion del item ≤ importe neto del item − lo ya acreditado sobre el (devoluciones e importes de notas vivas) | Evita acreditar un item mas de lo que valia, aunque SIFEN solo controle el total |
| D-5 | Tope total | Total de la nota ≤ saldo neto de la factura (§67.3, D-3 de por monto); la acreditacion sobre el total se calcula sobre el saldo y se reparte por las tasas de la factura | Ya validado en FS-136 |
| D-6 | Descuentos de la factura | Devolver una linea con descuento: con `FE_NC_DESCUENTOS` copia `descuento` y el prorrateo del global; sin la bandera, la celda Devolver de esa linea queda deshabilitada con el aviso "Esta línea tiene descuento: acreditala por monto" (D-4 de factura externa) | La NC descarta descuentos sin la bandera |
| D-7 | "Toda la factura" | (Motivo en SIFEN fijo en 1 "Devolución y ajuste de precios", el que manda hoy la nota total.) Si la factura no tiene notas vivas y no hay acreditaciones cargadas: copia la factura (propia sin descuento ni anticipo puede seguir por referencia a FE `/nota-credito/total`); si tiene notas, devuelve el saldo de cada linea | Conserva el camino actual de la total |
| D-8 | Una pantalla para todo (FS-77) | "Crear nota de crédito" de la ficha y "Nueva nota de crédito" llevan a la misma pantalla; se elimina la ventana corta y sus tres botones | Decision del usuario |
| D-9 | Contrato | Cuerpo unificado nuevo; los tres cuerpos actuales siguen aceptados (compatibilidad con guiones y con la app vieja en cache durante el despliegue) | No romper clientes durante la transicion |
| D-10 | Nombre en pantalla: **Ajuste** (decision del usuario del 2026-11-12) | La pantalla dice **Devolver / Devolución** y **Ajuste** (por item y sobre el total), no "acreditar/acreditación". Textos: "Factura de la nota", "Qué se devuelve o ajusta", columnas "Ya devuelto o ajustado", "Devolver", "Ajuste"; "Agregar ajuste" / "Ocultar ajustes" / "Quitar ajustes"; "Ajuste sobre el total"; Resumen "Devolución de ítems", "Ajuste por ítem", "Ajuste sobre el total", "Saldo después de la nota"; mensajes "Supera lo disponible en este ítem", "Esta línea tiene descuento: ajustala por monto", "Indicá qué se devuelve o se ajusta". La descripcion de las lineas que se envian a SIFEN: "Ajuste <x %> · <descripción del ítem>" y "Ajuste sobre el total de la factura". La ficha de Documentos: "Devuelto por notas de crédito". Los nombres internos del contrato y la base (`acreditacion`, `acreditacion_total`, `ACREDITACION_LINEA`, `ACREDITACION_TOTAL`, `importe_acreditado`) no cambian | El Manual Tecnico SIFEN v150 no usa "acreditacion" para la nota de credito: E401 dice Devolucion, Descuento, Bonificacion, Ajuste de precio y §11.1.3 agrupa todo como "Devolución y Ajuste de precios" ("AJUSTE ... devoluciones en forma parcial o descuentos y bonificaciones"). La guia de FE usa "acreditar" solo como verbo coloquial (§67). Renombrar el contrato no aporta al operador y romperia clientes |

## Reglas

- **RN-01. Pedido.** `{ motivo, combinada?: true, motivo_codigo?, lineas?: [{ line_no, cantidad?, acreditacion?: { tipo: "MONTO" | "PORCENTAJE", valor } }], acreditacion_total?: { tipo, valor } }`. Al menos una devolucion o una acreditacion. La factura entera sin notas ni acreditaciones la manda la pantalla como `{ motivo }` (D-7), por eso no hizo falta un campo `toda_la_factura` (ajuste de implementacion). `combinada` fuerza el pedido combinado aunque solo haya devoluciones; `acreditacion_total`, una linea con `acreditacion` o sin `cantidad` tambien lo activan. `cantidad` > 0 con hasta 4 decimales; `valor` > 0 (monto con los decimales de la moneda; % > 0 y ≤ 100). `line_no` existente y sin repetir. `400` con el detalle por linea.
- **RN-02. Lineas de la nota** (canvas 04): devolucion → codigo, descripcion, precio e IVA de la factura con la cantidad (y `descuento`/prorrateo con D-6); ajuste de un item → `AJ-L<nnn>`, "Ajuste <x %> · <descripción del ítem>" (D-10), cantidad 1, precio = monto, IVA del item; acreditacion sobre el total → `AJ-IVA10`/`AJ-IVA5`/`AJ-EXE` (§67, lo exonerado como exento). Todas positivas; las de monto 0 no se envian.
- **RN-03. Topes** D-4 y D-5 en el servidor en cada emision (no se confia en la pantalla); `409 NOTA_CREDITO_SUPERA_SALDO` con `details.saldo` o `400` con `details.lineas[]` por item.
- **RN-04. Moneda, bandera y externas** como hoy: `FE_NC_MONEDA_EXTRANJERA` fuera de PYG; facturas externas con referencia por CDC o impresa; anticipo e innominada rechazados.
- **RN-05. Trabadas e idempotencia** como hoy (`SPEC_NOTA_CREDITO_TRABADA_v0.1`): clave por intento; una nota trabada bloquea otra; el reintento manda las mismas lineas y el mismo motivo (se leen de la nota guardada).
- **RN-06. Guardado.** `factura_items_snapshot` de la nota: `line_no` correlativo de la nota y, nuevo, `linea_factura` (line_no de la factura, null para el reparto) y `origen_nc` (`DEVOLUCION`, `ACREDITACION_LINEA`, `ACREDITACION_TOTAL`). `nce_modo` gana `COMBINADA` (cualquier nota del pedido unificado que no sea la total por referencia). Notas anteriores sin estas columnas se leen como hoy (`LINEAS`: devolucion por `line_no`; `MONTO`: reparto).
- **RN-07. Motivo sugerido.** Solo devoluciones → 2 Devolucion; solo acreditaciones → 3 Descuento (editable a 4 Bonificacion u 8 Ajuste de precio); mezcla → 1 Devolucion y ajuste de precios. El operador puede elegir cualquiera de 1, 2, 3, 4, 8.
- **RN-08. Saldo expuesto.** `GET .../nota-credito/saldo` por linea: `cantidad_facturada`, `cantidad_acreditada`, `importe_neto`, `importe_acreditado` (devoluciones + acreditaciones), `saldo_importe`, `descuento` y `descuento_global` si la linea los tiene; el `monto` actual (saldo neto, tasas) y `descuentos_en_nc` (la bandera `FE_NC_DESCUENTOS`, para D-6 en pantalla).
- **RN-09. Pantalla.** Validacion en vivo con el calculo compartido: celda invalida en rojo con su texto (canvas 02 C), aviso de saldo, boton deshabilitado con el motivo; total con la fila de redondeo (D-3); sin emojis; textos con voseo; 44 px en celular.

## Criterios de aceptacion

- **CA-01.** Factura PYG sin descuentos (como 1010671): devolver 1 del item 1, acreditar 10 % del item 2 y 5.000 sobre el total en una sola nota → lineas y total del canvas 04 (83.150), motivo 1, aprobada en SIFEN test; saldo 128.350.
- **CA-02.** "Toda la factura" sobre una factura sin notas → misma nota total de hoy (referencia o copia), aprobada.
- **CA-03.** Tope por item: devolver 2 y acreditar 20.000 sobre el mismo item de 150.000 → error en la linea, no se envia; total sobre el saldo → error y boton deshabilitado.
- **CA-04.** Porcentajes: 10 % sobre el total de una factura de 211.500 → 21.150 repartido por tasa; en USD 10 % → 2 decimales.
- **CA-05.** Factura externa con descuentos (rc4.36, bandera encendida): devolver 1 unidad de la linea con descuento → copia descuento y prorrateo, aprobada; con la bandera apagada la celda queda deshabilitada con el aviso.
- **CA-06.** Saldo despues de notas anteriores de cada tipo (lineas, monto, total por tasa, combinada): la grilla muestra ya acreditado y saldo correctos.
- **CA-07.** Desde la ficha, "Crear nota de crédito" abre esta pantalla con la factura elegida (no la ventana corta).
- **CA-08.** Compatibilidad: los tres cuerpos actuales de `POST .../nota-credito` siguen funcionando (pruebas existentes verdes).
- **CA-09.** Playwright 1440 y 1280 (pantalla completa) y 390 (tarjetas por linea) sin desplazamiento horizontal; emisiones reales de CA-01, CA-02 y CA-05 en SIFEN test con `fe-segel` `segel-rc4.36`.
- **CA-10.** (FS-143, hotfix 2026-11-13) Solo "Ajuste sobre el total", sin devoluciones ni ajustes por item → la pantalla manda la combinada sin `lineas` y la API la acepta (tambien con `lineas: []`); el cuerpo viejo `{motivo, lineas: []}` sigue rechazado con 400 para no convertirse en la nota total. Visto en `segel-fs` sobre la factura 0000361 (USD 2,23, ajuste 0,23).
