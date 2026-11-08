# SPEC Despliegue Segel en VPS propia v0.2: segunda entrega, volumen y carga masiva

**Fecha:** 2026-11-07 · **Rama:** `feat/identidad-segel` · **Estado:** documentacion en refinamiento, sin implementar ni desplegar (decision del usuario, 2026-11-07). Ensayo local cerrado el 2026-11-08; el despliegue espera los pendientes de FE y FS (D-14).

## Alineacion

- `docs/SPEC_DESPLIEGUE_SEGEL_FS_v0.1.md`, `PLAN` y `TASKS` v0.1: la instancia ya esta en produccion con FS `8e18e87` y FE `segel-rc1` (frontend `segel-rc2`). Sus reglas siguen vigentes; esta version las amplia para la segunda entrega.
- `docs/OPERACION_DESPLIEGUE_SEGEL_FS_v0.1.md`: runbook de la primera entrega. El PLAN v0.2 indica que cambia.
- `docs/SPEC_CARGA_MASIVA_FACTURAS_v0.1.md`: la carga masiva de FS, implementada contra el mock (fases A a D), que esta entrega valida contra FE real y lleva a produccion.
- `docs/SPEC_CORRECCIONES_TRAS_FIXES_FE_v0.1.md`: FS-20, FS-21, FS-23 y FS-24 viajan en esta entrega.
- Documento de FE, fuera de git: `FACTURACION_ELECTRONICA_MVP/fe-local-data/segel-fs/DESPLIEGUE_VOLUMEN_SEGEL_FS_2026-11-07.md` (corregido por FE el 2026-11-07, su FIX011). Es la fuente de las banderas y pasos del lado de FE.

## Objetivo

Llevar a `segel-fs` las mejoras de volumen de FE (tag `segel-rc3`) y la carga masiva de FS, **con todo encendido**, y probar la carga masiva con facturas reales del unico facturador de la instancia. Antes, ensayar el mismo conjunto en la estacion, contra SIFEN test y con correo real, prueba que ejecuta el usuario.

## Que entra

| Lado | Cambio | Referencia |
|---|---|---|
| FE `segel-rc3` | Java corto para firma y KuDE, cola de correo en `worker-correo`, varios lotes por ciclo, KuDE guardado, pool SMTP, carga masiva (`/v1/cargas`), metricas de colas, migracion `045` | Documento de FE, seccion 1 |
| FS | Carga masiva (migracion `0037`, modulo `cargas`, worker de sincronizacion, pestana), FS-20, FS-21 y FS-23 | `SPEC_CARGA_MASIVA_FACTURAS_v0.1`, `SPEC_CORRECCIONES_TRAS_FIXES_FE_v0.1` |
| Scripts de FS | Dos imagenes mas de FE (`worker-cargas`, `worker-correo`), carpeta `kude-cache`, `FE_REF=segel-rc3`, plantillas de entorno con las banderas nuevas, permiso `CARGA_MASIVA` en el alta de facturadores | PLAN v0.2 |

## Decisiones del usuario (2026-11-07)

