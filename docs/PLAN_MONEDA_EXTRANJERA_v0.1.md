# PLAN Moneda Extranjera En La Factura Manual v0.1

**Fecha:** 2026-11-10 · **SPEC:** `docs/SPEC_MONEDA_EXTRANJERA_v0.1.md`

Se implementa despues del commit de FS-51 (sesion `nuevo-repo-11`), que toca los mismos archivos de facturas, gateway, `main.tsx` y openapi y toma la migracion `0041`.

## 1. Calculo (`packages/shared`)

- `calculateDocumentTotalsMoneda(lines, decimales)`: con `decimales = 0` delega en `calculateDocumentTotals` (sin cambio para guaranies); con 2, subtotal = `round2(cantidad x precio)`, base = `round2(subtotal x 10/11)` o `x 20/21`, IVA = subtotal - base, exenta sin IVA; totales sumados y redondeados a 2 decimales. Solo presentacion (SPEC RN-03).
- `formatMonto(valor, moneda)`: "Gs. 1.234.567" o "USD 1.234,50".

## 2. Base (`db/migrations/0042_moneda_extranjera.sql`)

- `facturas_operativas.moneda text not null default 'PYG'` y `tipo_cambio numeric(18,4)` null; check `moneda ~ '^[A-Z]{3}$'`.
- `factura_items_snapshot`: `precio_unitario`, `subtotal`, `base_imponible`, `iva_monto` a `numeric(18,2)` (el cast desde entero no pierde nada; el repositorio ya lee con `Number`).

## 3. API

- `FacturaPreviewInput` suma `moneda?` y `tipo_cambio?`; zod: `moneda` en `PYG | USD | EUR | BRL`, `tipo_cambio` > 0 con hasta 4 decimales y obligatorio fuera de PYG; precios con hasta 2 decimales solo fuera de PYG.
- `previewFactura` usa el calculo de 1 segun la moneda.
- Persistencia de `moneda` y `tipo_cambio`; `DocumentoResponse` los expone.
- Gateway real: `moneda` y `tipoCambio` en `POST /v1/factura` solo fuera de PYG; pago contado por el total en la moneda.
- NC (D-1, FE `segel-rc4.27`): con `moneda <> 'PYG'` el pedido va por referencia (`por_referencia`, `POST /v1/nota-credito/total`), FE toma moneda y tipo de cambio de la factura; la NC se guarda con la `moneda` y el `tipo_cambio` de su factura. Variable `FE_NC_MONEDA_EXTRANJERA` (por omision `false`): con FE anterior a `rc4.27` sigue el bloqueo (`409`, `reason: NOTA_CREDITO_MONEDA_EXTRANJERA`).
- Recibo (D-2): el recibo creado desde una factura en moneda extranjera lleva su moneda en mayusculas.
- `GET /me/context` expone `nc_moneda_extranjera_habilitada` (`FE_NC_MONEDA_EXTRANJERA`); la ficha habilita la NC de una factura en moneda extranjera solo con esa bandera, y sin ella muestra el aviso de soporte.
- Pantalla de recibos: lista, ficha, formulario y verificacion publica muestran el importe con `formatMonto(importe, moneda)`; fuera de PYG el formulario admite 2 decimales y conserva la moneda al editar. `ReciboVerificacionResponse` suma `moneda`.

## 4. Pantalla (`main.tsx`)

- Editor: selector de moneda y campo de tipo de cambio; precios con decimales fuera de PYG; con moneda extranjera, el articulo de catalogo no completa el precio.
- `formatMonto` en lista, tabla, ficha, nota de credito y popups; columna Moneda real.
- Ficha: nota de credito oculta con el aviso de D-1 en moneda extranjera.

## 5. Contrato propio

`spec/openapi.yaml`: `moneda` y `tipo_cambio` en preview, emision y `DocumentoResponse`; `409 NOTA_CREDITO_MONEDA_EXTRANJERA`.

## 6. Pruebas

- Unitarias: calculo en 2 decimales, validaciones, payload a FE con y sin moneda, bloqueo de NC.
- Playwright con FE `segel-rc4.25` en SIFEN test: factura contado y credito en USD aprobadas, montos en USD en lista y ficha, editor sin tipo de cambio bloqueado, factura en Gs sin cambios; 1440, 1280 y 390.

## 7. Alineacion con los ultimos contratos de FE (SPEC A-1, A-2; D-6 confirmada)

