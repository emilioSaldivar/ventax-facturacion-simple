# facturacion-electronica

Backend Node.js/TypeScript para emision y gestion de Documentos Electronicos conforme SIFEN Paraguay, Manual Tecnico v150.

Soporta:
- emision FE `SYNC`
- emision FE `BATCH`
- emision FE `AUTO`
- cancelacion
- inutilizacion
- consultas
- operacion multiemisor con configuracion fiscal y batch en base de datos

## Fuente de verdad
- `AGENTS.md`
- `docs/SPEC_MVP_v0.1.md`
- `docs/PLAN_MVP_v0.1.md`
- `docs/TASKS_MVP_v0.1.md`
- `spec/openapi.yaml`

## 1. Manual Tecnico

### 1.1 Arquitectura operativa
El servicio separa dos momentos:
- generacion local del DE: validacion, XML, firma, CDC, QR, persistencia
- transmision a SIFEN: `SYNC`, `BATCH` o `AUTO`

Comportamiento por modo:
- `SYNC`: exige envio inmediato. Si falla la transmision tecnica, el documento queda persistido con `TRANSMISSION_FAILED` y la API responde error.
- `BATCH`: nunca intenta envio inmediato. El documento queda en `QUEUED_BATCH`.
- `AUTO`: intenta `SYNC`; si falla la transmision tecnica, hace fallback a `QUEUED_BATCH` y responde `202`.

Puntos clave:
- CDC, firma y QR se generan localmente.
- El KuDE puede generarse aun sin conectividad con SIFEN.
- Los lotes se agrupan por `emisor + env + tipo_documento`.
- Cada lote admite hasta `50` DE del mismo tipo.
- El worker batch usa agenda por emisor o default en BD.

### 1.2 Estructura del despliegue
Servicios principales:
- `api`: expone `/fcws/*`
- `worker-batch`: ejecuta envio batch y polling
- `postgres`: persistencia
- `migrate`: aplica migraciones
- `test`: servicio efimero para correr `npm test` dentro del stack

### 1.3 Requisitos
- Node.js 20+
- PostgreSQL 16 recomendado
- certificado `.p12`
- `CSC` e `idCSC`
- secretos accesibles por `.env` o referencias seguras

### 1.4 Variables de configuracion
Configuracion de aplicacion:
- `APP_ENV`
- `APP_TIMEZONE`
- `PORT`
- `API_BIND_IP`
- `API_HOST_PORT`
- `API_KEY`
- `DATABASE_URL`
- `CONFIG_SOURCE`
- `LOG_LEVEL`
- `SIFEN_TIMEOUT_MS`
- `SETAPI_TIMEOUT_MS`
- `BATCH_WORKER_LOOP_SECONDS`

Convencion de exposicion para integraciones externas:
- API FE host por defecto: `http://host.docker.internal:9988` visto desde otros contenedores del mismo host
- API FE host port por defecto: `9988`
- frontend admin FE host port por defecto: `8099`
- si el consumidor corre fuera del host local, debe usar una URL/DNS accesible real en lugar de `host.docker.internal`

Configuracion fiscal por emisor en BD:
- emisor
- actividad economica
- establecimiento
- punto de expedicion
- timbrado
- certificado
- CSC
- numerador
- `batch_dispatch_config`

Secretos:
- password del `.p12`
- cualquier credencial sensible adicional

El `.env` no debe contener datos fiscales del emisor. La configuracion fiscal y operativa del emisor debe resolverse desde base de datos.

### 1.5 Levantar el proyecto con Docker
1. Copiar variables base:

```bash
cp .env.example .env
```

2. Crear carpeta de secretos y montar archivos reales:

```bash
mkdir -p secrets
```

Archivos esperados:
- `secrets/sifen_cert.p12`
- `secrets/setapi_cert.pem`

3. Ajustar `.env` al menos con:

```env
API_KEY=facturacion-mvp-local
DATABASE_URL=postgres://postgres:postgres@postgres:5432/fe_mvp
SIFEN_ENV=test
SETAPI_TIMEOUT_MS=20000
CONFIG_SOURCE=db
APP_TIMEZONE=America/Asuncion
BATCH_WORKER_LOOP_SECONDS=60
```

