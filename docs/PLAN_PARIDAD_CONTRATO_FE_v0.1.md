# PLAN Paridad con el contrato de facturacion-electronica v0.1

**Versión:** 0.1
**Fecha:** 2026-09-25
**Estado:** DRAFT — pendiente TASKS

## Alineación

- `AGENTS.md`
- `docs/SPEC_PARIDAD_CONTRATO_FE_v0.1.md` (RN-01 a RN-08, CA-1 a CA-16)
- `facturacion-electronica-consumer-docs/CHECKLIST_REINTENTO_CANCELACION.md`
- `facturacion-electronica-consumer-docs/GUIA_INTEGRACION_CONSUMIDORES.md` §7

---

## 1. Estrategia

### 1.1 Primero el defecto, después la funcionalidad

G1 no es una mejora: es una corrección. Hoy, en producción, una cancelación aceptada y una rechazada
se muestran igual, y aproximadamente una de cada siete anulaciones queda en un estado falso. Eso se
arregla antes de sumar endpoints nuevos.

G1 además es **desplegable solo**: no toca el modelo de datos más que para persistir el resultado, no
depende de G2 ni de G3, y su verificación es acotada.

### 1.2 El mapeo de estados deja de ser una lista de sinónimos

`mapCancelStatus` hoy acumula variantes en dos idiomas (`DONE`, `APPROVED`, `ACEPTADO`, `ANULADO`,
`CANCELADO`) y manda todo lo desconocido a `PENDIENTE_SIFEN`. Ese diseño es la causa del defecto: un
valor nuevo del proveedor se convierte en "pendiente" en vez de en un error visible.

Pasa a ser un mapeo **cerrado sobre el contrato**: los cuatro estados que FE documenta, y un quinto
camino explícito para lo desconocido, que se registra y se muestra como indeterminado en vez de
disfrazarse de pendiente.

### 1.3 El resultado de la cancelación es un objeto, no un estado

Hoy el gateway devuelve `{ event_id, estado, raw }`. Pasa a devolver también `rejection`
(`code`, `message`, `retryable`), porque es lo que decide si la UI ofrece reintentar. Sin eso, la
decisión quedaría en el frontend leyendo `raw`, que es exactamente lo que el contrato viene a evitar.

### 1.4 Los `409` se traducen, no se envuelven

El service deja de convertir todo `FiscalGatewayError` en `502`. Los cuatro códigos de evento se
traducen a `HttpError` con su propio status y mensaje; el resto conserva el comportamiento actual.

---

## 2. Orden de ejecución

```
F1. Cancelación: contrato de estados, rejection y reintento   ← defecto en producción
F2. Cancelación: los cuatro 409 y el 404 de eventos
F3. UI: resultado del rechazo y acción de reintento
F4. Linaje de CDC
F5. Estado de lotes BATCH
F6. Decisión sobre /consultar/ruc
F7. Inventario de /admin y de lo no adoptado
```

F1 a F3 son una sola entrega funcional. F4 a F7 son independientes entre sí y de G1.

---

## Fase 1 — Contrato de estados de cancelación

### 1.1 Tipos (`fiscal-gateway.types.ts`)

```ts
export type FiscalCancelStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "FAILED" | "UNKNOWN";

export interface FiscalCancelRejection {
  code: string | null;
  message: string | null;
  /** FE lo resuelve; un codigo nuevo no verificado llega como false (RN-03). */
  retryable: boolean;
}

export interface FiscalCancelFacturaResponse {
  event_id: string | null;
  /** Estado del evento segun el contrato de FE, sin traducir. */
  status: FiscalCancelStatus;
  rejection: FiscalCancelRejection | null;
  raw: Record<string, unknown>;
}
```

`estado` (nuestro vocabulario) se deriva del `status` en el service, no en el mapper: el gateway
reporta lo que FE dice; la traducción a estado operativo es decisión nuestra.

### 1.2 Mapeo cerrado

