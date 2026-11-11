# PLAN - Nota de remision manual v0.1

SPEC: `docs/SPEC_NOTA_REMISION_v0.1.md` · TASKS: `docs/TASKS_NOTA_REMISION_v0.1.md`.

Diseño para implementar las reglas RN-01 a RN-28 sin romper la nota de remision por planilla (fase B1) ni la emision de facturas. Las reglas de formato de documento, correo, telefono, razon social y domicilio salen de `docs/SPEC_VALIDACIONES_RECEPTOR_v0.1.md` (RV-01 a RV-08) y se implementan en su propia cadena; este plan las consume desde un modulo compartido de la API (`apps/api/src/modules/validaciones/receptor.ts`, nombre a confirmar en esa cadena) y su espejo en el frontend.

## 1. Orden de entregas

La cadena completa no entra en un dia. Se parte en tres entregas; cada una deja algo util y probado.

| Entrega | Que queda usable | Depende de |
|---|---|---|
| **E1 — Emitir una remision motivo 1 y 7 con los datos cargados a mano** | Base (migracion 0048), permiso desde el export, geografia proxeada, formulario completo con validaciones, `POST /notas-remision`, gateway real y mock, worker por tipo, resultado, cancelar e inutilizar. Transportista, vehiculo y locales se cargan en el formulario **sin** listas guardadas (se envian inline) | Validaciones RV-xx (al menos RV-01, RV-04, RV-05, RV-06 como funciones) |
| **E2 — Datos reutilizables y agenda** | Tablas `remision_transportistas`, `remision_vehiculos`, `remision_locales` con su API y las listas en el formulario; domicilio codificado en la agenda (`PATCH /clientes`, pantalla Agenda); facturas asociadas (RN-16); "Crear nueva" conserva el transporte | E1 |
| **E3 — SIFEN test y cierre** | Emision real motivo 1 y 7 contra `fe-segel` con `NRE_EMIT`, cancelacion real, evidencia, regresion completa, pautas §12, BACKLOG y HOJA_DE_RUTA actualizados | E1, E2 |

Estimacion: E1 10 a 12 h, E2 5 a 6 h, E3 2 a 3 h (sin contar la espera de SIFEN test). El 2026-11-12 es realista cerrar E1 y empezar E2; la emision real (E3) depende del tiempo de respuesta de SIFEN test y del aviso a FE.

## 2. Base y despliegue

Migracion `db/migrations/0048_nota_remision_manual.sql` (0046 y 0047 las toman las cadenas de catalogo en moneda extranjera y descuentos; 0045 es la ultima hoy en el repo):

1. `facturadores`: `fe_consumer_permisos jsonb not null default '[]'` (RN-01). Lo llena la importacion con `consumidor[].permisos` del consumidor con alcance sobre el emisor (el mismo que `fe-config.mapper.ts` elige hoy para la advertencia `PERMISOS_CONSUMIDOR_INCOMPLETOS`, lineas 374 a 401). Hoy el mapper marca `$.consumidor[].permisos` como "ignorado": pasa a "aplicado".
2. `facturador_clientes`: `domicilio jsonb` (RN-07). Sin backfill: los clientes existentes quedan sin domicilio codificado hasta que el operador lo complete.
3. Tablas `remision_transportistas`, `remision_vehiculos`, `remision_locales` (RN-06), con `tenant_id`, `facturador_id`, `activo boolean default true`, `deleted_at`, `created_by`, `updated_by`, `created_at`, `updated_at` y el trigger `set_updated_at` existente. Checks: `naturaleza in ('CONTRIBUYENTE','NO_CONTRIBUYENTE')`, `tipo_identificacion in (1,2)`, `uso in ('SALIDA','ENTREGA','AMBOS')`, longitudes minimas de la SPEC. Indice por `facturador_id` y unicidad blanda por nombre normalizado y facturador (indice unico parcial con `deleted_at is null`) para que las listas no dupliquen.
4. Sin cambios en `facturas_operativas` ni en `factura_items_snapshot`: la fase B1 ya admite `NOTA_REMISION` sin condicion de venta y lineas sin montos (RN-04). Sin cambios en `factura_emision_outbox`: el tipo se lee del documento (RN-23).

La migracion es aditiva; se aplica con el contenedor `migrate` como siempre. El despliegue a `segel-fs` es solo con orden directa del usuario y recien tras E3; requiere ademas que FE haya habilitado `NRE_EMIT` a los facturadores que el usuario indique y que esos facturadores se re-importen (RN-03).

