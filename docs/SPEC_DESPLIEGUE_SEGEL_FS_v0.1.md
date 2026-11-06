# SPEC Despliegue Segel en VPS propia v0.1

**Fecha:** 2026-11-05 · **Rama:** `feat/identidad-segel` · **Estado:** preparacion en curso, sin desplegar.

## Alineacion

- `AGENTS.md`
- `docs/SPEC_IDENTIDAD_MARCA_SEGEL_v0.1.md`
- `docs/SPEC_RED_COMPARTIDA_FISCAL_v0.1.md`
- `docs/GUIA_DEPLOY_STAGING_PRODUCCION_v0.1.md`

Este alcance reemplaza, solo para esta instancia, D-3, D-4 y D-9 de la identidad de marca: aqui hay servidor propio, y nada visible puede salir como Ventax.

## Objetivo

Levantar en la VPS `segel-fs` una instancia independiente de facturacion simple (FS) y `facturacion-electronica` (FE), con marca Segel, empezando en SIFEN test. Solo se publican los dos frontends; FS y FE se comunican por una red Docker interna, igual que en Hetzner. El equipo de infraestructura configura NGINX con lo que este proyecto le entrega.

## Decisiones del usuario (2026-11-05)

| ID | Tema | Decision |
|---|---|---|
| D-1 | NGINX | Lo configura infraestructura. Se le entrega la configuracion a aplicar |
| D-2 | Dominio | `segel.com.py` y sus subdominios. La raiz es la web oficial y no se toca |
| D-3 | SIFEN | Primero test. Luego carga en la VPS para medir capacidad y memoria. Produccion es un paso aparte |
| D-4 | Commit FS | Base `e40b51c`, mas las correcciones de este alcance |
| D-5 | Marca | Nada puede salir como Ventax |
| D-6 | Hoja de ruta | Primero un despliegue limpio en test, con pruebas de a una factura y luego por lote CSV. Lo aprendido define el paso a paso de produccion (`docs/OPERACION_DESPLIEGUE_SEGEL_FS_v0.1.md`) |
| D-7 | Backups | No son prioritarios por ahora |
| D-8 | NGINX, DNS y TLS | Los hace infraestructura |

## Reglas

- **RN-01.** Solo se publican los frontends, en `10.100.0.145`, nunca en `0.0.0.0`: `DOCKER-USER` esta vacia y firewalld inactivo. Esa IP sirve tanto si NGINX corre en la VPS como en otro equipo. API y Postgres quedan en `127.0.0.1` o sin publicar.
- **RN-02.** Red `segel_fiscal`, con el alias `facturacion-electronica`. Separada de cualquier red Ventax.
- **RN-03.** Secretos propios, generados en la VPS. Ninguno se comparte con Ventax ni se versiona.
- **RN-04.** Se usa el FE del tag `segel-rc1` sin modificarlo.
- **RN-05.** Sin casilla Segel, el correo queda desactivado. Nunca se usa el SMTP ni el remitente de Ventax.
- **RN-06.** Sin T&C de Segel activos, no se da de alta ningun usuario.
- **RN-07.** La rama no entra a `master` y la produccion de Ventax no cambia.
- **RN-09.** Cada emisor tiene su consumidor de FE (`segel-fs-<ruc_base>`). Un cliente nuevo se carga desde un JSON con sus datos, sin depender de otro FE.
- **RN-08.** El paso de test a produccion arranca con bases vacias: los datos de prueba no conviven con documentos fiscales reales.

## Subdominios

Definidos por el usuario el 2026-11-05. App y backoffice de FS comparten puerto porque un solo frontend sirve `/app/` y `/backoffice/`. Son subdominios de segundo nivel: un certificado `*.segel.com.py` no los cubre.

| Host | Destino | Uso |
|---|---|---|
| `app.factura.segel.com.py` | `10.100.0.145:8092` | App del operador (`/app/`) y enlaces publicos |
| `backoffice.factura.segel.com.py` | `10.100.0.145:8092` | Backoffice de FS (`/backoffice/`) |
| `fe-back.factura.segel.com.py` | `10.100.0.145:8100` | Admin de FE |

`facturacion.segel.com.py` ya existe y apunta a `68.183.118.119`: no se reutiliza. No se publica un host `fe-api`, porque el pedido es exponer solo los frontends; el frontend de FE reenvia `/v1/` a su API.

## Rastros de Ventax

