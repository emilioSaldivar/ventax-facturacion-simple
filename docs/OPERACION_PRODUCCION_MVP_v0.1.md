# Operacion Produccion MVP v0.1

## Objetivo

Guia minima para operar el MVP en VPS con Docker Compose, backups, restore verificable, rotacion de logs y smoke fiscal opt-in sin versionar secretos.

## Backups PostgreSQL

Backup manual:

```bash
npm run ops:backup
```

El backup se guarda en `backups/postgres/` y no se versiona.

Variables:

```bash
export BACKUP_KEEP_RECENT_DAYS=7
export BACKUP_KEEP_EXTENDED_DAYS=30
```

Retencion:

- conserva todos los backups recientes dentro de `BACKUP_KEEP_RECENT_DAYS`;
- para backups mas antiguos conserva el ultimo backup por dia;
- elimina dumps mayores a `BACKUP_KEEP_EXTENDED_DAYS`.

## Backup Diario

Instalar cron del host:

```bash
npm run ops:backup:install-cron
```

Por defecto ejecuta `scripts/backup.sh` todos los dias a las `02:15`.

Para revisar la entrada sin instalarla:

```bash
DRY_RUN=YES npm run ops:backup:install-cron
```

Variables:

```bash
export BACKUP_CRON_HOUR=2
export BACKUP_CRON_MINUTE=15
export BACKUP_CRON_LOG=/ruta/backup-cron.log
```

## Restore Verificable

Verificar el backup mas reciente en una base temporal no destructiva:

```bash
npm run ops:restore:verify
```

Verificar un archivo especifico:

```bash
npm run ops:restore:verify -- backups/postgres/facturacion_simple-YYYYMMDD-HHMMSS.dump
```

La prueba crea una base temporal `facturacion_simple_restore_verify`, restaura el dump, valida la tabla `schema_migrations` y elimina la base temporal al salir.

Restore real destructivo:

```bash
RESTORE_CONFIRM=YES bash scripts/restore-backup.sh backups/postgres/facturacion_simple-YYYYMMDD-HHMMSS.dump
```

## Logs Docker

`docker-compose.yml` configura el driver `json-file` con limites:

```bash
export DOCKER_LOG_MAX_SIZE=10m
export DOCKER_LOG_MAX_FILE=5
```

Aplica a `postgres`, `api`, `migrate` y `frontend`. Cambiar estos valores requiere recrear contenedores.

## Smoke Fiscal FE Test

El smoke fiscal real es opt-in y nunca debe versionar `FE_API_KEY` ni fixtures con datos sensibles.

Dry-run:

```bash
npm run ops:fiscal-smoke -- --dry-run
```

El script carga `.env` automaticamente si existe. Las variables del proceso tienen prioridad sobre `.env`.

Health contra FE test:

```bash
FE_SMOKE_RUN=YES \
FE_API_BASE_URL=https://fe-api.ventax.app/fcws \
FE_API_KEY=<secret> \
npm run ops:fiscal-smoke
```

Health + emision de factura usando fixture local:

```bash
FE_SMOKE_RUN=YES \
FE_API_BASE_URL=https://fe-api.ventax.app/fcws \
FE_API_KEY=<secret> \
FE_SMOKE_FACTURA_FIXTURE=/ruta/local/factura-fe-test.json \
npm run ops:fiscal-smoke
```

El fixture debe usar el contrato fiscal esperado por `facturacion-electronica` para `POST /factura`.

Fixture local recomendado para AWAPURA test:

```bash
FE_SMOKE_FACTURA_FIXTURE=.local/fe-smoke/factura-awapura-contado.json
```

`.local/` esta ignorado por Git. El fixture no debe contener `FE_API_KEY`.

Placeholders soportados dentro del fixture:

- `{{SMOKE_ID}}`: idempotency key generado por ejecucion, o valor fijo desde `FE_SMOKE_ID`.
- `{{ISO_DATE}}`: fecha/hora ISO de la ejecucion.

Para repetir exactamente la misma solicitud sin consumir una nueva idempotencia:

```bash
FE_SMOKE_ID=fe-smoke-YYYYMMDDHHMMSS npm run ops:fiscal-smoke
```

## Smoke Operativo De Alta De Facturador

Este smoke es para probar un facturador ya dado de alta y configurado manualmente en el SaaS. No crea facturadores ni modifica perfiles fiscales; asume que el operador configurado en `.env` ya tiene readiness operativo/fiscal.

Flujo validado:

1. Login del operador.
2. `GET /me/context`.
3. `GET /me/readiness`.
4. Alta de cliente.
5. Alta de producto/servicio.
6. Preview de factura.
7. Emision real contra `facturacion-electronica`.
8. Polling de estado hasta `EMITIDA`.
9. Generacion de link publico.

Variables minimas:

```bash
SMOKE_API_BASE_URL=http://127.0.0.1:8092/api/v1
SMOKE_USERNAME=<operador-configurado>
SMOKE_PASSWORD=<password-operador>

FE_GATEWAY_MODE=real
FE_SEND_EMISSION_PROFILE_CODE=false
FE_SERVICE_NUMBERING=true

ONBOARDING_SMOKE_CLIENTE_TIPO=CI
ONBOARDING_SMOKE_CLIENTE_DOCUMENTO=492019
ONBOARDING_SMOKE_CLIENTE_RAZON_SOCIAL=Roberto Saldivar
ONBOARDING_SMOKE_ITEM_DESCRIPCION=Servicio de prueba onboarding
ONBOARDING_SMOKE_ITEM_PRECIO_UNITARIO=100000
ONBOARDING_SMOKE_ITEM_IVA_TIPO=IVA_10
ONBOARDING_SMOKE_CONDICION_VENTA=CONTADO
```

Ejecutar:

```bash
npm run ops:onboarding-smoke
```

Notas:

- Antes de correrlo para otro facturador, ajustar manualmente la configuracion operativa del usuario smoke en backoffice.
- Si FE no tiene perfiles de emision configurados, mantener `FE_SEND_EMISSION_PROFILE_CODE=false`.
- Para numeracion automatica del backend fiscal, mantener `FE_SERVICE_NUMBERING=true`.
- El RUC generico `80000000-1` puede ser rechazado por SIFEN test si no existe en Marangatu; para smoke aprobado se recomienda usar un CI/RUC test validado.
