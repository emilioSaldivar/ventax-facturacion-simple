# TASKS Correcciones Tras El Ensayo De Volumen v0.1

## Alineacion

- `docs/SPEC_CORRECCIONES_ENSAYO_VOLUMEN_v0.1.md`
- `docs/PLAN_CORRECCIONES_ENSAYO_VOLUMEN_v0.1.md`

## Estado

Documentado, implementado y validado el 2026-11-08, sin despliegue (D-14 de despliegue v0.2). Commits locales `539711a`, `ed52650` y `515c2b1`.

## Matriz

| ID | Tema | Tarea | Validacion | Estado |
|---|---|---|---|---|
| CEV-001 | — | SPEC, PLAN y TASKS; `AGENTS.md`; `BACKLOG.md` | Documentos consistentes | DONE (2026-11-08) |
| CEV-101 | CEV-1 | `agendaPorCorreo`, `contarCorreosPendientes` y su uso en el worker | Pruebas de PLAN, seccion 1 | DONE (`539711a`): 7 pruebas nuevas en `cargas-sync.worker.test.ts` |
| CEV-102 | CEV-1 | Ensayo: carga de 20 con correo, sin intervencion manual | CA-02 | DONE (E-3): 20 de 20 en `SENT` en FS a las 19:21:30, sin intervencion |
| CEV-201 | CEV-2 | Topes por variable en el compose de FS; valores en `fs.env.example` | `docker compose config` con y sin variables (CA-03) | DONE (`539711a`): sin variables no hay topes; con variables se aplican (E-1) |
| CEV-202 | CEV-2 | Topes de FE en `fe.env.example` con lo que confirme FE; pedido de rotacion de logs y tope de su Postgres | Respuesta de FE registrada | DONE (`515c2b1`): FE agrego topes a su Postgres, CPU y procesos a todos sus servicios, rotacion de logs y `memswap_limit` igual al tope (FE `1fcb1bf`, `a0fe918`); valores en `fe.env.example` |
| CEV-203 | CEV-2 | Topes aplicados en el ensayo e importacion DNIT completa | `docker inspect`; pico del cargador; sin `OOMKilled` (CA-03, CA-04) | DONE (E-2): 13 contenedores con topes; DNIT completo sin `OOMKilled` |
| CEV-301 | CEV-3 | Estado del correo de la nota de credito | Prueba unitaria; nota real en el ensayo (CA-05) | DONE (`ed52650`): 4 pruebas nuevas; nota real con correo `SENT` en FS (E-3) |
| CEV-401 | CEV-4 | `FE_REF=segel-rc4.1` y tres variables | `bash -n`; `init-env.sh test` en un directorio temporal | DONE (`539711a`): `bash -n`; `init-env.sh test` sobre el paquete da las tres variables. El tag `segel-rc4.1` sigue sin publicar |
| CEV-501 | CEV-2, CEV-4, CEV-5 | Runbook | Lectura cruzada (CA-07) | DONE (`515c2b1`) |
| CEV-601 | Todos | Suites, `deploy.sh` (fs-cm), Playwright de regresion | CA-06 | DONE (E-1) |
| CEV-602 | Todos | Cierre: SPEC, PLAN y TASKS repasados; `BACKLOG` y cadena de despliegue v0.2 | Documentos alineados | DONE |

## Evidencia

### E-1. Pruebas y regresiones (2026-11-08)

- `vitest` del workspace `api`: 643 en verde y 39 omitidas tras CEV-1 (eran 636); mas 4 de CEV-3 en `nota-credito.clasificacion.test.ts`. `typecheck` y `lint` limpios; `web-operacion` `typecheck` y `build` limpios; `check-no-secrets` OK.
- `bash scripts/deploy.sh` (fs-cm, mock) con el codigo nuevo: Playwright de nota de credito trabada 10/10 y de carga masiva 86/86.
- `docker compose config` del compose de FS: sin variables, ningun `mem_limit` ni `cpus` y `pids_limit: -1`; con `FS_API_MEM=256m`, `FS_API_CPUS=1` y `FS_API_PIDS=256`, `mem_limit` y `memswap_limit` de 268435456, `cpus: 1` y `pids_limit: 256`. El paquete de `deploy.sh bundle` con `init-env.sh test` trae los topes de FS, las variables de `rc4.1` y la reconciliacion encendida.

