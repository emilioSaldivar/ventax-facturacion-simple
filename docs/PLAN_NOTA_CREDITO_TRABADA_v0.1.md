# PLAN Nota De Credito Trabada v0.1

## Alineacion

- `docs/SPEC_NOTA_CREDITO_TRABADA_v0.1.md`
- `docs/TASKS_NOTA_CREDITO_TRABADA_v0.1.md`

## Enfoque

Todo el cambio vive en el modulo `facturas` de la API, en el mock del gateway fiscal, en el contrato OpenAPI y en la pantalla de documentos. No hay migracion: las columnas `idempotency_key`, `external_ref`, `documento_relacionado_id`, `fiscal_status` y `fiscal_error` ya existen en `facturas_operativas` (`db/migrations/0007_facturacion_operativa.sql`), y el indice unico parcial `(facturador_id, idempotency_key)` tambien. El orden de implementacion es: servicio y repositorio, mock, ruta y contrato, acciones, pantalla, pruebas.

## 1. Servicio: `emitNotaCreditoTotal`

Archivo: `apps/api/src/modules/facturas/facturas.service.ts`.

Flujo nuevo, en este orden:

1. Validar `motivo` (igual que hoy).
2. Cargar la factura original con `getDocumentoById`. Debe ser `FACTURA`, `EMITIDA` y con `cdc`; si no, `409 CONFLICT` "Factura no elegible para nota de credito" (igual que hoy).
3. Listar las notas de la factura con `repository.findNotasCreditoByOriginal` (nuevo, seccion 2), ordenadas por `created_at`.
   - Si hay una en estado distinto de `RECHAZADA` y no esta trabada (`esNotaTrabada`, seccion 4): `409 CONFLICT` "La factura ya tiene una nota de credito total".
   - Si hay una trabada: es un reintento. Ir a `reintentarNotaCredito(nota)` (paso 6) y devolver su resultado.
   - Si todas estan `RECHAZADA` o no hay ninguna: `intento = cantidad + 1`.
4. `externalRef = buildNotaCreditoExternalRef(context, original.id, intento)`: `nce_` mas los 32 primeros caracteres hex del SHA-256 de `${facturador_id}:${factura_original_id}:${intento}`. La misma cadena va en `idempotency_key` de la fila y en `client_reference.idempotency_key` hacia FE (ya lo hace `buildClientReference`). El parametro `options.idempotencyKey` desaparece de esta funcion; la ruta deja de leer el encabezado para esta operacion.
5. Llamar a `gateway.emitNotaCredito(fiscalRequest)` y clasificar el resultado con `clasificarRespuestaNotaCredito` (seccion 3). Persistir con `repository.createNotaCreditoFromFactura` usando el `estado`, `fiscalResponse` y `fiscalError` que devuelva la clasificacion. Si el `insert` falla por el indice unico (`23505`), releer con `findByIdempotencyKey` y devolver esa fila (RN-09).
6. `reintentarNotaCredito(context, nota, repository, gateway)` (nueva, exportada para la ruta de la seccion 5): reconstruye el `fiscalRequest` desde `fiscal_request_snapshot` de la nota (ya se guarda; si falta, lo arma de nuevo con la original y el `motivo` guardado), llama a `gateway.emitNotaCredito`, clasifica igual que en el paso 5 y actualiza la fila con `repository.updateNotaCreditoTrasReintento` (seccion 2). Devuelve la nota con `withAccion`.

Lo que se elimina: el bloque inicial que busca por `options.idempotencyKey`, y el `throw` de `502` ante `FiscalGatewayError` distinto de `TIMEOUT`, que pasa a la clasificacion.

## 2. Repositorio

Archivo: `apps/api/src/modules/facturas/facturas.repository.ts`.