## 3. API (`apps/api`)

### 3.1 Modulo nuevo `notas-remision`

Se crea `apps/api/src/modules/notas-remision/` en vez de crecer `facturas.service.ts` (2.000 lineas) o `facturas.routes.ts`. Justificacion: el formulario y las validaciones de la remision son propios y grandes; lo que comparte con la factura (outbox, estados, ficha, cancelar, inutilizar) se consume por las funciones ya exportadas de `facturas`.

Archivos:

- `notas-remision.types.ts`: `NotaRemisionInput` (cuerpo de RN-21), `NotaRemisionValidacionError { campo, mensaje }`, tipos de transportista, vehiculo, local y domicilio.
- `notas-remision.validacion.ts`: funcion pura `validarNotaRemision(input, contexto): NotaRemisionValidacionError[]` con todas las reglas de RN-14 y las de FE del cuadro "Contrato de FE". Usa RV-01 a RV-06 del modulo compartido de validaciones. Es la unica fuente de los mensajes; el frontend los repite literalmente y, en caso de duda, manda el servidor (RN-22).
- `notas-remision.service.ts`: `validar` (RN-22), `emitir` (RN-21: resuelve ids a datos guardados, arma el `cliente` con domicilio, aplica RN-15 para motivo 7, arma `FiscalEmitNotaRemisionRequest`, llama a `repository.createQueuedEmission` de facturas con `tipo: 'NOTA_REMISION'`, `condicionVenta: null`, `totals: SIN_MONTOS`, lineas a 0 como `comprobanteANotaRemision`), `listarFacturasAsociables` (RN-16: `facturas_operativas` del facturador `tipo='FACTURA'`, `estado='EMITIDA'`, `cdc not null`, `cliente_snapshot->>'documento_tipo'` y documento normalizado iguales; busqueda por numero o fecha, limite 20), y el guardado opcional del domicilio en la agenda (`guardar_domicilio_cliente`).
- `notas-remision.repository.ts`: CRUD de transportistas, vehiculos y locales (E2) y la consulta de facturas asociables.
- `notas-remision.routes.ts`: `POST /notas-remision`, `POST /notas-remision/validar`, `GET /notas-remision/facturas-asociables?q=`, y en E2 `GET/POST/PATCH/DELETE /remision/transportistas|vehiculos|locales`. Zod con `validateRequest` como el resto; `requireAuth`; la ruta de emision exige `nota_remision_habilitada` del contexto (403 `NOTA_REMISION_NO_HABILITADA` si no).

`createQueuedEmission` (`facturas.repository.ts` ~673) hoy recibe `input: FacturaPreviewInput` y `preview`. Se le agrega una variante o parametros opcionales `tipo` y `condicionVenta` para que la remision no tenga que fabricar un `FacturaPreviewInput` con condicion de venta. Si tocarlo arriesga la factura, la alternativa es un `createQueuedRemision` en el mismo repositorio que inserte las mismas filas (documento, lineas, outbox) con `tipo='NOTA_REMISION'`; la decision se toma al implementar E1 y queda en TASKS.

### 3.2 Geografia

`apps/api/src/modules/geografia/`: `geografia.routes.ts` con las tres rutas de RN-08, `geografia.service.ts` con cache en memoria `Map<clave, { version, items, expiraEn }>` de 24 h por `departamentos`, `distritos:<dep>`, `ciudades:<dist>`; llama a `gateway.getGeografia({ departamento?, distrito? })` (metodo nuevo del gateway). Sin tabla: la API corre en un solo contenedor y el catalogo cambia solo con una version nueva de FE. Con FE caido y sin cache, `503 UPSTREAM_UNAVAILABLE` con el mensaje de RN-08.

### 3.3 Contexto y permiso

`context.routes.ts` (`GET /me/context`) agrega `nota_remision_habilitada: facturador.fe_consumer_permisos includes 'NRE_EMIT'`. El tipo `OperationalContextResponse` lo declara opcional como `carga_masiva_habilitada`.

Importacion (`backoffice/import`): `fe-config.mapper.ts` deja de ignorar `$.consumidor[].permisos` y lo mapea a `facturadores.fe_consumer_permisos` en `import.repository.ts` (`update facturadores set ...`). La vista previa muestra "Permisos del consumidor: FACTURA_EMIT, NRE_EMIT, ..." y la advertencia existente de permisos minimos no cambia.

