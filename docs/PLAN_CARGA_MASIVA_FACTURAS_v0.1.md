# PLAN Carga masiva de facturas por archivo v0.1

**Fecha:** 2026-11-06. **SPEC:** `docs/SPEC_CARGA_MASIVA_FACTURAS_v0.1.md`. **Rama:** `feat/identidad-segel`, sin merge a `master`.

**Estado: en refinamiento, sin implementar.** Decision del usuario (2026-11-06): el contrato de FE todavia cambia, asi que este PLAN se actualiza con cada avance de FE y se repasa con el usuario antes de escribir codigo.

## 1. Enfoque

FS no valida ni transforma el archivo: lo recibe, comprueba permisos y contexto, y lo reenvia a FE. FS guarda una fila por carga y copia a "Documentos" las facturas que FE va creando.

El trabajo se parte en dos:

- **Fases A a D, contra un mock:** no dependen de FE. El mock devuelve las formas de `tecnica/openapi.yaml` de FE (paquete v0.14).
- **Fase E, contra FE real:** con el stack local de FE. El despliegue, ademas, espera el tag.

**Estado del contrato de FE al 2026-11-06:** publicado en la guia de consumidores (seccion 36) y en `tecnica/openapi.yaml`, con las diez operaciones de `/v1/cargas`, incluidas confirmar, cancelar y reintentar. Corre de punta a punta en el stack `fe-cargas` con SIFEN simulado, medido con 5.000 comprobantes. Commiteado en la rama `feat/capacidad-200-clientes`, **sin push ni tag**. Falta la prueba en SIFEN test (CMA-604). FE sigue tocando lotes y firma (`986112d`, `095a00b`), sin cambio de contrato.

## 2. Orden de trabajo (D-7)

| Orden | Trabajo | Por que en ese lugar |
|---|---|---|
| 1 | Carga masiva, fases A a D | **En pausa:** solo documentacion y refinamiento hasta que el usuario indique implementar |
| 2 | Autogestion del operador (reemplaza a FS-25) | Borrador en `SPEC_AUTOGESTION_OPERADOR_v0.1.md`. Depende de rutas nuevas de FE |
| 3 | Carga masiva, fase E | Depende de que FE publique e implemente |
| 4 | FS-24, verificacion de documentos en lote | Depende del tag de FE con `RECONCILE_DEFERRED_ENABLED`; antes no puede activarse |

Ninguno de los cuatro se despliega sin confirmacion directa del usuario.

## 3. Base de datos: migracion `0037_carga_masiva.sql`

Aditiva. No modifica migraciones aplicadas.

- `actividad_punto_perfiles.numeracion_facturas text not null default 'SERVICIO'`, con check `('SERVICIO','CLIENTE')`.
- Tabla `cargas_masivas`: `id`, `tenant_id`, `facturador_id`, `actividad_punto_perfil_id`, `fe_carga_id` (unico por facturador), `nombre_archivo`, `numeracion`, `estado`, `totales jsonb`, `acciones jsonb`, `motivos jsonb`, `subida_por`, `confirmada_por`, `cancelada_por`, `sincronizada_hasta timestamptz`, `sincronizada_en timestamptz`, `sync_next_at timestamptz`, `created_at`, `updated_at`. Indice por `(facturador_id, created_at desc)` y por `sync_next_at` donde no es nulo.
- `facturas_operativas.carga_masiva_id uuid` (referencia, nula) y `carga_numero_archivo text`. Indice parcial por `carga_masiva_id`.

`estado`, `totales` y `acciones` son una copia de lo que informa FE, para listar sin llamar a FE. La fuente es FE.

## 4. Fase A: forma de numerar por contexto

- `PATCH /backoffice/contextos/:id` acepta `numeracion_facturas`. Solo roles internos. El cambio queda en `audit_events` (`CONTEXTO_NUMERACION_FACTURAS_CAMBIADA`, con valor anterior y nuevo). `GET` la devuelve.
- La pantalla de contextos del backoffice muestra y permite cambiar el valor, con un aviso: cambiarla en un punto que ya emitio puede cruzar numeros.
- `context.repository` y `OperationalContextResponse.fiscal_context` suman `numeracion_facturas`.
- `POST /facturas` responde `409 CONFLICT` con `details.reason = NUMERACION_DEL_CLIENTE` si el contexto es `CLIENTE` (RN-22). Los codigos de error de la API son una lista cerrada; el motivo va en `details`, como en el resto. La regla vive en el backend; la interfaz solo oculta "Nueva factura" y explica por que.
- Notas de credito: sin cambios.
- Notas y presupuestos: "convertir en factura" queda sujeto a la misma regla.

