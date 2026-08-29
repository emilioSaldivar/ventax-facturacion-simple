# PLAN Red Compartida Con Facturacion Electronica v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_RED_COMPARTIDA_FISCAL_v0.1.md`

## Decision De Diseno

No hace falta tocar `docker-compose.yml`: el servicio `api` ya declara la red
`fiscal_gateway` como `external`, con el nombre resuelto por
`${FE_DOCKER_NETWORK:-bridge}` (lineas 43-45 y 111-113). El mecanismo de union
ya es exactamente el que pide el estandar del proveedor (RF-7: "cada servicio
co-locado se une por su cuenta, declarando la red external en su propio
compose"). El cambio completo es de **valor de variables de entorno**, no de
estructura de compose.

| Opcion | Descartada porque |
| --- | --- |
| Renombrar la red interna `fiscal_gateway` a `ventax_fiscal` en el compose | El nombre de la clave del bloque `networks:` es interno a este archivo, no un contrato con nadie. Renombrarlo no aporta nada y aumenta el diff sin necesidad |
| Hardcodear `ventax_fiscal_prod`/`ventax_fiscal_test` sin variable | Ya existe `FE_DOCKER_NETWORK` cumpliendo ese rol, con el mismo espiritu que `FISCAL_NETWORK_NAME` de `pos-graciela` (indireccion por ambiente, sin default compartido entre prod y test) |
| Que este stack cree la red si falta | RF-6 del SPEC del proveedor: la crea `facturacion-electronica`. Duplicar esa responsabilidad aqui invita a que las dos partes discrepen sobre quien es dueño de la red |

## Diseno Detallado

### 1) Repo — defaults documentados

`.env.production.example`:
```
FE_DOCKER_NETWORK=ventax_fiscal_prod
FE_API_BASE_URL=http://facturacion-electronica:8080/v1
```

`.env.staging.example`:
```
FE_DOCKER_NETWORK=ventax_fiscal_test
FE_API_BASE_URL=http://facturacion-electronica:8080/v1
```

Estos archivos no se leen en runtime (son plantillas versionadas); el cambio real
ocurre en el paso 2, sobre los archivos reales del servidor.

### 2) VPS — archivos reales

- `~/apps/ventax-facturacion-simple/.env.production`:
  `FE_DOCKER_NETWORK=fe-prod_default` -> `ventax_fiscal_prod`;
  `FE_API_BASE_URL=http://fe-prod-api-1:8080/v1` -> `http://facturacion-electronica:8080/v1`.
- `~/apps/ventax-facturacion-simple/.env.staging`: mismo cambio, con
  `ventax_fiscal_test` y el mismo alias (la URL es identica en ambos ambientes;
  lo que cambia es la red, no la URL — tal como lo describe el SPEC del
  proveedor).

Estos archivos no se versionan (viven solo en el servidor); el cambio se aplica
por edicion directa, sin volcar secretos ni URLs internas al repo mas alla de
los ejemplos genericos del paso 1.

### 3) Redeploy y reconexion de red

Cambiar `FE_DOCKER_NETWORK` no reconecta un contenedor que ya esta corriendo: la
lista de redes de un servicio se aplica al crear el contenedor. Se requiere
`docker compose up -d` (lo que ya hace `scripts/deploy.sh`) para que el `api` se
una a la red nueva. Un simple restart no alcanza.

Orden por ambiente, cada uno aislado del otro:

1. Editar `.env.staging`, redeploy solo de staging
   (`APP_ENV_FILE=.env.staging bash scripts/deploy.sh`), verificar (paso 4).
2. Con staging verificado, repetir en produccion.

### 4) Verificacion de alcance (no silenciosa)

Replicando el patron de `verify_fiscal_reachability` de `pos-graciela`
(chequeo TCP real, sin depender de que el servicio responda 200 para confirmar
que hay ruta):

- `docker exec <api> getent hosts facturacion-electronica` — debe resolver a una
  IP de la subred de `ventax_fiscal_{prod,test}`, no fallar.
- `docker exec <api> wget -qO- http://facturacion-electronica:8080/v1/health` —
  200 real, desde el contenedor real (no desde un contenedor auxiliar de
  diagnostico).
- `docker network inspect ventax_fiscal_{prod,test}` — confirmar que el `api` de
  `facturacion-simple` aparece como miembro, junto al `api` fiscal.
- Confirmar que **no** aparece en `fe-{prod,test}_default` despues del cambio
  (o que permanecer ahi, si Compose no lo desconecta solo, no genera ambiguedad
  sobre cual ruta esta realmente en uso — ver Riesgos).

### 5) Prueba funcional de extremo a extremo

No alcanza con el TCP connect: se ejecuta una accion real que dependa del
gateway fiscal en cada ambiente (por ejemplo, `POST /facturas/:id/refresh-status`
sobre un documento existente, o el primer ciclo del worker de verificacion) y se
confirma 200/OK en los logs, no solo alcance de red.

## Riesgos Y Mitigacion

| Riesgo | Mitigacion |
| --- | --- |
| `docker compose up -d` no desconecta automaticamente una red que ya no esta en la lista de `networks:` de un servicio si el servicio no se recrea | Se fuerza recreacion del `api` (`docker compose up -d --force-recreate api` si `up -d` normal no alcanza) y se verifica con `docker inspect` que `fiscal_gateway` en runtime apunta a la red nueva |
| Cambiar la red de produccion sin haberla probado antes en staging | Orden explicito: staging primero, con verificacion completa, recien despues produccion (igual disciplina que `ACV-011`/`ACV-012`) |
| Que `ventax_fiscal_test`/`ventax_fiscal_prod` no tengan el alias `facturacion-electronica` publicado si el stack fiscal se redespliega con una version vieja de su compose | Se verifica el alias en el momento (paso 4) antes de dar el cambio por cerrado; si falta, es un problema del stack fiscal, se documenta y se escala, no se improvisa un workaround en este repo |
| Que quedar unido tambien a la red vieja (`fe-{prod,test}_default`) por algun motivo cause ambiguedad sobre cual IP resuelve `fe-prod-api-1` vs `facturacion-electronica` | No es ambiguo: son dos alias distintos en redes potencialmente distintas. Aun asi, una vez confirmado que `facturacion-electronica` funciona, se evalua si vale la pena remover `api` de la red vieja (no es necesario para el objetivo de esta iniciativa, ver Fuera De Alcance del SPEC) |
| Downtime durante el redeploy de `api` (recreacion de contenedor) | Igual ventana que cualquier deploy normal de `scripts/deploy.sh`; no es un riesgo nuevo introducido por esta iniciativa |

## Plan De Validacion

1. Staging: aplicar el cambio de env, redeploy, verificar resolucion DNS +
   conexion TCP + HTTP 200 real desde el contenedor `api` de staging.
2. Staging: accion funcional real (refresh de estado de un documento existente)
   confirma 200 en logs.
3. Con staging en verde, repetir 1-2 en produccion.
4. Confirmar que el binding existente (`127.0.0.1:8091`/`8191`, nginx del host)
   no se vio afectado: `curl` contra los endpoints publicos sigue en 200 despues
   del cambio.
5. Registrar en `docs/TASKS_RED_COMPARTIDA_FISCAL_v0.1.md` el resultado de cada
   verificacion, con evidencia (no solo "OK").
