# SPEC Carga masiva de facturas por archivo v0.1

**Fecha:** 2026-11-07. **Estado:** fases A a D implementadas y validadas contra el mock (2026-11-07), por decision del usuario, sobre el contrato publicado por FE. Fase E: ver `TASKS`. Sigue `PLAN_CARGA_MASIVA_FACTURAS_v0.1.md` y `TASKS_CARGA_MASIVA_FACTURAS_v0.1.md`.
**Origen:** pedido de `facturacion-electronica` (FE), `docs/PEDIDO_FACTURACION_SIMPLE_CARGA_MASIVA_v0.1.md`. El contrato de FE esta publicado en su guia de consumidores (seccion 36) y en `tecnica/openapi.yaml`, paquete v0.14, commit `c0d036b` de FE (seccion 6).
**Procedencia de las decisiones:** numeracion, documentos, roles y rama llegaron por la sesion de FE (seccion 13 del pedido). D-1 a D-8 y D-14 las respondio el usuario directamente; D-9 a D-13 son propuestas de FS aprobadas por el usuario el 2026-11-07.

## 1. Problema

Un cliente de uso masivo no puede cargar miles de facturas una por una. Su equipo de ventas arma un CSV con las ventas del dia y quiere subirlo, entender los errores, confirmar y ver el resultado desde FS. FE valida, emite y envia a SIFEN.

El resultado de SIFEN llega en minutos o en horas: la persona sube, se va y vuelve.

## 2. Alcance

**Entra:**

- Pestana "Carga masiva" dentro de "Documentos", junto a Facturas y Notas de credito.
- Plantilla, subida, informe de validacion, confirmacion, avance, resultado por comprobante, archivo de resultado, reintento, cancelacion y listado de cargas (N1 a N13 del pedido).
- Las facturas de una carga aparecen en la pestana Facturas, con KuDE, cancelacion y nota de credito por las rutas actuales.
- Configuracion de la forma de numerar por contexto operativo (seccion 5).
- Bandera de instancia `CARGA_MASIVA_ENABLED`, apagada por defecto: apagada, nada de esto es visible ni accesible.

**No entra:**

- Otros tipos de documento por archivo, y pestanas de Notas de debito, Remision o Autofactura: FS no emite esos tipos.
- Saldo por documento: FS no lo calcula hoy y las cuentas corrientes estan excluidas de esta version (`AGENTS.md`). Queda registrado en `docs/BACKLOG.md` (D-4).
- Descarga en bloque de KuDE o XML de una carga: FE no la ofrece en su fase 1.
- Armar o convertir el archivo desde FS: el cliente sube el archivo de su sistema y es responsable de su contenido (D-2).
- Validar el contenido fiscal del CSV en FS. Es de FE. FS tampoco interpreta el CSV de resultado: lo reenvia.
- Correccion de comprobantes rechazados desde la carga: va por `SPEC_AUTOGESTION_OPERADOR_v0.1.md`.
- Despliegue en `segel-fs`, y cualquier prueba alli.

## 3. Reglas

### Subida y validacion

