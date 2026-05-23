# PLAN Implementacion MVP v0.1 - Facturacion Simple Cliente

Este documento traduce el alcance de `docs/SPEC_PRODUCTO_MVP_v0.1.md`, el plan de producto `docs/PLAN_PRODUCTO_MVP_v0.1.md` y el contrato `spec/openapi.yaml` a un plan tecnico implementable.

## 1. Objetivo De Implementacion

Construir un MVP operable y costeable para al menos 1000 clientes, con foco en:

- app principal de facturacion mobile-first;
- backend SaaS Node/Express;
- PostgreSQL;
- integracion con `facturacion-electronica` Ventax;
- despliegue inicial por Docker Compose en un VPS;
- operacion basica segura: backups, healthchecks, logs, migraciones y sesiones revocables.

## 2. Decisiones Cerradas

### 2.1 Repo

Estructura elegida: monorepo simple y escalable.

```text
apps/
  api/
  web-operacion/
  backoffice/
packages/
  shared/
db/
  migrations/
  seeds/
infra/
  docker/
  nginx-or-caddy/
docs/
spec/
```

Motivo:

- separa app operativa y backoffice para evitar que cambios internos interrumpan la app principal;
- permite compartir tipos, validadores y utilidades;
- mantiene bajo costo operativo;
- puede crecer a servicios separados si el volumen lo exige.

### 2.2 Frontend

- React.
- Vite.
- TypeScript.
- PWA desde el inicio para `web-operacion`.
- Dos apps separadas:
  - `apps/web-operacion`: app critica para operadores;
  - `apps/backoffice`: app interna de baja frecuencia.
- CSS propio y tokens de diseno Ventax mantenidos en la app, evitando dependencia de Tailwind salvo que aporte valor claro.
- Los logos visibles e iconos PWA deben derivarse de los assets oficiales en `ventax_logos/`.
- No se debe mantener un logo generado/recreado manualmente si existe variante oficial suficiente en `ventax_logos/`.
- Usar logo completo para login/encabezados cuando haya espacio y usar `VENTAX-ISO-*` solo para favicon, PWA, avatar compacto o espacios reducidos.
- La app operativa prioriza celular y tablet; desktop debe ser usable, no necesariamente optimizado primero.

### 2.3 Backend

- Node.js.
- Express.
- TypeScript.
- Zod para validacion.
- Vitest para pruebas.
- Pino para logs por rendimiento y simplicidad.
- SQL directo para persistencia.
- Migraciones SQL propias con tabla `schema_migrations`.

### 2.4 Base De Datos

- PostgreSQL.
- Primary keys UUID.
- Soft delete mediante `activo` o `deleted_at` segun entidad.
- Links publicos con token opaco separado del ID interno.
- Campos transversales:
  - `id uuid primary key`;
  - `tenant_id uuid` donde aplique;
  - `facturador_id uuid` donde aplique;
  - `created_at timestamptz`;
  - `updated_at timestamptz`;
  - `created_by uuid` cuando aplique.

### 2.5 Auth

- Access token JWT de 15 minutos.
- Refresh token de 30 dias en cookie `httpOnly`, `secure`, `sameSite=lax`.
- Refresh token persistido server-side para revocacion.
- Password hashing con `argon2id`.
- Bloqueo simple por 5 intentos fallidos.
- Desbloqueo desde backoffice interno.
- Backoffice debe poder generar password temporal o permitir definir nueva password.

### 2.6 FiscalGateway

Configuracion por variables de entorno. No se versionan secretos.

Variables requeridas:

```env
FE_API_BASE_URL=https://fe-api.ventax.app/fcws
FE_API_KEY=<secret>
FE_API_TIMEOUT_MS=20000
FE_API_ENV=test
FE_GATEWAY_MODE=mock
FE_OUTBOX_WORKER_ENABLED=true
FE_OUTBOX_WORKER_INTERVAL_MS=5000
PUBLIC_APP_BASE_URL=https://factura.ventax.app
JWT_ACCESS_TTL_MINUTES=15
JWT_REFRESH_TTL_DAYS=30
```

Notas:

