# PLAN Despliegue Segel en VPS propia v0.1

## Alineacion

- `docs/SPEC_DESPLIEGUE_SEGEL_FS_v0.1.md`

## Enfoque

En Hetzner se construye en el servidor desde un checkout. Aca se construye en la estacion y se transfieren las imagenes, porque `segel-fs` no tiene git, `/var` es chico para la cache de build y la rama no debe depender de un checkout en el servidor.

El diseno de red y de stacks es el de Hetzner. FE se usa sin cambios; su `deploy-prod.sh` no sirve aca porque siempre compila.

## 1. Host

El grupo `docker` de `esaldivar` ya esta aplicado. No se modifican disco ni recursos (SPEC P-3). Se calcula para `/var`: unos 3,8 G de imagenes, 0,7 G del padron y el crecimiento de las bases, sobre 8,7 G libres.

## 2. Disposicion en la VPS

```text
/home/esaldivar/segel/
  bin/          init-env.sh, up.sh, templates/
  fs/           docker-compose.yml, .env.segel, dnit-ruc-loader/data
  fe/           docker-compose.prod.yml, .env.segel
  fe-runtime/   secrets, runtime/{cert-seed,cert-uploads,logo-uploads}
  backups/      fs, fe
```

Proyectos Compose: `fe-segel` y `segel-fs`. Compose nombra las imagenes `<proyecto>-<servicio>`, y son las que se construyen.

| Servicio | Publicacion |
|---|---|
| Frontend FS | `10.100.0.145:8092` |
| Frontend FE | `10.100.0.145:8100` |
| API FS | `127.0.0.1:8091` |
| API FE | `127.0.0.1:9989` |
| Postgres FS | `127.0.0.1:5434` |
| Postgres FE | sin publicar |

## 3. Cambios en este repositorio

- `docker-compose.yml`: `FRONTEND_BIND_IP`, con default `127.0.0.1`. Hetzner no cambia.
- `apps/api/src/config/env.ts`, `email.service.ts`, `email.templates.ts`: SPEC, "Rastros de Ventax".
- `infra/segel-fs/`: plantillas de entorno.
- `infra/nginx-or-caddy/host-segel-fs.conf`: configuracion para infraestructura.
- `scripts/segel-fs/build-images.sh`: construye desde `git archive`, con `--network host` por el DNS local (`red-local`).
- `scripts/segel-fs/deploy.sh`: transfiere imagenes y archivos.
- `scripts/segel-fs/init-env.sh`: genera los secretos en la VPS. No sobrescribe un archivo existente.
- `scripts/segel-fs/up.sh`: red, permisos y arranque de los stacks con `--no-build`.

## 4. Permisos de FE

La imagen corre como `node` (uid 1000) y `esaldivar` es uid 1001. En Hetzner coinciden, y por eso alli alcanza `prepare-runtime-permissions.sh`. `up.sh` hace `chown` a 1000 de las carpetas de runtime usando un contenedor, sin sudo. Docker no aplica SELinux a los contenedores (`SecurityOptions` sin `selinux`, sin `daemon.json`), asi que no hace falta `:z`.

## 5. Configuracion de FE para la etapa test

`APP_ENV=staging`, `SIFEN_ENV=test` y `KUDE_JASPER_AMBIENTE=1`, como `fe-test`. `PUBLIC_API_BASE_URL` apunta al host de FE, porque su frontend reenvia `/v1/`. `SMTP_*` vacios hasta tener la casilla (RN-05).

## 6. Orden de ejecucion

1. Correcciones de codigo, con pruebas.
2. Commit en la rama, previa autorizacion del usuario.
3. Build de imagenes y ensayo local de los dos stacks.
4. Comprobacion de acceso y de salida a `smtp.office365.com:587`.
5. `deploy.sh`, `init-env.sh`, `up.sh`.
6. Entrega a infraestructura.
7. T&C de Segel (B-1), primer admin de cada stack y facturador de prueba.
8. Emision real contra SIFEN test, con Playwright sobre el dominio.
9. Backups y prueba de reinicio.
10. SPEC de carga.

## Riesgos

| Riesgo | Mitigacion |
|---|---|
| Un deploy de Hetzner desde esta rama lleva los defaults nuevos | Las variables estan definidas en sus `.env` y la regla de no desplegar la rama en produccion sigue vigente |
| `/var` se llena con versiones viejas de imagenes o con el padron | Prune tras cada deploy, medir `df` en cada etapa, e informar si no alcanza. No se amplia sin decision del usuario |
| Backups en `/home` (3,7 G) | Retencion corta y copia fuera de la VPS |
| La VPN corta los puertos locales de Docker | No correr el ensayo ni carga local con la VPN arriba |
| Build local compite con pruebas de estres en la estacion | Mirar la carga antes de compilar |

## Reversion

`docker compose down` en cada stack. No afecta a Hetzner ni a otros contenedores de la VPS. Los cambios de codigo viven solo en la rama.
