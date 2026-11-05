# PLAN Verificación de capacidad para 200 clientes v0.1

**Estado:** diseño adoptado y herramientas validadas en modo mock. Quedan D-5 a D-7 del SPEC.

## Alineación

- `docs/SPEC_VERIFICACION_CAPACIDAD_200_v0.1.md`
- `docs/TASKS_VERIFICACION_CAPACIDAD_200_v0.1.md`

## 1. Diseño

```text
 Estación local (D-1), mismo equipo
┌──────────────────┐        ┌────────────────────────────────────────┐
│ simulate.cjs     │  HTTP  │ proyecto fs-carga (commit 7fe6ae8)     │
│ isolation.cjs    ├───────►│  frontend ─ api ─ postgres ─ mailpit   │
│ seed.cjs         │        │              │                         │
│ Playwright       │        │              │ red fiscal propia       │
└──────────────────┘        │              ▼                         │
                            │       FE aislado (lo entrega FE, D-2)  │
 collect.sh, report.cjs     └────────────────────────────────────────┘
```

Todo vive en `scripts/carga/`. Sin dependencias nuevas: Node con `fetch` nativo y `.cjs`, como los demás scripts. **No se toca nada bajo `apps/`, `db/` ni `docker-compose.yml`**, y el comportamiento de la app no cambia.

## 2. Stack aislado (`scripts/carga/stack.sh`)

1. Crea un `git worktree` en `.local/carga/worktree`, ignorado por git, con el commit `CARGA_COMMIT`, por defecto `7fe6ae8`. El checkout actual no cambia.
2. `stack.sh init` genera `.local/carga/env.carga` desde `scripts/carga/env.carga.example`, y `up` lo copia al worktree como `.env.carga`.
3. Ejecuta `APP_ENV_FILE=.env.carga bash scripts/deploy.sh` **dentro del worktree**: es el mismo script de producción, como pide `AGENTS.md`.
4. Levanta `axllent/mailpit` con versión fija en la red `fs-carga_default`, con alias `mailpit`, sin puertos publicados salvo su API en `127.0.0.1`.

Valores que fija `.env.carga`:

| Variable | Valor | Motivo |
|---|---|---|
| `COMPOSE_PROJECT_NAME` | `fs-carga` | Aislamiento de contenedores y volúmenes |
| `API_HTTP_PORT`, `FRONTEND_HTTP_PORT`, `POSTGRES_HOST_PORT` | `8291`, `8292`, `5435` | No chocan con los otros stacks |
| `FE_GATEWAY_MODE` | `real` | RN-04 |
| `FE_API_ENV` | `test` | RN-02 |
| `FE_DOCKER_NETWORK`, `FE_API_BASE_URL`, `FE_API_KEY` | Los entrega FE | D-2 |
| `FE_SERVICE_NUMBERING`, `FE_SEND_EMISSION_PROFILE_CODE`, `FE_OUTBOX_WORKER_*`, `FE_VERIFY_*` | Iguales a producción | Se mide lo que corre en producción |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | `mailpit`, `1025`, valores de relleno | RN-05. `getSmtp()` exige usuario y contraseña |
| `RESEND_API_KEY`, `VENTAX_NOTIFY_EMAIL` | Sin definir. `env.ts` rechaza un correo vacío | RN-05 |
| `DNIT_CRON_ENABLED`, `DNIT_RUN_ON_START` | `false` | Sin descargas ni carrera con el bind mount |

**Guardas de RN-01 y RN-02, antes de construir nada:** aborta si `hostname` coincide con `cobrapy-mvp-01`, si la red fiscal no empieza con `fs_carga` o, en modo real, si tiene salida a internet, si esa red tiene conectado un stack ajeno, si la URL contiene `fe-prod`, `fe-test` o `ventax.app`, si `FE_API_ENV` no es `test`, si hay claves de correo real, si `SMTP_HOST` no es `mailpit` o si el archivo no tiene permiso 600.

**Verificación tras el arranque (RN-03):** `X-App-Version` y `git rev-parse` coinciden con `CARGA_COMMIT`, `/api/v1/fiscal-gateway/health` responde `mode: real`, y la home del frontend no contiene `segel`.

Desvío conocido: si la red de la estación no resuelve DNS dentro de Docker, se aplica el rodeo de `--network host` y se anota en `TASKS`.

## 3. Carga de facturadores (`scripts/carga/seed.cjs`)

### 3.1 Flujo por facturador

Cada paso se cronometra y es reentrante: una segunda corrida no duplica nada.