- `FE_API_KEY` debe guardarse solo en `.env`/secret manager del entorno.
- El valor compartido durante definicion del proyecto debe considerarse sensible.
- Los datos de facturador, emisor, establecimiento, punto, timbrado, numerador y plazo de credito no viven en `.env`; se resuelven desde la configuracion fiscal-operativa en base de datos.
- El healthcheck fiscal de referencia es `https://fe-api.ventax.app/fcws/health`.
- El modo operativo por defecto para facturadores es asincrono/recuperable desde el SaaS y por lote hacia SIFEN: el outbox/worker llama a `facturacion-electronica` con `envio.mode=BATCH`, `external_ref` idempotente y consulta posterior por estado/lote.
- El modo `SYNC` queda limitado a fixture/mock, smoke opt-in o excepcion tecnica controlada; no debe ser el default de facturadores productivos.
- Si una emision entra en timeout o queda sin confirmacion final, el documento operativo queda en `PENDIENTE_SIFEN` y se permite refrescar estado desde el listado/detalle.
- Los errores recuperables deben exponer acciones de gestion al cliente final: reintentar envio seguro, refrescar estado, corregir datos antes de una nueva emision cuando no exista documento fiscal confirmado, y ver feedback claro de causa probable sin exponer trazas fiscales internas.

### 2.7 Reglas Fiscales Del MVP

- Precios unitarios enteros en PYG.
- Cantidad entera positiva.
- Precio unitario incluye IVA.
- IVA permitido:
  - `IVA_10`;
  - `IVA_5`;
  - `EXENTA`.
- Redondeo `half up` al entero mas cercano.
- Base imponible e IVA se calculan y redondean por linea.
- Liquidacion agrupada por tasa suma lineas ya redondeadas.
- No se recalcula IVA/base desde el total agrupado.
- NCE inicial: total sobre factura elegible.
- Cancelacion/anulacion: solo documentos aprobados/elegibles segun estado y ventana del backend fiscal.

### 2.8 Entrega Publica

- Dominio base: `https://factura.ventax.app`.
- Formato recomendado: `/public/d/{token}`.
- Token: 32 bytes aleatorios `base64url`.
- Sin expiracion obligatoria en MVP.
- Revocacion con `revoked_at`.
- No usar CDC puro ni ID secuencial como URL publica.
- La pagina publica solo permite ver/descargar KUDE/PDF y XML.
- La disponibilidad de KUDE/PDF y XML depende de que exista CDC y artefacto local en `facturacion-electronica`, no del estado `EMITIDA`; documentos `PENDIENTE_SIFEN` o `RECHAZADA` con CDC deben conservar link publico y acciones de artefactos.

### 2.9 Email

- El SaaS envia el correo del receptor en el payload fiscal cuando exista.
- El envio efectivo lo realiza `facturacion-electronica` Ventax.
- No se implementa proveedor de email propio en MVP.
- No se implementa reenvio de email en MVP.
- El SaaS puede mostrar estado informativo `DELEGATED`, `SENT`, `FAILED`, `UNKNOWN` si el backend fiscal lo expone.

### 2.10 Deploy Inicial

- Docker Compose en VPS.
- Un solo servidor con:
  - API Express;
  - PostgreSQL;
  - frontend operacion estatico;
  - frontend backoffice estatico;
  - Nginx o Caddy como reverse proxy.
- Backups diarios PostgreSQL.
- Retencion:
  - diaria corta: 7 dias;
  - retencion extendida: 30 dias.
- Healthchecks obligatorios.
- Logs rotados.
- Migraciones versionadas.

## 3. Arquitectura De Runtime

```text
Internet
  -> Nginx/Caddy
      -> /api/v1/*        -> apps/api
      -> /app/*           -> apps/web-operacion static
      -> /backoffice/*    -> apps/backoffice static
      -> /public/d/*      -> apps/api public delivery endpoints

apps/api
  -> PostgreSQL
  -> facturacion-electronica Ventax
```

Rutas publicas sugeridas:

- `https://factura.ventax.app/app`
- `https://factura.ventax.app/backoffice`
- `https://factura.ventax.app/api/v1`
- `https://factura.ventax.app/public/d/{token}`

## 4. Estructura De Carpetas

```text
apps/api/
  src/
    app.ts
    server.ts
    config/
    db/
    http/
    modules/
      auth/
      context/
      clientes/
      catalogo/
      facturas/
      notas-credito/
      entrega/
      backoffice/
      fiscal-gateway/
      audit/
    shared/
      errors/
      logging/
      validation/
  tests/
  package.json
  tsconfig.json

apps/web-operacion/
  src/
    app/
    routes/
    components/
    features/
      auth/
      facturacion/
      clientes/
      catalogo/
      documentos/
      entrega/
    styles/
  public/
  package.json
  vite.config.ts

apps/backoffice/
  src/
    app/
    routes/
    features/
      users/
      operation-config/
      readiness/
  package.json
  vite.config.ts

packages/shared/
  src/
    schemas/
    types/
    money/
    constants/

db/
  migrations/
  seeds/

infra/
  docker/
  nginx-or-caddy/
  scripts/
```

