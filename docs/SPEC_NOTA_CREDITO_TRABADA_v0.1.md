# SPEC Nota De Credito Trabada v0.1

**Fecha:** 2026-11-08 · **Rama:** `feat/identidad-segel` · **Estado:** documentacion aprobada por el usuario para implementar antes del despliegue de la segunda entrega en `segel-fs`. Lo implementa otra sesion; esta solo documenta.

## Alineacion

- `AGENTS.md`, `docs/METODOLOGIA_SDD.md`.
- `docs/BACKLOG.md`, FS-38: origen de este alcance.
- `docs/SPEC_CONTRATO_FE_SOBRECARGA_v0.1.md`, RN-05: hoy la clave de la nota de credito se conserva por factura mientras la pagina siga abierta.
- `docs/SPEC_ESTADO_FISCAL_CANONICO_v0.1.md`: `DRAFT` y `TRANSMISSION_FAILED` de FE se traducen a `PENDIENTE_SIFEN`.
- `docs/SPEC_DESPLIEGUE_SEGEL_FS_v0.2.md`, D-21: esta cadena se cierra antes del despliegue con `segel-rc4`.
- Contrato de FE, tag `segel-rc4`, guia de consumidores v0.16, seccion 33.3, y su `tecnica/openapi.yaml` (`POST /v1/nota-credito`: `409`, `502`, `504`). Hallazgo V012 de FE (`VERIFICACION_DESPACHO_INMEDIATO_v0.1`, repositorio de FE).

## Objetivo

Que una nota de credito que fallo a medias en FE **no quede perdida ni duplicada**, y que el operador pueda terminarla desde FS con un solo boton, sin soporte. Hoy FS descarta la nota cuando FE responde un error, aunque FE la haya creado con numero.

## Hallazgo

FE confirmo el 2026-11-08 (V012) que `POST /v1/nota-credito` puede dejar la nota creada aunque responda error:

| Respuesta de FE | Que queda en FE |
|---|---|
| `502` `TRANSMISSION_FAILED` | Nota creada, firmada, con numero, sin llegar a SIFEN |
| `504` `TRANSMISSION_FAILED` | Nota creada, con numero; SIFEN pudo haberla recibido |
| `500` `ISSUE_NCE_FAILED` | Nota en `DRAFT` con numero, si el fallo fue despues de crear el borrador |

Que hace FS hoy (`emitNotaCreditoTotal`, `apps/api/src/modules/facturas/facturas.service.ts`):

- Con `502` o `500`, lanza `502` a la pantalla y **no guarda nada**. Con `504` guarda la nota en `PENDIENTE_SIFEN`, sin `document_uuid`, con accion sugerida `REFRESH_OR_CONTACT_SUPPORT`, que no sirve sin identidad fiscal.
- La `Idempotency-Key` la genera el navegador y vive en memoria de la pagina (`notaCreditoIdempotencyKey`, `apps/web-operacion/src/main.tsx`). Si el operador recarga la pagina y vuelve a emitir, el `external_ref` es otro.
- Con `segel-rc4` y `NCE_IDEMPOTENCY_ENABLED=true`, FE **cuenta** una nota en `TRANSMISSION_FAILED` contra el total de la factura: el segundo intento con otra clave responde `409 CREDIT_NOTE_TOTAL_EXCEEDED` y la factura queda sin poder corregirse desde FS. Con `DRAFT`, lo mismo. Antes de `rc4`, el segundo intento creaba **otra** nota con otro numero: con un `504` que SIFEN si recibio, dos notas sobre la misma venta.
- Mientras exista cualquier nota para la factura, incluida una `RECHAZADA`, FS impide otra (`findNotaCreditoByOriginal` no mira el estado). Una nota rechazada por SIFEN deja la factura sin salida.
- El `409 idempotent: true` de FE con `status` `DRAFT` o `TRANSMISSION_FAILED` se muestra como "En proceso", y nada lo va a mover.

Que trae `segel-rc4` (guia 33.3): un reintento **con la misma clave** completa la nota. `DRAFT`: la genera, firma y envia con el mismo numero, responde `200` o `202`. `TRANSMISSION_FAILED`: consulta el CDC en SIFEN; si SIFEN la tenia guarda la aprobacion, si no la reenvia; responde `200`. Si la consulta a SIFEN no responde, `409 idempotent: true, status: TRANSMISSION_FAILED`: reintentar mas tarde.

## Definiciones

