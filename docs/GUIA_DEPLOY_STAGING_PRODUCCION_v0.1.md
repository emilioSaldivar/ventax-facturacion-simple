# Guia Deploy Staging Produccion v0.1

## Objetivo

Levantar dos instancias independientes del SaaS en el mismo VPS:

- staging: `staging-factura.ventax.app`, usando la instancia actual y su base existente;
- produccion: `factura.ventax.app`, instancia nueva sin facturadores iniciales.

La instancia productiva debe usar un proyecto Compose y volumen Postgres distinto. No se debe restaurar ni copiar la base actual hacia produccion.

## Estado Diagnosticado En VPS

Diagnostico solo lectura del 2026-05-22 en `cobrapy-mvp-01`:

- instancia actual: proyecto Compose `ventax-facturacion-simple`;
- contenedores actuales:
  - `ventax-facturacion-simple-frontend-1` en `127.0.0.1:8092`;
  - `ventax-facturacion-simple-api-1` en `127.0.0.1:8091`;
  - `ventax-facturacion-simple-postgres-1` en `127.0.0.1:5433`;
- volumen actual: `ventax-facturacion-simple_facturacion_simple_pg`;
- FE test local: `127.0.0.1:9988`;
- FE prod local: `127.0.0.1:9989`;
- puertos libres recomendados para produccion nueva: `8192`, `8191`, `5434`.

## Archivos Preparados

- `.env.staging.example`: plantilla para staging.
- `.env.production.example`: plantilla para produccion.
- `docker-compose.yml`: soporta `APP_ENV_FILE`, puertos por ambiente, volumen separado por `COMPOSE_PROJECT_NAME` y credenciales Postgres por variables.
- `scripts/deploy.sh`: soporta `APP_ENV_FILE` y exporta la variable para que el `env_file` interno de Compose lea el archivo correcto.
- `scripts/backup.sh`, `scripts/restore-backup.sh`, `scripts/verify-restore.sh`: soportan `APP_ENV_FILE`.
- `infra/nginx-or-caddy/host-factura-multi-env.conf`: plantilla Nginx para ambos dominios.

## Variables Criticas

Staging debe apuntar a FE test:

```bash
COMPOSE_PROJECT_NAME=ventax-facturacion-simple
FRONTEND_HTTP_PORT=8092
API_HTTP_PORT=8091
POSTGRES_HOST_PORT=5433
POSTGRES_DB=facturacion_simple
POSTGRES_USER=facturacion_simple
POSTGRES_PASSWORD=facturacion_simple
DATABASE_URL=postgres://facturacion_simple:facturacion_simple@postgres:5432/facturacion_simple
APP_ORIGIN=https://staging-factura.ventax.app
BACKOFFICE_ORIGIN=https://staging-factura.ventax.app
PUBLIC_APP_BASE_URL=https://staging-factura.ventax.app
FE_GATEWAY_MODE=real
FE_API_BASE_URL=http://host.docker.internal:9988/fcws
FE_API_ENV=test
```

Produccion debe apuntar a FE prod:

```bash
COMPOSE_PROJECT_NAME=ventax-facturacion-simple-prod
FRONTEND_HTTP_PORT=8192
API_HTTP_PORT=8191
POSTGRES_HOST_PORT=5434
POSTGRES_DB=facturacion_simple
POSTGRES_USER=facturacion_simple
POSTGRES_PASSWORD=<password-postgres-production>
DATABASE_URL=postgres://facturacion_simple:<password-postgres-production>@postgres:5432/facturacion_simple
APP_ORIGIN=https://factura.ventax.app
BACKOFFICE_ORIGIN=https://factura.ventax.app
PUBLIC_APP_BASE_URL=https://factura.ventax.app
FE_GATEWAY_MODE=real
FE_API_BASE_URL=http://host.docker.internal:9989/fcws
FE_API_ENV=prod
```

No usar `https://fe-api.ventax.app/fcws` para produccion mientras ese Nginx del host siga apuntando a `9988`. Para evitar ambiguedad, usar `host.docker.internal:9989` desde el contenedor SaaS productivo.

## DNS Recomendado

En Cloudflare:

- `factura.ventax.app` -> `A` o `CNAME` hacia el VPS `178.104.136.153`.
- `staging-factura.ventax.app` -> `A` o `CNAME` hacia el VPS `178.104.136.153`.

