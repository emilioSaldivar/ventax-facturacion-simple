# SPEC Moneda Extranjera En La Factura Manual v0.1

**Fecha:** 2026-11-10 · **Rama:** `feat/identidad-segel` · **Estado:** autorizada por el usuario el 2026-11-10 para un cliente nuevo que factura en dolares. Contrato de FE: corte `segel-rc4.25` (paquete v0.40); produccion hoy corre `segel-rc4.6.1`, que no tiene moneda extranjera: el alta del cliente requiere desplegar el corte (decision del usuario).

## Alineacion

- `docs/BACKLOG.md`, FS-49.
- Guia de consumidores de FE, seccion 50.1 (moneda y tipo de cambio) y catalogo `MONEDA`; MT150 campos `cMoneOpe`, `dCondTiCam`, `dTiCam`.
- `AGENTS.md`: FS no copia logica fiscal; el XML y el KUDE de FE son la fuente oficial de montos.

## Contrato de FE (`POST /v1/factura`)

- `moneda`: ISO 4217; sin el campo, `PYG`.
- `tipoCambio`: cotizacion a guaranies de toda la factura, hasta 4 decimales; o `items[].tipoCambio` por articulo (no los dos).
- Con moneda distinta de `PYG`, precios, pagos y cuotas en esa moneda con hasta 2 decimales; SIFEN no aplica el redondeo a 50 Gs; FE informa el total en guaranies en el documento.
- Combinaciones invalidas: `422` antes de numerar.
- La respuesta de la emision no trae totales: FS calcula los suyos para mostrar; el KUDE es el oficial.

## Alcance (v0.1)

1. **Editor de factura:** selector de moneda (Guarani por defecto; Dolar estadounidense, Euro y Real brasileño) y tipo de cambio global obligatorio con moneda extranjera. Precios con hasta 2 decimales en moneda extranjera; cantidades como hoy.
2. **Calculo de la vista previa** en la moneda de la factura, con 2 decimales.
3. **Emision** con `moneda`, `tipoCambio` y precios y pago contado en esa moneda.
4. **Guardado:** moneda y tipo de cambio en la factura; montos de las lineas con 2 decimales (migracion).
5. **Pantallas:** todos los montos de un documento en su moneda ("USD 1.234,50"); la columna Moneda de Documentos con la real.
6. **Recibos** de una factura a credito en moneda extranjera, en la misma moneda (si la pantalla de recibos lo permite sin cambios grandes; si no, bloqueado con aviso).
7. **Nota de credito** de una factura en moneda extranjera: **bloqueada** con "La nota de crédito de una factura en moneda extranjera se gestiona con soporte" hasta que FE confirme o publique la nota en esa moneda (consulta enviada a FE el 2026-11-10).

## Fuera de alcance

- Carga masiva en moneda extranjera (la incorporacion desde la carga sigue en FS-49).
- Tipo de cambio por articulo, comprador del exterior (B2F), datos adicionales.
- Catalogo en moneda extranjera: el catalogo sigue en guaranies; con moneda extranjera, elegir un articulo del catalogo completa descripcion e IVA y deja el precio para cargar.

## Reglas

- **RN-01.** Sin moneda elegida, todo como hoy (guaranies enteros, sin `moneda` en el pedido).
- **RN-02.** Con moneda extranjera, el tipo de cambio es obligatorio, mayor que cero y con hasta 4 decimales; los precios mayores que cero con hasta 2 decimales.
- **RN-03.** El calculo de FS es de presentacion: subtotal = cantidad x precio, redondeado a 2 decimales; base e IVA por la tasa del articulo, redondeados a 2 decimales. Si difiere en centavos del KUDE, manda el KUDE.
- **RN-04.** Formato de montos: guaranies "Gs. 1.234.567"; otra moneda "USD 1.234,50".
- **RN-05.** RN de nota de credito y recibo segun el punto 6 y 7 del alcance.

## Criterios de aceptacion

- **CA-01.** Una factura contado en USD con tipo de cambio se emite y SIFEN test la aprueba; el KUDE muestra la moneda y el tipo de cambio.
- **CA-02.** Una factura a credito en USD se emite y aprueba.
- **CA-03.** FS muestra los montos en USD en la lista, la tabla y la ficha, y la columna Moneda dice USD.
- **CA-04.** Sin tipo de cambio, el editor no deja emitir.
- **CA-05.** Una factura en guaranies sale igual que antes.
- **CA-06.** La nota de credito de una factura en USD se comporta segun la respuesta de FE (bloqueada o habilitada).
- **CA-07.** Escritorio 1440 y 1280, y 390.
