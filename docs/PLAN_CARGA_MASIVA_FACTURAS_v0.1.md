# PLAN Carga masiva de facturas por archivo v0.1

**Fecha:** 2026-11-06. **SPEC:** `docs/SPEC_CARGA_MASIVA_FACTURAS_v0.1.md`. **Rama:** `feat/identidad-segel`, sin merge a `master`.

## 1. Enfoque

FS no valida ni transforma el archivo: lo recibe, comprueba permisos y contexto, y lo reenvia a FE. FS guarda una fila por carga y copia a "Documentos" las facturas que FE va creando.

El contrato de FE todavia no esta publicado. Por eso el trabajo se parte en dos:

- **Fases A a D, contra un mock:** no dependen de FE. El mock devuelve las formas de las secciones 7, 12 y 14 del pedido.
- **Fase E, contra FE real:** empieza cuando FE publique su OpenAPI en `facturacion-electronica-consumer-docs` y avise que la subida y la validacion corren en su stack local. Hasta entonces no se escribe el cliente real (`AGENTS.md`: solo se consume lo publicado).

## 2. Orden de trabajo (D-7)

| Orden | Trabajo | Por que en ese lugar |
|---|---|---|
| 1 | Carga masiva, fases A a D | FE esta cerrando su contrato ahora: lo que la pantalla necesite se pide en este momento. No depende de ningun tag |
| 2 | FS-25, acciones de "Administracion fiscal" | Chico e independiente. **Espera una decision del usuario:** retirarlas o darles autenticacion |
| 3 | Carga masiva, fase E | Depende de que FE publique e implemente |
| 4 | FS-24, verificacion de documentos en lote | Depende del tag de FE con `RECONCILE_DEFERRED_ENABLED`; antes no puede activarse |

Ninguno de los cuatro se despliega sin confirmacion directa del usuario.

## 3. Base de datos: migracion `0037_carga_masiva.sql`

Aditiva. No modifica migraciones aplicadas.

- `actividad_punto_perfiles.numeracion_facturas text not null default 'SERVICIO'`, con check `('SERVICIO','CLIENTE')`.
- Tabla `cargas_masivas`: `id`, `tenant_id`, `facturador_id`, `actividad_punto_perfil_id`, `fe_carga_id` (unico por facturador), `nombre_archivo`, `numeracion`, `estado`, `totales jsonb`, `acciones jsonb`, `subida_por`, `confirmada_por`, `cancelada_por`, `sincronizada_hasta timestamptz`, `sincronizada_en timestamptz`, `sync_next_at timestamptz`, `created_at`, `updated_at`. Indice por `(facturador_id, created_at desc)` y por `sync_next_at` donde no es nulo.
- `facturas_operativas.carga_masiva_id uuid` (referencia, nula) y `carga_numero_archivo text`. Indice parcial por `carga_masiva_id`.

`estado`, `totales` y `acciones` son una copia de lo que informa FE, para listar sin llamar a FE. La fuente es FE.

## 4. Fase A: forma de numerar por contexto

- `PATCH /backoffice/contextos/:id` acepta `numeracion_facturas`. Solo roles internos, con evento de auditoria. `GET` la devuelve.
- La pantalla de contextos del backoffice muestra y permite cambiar el valor, con un aviso: cambiarla en un punto que ya emitio puede cruzar numeros.
- `context.repository` y `OperationalContextResponse.fiscal_context` suman `numeracion_facturas`.
- `POST /facturas` responde `409 NUMERACION_DEL_CLIENTE` si el contexto es `CLIENTE` (RN-22). La regla vive en el backend; la interfaz solo oculta "Nueva factura" y explica por que.
- Notas de credito: sin cambios.
- Notas y presupuestos: "convertir en factura" queda sujeto a la misma regla.

## 5. Fase B: API de cargas

Modulo nuevo `apps/api/src/modules/cargas/` (rutas, servicio, repositorio, tipos). Todas las rutas con `requireAuth` y contexto operativo.

| Ruta de FS | Llama a FE | Notas |
|---|---|---|
| `GET /cargas/plantilla` | `GET /v1/cargas/formatos/csv/1` | Descarga |
| `POST /cargas` | `POST /v1/cargas` | `multipart`, campo `archivo`. Ver abajo |
| `GET /cargas` | — | Desde la base de FS, paginado, filtros por fecha y estado |
| `GET /cargas/:id` | `GET /v1/cargas/{id}` | Refresca la copia local. Si FE falla, devuelve la copia con `sincronizada_en` |
| `GET /cargas/:id/comprobantes` | Igual en FE | Pasa pagina, tamano y filtros. Suma `documento_id` de FS cuando existe |
| `POST /cargas/:id/confirmar` | Igual en FE | Guarda `confirmada_por` y agenda la sincronizacion |
| `POST /cargas/:id/cancelar`, `/reintentar` | Igual en FE | Auditados |
| `GET /cargas/:id/resultado` | Igual en FE | Descarga CSV |

