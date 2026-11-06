# TASKS Despliegue Segel en VPS propia v0.1

## Alineacion

- `docs/SPEC_DESPLIEGUE_SEGEL_FS_v0.1.md`
- `docs/PLAN_DESPLIEGUE_SEGEL_FS_v0.1.md`

## Estado General

- `SPEC` y `PLAN`: DONE, con B-1 y P-4 abiertos.
- Desplegado en `segel-fs`, FS `96e635d` y FE `c337d9e`, con SIFEN test. Acceso por tunel; falta NGINX de infraestructura. Sin emision real todavia.

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
| --- | --- | --- | --- | --- |
| SFS-001 | Relevamiento | Relevar `segel-fs` y Hetzner | DONE (2026-11-05) | Evidencia E-1 |
| SFS-002 | Codigo | Eliminar destinatario, contacto y defaults de Ventax | DONE (2026-11-05), E-2 | `npm run test`, `typecheck` y `lint` sin fallas nuevas |
| SFS-003 | Codigo | `FRONTEND_BIND_IP` en `docker-compose.yml` | DONE (2026-11-05), E-2 | Sin la variable, `compose config` sigue en `127.0.0.1` |
| SFS-004 | Infra | Plantillas de entorno y configuracion NGINX | DONE (2026-11-05), E-2 | Sin secretos; `check-no-secrets` en verde |
| SFS-005 | Infra | Scripts `build-images`, `deploy`, `init-env` y `up` | DONE (2026-11-05), E-3; `deploy.sh files` e `images` sin probar contra la VPS | `bash -n` y ensayo SFS-007 |
| SFS-006 | Build | Commit autorizado y build desde ese commit | DONE (2026-11-05), FS `78b8781`, FE `c337d9e`, E-3 | `X-App-Version` igual al commit |
| SFS-007 | Ensayo | Levantar los dos stacks en local | DONE (2026-11-05), E-3 | Salud, alias de red y login de FE por su frontend |
| SFS-008 | Host | Grupo `docker` y salida a M365, sin cambios de disco (P-3) | DONE (2026-11-05) | `id` con `docker`; 587 abierto |
| SFS-009 | Deploy | Desplegar en `segel-fs` | DONE (2026-11-05), E-4 | CA-02 y CA-03 |
| SFS-010 | Entrega | Enviar configuracion a infraestructura | PARTIAL: documento listo y subdominios confirmados, falta compartirlo | CA-06 |
| SFS-011 | Marca | T&C de Segel con SEGEL S.A. | DONE sin desplegar (2026-11-05); falta revision legal | Migracion nueva, sin "Ventax" en el T&C activo |
| SFS-012 | Correo | Configurar la casilla Segel en FS y FE | DONE (2026-11-05), E-5 | Correo recibido, con SPF y DKIM validos |
| SFS-013 | Puesta en marcha | Primer admin en cada stack, facturador de prueba y carga inicial del padron DNIT | PARTIAL: admins, facturador y operador listos (E-4); falta el padron DNIT | Login en ambos backoffices y busqueda de RUC |
| SFS-014 | Validacion | Emision real contra SIFEN test y recorrido con Playwright (mobile y desktop) | PARTIAL: recorrido hasta la app (E-4); falta certificado, CSC y emision | CA-04 y documento aprobado |
| SFS-015 | Operacion | Backups con restauracion probada y prueba de reinicio | POSPUESTA por el usuario (D-7) | CA-05 y CA-07 |
| SFS-016 | Carga | Redactar SPEC de lote por CSV contra SIFEN test | PENDIENTE, tras las pruebas de a una factura | SPEC aprobado |
| SFS-017 | Operacion | Runbook de test a produccion | DONE (2026-11-05), a ajustar con lo que dejen las pruebas | `docs/OPERACION_DESPLIEGUE_SEGEL_FS_v0.1.md` |
| SFS-018 | Deploy | Reinstalacion limpia de test siguiendo el runbook | PENDIENTE (VPN) | Fases 1 a 4 sin desvios |

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
- El build se postergo hasta que termino la prueba de estres de la estacion.

