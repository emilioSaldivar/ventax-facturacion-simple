# Operacion Despliegue Segel en VPS propia v0.1

Paso a paso para levantar la instancia en `segel-fs`, primero en SIFEN test y luego en produccion. Cada fase indica como se verifica. Si una verificacion falla, no seguir.

> **Segunda entrega:** este runbook ya refleja FE `segel-rc3`, sus dos workers, `kude-cache`, las banderas nuevas y la carga masiva. En una instancia que ya existe, las variables nuevas se agregan a mano y el orden es el de `docs/PLAN_DESPLIEGUE_SEGEL_FS_v0.2.md`, secciones 3 y 4.

## Alineacion

- `docs/SPEC_DESPLIEGUE_SEGEL_FS_v0.1.md`
- `docs/PLAN_DESPLIEGUE_SEGEL_FS_v0.1.md`
- `docs/TASKS_DESPLIEGUE_SEGEL_FS_v0.1.md`

## Quien hace que

| Responsable | Tarea |
|---|---|
| Equipo de despliegue | Imagenes, stacks, administradores, facturador, pruebas |
| Usuario | Contrasena SMTP en la VPS, certificado y CSC en el admin de FE |
| Infraestructura | NGINX, DNS y certificados TLS |

Disco, CPU y memoria de la VPS no se modifican. Se necesita VPN para llegar por SSH.

## Fase 1. Imagenes y archivos (en la estacion)

```bash
git checkout feat/identidad-segel
bash scripts/segel-fs/build-images.sh
bash scripts/segel-fs/deploy.sh files
bash scripts/segel-fs/deploy.sh images
```

FE queda fijado en `segel-rc3`. Para otra version: `FE_REF=<tag>`, solo cuando FE lo anuncie. La version de FE se comprueba por este tag: FE no expone `X-App-Version`.

**Verificar:** `docker images` en la VPS muestra las once imagenes `segel-fs-*` y `fe-segel-*`.

## Fase 2. Stacks (en la VPS)

Elegir el ambiente a mano: `test` o `prod`.

```bash
cd ~/segel
bash bin/init-env.sh test
# Cargar SMTP_PASS en fs/.env.segel y fe/.env.segel
bash bin/up.sh
bash bin/bootstrap.sh    # pide la contrasena de admin-backoffice
```

Una contrasena SMTP con `#` no lleva comillas, y no puede tener un espacio antes del `#`.

**Verificar:**

- `up.sh` termina con `"status":"ok"` desde FS hacia FE.
- `bootstrap.sh` informa T&C activo `segel-1.0` y 0 emisores en una base nueva. La base de test conserva a AWAPURA inactivo, de una version anterior de FE.
- `ss -tln`: solo `8092` y `8100` en `10.100.0.145`; `8091`, `9989` y `5434` en `127.0.0.1`.
- Dentro de `fe-segel-api-1`: `SIFEN_ENV` es el ambiente elegido.
- `GET /v1/health` de FE trae `java.kude.ok` y `java.firma.ok` en `true`. Con cualquiera en `false`, **no emitir**: quitar `java8_home`, poner `KUDE_JAVA_BIN=java`, correr `up.sh` y avisar a FE con la linea `java.check failed`.
- `worker-cargas` y `worker-correo` arriba, sin reinicios en bucle. `docker logs fe-segel-worker-correo-1` muestra `email.worker start`.

Cargar el padron DNIT, necesario para autocompletar clientes por RUC o cedula. El cron solo corre el dia 5 de cada mes:

```bash
docker exec -d segel-fs-dnit-ruc-loader-cron-1 sh /app/scripts/run.sh
```

Usa `DNIT_STATEMENT_TIMEOUT=15min`: con el limite de 60 s del loader, el paso final se revierte en este disco.

**Verificar:** `dnit_ruc_contribuyentes` queda con cerca de 2 millones de filas, y `/var` conserva espacio libre.

Para aplicar un cambio de `.env.segel`, correr de nuevo `bash bin/up.sh`: recrea la API y los workers de FE, porque `restart` no relee el `env_file`, y reinicia el frontend de FS. Sin ese reinicio, recrear su API lo deja con la IP vieja y responde 502. El de FE re-resuelve solo.

El administrador nuevo debe aceptar los T&C antes de usar el backoffice, y esa pantalla solo existe en la app (FS-18): entrar una vez por `/app/`, aceptar y recien despues usar `/backoffice/`.

## Fase 3. Acceso por tunel (en la estacion)

```bash
ssh -N -L 18092:10.100.0.145:8092 -L 18100:10.100.0.145:8100 segel-fs
```

| Portal | Direccion |
|---|---|
| Admin de FE | `http://localhost:18100/` |
| Backoffice de FS | `http://localhost:18092/backoffice/` |
| App del operador | `http://localhost:18092/app/` |

No usar la IP directa: la cookie de sesion de FS es `Secure`.

## Fase 4. Facturador

Hay dos origenes para el archivo:

- **Emisor que ya existe en otro FE:** exportarlo con `exportar-emisor.sql`, sin certificado ni CSC.
- **Cliente nuevo:** armar el JSON con sus datos, siguiendo `infra/segel-fs/emisor.ejemplo.json`. Debe traer los datos como figuran en la SET, un numerador de nota de credito (tipo 5) y el `siguiente_numero` real de cada serie. `SEPARATE_EXPEDITION_POINT` exige 2 actividades y 2 puntos activos; con menos, usar `SHARED_SEQUENCE` y `PRINCIPAL`.

Exportar desde el FE de origen, si corresponde:

```bash
ssh hetzner 'docker exec -i fe-test-postgres-1 sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -At -v ruc=5057016-1"' \
  < scripts/segel-fs/exportar-emisor.sql > /ruta/privada/emisor.json
```

Cargarlo en la instancia:

```bash
SEGEL_PW=... SEGEL_OPERADOR_PW=<inicial> python3 scripts/segel-fs/cargar-facturador.py /ruta/privada/emisor.json \
  --ambiente test --sumar-numerador 1000 \
  --tenant-nombre "Empresa Demo" --tenant-slug empresa-demo \
  --operador operador.prueba --operador-email operador.prueba@segel.invalid \
  --perfil AC496099-E001-P002-FE-PTO
```

`--sumar-numerador 1000` evita repetir numeros: en test, el mismo RUC y timbrado se usa en otro FE. Con `--ambiente prod` el script lo rechaza. El script valida el archivo antes de escribir, rechaza un emisor que ya exista y crea un consumidor por emisor (`segel-fs-<ruc_base>`). El tenant se crea nuevo en cada carga.

Solo en test, activar el operador con OTP por base de datos:

```bash
SEGEL_OPERADOR_TMP=<inicial> SEGEL_OPERADOR_PW=<final> node scripts/segel-fs/activar-operador-test.cjs operador.prueba
```

**Verificar:** el import no tiene bloqueantes. Son esperables `BASE_URL_DISTINTA`, `CONSUMIDOR_ESTADO_DESCONOCIDO` y `API_KEY_AUSENTE`. El operador entra a "Nueva factura".

## Fase 5. Certificado y CSC

El usuario los carga en el admin de FE: Facturadores > 5057016-1. Nunca por chat ni en archivos del repositorio.

**Verificar:** la readiness de FE queda sin `certificado_vigente`, `csc_vigente` ni `emision_resuelta` en `missing`.

## Fase 6. Pruebas de a una factura

1. Emitir una factura contado desde la app del operador.
2. Comprobar: estado aprobado en SIFEN, KuDE sin el logo "Prototipo" de ejemplo, XML, enlace publico y marca Segel.
3. Enviar el comprobante por correo y confirmar la recepcion, con remitente Segel.
4. Repetir con credito, nota de credito y cancelacion.

Registrar cada resultado en `TASKS`.

## Fase 7. Lote por CSV

Pestana "Carga masiva" de Documentos (`docs/SPEC_CARGA_MASIVA_FACTURAS_v0.1.md`). El consumidor del facturador necesita el permiso `CARGA_MASIVA` y una cuota diaria, que no se otorgan por defecto: `cargar-facturador.py --carga-masiva <cuota>` al darlo de alta, o el backoffice de FE si ya existe. Sin eso, la subida responde que la funcion no esta habilitada para el facturador. El envio es siempre por lote.

## Fase 8. Paso a produccion

Se hace cuando test queda cerrado, y borra todo lo de test.

```bash
cd ~/segel/fs && APP_ENV_FILE=.env.segel docker compose --env-file .env.segel -f docker-compose.yml down -v
cd ~/segel/fe && FE_ENV_FILE=.env.segel docker compose --env-file .env.segel -f docker-compose.prod.yml down -v
docker run --rm --user 0 --network none --entrypoint sh -v ~/segel/fe-runtime:/d fe-segel-api -c 'rm -rf /d/secrets/* /d/runtime/*/*'
rm ~/segel/fs/.env.segel ~/segel/fe/.env.segel
```

Luego repetir las fases 2 a 6 con estas diferencias:

| Paso | Test | Produccion |
|---|---|---|
| `init-env.sh` | `test` | `prod` (secretos nuevos) |
| `--ambiente` | `test` | `prod` |
| `--sumar-numerador` | `1000` | No se usa: `siguiente_numero` real y confirmado en el archivo |
| Origen del emisor | `fe-test` | JSON con los datos del cliente |
| `FE_REF` | `segel-rc3` | `segel-rc3` |
| Timbrado, certificado y CSC | De test | De produccion, los que entrega la SET |
| OTP del operador | Por base de datos | Por correo; no usar `activar-operador-test.cjs` |
| Contrasena de administradores | Prueba | Nueva y privada |
| Acceso | Tunel | Dominios, con NGINX de infraestructura |
| Primera factura | Libre | Efecto fiscal: la confirma el usuario y luego se anula |

Antes de abrir a clientes: NGINX, DNS y TLS activos, y correo probado con un destinatario real. La instancia no tiene backups automaticos: es una decision del usuario posponerlos, y debe revisarse antes de cargar datos reales.

## Reversion

`docker compose down`, sin `-v`, detiene los stacks y conserva los datos. Con `-v` se borran las bases. Ninguno de los dos afecta a Hetzner ni a los contenedores del administrador de la VPS.
