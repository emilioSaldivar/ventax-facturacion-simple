# PLAN Despliegue Segel en VPS propia v0.2: segunda entrega, volumen y carga masiva

**Fecha:** 2026-11-07 · **SPEC:** `docs/SPEC_DESPLIEGUE_SEGEL_FS_v0.2.md` · **Estado:** en refinamiento, sin implementar (D-8).

## Enfoque

Misma mecanica que la primera entrega: imagenes construidas en la estacion desde commits y transferidas por SSH, dos stacks Compose en la VPS, FE sin modificar. Lo nuevo es que FE trae dos workers y una carpeta mas, que FS tiene banderas propias, y que el conjunto se ensaya en local contra SIFEN test antes de tocar la VPS.

Orden (D-7): **1** cambios en scripts y plantillas, con ensayo en seco; **2** ensayo local completo, que ejecuta el usuario; **3** despliegue en `segel-fs`; **4** prueba en produccion. Entre un paso y el siguiente, confirmacion directa del usuario.

## 1. Cambios en este repositorio

Ninguno se hace hasta que el usuario lo indique (D-8). Todos quedan en `feat/identidad-segel`.

| Archivo | Cambio | Por que |
|---|---|---|
| `scripts/segel-fs/build-images.sh` | `FE_REF` por defecto `segel-rc4` (D-16, hecho en `eb4505d`; antes `segel-rc3`); etiquetas `fe-segel-worker-cargas` y `fe-segel-worker-correo` sobre la misma imagen de FE | Compose nombra las imagenes `<proyecto>-<servicio>` y `up.sh` no compila |
| `scripts/segel-fs/deploy.sh` | `FE_REF` por defecto `segel-rc4` (hecho en `eb4505d`); las dos imagenes nuevas en `IMAGES` | Sin esto, `deploy.sh images` no las transfiere y los workers no arrancan |
| `scripts/segel-fs/up.sh` | `mkdir -p "$runtime/runtime/kude-cache"` antes del `chown` (que ya es recursivo sobre `runtime`). Tras el `up -d` de FE, `docker compose up -d --no-build --no-deps --force-recreate api worker-batch worker-status-sync worker-cargas worker-correo frontend` (con `rc4` tambien el `frontend`, para que tome `FE_FRONTEND_MEM`; hecho en `eb4505d`): Compose no vuelve a leer `env_file` en un `restart`, y un cambio de `.env.segel` solo llega al recrear (FE, 2026-11-07) | FE pide dueno 1000 y 775; el `chown` existente lo cubre, pero la carpeta debe existir. Sin el recreate, las banderas nuevas no entran en los contenedores que ya existian |
| `infra/segel-fs/fe.env.example` | Suma las variables de la seccion 4 del documento de FE con los valores de "todo encendido", mas `FE_KUDE_CACHE_DIR=__ROOT__/fe-runtime/runtime/kude-cache`, `CARGA_WORKER_CPUS=1`, `CORREO_WORKER_CPUS=1`, `RECONCILE_DEFERRED_ENABLED=true` (D-20; era `false`) y `SIFEN_CONSULT_DETECTS_CANCEL_ENABLED=false` (RN-03), mas el bloque `rc4` del runbook de FE: `BATCH_DESPACHO_SEGUNDOS=2`, `BATCH_HUERFANO_MINUTOS=30`, `EMAIL_QUEUE_MAX_ATTEMPTS=6` y los topes `FE_*_MEM`, que son variables del compose y las lee `docker compose --env-file` (hecho en `eb4505d`). `KUDE_JAVA_BIN` pasa de `java` a `/app/bin/java-corto` y se agrega `java8_home=/app/bin/java-corto`. Sin `JAVA_TOOL_OPTIONS` | Vale para instalaciones nuevas. En la VPS, `init-env.sh` no sobrescribe: se agregan a mano (seccion 4). Con `segel-rc4` (D-20): bloque `rc4` del documento de FE y `RECONCILE_DEFERRED_ENABLED=true` |
| `infra/segel-fs/fs.env.example` | `CARGA_MASIVA_ENABLED=true`, `CARGA_MAX_BYTES=25165824`, `CARGA_SUBIDAS_SIMULTANEAS=2`, `CARGA_UPLOAD_TIMEOUT_MS=60000`, `CARGAS_SYNC_WORKER_ENABLED=true`, `CARGAS_SYNC_WORKER_INTERVAL_MS=60000` | RN-03; topes nginx 25 MB > FS 24 MB > FE 20 MB (carga masiva, RN-01b) |
| `scripts/segel-fs/cargar-facturador.py` | Opcion `--carga-masiva [cuota_diaria]`: agrega `CARGA_MASIVA` a `perms` y `cargas_cuota_diaria` al `emisor_assignments`. Sin la opcion, nada cambia | Carga masiva, CMF-019. El facturador que ya existe en la VPS no pasa por el script: su consumidor se edita en el backoffice de FE (seccion 4) |
| `scripts/segel-fs/generar-carga.py`, `ensayo-local.sh` | Nuevos: genera el CSV sin inventar datos, y prepara el paquete local en puertos altos con enlaces a `localhost` | Sirven al ensayo y a la prueba en produccion |
| `docs/OPERACION_DESPLIEGUE_SEGEL_FS_v0.1.md` | **Pendiente para `rc4` (SF2-013e):** `FE_REF=segel-rc4`, bloque `rc4` y `RECONCILE_DEFERRED_ENABLED=true`, sentencia 4b nueva, recreacion de los seis servicios de FE, lectura de `correo_reintentando`. Hecho para `rc3`: Fase 1: `FE_REF=segel-rc3` y once imagenes. Fase 2: variables nuevas, `kude-cache`, verificacion de `java.*.ok` y reinicio de `api` y `worker-batch`. Fase 7: la carga por CSV ya existe; remite a esta cadena | CA-07 |

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

