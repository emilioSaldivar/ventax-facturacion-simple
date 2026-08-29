# PLAN Alineacion De Clave En Verificacion Fiscal v0.1

## Alineacion

- `AGENTS.md`
- `docs/SPEC_ALINEACION_CLAVE_VERIFICACION_FISCAL_v0.1.md`
- `docs/SPEC_BACKOFFICE_ALINEACION_FE_v0.2.md` (F0)
- `docs/TASKS_VERIFICACION_FISCAL_AUTOMATICA_v0.1.md`

## Decision De Diseno

El worker de verificacion pasa a usar **siempre** el gateway de clave compartida,
que es el mismo que ya usa el endpoint manual `POST /facturas/:id/refresh-status`
y que en produccion responde 200 sobre los mismos documentos.

| Opcion | Descartada porque |
| --- | --- |
| Que el cliente fiscal resuelva la clase de clave por ruta (dos claves en `FiscalGatewayConfig`, seleccion en `buildHeaders`) | Es la alineacion durable de F0, pero cambia la cabecera de **todas** las llamadas, incluidas emision y recibos, que hoy funcionan en produccion. Un error ahi rompe la emision fiscal. No es aceptable como respuesta a un incidente activo. Va a `docs/BACKLOG.md` |
| Pedir a `facturacion-electronica` que mueva `/documentos/:uuid/sifen` a `requireApiConsumer` + `SIFEN_STATUS_READ` | Fuera del limite de dominio de `AGENTS.md`; depende de otro repo y de un deploy que no controlamos, mientras produccion sigue sin verificar |
| Cargar la clave compartida en `facturadores.fe_consumer_api_key` de cada facturador | Rompe emision y recibos, que si necesitan la clave de consumidor. Ademas duplica un secreto en 4 filas de base de datos |
| Capturar el 401 y reintentar con la clave compartida | Enmascara el defecto con una llamada fallida por documento; deja el diseño ambiguo y duplica trafico contra el backend fiscal |

La correccion elegida es la de menor radio de impacto: toca un unico camino de
codigo, no altera ninguna llamada que hoy responde 200, y no requiere cambios de
datos, de infraestructura ni de otro repositorio.

## Diseno Detallado

### 1) `apps/api/src/modules/facturas/verificacion.worker.ts`

Hoy (linea 41):

```ts
const gateway = item.facturadorApiKey ? options.gatewayWithKey(item.facturadorApiKey) : options.gateway;
```

Pasa a usar directamente `options.gateway`, con un comentario en el punto de
decision que explique el reparto de claves del backend fiscal y referencie este
SPEC, para que el proximo lector no "restaure" la clave por facturador creyendo
que falta.

`gatewayWithKey` se elimina de la interfaz de opciones del worker: dejarlo sin
uso invita a que el defecto vuelva.

Esto cubre las dos llamadas del camino, porque ambas viajan en el mismo gateway:
`refreshFacturaStatus` (`/documentos/:uuid/sifen`) y `resolveDocumentoByCdc`
(`/documentos/by-cdc/:cdc`), esta ultima invocada dentro de
`refreshFiscalStatusForDocumento` cuando el documento no tiene `document_uuid`
local.

### 2) `apps/api/src/server.ts`

En el bloque `FE_VERIFY_WORKER_ENABLED` (linea 36) se quita el argumento
`gatewayWithKey` de `startVerificacionFiscalWorker`. El bloque
`FE_OUTBOX_WORKER_ENABLED` (linea 23) **no se toca**: la emision si necesita la
clave de consumidor.

### 3) `apps/api/src/modules/facturas/facturas.types.ts`

Se elimina `facturadorApiKey` de `PendingVerificacion`. Se **conserva** en
`PendingFiscalEmission`, donde es correcto y necesario.

### 4) `apps/api/src/modules/facturas/facturas.repository.ts`

En `claimNextVerificacion` (linea 881) se quitan `fa.fe_consumer_api_key` del
`returning` y `facturadorApiKey` del mapeo. El `join facturadores fa` queda sin
uso y se elimina tambien: es un inner join por clave primaria
(`fa.id = next_jobs.facturador_id`, FK obligatoria), por lo que su remocion no
puede cambiar el conjunto de filas reclamadas. Este punto se verifica contra
Postgres real, no por lectura.

`claimNextPendingEmission` (linea 828) **no se toca**.

### 5) Tests

En `apps/api/tests/facturas.service.test.ts` (o el archivo de tests del worker de
verificacion, segun donde vivan hoy los casos de F9):

- Se ajusta el fake del repositorio para el nuevo `PendingVerificacion` sin
  `facturadorApiKey`.
- Test nuevo de no-regresion: con un documento cuyo facturador tiene clave de
  consumidor, el worker debe llamar al backend con el gateway compartido. Se
  implementa inyectando un `gateway` espia y verificando que es ese el que recibe
  la llamada; si se decide conservar alguna forma de `gatewayWithKey`, el test
  debe afirmar que nunca se invoca.

## Riesgos Y Mitigacion

| Riesgo | Mitigacion |
| --- | --- |
| Romper la emision al tocar tipos/repositorio compartidos | El cambio de tipo es solo en `PendingVerificacion`; `PendingFiscalEmission` queda intacto. `npm run typecheck` cubre cualquier uso cruzado |
| Que la clave compartida no este presente en algun ambiente | Verificado en la VPS: `FE_API_KEY` del SaaS coincide con `API_KEY` del backend fiscal en staging y produccion. Se re-verifica antes del deploy |
| Que remover el `join` cambie las filas reclamadas | Inner join por PK con FK obligatoria; se valida el conteo reclamado antes/despues contra Postgres real |
| Que al drenar la cola se disparen notificaciones masivas por correo | Los documentos que resuelvan a estado terminal correcto no generan notificacion; solo la generan los que caigan en `REQUIERE_ACCION`/`REQUIERE_SOPORTE`, y `accion_notificada_at` limita a una por documento. Se observa el primer ciclo tras el deploy antes de dar por cerrada la iniciativa |
| Que el backend fiscal cambie el guard de la ruta mas adelante | La correccion sigue siendo valida: la clave compartida es la que la ruta exige hoy. El rediseño durable queda en `docs/BACKLOG.md` |

## Plan De Validacion

1. Local: `npm run typecheck` y `npm run lint` del workspace `api` limpios.
2. Local: `npm run test --workspace @facturacion-simple/api`, comparando contra
   la linea base de fallos preexistentes (6 al momento de esta iniciativa) para
   confirmar cero regresiones.
3. Local: test nuevo de no-regresion de clave en verde.
4. Postgres real (contenedor local): `claimNextVerificacion` devuelve las mismas
   filas antes y despues de quitar el join, con el nuevo shape sin
   `facturadorApiKey`.
5. Staging: deploy con `bash scripts/deploy.sh`, encolar/forzar la verificacion de
   un documento y confirmar 200 en los logs de `fe-test`.
6. Produccion: deploy y observacion del primer ciclo del worker — ausencia de 401
   nuevos, drenado de la cola de 44 documentos y `sifen_last_checked_at`
   actualizado.

La validacion visual con Playwright no aplica: la iniciativa no cambia UI. El
efecto observable para el operador (el semaforo fiscal que se actualiza solo) se
verifica por estado de datos y logs, no por pantalla.
