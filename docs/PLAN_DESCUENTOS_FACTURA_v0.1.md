# PLAN - Descuentos en la factura v0.1

SPEC: `docs/SPEC_DESCUENTOS_FACTURA_v0.1.md` · TASKS: `docs/TASKS_DESCUENTOS_FACTURA_v0.1.md`.

Principio: FS reproduce el calculo y la validacion de FE (§43, §50 de la guia v0.49 y `factura.schema.ts` de `segel-rc4.32`) antes de numerar; los totales oficiales siguen siendo los de `GET /v1/documentos/{uuid}/totales`. Nada de FE cambia.

## Base y despliegue

- Migracion nueva `db/migrations/0047_descuentos_factura.sql` (el numero se confirma al implementar; la ultima es `0045_backfill_perfil_documentos.sql`):
  - `alter table factura_items_snapshot add column descuento numeric(18,2) not null default 0, add column descuento_global numeric(18,2) not null default 0;`
  - constraint `factura_items_snapshot_descuento_check check (descuento >= 0 and descuento_global >= 0)`.
  - Sin cambios en `facturas_operativas`: `descuento`, `descuento_global` y `nota_credito_por_referencia` viajan en `totals_snapshot` (jsonb), donde ya viven `descuento`, `anticipo` y `nota_credito_por_referencia` de las facturas de carga.
  - El default 0 deja las facturas existentes sin cambio de significado: `subtotal` de la linea sigue siendo `cantidad × precio` cuando no hay descuento (RN-06).
- Variables de entorno: ninguna nueva. No se pone bandera: una factura sin descuentos es identica a la de hoy (RN-05).
- Despliegue en `segel-fs`: imagen de API (migracion `0047`, `migrate`) y de frontend; solo con orden directa del usuario, con respaldo previo como en `docs/TASKS_DESPLIEGUE_SEGEL_FS_v0.2.md` E-6.

## Calculo compartido (`packages/shared`)

- `packages/shared/src/money/tax.ts`:
  - `TaxInputLine` suma `descuento?: number` (por unidad, por omision 0).
  - `TaxCalculatedLine` suma `descuento: number` y `descuento_global: number` (monto prorrateado a la linea).
  - `TaxTotals` suma `descuento_global?: number`; `descuento?` deja de ser "solo en carga" y pasa a ser el total de descuentos (RN-05) cuando hay alguno.
  - Nueva `calculateDocumentTotalsConDescuento(lines, descuentoGlobal)` (o parametro opcional de `calculateDocumentTotals`; se decide al implementar segun cuantos llamadores hay: `previewFactura`, `nota-credito-parcial.ts`, `cargas.mapeo.ts`): valida RN-03 y RN-04 lanzando `Error` con un mensaje que `previewFactura` convierte en `HttpError(400)` con `path`; calcula el prorrateo en enteros (guaranies o centavos) con `BigInt` como hoy `calculateTaxLine`, asigna la diferencia de redondeo a la ultima linea gravada (RN-06, provisional) y devuelve lineas y totales segun RN-05 y RN-06.
  - `calculateTaxLine` recibe el neto de la linea para `base_imponible` e `iva_monto`; el `subtotal` de la linea es el neto tras el descuento por unidad menos el prorrateo del global.
- `packages/shared/src/money/moneda.ts`: `calculateDocumentTotalsMoneda` pasa `descuento` y `descuento_global` a centavos y los devuelve en unidades, como hace con `precio_unitario`; valida sus decimales con `tieneDecimalesValidos` (RN-02).
- Pruebas: `packages/shared/tests/tax.test.ts` y `packages/shared/src/money/moneda.test.ts` con CA-01, CA-02, CA-03 y la regresion sin descuentos (igualdad campo a campo con el resultado actual).

## API (`apps/api`)

