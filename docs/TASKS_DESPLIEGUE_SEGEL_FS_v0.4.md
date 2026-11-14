# TASKS - Despliegue en `segel-fs` v0.4

SPEC: `docs/SPEC_DESPLIEGUE_SEGEL_FS_v0.4.md` · PLAN: `docs/PLAN_DESPLIEGUE_SEGEL_FS_v0.4.md`.

Regla de oro (`AGENTS.md`): nada en `segel-fs` sin la autorizacion explicita del usuario en esta sesion para esa accion, incluidas las lecturas. Las tareas DSF4-001 a DSF4-004 son de la estacion.

| ID | Paso | Tarea | Hecho cuando | Quien | Estado |
|---|---|---|---|---|---|
| DSF4-001 | 1 | SPEC, PLAN y TASKS v0.4; guiones `scripts/segel-fs/prod/{lectura,build,deploy,rollback}.sh` ensayados contra el stack local; `AGENTS.md` y `BACKLOG.md` | Documentos escritos; ensayo E-0 | FS | DONE (2026-11-13), sin commit |
| DSF4-002 | 1 | Decisiones D-1 a D-8 | Respuestas en la SPEC | Usuario | DONE (2026-11-13 03:20Z): todo el procedimiento ahora, USD activado, vuelta atras automatica, prueba del CDC de SALUMAX por el usuario (solo Consultar) |
| DSF4-003 | 1 | Commit de lo propio, push de la rama, regresion final y tag local `segel-fs-2026.11.13` (PLAN §1.2 a §1.4); `git diff 8e5a172..<tag> -- infra` vacio | Todo verde; tag creado | FS (con D-2) | DONE: commit `44359dd` pusheado; shared 43/43, API 987 OK, typecheck, lint y build OK; infra sin diff; tag local `segel-fs-2026.11.13` → `44359dd` |
| DSF4-004 | 1 | Aviso a FE y pedido de `segel-rc4.36` en produccion antes del corte | FE confirma rc4.36 desplegado | FS → FE → usuario | DONE: FE desplego `segel-rc4.36` 03:30:27Z → 03:31:02Z (35 s, respaldo `backups/20261113T032201Z`, imagen api `5410b9161f34`, 357 APPROVED + 1 CANCELLED antes y despues; los 4 consumidores con `SIFEN_DE_CONSULTA`) |
| DSF4-005 | 2 | Lectura previa (PLAN §2.0) | Salida en E-1; esperados fijados | FS (autorizacion) | DONE (03:21Z): API/frontend `8e5a172`, 49 / 0049, 358 documentos (FACTURA EMITIDA 356, ANULADA 1; NC EMITIDA 1), 4 facturadores, 5.297 clientes, 23 usuarios, 0 pendientes, sin variables `FE_NC_*`, FE `fe-segel-api` imagen `sha256:b02aa9abd870` (rc4.34), `/var` 230 G libres, `/home` 3,6 G, 0 errores en 2 h. Esperados: 358 / 0049 |
| DSF4-006 | 2 | Imagenes y transferencia (PLAN §2.1) | CA-01 | FS (autorizacion) | DONE (2026-11-13): `build.sh segel-fs-2026.11.13` → `segel-fs-prod-api:44359dd` (`4da89010a4a5`) y `segel-fs-prod-frontend:44359dd` (`dbaf373e2753`) cargadas en `segel-fs`; CA-01 |
| DSF4-007 | 2 | Respaldo, variables, corte y verificacion (PLAN §2.2 a §2.5) | CA-02 a CA-07 | FS (autorizacion, D-5) | DONE (E-1) |
| DSF4-008 | 2 | Segunda lectura a los 10 minutos | CA-07 | FS (autorizacion) | DONE (03:43Z): `44359dd` en API y frontend, 52 / 0052, 358 documentos, 0 externas, 0 pendientes, variables `true/true`, FE `5410b9161f34` responde, 0 errores en 2 h; API y frontend healthy |
| DSF4-009 | 2 | Pantallas de notas de credito con acceso del usuario; prueba de solo lectura "Traer por CDC" (Consultar, sin Guardar) con el CDC de SALUMAX `01800188284001002001643622026110310393617567` | CA-08 | Usuario | PENDIENTE del usuario |
| DSF4-010 | 3 | Cierre: evidencia, BACKLOG, memoria, aviso a FE | — | FS | DONE (2026-11-13): E-1, BACKLOG FS-136/138/139/140/141/77 en produccion, memoria, aviso a FE |
| DSF4-011 | 3 | Vuelta atras (solo si hizo falta) | E-2 | FS (autorizacion) | — |

