# PLAN Carga Segel en VPS v0.1

## Alineacion

- `docs/SPEC_CARGA_SEGEL_FS_v0.1.md`

## Enfoque

Se reutiliza `scripts/carga/simulate.cjs` con `CARGA_PROYECTO=segel-carga`, cuyo estado queda en `.local/segel-carga`, separado de la verificacion local. El trafico pasa por el tunel a `localhost:18092`, que la guarda de destino ya admite.

## Cambios

- `simulate.cjs`: `--sin-correo` y `--prob-nc`. Sin esas opciones se comporta igual que antes.
- `scripts/segel-fs/carga-seed.cjs`: crea operadores, clientes e items.
- `scripts/segel-fs/carga-monitor.sh`: muestrea memoria, CPU, disco y contenedores por SSH, y corta segun RN-04.
- `scripts/segel-fs/carga-resumen.cjs`: tiempos, estados y comprobacion de duplicados.

## Operadores

Se crean por el backoffice. La aceptacion de T&C se registra por base de datos, porque un OTP real generaria rebotes. El tenant de prueba pasa a plan `ENTERPRISE` para admitir los usuarios.

## Limpieza

Los usuarios `carga.*` quedan desactivados al terminar. Las facturas quedan como evidencia hasta la baja de test (Fase 8 del runbook).