### 3.4 Worker, cancelar e inutilizar (`facturas`)

- `processNextQueuedFiscalEmission`: `claimNextPendingEmission` ya trae `fiscalRequest`; se agrega `tipo` del documento a `PendingFiscalEmission` y se bifurca: `NOTA_REMISION` llama `effectiveGateway.emitNotaRemision(pending.fiscalRequest as FiscalEmitNotaRemisionRequest)`; el resto no cambia. `guardarTotalesFe` no se llama para la remision (no tiene totales; FE responde `422 DOCUMENT_WITHOUT_TOTALS` o similar; evitarlo es mas simple que tolerarlo).
- `cancelDocumento` (RN-26): condicion `documento.tipo !== "FACTURA"` pasa a `!["FACTURA","NOTA_REMISION"].includes(documento.tipo)`. La ventana de 168 h es informativa en la ficha (`deriveAccion`/`accion_detalle` ya calcula la de 48 h para la factura; se parametriza por tipo).
- `inutilizarNumeroFactura` (RN-26): `tipoDocumento: documento.tipo === "NOTA_REMISION" ? "NRE" : "FE"`; el tipo `FiscalInutilizarNumeracionRequest.tipoDocumento` pasa a `"FE" | "NRE"`.
- `deriveAccion`/`facturas.accion.ts`: para `NOTA_REMISION` en `ERROR_OPERATIVO` o `RECHAZADA`, la accion sugerida "Corregir y emitir de nuevo" apunta al formulario de remision (el frontend lo resuelve por tipo).

### 3.5 Gateway (`fiscal-gateway`)

- Tipos: `FiscalEmitNotaRemisionRequest { external_ref, facturador, fiscal_context, cliente (con domicilio), remision, transporte, items, documentosAsociados?, informacionFisco? }`, donde `remision`, `transporte`, `items` y `documentosAsociados` ya tienen la forma del contrato de FE (RN-05). `FiscalEmitFacturaResponse` sirve como respuesta (mismos campos; `tipo_documento` se guarda en `raw`).
- Cliente real: `emitNotaRemision` arma el payload con `emisor_id`, `actividadEconomicaCodigo`, `timbrado`, `numbering`, `emission_profile_code`, `client_reference` (`buildClientReference("nota_remision_operativa", ...)`), `receptor` (version **estricta** de `buildReceptor`: solo los campos que admite `/v1/nota-remision`, con `direccion`, `numeroCasa`, `departamento`, `distrito`, `ciudad`, `telefono` solo digitos, `email` solo si hay, `tipoOperacion`), `fecha`, `remision`, `transporte`, `items` (sin `precioUnitario` ni `ivaTipo`), `documentosAsociados`, `informacionFisco`, `envio`. Mapea errores como `emitFactura` (`FiscalGatewayError` con `code` y `details`; el `422` conserva la ruta del campo de FE para mostrarla).
- Cliente real: `getGeografia({ departamento?, distrito? })` → `GET /v1/parametrizaciones/geografia` con la clave del facturador.
- Mock: `emitNotaRemision` devuelve una NRE aprobada (`numero_fiscal`, `cdc`, `document_uuid` derivados del `external_ref` como `emitFactura`) y responde `422` simulados cuando el pedido trae un articulo con precio, un transportista con DV incorrecto, un receptor sin `departamento` o `ciudad`, o `finTraslado < inicioTraslado` (RN-24). `getGeografia` del mock devuelve un catalogo chico fijo (Capital, Central; Asuncion, San Lorenzo, Luque) con `version: "mock"`.

### 3.6 OpenAPI

`spec/openapi.yaml`: rutas nuevas de 3.1 y 3.2, `nota_remision_habilitada` en `/me/context`, `domicilio` en `/clientes` y `/clientes/{clienteId}`, `tipo: NOTA_REMISION` admitido en `/facturas/{documentoId}/cancelar` e `/inutilizar`, y la nota en la respuesta de `/facturas/{documentoId}` (ya existe `remision`).

## 4. Web (`apps/web-operacion`)

### 4.1 Vista

`views/RemisionView.tsx` conserva el encabezado y las pestañas; suma la pestaña "Nueva nota de remision" (primera y activa por defecto cuando `context.nota_remision_habilitada`), que renderiza `views/RemisionNuevaView.tsx` (nuevo). Sin permiso, la pestaña se muestra deshabilitada con el texto de RN-02 y la vista arranca en "Por planilla" como hoy. `lib/tiposEmision.ts`: el estado del tipo `NOTA_REMISION` pasa a "Disponible" con el permiso, "Por planilla" o "Proximamente" sin el, y la tarjeta del menu "Nuevo" abre la pestaña nueva.

