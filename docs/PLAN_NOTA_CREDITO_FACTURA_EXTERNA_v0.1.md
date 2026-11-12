# PLAN Nota De Credito Sobre Factura Externa v0.1

**Fecha:** 2026-11-12 · **SPEC:** `docs/SPEC_NOTA_CREDITO_FACTURA_EXTERNA_v0.1.md` · **Rama:** `feat/identidad-segel` · **Orden:** esta cadena implementa la base "factura por CDC" (secciones 1 a 3) que `PLAN_REMISION_FACTURA_ASOCIADA_CDC_v0.1` (FS-137) reutiliza; FS-137 se implementa despues. El camino **a mano con referencia impresa** se puede probar end-to-end con el FE actual; el camino **por CDC** necesita el cambio de FE (`[FE]`).

## 1. CDC compartido (`packages/shared/src/fiscal/cdc.ts`)

Igual que PLAN 1 de FS-137: `normalizarCdc`, `digitoVerificadorCdc` (modulo 11), `validarCdcFactura(cdc, ruc, dv)`, `partesDelCdc` (tipo, ruc, dv, establecimiento, punto, numero, fecha `AAAAMMDD`). `leerNumeracionDelCdc` y `mismoEmisor` de `facturas.inutilizacion.ts` pasan a envolverla. Lo usa la pantalla por ruta relativa (como `notaCreditoMonto.ts`).

## 2. Gateway

- `FiscalGateway.consultarDeSifen(cdc, emisorId)` real y mock (PLAN 2 de FS-137). El mock sirve un `rDE` registrado con `registrarDeSifenMock(cdc, rde)`; las pruebas cargan el `rDE` real de la 1010665 (anonimizado al RUC del ensayo) desde `apps/api/tests/fixtures/rde-factura-descuentos.xml`.
- `FiscalEmitNotaCreditoRequest.factura_referencia` pasa a `{ documento_id, numero_fiscal, referencia: { tipo: "ELECTRONICO", cdc } | { tipo: "IMPRESO", timbrado, establecimiento, punto, numero, fecha } }`; `buildEmitirNotaCreditoPayload` arma `referencia` segun el tipo (`puntoExpedicion` para FE). Mock de `emitNotaCredito`: marcador `[FE-404-REF]` para RN-08.

## 3. Lectura del `rDE` (`apps/api/src/modules/facturas/de-sifen.lectura.ts`)

- `leerFacturaDeRde(xmlRde)` → `{ tipo_de, emisor, numero, fecha_emision, receptor: { naturaleza, documento_tipo, documento, razon_social, email?, telefono? }, moneda, tipo_cambio, condicion_venta, items: [{ line_no, codigo, descripcion, cantidad, precio_unitario, descuento, descuento_global, subtotal, iva_tipo, base_imponible, iva_monto }], totals: TaxTotals (`fuente: "SIFEN"`, `subtotal` = `dTotOpe` bruto, `descuento` = `dDescTotal`, `total` = `dTotGralOpe`, `redondeo` = `dRedon`) }`. Expresiones regulares por elemento hoja dentro de `gDatRec`, cada `gCamItem` y `gTotSub` (D-2); `iAfecIVA` 1 con `dTasaIVA` 10/5 → `IVA_10`/`IVA_5`; 3 (exento) y 2 (exonerado) → `EXENTA` (el exonerado se marca `exonerada` en totals para que la nota por monto lo sume con lo exento, §67). Mapeo del receptor: `iNatRec` 1 → RUC `dRucRec-dDVRec`; 2 → `iTipIDRec` (1 CI, 2 pasaporte, 3 cedula extranjera, 5 innominado, 9 no especificado...) con `dNumIDRec`; `cPaisRec` distinto de PRY → marca B2F. Redondeo de importes a la moneda (`decimalesDeMoneda`).
- Prueba unitaria con el fixture real y con un `rDE` de una linea sin descuentos.

## 4. Migracion `db/migrations/0051_factura_externa.sql`

- `facturas_operativas`: `origen text check (origen in ('SIFEN','MANUAL'))` (null = de FS), `referencia_impresa jsonb`, `sifen_consulta jsonb` (protocolo, fecha de proceso, consultado_en), `fecha_emision date`. Indice unico parcial `(facturador_id, cdc) where cdc is not null and deleted_at is null` (D-7; verificar antes que no haya duplicados historicos: si los hay, indice solo `where origen is not null`). Indice unico parcial sobre `(facturador_id, referencia_impresa)` para `origen = 'MANUAL'`.

## 5. Tipos, repositorio y servicio (`apps/api/src/modules/facturas`)