- **RN-01.** FS entrega el archivo a FE sin modificarlo (P-04): FE detecta un archivo repetido por su contenido. FS tampoco lo conserva, ni en disco ni en la base.
- **RN-01b.** El tamano del archivo lo limita FE, no FS. Cada tope del camino es mayor que el siguiente, para que el `413` lo de siempre FE con su mensaje y su `tope_bytes`: nginx del frontend 25 MB > API de FS 24 MB (`CARGA_MAX_BYTES`, configurable) > FE 20 MB (`CARGA_MAX_BYTES` de FE, configurable). Si FE sube su tope, soporte sube los de FS en el mismo orden. Con la densidad medida por FE (5.000 comprobantes de dos lineas en 1,65 MB, unos 165 bytes por linea), su limite de 100.000 lineas ocupa unos 16,5 MB: entra en los 20 MB de FE y con margen en los 24 MB de FS. Decidido por el usuario (D-14).
- **RN-02.** Antes de llamar a FE, el backend valida tenant, suscripcion, usuario, facturador y contexto operativo listo para emitir, con las mismas comprobaciones de `GET /me/readiness` que habilitan "Nueva factura" en la app. `emisor_id`, perfil, actividad, establecimiento y punto salen de ese contexto, nunca del navegador.
- **RN-03.** Una carga cubre un perfil y un punto: los del contexto operativo activo del usuario al subir. La pantalla los muestra antes de subir. Un archivo trae ventas de un solo punto, y debe ser el del perfil (D-3). Lo verifica FE, porque FS no lee el contenido. Si una sola fila trae otro punto, FE rechaza el archivo entero y no procesa nada.
- **RN-04.** Los textos de error y aviso de FE se muestran tal como llegan, con codigo, fila y columna (P-05). Un texto incomprensible se corrige en FE.
- **RN-04b.** El numero de fila es el de una planilla: los titulos son la fila 1 y una linea vacia cuenta. La pantalla lo aclara, y no traduce ni agrupa los codigos de FE: la lista de codigos puede crecer. Los codigos conocidos al publicarse el contrato estan en la seccion 6.
- **RN-05.** Los errores se corrigen en el archivo, no en la pantalla. La pantalla lo dice y no ofrece editar datos.

### Confirmacion y acciones

- **RN-06.** Nada se emite sin confirmacion de una persona. FE no tiene modo automatico: la subida no lleva parametro `modo`.
- **RN-07.** Antes de confirmar se muestra cuantos comprobantes se emitiran y cuantos quedan afuera. Confirmar emite facturas reales, y la pantalla lo dice. Con numeracion del cliente, confirmar con comprobantes invalidos deja sus numeros salteados: la pantalla lo avisa antes.
- **RN-08.** Los botones Confirmar, Cancelar y Reintentar dependen de `acciones` de FE: FS no deduce reglas por estado. Si FE responde `409 CARGA_ACCION_NO_ADMITIDA`, FS toma `details.acciones` y `details.estado`, actualiza su copia y refresca la pantalla: no es una falla del sistema.
- **RN-09.** Un rechazo de SIFEN no se reintenta solo: queda informado con su motivo. Los numeros salteados se avisan; inutilizarlos es del cliente.
- **RN-09b.** Un comprobante en `ERROR` es un fallo de FE, no un rechazo. FE lo reintenta solo hasta 3 veces; despues la carga no termina hasta que alguien lo reintente o lo cancele. La pantalla lo dice y ofrece las dos acciones, segun `acciones`.
- **RN-09c.** Cancelar alcanza a los comprobantes `PENDIENTE` y `ERROR`. Los ya preparados siguen su curso, y la pantalla lo avisa antes de cancelar. Lo que FE ya tomo para firmar tambien termina: justo despues de cancelar pueden verse unos pocos pendientes que en segundos pasan a preparados, y la carga sigue `EN_SIFEN` hasta `FINALIZADA`, con `cancelada_en`. La pantalla no muestra eso como falla.
- **RN-09d.** FE prepara una carga por emisor a la vez. Una carga confirmada que espera a otra queda `EN_COLA`: la pantalla la muestra como "En espera de otra carga", distinta de "Emitiendo".
- **RN-09e.** Si un comprobante no consigue su numero, los siguientes esperan: FE no adelanta numeros. Al tercer intento queda `ERROR` y el resto sigue. Un archivo que hace fallar al servicio tres veces queda `RECHAZADA` con `ERROR_INTERNO`: la pantalla lo muestra como problema del servicio, no del archivo.

### Permisos (decision de FS, criterio del usuario)

- **RN-10.** Sin rol nuevo. Subir, confirmar, cancelar y reintentar: cualquier usuario `OPERADOR_FACTURACION` con contexto operativo en ese facturador; subir y confirmar exigen ademas que el contexto este listo para emitir (RN-02), cancelar y reintentar no. No hace falta que confirme quien subio. `SOPORTE_INTERNO` y `ADMIN_INTERNO` tambien pueden, y son los unicos que ven los lotes SIFEN de una carga.
- **RN-11.** Un usuario ve solo las cargas de su facturador y de su contexto operativo, los roles internos ven todas las del facturador (D-12). **Diferencia con Facturas:** `GET /facturas` hoy filtra solo por facturador, sin perfil, asi que una factura de carga la ven todos los operadores del facturador aunque la carga no. Una carga ajena responde `404`, tambien por identificador directo. Queda auditado quien subio, quien confirmo, quien cancelo y quien reintento.