- `facturas.routes.ts`: en `facturaBaseSchema`, `items[].descuento: z.coerce.number().min(0).default(0)` y `descuento_global: z.coerce.number().min(0).default(0)`; en `refinarFactura`, decimales por moneda para los dos campos (RN-02) con los mensajes de la SPEC, y `descuento < precio_unitario` por linea (RN-03) con `path: ["items", i, "descuento"]`.
- `facturas.types.ts`: `FacturaItemInput.descuento?`, `FacturaPreviewInput.descuento_global?`; `FacturaItemPreview` hereda `descuento` y `descuento_global` de `TaxCalculatedLine`.
- `facturas.service.ts`:
  - `previewFactura`: pasa `descuento` por linea y `descuento_global` al calculo; traduce el error de RN-04 a `HttpError(400, "VALIDATION_ERROR", mensaje, { path: ["descuento_global"] })`.
  - Creacion: si alguna linea tiene `descuento > 0` o `descuento_global > 0`, `totals.nota_credito_por_referencia = true` (RN-09) antes de guardar.
  - `totalesDesdeFe`: conserva `descuento_global` de `previos` al mezclar los totales de FE (RN-08); `descuento` queda el de FE.
  - `validarTopeInnominado` sigue usando `totals.total` (ya neto).
- `facturas.repository.ts`: las tres inserciones en `factura_items_snapshot` (lineas ~579, ~721, ~899) escriben `descuento` y `descuento_global`; las lecturas (`~1726`, `~1767`) las devuelven en los items.
- `fiscal-gateway.client.ts`: `buildEmitirFacturaPayload` agrega `descuento` al item cuando `> 0` y `descuentoGlobal` al payload cuando `> 0` (RN-07). `FiscalEmitFacturaRequest.items[]` y el request suman los campos en `fiscal-gateway.types.ts`. `buildEmitirNotaCreditoPayload` no cambia (la NC con descuento va por `/nota-credito/total`, RN-09).
- Mock de FE (`fiscal-gateway.client.ts`, modo mock): `registrarTotalesMock` guarda `bruto`, `descuento` y `total` del request para que `getDocumentoTotales` devuelva totales coherentes con descuento (CA-05, CA-06). `emitFactura` del mock responde `422`-equivalente (`FiscalGatewayError` de validacion) si recibe `descuento >= precioUnitario`, para probar RN-10 sin FE real.
- `spec/openapi.yaml` (RN-11).
- Pruebas (vitest, `apps/api/tests`): `facturas.preview` con CA-01/CA-02/CA-03; `totales-fe.test.ts` con `descuento_global` conservado; gateway con el payload de CA-01 (`descuento`, `descuentoGlobal`, `pagos[0].monto`); NC parcial `409` y total por referencia sobre una factura con descuento (CA-05).

## Web (`apps/web-operacion`)

- `tipos.ts`: `InvoiceLineDraft` suma `descuento_ingresado: string` y `descuento_modo: "PORCENTAJE" | "MONTO"`; `FacturaItemInput.descuento?`, `FacturaPreviewRequest.descuento_global?`; `FacturaPreviewResponse.items[]` y `totals` suman los campos.
- `main.tsx` (editor):
  - estado nuevo `descuentoGlobal: string` y `descuentoModoGrilla` (RN-13); `request` (useMemo) convierte porcentaje a monto por unidad con `redondearAMoneda(precio × pct / 100, moneda)` y agrega `descuento` por linea y `descuento_global`; `lineasInvalidasIds` incorpora RN-16.
  - `GrillaLineas`: columna "Descuento" con `input.cifra`, conmutador en el `th` (dos botones `aria-pressed`, como los de modo simple/completo), `aria-label` "Descuento, línea N"; "Subtotal" con el neto (RN-17). `lineaTieneDatos` considera el descuento.
  - Hoja del modo simple: campo "Descuento" con conmutador (RN-14).
  - Seccion "Productos o servicios": campo "Descuento sobre el total" con `field-hint` (RN-15) y el error de RN-04 debajo.
  - Totales (`TotalRow`): fila "Descuento" en negativo cuando `> 0` (RN-18), en la tarjeta fija y en la seccion del modo simple.
  - `lib/borradores.ts`: persistir y restaurar los campos nuevos (RN-21).
