# SPEC Carga masiva de facturas por archivo v0.1

**Fecha:** 2026-11-06. **Estado:** decisiones cerradas por el usuario el 2026-11-06 (seccion 9). Sigue `PLAN_CARGA_MASIVA_FACTURAS_v0.1.md`.
**Origen:** pedido de `facturacion-electronica` (FE), `docs/PEDIDO_FACTURACION_SIMPLE_CARGA_MASIVA_v0.1.md`, con sus secciones 12 y 13. El contrato de FE es una propuesta: nada esta implementado.
**Procedencia de las decisiones:** numeracion, documentos, roles y rama llegaron por la sesion de FE (seccion 13 del pedido). D-1 a D-7 las respondio el usuario directamente.

## 1. Problema

Un cliente de uso masivo no puede cargar miles de facturas una por una. Su equipo de ventas arma un CSV con las ventas del dia y quiere subirlo, entender los errores, confirmar y ver el resultado desde FS. FE valida, emite y envia a SIFEN.

El resultado de SIFEN llega en minutos o en horas: la persona sube, se va y vuelve.

## 2. Alcance

**Entra:**

- Pestana "Carga masiva" dentro de "Documentos", junto a Facturas y Notas de credito.
- Plantilla, subida, informe de validacion, confirmacion, avance, resultado por comprobante, archivo de resultado, reintento, cancelacion y listado de cargas (N1 a N13 del pedido).
- Las facturas de una carga aparecen en la pestana Facturas, con KuDE, cancelacion y nota de credito por las rutas actuales.
- Configuracion de la forma de numerar por punto (seccion 5).

**No entra:**

- Otros tipos de documento por archivo, y pestanas de Notas de debito, Remision o Autofactura: FS no emite esos tipos.
- Saldo por documento: FS no lo calcula hoy y las cuentas corrientes estan excluidas de esta version (`AGENTS.md`). Queda registrado en `docs/BACKLOG.md` (D-4).
- Descarga en bloque de KuDE o XML de una carga: FE no la ofrece en su fase 1.
- Armar o convertir el archivo desde FS: el cliente sube el archivo de su sistema y es responsable de su contenido (D-2).
- Validar el contenido fiscal del CSV en FS. Es de FE.
- Despliegue en `segel-fs`, y cualquier prueba alli.

## 3. Reglas

### Subida y validacion

- **RN-01.** FS entrega el archivo a FE sin modificarlo (P-04): FE detecta un archivo repetido por su contenido. FS tampoco lo conserva.
- **RN-02.** Antes de llamar a FE, el backend valida tenant, suscripcion, usuario, facturador y contexto operativo listo para emitir. `emisor_id`, perfil y actividad salen de ese contexto, nunca del navegador.
- **RN-03.** Una carga cubre un perfil y un punto: los del contexto operativo activo del usuario al subir. La pantalla los muestra antes de subir. Un archivo trae ventas de un solo punto, y debe ser el del perfil (D-3). Lo verifica FE, porque FS no lee el contenido: FS le manda el establecimiento y el punto del contexto. Si una sola fila trae otro punto, FE rechaza el archivo entero y no procesa nada (aceptado por FE, seccion 15 del pedido).
- **RN-04.** Los textos de error y aviso de FE se muestran tal como llegan, con fila y columna (P-05). Un texto incomprensible se corrige en FE.
- **RN-04b.** El numero de fila es el de una planilla: los titulos son la fila 1 y una linea vacia cuenta. La pantalla lo aclara, y no traduce ni agrupa los codigos de FE: la lista de codigos puede crecer (seccion 18 del pedido).
- **RN-05.** Los errores se corrigen en el archivo, no en la pantalla. La pantalla lo dice y no ofrece editar datos.

### Confirmacion y acciones

- **RN-06.** Nada se emite sin confirmacion de una persona. FE no tiene modo automatico: la subida no lleva parametro `modo` (decision del usuario con FE, seccion 17 del pedido).
- **RN-07.** Antes de confirmar se muestra cuantos comprobantes se emitiran y cuantos quedan afuera. Confirmar emite facturas reales, y la pantalla lo dice. Con numeracion del cliente, confirmar con comprobantes invalidos deja sus numeros salteados: la pantalla lo avisa antes.
- **RN-08.** Los botones Confirmar, Cancelar y Reintentar dependen de `acciones` de FE: FS no deduce reglas por estado.
- **RN-09.** Un rechazo de SIFEN no se reintenta solo: queda informado con su motivo. Los numeros salteados se avisan; inutilizarlos es del cliente.
- **RN-09b.** Un comprobante en `ERROR` es un fallo de FE, no un rechazo. FE lo reintenta solo hasta 3 veces; despues la carga no termina hasta que alguien lo reintente o lo cancele. La pantalla lo dice y ofrece las dos acciones, segun `acciones`.
- **RN-09c.** Cancelar alcanza a los comprobantes `PENDIENTE` y `ERROR`. Los ya preparados siguen su curso, y la pantalla lo avisa antes de cancelar.
- **RN-09d.** FE prepara una carga por emisor a la vez. Una carga confirmada que espera a otra queda `EN_COLA`: la pantalla la muestra como "En espera de otra carga", distinta de "Emitiendo".