### Facturas en "Documentos" (Usuario)

- **RN-12.** Un comprobante entra a `facturas_operativas` cuando FE informa su `document_uuid`, con snapshot de cliente, items y totales armado con `detalle` de FE. `usuario_id` es quien confirmo la carga.
- **RN-13.** `INVALIDO`, `CANCELADO`, `PENDIENTE` y `ERROR` no crean documento: nunca tienen `document_uuid`. `DUPLICADO` tampoco: es un comprobante ya emitido antes, por otra carga o en linea, y la pantalla enlaza al documento existente si esta en FS (por `document_uuid`). Uno repetido dentro del mismo archivo llega como `INVALIDO`.
- **RN-14.** Incorporar es idempotente: `external_ref = carga:<carga_id de FE>:<orden>`, unico por facturador. Repetir la sincronizacion no duplica ni pisa un estado final.
- **RN-15.** La identidad es el `document_uuid` (`AGENTS.md`). El `estado` del comprobante dice como termino la emision y no cambia despues; el estado vigente sale de `documento_estado`, que FE suma al comprobante, con la misma traduccion que el resto de los documentos (`mapDocumentStatusCanonico`).
- **RN-15b.** FE admite cantidades decimales en el archivo. FS las conserva en el documento: `factura_items_snapshot.cantidad` pasa a `numeric(18,6)`. La nota de credito copia los items sin recalcular, asi que funciona. **Limite conocido:** "Corregir y emitir de nuevo" sobre una factura con cantidad decimal abre el editor, que solo admite enteras: el operador debe ajustar la linea. Las facturas emitidas una por una siguen siendo enteras.
- **RN-16.** Incorporar una factura no crea ni modifica clientes de la agenda ni items del catalogo: un archivo no puede sobrescribir datos de otros (FS-17).

### Sincronizacion

- **RN-17.** Las facturas de carga no entran en la agenda del worker de verificacion (`verificacion_next_at` nulo). Un worker propio consulta las cargas activas, paginado, con `actualizado_desde`. **Motivo:** el worker actual consulta documento por documento con `refresh=true`: una carga de 5.000 serian 5.000 consultas a SIFEN por ciclo.
- **RN-18.** "Verificar estado fiscal" sigue disponible en cada factura, como en las demas.
- **RN-19.** Un fallo al consultar a FE no cambia ningun estado y se reintenta en el intervalo siguiente: la pantalla muestra la hora de la ultima actualizacion. "En SIFEN" puede durar horas y no se marca como fallo por tiempo.

## 4. Pantalla

**PC primero** (decision del usuario, 2026-11-06): la carga se hace normalmente desde una computadora, asi que esta seccion se disena para escritorio, a partir de 1280 px. Es una excepcion declarada al criterio mobile primero del resto del sistema. En pantalla angosta debe seguir siendo usable: la tabla se vuelve tarjetas y no hay desplazamiento horizontal. La subida debe ser intuitiva: elegir o arrastrar el archivo, sin pasos previos. Usa los componentes y estilos de `web-operacion` (`filter-tabs`, `list-toolbar`, `documents-view`). El diseno es de FS: la pantalla de otro producto que mostro el usuario es referencia de contenido, no un modelo a copiar.

