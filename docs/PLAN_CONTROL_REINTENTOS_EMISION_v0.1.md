# PLAN Control De Reintentos De Emision v0.1

## Alineacion

- `docs/SPEC_CONTROL_REINTENTOS_EMISION_v0.1.md`
- `AGENTS.md`

## Estrategia Tecnica

Cambio contenido enteramente en `apps/api/src/modules/facturas/`, sin migracion nueva. Replica el patron ya probado de `verificacion.worker.ts` (backoff array + corte por antiguedad + notificacion con guard `accion_notificada_at`) dentro de `processNextQueuedFiscalEmission()`, que es el unico llamador de `claimNextPendingEmission()`/`failPendingEmission()` (confirmado por grep: solo se usa desde `facturas.worker.ts` y tests). No se toca `facturas.worker.ts` — su `tick()` ya solo orquesta el intervalo, toda la logica nueva vive dentro de la funcion de servicio existente.

## Cambios En `facturas.types.ts`

- `PendingFiscalEmission` (linea 318-324): agregar tres campos.

```typescript
export interface PendingFiscalEmission {
  outboxId: string;
  documentoId: string;
  facturadorId: string;
  facturadorApiKey: string | null;
  fiscalRequest: FiscalEmitFacturaRequest;
  attempts: number;               // nuevo — o.attempts tras el incremento del claim
  documentoCreatedAt: string;     // nuevo — f.created_at, ISO string
  accionNotificadaAt: string | null; // nuevo — f.accion_notificada_at, ISO string o null
}
```

- `FacturaRepository["failPendingEmission"]` (linea 367-373): agregar `outboxEstado`.

```typescript
failPendingEmission(input: {
  outboxId: string;
  documentoId: string;
  outboxEstado: "FAILED_TEMP" | "FAILED_PERM"; // nuevo
  estado: DocumentoEstado;
  error: Record<string, unknown>;
  retryAfterSeconds: number;
}): Promise<DocumentoResponse | null>;
```

## Cambios En `facturas.repository.ts`

### `claimNextPendingEmission()` (lineas 825-870)

Agregar al `select`/`returning` de la query (lineas 849-854) `o.attempts as attempts`, `f.created_at as documento_created_at`, `f.accion_notificada_at as accion_notificada_at`. Actualizar `PendingFiscalEmissionRow` (interfaz privada, linea 51) con los mismos tres campos. Mapear en el `return` (lineas 863-869):

```typescript
return {
  outboxId: row.outbox_id,
  documentoId: row.documento_id,
  facturadorId: row.facturador_id,
  facturadorApiKey: (row.fe_consumer_api_key as string | null) ?? null,
  fiscalRequest: row.fiscal_request_snapshot as PendingFiscalEmission["fiscalRequest"],
  attempts: row.attempts as number,
  documentoCreatedAt: (row.documento_created_at as Date).toISOString(),
  accionNotificadaAt: row.accion_notificada_at ? (row.accion_notificada_at as Date).toISOString() : null
};
```

No cambia el `join`/`where` de la query — `f` (`facturas_operativas`) ya esta joineado (linea 831), solo se agregan columnas al `select`.

### `failPendingEmission()` (lineas 1071-1139)

Reemplazar el literal `'FAILED_TEMP'` (linea 1086) por el parametro nuevo:

```typescript
update factura_emision_outbox
set
  estado = $4,
  locked_at = null,
  next_attempt_at = now() + ($2::text || ' seconds')::interval,
  last_error = $3::jsonb,
  updated_at = now()
where id = $1
```

con `[input.outboxId, input.retryAfterSeconds, JSON.stringify(input.error), input.outboxEstado]`. El `next_attempt_at` se sigue calculando igual aunque `outboxEstado = 'FAILED_PERM'`: es inofensivo porque `claimNextPendingEmission()` filtra por `estado in ('PENDING', 'FAILED_TEMP')` (linea 832) y `FAILED_PERM` nunca vuelve a ser reclamado — no hace falta una rama SQL distinta.

Sin cambios en el resto de la funcion (el `update facturas_operativas` que sigue, lineas 1096-1127, no cambia — el valor de `estado` que recibe ya viene resuelto por el llamador segun RN-3).

## Cambios En `facturas.accion.ts`

Linea 5: `const HORAS_PERSISTENCIA_ERROR_TEMPORAL = 24;` -> `const HORAS_PERSISTENCIA_ERROR_TEMPORAL = 1;`

Actualizar el comentario de cabecera (lineas 34-37) para reflejar que el umbral ya no es un placeholder de 24h sino la decision de negocio de esta iniciativa (referenciar `SPEC_CONTROL_REINTENTOS_EMISION_v0.1.md`).

