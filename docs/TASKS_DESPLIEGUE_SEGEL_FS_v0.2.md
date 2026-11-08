# TASKS Despliegue Segel en VPS propia v0.2: segunda entrega, volumen y carga masiva

## Alineacion

- `docs/SPEC_DESPLIEGUE_SEGEL_FS_v0.2.md`
- `docs/PLAN_DESPLIEGUE_SEGEL_FS_v0.2.md`

## Estado

**Ensayo local y ensayo de volumen cerrados (2026-11-08). FS-38, runbook y medicion hechos (SF2-013e, SF2-013f, SF2-018a, SF2-018b). Queda el despliegue en `segel-fs` (SF2-014 en adelante): cuando FE termine sus pruebas y avise la version (D-26), con confirmacion directa del usuario. FS-40 ya esta corregido (`TASKS_CORRECCIONES_ENSAYO_VOLUMEN_v0.1`).** Historial: Lo que queda, en el orden de D-22 y para otra sesion: SF2-013f (FS-38, `TASKS_NOTA_CREDITO_TRABADA_v0.1`), SF2-013e (runbook), SF2-018a (medicion); despues el ensayo de volumen SF2-018b junto con FE; al final el despliegue y la prueba desde el panel (D-19). Sin respaldo manual en esta ocasion (D-13). **Paso 1 implementado (2026-11-07), por indicacion del usuario.** El ensayo local espera el tag `segel-rc3` (B-1). El despliegue y la prueba en produccion piden su propia confirmacion directa.

## Matriz