- `facturas.types.ts`: `DocumentoResponse.origen?: "SIFEN" | "MANUAL" | null`, `referencia_impresa?`, `sifen_consulta?`, `fecha_emision?`; `FacturaExternaInput` (RN-04).
- `facturas.repository.ts`: `createFacturaExterna(input)` (inserta `FACTURA` `EMITIDA` con snapshots, sin outbox), `findByCdc(facturadorId, cdc)` (si no existe), `findByReferenciaImpresa`, `deleteFacturaExterna` (logico, solo sin notas); `COLUMNAS_DOCUMENTO` y el mapeo de fila con los campos nuevos.
- `facturas-externas.service.ts` (modulo nuevo): `traerDeSifen(context, cdc, repository, gatewayConClave)` (RN-01 a RN-03, D-7, RN-04), `cargarManual(context, input, repository)` (RN-05 con `calculateDocumentTotalsMoneda` y las validaciones del receptor compartidas), `eliminar`.
- `facturas.service.ts`: `getNotaCreditoIneligibility` sin cambios (una externa es `FACTURA` `EMITIDA` con `cdc`... la impresa **no tiene `cdc`**: la condicion "sin CDC" pasa a "sin `cdc` y sin `referencia_impresa`"); `buildFiscalNotaCreditoRequest` arma `referencia` segun la factura y nunca `por_referencia` con `origen`; `emitNotaCreditoTotal` con `origen`: D-3 (por tasa cuando hay `descuento` o `exonerada` en totals; si no, copia lineas); `armarLineasNotaCredito` con D-4 (precio neto por unidad; bloqueo si no cierra); `emitNotaCreditoPorMonto` y `getNotaCreditoSaldo`: con `origen`, tasas desde `totals` guardados (`gravada_10 = total_sin_iva por tasa`... se guardan en `totals` los campos `gravada_10`, `gravada_5`, `exenta`, `exonerada` del `rDE` para no reconstruirlos; `TaxTotals` suma esos cuatro opcionales con comentario); `guardarTotalesFe` sale si `origen`; `refreshDocumentoStatus`/worker de verificacion saltan `origen` (D-9); `clasificarError` del gateway: `404 REFERENCED_DOCUMENT_NOT_FOUND` → `409` RN-08.
- Entrega (`entrega.service`): sin enlace ni correo para `origen` (responde `410`/mensaje "La factura externa no tiene documentos de FE").
- **Capacidad de FE para descuentos en la NC (D-3, D-4):** bandera de entorno `FE_NC_DESCUENTOS` (default `false`), como `FE_NC_MONEDA_EXTRANJERA`; se enciende por despliegue cuando `fe-segel`/`segel-fs` corran `segel-rc4.35`. Con `false`, `buildEmitirNotaCreditoPayload` sigue sin mandar `descuento` (como hoy) y el servicio aplica la total por tasa y el bloqueo por lineas; con `true`, manda `descuento` y `descuentoGlobal` y copia lineas reales. La bandera se documenta en `infra/segel-fs/fs.env.example`.
- **Referencia impresa (RN-05):** validacion en `facturas-externas.service.ts` y repetida en `buildFiscalNotaCreditoRequest` antes de llamar a FE (ceros a la izquierda ya normalizados al guardar).

## 6. Rutas

- `POST /facturas/externas/sifen` `{ cdc }` → `DocumentoResponse` (RN-02 a RN-04). `POST /facturas/externas/manual` `FacturaExternaInput` → `DocumentoResponse`. `DELETE /facturas/externas/:id` (RN-09). Permiso RN-10. `GET /facturas` y `nce-candidatas` ya las listan (son `FACTURA`); filtro `origen` opcional en `GET /facturas`.
- `POST /facturas/:id/nota-credito` sin cambios de contrato.

## 7. Pantalla (`apps/web-operacion`)

- `CreditNoteView`: en "Factura a devolver", junto al buscador, boton secundario **"Traer factura que no esta en el sistema"** → `FacturaExternaView` (vista nueva en `views/`) con dos pestañas: **"Desde SIFEN por CDC"** (campo CDC con validacion local, "Consultar", tarjeta de la factura leida: receptor, lineas, totales, moneda; "Guardar y usar") y **"Cargar a mano"** (editor reducido: cliente con el buscador de la agenda y los campos de Nueva factura, grilla de lineas de `InvoiceEditor` en modo "sin emitir" si su `initialDraft`/callbacks lo permiten; si no, la grilla simple de `RemisionNuevaView` mas precio/IVA; referencia electronica o impresa; "Guardar"). Al guardar vuelve a Notas de credito con la externa ya elegida (`elegir(candidate)`).
- `DocumentsView`: pastilla y texto de `origen` (D-6); acciones recortadas (alcance 5); "Eliminar factura externa".
- `tipos.ts`: `origen`, `referencia_impresa`, `FacturaExternaInput`.
- Pautas: `docs/PAUTAS_FRONTEND_v0.1.md`.

## 8. Contrato propio (`spec/openapi.yaml`)

- Rutas de la seccion 6; `DocumentoResponse.origen`, `referencia_impresa`, `sifen_consulta`, `fecha_emision`; `reason` nuevos (`FACTURA_NO_APROBADA`, `FACTURA_NO_PROPIA`, `FACTURA_YA_EXISTE`, `SIFEN_CONSULTA_NO_DISPONIBLE`, `SIFEN_NO_DISPONIBLE`, `NOTA_CREDITO_FE_SIN_SOPORTE_EXTERNA`).

## 9. Pruebas

- Shared: CDC (12 vectores reales).
- API: lectura del `rDE` (fixture real: 3 lineas, descuentos, totales exactos 165.833/48.623/27.875); `traerDeSifen` con el mock (ok, no aprobada, inexistente, otro emisor, duplicada, sin clave, 503); `cargarManual` (impresa valida, timbrado corto, CDC malo, duplicada); NC total por tasa sobre externa con descuentos (D-3) y por copia sin descuentos; por lineas con D-4 (bloqueo); por monto con totals guardados (D-5); referencia IMPRESO en el payload; RN-08; worker de verificacion salta `origen`; candidatas y saldo. Suite completa verde.
- Playwright `scripts/segel-fs/playwright-nc-factura-externa.cjs` contra el stack local (`fe-segel`, SIFEN test; aviso previo a FE): CA-04, CA-05 (impresa: **emision real** aprobada), CA-06, CA-07, CA-08 con el FE actual; CA-01 a CA-03 cuando FE despliegue el cambio en `fe-segel` (factura externa real emitida desde el frontend de FE local, CDC por `ENSAYO_CDC_EXTERNO`).