## 5. Modulos Backend

### 5.1 Auth

Responsabilidades:

- login;
- refresh;
- logout;
- hashing `argon2id`;
- tracking de intentos fallidos;
- bloqueo luego de 5 intentos;
- revocacion de refresh tokens;
- middleware de autenticacion.

Estados de usuario:

- `ACTIVE`;
- `BLOCKED`;
- `INACTIVE`.

### 5.2 Context

Responsabilidades:

- resolver usuario autenticado;
- cargar tenant;
- cargar facturador unico;
- cargar establecimiento, punto, perfil y actividad;
- exponer readiness operativo;
- agregar readiness fiscal desde backend SaaS, no desde la UI, usando `FiscalGateway`, timeout corto, cache/circuit-breaker simple y degradacion clara.

Regla:

- si el usuario no tiene configuracion operativa completa, no puede emitir.
- si el backend fiscal no esta disponible, se bloquea la emision inmediata o se informa modo pendiente segun la estrategia asincrona vigente; la decision queda centralizada en backend para resiliencia y auditoria.

### 5.3 Clientes

Responsabilidades:

- busqueda por documento/nombre;
- base compartida `cliente_identidades`;
- agenda del facturador `facturador_clientes`;
- popup de carga rapida desde factura.

Reglas:

- no existe cliente ocasional sin persistir;
- cliente usado queda en agenda del facturador;
- la base compartida no expone datos privados de relacion comercial.

### 5.4 Catalogo

Responsabilidades:

- CRUD de productos/servicios por facturador;
- busqueda desde campo codigo;
- codigo autogenerado si no se informa;
- item rapido desde factura con IVA 10%.

Reglas:

- items de catalogo no se editan en factura;
- items 5% o exentos deben venir precargados desde catalogo.

### 5.5 Facturas

Responsabilidades:

- preview sin persistir borrador;
- calculo de totales;
- emision contado;
- emision credito;
- persistencia de snapshot;
- listado y detalle;
- refresh de estado;
- cancelacion/anulacion elegible.

Estados UI:

- `EMITIENDO`;
- `EMITIDA`;
- `PENDIENTE_SIFEN`;
- `RECHAZADA`;
- `ERROR_OPERATIVO`;
- `ERROR_TEMPORAL`;
- `ANULADA`.

### 5.6 Notas De Credito

Responsabilidades:

- iniciar NCE desde factura elegible desde una pantalla operativa propia;
- NCE total en MVP;
- emitir via FiscalGateway;
- persistir snapshot;
- exponer en listado/detalle;
- exponer datos suficientes para que la UI filtre y seleccione facturas elegibles.

### 5.7 Entrega

Responsabilidades:

- generar token publico;
- regenerar/revocar token;
- construir URL publica;
- exponer pagina publica limitada;
- resolver KUDE/PDF y XML desde backend fiscal por CDC sin filtrar por aprobacion SIFEN;
- generar URL WhatsApp.

### 5.8 FiscalGateway

Responsabilidades:

- encapsular API Ventax FE;
- healthcheck;
- emitir FE contado/credito;
- emitir NCE;
- consultar estado;
- descargar XML;
- descargar KUDE/PDF;
- cancelar/anular;
- traducir errores fiscales a errores operativos.

Timeout:

- `FE_API_TIMEOUT_MS=20000`.

Default:

- `envio.mode=BATCH` para facturas y notas de credito operativas.
- La ruta resiliente es outbox/worker asincrono: el API persiste intento, devuelve estado operativo, un worker envia a FE con `external_ref` idempotente y `envio.mode=BATCH`, guarda `delivery_mode`/datos de lote si FE los retorna, y la UI permite seguimiento/reintento controlado.
- `envio.mode=SYNC` no debe habilitarse como comportamiento por defecto de facturadores. Si se conserva para pruebas, debe quedar opt-in, auditable y aislado de produccion.

### 5.9 Audit

Responsabilidades:

- registrar eventos sensibles;
- registrar emision, cancelacion, NCE, login fallido, bloqueo, desbloqueo, regeneracion de link publico.

## 6. Modelo De Datos Propuesto

### 6.1 Tablas Base

- `schema_migrations`
- `tenants`
- `planes`
- `suscripciones`
- `usuarios`
- `roles`
- `usuario_roles`
- `sesiones`
- `refresh_tokens`
- `login_attempts`
- `facturadores`
- `facturador_config_fe`
- `usuario_operacion_config`

### 6.2 Clientes Y Catalogo

- `cliente_identidades`
- `facturador_clientes`
- `catalogo_items`

### 6.3 Documentos

- `facturas_operativas`
- `factura_items_snapshot`
- `notas_credito_operativas`
- `documento_entrega_links`
- `documento_estado_historial`
- `audit_events`

### 6.4 Convenciones SQL

- UUID generado por aplicacion o por PostgreSQL con `gen_random_uuid()`.
- `created_at timestamptz not null default now()`.
- `updated_at timestamptz not null default now()`.
- `activo boolean not null default true` para entidades editables.
- `deleted_at timestamptz null` cuando se necesite auditar baja.
- Indices por:
  - `tenant_id`;
  - `facturador_id`;
  - `documento`;
  - `cdc`;
  - `external_ref`;
  - `public_token_hash`;
  - `created_at`.

## 7. Calculo De Totales

Entrada por linea:

- `cantidad` entero positivo;
- `precio_unitario` entero PYG con IVA incluido;
- `iva_tipo`.

Por linea:

```text
subtotal = cantidad * precio_unitario

IVA_10:
  base = round_half_up(subtotal / 1.10)
  iva = subtotal - base

IVA_5:
  base = round_half_up(subtotal / 1.05)
  iva = subtotal - base

EXENTA:
  base = subtotal
  iva = 0
```

Totales:

```text
total = sum(linea.subtotal)
total_sin_iva = sum(linea.base)
iva_5 = sum(linea.iva where iva_tipo = IVA_5)
iva_10 = sum(linea.iva where iva_tipo = IVA_10)
total_iva = iva_5 + iva_10
```

No se recalcula desde agrupados.

## 8. Integracion Con Ventax FE

### 8.1 Endpoints Fiscales

- Healthcheck: `GET /health`.
- FE: `POST /factura`.
- NCE: `POST /nota-credito`.
- XML: `GET /files/xml/{cdc}`.
- KUDE/PDF: `GET /files/kude/{cdc}.pdf`.
- Estado: consultar por CDC segun OpenAPI fiscal.
- Cancelacion: endpoint de evento/cancelacion segun OpenAPI fiscal.

### 8.2 Payload Fiscal

El SaaS construye el payload desde:

- contexto operativo del usuario;
- cliente;
- items;
- totales;
- condicion `CONTADO` o `CREDITO`;
- `external_ref`;
- email del receptor si existe.

El SaaS no envia XML ni manipula SIFEN.

### 8.3 Manejo De Timeout

Si la llamada fiscal de emision excede `FE_API_TIMEOUT_MS`:

- guardar factura operativa como `PENDIENTE_SIFEN`;
- guardar intento en auditoria;
- permitir `refresh-status` desde listado/detalle;
- no duplicar emision si se reintenta con la misma idempotencia.

### 8.4 Emision Resiliente Y Asincrona

Objetivo:

- reducir intervencion de soporte interno;
- evitar duplicados fiscales;
- permitir recuperacion operativa desde UI;
- mantener feedback claro para el cliente final.

Diseno objetivo:

- `POST /facturas` valida datos, calcula preview backend y persiste documento operativo `EMITIENDO` con `external_ref` idempotente;
- la llamada a `facturacion-electronica` se ejecuta por outbox/worker parametrizable por `FE_OUTBOX_WORKER_ENABLED` y `FE_OUTBOX_WORKER_INTERVAL_MS`, usando `envio.mode=BATCH` por defecto para facturadores;
- cada intento fiscal registra evento auditable, estado normalizado y causa operativa resumida;
- cuando FE retorne informacion `batch`, se persisten `batch_id`, `dProtConsLote`, codigo/mensaje de recepcion, codigo/mensaje de consulta y estado resumido para diagnostico y soporte;
- reintentos usan el mismo `external_ref` cuando se intenta recuperar un documento pendiente, nunca crean numeracion nueva sin decision explicita;
- si el error es de datos operativos antes de confirmar documento fiscal, la UI debe permitir corregir y emitir nuevamente con feedback claro;
- si existe CDC/documento fiscal confirmado, las acciones permitidas son refrescar estado, entregar artefactos, cancelacion/anulacion elegible o NCE, no editar la factura original.

