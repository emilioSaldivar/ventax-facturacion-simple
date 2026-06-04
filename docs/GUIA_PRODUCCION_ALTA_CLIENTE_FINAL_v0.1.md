# Guia Produccion Alta Cliente Final v0.1

## Objetivo

Runbook para desplegar el SaaS en produccion y habilitar desde servidor un cliente final cuando todavia no existe una pantalla completa de administracion.

Esta guia combina:

- SQL directo para crear tenant, suscripcion, facturador y contexto fiscal-operativo local;
- endpoints de backoffice ya disponibles para crear operadores y asignarles configuracion operativa;
- SQL de bootstrap solo para crear el primer usuario interno cuando aun no hay ningun usuario con acceso de soporte.

## Reglas

- No guardar passwords, `FE_API_KEY`, certificados, CSC ni datos fiscales sensibles en Git, docs, issues o logs.
- Confirmar primero que el `emisor_id`, timbrado, establecimiento, punto, numeracion y actividad existen y estan listos en `facturacion-electronica`.
- El SaaS no administra certificados, CSC, XML, firma ni numeracion final. Eso sigue viviendo en `facturacion-electronica`.
- En produccion usar `FE_GATEWAY_MODE=real` y `FE_API_ENV=prod`.
- Si FE resuelve numeracion automaticamente, mantener `FE_SERVICE_NUMBERING=true`.
- Cargar `FE_SEND_EMISSION_PROFILE_CODE` segun la ficha de FE. Si FE entrega `perfil_emision_asociado`, normalmente debe quedar `true`.
- Antes de tocar datos productivos ejecutar backup.

## Variables Del Servidor

En `.env.production` productivo:

```bash
COMPOSE_PROJECT_NAME=ventax-facturacion-simple-prod
NODE_ENV=production
FRONTEND_HTTP_PORT=8192
API_HTTP_PORT=8191
POSTGRES_HOST_PORT=5434

APP_ORIGIN=https://factura.ventax.app
BACKOFFICE_ORIGIN=https://factura.ventax.app
PUBLIC_APP_BASE_URL=https://factura.ventax.app

POSTGRES_DB=facturacion_simple
POSTGRES_USER=facturacion_simple
POSTGRES_PASSWORD=<password-postgres-production>
DATABASE_URL=postgres://facturacion_simple:<password-postgres-production-url-encoded>@ventax-facturacion-simple-prod-postgres-1:5432/facturacion_simple

JWT_ACCESS_SECRET=<secret-largo>
JWT_REFRESH_SECRET=<secret-largo>

FE_GATEWAY_MODE=real
FE_DOCKER_NETWORK=fe-prod_default
FE_API_BASE_URL=http://fe-prod-api-1:8080/fcws
FE_API_KEY=<secret>
FE_API_ENV=prod
FE_API_TIMEOUT_MS=20000
FE_SEND_EMISSION_PROFILE_CODE=<true-o-false-segun-ficha-fe>
FE_SERVICE_NUMBERING=true
FE_OUTBOX_WORKER_ENABLED=true
```

Si se prepara staging o se conserva la instancia actual como staging, ese ambiente debe usar FE test:

```bash
COMPOSE_PROJECT_NAME=ventax-facturacion-simple
FRONTEND_HTTP_PORT=8092
API_HTTP_PORT=8091
POSTGRES_HOST_PORT=5433
APP_ORIGIN=https://staging-factura.ventax.app
PUBLIC_APP_BASE_URL=https://staging-factura.ventax.app
FE_DOCKER_NETWORK=fe-test_default
FE_API_BASE_URL=http://fe-test-api-1:8080/fcws
FE_API_ENV=test
```

No usar el mismo `COMPOSE_PROJECT_NAME` para staging y produccion. La base actual no se copia a produccion; produccion nace con volumen nuevo por el nombre de proyecto `ventax-facturacion-simple-prod`.

## Despliegue Base

```bash
APP_ENV_FILE=.env.production bash scripts/deploy.sh
docker compose --env-file .env.production -f docker-compose.yml ps
APP_ENV_FILE=.env.production npm run ops:backup
```

Verificar salud publica:

```bash
curl -sS https://<dominio-operativo>/api/v1/health
```

## Datos Necesarios Por Cliente

Relevar antes de ejecutar SQL:

- `tenant_slug`: slug unico, por ejemplo `cliente-acme`.
- `tenant_nombre`: nombre comercial del cliente SaaS.
- `plan_codigo`: normalmente `BASICO_MVP`.
- `emisor_id`: identificador fiscal que espera `facturacion-electronica`.
- `razon_social` y `ruc` oficiales.
- `nombre_fantasia` opcional para UX.
- `establecimiento`: codigo de 3 digitos.
- `punto_expedicion`: codigo de 3 digitos.
- `actividad_economica_codigo` y descripcion.
- `perfil_emision_codigo`: codigo local, por ejemplo `SERV`.
- `timbrado`, `timbrado_inicio` y `documento_nro`.
- `credito_plazo_dias`, normalmente `30`.

`documento_nro` debe existir aunque `FE_SERVICE_NUMBERING=true`; readiness local lo exige como referencia operativa. Cuando `FE_SERVICE_NUMBERING=true`, facturas y NCE deben delegar la numeracion final a `facturacion-electronica` y no enviar ese valor como numero solicitado.

## Formato De Carga FE

Cuando `facturacion-electronica` entrega una ficha como `DATOS FE PARA INTEGRACION EXTERNA`, transformarla a esta estructura operativa antes de cargar:

```text
facturador:
  emisor_id:
  ruc_emisor:
  id_interno_fe:
  razon_social:
  nombre_fantasia:
  fe_service_numbering:
  fe_send_emission_profile_code:
  factura_electronica_normal_habilitada:
  nota_credito_electronica_habilitada:

establecimientos:
  - codigo:
    nombre_oficial:
    direccion:
    puntos_expedicion:
      - codigo:
        nombre:
        codigo_actividad_economica_sifen:
        descripcion_actividad_economica:
        perfil_emision_asociado:
        timbrado_vigente:
        fecha_inicio_timbrado:
        factura_electronica_normal:
        nota_credito_electronica:
        fe_maneja_numeracion_automatica:
        siguiente_numero_fe:
        serie_fiscal:

usuarios_operadores:
  - username:
    display_name:
    temporary_password: <no registrar en docs ni Git>
    establecimiento:
    punto_expedicion:
```

Mapeo hacia el SaaS:

- `emisor_id` FE -> `facturadores.emisor_id`.
- `ruc_emisor` -> `facturadores.ruc`.
- `razon_social` -> `facturadores.razon_social`.
- `nombre_fantasia` -> `facturadores.nombre_fantasia`.
- `nombre_oficial` del establecimiento -> `facturador_establecimientos.nombre`.
- `nombre` del punto -> `facturador_puntos_expedicion.nombre`.
- `codigo_actividad_economica_sifen` -> `facturador_actividades.codigo`.
- `descripcion_actividad_economica` -> `facturador_actividades.descripcion`.
- `perfil_emision_asociado` -> `facturador_perfiles_emision.codigo`.
- `timbrado_vigente` -> `actividad_punto_perfiles.timbrado`.
- `fecha_inicio_timbrado` -> `actividad_punto_perfiles.timbrado_inicio`.
- `siguiente_numero_fe` -> `actividad_punto_perfiles.documento_nro` como string de 7 digitos, solo para referencia local cuando FE maneja numeracion automatica.
- `username` del operador puede ser email, por ejemplo `emiliomatasc@fpuna.edu.py`.

Si la ficha trae varios puntos de expedicion, ejecutar la carga SQL una vez por punto con el mismo tenant/facturador/establecimiento y cambiando `punto_expedicion`, actividad, perfil y `documento_nro`. El bloque es idempotente para tenant, facturador y establecimiento.

## Ejemplo De Ficha FE Normalizada

Ejemplo basado en una ficha real de `fe-api`, sin API key ni password:

```text
facturador:
  emisor_id: 5057016-1
  ruc_emisor: 5057016-1
  id_interno_fe: 2
  razon_social: EMILIO MATIAS SALDIVAR CAPUTO
  nombre_fantasia: 1811 BRANDING Y SOFTWARE
  fe_service_numbering: true
  fe_send_emission_profile_code: true
  factura_electronica_normal_habilitada: true
  nota_credito_electronica_habilitada: false

establecimiento:
  codigo: 001
  nombre_oficial: CASA MATRIZ ITA
  direccion: BERNARDINO CABALLERO ENTRE NANAWA Y TENIENTE CANDIA NRO 112 - BARRIO CERRO CORA - ITA

punto_001:
  punto_expedicion: 001
  nombre: TALLERES DE CHAPERIA Y PINTURA
  actividad: 45203
  actividad_descripcion: TALLERES DE CHAPERIA Y PINTURA
  perfil_emision: AC445203-E001-P001-FE-PTO
  timbrado: 05057016
  timbrado_inicio: 2026-05-19
  documento_nro_local: 0000005
  nota_credito_electronica: false

punto_002:
  punto_expedicion: 002
  nombre: OTRAS ACTIVIDADES DE SERVICIOS PERSONALES N.C.P.
  actividad: 96099
  actividad_descripcion: OTRAS ACTIVIDADES DE SERVICIOS PERSONALES N.C.P.
  perfil_emision: AC496099-E001-P002-FE-PTO
  timbrado: 05057016
  timbrado_inicio: 2026-05-19
  documento_nro_local: 0000006
  nota_credito_electronica: false

operador:
  username: emiliomatasc@fpuna.edu.py
  display_name: Emilio Saldivar
  temporary_password: <entregar por canal seguro, no documentar>
  establecimiento: 001
  punto_expedicion: <001 o 002 segun el contexto operativo inicial>
```

Para esta ficha, el `.env` productivo debe usar:

```bash
FE_SERVICE_NUMBERING=true
FE_SEND_EMISSION_PROFILE_CODE=true
```

Como `nota_credito_electronica_habilitada=false`, no ejecutar `ONBOARDING_SMOKE_NCE=YES` para este facturador hasta que FE habilite NCE.

## Alta SQL De Tenant Y Facturador

Entrar a `psql` del contenedor:

```bash
docker compose -f docker-compose.yml exec postgres psql -U facturacion_simple -d facturacion_simple
```

Dentro de `psql`, definir variables y ejecutar el bloque. Reemplazar todos los valores antes de correrlo:

```sql
\set tenant_slug 'cliente-acme'
\set tenant_nombre 'Cliente ACME'
\set plan_codigo 'BASICO_MVP'
\set emisor_id '80136968-1'
\set razon_social 'CLIENTE ACME S.A.'
\set ruc '80136968-1'
\set nombre_fantasia 'ACME'
\set establecimiento '001'
\set establecimiento_nombre 'Casa matriz'
\set punto_expedicion '001'
\set punto_nombre 'Punto 001'
\set actividad_codigo '82110'
\set actividad_descripcion 'Servicios administrativos'
\set actividad_alias 'Servicios'
\set perfil_codigo 'SERV'
\set perfil_descripcion 'Servicios'
\set perfil_alias 'Servicios'
\set timbrado '80136968'
\set timbrado_inicio '2025-12-30'
\set documento_nro '0000000'
\set credito_plazo_dias 30

begin;

insert into planes (codigo, nombre, descripcion, max_usuarios, max_facturadores)
values (:'plan_codigo', 'Basico MVP', 'Plan inicial para facturacion simple mobile-first.', 3, 1)
on conflict (codigo) do update
set nombre = excluded.nombre,
    descripcion = excluded.descripcion,
    activo = true,
    updated_at = now();

with tenant_base as (
  insert into tenants (nombre, slug, estado, activo)
  values (:'tenant_nombre', :'tenant_slug', 'ACTIVO', true)
  on conflict (slug) do update
  set nombre = excluded.nombre,
      estado = 'ACTIVO',
      activo = true,
      deleted_at = null,
      updated_at = now()
  returning id
),
plan_base as (
  select id from planes where codigo = :'plan_codigo' and activo = true and deleted_at is null
),
suscripcion as (
  insert into tenant_suscripciones (tenant_id, plan_id, estado, activo)
  select tenant_base.id, plan_base.id, 'ACTIVA', true
  from tenant_base, plan_base
  on conflict (tenant_id)
  where activo = true and estado = 'ACTIVA' and deleted_at is null
  do update set plan_id = excluded.plan_id,
                fecha_fin = null,
                updated_at = now()
  returning tenant_id
),
facturador as (
  insert into facturadores (tenant_id, emisor_id, razon_social, ruc, nombre_fantasia, activo)
  select tenant_base.id, :'emisor_id', :'razon_social', :'ruc', :'nombre_fantasia', true
  from tenant_base
  on conflict (tenant_id, emisor_id)
  where deleted_at is null
  do update set razon_social = excluded.razon_social,
                ruc = excluded.ruc,
                nombre_fantasia = excluded.nombre_fantasia,
                activo = true,
                updated_at = now()
  returning id, tenant_id
),
establecimiento as (
  insert into facturador_establecimientos (tenant_id, facturador_id, codigo, nombre, activo)
  select tenant_id, id, :'establecimiento', :'establecimiento_nombre', true
  from facturador
  on conflict (facturador_id, codigo)
  where deleted_at is null
  do update set nombre = excluded.nombre,
                activo = true,
                updated_at = now()
  returning id, tenant_id, facturador_id
),
punto as (
  insert into facturador_puntos_expedicion (tenant_id, facturador_id, establecimiento_id, codigo, nombre, activo)
  select tenant_id, facturador_id, id, :'punto_expedicion', :'punto_nombre', true
  from establecimiento
  on conflict (establecimiento_id, codigo)
  where deleted_at is null
  do update set nombre = excluded.nombre,
                activo = true,
                updated_at = now()
  returning id, tenant_id, facturador_id, establecimiento_id
),
actividad as (
  insert into facturador_actividades (tenant_id, facturador_id, codigo, descripcion, alias_operativo, activo)
  select tenant_id, id, :'actividad_codigo', :'actividad_descripcion', :'actividad_alias', true
  from facturador
  on conflict (facturador_id, codigo)
  where deleted_at is null
  do update set descripcion = excluded.descripcion,
                alias_operativo = excluded.alias_operativo,
                activo = true,
                updated_at = now()
  returning id, tenant_id, facturador_id
),
perfil as (
  insert into facturador_perfiles_emision (tenant_id, facturador_id, codigo, descripcion, activo)
  select tenant_id, id, :'perfil_codigo', :'perfil_descripcion', true
  from facturador
  on conflict (facturador_id, codigo)
  where deleted_at is null
  do update set descripcion = excluded.descripcion,
                activo = true,
                updated_at = now()
  returning id, tenant_id, facturador_id
)
insert into actividad_punto_perfiles (
  tenant_id,
  facturador_id,
  actividad_id,
  establecimiento_id,
  punto_expedicion_id,
  perfil_emision_id,
  timbrado,
  timbrado_inicio,
  documento_nro,
  credito_plazo_dias,
  alias_operativo,
  activo
)
select
  actividad.tenant_id,
  actividad.facturador_id,
  actividad.id,
  punto.establecimiento_id,
  punto.id,
  perfil.id,
  :'timbrado',
  :'timbrado_inicio'::date,
  :'documento_nro',
  :credito_plazo_dias,
  :'perfil_alias',
  true
from actividad, punto, perfil
on conflict (actividad_id, establecimiento_id, punto_expedicion_id, perfil_emision_id)
where deleted_at is null
do update set timbrado = excluded.timbrado,
              timbrado_inicio = excluded.timbrado_inicio,
              documento_nro = excluded.documento_nro,
              credito_plazo_dias = excluded.credito_plazo_dias,
              alias_operativo = excluded.alias_operativo,
              activo = true,
              updated_at = now();

commit;
```

Verificar IDs resultantes:

```sql
select
  t.id as tenant_id,
  f.id as facturador_id,
  f.emisor_id,
  e.codigo as establecimiento,
  p.codigo as punto_expedicion,
  pe.codigo as perfil,
  a.codigo as actividad,
  app.timbrado,
  app.timbrado_inicio,
  app.documento_nro
from tenants t
join facturadores f on f.tenant_id = t.id
join actividad_punto_perfiles app on app.facturador_id = f.id
join facturador_establecimientos e on e.id = app.establecimiento_id
join facturador_puntos_expedicion p on p.id = app.punto_expedicion_id
join facturador_perfiles_emision pe on pe.id = app.perfil_emision_id
join facturador_actividades a on a.id = app.actividad_id
where t.slug = :'tenant_slug';
```

Guardar `tenant_id`, `facturador_id`, `emisor_id`, `establecimiento`, `punto_expedicion`, `perfil` y `actividad` para el endpoint de configuracion operativa.

