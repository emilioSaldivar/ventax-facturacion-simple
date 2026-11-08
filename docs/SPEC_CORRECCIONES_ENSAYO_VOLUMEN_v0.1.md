# SPEC Correcciones Tras El Ensayo De Volumen v0.1

**Fecha:** 2026-11-08 · **Rama:** `feat/identidad-segel` · **Estado:** en implementacion, sin despliegue (decision del usuario, 2026-11-08).

## Alineacion

- `AGENTS.md`, `docs/METODOLOGIA_SDD.md`.
- `docs/SPEC_DESPLIEGUE_SEGEL_FS_v0.2.md` (D-14, D-20 a D-25; RN-08) y su `TASKS`, evidencias E-2 y E-2b: de ahi salen los hallazgos.
- `docs/SPEC_CARGA_MASIVA_FACTURAS_v0.1.md` (sincronizacion de cargas, RN-17 a RN-19) y `docs/PLAN_CARGA_MASIVA_FACTURAS_v0.1.md`, seccion 6.
- `docs/SPEC_NOTA_CREDITO_TRABADA_v0.1.md`.
- `docs/BACKLOG.md`: FS-40, FS-41.
- FE: `docker-compose.prod.yml` de `segel-rc4`/`segel-rc4.1` (RN-19 de su `SPEC_DESPACHO_INMEDIATO_v0.1`: topes de memoria por variable).

## Objetivo

Corregir lo que el ensayo de volumen mostro del lado de FS y dejar a FS y FE con topes de recursos que protejan a la VPS `segel-fs` y a los servicios del administrador, antes de desplegar. El usuario pidio (2026-11-08) "aplicar los cambios y pendientes que estan a nuestras manos" y "la configuracion de los margenes y limites en Docker para que no suceda nada malo con nuestros microservicios y el resto del servidor"; el despliegue sigue en espera.

## Alcance

| ID | Tema | Origen |
|---|---|---|
| CEV-1 | Correo de las facturas de carga despues de que la carga finaliza (FS-40) | E-2 y E-2b |
| CEV-2 | Topes de memoria, CPU y procesos de los contenedores de FS, y pedido a FE de lo que falta en los suyos | Pedido del usuario; RN-08 de despliegue v0.2 |
| CEV-3 | Estado del correo de la nota de credito en FS (resto de FS-41) | E-2b |
| CEV-4 | Preparar FS para desplegar con FE `segel-rc4.1` (SF2-013g) | D-25 de despliegue v0.2 |
| CEV-5 | Verificaciones de produccion que salieron del ensayo: correo del emisor en copia oculta, anulacion con `0100` | E-2b |

## CEV-1. Correo de facturas de carga tras el cierre (FS-40)

**Hallazgo.** `proximaSincronizacionMs` (`cargas.mapeo.ts`) devuelve `null` para `FINALIZADA` y `CANCELADA`: el worker deja la carga sin agenda. Con `EMAIL_TRAS_APROBACION` y el ritmo de correo de FE (15 a 20 por minuto), casi todos los correos salen despues del cierre, y FS nunca se entera: 295 de 307 (E-2) y 51 de 60 (E-2b) quedaron con el correo "pendiente". Forzando una pasada, las 307 pasaron a `SENT`: FE si mueve `actualizado_en` cuando cambia el correo, asi que alcanza con seguir sincronizando.

- **RN-01.** Una carga `FINALIZADA` o `CANCELADA` sigue agendada mientras alguna de sus facturas en FS tenga `email_estado = 'PENDING'`, cada 5 minutos.
- **RN-02.** Tope: 2 horas desde `finalizada_en` (o `cancelada_en`) de FE. FE reintenta un correo hasta 1 hora (`EMAIL_QUEUE_MAX_ATTEMPTS=6` con toma de 10 min); el margen cubre la cola. Pasado el tope, la carga sale de la agenda aunque queden pendientes, y se registra un `logger.warn` con la cantidad.
- **RN-03.** Sin migracion ni cambio de contrato: usa el cursor `sincronizada_hasta` y la consulta delta que ya existen.
- **RN-04.** Una carga sin facturas pendientes de correo sale de la agenda como hoy.

## CEV-2. Topes de recursos en Docker

**Contexto.** La VPS tiene 4 vCPU, 3,6 GiB de RAM, `/var` de 9,3 GiB (datos de Docker) y `/home` de 3,7 GiB, y corren `cadvisor`, `portainer_agent` y `node_exporter` del administrador, que no se tocan. El usuario decidio no tocar disco ni configuracion del sistema (memoria `vps_segel_fs`): todo se resuelve en los compose. Picos medidos en el ensayo con 307 facturas y 62 correos: suma de los once contenedores 454 a 519 MiB.

- **RN-05.** Cada servicio de FS declara `mem_limit`, `memswap_limit` (igual al `mem_limit`: sin swap extra), `cpus` y `pids_limit` por variable. El valor por defecto no limita, para no cambiar otras instalaciones de la rama (`fs-cm`, ensayos).
- **RN-06.** Presupuesto en `segel-fs`: la suma de los topes de FE y FS no pasa de unos 3,1 GiB, y deja unos 500 a 600 MiB para el sistema y los servicios del administrador. Topes de FS (2 a 8 veces el pico medido):

