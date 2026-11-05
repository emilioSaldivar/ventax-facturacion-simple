# PLAN API tras reinicio de PostgreSQL v0.1

- `apps/api/src/db/pool.ts`: `pool.on("error", ...)` con `logger.error`, registrando solo código y mensaje.
- `docker-compose.yml`: `restart: unless-stopped` en `postgres`, `api`, `frontend` y `dnit-ruc-loader-cron`.
- Pruebas: unitaria de que el pool tiene manejador; CA-01 a CA-03 en stack aislado, con `scripts/carga/fallos.sh` o su equivalente.

**Riesgo:** con reinicio automático, un error de configuración deja a la API reiniciando en bucle. Se ve en `docker ps`, y es preferible a quedar abajo sin aviso.