- `components/ResultadoEmision.tsx` y `views/DocumentsView.tsx` (ficha): columna y fila "Descuento" condicionales (RN-19).
- `styles.css`: ancho de `.col-descuento` en `.grilla-lineas` (misma regla de la columna Precio) y el conmutador compacto en el encabezado; sin colores nuevos (tokens de `PAUTAS_FRONTEND_v0.1`).
- Cierre con la lista §12 de `docs/PAUTAS_FRONTEND_v0.1.md`.

## Pruebas

1. Unitarias: `npm run test` en `packages/shared` y `apps/api` con los casos de la SPEC; `npm run typecheck` y `npm run lint`.
2. Frontend: `npm run typecheck`, `npm run build`.
3. Stack local `.local/segel-ensayo` reconstruido con `desplegar.sh` (API y frontend del mismo commit, `X-App-Version`).
4. Playwright nuevo `scripts/segel-fs/playwright-descuentos.cjs` con casos `grilla` (CA-07, 1440 y 1280), `simple` (CA-08, 390), `resultado` (CA-09, contra el mock: `FE_GATEWAY_MODE=mock` en un stack de prueba o interceptando `POST /facturas` como hace `playwright-ajustes-textos.cjs`), `validacion` (CA-07 ultima parte y RN-04). Capturas en `test-results/descuentos/`.
5. Regresion: `playwright-ux-nueva-factura.cjs` **no** (emite en SIFEN test; se cubre en el paso 6), `playwright-editor-pc.cjs`, `playwright-moneda-extranjera.cjs` (casos que no emiten), `playwright-nota-credito-parcial.cjs`, `playwright-reconocimiento-ux.cjs` sin aumentos.
6. SIFEN test (CA-10): una factura `PYG` con descuento por linea y global desde el stack local contra FE real, **con aviso previo a la sesion de FE** (`facturacion-electronica-7c`); verificar `GET /totales` y el KUDE. Una en USD si FE lo confirma para esa clave.
7. Evidencia en `TASKS_DESCUENTOS_FACTURA_v0.1.md`: escenarios, anchos, resultado.

## Riesgos

- **Diferencias de redondeo entre FS y FE.** El prorrateo del global y el IVA por linea pueden diferir en centavos o guaranies entre la vista previa y el XML. Mitigacion: los totales oficiales son los de FE y se guardan al aprobar (RN-08); la vista previa dice "Totales estimados" solo si la diferencia observada en SIFEN test supera 1 unidad (se decide con la evidencia de CA-10).
- **Cambio de significado de `subtotal` por linea** (pasa a neto). Solo afecta a facturas con descuento; sin descuento es identico. Las notas de credito parciales no leen lineas con descuento (RN-09). Revisar `nota-credito-parcial.ts` y `ResultadoEmision` para que no sumen `subtotal` esperando el bruto.
- **`nota_credito_por_referencia` en facturas manuales.** Hoy la bandera solo la ponen las facturas de carga; `emitNotaCreditoTotal` por referencia debe funcionar igual con una factura manual (misma ruta de FE `/nota-credito/total`). Probar en CA-05 con el mock y en CA-10 contra FE real si el tiempo alcanza.
- **Contado con descuento:** `pagos[0].monto` debe ser el total neto; si se mandara el bruto, FE rechaza por pagos distintos del total. Cubierto en la prueba del gateway.
- **Plazo.** Es la cadena mediana de las tres criticas; depende de que DP-1 se cierre con FE antes de `DES-002`.

## Coordinacion con FE

Preguntas hechas y respondidas por la sesion de FE el 2026-11-11 (xmlgen 1.0.277, la misma version en `segel-fs`, el FE local y el lockfile):

