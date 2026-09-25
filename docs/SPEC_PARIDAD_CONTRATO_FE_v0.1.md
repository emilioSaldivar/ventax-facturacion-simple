# SPEC Paridad con el contrato de facturacion-electronica v0.1

**Versión:** 0.1
**Fecha:** 2026-09-25
**Estado:** DRAFT — pendiente PLAN/TASKS

## Alineación

- `facturacion-electronica` en su commit desplegado en producción: `8453509`
- `facturacion-electronica-consumer-docs/openapi.yaml` (37 endpoints del contrato de consumidor)
- `facturacion-electronica-consumer-docs/GUIA_INTEGRACION_CONSUMIDORES.md` (1587 líneas, 25 secciones)
- `facturacion-electronica-consumer-docs/CHECKLIST_REINTENTO_CANCELACION.md` (2026-09-14, aplica desde `b274bfc` en producción)
- `docs/SPEC_BACKOFFICE_ALINEACION_FE_v0.2.md` (F1–F9; este SPEC no lo reemplaza)
- Código: `apps/api/src/modules/fiscal-gateway/fiscal-gateway.client.ts`, `apps/api/src/modules/facturas/facturas.service.ts`

**Principio rector:** paridad **no** significa consumir los 37 endpoints. Significa que lo que ya
consumimos lo interpretemos como FE lo define, que adoptemos lo que aporta valor operativo, y que lo
que decidamos no adoptar quede declarado como decisión y no como olvido.

---

## 1. Objetivo

Alinear nuestro SaaS con el contrato de `facturacion-electronica` tal como está desplegado en
producción hoy, priorizando por riesgo: primero lo que hoy interpretamos mal —que produce estados
incorrectos frente al operador—, después lo que no consumimos, y por último lo que consumimos por
fuera del contrato de consumidor.

---

## 2. Estado verificado (2026-09-25)

### 2.1 Superficie

| | Cantidad |
|---|---|
| Endpoints del contrato de consumidor de FE | 37 |
| Que nuestro gateway consume | 21 |
| Que **no** consumimos | 16 |
| Endpoints `/admin/*` que consumimos y **no** están en el contrato de consumidor | 6 |

### 2.2 G1 — Interpretación incorrecta de la cancelación (en producción)

El `CHECKLIST_REINTENTO_CANCELACION` define que un evento de cancelación tiene
`status ∈ {PENDING, ACCEPTED, REJECTED, FAILED}`, y `admin-eventos.service.ts:13` lo confirma:
`CONCLUSIVE_STATUSES = ['ACCEPTED', 'REJECTED']`.

Nuestro `mapCancelStatus` (`fiscal-gateway.client.ts:1659-1680`) acepta
`DONE | APPROVED | ACEPTADO | ANULADO | CANCELADO` como cancelación exitosa, y **todo lo demás cae en
`PENDIENTE_SIFEN`**. Consecuencias, las dos en producción:

| Lo que devuelve FE | Lo que mostramos | Debería ser |
|---|---|---|
| `ACCEPTED` (cancelación aceptada) | `PENDIENTE_SIFEN` | `ANULADA` |
| `REJECTED` (SIFEN rechazó) | `PENDIENTE_SIFEN` | Rechazada, con opción de reintentar |
| `FAILED` (sin respuesta de SIFEN) | `PENDIENTE_SIFEN` | Indeterminado: hay que consultar |

FE documenta que SIFEN rechaza **~15% de las cancelaciones** con `0100 "Error Inesperado"`, de forma
no determinista. Es decir: aproximadamente una de cada siete anulaciones queda mostrando "esperando
SIFEN" para siempre, cuando en realidad fue rechazada y admite reintento.

Además:

1. **`rejection` se descarta.** `mapFiscalCancelResponse` (`:1644`) lee `event_id` y `status`; el
   objeto `rejection` —con `code`, `message` y **`retryable`**— no se mapea. El dato que FE agregó
   justamente para que el consumidor sepa si puede reintentar no sale del gateway.
2. **No existe el reintento.** FE habilitó reintentar una cancelación rechazada sobre el mismo CDC y
   el mismo endpoint (`27234cd`, RC-17 cerrado en producción). Nosotros no lo ofrecemos.