Los certificados, passwords y CSC no viven en el `.env` global del servicio. Se resuelven por emisor desde BD:
- `emisor_certificados.cert_path`
- `emisor_certificados.password_value`
- `emisor_csc.id_csc`
- `emisor_csc.csc_value`

4. Construir y levantar:

```bash
docker compose up --build -d postgres migrate api worker-batch
```

5. Verificar salud:

```bash
curl http://localhost:${API_HOST_PORT:-9988}/fcws/health
```

### 1.5.1 Preflight de certificados y permisos
Si usas bind mounts para `documents_info` o `runtime/cert-seed`, el `.pfx/.p12` debe quedar legible desde el contenedor antes de arrancar el stack.

Caso validado en producción:
- si el archivo queda con permisos demasiado restrictivos, la firma XML falla;
- el documento queda en `DRAFT`, sin `cdc`, sin `xml_signed` y sin `xml_qr`;
- en ese estado `GET /fcws/files/ticket/:cdc/raw` no puede devolver ticket.

Comando manual de corrección rápida:

```bash
chmod 755 /opt/facturacion-electronica/runtime/cert-seed
find /opt/facturacion-electronica/runtime/cert-seed -maxdepth 1 -type f \( -name '*.pfx' -o -name '*.p12' \) -exec chmod 644 {} \;
docker compose -f docker-compose.prod.yml restart api worker-batch worker-status-sync
```

Preflight automatizado incluido en este repo:

```bash
bash scripts/prepare-runtime-permissions.sh
```

Deploy productivo con preflight previo:

```bash
bash scripts/deploy-prod.sh
```

El preflight:
- crea `secrets`, `runtime/cert-seed` y `runtime/cert-uploads` si faltan;
- aplica permisos seguros y operativos;
- deja `cert-seed` transitable y los `.pfx/.p12` legibles por el runtime;
- valida lectura básica de los certificados seed antes del `docker compose up`.

### 1.6 Ejecucion local sin Docker
```bash
npm install
npm run build
npm run migrate
npm run dev
```

Si ejecutas fuera de Docker, asegurate de que `DATABASE_URL` y las rutas de certificados apunten a recursos locales reales.

### 1.7 Migraciones y pruebas
Migraciones:

```bash
npm run migrate
```

Tests locales:

```bash
npm test
```

Tests dentro del stack:

```bash
docker compose --profile test run --rm test
```

### 1.8 Endpoints disponibles
Base path: `/fcws`

- `GET /health`
- `POST /factura`
- `POST /evento/cancelar`
- `POST /evento/inutilizacionnumfactura`
- `GET /consultar/comprobante/{cdc}`
- `GET /consultar/comprobantexml/{cdc}`
- `GET /consultar/comprobanteSifen/{cdc}`
- `GET /consultar/{id}/facturalista/{numero}`
- `GET /consultar/{id}/batch-pendientes`
- `GET /consultar/evento/{cdc}`

### 1.9 Worker batch: como programarlo
`SYNC` no necesita worker.

`BATCH` y el fallback de `AUTO` si necesitan `worker-batch`.

El worker hace:
1. toma documentos `QUEUED_BATCH`
2. agrupa por `emisor + env + tipo_documento`
3. arma lotes de hasta `50`
4. envia a SIFEN
5. realiza polling hasta estado final o hasta `poll_max_tries`

#### Programacion por base de datos
Default por ambiente:
- tabla `batch_dispatch_defaults`

Override por emisor:
- tabla `batch_dispatch_config`

Campos operativos:
- `env`
- `schedule_type` = `CRON | INTERVAL`
- `cron_expr`
- `interval_minutes`
- `max_docs`
- `poll_seconds`
- `poll_max_tries`
- `enabled`

Ejemplo default nocturno:

```sql
UPDATE batch_dispatch_defaults
SET schedule_type = 'CRON',
    cron_expr = '0 2 * * *',
    interval_minutes = NULL,
    max_docs = 50,
    poll_seconds = 30,
    poll_max_tries = 40,
    enabled = TRUE
WHERE env = 'test';
```

Ejemplo override por emisor cada 15 minutos:

```sql
INSERT INTO batch_dispatch_config (
  emisor_id,
  env,
  schedule_type,
  cron_expr,
  interval_minutes,
  max_docs,
  poll_seconds,
  poll_max_tries,
  enabled
) VALUES (
  '80136968-1',
  'test',
  'INTERVAL',
  NULL,
  15,
  50,
  30,
  40,
  TRUE
)
ON CONFLICT (emisor_id, env) DO UPDATE SET
  schedule_type = EXCLUDED.schedule_type,
  cron_expr = EXCLUDED.cron_expr,
  interval_minutes = EXCLUDED.interval_minutes,
  max_docs = EXCLUDED.max_docs,
  poll_seconds = EXCLUDED.poll_seconds,
  poll_max_tries = EXCLUDED.poll_max_tries,
  enabled = EXCLUDED.enabled,
  updated_at = NOW();
```

Notas:
- si no existe `batch_dispatch_config`, el worker usa `batch_dispatch_defaults`
- `AUTO` usa `SYNC` primero; solo entra al worker si cae en fallback
- `SYNC` puro no depende del worker

### 1.10 Como configurar un emisor para emitir
Estado actual:
- la resolucion multiemisor ya existe
- la configuracion se toma desde BD cuando `CONFIG_SOURCE=db`
- no existe aun un ABM/API administrativo para dar de alta o editar emisores por HTTP

Por lo tanto, hoy la configuracion del emisor se realiza por:
- migraciones
- seed SQL
- carga manual en base de datos

Tablas que deben quedar consistentes para un emisor operativo:
- `emisores`
- `emisor_actividades`
- `establecimientos`
- `puntos_expedicion`
- `emisor_timbrados`
- `emisor_certificados`
- `emisor_csc`
- `numeradores_documentos`
- opcionalmente `batch_dispatch_config`

El emisor queda operativo cuando tiene:
- RUC completo correcto
- ambiente SIFEN correcto
- una actividad economica activa
- establecimiento y punto activos
- timbrado vigente
- certificado activo con `password_value`
- CSC activo con `csc_value`
- numerador activo para FE

Referencia de modelo:
- `docs/MODELO_DATOS_MULTI_EMISOR_v0.1.md`
- `src/migrations/002_multi_emisor.sql`
- `src/migrations/003_seed_awapura.sql`

#### Valores sensibles del emisor
El modelo actual guarda en base de datos:
- `password_value`
- `csc_value`

Para un mismo emisor, el mismo certificado y password se usan tanto para `xmlsign` como para `setapi`.

Compatibilidad transitoria:
- si una base vieja todavia conserva valores con prefijo `env:`, el resolver los sigue interpretando para no romper la migracion
- el objetivo final es dejar esos valores directamente en BD en texto plano

Referencia de ajuste para bases existentes:
- `docs/SQL_CARGA_VALORES_PLANOS_EMISORES.sql`

### 1.11 Gap identificado
No existe todavia un ABM/API para configuracion de emisores.

Requerimiento ya mapeado:
- `docs/SPEC_MVP_v0.1.md`
- `docs/PLAN_MVP_v0.1.md`
- `docs/TASKS_MVP_v0.1.md` en `T030`

Eso significa que hoy un onboarding de emisor requiere intervencion tecnica o DBA.

## 2. Manual de Usuario

### 2.1 Preparacion en Postman
Importar:
- `postman/facturacion-electronica-mvp.postman_collection.json`
- `postman/facturacion-electronica-local.postman_environment.json`

Variables clave del environment:
- `base_url`
- `api_key`
- `emisor_ruc`
- `query_env`
- `establecimiento`
- `punto_expedicion`
- `doc_numero`

La collection incluye un request de bootstrap que copia `api_key` a:
- `bearer_token`
- `x_api_key`

### 2.2 Que modo usar
Usar `SYNC` cuando:
- necesitas respuesta inmediata de SIFEN
- no queres depender de cola batch

Usar `BATCH` cuando:
- queres operacion diferida
- la caja o sistema puede seguir trabajando sin retorno inmediato
- vas a despachar por agenda desde el worker

Usar `AUTO` cuando:
- queres intentar `SYNC`
- pero no queres frenar operacion si cae internet o falla la transmision tecnica

### 2.3 Emitir una factura
Payload minimo:

```json
{
  "emisor_id": "80136968-1",
  "timbrado": {
    "timbrado": "80136968",
    "establecimiento": "001",
    "puntoExpedicion": "001",
    "documentoNro": "0000950",
    "fecIni": "2025-12-30"
  },
  "receptor": {
    "tipoDocumento": "CI",
    "docNro": "5057016",
    "razonSocial": "Cliente Demo"
  },
  "fecha": "2026-02-23T12:00:00Z",
  "condicionOperacion": {
    "tipo": "CONTADO",
    "pagos": [
      {
        "medio": "EFECTIVO",
        "monto": 100000
      }
    ]
  },
  "items": [
    {
      "codigo": "ITEM-001",
      "descripcion": "Producto demo",
      "cantidad": 1,
      "precioUnitario": 100000,
      "ivaTipo": "IVA10"
    }
  ],
  "envio": {
    "mode": "SYNC",
    "sendNow": true
  }
}
```

Respuesta esperada:
- `SYNC`: `200` con estado final o error HTTP por fallo tecnico
- `BATCH`: `200` con `status=QUEUED_BATCH`
- `AUTO`: `200` si `SYNC` funciona, `202` si cae a `QUEUED_BATCH`

### 2.4 Consultar un comprobante
Si tu base aloja mas de un ambiente, enviar `env=test|prod`.

Ejemplos:

```bash
curl -H 'x-api-key: facturacion-mvp-local' \
  'http://localhost:8080/fcws/consultar/comprobante/CDC_AQUI?env=test'
```

```bash
curl -H 'x-api-key: facturacion-mvp-local' \
  'http://localhost:8080/fcws/consultar/comprobanteSifen/CDC_AQUI?refresh=true&env=test'
```

### 2.5 Consultar cola y lotes batch
Sirve para backoffice, monitoreo o conciliacion operativa.

```bash
curl -H 'x-api-key: facturacion-mvp-local' \
  'http://localhost:8080/fcws/consultar/80136968-1/batch-pendientes?env=test&limit=50&offset=0'
```

### 2.6 Cancelar una factura aprobada
Solo aplica a documentos aprobados y dentro de la ventana permitida.

```bash
curl -X POST http://localhost:8080/fcws/evento/cancelar \
  -H 'x-api-key: facturacion-mvp-local' \
  -H 'Content-Type: application/json' \
  -d '{
    "emisor_id": "80136968-1",
    "cdc": "CDC_AQUI",
    "motivo": "Error de emision"
  }'
```

### 2.7 Inutilizar numeracion
```bash
curl -X POST http://localhost:8080/fcws/evento/inutilizacionnumfactura \
  -H 'x-api-key: facturacion-mvp-local' \
  -H 'Content-Type: application/json' \
  -d '{
    "emisor_id": "80136968-1",
    "establecimiento": "001",
    "puntoExpedicion": "001",
    "desdeNumero": "0000960",
    "hastaNumero": "0000965",
    "motivo": "Rango reservado no utilizado"
  }'
```

### 2.8 Estados que va a ver el usuario integrador
- `QUEUED_BATCH`: documento en cola para lote
- `TRANSMISSION_FAILED`: fallo tecnico de transmision en `SYNC`
- `SENT_BATCH`: lote enviado, pendiente de resultado final
- `APPROVED`: aprobado
- `APPROVED_WITH_OBS`: aprobado con observaciones
- `REJECTED`: rechazado
- `CANCELLED`: cancelado
- `VOIDED`: inutilizado

## 3. Operacion recomendada

### 3.1 POS o facturador resiliente
- usar `AUTO`
- mantener `worker-batch` desplegado
- configurar agenda batch en BD

### 3.2 Sistema que exige respuesta inmediata
- usar `SYNC`
- monitorear `TRANSMISSION_FAILED`

### 3.3 Operacion totalmente diferida
- usar `BATCH`
- no esperar respuesta final de SIFEN en la llamada de emision
- consultar luego estado o cola/lotes

## 4. Postman
Archivos incluidos:
- `postman/facturacion-electronica-mvp.postman_collection.json`
- `postman/facturacion-electronica-local.postman_environment.json`

La collection ya contempla `query_env` para consultas multiambiente.