| ID | Tema | Decision |
|---|---|---|
| D-1 | Alcance | Se despliega todo encendido: FE `segel-rc3` con sus mejoras activas y FS con la carga masiva habilitada |
| D-2 | Modo de envio | **`BATCH` para todos los clientes.** Nada se emite en modo sincronico, ni desde la app ni por carga. FS ya fija `fiscal_envio_modo: BATCH` y la carga masiva de FE envia por lote; esta entrega no habilita otro modo por facturador |
| D-3 | Tag de FE | El usuario autoriza el push de `segel-rc3` en la sesion de FE. Los ajustes de scripts y plantillas de FS se hacen en este repositorio |
| D-4 | Prueba en produccion | Con el unico facturador que hay en `segel-fs`, facturando a un cliente en varias tandas: **110.000 guaranies en total, en facturas de 1.100 cada una.** Es una prueba con efecto fiscal real: las facturas quedan emitidas. Interpretacion de FS, a confirmar: 100 facturas de 1.100, repartidas en varias cargas (PLAN, seccion 5) |
| D-5 | Banderas de FE fuera de esta cadena | `RECONCILE_DEFERRED_ENABLED` y `SIFEN_CONSULT_DETECTS_CANCEL_ENABLED` quedan **apagadas** hasta que hagan falta |
| D-6 | Prueba contra FE real | La hace el usuario, en la estacion, con un stack FS + FE `segel-rc3` en ambiente SIFEN test, **incluido el envio de correos reales a `esaldivar.segel@gmail.com`**. FS prepara el stack, los datos y el guion; no la ejecuta por su cuenta |
| D-7 | Orden | Primero el ensayo local completo (D-6); despues el despliegue en `segel-fs`; al final la prueba en produccion (D-4). Cada paso arranca solo con confirmacion directa del usuario |
| D-9 | Espera de lotes incompletos | 1 minuto en lugar de 15, por configuracion en la base de FE, sin codigo. Decidida por el usuario el 2026-11-08 en la sesion de FE |
| D-10 | Autogestion de rechazos por API de FE | Despues de este despliegue: hoy no existe para consumidores (`SPEC_AUTOGESTION_OPERADOR_v0.1`, seccion 0). Informado por FE el 2026-11-08 como decision del usuario |
| D-11 | Numeros rechazados | Los inutiliza FE con lo que ya existe, en esta primera etapa. La autogestion de rechazos se libera en una segunda etapa. Decidida por el usuario el 2026-11-08 |
| D-12 | Prueba en produccion, datos (2026-11-08) | Reemplaza la interpretacion de D-4. **Tres compradores, 110.000 guaranies cada uno, en facturas de 1.100: 300 facturas por 330.000 guaranies en total.** Item: "Consultoria en tecnologia de la informacion". Compradores y correos, en este orden: RUC 4732402-3 a `gracielita076@gmail.com`; RUC 1160463-8 a `matiassaldiv@gmail.com`; CI 5057036, MARIA CRISTINA SALDIVAR CAPUTO, a `emilio.saldivar@segel.com.py`. Los digitos verificadores de los dos RUC se comprobaron con el algoritmo de la DNIT. El objetivo es procesar un volumen importante de una vez |
| D-13 | Respaldo manual (2026-11-08) | **No se hace en esta ocasion.** Motivo del usuario: la base tiene solo dos documentos, una factura y un recibo, y no ve riesgo en las migraciones. Vale solo para este despliegue; los backups siguen pendientes |
| D-14 | Momento del despliegue (2026-11-08) | **En espera.** Primero se cierra todo lo pendiente de esta etapa en FE y en FS, segun lo documentado; despues se despliega con confirmacion directa del usuario |
| D-15 | Mediciones y mapeo del comportamiento (2026-11-08) | El usuario pide medir y mapear el comportamiento de la carga para anticipar fallas: PLAN, seccion 4.1 |
| D-16 | Version de FE (2026-11-08) | **El despliegue se construye con `segel-rc4`**, el tag que FE publica al cerrar sus actualizaciones en curso. Reemplaza a `segel-rc3` en RN-01 y en los scripts. El ensayo local ya cerrado (E-1) queda como evidencia de `segel-rc3`; el ensayo de volumen se corre sobre `segel-rc4` |
| D-17 | Correo del tercer comprador (2026-11-08) | `emilio.saldivar@segel.com.py` puede ser el del operador en produccion, asi que el tercer comprador (CI 5057036) recibe en `emiliomatsc@fpuna.edu.py`, como lo escribio el usuario. **A confirmar al revisar los archivos:** la casilla conocida del usuario es `emiliomatasc@fpuna.edu.py`, con una `a` mas |
| D-18 | Lotes incompletos (2026-11-08) | Se agregan **2 facturas sueltas de 1.100 en cada una de las dos cargas que se suben seguidas** (compradores 2 y 3): cada una queda en 102 facturas, dos lotes llenos y uno de 2, para ver el lote que no se llena. Total: 304 facturas por 334.400 guaranies |
| D-20 | Bandera de reconciliacion y tag publicado (2026-11-08) | Reemplaza D-5 para `RECONCILE_DEFERRED_ENABLED`: **se enciende en `segel-fs` junto con `segel-rc4`** (decision del usuario en la sesion de FE). Sin ella, un lote que cae por timeout porque SIFEN tarda mas de 20 s termina con sus documentos en falso `REJECTED 1002` (medido por FE: 50 de 50; con la bandera, 0). Con ella esos documentos quedan en `SENT_BATCH` unos 10 minutos mientras FE reconcilia, y FS ya los trata como pendientes (FS-24). `SIFEN_CONSULT_DETECTS_CANCEL_ENABLED` sigue apagada. `segel-rc4` se publico en origin: `f83a83c`, sin cambios fuera de `docs/` desde `57368e1`, la version ensayada |
| D-19 | Secuencia (2026-11-08) | 1) FE termina y publica `segel-rc4`. 2) Ensayo de volumen en la estacion con esta misma tanda. 3) Despliegue en `segel-fs`, con confirmacion directa. 4) FS genera los archivos de produccion y escribe las indicaciones; el usuario sube cada CSV y confirma desde la pestana Carga masiva del panel, siguiendo esas indicaciones |
| D-8 | Cuando | Hoy solo se refina la documentacion; la implementacion de los cambios de scripts y el resto se ejecutan despues, por indicacion del usuario |

