# SPEC Verificación de capacidad para 200 clientes v0.1

**Fecha:** 2026-11-05
**Estado:** herramientas validadas en modo mock. Esta etapa es **solo local**: nada se corre, se consulta ni se despliega en producción o staging (decisión del usuario, 2026-11-05). Las corridas reales esperan el FE aislado y el manifiesto (§9).
**Rama de trabajo:** `feat/identidad-segel`, solo para alojar herramientas y documentos.

## Alineación

- `AGENTS.md`: límite de dominio, validación sobre contenedores, sin secretos en el repo.
- `docs/facturacion-electronica-consumer-docs/GUIA_INTEGRACION_CONSUMIDORES.md`: las dos claves, idempotencia y límites.
- `docs/SPEC_AGENDAS_CLIENTES_CATALOGO_v0.1.md` (H-11), `docs/SPEC_CONTROL_REINTENTOS_EMISION_v0.1.md`, `docs/SPEC_ALINEACION_CLAVE_VERIFICACION_FISCAL_v0.1.md`, `docs/SPEC_ESTADO_FISCAL_CANONICO_v0.1.md`, `docs/SPEC_IMPORT_CONFIG_FACTURADOR_v0.3.md`.

## 1. Objetivo

Responder con mediciones si Facturación Simple junto con `facturacion-electronica` (FE) soportan 200 clientes usando la plataforma, y qué se rompe primero si no.

El resultado es un informe con las 7 preguntas de §4, cada una con su número, su evidencia y su veredicto. Encontrar el límite es un resultado válido. Esta iniciativa no corrige lo que encuentre: cada arreglo sigue su propia cadena SDD.

## 2. Alcance

| # | Requisito | Qué se entrega |
|---|---|---|
| R-1 | Stack aislado, con el commit de producción, sin Segel y en modo real | Script que construye `7fe6ae8` (confirmado en la VPS el 2026-11-05) con `FE_GATEWAY_MODE=real` |
| R-2 | Cargar 200 facturadores de forma repetible desde un manifiesto | Script de alta por la API del backoffice, idempotente |
| R-3 | Simulador de operadores por HTTP, cada uno con su usuario | Login, buscar cliente, facturar, descargar KUDE y a veces cancelar |
| R-4 | Métricas | Tiempos por ruta, espera en colas, errores y recursos |
| R-5 | Pruebas de aislamiento | Un operador no puede ver, cancelar ni descargar nada de otro cliente |
| R-6 | Correo apagado o falso y trazabilidad por `idempotency_key` | Ningún correo sale del stack; cada factura se rastrea de punta a punta |
| R-7 | Una persona presente en las corridas | Guía de observación y capturas de lo que muestra la app ante fallos |
| R-8 | Responder las 7 preguntas | Informe final |
| R-9 | Corrida de 60 minutos con los 200 clientes (ajuste de FE, §10 de su pedido) | Escenario E8. Los lotes salen cada 15 min y la aprobación tarda hasta 28 (p95): 20 min no alcanzan |
| R-10 | Unas 50 cancelaciones simultáneas (ajuste de FE) | Escenario E9. Un porcentaje al azar no reproduce el cruce de eventos |
| R-11 | Tres fallos más (ajuste de FE) | F7 emisor sin configuración, F8 lotes demorados en `0361`, F9 `1002` después de un reenvío |
| R-12 | Comprobación de cancelaciones (ajuste de FE) | `documentos.jsonl` permite cruzar claves y CDC contra el XML de cada evento |

## 3. Fuera de alcance

- Modificar la app en el commit bajo prueba, o el repo de FE. Lo que ocurra del lado de FE lo mide y lo responde FE.
- Probar contra producción o staging, o contra su FE. El FE aislado no se levanta desde este repo (D-2).
- Corregir hallazgos, incluidos los de §5.
- Mergear a `master`: esta rama nunca entra en `master`. Las correcciones de FS-01, FS-02, FS-03 y FS-13 también viven aquí, por decisión del usuario (2026-11-05), y luego se decide cuáles se aplican a `master`. Si las herramientas deben quedar en el producto, se aplican aparte (§10).

## 4. Las 7 preguntas

Son las de `PEDIDO_FACTURACION_SIMPLE_CAPACIDAD_200_v0.1.md` §7, en el repo de FE, resumidas. Las respuestas previas, leídas del código, están en el documento compartido; aquí se responden con medición.

