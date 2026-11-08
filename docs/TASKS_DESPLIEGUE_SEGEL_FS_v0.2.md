# TASKS Despliegue Segel en VPS propia v0.2: segunda entrega, volumen y carga masiva

## Alineacion

- `docs/SPEC_DESPLIEGUE_SEGEL_FS_v0.2.md`
- `docs/PLAN_DESPLIEGUE_SEGEL_FS_v0.2.md`

## Estado

**Paso 1 implementado (2026-11-07), por indicacion del usuario.** El ensayo local espera el tag `segel-rc3` (B-1). El despliegue y la prueba en produccion piden su propia confirmacion directa.

## Matriz

| ID | Paso | Tarea | Hecho cuando | Quien | Estado |
|---|---|---|---|---|---|
| SF2-001 | — | SPEC, PLAN y TASKS v0.2 | Decisiones D-1 a D-8 registradas; documentos en `AGENTS.md` | FS | DONE (2026-11-07) |
| SF2-002 | — | Confirmaciones pendientes del usuario: interpretacion de D-4 (100 facturas de 1.100, en 3 cargas), correo del comprador, cliente e item (B-3), respaldo manual (B-6), FS-24 dentro o fuera de la entrega (B-7) | Respuestas anotadas en el SPEC | Usuario | TODO |
| SF2-003 | — | Tag `segel-rc3` publicado por FE | FE avisa; `git -C facturacion-electronica rev-parse segel-rc3` resuelve | FE, con autorizacion del usuario | PARTIAL (2026-11-08): tag `segel-rc3` local en `4f6e04a`, sin publicar en origin. Alcanza para construir en la estacion |
| SF2-004 | 1 | `build-images.sh` y `deploy.sh`: `FE_REF=segel-rc3`, imagenes `fe-segel-worker-cargas` y `fe-segel-worker-correo` | `bash -n`; `deploy.sh bundle` en un directorio temporal lista once imagenes | FS | DONE (2026-11-07), E-0 |
| SF2-005 | 1 | `up.sh`: crea `fe-runtime/runtime/kude-cache` antes del `chown`; `--force-recreate` de API y workers de FE tras el `up -d` | Ensayo local: la carpeta queda con dueno 1000 y FE escribe en ella; un cambio de bandera en `.env.segel` se ve en `docker exec ... printenv` tras `up.sh` | FS | DONE (2026-11-07), E-1 |
| SF2-006 | 1 | `fe.env.example` y `fs.env.example` con las variables de "todo encendido" y las dos banderas de D-5 en `false` (RN-03) | `init-env.sh test` en local produce archivos con esos valores; `check-no-secrets` en verde | FS | DONE (2026-11-07), E-0 |
| SF2-007 | 1 | `cargar-facturador.py --carga-masiva [cuota]` | Sin la opcion, el consumidor no recibe `CARGA_MASIVA`; con ella, el permiso y la cuota quedan en FE (ensayo local) | FS | DONE (2026-11-07), E-1 |
| SF2-008 | 1 | Runbook `OPERACION_DESPLIEGUE_SEGEL_FS_v0.1` actualizado | Fase 1, 2 y 7 segun PLAN, seccion 1 | FS | DONE (2026-11-07) |
| SF2-009 | 2 | Paquete local: bundle, `init-env.sh test`, archivos CSV de prueba y script generador, lista de verificacion del guion | Stack arriba con las imagenes de SF2-003 y SF2-004; sin secretos en git | FS | DONE (2026-11-07), por FE con `ensayo-local.sh`, E-1 |
| SF2-010 | 2 | Secretos, emisor de test, certificado y CSC en el stack local (B-4, B-5) | Readiness de FE sin faltantes; correo de prueba desde FS recibido | Usuario | DONE (2026-11-07), E-1 |
| SF2-011 | 2 | Ensayo local: guion del PLAN, seccion 2.3, pasos 1 a 9 | CA-01 y CA-06; resultados en E-1 | Usuario ejecuta, FS registra | PARTIAL (2026-11-08), E-1: pasos 1 a 7 hechos; faltan el 8 (apagar banderas) y el 9 (medicion de memoria) |
| SF2-012 | 2 | Cierre de la carga masiva contra FE real: CMF-018 y CMF-020, supuesto de `actualizado_en` con `correo` | Anotado en `TASKS_CARGA_MASIVA_FACTURAS_v0.1`; desvios del contrato corregidos y reensayados | FS | PARTIAL (2026-11-08), E-1: carga masiva contra FE real cerrada; queda verificar en pantalla el numero fiscal de carga (`c38621a`) |
| SF2-013 | 3 | Respaldo manual de las dos bases en la VPS | Dos dumps en `~/segel/backups`, con tamano y `df` registrados | FS, con autorizacion del usuario | BLOCKED: espera SF2-002 y confirmacion directa |
| SF2-014 | 3 | Construccion y transferencia (`build-images.sh`, `deploy.sh files`, `deploy.sh images`) | `docker images` en la VPS con las once imagenes | FS | BLOCKED: espera SF2-011 y confirmacion directa |
| SF2-015 | 3 | Variables en `fe/.env.segel` y `fs/.env.segel` de la VPS, a mano | Valores de RN-03 presentes; sin `JAVA_TOOL_OPTIONS` | FS | BLOCKED: espera SF2-014 |
| SF2-016 | 3 | `up.sh` y verificacion CA-02 | Salud, workers sin bucle, `java.*.ok` en `true`, puertos publicados correctos | FS | BLOCKED: espera SF2-015 |
| SF2-016b | 3 | Espera de lotes incompletos a 1 minuto en la base de FE (PLAN, seccion 3, paso 4b) | `batch_dispatch_defaults.interval_minutes` en 1; una factura sola entra en lote en menos de 2 minutos | FS, con autorizacion directa del usuario | BLOCKED: espera SF2-016 |
| SF2-017 | 3 | Consumidor del facturador: permiso `CARGA_MASIVA` y cuota en el backoffice de FE; contexto en `SERVICIO` en FS; `forma_numeracion` del numerador de FE nula o `SERVICIO`, nunca `CLIENTE`; numerador de nota de credito (tipo 5) en el mismo establecimiento y punto del contexto, porque sin el FE rechaza la nota de credito (visto en el ensayo local) | `GET /v1/cargas/plantilla` con la clave del consumidor responde `200` | FS, por los backoffices | BLOCKED: espera SF2-016 y B-2 |
| SF2-018 | 3 | Primera factura en produccion y medicion de recursos | CA-03 y CA-05 | Usuario emite, FS mide | BLOCKED: espera SF2-017 |
| SF2-019 | 4 | Archivos de la prueba en produccion, generados con los datos del usuario y revisados por el | Tres archivos con 20, 30 y 50 filas, que suman 110.000 | FS genera, usuario revisa | BLOCKED: espera SF2-002 y SF2-018 |
| SF2-020 | 4 | Prueba en produccion: subida, confirmacion, seguimiento y medicion | CA-04 y CA-05; resultados en E-3 | Usuario sube y confirma, FS mide | BLOCKED: espera SF2-019 y confirmacion directa |
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

Pendientes: pasos 8 y 9 del guion; E-2 despliegue; E-3 prueba en produccion.