- `findNotasCreditoByOriginal({ facturadorId, documentoId })`: igual que `findNotaCreditoByOriginal` pero devuelve todas, ordenadas por `created_at`. `findNotaCreditoByOriginal` se mantiene para el resto de los usos o se reemplaza donde se use (`listNotaCreditoCandidates` pasa a excluir las `RECHAZADA`, seccion 4).
- `updateNotaCreditoTrasReintento({ facturadorId, documentoId, estado, fiscalResponse, fiscalError, documentUuid, cdc, numeroFiscal })`: actualiza `estado`, `fiscal_status`, `fiscal_error`, `fiscal_response_snapshot`, `document_uuid`, `cdc`, `numero_fiscal`, `email_estado` si viene, y `updated_at`. Con `COALESCE` en identidad: nunca pisa un `document_uuid` ya guardado con `null`.
- `createNotaCreditoFromFactura` ya recibe `idempotencyKey`, `externalRef`, `fiscalResponse`, `fiscalError` y `estado`: se le pasa la clave derivada en los dos campos. Revisar que `fiscal_status` guarde `code` cuando viene de `fiscalError` (hoy `failPendingEmission` lo hace para facturas; para la nota hay que confirmar donde se escribe `fiscal_status.code` y hacerlo en el `insert`).

## 3. Clasificacion de la respuesta de FE

Funcion pura `clasificarRespuestaNotaCredito(resultado)` en un archivo nuevo `apps/api/src/modules/facturas/nota-credito.clasificacion.ts`, con tests propios. Entrada: la respuesta mapeada del gateway, o el `FiscalGatewayError` capturado. Salida: `{ estado, fiscalResponse, fiscalError, trabada }`.

| Entrada | `estado` | `fiscalError` | Trabada |
|---|---|---|---|
| `2xx` o `409 idempotent` con `status` `APPROVED` / `APPROVED_WITH_OBS` | `EMITIDA` | `null` | no |
| `409 idempotent` con `REJECTED` | `RECHAZADA` | `null` | no |
| `409 idempotent` con `DRAFT` o `TRANSMISSION_FAILED` | `PENDIENTE_SIFEN` | `{ code: <status>, recoverable: true, suggested_action: "RETRY" }` | si |
| `409 idempotent` con otro estado en transito | `PENDIENTE_SIFEN` | `null` | no |
| `FiscalGatewayError` con `details.status` `502` | `PENDIENTE_SIFEN` | `{ code: "TRANSMISSION_FAILED", recoverable: true, suggested_action: "RETRY", message, details }` | si |
| `FiscalGatewayError` `TIMEOUT` (`408`/`504`) | `PENDIENTE_SIFEN` | `{ code: "TRANSMISSION_FAILED", ... }` | si |
| `FiscalGatewayError` con `details.status` `500` | `PENDIENTE_SIFEN` | `{ code: "ISSUE_NCE_FAILED", ... }` | si |
| `409` con `error` `CREDIT_NOTE_TOTAL_EXCEEDED` | no persiste | lanza `HttpError 409 CONFLICT` con el mensaje de RN-10 | — |
| Otro `4xx` (`400`, `401`, `404`, `409` sin `idempotent`, `422`, `429`) | no persiste | lanza `HttpError 502 INTERNAL_ERROR` como hoy, con `gateway_code` y `details` | — |

El cliente real (`RealFiscalGateway.emitNotaCredito`, `fiscal-gateway.client.ts`) hoy convierte `408`/`504` en `TIMEOUT` y el resto en `UPSTREAM_ERROR` con `details.status`: alcanza para la tabla, no cambia. En el cuerpo de `502`/`504`/`500` se buscan `document_uuid`, `cdc` y `nro_documento` por si FE los manda; si no estan, la identidad llega con el reintento.

`esNotaTrabada(documento)`: `tipo === "NOTA_CREDITO"`, `estado === "PENDIENTE_SIFEN"` y `fiscal_status.code` en `{ TRANSMISSION_FAILED, DRAFT, ISSUE_NCE_FAILED, TIMEOUT }`. Vive en `facturas.accion.ts` para que la usen el servicio y la derivacion de acciones.

## 4. Acciones y elegibilidad

Archivo: `apps/api/src/modules/facturas/facturas.accion.ts`.