| Vista | Contenido |
|---|---|
| Listado | Cargas por fecha y estado, con archivo, totales y avance. "Nueva carga" y "Descargar plantilla". Filtro por estado y por fecha de recepcion |
| Nueva carga | Facturador, punto y perfil que se usaran; forma de numerar; seleccion del archivo (`.csv` o `.zip`, hasta 20 MB y 100.000 lineas, los topes de FE). Un aviso fijo: "Confirmar emite facturas reales" |
| Informe | Validos, con error y con aviso. Por comprobante: numero, filas, referencia de venta, codigo y mensaje por error o aviso, con la columna. Filtros `estado` y `con_advertencias`. Confirmar o cancelar |
| Avance | Totales de la carga, ultima actualizacion, y que se puede cerrar la pantalla. En `EN_COLA`: "En espera de otra carga". En `EN_SIFEN` dice que sigue esperando a SIFEN y que puede tardar horas: no es un error. Tiempos normales medidos por FE con 5.000 comprobantes: validacion en 11 s, unos 100 comprobantes por minuto al preparar, envio de unas dos horas por carga de 5.000. El ultimo lote, el de menos de 50, puede esperar hasta 15 min: una carga chica queda "en SIFEN" ese rato sin anomalia. La pantalla no promete hora de fin |
| Resultado | Por comprobante: numero asignado, numero del archivo, referencia de venta, estado, CDC, codigo y mensaje de SIFEN, correo y enlace al documento en FS. Filtros y descarga del CSV de resultado |

Mensajes propios de FS, en lenguaje simple:

| Situacion | Origen | Mensaje |
|---|---|---|
| Archivo repetido | Copia local con el mismo SHA-256 (D-13) o `200` de FE | Abre la carga anterior y lo dice. Si se subio con el perfil equivocado hay que cancelarla y subir de nuevo: el mismo archivo con otro perfil es la misma carga |
| Archivo repetido en otro contexto operativo | Copia local con el mismo SHA-256 que el usuario no puede ver (RN-11) | `409`: "Este archivo ya fue subido en otro contexto de este facturador. Quien lo subio debe cancelarlo, o contactar a soporte". No abre la carga ajena |
| Archivo demasiado grande | `413` de FE (lo normal, RN-01b) o de FS (solo si los topes quedaron mal configurados) | Indica el tope en MB con `tope_bytes` y pide partir el archivo |
| Demasiadas cargas en espera | `429 CARGA_COLA_LLENA` | Indica la espera de `Retry-After` |
| Cuota diaria superada | `429 CARGA_CUOTA_DIARIA` | Indica la espera y que la cuota la fija soporte |
| Sin permiso | `403` | Pide contactar a soporte |
| Funcion no habilitada para el facturador | `404` de FE en la subida | "La carga por archivo no esta habilitada para este facturador": falta el permiso `CARGA_MASIVA`, se resuelve con soporte. No se muestra como "no encontrado" |
| Configuracion que no coincide | `422 CARGA_PARAMETROS_INVALIDOS` | Muestra cada motivo de `details.motivos` y pide contactar a soporte. No es un problema del archivo |
| FE no responde | error de red o `5xx` | "No se pudo consultar el servicio. Se muestra lo ultimo conocido, actualizado a las HH:MM" |

La pestana Facturas no cambia de columnas en esta version; las facturas de carga llevan una marca "Carga" que enlaza a su carga, y muestran el numero del archivo cuando difiere del asignado.

## 5. Numeracion (Usuario)

| Forma | `numeracion` en la subida | Numero de la factura |
|---|---|---|
| Automatica | `SERVICIO` | Lo asigna FE. El del archivo vuelve como referencia |
| Del cliente | `CLIENTE` | El del archivo |

- **RN-20.** Un numerador usa una sola forma de numerar. En FE, el numerador es unico por emisor, establecimiento, punto y tipo de documento. FE rechaza con `422` una carga cuya `numeracion` no coincide con la configurada en el punto.
- **RN-21.** FS guarda la forma de numerar facturas por contexto operativo (`actividad_punto_perfiles.numeracion_facturas`), con `SERVICIO` por defecto, y la manda en cada subida. La cambia solo un rol interno, desde el backoffice. Decidido por el usuario (D-1).
- **RN-21b.** FE tambien la guarda, en su numerador, por punto y tipo de documento, y se configura desde su backoffice. **Ante una diferencia manda FE:** si lo que envia FS no coincide, FE rechaza la carga con el motivo y FS lo muestra. Soporte debe configurar el mismo valor en los dos sistemas; el backoffice de FS lo recuerda al cambiarlo.
- **RN-21c.** `POST /v1/factura` de FE no cambia: FE no rechaza una factura emitida una por una sobre un numerador del cliente. La unica proteccion contra ese cruce es RN-22, en FS.
- **RN-22.** En un contexto `CLIENTE`, `POST /facturas` responde `409 CONFLICT` con `details.reason = "NUMERACION_DEL_CLIENTE"` y no encola nada; la interfaz no ofrece "Nueva factura" ni "convertir en factura" para ese contexto y explica por que. Las notas de credito siguen disponibles: usan otro numerador y FE no las rechaza.
- **RN-23.** Esta forma de numerar es una excepcion aprobada a la regla general: la decide el archivo del cliente, nunca el frontend, que no calcula ni incrementa numeros.