## Evidencia

### E-0. Ensayo de los guiones en el stack local (2026-11-13 03:12Z, sin produccion)

`FS_DIR`, `BACKUP_DIR`, `API_URL` y `FRONT_URL` apuntando a `.local/segel-ensayo` (FS `ncu-local3`, FE `fe-segel` `segel-rc4.36`):

- `deploy.sh ncu-local3 ensayo 746 0052 true fe-segel-api rollback_auto`: FE esperado OK; respaldo (dump 873 KB, `env.segel`, `SHA256SUMS`) y restauracion de prueba 746 / 0052 sin avisos; variables fijadas; retag; corte `migrate` → `api` → `frontend` en 34 s; CA-03 `0050,0051,0052` (52); CA-04 `ncu-local3` en API y frontend, `/app/` 200, ambos healthy, FE responde; CA-06 `true/true` en el contenedor; CA-07 0 errores. CA-05 fallo **a proposito** (el stack local tiene 12 externas y 4 combinadas) y disparo la **vuelta atras automatica**, que volvio a `:antes-ensayo`. Corregido despues: esperar el frontend sano antes de leer la version.
- `rollback.sh ensayo`: informa externas y combinadas, vuelve imagenes y `.env.segel` (identico al original), API y frontend healthy.
- `lectura.sh`: corregidas dos consultas heredadas de v0.3 (`group by` sobre una expresion con agregado).
- Guarda de FE cambiada por pedido de FE (las imagenes de `segel-fs` no llevan version en el nombre): compara el id de imagen de `fe-segel-api-1`. Con un id que no coincide, `deploy.sh` aborta en la fase 0 sin tocar nada (exit 4, probado en local).

### E-1. Despliegue en produccion (2026-11-13, 03:32Z a 03:33Z; 00:33 -03)

Orden del usuario en esta sesion (03:20Z): procedimiento completo, `FE_NC_MONEDA_EXTRANJERA=true`, vuelta atras automatica. `ssh segel-fs 'bash -s -- 44359dd 2026.11.13 358 0049 true fe-segel-api-1=sha256:5410b9161f34 rollback_auto' < scripts/segel-fs/prod/deploy.sh` (salida completa en el scratchpad de la sesion, `prod-deploy-2026.11.13.log`):

- Fase 0: `fe-segel-api-1` = `sha256:5410b9161f34…` (rc4.36), guarda OK.
- CA-02: respaldo `/home/esaldivar/segel/backups/fs/20261113T033259Z` (fs.dump 1.285.454 bytes, `env.segel`, `imagenes.txt`, `SHA256SUMS`; 600/700); restauracion de prueba 358 / 0049, 0 avisos.
- Variables: `.env.segel.antes-2026.11.13`; `FE_NC_DESCUENTOS=true`, `FE_NC_MONEDA_EXTRANJERA=true`.
- Retag `:antes-2026.11.13`; corte 03:33:10Z → 03:33:44Z (34 s): `migrate` aplico `0050`, `0051`, `0052` y salio 0; `api` y `frontend` recreados.
- CA-03 `0050,0051,0052` (52). CA-04 `X-App-Version 44359dd` en API y frontend, `/app/` 200, ambos healthy, FE responde por la red interna. CA-05 358 documentos, 0 externas, 0 combinadas. CA-06 `true/true` en el contenedor. CA-07 0 errores desde el corte.
- Vuelta atras disponible: `rollback.sh 2026.11.13` (imagenes `:antes-2026.11.13` = `8e5a172` y frontend `9481fc9`, `.env.segel.antes-2026.11.13`).

