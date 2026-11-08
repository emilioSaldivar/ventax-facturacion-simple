# PLAN Despliegue Segel en VPS propia v0.2: segunda entrega, volumen y carga masiva

**Fecha:** 2026-11-07 · **SPEC:** `docs/SPEC_DESPLIEGUE_SEGEL_FS_v0.2.md` · **Estado:** en refinamiento, sin implementar (D-8).

## Enfoque

Misma mecanica que la primera entrega: imagenes construidas en la estacion desde commits y transferidas por SSH, dos stacks Compose en la VPS, FE sin modificar. Lo nuevo es que FE trae dos workers y una carpeta mas, que FS tiene banderas propias, y que el conjunto se ensaya en local contra SIFEN test antes de tocar la VPS.

Orden (D-7): **1** cambios en scripts y plantillas, con ensayo en seco; **2** ensayo local completo, que ejecuta el usuario; **3** despliegue en `segel-fs`; **4** prueba en produccion. Entre un paso y el siguiente, confirmacion directa del usuario.

## 1. Cambios en este repositorio

Ninguno se hace hasta que el usuario lo indique (D-8). Todos quedan en `feat/identidad-segel`.

| Archivo | Cambio | Por que |
|---|---|---|
| `scripts/segel-fs/build-images.sh` | `FE_REF` por defecto `segel-rc3`; etiquetas `fe-segel-worker-cargas` y `fe-segel-worker-correo` sobre la misma imagen de FE | Compose nombra las imagenes `<proyecto>-<servicio>` y `up.sh` no compila |
| `scripts/segel-fs/deploy.sh` | `FE_REF` por defecto `segel-rc3`; las dos imagenes nuevas en `IMAGES` | Sin esto, `deploy.sh images` no las transfiere y los workers no arrancan |
| `scripts/segel-fs/up.sh` | `mkdir -p "$runtime/runtime/kude-cache"` antes del `chown` (que ya es recursivo sobre `runtime`). Tras el `up -d` de FE, `docker compose up -d --no-build --no-deps --force-recreate api worker-batch worker-status-sync worker-cargas worker-correo` (el nginx de FE re-resuelve la API, no hace falta reiniciarlo): Compose no vuelve a leer `env_file` en un `restart`, y un cambio de `.env.segel` solo llega al recrear (FE, 2026-11-07) | FE pide dueno 1000 y 775; el `chown` existente lo cubre, pero la carpeta debe existir. Sin el recreate, las banderas nuevas no entran en los contenedores que ya existian |
| `infra/segel-fs/fe.env.example` | Suma las variables de la seccion 4 del documento de FE con los valores de "todo encendido", mas `FE_KUDE_CACHE_DIR=__ROOT__/fe-runtime/runtime/kude-cache`, `CARGA_WORKER_CPUS=1`, `CORREO_WORKER_CPUS=1`, `RECONCILE_DEFERRED_ENABLED=false` y `SIFEN_CONSULT_DETECTS_CANCEL_ENABLED=false` (RN-03). `KUDE_JAVA_BIN` pasa de `java` a `/app/bin/java-corto` y se agrega `java8_home=/app/bin/java-corto`. Sin `JAVA_TOOL_OPTIONS` | Vale para instalaciones nuevas. En la VPS, `init-env.sh` no sobrescribe: se agregan a mano (seccion 4) |
| `infra/segel-fs/fs.env.example` | `CARGA_MASIVA_ENABLED=true`, `CARGA_MAX_BYTES=25165824`, `CARGA_SUBIDAS_SIMULTANEAS=2`, `CARGA_UPLOAD_TIMEOUT_MS=60000`, `CARGAS_SYNC_WORKER_ENABLED=true`, `CARGAS_SYNC_WORKER_INTERVAL_MS=60000` | RN-03; topes nginx 25 MB > FS 24 MB > FE 20 MB (carga masiva, RN-01b) |
| `scripts/segel-fs/cargar-facturador.py` | Opcion `--carga-masiva [cuota_diaria]`: agrega `CARGA_MASIVA` a `perms` y `cargas_cuota_diaria` al `emisor_assignments`. Sin la opcion, nada cambia | Carga masiva, CMF-019. El facturador que ya existe en la VPS no pasa por el script: su consumidor se edita en el backoffice de FE (seccion 4) |
| `scripts/segel-fs/generar-carga.py`, `ensayo-local.sh` | Nuevos: genera el CSV sin inventar datos, y prepara el paquete local en puertos altos con enlaces a `localhost` | Sirven al ensayo y a la prueba en produccion |
| `docs/OPERACION_DESPLIEGUE_SEGEL_FS_v0.1.md` | Fase 1: `FE_REF=segel-rc3` y once imagenes. Fase 2: variables nuevas, `kude-cache`, verificacion de `java.*.ok` y reinicio de `api` y `worker-batch`. Fase 7: la carga por CSV ya existe; remite a esta cadena | CA-07 |