## 9. Frontend Operacion

### 9.1 Pantallas

- Login.
- Nueva factura.
- Nueva nota de credito.
- Informacion y estado.
- Editor de factura.
- Resultado de emision.
- Listado de documentos.
- Detalle de documento.
- Clientes.
- Productos/servicios.
- Vista publica de comprobante.

### 9.2 Editor Mobile-First

Prioridad:

1. cliente;
2. condicion contado/credito;
3. lineas;
4. totales;
5. emitir.

Reglas:

- no selector de facturador;
- no campos fiscales editables;
- botones tactiles grandes;
- no depender de tablas anchas en celular;
- usar filas compactas para lineas agregadas y formulario compacto solo para alta/edicion;
- mostrar totales siempre cerca del boton emitir.

### 9.3 Nueva Nota De Credito

Prioridad:

1. buscar factura origen;
2. confirmar elegibilidad;
3. cargar motivo;
4. emitir NCE total;
5. entregar comprobante.

Reglas:

- pantalla separada de `Nueva factura`;
- no reutilizar el editor completo de factura;
- listar o buscar solo facturas candidatas del facturador autenticado;
- bloquear origenes no elegibles con mensaje claro;
- usar el mismo resultado/entrega que factura emitida.

### 9.4 Documentos

El listado debe soportar filtros combinables:

- todos;
- facturas contado;
- facturas credito;
- notas de credito.

Si el backend actual no expone filtro por condicion de venta, se debe extender `GET /facturas` o el contrato equivalente antes de cerrar la UI.

### 9.5 PWA

Requisitos:

- manifest;
- iconos derivados desde los SVG oficiales de `ventax_logos/`;
- theme color Ventax;
- cache de assets estaticos;
- no prometer emision offline;
- si no hay conexion, bloquear emision con mensaje claro.

### 9.6 Wireframe Del Editor

Antes de implementar `UI-005`, se debe cerrar un micro-wireframe tecnico en documentacion:

- orden mobile de bandas: encabezado fiscal, comprobante/condicion, cliente, lineas, totales, acciones;
- comportamiento de lineas como filas compactas en celular, con formulario de detalle solo para alta/edicion;
- ubicacion del boton `Emitir` siempre cerca de totales;
- estados de error y feedback de correccion antes de emision;
- puntos donde entran busqueda de cliente, popup de alta rapida y busqueda de catalogo.

## 10. Backoffice

### 10.1 Alcance MVP

Endpoints minimos:

- crear usuario;
- desbloquear usuario;
- regenerar password temporal o definir nueva password;
- asignar configuracion operativa unica;
- ver readiness.

UI backoffice puede implementarse despues del servicio principal.

Operacion inicial por SQL/seed es aceptable para soporte interno.

## 11. Seguridad

### 11.1 Sesiones

- access JWT 15 minutos;
- refresh cookie 30 dias;
- refresh token rotado o revocable;
- logout revoca refresh token;
- bloqueo por 5 fallos.

### 11.2 Secretos

- no versionar `.env`;
- no loguear `FE_API_KEY`;
- no exponer errores fiscales crudos al operador;
- sanitizar logs de headers.

### 11.3 Links Publicos

- token aleatorio 32 bytes base64url;
- guardar hash del token si se desea evitar persistir token plano;
- `revoked_at` para invalidacion;
- sin datos internos en respuesta publica.

## 12. Observabilidad Y Operacion

### 12.1 Logs

- Pino en JSON.
- Request ID por request.
- Nivel configurable por `LOG_LEVEL`.
- Logs rotados en VPS.

### 12.2 Healthchecks

Endpoints:

- `/api/v1/health`: API viva.
- `/api/v1/health/db`: conectividad PostgreSQL.
- `/api/v1/health/fiscal`: conectividad Ventax FE.

### 12.3 Backups

- backup PostgreSQL diario.
- retencion 7 dias diarios recientes.
- retencion extendida 30 dias.
- prueba de restore documentada antes de produccion.

### 12.4 Migraciones

- SQL versionado en `db/migrations`.
- tabla `schema_migrations`.
- migraciones idempotentes donde sea razonable.
- no editar migraciones ya aplicadas en produccion.