### E-2. Hotfix FS-143 y FS-144 en produccion (2026-11-13, 09:42Z a 09:55Z; 06:55 -03)

Autorizacion del usuario en esta sesion para lectura, imagenes y despliegue. Sin migraciones ni cambio de variables.

- Lectura previa (`lectura.sh`): `44359dd` en API y frontend, migraciones 52 / `0052`, 362 documentos (1 externa, 3 combinadas, de las pruebas del usuario), 0 pendientes, 0 errores en 2 h, FE `fe-segel-api-1` = `sha256:5410b9161f34` (rc4.36).
- Imagenes: tag local `segel-fs-2026.11.13.1` = `361e10a` (`4139a25` FS-143, `3613087` FS-144 y sus pruebas); `build.sh` construyo y cargo `segel-fs-prod-api:361e10a` (`612f8e47a896`) y `segel-fs-prod-frontend:361e10a` (`a0cf5ad86957`).
- Primer intento 09:52Z: corte sano (CA-03 a CA-07 bien, `X-App-Version 361e10a`), pero CA-05 exigia 0 externas y 0 combinadas (condicion del estreno de 0050-0052) y la **vuelta atras automatica** volvio a `44359dd`, healthy. Corregido en `d708876`: `ESP_EXTERNAS` y `ESP_COMBINADAS` con lo que informa la lectura.
- Segundo intento: respaldo `/home/esaldivar/segel/backups/fs/20261113T095447Z`, restauracion de prueba 362 / `0052` sin avisos; corte 09:54:59Z → 09:55:33Z (34 s), `migrate` sin migraciones nuevas; CA-03 `0050,0051,0052`; CA-04 `361e10a` en API y frontend, `/app/` 200, ambos healthy, FE responde; CA-05 362 / 1 externa / 3 combinadas (lo esperado); CA-06 `true/true`; CA-07 0 errores. Salida completa en el scratchpad de la sesion (`prod-deploy-2026.11.13.1-b.log`).
- Vuelta atras disponible: `rollback.sh 2026.11.13.1` (`:antes-2026.11.13.1` = `44359dd`: api `4da89010a4a5`, frontend `dbaf373e2753`).
- Pendiente: el usuario repite en produccion sus casos (0000361 solo ajuste sobre el total; 0000360 motivo con la factura entera).

### E-3. Hotfix de dirección del cliente (FS-152 a FS-155) — REEMPLAZADO por E-4 (no se ejecutó solo; su contenido va en E-4)

Alcance: FS `061e36a` (hotfix `2fb80c9` más la aclaración de la ficha, D-6) (API, migración `0053_domicilio_cliente.sql` aditiva y frontend; `SPEC/PLAN/TASKS_DIRECCION_RECEPTOR_v0.1`) y FE `segel-rc4.37.1` (`cbec3e7`, plantillas del KuDE y validaciones del domicilio; sesión `facturacion-electronica-da`). Validado en el stack local de ensayo con las dos versiones juntas (TASKS DIR-012 a DIR-014 y cierre DIR-019: 56/56, 67/67, 25/25, 6/6, 1/1, 13/13, reconocimiento sin subas; SIFEN test 1010689, 1010690 y remisión 0000515). Sin cambio de variables.

Orden y autorizaciones (cada paso con autorización explícita del usuario, Regla de Oro):

