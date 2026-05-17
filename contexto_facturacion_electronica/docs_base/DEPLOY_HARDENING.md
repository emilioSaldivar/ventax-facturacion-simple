# Deploy Seguro En Hetzner

Esta guia deja `facturacion-electronica` lista para exponerla por Internet con un baseline razonable de seguridad.

## Riesgos a cerrar antes del primer deploy

- no subir `.pem`, `.pfx`, `.p12`, `.key` ni secretos reales al repositorio;
- no reutilizar `API_KEY`, `ADMIN_AUTH_SECRET` ni passwords de ejemplo;
- no publicar `postgres` ni `api` en `0.0.0.0` salvo necesidad real y controlada;
- no servir el frontend administrativo por HTTP plano;
- no dejar acceso administrativo basado en `x-api-key + x-user-id` en producción.

## Baseline del servidor Hetzner

1. Crear un usuario operativo no root y deshabilitar login SSH por password.
2. Activar autenticación SSH solo por llave.
3. Cambiar el puerto SSH si querés reducir ruido automatizado.
4. Activar firewall y dejar abiertos solo:
   - `22/tcp` o tu puerto SSH
   - `80/tcp`
   - `443/tcp`
5. Instalar `fail2ban`.
6. Mantener updates del sistema y Docker al día.
7. Configurar zona horaria `America/Asuncion`.
8. Usar un volumen/disco con backup para PostgreSQL.

Ejemplo con `ufw`:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## Estructura recomendada en el server

No montes secretos productivos desde carpetas versionadas. Usá rutas runtime privadas:

```text
/opt/facturacion-electronica/
  docker-compose.prod.yml
  .env
  runtime/
    cert-seed/
    cert-uploads/
  secrets/
```

Permisos sugeridos:

```bash
sudo mkdir -p /opt/facturacion-electronica/{runtime/cert-seed,runtime/cert-uploads,secrets}
sudo chown -R $USER:$USER /opt/facturacion-electronica
chmod 700 /opt/facturacion-electronica/secrets
chmod 755 /opt/facturacion-electronica/runtime/cert-seed
chmod 775 /opt/facturacion-electronica/runtime/cert-uploads
find /opt/facturacion-electronica/runtime/cert-seed -maxdepth 1 -type f \( -name '*.pfx' -o -name '*.p12' \) -exec chmod 644 {} \;
find /opt/facturacion-electronica/runtime/cert-uploads -maxdepth 1 -type f \( -name '*.pfx' -o -name '*.p12' \) -exec chmod 664 {} \;
```

Motivo operativo:
- si `cert-seed` o el `.pfx/.p12` quedan demasiado restrictivos, el runtime no puede leer el certificado;
- la firma XML falla con `Permission denied`;
- el documento queda en `DRAFT`, sin `cdc`, y el endpoint `/fcws/files/ticket/:cdc/raw` no puede generar ticket.

## Variables productivas mínimas

Usá valores fuertes y bind local:

```env
APP_ENV=production
APP_TRUST_PROXY=true
API_BIND_IP=127.0.0.1
API_HOST_PORT=9988
FRONTEND_BIND_IP=127.0.0.1
FRONTEND_PORT=8099
API_KEY=<32+ chars aleatorios>
ADMIN_AUTH_SECRET=<48+ chars aleatorios>
POSTGRES_PASSWORD=<32+ chars aleatorios>
DATABASE_URL=postgres://postgres:<password>@postgres:5432/fe_mvp
ENABLE_DEV_SMOKE=false
LOG_LEVEL=info
CORS_ALLOW_ORIGINS=https://fe.tudominio.com
FE_SECRETS_DIR=/opt/facturacion-electronica/secrets
FE_CERT_SEED_DIR=/opt/facturacion-electronica/runtime/cert-seed
FE_CERT_UPLOADS_DIR=/opt/facturacion-electronica/runtime/cert-uploads
```

Generación rápida de secretos:

```bash
openssl rand -base64 33
```

## Exposición segura

El `docker-compose.prod.yml` quedó preparado para:

- publicar `api` solo en `127.0.0.1:9988`;
- publicar `frontend` solo en `127.0.0.1:8099`;
- montar secretos y certificados desde directorios runtime;
- correr servicios de app con `no-new-privileges` y `cap_drop: ALL`.

La exposición pública debe hacerla un reverse proxy con TLS, por ejemplo `Caddy` o `Nginx`, hacia:

- `http://127.0.0.1:8099` para frontend admin;
- `http://127.0.0.1:9988` solo si realmente necesitás exponer la API FE a otros sistemas.

Si `pos-graciela-api` vive en el mismo host, preferí consumir `http://127.0.0.1:9988`.

## Orden de despliegue

1. Copiar `.env` productivo.
2. Crear directorios runtime y secretos.
3. Copiar certificados reales fuera del repo.
4. Levantar stack:

```bash
bash scripts/deploy-prod.sh
```

5. Verificar salud:

```bash
curl -sS http://127.0.0.1:9988/fcws/health
curl -I http://127.0.0.1:8099
docker compose -f docker-compose.prod.yml ps
```

Chequeo rápido si la API no devuelve ticket raw:

```bash
docker compose -f docker-compose.prod.yml logs api --tail=200 | grep -i 'Permission denied\|FileNotFoundException\|documents_info'
ls -ld /opt/facturacion-electronica/runtime/cert-seed
ls -l /opt/facturacion-electronica/runtime/cert-seed
```

## Rotación urgente recomendada

En este workspace ya existen artefactos sensibles (`.pem` y `.pfx`). Antes de deployar en serio:

1. asumir esos secretos como expuestos;
2. reemplazar certificados/llaves si siguen vigentes;
3. limpiar el historial Git en los repos donde hayan sido commiteados;
4. mover todo secreto productivo a `/opt/facturacion-electronica/secrets` o equivalente.