## 6. Contrato con FE

Rutas `/v1/cargas` con la clave de consumidor del facturador (`facturadores.fe_consumer_api_key`) y el permiso `CARGA_MASIVA`, que FE no otorga por defecto: sin el permiso, o con la funcion apagada en la instancia (`CARGAS_ENABLED`), todas responden `404`. FS consume solo lo publicado y usa los nombres de FE sin traducir.

**Publicado por FE (2026-11-06):** guia de consumidores seccion 36 y `tecnica/openapi.yaml` con las diez operaciones, paquete v0.14 (commit `c0d036b` de FE). Esta en la rama `feat/capacidad-200-clientes` de FE, **sin push ni tag**: no hay imagen de FE que FS pueda desplegar con esto. Las fases A a D no lo necesitan; la fase E usa el stack local de FE.

| Operacion de FE | Uso en FS |
|---|---|
| `POST /v1/cargas` | Subida. `202` carga nueva, `200` archivo ya subido |
| `GET /v1/cargas/formatos/csv/1` | Plantilla |
| `GET /v1/cargas` | No se usa: FS lista desde su base |
| `GET /v1/cargas/{carga_id}` | Detalle y refresco |
| `GET /v1/cargas/{carga_id}/comprobantes` | Informe, resultado y sincronizacion (`estado`, `con_advertencias`, `actualizado_desde`, `detalle`, `page`, `limit` hasta 200) |
| `POST .../confirmar`, `/cancelar`, `/reintentar` | Acciones. `409 CARGA_ACCION_NO_ADMITIDA` con `details.estado` y `details.acciones` |
| `GET .../resultado` | CSV de resultado, reenviado sin leer |
| `GET .../lotes` | Solo roles internos |

Lo pedido en la seccion 14 del pedido quedo publicado: `numero_asignado` y `numero_archivo` (iguales con numeracion del cliente); `detalle=true` con `fecha`, `tipoTransaccion`, `receptor`, `condicionOperacion`, `items` y `total`, con los nombres de `POST /factura`; `actualizado_desde`; tope de 20 MB, ya no provisional.

**Limites de FE (guia 36.8):** 5.000 comprobantes y 100.000 lineas por archivo; 999 items y 3 medios de pago por comprobante; 8 cargas en espera por emisor (`429 CARGA_COLA_LLENA`; una `VALIDADA` sin confirmar no cuenta); cuota diaria de comprobantes por consumidor y emisor, que fija el administrador de FE (`429 CARGA_CUOTA_DIARIA`). Todo `429` trae `Retry-After` y `details.retry_after_seconds`. `fecha_emision` hasta 30 dias atras y 5 adelante; con mas de 5 de atraso se emite con la advertencia `TRANSMISION_EXTEMPORANEA`.

**Codigos conocidos,** que la pantalla muestra sin traducir (RN-04b): motivos de carga `COLUMNA_DESCONOCIDA`, `TOPE_SUPERADO`, `ERROR_INTERNO`; errores de comprobante `TOTAL_NO_COINCIDE`, `NUMERO_YA_USADO`; advertencias `NUMEROS_SALTEADOS` y `SALTO_GRANDE` (con `cantidad`), `TRANSMISION_EXTEMPORANEA`; motivo de subida `ACTIVIDAD_NO_CUBIERTA`.

**Duplicado (guia 36.4):** un comprobante con el mismo numero en el mismo punto y el mismo comprador, fecha y total que una factura ya emitida es `DUPLICADO` con el `document_uuid` existente. Con otro comprador, fecha o total, es `INVALIDO` con `NUMERO_YA_USADO`.