| ID | Paso | Tarea | Hecho cuando | Quien | Estado |
|---|---|---|---|---|---|
| SF2-001 | — | SPEC, PLAN y TASKS v0.2 | Decisiones D-1 a D-8 registradas; documentos en `AGENTS.md` | FS | DONE (2026-11-07) |
| SF2-002 | — | Confirmaciones pendientes del usuario: interpretacion de D-4 (100 facturas de 1.100, en 3 cargas), correo del comprador, cliente e item (B-3), respaldo manual (B-6), FS-24 dentro o fuera de la entrega (B-7) | Respuestas anotadas en el SPEC | Usuario | DONE (2026-11-08): D-12 a D-15 en el SPEC. Tres compradores con 100 facturas cada uno, sin respaldo, despliegue en espera, mediciones pedidas |
| SF2-003 | — | Tag `segel-rc3` publicado por FE | FE avisa; `git -C facturacion-electronica rev-parse segel-rc3` resuelve | FE, con autorizacion del usuario | PARTIAL (2026-11-08): tag `segel-rc3` local en `4f6e04a`, sin publicar en origin. Alcanza para construir en la estacion |
| SF2-004 | 1 | `build-images.sh` y `deploy.sh`: `FE_REF=segel-rc3`, imagenes `fe-segel-worker-cargas` y `fe-segel-worker-correo` | `bash -n`; `deploy.sh bundle` en un directorio temporal lista once imagenes | FS | DONE (2026-11-07), E-0 |
| SF2-005 | 1 | `up.sh`: crea `fe-runtime/runtime/kude-cache` antes del `chown`; `--force-recreate` de API y workers de FE tras el `up -d` | Ensayo local: la carpeta queda con dueno 1000 y FE escribe en ella; un cambio de bandera en `.env.segel` se ve en `docker exec ... printenv` tras `up.sh` | FS | DONE (2026-11-07), E-1 |
| SF2-006 | 1 | `fe.env.example` y `fs.env.example` con las variables de "todo encendido" y las dos banderas de D-5 en `false` (RN-03) | `init-env.sh test` en local produce archivos con esos valores; `check-no-secrets` en verde | FS | DONE (2026-11-07), E-0 |
| SF2-007 | 1 | `cargar-facturador.py --carga-masiva [cuota]` | Sin la opcion, el consumidor no recibe `CARGA_MASIVA`; con ella, el permiso y la cuota quedan en FE (ensayo local) | FS | DONE (2026-11-07), E-1 |
| SF2-008 | 1 | Runbook `OPERACION_DESPLIEGUE_SEGEL_FS_v0.1` actualizado | Fase 1, 2 y 7 segun PLAN, seccion 1 | FS | DONE (2026-11-07) |
| SF2-009 | 2 | Paquete local: bundle, `init-env.sh test`, archivos CSV de prueba y script generador, lista de verificacion del guion | Stack arriba con las imagenes de SF2-003 y SF2-004; sin secretos en git | FS | DONE (2026-11-07), por FE con `ensayo-local.sh`, E-1 |
| SF2-010 | 2 | Secretos, emisor de test, certificado y CSC en el stack local (B-4, B-5) | Readiness de FE sin faltantes; correo de prueba desde FS recibido | Usuario | DONE (2026-11-07), E-1 |
| SF2-011 | 2 | Ensayo local: guion del PLAN, seccion 2.3, pasos 1 a 9 | CA-01 y CA-06; resultados en E-1 | Usuario ejecuta, FS registra | DONE (2026-11-08), E-1: pasos 1 a 9; en el paso 8 se probo la bandera de FS, la de FE (`CARGAS_ENABLED`) la opera FE |
| SF2-012 | 2 | Cierre de la carga masiva contra FE real: CMF-018 y CMF-020, supuesto de `actualizado_en` con `correo` | Anotado en `TASKS_CARGA_MASIVA_FACTURAS_v0.1`; desvios del contrato corregidos y reensayados | FS | DONE (2026-11-08), E-1: carga masiva contra FE real cerrada; numero fiscal de carga verificado (`c38621a`) |
| SF2-013 | 3 | Respaldo de las dos bases en la VPS, paso 0 del despliegue | Dos dumps (`pg_dump -Fc`) con tamano registrado y restauracion comprobada antes de seguir; `df` antes y despues | FS, con autorizacion del usuario | DONE (2026-11-08) por FE (sesion `facturacion-electronica-b4`, pedido del usuario): `backup-segel-fs.sh` mas compose e ID de imagenes viejas; restaurado en un Postgres local (FE 1 documento y 43 migraciones, FS 1 factura y 36 migraciones). E-4 |
| SF2-013b | 3 | Pendientes de FE para esta etapa: tag `segel-rc4` en origin (D-16) y lo que FE informe como pendiente (SPEC, B-9) | FE avisa que esta alineado; el usuario lo confirma | FE | DONE (2026-11-08): FE avisa el tag publicado (`f83a83c`) y la decision de D-20; `git ls-remote` lo confirma |
| SF2-013g | 1 | Si el usuario elige `rc4.1` (D-25): `FE_REF=segel-rc4.1` en `build-images.sh` y `deploy.sh`; `NCE_EMAIL_ENABLED=true`, `EMAIL_QUEUE_POR_MINUTO=25` y `EMAIL_QUEUE_CONCURRENCY=2` en `fe.env.example` y en el runbook; verificacion de la migracion `046` | `bash -n`; `init-env.sh test` con los valores; tag publicado por FE | FS | PARTIAL (2026-11-08, `539711a` y `515c2b1`): scripts, plantilla y runbook con `rc4.1`, por el pedido del usuario de aplicar los pendientes (`SPEC_CORRECCIONES_ENSAYO_VOLUMEN_v0.1`, CEV-4). Falta el aviso de FE con la version lista para produccion (D-26); FS ajusta `FE_REF` con ese aviso |
| SF2-014 | 3 | Construccion y transferencia (`build-images.sh`, `deploy.sh files`, `deploy.sh images`) | `docker images` en la VPS con las once imagenes | FS | DONE (2026-11-08) por FE: imagenes de FS `97f7164` y FE `segel-rc4.1` construidas por FS en la estacion, transferidas con `deploy.sh files` y `images`; `/var` paso de 3,5 a 1,8 GiB libres. E-4 |
| SF2-015 | 3 | Variables en `fe/.env.segel` y `fs/.env.segel` de la VPS, a mano | Valores de RN-03 presentes; sin `JAVA_TOOL_OPTIONS` | FS | DONE (2026-11-08) por FE: copia `.env.segel.antes-rc4.1`; 45 variables en FE y 22 en FS desde las plantillas de `97f7164`; `EMAIL_QUEUE_CONCURRENCY` 2 y `KUDE_JAVA_BIN` java-corto. E-4 |
| SF2-016 | 3 | `up.sh` y verificacion CA-02 | Salud, workers sin bucle, `java.*.ok` en `true`, puertos publicados correctos | FS | DONE (2026-11-08) por FE: `up.sh` aplico FE 044 a 046 y FS 0037 a 0039; servicios con topes, logs 10m x 5, sin reinicios, un solo node en `worker-batch`, java ok. `kude-cache` lo creo FE desde un contenedor (corregido en `up.sh`). E-4 |
| SF2-016b | 3 | Espera de lotes incompletos a 1 minuto en la base de FE (PLAN, seccion 3, paso 4b) | `batch_dispatch_defaults.interval_minutes` en 1; una factura sola entra en lote en menos de 2 minutos | FS, con autorizacion directa del usuario | DONE (2026-11-08) por FE: agenda de lotes en 1/60/45. E-4 |
| SF2-017 | 3 | Consumidor del facturador: permiso `CARGA_MASIVA` y cuota en el backoffice de FE; contexto en `SERVICIO` en FS; `forma_numeracion` del numerador de FE nula o `SERVICIO`, nunca `CLIENTE`; numerador de nota de credito (tipo 5) en el mismo establecimiento y punto del contexto, porque sin el FE rechaza la nota de credito (visto en el ensayo local) | `GET /v1/cargas/plantilla` con la clave del consumidor responde `200` | FS, por los backoffices | PARTIAL (2026-11-08), lectura de FE en produccion: (a) **falta**: el consumidor `segel-fs-5057016-1` no tiene `CARGA_MASIVA` y su cuota es nula; FE pidio autorizacion al usuario para escribirlo y la carga masiva no arranca hasta su aviso. (b) `forma_numeracion` nula en los 4 numeradores, ninguno bloqueado. (c) Hay numerador de NC en 001-001 y 001-002. (d) Los dos contextos de FS numeran por `SERVICIO`: 001-001 "TALLERES DE CHAPERIA Y PINTURA" y 001-002 "OTRAS ACTIVIDADES...". Linea base: facturas 001-001 en 13 y 001-002 en 56; NC 001-001 en 2 y 001-002 en 3. **Pendiente del usuario:** con que contexto se emite la prueba, o si cambia el item. El emisor tiene solo dos actividades, ninguna de consultoria informatica (CIIU 620x): 001-002 con 96099 "OTRAS ACTIVIDADES DE SERVICIOS PERSONALES N.C.P." (principal) y 001-001 con 45203 "TALLERES DE CHAPERIA Y PINTURA"; ambas en el timbrado 1, vigente desde 2026-05-19; FE y FS coinciden (lectura de FE) |
| SF2-018 | 3 | Primera factura en produccion y medicion de recursos | CA-03 y CA-05 | Usuario emite, FS mide | BLOCKED: espera SF2-017 |
| SF2-013c | 1 | `FE_REF=segel-rc4` en `build-images.sh` y `deploy.sh` (D-16) | `bash -n`; `deploy.sh bundle` lista once imagenes con el tag nuevo | FS | DONE (2026-11-08), `eb4505d`: `bash -n` sin errores; `deploy.sh bundle` con `FS_REF=HEAD` trae el compose de FE de `segel-rc4` (`mem_limit` con `FE_*_MEM`) y la lista de once imagenes no cambia |
| SF2-013d | 1 | `fe.env.example` con el bloque `rc4` y `RECONCILE_DEFERRED_ENABLED=true` (D-20, RN-03); `up.sh` recrea tambien el `frontend` de FE, que toma su tope de memoria (documento de FE, seccion 5, paso 1) | `init-env.sh test` en un directorio temporal produce esos valores; `bash -n`; `check-no-secrets` en verde | FS | DONE (2026-11-08), `eb4505d`: `init-env.sh test` sobre el bundle temporal da `RECONCILE_DEFERRED_ENABLED=true`, `SIFEN_CONSULT_DETECTS_CANCEL_ENABLED=false`, el bloque `rc4` completo, y en FS `CARGA_MASIVA_ENABLED=true` y `VERIFICACION_LOTE_SIN_REFRESH=false`; `up.sh` del bundle recrea el `frontend` de FE; `check-no-secrets` OK. Bundle temporal borrado |
| SF2-013e | 1 | Runbook `OPERACION_DESPLIEGUE_SEGEL_FS_v0.1` para `rc4`: `FE_REF`, bloque `rc4`, `RECONCILE_DEFERRED_ENABLED=true`, sentencia 4b nueva, recreacion de los seis servicios, lectura de `correo_reintentando` (PLAN, secciones 1, 3 y 4.1) | Lectura cruzada con el PLAN; CA-07 | FS | DONE (2026-11-08): fases 1, 2, 7 y 8 al dia; verificacion de banderas y topes de memoria, agenda 4b, medicion y notas de credito sin confirmar |
| SF2-013f | 1 | FS-38 cerrado: `TASKS_NOTA_CREDITO_TRABADA_v0.1` NCT-000 a NCT-012 en DONE (D-21; CA-09) | Evidencia en esa cadena; commit en la rama Segel | FS | DONE (2026-11-08), `a680ee2`: 636 pruebas, integracion 4/4, Playwright 10/10 en 390 y 1280; NC real sobre factura de carga en E-2 |
| SF2-018a | 2 | Script de medicion de FS (PLAN, seccion 4.1): linea base, muestreo, linea de tiempo de la carga, conteos por estado fiscal y de correo, `correo_reintentando` y resumen; solo lectura; corre contra el stack local y contra la VPS | `bash -n`; corrida corta en el stack local del ensayo que deja el resumen | FS | DONE (2026-11-08): `scripts/segel-fs/medir-carga.sh` (`inicio`, `marca`, `fin`; `MEDIR_DESTINO=vps` por ssh); corrida corta y ensayo de volumen en E-2 |
| SF2-018b | 2 | Ensayo de volumen en la estacion sobre `segel-rc4`: cargas de 100, 102 y 102, la primera sola (PLAN, seccion 4.1) | Las 304 aprobadas sin saltos; los lotes de 2 salen solos; ninguna condicion de freno; mapa en E-2 | Playwright desde el panel, FS mide, FE mide su lado | DONE (2026-11-08), E-2: sondeo de 3 mas 304, las 307 aprobadas, numeros 1010036 a 1010342 sin saltos, ninguna condicion de freno. Correos a los compradores reales (D-23), con una pausa y cambio de correo por pedido del usuario (D-24). Cubre el DI-502 de FE |
| SF2-019 | 4 | Archivos de la prueba en produccion, generados con los datos de D-12 y revisados por el usuario | Tres archivos: A con 100 filas (110.000), B y C con 102 (112.200); nombres de los RUC confirmados; correo del tercer comprador confirmado; correo del operador distinto de los de los compradores; indicaciones del PLAN, seccion 4.2, entregadas | FS genera, usuario revisa | PARTIAL (2026-11-08): archivos generados fuera de git con punto 001-002 e item de D-29: A 100 a `emilio.saldivar97@gmail.com` (110.000), B 102 a `matiassaldiv@gmail.com` (112.200), C 102 a `emiliomatasc@fpuna.edu.py` (112.200). Falta la revision del usuario; si la prueba es otro dia se regeneran por la fecha de emision |
| SF2-020 | 4 | Prueba en produccion: subida, confirmacion, seguimiento y medicion | CA-04, CA-05 y CA-08; resultados en E-3 | Usuario sube y confirma, FS mide | BLOCKED: espera SF2-019 y confirmacion directa |
| SF2-021 | — | Cierre: SPEC, PLAN, TASKS v0.2, runbook, cadenas de carga masiva y correcciones, `BACKLOG` | Documentos alineados con lo desplegado; CA-07 | FS | TODO |