## Bootstrap Del Primer Usuario Interno

Usar este paso solo si no existe un usuario `SOPORTE_INTERNO` o `ADMIN_INTERNO` para autenticar contra `/api/v1/backoffice/*`.

Generar hash Argon2 dentro del contenedor API sin escribir el password en archivos:

```bash
read -s TMP_PASSWORD
export TMP_PASSWORD
docker compose -f docker-compose.yml exec -T -e TMP_PASSWORD api node -e 'const argon2=require("argon2"); argon2.hash(process.env.TMP_PASSWORD).then(console.log)'
unset TMP_PASSWORD
```

En `psql`, insertar el admin interno dentro del tenant creado:

```sql
\set tenant_slug 'cliente-acme'
\set username 'soporte.cliente-acme'
\set display_name 'Soporte Cliente ACME'
\set password_hash '<hash-argon2-generado>'

with tenant_base as (
  select id from tenants where slug = :'tenant_slug' and activo = true and deleted_at is null
),
usuario_base as (
  insert into usuarios (tenant_id, username, display_name, password_hash, activo)
  select id, :'username', :'display_name', :'password_hash', true
  from tenant_base
  on conflict (username)
  where deleted_at is null
  do update set password_hash = excluded.password_hash,
                display_name = excluded.display_name,
                failed_login_count = 0,
                bloqueado_at = null,
                activo = true,
                updated_at = now()
  returning id
)
insert into usuario_roles (usuario_id, role_id)
select usuario_base.id, roles.id
from usuario_base
join roles on roles.codigo = 'ADMIN_INTERNO'
on conflict (usuario_id, role_id) do nothing;
```

Despues de autenticar, crear operadores por endpoint y evitar seguir creando usuarios por SQL.

## Login Backoffice

```bash
ACCESS_TOKEN="$(
  curl -sS -X POST "https://<dominio-operativo>/api/v1/auth/login" \
    -H "content-type: application/json" \
    -d '{"username":"soporte.cliente-acme","password":"<password>"}' \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>console.log(JSON.parse(d).access_token || JSON.parse(d).accessToken || ""))'
)"
```

Si el parser no devuelve token, revisar manualmente la forma de la respuesta de login y exportar el token:

```bash
export ACCESS_TOKEN=<token>
```

## Crear Operador Por Endpoint

```bash
curl -sS -X POST "https://<dominio-operativo>/api/v1/backoffice/users" \
  -H "authorization: Bearer $ACCESS_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "username": "emiliomatasc@fpuna.edu.py",
    "display_name": "Emilio Saldivar",
    "role": "OPERADOR_FACTURACION"
  }'
```

La respuesta incluye `temporary_password` una sola vez. Entregar por canal seguro y no pegarla en tickets ni historiales.

Si el cliente exige una contraseña temporal definida por soporte, agregar `temporary_password` al JSON solo al ejecutar el comando en servidor. No registrar ese valor en la guia, Git, logs ni tickets.

## Asignar Configuracion Operativa Del Operador

Usar los valores verificados en el SQL de alta:

```bash
curl -sS -X PUT "https://<dominio-operativo>/api/v1/backoffice/users/<userId>/operation-config" \
  -H "authorization: Bearer $ACCESS_TOKEN" \
  -H "content-type: application/json" \
  -d '{
    "tenant_id": "<tenant_id>",
    "facturador_id": "<facturador_id>",
    "emisor_id": "<emisor_id>",
    "establecimiento": "001",
    "punto_expedicion": "001",
    "perfil_emision_codigo": "AC445203-E001-P001-FE-PTO",
    "actividad_economica_codigo": "45203"
  }'
```

La API desactiva configuraciones operativas anteriores del usuario y deja una sola activa.

Para asociar el mismo usuario al punto `002` del ejemplo, cambiar `punto_expedicion` a `002`, `perfil_emision_codigo` a `AC496099-E001-P002-FE-PTO` y `actividad_economica_codigo` a `96099`. En el MVP un operador mantiene una sola configuracion operativa activa.

## Verificacion Operativa

Login del operador:

```bash
OPERADOR_TOKEN="$(
  curl -sS -X POST "https://<dominio-operativo>/api/v1/auth/login" \
    -H "content-type: application/json" \
    -d '{"username":"emiliomatasc@fpuna.edu.py","password":"<password-temporal>"}' \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>console.log(JSON.parse(d).access_token || JSON.parse(d).accessToken || ""))'
)"
```

Readiness:

```bash
curl -sS "https://<dominio-operativo>/api/v1/me/readiness" \
  -H "authorization: Bearer $OPERADOR_TOKEN"
```

Debe devolver `ready: true`. Si no esta listo, revisar:

- tenant activo;
- suscripcion activa;
- usuario con configuracion operativa;
- facturador activo;
- contexto fiscal local completo;
- `timbrado`, `timbrado_inicio`, `documento_nro` y `credito_plazo_dias` no nulos.

Contexto:

```bash
curl -sS "https://<dominio-operativo>/api/v1/me/context" \
  -H "authorization: Bearer $OPERADOR_TOKEN"
```

Confirmar que devuelve el facturador correcto, `emisor_id`, RUC, establecimiento, punto, perfil, actividad y titulo operativo esperado.

## Smoke De Alta

Ejecutar contra contenedores productivos despues de `bash scripts/deploy.sh`:

```bash
SMOKE_API_BASE_URL=https://<dominio-operativo>/api/v1 \
SMOKE_USERNAME=emiliomatasc@fpuna.edu.py \
SMOKE_PASSWORD=<password-operador> \
ONBOARDING_SMOKE_CLIENTE_TIPO=CI \
ONBOARDING_SMOKE_CLIENTE_DOCUMENTO=492019 \
ONBOARDING_SMOKE_CLIENTE_RAZON_SOCIAL="Roberto Saldivar" \
ONBOARDING_SMOKE_ITEM_DESCRIPCION="Servicio de prueba onboarding" \
ONBOARDING_SMOKE_ITEM_PRECIO_UNITARIO=100000 \
ONBOARDING_SMOKE_ITEM_IVA_TIPO=IVA_10 \
ONBOARDING_SMOKE_CONDICION_VENTA=CONTADO \
npm run ops:onboarding-smoke
```

Para validar NCE total:

```bash
ONBOARDING_SMOKE_NCE=YES npm run ops:onboarding-smoke
```

Registrar fuera de Git:

- usuario operativo validado;
- numero fiscal, CDC y estado de la factura smoke;
- disponibilidad de link publico, KUDE/PDF y XML;
- CDC y estado de NCE si se ejecuto;
- error exacto si SIFEN o FE rechaza.

## Reset De Password O Desbloqueo

```bash
curl -sS -X POST "https://<dominio-operativo>/api/v1/backoffice/users/<userId>/reset-password" \
  -H "authorization: Bearer $ACCESS_TOKEN" \
  -H "content-type: application/json" \
  -d '{}'
```

La respuesta incluye `temporary_password` una sola vez, desbloquea el usuario, reinicia intentos fallidos y revoca refresh tokens.

## Diagnostico Rapido

Usuario no puede emitir:

```sql
select * from usuarios where username = 'operador.cliente-acme';
select * from usuario_operacion_config where usuario_id = '<user_id>' and deleted_at is null;
```

Facturador no aparece en contexto:

```sql
select f.*, app.timbrado, app.timbrado_inicio, app.documento_nro, app.credito_plazo_dias
from facturadores f
left join actividad_punto_perfiles app on app.facturador_id = f.id and app.deleted_at is null
where f.id = '<facturador_id>';
```

FE rechaza emision:

- revisar `FE_GATEWAY_MODE=real`;
- revisar `FE_API_BASE_URL`, `FE_API_KEY`, `FE_API_ENV=prod`;
- confirmar que `emisor_id` existe en FE produccion;
- confirmar timbrado, establecimiento, punto, actividad y modo de numeracion en FE;
- revisar logs del contenedor API sin exponer payloads con secretos:

```bash
docker compose -f docker-compose.yml logs --tail=200 api
```

## Cierre Del Alta

Un alta queda cerrada cuando:

- backup previo existe;
- deploy productivo esta saludable;
- tenant y suscripcion estan activos;
- facturador y contexto fiscal local estan completos;
- operador tiene configuracion operativa activa;
- `/me/readiness` responde listo;
- smoke operativo emite y entrega artefactos;
- no se versionaron passwords, API keys ni datos sensibles.