**Sin publicar:** las columnas del CSV de `/resultado` (el OpenAPI lo declara como texto). FS lo reenvia sin leerlo, asi que no lo bloquea.

Rutas propias de FS: PLAN, seccion 5, y `spec/openapi.yaml`.

## 7. Impacto en FS

- **Base de datos:** migracion `0037_carga_masiva.sql`: tabla `cargas_masivas`, `actividad_punto_perfiles.numeracion_facturas`, `facturas_operativas.carga_masiva_id` y `carga_numero_archivo`. Aditiva, salvo ampliar `factura_items_snapshot.cantidad` a `numeric(18,6)` (RN-15b), que reescribe la tabla y no pierde datos.
- **API:** modulo `cargas`; subida de archivos, que hoy no existe (el limite global de 1 MB aplica solo a JSON); worker de sincronizacion; `409 NUMERACION_DEL_CLIENTE` en `POST /facturas`; `numeracion_facturas` y `carga_masiva_habilitada` en `GET /me/context`; filtro `carga_id` y campo `carga` en `GET /facturas`.
- **Tamano de subida (RN-01b):** el nginx del contenedor del frontend (`infra/nginx-or-caddy/nginx.local.conf`) no fija `client_max_body_size`, asi que hoy corta en 1 MB: hay que fijarlo en 25 MB en `location /api/v1/`. Los nginx de host (`host-segel-fs.conf`, `host-production.conf`, `host-factura-multi-env.conf`) ya tienen 25 MB. La API de FS acepta 24 MB por defecto. El NGINX publico de infraestructura, si existe, debe admitir al menos 25 MB; lo ajusta infraestructura.
- **Alta de facturadores:** `scripts/segel-fs/cargar-facturador.py` debe poder otorgar `CARGA_MASIVA` y fijar `cargas_cuota_diaria` por emisor, de forma opcional y nunca por defecto.
- **Despliegue:** `worker-cargas` de FE (P-07) se suma a `scripts/segel-fs/build-images.sh`, `deploy.sh` y `up.sh` cuando FE publique el tag. FE exige `EMISSION_RESUME_DRAFT_ENABLED=true` junto con `CARGAS_ENABLED=true`: se confirma con FE en la fase E.

## 8. Criterios de aceptacion

- **CA-01.** Una persona sin ayuda descarga la plantilla, sube un archivo, entiende los errores por fila y columna, confirma y ve el resultado.
- **CA-02.** Sin confirmar, FE no recibe ninguna orden de emitir.
- **CA-03.** Subir dos veces el mismo archivo abre la carga anterior y no crea otra.
- **CA-04.** Un usuario de otro facturador o de otro perfil no ve la carga, ni por identificador directo.
- **CA-05.** Una factura de carga se ve en Facturas, descarga su KuDE, y se cancela o recibe nota de credito como las demas.
- **CA-06.** Sincronizar dos veces no duplica documentos ni revierte un estado final.
- **CA-07.** Una carga de 5.000 comprobantes no agrega consultas `refresh=true` a SIFEN desde el worker de verificacion.
- **CA-08.** Con FE caido, la pantalla informa la ultima actualizacion y ningun estado cambia.
- **CA-09.** Un archivo incorporado no modifica la agenda ni el catalogo.
- **CA-10.** Nada de la interfaz, los textos o los correos sale con la marca Ventax en la instancia Segel.
- **CA-11.** Validacion visual con Playwright, en 1280 px primero y en 390 px, contra el stack de `bash scripts/deploy.sh` con el gateway en modo mock. Prueba conjunta P-06 con FE local. Nunca en `segel-fs`.
- **CA-12.** Con `CARGA_MASIVA_ENABLED=false`, las rutas `/cargas` responden `404`, la pestana no aparece y `GET /facturas` y `GET /me/context` no cambian de forma salvo los campos nuevos con su valor por defecto.
- **CA-13.** En un contexto `CLIENTE`, "Nueva factura" no se ofrece y `POST /facturas` responde `409`; una nota de credito se emite igual.
- **CA-14.** El archivo que recibe FE tiene el mismo SHA-256 que el que eligio el usuario.
- **CA-15.** Un archivo de 21 MB atraviesa el nginx y la API de FS y recibe el `413` de FE con `tope_bytes`; uno de 2 MB sube sin tocar ningun limite de FS.

