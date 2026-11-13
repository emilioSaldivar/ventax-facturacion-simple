# PLAN Nota De Credito Unificada v0.1

**Fecha:** 2026-11-12 · **SPEC:** `docs/SPEC_NOTA_CREDITO_UNIFICADA_v0.1.md` · **Rama:** `feat/identidad-segel` (base `0f6200e`) · **FE:** `segel-rc4.36` en `fe-segel` para las pruebas reales · **Iteracion:** implementada el 2026-11-12 (ver §7, diseño adoptado).

## 0. Reglas para la implementacion

- Vectores de prueba solo del stack local o de FE (PLAN de factura externa §0), nunca de memoria.
- El calculo vive una sola vez en `packages/shared` y lo usan la API y la pantalla (como el reparto de §67).
- Compatibilidad: ningun cuerpo actual de `POST .../nota-credito` deja de funcionar (D-9); la suite actual sigue verde sin tocar sus expectativas salvo las de la ventana vieja que se elimina.

## 1. Calculo compartido (`packages/shared/src/money/nota-credito-combinada.ts`)

- Entrada: `factura: { moneda, items: [{ line_no, codigo, descripcion, cantidad, precio_unitario, iva_tipo, descuento?, descuento_global?, subtotal }], tasas: MontosPorTasa }`, `saldoPorLinea: Map<line_no, { cantidad, importe }>`, `saldoNeto`, `pedido` (RN-01), `opciones: { descuentosEnNc: boolean }`.
- Salida: `{ lineas: LineaNc[], totales: TaxTotals, total_redondeado, redondeo, motivo_sugerido, errores: { lineas: [{ line_no, campo, mensaje }], total?: mensaje } }` con `LineaNc = { origen, linea_factura, codigo, descripcion, cantidad, precio_unitario, iva_tipo, descuento?, descuento_global? }`.
- Pasos: devoluciones (neto por unidad = `subtotal / cantidad`; con `descuentosEnNc` copia `descuento` y prorratea `descuento_global` × cantidad devuelta / cantidad facturada; sin la bandera y con descuento → error D-6); acreditaciones por item (% → `round(importe_neto × % / 100)` en la unidad de la moneda; D-4); acreditacion sobre el total (% → `round(saldoNeto × %)`; reparto con `repartirMontoPorTasa`); total = suma de importes netos; D-5; en PYG `total_redondeado = floor(total / 50) × 50` (D-3); motivo RN-07.
- Reusa `repartirMontoPorTasa`, `calculateDocumentTotalsMoneda`, `decimalesDeMoneda`. Prueba unitaria con el ejemplo del canvas 04 (83.150; 3.546 / 745 / 709), con % en PYG y USD, topes, descuentos con y sin bandera, y redondeo.

## 2. Migracion `db/migrations/0052_nota_credito_combinada.sql`

- `factura_items_snapshot`: `linea_factura integer null`, `origen_nc text null check (origen_nc in ('DEVOLUCION','ACREDITACION_LINEA','ACREDITACION_TOTAL'))`.
- `facturas_operativas_nce_modo_chk`: agrega `COMBINADA` (drop/create del check, idempotente).
- Sin backfill: las notas anteriores se interpretan por `nce_modo` (RN-06).

## 3. API (`apps/api/src/modules/facturas`)

- `facturas.routes.ts`, `notaCreditoSchema`: suma `lineas[].acreditacion`, `acreditacion_total`, `toda_la_factura`, `motivo_codigo` 1/2/3/4/8 (hoy solo 3/4/8 con monto); `superRefine` de RN-01. `lineas[].cantidad` pasa a opcional (una linea puede tener solo acreditacion).
- `nota-credito-parcial.ts` / `saldoAcreditablePorLinea`: cuenta cantidades por `linea_factura` cuando existe (si no, `line_no` como hoy) y solo items `DEVOLUCION` o notas `LINEAS`; agrega `importe_acreditado` sumando devoluciones al neto y `ACREDITACION_LINEA`.
- `facturas.service.ts`: `emitNotaCredito` normaliza los cuerpos viejos al pedido unificado (D-9): `{motivo}` → `toda_la_factura`; `{lineas}` → devoluciones; `{monto}` → `acreditacion_total` MONTO con el motivo pedido. Nuevo `emitNotaCreditoCombinada`: comprobaciones de hoy (factura, innominada, moneda, anticipo, trabada), saldo neto (factura propia: `/totales` de FE; externa: totales guardados), `armarNotaCombinada` del paquete compartido, errores → `400`/`409`, `buildFiscalNotaCreditoRequest` con las lineas (`enviar_descuentos` segun la bandera), `llamarNotaCredito`, persistencia con `modo: "COMBINADA"`, `motivoCodigo` e items con `linea_factura`/`origen_nc`. `toda_la_factura` sin notas vivas sigue por `emitNotaCreditoTotal` (D-7).
- `facturas.repository.ts`: `createNotaCreditoFromFactura` escribe `line_no` correlativo, `linea_factura` y `origen_nc`; `findItems` los lee; `FacturaItemPreview` suma los dos campos opcionales.
- `reintentarNotaCredito`: `COMBINADA` reenvia sus items y su motivo (como `MONTO`).
- `getNotaCreditoSaldo`: RN-08 (`importe_neto`, `importe_acreditado`, `saldo_importe` por linea).

## 4. Pantalla (`apps/web-operacion`)

