# dnit-ruc-loader

Cargador mensual de padron RUC DNIT a PostgreSQL.

## Requisitos

- Linux con Bash
- Node.js 20+
- PostgreSQL accesible por host/puerto

## Instalacion

```bash
cd dnit-ruc-loader
cp .env.example .env
npm install
```

## Configuracion

Variables principales en `.env`:

- `DNIT_RUC_URL`
- `DATABASE_URL` (recomendado; reutilizar el mismo del deploy de `ventax-facturacion-simple`)
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DATA_DIR`
- `IMPORT_BATCH_SIZE`
- `DNIT_CRON_DAY` (default `05`)
- `DNIT_CRON_HOUR` (default `3`)
- `DNIT_CRON_MINUTE` (default `0`)

Prioridad de conexion DB:

1. `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD` (si existen).
2. `DATABASE_URL`.

## Inicializar tablas

Ejecutar `sql/001_init.sql` en tu base de datos.

## Ejecucion manual

```bash
npm run import
```

o

```bash
bash scripts/run.sh
```

## Cron mensual

Instalar cron local (dia parametrizable, default dia `05` a las `03:00`):

```bash
bash scripts/install-cron.sh
```

Ejemplo (dia 5):

```bash
DNIT_CRON_DAY=05 bash scripts/install-cron.sh
```

## Cron en contenedor

Si usas `docker compose`, el servicio `dnit-ruc-loader-cron` crea la regla al iniciar el contenedor usando:

- `DNIT_CRON_DAY` (default `05`)
- `DNIT_CRON_HOUR` (default `3`)
- `DNIT_CRON_MINUTE` (default `0`)

Opcional:

- `DNIT_RUN_ON_START=true` para ejecutar una importacion inicial al levantar el contenedor.

El contenedor `dnit-ruc-loader-cron` reutiliza `${APP_ENV_FILE}` del deploy principal, por lo que toma la misma `DATABASE_URL` del ambiente (`.env.local`, `.env.staging`, `.env.production`, etc.).

## Deploy aislado del loader

Para no afectar la app principal, usar deploy separado:

```bash
APP_ENV_FILE=.env.local bash scripts/deploy-loader.sh
```

Para desplegar y ejecutar una carga inmediata:

```bash
APP_ENV_FILE=.env.local bash scripts/deploy-loader.sh --load-now
```

## Comportamiento de almacenamiento

- Descarga ZIP en `data/downloads/YYYY-MM/`.
- Extrae TXT en `data/extracted/YYYY-MM/`.
- Importa a staging y refresca tabla final por snapshot.
- Al finalizar OK elimina ZIP y TXT procesados.
- Conserva logs en `data/logs/`.