### Permisos (decision de FS, criterio del usuario)

- **RN-10.** Sin rol nuevo. Subir y confirmar: cualquier usuario `OPERADOR_FACTURACION` que pueda emitir en ese facturador. No hace falta que confirme quien subio.
- **RN-11.** Un usuario ve solo las cargas de su facturador y de su contexto, con la misma segmentacion por perfil que los documentos. Queda auditado quien subio, quien confirmo, quien cancelo y quien reintento.

### Facturas en "Documentos" (Usuario)

- **RN-12.** Un comprobante entra a `facturas_operativas` cuando FE informa su `document_uuid`, con snapshot de cliente, items y totales armado con los datos que da FE. `usuario_id` es quien confirmo.
- **RN-13.** `INVALIDO`, `CANCELADO` y `ERROR` sin `document_uuid` no crean documento. `DUPLICADO` tampoco: es un comprobante ya emitido antes, por otra carga o en linea, y enlaza al existente si esta en FS. Uno repetido dentro del mismo archivo llega como `INVALIDO`.
- **RN-14.** Incorporar es idempotente: `external_ref` estable, por carga y orden del comprobante. Repetir la sincronizacion no duplica ni pisa un estado final.
- **RN-15.** La identidad es el `document_uuid` (`AGENTS.md`). El `estado` del comprobante dice como termino la emision y no cambia despues; el estado vigente sale de `documento_estado`, que FE suma al comprobante, con la misma traduccion que el resto de los documentos.
- **RN-16.** Incorporar una factura no crea ni modifica clientes de la agenda ni items del catalogo: un archivo no puede sobrescribir datos de otros (FS-17).

### Sincronizacion

- **RN-17.** Las facturas de carga no entran en la agenda del worker de verificacion. Un worker propio consulta las cargas activas de forma paginada. **Motivo:** el worker actual consulta documento por documento con `refresh=true`: una carga de 5.000 serian 5.000 consultas a SIFEN por ciclo.
- **RN-18.** "Verificar estado fiscal" sigue disponible en cada factura, como en las demas.
- **RN-19.** Un fallo al consultar a FE no cambia ningun estado y se reintenta: la pantalla muestra la hora de la ultima actualizacion. "En SIFEN" puede durar horas y no se marca como fallo por tiempo.

## 4. Pantalla

Mobile primero: la tabla se vuelve tarjetas en pantalla angosta. Usa los componentes y estilos de `web-operacion` (`filter-tabs`, `list-toolbar`, `documents-view`). El diseno es de FS: la pantalla de otro producto que mostro el usuario es referencia de contenido, no un modelo a copiar.

| Vista | Contenido |
|---|---|
| Listado | Cargas por fecha y estado, con archivo, totales y avance. "Nueva carga" y "Descargar plantilla" |
| Nueva carga | Facturador, punto y perfil que se usaran; forma de numerar; seleccion del archivo |
| Informe | Validos, con error y con aviso. Por comprobante: fila, columna y mensaje. Confirmar o cancelar |
| Avance | Totales de la carga, ultima actualizacion, y que se puede cerrar la pantalla. En `EN_SIFEN` dice que sigue esperando a SIFEN y que puede tardar horas: no es un error |
| Resultado | Por comprobante: numero, referencia de venta, estado, CDC, motivo de SIFEN, correo y enlace al documento. Filtros y descarga del resultado |

Mensajes propios de FS: archivo repetido (abre la carga anterior; si se subio con el perfil equivocado, hay que cancelarla y subir de nuevo, porque el mismo archivo con otro perfil es la misma carga), tope superado (`413`, con el tope), demasiadas cargas o cuota diaria (`429`, con la espera), sin permiso (`403`).

La pestana Facturas no cambia de columnas en esta version; las facturas de carga llevan una marca que enlaza a su carga.

## 5. Numeracion (Usuario)

| Forma | `numeracion` en la subida | Numero de la factura |
|---|---|---|
| Automatica | `SERVICIO` | Lo asigna FE. El del archivo vuelve como referencia |
| Del cliente | `CLIENTE` | El del archivo |