Validacion de este paso: `bash -n` de los scripts, `node scripts/check-no-secrets.cjs`, y un `deploy.sh bundle` en un directorio temporal para leer lo que viajaria.

## 2. Ensayo local, lo ejecuta el usuario (D-6)

### 2.1 Stack

`scripts/segel-fs/ensayo-local.sh` arma el paquete y el entorno; los archivos de prueba salen de `scripts/segel-fs/generar-carga.py`. Los pasos 1 a 6 se pueden correr por la API de FS con `scripts/segel-fs/ensayo-guion.cjs`, que solo acepta URLs locales y deja el resultado en JSON; la revision visual y la casilla de correo siguen siendo manuales. Un paquete de `deploy.sh bundle` en la estacion, como en E-3 y E-6 de la primera entrega: `init-env.sh test`, `SEGEL_BIND_IP=127.0.0.1`, puertos altos, proyecto Compose propio para no chocar con `fs-cm` (mock) ni con los stacks de FE. Imagenes construidas por `build-images.sh` con `FE_REF=segel-rc3` y el `FS_REF` autorizado: las mismas que iran a la VPS (RN-05). Se levanta con `up.sh` y `bootstrap.sh`.

Despues de `init-env.sh`, el usuario agrega a mano en los dos `.env.segel` locales (permiso 600, fuera de git, RN-10):

- la contrasena SMTP de la casilla Segel, en FS y en FE;
- en FE, las variables de "todo encendido" si la plantilla aun no las trae, con `FE_KUDE_CACHE_DIR` apuntando a la carpeta del paquete local.

Antes de arrancar: salida desde la estacion a `smtp.office365.com:587` y a SIFEN test; sin VPN levantada, porque corta los puertos locales de Docker (riesgo conocido de v0.1).

### 2.2 Datos

- **Emisor de test (B-5):** exportar 5057016-1 desde `fe-test` con `exportar-emisor.sql` y cargarlo con `cargar-facturador.py --ambiente test --sumar-numerador <N> --carga-masiva 1000`. FE reservo para este ensayo el bloque **1010000 a 1019999 del punto 001-001** (su stack local no pasa de 1001999 y la sesion de capacidad usa 001-002 desde 8000101): `N = 1010000 - siguiente_numero` del numerador de facturas de 001-001 en el export; el script suma el mismo `N` a los demas numeradores, que quedan tambien lejos de uso. Si SIFEN responde `1002` (numero ya usado) es el `fe-test` de Hetzner, que emite con el mismo RUC y cuyo numero FE no conoce: subir el bloque. El certificado y el CSC de test estan cargados en 5057016-1 y los carga el usuario en el admin del FE local.
- **Operador:** `activar-operador-test.cjs`, solo valido en test.
- **Numeracion:** el contexto operativo queda en `SERVICIO` (valor por defecto). `cargar-facturador.py` no copia `forma_numeracion` del numerador de FE, que queda nulo; para FE, nulo vale lo que manda FS (RN-21b de la carga masiva). En produccion se confirma el valor del numerador antes de la prueba real (SF2-017).
- **Archivo de prueba:** generado desde la plantilla de FE con 10 facturas contado de 1.100 guaranies, un item `IVA10` a 1.000 mas IVA, `receptor_email=esaldivar.segel@gmail.com`, un receptor RUC valido de SIFEN test, y `referencia_venta` propia. Un segundo archivo con una fila invalida a proposito, para ver el informe.

### 2.3 Guion

