# PLAN - Despliegue en `segel-fs` v0.4

SPEC: `docs/SPEC_DESPLIEGUE_SEGEL_FS_v0.4.md` · TASKS: `docs/TASKS_DESPLIEGUE_SEGEL_FS_v0.4.md`.

Repite el procedimiento de `PLAN_DESPLIEGUE_SEGEL_FS_v0.3` §2 con tres diferencias: migraciones `0050` a `0052`, dos variables en `.env.segel` y FE `segel-rc4.36` desplegado antes por FE. Los guiones son los de v0.3 adaptados y quedan versionados en `scripts/segel-fs/prod/` (antes vivian en un scratchpad).

## Quien hace que

| Paso | Quien | Donde |
|---|---|---|
| Decisiones D-1 a D-8 | Usuario | Esta sesion |
| Commit, push de la rama, tag local, regresion final | Sesion de FS | Estacion |
| Despliegue de FE `segel-rc4.36` | Sesion de FE, con la orden del usuario en esa sesion | `segel-fs` |
| Lectura previa, imagenes, respaldo, variables, corte, verificacion, evidencia | Sesion de FS, **cada accion en produccion con la autorizacion del usuario** (D-5) | Estacion y `ssh segel-fs` |
| Pantallas (CA-08) | Usuario | App de produccion |

## 1. Antes del dia (estacion, sin produccion)

1. Esta cadena en `AGENTS.md` y `BACKLOG.md`.
2. Commit de los cambios de esta sesion (FS-141, cadena v0.4, guiones), sin los archivos de otras sesiones (en `AGENTS.md` y `BACKLOG.md` se agregan solo las lineas propias al indice). Push de `feat/identidad-segel` (D-2).
3. Regresion final sobre ese commit en el stack local reconstruido con el commit: `test`, `typecheck`, `lint` de `apps/api` y `packages/shared`; `typecheck` y `build` de `apps/web-operacion`; Playwright sin emitir `playwright-nc-unificada.cjs` (con `ENSAYO_SIN_EMITIR=1` sobre facturas con saldo entero) y `playwright-documentos-escritorio.cjs`.
4. Tag anotado local `segel-fs-2026.11.13` sobre ese commit (sin push del tag, como v0.3).
5. Mensaje a la sesion de FE: version de FS, migraciones, variables, y pedido de desplegar `segel-rc4.36` antes del corte de FS.

## 2. El dia

### 2.0 Lectura previa (solo lectura, autorizacion propia)

`ssh segel-fs 'bash -s' < scripts/segel-fs/prod/lectura.sh`: version de API y frontend, migraciones, conteos (facturas por tipo y estado, notas, usuarios, facturadores, clientes), pendientes de verificacion, version de FE por la red interna, presencia de `FE_NC_DESCUENTOS` y `FE_NC_MONEDA_EXTRANJERA` en `.env.segel` (solo nombre y valor de esas dos), espacio en `/var` y `/home`. Los conteos de facturas y la ultima migracion son el esperado del respaldo (2.2).

### 2.1 Imagenes (estacion → VPS)

`scripts/segel-fs/prod/build.sh segel-fs-2026.11.13`: `git archive` del tag, `docker build --network host` de API y frontend con `BUILD_COMMIT_SHA=<sha del commit>`, `docker save | gzip | ssh segel-fs docker load`. Etiquetas `segel-fs-prod-{api,frontend}:<sha>`.

### 2.2 a 2.5 Respaldo, variables, corte y verificacion (VPS)

`ssh segel-fs 'bash -s' < scripts/segel-fs/prod/deploy.sh <sha> 2026.11.13 <facturas> 0049 <moneda> fe-segel-api-1=<id de FE> [rollback_auto]`:

1. **Respaldo** `pg_dump -Fc` sin los datos del padron DNIT en `backups/fs/<ts>Z` (700/600, `imagenes.txt`, `SHA256SUMS`, copia de `.env.segel`); restauracion de prueba en `postgres:16-alpine` sin red; si facturas o ultima migracion no coinciden, **aborta sin tocar nada**.
2. **FE listo:** `docker inspect fe-segel-api-1 --format '{{.Image}}'` debe empezar con el id que informe FE para rc4.36 (hoy `sha256:5410b9161f34`); si no, aborta sin tocar nada (D-3). La salud de FE se lee por `facturacion-electronica:8080` o `fe-segel-api-1:8080`.
3. **Variables:** copia `.env.segel` a `.env.segel.antes-2026.11.13` y fija `FE_NC_DESCUENTOS=true` y `FE_NC_MONEDA_EXTRANJERA=<moneda>` (reemplaza si existen, agrega si no). No imprime otras lineas.
4. **Retag** de las imagenes actuales a `:antes-2026.11.13` y las nuevas a `:latest`.
5. **Corte:** `migrate` (debe salir 0) → `api` (healthy) → `frontend` (healthy), cada uno con `up -d --no-build --no-deps --force-recreate`.
6. **Verificacion** (CA-03 a CA-07): migraciones `0050,0051,0052`; `X-App-Version` en API y frontend; `/app/` 200; contenedores; FE por la red interna; conteos iguales; 0 externas y 0 `COMBINADA`; variables en el contenedor; errores de la API desde el corte.
7. Si una verificacion de 6 falla y D-5 lo autoriza: **vuelta atras automatica** (§3).

Segunda lectura de errores a los 10 minutos (CA-07), con `lectura.sh`.

### 2.6 Cierre

Evidencia E-1 en TASKS; BACKLOG FS-136, FS-138, FS-139, FS-140, FS-141 a **DONE en produccion**; memoria; aviso a FE con el commit desplegado.

## 3. Vuelta atras

`ssh segel-fs 'bash -s' < scripts/segel-fs/prod/rollback.sh 2026.11.13`: detiene `api` y `frontend`, reetiqueta `:antes-2026.11.13` como `:latest`, restaura `.env.segel.antes-2026.11.13`, recrea `api` y `frontend` (sin `migrate`: las columnas nuevas no molestan a `8e5a172`, que no las lee ni las escribe) y muestra `X-App-Version` y conteo de facturas externas. **No** borra filas de `schema_migrations` ni columnas: si se vuelve a desplegar la version nueva, `migrate` ve las tres aplicadas. Si hubiera facturas externas cargadas, se informan para decidir con el usuario (la version anterior las listaria como propias).

## 4. Riesgos

- **FE no desplegado o en otra version:** el guion aborta antes del corte (paso 2).
- **Checksum de migraciones:** el runner valida checksums; `0050` y `0051` estan commiteadas desde `cf8e1a7`/`d10ca45` sin cambios y `0052` es nueva. No se edita ninguna migracion ya aplicada.
- **`.env.segel` mal escrito:** copia previa y vuelta atras la restaura; el guion solo toca dos claves.
- **Disco:** dos imagenes nuevas (~400 MB en total con las previas de v0.3 ya presentes); la lectura previa mide `/var` y si queda menos de 1 GiB libre se pide al usuario borrar imagenes `:antes-2026.11.12*` antes.
- **Operadores con la pestaña abierta:** ven "Nueva versión disponible" y recargan (comportamiento de siempre).
