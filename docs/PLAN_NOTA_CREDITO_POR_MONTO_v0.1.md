# PLAN Nota De Credito Parcial Por Monto v0.1

**Fecha:** 2026-11-12 · **SPEC:** `docs/SPEC_NOTA_CREDITO_POR_MONTO_v0.1.md` · **Rama:** `feat/identidad-segel` · Contra FE `segel-rc4.34` (sin cambios de FE: §67 es solo documentacion).

## 1. Funcion pura compartida (`packages/shared/src/money/nota-credito-monto.ts`)

- `montosPorTasa(totales)`: `{ iva_10: gravada_10 + iva_10, iva_5: gravada_5 + iva_5, exenta: exenta + exonerada }`.
- `repartirMontoPorTasa(monto, tasas, moneda)`: devuelve `Array<{ iva_tipo: "IVA_10" | "IVA_5" | "EXENTA"; importe }>` en el orden 10 %, 5 %, exento; redondeo a entero en PYG y a 2 decimales en otra moneda (sumas escaladas a enteros para no acumular error); omite partes 0; la diferencia va a la ultima linea. Suma de tasas 0 -> `[]`.
- `validarMontoNotaCredito(monto, moneda)`: `null` o el mensaje (RN-01).
- Exportado desde `packages/shared/src/index.ts`. Prueba unitaria con el ejemplo de FE (100.000 -> 68.432 / 20.065 / 11.503) y un caso USD.

## 2. Migracion `db/migrations/0050_nota_credito_por_monto.sql`

- `alter table facturas_operativas add column if not exists nce_modo text`, `add column if not exists nce_motivo_codigo smallint`. `null` en las notas existentes (se leen como antes: total o lineas segun `esNotaParcial`). Check: `nce_modo in ('TOTAL','LINEAS','MONTO')`.

## 3. Tipos y repositorio (`apps/api/src/modules/facturas`)

- `facturas.types.ts`: `DocumentoResponse` suma `nce_modo: "TOTAL" | "LINEAS" | "MONTO" | null` y `nce_motivo_codigo: number | null`; `NotaCreditoPersistInput` suma `modo?` y `motivoCodigo?`.
- `facturas.repository.ts`: columnas en el `select` comun (`COLUMNAS_DOCUMENTO`), en el `insert` de `createNotaCreditoFromFactura` y en el mapeo de fila. La total guarda `TOTAL`, la parcial `LINEAS`, la nueva `MONTO`.

## 4. Gateway

- `FiscalEmitNotaCreditoRequest.motivo_codigo?: number` (default 1). `buildEmitirNotaCreditoPayload`: `motivo.codigo = request.motivo_codigo ?? 1`. Items ya se mapean por `codigo`, `descripcion`, `cantidad`, `precioUnitario`, `ivaTipo`.
- Mock `getDocumentoTotales`: guarda al emitir el neto por tasa sumando las lineas del pedido y responde `gravada = neto de la tasa − IVA` y `exenta` (antes dejaba exenta en 0 y aproximaba la gravada con `IVA × 10`, que deja residuos de redondeo).

## 5. Servicio

- `nota-credito-monto.ts` (modulo nuevo, reglas puras de servidor): `notasQueCuentanMonto(notas)` (D-3), `saldoMonto(totalFactura, notas, moneda)` con el residuo D-4, `armarLineasMonto(monto, tasas, moneda, motivoCodigo)` -> `items` (line_no 1..n, codigos y descripciones D-7) y `totals` con `calculateDocumentTotalsMoneda`.
- `nota-credito-parcial.ts`: `saldoAcreditablePorLinea` ignora notas con `nce_modo = 'MONTO'` (RN-07).
- `facturas.service.ts`:
  - `emitNotaCredito`: `input.monto` -> `emitNotaCreditoPorMonto`; `monto` con `lineas` lo rechaza el esquema.
  - `emitNotaCreditoPorMonto(context, facturaId, { motivo, monto, motivo_codigo }, repository, gateway)`: RN-03 (reusa las comprobaciones de la parcial salvo `nota_credito_por_referencia`), trabada -> 409; `gateway.getDocumentoTotales(original.document_uuid)` (D-8: error -> `502 FE_TOTALES_NO_DISPONIBLES`; RN-06 moneda); `guardarTotalesFe` de las notas `EMITIDA` sin `fuente: FE`; saldo (RN-04); reparto (RN-05); `buildFiscalNotaCreditoRequest(..., { items, totals }, motivoCodigo)`; `llamarNotaCredito`; persistir con `modo: 'MONTO'`; `guardarTotalesFe` de la nota.
  - `emitNotaCreditoParcial`: si hay notas `MONTO` vivas, RN-10 contra `original.totals.total`.
  - `buildFiscalNotaCreditoRequest`: parametro `motivoCodigo?`; las notas por monto llevan `moneda`/`tipo_cambio` fuera de PYG como la parcial.
  - `reintentarNotaCredito`: `nce_modo === 'MONTO'` -> items y totales de la nota y `nce_motivo_codigo`.
  - `getNotaCreditoSaldo(context, facturaId, repository, gateway)`: refresca con `guardarTotalesFe` la factura si no tiene totales de FE y, si la factura tiene totales de FE guardados, las tasas salen de una consulta a `/totales` (si falla: `tasas` null, `fuente: 'FS'`); arma `monto` (`admite`, `motivo_no_admite`, `total_factura`, `acreditado`, `saldo`, `tasas`, `fuente`).
  - `listNotaCreditoCandidates`: con notas vivas, una factura queda "acreditada por completo" cuando su saldo neto (totales guardados) es cero (RN-09). Con saldo neto cero no se puede emitir nada; con lineas sin saldo pero residuo neto emitible sigue elegible para una nota por monto.
  - Mensajes: `MENSAJE_NOTA_CREDITO_SUPERA_SALDO`, `MENSAJE_FE_TOTALES_NO_DISPONIBLES`.
