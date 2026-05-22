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

## Puertos Y Nginx Del Host

En produccion el stack Docker publica sus puertos solo en `127.0.0.1`. Para dos instancias en el mismo VPS usar puertos y proyecto Compose separados:

```bash
# staging / instancia actual
COMPOSE_PROJECT_NAME=ventax-facturacion-simple
FRONTEND_HTTP_PORT=8092
API_HTTP_PORT=8091
POSTGRES_HOST_PORT=5433

# produccion nueva
COMPOSE_PROJECT_NAME=ventax-facturacion-simple-prod
FRONTEND_HTTP_PORT=8192
API_HTTP_PORT=8191
POSTGRES_HOST_PORT=5434
```

El dominio publico debe apuntar por DNS a la IP del VPS y Nginx del host debe reenviar HTTPS al frontend:

```nginx
# staging-factura.ventax.app
proxy_pass http://127.0.0.1:8092;

# factura.ventax.app
proxy_pass http://127.0.0.1:8192;
```

Plantilla disponible:

```text
infra/nginx-or-caddy/host-factura-multi-env.conf
```

La plantilla usa el certificado Cloudflare existente del VPS:

```text
/etc/ssl/cloudflare/ventax.app.pem
/etc/ssl/cloudflare/ventax.app.key
```

Si el dominio operativo no es `factura.ventax.app`, reemplazar `server_name` y las variables publicas del `.env` por el subdominio real.

## Backend Fiscal Local

Cuando `facturacion-electronica` corre en el mismo VPS y publica sus puertos solo en `127.0.0.1`, configurar el SaaS para consumirlo por red Docker externa en vez del dominio publico o `host.docker.internal`:

```bash
# staging -> FE test
FE_DOCKER_NETWORK=fe-test_default
FE_API_BASE_URL=http://fe-test-api-1:8080/fcws
FE_API_ENV=test

# produccion -> FE prod
FE_DOCKER_NETWORK=fe-prod_default
FE_API_BASE_URL=http://fe-prod-api-1:8080/fcws
FE_API_ENV=prod
```

`docker-compose.yml` conecta el servicio `api` a la red externa indicada por `FE_DOCKER_NETWORK`. Esto evita que las llamadas internas pasen por Cloudflare o dependan de puertos loopback del host.

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
10. Validacion obligatoria de KUDE/PDF y XML publicos.
11. Opcionalmente, emision de NCE total sobre la factura aprobada.

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
ONBOARDING_SMOKE_NCE=YES # solo cuando se quiera validar NCE total
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
- El catalogo local de receptores validados esta en `docs/RECEPTORES_SIFEN_TEST_v0.1.md`.
- El checklist manual de alta de facturador esta en `docs/CHECKLIST_ALTA_FACTURADOR_MVP_v0.1.md`.
- La guia completa para alta productiva desde servidor, combinando SQL y endpoints de backoffice, esta en `docs/GUIA_PRODUCCION_ALTA_CLIENTE_FINAL_v0.1.md`.
- La guia para operar dos instancias en el mismo VPS, staging y produccion, esta en `docs/GUIA_DEPLOY_STAGING_PRODUCCION_v0.1.md`.
