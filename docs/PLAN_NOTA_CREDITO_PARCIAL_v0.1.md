# PLAN Nota De Credito Parcial Con Lineas v0.1

**Fecha:** 2026-11-10 · **SPEC:** `docs/SPEC_NOTA_CREDITO_PARCIAL_v0.1.md` · Se implementa despues de MON-008 (cantidad decimal) y MON-009 (totales de FE) de `PLAN_MONEDA_EXTRANJERA_v0.1.md`, en la rama `feat/moneda-extranjera`.

## 1. Tipos y validacion (`apps/api/src/modules/facturas`)

- `facturas.types.ts`: `NotaCreditoEmitInput { motivo: string; lineas?: Array<{ line_no: number; cantidad: number }> }`; `NotaCreditoPersistInput` suma `items: FacturaItemPreview[]` y `totals: TaxTotals` de la nota (hoy se copian de `original`). `DocumentoResponse` no cambia (la nota ya tiene `items`, `totals`, `moneda`, `tipo_cambio`, `documento_relacionado_id`).
- `facturas.routes.ts`, `notaCreditoSchema`: `lineas: z.array(z.object({ line_no: z.number().int().positive(), cantidad: z.number().positive() })).min(1).optional()` con `superRefine` de 4 decimales y sin `line_no` repetido.

## 2. Servicio (`facturas.service.ts`)

- `saldoAcreditablePorLinea(original, notas)`: mapa `line_no -> cantidad facturada - suma(cantidad en notas con estado != RECHAZADA)`. Prueba unitaria propia.
- `emitNotaCreditoTotal` pasa a `emitNotaCredito(context, facturaId, input, repository, gateway)`; con `input.lineas`:
  1. carga la factura y sus notas (`findNotasCreditoByOriginal`);
  2. RN-03 (`nota_credito_por_referencia` -> 409 `NOTA_CREDITO_SOLO_TOTAL`), RN-04 (bandera), D-2 (nota trabada -> reintento como hoy);
  3. RN-01 y RN-06 contra el saldo; `400` con `details.lineas[]`;
  4. arma las lineas de la nota: para cada `line_no`, el item de la factura con `cantidad` acreditada; `calculateDocumentTotalsMoneda(lineas, original.moneda)` da `items` y `totals`;
  5. `buildFiscalNotaCreditoRequest` recibe `items` y `totals` de la nota (hoy toma `original.items`/`original.totals`) y nunca `por_referencia`; suma `moneda` y `tipo_cambio` del original cuando no es PYG;
  6. `llamarNotaCredito` sin cambios; RN-05: en `mapFiscalGatewayError` (o en el `catch` local) `CREDIT_NOTE_TOTAL_EXCEEDED` e `INVALID_REFERENCED_DOCUMENT` -> `409` con `details.fe_code`;
  7. `createNotaCreditoFromFactura` con `items`/`totals` de la nota.
- Sin `lineas`: RN-07 (nota viva -> 409 con el mensaje actual), despues el flujo actual sin cambios.
- `getNotaCreditoIneligibility` y `listNotaCreditoCandidates`: `creditedFacturaIds` pasa a un mapa `facturaId -> { vivaTrabada, saldoTotal }`; una factura con saldo sigue elegible y la respuesta de candidatas suma `saldo_acreditable: { lineas: [{ line_no, cantidad_facturada, cantidad_acreditada, saldo }] }` para pintar la ventana (o se expone en `GET /facturas/:id` como `nota_credito_saldo`; elegir una y documentarla en openapi).

## 3. Gateway (`fiscal-gateway.types.ts`, `fiscal-gateway.client.ts`)

- `FiscalEmitNotaCreditoRequest` suma `moneda?: string` y `tipo_cambio?: number | null`.
- `buildEmitirNotaCreditoPayload`: `payload.moneda` y `payload.tipoCambio` solo fuera de PYG (misma regla que `buildEmitirFacturaPayload`); `items` ya se mapean desde `request.items` (cantidad decimal pasa tal cual).
- `MockFiscalGateway.emitNotaCredito`: aprobada como hoy; marcador `[FE-2417]` en el motivo para simular `CREDIT_NOTE_TOTAL_EXCEEDED` (422) y probar RN-05 en local.

## 4. Repositorio (`facturas.repository.ts`)

- `createNotaCreditoFromFactura`: inserta `input.items` (en vez de `input.original.items`) y `input.totals`; `moneda` y `tipo_cambio` del original (ya hecho). Sin migracion.

## 5. Pantalla (`main.tsx`)

- `reasonModal` para `CREDIT_NOTE_DETAIL` y `CREDIT_NOTE_LIST` suma el alternador Total / Parcial y, en Parcial, la tabla de lineas (casilla, descripcion, facturada, acreditada, "a acreditar" con `normalizeDecimalInput(valor, 4)`), total de la nota con `formatMonto` y el motivo. "Confirmar" envia `{ motivo, lineas }`.
- `canEmitNotaCredito` deja de mirar "ya tiene nota": usa `saldo_acreditable` (si hay saldo, habilitado); el aviso de moneda extranjera y el de anticipo siguen.
- Ficha de la factura: seccion "Notas de credito" con numero, estado, total y enlace a cada nota (hoy se infiere desde la lista; usar `findNotasCreditoByOriginal` expuesto en `GET /facturas/:id/notas-credito` o incluido en la respuesta de la ficha; documentar en openapi).

## 6. Contrato propio (`spec/openapi.yaml`)

- `NotaCreditoRequest` (cuerpo de `POST /facturas/{documentoId}/nota-credito`): `lineas[]` opcional; respuestas `400` (saldo), `409` con `reason` `NOTA_CREDITO_SOLO_TOTAL`, `NOTA_CREDITO_MONEDA_EXTRANJERA` y `details.fe_code`.
- `saldo_acreditable` en candidatas o en la ficha segun 2.

## 7. Pruebas

- Unitarias: saldo por linea; emision parcial arma lineas y totales correctos en USD y PYG; rechazos RN-01, RN-03, RN-04; traduccion RN-05 con el mock `[FE-2417]`; elegibilidad con saldo; la total sigue igual (pruebas existentes verdes).
- Playwright `scripts/segel-fs/playwright-nota-credito-parcial.cjs`: CA-01 a CA-07 contra el stack local de Segel con FE `segel-rc4.30` en SIFEN test, `FE_NC_MONEDA_EXTRANJERA=true`; 1440, 1280 y 390.