**Subida:**

- Dependencia nueva: `multer`, con almacenamiento en memoria. Limite `CARGA_MAX_BYTES`, 20 MB por defecto. El archivo no se escribe en disco ni se guarda.
- Como mucho 2 subidas a la vez por proceso; la tercera responde `429`. Tope de memoria: 40 MB mas la copia del reenvio.
- FS manda a FE los bytes recibidos, sin tocarlos, con `emisor_id`, `formato=CSV`, `version=1`, `numeracion` del contexto, perfil (salvo `NO_REQUERIDO`), actividad, establecimiento y punto. FE exige que perfil y punto coincidan, y rechaza el archivo entero si una fila trae otro punto.
- Clave: la de consumidor del facturador (`resolveConsumerGateway`). Sin clave propia, `409` con mensaje claro: no se usa la compartida.
- Tiempo de espera propio para la subida: 60 s.
- `202` y `200` de FE crean o reutilizan la fila local por `fe_carga_id`. El `200` responde con `repetida: true`.
- Errores de FE: `403`, `413`, `422` y `429` se devuelven con su codigo y el mensaje de FE; no se convierten en `502`.

**Aislamiento:** toda consulta filtra por `facturador_id` y por `actividad_punto_perfil_id` del contexto. Una carga ajena responde `404`.

**Gateway:** metodos nuevos en `FiscalGateway`, implementados en `MockFiscalGateway`. En `RealFiscalGateway` quedan sin implementar hasta la fase E y responden `501 CARGA_MASIVA_NO_DISPONIBLE`. Bandera `CARGA_MASIVA_ENABLED`, `false` por defecto: apagada, las rutas responden `404` y la pestana no se muestra.

**Contrato:** rutas y esquemas en `spec/openapi.yaml`.

## 6. Fase C: sincronizacion con "Documentos"

Worker nuevo `cargas-sync.worker.ts`, arrancado en `server.ts` junto a los otros dos. Apagable con `CARGAS_SYNC_INTERVAL_MS=0`.

1. Toma cargas con `sync_next_at <= now()`, con `for update skip locked`.
2. Pide `GET /v1/cargas/{id}` y actualiza estado, totales y acciones.
3. Solo si los totales cambiaron respecto de la copia local, pide los comprobantes con `actualizado_desde = sincronizada_hasta` y con detalle, pagina por pagina.
4. Por cada comprobante con `document_uuid`: inserta o actualiza en `facturas_operativas` por `(facturador_id, external_ref)`, con `external_ref = carga:<fe_carga_id>:<orden>`.
5. Avanza `sincronizada_hasta` solo si todas las paginas se procesaron.

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
- **Campos:** `usuario_id` es quien confirmo; `actividad_punto_perfil_id` el de la carga; `numero_fiscal` el `numero_asignado`; `carga_numero_archivo` el `numero_archivo`; `verificacion_next_at` nulo (RN-17); `email_estado` segun `correo`; snapshots e items desde el detalle.
- **Frecuencia:** 1 min mientras la carga este `VALIDANDO` o `EN_PREPARACION`; 5 min en `EN_COLA` y `EN_SIFEN`. Una carga `VALIDADA` sin confirmar no se sincroniza: no cambia sola. En `EN_SIFEN` los resultados no llegan antes de unos 10 min del envio de cada lote. Al llegar a `FINALIZADA`, `RECHAZADA` o `CANCELADA` hace una pasada mas y deja `sync_next_at` nulo: desde ahi, un cambio hecho fuera de FS se ve con "Verificar estado fiscal". Pasadas 72 h sin terminar, sigue cada 30 min y registra un aviso: puede ser SIFEN lento o un comprobante en `ERROR` que espera reintento o cancelacion.
- **Fallo de FE:** no cambia nada y reintenta en el intervalo siguiente (RN-19).
- **No toca** `facturador_clientes`, `cliente_identidades` ni el catalogo (RN-16).

## 7. Fase D: pantalla

Componente nuevo en `apps/web-operacion/src/carga-masiva.tsx`: `main.tsx` ya tiene 7.777 lineas. Se monta como tercera pestana de `DocumentsView` (`docKindTab = "CARGA_MASIVA"`), con las clases existentes.

- Vistas del SPEC, seccion 4: listado, nueva carga, informe, avance y resultado.
- Mientras una carga activa esta en pantalla, se refresca cada 15 s; se detiene al ocultar la pestana del navegador.
- Confirmar pide una segunda confirmacion con la cantidad a emitir.
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
- Playwright contra el stack de `bash scripts/deploy.sh` con el mock: mobile 390 px y desktop 1280 px. Escenarios: archivo rechazado, informe con errores y avisos, confirmar, carga en espera de otra, avance, comprobante en error con reintento, resultado, archivo repetido, punto con numeracion del cliente sin "Nueva factura".
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