### E-3. Build y ensayo local (2026-11-05)

Paquete de `deploy.sh bundle`, `init-env.sh` y `up.sh`, con `SEGEL_BIND_IP=127.0.0.1` y puertos altos. Eliminado al terminar, con sus volumenes y su red.

- Nueve imagenes desde `git archive`. `X-App-Version: 78b8781`.
- Migraciones de FS y FE correctas. Contenedores sanos, con `restart: unless-stopped`.
- Desde `segel-fs-api-1`, `http://facturacion-electronica:8080/v1/health` responde `{"status":"ok",...,"db":true}` (CA-03).
- Primer admin de FE con la clave de bootstrap y login por el frontend de FE: 201 y token.
- `node` (uid 1000) escribe en `cert-uploads`. El caso uid 1001 solo se puede comprobar en la VPS.
- Playwright, 390x844 y 1366x800, sobre `/app/`, `/backoffice/` y admin de FE: sin errores de pagina, sin "Ventax" en el texto; capturas revisadas a ojo. Solo pantallas de login, y previas al arreglo del aviso, que no aparece en ellas.
- **Falla encontrada y corregida:** el bundle de la app contenia `facturacion@ventax.app` en el aviso de cuenta sin correo (`main.tsx`), oculto en una busqueda anterior por lineas truncadas. Commit `78b8781`. El bundle reconstruido solo conserva claves tecnicas.
- **Sigue abierto:** el T&C activo (v1.5) menciona a Ventax 120 veces (B-1). El admin de FE no tiene marca Segel: es neutro y de uso interno.

### E-4. Despliegue y recorrido (2026-11-05)

Stacks `fe-segel` y `segel-fs` en `/home/esaldivar/segel`, sin cambios de disco ni recursos. Pruebas por tunel SSH a `localhost`.

- Publicados: `10.100.0.145:8092` y `:8100`. Desde la red, `5434`, `8091` y `9989` no son accesibles (CA-02).
- FS -> FE por `facturacion-electronica`: `status ok` (CA-03), tambien tras reiniciar API y frontend de FS y API de FE.
- `node` escribe en `cert-uploads` con el deploy en uid 1001 (PLAN §4).
- FE: admin, emisor 5057016-1 replicado por API desde `fe-test` (sin certificado ni CSC, numeradores +1000), consumidor `segel-fs` y export.
- FS: planes, tenants `segel-interno` y `empresa-demo`, import desde el export con `puede_aplicar: true`; advertencias `BASE_URL_DISTINTA`, `CONSUMIDOR_ESTADO_DESCONOCIDO` y `API_KEY_AUSENTE`, esperables segun el runbook.
- Playwright, 390x844: operador con clave temporal -> cambio de clave -> T&C -> OTP (hash fijado en `tyc_otp_sessions`) -> app; la sesion sigue tras recargar. 1366x800: login del operador con la clave final. Ambos tamanos: login de `admin-backoffice` en backoffice y admin de FE. Sin errores de pagina; capturas revisadas a ojo.
- La clave `API_KEY` de FE no aparece en los logs. Sin errores de nivel error en las API.
- Reposo: unos 180 MiB de los stacks; 2,4 GiB disponibles. `/var` 44 %, 5,3 G libres, sin el padron.
- **Hallazgo:** `003_seed_awapura.sql` de FE carga en toda base nueva al emisor real AWAPURA (80136968-1), con referencia a un certificado de una persona. El archivo no esta en la VPS. Pendiente decision del usuario (P-5).
- **Sin validar:** envio real de correo, KuDE, emision, reinicio de la VPS y backups.
- **Numeradores:** el equipo de FE los reviso y no los cambia: el margen de +1000 alcanza (FE 001-001 en 1016, FE 001-002 en 1094, NCE 001-002 en 1009). Se confirma con la primera emision aprobada, que requiere certificado y CSC. Los scripts quedan fijados en FE `c337d9e` hasta que FE anuncie un tag: la punta de `branding/segel-staging` tiene correcciones sin validar.