## Pedido de FE: estimacion de infraestructura

FE reune (2026-11-07) los numeros de FE y FS para que el usuario pida recursos a infraestructura. Lo que FS tiene medido esta en la respuesta enviada a FE y en `TASKS_DESPLIEGUE_SEGEL_FS_v0.1` E-4 y E-9, y en `TASKS_CARGA_SEGEL_FS_v0.1`. Falta medir FS bajo carga masiva real: sale del ensayo local (SF2-011, paso 9) y de la prueba en produccion (SF2-020).

## Respuestas de FE (2026-11-07)

- Numeracion del ensayo local: bloque 1010000 a 1019999 del punto 001-001 de 5057016-1, reservado para FS (PLAN, seccion 2.2).
- Cuota diaria de produccion: 500 para arrancar; 2.000 o mas con mas memoria en la VPS.
- Recarga de banderas: `docker compose restart` no relee `env_file`; hace falta `up -d --no-build --force-recreate` de API y workers (PLAN, seccion 1 y 3).
- La prueba real de 110.000 Gs figura en la cadena de FE como tarea compartida DEM-814.

## Evidencia

### E-0. Scripts y plantillas (2026-11-07)

`bash -n` de los scripts y `check-no-secrets` en verde. API: 594 pruebas pasan, 0 fallan. Ensayo en seco con `deploy.sh bundle` e `init-env.sh test`, con el compose de la punta de `branding/segel-staging` y sin levantar nada: `compose config` resuelve las imagenes `fe-segel-*` que construye `build-images.sh`, `cpus: 1` en los dos workers, `kude-cache` en `api`, `worker-batch` y `worker-correo`. Nuevos: `generar-carga.py` y `ensayo-local.sh`. Sin probar contra un stack: `up.sh` con `--force-recreate` y `cargar-facturador.py --carga-masiva`, que se prueban en el ensayo local.

