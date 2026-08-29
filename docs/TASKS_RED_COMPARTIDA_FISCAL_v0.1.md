# TASKS Red Compartida Con Facturacion Electronica v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_RED_COMPARTIDA_FISCAL_v0.1.md`
- `docs/PLAN_RED_COMPARTIDA_FISCAL_v0.1.md`

## Estado General

- `SPEC`: DONE
- `PLAN`: DONE
- `TASKS`: PENDIENTE DE IMPLEMENTACION — deliberadamente secuenciado **despues**
  de `docs/TASKS_ALINEACION_CLAVE_VERIFICACION_FISCAL_v0.1.md` (ACV-011/012),
  para no mezclar dos cambios de riesgo distinto en la misma ventana de deploy.

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
| --- | --- | --- | --- | --- |
| RCF-001 | SDD | Crear cadena SPEC/PLAN/TASKS de esta iniciativa | DONE | Documentos alineados y referenciados desde `docs/BACKLOG.md` |
| RCF-002 | Verificacion | Mapear la topologia real de red en la VPS y el estandar declarado por `facturacion-electronica` | DONE | `ventax_fiscal_prod`/`_test`, sus miembros actuales y el alias `facturacion-electronica` confirmados por inspeccion directa |
| RCF-003 | Config | Actualizar `.env.production.example` y `.env.staging.example` del repo con los nuevos defaults documentados | DONE | `FE_DOCKER_NETWORK` y `FE_API_BASE_URL` reflejan el estandar en ambos ejemplos |
| RCF-003b | Backend/infra | `scripts/deploy.sh`: agregar `ensure_service_on_fiscal_network`, verificacion idempotente post-`up -d` (conecta solo si falta, nunca falla el deploy) | DONE | Probado localmente contra un contenedor y una red Docker real: primera corrida conecta, segunda detecta "ya conectado" sin error |
| RCF-004 | VPS staging | Editar `.env.staging` real en la VPS y redeploy solo de staging | PENDIENTE | `docker inspect` muestra el `api` de staging unido a `ventax_fiscal_test` |
| RCF-004b | VPS staging | Redeploy una segunda vez, sin cambios, inmediatamente despues | PENDIENTE | El segundo deploy loguea "ya esta conectado" para `ventax_fiscal_test`, sin error ni reconexion |
| RCF-005 | VPS staging | Verificar alcance real desde dentro del contenedor: DNS + TCP + HTTP 200 | PENDIENTE | Evidencia de los tres chequeos registrada en este documento |
| RCF-006 | VPS staging | Prueba funcional de extremo a extremo (accion real que dependa del gateway fiscal) | PENDIENTE | 200/OK real en logs, no solo alcance de red |
| RCF-007 | VPS produccion | Editar `.env.production` real en la VPS y redeploy solo de produccion | PENDIENTE | `docker inspect` muestra el `api` de produccion unido a `ventax_fiscal_prod` |
| RCF-008 | VPS produccion | Repetir verificacion de alcance real (DNS + TCP + HTTP 200) | PENDIENTE | Evidencia registrada en este documento |
| RCF-009 | VPS produccion | Prueba funcional de extremo a extremo en produccion | PENDIENTE | 200/OK real en logs |
| RCF-010 | Regresion | Confirmar que el binding publico existente sigue funcionando sin cambios | PENDIENTE | `curl` contra `staging-factura.ventax.app` y `factura.ventax.app` sigue en 200 tras el cambio |
| RCF-011 | Cierre | Repasar SPEC/PLAN/TASKS contra lo realmente implementado | PENDIENTE | Documentos sin desviaciones sin documentar |

## Orden De Ejecucion

1. `RCF-001`, `RCF-002` (hechos)
2. `RCF-003`
3. `RCF-004` a `RCF-006` (staging)
4. `RCF-007` a `RCF-009` (produccion, solo si staging verifico en verde)
5. `RCF-010`, `RCF-011`

## Dependencias Y Puertas De Avance

- No iniciar esta iniciativa (`RCF-004`+) antes de que
  `docs/TASKS_ALINEACION_CLAVE_VERIFICACION_FISCAL_v0.1.md` tenga ACV-011 y
  ACV-012 completos: son cambios independientes y no se mezclan en la misma
  ventana, para poder aislar la causa si algo falla.
- No tocar produccion (`RCF-007`+) sin `RCF-004` a `RCF-006` en verde.
- Si `RCF-005` o `RCF-008` muestran que el alias `facturacion-electronica` no
  esta publicado en la red correspondiente, detener y escalar al proveedor de
  `facturacion-electronica` — no es corregible desde este repo.

## Evidencia

- 2026-08-29: `RCF-003b` implementado y luego corregido tras un fallo real
  encontrado en staging (no detectable por lectura de codigo ni por la prueba
  local inicial, que usaba un contenedor y una red de prueba sin pasar por
  `--env-file`):
  - Primera version leia `${FE_DOCKER_NETWORK:-}` directamente del entorno del
    script. `--env-file` de `docker compose` solo alimenta la sustitucion de
    variables **dentro** de Compose; nunca exporta esas variables al proceso
    bash que invoca `docker compose`. Resultado: `network_name` siempre vacio,
    la funcion tomaba la rama "sin red configurada" y salia **en silencio**
    (esa rama no logueaba nada) — el primer redeploy de staging con la red
    nueva paso sin errores pero sin conectar nada por esta via (el `api` quedo
    igual conectado porque Compose recreo el contenedor con la red nueva desde
    su propia resolucion interna, no por esta funcion).
  - Corregido: el nombre de red se resuelve con
    `docker compose "${COMPOSE_ARGS[@]}" config`, que expone el valor
    realmente resuelto por Compose (`networks.fiscal_gateway.name`), extraido
    con `awk`. Validado localmente en dos casos: sin `FE_DOCKER_NETWORK`
    seteado (resuelve al default del `.env` local) y forzado por variable de
    shell (resuelve al valor forzado) — ambos casos devuelven el valor
    correcto.