1. **Reparto del global.** Lo hace xmlgen por peso sobre el bruto, 8 decimales por unidad, sin asignar la diferencia a ninguna linea; `dTotOpe` sale de la formula directa. Registrado en la SPEC (Contrato de FE, RN-04, RN-06).
2. **Base e IVA por item.** Primero la base (`neto / 1,1` o `/ 1,05`), despues el IVA (`base × tasa / 100`), 8 decimales con `toFixed`. Registrado en RN-06. `packages/shared` reproduce esa secuencia; las pruebas usan los vectores USD y PYG de la SPEC.
3. **USD con descuentos en la clave de prueba.** Si: `segel-fs-5057016` tiene `FACTURA_EMIT` y moneda y descuentos son campos del request. Avisar a FE antes de emitir.
4. **Pagos en contado.** FE solo exige suma > 0; FS manda `pagos[0].monto = total` sin redondear (`dTotOpe`), como §43.3 y los ejemplos aprobados.

Pendiente de verificar en SIFEN test (CA-10): una factura **PYG con descuento global que no divide exacto** (xmlgen deja `dSub10`, bases e IVA con decimales en el XML). FE no tiene ninguna aprobada asi; FS la emite en SIFEN test con aviso previo y le pasa el resultado a FE, que lo registra de su lado. Si SIFEN la rechaza, la cadena se detiene en PYG hasta que FE decida como redondea por item, y sigue solo con montos que dividan exacto o con USD.

## Refinamiento del 2026-11-12: desglose de descuentos en los totales (RN-18b, RN-19b, RN-23)

Sin cambios en la API ni en `packages/shared`: `totals.descuento` (total) y `totals.descuento_global` ya llegan en la vista previa, en el documento y en los totales oficiales de FE (RN-08). El de linea sale por diferencia.

- `apps/web-operacion/src/lib/descuentos.ts` (nuevo): `desgloseDescuentos(totals)` devuelve las filas de RN-18b en orden (`{ etiqueta, monto, cierre }`): "Descuento por línea", "Descuento sobre el total" y "Total descuentos" segun que montos sean mayores que cero; `porcentajeDescuento(descuento, subtotal)` arma el texto "12 %" / "3,1 %" (una funcion pura, con pruebas de los cuatro casos de CA-12 y los dos de CA-13 en `apps/web-operacion/src/lib/descuentos.test.ts` si el paquete tiene vitest; si no, se cubre con Playwright).
- `components/TotalRow.tsx`: `FilasDescuento({ totals, moneda })` que pinta las filas con `TotalRow` (`resta`; la fila de cierre con la clase `resta cierre`). Reemplaza las dos lineas `{(preview?.totals.descuento ?? 0) > 0 ? <TotalRow label="Descuento" .../> : null}` de `main.tsx` (tarjeta fija y seccion del modo simple).
- `components/ResultadoEmision.tsx` y `views/DocumentsView.tsx`: el mismo desglose con sus marcas propias (`div > span/strong` y `dl > dt/dd`), usando `desgloseDescuentos`.
- `styles.css`: `.total-row.resta` con etiqueta y monto en `--color-muted`; `.total-row.resta.cierre` en `--color-ink`. Sin colores nuevos.
- Diseno: artboard "05 · Totales con descuentos" en el canvas de Nueva factura (https://claude.ai/artifact/3rYTQDeomdn88HLVrfPdQF) con las tres variantes (solo linea, solo global, los dos) y la nota de la decision D-6.
- Playwright: `scripts/segel-fs/playwright-descuentos.cjs` caso nuevo `desglose` (CA-12, 1440/1280/390) y `verificar` ampliado con las filas de la ficha (CA-13); `grilla` y `simple` actualizan sus aserciones ("Total descuentos (20 %) − Gs. 50.000" y "Descuento por línea (15 %) − Gs. 15.000"). Regresion: `playwright-reconocimiento-ux.cjs` sin aumentos; `npm run typecheck` y `npm run build` del frontend; stack local reconstruido con API y frontend del mismo commit.
- Produccion: queda para un despliegue posterior con orden del usuario (regla de oro de `AGENTS.md`); no entra en `segel-fs-2026.11.12`.