| Paso | Que se hace | Que se verifica |
|---|---|---|
| 1 | `curl` a `GET /v1/health` de FE | `java.kude.ok` y `java.firma.ok` en `true`. Si alguno da `false`: vuelta atras del paso Java (tabla de FE) y aviso a FE con la linea `java.check failed`; no se emite hasta resolverlo |
| 2 | Una factura contado desde la app, a `esaldivar.segel@gmail.com` | Aprobada; respuesta con `email_status: PENDING`; `SENT` al consultar; correo recibido con remitente Segel y KuDE adjunto; estado en Documentos |
| 2b | Mirar el momento del correo de la factura del paso 2, y una factura rechazada a proposito | El correo llega despues de la aprobacion, sin el asunto "pendiente de aceptacion SIFEN" (SPEC, B-8). La rechazada no genera correo y FS muestra "No se envio correo: SIFEN rechazo la factura" (FS-27) |
| 3 | Pestana Carga masiva: plantilla, subida del archivo de 10, informe, confirmar | `VALIDADA` con 10 validos; tras confirmar `EN_PREPARACION`, `EN_SIFEN`, `FINALIZADA`; 10 aprobadas sin saltos de numero |
| 4 | Documentos | Las 10 facturas con marca "Carga", KuDE descargable, `correo` `SENT`; 10 correos recibidos |
| 5 | Archivo con una fila invalida | Informe con codigo, fila y columna; confirmar emite solo las validas |
| 6 | Cancelar una factura de carga y nota de credito sobre otra | Ambas aceptadas; la sincronizacion siguiente no revierte la cancelacion (CA-06 de la carga masiva) |
| 7 | FS-20, FS-21, FS-23 (`TASKS_CORRECCIONES_TRAS_FIXES_FE_v0.1`, CFF-009) | Motivo del rechazo visible, mensaje de `0100`, `approved_at` real |
| 8 | Apagar `CARGAS_ENABLED` y `CARGA_MASIVA_ENABLED`, reiniciar | La pestana desaparece, las rutas dan `404`, las 10 facturas siguen en Documentos (CA-06). Volver a encender |
| 9 | `docker stats --no-stream` con un correo en curso y `du -sh` de `kude-cache` | Referencia de memoria y disco para la VPS |

Lo que FS deja listo antes: el paquete, los archivos CSV, un script que genere los archivos con los datos que el usuario indique, y esta tabla como lista de verificacion con lugar para anotar resultados en `TASKS` (E-1). Lo que el usuario hace: cargar secretos, certificado y CSC, y ejecutar los pasos.

Tambien se verifica aqui el supuesto pendiente de la carga masiva: que FE mueva `actualizado_en` cuando `correo` pasa a `SENT` (PLAN de carga masiva, seccion 6, paso 3). Si no lo mueve, el `SENT` no llegaria a Documentos hasta otro cambio del comprobante: se registra y se le pide a FE.

## 3. Despliegue en `segel-fs`

Solo tras el ensayo local en verde y la confirmacion directa del usuario (RN-06). Requiere VPN.

1. **Respaldo manual** de las dos bases con `pg_dump` desde los contenedores a `~/segel/backups/{fs,fe}`, antes de tocar nada (B-6; pide autorizacion del usuario porque escribe en `/home`, hoy con unos 3,7 G). Medir `df` antes y despues.
2. En la estacion: `build-images.sh` (once imagenes, `FS_REF` y `FE_REF` fijos), `deploy.sh files`, `deploy.sh images`.
3. En la VPS: agregar a mano en `fe/.env.segel` las variables de la seccion 1 y en `fs/.env.segel` las de FS. Comprobar que no haya `JAVA_TOOL_OPTIONS`.
4. `up.sh`: crea `kude-cache`, aplica `045` en FE y `0037` en FS, levanta todo, recrea `api`, `worker-batch`, `worker-status-sync`, `worker-cargas` y `worker-correo` de FE con `--force-recreate` para que tomen las banderas nuevas, y reinicia el frontend de FS. `docker compose restart` no sirve para eso: no relee `env_file`.
4b. **Espera de lotes incompletos a 1 minuto** (decision del usuario, 2026-11-08, aplicada y medida por FE en el ensayo local: una factura sola entro en lote a los 36 s y su correo salio a los 47 s, contra 11 minutos antes). En la base de FE, despues de `migrate`: `UPDATE batch_dispatch_defaults SET interval_minutes = 1;`, para test y prod. Es escritura en la base de produccion: se ejecuta solo con autorizacion directa del usuario en ese momento. Vuelta atras: el mismo `UPDATE` con `15`. `BATCH_WORKER_LOOP_SECONDS` se queda en 60, a proposito: con 15 s el poller agotaria su tope de 40 consultas en 10 minutos, el camino del falso `1002` con `RECONCILE_DEFERRED_ENABLED` apagada (documento de FE, seccion 5b).
5. Verificar (CA-02): `docker images`, `docker ps` sin reinicios en bucle, `GET /v1/health` con `java.*.ok` en `true`, FS hacia FE por la red interna, `ss -tln`, `docker logs` de `worker-correo` con `email.worker start`.
6. Consumidor del facturador existente: en el backoffice de FE, agregar el permiso `CARGA_MASIVA` y cuota diaria 500 (acordada con FE; se sube a 2.000 o mas cuando la VPS tenga mas memoria; el tope por archivo sigue en 5.000) al consumidor `segel-fs-<ruc_base>`. En el backoffice de FS, confirmar que el contexto del facturador numera por `SERVICIO`.
7. Primera factura en produccion desde la app, por el usuario (CA-03).
8. `docker stats --no-stream` y `df -h /var /home` (CA-05).

