# SPEC Indices Del Padron DNIT v0.1

**Fecha:** 2026-11-08 · **Rama:** `feat/identidad-segel` · **Estado:** implementado y validado en local (TASKS); sin despliegue. Pedido del usuario: "encaremos esto ahora" (FS-42).

## Alineacion

- `AGENTS.md`, `docs/METODOLOGIA_SDD.md`.
- `docs/BACKLOG.md`, FS-42 (dato de FE, 2026-11-08).
- `db/migrations/0014_dnit_ruc_contribuyentes.sql` (tabla e indices) y `dnit-ruc-loader/` (importacion mensual).
- `docs/SPEC_CORRECCIONES_ENSAYO_VOLUMEN_v0.1.md`, RN-07: la base de FS pasa de 20 MB a 670 MB con el padron, en `/var` de `segel-fs` (9,3 GiB).

## Hallazgo

Medido en el stack del ensayo con el padron completo (2.028.067 filas): la tabla `dnit_ruc_contribuyentes` ocupa 328 MB de datos y 330 MB de indices.

| Indice | Tamano | Quien lo usa |
|---|---|---|
| `dnit_ruc_contribuyentes_pkey` (`id`) | 43 MB | Clave primaria |
| `uq_dnit_ruc` (`ruc_sin_dv`, `dv`) | 85 MB | Unicidad del padron; cubre las dos consultas de la API |
| `idx_dnit_ruc` (`ruc`) | 86 MB | Nadie |
| `idx_dnit_ruc_sin_dv` (`ruc_sin_dv`) | 64 MB | Repite la primera columna de `uq_dnit_ruc` |
| `idx_dnit_estado` (`estado`) | 13 MB | Nadie |
| `idx_dnit_razon_social_tsv` (GIN) | 39 MB | Nadie: no hay busqueda por nombre en el padron |

Las unicas consultas al padron son las de `findDnitByDocumento` (`apps/api/src/modules/clientes/clientes.repository.ts`): `where ruc_sin_dv = $1 and dv = $2` y `where ruc_sin_dv = $1 order by updated_at desc limit 2`. El cargador (`dnit-ruc-loader/src/import.js`) solo vacia la tabla y la rellena desde `dnit_ruc_contribuyentes_staging`; no consulta por estado ni por nombre.

## Reglas

- **RN-01.** Se eliminan `idx_dnit_ruc`, `idx_dnit_ruc_sin_dv`, `idx_dnit_estado` e `idx_dnit_razon_social_tsv` con una migracion nueva (`0039`). Se conservan la clave primaria y `uq_dnit_ruc`.
- **RN-02.** Las dos consultas de la API siguen resolviendose por indice (`uq_dnit_ruc`), con un tiempo del mismo orden (alrededor de 1 ms en el ensayo).
- **RN-03.** El SQL de referencia del cargador (`dnit-ruc-loader/sql/001_init.sql`) deja de crear esos indices, para que una instalacion nueva no los recree.
- **RN-04.** Las columnas no cambian: `ruc` es generada y se lee en la API; volverla virtual requiere Postgres 18. Las fechas y `fuente_archivo` repetidas quedan fuera de alcance.
- **RN-05.** Borrar un indice toma un bloqueo exclusivo breve sobre la tabla; en produccion se aplica con el resto de las migraciones del despliegue.

## Criterios De Aceptacion

- **CA-01.** En el ensayo, despues de `0039`: los indices de la tabla bajan de unos 330 MB a unos 129 MB y las dos consultas usan `uq_dnit_ruc`.
- **CA-02.** La busqueda de un comprador por RUC desde la API devuelve el mismo resultado que antes.
- **CA-03.** Una importacion completa del padron despues del cambio termina sin errores; se registra su duracion frente a los 142 s de antes.
- **CA-04.** `npm run test`, `typecheck` y `lint` de `api` sin regresiones; `bash scripts/deploy.sh` aplica la migracion.
