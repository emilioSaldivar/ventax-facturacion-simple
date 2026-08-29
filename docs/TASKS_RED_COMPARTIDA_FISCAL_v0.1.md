# TASKS Red Compartida Con Facturacion Electronica v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_RED_COMPARTIDA_FISCAL_v0.1.md`
- `docs/PLAN_RED_COMPARTIDA_FISCAL_v0.1.md`

## Estado General

- `SPEC`: DONE
- `PLAN`: DONE
- `TASKS`: CERRADA. Staging y produccion migrados a ventax_fiscal_{test,prod}
  con el alias facturacion-electronica, verificados con pruebas funcionales
  reales (200 con XML firmado en ambos ambientes), redeploy idempotente
  probado, cero regresion en el binding publico.

## Matriz

| ID | Fase | Tarea | Estado | Criterio de aceptacion |
| --- | --- | --- | --- | --- |
| RCF-001 | SDD | Crear cadena SPEC/PLAN/TASKS de esta iniciativa | DONE | Documentos alineados y referenciados desde `docs/BACKLOG.md` |
| RCF-002 | Verificacion | Mapear la topologia real de red en la VPS y el estandar declarado por `facturacion-electronica` | DONE | `ventax_fiscal_prod`/`_test`, sus miembros actuales y el alias `facturacion-electronica` confirmados por inspeccion directa |
| RCF-003 | Config | Actualizar `.env.production.example` y `.env.staging.example` del repo con los nuevos defaults documentados | DONE | `FE_DOCKER_NETWORK` y `FE_API_BASE_URL` reflejan el estandar en ambos ejemplos |
| RCF-003b | Backend/infra | `scripts/deploy.sh`: agregar `ensure_service_on_fiscal_network`, verificacion idempotente post-`up -d` (conecta solo si falta, nunca falla el deploy) | DONE | Probado localmente contra un contenedor y una red Docker real: primera corrida conecta, segunda detecta "ya conectado" sin error |
| RCF-004 | VPS staging | Editar `.env.staging` real en la VPS y redeploy solo de staging | DONE | `docker inspect` muestra el `api` de staging unido a `ventax_fiscal_test` |
| RCF-004b | VPS staging | Redeploy una segunda vez, sin cambios, inmediatamente despues | DONE | El segundo deploy loguea "ya esta conectado" para `ventax_fiscal_test`, sin error ni reconexion |
| RCF-005 | VPS staging | Verificar alcance real desde dentro del contenedor: DNS + TCP + HTTP 200 | DONE | Evidencia de los tres chequeos registrada en este documento |
| RCF-006 | VPS staging | Prueba funcional de extremo a extremo (accion real que dependa del gateway fiscal) | DONE | 200/OK real en logs, no solo alcance de red |
| RCF-007 | VPS produccion | Editar `.env.production` real en la VPS y redeploy solo de produccion | DONE | `docker inspect` muestra el `api` de produccion unido a `ventax_fiscal_prod` |
| RCF-008 | VPS produccion | Repetir verificacion de alcance real (DNS + TCP + HTTP 200) | DONE | Evidencia registrada en este documento |
| RCF-009 | VPS produccion | Prueba funcional de extremo a extremo en produccion | DONE | 200/OK real en logs |
| RCF-010 | Regresion | Confirmar que el binding publico existente sigue funcionando sin cambios | DONE | `curl` contra `staging-factura.ventax.app` y `factura.ventax.app` sigue en 200 tras el cambio |
| RCF-011 | Cierre | Repasar SPEC/PLAN/TASKS contra lo realmente implementado | DONE | Documentos sin desviaciones sin documentar |

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
- 2026-08-29: `RCF-004` completado. `.env.staging` real de la VPS editado
  (`FE_DOCKER_NETWORK=ventax_fiscal_test`,
  `FE_API_BASE_URL=http://facturacion-electronica:8080/v1`). Redeploy con
  `APP_ENV_FILE=.env.staging bash scripts/deploy.sh`: Compose recreo el `api`
  (cambio de red detectado) y quedo unido a `ventax_fiscal_test`, confirmado
  por `docker inspect`.
- 2026-08-29: `RCF-004b` completado, y con un hallazgo real (ver arriba): la
  primera repeticion post-fix mostro `[fiscal_gateway] 'api' ya esta conectado
  a 'ventax_fiscal_test'`, sin reconectar ni fallar. Se repitio una tercera vez
  con identico resultado — estable.