- **RN-20.** Un numerador usa una sola forma de numerar. En FE, el numerador es unico por emisor, establecimiento, punto y tipo de documento. FE rechaza una carga `CLIENTE` sobre un numerador que numera FE.
- **RN-21.** FS guarda la forma de numerar facturas por contexto operativo, con `SERVICIO` por defecto, y la manda en cada subida. La cambia solo un usuario interno. **Hoy no existe:** FS tiene una sola variable por instancia, `FE_SERVICE_NUMBERING`, y no una configuracion por cliente. Decidido por el usuario (D-1).
- **RN-21b.** FE tambien la guarda, en su numerador, por punto y tipo de documento, y se configura desde su backoffice (decision del usuario con FE, seccion 16 del pedido). **Ante una diferencia manda FE:** si lo que envia FS no coincide, FE rechaza la carga con el motivo y FS lo muestra. Si el numerador de FE no esta configurado, vale lo que envia FS. Soporte debe configurar el mismo valor en los dos sistemas.
- **RN-21c.** `POST /v1/factura` de FE no cambia: FE no rechaza una factura emitida una por una sobre un numerador del cliente. La unica proteccion contra ese cruce es RN-22, en FS.
- **RN-22.** En un punto `CLIENTE`, FS no ofrece "Nueva factura" para ese contexto, porque esa emision usa el mismo numerador con numeracion de FE. Las notas de credito siguen disponibles: usan otro numerador y FE no las rechaza.
- **RN-23.** Esta forma de numerar es una excepcion aprobada a la regla general: la decide el archivo del cliente, nunca el frontend, que no calcula ni incrementa numeros.

## 6. Contrato con FE

Rutas `/v1/cargas` con la clave de consumidor del facturador y el permiso `CARGA_MASIVA`. Secciones 6, 7 y 12 del pedido. FE publica el OpenAPI; FS consume solo lo publicado.

Aceptado por FE, sin implementar (seccion 14 del pedido):

- `numero_asignado` y `numero_archivo` en el comprobante. Con numeracion del cliente son iguales.
- Parametro del listado de comprobantes para traer receptor, condicion con pagos o credito, items y totales. FE fija el nombre en el OpenAPI.
- Filtro `actualizado_desde` en comprobantes: devuelve los que cambiaron, por cambio propio o de su documento.
- Tope del archivo: 20 MB sin comprimir, **provisional** hasta que FE mida con 5.000 comprobantes. El limite de FS y el de NGINX quedan configurables.

Rutas propias de FS: se definen en el PLAN y se documentan en `spec/openapi.yaml`.

## 7. Impacto en FS

- **Base de datos:** tabla de cargas con `tenant_id`, `facturador_id`, contexto, `carga_id` de FE y usuarios; forma de numerar por contexto; vinculo entre factura y carga. Solo migraciones aditivas.
- **API:** subida de archivos, que hoy no existe. El limite global de 1 MB aplica a JSON. El transporte se define en el PLAN, seccion 5.
- **Tamano de subida:** verificar el limite del nginx del frontend y el del NGINX de infraestructura. Si hay que cambiar este ultimo, lo hace infraestructura.
- **Alta de facturadores:** `cargar-facturador.py` debe poder otorgar `CARGA_MASIVA` por emisor.
- **Despliegue:** `worker-cargas` de FE (P-07) se suma a los scripts, apagado, cuando FE avise.

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
- **CA-11.** Validacion visual con Playwright, en mobile y en desktop, contra el stack de `bash scripts/deploy.sh` y FE local. Prueba conjunta P-06 con un archivo real. Nunca en `segel-fs`.

## 9. Decisiones

| ID | Que | Decision del usuario (2026-11-06) |
|---|---|---|
| D-1 | Donde vive la forma de numerar | Por contexto operativo, en FS (RN-21). Ademas en el numerador de FE, que manda ante una diferencia (RN-21b) |
| D-2 | Origen del archivo | El cliente sube el CSV de su sistema, tal cual, y es responsable de su contenido |
| D-3 | Varios puntos en un archivo | No. Un solo punto, que debe coincidir con el del perfil (RN-03) |
| D-4 | Saldo | Fuera de esta version. Queda registrado en el backlog |
| D-5 | Nota de credito desde un punto con numeracion del cliente | Cerrada con FE: se permite, usa otro numerador (RN-22) |
| D-6 | Primer cliente y volumen | Todavia no hay cliente. Se prepara la funcion y se prueba con los clientes de prueba, en local |
| D-7 | Orden frente a FS-24 y FS-25 | Lo define FS: seccion 2 del PLAN |

**Abierto con FE:** nombres finales de campos y parametros, que FE fija en su OpenAPI (su tarea CMA-215); tope definitivo del archivo.

**Correo:** FE lo envia despues de la aprobacion de SIFEN; el estado del correo de un comprobante aparece recien entonces. Recibos por archivo: fuera de la primera etapa.

**Sin dato de volumen (D-6):** no hay cifra para dimensionar. Los topes son los de FE (5.000 comprobantes por archivo, 20 MB provisional). Antes del primer cliente real hay que medir con su volumen.