Recomendacion operativa:

- mantener ambos proxied si el certificado Cloudflare del host ya cubre `*.ventax.app`;
- si hay problemas de SSL o diagnostico, probar temporalmente DNS only para descartar proxy;
- no crear un dominio compartido de comprobantes entre staging y prod. Cada ambiente debe entregar `/public/d/...` bajo su propio dominio.

## Paso 1 Backup De La Instancia Actual

En el VPS:

```bash
cd /home/deploy/apps/ventax-facturacion-simple
APP_ENV_FILE=.env BACKUP_DIR=/home/deploy/backups/facturacion-simple-staging npm run ops:backup
```

Este paso no modifica la base. Solo lee Postgres y genera un dump.

## Paso 2 Crear Env Staging

En el VPS, dentro del repo actual:

```bash
cd /home/deploy/apps/ventax-facturacion-simple
cp .env.staging.example .env.staging
chmod 600 .env.staging
```

Editar `.env.staging`:

```bash
nano .env.staging
```

Completar:

- `JWT_ACCESS_SECRET`;
- `JWT_REFRESH_SECRET`;
- `FE_API_KEY` de FE test;
- `SMOKE_USERNAME` y `SMOKE_PASSWORD` solo si se hara smoke con login.
- dejar `POSTGRES_PASSWORD=facturacion_simple` si se va a seguir usando la base actual ya inicializada con esa credencial.

Confirmar que queden:

```bash
COMPOSE_PROJECT_NAME=ventax-facturacion-simple
FRONTEND_HTTP_PORT=8092
API_HTTP_PORT=8091
POSTGRES_HOST_PORT=5433
POSTGRES_PASSWORD=facturacion_simple
DATABASE_URL=postgres://facturacion_simple:facturacion_simple@postgres:5432/facturacion_simple
FE_API_BASE_URL=http://host.docker.internal:9988/fcws
FE_API_ENV=test
APP_ORIGIN=https://staging-factura.ventax.app
PUBLIC_APP_BASE_URL=https://staging-factura.ventax.app
```

Nota: cambiar `APP_ORIGIN` y `PUBLIC_APP_BASE_URL` requiere recrear API/frontend. No deberia modificar datos, pero el stack ejecuta migraciones al levantar. Si se exige cero cambio de schema en la base actual, primero comparar migraciones pendientes antes de redeploy.

## Paso 3 Opcional Redeploy Staging Actual

Solo si se acepta que el stack ejecute el contenedor `migrate` contra la base actual:

```bash
cd /home/deploy/apps/ventax-facturacion-simple
APP_ENV_FILE=.env.staging bash scripts/deploy.sh
```

Validar:

```bash
curl -sS http://127.0.0.1:8092/healthz
curl -sS http://127.0.0.1:8092/api/v1/health
```

Si por ahora no se quiere tocar nada de la instancia actual, saltar este paso y solo rutear `staging-factura.ventax.app` al puerto `8092`. Los links publicos nuevos seguiran usando el `PUBLIC_APP_BASE_URL` viejo hasta redeploy.

## Paso 4 Crear Env Produccion

En el VPS:

```bash
cd /home/deploy/apps/ventax-facturacion-simple
cp .env.production.example .env.production
chmod 600 .env.production
```

Editar `.env.production`:

```bash
nano .env.production
```

Completar:

- `JWT_ACCESS_SECRET`;
- `JWT_REFRESH_SECRET`;
- `FE_API_KEY` de FE prod;
- `POSTGRES_PASSWORD` fuerte y el mismo valor dentro de `DATABASE_URL`;
- `SMOKE_USERNAME` y `SMOKE_PASSWORD` despues de crear el primer usuario productivo;
- flags FE segun la ficha del facturador que se cargara luego.

Confirmar:

```bash
COMPOSE_PROJECT_NAME=ventax-facturacion-simple-prod
FRONTEND_HTTP_PORT=8192
API_HTTP_PORT=8191
POSTGRES_HOST_PORT=5434
POSTGRES_PASSWORD=<password-postgres-production>
DATABASE_URL=postgres://facturacion_simple:<password-postgres-production>@postgres:5432/facturacion_simple
FE_API_BASE_URL=http://host.docker.internal:9989/fcws
FE_API_ENV=prod
APP_ORIGIN=https://factura.ventax.app
PUBLIC_APP_BASE_URL=https://factura.ventax.app
```

