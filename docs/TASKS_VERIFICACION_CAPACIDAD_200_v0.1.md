# TASKS Verificación de capacidad para 200 clientes v0.1

## Alineación

- `AGENTS.md`
- `docs/SPEC_VERIFICACION_CAPACIDAD_200_v0.1.md`
- `docs/PLAN_VERIFICACION_CAPACIDAD_200_v0.1.md`
- `docs/OPERACION_VERIFICACION_CAPACIDAD_v0.1.md`

## Estado general

- `SPEC`, `PLAN`: vigentes. D-1 a D-4 cerradas; D-5 a D-7 abiertas.
- Herramientas: validadas en modo mock el 2026-11-05. **Esto prueba las herramientas, no la capacidad.**
- Alcance de esta etapa: **solo local**. Nada se corre, se consulta ni se despliega en producción o staging.
- Corridas reales: **bloqueadas** hasta que FE entregue su stack y el manifiesto.

## Coordinación con FE

El documento compartido es https://claude.ai/artifact/R2D8zaz46VZCrc4FsiEP81. Allí se mantienen lo que FE debe entregar, el registro de fallas de ambos equipos (`FS-xx`, `FE-xx`) y la bitácora de corridas. Cada falla confirmada de FS se registra allá y queda con su evidencia en esta matriz. Sin secretos ni datos reales de clientes.

## A. Decisiones y entregas

| ID | Tarea | Verificación | Estado | Evidencia |
|---|---|---|---|---|
| VC-001 | D-1: host de la prueba | Host anotado | DONE | Estación local, 16 CPU y 15 GB. P6 solo como referencia |
| VC-002 | D-2: FE aislado y SIFEN | FE entrega URL, red, clave, versión y modo SIFEN | DONE | Stack `fe-carga` con `6e8c117` y SIFEN simulado, en red interna |
| VC-003 | D-3: manifiesto | FE entrega el archivo en el formato de PLAN §3.2 | DONE | 200 facturadores, con `f100` en `muy_alto` |
| VC-004 | D-4: carga de las corridas | Tasas fijadas en el SPEC | DONE | Etapa solo local: supuesto de FE, 50 facturas por hora en pico y 250 en día fuerte. P5 queda como supuesto. El SQL de perfil queda sin ejecutar |
| VC-005 | D-5: umbrales | SPEC §7 confirmado | PENDIENTE | |
| VC-006 | D-6: fechas y observador | Persona y fechas anotadas | PENDIENTE | Preguntas de FE respondidas en el documento compartido, con lo leído del código |
| VC-008 | Alinear con el pedido de FE | Herramientas cubren E-01 a E-08, §5 y §6 del pedido | DONE | Agregados y probados en mock: `--total-por-hora`, `--pausa-s`, `--ventana-rafaga-s`, tanda mismo emisor y distintos, métrica de confirmar a FE, comprobación de emisor (detectó uno plantado). "FE responde error a un facturador y otros siguen" se mide en F4 y F7 |
| VC-007 | D-7: H-11 y H-14 | Decisión del usuario | PENDIENTE | |

## B. Herramientas

Corridas sobre el stack aislado en `7fe6ae8`, en modo mock, con manifiesto sintético. Resultados en `test-results/carga/e0-*`.