1. ~~**Respaldo manual**~~ No se hace en esta ocasion (SPEC, D-13). Se mide `df` antes de empezar. Texto original: respaldo manual de las dos bases con `pg_dump` desde los contenedores a `~/segel/backups/{fs,fe}`, antes de tocar nada (B-6; pide autorizacion del usuario porque escribe en `/home`, hoy con unos 3,7 G). Medir `df` antes y despues.
2. En la estacion: `build-images.sh` (once imagenes, `FS_REF` y `FE_REF` fijos), `deploy.sh files`, `deploy.sh images`.
3. En la VPS: agregar a mano en `fe/.env.segel` las variables de la seccion 1 y en `fs/.env.segel` las de FS. Comprobar que no haya `JAVA_TOOL_OPTIONS`.
4. `up.sh`: crea `kude-cache`, aplica `045` en FE y `0037` en FS, levanta todo, recrea `api`, `worker-batch`, `worker-status-sync`, `worker-cargas`, `worker-correo` y `frontend` de FE con `--force-recreate` para que tomen las banderas nuevas y los topes de memoria, y reinicia el frontend de FS. `docker compose restart` no sirve para eso: no relee `env_file`.
4b. **Agenda de los lotes incompletos a 1 minuto** (decision del usuario, 2026-11-08, D-9; sentencia actualizada por FE para `rc4`). En la base de FE, despues de `migrate`:

   ```sql
   UPDATE batch_dispatch_defaults
      SET interval_minutes = 1, poll_seconds = 60, poll_max_tries = 45, updated_at = NOW()
    WHERE env IN ('test', 'prod');
   ```

   Es escritura en la base de produccion: se ejecuta solo con autorizacion directa del usuario en ese momento. Con `rc4` el lote lleno sale en el acto por el despacho inmediato (medido por FE: 1,3 a 1,5 s); la agenda solo decide los incompletos, que salen en la primera revision del minuto siguiente (medido: 46 s). `poll_seconds = 60` y `poll_max_tries = 45` mantienen el tope de consultas de un lote en 45 minutos, para no reabrir el falso `1002`. Antes de ejecutar, anotar los valores actuales de la fila para la vuelta atras: el mismo `UPDATE` con `interval_minutes = 15` y los `poll_*` anotados. `BATCH_WORKER_LOOP_SECONDS` queda en 60 y ya no interviene con el despacho inmediato.
5. Verificar (CA-02): `docker images`, `docker ps` sin reinicios en bucle, `GET /v1/health` con `java.*.ok` en `true`, FS hacia FE por la red interna, `ss -tln`, `docker logs` de `worker-correo` con `email.worker start`.
6. Consumidor del facturador existente: en el backoffice de FE, agregar el permiso `CARGA_MASIVA` y cuota diaria 500 (acordada con FE; se sube a 2.000 o mas cuando la VPS tenga mas memoria; el tope por archivo sigue en 5.000) al consumidor `segel-fs-<ruc_base>`. En el backoffice de FS, confirmar que el contexto del facturador numera por `SERVICIO`.
7. Primera factura en produccion desde la app, por el usuario (CA-03).
8. `docker stats --no-stream` y `df -h /var /home` (CA-05).

Vuelta atras: por bandera (RN-09) o entera con `FE_REF=segel-rc2` y la imagen anterior de FS, que sigue en la VPS. Se ensaya la vuelta por bandera en local (paso 8 del guion), no en la VPS.

## 4. Prueba de carga masiva en produccion (D-4, D-12)

Datos definidos por el usuario el 2026-11-08 (SPEC, D-12, D-17 y D-18):

