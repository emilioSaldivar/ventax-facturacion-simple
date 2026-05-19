# Ventax Facturacion Simple Cliente

Aplicacion web mobile-first para emitir facturas electronicas simples consumiendo el backend fiscal `facturacion-electronica`.

Este repositorio contiene:

- API propia de operacion, usuarios, sesiones, clientes, catalogo, facturas, documentos y entrega publica.
- Frontend operativo en `/app/`.
- Backoffice interno en `/backoffice/`.
- Proxy publico de comprobantes en `/public/`.
- Integracion con `facturacion-electronica` por HTTP usando `FE_API_BASE_URL` y `FE_API_KEY`.
- Docker Compose para API, frontend Nginx, migraciones y PostgreSQL.

La app no genera XML, firma, QR, SIFEN ni KUDE/PDF por cuenta propia. Esa responsabilidad queda delegada al backend fiscal.

## Arquitectura De Despliegue

Flujo recomendado en nube:

```text
Internet
  |
  | HTTPS 443
  v
Nginx del host / reverse proxy TLS
  |
  | proxy_pass a Docker
  v
frontend container :80
  |
  | /api/v1/*   -> api:8080
  | /public/*   -> api:8080
  | /app/*      -> archivos web operacion
  | /backoffice/* -> archivos backoffice
  v
api container :8080
  |
  | HTTP x-api-key
  v
facturacion-electronica
```

En `docker-compose.yml`, el frontend se publica por defecto en el puerto del host definido por:

```bash
FRONTEND_HTTP_PORT=8092
API_HTTP_PORT=8091
POSTGRES_HOST_PORT=5433
```

Por eso, normalmente Nginx puede apuntar a:

```text
http://127.0.0.1:8092
```

Si se decide proxyar directamente a la IP asignada por Docker al contenedor, Nginx debe configurarse con esa IP interna. Ver seccion "Nginx".

## Requisitos Del Servidor

Servidor Linux con:

- Docker.
- Docker Compose v2.
- Git.
- Nginx o Caddy en el host para HTTPS.
- Dominio apuntando a la IP publica del servidor.

Verificar:

```bash
docker --version
docker compose version
git --version
nginx -v
```

Puertos recomendados para este servidor:

- `80`: HTTP para emitir/renovar certificados TLS.
- `443`: HTTPS publico.
- `8092`: frontend Docker, publicado solo en `127.0.0.1`, usado por Nginx del host.
- `8091`: API directa, publicada solo en `127.0.0.1`, no exponer publicamente.
- `5433`: PostgreSQL, publicado solo en `127.0.0.1`, no exponer publicamente.

Con los servicios existentes del VPS (`8090`, `8099`, `9988`, `8088`, `5050`, `5434`), `8092`, `8091` y `5433` quedan separados para `ventax-facturacion-simple`.

## Clonar Y Preparar

```bash
git clone <repo-url> nuevo_repo
cd nuevo_repo
cp .env.example .env
```

No versionar `.env`.

## Variables De Entorno Minimas

Editar `.env` en el servidor:

```bash
NODE_ENV=production
PORT=8080
API_BASE_PATH=/api/v1
FRONTEND_HTTP_PORT=8092
API_HTTP_PORT=8091
POSTGRES_HOST_PORT=5433

APP_ORIGIN=https://factura.tudominio.com
BACKOFFICE_ORIGIN=https://factura.tudominio.com
PUBLIC_APP_BASE_URL=https://factura.tudominio.com

JWT_ACCESS_SECRET=<secret-largo>
JWT_REFRESH_SECRET=<secret-largo-distinto>
JWT_ACCESS_TTL_MINUTES=15
JWT_REFRESH_TTL_DAYS=30

FE_API_BASE_URL=https://fe-api.ventax.app/fcws
FE_API_KEY=<x-api-key-real>
FE_API_TIMEOUT_MS=20000
FE_API_ENV=test
FE_GATEWAY_MODE=real
FE_SEND_EMISSION_PROFILE_CODE=false
FE_SERVICE_NUMBERING=true
FE_OUTBOX_WORKER_ENABLED=true
FE_OUTBOX_WORKER_INTERVAL_MS=5000

DOCKER_LOG_MAX_SIZE=10m
DOCKER_LOG_MAX_FILE=5
```

Generar secretos:

```bash
openssl rand -base64 48
openssl rand -base64 48
```

Notas:

- `FE_GATEWAY_MODE=real` es obligatorio para conectar con `facturacion-electronica`.
- `FE_API_KEY` debe guardarse solo en `.env` o secret manager.
- `PUBLIC_APP_BASE_URL` debe ser el dominio publico real. Se usa para links compartidos por WhatsApp.
- En produccion debe usarse HTTPS, porque las cookies de refresh son `secure`.

## Nginx

El Nginx del host debe exponer el dominio publico y reenviar todo al frontend Docker.

### Opcion Recomendada: Proxy Al Puerto Publicado Del Host

Esta opcion es mas estable porque no depende de la IP interna del contenedor.

`docker-compose.yml` publica:

```yaml
frontend:
  ports:
    - "127.0.0.1:${FRONTEND_HTTP_PORT:-8092}:80"
```

Con `FRONTEND_HTTP_PORT=8092`, usar:

```nginx
server {
  listen 80;
  server_name factura.tudominio.com;

  location / {
    proxy_pass http://127.0.0.1:8092;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Luego agregar TLS con Certbot, Caddy o el mecanismo elegido.

Tambien existe una plantilla lista para adaptar:

```text
infra/nginx-or-caddy/host-production.conf
```

La plantilla esta preparada para el VPS actual con certificado Cloudflare en `/etc/ssl/cloudflare/ventax.app.pem` y dominio `factura.ventax.app`. Si se usa otro subdominio, reemplazar `factura.ventax.app` antes de instalarla en Nginx.

### Opcion Alternativa: Proxy A La IP Docker Asignada

Si el servidor no expone el puerto del frontend o se quiere apuntar directamente a la red Docker, obtener la IP interna:

```bash
docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' nuevo_repo-frontend-1
```

Ejemplo de resultado:

```text
172.18.0.5
```

Configurar Nginx con esa IP:

```nginx
server {
  listen 80;
  server_name factura.tudominio.com;

  location / {
    proxy_pass http://172.18.0.5:80;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Importante:

- La IP Docker puede cambiar si se recrea el contenedor o la red.
- Si se usa esta opcion, revisar la IP despues de cada redeploy.
- Para produccion, suele ser preferible usar `127.0.0.1:8092` o una red Docker externa controlada con nombres estables.

Validar Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Deploy

Ejecutar:

```bash
bash scripts/deploy.sh
```

El script:

- construye imagenes;
- ejecuta migraciones;
- levanta PostgreSQL, API y frontend;
- muestra estado del stack.

Verificar:

```bash
docker compose ps
curl -sS http://127.0.0.1:8092/healthz
curl -sS http://127.0.0.1:8092/api/v1/health
```

Con dominio:

```bash
curl -sS https://factura.tudominio.com/healthz
curl -sS https://factura.tudominio.com/api/v1/health
```

URLs:

- Operacion: `https://factura.tudominio.com/app/`
- Backoffice: `https://factura.tudominio.com/backoffice/`
- API health: `https://factura.tudominio.com/api/v1/health`
- Comprobantes publicos: `https://factura.tudominio.com/public/d/<token>`

## Validar Conexion Con Facturacion Electronica

### Health FE

```bash
FE_SMOKE_RUN=YES npm run ops:fiscal-smoke
```

Debe confirmar que `facturacion-electronica` responde.

### Smoke Operativo

Requiere un operador ya configurado con facturador, establecimiento, punto, timbrado, actividad y readiness listo.

```bash
SMOKE_API_BASE_URL=https://factura.tudominio.com/api/v1 \
SMOKE_PUBLIC_BASE_URL=https://factura.tudominio.com \
SMOKE_USERNAME=<operador> \
SMOKE_PASSWORD=<password> \
ONBOARDING_SMOKE_CLIENTE_TIPO=CI \
ONBOARDING_SMOKE_CLIENTE_DOCUMENTO=492019 \
ONBOARDING_SMOKE_CLIENTE_RAZON_SOCIAL="Roberto Saldivar" \
npm run ops:onboarding-smoke
```

Para validar NCE total:

```bash
SMOKE_API_BASE_URL=https://factura.tudominio.com/api/v1 \
SMOKE_PUBLIC_BASE_URL=https://factura.tudominio.com \
SMOKE_USERNAME=<operador> \
SMOKE_PASSWORD=<password> \
ONBOARDING_SMOKE_CLIENTE_TIPO=CI \
ONBOARDING_SMOKE_CLIENTE_DOCUMENTO=492019 \
ONBOARDING_SMOKE_CLIENTE_RAZON_SOCIAL="Roberto Saldivar" \
ONBOARDING_SMOKE_NCE=YES \
npm run ops:onboarding-smoke
```

Si KUDE/PDF falla por error del backend fiscal, el deploy puede quedar operativo para emision, pero se debe dejar `EST-006` como pendiente de validacion externa.

## Alta De Facturador

Antes de entregar al cliente:

- Tenant activo.
- Suscripcion activa.
- Facturador activo.
- `emisor_id` fiscal configurado.
- Establecimiento configurado.
- Punto de expedicion configurado.
- Timbrado vigente.
- Actividad economica configurada.
- Usuario operativo asignado al facturador.
- Readiness listo en `/app/`.

Checklist:

```text
docs/CHECKLIST_ALTA_FACTURADOR_MVP_v0.1.md
```

Catalogo de receptores de prueba:

```text
docs/RECEPTORES_SIFEN_TEST_v0.1.md
```

## Backups

Backup manual:

```bash
npm run ops:backup
```

Verificar restore no destructivo:

```bash
npm run ops:restore:verify
```

Instalar backup diario por cron:

```bash
npm run ops:backup:install-cron
```

Los backups se guardan en:

```text
backups/postgres/
```

No se versionan.

## Logs Y Diagnostico

Ver logs de API:

```bash
docker compose logs api
```

Seguir logs:

```bash
docker compose logs -f api
```

Errores de KUDE/PDF o XML se registran con:

```text
event: fiscal_artifact_fetch_failed
```

Buscar:

```bash
docker compose logs api | grep fiscal_artifact_fetch_failed
```

Ese log incluye:

- `requestId`
- `occurred_at`
- `endpoint`
- `artifact`
- `cdc`
- `numero_fiscal`
- `documento_estado`
- `gateway_code`
- `gateway_details`

Con eso se puede escalar el incidente al servicio `facturacion-electronica`.

## Comandos De Operacion Rapida

```bash
# deploy/redeploy
bash scripts/deploy.sh

# estado
docker compose ps

# logs API
docker compose logs -f api

# logs frontend
docker compose logs -f frontend

# health local
curl -sS http://127.0.0.1:8092/healthz
curl -sS http://127.0.0.1:8092/api/v1/health

# backup
npm run ops:backup

# verificar restore
npm run ops:restore:verify
```

## Seguridad Minima

- No versionar `.env`.
- No exponer PostgreSQL a Internet.
- Usar HTTPS obligatorio.
- Rotar `FE_API_KEY` si se sospecha exposicion.
- Usar secretos JWT largos y distintos.
- Mantener backups verificados.
- Revisar `docker compose logs` ante errores de emision o entrega.
- Mantener `FE_GATEWAY_MODE=real` solo en entornos que realmente deban emitir contra FE.

## Troubleshooting

### Login No Mantiene Sesion

Verificar:

- dominio en `APP_ORIGIN`;
- HTTPS activo;
- `NODE_ENV=production`;
- proxy enviando `X-Forwarded-Proto`;
- navegador accediendo por el mismo dominio configurado.

### PDF/KUDE Devuelve Error

Buscar:

```bash
docker compose logs api | grep fiscal_artifact_fetch_failed
```

Si `gateway_details.status` es `500`, el error viene del servicio fiscal aguas arriba.

### Factura Queda Pendiente

Ver:

```bash
docker compose logs api
```

La emision usa outbox/worker. Confirmar:

```bash
FE_OUTBOX_WORKER_ENABLED=true
FE_OUTBOX_WORKER_INTERVAL_MS=5000
```

### Nginx No Muestra La App

Probar primero directo al host:

```bash
curl -I http://127.0.0.1:8092/app/
```

Si eso funciona, el problema esta en Nginx/TLS.

Si Nginx apunta a IP Docker, verificar IP actual:

```bash
docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' nuevo_repo-frontend-1
```

Actualizar `proxy_pass` si cambio.

## Documentacion Relacionada

- `docs/OPERACION_PRODUCCION_MVP_v0.1.md`
- `docs/CHECKLIST_ALTA_FACTURADOR_MVP_v0.1.md`
- `docs/RECEPTORES_SIFEN_TEST_v0.1.md`
- `docs/CIERRE_ROADMAP_UI_UX_REFINAMIENTO_v0.1.md`