## Reglas

- **RN-01.** FE se construye solo desde el tag `segel-rc4` publicado (D-16; antes `segel-rc3`), nunca desde la punta de `branding/segel-staging`. Sin el tag, nada de esta entrega se construye.
- **RN-02.** FS se construye desde un commit autorizado de `feat/identidad-segel` que incluya `87508d4` (carga masiva) y `2b1eed9` (FS-20, FS-21, FS-23). `FS_REF` se fija en ese commit al construir.
- **RN-03.** "Todo encendido" es una lista cerrada: las banderas de la seccion 4 del documento de FE mas `FE_KUDE_CACHE_DIR`, `CARGA_WORKER_CPUS=1` y `CORREO_WORKER_CPUS=1`; en FS, `CARGA_MASIVA_ENABLED=true` con los demas valores por defecto. Las dos banderas de D-5 se escriben en el `.env` con su valor, no ausentes, para que no dependan del valor por defecto de otra version: `RECONCILE_DEFERRED_ENABLED=true` (D-20) y `SIFEN_CONSULT_DETECTS_CANCEL_ENABLED=false`. Con `segel-rc4` la lista suma el bloque `rc4` del documento de FE: `BATCH_DESPACHO_SEGUNDOS=2`, `BATCH_HUERFANO_MINUTOS=30`, `EMAIL_QUEUE_MAX_ATTEMPTS=6`, `EMAIL_QUEUE_LEASE_MINUTES=10`, `NCE_IDEMPOTENCY_ENABLED=true` y los topes `FE_*_MEM`.
- **RN-04.** Envio por lote siempre (D-2): FS no manda `envio.mode` distinto de `BATCH`, y la carga masiva de FE emite por lote. No se activa ningun modo sincronico por facturador en esta entrega.
- **RN-05.** El ensayo local (D-6) se hace con un stack propio de esta entrega, construido con las mismas imagenes que iran a la VPS, en SIFEN test, con el correo real de la casilla Segel. **No se usa el stack `fe-cargas` de la sesion de FE**: esta dedicado a sus mediciones.
- **RN-06.** Nada se despliega ni se prueba en `segel-fs` hasta que el ensayo local cierre con sus criterios en verde, y el usuario confirme directamente ese paso. Un aviso de otra sesion no es confirmacion.
- **RN-07.** La prueba en produccion emite facturas reales a un cliente real: cliente, descripcion del item, correo del comprador y reparto en cargas los define el usuario antes de armar los archivos. FS no inventa datos de un documento fiscal.
- **RN-08.** Recursos de la VPS: no se tocan disco, CPU ni memoria (SPEC v0.1, P-3). Se mide `docker stats` y `df` en cada paso. Si FE, FS y Postgres superan 3 GiB, se avisa a FE y se baja `CARGA_PREPARAR_POR_MINUTO` o se apaga `CARGAS_ENABLED` hasta que haya una carga real (documento de FE, seccion 5).
- **RN-09.** Vuelta atras por bandera, sin cambiar imagenes, segun la tabla del documento de FE (seccion 6). Vuelta atras entera: `FE_REF=segel-rc2` y la imagen anterior de FS. La migracion `045` de FE y la `0037` de FS quedan aplicadas: son compatibles con las versiones anteriores.
- **RN-10.** Secretos: la contrasena SMTP de la casilla Segel y las claves del stack local viven solo en archivos `.env` fuera de git, con permiso 600, cargados por el usuario. Nunca viajan por chat ni se copian a archivos del repositorio.
- **RN-11.** Sigue vigente que `segel-fs` es produccion: fuera de la prueba de D-4, nada de humos, cargas ni emisiones de prueba ahi.