1. **FE despliega `segel-rc4.37.1`** en `segel-fs` (lo hace la sesión de FE, con orden del usuario en esa sesión) e informa el id de imagen de `fe-segel-api-1` para la guarda.
2. **Lectura previa** (`lectura.sh`): versión de API y frontend (`361e10a`), migraciones 52 / `0052`, documentos, externas y combinadas, pendientes, errores e id de FE.
3. **Imágenes:** tag local `segel-fs-2026.11.13.2` = `061e36a`; `build.sh segel-fs-2026.11.13.2` construye y carga `segel-fs-prod-api:061e36a` y `segel-fs-prod-frontend:061e36a`.
4. **Corte:** `ssh segel-fs 'ESP_MIGRACIONES=0050,0051,0052,0053 ESP_EXTERNAS=<lectura> ESP_COMBINADAS=<lectura> bash -s -- 061e36a 2026.11.13.2 <documentos> 0052 true fe-segel-api-1=<id rc4.37.1> rollback_auto' < scripts/segel-fs/prod/deploy.sh`. El respaldo se restaura de prueba con la migración `0052` antes del corte; `migrate` aplica `0053`.
5. **Verificación:** CA-03 `0050,0051,0052,0053`; CA-04 `X-App-Version 061e36a` en API y frontend; CA-05 documentos, externas y combinadas iguales a la lectura; CA-07 0 errores. En pantalla, con la cuenta de revisión: "Agregar dirección", Departamento → Ciudad y una factura de prueba solo si el usuario la pide.
6. **Vuelta atrás:** `rollback.sh 2026.11.13.2` (imágenes `:antes-2026.11.13.2` = `361e10a`). Las columnas de `0053` son nulas y la versión anterior las ignora.

Ajuste de `deploy.sh` para este corte: la verificación CA-03 comparaba con la lista fija `0050,0051,0052` y, con `0053`, habría disparado la vuelta atrás automática. Ahora usa `ESP_MIGRACIONES` (por omisión la lista anterior), como se hizo con `ESP_EXTERNAS` y `ESP_COMBINADAS` en E-2.

Después del despliegue: los clientes ya cargados conservan su calle y su dirección no sale en la factura hasta completar número, departamento y ciudad (RN-05).

**Ensayo de E-3 en el stack local (2026-11-13, 23:11Z; sin producción).** Stack de ensayo llevado al estado de producción (FS `3613087`, migración `0052`, sin las columnas de `0053`); imágenes `segel-fs-prod-api:061e36a` y `segel-fs-prod-frontend:061e36a` construidas desde el tag como `build.sh`, sin transferir. `lectura.sh` (variables al stack local): 52 / `0052`, 781 documentos, 16 externas, 12 combinadas, 0 errores. `ESP_MIGRACIONES=0050,0051,0052,0053 ESP_EXTERNAS=16 ESP_COMBINADAS=12 deploy.sh 061e36a ensayo-dir 781 0052 true fe-segel-api-1=sha256:d79fabd0c6e1 rollback_auto` → **OK**, exit 0: guarda de FE OK; respaldo y restauración de prueba 781 / `0052` sin avisos; corte 23:11:36Z → 23:12:09Z (33 s), `migrate` aplicó `0053`; CA-03 `0050,0051,0052,0053` (53); CA-04 `061e36a` en API y frontend, `/app/` 200, healthy, FE responde; CA-05 781 / 16 / 12; CA-06 `true/true`; CA-07 0 errores. Playwright de pantalla después del corte 17/17. `rollback.sh ensayo-dir` → OK: volvió a `3613087`, healthy, con las columnas de `0053` presentes (la versión anterior las ignora). Después se dejó el stack en `061e36a`. Registros: `test-results/direccion-receptor/ensayo-deploy.log` y `ensayo-rollback.log`.

### E-4. Dirección del cliente + recibos v0.6 con FE `segel-rc4.37.2` — PREPARADO y ensayado, sin ejecutar (2026-11-14)

Alcance FS: tag local `segel-fs-2026.11.14` = `4a3beb3` (rama `feat/identidad-segel`). Incluye E-3 (`061e36a`, FS-152/154/155, migración `0053_domicilio_cliente.sql` aditiva) más `RECIBO_DINERO_v0.6` (FS-158; sin migración). Migraciones nuevas respecto de producción (`361e10a`, `0052`): solo `0053`. FE: tren `segel-rc4.37.2` (`f70812b`; recibo con perfil y moneda, descuento global en el KuDE, migración FE `053`), desplegado por FE.