| # | Tema | Pregunta | Cómo se responde |
|---|---|---|---|
| P1 | Cola de emisión | ¿Cuántas facturas por minuto sostiene, cuánto espera un operador y un cliente con mucho volumen demora a los demás? | Profundidad y antigüedad de `factura_emision_outbox`, y ráfaga E3 |
| P2 | Verificación | ¿La agenda de verificación fiscal se mantiene al día con 200 clientes, o se atrasa? | Retraso respecto de `verificacion_next_at` y tiempo hasta el estado final |
| P3 | Clave compartida | ¿Qué pasa si falla la clave compartida, y es el filtro del SaaS la única barrera entre clientes? ¿Se filtra en logs? | Fallo F3, suite de aislamiento y barrido de logs |
| P4 | Altas | ¿Cuánto cuesta dar de alta 200 facturadores, qué falla y qué sigue siendo manual? | Tiempos y errores de la carga R-2 |
| P5 | Carga real | ¿Dónde está el límite, en facturas por hora por cliente? La carga real de producción queda para una etapa posterior | Múltiplos de 3,6 (D-4) y escalera E1 |
| P6 | Recursos | ¿Qué CPU, RAM, conexiones y disco hacen falta? ¿Alcanza el servidor actual? | Muestreo de contenedores y de PostgreSQL |
| P7 | Backups | ¿Cuánto tarda un backup y una restauración con ese volumen, y qué impacto tiene bajo carga? Si están automatizados en la VPS queda para una etapa posterior | E6 |

## 5. Hipótesis salidas del código

Se leyeron en `7fe6ae8`, y falta medirlas. Las corridas las confirman o las descartan.

| # | Hipótesis | Origen | Consecuencia si se confirma |
|---|---|---|---|
| H-1 | El worker emite **un documento por tick, cada 5 s**: tope de 12 por minuto o 720 por hora, por proceso | `facturas.worker.ts`, `claimNextPendingEmission` (`limit 1`), `FE_OUTBOX_WORKER_INTERVAL_MS=5000` | 200 clientes saturan la cola si promedian más de **3,6 facturas por hora cada uno**. Una ráfaga de 200 facturas tarda **16 min 40 s** en drenar |
| H-2 | La cola es FIFO global, sin reparto por cliente | `order by next_attempt_at, created_at` | Un cliente con 500 facturas demora 41 minutos a todos los demás |
| H-3 | Si FE se pone lento, el worker también: procesa en serie y la llamada puede esperar hasta 20 s | Guarda `running`, `FE_API_TIMEOUT_MS=20000` | Con FE colgado, el tope cae a unas 3 por minuto |
| H-4 | **Nada recupera un trabajo en `PROCESSING`**: si la API muere durante la llamada a FE, el documento queda trabado | `locked_at` se escribe, pero ningún código lo vence; el claim solo toma `PENDING` y `FAILED_TEMP` | Facturas trabadas tras cada reinicio o deploy con cola activa |
| H-5 | La verificación tope es de 10 documentos cada 30 s: 20 por minuto, en serie | `FE_VERIFY_BATCH_SIZE`, `FE_VERIFY_WORKER_INTERVAL_MS` | Puede atrasarse si FE tarda en resolver y se acumulan reintentos |
| H-6 | Con la misma clave compartida para todos, KUDE, XML, verificación y cancelación dependen solo del filtro `facturador_id` del SaaS | `facturas.routes.ts`, `findById` | Un filtro omitido expone a otro cliente. Las rutas `/facturas/gestion/*` usan esa clave: son el primer sospechoso |
| H-7 | La clave compartida inválida no frena la emisión, pero sí KUDE, verificación y cancelación | Las dos claves son disjuntas | Fallo silencioso: "emitir funciona" (ya pasó en producción) |
| H-8 | El pool de PostgreSQL usa el default de 10 conexiones, y el login con argon2 ocupa CPU | `db/pool.ts`, `password.service.ts` | Cuello de botella en picos de inicio de jornada |
| H-9 | El servidor actual no alcanza: 2 vCPU y 3,7 GB para todos los stacks | Lectura en la VPS, 2026-11-05 | Responde P6. Además prohíbe correr la prueba ahí (RN-01) |
| H-10 | Enviar correo ocurre dentro del worker, en serie | `notifyAccionRequerida` en `processNextQueuedFiscalEmission` | Con correo apagado este costo no se ve. Hace falta correo falso con demora en una corrida |
| H-12 | La app cancela con su CDC **local**. Si FE rehízo el documento y el SaaS no se enteró, cancela contra un CDC viejo | `cancelDocumento` usa `documento.cdc` | Cancelación rechazada o sobre otro CDC. El cruce de R-12 lo muestra con `cdc_enviado` |
| H-13 | La agenda de verificación choca con la aprobación de FE: se consulta a los 5, 35 y 95 min | `BACKOFF_MS` y `interval '5 minutes'` | Un documento aprobado a los 6 min se ve "Procesando" hasta el min 35, y uno aprobado a los 36, hasta el min 95, salvo que el operador verifique a mano |

