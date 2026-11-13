# TASKS - Despliegue en `segel-fs` v0.4

SPEC: `docs/SPEC_DESPLIEGUE_SEGEL_FS_v0.4.md` · PLAN: `docs/PLAN_DESPLIEGUE_SEGEL_FS_v0.4.md`.

Regla de oro (`AGENTS.md`): nada en `segel-fs` sin la autorizacion explicita del usuario en esta sesion para esa accion, incluidas las lecturas. Las tareas DSF4-001 a DSF4-004 son de la estacion.

| ID | Paso | Tarea | Hecho cuando | Quien | Estado |
|---|---|---|---|---|---|
| DSF4-001 | 1 | SPEC, PLAN y TASKS v0.4; guiones `scripts/segel-fs/prod/{lectura,build,deploy,rollback}.sh` ensayados contra el stack local; `AGENTS.md` y `BACKLOG.md` | Documentos escritos; ensayo E-0 | FS | DONE (2026-11-13), sin commit |
| DSF4-002 | 1 | Decisiones D-1 a D-8 | Respuestas en la SPEC | Usuario | PENDIENTE |
| DSF4-003 | 1 | Commit de lo propio, push de la rama, regresion final y tag local `segel-fs-2026.11.13` (PLAN §1.2 a §1.4); `git diff 8e5a172..<tag> -- infra` vacio | Todo verde; tag creado | FS (con D-2) | PENDIENTE |
| DSF4-004 | 1 | Aviso a FE y pedido de `segel-rc4.36` en produccion antes del corte | FE confirma rc4.36 desplegado | FS → FE → usuario | PENDIENTE |
| DSF4-005 | 2 | Lectura previa (PLAN §2.0) | Salida en E-1; esperados fijados | FS (autorizacion) | PENDIENTE |
| DSF4-006 | 2 | Imagenes y transferencia (PLAN §2.1) | CA-01 | FS (autorizacion) | PENDIENTE |
| DSF4-007 | 2 | Respaldo, variables, corte y verificacion (PLAN §2.2 a §2.5) | CA-02 a CA-07 | FS (autorizacion, D-5) | PENDIENTE |
| DSF4-008 | 2 | Segunda lectura a los 10 minutos | CA-07 | FS (autorizacion) | PENDIENTE |
| DSF4-009 | 2 | Pantallas de notas de credito con acceso del usuario | CA-08 | Usuario | PENDIENTE |
| DSF4-010 | 3 | Cierre: evidencia, BACKLOG, memoria, aviso a FE | — | FS | PENDIENTE |
| DSF4-011 | 3 | Vuelta atras (solo si hizo falta) | E-2 | FS (autorizacion) | — |

## Evidencia

### E-0. Ensayo de los guiones en el stack local (2026-11-13 03:12Z, sin produccion)

`FS_DIR`, `BACKUP_DIR`, `API_URL` y `FRONT_URL` apuntando a `.local/segel-ensayo` (FS `ncu-local3`, FE `fe-segel` `segel-rc4.36`):

- `deploy.sh ncu-local3 ensayo 746 0052 true fe-segel-api rollback_auto`: FE esperado OK; respaldo (dump 873 KB, `env.segel`, `SHA256SUMS`) y restauracion de prueba 746 / 0052 sin avisos; variables fijadas; retag; corte `migrate` → `api` → `frontend` en 34 s; CA-03 `0050,0051,0052` (52); CA-04 `ncu-local3` en API y frontend, `/app/` 200, ambos healthy, FE responde; CA-06 `true/true` en el contenedor; CA-07 0 errores. CA-05 fallo **a proposito** (el stack local tiene 12 externas y 4 combinadas) y disparo la **vuelta atras automatica**, que volvio a `:antes-ensayo`. Corregido despues: esperar el frontend sano antes de leer la version.
- `rollback.sh ensayo`: informa externas y combinadas, vuelve imagenes y `.env.segel` (identico al original), API y frontend healthy.
- `lectura.sh`: corregidas dos consultas heredadas de v0.3 (`group by` sobre una expresion con agregado).
- Guarda de FE cambiada por pedido de FE (las imagenes de `segel-fs` no llevan version en el nombre): compara el id de imagen de `fe-segel-api-1`. Con un id que no coincide, `deploy.sh` aborta en la fase 0 sin tocar nada (exit 4, probado en local).