## 5. Fase B: API de cargas

Modulo nuevo `apps/api/src/modules/cargas/` (rutas, servicio, repositorio, tipos). Todas las rutas con `requireAuth` y contexto operativo.

| Ruta de FS | Llama a FE | Notas |
|---|---|---|
| `GET /cargas/plantilla` | `GET /v1/cargas/formatos/csv/1` | Descarga |
| `POST /cargas` | `POST /v1/cargas` | El archivo va como cuerpo del pedido. Ver abajo |
| `GET /cargas` | — | Desde la base de FS, paginado, filtros por fecha y estado |
| `GET /cargas/:id` | `GET /v1/cargas/{id}` | Refresca la copia local. Si FE falla, devuelve la copia con `sincronizada_en` |
| `GET /cargas/:id/comprobantes` | Igual en FE | Pasa pagina, tamano y filtros. Suma `documento_id` de FS cuando existe |
| `POST /cargas/:id/confirmar` | Igual en FE | Guarda `confirmada_por` y agenda la sincronizacion |
| `POST /cargas/:id/cancelar`, `/reintentar` | Igual en FE | Auditados |
| `GET /cargas/:id/resultado` | Igual en FE | Descarga CSV, una fila por comprobante. FS lo reenvia sin leerlo: el OpenAPI de FE no fija las columnas |
| `GET /cargas/:id/lotes` | Igual en FE | Solo rol interno: lotes SIFEN de la carga (`CREADO`, `RECIBIDO`, `CONCLUIDO`, `ERROR`) y respuestas de SIFEN, para soporte |

**Subida:**

- **Transporte: el archivo es el cuerpo del pedido,** con `Content-Type: text/csv` o `application/zip`, y el nombre en el parametro `nombre_archivo`. Propuesto por FE, aceptado por FS (seccion 19 del pedido) y **confirmado por el usuario el 2026-11-06.**
- Sin dependencia nueva: `express.raw` solo en esta ruta, con limite `CARGA_MAX_BYTES`, 20 MB por defecto. El navegador envia el `File` tal cual. El archivo no se escribe en disco ni se guarda.
- FS envia a FE `Content-Type: text/csv` o `application/zip`. FE admite ademas `application/octet-stream`, que FS no usa, y responde `415 CARGA_TIPO_DE_CONTENIDO_NO_ADMITIDO` a cualquier otro; nunca `application/json` ni `multipart`.
- Se aceptan `.csv` y `.zip`. FS no abre el `.zip`: lo reenvia igual (FE admite un solo archivo adentro, hasta 20 MB descomprimido).
- Como mucho 2 subidas a la vez por proceso; la tercera responde `429`. Tope de memoria: 40 MB mas la copia del reenvio.
- FS manda a FE los bytes recibidos, sin tocarlos, y en la URL `emisor_id`, `formato=CSV`, `version=1`, `numeracion` del contexto y `actividadEconomicaCodigo`; ademas `emission_profile_code` si el contexto tiene perfil, o `establecimiento` y `punto` si es `NO_REQUERIDO`. El perfil fija punto, timbrado y actividad. FE rechaza el archivo entero si una fila trae otro punto.
- Clave: la de consumidor del facturador (`resolveConsumerGateway`). Sin clave propia, `409` con mensaje claro: no se usa la compartida.
- Tiempo de espera propio para la subida: 60 s.
- `202` y `200` de FE crean o reutilizan la fila local por `fe_carga_id`. La repeticion la indica el codigo: `200` es un archivo ya subido. El esquema `Carga` no trae un campo `creada`. FS le dice a la pantalla si es repetida.
- **Repeticion (implementado en FE):** la clave es emisor, ambiente y sha256 de los bytes recibidos. El nombre, el perfil y la actividad no cuentan. Una carga `RECHAZADA` o `CANCELADA` no bloquea volver a subir el mismo archivo: crea una carga nueva.
- Por eso, ante un timeout de la subida, FS reintenta una vez con los mismos bytes: no duplica.
- `nombre_archivo`: opcional, hasta 200 caracteres, solo informativo. FS lo recorta a ese largo.
- `413` trae `details.tope_bytes`. Un `.zip` que supera el tope al descomprimirse no da `413`: queda como carga `RECHAZADA` con `TOPE_SUPERADO`.
- Errores de FE: `403`, `413`, `422` y `429` se devuelven con su codigo y el mensaje de FE; no se convierten en `502`. El `429` conserva `Retry-After` y `details.retry_after_seconds`.
- `422 CARGA_PARAMETROS_INVALIDOS` trae `details.motivos`, por ejemplo `ACTIVIDAD_NO_CUBIERTA`. No crea carga en FE ni fila en FS. Es un problema de configuracion, no del archivo: la pantalla muestra el motivo y pide contactar a soporte.
- Un `404` de FE en la subida significa instancia sin la funcion o consumidor sin `CARGA_MASIVA`: FS responde con un mensaje de funcion no habilitada, no como carga inexistente.