### E-2. Topes en el ensayo e importacion DNIT (2026-11-08)

- Ensayo con FS `539711a` y luego `ed52650`, y FE `05d4811` y luego `d0d9fe0`. `docker inspect` de los 13 contenedores: cada uno con su tope de memoria, swap igual al tope, CPU y procesos segun las plantillas, logs `10m`, sin reinicios ni `OOMKilled`.
- Importacion completa del padron DNIT con `FS_DNIT_MEM=384m` y `FS_PG_MEM=384m`, 1 CPU cada uno: 2.028.067 filas en 142 s. Picos: cargador 46 MiB (12 % del tope), Postgres de FS 194 MiB (51 %) con la CPU al 100 %. Sin `OOMKilled` (CA-04). **La base de FS crecio de 20 MB a 670 MB:** cuenta en el presupuesto de `/var` (9,3 GiB) de la VPS. Medicion en `test-results/medicion/dnit-20261108/`.

### E-3. Prueba de punta a punta desde el panel (2026-11-08)

FS `ed52650`, FE `d0d9fe0` (`rc4.1` mas el `email_status` de la nota y los topes), SIFEN test, con correo a `emilio.saldivar97@gmail.com`. Medicion en `test-results/medicion/cev-20261108/`.

- Carga de 20 confirmada a las 19:13:14 y finalizada a las 19:15:31: 20 aprobadas desde 1010403.
- **CEV-1 (CA-02):** al finalizar, FS tenia 19 correos en `PENDING` y agendo la carga para las 19:20:30. FE envio los 20 hasta las 19:16:24. En la pasada de las 19:21:30, FS paso las 20 a `SENT` y saco la carga de la agenda, sin intervencion.
- **CEV-3 (CA-05):** nota de credito desde el panel sobre la 1010403 a las 19:15:42, NCE 1010004. FE respondio `email_status: PENDING` y FS lo guardo. FE envio el correo y, al abrir el detalle de la nota, FS lo paso a `SENT`.
- **Recursos:** suma de picos 644 MiB, incluido el Postgres de FS con el padron cargado (199 MiB); `worker-correo` 157 MiB de 384. Sin reinicios.

### E-4. Prueba de FE con 2 CPU en el worker de correo (2026-11-08, 20:19 UTC)

Pedida por el usuario a FE, pensando en la VPS nueva de `segel-fs`: 4 vCPU y 8 GB al arrancar, y despues 8 vCPU. FE dejo `CORREO_WORKER_CPUS=2`, concurrencia 2, tope de 25 por minuto, y fijo los 11 contenedores a los nucleos 0 a 3. FS corrio desde el panel una carga de 60 a `emilio.saldivar97@gmail.com`.

- La carga se confirmo a las 20:19:41 y finalizo a las 20:21:43, con 60 aprobadas.
- Los correos salieron de 20:21:17 a 20:23:36: 25, 25 y 10 por minuto, todos `SENT` y ninguno `FAILED`. **Se alcanza el tope de 25 por minuto**; con 1 CPU eran unos 18.
- Pico de `worker-correo` 153 MiB de 384 y 198 % de CPU. Suma de picos de los 11 contenedores: 596 MiB.
- FS paso solo las 60 a `SENT` a las 20:26:34 y saco la carga de la agenda (FS-40).
- Medicion en `test-results/medicion/cpu2-20261108/`. El valor de `CORREO_WORKER_CPUS` para produccion lo decide el usuario con FE.

### E-5. Carga final para cerrar `rc4.1` (2026-11-08, 20:47 UTC)

FE `974eb13` (el tope cuenta cada envio hasta 60 s despues de terminar, `f88c437`), FS `20838aa`, `worker-correo` con 2 CPU y concurrencia 2, 11 contenedores en 4 nucleos. Carga de 60 desde el panel a `emilio.saldivar97@gmail.com`.

- La carga se confirmo a las 20:47:28 y finalizo a las 20:49:29, con 60 aprobadas.
- Los correos salieron de 20:48:34 a 20:51:00: 10, 25, 24 y 1 por minuto. **Maximo en cualquier ventana movil de 60 s: 25.** 60 `SENT` y ninguno `FAILED`.
- Pico de `worker-correo` 140 MiB y 204 % de CPU. Suma de picos 580 MiB.
- FS paso solo las 60 a `SENT` a las 20:55:40.
- Medicion en `test-results/medicion/tope-20261108/`.
