# PLAN Carga: Comprobantes Que Requieren Atencion v0.1

**Fecha:** 2026-11-09 · **SPEC:** `docs/SPEC_CARGA_ATENCION_COMPROBANTES_v0.1.md`

## 1. Tipos del gateway (`fiscal-gateway.types.ts`)

- `FeCargaComprobante` suma, opcionales para tolerar FE sin esta version (RN-09):
  - `atencion?: { motivo: "NUMERO_SIN_USAR" | "RECHAZADO_POR_SIFEN"; numero: string } | null`
  - `inutilizacion?: { evento_id: string; estado: string; numero: string } | null`
  - `acciones?: { puede_inutilizar: boolean; puede_editar: boolean }`
- `FeCargaTotales` suma `requieren_atencion?: number`.
- Tipo nuevo `FeInutilizarComprobanteResult = { evento: Record<string, unknown>; comprobante: FeCargaComprobante }`.
- `FiscalGateway` suma `inutilizarComprobanteCarga(cargaId: string, orden: number, motivo: string): Promise<FeInutilizarComprobanteResult>`.

## 2. Cliente real (`fiscal-gateway.client.ts`)

`inutilizarComprobanteCarga` hace `POST {baseUrl}/cargas/{cargaId}/comprobantes/{orden}/inutilizar` con `content-type: application/json` y `{ motivo }`, con los mismos encabezados y `errorDeCarga` que el resto de `/cargas`. `pedirCarga` acepta un cuerpo opcional.

## 3. Mock (`fiscal-gateway.mock-cargas.ts`)

- Cada comprobante del mock calcula `atencion`, `inutilizacion` y `acciones` al presentarse, con la regla de FE: con numeracion `CLIENTE`, `INVALIDO` o `CANCELADO` sin inutilizar es `NUMERO_SIN_USAR`; `RECHAZADO` sin inutilizar es `RECHAZADO_POR_SIFEN` con cualquier numeracion; con numeracion `SERVICIO` un invalido no tiene numero y no requiere atencion. El numero es `numero_asignado ?? numero_archivo`.
- `inutilizar(cargaId, orden, motivo)`: `404 COMPROBANTE_NOT_FOUND` si no existe; `422 VALIDATION_ERROR` fuera de 5 a 150; `409 COMPROBANTE_SIN_ATENCION` sin atencion. Si la `referencia_venta` empieza con `INUT-RECHAZO`, el evento queda `REJECTED` y el comprobante sigue con atencion; si no, `ACCEPTED`. Mueve `actualizado_en`.
- `totales.requieren_atencion` y la regla de cierre: `EN_SIFEN` no pasa a `FINALIZADA` con atencion pendiente; una `VALIDADA` sin pendientes pasa a `FINALIZADA` al consultarse cuando no queda atencion.

## 4. Servicio y ruta (`cargas.service.ts`, `cargas.routes.ts`)

- `inutilizarComprobante(context, id, orden, motivo, deps)`: `cargaVisible` (RN-08), gateway del facturador, llamada a FE, `traducirErrorFe` para los errores (RN-04). `traducirErrorFe` suma el caso `409`: `HttpError(409, "CONFLICT", mensaje, { reason: fe_code, ... })`, para que la pantalla reciba el codigo de FE (hoy un `409` de FE cae en `FE_NO_DISPONIBLE`). `404` de FE con `COMPROBANTE_NOT_FOUND` responde `404 NOT_FOUND`, no "carga no habilitada".
- Registra `CARGA_COMPROBANTE_INUTILIZADO` (RN-05) con `orden`, `numero`, `motivo`, `evento_estado` y `evento_id`. Agrega el tipo a `CargaEventoTipo`.
- Agenda la carga para sincronizar enseguida (`syncNextAt: new Date()` via `actualizarDesdeFe` con la carga leida de FE), para que el cierre se vea pronto.
- Ruta `POST /cargas/:id/comprobantes/:orden/inutilizar`, con `idSchema`, `orden` entero positivo y cuerpo `{ motivo: string trim 5..150 }`. `express.json()` ya esta en la app (verificar en implementacion). Devuelve `{ evento, comprobante }`, con `documento_id` resuelto como en `listarComprobantes`.

## 5. Sincronizacion (`cargas.mapeo.ts`, `cargas-sync.worker.ts`, `cargas.service.ts`)

`proximaSincronizacionMs(estado, confirmadaEn, ahora, acciones?)`: con `VALIDADA` y `acciones.puede_confirmar === false`, 15 minutos (RN-06); con `VALIDADA` y confirmable, `null` como hoy (espera al operador; la pantalla la refresca al abrirla). Los tres llamadores pasan `feCarga.acciones`. El resto de los estados no cambia.

## 6. Pantalla (`carga-masiva.tsx`)

- Tipos: `Comprobante` y `Totales` suman los campos de la seccion 1.
- `Totales`: fila "Requieren atención" (RN-07). Aviso en la carga con `requieren_atencion > 0`: "N comprobante(s) dejaron un número sin usar o rechazado. La carga no termina hasta inutilizarlos."
- Sin filtro nuevo: FE no filtra por `atencion`, y filtrar en la pagina rompe la paginacion. Los filtros "Con errores" y "Rechazados" ya los reunen.
- Columna "Detalle": con `atencion`, una linea "Número sin resolver: 001-001-0000007 (sin usar | rechazado por SIFEN)"; con `inutilizacion`, "Inutilización: Aceptada | En curso | Rechazada | Falló" y el numero.
- Acciones por comprobante con atencion: "Inutilizar número" (si `puede_inutilizar`) abre un dialogo en linea con el motivo (contador 5..150) y la advertencia "SIFEN registra el número como inutilizado. No se puede deshacer." Confirmar llama a la ruta, muestra "Inutilización enviada: <estado>." y vuelve a leer la carga y los comprobantes. "Editar" deshabilitado con `title` y texto "Edición no disponible todavía" (RN-03).
- Refresco automatico: tambien con `VALIDADA` y `puede_confirmar === false`, cada 15 s.
- El texto de confirmar ("Inutilizarlos es responsabilidad del cliente") pasa a "Podrás inutilizarlos desde esta pantalla." solo si FE trae `requieren_atencion` en los totales.

## 7. Contrato propio (`spec/openapi.yaml`)

Ruta nueva `POST /cargas/{cargaId}/comprobantes/{orden}/inutilizar`; campos nuevos en el esquema de comprobante y `requieren_atencion` en los totales.

## 8. Pruebas

- Unitarias: mock (`cargas.mock.test.ts`): atencion por numeracion, inutilizar aceptado y rechazado, errores 404/409/422, cierre de `VALIDADA` y de `EN_SIFEN`. Mapeo: `proximaSincronizacionMs` con `VALIDADA`. Servicio: errores traducidos, evento de auditoria, agenda. Rutas: validacion del motivo y del orden.
- Real gateway (`cargas.real-gateway.test.ts`): URL, metodo y cuerpo del `POST`.
- Playwright contra el stack local de Segel (D-1) con `fe-segel` desde `feat/carga-atencion-comprobantes`: carga con numeracion del cliente y un comprobante invalido; ver atencion, "Editar" deshabilitado, motivo corto bloqueado, inutilizar, ver "Aceptada" y la carga cerrada. 390 y 1280.

## 9. Riesgos

- Inutilizar en SIFEN test consume el numero de verdad: la prueba usa numeros de la carga de prueba y no de la serie de produccion.
- El stack local se reconstruye con FE de otra rama: antes se toma la linea base de numeracion y se anota la imagen anterior para volver.