**Acciones:** confirmar, cancelar y reintentar pueden responder `409 CARGA_ACCION_NO_ADMITIDA` con las acciones vigentes: FS actualiza `acciones` en su copia y refresca la pantalla, sin mostrarlo como falla del sistema.

**Aislamiento:** toda consulta filtra por `facturador_id` y por `actividad_punto_perfil_id` del contexto. Una carga ajena responde `404`.

**Gateway:** metodos nuevos en `FiscalGateway`, implementados en `MockFiscalGateway`. En `RealFiscalGateway` quedan sin implementar hasta la fase E y responden `501 CARGA_MASIVA_NO_DISPONIBLE`. Bandera `CARGA_MASIVA_ENABLED`, `false` por defecto: apagada, las rutas responden `404` y la pestana no se muestra.

**Contrato:** rutas y esquemas en `spec/openapi.yaml`.

## 6. Fase C: sincronizacion con "Documentos"

Worker nuevo `cargas-sync.worker.ts`, arrancado en `server.ts` junto a los otros dos. Apagable con `CARGAS_SYNC_INTERVAL_MS=0`.

1. Toma cargas con `sync_next_at <= now()`, con `for update skip locked`.
2. Pide `GET /v1/cargas/{id}` y actualiza estado, totales y acciones.
3. Solo si los totales cambiaron respecto de la copia local, pide los comprobantes con `actualizado_desde = sincronizada_hasta`, `detalle=true` y `limit=200` (el maximo de FE), pagina por pagina.
4. Por cada comprobante con `document_uuid`: inserta o actualiza en `facturas_operativas` por `(facturador_id, external_ref)`, con `external_ref = carga:<fe_carga_id>:<orden>`.
5. Avanza `sincronizada_hasta` solo si todas las paginas se procesaron, y la deja en el `actualizado_en` mas nuevo recibido, no en la hora de FS: asi no depende de los relojes.

| Estado del comprobante en FE | Estado en FS |
|---|---|
| `PREPARADO`, `ENVIADO` | `PENDIENTE_SIFEN` |
| `APROBADO`, `APROBADO_CON_OBS` | `EMITIDA` |
| `RECHAZADO` | `RECHAZADA`, con codigo y mensaje de `sifen` |
| `DUPLICADO` | No crea documento. Enlaza al existente por `document_uuid`, si esta en FS |
| `INVALIDO`, `CANCELADO`, `PENDIENTE` | No crean documento: nunca lo tienen |
| `ERROR` | No crea documento ni es un rechazo: es un fallo de FE, reintentable |

- **Estado vigente:** el `estado` del comprobante no cambia tras la emision. Si el comprobante trae `documento_estado`, ese decide, con `mapDocumentStatusCanonico`: una factura cancelada llega como `CANCELLED` y queda `ANULADA`.
- **Estados finales:** una factura `ANULADA` no cambia. Una `EMITIDA` o `RECHAZADA` solo cambia si FE informa otro estado final. Asi una cancelacion hecha desde FS no se revierte.
- **Snapshot:** `detalle` trae `fecha`, `tipoTransaccion`, `receptor`, `condicionOperacion`, `items` y `total`, con los nombres de `POST /v1/factura`. Se traduce con la inversa de lo que FS ya arma para emitir.
- **`sifen` y `correo`:** `sifen` trae codigo y mensaje solo con resultado (`APROBADO`, `APROBADO_CON_OBS`, `RECHAZADO`); antes es nulo. `correo` es `PENDING` hasta la aprobacion y mientras espera en la cola, luego `SENT` o `FAILED`; en un rechazado es nulo. FS guarda `email_estado` con esos valores (`PENDING` ya es valido desde la migracion 0036).
- **Campos:** `usuario_id` es quien confirmo; `actividad_punto_perfil_id` el de la carga; `numero_fiscal` el `numero_asignado`; `carga_numero_archivo` el `numero_archivo`; `verificacion_next_at` nulo (RN-17); `email_estado` segun `correo`; snapshots e items desde el detalle.
- **Frecuencia:** 1 min mientras la carga este `VALIDANDO` o `EN_PREPARACION`; 5 min en `EN_COLA` y `EN_SIFEN`. Una carga `VALIDADA` sin confirmar no se sincroniza: no cambia sola. En `EN_SIFEN` los resultados no llegan antes de unos 10 min del envio de cada lote. Al llegar a `FINALIZADA`, `RECHAZADA` o `CANCELADA` hace una pasada mas y deja `sync_next_at` nulo: desde ahi, un cambio hecho fuera de FS se ve con "Verificar estado fiscal". Pasadas 72 h sin terminar, sigue cada 30 min y registra un aviso: puede ser SIFEN lento o un comprobante en `ERROR` que espera reintento o cancelacion.
- **Fallo de FE:** no cambia nada y reintenta en el intervalo siguiente (RN-19).
- **No toca** `facturador_clientes`, `cliente_identidades` ni el catalogo (RN-16).

