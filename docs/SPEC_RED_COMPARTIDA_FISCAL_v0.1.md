# SPEC Red Compartida Con Facturacion Electronica v0.1

## Alineacion

- `AGENTS.md`
- `docs/METODOLOGIA_SDD.md`
- `~/apps/facturacion-electronica/docs/SPEC_RED_COMPARTIDA_CONSUMIDORES_v0.1.md`
  (repo `facturacion-electronica`, no versionado aqui — es la fuente del estandar)

## Objetivo

Adoptar, como estandar declarado por el proveedor de `facturacion-electronica`
(2026-08-29), la red Docker compartida `ventax_fiscal_prod` / `ventax_fiscal_test`
para la comunicacion entre `ventax-facturacion-simple` y el backend fiscal en el
mismo host, en reemplazo de la union directa a la red default del stack fiscal
(`fe-prod_default` / `fe-test_default`).

## Contexto

`facturacion-electronica` decidio que, de ahora en adelante, cada vez que se
despliegue crea (o verifica que exista) una red `external` por ambiente —
`ventax_fiscal_prod` en produccion, `ventax_fiscal_test` en test — y publica su
`api` en ella con el alias estable `facturacion-electronica`. Es el mismo
mecanismo que ya usa `pos-graciela-production-cloud-api-1` en este VPS, con
resultado medido: de 50s por venta (timeouts contra el binding en loopback) a
476ms.

Ese estandar reemplaza, para los consumidores co-locados en el mismo host, la
practica actual de unirse a `fe-prod_default`/`fe-test_default` (la red default
autogenerada del stack fiscal) y de nombrar el host por el nombre de contenedor
(`fe-prod-api-1`, `fe-test-api-1`).

### Por que este cambio es deseable, mas alla de "porque lo pide el proveedor"

1. **El alias sobrevive a lo que el nombre de contenedor no.** `fe-prod-api-1`
   sale de `project + servicio + indice`; un `scale`, un rename de proyecto o
   una reconstruccion con otro `--project-name` lo cambia sin aviso.
   `facturacion-electronica` es un contrato explicito, documentado por el
   proveedor, versionado en su propio SPEC.
2. **La red default de otro stack no es un contrato.** Unirse a
   `fe-prod_default` acopla a decisiones internas del stack fiscal (cuantos
   servicios corren ahi, si algun dia deja de llamarse asi). La red
   `ventax_fiscal_*` es infraestructura del host con nombre propio, pensada para
   esto.
3. **Aislamiento por ambiente reforzado.** Como ambas redes (`_prod`/`_test`)
   existen independientemente de que `facturacion-simple` las use hoy, el
   proveedor ya garantiza que un consumidor de test no puede alcanzar produccion
   por accidente (su H6/RF-3). Alinearse a esa garantia es mejor que depender de
   la propia disciplina de nombrar bien las variables de entorno.

## Estado Actual (verificado en la VPS, 2026-08-29)

- `ventax-facturacion-simple-prod-api-1` esta en `fe-prod_default`, junto con
  `fe-prod-api-1` y el resto del stack fiscal. Conectividad confirmada:
  resolucion DNS interna, 30ms de latencia, sin salir a internet.
- `ventax_fiscal_prod` ya existe en la VPS y ya tiene como miembros
  `fe-prod-api-1` y `pos-graciela-production-cloud-api-1`.
- `fe-prod-api-1` publica el alias `facturacion-electronica` en esa red
  (`docker-compose.prod.yml` del stack fiscal, servicio `api`, bloque
  `networks.consumer_net.aliases`).
- El compose de `facturacion-simple` ya declara una red `external`
  configurable por entorno (`fiscal_gateway`, `docker-compose.yml`), hoy
  apuntada por `FE_DOCKER_NETWORK` a `fe-prod_default`/`fe-test_default`. El
  mecanismo de union ya existe; falta redirigirlo.

## Alcance Funcional

### 1) Redirigir la red por ambiente

- `.env.production` (VPS): `FE_DOCKER_NETWORK=ventax_fiscal_prod`.
- `.env.staging` (VPS): `FE_DOCKER_NETWORK=ventax_fiscal_test`.
- `.env.production.example` / `.env.staging.example` (repo): mismos valores,
  como default documentado para el proximo ambiente que se levante.

### 2) Consumir por el alias, no por el nombre de contenedor

- `FE_API_BASE_URL` pasa de `http://fe-prod-api-1:8080/v1` /
  `http://fe-test-api-1:8080/v1` a `http://facturacion-electronica:8080/v1` en
  ambos ambientes. El alias es el mismo en los dos: lo que cambia es la red a la
  que esta unido cada uno, exactamente como lo describe el SPEC del proveedor.

### 3) Verificacion de alcance explicita, no silenciosa

- Antes de considerar el cambio cerrado, se verifica desde **dentro** del
  contenedor real (`docker exec`), no desde un contenedor auxiliar: resolucion
  del alias, conexion TCP, y una llamada HTTP real con 200 contra un endpoint que
  hoy funciona.
- Se replica el modo de falla documentado por el proveedor (H2 de su SPEC): un
  nombre de red equivocado no debe fallar en silencio. La verificacion de esta
  iniciativa debe distinguir "resuelve y conecta" de "timeout" (red equivocada,
  alcanzable pero sin ruta) de "no resuelve" (alias ausente en esa red).

## Fuera De Alcance

- Cambiar la topologia del lado de `facturacion-electronica` — ya esta hecha y
  es responsabilidad de ese repo.
- Publicar un endpoint publico con certificado confiable para consumidores fuera
  del host (mencionado como iniciativa aparte en el SPEC del proveedor, H4).
- Automatizar la creacion de la red desde `scripts/deploy.sh` de este repo: la
  crea `facturacion-electronica` (RF-6 de su SPEC); este stack solo se une
  (RF-7). Si en el futuro se requiere tolerancia a que la red aun no exista al
  desplegar `facturacion-simple` primero, se evalua aparte.
- Mezclar este cambio con el deploy del fix de verificacion fiscal
  (`docs/TASKS_ALINEACION_CLAVE_VERIFICACION_FISCAL_v0.1.md`, ACV-011/012): son
  iniciativas independientes y se despliegan por separado para poder aislar la
  causa si algo falla.

## Criterios De Aceptacion

1. `ventax-facturacion-simple-{prod,test}-api-1` (y cualquier worker que llame al
   gateway fiscal) resuelve `facturacion-electronica` dentro de la red
   `ventax_fiscal_{prod,test}` correspondiente.
2. Una llamada real del api (no de un contenedor auxiliar) contra
   `FE_API_BASE_URL` responde 200 en el mismo ambiente.
3. El binding actual (`127.0.0.1:8091`/`8191`, el nginx del host) sigue
   funcionando sin cambios: el cambio es aditivo del lado de la red, no toca el
   acceso existente.
4. `facturacion-simple` de test no puede alcanzar `ventax_fiscal_prod` ni
   viceversa (las redes por ambiente no se comparten).
5. Cero regresion funcional: emision, verificacion fiscal, recibos y artefactos
   (`xml`/`kude.pdf`) siguen funcionando tras el cambio de red.