### Hallazgos ya comprobados

Comprobados el 2026-11-05 sobre `7fe6ae8`, en el stack aislado. No dependen de FE, así que el modo mock alcanza para estos cuatro. **El código es el que corre en producción**, pero en producción no se probó nada.

- **H-11. Un operador ve datos de contacto de clientes de otros facturadores.** `GET /clientes/search` cae en la base global `cliente_identidades` y devuelve razón social, dirección, teléfono y correo. Busca por **fragmento de razón social**, desde 2 caracteres: en la prueba, `q=f003` devolvió los 5 clientes de otro facturador. `SPEC_AGENDAS_CLIENTES_CATALOGO_v0.1.md` §4 autoriza la búsqueda global **por documento**, para precargar datos; la búsqueda por nombre, no. Decisión en D-7.
- **H-14. Si PostgreSQL se reinicia, la API muere y no vuelve sola.** Con `docker restart` de la base, la API termina con exit 1: `db/pool.ts` no maneja el evento `error` del pool, y `docker-compose.yml` no define `restart:`. Caen también los dos workers. Queda abajo hasta que alguien la levante. La política de reinicio del contenedor real de producción queda para una etapa posterior.
- **H-4. Un trabajo en `PROCESSING` queda trabado.** Con el bloqueo vencido hace 2 horas, sigue en `PROCESSING` tras reiniciar la API y 45 s de worker activo. Nada lo recupera. Combinada con H-14, cada caída de la base en plena emisión puede dejar una factura trabada.
- **H-1, primera medida: 12 facturas por minuto**, con 199 operadores y un FE instantáneo (mock). El tope no viene de la carga sino del intervalo del worker. Con el supuesto de FE (250 por hora) la cola no se satura de forma sostenida: el riesgo es la ráfaga, que tarda 16 min 40 s contra un umbral de 2 min.

## 6. Reglas

- **RN-01. Ningún dato ni tráfico toca producción o staging.** No se corre en la VPS que los aloja. Las herramientas se niegan a arrancar si el destino, la red fiscal o `FE_API_ENV` apuntan a esos ambientes.
- **RN-02. Nunca SIFEN de producción.** El manifiesto declara `ambiente: "test"`, y se aborta si no. Nunca se usa `permitir_ambiente_distinto`.
- **RN-03. El código bajo prueba es el de producción.** Se construye desde un `git worktree` en `7fe6ae8`, y la corrida registra el commit. Comprobación: `EMAIL_FROM_NAME` y el frontend no contienen Segel.
- **RN-04. Modo real.** `FE_GATEWAY_MODE=mock` solo sirve para probar las herramientas (E0) y nunca cuenta como evidencia. El informe lo rechaza.
- **RN-05. Ningún correo sale del stack.** Sin Resend ni SMTP real, `VENTAX_NOTIFY_EMAIL` vacío y direcciones `@carga.invalid` en todo lo sembrado. Un SMTP falso interno captura lo enviado.
- **RN-06. Sin secretos en el repo.** El manifiesto, las claves y las contraseñas generadas viven fuera de git, con permisos 600. Los resultados no incluyen tokens ni claves.
- **RN-07. Altas por la vía real.** Se usa la API del backoffice, no SQL directo, salvo el primer usuario administrador. Sin esto, P4 no mide nada.
- **RN-08. Trazabilidad.** Toda factura usa una `Idempotency-Key` de la forma `cg-<corrida>-<ref>-<secuencia>`, y se puede seguir hasta `fac_<hash>`, `document_uuid` y `cdc`.
- **RN-09. Carga de modelo abierto.** Las facturas llegan según un ritmo fijado, aunque el sistema se atrase. Si el simulador esperara a cada respuesta, ocultaría la saturación.
- **RN-10. Resultados completos.** Un fallo se reporta con su evidencia. Una corrida inválida se marca como tal y no se descarta en silencio.
- **RN-11. Limpieza.** Todo vive en el proyecto Docker `fs-carga`. El borrado de volúmenes pide confirmación y no toca otros proyectos.

## 7. Criterios de aceptación

Los umbrales son propuesta, a confirmar en D-5.