FS-24 entro en esta entrega, partido en dos por la condicion de FE: la espera de `SENT_BATCH` a 15 min sin gastar intentos vale siempre, y omitir el `refresh` queda con `VERIFICACION_LOTE_SIN_REFRESH=false` (`SPEC_CORRECCIONES_TRAS_FIXES_FE_v0.1`, RN-24.0 y RN-24.1).

### E-1. Ensayo local (2026-11-07 y 2026-11-08)

Stack armado por FE con `ensayo-local.sh`, `up.sh`, `bootstrap.sh` y `cargar-facturador.py --carga-masiva 1000`, en puertos 18492 y 18500, SIFEN test real, correo real de la casilla Segel a `esaldivar.segel@gmail.com`. FS de `cd621b7` a `6518c72`, FE `segel-rc3` (`4f6e04a`). Guion por API (`ensayo-guion.cjs`) y cuadre de solo lectura entre las dos bases.

- Factura contado aprobada; correo recibido por el usuario despues de la aprobacion.
- Factura rechazada a proposito con `1306`: sin correo al cliente (`EMAIL_TRAS_APROBACION`), motivo real en FS (FS-20), estado de correo resuelto (FS-27). El usuario recibio el aviso de FS al facturador, que comparte casilla con el receptor en el ensayo.
- Carga de 10 y carga de 4 con una fila invalida: `FINALIZADA`, 13 aprobadas, 13 correos, informe con fila y columna, mismos totales en FS y FE, numeracion `SERVICIO`.
- Cancelacion: `0100` transitorio de SIFEN, registrado como reintentable (FS-23); aceptada al reintentar; una pasada de sincronizacion no la revirtio.
- Nota de credito: aprobada, tras crear FE el numerador tipo 5 en 001-001, que faltaba en el emisor de prueba.
- Cuadre final: 16 documentos con `document_uuid` en FS y FE, sin diferencias de estado, CDC ni numero; numeros 1010000 a 1010014 sin repetir; 5 lotes `DONE`.
- Correcciones encontradas en el ensayo: FS-27, FS-28, FS-29, FS-30, FS-31 y el formato del numero fiscal de carga. Playwright de FS-28, FS-29 y FS-31: 18 de 18.
- FE midio el pool SMTP: 5,9 s el primer correo y 1,1 s los siguientes. Espera de lotes incompletos bajada a 1 minuto en el ensayo: una factura sola entro en lote a los 36 s.