Sin cambios en la firma de `deriveAccion()` ni en `DeriveAccionInput` — la funcion ya es generica.

## Cambios En `facturas.service.ts`

### Imports nuevos (cabecera del archivo)

```typescript
import { deriveAccion } from "./facturas.accion";
import { notifyAccionRequerida } from "./facturas.notificaciones";
```

Verificar antes de implementar que no exista un ciclo de imports: `facturas.accion.ts` y `facturas.notificaciones.ts` solo importan de `./facturas.types` y `./sifen-causa-catalogo`/`../../shared/*` — ninguno importa desde `facturas.service.ts`, por lo que no hay ciclo.

### Constantes nuevas (junto a `processNextQueuedFiscalEmission`, antes de la funcion)

```typescript
/**
 * Backoff del worker de emision fiscal pre-emision (SPEC_CONTROL_REINTENTOS_EMISION_v0.1,
 * incidente AWAPURA 2026-08-14/24): indexado por attempts (1-based, ya incrementado por
 * claimNextPendingEmission antes de fallar). El primer valor (60s) preserva el
 * comportamiento anterior para el caso mas comun (fallo aislado que se autorresuelve).
 */
const EMISION_BACKOFF_SECONDS = [
  60,           // intento 1 -> 1m
  5 * 60,       // intento 2 -> 5m
  15 * 60,      // intento 3 -> 15m
  30 * 60,      // intento 4 -> 30m
  60 * 60,      // intento 5 -> 1h
  2 * 60 * 60,  // intento 6 -> 2h
  4 * 60 * 60,  // intento 7 -> 4h
  6 * 60 * 60   // intento 8+ -> 6h (se repite hasta el corte)
];

const HORAS_CORTE_REINTENTO_EMISION = 24;

function nextEmisionBackoffSeconds(attempts: number): number {
  const index = Math.min(Math.max(attempts, 1), EMISION_BACKOFF_SECONDS.length) - 1;
  return EMISION_BACKOFF_SECONDS[index] ?? EMISION_BACKOFF_SECONDS[EMISION_BACKOFF_SECONDS.length - 1]!;
}
```

### `processNextQueuedFiscalEmission()` (lineas 1047-1088) — reescribir el bloque `catch`

```typescript
} catch (error) {
  if (error instanceof FiscalGatewayError) {
    const ageMs = Date.now() - new Date(pending.documentoCreatedAt).getTime();
    const cutover = ageMs >= HORAS_CORTE_REINTENTO_EMISION * 60 * 60 * 1000;
    const retryAfterSeconds = nextEmisionBackoffSeconds(pending.attempts);

    const updated = await repository.failPendingEmission({
      outboxId: pending.outboxId,
      documentoId: pending.documentoId,
      outboxEstado: cutover ? "FAILED_PERM" : "FAILED_TEMP",
      estado: cutover ? "ERROR_TEMPORAL" : (error.code === "TIMEOUT" ? "PENDIENTE_SIFEN" : "ERROR_TEMPORAL"),
      error: {
        code: error.code,
        message: error.message,
        details: error.details ?? null,
        recoverable: !cutover,
        retry_after_seconds: cutover ? null : retryAfterSeconds,
        suggested_action: cutover
          ? "CONTACTAR_SOPORTE"
          : (error.code === "TIMEOUT" ? "REFRESH_OR_RETRY" : "RETRY_EMISSION")
      },
      retryAfterSeconds
    });

    if (updated && !pending.accionNotificadaAt) {
      const { accion, accion_detalle } = deriveAccion(updated);
      if (accion === "REQUIERE_ACCION" || accion === "REQUIERE_SOPORTE") {
        try {
          await notifyAccionRequerida(
            pending.facturadorId,
            updated,
            accion_detalle,
            accion === "REQUIERE_SOPORTE",
            repository
          );
        } catch (notifyError) {
          logger.error(
            { err: notifyError, documentoId: pending.documentoId },
            "outbox emision: fallo al notificar accion requerida"
          );
        }
        await repository.markAccionNotificada(pending.documentoId);
      }
    }

    return updated;
  }
  throw error;
}
```

Verificar que `logger` ya este importado en `facturas.service.ts` (se usa en otras partes del archivo, ej. `persistTipoTransaccionDefault`, linea ~1040) — no requiere import nuevo.

## Orden De Implementacion