| # | Criterio | Umbral |
|---|---|---|
| CA-01 | Aislamiento | **Cero** accesos cruzados, antes y bajo carga. Sin tolerancia: uno solo bloquea |
| CA-02 | Sin pérdidas | Cada clave da exactamente un documento en el SaaS y uno en FE, sin duplicados ni huérfanos |
| CA-03 | Lecturas | p95 menor a 500 ms con 200 operadores |
| CA-04 | Crear factura (`POST /facturas`) | p95 menor a 1 s |
| CA-05 | KUDE | p95 menor a 3 s |
| CA-06 | Errores | Menos de 0,1 % de 5xx, sin contar la inyección de fallos |
| CA-07 | Espera en cola | p95 menor a 60 s en carga normal y menor a 5 min en pico; la cola se vacía sola |
| CA-08 | Verificación | Retraso p95 de la agenda menor a 5 min |
| CA-09 | Fallos | Tras cada fallo el sistema se recupera sin soporte, y la app dice la verdad al operador |
| CA-10 | Correo | Cero correos fuera del stack |
| CA-11 | Secretos | Cero claves o contraseñas en logs y resultados |
| CA-12 | Backup | Restauración verificada, con tiempos registrados |
| CA-13 | Corrida larga | 60 min con 200 clientes y la cola y la agenda se vacían después, sin intervención |
| CA-14 | Cancelaciones simultáneas | 50 en pocos segundos: sin 5xx, sin duplicar eventos, y cada clave y CDC coincide con el XML del evento en FE |

## 8. Veredicto del informe

- **Soporta:** cumple todos los criterios con la carga de 200.
- **Soporta con condiciones:** cumple tras cambios de configuración enumerados y medidos.
- **No soporta todavía:** indica qué falla primero, con qué número de clientes y qué haría falta.

## 9. Decisiones abiertas

| # | Decisión | Por qué importa | Propuesta |
|---|---|---|---|
| D-1 | **Dónde se corre** | La VPS está prohibida (RN-01) | **Cerrada:** estación local del usuario. Consecuencia: 16 núcleos, unos 4 GB libres y otros stacks activos, de modo que P6 se reporta como **referencia**, no como dimensionamiento de un servidor |
| D-2 | **FE aislado y SIFEN** | Modo real exige un FE | **Cerrada:** lo entrega el equipo de FE, con SIFEN simulado. Pendiente la entrega (`docs/OPERACION_VERIFICACION_CAPACIDAD_v0.1.md` §1) |
| D-3 | **Formato del manifiesto** | Lo entrega el equipo de FE | **Cerrada:** el de PLAN §3.2. Pendiente la entrega del archivo |
| D-4 | **Perfil de carga real** | Sin los datos de producción, "200 clientes" no se traduce en facturas por hora | **Cerrada:** esta etapa no consulta producción. Se adopta el supuesto de FE: 40 facturas por mes por cliente, 50 por hora en pico y 250 en un día fuerte. El límite se busca aparte con ráfagas. P5 queda como supuesto, y el informe lo aclara. `scripts/carga/sql/perfil-produccion.sql` queda sin ejecutar, para una etapa posterior |
| D-5 | **Umbrales** | Definen el veredicto | **Abierta.** Propuesta: los de §7, más los de FE: p95 de confirmar a llegar a FE menor a 2 min en hora pico, 0 datos cruzados, 0 facturas perdidas o duplicadas |
| D-6 | **Fechas y observador** | R-7 exige una persona presente | **Abierta.** Las fija el usuario. Las preguntas ya están redactadas por FE |
| D-7 | **Tratamiento de H-11 y H-14** | H-11 contradice "un operador no puede ver nada de otro cliente". Ambos están en el código de producción | **Cerrada para H-11, H-14, H-4 y FS-13:** corregidas en esta rama, sin desplegar. FE pide no cambiar código de producción para la prueba antes de ver resultados; la línea base se corre igual sobre `7fe6ae8`. Propuesta: cadena SDD aparte para cada uno, sin desplegar. H-11: limitar la búsqueda global a documento exacto y sin datos de contacto. H-14: manejar el error del pool y definir política de reinicio. Mientras H-11 siga, CA-01 no se cumple |

## 10. Riesgos

- **Herramientas varadas en la rama:** como esta rama no entra en `master`, `scripts/carga/` no llegará al producto por esa vía. Para usarlas después, se aplican aparte en `master`.
- **El FE aislado difiere del real:** si no replica versión o configuración de producción, sus números no se trasladan. El informe registrará la versión.
- **Estado de la estación:** correr en local compite con otros stacks. Hay que apagarlos antes de cada corrida real y registrarlo. Sirve para colas, errores y aislamiento; los recursos son solo referencia (D-1).
- **Alcance del pedido de FE:** `PEDIDO_FACTURACION_SIMPLE_CAPACIDAD_200_v0.1.md` queda como histórico. Su §10 dice que mandan estos documentos.
