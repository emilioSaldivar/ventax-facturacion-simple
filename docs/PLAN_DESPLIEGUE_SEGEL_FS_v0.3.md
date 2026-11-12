# PLAN - Despliegue en `segel-fs` v0.3

SPEC: `docs/SPEC_DESPLIEGUE_SEGEL_FS_v0.3.md` · TASKS: `docs/TASKS_DESPLIEGUE_SEGEL_FS_v0.3.md`.

Repite el procedimiento de E-6 (`TASKS_DESPLIEGUE_SEGEL_FS_v0.2`), que ya funciono el 2026-11-11, con cuatro migraciones en lugar de dos y una verificacion por funcionalidad. Nada de FE.

## Quien hace que

| Paso | Quien | Donde |
|---|---|---|
| Confirmar D-1 a D-8 | Usuario | Su sesion de FS |
| Tag, imagenes, respaldo, arranque, verificacion, evidencia | Sesion de FS | Estacion y VPS por SSH (`ssh segel-fs`) |
| Aviso a FE | Sesion de FS | Mensaje a `facturacion-electronica-7c` antes y despues (FE no interviene) |
| Prueba con operador (CA-08) | Usuario, o la sesion de FS si el usuario da un usuario de prueba | App de produccion |

## 1. Antes del dia (en la rama)

1. Cerrar lo documental: esta cadena en `AGENTS.md` y `BACKLOG.md`; `TASKS` de las cadenas que entran apuntando aqui (hecho el 2026-11-11).
2. Si el usuario elige D-5 "antes": DES-013 (factura USD con descuento en SIFEN test desde el stack local, aviso a FE) y su evidencia en `TASKS_DESCUENTOS_FACTURA_v0.1`.
3. Regresion final sobre el commit candidato en el stack local (`desplegar.sh` del scratchpad o `bash scripts/deploy.sh`): `npm run test`, `typecheck`, `lint` de `apps/api` y `packages/shared`; `typecheck` y `build` de `apps/web-operacion`; Playwright sin emitir: `playwright-validaciones-receptor.cjs`, `playwright-catalogo-moneda.cjs`, `playwright-descuentos.cjs grilla simple validacion`, `playwright-nota-remision.cjs permiso validaciones pantallas`, `playwright-documentos-escritorio.cjs`, `playwright-editor-pc.cjs`, `playwright-nc-cuerpo.cjs comparar`, `playwright-ux-resto-app.cjs` (sin `ficha`, que depende de datos), `playwright-reconocimiento-ux.cjs` sin aumentos.
4. Tag anotado local `segel-fs-2026.11.12` sobre ese commit (sin push: regla de la rama Segel).

## 2. El dia, con la orden directa

### 2.1 Imagenes (estacion, unos 5 minutos)

- `git archive <tag>` a un directorio temporal; `docker build` de `infra/docker/api.Dockerfile` (etiquetas `segel-fs-api:<sha>` y `segel-fs-migrate:<sha>`) y `infra/docker/frontend.Dockerfile` (`segel-fs-frontend:<sha>`) con `--build-arg BUILD_COMMIT_SHA=<sha>` y `--network host` (red local sin ruta directa).
- `docker save` de las tres imagenes y transferencia por SSH a la VPS (`docker load`), como en E-6. No se usan `build-images.sh` ni `deploy.sh` de FE porque transfieren tambien las imagenes de FE.

### 2.2 Respaldo (VPS, RN-01)

- `pg_dump -Fc` de la base de FS excluyendo `dnit_ruc_contribuyentes`, en `/home/esaldivar/segel/backups/fs/<fecha>Z/fs.dump` con permiso 700, mas `imagenes.txt` (`docker images` de FS) y `SHA256SUMS`.
- Restauracion de prueba en un `postgres:16-alpine` descartable: `pg_restore`, `select count(*) from facturas_operativas` y la ultima migracion aplicada; se elimina el contenedor.

### 2.3 Arranque (VPS, corte menor a un minuto)

- Etiquetar las imagenes actuales como `:antes-2026.11.12` (api, migrate, frontend) y las nuevas como `:latest`.
- En `/home/esaldivar/segel/fs`: `export APP_ENV_FILE=.env.segel` y `docker compose --env-file .env.segel -f docker-compose.yml up -d --no-build migrate api frontend`, luego `docker compose ... restart frontend` (como `up.sh`). Solo esos tres servicios; `postgres` y el loader DNIT no se tocan.
- Con `migrate` terminado: el SQL de SALUMAX (RN-03, DSF-010b), una sola fila. El contexto se recalcula en el proximo `GET /me/context`; no hace falta reiniciar.