| Servicio FS | Pico medido | `mem_limit` | `cpus` | `pids_limit` |
|---|---|---|---|---|
| `api` | 49 MiB | 256m | 1.0 | 256 |
| `frontend` (nginx) | 14 MiB | 64m | 0.5 | 128 |
| `postgres` | 34 MiB | 384m | 1.0 | 512 |
| `dnit-ruc-loader-cron` | sin medir con importacion completa | 384m | 1.0 | 128 |
| `migrate` (corre y termina) | — | 256m | 1.0 | 128 |

- **RN-07.** El tope del cargador DNIT se valida con una importacion completa del padron en el stack del ensayo (dos millones de filas): si supera el 80 % del tope, se sube y se registra. Un reinicio del contenedor por memoria durante la importacion es un fallo de esta tarea.
- **RN-08.** Rotacion de logs: FS ya rota (`json-file`, 10 MB por 5 archivos por contenedor). FE no rota ninguno de sus contenedores: es el riesgo de disco mas grande en `/var`. Se pide a FE que lo agregue en su compose; FS no modifica el compose de FE.
- **RN-09.** Topes de FE: los fija FE en su compose y en su runbook; FS los escribe en `fe.env.example` con los valores que FE confirme. Propuesta enviada por FS (2026-11-08): API 512m y 1.5 CPU, cargas 384m, correo 384m, batch 192m y 1 CPU, status-sync 128m, frontend 64m, Postgres de FE 512m y 1.5 CPU (hoy sin tope). Si FE no agrega topes a su Postgres, se registra como riesgo aceptado.
- **RN-10.** Verificacion: `docker inspect` muestra los topes en cada contenedor; el ensayo de una carga y el DNIT no producen reinicios ni `OOMKilled`; el runbook explica como leer los topes y que hacer ante un `OOMKilled`.

## CEV-3. Correo de la nota de credito en FS

**Hallazgo.** Con `rc4.1` la nota de credito sale por correo (E-2b), pero FS la muestra con correo `UNKNOWN` para siempre: al crearla guarda lo que responde FE y `updateEmailEstadoPendiente` solo actualiza los `PENDING`.

- **RN-11.** El estado del correo de una nota de credito se trata igual que el de una factura: si FE responde `PENDING`, FS guarda `PENDING` y lo actualiza al consultar. El valor que FE devuelve en `POST /v1/nota-credito` con `rc4.1` lo confirma FE antes de implementar (pregunta enviada el 2026-11-08). Si FE no devuelve `email_status`, FS guarda nulo en lugar de `UNKNOWN` y lo completa con la consulta de estado que ya existe para facturas.

## CEV-4. FS con FE `segel-rc4.1`

- **RN-12.** `FE_REF` por defecto `segel-rc4.1` en `build-images.sh` y `deploy.sh`; en `fe.env.example`, `NCE_EMAIL_ENABLED=true`, `EMAIL_QUEUE_POR_MINUTO=25` y `EMAIL_QUEUE_CONCURRENCY=2`; runbook al dia con la migracion `046`. Interpretacion de FS del pedido del usuario ("aplicar los cambios y pendientes"): el despliegue va con `rc4.1`. **A confirmar por el usuario**; volver a `rc4` es cambiar `FE_REF` y quitar las tres variables.
- **RN-13.** El tag `segel-rc4.1` sigue local en FE (`3681a84`); el push lo pide el usuario en la sesion de FE. Sin el tag publicado no se construye para la VPS (RN-01 de despliegue v0.2).

## CEV-5. Verificaciones de produccion

- **RN-14.** Antes de la prueba real, revisar en el backoffice de FE el correo del emisor de produccion: FE lo usa como copia oculta de cada correo (en el ensayo era `facturacion@ventax.app`).
- **RN-15.** Una anulacion puede volver con `0100` "Error Inesperado" de SIFEN (FS-23, visto en el ensayo): el operador usa "Reintentar anulacion". Se documenta en el runbook.

## Fuera De Alcance

- Despliegue en `segel-fs` (D-14).
- Subir la CPU del worker de correo de FE para acercarse a 25 por minuto: decision del usuario (FE, E-2b).
- Cambios en el repositorio de FE.
- Confirmaciones pendientes del usuario: correo del tercer comprador (D-17, D-23) y nombres de los RUC.

## Criterios De Aceptacion

- **CA-01.** Pruebas del worker: una carga `FINALIZADA` con facturas en correo `PENDING` queda agendada a 5 minutos; sin pendientes, o pasadas 2 horas, sale de la agenda.
- **CA-02.** En el ensayo local con FE `rc4.1`, una carga de al menos 20 facturas con correo queda con todos sus correos `SENT` en FS sin intervencion, dentro de los 10 minutos posteriores al ultimo envio de FE.
- **CA-03.** `docker compose config` del compose de FS con las variables de `segel-fs` muestra los topes; con las variables ausentes no hay topes. `docker inspect` en el ensayo muestra los topes aplicados.
- **CA-04.** Importacion completa del padron DNIT en el ensayo con su tope: sin `OOMKilled`, pico registrado.
- **CA-05.** Nota de credito con `rc4.1`: FS muestra su correo `SENT` despues del envio de FE.
- **CA-06.** `npm run test`, `typecheck` y `lint` de `api`; `typecheck` y `build` de `web-operacion`; `check-no-secrets`; Playwright de carga masiva y de nota de credito trabada sin regresiones.
- **CA-07.** Runbook y plantillas al dia con CEV-2, CEV-4 y CEV-5.