3. **Los cuatro `409` no se distinguen.** `EVENT_ALREADY_EXISTS`, `EVENT_IN_PROGRESS`,
   `CANCEL_WINDOW_EXPIRED` e `INVALID_DOCUMENT_STATUS` no aparecen en nuestro código. Todos terminan
   en `HttpError(502, "INTERNAL_ERROR", "No se pudo cancelar documento fiscal.")`
   (`facturas.service.ts:379-387`). Es literalmente el anti-patrón que el checklist señala en su
   punto 5: *"Si la capa intermedia lo reemplaza por un 502 genérico, ese detalle se pierde antes de
   llegar a quien opera"*. El caso más visible: `EVENT_ALREADY_EXISTS` significa que la factura **ya
   está anulada**, y se lo mostramos al operador como un error del sistema.
4. **El `404` de eventos se trata como falla.** `GET /documentos/{uuid}/eventos` devuelve `404` con
   `error: "NOT_FOUND"` cuando el documento no tiene eventos, que el checklist define como **estado
   normal de una factura vigente**. Nuestro gateway (`:707-713`) lo convierte en `UPSTREAM_ERROR`.
   Solo `DOCUMENTO_NOT_FOUND` es un error real.

### 2.3 G2 — Endpoints del contrato que no consumimos

| Endpoint | Qué aporta |
|---|---|
| `GET /consultar/ruc/{ruc}` | Consulta de RUC contra SIFEN. **Se solapa con nuestro `dnit-ruc-loader`**: un contenedor, un cron y la tabla `dnit_ruc_contribuyentes` que mantenemos para lo mismo |
| `GET /documentos/{uuid}/lineage` | Linaje de CDC: qué documento derivó de cuál |
| `POST /evento/inutilizacionnumfactura` | Inutilización de rangos por el contrato de consumidor (hoy lo hacemos por `/admin/.../void-number`) |
| `GET /consultar/{id}/lotes` y `/lotes/{protocol}` | Estado de los lotes BATCH |
| `GET /documentos/{uuid}/files/ticket/raw` | Formato ticket para impresora térmica |
| `GET /consultar/comprobante/{cdc}`, `/comprobanteSifen/{cdc}`, `/comprobantexml/{cdc}`, `/evento/{cdc}` | Consulta directa a SIFEN por CDC |
| `GET /files/kude/{cdc}.pdf`, `/files/ticket/{cdc}/raw`, `/files/xml/{cdc}` | Artefactos por CDC (alternativa a los de `/documentos/{uuid}`) |
| `POST /conciliacion/idempotency/cancel-send` | Conciliación de idempotencia para cancelación de envío |
| `GET /documentos/{uuid}`, `GET /documentos/{uuid}/xml` | Lectura del documento canónico |
| `GET /recibos`, `PATCH /recibos/{id}`, `DELETE /recibos/{id}` | Listado y edición de recibos del lado fiscal |

### 2.4 G3 — Dependencia de endpoints fuera del contrato de consumidor

Consumimos seis endpoints `/admin/emisores/{id}/facturas/{id}/*`: `cancel-send`, `create-derived`,
`decision`, `retry-same-cdc`, `validate-cdc-impact` y `void-number`. **Ninguno está en el contrato de
consumidor.** Son superficie administrativa, requieren la clave compartida, y su estabilidad no está
garantizada por el contrato que FE publica para integradores.

Se conecta con dos riesgos ya registrados: el `401` en la verificación fiscal automática de producción
porque `/documentos/:uuid/sifen` exige la clave compartida, y que esa clave es la misma en producción,
staging y POS.

### 2.5 Lo que sí está alineado

Emisión de facturas y notas de crédito, artefactos KUDE/XML por `document_uuid`, consulta de estado
SIFEN, recibos de dinero (crear, emitir, anular, PDF, XML, verificación pública), conciliación de
idempotencia y `health`. El mapeo de `grupo_actividades` y perfiles sin actividad fija quedó resuelto
en `SPEC_IMPORT_CONFIG_FACTURADOR_v0.2`.

---

## 3. Alcance

### Incluido

- **G1 completo.** Es corrección de defecto sobre producción, no funcionalidad nueva.
- **G2 selectivo**, por valor operativo: linaje de CDC, estado de lotes BATCH, y la decisión sobre
  `/consultar/ruc`.
- **G3 documentado**: inventario de la dependencia administrativa, con la migración al contrato de
  consumidor donde exista equivalente.

### Excluido

- Consumir los 37 endpoints. Varios no aportan a nuestro producto (ver RN-07).
- Cambiar el modelo de claves de FE. Es de su dominio; acá solo se declara la dependencia.
- Formato ticket y artefactos por CDC: no hay caso de uso hoy (RN-07).

---

## 4. Reglas de negocio