```ts
function mapCancelStatus(value: string | null): FiscalCancelStatus {
  switch (value) {
    case "PENDING": case "ACCEPTED": case "REJECTED": case "FAILED":
      return value;
    default:
      return "UNKNOWN";   // se registra; NO se disfraza de PENDING
  }
}
```

`UNKNOWN` se loguea con el valor recibido. Es la señal de que FE incorporó un estado y hay que mirarlo,
en vez de que el sistema lo absorba en silencio.

### 1.3 Traducción a estado operativo (RN-01, RN-04)

| `status` de FE | Estado local | Efecto |
|---|---|---|
| `ACCEPTED` | `ANULADA` | Único caso que anula |
| `REJECTED` | sin cambio | La factura sigue vigente; se guarda el rechazo |
| `PENDING` | `PENDIENTE_SIFEN` | Esperando |
| `FAILED` | sin cambio | Indeterminado: hay que consultar |
| `UNKNOWN` | sin cambio | Se registra para revisión |

**Ningún camino que no sea `ACCEPTED` modifica el estado comercial.** Es RN-04 y es la regla que
protege el caso que el checklist marca en rojo: revertir un cobro contra una factura viva.

### 1.4 Reintento

El reintento **no necesita endpoint nuevo**: es el mismo `POST /evento/cancelar` con el mismo CDC. Lo
que hace falta es permitirlo en nuestro flujo, que hoy asume un solo intento. Se agrega
`reintentar: boolean` al input del service, que omite la validación de "ya se intentó" y deja
constancia en la auditoría.

### 1.5 Persistencia

`facturas_operativas` suma columnas para el último intento de cancelación:
`cancelacion_status`, `cancelacion_rejection_code`, `cancelacion_rejection_message`,
`cancelacion_retryable`, `cancelacion_intentos`, `cancelacion_last_at`. Aditivas y nullable, en línea
con `0028_verificacion_fiscal`.

---

## Fase 2 — Los cuatro `409` y el `404` de eventos

### 2.1 Errores de evento

```ts
const ERRORES_EVENTO: Record<string, { status: number; mensaje: string }> = {
  EVENT_ALREADY_EXISTS: { status: 409, mensaje: "La factura ya esta anulada en SIFEN." },
  EVENT_IN_PROGRESS:    { status: 409, mensaje: "Hay una anulacion en curso. Esperá y volvé a consultar." },
  CANCEL_WINDOW_EXPIRED:{ status: 409, mensaje: "Pasaron mas de 48 horas desde la aprobacion: corresponde nota de credito." },
  INVALID_DOCUMENT_STATUS: { status: 409, mensaje: "El documento no esta aprobado: no se puede anular." }
};
```

`EVENT_ALREADY_EXISTS` además **reconcilia**: consulta los eventos y, si hay `CANCEL` + `ACCEPTED`,
deja el estado local en anulada. Es la diferencia entre informar un conflicto y resolverlo.

### 2.2 `404` en la lista de eventos (RN-06)

`getDocumentoEventos` deja de lanzar ante un `404` cuyo `error` sea `NOT_FOUND`: devuelve
`{ events: [] }`. Solo `DOCUMENTO_NOT_FOUND` sigue siendo error.

---

## Fase 3 — UI

`apps/web-operacion/src/main.tsx`, en el detalle del documento:

- Cancelación rechazada: bloque con el motivo (`code` + `message`) y, si `retryable`, botón
  **Reintentar anulación**. Si no, el texto explica que es terminal y qué corresponde.
- `FAILED`: "No hubo respuesta de SIFEN. Consultá el estado antes de reintentar", con acción de
  consultar.
- Los cuatro `409` con su mensaje propio.
- Sin eventos deja de mostrarse como error.

El vocabulario sigue la línea de `SPEC_BACKOFFICE_ALINEACION_FE_v0.2` F9: qué hacer, no qué código
devolvió SIFEN.

---

## Fase 4 — Linaje de CDC

`GET /documentos/{uuid}/lineage` en el gateway y en el detalle del documento, detrás de las opciones
avanzadas. Solo lectura; no se persiste.

---

