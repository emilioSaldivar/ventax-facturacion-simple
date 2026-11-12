# SPEC - Descuentos en la factura v0.1

Estado: borrador para refinamiento, escrito el 2026-11-11 a pedido del usuario (FS-66, critico comprometido para el 2026-11-12). Sin codigo.

## Alineacion

- `AGENTS.md` (limite de dominio: la estructura SIFEN y los totales oficiales son de FE).
- `docs/HOJA_DE_RUTA_v0.1.md`, punto 2.
- Guia de consumidores de FE, paquete v0.49 (`segel-rc4.32`, el que corre en `segel-fs`): §43 "Factura: Descuentos por Articulo y sobre el Total", §50 "Moneda Extranjera" (los descuentos van en la moneda de la factura con 2 decimales), §60.3 "Totales del documento".
- `docs/SPEC_MONEDA_EXTRANJERA_v0.1.md` (RN-02 decimales por moneda, RN-03 presentacion, A-2 totales oficiales de FE guardados).
- `docs/SPEC_TOTALES_FE_EN_CARGA_v0.1.md` (RN-03 y RN-07: una factura con descuento emite su nota de credito total por referencia).
- `docs/SPEC_NOTA_CREDITO_PARCIAL_v0.1.md` (RN-03: la parcial no se ofrece cuando la factura exige referencia).
- `docs/SPEC_EDITOR_FACTURA_PC_v0.1.md` D-2, que dejo los descuentos para despues: esta cadena los incorpora.
- `docs/SPEC_VALIDACIONES_RECEPTOR_v0.1.md`: las reglas de los datos del cliente (RUC con DV, correo, telefono, direccion) viven ahi y no se repiten aca.
- `docs/PLAN_DESCUENTOS_FACTURA_v0.1.md`, `docs/TASKS_DESCUENTOS_FACTURA_v0.1.md`.

## Origen

Hoy la factura manual de FS no tiene descuentos: ni por linea ni sobre el total. El operador que vende con descuento lo resuelve bajando el precio unitario a mano, y el KUDE no muestra el descuento. FE acepta descuentos desde su v0.24 (`items[].descuento` y `descuentoGlobal`) y calcula lo que SIFEN exige; FS solo los conoce en las facturas de carga masiva, donde guarda los totales que FE devuelve (`SPEC_TOTALES_FE_EN_CARGA_v0.1`).

Decisiones del usuario del 2026-11-11, sobre la propuesta de la hoja de ruta:

| Id | Decision |
|---|---|
| D-1 | Descuento por linea **y** descuento sobre el total, los dos, como los define FE. |
| D-2 | En la linea el operador escribe un porcentaje **o** un monto; FS lo convierte a monto por unidad, que es lo que entiende FE. El descuento sobre el total se escribe como monto. |
| D-3 | Disponible en el modo simple y en el modo completo del editor. |
| D-4 | Una factura con descuento (por linea o global) admite **solo nota de credito total**, por referencia, como ya pasa con las facturas de carga con descuento. La parcial con descuento queda para otra version. |
| D-5 | Presupuestos y pedidos no llevan descuento en esta version. |

Regla general fijada por el usuario: **las reglas de calculo y de validacion las define FE y FS las reproduce** antes de numerar; FS no inventa reglas propias. Donde FE no define algo (por ejemplo, el reparto de centavos del descuento global entre lineas), FS pregunta a FE antes de implementar (seccion "Coordinacion con FE" del PLAN).

## Contrato de FE

Confirmado por la sesion de FE el 2026-11-11 contra el codigo de `segel-rc4.32` (`src/domain/factura.schema.ts`, lineas 237-256), ademas de la guia §43 y §50:

| Regla | Detalle |
|---|---|
| Campos | `items[].descuento` (descuento **por unidad**, MT150 EA002) y `descuentoGlobal` (monto sobre toda la factura, MT150 F033). Los dos opcionales. Una factura sin descuentos se valida, numera y transmite igual que antes. |
| Formato | Positivos, con hasta 2 decimales (`multipleOf 0.01`). En `PYG` enteros: con decimales responde `422` "En guaranies, sin decimales". En moneda extranjera van en la moneda de la factura con hasta 2 decimales (§50). La frase "por ahora solo guaranies" de §43.4 quedo vieja; FE la registro como defecto documental. |
| Por item | `descuento + anticipo < precioUnitario`. Si no, `422` con la ruta del campo. |
| Global | No es un reparto libre. FE calcula un porcentaje unico sobre el bruto, `(descuentoGlobal + anticipoGlobal) / Σ cantidad × precioUnitario`, y lo aplica al precio unitario de cada item, tenga o no descuento propio (NT001, EA004). Si con eso el precio neto de algun item queda en cero o negativo, `422` sobre `descuentoGlobal`. Esto cubre tambien un global mayor que el bruto. |
| Total | Antes del redondeo: `Σ cantidad × (precioUnitario − descuento − anticipo) − descuentoGlobal − anticipoGlobal` (`totalNetoFactura`). Sin anticipo: `Σ cantidad × (precioUnitario − descuento) − descuentoGlobal`. |
| Redondeo | El redondeo SEDECO a multiplo de 50 guaranies (F013 `dRedon`) lo aplica FE solo en `PYG`. En moneda extranjera no redondea a 50 y el total va con 2 decimales. |
| Limites | No hay porcentaje maximo. Todos los rechazos son `422` **antes de numerar**: ninguno consume numero. |
| Prorrateo y redondeo (FE, 2026-11-11, xmlgen 1.0.277, comprobado con el mapper y xmlgen reales) | El reparto del global lo hace xmlgen: peso de cada item sobre el **bruto** (`bruto_i / Σ bruto`, con `bruto_i = cantidad × precioUnitario` antes del descuento por item); `dDescGloItem = descuentoGlobal × peso / cantidad`, por unidad, con 8 decimales. La diferencia de centavos **no se asigna a ninguna linea**: `dTotOpeItem` queda con 8 decimales y `dTotOpe` sale de la formula directa, redondeado al final (2 decimales en USD, entero en PYG). FE valida el neto <= 0 con el mismo peso. Base e IVA por item: primero `base = dTotOpeItem / 1,1` (o `/ 1,05`), despues `IVA = base × tasa / 100` (no `neto − base`), con 8 decimales (`toFixed`, mitad hacia arriba sobre el float). Totales en USD con 2 decimales. En PYG con global que no divide exacto, `dSub10`, bases e IVA salen con decimales en el XML y `dTotOpe` entero; **no esta verificado que SIFEN test apruebe ese caso** (el unico aprobado, 001-001-1010561, tiene `dSub10` entero y solo `dIVA10` decimal). `dTotalGs = round(dTotGralOpe × tipoCambio)`. |
| Pagos en contado | FE solo exige pagos con suma > 0; no compara con el total. Lo documentado y aprobado (§43.3) es que los pagos suman `dTotOpe`, el total **sin** redondear (vector PYG: pago 83.897, `dTotOpe` 83.897, `dRedon` 47, `dTotGralOpe` 83.850). |
| Lo que FE arma | Los porcentajes por item, el total de descuentos por item, el porcentaje del global, el total de descuentos y el KUDE con los descuentos. FS no los arma. |
| Totales oficiales | `GET /v1/documentos/{document_uuid}/totales` (§60.3) devuelve `bruto`, `descuento`, `anticipo`, `total`, `redondeo`, `gravada_10`, `gravada_5`, `exenta`, `exonerada`, `iva_10`, `iva_5`, `iva_total`, `total_guaranies`, en la moneda del documento. FS ya lo consume en `totalesDesdeFe` y `guardarTotalesFe` (`apps/api/src/modules/facturas/facturas.service.ts`). |

Ejemplo de FE (§43.3, coleccion Postman "Emitir FE SYNC - Descuentos por articulo y global"): 2 zapatillas a 100.000 con 10.000 de descuento cada una, mas medias a 50.000, y 30.000 de descuento global. Total: `2 × 90.000 + 50.000 − 30.000 = 200.000`.

Vectores de FE (xmlgen real, sin enviar), fijos para las pruebas de FS:

- **USD**, tipo de cambio 6181,34, `descuentoGlobal` 5,55, pago 81,68. Item 1: 3 × 19,99, descuento 1,11, IVA 10: bruto 59,97, `dPorcDesIt` 6, `dDescGloItem` 1,22509386, `dTotOpeItem` 52,96471842, base 48,14974402, IVA 4,8149744. Item 2: 7 × 4,37, IVA 5: bruto 30,59, `dDescGloItem` 0,26781692, `dTotOpeItem` 28,71528156, base 27,3478872, IVA 1,36739436. Totales: `dSub5` 28,72, `dSub10` 52,96, `dTotOpe` 81,68, `dTotDesc` 3,33, `dTotDescGlotem` 5,55, `dDescTotal` 8,88, `dPorcDescTotal` 6,12853357, `dRedon` 0, `dTotGralOpe` 81,68, `dIVA5` 1,37, `dIVA10` 4,81, `dTotIVA` 6,18, `dBaseGrav5` 27,35, `dBaseGrav10` 48,15, `dTotalGs` 504.892.
- **PYG**, mismos items × 1000 (3 × 19.990 con descuento 1.110, IVA 10; 7 × 4.370, IVA 5), `descuentoGlobal` 3.333, pago 83.897: `dDescGloItem` 735,71852915 y 160,83491608; `dTotOpeItem` 54.432,84441255 y 29.464,15558744; bases 49.484,40401141 y 28.061,10055947; `dTotOpe` 83.897, `dTotDesc` 3.330, `dDescTotal` 6.663, `dRedon` 47, `dTotGralOpe` 83.850, `dIVA10` 4.948,44040114, `dIVA5` 1.403,05502797, `dTotIVA` 6.351,49542911. Este caso no se envio nunca a SIFEN (ver CA-10).

El anticipo (`items[].anticipo`, `anticipoGlobal`, `anticipoCdc`) queda **fuera de esta cadena**; se menciona solo porque FE lo valida junto con el descuento. Es el siguiente paso natural despues de esta version.

## Situacion actual en FS