- Numero fiscal de carga (`c38621a`): una carga de 1 factura quedo como `1010017`, sin prefijo de punto, y la busqueda por numero la encuentra.
- Paso 8 (FS `772630a`): con `CARGA_MASIVA_ENABLED=false` y la API recreada (`up -d --no-deps --force-recreate api`), `GET /cargas` responde `404`, el boton "Carga masiva" no aparece en Documentos (Playwright 390x844 y 1280x800) y los 14 documentos de carga siguen listados (CA-06). Vuelta a `true`: `200`, el boton vuelve, mismos documentos. La bandera de FE `CARGAS_ENABLED` no se toco: la opera FE en su stack.
- Paso 9: carga de 3 facturas de 1.100 Gs con los correos en curso, `docker stats` cada 5 s durante 5 min. En reposo, FS (API, web, Postgres, cron) unos 81 MiB y FE (API, 4 workers, web, Postgres) unos 105 MiB. Pico por contenedor: `worker-correo` 123 MiB y 68 % de CPU, `worker-cargas` 53 MiB, `worker-batch` 48 MiB, API de FE 43 MiB, API de FS 42 MiB; la suma de los picos da 413 MiB para los once contenedores. `kude-cache` ocupa 764 KB con 20 documentos. Las 3 facturas quedaron `EMITIDA` con correo `SENT` (1010018 a 1010020). La muestra es chica: la referencia de la carga grande sale de la prueba en produccion (SF2-020).

