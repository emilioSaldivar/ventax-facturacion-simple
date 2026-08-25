# PLAN DNIT Loader Cron v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_DNIT_LOADER_CRON_v0.1.md`
- `docs/TASKS_AUTOCOMPLETADO_DNIT_RUC_CI_v0.1.md`

## Decision De Diseno

Se elige un flag de entorno (`DNIT_CRON_ENABLED`) resuelto en
`scripts/container-entrypoint.sh`, por sobre las alternativas evaluadas:

| Opcion | Descartada porque |
| --- | --- |
| `docker stop` manual del contenedor staging | No sobrevive a `bash scripts/deploy.sh`; depende de memoria del operador |
| `profiles:` de compose | Cambia la semantica de `deploy-loader.sh` y de `deploy.sh` para todos los ambientes |
| Cron day fuera de rango | El entrypoint ya valida `1..31`; seria un hack ilegible |
| Eliminar el servicio de staging del compose | Staging pierde la capacidad de probar el loader |

El contenedor deshabilitado se mantiene vivo con `tail -f /dev/null` en lugar de
salir, por dos razones:

1. `docker compose ps` lo muestra `Up`, evitando falsos positivos de "servicio
   caido" en revisiones operativas.
2. `deploy-loader.sh --load-now` usa `docker compose run --rm`, que levanta un
   contenedor efimero aparte; mantener el servicio vivo conserva la paridad de
   diagnostico (`docker exec` para inspeccionar `/app/data`).

## Diseno Detallado

### 1) `dnit-ruc-loader/scripts/container-entrypoint.sh`

El flag se evalua **despues** de `mkdir -p` de los directorios de datos y
**despues** del bloque `DNIT_RUN_ON_START`, de modo que:

- los directorios de datos existen igual (diagnostico y carga manual);
- `DNIT_RUN_ON_START=true` sigue funcionando aunque el cron este apagado;
- la validacion de `DNIT_CRON_DAY` solo aplica cuando el cron se va a instalar,
  evitando que un ambiente con cron apagado falle por un valor invalido heredado.

Reordenamiento resultante del script:

1. `mkdir -p` de `/app/data/{downloads,extracted,logs}`.
2. Si `DNIT_CRON_ENABLED` != `true`:
   - log `dnit-ruc-loader: cron deshabilitado (DNIT_CRON_ENABLED=<valor>)`;
   - correr `DNIT_RUN_ON_START` si corresponde;
   - `exec tail -f /dev/null`.
3. Camino normal: validar `DNIT_CRON_DAY`, escribir `/etc/crontabs/root`, log de
   la regla, `DNIT_RUN_ON_START` si corresponde, `exec crond -f -l 8`.

La comparacion es estricta contra `true` (`!= "true"` deshabilita), de modo que
cualquier valor ambiguo apague el cron en vez de dejarlo prendido por error.
El default de la variable es `true`, asi que la ausencia del flag no cambia nada.

### 2) `docker-compose.yml`

Agregar al bloque `environment` del servicio `dnit-ruc-loader-cron`:

```
DNIT_CRON_ENABLED: ${DNIT_CRON_ENABLED:-true}
```

El default `:-true` garantiza que ningun ambiente existente cambie de
comportamiento por omision.

### 3) `dnit-ruc-loader/.env.example` y `dnit-ruc-loader/README.md`

Documentar la variable, su default y el modo de carga manual.

### 4) Env files de la VPS

- `.env.staging`: agregar `DNIT_CRON_ENABLED=false`.
- `.env.production`: no se toca (queda en el default `true`).

Los env files viven solo en el servidor y no se versionan; el cambio se aplica
por edicion directa, sin volcar secretos al repo.

## Riesgos Y Mitigacion

| Riesgo | Mitigacion |
| --- | --- |
| Redeploy de staging toca produccion | `deploy-loader.sh` recibe `APP_ENV_FILE` explicito y solo levanta `dnit-ruc-loader-cron`; no toca api/frontend/postgres |
| Perder la carga mensual de produccion por error de flag | Produccion no se redeploya en esta iniciativa; se verifica `crontab -l` de prod antes y despues |
| El contenedor ocioso consume recursos | `tail -f /dev/null` es despreciable en CPU/RAM |
| Staging queda con padron congelado | Es aceptable y esperado: staging carga bajo demanda |

## Plan De Validacion

1. Local: build de la imagen y corrida del contenedor con el flag en `false`,
   en `true` y sin definir, verificando `crontab -l` y presencia de `crond`.
2. Local: verificar que `DNIT_RUN_ON_START=true` con cron apagado igual dispara
   la carga.
3. VPS: capturar estado previo de cron de staging y produccion.
4. VPS: redeploy unicamente del loader de staging.
5. VPS: confirmar staging sin cron, produccion con cron intacto y tabla de
   produccion sin cambios.

No se ejecuta carga real de datos contra produccion en esta iniciativa.