Vuelta atras: por bandera (RN-09) o entera con `FE_REF=segel-rc2` y la imagen anterior de FS, que sigue en la VPS. Se ensaya la vuelta por bandera en local (paso 8 del guion), no en la VPS.

## 4. Prueba de carga masiva en produccion (D-4)

Facturas reales: antes de armar los archivos, el usuario define cliente, descripcion del item y correo del comprador (RN-07, B-3). Propuesta de FS, a confirmar:

| Punto | Propuesta |
|---|---|
| Total | 110.000 guaranies: 100 facturas de 1.100 |
| Item | Un item, cantidad 1, precio 1.100 con IVA 10 % incluido (base 1.000, IVA 100). La descripcion la da el usuario |
| Condicion | Contado, efectivo |
| Reparto | Tres cargas: 20, 30 y 50 facturas. La de 50 llena un lote exacto; subir la segunda mientras la primera prepara muestra `EN_COLA` |
| Correo del comprador | A definir: el correo real del cliente recibe un correo por factura, 100 en total; la alternativa es `esaldivar.segel@gmail.com` o ninguno |
| Numeracion | La del servicio: FE asigna los numeros, continuos |
| Archivos | Los genera FS con un script desde la plantilla de FE y los datos del usuario, y el usuario los revisa antes de subirlos |
| Quien sube y confirma | El usuario, desde la app, con el operador del facturador |
| Despues | Las facturas quedan emitidas (D-4). No se cancelan ni se anulan salvo que el usuario lo decida |

Durante la prueba se mide: tiempos de cada estado de la carga, `docker stats`, logs de `worker-cargas` y `worker-correo`, lotes en el backoffice de FE, totales de FS contra FE, y correos `SENT`. Se registra en `TASKS` (E-3).

## 5. Riesgos

| Riesgo | Mitigacion |
|---|---|
| Memoria de la VPS con dos workers mas y una JVM por firma o KuDE | `cpus: 1` en cada worker nuevo, `CARGA_FIRMAS_SIMULTANEAS=1`, medir en el ensayo local y en cada paso de la VPS; umbral de 3 GiB (RN-08) |
| El tag trae algo distinto de lo ensayado | Ensayo local con las mismas imagenes que van a la VPS; `FE_REF` y `FS_REF` fijos |
| Correos reales a un cliente durante la prueba | Decision previa del usuario sobre el correo del comprador (seccion 4) |
| Un `java.*.ok` en `false` en la VPS | Vuelta atras del paso Java por bandera antes de emitir |
| Subida del archivo lenta frente al nginx | Los archivos de la prueba pesan unos KB; el caso del tope se mide en el ensayo local |
| Mas documentos en `SENT_BATCH` para el worker de verificacion de FS | No afecta a las facturas de carga; para las de la app, FS-24 queda en su cadena |
| Sin backups automaticos | Respaldo manual antes del despliegue (seccion 3, paso 1); recordatorio al usuario de que siguen pendientes |