Orden (cada paso con autorización explícita del usuario en esta sesión; Regla de Oro):

1. FE despliega `segel-rc4.37.2` en `segel-fs`, hace su humo e informa el id de imagen de `fe-segel-api-1`.
2. `lectura.sh` en `segel-fs`: versión `361e10a`, migraciones 52 / `0052`, documentos, externas, combinadas, pendientes e id de FE.
3. `build.sh segel-fs-2026.11.14`: construye `segel-fs-prod-api:4a3beb3` y `segel-fs-prod-frontend:4a3beb3` y los transfiere.
4. Corte: `ssh segel-fs 'ESP_MIGRACIONES=0050,0051,0052,0053 ESP_EXTERNAS=<lectura> ESP_COMBINADAS=<lectura> bash -s -- 4a3beb3 2026.11.14 <documentos> 0052 true fe-segel-api-1=<id rc4.37.2> rollback_auto' < scripts/segel-fs/prod/deploy.sh`.
5. Verificación: CA-03 `0050,0051,0052,0053`; CA-04 `X-App-Version 4a3beb3`; CA-05 conteos iguales a la lectura; CA-07 0 errores.
6. Humo de FS, solo lectura salvo que el usuario pida emitir:
   - formulario de recibo con "Moneda" (Gs. y USD), sin guardar;
   - Nueva factura con "Agregar dirección" y Departamento → Ciudad;
   - KuDE de una factura existente por su enlace público.
   - Un recibo USD real solo con la orden del usuario y en el emisor que indique.
7. Vuelta atrás: `rollback.sh 2026.11.14` → imágenes `:antes-2026.11.14` (`361e10a`). Las columnas de `0053` quedan nulas y la versión anterior las ignora. FE no necesita volver: `361e10a` funciona con `rc4.37.2`, porque el recibo de `361e10a` solo ofrece PYG y la factura no cambió de API.

**Ensayo en el stack local (2026-11-14 02:41Z a 02:44Z, sin producción).**
- Stack `.local/segel-ensayo` (FS `061e36a-rdm06`, `0053` ya aplicada) con FE `fe-segel` en `55ff65f`: mismo `src` que `segel-rc4.37.2`; solo difieren 3 archivos de docs, verificado con `git diff`.
- Imágenes `segel-fs-prod-api:4a3beb3` y `segel-fs-prod-frontend:4a3beb3` construidas desde el tag como `build.sh`, sin transferir.
- `lectura.sh` (variables al stack local): 53 / `0053`, 783 documentos, 16 externas, 12 combinadas, 0 pendientes, 0 errores.
- `deploy.sh 4a3beb3 ensayo-rdm 783 0053 true fe-segel-api-1=sha256:845c89119592 rollback_auto` con `ESP_MIGRACIONES=0050,0051,0052,0053 ESP_EXTERNAS=16 ESP_COMBINADAS=12` → **OK**, exit 0:
  - corte 02:41:47Z → 02:42:20Z (33 s);
  - CA-03 53;
  - CA-04 `4a3beb3` en API y frontend, `/app/` 200, healthy, FE responde;
  - CA-05 783 / 16 / 12;
  - CA-06 `true/true`;
  - CA-07 0 errores.
- `rollback.sh ensayo-rdm` → OK, healthy.
- Segundo `deploy.sh`: **abortó en la fase 1b** (restauración de prueba del respaldo), con `createdb` sin conexión al Postgres temporal. El stack no se tocó y siguió en la versión anterior. El tercer intento (`ensayo-rdm3`) dio **OK** con los mismos CA (corte 02:43:23Z → 02:43:56Z). Registrado como BACKLOG FS-170. Si pasa en producción, el guion aborta antes del corte y se reintenta.
- Humo después del corte: `playwright-recibo-moneda.cjs api` 7/7.
- Logs en el scratchpad de la sesión: `ensayo-deploy-rdm.log`, `ensayo-rollback-rdm.log`, `ensayo-deploy-rdm2.log` y `ensayo-deploy-rdm3.log`.

