# TASKS Correccion vinculada e inutilizacion de facturas rechazadas v0.1

**SPEC:** `docs/SPEC_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1.md`. **PLAN:** `docs/PLAN_CORRECCION_INUTILIZACION_RECHAZADAS_v0.1.md`. Backlog: FS-51.

## Matriz

| ID | Fase | Tarea | Hecho cuando | Validacion | Estado |
|---|---|---|---|---|---|
| CIR-001 | — | SPEC, PLAN y TASKS | Cadena consistente; decision D-1 del usuario registrada | Revisado con el usuario | DONE (2026-11-10) |
| CIR-002 | A | Migracion 0041 (PLAN 1) | Indice unico de correccion y columnas `inutilizacion_*` | Migracion aplicada en la base de prueba | DONE (2026-11-10): aplicada por `fs-cm-migrate-1` (`applied: 0040, 0041`); columnas `inutilizacion_*` presentes |
| CIR-003 | A | Repositorio: vinculos, `documento_relacionado_id` en la emision encolada (PLAN 2.2) | Detalle y listado traen `corrige_a` y `corregida_por` | `npm run test`, `typecheck` | DONE: `findVinculos` en detalle y listado; E-2 (CA-01 en pantalla) |
| CIR-004 | A | Service y ruta: `corrige_documento_id` (PLAN 2.3) | CA-01 y CA-02 en pruebas | `npm run test` | DONE: E-1 (CA-01, CA-02) y E-2 (CA-02 por la API) |
| CIR-005 | B | Modulo `facturas.inutilizacion.ts`, gateway real y mock (PLAN 2.4, 2.6) | Pruebas del CDC y del mock | `npm run test` | DONE: E-1 (CDC, numero, emisor, mock) |
| CIR-006 | B | Service y ruta `POST /facturas/:id/inutilizar`, acciones (PLAN 2.4, 2.5, 2.7) | CA-03 a CA-05 y CA-07 en pruebas | `npm run test`, `typecheck`, `lint` | DONE: E-1 y E-2 (CA-03 a CA-05, CA-07) |
| CIR-007 | A/B | `spec/openapi.yaml` (PLAN 2.7) | Ruta y campos nuevos documentados | Lectura cruzada con los tipos | DONE: ruta `/facturas/{documentoId}/inutilizar`, `corrige_documento_id` en `FacturaEmitRequest`, `DocumentoVinculo` y campos nuevos de `DocumentoResponse`; YAML valido |
| CIR-008 | A/B | Pantalla (PLAN 3) | Vinculos, boton y dialogo de inutilizar, estados de RN-C1 | `typecheck` y `build` de `web-operacion` | DONE: `typecheck` y `build` de `web-operacion` sin errores |
| CIR-009 | A/B | Playwright contra el stack de `deploy.sh` con mock, 390 y 1280 (PLAN 4) | CA-01, CA-03, CA-04 y CA-06 en pantalla | Resultado y capturas | DONE: E-2, 41/41 |
| CIR-010 | — | Repaso de SPEC, PLAN, TASKS y BACKLOG | Documentos alineados con lo implementado | Lectura cruzada | DONE: ver E-3 |

## Pendientes fuera de la matriz

- Prueba contra FE real (`segel-rc4.25`, SIFEN test) antes de desplegar: el mock no reproduce la respuesta real de SIFEN al evento ni el `409 RANGE_POSSIBLY_CONSUMED`.
- Despliegue en `segel-fs`: con confirmacion directa del usuario.
- Cambiar a la clave del facturador cuando FE publique `EVENTO_INUTILIZAR` (`SPEC_EVENTO_CONSUMER_SCOPE_v0.1` de FE).
- Modelo general de documentos asociados a una factura (notas de credito, recibos, notas de remision): cadena propia, a pedido del usuario.

## Evidencia

### E-1. API (2026-11-10)

`npm run test` de la API: 703 pasan, 0 fallan, 39 omitidas (las que piden `DATABASE_URL_TEST`). Archivo nuevo `tests/facturas.correccion-inutilizacion.test.ts`: lectura del CDC (el de `1010565` con otro RUC), numero en sus dos formas, emisor sin ceros, RN-B1, `dCodRes` anidado; CA-01 y CA-02 (aprobada, inexistente, nota de credito, ya corregida); CA-03 y CA-07 (el punto sale del CDC y no del contexto `001-002`), CA-04 (`REJECTED` con codigo y `EVENT_ALREADY_EXISTS`), otro `409` sin registrar, `FAILED` con `502`, CA-05 (aprobada, anulada, en proceso), RN-B2 (CDC de otro emisor o de otro numero no llama a FE); los cuatro casos de RN-C2 y `ERROR_OPERATIVO` corregida; el mock. Se ajusto la expectativa de `facturas.accion.test.ts` "RECHAZADA sin codigo reconocido": ahora suma `INUTILIZAR_NUMERO`. `npm run lint` (tsc) sin errores. `scripts/check-no-secrets.cjs` limpio.

### E-2. Playwright contra el stack de `deploy.sh` (2026-11-10)

`APP_ENV_FILE=.local/carga-masiva/env bash scripts/deploy.sh` (proyecto `fs-cm`, `FE_GATEWAY_MODE=mock`; no toca los stacks `segel-fs` ni `fe-segel`). `node scripts/playwright-correccion-inutilizacion.cjs`: **41/41**, en 390x844 y 1280x800, mas tres verificaciones por la API. Escenarios por viewport: rechazada sin resolver ("Requiere revision", boton "Inutilizar número", aviso del dia 15); "Corregir y emitir de nuevo" y "Crear factura" dejan la nueva con `documento_relacionado_id`; la original dice "Corregida por" con el numero nuevo, figura "Corregida, falta inutilizar" y ya no ofrece corregir; la confirmacion nombra el numero y dice que no se deshace; inutilizar deja "Inutilizado ante SIFEN", `ACCEPTED|1` en la base y un `FACTURA_NUMERO_INUTILIZADO` en auditoria, y el listado dice "Resuelta"; la nueva dice "Corrige a" y su enlace abre la original; con `INUT-RECHAZO` el mock rechaza (4003), se muestra el codigo y el boton sigue; sin desplazamiento horizontal. Por la API: CA-05 (`409` sobre una aprobada), CA-02 (`409` al corregir una aprobada) y CA-07 (`establecimiento` y `numero` del cuerpo se ignoran). La corrida final se hizo tras volver a desplegar con el texto de RN-C2 ajustado (ver E-3).

### E-3. Ajustes descubiertos al validar

- El texto de una corregida sin inutilizar repetia el del aviso del dia 15; quedo "Falta inutilizar el número de esta factura rechazada.".
- El boton del editor es "Crear factura" y en 1280 el menu es lateral: el guion lo contempla.
- Pendiente menor, fuera de esta cadena: la pastilla de estado del detalle usa el color de bloqueo para todo lo que no es `EMITIDA`, tambien para "Resuelta" y "Número inutilizado".
