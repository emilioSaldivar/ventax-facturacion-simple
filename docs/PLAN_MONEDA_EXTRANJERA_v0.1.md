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

## 7. Alineacion con FE `segel-rc4.29` (SPEC A-1, A-2)

- **A-1, cantidad:** zod `cantidad` > 0 con hasta 4 decimales (hoy `int().min(1)`); `factura_items_snapshot.cantidad` a `numeric(18,4)` (migracion `0043`; se verifica el tipo actual antes). `calculateDocumentTotals` (PYG) redondea el subtotal de la linea a entero y `calculateDocumentTotalsMoneda` a 2 decimales. En pantalla, el campo Cantidad admite coma decimal con hasta 4 decimales.
- **A-2, totales de FE:** gateway `obtenerTotales(uuid)` → `GET /v1/documentos/{uuid}/totales` con la clave del facturador. Al pasar un documento a aprobado (verificacion automatica y refresh manual), FS consulta y guarda `totals` desde FE (mapa del formato `detalle.totales` de la carga, el mismo que ya usa FS-45). Error de FE: se registra en log y se reintenta en la proxima verificacion; no cambia el estado. Marca `totales_fuente = 'FE'` para no repetir la consulta.
- **Pruebas:** unitarias de validacion de cantidad, calculo con cantidad decimal y guardado de totales (FE ok, FE con error). Playwright: CA-08 y CA-09 en el stack `raj-fs` contra `fe-cargas-real`, y la matriz de CA-10.