| ID | Tarea | Verificación | Estado | Evidencia |
|---|---|---|---|---|
| VC-010 | `env.carga.example`, `stack.sh` | Cada guarda aborta con valores prohibidos | DONE | 10 de 10 abortan: `FE_API_ENV`, red de producción y de staging, URLs `fe-prod` y `ventax.app`, Resend, correo interno, SMTP real, proyecto ajeno, permisos. `qa:no-secrets` no cubre archivos sin commit: repetir al commitear |
| VC-009 | Red fiscal sin salida (FS-10) | `fs_carga_fiscal` interna; `stack.sh` aborta en modo real si no lo es | DONE | La red se creó con salida por error de FS, y `fe-carga-api-1` llegó a internet el 2026-11-05. Hosts de SIFEN desviados por FE. FE recreó la red. `stack.sh check` pasó en modo real y `fe-carga-api-1` quedó sin salida |
| VC-011 | `lib.cjs` y validador del manifiesto | Rechaza permisos abiertos, `ambiente` distinto de `test` y refs duplicadas | PARCIAL | Implementado. Solo se ejecutó el caso válido |
| VC-012 | `seed.cjs` | La segunda corrida no crea nada; operador `ready: true` | DONE | 200 de 200, con onboarding real por OTP. Segunda corrida con 6: `sin_cambios: 6`. Alta p50 659 ms, p95 744 ms, sin contar conseguir export y clave |
| VC-013 | `simulate.cjs` | El retraso de planificación se registra | DONE | 199 operadores, atraso p99 de 1 ms. Falta comprobar repetibilidad exacta con `--seed` |
| VC-014 | `collect.cjs`, `sql/perfil-produccion.sql` | Series sin huecos; SQL de solo lectura y sin identidades | PARCIAL | Muestreo correcto. **El SQL de perfil no se ejecutó nunca:** puede tener errores contra producción, aunque corre en transacción de solo lectura |
| VC-015 | `reconcile.cjs` | Detecta problemas plantados | DONE (lado SaaS) | Detectó una huérfana y un documento sin cola plantados, y `--buscar` rastrea de punta a punta. **El lado FE no se ejecutó** porque requiere FE real |
| VC-016 | `isolation.cjs` | Cubre PLAN §6 y detecta un acceso real | DONE | 98 casos en 2 pares. Detectó H-11 de verdad. El resto bloquea |
| VC-017 | `observar-fallos.cjs` (Playwright) | Capturas en 390×844 y 1280×800, revisadas a ojo | DONE | `test-results/carga/e0-observacion/fallos/base/`. Marca Ventax, sin Segel. Visto a ojo: la pestaña activa "Facturas" tiene poco contraste (azul sobre azul), en el commit de producción |
| VC-018 | `report.cjs` | Rechaza una corrida en modo mock | DONE | Encabezado `NO ES EVIDENCIA DE CAPACIDAD` |
| VC-019 | E0: circuito completo y comandos de fallo | Todo corre con 199 operadores | DONE | 86 creadas, 0 errores 5xx. `fallos.sh` probado: f1, f3, f5, f6, trabado. Halló H-4 y H-14 (SPEC §5). Restauración verificada con `backup.sh` y `verify-restore.sh` |
| VC-020 | `cancelar-simultaneo.cjs` y campos de cruce (R-10, R-12) | Ráfaga con `event_id` y CDC por documento | DONE en mock | 45 en 4,9 s, todas `ACCEPTED`, con `cdc_enviado`, `cdc_posterior`, `event_id` y `external_ref`. Fueron 45 y no 50 por falta de facturas emitidas en esa corrida. El mock no reproduce el cruce de eventos real |

## C. Stack aislado real

| ID | Tarea | Verificación | Estado | Evidencia |
|---|---|---|---|---|
| VC-021 | Levantar `fs-carga` con `7fe6ae8`, en modo real | `X-App-Version`, `mode: real`, frontend sin Segel | DONE | `stack.sh up` en modo real pasó las guardas y comprobaciones. `real-humo`: FE confirmó 3 de 3 |
| VC-022 | Correo falso | Un OTP llega a mailpit; ninguno sale | DONE | 215 correos capturados, 0 destinos fuera de `@carga.invalid` |
| VC-023 | Paridad de configuración con producción | Comparación de variables `FE_*` sin valores secretos | DONE (parcial) | Se toma de `.env.production.example`. Contrastar con el contenedor real queda para una etapa posterior |

## D. Corridas con evidencia

VC-002 y VC-003 entregadas por FE el 2026-11-05.