1. `facturas.types.ts`: `PendingFiscalEmission` + firma de `failPendingEmission`.
2. `facturas.repository.ts`: `claimNextPendingEmission()` (columnas nuevas) + `failPendingEmission()` (parametro `outboxEstado`).
3. `facturas.accion.ts`: bajar `HORAS_PERSISTENCIA_ERROR_TEMPORAL` a `1` + actualizar comentario.
4. `facturas.service.ts`: imports, constantes de backoff, reescritura del `catch` de `processNextQueuedFiscalEmission()`.
5. Actualizar fakes/mocks de `FacturaRepository` en tests (`apps/api/tests/facturas.service.test.ts`, `apps/api/tests/entrega.service.test.ts`) para que `claimNextPendingEmission`/`failPendingEmission` cumplan la interfaz nueva sin romper compilacion.
6. Tests unitarios nuevos (ver Estrategia De Testing).
7. Validacion contra Postgres real (no solo fakes) del camino completo: fallo -> backoff -> (simulado) corte a 24h -> `FAILED_PERM` -> reintento manual exitoso.

## Validaciones

- Backend: `npm run test --workspace @facturacion-simple/api`, `npm run typecheck --workspace @facturacion-simple/api`, `npm run lint --workspace @facturacion-simple/api`.
- Sin cambios de contrato HTTP: no hace falta tocar `spec/openapi.yaml` ni el frontend.
- Sin migracion: no aplica validacion de migracion contra Postgres real, pero si conviene una prueba manual contra Postgres real del flujo de `failPendingEmission` con `outboxEstado='FAILED_PERM'` para confirmar que `claimNextPendingEmission()` efectivamente deja de reclamar esa fila (la unica forma de probar esto con confianza es contra la DB real, no con fakes).
- Deploy: `bash scripts/deploy.sh` antes de smoke test end-to-end si se requiere verificar contra el stack containerizado — no es estrictamente necesario para esta iniciativa (no toca UI ni contrato), pero recomendado dado que corrige un incidente de produccion real.

## Riesgos

- **Cambiar `HORAS_PERSISTENCIA_ERROR_TEMPORAL` de 24 a 1 afecta tambien el badge/semaforo que ve el operador en la UI para *cualquier* documento en `ERROR_TEMPORAL`**, no solo los que pasan por el worker de outbox (ej. si en el futuro algo mas setea ese estado). Se acepta como parte deliberada de la SPEC (RN-4): el mismo umbral que dispara la notificacion es el que pinta el badge, y ambos deberian coincidir — no tiene sentido notificar a la 1h pero seguir mostrando "en proceso" en la UI hasta las 24h.
- **Corte a 24h en una caida real y prolongada de `facturacion-electronica`** (no un error de configuracion): el documento pasa a `FAILED_PERM` igual. Aceptado en SPEC (Errores Relevantes) — el reintento manual sigue disponible y 24h con backoff creciente ya cubre razonablemente una caida de proveedor.
- **`retry_after_seconds` en el jsonb persistido para el caso de corte (`null`)**: si algun consumidor externo (frontend, backoffice) lee ese campo especifico del jsonb y no tolera `null`, podria romper. Se verifica en TASKS que ningun lugar del codigo lee `fiscal_response_snapshot.retry_after_seconds` de forma tipada (es jsonb de solo diagnostico/soporte, no parte de `DocumentoResponse`).

## Estrategia De Testing

- Unit (`facturas.repository.ts` via fakes/mocks existentes en `apps/api/tests/facturas.service.test.ts`):
  - `nextEmisionBackoffSeconds()`: tabla completa de `attempts` 1 a 8+, confirma que el intento 9 repite el valor del 8.
  - `processNextQueuedFiscalEmission()` con `pending.attempts` y `pending.documentoCreatedAt` variados: confirma `outboxEstado='FAILED_TEMP'` y `retryAfterSeconds` correcto cuando `ageMs < 24h`; confirma `outboxEstado='FAILED_PERM'`, `estado='ERROR_TEMPORAL'`, `recoverable=false` cuando `ageMs >= 24h` (incluyendo el caso `error.code==='TIMEOUT'`, que debe forzarse a `ERROR_TEMPORAL` igual, no quedar en `PENDIENTE_SIFEN`).
  - Notificacion: mock de `notifyAccionRequerida`/`markAccionNotificada` — confirma que se invoca cuando `deriveAccion()` devuelve `REQUIERE_SOPORTE` y `pending.accionNotificadaAt` es `null`; confirma que NO se invoca si `accionNotificadaAt` ya tiene valor; confirma que un throw de `notifyAccionRequerida` no impide que la funcion retorne el `DocumentoResponse` actualizado (no relanza).
- Integracion: si existe infraestructura de test contra Postgres real (revisar en TASKS si aplica, siguiendo el precedente de `TSF-012` que la descarto por no existir en la suite) — de lo contrario, verificacion manual real equivalente a la usada en el incidente: forzar un fallo repetido, confirmar backoff creciente en `next_attempt_at`, confirmar transicion a `FAILED_PERM` pasado el corte, confirmar que `retryDocumentoEmission` recupera el documento.
- No aplica Playwright: sin cambios de UI.
