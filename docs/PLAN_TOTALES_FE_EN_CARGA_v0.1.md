# PLAN Totales De FE En La Carga v0.1

**Fecha:** 2026-11-09 · **SPEC:** `docs/SPEC_TOTALES_FE_EN_CARGA_v0.1.md`

Nombres de FE confirmados el 2026-11-09: `detalle.totales = { bruto, descuento, anticipo, total, redondeo, gravada_10, gravada_5, exenta, exonerada, iva_10, iva_5, iva_total }`, enteros en Gs, del bloque de totales del DE; `null` antes de `PREPARADO`. `detalle.total` **no cambia**: sigue siendo la suma bruta. En las lineas, FE pasa los campos del pedido: `descuento`, `afectacionIva`, `proporcionGravada`. Nota de credito: FE elige la nota total por referencia (opcion 1), en una entrega posterior.

## 1. Tipos

- `fiscal-gateway.types.ts`: `FeDetalleTotales` con los doce campos; `FeCargaComprobanteDetalle.totales?: FeDetalleTotales | null`; cada linea suma `descuento?`, `afectacionIva?` y `proporcionGravada?`.
- `packages/shared` `TaxTotals` suma dos opcionales, sin efecto en el calculo propio: `descuento?: number` y `nota_credito_por_referencia?: boolean`. Viajan en `totals_snapshot` (jsonb, sin migracion).

## 2. Mapeo (`cargas.mapeo.ts`)

- `itemsYTotales` sigue armando las lineas como hoy (cantidad y precio del archivo, IVA por tasa).
- `comprobanteAFactura`:
  - **RN-05:** con `tipo_documento` distinto de `FACTURA`, `logger.warn` y `null`.
  - **RN-01:** con `detalle.totales`, `totals = { subtotal: bruto, total_sin_iva: total - iva_total, iva_5, iva_10, total_iva: iva_total, total, descuento }`. Sin aviso de diferencia (RN-04).
  - `nota_credito_por_referencia = true` si `totales.descuento > 0`, `totales.anticipo > 0`, `totales.exonerada > 0`, o alguna linea trae `afectacionIva` `EXONERADO` o `GRAVADO_PARCIAL` o `descuento > 0`.
  - **RN-02:** sin `detalle.totales`, como hoy. Si las lineas traen descuento o afectacion (FE intermedia sin totales), igual marca `nota_credito_por_referencia`.

## 3. Nota de credito (RN-07 y RN-08)

- Mapeo: `totals.anticipo` con `totales.anticipo` cuando es mayor que cero.
- `FiscalEmitNotaCreditoRequest.por_referencia?: boolean`. El armado del pedido desde la factura original (el mismo que usa el reintento) lo pone en `true` con `totals.nota_credito_por_referencia`.
- `RealFiscalGateway.emitNotaCredito`: con `por_referencia`, `POST {base}/nota-credito/total` con el mismo cuerpo sin `receptor` ni `items`; misma lectura de la respuesta y del `409` idempotente. Los errores siguen por `clasificarRespuestaNotaCredito`.
- `facturas.service.ts`: con `totals.anticipo > 0`, `getNotaCreditoIneligibility` devuelve "Esta factura tiene anticipo: la nota de credito se gestiona con soporte." y `emitNotaCreditoTotal` responde `409` con `reason: NOTA_CREDITO_CON_ANTICIPO` antes de llamar a FE.
- `main.tsx`: `canEmitNotaCredito` en `false` solo con anticipo, con el aviso junto al boton.
- Implementacion previa a `rc4.13` (commit `beffd18`): bloqueaba toda factura marcada; se reemplaza.

## 4. Contrato propio

Sin rutas nuevas. `spec/openapi.yaml`: en el esquema de totales del documento, los dos campos opcionales.

## 5. Pruebas

- Unitarias de `comprobanteAFactura`: con totales (descuento, exonerado), sin totales, tipo distinto de factura, lineas con descuento sin totales.
- Servicio: candidata no elegible y `409` en `emitNotaCreditoTotal` con la marca; sin marca, igual que hoy.
- Mock de cargas: `detalleMock` suma `totales` cuando la referencia trae `DESC` (descuento) o `EXON` (exonerado), para probar el recorrido completo.
- Conjunta en SIFEN test cuando FE publique el tag con `detalle.totales` (CA-05).