1. Si el tenant no existe, `POST /backoffice/tenants`.
2. `POST /backoffice/facturadores/import/preview` con el export de FE. Cualquier bloqueante detiene ese facturador y queda registrado.
3. `POST /backoffice/facturadores/import/apply` con la clave del consumidor.
4. `POST /backoffice/users` con rol `OPERADOR_FACTURACION`, `operation_config` y correo `op-<ref>@carga.invalid`.
5. Onboarding real del operador: login, `POST /onboarding/password`, `POST /onboarding/otp/request`, lectura del OTP en la API de mailpit y `POST /onboarding/complete`.
6. `GET /me/readiness` debe dar `ready: true`.
7. Agenda: N clientes y M ítems por la API, con `@carga.invalid` en todo correo.

El administrador inicial es la única excepción a RN-07: se crea con SQL sobre la base aislada, siguiendo `scripts/sql/create_usuario.sql`.

La concurrencia se puede ajustar. La corrida guarda dos tiempos: en serie (el costo real de operar altas) y en paralelo.

### 3.2 Manifiesto (propuesta, D-3)

Vive **fuera del repo**, con permisos 600. `seed.cjs` rechaza otro permiso.

```json
{
  "version": 1,
  "ambiente": "test",
  "facturadores": [
    {
      "ref": "f001",
      "tenant_slug": "carga-f001",
      "tenant_nombre": "Carga 001",
      "plan_codigo": "CARGA",
      "config_file": "exports/f001.json",
      "fe_consumer_api_key": "<clave-del-consumidor>",
      "perfil_volumen": "normal"
    }
  ]
}
```

`perfil_volumen` admite `bajo`, `normal`, `alto` y `muy_alto`: reparte el volumen de forma desigual sin cambiar el total. Con eso se prueba H-2, y un emisor `muy_alto` junta facturas para E9.

### 3.3 Salida

`.local/carga/<corrida>/operadores.json` (permiso 600, en `.gitignore`) contiene usuario, contraseña generada, ids y ref. `test-results/carga/<corrida>/altas.jsonl` guarda los tiempos sin secretos.

## 4. Simulador (`scripts/carga/simulate.cjs`)

- **Modelo abierto (RN-09):** para cada operador, un proceso de Poisson con su tasa según perfil y hora. Un operador puede tener trabajo pendiente mientras llega el siguiente.
- **Sesión:** cada operador inicia sesión al comienzo y renueva con `/auth/refresh` usando la cookie. El access token dura 15 minutos.
- **Ciclo de una factura:**
  1. `GET /me/context` y `GET /facturas` (lo que hace la app al entrar).
  2. `GET /clientes/search`.
  3. `POST /facturas/preview`.
  4. `POST /facturas` con `Idempotency-Key`.
  5. `GET /facturas/:id` cada 60 s, hasta estado final o vencimiento (2 h por defecto, porque la verificación consulta a los 5, 35 y 95 min). Con `--prob-refresh`, el operador a veces aprieta "Verificar estado".
  6. `GET /facturas/:id/files/kude.pdf`, validando que empiece con `%PDF`.
  7. Con una probabilidad dada, `POST /facturas/:id/cancelar` si está en ventana.
- **Reintento:** un 2 % repite el `POST /facturas` con la misma clave, para comprobar que devuelve el mismo documento.
- **Parámetros:** `--operadores`, `--total-por-hora`, `--pausa-s`, `--ventana-rafaga-s`, `--duracion-s`, `--prob-cancelar`, `--prob-reintento`, `--prob-refresh`, `--poll-s`, `--limite-final-s`, `--escenario`, `--seed` (corridas reproducibles).
- **Salida:** `requests.jsonl` (tiempo, ruta normalizada, estado, ms, ref), `documentos.jsonl` (§4.1) y `errores.jsonl`.

### 4.1 `documentos.jsonl` y el cruce con FE (R-12)

Una línea por documento, y otra con `tipo: "cancelacion"` por cada cancelación de la ráfaga. FE cruza por `external_ref`, que es la `idempotency_key` que recibe, o por `document_uuid`.

| Campo | Contenido |
|---|---|
| `clave` | `Idempotency-Key` del SaaS, `cg-<corrida>-<ref>-<secuencia>` |
| `external_ref` | `fac_<sha256(facturador_id:clave)[:32]>`, la clave que ve FE |
| `document_uuid`, `emisor_id`, `numero_fiscal`, `ref` | Identidad del documento |
| `cdc`, `cdc_cambio`, `historial` | CDC final, si cambió, y cada cambio de estado o de CDC con su hora |
| `cdc_enviado`, `cdc_posterior` (cancelación) | El CDC local que la app mandó a FE, y el que tiene después |
| `event_id`, `cancelacion`, `status_http`, `t_envio`, `t_respuesta` (cancelación) | Lo que FE respondió. `event_id` sale de `fiscal_response_snapshot`, porque `/facturas/:id/eventos` es solo para soporte |