## Impacto sobre lo que ya corre en `segel-fs`

- `POST /v1/factura` pasa a responder `email_status: PENDING`, y el `SENT` se ve al consultar el documento. FS ya lo trata asi (FS-14 y guia 32.3).
- Con `BATCH_LOTES_POR_CICLO=5`, habra mas documentos a la vez en `SENT_BATCH` (hasta 250 por emisor). El worker de verificacion de FS los espera a 15 min sin gastar intentos (FS-24) y sigue consultando con `refresh`, porque `RECONCILE_DEFERRED_ENABLED` queda apagada por D-5. Las facturas de carga masiva no pasan por ese worker (RN-17 de la carga masiva).
- La migracion `0037` amplia `factura_items_snapshot.cantidad` a `numeric`: las facturas existentes conservan sus valores. Comprobado en una copia de la base local (TASKS de la carga masiva, E-3); la base de produccion se respalda antes (PLAN, seccion 4).

## Bloqueos y pendientes

- **B-1. Tag.** **Resuelto (2026-11-08):** `segel-rc4` publicado en origin (`f83a83c`, D-20). `segel-rc3` no se publico y no se usa.
- **B-9. Pendientes de FE para esta etapa (2026-11-08).** El despliegue espera a que FE cierre sus tareas en curso y quede alineado lo que necesita el despliegue (D-14): tag `segel-rc4` publicado, su documento de despliegue al dia y lo que FE informe como pendiente.
- **B-2. Facturador de produccion.** Sin VPN no se pudo leer que facturador y cuantos usuarios hay hoy en `segel-fs`; el TASKS v0.1 lo deja pendiente al pasar a produccion. Se confirma antes de la prueba de D-4: emisor, certificado y CSC de produccion cargados, numeradores reales, consumidor propio.
- **B-3. Datos de la prueba en produccion.** Cliente, correo del comprador, descripcion del item y reparto en cargas: los define el usuario (RN-07). **Resuelto (2026-11-08) por D-12.** Quedan dos puntos para la revision de los archivos (SF2-019): el nombre de los dos RUC, que FS toma del padron DNIT y el usuario confirma, y el reparto en cargas que propone el PLAN, seccion 4.
- **B-4. Correo real en el ensayo local.** La casilla `no-reply-facturacion@segel.com.py` debe poder usarse desde la estacion: salida a `smtp.office365.com:587` y contrasena cargada por el usuario en los `.env` locales. Las credenciales SMTP de staging de FE no sirven (FE, V125).
- **B-5. Emisor de test para el ensayo local.** Hace falta un emisor con certificado y CSC de SIFEN test. Propuesta: 5057016-1 exportado desde `fe-test` con `--sumar-numerador`, como en la primera entrega; el certificado y el CSC los carga el usuario en el admin del FE local.
- **B-7. FS-24 antes del despliegue.** FE pide (2026-11-07) ajustar FS-24 antes de esta entrega, con cualquier valor de las banderas de D-5: con 5 lotes por ciclo habra hasta 250 documentos por emisor en `SENT_BATCH` a la vez, y el worker de verificacion de FS gasta un intento por cada consulta en ese estado. Propuesta de FE: `SENT_BATCH` y `QUEUED_BATCH` se esperan; el fallo real es `REJECTED` o mas de 48 h en `SENT_BATCH`. El diseno de FS-24 en `PLAN_CORRECCIONES_TRAS_FIXES_FE_v0.1` ya es ese, pero estaba atado a `RECONCILE_DEFERRED_ENABLED`; con D-5 esa atadura deja de tener sentido. **Resuelto (2026-11-07):** entra en esta entrega, como FS recomendo y el usuario no objeto al indicar que se implemente lo que falta. Se parte en dos: la espera vale siempre; omitir el `refresh` queda con su bandera apagada en esta entrega. FE aclaro despues que el `refresh` no destraba nada, solo adelanta lo que FS ve (RN-24.6).
- **B-8. Correo antes de la aprobacion (hallazgo de FE, 2026-11-07).** Con envio `BATCH`, el correo de una factura emitida desde la app sale antes de que SIFEN apruebe, con asunto "pendiente de aceptacion SIFEN" y el KuDE adjunto: 4 de 4 en la prueba de FE. Con `BATCH` para todos (D-2), es toda factura de la app, y una rechazada ya tendria correo. La carga por archivo no lo sufre. **Resuelto (2026-11-07):** el usuario decidio retener el correo hasta la aprobacion: `EMAIL_TRAS_APROBACION=true` en FE, y FE movio el tag local `segel-rc3` a `4f6e04a`. Ratificado por el usuario en esta sesion, el mismo dia. Un rechazado no genera correo y queda `NOT_APPLICABLE`, que en FS destapo FS-27, corregido en esta entrega.
- **B-6. Backups.** Siguen pospuestos (D-7 de v0.1). Esta entrega emite 100 facturas reales y aplica dos migraciones: se pide al usuario autorizar un respaldo manual de las dos bases antes del despliegue (PLAN, seccion 4). **Resuelto (2026-11-08) por D-13:** sin respaldo en esta ocasion.

