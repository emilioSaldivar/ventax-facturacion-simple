# TASKS DNIT Loader Cron v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_DNIT_LOADER_CRON_v0.1.md`
- `docs/PLAN_DNIT_LOADER_CRON_v0.1.md`

## Estado General

Iniciativa CERRADA (2026-08-24/25). Commit `71c6f41` (emilioSaldivar, 2026-08-24 21:41:56 -0300), pusheado a `origin/master` y desplegado en staging.

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
| --- | --- | --- | --- | --- |
| DLC-001 | SDD | Crear cadena SPEC/PLAN/TASKS del fix de cron | DONE | Existen los tres documentos alineados a la iniciativa DNIT |
| DLC-002 | Implementacion | Agregar flag `DNIT_CRON_ENABLED` en `container-entrypoint.sh` | DONE | Con el flag != `true` no se instala cron ni arranca `crond`; el contenedor queda `Up` |
| DLC-003 | Implementacion | Exponer `DNIT_CRON_ENABLED` en `docker-compose.yml` con default `true` | DONE | Ambientes sin la variable conservan el comportamiento actual |
| DLC-004 | Documentacion | Documentar la variable en `.env.example` y `README.md` del loader | DONE | Queda descrito el default y el modo de carga manual |
| DLC-005 | QA local | Validar los tres casos del flag sobre la imagen construida | DONE | `true`, ausente y `false` se comportan segun SPEC |
| DLC-006 | QA local | Validar que `DNIT_RUN_ON_START=true` funciona con cron apagado | DONE | La carga inicial se dispara aunque no haya cron |
| DLC-007 | Operacion VPS | Capturar estado previo de cron en staging y produccion | DONE | Queda registrada la salida de `crontab -l` de ambos |
| DLC-008 | Operacion VPS | Setear `DNIT_CRON_ENABLED=false` en `.env.staging` y redeployar solo el loader de staging | DONE | Staging sin regla de cron, sin tocar api/frontend/postgres |
| DLC-009 | Operacion VPS | Verificar que produccion conserva cron y datos intactos | DONE | `crontab -l` de prod sin cambios y `count(*)` de la tabla igual al previo |
| DLC-010 | Backlog | Registrar los defectos fuera de alcance detectados en la verificacion | DONE | `docs/BACKLOG.md` lista fuente obsoleta, data dir compartido, lineas invalidas y ventana de lock |

## Orden de ejecucion

1. `DLC-001`
2. `DLC-002` a `DLC-004`
3. `DLC-005` a `DLC-006`
4. `DLC-007` a `DLC-009`
5. `DLC-010`

## Dependencias y puertas de avance

- No tocar la VPS (`DLC-007+`) sin `DLC-005` y `DLC-006` en verde.
- No redeployar staging sin haber capturado el estado previo (`DLC-007`).
- Produccion no se redeploya en esta iniciativa.

## Evidencia

- 2026-08-22: verificacion de origen del defecto documentada en `docs/SPEC_DNIT_LOADER_CRON_v0.1.md`.
- 2026-08-22: `DLC-002`/`DLC-003`/`DLC-004` implementados. `scripts/container-entrypoint.sh` incorpora `DNIT_CRON_ENABLED` (default `true`) con salida temprana a `tail -f /dev/null`; `docker-compose.yml` expone `DNIT_CRON_ENABLED: ${DNIT_CRON_ENABLED:-true}`; documentado en `dnit-ruc-loader/.env.example` y `dnit-ruc-loader/README.md`.
- 2026-08-22: `DLC-005` validado en local sobre imagen construida con `docker build -t dnit-loader-test ./dnit-ruc-loader`. Resultados:
  - sin flag: `crontab` = `0 3 05 * * /app/scripts/run.sh`, PID 1 = `crond -f -l 8`, estado `running`;
  - `DNIT_CRON_ENABLED=true`: identico al anterior;
  - `DNIT_CRON_ENABLED=false`: log `cron deshabilitado (DNIT_CRON_ENABLED=false)`, sin regla propia en `/etc/crontabs/root`, PID 1 = `tail -f /dev/null`, estado `running`.
- 2026-08-22: `DLC-005` observacion: con el cron deshabilitado el archivo `/etc/crontabs/root` conserva el contenido stock de Alpine, pero queda inerte porque `crond` no se ejecuta.
- 2026-08-22: `DLC-006` validado en local con `DNIT_CRON_ENABLED=false` + `DNIT_RUN_ON_START=true` y `DNIT_RUC_URL` apuntando a un host inexistente: stdout muestra `ejecucion inicial habilitada`, la corrida se ejecuta y falla de forma controlada (`ECONNREFUSED 127.0.0.1:9`), y el contenedor permanece `running` con `tail -f /dev/null`.
- 2026-08-22: `DLC-010` registrados en `docs/BACKLOG.md` los defectos fuera de alcance: fuente DNIT sin republicar desde `2026-07-02`, `data/` compartido entre ambientes, 12 lineas invalidas del padron, ventana de lock por `TRUNCATE + INSERT` y `data/logs/import-2026-05.log` trackeado en git y horneado en la imagen por falta de `.dockerignore`.
- 2026-08-22: `DLC-007` a `DLC-009` pendientes: requieren que el cambio llegue al checkout de la VPS (`/home/deploy/apps/ventax-facturacion-simple`, hoy en `9fe452f`). No se toca produccion.
- 2026-08-24: `DLC-007` completado contra la VPS real. Estado previo capturado:
  - Staging (`ventax-facturacion-simple-dnit-ruc-loader-cron-1`): `/etc/crontabs/root` = `0 3 05 * * /app/scripts/run.sh`, PID 1 = `crond`.
  - Produccion (`ventax-facturacion-simple-prod-dnit-ruc-loader-cron-1`): `/etc/crontabs/root` = `0 3 05 * * /app/scripts/run.sh` (identica regla, confirma la concurrencia descrita en el SPEC), PID 1 = `crond`.
  - Baseline de datos de produccion (para comparar despues del cambio, criterio de aceptacion 5): `dnit_ruc_contribuyentes` = 1.995.012 filas.
- 2026-08-24/25: `DLC-008` y `DLC-009` completados (ejecutados directamente por el usuario, verificados en esta sesion contra el VPS real):
  - Commit `71c6f41` pusheado a `origin/master` y llevado al checkout del VPS.
  - Staging redeployado: `ventax-facturacion-simple-api-1` con `APP_VERSION=71c6f41` (creado 2026-08-25T00:44:34Z); healthcheck `GET /api/v1/health` responde `{"status":"ok",...}`.
  - `.env.staging` en el VPS con `DNIT_CRON_ENABLED=false`.
  - Verificado en el contenedor `ventax-facturacion-simple-dnit-ruc-loader-cron-1`: `/etc/crontabs/root` ya NO tiene la regla `0 3 05 * * /app/scripts/run.sh` (solo quedan las tareas periodicas default de Alpine), PID 1 = `tail` (no `crond`) — exactamente el comportamiento esperado por el SPEC (criterio de aceptacion 2).
  - Produccion verificada intacta: `ventax-facturacion-simple-prod-api-1` sigue en `APP_VERSION=9fe452f` (no redeployada, por decision explicita); `ventax-facturacion-simple-prod-dnit-ruc-loader-cron-1` conserva `/etc/crontabs/root` = `0 3 05 * * /app/scripts/run.sh` con `crond` corriendo (identico a la linea base de `DLC-007`); `dnit_ruc_contribuyentes` sigue en 1.995.012 filas (criterio de aceptacion 4 y 5 cumplidos).