### E-2. Ensayo de volumen en la estacion (2026-11-08)

Stack `.local/segel-ensayo`: FE `segel-rc4` (`57368e1`) con `RECONCILE_DEFERRED_ENABLED=true`, `BATCH_DESPACHO_SEGUNDOS=2`, `EMAIL_QUEUE_MAX_ATTEMPTS=6`, agenda de lotes 1/60/45, `java.*.ok` en `true`; FS `a680ee2` (FS-38, migracion `0038`). SIFEN test, emisor 5057016-1, contexto 001-001 `SERVICIO`, operador `operador-ensayo`. Archivos con `generar-carga.py`, fuera de git. Playwright `scripts/segel-fs/playwright-ensayo-volumen.cjs` desde el panel en 390 px; medicion `medir-carga.sh` (`test-results/medicion/volumen-20261108/`). FE midio su lado (sesion `facturacion-electronica-b4`).

| Carga | Comprador | Facturas | Confirmada (UTC) | Finalizada (UTC) | Aprobadas |
|---|---|---|---|---|---|
| Sondeo | Una por comprador | 3 | 16:48:40 | 16:50:27 | 3 |
| A | RUC 4732402-3 | 100 | 16:51:17 | 16:53:19 | 100 |
| B | RUC 1160463-8 | 102 | 16:54:10 | 16:57:10 | 102 |
| C | CI 5057036 | 102 | 16:54:36 | 16:57:09 | 102 |