- **Nota trabada:** nota de credito de FS en `PENDIENTE_SIFEN` cuyo ultimo intento contra FE termino en `502`, `504` o `500`, o cuyo `409 idempotent` trajo `status` `DRAFT` o `TRANSMISSION_FAILED`. Se reconoce por `fiscal_status.code` en `TRANSMISSION_FAILED`, `DRAFT`, `ISSUE_NCE_FAILED` o `TIMEOUT`, segun RN-04.
- **Clave derivada:** la `idempotency_key` que FS manda a FE en `client_reference` y guarda en `facturas_operativas.idempotency_key`. La calcula el servidor a partir del facturador, la factura original y el numero de intento. No depende del navegador.
- **Intento:** numero de nota de credito que se abre para la misma factura. Sube solo cuando la nota anterior quedo `RECHAZADA`.

## Reglas

- **RN-01. La clave la deriva el servidor.** `external_ref` e `idempotency_key` de una nota son `nce_<hash(facturador_id:factura_original_id:intento)>`. El encabezado `Idempotency-Key` que manda la pagina deja de usarse para la nota de credito: el servidor lo acepta y lo ignora. La pagina deja de generarlo y se retira el mapa `clavesNotaCredito` (RN-05 de `SPEC_CONTRATO_FE_SOBRECARGA_v0.1` queda reemplazada por esta regla).
- **RN-02. Una nota viva por factura.** Para una factura hay a lo sumo una nota en estado distinto de `RECHAZADA`. Si existe y esta `EMITIDA` o `ANULADA`, un nuevo pedido responde `409 CONFLICT` "La factura ya tiene una nota de credito total", como hoy. Si existe y esta trabada, el pedido es un **reintento** (RN-05). Si todas las notas de la factura estan `RECHAZADA`, se abre el intento siguiente con clave nueva, y la factura vuelve a ser elegible en la lista de candidatas.
- **RN-03. Todo error de FE que pudo crear la nota se persiste.** Con `502`, `504` o `500` de FE, FS **guarda** la nota en `PENDIENTE_SIFEN` con la clave derivada, `fiscal_status.code` igual al codigo de FE (`TRANSMISSION_FAILED` para `502`/`504`, `ISSUE_NCE_FAILED` para `500`), `recoverable: true` y `suggested_action: RETRY`. Si el cuerpo de FE trae `document_uuid`, `cdc` o `nro_documento`, se guardan. Los errores que no crean nota (`400`, `401`, `404`, `409` distinto de idempotente, `422`, `429`) siguen sin persistir y se informan como hoy.
- **RN-04. El `409 idempotent` se lee por su `status`.** `APPROVED` o `APPROVED_WITH_OBS` es `EMITIDA`; `REJECTED` es `RECHAZADA`; `DRAFT` y `TRANSMISSION_FAILED` dejan la nota trabada con `fiscal_status.code` igual a ese `status`; los demas en transito siguen `PENDIENTE_SIFEN` sin marca de trabada. En todos los casos se guardan `document_uuid`, `cdc` y numero si vienen.
- **RN-05. Reintento con la misma clave.** Reintentar una nota trabada es volver a llamar a `POST /v1/nota-credito` de FE con la **misma** clave derivada y los mismos datos. La respuesta se trata con RN-03 y RN-04. El reintento esta disponible al operador desde el detalle de la nota y desde la lista, con el texto "Reintentar nota de credito". Tambien lo dispara, de forma idempotente, un nuevo pedido de nota sobre la misma factura (RN-02).
- **RN-06. Lo que ve el operador.** Una nota trabada tiene `accion` `REQUIERE_ACCION`, titulo "Nota de credito sin confirmar", descripcion que explica que FE no confirmo la nota y que se puede reintentar sin riesgo de duplicarla, y `acciones_sugeridas: ["REINTENTAR_NOTA_CREDITO"]`. Nunca "En proceso". Pasadas 48 h desde su creacion sin resolverse, pasa a `REQUIERE_SOPORTE` con el `soporte_payload` habitual.
- **RN-07. Nota rechazada.** Una nota `RECHAZADA` conserva la accion de hoy segun la causa, pero la accion sugerida para el operador es "Emitir nueva nota de credito", que abre el intento siguiente sobre la misma factura (RN-02), nunca "Corregir y emitir de nuevo" hacia el editor de facturas. El numero de la nota rechazada lo inutiliza FE (D-11 de `SPEC_DESPLIEGUE_SEGEL_FS_v0.2`); FS no lo toca.
- **RN-08. Sin reintento automatico en esta version.** Ni el worker de verificacion ni el outbox reintentan una nota trabada por su cuenta: en FE nada retoma una nota a medias sin el reintento del consumidor, asi que no hay carrera. El worker de verificacion **no gasta intentos** en una nota trabada sin `document_uuid`; con `document_uuid`, la verifica como a cualquier documento.
- **RN-09. Doble envio.** Dos pedidos simultaneos para la misma factura producen una sola nota: la clave derivada es la misma y el indice unico de `(facturador_id, idempotency_key)` lo garantiza. Ante violacion del indice, FS relee la nota y la devuelve.
- **RN-10. `CREDIT_NOTE_TOTAL_EXCEEDED`.** Si FE lo responde, es que tiene una nota por esta factura que FS no conoce. FS no persiste nada y responde `409 CONFLICT` con mensaje "FE ya registra una nota de credito por esta factura. Requiere soporte." Es un caso residual, previo a esta regla.
- **RN-11. Compatibilidad con FE sin `rc4`.** Con una FE que no complete la nota al reintentar, el reintento responde `409 idempotent` con el mismo `status`: la nota sigue trabada y el operador ve lo mismo. No se rompe nada; solo no se destraba hasta `rc4`.
- **RN-12. Limite de dominio.** FS no decide numeracion, no inutiliza numeros ni consulta SIFEN por su cuenta para una nota: todo pasa por el reintento a FE. `AGENTS.md` sigue vigente.