## 9. Decisiones

| ID | Que | Decision del usuario |
|---|---|---|
| D-1 | Donde vive la forma de numerar | Por contexto operativo, en FS (RN-21). Ademas en el numerador de FE, que manda ante una diferencia (RN-21b) |
| D-2 | Origen del archivo | El cliente sube el CSV de su sistema, tal cual, y es responsable de su contenido |
| D-3 | Varios puntos en un archivo | No. Un solo punto, que debe coincidir con el del perfil (RN-03) |
| D-4 | Saldo | Fuera de esta version. Queda registrado en el backlog |
| D-5 | Nota de credito desde un punto con numeracion del cliente | Cerrada con FE: se permite, usa otro numerador (RN-22) |
| D-6 | Primer cliente y volumen | Todavia no hay cliente. Se prepara la funcion y se prueba con los clientes de prueba, en local |
| D-7 | Orden frente a FS-24 y autogestion | Lo define FS: seccion 2 del PLAN |
| D-8 | Cuando implementar | 2026-11-07: ahora, sobre el contrato publicado. La migracion `0037` se escribe primero y viaja en el proximo despliegue con la bandera apagada; no tiene efecto visible: columnas con valor por defecto y una cantidad mas ancha |
| D-9 | Version de los documentos | Se refina v0.1 en lugar de abrir v0.2: el alcance no cambio, solo el estado del contrato de FE. Aprobada 2026-11-07 |
| D-10 | `404` de FE en la subida | FS lo devuelve como `409 CONFLICT` con `details.reason = CARGA_MASIVA_NO_HABILITADA_EN_FE` y la pantalla dice que la funcion no esta habilitada para el facturador, nunca "no encontrado" (seccion 4; PLAN 5.3). Aprobada 2026-11-07 |
| D-11 | Totales del snapshot | Si el total que calcula FS desde `detalle` difiere del `total` de FE, manda FE, que es lo que esta en el XML; FS lo registra en el log y guarda el de FE en `fiscal_response_snapshot.total_fe` (PLAN 6). Aprobada 2026-11-07 |
| D-12 | Quien ve las cargas | Operadores: solo las de su contexto operativo. `SOPORTE_INTERNO` y `ADMIN_INTERNO`: todas las del facturador (RN-11). Aprobada 2026-11-07. Se habia descrito como "igual que en `GET /facturas`": es inexacto, ver RN-11 |
| D-13 | Archivo repetido | Si el mismo SHA-256 ya tiene en FS una carga del facturador que no esta `RECHAZADA` ni `CANCELADA`, FS devuelve esa carga sin llamar a FE cuando el usuario puede verla, y `409` cuando pertenece a otro contexto operativo (seccion 4); en los demas casos FE decide con su `200` (PLAN 5.3). Aprobada 2026-11-07 |
| D-14 | Tamano del archivo | FS no limita por debajo de FE: nginx 25 MB > API de FS 24 MB > FE 20 MB, todos configurables (RN-01b). El limite de 100.000 lineas de FE cabe en su tope de 20 MB. Decidida por el usuario 2026-11-07 |

**Abierto con FE:** que publique la rama con un tag e imagenes; la prueba de punta a punta en SIFEN test (su CMA-604, pendiente de autorizacion); si `EMISSION_RESUME_DRAFT_ENABLED=true` es requisito en produccion. Nombres y tope ya estan fijados en el OpenAPI publicado.

**Correo:** FE lo envia despues de la aprobacion de SIFEN; el estado del correo de un comprobante aparece recien entonces (`correo`: `PENDING`, `SENT`, `FAILED`, o nulo sin direccion). Recibos por archivo: fuera de la primera etapa.

**Sin dato de volumen (D-6):** no hay cifra para dimensionar. Los topes son los de FE (5.000 comprobantes, 100.000 lineas y 20 MB por archivo); FS solo se asegura de no cortar antes (RN-01b). Antes del primer cliente real hay que medir con su volumen.