### E-5. Correo y ajustes (2026-11-05)

- Contrasena SMTP cargada por el usuario en `fs/.env.segel` y copiada dentro de la VPS a `fe/.env.segel`, sin mostrarla. Longitud correcta en los contenedores. Contiene `#` sin comillas: Compose la conserva porque no tiene un espacio antes.
- Autenticacion SMTP correcta desde FS y FE. Un correo real desde FS a la casilla del usuario: servidor responde 250. Falta confirmar la recepcion y probar el correo de factura de FE, que depende de emitir.
- AWAPURA (80136968-1) desactivado por API de FE; 5057016-1 sigue activo.
- FS `96e635d`: contacto `no-reply-facturacion@segel.com.py`. `X-App-Version` por `APP_VERSION`; el bundle ya no contiene otra direccion. Imagenes anteriores de FS retiradas; `/var` 44 %.

### E-6. Ensayo local en modo produccion (2026-11-05)

Paquete de `ace396e` con `init-env.sh prod`, `up.sh` y `bootstrap.sh`, en puertos altos de la estacion. Eliminado al terminar. Sin certificado, sin emisor propio y sin emitir.

- `init-env.sh` sin argumento se niega a correr.
- `APP_ENV=production`, `SIFEN_ENV=prod`, `KUDE_JASPER_AMBIENTE=2` y `FE_API_ENV=prod`. FE arranca y pasa su validacion de seguridad.
- FS llega a FE por la red interna. `X-App-Version: ace396e`.
- `bootstrap.sh`: admin de FE creado, admin de FS listo y AWAPURA con `activo = f`.
- T&C: `segel-1.0` activo, 0 menciones a Ventax; 1.4 y 1.5 inactivas. El proveedor se cambio despues a SEGEL S.A., en la misma migracion, antes de aplicarla en la VPS.
- Sin validar en este ensayo: conexion real con SIFEN produccion y dominios.

### E-7. Reinstalacion limpia de test (2026-11-05)

Fases 1 a 4 del runbook, con FS `3e4f637` y FE `c337d9e`, sobre bases vacias. Se reenviaron solo las imagenes de FS, porque las de FE no cambiaron.

- Antes de borrar: 0 certificados, 0 CSC, 0 documentos y 0 facturas.
- `bootstrap.sh`: T&C `segel-1.0` y AWAPURA inactivo. Tras el aviso del equipo de FE tambien desactiva su certificado y CSC, porque `verify-cert-storage.sh` filtra por la fila del certificado.
- Facturador cargado con `cargar-facturador.py`, sin bloqueantes. Operador activado con `activar-operador-test.cjs`.
- `up.sh` no ejecuta `verify-cert-storage.sh`: la falta de certificado no detiene los stacks. No se copian certificados desde Hetzner.

### E-8. Subdominios definitivos (2026-11-05)

- `app.factura`, `backoffice.factura` y `fe-back.factura` bajo `segel.com.py`: plantillas, NGINX, VPS y documento de infraestructura.
- **Falla encontrada:** al recrear solo la API de FS, el frontend quedo con la IP vieja y el login dio 502. `up.sh` ahora reinicia el frontend, y queda en el runbook.
- Los tres nombres ya resuelven en DNS, a direcciones de Cloudflare.

### E-9. Padron DNIT (2026-11-05)

- **Falla:** primera carga con 2.018.276 filas en staging, pero `canceling statement due to statement timeout` al copiar a la tabla final: el loader fijaba 60 s en `src/db.js`. Se revirtio y la tabla siguio en 0; el cron del dia 5 habria fallado igual.
- **Correccion:** `DNIT_STATEMENT_TIMEOUT`, con 60 s por defecto para no cambiar otros ambientes y `15min` en esta instancia.