El XML de cada evento está en FE: **el cruce final lo hace FE con este archivo.** El SaaS no tiene ese XML.

Si el generador se satura, sus tiempos dejan de valer: mide su propio retraso de planificación y marca la corrida como inválida si el p99 pasa de 250 ms.

## 5. Métricas (`scripts/carga/collect.cjs`, `report.cjs`)

| Qué | Cómo | Cada |
|---|---|---|
| Tiempos y errores por ruta (cliente) | `requests.jsonl` | Cada request |
| Tiempos por ruta (servidor) | Campo `responseTime` de pino en `docker logs` | Al final |
| Cola de emisión | `scripts/carga/sql/cola.sql`: por estado, antigüedad máxima y trabajos en `PROCESSING` vencidos | 5 s |
| Agenda de verificación | Vencidos y retraso respecto de `verificacion_next_at` | 15 s |
| Estados de documentos | Conteo por `estado` | 15 s |
| PostgreSQL | `pg_stat_activity`, bloqueos, tamaño de base y tablas, `pg_stat_statements` si está disponible | 15 s |
| Recursos | `docker stats --no-stream` por contenedor, y disco del host | 5 s |
| Correo | API de mailpit: cantidad y destinos | Al final |
| Secretos | Barrido de logs y resultados por los valores de las claves y contraseñas, reportando solo el conteo | Al final |

El lado FE aporta sus propias métricas: su latencia y su cola quedan fuera de este repo. El informe las enlaza si FE las entrega.

**Conciliación (CA-02, `reconcile.cjs`):** para cada clave de `documentos.jsonl` calcula `fac_<sha256(facturador_id:clave)[:32]>`, tal como `buildExternalRef`, y comprueba: una fila en `facturas_operativas`, una en la cola, y un resultado en `POST /conciliacion/idempotency` de FE con la clave del consumidor, en lotes de hasta 100 (límite publicado). También detecta filas del SaaS sin clave conocida.

## 6. Aislamiento (`scripts/carga/isolation.cjs`)

Dos operadores A y B de clientes distintos, cada uno con documento, cliente e ítem. A ataca los recursos de B. Se espera 403 o 404, **y además** B comprueba después que su recurso quedó idéntico.

| Grupo | Casos |
|---|---|
| Documento de B | `GET /facturas/:id`, `/eventos`, `/gestion/decision`, `/files/kude.pdf`, `/files/xml`, `/email-status` |
| Acciones sobre B | `POST /refresh-status`, `/retry-emission`, `/cancelar`, `/nota-credito`, `/delivery-link`, y las demás acciones de gestión |
| Listados | `GET /facturas`, `/clientes`, `/clientes/search` y catálogo no devuelven datos de B, buscando su RUC y nombre |
| **Gestión con clave compartida (H-6)** | `/facturas/gestion/batch-pendientes` y `/gestion/reconciliacion` no devuelven documentos de B |
| Referencias en el cuerpo | `POST /facturas` con `cliente_id` y `catalogo_item_id` de B |
| Agenda | Leer y editar el cliente y el ítem de B por id |
| Recibos y notas | Los mismos accesos, por id de B |
| Idempotencia | La misma clave en A y B crea dos documentos distintos |
| Enlace público | Un token resuelve solo su documento; uno adivinado da 404 |
| Roles y sesión | Operador en `/backoffice/*` da 403; sin token da 401; token de onboarding en rutas operativas da 403 |

La suite se ejecuta sin carga, otra vez durante E1 a 200 operadores, y sobre muestras de pares al azar. Ante un acceso cruzado, marca fallo crítico y la corrida sigue para completar la medición.

## 7. Escenarios

| # | Escenario | Qué responde |
|---|---|---|
| E0 | Humo de herramientas: 5 operadores en modo mock, en local. **No es evidencia** | Que los scripts funcionen |
| E1 | Escalera 50, 100 y 150 operadores, a 1,25 facturas por hora por cliente, 20 min por escalón. Busca dónde se rompe el SaaS, sin esperar aprobaciones | P5, P6, CA-03 a CA-06 |
| E8 | **60 min con los 200 clientes a 250 facturas por hora** (día fuerte), y después drenaje hasta vaciar cola y agenda (hasta unas 2 h más). Reemplaza el escalón de 200 de E1 (R-9) | P1, P2, P5, CA-13, H-13 |
| E9 | **50 cancelaciones simultáneas** en 5 s sobre facturas aprobadas de E8, 25 del mismo emisor y el resto de emisores distintos (R-10), con `cancelar-simultaneo.cjs`. Requiere un emisor con `perfil_volumen: muy_alto` | CA-14, H-12 |
| E2 | Pico: 200 logins en 5 min, y luego 750 facturas por hora, 30 min | H-8, P1 |
| E3 | Ráfaga: 200 facturas en 1 min, y un cliente con 500 en cola (H-2) | P1, H-1, H-2. Drenaje esperado por código: 16 min 40 s |
| E4 | Resistencia: 2 h a 50 facturas por hora (hora pico de FE) | Fugas de memoria, P2 |
| E5 | Fallos con observador (§8) | P3, H-3, H-4, H-7, CA-09 |
| E6 | Backup y restauración, en frío y bajo carga, con `scripts/backup.sh` y `verify-restore.sh` | P7 |
| E7 | Correo falso con demora, 2 s por envío, y documentos rechazados | H-10 |

