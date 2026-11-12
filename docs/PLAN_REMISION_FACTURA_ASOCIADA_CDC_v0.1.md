# PLAN Nota De Remision: Factura Asociada Por CDC v0.1

**Fecha:** 2026-11-12 · **SPEC:** `docs/SPEC_REMISION_FACTURA_ASOCIADA_CDC_v0.1.md` · **Rama:** `feat/identidad-segel` · **Depende de FE:** BL-213 (NRE v0.2) desplegado en `fe-segel` para probar y en `segel-fs` para usar. Lo de FS se puede implementar y probar con el mock antes.

## 1. CDC compartido (`packages/shared/src/money/cdc.ts`, nombre a confirmar: `packages/shared/src/fiscal/cdc.ts`)

- `normalizarCdc(texto)`: quita espacios y guiones. `digitoVerificadorCdc(cdc43)`: modulo 11, pesos 2..11 de derecha a izquierda, resto < 2 → 0 (verificado contra 12 CDC reales del stack local el 2026-11-12). `validarCdcFactura(cdc, emisorRuc, emisorDv)`: `null` o `{ motivo: "CDC_FORMATO" | "CDC_DV" | "CDC_NO_ES_FACTURA" | "CDC_OTRO_EMISOR", mensaje }`. `partesDelCdc(cdc)`: tipo, ruc, dv, establecimiento, punto, numero, fecha (`AAAAMMDD` en posiciones 25-32).
- Reutiliza la logica de `leerNumeracionDelCdc` y `mismoEmisor` de `apps/api/src/modules/facturas/facturas.inutilizacion.ts`; esos dos pasan a envolver la funcion compartida (sin cambiar su firma).
- Lo usa la pantalla por la misma ruta relativa que `notaCreditoMonto.ts` (RN-01 en pantalla antes de llamar a la API).

## 2. Gateway (`fiscal-gateway.types.ts`, `fiscal-gateway.client.ts`)

- `FiscalGateway.consultarDeSifen(cdc, emisorId): Promise<FiscalConsultaDeSifen>` con `{ cdc, estado: "APROBADO" | "CANCELADO" | "SIN_PROTOCOLO", sifen: { dCodRes, dMsgRes, dFecProc, dProtAut }, xml_rde, desde_cache, raw }`. Real: `GET /consultar/de-sifen/{cdc}?emisor_id=&env=<config.environment>` con la clave del gateway (se construye con la del facturador, patron de `geografia.routes.ts`). Errores: `FiscalGatewayError` con `status` y `body.error` (`CDC_INEXISTENTE`, `RATE_LIMITED` + `Retry-After`, `FORBIDDEN`, `CERTIFICADO_NO_DISPONIBLE`, `SIFEN_*`).
- Mock: responde `APROBADO` con un `xml_rde` armado desde un registro en memoria `registrarDeSifenMock(cdc, { emisor, receptor, total, tipo })` que las pruebas y el guion local cargan; CDC con marcador en el numero (`...9999999...`) → `404 CDC_INEXISTENTE`; receptor distinto segun lo registrado. El mock de `emitNotaRemision` acepta `documentosAsociados` y reproduce el `404 REFERENCED_DOCUMENT_NOT_FOUND` con un marcador para probar RN-11.

## 3. Lectura del XML (`apps/api/src/modules/notas-remision/de-sifen.lectura.ts`)

- `leerFacturaDeRde(xmlRde)`: expresiones regulares por elemento hoja (D-2) → `{ tipo_de, emisor: { ruc, dv }, numero: "est-pto-num", fecha, receptor: { naturaleza, ruc, dv, tipo_id, numero_id, nombre }, total, moneda }`. Falla con `Error("XML sin <campo>")` si falta `iTiDE`, `dRucEm` o el receptor; el servicio lo traduce a `503 SIFEN_NO_DISPONIBLE` con log (es un cambio de formato, no un error del operador).
- Prueba unitaria con un `rDE` real de SIFEN test (pedido a FE en `[FE] d`; si no llega, con el XML de una factura de FS bajado por `GET /v1/documentos/{uuid}/files/xml` del stack local).

## 4. Servicio (`notas-remision.service.ts`, `notas-remision.validacion.ts`, `notas-remision.types.ts`)