- 2026-08-29: `RCF-005` completado. Desde dentro del contenedor real
  (`docker exec`, no un contenedor auxiliar):
  `getent hosts facturacion-electronica` -> `172.27.0.2` (subred de
  `ventax_fiscal_test`); `wget http://facturacion-electronica:8080/v1/health`
  -> `{"status":"ok","service":"facturacion-electronica","db":true}` en <10ms.
  `docker network inspect ventax_fiscal_test` confirma tres miembros:
  `fe-test-api-1`, `pos-graciela-staging-api-1` y ahora
  `ventax-facturacion-simple-api-1`.
- 2026-08-29: `RCF-006` completado, con un desvio menor de metodo respecto al
  PLAN. El primer intento (forzar `verificacion_next_at=now()` sobre un
  documento real de la cola y esperar al worker) devolvio un **409
  `DOCUMENT_QUEUED_BATCH`** real del backend fiscal — no un fallo de red: el
  documento elegido todavia esta en lote pendiente de envio a SIFEN, estado de
  negocio legitimo que no admite consulta de estado todavia. Confirmado con los
  logs de `fe-test-api-1` (`status_code:409`, cuerpo estructurado), no un error
  de conexion. Prueba repetida sobre un documento ya `EMITIDA`
  (`d71b486c-073c-430c-bec7-d29d0793af5f`) con una llamada real desde dentro del
  contenedor `ventax-facturacion-simple-api-1` a
  `http://facturacion-electronica:8080/v1/documentos/{uuid}/sifen?env=test`
  (clave compartida, via alias): **`status_code:200`**, respuesta completa con
  XML firmado (`rDE`), CDC, y `dCarQR`. Confirma la ruta completa sobre la red
  nueva: resolucion del alias, TCP, HTTP, y un payload funcional real — no solo
  un healthcheck.
- 2026-08-29: `RCF-007` a `RCF-010` completados en produccion, replicando la
  misma bateria de staging.
  - Baseline capturado antes del cambio: `api` en `fe-prod_default`, healthy.
  - `.env.production` real editado
    (`FE_DOCKER_NETWORK=ventax_fiscal_prod`,
    `FE_API_BASE_URL=http://facturacion-electronica:8080/v1`). Redeploy con
    `APP_ENV_FILE=.env.production bash scripts/deploy.sh`: Compose recreo el
    `api` con la red nueva ya resuelta; el chequeo idempotente post-`up -d`
    confirmo `[fiscal_gateway] 'api' ya esta conectado a 'ventax_fiscal_prod'`
    (Compose ya lo habia dejado conectado durante la recreacion misma).
    `healthy` en 11s.
  - `RCF-008`: `getent hosts facturacion-electronica` -> `172.28.0.2` (subred
    de `ventax_fiscal_prod`); `wget` a `/v1/health` -> 200 en <10ms.
    `docker network inspect ventax_fiscal_prod` confirma tres miembros:
    `fe-prod-api-1`, `pos-graciela-production-cloud-api-1` y ahora
    `ventax-facturacion-simple-prod-api-1`.
  - `RCF-009`: llamada real desde dentro del contenedor de produccion a
    `http://facturacion-electronica:8080/v1/documentos/c657f19c-81e6-462d-8cad-eea4d6b8670e/sifen?env=prod`
    (documento real `EMITIDA`) -> **`status_code:200`** en los logs de
    `fe-prod-api-1`, `dCodRes: 0422` ("CDC encontrado"), CDC completo.
  - `RCF-010`: `curl` contra `staging-factura.ventax.app` y
    `factura.ventax.app` (via nginx del host, loopback) siguen en 200 despues
    del cambio en ambos ambientes. Adicionalmente, `docker inspect` confirma
    que Compose **desconecto limpiamente** al `api` de produccion de la red
    vieja (`fe-prod_default`) al recrearlo — no quedo unido a ambas redes a la
    vez, la migracion es completa y no deja rastro de la ruta anterior.
- 2026-08-29: `RCF-011` (cierre). SPEC, PLAN y TASKS reflejan el diseño
  realmente implementado: la unica desviacion registrada es el bug de
  resolucion de `FE_DOCKER_NETWORK` corregido en `RCF-003b` (documentado ahi
  con su causa) y el metodo de `RCF-006` (documento en `DOCUMENT_QUEUED_BATCH`
  no es defecto, es estado de negocio legitimo). Iniciativa **CERRADA**: staging
  y produccion migrados a `ventax_fiscal_test`/`ventax_fiscal_prod` con el
  alias `facturacion-electronica`, redeploy idempotente, cero regresion.
