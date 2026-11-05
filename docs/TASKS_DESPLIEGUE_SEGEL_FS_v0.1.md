# TASKS Despliegue Segel en VPS propia v0.1

## Alineacion

- `docs/SPEC_DESPLIEGUE_SEGEL_FS_v0.1.md`
- `docs/PLAN_DESPLIEGUE_SEGEL_FS_v0.1.md`

## Estado General

- `SPEC` y `PLAN`: DONE, con B-1 y P-1 a P-4 abiertos.
- Sin desplegar. La VPS no se modifico.

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
| --- | --- | --- | --- | --- |
| SFS-001 | Relevamiento | Relevar `segel-fs` y Hetzner | DONE (2026-11-05) | Evidencia E-1 |
| SFS-002 | Codigo | Eliminar destinatario, contacto y defaults de Ventax | DONE sin commit (2026-11-05), E-2 | `npm run test`, `typecheck` y `lint` sin fallas nuevas |
| SFS-003 | Codigo | `FRONTEND_BIND_IP` en `docker-compose.yml` | DONE sin commit (2026-11-05), E-2 | Sin la variable, `compose config` sigue en `127.0.0.1` |
| SFS-004 | Infra | Plantillas de entorno y configuracion NGINX | DONE sin commit (2026-11-05), E-2 | Sin secretos; `check-no-secrets` en verde |
| SFS-005 | Infra | Scripts `build-images`, `deploy`, `init-env` y `up` | PARTIAL: falta el ensayo SFS-007 | `bash -n` y ensayo SFS-007 |
| SFS-006 | Build | Commit autorizado y build desde ese commit | BLOQUEADA: autorizacion, y prueba de estres en curso en la estacion | `X-App-Version` igual al commit |
| SFS-007 | Ensayo | Levantar los dos stacks en local | PENDIENTE | Salud, alias de red y login de FE por su frontend |
| SFS-008 | Host | Grupo `docker`, disco y salida a M365 | BLOQUEADA (P-3) | `df` y `id` correctos |
| SFS-009 | Deploy | Desplegar en `segel-fs` | PENDIENTE | CA-02 y CA-03 |
| SFS-010 | Entrega | Enviar configuracion a infraestructura | BLOQUEADA (P-1) | CA-06 |
| SFS-011 | Marca | T&C de Segel | BLOQUEADA (B-1) | Migracion nueva, sin "Ventax" en el T&C activo |
| SFS-012 | Correo | Configurar la casilla Segel en FS y FE | BLOQUEADA (P-2) | Correo recibido, con SPF y DKIM validos |
| SFS-013 | Puesta en marcha | Primer admin en cada stack, facturador de prueba y carga inicial del padron DNIT | PENDIENTE | Login en ambos backoffices y busqueda de RUC |
| SFS-014 | Validacion | Emision real contra SIFEN test y recorrido con Playwright (mobile y desktop) | PENDIENTE | CA-04 y documento aprobado |
| SFS-015 | Operacion | Backups con restauracion probada y prueba de reinicio | PENDIENTE | CA-05 y CA-07 |
| SFS-016 | Carga | Redactar SPEC de carga en la VPS | PENDIENTE | SPEC con SIFEN simulado y objetivo de memoria |

## Evidencia

### E-1. Relevamiento (2026-11-05)

Solo lectura, en `segel-fs` y Hetzner, mas la salida con root que entrego el usuario.

- Rocky 9.8, SELinux Enforcing, 4 vCPU, 3,6 GiB. Docker 29.9.3 sin SELinux en contenedores.
- `esaldivar` uid 1001, fuera de `docker` y de `wheel`.
- `/var` 9,3 G; grupo LVM sin espacio libre; 18 G sin particionar a continuacion de `sda3`.
- Corren `portainer_agent` (9002), `cadvisor` (8081) y `node_exporter`.
- Salida abierta a SIFEN test y produccion, DNIT, Zoho, GitHub, npm y Docker Hub.
- DNS: MX de `segel.com.py` en Microsoft 365, SPF `-all`; `facturacion.segel.com.py` en `68.183.118.119`.

### E-2. Codigo y plantillas (2026-11-05)

- `npm run typecheck` y `npm run lint`: en verde.
- `npm run test -w @facturacion-simple/api`: 454 pasan y 6 fallan. Las 6 fallan igual en `e40b51c` limpio (`entrega.service.test.ts` 2, `facturas.service.test.ts` 4). Se ajustaron 2 pruebas de `entrega` que dependian del dominio anterior por defecto.
- `apps/api/tests/email.marca-segel.test.ts`: 3 pasan, desde `apps/api` y desde la raiz.
- `node scripts/check-no-secrets.cjs`: en verde.
- `docker compose config`, sin `FRONTEND_BIND_IP`: `127.0.0.1:8092`, sin cambio.
- Ensayo en seco con `init-env.sh`, sin levantar nada: archivos en modo 600, no sobrescribe uno existente. FS y FE publican el frontend en `10.100.0.145`; APIs y Postgres FS en `127.0.0.1`; red `segel_fiscal` y alias `facturacion-electronica` correctos.
- Sin validar todavia: build de imagenes, arranque real y `up.sh`. El build se postergo porque `fe-volumen-api` estaba cerca de 200 % de CPU en la estacion.