## 13. Infraestructura Docker Compose

Servicios:

- `api`;
- `postgres`;
- `nginx` o `caddy`;
- `backup` o script cron del host;
- opcional `migrate` one-shot.

Volumenes:

- datos PostgreSQL;
- backups;
- logs.

Red:

- red interna Docker para `api` y `postgres`;
- solo reverse proxy expuesto.

### 13.1 Scripts Operativos

Comandos preparados:

```bash
bash scripts/deploy.sh
bash scripts/backup.sh
bash scripts/restore-backup.sh
bash scripts/verify-restore.sh
node scripts/fiscal-smoke.cjs
```

Reglas:

- `scripts/deploy.sh` construye y levanta el stack definido en `docker-compose.yml`.
- El puerto HTTP del frontend puede cambiarse con `FRONTEND_HTTP_PORT`; si cambia, tambien deben ajustarse `APP_ORIGIN` y `BACKOFFICE_ORIGIN`.
- `scripts/backup.sh` genera un backup PostgreSQL en `backups/postgres/` usando `pg_dump` desde el contenedor `postgres`.
- `scripts/backup.sh` aplica retencion configurable: backups recientes completos por 7 dias y retencion extendida de 30 dias, conservando como minimo el ultimo backup por dia fuera de la ventana reciente.
- `scripts/install-backup-cron.sh` instala una entrada cron diaria en el host, configurable por `BACKUP_CRON_HOUR`, `BACKUP_CRON_MINUTE` y `BACKUP_CRON_LOG`.
- `scripts/restore-backup.sh` restaura por defecto el backup mas reciente de `backups/postgres/`; tambien acepta una ruta explicita como primer argumento.
- El restore es destructivo y requiere confirmacion explicita con `RESTORE_CONFIRM=YES` o `--yes`.
- `scripts/verify-restore.sh` prueba un dump en una base temporal no destructiva y valida que `schema_migrations` pueda leerse.
- `scripts/fiscal-smoke.cjs` ejecuta health y, opcionalmente, emision contra FE test usando `FE_SMOKE_RUN=YES`, `FE_API_KEY` y un fixture local no versionado.
- Los backups locales no se versionan.
- `docker-compose.yml` limita logs con `DOCKER_LOG_MAX_SIZE` y `DOCKER_LOG_MAX_FILE` para evitar crecimiento sin control en VPS.

## 14. Variables De Entorno

Minimas:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://...
PUBLIC_APP_BASE_URL=https://factura.ventax.app

JWT_ACCESS_SECRET=<secret>
JWT_REFRESH_SECRET=<secret>
JWT_ACCESS_TTL_MINUTES=15
JWT_REFRESH_TTL_DAYS=30

COOKIE_DOMAIN=factura.ventax.app
COOKIE_SECURE=true

FE_API_BASE_URL=https://fe-api.ventax.app/fcws
FE_API_KEY=<secret>
FE_API_TIMEOUT_MS=20000
FE_API_ENV=test
FE_GATEWAY_MODE=mock
FE_OUTBOX_WORKER_ENABLED=true
FE_OUTBOX_WORKER_INTERVAL_MS=5000

LOG_LEVEL=info