| ID | Tarea | Verificación | Estado | Evidencia |
|---|---|---|---|---|
| VC-030 | Alta de los 200 (P4) | 200 `ready: true`, o fallos listados | DONE | `real-altas`: 200 de 200 en 172 s, en serie, sin errores. Alta p50 872 ms, p95 1120 ms. Falta el tiempo en paralelo |
| VC-031 | Aislamiento sin carga | CA-01 | BLOQUEADA | Ya se sabe que falla por H-11. Anticipo en mock, bajo carga (`e0-ais-carga-ais`, 199 operadores, 700 facturas por hora): 141 casos, 6 fallos, todos H-11. Lo demás bloquea sin dejar cambios. Modo real: `real-e8-ais`, 227 casos, 10 fallos, todos H-11; sin huella. Corrió con arribos terminados; bajo carga plena solo hay pares parciales, sin JSON |
| VC-032 | E1: 50, 100 y 150, con 20 min por escalón | CA-03 a CA-06, CA-10 | PENDIENTE | Se hace después de E8, solo si E8 falla |
| VC-033 | E8: 60 min con 200, más drenaje, con aislamiento a mitad | CA-01, CA-13, H-13, P1, P2 | DONE como línea base | `real-e8`: 246 facturas en 60 min, sin 5xx hasta el corte, p95 de confirmar a FE de 14,5 s. CA-13 no se cumple: a las 19:25 UTC, 179 en cola de FE (FE-11). Métricas hasta las 19:00 UTC: a las 19:00:07 una VPN IPsec con selector `0.0.0.0/0` cortó los puertos publicados, y quedaron 144 ciclos sin cerrar y 971 timeouts. Vista completa en `documentos-base.jsonl`. Primeros 6 min sin carga limpia, por una prueba de FE. Conciliación: 246 de 246 en FE, sin duplicados ni huérfanas, con `--desde-base`. Repetir tras corregir FE-11 |
| VC-034 | E9: 50 cancelaciones simultáneas, y cruce de FE con el XML | CA-14, H-12, FS-11 (`refresh_reabiertas`). FE-01 hace esperable que falle sobre `6e8c117` | BLOQUEADA | Por FE-11: 48 EMITIDA, y `f100` sin aprobadas |
| VC-035 | E2 pico | H-8 y CA-07 | BLOQUEADA | |
| VC-036 | E3 ráfaga y cliente concentrado | H-1, H-2 y tiempo de drenaje | BLOQUEADA | |
| VC-037 | E4 resistencia | Memoria estable, CA-08 | BLOQUEADA | |
| VC-038 | E5 fallos F1 a F9, con observador | H-3, H-7, CA-09; capturas y hoja de la persona | PARCIAL | `real-fallos`, modo real, Playwright en 390×844 y 1280×800, capturas revisadas a ojo: F1, F3, F4, F5 y F6. CA-09 no se cumple: F5 queda trabada sin aviso, F6 no vuelve sola, F3 oculta el fallo. Clics no ejercidos: sondas por API. Sin revisión de una persona. F2, F7, F8 y F9 van en la repetición, con FE |
| VC-039 | E6 backup y restauración | CA-12. El cron de la VPS queda para una etapa posterior | BLOQUEADA | Comandos probados con poco volumen |
| VC-040 | E7 correo con demora | H-10 | PENDIENTE | **Sin herramienta todavía:** mailpit no agrega demora. Hace falta un relé con demora, a definir |
| VC-041 | Conciliación y barrido de secretos en cada corrida | CA-02, CA-10, CA-11 | BLOQUEADA | |

## E. Cierre

| ID | Tarea | Verificación | Estado | Evidencia |
|---|---|---|---|---|
| VC-050 | Informe con P1 a P7 y veredicto | Cada respuesta enlaza su evidencia | PENDIENTE | |
| VC-051 | Hallazgos en `docs/BACKLOG.md` | Cada hipótesis confirmada queda con su propuesta de cadena SDD | PENDIENTE | |
| VC-052 | Repaso de SPEC, PLAN y TASKS; evidencia en `docs/TASKS_IMPLEMENTACION_MVP_v0.1.md` | Regla de cierre de `AGENTS.md` | PENDIENTE | |
| VC-053 | Limpieza | `stack.sh destroy`; FE rota las claves del entorno aislado | PENDIENTE | El stack de mock queda detenido, con sus datos |