### 2.4 Verificacion sin emitir (VPS y estacion por tunel)

| Que | Como | Esperado |
|---|---|---|
| Migraciones | `docker logs segel-fs-migrate-1` y `select count(*), max(version) from schema_migrations` | `0046` a `0049` aplicadas; 49 |
| Version | `curl -sI http://10.100.0.145:8092/api/v1/health` y `/app/` | `X-App-Version: <sha>`; 200 |
| Salud | `docker ps` (api, frontend `healthy`); salud de FE por la red interna | OK |
| Datos | `select count(*) from facturas_operativas`; `select count(*), count(*) filter (where moneda='PYG') from catalogo_items where deleted_at is null`; `select count(*) from factura_items_snapshot where descuento <> 0 or descuento_global <> 0`; facturadores y usuarios | Iguales a antes; todos PYG; 0 lineas con descuento |
| Remision | `select emisor_id, fe_consumer_permisos, fe_tipos_documento from facturadores where deleted_at is null` | SALUMAX con `["NRE_EMIT"]` y `["NRE"]`; los otros tres vacios (CA-06) |
| Log | `docker logs --since 10m segel-fs-api-1 | grep -c '"level":50'` | 0 |
| Verificacion fiscal | `select min(verificacion_next_at) from facturas_operativas where estado in ('PENDIENTE_SIFEN','EMITIENDO')` | fecha futura o sin pendientes |
| Pantallas (CA-08) | Con el usuario de prueba que indique el usuario, o el usuario mismo | sin "Proximo numero"; columna Descuento; selector de moneda; agenda en tabla |

### 2.5 Cierre

- Evidencia en `TASKS_DESPLIEGUE_SEGEL_FS_v0.3` (E-1).
- `docs/BACKLOG.md`: filas a **DONE, en produccion**; memoria del proyecto actualizada.
- Aviso a FE con el commit desplegado.
- Mensaje a los operadores si D-6 lo pide.

## 3. Vuelta atras (RN-07)

1. `docker compose ... stop api frontend`.
2. Reetiquetar `:antes-2026.11.12` como `:latest` (api, migrate, frontend).
3. Si hace falta volver la remision de SALUMAX: `update facturadores set fe_consumer_permisos = '[]', fe_tipos_documento = '[]' where emisor_id = '80018828-4'`.
4. Restaurar el respaldo (`pg_restore --clean` sobre la base de FS) **solo si** hace falta volver el esquema; si la vuelta es por la app y no por datos, basta con las imagenes (las columnas nuevas no molestan a la version anterior: `precio_unitario numeric` se lee como numero y las columnas con default no se insertan).
5. `up -d --no-build migrate api frontend` y `restart frontend`; verificar `X-App-Version: ed8b493`.

## 4. Riesgos

- **`precio_unitario` a `numeric`.** Irreversible en caliente si ya hubiera precios con decimales; el mismo dia no los habra. Mitigacion: respaldo y vuelta atras por imagenes.
- **Re-importacion de un facturador.** Reescribe la clave del consumidor y activaria la remision si FE ya le dio permiso y numerador. Por eso SALUMAX se habilita por SQL (D-3) y no se re-importa nadie en esta version.
- **Licitaciones (003) de SALUMAX intenta una remision.** FE rechaza antes de numerar; FS deja la nota en error a corregir con el mensaje "Pedila a Segel" (D-4, probado con SALUMAX en SIFEN test, NRE-035).
- **Clientes cargados con RUC sin DV despues del despliegue.** Ya no se puede; el operador ve el mensaje y corrige. Mitigacion: D-6.
- **Datos del ensayo en el stack local distintos de produccion** (padron DNIT presente, mas facturas). Las pruebas con SALUMAX cubrieron el caso sin padron.
- **Tiempo de SIFEN** no cambia con esta version: sigue el lote de FE y la verificacion de FS (FS-71).

## Regla agregada el 2026-11-12: despliegues de solo frontend

El frontend muestra "Nueva version disponible" cuando su `VITE_APP_VERSION` difiere del `X-App-Version` de la API (`apps/web-operacion/src/api/version.ts`). Por eso:

- si se despliega **solo el frontend**, la imagen se construye con `BUILD_COMMIT_SHA` igual al `X-App-Version` que reporta la API en produccion (y se documenta el commit real del frontend en la evidencia);
- si se despliegan **API y frontend**, los dos del mismo commit, etiquetados con el commit (no con el objeto de un tag anotado: `git rev-parse --short "<tag>^{commit}"`).

Antecedente: E-2 y E-2b de `TASKS_DESPLIEGUE_SEGEL_FS_v0.3`.