- Tipos: `NotaRemisionInput.remision.facturas_asociadas?: Array<{ cdc: string }>`; `FacturaAsociadaVerificada` (RN-08).
- `verificarFacturaAsociada(context, { cdc, cliente }, repository, gatewayConClave | null)`: RN-01 (shared) → busca en FS por `cdc` del facturador (`repository.findByCdc`, existe para la inutilizacion; si no, agregar) → si esta en FS y es `FACTURA` `EMITIDA` del mismo cliente, responde con `en_fs` sin consultar (D-3); si esta en FS con otro cliente, RN-05 → si no esta: sin gateway con clave, `409 SIFEN_CONSULTA_NO_DISPONIBLE` (D-6); `consultarDeSifen` con cache `Map<"facturadorId:cdc", { valor, expira }>` de 10 min (D-4) y reintento unico ante `429` (RN-07); RN-03, RN-04, RN-05; responde RN-08.
- `validar` (RN-22 de la remision): `facturas_asociadas` sin repetidos, hasta 10, cada CDC con RN-01; `fecha_futura_factura` obligatoria **solo** sin asociadas (RN-09). `emitir`: antes de encolar, `verificarFacturaAsociada` por cada CDC **desde el cache** de D-4 (consulta a SIFEN solo si el CDC no se verifico en los ultimos 10 minutos); la comprobacion fiscal definitiva la hace FE al numerar (D-1, opcion A); `construirPedidoFe` suma `documentosAsociados` y omite `fechaFuturaFactura` con asociadas.
- Gateway con clave en la ruta: `gatewayDelFacturador(context)` como en `geografia.routes.ts` (`permisosDelFacturador` → `createFiscalGateway({ ...config, apiKey })`); sin clave → `null`.
- `nota-remision.resumen.ts`: `facturas_asociadas` desde `snapshot.documentosAsociados` (RN-10); `documento_id` resuelto por `cdc` en el repositorio al leer la ficha (`GET /facturas/:id`, solo para `NOTA_REMISION`).
- Worker (`cargas-sync`/emision de remision): mapear `404 REFERENCED_DOCUMENT_NOT_FOUND`, `422 INVALID_REFERENCED_*`, `409 INVALID_REFERENCED_DOCUMENT_STATUS` a `ERROR_OPERATIVO` con el mensaje de RN-11 (hoy los `422` ya van a `ERROR_OPERATIVO`; falta el `404` y el `409`, y el texto).

## 5. Rutas (`notas-remision.routes.ts`)

- `POST /notas-remision/facturas-asociadas/verificar` (permiso de emision de remision, como `POST /notas-remision`): body `{ cdc: string, cliente: { documento_tipo, documento } }` → `FacturaAsociadaVerificada`; errores `400`/`409`/`503` de la SPEC.
- `POST /notas-remision`: esquema `remision.facturas_asociadas: z.array(z.object({ cdc: z.string().trim().min(44).max(60) })).max(10).optional()`.
- `GET /notas-remision/facturas-asociables?q=` (RN-16 original, NRE-019): facturas de FS `FACTURA`/`EMITIDA`/con `cdc` del mismo cliente (documento normalizado), busqueda por numero o fecha, limite 20, respuesta `{ items: [{ documento_id, cdc, numero_fiscal, fecha, total, moneda }] }`.

## 6. Pantalla (`apps/web-operacion/src/views/RemisionNuevaView.tsx`)

- Estado `facturasAsociadas: FacturaAsociadaVerificada[]`, `cdcTexto`, `verificando`, `errorCdc`. Seccion "Facturas asociadas" dentro del bloque Motivo (motivo 1), despues de Kilometros: `CampoFormulario` "CDC de la factura" (ayuda "44 digitos, debajo del QR del KUDE"; `inputMode="numeric"`; al pegar se normaliza), boton secundario "Verificar" (deshabilitado sin destinatario elegido: la verificacion compara receptor), lista con numero, fecha, receptor, total y "Quitar", y el buscador "Elegir una factura emitida en este sistema" (`/facturas-asociables`) que al elegir agrega sin verificar. Con `facturasAsociadas.length > 0`: "Fecha prevista" oculta y `fecha_futura_factura: null`. Si `GET /me/context` o la primera verificacion devuelven `SIFEN_CONSULTA_NO_DISPONIBLE`: seccion deshabilitada con el texto de D-6 (`Aviso` tono `atencion`).
- Panel derecho (RN-19): "Facturas asociadas: N". Ficha (`DocumentsView`): lista `remision.facturas_asociadas` con enlace a la ficha cuando `documento_id` no es null.
- `tipos.ts`: `NotaRemisionInput.remision.facturas_asociadas`, `FacturaAsociadaVerificada`, `DocumentoResponse.remision.facturas_asociadas`.
- Pautas: `docs/PAUTAS_FRONTEND_v0.1.md` (componentes existentes, sin emojis, voseo, 44 px en 390).

## 7. Contrato propio (`spec/openapi.yaml`)

- Rutas nuevas de la seccion 5, esquemas `FacturaAsociadaVerificada`, `facturas_asociadas` en `NotaRemisionInput` y en `DocumentoRemision`; `reason` nuevos: `SIFEN_CONSULTA_NO_DISPONIBLE`, `FACTURA_NO_APROBADA`, `FACTURA_NO_PROPIA`, `FACTURA_OTRO_RECEPTOR`, `SIFEN_NO_DISPONIBLE`.

## 8. Pruebas

- Shared: DV con los 12 CDC reales (anonimizados al RUC del ensayo), formato, tipo, emisor.
- API: lectura del `rDE`; `verificarFacturaAsociada` con el mock (FS sin consulta; externa aprobada; otro receptor; cancelada; inexistente; sin clave; `429` con reintento; `503`); `validar` (repetidos, tope, fecha prevista opcional con asociadas); `construirPedidoFe` (`documentosAsociados`, sin `fechaFuturaFactura`); worker RN-11; `resumenRemision`. Suite completa verde.
- Playwright `scripts/segel-fs/playwright-remision-asociada.cjs`: CA-01 a CA-08 contra el stack local con `fe-segel` **con BL-213** (SIFEN test; aviso previo a FE). CA-01 necesita una factura aprobada emitida fuera de FS para el cliente de prueba: se emite desde el frontend de FE local o con `POST /v1/factura` directo (fuera de FS), y su CDC se pasa por `ENSAYO_CDC_EXTERNO`. Mientras BL-213 no este en `fe-segel`, el guion corre hasta CA-07 (el `404` de FE) y CA-01 queda pendiente.
