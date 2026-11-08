# PLAN Indices Del Padron DNIT v0.1

## Alineacion

- `docs/SPEC_INDICES_PADRON_DNIT_v0.1.md`
- `docs/TASKS_INDICES_PADRON_DNIT_v0.1.md`

## Cambios

1. `db/migrations/0039_dnit_indices_redundantes.sql`: `drop index if exists` de los cuatro indices de RN-01. No se edita `0014` (el runner valida checksums).
2. `dnit-ruc-loader/sql/001_init.sql`: quitar los cuatro `CREATE INDEX` y dejar un comentario con el motivo.
3. Sin cambios de codigo en la API ni en el cargador.

## Validacion

1. Antes de escribir la migracion, en el ensayo y dentro de una transaccion revertida: borrar los cuatro indices, `EXPLAIN ANALYZE` de las dos consultas y tamano de los indices. Hecho el 2026-11-08: las dos usan `uq_dnit_ruc`, alrededor de 1 ms, indices en 129 MB.
2. Suites de `api`; `bash scripts/deploy.sh` (fs-cm) aplica `0039`.
3. Ensayo: reconstruir FS desde el commit, `up.sh` (el servicio `migrate` aplica `0039`), tamanos y planes despues, consulta por RUC por la API (`GET /api/v1/clientes/dnit/autocomplete`), e importacion completa con medicion.

## Riesgos

| Riesgo | Mitigacion |
|---|---|
| Una consulta futura por nombre o por estado necesitaria un indice | Se crea con su propia cadena cuando exista la funcion |
| El bloqueo del `drop index` frena consultas al padron | Es breve y se hace en el despliegue |