## Fuera De Alcance

- Reintento automatico de notas trabadas (RN-08). Se evalua despues de observar cuantas aparecen.
- Nota de credito parcial. FS sigue emitiendo solo total.
- Inutilizacion del numero de una nota rechazada desde FS.
- Cambios en FE.

## Criterios De Aceptacion

- **CA-01.** Con el mock, `POST /facturas/{id}/nota-credito` cuyo primer intento recibe `502` deja una nota en `PENDIENTE_SIFEN`, `fiscal_status.code = TRANSMISSION_FAILED`, `accion = REQUIERE_ACCION`, `acciones_sugeridas = ["REINTENTAR_NOTA_CREDITO"]`. El reintento manda la misma `idempotency_key` y, cuando el mock responde `200 APPROVED`, la nota pasa a `EMITIDA` con `document_uuid`, `cdc` y numero. Lo mismo con `504` y con `500`.
- **CA-02.** Un `409 idempotent` con `status DRAFT` o `TRANSMISSION_FAILED` deja la nota trabada y no "En proceso"; con `APPROVED` la deja `EMITIDA`; con `REJECTED`, `RECHAZADA`.
- **CA-03.** Dos pedidos concurrentes sobre la misma factura crean una sola fila y una sola llamada efectiva a FE con la misma clave.
- **CA-04.** Recargar la pagina entre el fallo y el reintento no cambia la clave: el mock recibe la misma `idempotency_key`.
- **CA-05.** Con la nota `RECHAZADA`, la factura vuelve a ser elegible, y la nueva nota usa el intento 2 con otra clave.
- **CA-06.** `npm run test`, `npm run typecheck` y `npm run lint` del workspace `api` en verde; `npm run typecheck` y `npm run build` de `web-operacion` en verde.
- **CA-07.** Playwright, contra los contenedores de `bash scripts/deploy.sh` con el mock, en 390 px y 1280 px: nota trabada visible con su aviso y boton, reintento que la deja emitida, nota rechazada con "Emitir nueva nota de credito" y segunda nota emitida.
- **CA-08.** `spec/openapi.yaml` describe la nueva ruta de reintento, el valor `REINTENTAR_NOTA_CREDITO` y el comportamiento de `POST /facturas/{id}/nota-credito` ante errores de FE.
- **CA-09.** En el ensayo de volumen con `segel-rc4` (SPEC de despliegue v0.2, D-19), una nota de credito sobre una factura de carga se emite y, si FE lo permite con su simulador, se observa un reintento real que completa una nota en `TRANSMISSION_FAILED`. Si no se puede provocar, se registra y el criterio se cubre con CA-01.

## Decisiones

| ID | Decision | Quien |
|---|---|---|
| D-1 | FS-38 se cierra antes del despliegue de la segunda entrega, con esta cadena | Usuario, 2026-11-08, por recomendacion de FS |
| D-2 | La clave la deriva el servidor a partir de la factura original y el intento; el navegador deja de generarla | FS, aceptada por FE como condicion (BACKLOG FS-38) |
| D-3 | Reintento manual por el operador; sin reintento automatico en esta version | FS, para no sumar un worker nuevo antes del despliegue |
| D-4 | Esta sesion solo documenta; otra sesion implementa siguiendo el PLAN y el TASKS | Usuario, 2026-11-08 |