### 7.1 Cantidad con hasta 4 decimales (A-1, MON-008)

- `packages/shared/src/money/tax.ts`, `calculateTaxLine`: hoy `assertPositiveInteger(line.cantidad)` y `subtotal = cantidad x precio` sin redondeo. Cambio: la cantidad debe ser mayor que cero con hasta 4 decimales (nueva `assertCantidad`, tolerancia `1e-9`); `subtotal = Math.round(cantidad x precio_unitario)` (entero en guaranies, como arma FE el total; misma regla que `itemsYTotales` en `cargas.mapeo.ts`). Base e IVA siguen saliendo del subtotal. El comportamiento con cantidad entera no cambia (el redondeo de un entero es el mismo entero): las pruebas existentes deben seguir verdes sin tocarlas.
- `moneda.ts`, `calculateDocumentTotalsMoneda`: ya convierte el precio a centavos; con cantidad decimal el subtotal en centavos se redondea dentro de `calculateTaxLine`. Agregar prueba: USD, cantidad 1,5 x 150,25 = 225,38 (225,375 redondea arriba), IVA 10 = 20,49.
- `apps/api/src/modules/facturas/facturas.routes.ts`, `facturaPreviewSchema`: `cantidad: z.coerce.number().positive()` con `superRefine` de hasta 4 decimales (mensaje "cantidad admite hasta 4 decimales"); sin cambio de tipo en `FacturaPreviewInput` (`number`).
- Base: `factura_items_snapshot.cantidad` ya es `numeric(18,6)`; el repositorio lee con `Number`. **Sin migracion.**
- Pantalla (`main.tsx`, `InvoiceEditor`): el campo Cantidad pasa de `normalizeIntegerInput` a una `normalizeDecimalInput(valor, 4)` (generalizar la actual, que fija 2 decimales, con un parametro de decimales); los botones +/- siguen sumando 1; `inputMode="decimal"`; se muestra con coma. `precioValido` se complementa con `cantidadValida(valor)` (> 0, hasta 4 decimales) en el boton de agregar linea y en el calculo del subtotal. La cantidad se muestra en lineas, ficha y tabla con hasta 4 decimales sin ceros de relleno ("1,5", "2").
- `spec/openapi.yaml`: `cantidad` en `FacturaPreviewRequest.items[]` pasa de `integer` a `number` con `multipleOf: 0.0001` y descripcion (MT150 E711).
- Pruebas: unitarias de `tax.ts` (cantidad 0,5 en PYG: 0,5 x 100.001 = 50.001 redondeado; 1,00005 rechazada), `moneda.schema.test.ts` (cantidad 1,5 acepta, 1,00005 rechaza con 400), `facturas.service` preview con cantidad decimal.

### 7.2 Totales oficiales de FE (A-2, MON-009)

