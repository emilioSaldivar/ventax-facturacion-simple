# SPEC API tras reinicio de PostgreSQL v0.1

**Fecha:** 2026-11-05. **Origen:** hallazgo FS-02, fallo F6 de `real-fallos`.

## Problema

Si PostgreSQL se reinicia, el pool emite `error` en una conexión ociosa. Sin manejador, Node termina el proceso con exit 1, y sin política de reinicio la API y sus dos workers quedan abajo hasta que alguien los levante.

## Reglas

- **RN-01.** Un error en una conexión ociosa del pool se registra y no termina el proceso.
- **RN-02.** El registro no incluye la cadena de conexión.
- **RN-03.** Cuando la base vuelve, la API atiende y los workers siguen, sin intervención.
- **RN-04.** Los servicios de larga vida tienen `restart: unless-stopped`, como segunda barrera. `migrate` no, porque termina.

## Criterios de aceptación

- **CA-01.** Con `docker restart` de postgres, el contenedor de la API no se reinicia ni termina: mismo `StartedAt`.
- **CA-02.** Tras volver la base, login y emisión funcionan, y el worker procesa una factura nueva.
- **CA-03.** El contenedor de la API queda con `RestartPolicy=unless-stopped`. `docker kill` y `docker stop` cuentan como detención manual y no reinician, por diseño de Docker; una caída real del proceso no se pudo provocar sin root en el host.

## Fuera de alcance

Lo que ve el operador durante la caída. Producción: este cambio de compose se aplica al recrear contenedores, en su deploy, cuando el usuario lo decida.