- `components/NotaCreditoEditor.tsx` (nuevo): grilla del canvas 01 (modo completo ≥ 1024 px) y tarjetas por linea del canvas 03 (< 1024 px), conmutador "%" / moneda de la columna Acreditar y del campo sobre el total (componentes y tokens de `docs/PAUTAS_FRONTEND_v0.1.md`), "Agregar/Ocultar acreditaciones", "Toda la factura", Motivo en SIFEN y Detalle, panel Resumen con el calculo compartido (importado por ruta relativa como `notaCreditoMonto.ts`) y el boton con el motivo de bloqueo.
- `views/CreditNoteView.tsx`: la tarjeta "Qué se devuelve" y sus tres modos se reemplazan por `NotaCreditoEditor`; acepta `facturaInicialId` para abrir con la factura elegida.
- `views/DocumentsView.tsx`: "Crear nota de crédito" (ficha y menu de fila) navega a Notas de credito con la factura (`onCrearNotaCredito(documentoId)` hacia `main.tsx`); se eliminan la ventana corta, `NotaCreditoPorMonto` en el modal y el estado `ncModo`/`ncCantidades` (P-C6: borrar lo reemplazado).
- `components/NotaCreditoPorMonto.tsx` se elimina (absorbido).
- `tipos.ts`: tipos del pedido unificado y del saldo por linea.

## 5. Contrato (`spec/openapi.yaml`)

- `NotaCreditoEmitRequest`: `lineas[].acreditacion`, `acreditacion_total`, `toda_la_factura`, `motivo_codigo` 1/2/3/4/8; `cantidad` opcional; los cuerpos viejos documentados como compatibles. `NotaCreditoSaldoResponse.lineas[]` con los campos de RN-08. Item de documento con `linea_factura` y `origen_nc`.

## 6. Pruebas

- Shared: `nota-credito-combinada.test.ts` (seccion 1).
- API: `tests/nota-credito-combinada.test.ts` (pedido unificado, cuerpos viejos normalizados, topes D-4/D-5, porcentajes, descuentos D-6, motivo RN-07, guardado con `linea_factura`/`origen_nc`, saldo por linea con notas de cada modo, reintento `COMBINADA`); suite completa verde.
- Playwright `scripts/segel-fs/playwright-nc-unificada.cjs` contra `fe-segel` `segel-rc4.36` y `FE_NC_DESCUENTOS=true` (SIFEN test; facturas emitidas fuera de FS como en FS-138): CA-01 a CA-09, 1440/1280/390. Regresion: `playwright-nc-factura-externa.cjs` y `playwright-nc-externa-cdc.cjs` adaptados a la pantalla nueva.

## 7. Diseño adoptado (ajustes de la implementacion, 2026-11-12)

- **Contrato.** No se agrego `toda_la_factura`: la pantalla manda `{ motivo }` cuando la factura entera no tiene notas ni acreditaciones (D-7, `esFacturaEntera` en `lib/notaCreditoUnificada.ts`) y el pedido combinado en cualquier otro caso, con `combinada: true`. La API enruta a `emitNotaCreditoCombinada` con `combinada`, `acreditacion_total`, alguna linea con `acreditacion` o sin `cantidad`, o (con `FE_NC_DESCUENTOS`) una devolucion sobre una linea con descuento; los demas cuerpos siguen sus caminos (D-9).
- **Saldo.** `GET .../nota-credito/saldo` suma `descuentos_en_nc` para que la pantalla aplique D-6 sin adivinar la bandera.
- **Calculo compartido.** `armarNotaCombinada` recibe los items con `cantidad_disponible` e `importe_disponible` (el saldo por linea de RN-08) en lugar de un mapa aparte; los mensajes de tope muestran importes con formato de pantalla ("Gs. 150.000").
- **Pantalla.** `lib/notaCreditoUnificada.ts` (estado del formulario, armado del pedido, desglose por tasa) y `components/NotaCreditoEditor.tsx` (grilla en escritorio con `useEsEscritorio`, tarjetas por linea debajo de 1024 px). `CreditNoteView` reemplaza los tres modos por el editor, agrega "Motivo en SIFEN" (sugerido, editable; fijo en Devolucion para la factura entera) y el Resumen del canvas. `DocumentsView` ya no tiene la ventana corta: "Crear nota de crédito" y "Emitir nueva nota de crédito" llaman a `onCrearNotaCredito`, que en `main.tsx` abre Notas de credito con `facturaInicialId`. Se borraron `components/NotaCreditoPorMonto.tsx`, `lib/notaCreditoMonto.ts` y sus estilos.
- **Guiones.** `playwright-nc-unificada.cjs` (nuevo). `playwright-nc-factura-externa.cjs` y `playwright-nc-externa-cdc.cjs` adaptados a la pantalla. `playwright-nota-credito-monto.cjs` y `playwright-nc-cuerpo.cjs` quedan como evidencia historica de la ventana anterior (no corren contra esta version).
- **Hallazgo.** FS-142: la busqueda por numero no encuentra facturas externas (fuera de esta cadena).
- **Nombre "Ajuste" (D-10, 2026-11-12).** Solo textos visibles: `NotaCreditoEditor.tsx` (columna, conmutador, campo sobre el total, enlaces, avisos), `CreditNoteView.tsx` (titulos, subtitulo, Resumen, bloqueo), `DocumentsView.tsx` (seccion "Devuelto por notas de crédito" de la ficha) y los mensajes y descripciones de linea de `armarNotaCombinada` (que viajan a SIFEN). Variables, campos del contrato, columnas y valores de `origen_nc` conservan su nombre. Guiones Playwright con las etiquetas nuevas.