## 7. Fase D: pantalla

**PC primero** (decision del usuario, SPEC seccion 4): el diseno parte de 1280 px, con tabla ancha, y se adapta hacia abajo.

Componente nuevo en `apps/web-operacion/src/carga-masiva.tsx`: `main.tsx` ya tiene 7.777 lineas. Se monta como tercera pestana de `DocumentsView` (`docKindTab = "CARGA_MASIVA"`), con las clases existentes.

- Vistas del SPEC, seccion 4: listado, nueva carga, informe, avance y resultado.
- Mientras una carga activa esta en pantalla, se refresca cada 15 s; se detiene al ocultar la pestana del navegador.
- Confirmar pide una segunda confirmacion con la cantidad a emitir. Si hay comprobantes invalidos y la numeracion es del cliente, avisa antes que sus numeros quedaran salteados.
- Textos de FE sin reescribir. Estados con las etiquetas de la seccion 7 del pedido.
- En Facturas, las de carga muestran una marca "Carga" que abre su carga, y el numero del archivo cuando difiere del asignado.
- Sin colores ni nombres de Ventax: usa las variables de marca actuales.

## 8. Fase E: FE real

- Implementar los metodos en `RealFiscalGateway` contra el OpenAPI publicado, y ajustar nombres.
- `cargar-facturador.py`: opcion para otorgar `CARGA_MASIVA` al consumidor del emisor. No se otorga por defecto.
- `worker-cargas` de FE en `build-images.sh`, `deploy.sh` y `up.sh`, apagado, cuando FE avise (P-07).
- Limites de subida: `host-segel-fs.conf` ya tiene 25 MB. Verificar el nginx del contenedor del frontend y, con infraestructura, el NGINX publico.
- Prueba conjunta P-06 en local, con un facturador de prueba y SIFEN test.

## 9. Validacion

- Unitarias e integracion del modulo: permisos y aislamiento, subida y reenvio sin cambios (mismo hash), repeticion, mapeo de estados, idempotencia del worker, estados finales, fallo de FE.
- `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`.
- Playwright contra el stack de `bash scripts/deploy.sh` con el mock: desktop 1280 px primero, y 390 px para comprobar que se puede usar sin desplazamiento horizontal. Escenarios: archivo rechazado, informe con errores y avisos, confirmar, carga en espera de otra, avance, comprobante en error con reintento, resultado, archivo repetido, punto con numeracion del cliente sin "Nueva factura".
- Nunca en `segel-fs` ni en Hetzner.

## 10. Riesgos

| Riesgo | Mitigacion |
|---|---|
| El contrato de FE cambia de nombres al publicarse | El mock y los tipos viven en un solo archivo; la fase E los ajusta |
| 5.000 inserciones por ciclo en `facturas_operativas` | Paginas de 200 y una transaccion por pagina. Medir en la prueba conjunta |
| Memoria de la API con archivos de 20 MB | Limite de 2 subidas simultaneas. Medir antes del primer cliente. Dato de FE: 5.000 comprobantes de 3 lineas pesan 2,9 MB, asi que el tope de 20 MB tiene margen |
| Sin dato de volumen real (D-6) | Declarado en el SPEC. Medir con el primer cliente antes de habilitarlo |
| Un contexto pasa de `SERVICIO` a `CLIENTE` con facturas ya emitidas | Aviso en el backoffice. La proteccion real es la validacion de FE sobre su numerador |
| La forma de numerar queda distinta en FS y en FE | FE rechaza la carga con el motivo y FS lo muestra. El aviso del backoffice de FS recuerda configurar tambien FE. Mejora posible: que FE publique la configuracion del numerador y FS la lea, en vez de duplicarla |
| El filtro por perfil deja sin ver cargas a un usuario que cambia de contexto | Es el comportamiento de la segmentacion vigente. Soporte interno ve todas |