- Nuevo valor de `AccionSugerida`: `REINTENTAR_NOTA_CREDITO`; y `NUEVA_NOTA_CREDITO` para la nota rechazada (RN-07).
- En `deriveAccion`, caso `PENDIENTE_SIFEN` (y `EMITIENDO` si aplica): si `esNotaTrabada` y la antiguedad es menor a 48 h, devolver `REQUIERE_ACCION` con titulo "Nota de credito sin confirmar", descripcion "El servicio fiscal no confirmo esta nota de credito. Puede reintentarla: se completa con el mismo numero, sin duplicarse." y `acciones_sugeridas: ["REINTENTAR_NOTA_CREDITO"]`. Con 48 h o mas, `REQUIERE_SOPORTE` con `buildSoporteDetalle`.
- Caso `RECHAZADA` con `tipo === "NOTA_CREDITO"`: las acciones de la causa reemplazan `CORREGIR_REEMITIR` por `NUEVA_NOTA_CREDITO`.
- `puedeReintentarEmision` devuelve `false` para `NOTA_CREDITO`: la nota no pasa por el outbox de emision y no debe mostrar "Reintentar emision".
- `getNotaCreditoIneligibility` y `listNotaCreditoCandidates` (`facturas.service.ts`): el conjunto `creditedFacturaIds` se arma solo con notas en estado distinto de `RECHAZADA`.

## 5. Ruta y contrato

Archivo: `apps/api/src/modules/facturas/facturas.routes.ts`.

- `POST /facturas/:documentoId/nota-credito`: deja de leer `Idempotency-Key`. Responde `201` con la nota nueva o con la nota trabada recien persistida; si el pedido se resolvio como reintento (RN-02), responde `200` con la nota actualizada.
- Nueva `POST /facturas/:documentoId/nota-credito/reintentar`: `documentoId` es la **nota**. Sin cuerpo. Carga la nota, verifica `esNotaTrabada`; si no lo es, `409 CONFLICT` "La nota de credito no esta pendiente de reintento". Llama a `reintentarNotaCredito` y responde `200` con la nota.
- `spec/openapi.yaml`: documentar las dos rutas, los codigos `200`/`201`/`409`/`502`, el valor `REINTENTAR_NOTA_CREDITO` y `NUEVA_NOTA_CREDITO` en `acciones_sugeridas`, y la nota de que la `Idempotency-Key` se ignora para la nota de credito. Quitar de la descripcion de `502` y `504` la idea de que no se creo nada: ahora se persiste.

## 6. Mock del gateway

Archivo: `apps/api/src/modules/fiscal-gateway/fiscal-gateway.client.ts`, clase `MockFiscalGateway`, metodo `emitNotaCredito`.

Escenarios por marcador al inicio del `motivo`, para que Playwright y los tests los disparen sin tocar configuracion:

| `motivo` empieza con | Primera llamada con esa clave | Llamadas siguientes con la misma clave |
|---|---|---|
| `[FE-502]` | `FiscalGatewayError UPSTREAM_ERROR`, `details.status 502`, cuerpo `{ error: "TRANSMISSION_FAILED" }` | `200 APPROVED` con `document_uuid`, `cdc` y numero |
| `[FE-504]` | `FiscalGatewayError TIMEOUT`, `details.status 504` | `200 APPROVED` |
| `[FE-500]` | `UPSTREAM_ERROR`, `details.status 500`, cuerpo `{ error: "ISSUE_NCE_FAILED" }` | `200 APPROVED` |
| `[FE-DRAFT]` | `409 idempotent: true, status: DRAFT` (sin `cdc`) | `200 APPROVED` |
| `[FE-TF-409]` | `409 idempotent: true, status: TRANSMISSION_FAILED` | igual, hasta la tercera llamada, que da `200 APPROVED` |
| `[FE-REJECTED]` | `200` con `status REJECTED`, `dCodRes 1306` | — |
| `[FE-TOTAL]` | `409 { error: "CREDIT_NOTE_TOTAL_EXCEEDED" }` | igual |

El mock guarda por `client_reference.idempotency_key` cuantas veces lo llamaron: asi se prueba CA-03 y CA-04 (misma clave en el reintento). Sin marcador, el comportamiento actual no cambia.

## 7. Pantalla

Archivo: `apps/web-operacion/src/main.tsx`.