- **RN-01 — Una factura está anulada solo con `CANCEL` + `ACCEPTED`.** Ningún otro estado la da por
  anulada. Mirar solo el `type` del evento es incorrecto.
- **RN-02 — El rechazo de SIFEN no es un error del sistema.** Llega como `200`. Se muestra al operador
  como un resultado con su motivo, no como una falla de la plataforma.
- **RN-03 — `retryable` manda.** Si `rejection.retryable` es `true`, se ofrece reintentar sobre el
  mismo CDC. Si es `false`, es terminal: no se reintenta y se escala. **No se clasifica por código
  propio**: un código nuevo que nadie verificó llega como `false`, que es el lado seguro.
- **RN-04 — No se toca el estado comercial hasta `ACCEPTED`.** Con `REJECTED` la factura sigue vigente
  en SIFEN; con `FAILED` no se sabe. En ninguno de los dos casos se revierte un cobro ni se marca la
  factura como anulada.
- **RN-05 — Los `409` de evento son respuestas, no errores internos.** Cada uno tiene su mensaje y su
  acción. `EVENT_ALREADY_EXISTS` en particular es una **buena** noticia: la factura ya está anulada.
- **RN-06 — Sin eventos es un estado normal.** `404` con `error: "NOT_FOUND"` en la lista de eventos
  significa "esta factura no tiene eventos", no una falla. Solo `DOCUMENTO_NOT_FOUND` es error.
- **RN-07 — Lo que no se adopta, se declara.** Cada endpoint del contrato que decidimos no consumir
  queda listado con su motivo. La ausencia de un endpoint no puede ser un descubrimiento futuro.
- **RN-08 — Preferir el contrato de consumidor sobre `/admin`.** Cuando exista equivalente publicado,
  se migra. Donde no exista, la dependencia queda declarada como deuda con su riesgo.

---

## 5. Casos

### Caso A — Cancelación aceptada
El operador anula una factura, FE responde `200` con `status: "ACCEPTED"`. La factura pasa a anulada y
el recibo asociado, si lo hay, puede revertirse.

### Caso B — Cancelación rechazada y reintentada
FE responde `200` con `status: "REJECTED"` y `rejection: { code: "0100", retryable: true }`. La
pantalla muestra que SIFEN rechazó, con el motivo, y ofrece **Reintentar**. La factura sigue vigente y
el cobro no se toca. El reintento va al mismo CDC y al mismo endpoint.

### Caso C — Rechazo terminal
`rejection.retryable: false` (por ejemplo `4009`, plazo extemporáneo). No se ofrece reintento; se
indica que corresponde nota de crédito.

### Caso D — La factura ya estaba anulada
FE responde `409 EVENT_ALREADY_EXISTS`. Hoy el operador ve "No se pudo cancelar documento fiscal".
Debe ver que la factura ya está anulada, y el estado local debe quedar consistente.

### Caso E — Factura vigente sin eventos
`GET /documentos/{uuid}/eventos` devuelve `404 NOT_FOUND`. Es una factura sana sin eventos; la
pantalla lo muestra como tal, no como error.

---

## 6. Criterios de aceptación

1. Una cancelación con `status: "ACCEPTED"` deja la factura como anulada.
2. Una cancelación con `status: "REJECTED"` **no** la deja como anulada y expone `code`, `message` y `retryable`.
3. Con `retryable: true` la UI ofrece reintentar; con `false` no lo ofrece y explica por qué.
4. El reintento usa el mismo CDC y el mismo endpoint, y no crea un documento nuevo.
5. `FAILED` se distingue de `PENDING` y no permite revertir nada.
6. Ningún estado comercial ni cobro se modifica sin `ACCEPTED` (RN-04).
7. Los cuatro `409` producen mensajes distintos y accionables; ninguno llega como `502`.
8. `EVENT_ALREADY_EXISTS` deja el estado local consistente con "anulada".
9. `404 NOT_FOUND` en la lista de eventos se muestra como "sin eventos"; `DOCUMENTO_NOT_FOUND` sigue siendo error.
10. El linaje de CDC se puede consultar desde el detalle del documento.
11. El estado de los lotes BATCH se puede consultar para un facturador.
12. La decisión sobre `/consultar/ruc` frente al `dnit-ruc-loader` queda tomada y documentada.
13. El inventario de dependencias `/admin` queda documentado, con su equivalente de consumidor donde exista.
14. Los 16 endpoints no consumidos quedan listados con su motivo (RN-07).
15. Validación visual con Playwright del rechazo con reintento, mobile y desktop.
16. Verificación sobre contenedores, y smoke contra fe-test con una cancelación real.
