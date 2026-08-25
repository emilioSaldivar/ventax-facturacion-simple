# SPEC DNIT Loader Cron v0.1

## Alineacion

- `AGENTS.md`
- `docs/METODOLOGIA_SDD.md`
- `docs/SPEC_AUTOCOMPLETADO_DNIT_RUC_CI_v0.1.md`
- `docs/PLAN_AUTOCOMPLETADO_DNIT_RUC_CI_v0.1.md`
- `docs/TASKS_AUTOCOMPLETADO_DNIT_RUC_CI_v0.1.md`
- `docs/GUIA_DEPLOY_STAGING_PRODUCCION_v0.1.md`

## Objetivo

Permitir deshabilitar la programacion automatica (cron) del servicio
`dnit-ruc-loader` por ambiente, de forma declarativa y persistente entre
deploys, manteniendo la posibilidad de ejecutar la carga de forma manual.

## Problema

Verificacion del 2026-08-22 sobre la VPS de produccion:

1. Los dos contenedores del loader (`ventax-facturacion-simple-dnit-ruc-loader-cron-1`
   de staging y `ventax-facturacion-simple-prod-dnit-ruc-loader-cron-1` de
   produccion) se levantan desde el mismo directorio de deploy
   (`/home/deploy/apps/ventax-facturacion-simple`), diferenciados unicamente por
   `APP_ENV_FILE`.
2. Por eso ambos montan el mismo bind mount del host
   (`./dnit-ruc-loader/data`) y ambos reciben la misma regla de cron
   (`0 3 05 * *`), quedando programados en el mismo minuto.
3. Las corridas concurrentes se pisan: cada proceso descarga, extrae y borra
   ZIP/TXT en los mismos paths. Los logs muestran
   `ADM-ZIP: Invalid or unsupported zip format. No END header found`
   en `import-2026-06.log` e `import-2026-07.log`, consistente con un contenedor
   borrando o sobreescribiendo un ZIP que el otro esta leyendo.
4. La corrida de `2026-08-05` no fallo por desfase de timing (03:00 vs 03:02),
   no porque el defecto este resuelto.
5. `scripts/container-entrypoint.sh` no expone ninguna forma de no instalar el
   cron. Parar el contenedor a mano no es durable: el proximo
   `bash scripts/deploy.sh` lo vuelve a levantar y reinstala la regla.

Nota de alcance: la verificacion tambien confirmo que el loader importa
correctamente (1.995.012 filas, conteo por archivo identico al parseo local del
origen). El padron desactualizado observado en la pantalla principal se debe a
que DNIT no republica los ZIP desde `2026-07-02`, lo cual es una causa distinta
y queda fuera de este SPEC.

## Alcance Funcional

### 1) Flag de habilitacion de cron

- Se introduce la variable de entorno `DNIT_CRON_ENABLED`.
- Valor por defecto `true`: preserva exactamente el comportamiento actual.
- Con valor distinto de `true`, el contenedor:
  - no escribe `/etc/crontabs/root`;
  - no arranca `crond`;
  - permanece vivo y ocioso, para que siga disponible para ejecuciones manuales
    y para que `docker compose ps` no lo reporte como caido;
  - registra en log una linea explicita indicando que el cron esta deshabilitado.

### 2) Ambientes

- Produccion mantiene `DNIT_CRON_ENABLED=true` (carga mensual automatica).
- Staging pasa a `DNIT_CRON_ENABLED=false` (carga manual bajo demanda).
- Con un solo cron activo desaparece la concurrencia entre ambientes.

### 3) Ejecucion manual

- La carga manual sigue siendo `APP_ENV_FILE=<env> bash scripts/deploy-loader.sh --load-now`.
- El operador es responsable de no lanzar una carga manual de staging el dia 05
  a las 03:00, unico momento en que podria volver a coincidir con produccion.

## Fuera De Alcance

- Separar el bind mount `data/` por ambiente.
- Deteccion de fuente DNIT sin cambios (`Last-Modified`) y tabla de auditoria de
  corridas.
- Recuperacion de las 12 lineas invalidas del padron.
- Mensaje de UI con la fecha de vigencia del padron.

Estos puntos quedan registrados en `docs/BACKLOG.md`.

## Criterios De Aceptacion

1. Sin `DNIT_CRON_ENABLED` definido, el contenedor instala el cron y arranca
   `crond` igual que hoy.
2. Con `DNIT_CRON_ENABLED=false`, el contenedor arranca, no instala cron, no
   ejecuta `crond` y queda en estado `Up`.
3. Con `DNIT_CRON_ENABLED=false` y `DNIT_RUN_ON_START=true`, la carga inicial
   igual se ejecuta (el flag gobierna solo la programacion, no la ejecucion).
4. En la VPS, staging queda sin regla de cron y produccion la conserva intacta.
5. La tabla `dnit_ruc_contribuyentes` de produccion no se modifica durante el
   cambio.