- **Resultado:** 307 `APPROVED`, 0 rechazos, numeros 1010036 a 1010342 continuos (307 distintos). 1160463-8 paso como receptor en SIFEN test en el sondeo, antes de la carga.
- **Cargas:** validacion 9 a 22 s; preparacion y envio 102 a 123 s por carga. C paso por "En espera de otra carga" un segundo despues de confirmarla y empezo a emitirse 31 s despues. La verificacion automatica de Playwright de ese paso dio falso negativo por leer la pantalla antes del cambio (corregido en el script); las marcas muestran el estado correcto.
- **Lotes (FE):** 9, todos `0300`/`0362`; 0 en `0301` y 0 en error; 1 o 2 consultas por lote; lotes llenos enviados 2,1 a 3,4 s despues de su ultimo documento; los 3 incompletos en la primera revision del minuto siguiente (9, 21 y 55 s); maximo 3 lotes por minuto; resultado SIFEN a los 41 s de media. 0 falsos `1002` y 0 reconciliaciones diferidas abiertas.
- **Recursos:** sin reinicios ni OOM. Picos: `worker-cargas` 106 MiB y 99 % de CPU, `worker-correo` 91 MiB, API de FE 72 MiB, `worker-batch` 56 MiB, Postgres de FE 51 MiB, API de FS 49 MiB. Suma de picos de los once contenedores: 454 MiB, igual en la medicion de FS y en la de FE. Lejos del umbral de 3 GiB.
- **Correos:** son el cuello de botella, a unos 10 a 12 por minuto. A las 16:57 seguian 246 en cola, 0 fallidos y 0 en reintento. Pausa y cambio de correo por pedido del usuario (D-24): FS detuvo el worker de correo a las 16:57:17, FE redirigio 42 pendientes a `emilio.saldivar97@gmail.com` y reanudo. 59 ya habian salido a `gracielita076@gmail.com`. Cierre de la cola: FE reanudo a las 16:58:32 y los 246 salieron en 996 s, unos 15 por minuto, todos al primer intento, sin reintentos ni `FAILED` (medicion de FE). El limite es de FE (`EMAIL_QUEUE_CONCURRENCY=1`, unos 4 s por correo con el KuDE; Office 365 admite 30 por minuto): observacion para el usuario. Totales: `emiliomatasc` 103, `matiassaldiv` 103, `emilio.saldivar97` 42 y `gracielita076` 59 `SENT`.
- **Nota de credito real (CA-09 de `SPEC_NOTA_CREDITO_TRABADA_v0.1`):** desde el panel, sobre una factura de la carga C, a las 16:59. Entro en lote como numero 1010002 (tipo 5), "Procesando nota credito" y no "sin confirmar", que es lo correcto en lote; FE la aprobo a las 17:00:01 y FS la mostro emitida a las 17:04:27 por la verificacion automatica. FE dejo su correo en `NOT_APPLICABLE` aunque FS mando el correo del comprador: consultado a FE. Una nota en `TRANSMISSION_FAILED` real no se puede provocar con envio por lote (FE): FS-38 queda cubierto con el mock.

- **Hallazgo FS-40 (Alta):** FS dejo de sincronizar cada carga al quedar `FINALIZADA`, y los correos que salieron despues no llegaron a Documentos: 295 de 307 seguian "pendiente". Forzando una sincronizacion en la base del ensayo, las 307 pasaron a `SENT`. Registrado en `BACKLOG.md` con el arreglo propuesto; el usuario decide si entra antes del despliegue.
- **Hallazgo FS-41:** FE no manda correo para las notas de credito (sin `receptor.email` en su esquema). Registrado en `BACKLOG.md`.
- Medicion de la cola de correos: `test-results/medicion/volumen-correos-20261108/`, pico de `worker-correo` 91 MiB y 105 % de CPU, suma de picos 372 MiB.

### E-2b. Prueba de FE `rc4.1` desde el panel (2026-11-08)

Mismo stack, con FE `05d4811` (`rc4.1`) y FS `b20fa23`, `NCE_EMAIL_ENABLED=true`, `EMAIL_QUEUE_POR_MINUTO=25`, `EMAIL_QUEUE_CONCURRENCY=2`. Medicion en `test-results/medicion/rc41-20261108/`; FE la registro en su `VERIFICACION_CORREO_NC_ANULACION_Y_RITMO`, V012.