No reutilizar `.env` ni `.env.staging` para produccion. El aislamiento real depende de `COMPOSE_PROJECT_NAME=ventax-facturacion-simple-prod`; si se usa el nombre viejo, Compose reutilizara contenedores y volumenes de la instancia actual.

## Paso 5 Levantar Produccion Nueva

Este comando crea contenedores y volumen nuevos por usar otro `COMPOSE_PROJECT_NAME`:

```bash
cd /home/deploy/apps/ventax-facturacion-simple
APP_ENV_FILE=.env.production bash scripts/deploy.sh
```

Comprobacion previa no destructiva recomendada:

```bash
docker compose --env-file .env.production -f docker-compose.yml config --services
docker compose --env-file .env.production -f docker-compose.yml config | grep -E 'container_name|127.0.0.1:8192|127.0.0.1:8191|127.0.0.1:5434|host.docker.internal'
```

Esperado:

- `ventax-facturacion-simple-prod-frontend-1`;
- `ventax-facturacion-simple-prod-api-1`;
- `ventax-facturacion-simple-prod-postgres-1`;
- volumen `ventax-facturacion-simple-prod_facturacion_simple_pg`.

Validar localmente:

```bash
curl -sS http://127.0.0.1:8192/healthz
curl -sS http://127.0.0.1:8192/api/v1/health
docker compose --env-file .env.production -f docker-compose.yml ps
```

La produccion nueva debe quedar sin facturadores hasta ejecutar la guia de alta:

```text
docs/GUIA_PRODUCCION_ALTA_CLIENTE_FINAL_v0.1.md
```

## Paso 6 Nginx

Editar el sitio del host:

```bash
sudo nano /etc/nginx/sites-available/ventax
```

Agregar un bloque para staging apuntando a `8092` y cambiar `factura.ventax.app` para que apunte a `8192`.

Plantilla completa:

```text
infra/nginx-or-caddy/host-factura-multi-env.conf
```

Resumen esperado:

```nginx
server_name staging-factura.ventax.app;
proxy_pass http://127.0.0.1:8092;
```

```nginx
server_name factura.ventax.app;
proxy_pass http://127.0.0.1:8192;
```

Validar y recargar:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Validar por Host header antes o despues de DNS:

```bash
curl -k -sS https://127.0.0.1/api/v1/health -H 'Host: staging-factura.ventax.app'
curl -k -sS https://127.0.0.1/api/v1/health -H 'Host: factura.ventax.app'
```

## Paso 7 Smoke Inicial

Staging:

```bash
APP_ENV_FILE=.env.staging npm run ops:smoke
```

Produccion antes de facturadores:

```bash
curl -sS https://factura.ventax.app/api/v1/health
```

Produccion despues de crear primer usuario/facturador:

```bash
APP_ENV_FILE=.env.production npm run ops:smoke
```

Smoke operativo completo despues de alta productiva:

```bash
APP_ENV_FILE=.env.production npm run ops:onboarding-smoke
```

No ejecutar `ONBOARDING_SMOKE_NCE=YES` para facturadores cuya ficha FE tenga `nota_credito_electronica_habilitada=false`.

## Consideraciones

- La base actual de staging no debe copiarse a produccion.
- `COMPOSE_PROJECT_NAME` es lo que separa nombres de contenedores y volumenes.
- `POSTGRES_PASSWORD` solo inicializa una base nueva. Cambiarlo sobre un volumen Postgres existente no cambia la password interna de ese cluster.
- `POSTGRES_HOST_PORT` debe ser unico por instancia.
- `FRONTEND_HTTP_PORT` es el puerto que Nginx consume.
- `API_HTTP_PORT` queda util para diagnostico local, pero el trafico publico entra por frontend/Nginx.
- `PUBLIC_APP_BASE_URL` define los links de comprobantes. Debe ser distinto por ambiente.
- FE test y FE prod deben estar separados por URL interna:
  - staging -> `http://host.docker.internal:9988/fcws`;
  - produccion -> `http://host.docker.internal:9989/fcws`.
- Si mas adelante `fe-api.ventax.app` se cambia a FE prod, documentar un subdominio separado para FE test antes de usar dominios externos desde el SaaS.
