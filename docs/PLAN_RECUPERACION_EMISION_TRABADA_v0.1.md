# PLAN Recuperación de emisión trabada v0.1

- `facturas.repository.ts`, `claimNextPendingEmission`: sumar al `where` `o.estado = 'PROCESSING' and o.locked_at < now() - interval '5 minutes'`. Mantiene `for update skip locked`.
- Orden: vencidos junto con los pendientes, por `next_attempt_at`. Un `PROCESSING` tiene su `next_attempt_at` en el pasado, así que entra primero.
- Sin migración: la tabla ya tiene `locked_at`.
- Pruebas: integración en Postgres; fallo real en stack aislado, con un trabajo vencido.

**Al desplegar:** cualquier trabajo ya trabado se reenvía en el primer tick. Antes, contar los `PROCESSING` vencidos, con `perfil-produccion.sql`, para saber qué esperar.