## Fase 5 — Estado de lotes BATCH

`GET /consultar/{id}/lotes` y `/lotes/{protocol}`. Complementa `batch-pendientes`, que ya usamos: hoy
sabemos cuántos quedan pendientes pero no en qué lote viajaron ni qué dijo SIFEN de ese lote.
Se expone en el backoffice, que es donde se diagnostica.

---

## Fase 6 — Decisión sobre `/consultar/ruc`

Mantenemos `dnit-ruc-loader`: un contenedor, un cron y `dnit_ruc_contribuyentes`. FE expone
`GET /consultar/ruc/{ruc}`.

No se decide en este PLAN cuál conviene: se produce la comparación que permite decidir —cobertura,
latencia, disponibilidad offline, costo de mantenimiento y el hecho ya registrado de que **la DNIT no
republica el padrón todos los meses**— y se documenta la decisión. Es una tarea de análisis con
entregable, no una implementación.

---

## Fase 7 — Inventario

Dos tablas en `docs/OPERACION_PARIDAD_FE_v0.1.md`:

1. **Dependencias `/admin`**: los seis endpoints, qué hacen, si el contrato de consumidor tiene
   equivalente, y el riesgo de cada uno.
2. **No adoptado**: los 16 endpoints con el motivo (RN-07).

---

## 3. Validaciones

| Momento | Qué se valida |
|---|---|
| Mapeo | Los 4 estados del contrato; lo desconocido no se disfraza de pendiente |
| Traducción | Solo `ACCEPTED` anula (RN-01, RN-04) |
| Rechazo | `code`, `message` y `retryable` llegan al service y a la UI |
| Reintento | Mismo CDC, mismo endpoint, sin documento nuevo |
| Errores | Los 4 `409` con mensaje propio; ninguno como `502` |
| Eventos | `404 NOT_FOUND` es lista vacía; `DOCUMENTO_NOT_FOUND` es error |

---

## 4. Testing

**Unitarios**: mapeo de los 5 estados incluido `UNKNOWN`; `rejection` completo; traducción a estado
operativo con la tabla de §1.3; los 4 `409`; el `404` de eventos.

**Service**: ningún camino distinto de `ACCEPTED` toca el estado comercial (RN-04); el reintento no
crea documento; `EVENT_ALREADY_EXISTS` reconcilia.

**Integración**: la persistencia del rechazo y el contador de intentos.

**Playwright**: rechazo con reintento y rechazo terminal, mobile y desktop.

**Smoke contra fe-test**: una cancelación real sobre un documento aprobado del emisor de pruebas,
verificando el cuerpo real. Es el único modo de confirmar la forma de `rejection`, porque los fixtures
la reproducen a partir de la documentación.

---

## 5. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| 1 | **Hay facturas en producción con el estado falso** («pendiente» por una cancelación ya resuelta) | Tras F1, una consulta de reconciliación sobre los documentos con intento de cancelación y sin resolución. No se corrige a ciegas: se lista y se revisa |
| 2 | **La forma de `rejection` se toma de la documentación**, no de una respuesta real capturada | El smoke contra fe-test es parte del alcance, no opcional. El mapeo tolera campos ausentes |
| 3 | **`UNKNOWN` puede aparecer si FE agrega un estado** | Es el objetivo del diseño: se registra y se ve, en vez de absorberse |
| 4 | **La dependencia de `/admin` no se resuelve acá** | Se declara con su riesgo. Migrar exige que FE publique equivalentes |
| 5 | **Reintentar sin límite podría castigar a SIFEN** | El reintento es manual, lo decide el operador y queda contado en `cancelacion_intentos` |

---

## 6. Qué queda fuera

- Artefactos por CDC y formato ticket: sin caso de uso hoy.
- Consultas directas a SIFEN por CDC: `documentos/{uuid}/sifen` ya cubre nuestra necesidad.
- `GET /recibos` y `PATCH`/`DELETE`: nuestro modelo de recibos es local y el ciclo de vida lo maneja el SaaS.
- Cambiar el modelo de claves de FE.