- **Carga de 60** a RUC 4732402-3, con el correo `emilio.saldivar97@gmail.com` (D-24): confirmada a las 17:59:52 y finalizada a las 18:01:54. Las 60 fueron aprobadas desde el numero 1010343, en 3 lotes `0300`, con 2 consultas como maximo.
- **Nota de credito** desde el panel sobre la 1010343, a las 18:02:18: NCE 1010003, aprobada, con correo `SENT` a las 18:04:49. FS la mostro emitida a las 18:07:37. **FS-41 resuelto por FE sin cambios en FS**: FS ya mandaba `receptor.email`.
- **Anulacion** de la 1010344: el primer intento, a las 18:03:04, fue rechazado por SIFEN test con `0100` "Error Inesperado", reintentable (el caso de FS-23), y no genero aviso. "Reintentar anulacion" desde el panel, a las 18:03:34: aceptada, aviso encolado y enviado (FE).
- **Correos:** 62 en total, 9, 18, 18 y 17 por minuto, con un maximo de 20 en 60 s. 0 rechazos `4xx` de Office 365, 0 reintentos y 0 `FAILED`. Cada correo tarda unos 6,5 s (KuDE 5,2 s y SMTP 1,2 s). Con `CORREO_WORKER_CPUS=1` no se llega al tope de 25: subirlo es decision del usuario (FE).
- **Recursos:** pico de `worker-correo` 153 MiB con concurrencia 2 (tope 512 MiB); suma de picos de los once contenedores 519 MiB; sin reinicios.
- **FS-40 reproducido:** 51 de 60 facturas siguieron con el correo "pendiente" en FS despues del cierre de la carga.
- **Dato de FE para produccion:** la copia oculta del correo va al correo del emisor cargado en FE. En el ensayo era `facturacion@ventax.app`; en `segel-fs` hay que revisar ese dato del emisor antes de la prueba real.

### E-2c. Correcciones tras el ensayo (2026-11-08)

FS-40 corregido, topes de recursos de FS y FE aplicados, correo de la nota de credito en FS y preparacion para `rc4.1`, validados de punta a punta en el ensayo: `TASKS_CORRECCIONES_ENSAYO_VOLUMEN_v0.1`, E-1 a E-3.

### E-4. Despliegue en `segel-fs` (2026-11-08, noche)

Hecho por FE desde su sesion, por pedido del usuario ("opcion 2"), con FE `segel-rc4.1` (`52564c3`) y FS `97f7164`, con las imagenes construidas por FS en la estacion. Evidencia informada por FE; FS no pudo verificar en lectura porque en su sesion el acceso SSH a produccion esta bloqueado por permisos.

- Respaldo previo de las dos bases, restaurado en local antes de seguir (D-28).
- Once imagenes con los mismos ID que en la estacion. `/var` paso de 3,5 a 1,8 GiB libres y quedo en 2,2 GiB tras el arranque. RAM disponible 2,3 GiB.
- Variables: copia `.env.segel.antes-rc4.1` en FE y FS; 45 variables en FE y 22 en FS tomadas de las plantillas de `97f7164`.
- Migraciones: FE 044 a 046, FS 0037 a 0039 (el padron queda con dos indices).
- Agenda de lotes 1/60/45.
- Verificacion: todos los servicios con sus topes y logs de 10 MB por 5, sin reinicios; un solo node en `worker-batch`; banderas de `rc4.1` dentro de los contenedores; `worker-correo` con concurrencia 2 y java ok; FE responde 200 y FS 302.
- Hallazgo: `up.sh` creaba `kude-cache` con el usuario de deploy, y en la VPS `fe-runtime/runtime` es de otro usuario con permiso 755. FE la creo desde un contenedor. **Corregido en FS:** `up.sh` crea todas las carpetas de `fe-runtime` desde el contenedor, junto con el `chown`; probado con la carpeta en 555.
- Pendientes: las imagenes viejas siguen en la VPS sin etiqueta, para volver atras; FE las borra despues de la prueba del usuario. SF2-017 (permiso `CARGA_MASIVA`, cuota y numeradores) consultado a FE.

Pendiente: E-3, prueba en produccion.
