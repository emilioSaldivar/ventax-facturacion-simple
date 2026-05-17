# DEPLOY MVP v0.1

Guia minima para desplegar `facturacion-electronica` con Docker Compose.

> Regla operativa: el servidor solo debe desplegar commits ya publicados. No editar codigo directamente en `~/apps/facturacion-electronica`. Ver `docs/OPERACION_GIT_DEPLOY.md`.

## 1. Artefactos

- `docker-compose.prod.yml`: stack productivo base.
- `frontend/Dockerfile`: build del frontend administrativo.
- `.env`: variables de entorno reales del ambiente.
- `./secrets`: secretos montados en solo lectura.
- `./documents_info`: certificados semilla o artefactos fiscales readonly.
- volumen `cert_uploads`: storage persistente de `.pfx/.p12` cargados por API.

## 2. Variables minimas recomendadas

Valores obligatorios:
- `APP_ENV=production`
- `API_KEY`
- `DATABASE_URL`
- `POSTGRES_PASSWORD`
- `SIFEN_ENV`

Valores operativos recomendados:
- `APP_TRUST_PROXY=true`
- `API_BIND_IP=0.0.0.0`
- `API_HOST_PORT=9988`
- `FRONTEND_PORT=8099`
- `CORS_ALLOW_ORIGINS=` si el frontend y backend comparten mismo origen via proxy interno
- `ENABLE_DEV_SMOKE=false`
- `LOG_LEVEL=info`
- `BATCH_WORKER_LOOP_SECONDS=60`
- `STATUS_SYNC_WORKER_LOOP_SECONDS=60`
- `CERT_UPLOAD_DIR=/tmp/facturacion-electronica/certs`

## 3. Primer despliegue

1. Preparar `.env` productivo.
2. Crear directorios locales:
   - `secrets/`
   - `documents_info/`
3. Verificar permisos antes del primer arranque:

```bash
bash scripts/prepare-runtime-permissions.sh
```

4. Construir imagenes:

```bash
docker compose -f docker-compose.prod.yml build
```

5. Ejecutar migraciones y levantar servicios:

```bash
bash scripts/deploy-prod.sh
```

## 4. Verificaciones posteriores

Health:

```bash
curl -sS http://localhost:${API_HOST_PORT:-9988}/fcws/health
```

Estado de servicios:

```bash
docker compose -f docker-compose.prod.yml ps
```

Logs utiles:

```bash
docker compose -f docker-compose.prod.yml logs api --tail=100
docker compose -f docker-compose.prod.yml logs frontend --tail=100
docker compose -f docker-compose.prod.yml logs worker-batch --tail=100
docker compose -f docker-compose.prod.yml logs worker-status-sync --tail=100
```

## 5. Backup Y Restore De Base De Datos

Los scripts operativos usan el servicio Compose estable `postgres`; no dependen del nombre real del contenedor generado por Docker Compose.

Crear backup:

```bash
bash scripts/backup-db.sh
```

Por defecto el archivo se guarda en `backups/postgres_backup/` como `.dump` (`pg_dump -Fc`). Para usar otro compose o directorio:

```bash
FE_COMPOSE_FILE=docker-compose.prod.yml FE_BACKUP_DIR=/opt/facturacion-electronica/backups bash scripts/backup-db.sh
```

Restaurar un backup especifico:

```bash
bash scripts/restore-db.sh --yes backups/postgres_backup/backup_fe_mvp_YYYYMMDD_HHMMSS.dump
```

Restaurar el ultimo backup detectado:

```bash
bash scripts/restore-db.sh --yes
```

> El restore elimina y recrea la base destino. No ejecutarlo sobre datos productivos sin autorizacion explicita y verificacion previa del archivo.

## 6. Checklist de salida

- `frontend` saludable y expuesto.
- `api` saludable pero no expuesto al exterior.
- `worker-batch` corriendo.
- `worker-status-sync` corriendo.
- migraciones aplicadas.
- solo el `frontend` publica puerto hacia el host.
- `CORS_ALLOW_ORIGINS` consistente con el esquema final de exposición.
- `ENABLE_DEV_SMOKE=false`.
- `API_KEY` rotada fuera del valor de ejemplo.
- storage de `cert_uploads` persistente.

## 7. Notas operativas

- Los certificados subidos por frontend viven en el volumen `cert_uploads`; no deben depender del filesystem efimero del contenedor.
- Los certificados seed montados en `/app/documents_info` deben ser legibles por el runtime. Si el `.pfx/.p12` no se puede leer, la firma XML falla, el documento queda en `DRAFT` y no habrá ticket raw.
- El stack productivo no expone `pgadmin`, `test` ni la `api` al host.
- El frontend sirve estáticos por `nginx` y hace proxy interno a `api:8080/fcws`.
- Si hay reverse proxy o balanceador delante de la API, activar `APP_TRUST_PROXY=true`.
- En un despliegue `LAN` donde `pos-graciela-api` corre en otro stack Docker sobre el mismo host, la convención recomendada es:
  - publicar API FE en `0.0.0.0:9988` hacia el host
  - mantener `8080` como puerto interno del contenedor API
  - configurar POS con `FACTURACION_ELECTRONICA_BASE_URL=http://host.docker.internal:9988`
  - mantener `8099` para frontend admin FE salvo override por `.env`