Orden: E0, carga de 200 altas (P4), aislamiento, E1, E8, E9, E2, E3, E4, E5, E6, E7. Si E1 se rompe antes de 150, E8 corre igual, porque el límite también es un resultado, y se registra.

Comando de E8, con la tasa promedio elegida según D-4:

```bash
node scripts/carga/collect.cjs --corrida e8 --duracion-s 12600 &
node scripts/carga/simulate.cjs --corrida e8 --operadores 200 --total-por-hora 250 --duracion-s 3600 --poll-s 60 --limite-final-s 7200
node scripts/carga/cancelar-simultaneo.cjs --corrida e8 --cantidad 50 --ventana-s 5
```

## 8. Fallos y observador

Se usa un operador reservado, fuera de la carga. La persona observa la app mientras Playwright captura en móvil (390×844) y escritorio (1280×800), con la carga de fondo. `scripts/carga/observar-fallos.cjs` deja las capturas en `test-results/carga/<corrida>/fallos/`, y **las capturas se revisan a ojo**, porque ya hubo un caso de texto invisible que el script dio por bueno.

| # | Fallo | Cómo se inyecta | Qué mira la persona |
|---|---|---|---|
| F1 | FE caído | `docker network disconnect` de `fs-carga-api-1` de la red fiscal | Qué dice la factura, si se recupera sola al reconectar |
| F2 | FE lento | Lo inyecta FE, o un proxy con demora en la red fiscal (D-2) | Si el operador entiende que sigue procesando |
| F3 | Clave compartida inválida | Recrear `api` con otra `FE_API_KEY` | Emisión, KUDE, verificación y cancelación: cuáles mienten |
| F4 | Clave de consumidor inválida | `PUT /backoffice/facturadores/:id/api-key` en un facturador | Si afecta solo a ese cliente, y qué ve |
| F5 | API muere con trabajo en curso | `docker kill` durante `PROCESSING` | H-4: si el documento queda trabado y qué ve el operador |
| F6 | Base caída breve | `fallos.sh f6`, que además informa el estado de la API | Hoy la API muere (H-14). Para seguir la corrida hay que levantarla con `docker start fs-carga-api-1`, y anotar que hizo falta |
| F7 | Emisor sin configuración (R-11) | FE quita la configuración de un emisor ya dado de alta | Qué ve ese operador, si puede resolverlo, y si sus reintentos demoran a los demás en la cola |
| F8 | Lotes demorados en `0361` (R-11) | El SIFEN simulado de FE mantiene lotes en proceso | Si la factura dice que sigue en proceso sin alarmar, y cuánto tarda en verse aprobada (H-13) |
| F9 | `1002` después de un reenvío (R-11) | El SIFEN simulado de FE responde `1002` al reenviar | Que no se muestre como rechazada mientras FE la reconcilia, si el CDC cambia, y si cancelar usa el vigente (H-12) |

Para cada uno, la persona anota en `docs/OPERACION_VERIFICACION_CAPACIDAD_v0.1.md` qué vio, si era verdad y si podía resolverlo sin soporte.

## 9. Perfil de producción

`scripts/carga/sql/perfil-produccion.sql` es de solo lectura y solo devuelve agregados: documentos por día, hora y facturador, pico por hora y por minuto, espera real en cola y tamaño de la base. **No se corre en esta etapa, que es solo local** (D-4). Las tasas salen del supuesto de FE, y el informe lo aclara. El SQL nunca se ejecutó y queda para una etapa posterior.

## 10. Informe

`report.cjs` genera `test-results/carga/<corrida>/informe.md`, con commit, host, modo y validez. Rechaza como evidencia una corrida en modo mock. El informe consolidado va en `docs/INFORME_VERIFICACION_CAPACIDAD_200_v0.1.md` y responde P1 a P7 con veredicto (SPEC §8).

## 11. Limpieza

`stack.sh down` detiene el proyecto `fs-carga`. `stack.sh destroy` borra sus volúmenes y el worktree, con confirmación escribiendo el nombre del proyecto, y nunca actúa fuera de `fs-carga`. Las claves de FE aislado las rota FE al terminar.