- Tipo: `packages/shared/src/money/tax.ts`, `TaxTotals` suma opcionales `fuente?: "FS" | "FE"`, `total_guaranies?: number`, `redondeo?: number`. Sin `fuente` se interpreta `FS` (documentos anteriores).
- Gateway: `FiscalGateway.getDocumentoTotales(documentUuid): Promise<FiscalDocumentoTotalesResponse>` con `{ moneda, tipo_cambio, totales: FeDetalleTotales, total_guaranies, raw }` (`fiscal-gateway.types.ts`). Cliente HTTP: `GET {baseUrl}/documentos/{uuid}/totales?env=` con `buildHeaders()` (clave compartida, mismo grupo que `/sifen`; FE seccion 35). 404 `XML_NOT_AVAILABLE` se devuelve como `FiscalGatewayError("UPSTREAM_ERROR")` y el llamador lo trata como "todavia no". `MockFiscalGateway`: devuelve los totales del documento guardado, convertidos al formato de FE, con `total_guaranies = round(total x tipo_cambio)` (o el total en PYG), para que el flujo local sea el mismo.
- Mapeo FE -> `TaxTotals` (funcion pura `totalesDesdeFe(fe, moneda)` en `facturas.service.ts` o modulo propio, con prueba): `subtotal = bruto`, `total = total`, `iva_10`, `iva_5`, `total_iva = iva_total`, `total_sin_iva = total - iva_total`, `descuento`, `anticipo` (solo si > 0, como hoy en la carga), `redondeo`, `total_guaranies`, `fuente: "FE"`; se conserva `nota_credito_por_referencia` del valor previo. Evidencia de que `gravada_10` de FE es base sin IVA: `fiscal-gateway.mock-cargas.ts` (81818 + 8182 = 90000); no se usa para `total_sin_iva` por si cambia.
- Persistencia: `FacturaRepository.updateTotals({ facturadorId, documentoId, totals })` escribe `totals_snapshot` (jsonb) y `updated_at`; no toca estado ni agenda. Si la moneda de FE difiere de la guardada, se registra `warn` y no se pisa (no deberia pasar).
- Punto de enganche: `refreshFiscalStatusForDocumento` (`facturas.service.ts`), despues de `updateFiscalStatus`: si `estadoFinal === "EMITIDA"`, `documento.tipo` es `FACTURA` o `NOTA_CREDITO` y `updated.totals.fuente !== "FE"`, llama a `getDocumentoTotales(documentUuid)` y `updateTotals`; cualquier error se registra con `logger.warn` y la funcion devuelve `updated` igual. Cubre el worker (`verificacion.worker.ts`, `processOne`) y el boton "Verificar estado fiscal" (`POST /facturas/:documentoId/refresh-status`). Tambien al crear una emision que FE responde `APPROVED` en el acto (`completePendingEmission`): mismo intento, misma tolerancia a fallos.
- Reintento: un documento `EMITIDA` con `fuente` distinta de `FE` vuelve a intentarlo en cada refresco manual; el worker ya no lo agenda (estado terminal). Es suficiente: la aprobacion siempre pasa por un refresco, y si ese `/totales` fallo, el operador puede verificar de nuevo.
- Pantalla: la ficha y la tabla ya muestran `totals.total`; con `fuente: "FE"` y moneda distinta de PYG, la ficha agrega "Equivale a Gs. {formatGuaranies(total_guaranies)}" junto al tipo de cambio. Sin otra marca visible.
- `spec/openapi.yaml`: `DocumentoTotals` suma `fuente`, `total_guaranies`, `redondeo` con descripcion.
- Pruebas: `totalesDesdeFe` (USD con descuento 0; PYG con redondeo), `refreshFiscalStatusForDocumento` guarda totales al pasar a `EMITIDA` y no falla si `/totales` lanza, no vuelve a consultar con `fuente: "FE"`; mock y cliente HTTP (`contrato-fe-sobrecarga` o prueba propia del gateway con `fetch` simulado).

## 8. Selector Guarani / Dolar y cambio de moneda (SPEC D-4, RN-08; MON-011)

- `main.tsx`: `MONEDAS_FACTURA` del editor queda en `[PYG, USD]` con sus etiquetas; `monedasFactura` de `packages/shared` no cambia (la API sigue aceptando EUR y BRL; una factura guardada en EUR se muestra igual con `formatMonto`).
- Al cambiar la moneda (`setMoneda`): si `moneda === "PYG"`, `setTipoCambio("")`; se recalculan `precioValido`/`cantidadValida` de todas las lineas con la moneda nueva; las lineas invalidas se marcan en la lista (clase `line-invalid` y texto "Precio con decimales: no valido en guaranies") y "Crear factura" queda deshabilitado mientras existan; un aviso bajo el selector dice "Los montos no se convierten: revisa los precios". No se borra ninguna linea.
- Playwright (`playwright-moneda-extranjera.cjs`, escenario nuevo CA-11 y CA-12): cargar una linea USD 150,25, volver a PYG, comprobar aviso y boton deshabilitado, corregir a 150000 y crear; comprobar que el selector tiene exactamente dos opciones.

## 9. Orden de implementacion y dependencias

1. MON-008 (cantidad) y MON-011 (selector) no dependen de nada: primero.
2. MON-009 (totales de FE) despues: la NC parcial y el editor PC usan `fuente`/`total_guaranies`.
3. `SPEC_NOTA_CREDITO_PARCIAL_v0.1` (NCP-*) despues de MON-008 (cantidades decimales en las lineas de la nota) y MON-009.
4. `SPEC_EDITOR_FACTURA_PC_v0.1` (EPC-*) al final: usa la grilla con cantidad decimal y el selector de dos monedas.
5. Merge de `feat/moneda-extranjera` a `feat/identidad-segel` tras el commit de FS-51; despliegue con FE `segel-rc4.30` y `FE_NC_MONEDA_EXTRANJERA=true` solo con pedido del usuario (D-3).
