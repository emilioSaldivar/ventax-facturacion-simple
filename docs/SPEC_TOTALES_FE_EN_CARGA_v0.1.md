# SPEC Totales De FE En La Carga v0.1

**Fecha:** 2026-11-09 · **Rama:** `feat/identidad-segel` · **Estado:** autorizada por el usuario el 2026-11-09. Depende de que FE agregue los totales al detalle del comprobante (ver "Dependencia").

## Alineacion

- `AGENTS.md`: FS no copia logica fiscal SIFEN; el backend fiscal devuelve numero, estados y montos, y FS los guarda como referencia.
- `docs/BACKLOG.md`, FS-45 (a) y (c).
- `docs/SPEC_CARGA_MASIVA_FACTURAS_v0.1.md`, D-11: si el total calculado difiere del de FE, manda FE.
- Contrato de FE: `segel-rc4.7` (descuentos), `segel-rc4.9` (afectacion del IVA), secciones 14 y 16 de `docs/PEDIDO_FACTURACION_SIMPLE_COBERTURA_MT150_v0.1.md` del repositorio de FE.

## Problema

Cuando una carga incorpora un comprobante, FS arma la factura propia con `itemsYTotales` (`cargas.mapeo.ts`): cantidad por precio y el IVA por la tasa del articulo, con todo lo que no es IVA10 o IVA5 como exento. Con FE desde `rc4.7` eso deja de ser cierto:

- **Descuentos** (`item_descuento`, `descuento_global`): FS guarda y muestra el total bruto, mayor que el de la factura.
- **Afectacion del IVA** (`EXONERADO`, `GRAVADO_PARCIAL`): el IVA de FS no coincide con el de la factura.

Ademas, el `detalle.total` de FE (`detalleDe` en `presentar-carga.ts`, `segel-rc4.10`) tambien es cantidad por precio, sin descuentos ni desglose: FS no tiene hoy de donde tomar los montos netos.

## Dependencia

FE agrega `detalle.totales`, tomado del documento generado (bloque de totales del DE), presente desde que el documento existe. Forma propuesta por FS y **confirmada por FE el 2026-11-09**, mas `anticipo` (FE `rc4.11`). `detalle.total` no cambia de significado (suma bruta):

| Campo | Significado |
|---|---|
| `bruto` | Suma de cantidad por precio, antes de descuentos |
| `descuento` | Descuentos por articulo y global |
| `anticipo` | Anticipos aplicados |
| `total` | Total de la operacion, el de la factura y el KUDE |
| `redondeo` | Redondeo de la operacion, si lo hay |
| `gravada_10`, `gravada_5` | Base imponible por tasa |
| `exenta`, `exonerada` | Montos exentos y exonerados |
| `iva_10`, `iva_5`, `iva_total` | IVA por tasa y total |

### Nota de credito total de una factura cargada

La nota de credito total se arma con las lineas y totales de la factura de FS (`facturas.service.ts`: `items: original.items`, `totals: original.totals`). Con una factura cargada con descuentos, la nota sumaria cantidad por precio, **mas que la factura**: FE la rechazaria (`CREDIT_NOTE_TOTAL_EXCEEDED`) o quedaria mal. Con articulos exonerados o gravados parciales, el IVA de la nota no coincidiria con el de la factura. Opciones planteadas a FE el 2026-11-09; **FE eligio la 1** (nota total por referencia), en una entrega posterior:

1. FE acepta una nota de credito total por referencia (el CDC de la factura), sin lineas, y arma las lineas del documento original. FS no calcula nada.
2. FE informa en `detalle.items` el precio neto, el descuento y la afectacion de cada linea, y FS los reenvia tal cual en la nota.

Hasta resolverlo, una factura de carga con descuento o afectacion distinta de la tasa no ofrece "Nota de credito" en FS (RN-07).

## Reglas

- **RN-01.** Con `detalle.totales`, FS guarda en la factura de la carga los montos de FE: `total`, `iva_5`, `iva_10`, `total_iva` y `total_sin_iva = total - iva_total`; `subtotal` es `bruto`. No los recalcula.
- **RN-02.** Sin `detalle.totales` (FE anterior), FS sigue calculando como hoy. Es correcto para archivos sin descuentos ni afectacion del IVA.
- **RN-03.** Las lineas de la factura de FS conservan cantidad y precio del archivo. Si la linea trae descuento por articulo, se guarda en la linea; FS no reparte el descuento global entre lineas.
- **RN-04.** Si FS recalcula (RN-02) y su total difiere de `detalle.total`, sigue el aviso de hoy (D-11). Con RN-01 no hay aviso: no hay calculo propio.
- **RN-05.** Solo `tipo_documento = FACTURA` se incorpora como factura. Otro tipo se registra en el log y no crea factura (FS-45 (b); la nota de remision va por otro modelo).
- **RN-06.** La pantalla de la factura muestra el total guardado (hoy la ficha solo muestra el total).
- **RN-07.** Mientras no este resuelta la nota de credito por referencia o con lineas de FE, una factura de carga con `totales.descuento > 0` o con articulos exonerados o gravados parciales no ofrece "Nota de credito"; el motivo se muestra al operador ("Esta factura tiene descuentos: la nota de credito se gestiona con soporte").

## Criterios de aceptacion

- **CA-01.** Un comprobante con descuento por articulo y global queda en FS con el total neto de FE.
- **CA-02.** Un comprobante con un articulo exonerado y otro gravado parcial queda con el IVA de FE.
- **CA-03.** Sin `detalle.totales`, la factura queda como hoy.
- **CA-04.** Un comprobante que no es `FACTURA` no crea factura.
- **CA-06.** Una factura de carga con descuento no ofrece nota de credito hasta resolver la dependencia; sin descuento, si.
- **CA-05.** Prueba conjunta con FE en SIFEN test: los totales de FS coinciden con los de la factura de FE para los ejemplos de descuentos y afectacion del IVA.