| Punto | Valor |
|---|---|
| Total | 334.400 guaranies: 304 facturas de 1.100. Comprador 1: 100 (110.000). Compradores 2 y 3: 102 cada uno (112.200) |
| Compradores | 1) RUC 4732402-3, correo `gracielita076@gmail.com`. 2) RUC 1160463-8, correo `matiassaldiv@gmail.com`. 3) CI 5057036, MARIA CRISTINA SALDIVAR CAPUTO, correo `emiliomatsc@fpuna.edu.py`, a confirmar contra `emiliomatasc@fpuna.edu.py` (SPEC, D-17) |
| Columnas del comprador | RUC: `receptor_tipo_documento=RUC`, documento con guion y digito, naturaleza `FISICA` salvo que el padron diga otra cosa, nombre segun el padron DNIT, confirmado por el usuario. CI: `CI`, `5057036`, `FISICA`, `MARIA CRISTINA SALDIVAR CAPUTO`. FE acepta `CI` en la plantilla (su SPEC de carga masiva, columna `receptor_tipo_documento`) |
| Item | "Consultoria en tecnologia de la informacion", cantidad 1, precio 1.100 con IVA 10 % incluido (base 1.000, IVA 100) |
| Condicion | Contado, efectivo |
| Reparto | Una carga por comprador. Carga A (comprador 1): 100 facturas, dos lotes llenos de 50; va sola, como sonda. Cargas B y C (compradores 2 y 3): 102 cada una, dos lotes llenos y uno de 2 que espera la agenda del lote incompleto (1 minuto, D-9); se suben seguidas, para medir dos cargas a la vez, el estado `EN_COLA` y el lote que no se llena |
| Cuota | 304 facturas entran en la cuota diaria de 500 del consumidor; las tres cargas se hacen el mismo dia |
| Correo | Un correo por factura a la casilla de su comprador. El tercer comprador ya no usa `emilio.saldivar@segel.com.py`, que puede ser la del operador (D-17) |
| Numeracion | La del servicio: FE asigna los numeros, continuos |
| Archivos | Los genera FS con `scripts/segel-fs/generar-carga.py`, uno por carga, con `referencia_venta` propia por fila y fuera del repositorio; el usuario los revisa antes de subirlos |
| Quien sube y confirma | El usuario, desde la pestana Carga masiva del panel, con el operador del facturador, siguiendo la seccion 4.2 |
| Despues | Las facturas quedan emitidas. No se cancelan ni se anulan salvo que el usuario lo decida |

### 4.1 Mediciones y mapeo del comportamiento (D-15)

El objetivo es saber como se comporta la instancia con 300 facturas antes de que pase en produccion, y tener un criterio claro para frenar.

**Ensayo de volumen en la estacion, antes del despliegue.** Sobre `segel-rc4` (D-16), la misma tanda: cargas de 100, 102 y 102, la primera sola sobre el stack local del ensayo, en SIFEN test, con el bloque de numeros reservado (seccion 2.2). Los correos van todos a `esaldivar.segel@gmail.com`, nunca a los compradores reales. Con el mismo instrumental que se usara en la VPS. El resultado es la referencia contra la que se compara la prueba real. Lo ejecuta el usuario con su confirmacion, como el ensayo local (D-6).

**Que se mide, en el ensayo y en produccion:**

Ademas de lo de la tabla, en las cargas B y C se anota cuanto tarda en salir el lote de 2 despues del ultimo lote lleno.

| Que | Como | Para que |
|---|---|---|
| Linea base | Antes de subir: `docker stats --no-stream`, `df -h /var /home`, conteo de documentos por estado en FS y FE, siguiente numero del numerador del facturador en FE, lotes abiertos | Saber de donde se parte |
| Recursos | `docker stats` cada 5 s a un archivo, todo el tiempo de la prueba; `RestartCount` de cada contenedor al final | Picos de memoria y CPU por contenedor; reinicios |
| Linea de tiempo de cada carga | Estado de la carga con marca de tiempo cada 10 s: subida, `VALIDADA`, confirmacion, `EN_COLA`, `EN_PREPARACION`, `EN_SIFEN`, `FINALIZADA` | Duracion de cada etapa |
| Comprobantes | Conteo por estado fiscal y por estado de correo cada 30 s | Ritmo de aprobacion y de correo por minuto |
| Lotes | Lotes de la carga en FE: cuando se envian, cuantas consultas hasta su respuesta | Ver si algun lote se acerca al tope de 40 consultas |
| FS | Cuanto tarda una factura aprobada en verse en Documentos; intentos del worker de verificacion | Retraso de la sincronizacion |
| Errores | Logs de `worker-cargas`, `worker-correo`, `worker-batch` y de la API de FS filtrados por error o advertencia; lotes `WORKER_INTERRUPTED` y lineas `batch.huerfano` en FE | Fallas que no se ven en la pantalla |
| Correo en reintento | `correo_reintentando` y `correo_failed_24h` de la pagina "Operacion" de FE (`/admin/operacion/colas`, con la sesion del backoffice de FE del usuario), al final de cada carga | Con `rc4` un correo puede quedar `PENDING` hasta una hora antes de `FAILED`: distinguir atraso de falla |
| Worker de verificacion de FS | Intentos gastados por los documentos de carga mientras estan en `SENT_BATCH` | Insumo para decidir despues si se enciende `VERIFICACION_LOTE_SIN_REFRESH` (D-20) |
| Nota de credito | Una nota sobre una factura de la carga A, al terminar esa carga, con FS-38 ya implementado | CA-09 de `SPEC_NOTA_CREDITO_TRABADA_v0.1` |
| Disco | `du` de `kude-cache` y tamano de las dos bases, antes y despues | Crecimiento por documento |
| Cierre | Totales por comprador en FS y en FE; numeros sin saltos | CA-04 |