- `nota-credito.clasificacion.ts`: el texto de `CREDIT_NOTE_TOTAL_EXCEEDED` pasa a "La suma de las notas de crédito supera el total de la factura." (RN-08; aplica a todos los modos).

## 6. Ruta (`facturas.routes.ts`)

- `notaCreditoSchema`: `monto: z.number().positive().optional()`, `motivo_codigo: z.union([z.literal(3), z.literal(4), z.literal(8)]).optional()`; `superRefine`: `monto` y `lineas` excluyentes; `motivo_codigo` sin `monto` -> error. La regla de 50/decimales depende de la moneda de la factura: va en el servicio (RN-01).
- La ruta de saldo pasa `fiscalGateway`.

## 7. Pantalla (`apps/web-operacion`)

- `tipos.ts`: `NotaCreditoSaldoResponse.monto` y `DocumentoResponse.nce_modo`.
- `lib/notaCreditoMonto.ts` reexporta el reparto y la validacion **desde la fuente** de `packages/shared` (ruta relativa; el frontend no depende del paquete y la imagen ya copia `packages/`), mas los tipos de ajuste y `modoInicialNotaCredito`. Una sola implementacion del reparto para API y pantalla.
- Componente nuevo `components/NotaCreditoPorMonto.tsx` (usado en `CreditNoteView` y en el modal de `DocumentsView`): resumen total/acreditado/saldo, input Monto (`normalizeDecimalInput` con 0 decimales en PYG y 2 en USD), selector Tipo de ajuste, reparto previo con `repartirMontoPorTasa` cuando hay `tasas`, aviso de multiplo de 50 y de saldo. Devuelve `{ monto, motivo_codigo, error }` al padre.
- `CreditNoteView`: `Modo` suma `"MONTO"` ("Un monto"); total a devolver y "queda" con el monto; cuerpo `{ motivo, monto, motivo_codigo }`.
- `DocumentsView`: tercer boton "Por monto" en el selector; el modal arma el mismo cuerpo. Los modos se habilitan con `admite_total`, `admite_parcial` y `monto.admite`; el modo por defecto: Total si se admite, si no Parcial, si no Por monto.
- Pautas: `docs/PAUTAS_FRONTEND_v0.1.md` (componentes existentes `CampoFormulario`, `Aviso`, sin emojis, textos en castellano con tildes).

## 8. Contrato propio (`spec/openapi.yaml`)

- Cuerpo de `POST /facturas/{documentoId}/nota-credito`: `monto`, `motivo_codigo`; `409` con `reason` `NOTA_CREDITO_SUPERA_SALDO`; `502` por totales de FE.
- `NotaCreditoSaldoResponse.monto`; `DocumentoResponse.nce_modo`, `nce_motivo_codigo`.

## 9. Pruebas

- Unitarias (`apps/api/tests/nota-credito-monto.test.ts`): reparto (ejemplo FE, una sola tasa, USD, suma 0), validacion de monto, saldo con notas rechazadas/anuladas/pendientes y residuo; emision por monto con el mock (lineas, `motivo.codigo` en el payload, moneda USD, factura con descuento admitida, saldo excedido sin llamar a FE, 50 Gs, totales de FE caidos -> 502), RN-07 (saldo por lineas ignora MONTO; reintento con su motivo), RN-10, candidatas. Suite completa verde (CA-06).
- Playwright `scripts/segel-fs/playwright-nota-credito-monto.cjs` contra el stack local de Segel (`segel-fs-*` en 18492 con `fe-segel`, SIFEN test): CA-01 a CA-05 y CA-07, 1440/1280/390. Antes, `bash scripts/deploy.sh` del stack local segun la regla de validacion.