| Elemento | Tratamiento |
|---|---|
| Aviso `sendAdminEmailRequiredNotification` a `facturacion@ventax.app` | **Se corrige.** Va a `VENTAX_NOTIFY_EMAIL` o, si falta, a `EMAIL_FROM` |
| Contacto en plantillas de correo | **Se corrige.** Usa `EMAIL_FROM` |
| Defaults de `EMAIL_FROM`, `PUBLIC_APP_BASE_URL` y `FE_API_BASE_URL` | **Se corrigen.** El ultimo enviaria la clave fiscal a un host de Ventax si faltara la variable |
| T&C `0018` y `0019`: proveedor Ventax y datos personales | **Se corrige** con `0035`. Las versiones anteriores quedan inactivas en la base |
| Logo por defecto de KuDE (`assets/logo.jpeg`, dice "Prototipo") | `KUDE_LOGO_PATH` apunta a `kude-logo-vacio.png`. Falta comprobar que sale en un KuDE real |
| Cookie `ventax_refresh_token`, claves de `localStorage` y cache del service worker | Fuera de alcance: no son contenido, solo se ven con herramientas de desarrollo. Renombrarlos toca los scripts de carga y de Playwright |
| Variable `VENTAX_NOTIFY_EMAIL`, base por defecto del loader y `ventax_logos/` en la imagen de FE | Fuera de alcance: nombres internos |

## Bloqueos y pendientes

- **B-1. T&C.** Resuelto: T&C `segel-1.0`, version del 5 de noviembre de 2026, con SEGEL S.A. (RUC 80026570-0) como proveedor (migracion `0035`, `docs/contract/TERMINOS_CONDICIONES_SEGEL_FACTURACION_SIMPLE_v1_0.md`). Sin la seccion 2.1, que no aplica a una persona juridica, ni WhatsApp comercial, porque no hay uno definido. El texto se adapto de la version de Ventax y falta su revision legal.
- **P-2. Correo.** Resuelto: cuenta y contacto `no-reply-facturacion@segel.com.py` en `smtp.office365.com:587`, remitente "Facturacion Electronica Segel", decision del usuario. El usuario carga la contrasena en la VPS.
- **P-3. Recursos.** Decision del usuario (2026-11-05): no se modifican disco ni recursos de la VPS. Se trabaja con lo que hay: `/var` (9,3 G) para Docker y `/home/esaldivar/segel` (`/home`, 3,7 G) para archivos. Infraestructura solo se ocupa de NGINX. Sin VPN no hay acceso a la VPS.
- **P-5. Emisor sembrado.** Resuelto: la migracion `003_seed_awapura.sql` de FE crea al emisor real AWAPURA (80136968-1) en toda base nueva. En esta instancia se desactivo, por decision del usuario (2026-11-05): solo se usa 5057016-1. Desde `segel-rc1`, FE ya no lo crea en una base nueva.
- **P-4. Portainer.** Quien administre `portainer_agent` puede leer los secretos de los contenedores. Conviene saber quien tiene acceso y limitar el puerto 9002.

## Acceso sin NGINX

Mientras NGINX no este listo, los portales se usan por VPN con un tunel SSH hacia `localhost`:

```bash
ssh -N -L 18092:10.100.0.145:8092 -L 18100:10.100.0.145:8100 segel-fs
```

| Portal | Direccion |
|---|---|
| App de FS | `http://localhost:18092/app/` |
| Backoffice de FS | `http://localhost:18092/backoffice/` |
| Admin de FE | `http://localhost:18100/` |

No se usa `http://10.100.0.145:8092` directo aunque la VPN llegue: la cookie de sesion de FS es `Secure`, y el navegador solo la acepta sin HTTPS en `localhost`. Sin ella, la sesion no se renueva.

## Limites conocidos

- El nginx interno de cada frontend no define `client_max_body_size`: se aplica 1 MB aunque el nginx externo permita mas. Un logo mayor a 1 MB devuelve 413 en FE. No se modifica FE.
- Sin SMTP, FS deja los correos, incluido el OTP, en texto plano en sus logs (`email.service.ts`). Es aceptable solo con usuarios de prueba.

## Fuera de alcance

- La configuracion de TLS, DNS y NGINX, que hace infraestructura.
- El diseno de la prueba de carga: tendra SPEC propio. Debe usar SIFEN simulado (`SPEC_VERIFICACION_CAPACIDAD_200` D-2), no SIFEN test real. `scripts/carga/stack.sh` esta pensado para la estacion local.
- La habilitacion de SIFEN produccion.
- La carga de facturas por CSV: requiere SPEC propio, no existe hoy.

## Criterios de aceptacion

- **CA-01.** Las imagenes se construyen desde commits, no desde el directorio de trabajo.
- **CA-02.** En la VPS, solo los frontends quedan publicados fuera de `127.0.0.1`.
- **CA-03.** Desde la API de FS, `http://facturacion-electronica:8080/v1/health` responde `ok`.
- **CA-04.** Las pantallas y correos de la instancia no contienen "Ventax".
- **CA-05.** Tras reiniciar la VPS, los dos stacks vuelven solos.
- **CA-06.** Infraestructura recibe una configuracion aplicable sin leer este repositorio.
- **CA-07.** Hay backup diario de las dos bases, con restauracion probada.