DOCKER_LOG_MAX_SIZE=10m
DOCKER_LOG_MAX_FILE=5
BACKUP_CRON_HOUR=2
BACKUP_CRON_MINUTE=15
BACKUP_KEEP_RECENT_DAYS=7
BACKUP_KEEP_EXTENDED_DAYS=30
```

Configuracion fiscal-operativa de seed/test:

Los datos de emisor, timbrado, inicio de timbrado, establecimiento, punto, numerador y plazo de credito se cargan por migraciones/seeds/backoffice en las tablas operativas, no como variables globales.

El seed de referencia `db/seeds/002_operational_context_example.sql` muestra una carga local de ejemplo sin secretos.

## 15. Orden De Implementacion

### Fase 0 - Scaffolding

- crear estructura monorepo;
- configurar TypeScript;
- configurar lint/test/build;
- crear Docker Compose base;
- crear `.env.example` sin secretos.

### Fase 1 - DB Y Auth

- migraciones base;
- usuarios/sesiones/refresh;
- argon2id;
- bloqueo por intentos;
- endpoints auth.

### Fase 2 - Contexto Operativo

- facturadores;
- config FE;
- usuario_operacion_config;
- readiness local/fiscal;
- endpoints `/me/context` y `/me/readiness`.

### Fase 3 - Clientes Y Catalogo

- cliente_identidades;
- facturador_clientes;
- busqueda predictiva;
- catalogo_items;
- busqueda por codigo/nombre/descripcion;
- item rapido IVA 10%.

### Fase 4 - Facturacion Core

- calculo de totales;
- preview;
- snapshots;
- factura contado/credito contra mock FiscalGateway;
- tests unitarios de IVA/redondeo.

### Fase 5 - Integracion Fiscal Real

- FiscalGateway real;
- FE contado/credito;
- timeout a `PENDIENTE_SIFEN`;
- refresh estado;
- KUDE/XML.
- readiness fiscal centralizado en `/me/readiness`;
- outbox/worker de emision asincrona;
- reintentos controlados y feedback recuperable.

### Fase 6 - Entrega Y Publico

- links publicos;
- WhatsApp URL;
- vista publica;
- artifact proxy/redirect;
- email status delegado.

### Fase 7 - Documentos Avanzados

- listado y detalle;
- filtros por contado, credito y nota de credito;
- cancelacion/anulacion elegible;
- NCE total;
- pantalla `Nueva nota de credito`;
- soporte ante rechazo.

### Fase 8 - Frontend Operacion

- login;
- pantallas separadas para nueva factura, nueva nota de credito, informacion/estado, catalogo y documentos;
- readiness operativo/fiscal visible en informacion/estado;
- micro-wireframe del editor antes de implementarlo;
- editor mobile-first;
- clientes;
- catalogo;
- resultado;
- listado/detalle con filtros;
- nueva nota de credito;
- pruebas visuales.

### Fase 9 - Backoffice Minimo

- endpoints crear usuario;
- desbloquear;
- reset password;
- asignar configuracion operativa;
- UI backoffice si entra en el corte.

### Fase 10 - Operacion Produccion

- backups;
- restore test;
- healthchecks;
- logs rotados;
- deploy script;
- smoke test.

## 16. Estrategia De Testing

### Unitarios

- Zod schemas;
- money/IVA/redondeo;
- auth helpers;
- token publico;
- mapper FiscalGateway.

### Integracion API

- login/refresh/logout;
- bloqueo por intentos;
- contexto operativo;
- clientes;
- catalogo;
- preview;
- emision mock;
- listado;
- entrega publica.

### Integracion Fiscal

- health fiscal;
- emision FE test;
- NCE test;
- KUDE/XML por CDC;
- timeout controlado.

### UI

- Playwright mobile;
- Playwright desktop/tablet cuando el cambio sea visible al operador;
- editor sin solapamientos;
- flujo login -> cliente -> item -> emitir mock -> resultado;
- listado filtrado, nueva nota de credito y link publico.

### Flujo Completo

- Para funcionalidades que crucen frontend y backend, la validacion preferida es Playwright usando la UI contra API local/mock.
- Los tests backend siguen cubriendo reglas de dominio; el flujo UI valida que el circuito real de operador no se rompa.

## 17. Criterio De MVP Implementado

El MVP se considera implementado cuando:

- operador inicia sesion;
- el sistema resuelve su unico contexto operativo;
- puede crear/seleccionar cliente;
- puede crear/seleccionar item;
- puede emitir factura contado;
- puede emitir factura credito sin cobro posterior;
- puede ver resultado con CDC/numero fiscal;
- puede abrir KUDE/PDF y XML;
- puede compartir link publico y WhatsApp;
- puede listar documentos;
- puede filtrar documentos por contado, credito y nota de credito;
- puede emitir NCE total desde factura elegible;
- puede solicitar cancelacion/anulacion elegible;
- el sistema tiene backups, logs, healthchecks y migraciones;
- no hay secretos versionados.

## 18. Supuestos Documentados

- El primer despliegue corre en un unico VPS.
- PostgreSQL vive en el mismo VPS al inicio.
- La app operativa es la superficie critica.
- Backoffice puede empezar con endpoints y operaciones por SQL/seed.
- `facturacion-electronica` Ventax resuelve SIFEN, XML, firma, QR, KUDE, XML final y email.
- El SaaS no tendra emision offline.
- La primera NCE sera total, no parcial.
- Cantidad sera entera en MVP.
- El sistema debe poder evolucionar a mas infraestructura sin rehacer dominio ni contratos.