## Fuera de alcance

- Las banderas de D-5.
- Autogestion del operador (`SPEC_AUTOGESTION_OPERADOR_v0.1`).
- Modo sincronico de emision, para cualquier facturador.
- Backups automaticos, TLS, DNS y NGINX, que siguen en sus cadenas.
- Cambios en el repositorio de FE.

## Criterios de aceptacion

- **CA-01. Ensayo local.** Con las imagenes que iran a la VPS: `GET /v1/health` de FE con `java.kude.ok` y `java.firma.ok` en `true`; una factura desde la app aprobada en SIFEN test con `email_status` `PENDING` y luego `SENT`; una carga por archivo `FINALIZADA` con sus facturas aprobadas, visibles en Documentos, con KuDE; correos de FE y de FS recibidos en `esaldivar.segel@gmail.com` con remitente Segel; cancelacion y nota de credito sobre una factura de carga; FS-20, FS-21 y FS-23 observados contra FE real.
- **CA-02. VPS.** Once imagenes cargadas; `worker-cargas` y `worker-correo` arriba sin reinicios en bucle; `java.*.ok` en `true`; FS llega a FE por la red interna; solo `8092` y `8100` publicados en `10.100.0.145`.
- **CA-03. Primera factura en produccion.** Emitida por el usuario desde la app: aprobada, KuDE descargado, `email_status` `PENDING` en la respuesta y `SENT` al consultar, correo recibido si lleva.
- **CA-04. Prueba de carga masiva en produccion.** Todas las cargas `FINALIZADA`; 304 facturas aprobadas: 100 al comprador 1 por 110.000 guaranies, 102 a cada uno de los compradores 2 y 3 por 112.200 guaranies, 334.400 en total; el lote de 2 de cada carga sale sin intervencion, sin numeros salteados; cada una con KuDE, visible en Documentos de FS y con su correo `SENT` a la casilla de su comprador; totales de FS iguales a los de FE.
- **CA-08. Mapa del comportamiento.** Linea de tiempo de cada carga por etapa, ritmo de aprobacion y de correo, picos de recursos y fallas observadas, registrados en E-3 y comparados con la referencia del ensayo de volumen (PLAN, seccion 4.1).
- **CA-05. Recursos.** Durante la prueba, FE, FS y Postgres por debajo de 3 GiB y `/var` con espacio libre; sin contenedores reiniciando.
- **CA-06. Vuelta atras.** Apagar `CARGAS_ENABLED` y `CARGA_MASIVA_ENABLED` en el ensayo local deja la instancia operando igual que antes, sin perder facturas ya incorporadas.
- **CA-07. Documentacion.** `OPERACION_DESPLIEGUE_SEGEL_FS` refleja la entrega: version de FE, variables, carpeta nueva, orden y verificaciones.