- Quitar `clavesNotaCredito`, `notaCreditoIdempotencyKey` y el encabezado `Idempotency-Key` en las tres llamadas a `nota-credito` (detalle, lista y pantalla "Nueva nota de credito").
- Detalle y lista: cuando `acciones_sugeridas` incluye `REINTENTAR_NOTA_CREDITO`, boton "Reintentar nota de credito" que llama a `POST /facturas/{nota.id}/nota-credito/reintentar`, actualiza la nota en pantalla y muestra el resultado con `mensajeNotaCredito` (nuevo, analogo a `mensajeCancelacion`: "Nota de credito emitida", "La nota sigue sin confirmarse; puede reintentar mas tarde", "SIFEN rechazo la nota de credito"). El titulo del recuadro de accion sale de `accion_detalle`, como para las facturas.
- Nota `RECHAZADA`: la accion `NUEVA_NOTA_CREDITO` abre el modal de motivo sobre la factura original (`documento_relacionado_id`), igual que "Nota de credito" desde el detalle de una factura. No se ofrece "Corregir y emitir de nuevo".
- La ventana de exito tras emitir (`notaCreditoPopup`) ya usa `getSimpleDocumentoEstado`: cuando la nota quedo trabada debe decir "Nota de credito sin confirmar" y mostrar el boton de reintento, no "Nota de credito emitida".
- Interfaz movil primero, misma disposicion que el recuadro de accion de una factura rechazada (FS-36).

## 8. Worker de verificacion

Archivo: `apps/api/src/modules/facturas/verificacion.worker.ts`.

Confirmar como selecciona los documentos a verificar. Si toma `PENDIENTE_SIFEN` sin exigir `document_uuid` o `cdc`, excluir las filas sin identidad (la nota trabada sin `uuid` no tiene nada que consultar) para que no gasten intentos ni llenen el log (RN-08). Si ya las excluye, dejar la evidencia y no tocar nada.

## 9. Pruebas

- Unitarias: `nota-credito.clasificacion.test.ts` (una fila de la tabla de la seccion 3 por caso); `facturas.accion` para la nota trabada antes y despues de 48 h, `NUEVA_NOTA_CREDITO` y `puedeReintentarEmision` en `false` para notas; `emitNotaCreditoTotal` con el mock para `[FE-502]`, `[FE-504]`, `[FE-500]`, `[FE-DRAFT]`, `[FE-REJECTED]` seguido de intento 2, `[FE-TOTAL]`, y dos llamadas concurrentes (`Promise.all`) que terminan en una sola fila.
- Integracion con Postgres: `findNotasCreditoByOriginal`, `updateNotaCreditoTrasReintento` con `COALESCE` de identidad, violacion del indice unico releida.
- Playwright (`scripts/playwright-nota-credito-trabada.cjs`, nuevo, con el patron de `scripts/playwright-carga-masiva.cjs`), contra `bash scripts/deploy.sh` con el mock, 390 px y 1280 px: emitir con `[FE-502]`, ver el aviso y el boton, recargar la pagina, reintentar, ver "Nota de credito emitida" y la nota `EMITIDA` en Documentos; emitir con `[FE-REJECTED]`, ver "Emitir nueva nota de credito", emitirla y verla `EMITIDA`.
- Ensayo de volumen (CA-09): una nota de credito sobre una factura de carga contra FE `segel-rc4` en SIFEN test; el caso de `TRANSMISSION_FAILED` real solo si FE presta su simulador con latencia.

## 10. Riesgos

| Riesgo | Mitigacion |
|---|---|
| Una nota que FE devuelve `409 idempotent` con `APPROVED` pero FS tenia trabada sin identidad | `updateNotaCreditoTrasReintento` guarda `document_uuid`, `cdc` y numero del `409`: FS queda alineado |
| FE sin `rc4` en algun ambiente (staging de Ventax) | RN-11: la nota sigue trabada, se ve "sin confirmar", nada se duplica |
| El cambio de clave deja afuera notas trabadas anteriores a este despliegue | En `segel-fs` hay dos documentos y ninguna nota: no hay casos previos. En los demas ambientes las notas existentes `EMITIDA` no se tocan |
| Doble click crea dos filas | Indice unico y relectura (RN-09); test de concurrencia |
| El mock cambia comportamiento para quien no usa marcadores | Sin marcador no cambia nada; los tests existentes siguen en verde |