`RemisionNuevaView` es **un formulario por bloques en una sola pantalla** (no por pasos): el operador ve todo, el panel derecho dice que falta, y se puede volver a cualquier bloque; es el patron de Nueva factura y de la nota de credito (`nc-grilla`, `nc-columna`, `nc-tarjeta`). Bloques en el orden de la SPEC: Motivo, Destinatario, Transporte, Salida y entrega, Vehiculo y transportista, Articulos, Informacion para el Fisco. Panel derecho con el resumen (RN-19).

### 4.2 Componentes

Reutilizados: `EncabezadoPantalla`, `CampoFormulario`, `Aviso`, `Dialogo` (alta de transportista, vehiculo y local en E2), `PastillaEstado`, `Icono` (`remision`, `mas`, `papelera`, `buscar`), `ResultadoEmision` (RN-20; recibe `documento` de tipo `NOTA_REMISION`; el texto "Entregar al cliente" se parametriza por tipo), `MenuFila` en las listas de E2.

Nuevos, en `components/`:

- `SelectorDomicilio.tsx`: direccion, numero de casa, departamento, distrito y ciudad con selectores encadenados sobre `GET /geografia/*`, con estado de carga y el `503` visible; lo usan Destinatario, locales y la Agenda (E2). Guarda codigos y descripciones.
- `LineasRemision.tsx`: tabla de articulos sin precio (RN-17) con busqueda en el catalogo (`GET /catalogo/items/search`) que copia codigo y descripcion. No reutiliza `GrillaLineas` de `main.tsx` porque esa grilla tiene precio, IVA y totales que aqui no existen y su extraccion de `main.tsx` es otra tarea (URA-023).

### 4.3 Validacion en el cliente

`lib/validacionRemision.ts`: espejo de `notas-remision.validacion.ts` (mismas frases). Las reglas de documento, correo, telefono y razon social las toma del espejo de RV-xx en `lib/` que define la cadena de validaciones; si esa cadena todavia no las tiene en el frontend al implementar E1, se importan del mismo archivo compartido con la API solo si el build lo permite; si no, se copian con un comentario que apunte a la SPEC y se unifican en E2. Flujo al pulsar "Emitir": validacion local → `POST /notas-remision/validar` → `POST /notas-remision` con `Idempotency-Key` generada al abrir el formulario (como la factura) → `ResultadoEmision`.

### 4.4 Agenda (E2)

`views/AgendaView.tsx`: bloque opcional "Domicilio" con `SelectorDomicilio` en alta y edicion; la fila de la tabla muestra la ciudad si existe. `PATCH /clientes/{id}` envia `domicilio`.

### 4.5 Documentos

`views/DocumentsView.tsx`: ficha de una `NOTA_REMISION` con "Anular" (168 h) y, en `ERROR_OPERATIVO`/`RECHAZADA`, "Corregir y emitir de nuevo" que abre `RemisionNuevaView` precargada (`initialDraft` como `InvoiceInitialDraft`). El resto es la fase B1.

### 4.6 Textos

Sin emojis; voseo segun `PAUTAS_FRONTEND_v0.1` §8; tildes en los textos de interfaz. Los mensajes de RN-14 se escriben una sola vez en la API y se copian literales.

## 5. Pruebas

- **API (vitest):** `notas-remision.validacion.test.ts` (una prueba por regla de RN-14 y por `422` de FE del cuadro; CA-04), `notas-remision.service.test.ts` (idempotencia CA-05, motivo 7 RN-15, facturas asociables RN-16, guardado del domicilio), `notas-remision.worker.test.ts` (bifurcacion por tipo, `422` → `ERROR_OPERATIVO` CA-06), `facturas.cancelar-remision.test.ts` (CA-07), `geografia.test.ts` (CA-09), `fe-config.mapper` (permisos aplicados, `nota_remision_habilitada`), gateway real con `fetch` simulado (payload exacto de `/v1/nota-remision`: sin precio ni IVA, receptor estricto).
- **Web:** `npm run typecheck`, `npm run build`.
- **Playwright** (`scripts/segel-fs/playwright-nota-remision.cjs`, contra el stack local `bash .../desplegar.sh` con FE mock): casos `permiso` (CA-01), `motivo1` (CA-02), `motivo7` (CA-03), `validaciones` (los bloqueos visibles de RN-14), `corregir` (CA-06), en 1440, 1280 y 390; `reutilizables` y `agenda` en E2. Regresion: `playwright-documentos-escritorio.cjs`, `playwright-ux-resto-app.cjs`, `playwright-nc-cuerpo.cjs`.
- **SIFEN test (E3, CA-10):** stack local con `FE_GATEWAY_MODE=real` contra `fe-segel` (red `segel_fiscal`), con aviso previo al usuario y a la sesion de FE. Una nota motivo 1 (cliente de prueba con domicilio real de Asuncion, factura asociada emitida en el mismo ensayo) y una motivo 7; cancelar una. Guardar numero, CDC, KUDE y capturas como evidencia. No se emite nada en `segel-fs`.

