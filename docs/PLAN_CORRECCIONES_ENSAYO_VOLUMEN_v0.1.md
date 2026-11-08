# PLAN Correcciones Tras El Ensayo De Volumen v0.1

## Alineacion

- `docs/SPEC_CORRECCIONES_ENSAYO_VOLUMEN_v0.1.md`
- `docs/TASKS_CORRECCIONES_ENSAYO_VOLUMEN_v0.1.md`

## 1. CEV-1, sincronizacion de correo tras el cierre

- `apps/api/src/modules/cargas/cargas.mapeo.ts`: nueva funcion pura `agendaPorCorreo({ estado, finalizadaEn, canceladaEn, pendientes, ahora })`. Devuelve `5 * MINUTO` si el estado es `FINALIZADA` o `CANCELADA`, `pendientes > 0` y no pasaron 2 horas desde la fecha de cierre; si no, `null`. Sin fecha de cierre usa `ahora` como referencia (no corta).
- `apps/api/src/modules/cargas/cargas.repository.ts`: `contarCorreosPendientes(cargaId)`: `select count(*) from facturas_operativas where carga_masiva_id = $1 and email_estado = 'PENDING' and deleted_at is null`. Agregar a la interfaz `CargaRepository` (`cargas.types.ts`) y a los fakes de las pruebas.
- `apps/api/src/modules/cargas/cargas-sync.worker.ts`, al final de `sincronizarCarga`: si `proximaSincronizacionMs` devuelve `null`, calcular `agendaPorCorreo` con el conteo (despues de `incorporarFacturas`, asi cuenta lo recien actualizado). Si el tope de 2 horas corta con pendientes, `logger.warn({ carga_id, pendientes }, "carga masiva: correos pendientes tras 2 h del cierre")`.
- `FeCarga` ya trae `finalizada_en` y `cancelada_en` (`cargas.types.ts`); confirmar el nombre de `cancelada_en` al implementar.
- Pruebas en `tests/cargas-sync.worker.test.ts`: pendientes y finalizada hace 10 min, agenda a 5 min; sin pendientes, `null`; pendientes y finalizada hace 3 h, `null` con advertencia; `EN_SIFEN`, sin cambio.

## 2. CEV-2, topes en Docker

- `docker-compose.yml` (raiz, el que `deploy.sh` empaqueta para `segel-fs`): en `postgres`, `api`, `migrate`, `frontend` y `dnit-ruc-loader-cron`:

  ```yaml
  mem_limit: ${FS_API_MEM:-0}
  memswap_limit: ${FS_API_MEM:-0}
  cpus: ${FS_API_CPUS:-0}
  pids_limit: ${FS_API_PIDS:--1}
  ```

  con prefijos `FS_PG_`, `FS_API_`, `FS_MIGRATE_`, `FS_FRONTEND_`, `FS_DNIT_`. `0` y `-1` no limitan (RN-05). Validar con `docker compose config` que Compose acepta esos valores; si alguno no se acepta, usar el valor alto que FE eligio (`4g`) y registrarlo.
- `infra/segel-fs/fs.env.example`: bloque "Topes de recursos (SPEC_CORRECCIONES_ENSAYO_VOLUMEN CEV-2)" con los valores de RN-06. Comprobar que `up.sh` invoca el compose de FS con `--env-file .env.segel` (si no, las variables del compose no se leen).
- `infra/segel-fs/fe.env.example`: los topes de FE que FE confirme (RN-09).
- Ensayo local: `up.sh` con esas variables; `docker inspect -f '{{.Name}} {{.HostConfig.Memory}} {{.HostConfig.NanoCpus}} {{.HostConfig.PidsLimit}}'` de cada contenedor; importacion DNIT con `docker exec -d segel-fs-dnit-ruc-loader-cron-1 sh /app/scripts/run.sh` midiendo con `medir-carga.sh` (RN-07).
- `docs/OPERACION_DESPLIEGUE_SEGEL_FS_v0.1.md`: fase 2, verificacion de topes y que hacer ante `OOMKilled` (`docker inspect -f '{{.State.OOMKilled}}'`, subir el tope del servicio en `.env.segel` y correr `up.sh`).

## 3. CEV-3, correo de la nota de credito

- Con la respuesta de FE: si `POST /v1/nota-credito` devuelve `email_status: PENDING`, revisar que `createNotaCreditoFromFactura` y `updateNotaCreditoTrasReintento` lo guarden (`email_estado`) y que la consulta de estado del correo (`entrega.service.ts`, `getEmailStatus`) lo actualice. Si FE no lo devuelve, guardar nulo en vez de `UNKNOWN` cuando el comprador tiene correo, y dejar que la consulta del detalle lo complete.
- Prueba unitaria del mapeo y verificacion en el ensayo con una nota real (CA-05).

## 4. CEV-4, `rc4.1`

- `scripts/segel-fs/build-images.sh` y `deploy.sh`: `FE_REF` por defecto `segel-rc4.1`.
- `infra/segel-fs/fe.env.example`: `NCE_EMAIL_ENABLED=true`, `EMAIL_QUEUE_POR_MINUTO=25`, `EMAIL_QUEUE_CONCURRENCY=2` (reemplaza el `1` actual).
- Runbook: version de FE, migracion `046`, variables nuevas.

## 5. CEV-5, runbook

- Fase 8 y seccion de prueba real: revisar el correo del emisor en FE (copia oculta) y la anulacion con `0100` (reintentar).

## 6. Orden y validacion

1. CEV-1 con pruebas; 2. CEV-2 en compose y plantillas; 3. CEV-4; 4. CEV-3 cuando FE responda; 5. `bash scripts/deploy.sh` (fs-cm, mock) y suites; 6. reconstruir FS del ensayo y `up.sh` con topes; 7. carga de 20 con correo a `emilio.saldivar97@gmail.com` y nota de credito desde el panel (CA-02, CA-05); 8. importacion DNIT (CA-04); 9. runbook y cierre.

## 7. Riesgos

| Riesgo | Mitigacion |
|---|---|
| Un tope demasiado bajo reinicia un servicio en produccion | Topes a 2 a 8 veces el pico medido; DNIT medido con importacion completa; runbook con que hacer ante `OOMKilled` |
| `memswap_limit` igual al tope hace que un pico corte en vez de usar swap | Es lo buscado: un servicio no arrastra al host. El tope tiene margen |
| Compose no acepta `0`/`-1` como "sin limite" | Validar con `docker compose config` (PLAN, seccion 2) |
| Mas consultas a FE por cargas finalizadas con correos pendientes | Una consulta delta cada 5 min por carga, hasta 2 h; con `CARGAS_POR_CICLO=5` |