- Calculo: `calculateDocumentTotalsMoneda(lines, moneda)` de `packages/shared/src/money/moneda.ts`, sobre `calculateDocumentTotals` y `calculateTaxLine` de `packages/shared/src/money/tax.ts`. Por linea: `subtotal = cantidad × precio_unitario` (redondeado al entero o al centavo), `base_imponible = subtotal × 10/11` o `× 20/21` con redondeo a la mitad hacia arriba (`roundHalfUp`), `iva_monto = subtotal − base_imponible`. El precio incluye IVA. Totales: `subtotal` (suma de subtotales), `total_sin_iva`, `iva_5`, `iva_10`, `total_iva`, `total` (igual a `subtotal`). En moneda extranjera se calcula en centavos y se presenta en unidades con 2 decimales. FS no aplica el redondeo a 50: ese dato llega de FE con los totales oficiales (`redondeo`).
- API: `POST /facturas/preview` y `POST /facturas` (`facturas.routes.ts`, `facturaBaseSchema`): `items[]` con `cantidad`, `precio_unitario`, `iva_tipo`, `codigo`, `descripcion`, `catalogo_item_id`; `moneda`, `tipo_cambio`. `previewFactura` (`facturas.service.ts`) valida y calcula. El snapshot de lineas (`factura_items_snapshot`, columnas `numeric(18,2)` desde la migracion `0042`) guarda `cantidad`, `precio_unitario`, `iva_tipo`, `subtotal`, `base_imponible`, `iva_monto`; `totals_snapshot` guarda `TaxTotals`.
- Envio a FE: `buildEmitirFacturaPayload` (`fiscal-gateway.client.ts`) manda por item `codigo`, `descripcion`, `cantidad`, `precioUnitario`, `ivaTipo`; no manda `descuento` ni `descuentoGlobal`. El contado manda `pagos[0].monto = totals.total`.
- `TaxTotals` ya tiene `descuento?`, `anticipo?` y `nota_credito_por_referencia?`, usados solo por las facturas de carga con los montos de FE; `FeCargaComprobanteDetalle.items[].descuento` existe para leer el detalle de la carga.
- Nota de credito: `emitNotaCreditoParcial` responde `409 NOTA_CREDITO_SOLO_TOTAL` si `totals.nota_credito_por_referencia`; la total de esas facturas va por `POST /v1/nota-credito/total` sin lineas (RN-07 de totales en carga). Es el camino que reutiliza D-4.
- Editor (`apps/web-operacion/src/main.tsx`): `InvoiceLineDraft` (`tipos.ts`) sin descuento; modo completo con `GrillaLineas` (columnas #, Codigo, Descripcion, Cantidad, Precio, IVA, Subtotal, acciones) y tarjeta fija de totales (`TotalRow`: Subtotal, Total sin IVA, IVA 5%, IVA 10%, Total IVA, Total a pagar); modo simple con hoja por linea y pie fijo. La vista previa se pide a los 450 ms de cada cambio. `ResultadoEmision` y la ficha de Documentos muestran lineas y totales sin descuento.

## Objetivo

Que el operador cargue descuentos por linea y sobre el total en la factura manual, en guaranies y en moneda extranjera, con la misma validacion y el mismo calculo que FE, y que el KUDE y SIFEN los reciban como descuentos (no como precios rebajados). Que una factura con descuento quede marcada para nota de credito total por referencia.

## Reglas

### API

- **RN-01. Campos.** `POST /facturas/preview` y `POST /facturas` aceptan `items[].descuento` (monto por unidad, opcional, por omision 0) y `descuento_global` (monto sobre la factura, opcional, por omision 0). Los nombres de FS siguen la convencion de la API (`snake_case`); al enviar a FE pasan a `descuento` y `descuentoGlobal`.
- **RN-02. Formato igual que FE.** `descuento` y `descuento_global` son numeros mayores o iguales a cero. Fuera de `PYG` admiten hasta 2 decimales (`tieneDecimalesValidos`, la misma regla que `precio_unitario`); en `PYG` son enteros. Si no, `400 VALIDATION_ERROR` con `path` al campo y el mensaje "En guaraníes, el descuento va sin decimales" o "El descuento admite hasta 2 decimales".
- **RN-03. Descuento por unidad menor que el precio.** En cada linea `descuento < precio_unitario`. Si no, `400 VALIDATION_ERROR` con `path: ["items", i, "descuento"]` y el mensaje "El descuento tiene que ser menor que el precio". Se valida antes de calcular y antes de llamar a FE.
- **RN-04. Reparto del descuento global, igual que FE.** Con `descuento_global > 0`, FS calcula `porcentaje = descuento_global / Σ cantidad × precio_unitario` y, por linea, `descuento_global_unitario = porcentaje × precio_unitario`. Es la misma cuenta que el peso sobre el bruto de xmlgen (`descuento_global × (bruto_i / Σ bruto) / cantidad = porcentaje × precio_unitario`). El precio neto por unidad es `precio_unitario − descuento − descuento_global_unitario`. Si en alguna linea el precio neto es menor o igual a cero, `400 VALIDATION_ERROR` con `path: ["descuento_global"]` y el mensaje "El descuento sobre el total deja la línea N sin precio". Cubre `descuento_global >= bruto`.
- **RN-05. Totales.** Con la formula de FE:
  - `subtotal` (bruto): `Σ cantidad × precio_unitario`, como hoy.
  - `descuento`: `Σ cantidad × descuento + descuento_global` (total de descuentos, lo que FE informa como `descuento` en `/totales`).
  - `descuento_global`: el monto cargado, para mostrarlo aparte.
  - `total`: `Σ cantidad × (precio_unitario − descuento) − descuento_global`. Sin descuentos coincide con el `total` de hoy.
  - `total_sin_iva`, `iva_5`, `iva_10`, `total_iva`: sumas por linea calculadas sobre el importe neto de cada linea (RN-06).
  - Sin descuentos los totales son identicos a los actuales, campo por campo (regresion).
- **RN-06. Lineas, igual que xmlgen.** Cada linea del calculo y del snapshot suma `descuento` (por unidad, lo que cargo el operador) y `descuento_global` (el monto prorrateado a la linea, `cantidad × descuento_global_unitario`, guardado con 8 decimales como `dDescGloItem × cantidad`). `subtotal` de la linea es el importe neto `cantidad × (precio_unitario − descuento) − descuento_global`, con 8 decimales internos; `base_imponible = subtotal / 1,1` (o `/ 1,05`) y `iva_monto = base_imponible × tasa / 100`, en ese orden, con 8 decimales internos (la secuencia de FE). **No se ajusta ninguna linea por la diferencia de centavos**: el `total` sale de la formula directa de RN-05 y puede diferir de `Σ subtotal` en fracciones de centavo, como en FE. Los totales `total_sin_iva`, `iva_5`, `iva_10`, `total_iva` se redondean al presentarlos (2 decimales fuera de PYG; entero en PYG) y la fuente oficial despues de emitir son los totales de FE (RN-08). Sin descuentos los valores son identicos a los de hoy (CA-04).
- **RN-06a. Implementacion en FS (2026-11-11).** FS calcula en unidades enteras (guaranies o centavos), como el resto de su calculo: el global se reparte por peso sobre el bruto (la regla de xmlgen) y los restos de la division se asignan por mayor fraccion, de modo que `Σ subtotal` de las lineas es exactamente el `total` de la formula directa de FE. Las lineas pueden diferir del XML en menos de una unidad (FE guarda 8 decimales); `total` y `descuento` coinciden con FE (vectores de FE: PYG total 83.897 y descuento 6.663; USD total 81,68 y descuento 8,88, con IVA 10 % 4,81 e IVA 5 % 1,37). Los totales oficiales siguen siendo los de FE (RN-08).
- **RN-07. Envio a FE.** `buildEmitirFacturaPayload` manda `items[].descuento` solo cuando es mayor que cero y `descuentoGlobal` solo cuando es mayor que cero, con los decimales de la moneda; `precioUnitario` sigue siendo el precio bruto. No manda `anticipo`. El `pagos[0].monto` del contado es el `total` neto (RN-05). FS no manda porcentajes ni totales de descuento: los arma FE.
- **RN-08. Snapshot y totales oficiales.** La factura guarda las lineas con `descuento` y `descuento_global` (RN-06) y `totals_snapshot` con `descuento` y `descuento_global` (RN-05). Cuando el documento queda `EMITIDA`, `guardarTotalesFe` reemplaza los totales por los de `GET /v1/documentos/{uuid}/totales` como ya hace (`fuente: "FE"`, con `redondeo` y `total_guaranies`); `descuento_global` del snapshot se conserva al mezclar. Los totales de FE son los oficiales; los de FS son la vista previa.
- **RN-09. Nota de credito (D-4).** Una factura creada con `descuento > 0` en alguna linea o `descuento_global > 0` se guarda con `totals.nota_credito_por_referencia = true`. Con eso, sin cambios en el modulo de notas: la parcial responde `409 NOTA_CREDITO_SOLO_TOTAL` y la total va por `POST /v1/nota-credito/total`. El mensaje existente "Esta factura solo admite nota de crédito total" se mantiene.
- **RN-10. Un `422` de FE sobre un descuento** (si llegara pese a RN-02 a RN-04, por ejemplo por una regla nueva de FE) se traduce como hoy un error de validacion de FE: la factura no se crea o queda `ERROR_OPERATIVO` con el mensaje de FE, segun el punto del flujo, y el operador ve el motivo. No se reintenta como error temporal.
- **RN-11. Contrato.** `spec/openapi.yaml` documenta `descuento` en `FacturaItemInput` y `DocumentoItemSnapshot` (`descuento`, `descuento_global`), `descuento_global` en `FacturaPreviewRequest`, y en `DocumentoTotals` `descuento` pasa de `integer` a `number` y suma `descuento_global`.
- **RN-12. Carga masiva y presupuestos no cambian.** Las facturas de carga siguen tomando sus totales de FE (`SPEC_TOTALES_FE_EN_CARGA_v0.1`); las notas comerciales no llevan descuento (D-5).

### Web (editor, resultado y ficha)

- **RN-13. Descuento por linea en el modo completo.** `GrillaLineas` suma la columna "Descuento" entre Precio e IVA, con un conmutador en el encabezado de la columna: "%" o la moneda ("Gs." o `USD`). El conmutador vale para toda la grilla y arranca en "%". Lo que el operador escribe se guarda en la linea como `descuento_ingresado` (texto) y `descuento_modo` (`PORCENTAJE` o `MONTO`); el monto por unidad que viaja a la API se calcula al momento: en modo porcentaje `precio_unitario × porcentaje / 100`, redondeado a los decimales de la moneda (entero en `PYG`, centavo fuera); en modo monto, el monto tal cual. El porcentaje admite hasta 2 decimales y debe ser menor que 100.
- **RN-14. Descuento por linea en el modo simple.** La hoja de la linea suma el campo "Descuento" debajo de "Precio", con el mismo conmutador "%" / moneda al lado del campo. Misma conversion que RN-13.
- **RN-15. Descuento sobre el total.** Debajo de las lineas, en la seccion "Productos o servicios", un campo "Descuento sobre el total" en la moneda de la factura (entero en `PYG`, 2 decimales fuera), con el texto de ayuda "Se reparte en proporción entre todas las líneas, como lo exige SIFEN". Visible en los dos modos. Vacio o 0: no se manda.
- **RN-16. Validacion en pantalla, antes de la vista previa.** Una linea con `descuento >= precio` se marca invalida (mismo tratamiento que una linea incompleta: `fila-invalida`, bloquea "Crear factura") con el texto "El descuento tiene que ser menor que el precio". Un descuento con mas decimales que la moneda se marca con "En guaraníes, sin decimales". Si la API responde el error de RN-04, el mensaje se muestra junto al campo "Descuento sobre el total" y bloquea la creacion.
- **RN-17. Subtotal de la linea.** La columna "Subtotal" de la grilla y el importe de la hoja muestran el neto de la linea despues del descuento por unidad (`cantidad × (precio − descuento)`); el prorrateo del global no se muestra por linea. Con descuento, el precio tachado no se usa: se muestra el precio bruto en su columna y el descuento en la suya.
- **RN-18. Totales.** La tarjeta de totales (modo completo) y la seccion de totales (modo simple) agregan la fila "Descuento" entre "Subtotal" y "Total sin IVA", en negativo con el formato de la moneda ("− Gs. 50.000"), solo cuando `totals.descuento > 0`. "Total a pagar" es el `total` neto. La equivalencia en guaranies fuera de `PYG` se calcula sobre el `total` neto, como hoy.
- **RN-19. Resultado y ficha.** `ResultadoEmision` y la ficha de Documentos agregan la columna "Descuento" a la tabla de lineas cuando alguna linea lo tiene, y la fila "Descuento" a los totales cuando `totals.descuento > 0`. Con `fuente: "FE"`, muestran el `descuento` oficial de FE. El KUDE lo arma FE; FS no dibuja nada mas.
- **RN-20. Nota de credito en la ficha.** Para una factura con descuento, la ficha ofrece solo la nota total y muestra el texto ya existente de las facturas con `nota_credito_por_referencia` ("Esta factura solo admite nota de crédito total"). Sin cambio de pantalla: lo decide `totals.nota_credito_por_referencia` (RN-09).
- **RN-21. Borradores y plantillas.** El borrador local del editor (`lib/borradores.ts`) guarda los descuentos de las lineas y el global. "Convertir en factura" desde un presupuesto no trae descuentos (D-5).
- **RN-22. Textos.** Sin emojis; voseo en los textos de ayuda; "Descuento" y "Descuento sobre el total" como etiquetas; `docs/PAUTAS_FRONTEND_v0.1.md` para tokens, componentes y accesibilidad (cada campo con `aria-label` "Descuento, línea N").

## Fuera de alcance

- Anticipos (`items[].anticipo`, `anticipoGlobal`, `anticipoCdc`) y cuotas: siguiente cadena.
- Nota de credito parcial de una factura con descuento (D-4): queda `409 NOTA_CREDITO_SOLO_TOTAL`.
- Descuentos en presupuestos y pedidos (D-5) y en la nota de debito.
- Carga masiva: ya trae los descuentos del archivo y los totales de FE; no cambia.
- Redondeo a 50 guaranies en la vista previa de FS: lo informa FE en `redondeo`; FS sigue sin calcularlo.
- Catalogo: un articulo no guarda descuento; el descuento se carga en la factura.
- Mostrar porcentajes de descuento en el resultado o la ficha: solo montos.

## Decisiones pendientes

- **DP-1.** Resuelta el 2026-11-11 con FE: no hay reparto de centavos; RN-06 reproduce xmlgen (8 decimales, sin ajuste, total por formula directa).
- **DP-2.** Si el conmutador "%" / moneda es por grilla (propuesta, mas simple) o por linea. Se implementa por grilla; se cambia si el usuario lo pide al ver la pantalla.
- **DP-3.** Si "Descuento sobre el total" se ofrece tambien como porcentaje. Propuesta: no en v0.1 (FE lo recibe como monto y el usuario decidio monto en D-2).

## Criterios de aceptacion

- **CA-01. Ejemplo de FE en guaranies.** Lineas: 2 × 100.000 con descuento 10.000 por unidad (IVA 10%), 1 × 50.000 sin descuento (IVA 10%), descuento global 30.000. La vista previa responde `subtotal 250.000`, `descuento 50.000`, `descuento_global 30.000`, `total 200.000`; `total_sin_iva + total_iva = 200.000`. En el mock de FE la factura se crea con `items[0].descuento = 10000`, sin `descuento` en `items[1]`, y `descuentoGlobal = 30000`; `pagos[0].monto = 200000`.
- **CA-02. Ejemplo en USD.** Lineas: 3 × 10,50 con descuento 0,50 por unidad, 1 × 20,00 sin descuento, descuento global 5,00, tipo de cambio 7.300. `subtotal 51,50`, `descuento 6,50`, `total 45,00`; equivalencia 328.500 Gs. El payload a FE lleva `descuento: 0.5` y `descuentoGlobal: 5` con `moneda: "USD"`.
- **CA-03. Validaciones de FE reproducidas.** (a) `descuento 100.000` con precio 100.000: `400` en `items.0.descuento`; (b) `descuento 10,5` en `PYG`: `400` "sin decimales"; (c) `descuento_global 250.000` con el bruto de CA-01: `400` en `descuento_global` nombrando la linea; (d) `descuento_global 0` o ausente: identico a hoy. Ninguno llama a FE.
- **CA-04. Regresion sin descuentos.** Las pruebas existentes de `tax.test.ts`, `moneda.test.ts`, `totales-fe.test.ts`, `moneda.schema.test.ts` y las de facturas siguen en verde; `previewFactura` sin descuentos devuelve exactamente los mismos totales que antes.
- **CA-05. Nota de credito.** La factura de CA-01 emitida (mock) tiene `totals.nota_credito_por_referencia = true`; la parcial responde `409 NOTA_CREDITO_SOLO_TOTAL`; la total sale por `/nota-credito/total`. La ficha solo ofrece la total.
- **CA-06. Totales oficiales.** Tras `EMITIDA`, `guardarTotalesFe` deja `fuente: "FE"` con `descuento` de FE y conserva `descuento_global`; la ficha muestra el descuento oficial.
- **CA-07. Editor modo completo (Playwright 1440 y 1280).** Columna "Descuento" con conmutador; cargar 10 % en una linea de 100.000 muestra subtotal 90.000; cambiar a "Gs." muestra 10.000; campo "Descuento sobre el total" con 30.000; fila "Descuento − Gs. 50.000" y "Total a pagar Gs. 200.000" (CA-01); una linea con descuento igual al precio se marca invalida con su texto y bloquea "Crear factura".
- **CA-08. Editor modo simple (Playwright 390).** La hoja de la linea muestra "Descuento" con el conmutador; el pie muestra la fila "Descuento" y el total neto; sin desbordes horizontales.
- **CA-09. Resultado y ficha (Playwright).** Tras crear la factura de CA-01 contra el mock, `ResultadoEmision` muestra la columna "Descuento" y la fila "Descuento"; la ficha en Documentos tambien. Sin emojis nuevos (reconocimiento UX sin aumentos).
- **CA-10. SIFEN test.** Una factura con descuento por linea y global, en `PYG`, emitida contra FE real en SIFEN test desde el stack local (`.local/segel-ensayo`), con aviso previo a la sesion de FE: aprobada; `GET /totales` devuelve `descuento` igual al calculado por FS y `total` igual salvo `redondeo`; el KUDE muestra los descuentos. Una segunda en USD si FE lo confirma para esa clave.
- **CA-11. Contrato.** `spec/openapi.yaml` actualizado (RN-11) y el frontend consume solo lo documentado.