## 6. Riesgos

| Riesgo | Mitigacion |
|---|---|
| Tamaño: el formulario tiene siete bloques y mas de 40 campos; es la cadena mas grande desde la carga masiva | Entregas E1 a E3; E1 sin listas guardadas; `SelectorDomicilio` y `LineasRemision` como componentes aislados |
| Permiso `NRE_EMIT` en produccion: sin el, la pestaña no aparece y el cliente cree que falta la funcion | RN-02 explica el motivo; DP-6 pide los nombres al usuario antes del despliegue; la re-importacion (RN-03) es un paso del despliegue |
| Geografia desactualizada o FE caido al cargar listas | Cache 24 h; `503` con mensaje; los domicilios guardan codigos y descripciones con `version` |
| Fechas de traslado: SIFEN rechaza inicio anterior a su puesta en produccion (2108) y FS no conoce esa fecha | Por defecto hoy; no se permite inicio anterior a hoy menos 30 dias (aviso, no bloqueo); el rechazo se muestra con el mensaje de SIFEN |
| Receptor estricto en FE: un campo de mas (por ejemplo `celular`) da `422` | `buildReceptorRemision` propio con lista blanca de campos; prueba del payload exacto |
| El transportista "propio" puede no tener sentido fiscal para algun contribuyente | DP-5 con el usuario; FE confirma que SIFEN test exige transportista siempre |
| `createQueuedEmission` acoplado a la factura | Variante con `tipo` o funcion hermana; pruebas de facturas existentes como guardia |
| Cancelacion a 168 h: `deriveAccion` asume 48 h | Parametrizar por tipo con prueba |
| Validaciones RV-xx todavia en su propia cadena | E1 usa las funciones RV-01, RV-04, RV-05, RV-06 como dependencia explicita; si no estan, se implementan primero dentro de esa cadena, no aqui |

## 7. Coordinacion con FE

Pedidos y confirmaciones a la sesion de FE (`facturacion-electronica-7c`), con respuesta antes de E3:

1. `NRE_EMIT` en `segel-fs` para los facturadores que el usuario nombre (DP-6). Hecho ya en el FE local `fe-segel` para el consumidor del ensayo.
2. DP-2: resuelta el 2026-11-11: `date-time` en hora de Asuncion, como la factura; nunca solo `AAAA-MM-DD` (ver SPEC).
3. DP-3: resuelta el 2026-11-11 (ver `SPEC_VALIDACIONES_RECEPTOR_v0.1`, RV-01).
4. DP-1: resuelta el 2026-11-11: catalogo `UNIDAD_MEDIDA`, 77 = "Unidad"; queda la decision del usuario de ofrecer el selector (propuesta: E2).
5. Resuelta el 2026-11-11: KUDE y ticket de NRE funcionan sin nada extra; `/totales` responde `422 DOCUMENT_WITHOUT_TOTALS` y no se llama para NRE (el worker de totales debe saltar el tipo `NOTA_REMISION`).
6. Aviso previo a cada emision en SIFEN test (CA-10) con fecha y hora.
7. Defecto documental ya informado por FE: §43.4 "por ahora solo guaranies" quedo viejo (no afecta a esta cadena).

## 8. Decisiones de diseño tomadas aqui

- Modulo propio `notas-remision` y reutilizacion del outbox y las acciones de `facturas` (3.1, 3.4).
- Formulario por bloques en una pantalla, no por pasos (4.1).
- Cache de geografia en memoria, sin tabla (3.2).
- Transportista inline en E1 y listas guardadas en E2 (1).
- `LineasRemision` propio en lugar de `GrillaLineas` (4.2).