**Criterios para frenar.** Si pasa algo de esto, no se sube la carga siguiente y se avisa al usuario y a FE:

- un rechazo de SIFEN en la carga sonda;
- un contenedor reiniciando;
- FE, FS y Postgres sobre 3 GiB juntos (RN-08);
- un correo `FAILED`;
- un lote con mas de 20 consultas sin respuesta;
- un salto de numero.

**Instrumental.** Un script de FS que toma la linea base, muestrea mientras dura la prueba y deja un resumen en un archivo fuera de git, que luego se pasa a `TASKS` (E-2 para el ensayo de volumen, E-3 para produccion). Solo lee: no escribe en las bases ni cambia banderas. Parte de lo que ya existe: `scripts/segel-fs/carga-monitor.sh` (muestreo de la VPS por SSH, con la linea `CORTAR`) y `carga-resumen.cjs` (resumen de una corrida); lo nuevo es la linea de tiempo de la carga por `GET /api/v1/cargas/{id}` de FS, el conteo por estado fiscal y de correo, y que corra tanto contra el stack local del ensayo como contra la VPS. Lo implementa otra sesion (D-22), tarea SF2-018a.

### 4.2 Indicaciones para subir las cargas desde el panel

FS entrega los tres archivos y esta lista. El usuario la sigue y FS mide en paralelo.

1. FS toma la linea base y arranca el muestreo. Avisa cuando esta listo.
2. En el panel, con el operador del facturador: pestana **Carga masiva**, **Nueva carga**.
3. Arrastrar el archivo de la carga A. Esperar a que termine "Validando el archivo".
4. Revisar el informe: 100 filas validas, ninguna con problemas, y el total esperado. Si aparece cualquier error, no confirmar y avisar a FS.
5. **Confirmar y emitir.** La carga pasa por "En proceso", "En SIFEN" y "Finalizada".
6. Esperar a que la carga A quede "Finalizada" y FS confirme que no hubo ninguna condicion para frenar (seccion 4.1).
7. Subir la carga B y confirmarla. Enseguida, subir la carga C y confirmarla: debe mostrar "En espera de otra carga" mientras B avanza.
8. Esperar a que B y C queden "Finalizada". Al final de cada una, el lote de 2 sale solo.
9. En **Documentos**, revisar algunas facturas de cada comprador: KuDE descargable y correo enviado.
10. FS cierra el muestreo, compara totales de FS y FE y registra el resultado en `TASKS` (E-3).

Si algo se ve raro en cualquier paso, no se sube la carga siguiente: se usa "Copiar datos para soporte" en la carga y se avisa a FS.

## 5. Riesgos

| Riesgo | Mitigacion |
|---|---|
| Memoria de la VPS con dos workers mas y una JVM por firma o KuDE | `cpus: 1` en cada worker nuevo, `CARGA_FIRMAS_SIMULTANEAS=1`, medir en el ensayo local y en cada paso de la VPS; umbral de 3 GiB (RN-08) |
| El tag trae algo distinto de lo ensayado | Ensayo local con las mismas imagenes que van a la VPS; `FE_REF` y `FS_REF` fijos |
| Correos reales a un cliente durante la prueba | Correos definidos por el usuario (SPEC, D-12); en el ensayo de volumen van solo a la casilla Segel |
| Una falla aparece recien con 300 facturas | Ensayo de volumen en la estacion y criterios para frenar (seccion 4.1); la primera carga en produccion va sola |
| Un `java.*.ok` en `false` en la VPS | Vuelta atras del paso Java por bandera antes de emitir |
| Subida del archivo lenta frente al nginx | Los archivos de la prueba pesan unos KB; el caso del tope se mide en el ensayo local |
| Mas documentos en `SENT_BATCH` para el worker de verificacion de FS | No afecta a las facturas de carga; para las de la app, FS-24 queda en su cadena |
| Sin backups automaticos | En esta ocasion sin respaldo manual, por decision del usuario (SPEC, D-13); los backups siguen pendientes |
