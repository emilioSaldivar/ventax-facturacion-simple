# PLAN Reintento De Emision Confirmado v0.1

## Alineacion

- `docs/SPEC_REINTENTO_EMISION_CONFIRMADO_v0.1.md` (RN-01 a RN-09, CA-01 a CA-06)
- `AGENTS.md`

## Principios

- Ningun cambio de esquema: todo se deriva de columnas existentes (`estado`, `document_uuid`, `cdc`, `fiscal_response_snapshot`, `external_ref`, `created_at`) y del outbox existente.
- El frontend no decide la elegibilidad. Lee `puede_reintentar_emision` que calcula el backend.
- El backend nunca reencola sin `NOT_IMPACTED` de FE.

## 1. Backend: elegibilidad derivada (RN-01, RN-06)

Archivo `apps/api/src/modules/facturas/facturas.accion.ts`:

- Nueva funcion pura exportada `puedeReintentarEmision(documento: DeriveAccionInput): boolean`:

  ```ts
  return (
    (documento.estado === "ERROR_TEMPORAL" || documento.estado === "PENDIENTE_SIFEN") &&
    !documento.document_uuid &&
    !documento.cdc &&
    typeof documento.fiscal_status?.code === "string"
  );
  ```

- `DeriveAccionInput` pasa a ser `Pick<...> & { fiscal_status?: Record<string, unknown> | null }`. El campo es **opcional** a proposito: el unico llamador que arma el input a mano, `backoffice.repository.ts:782` (conteo de salud fiscal), no se modifica. Ese archivo tiene cambios del usuario sin commitear (import v0.3) y solo usa `accion`, no `acciones_sugeridas`. Sin `fiscal_status` la funcion devuelve `false`, que es seguro.
- En la rama `ERROR_TEMPORAL` de `deriveAccion()` (menos de 1h), `acciones_sugeridas` pasa a `puedeReintentarEmision(documento) ? ["REINTENTAR"] : []`. El resto de las ramas no cambia.
- La rama `EMITIENDO/PENDIENTE_SIFEN` en curso (`buildEnProcesoDetalle`) actualiza el texto segun RN-08: "... Si ya deberia estar aprobada, podes verificar ahora." solo cuando hay `document_uuid || cdc`. Sin identidad se mantiene "No necesitas hacer nada."

Archivo `apps/api/src/modules/facturas/facturas.service.ts`:

- `withAccion()` agrega `puede_reintentar_emision: puedeReintentarEmision(documento)`.

Archivo `apps/api/src/modules/facturas/facturas.types.ts`:

- `DocumentoResponse` agrega `puede_reintentar_emision?: boolean`. Es opcional como `accion`, porque solo lo completa `withAccion`.

## 2. Backend: retry confirmado (RN-02 a RN-05, RN-09)

### 2.1 Resolucion de gateway con clave de consumidor

`apps/api/src/modules/facturas/facturas.routes.ts`, ruta `POST /facturas/:documentoId/retry-emission`:

- Resuelve el gateway con la misma tecnica que `recibos.routes.ts` (`resolveGateway`): lee `facturadores.fe_consumer_api_key` y, si existe, usa `createFiscalGateway({ ...buildFiscalGatewayConfig(env), apiKey })`; si no, usa `fiscalGateway`.
- Se agrega `getFacturadorApiKey(facturadorId)` a `FacturaRepository` (misma query que `recibos.repository.ts:45-51`).
- Pasa el gateway y `env.FE_API_ENV` a `retryDocumentoEmission`.

### 2.2 `retryDocumentoEmission(context, documentoId, repository, gateway, feEnv)`

Orden:

1. `getDocumentoById` y `withAccion`.
2. Si **no** `puedeReintentarEmision(documento)`:
   - con `document_uuid || cdc`, lanza `409 CONFLICT` "Este documento ya fue recibido por facturacion electronica. Usa 'Verificar estado fiscal'.";
   - en otro caso, lanza `409 CONFLICT` "Solo documentos con error temporal o pendiente SIFEN pueden reintentarse." (mensaje actual).
3. Si `documento.external_ref` es `null`, lanza `409 CONFLICT` con `details.motivo = REQUIERE_SOPORTE`. Sin clave de idempotencia no se puede confirmar.
4. Consulta de idempotencia con `gateway.reconcileByIdempotencyKeys({ emisorId: context.facturador.emisor_id, env: feEnv, from, to, idempotencyKeys: [external_ref] })`.
   - **Ventanas** (FE limita a 7 dias): `v1 = [created_at - 5min, min(now, created_at - 5min + 7d)]`. Si `now - created_at > 7d`, se consulta tambien `v2 = [now - 7d, now]`, porque un reintento manual posterior pudo crear el documento en FE despues de la primera ventana. Se usa el primer `IMPACTED` encontrado. `DUPLICATE_CONFLICT` o `INVALID_KEY` en cualquier ventana cortan la operacion. Solo es `NOT_IMPACTED` si todas las ventanas consultadas lo son.
   - Las fechas van en ISO 8601 con offset (`toISOString()` emite `Z`, que es un offset valido).
   - Un `FiscalGatewayError` de cualquier tipo lanza `503 INTERNAL_ERROR` con `details.motivo = CONFIRMACION_NO_DISPONIBLE` (RN-04) y se loguea con `documentoId` y `gateway_code`, sin clave.
5. Segun el resultado:
   - `NOT_IMPACTED`: `repository.retryPendingEmission(...)`, que no cambia. Si devuelve `null`, por una carrera con el worker en `PROCESSING`, responde `409` "La emision ya se esta procesando. Espera unos segundos y verifica el estado." Si no, devuelve `withAccion(retried)`.
   - `IMPACTED`: `repository.adoptarDocumentoFiscalExistente(...)` (2.3), luego `refreshFiscalStatusForDocumento(...)` con el **gateway de clave compartida** (`fiscalGateway`, que se pasa aparte, porque `/documentos/*` exige la clave compartida). Si el refresh falla, se devuelve el documento adoptado sin error, porque el worker lo verificara a los 5 minutos. Devuelve `withAccion(...)`.
   - `DUPLICATE_CONFLICT` o `INVALID_KEY`: `409 CONFLICT` con `details.motivo = REQUIERE_SOPORTE` "No pudimos confirmar la emision de esta factura. Contacta a soporte." con `details: { result, idempotency_key }`.

La firma final queda `retryDocumentoEmission(context, documentoId, repository, deps: { consumerGateway, sharedGateway, feEnv })`.

### 2.3 Repository: `adoptarDocumentoFiscalExistente`

Hace una transaccion analoga a `completePendingEmission`:

- `update factura_emision_outbox set estado='DONE', locked_at=null, last_error=null where factura_operativa_id=$documentoId and estado in ('PENDING','FAILED_TEMP','FAILED_PERM')`.
- `update facturas_operativas set estado='PENDIENTE_SIFEN', document_uuid=coalesce(document_uuid,$uuid), fiscal_document_id=coalesce(fiscal_document_id,$documentId), cdc=$current_cdc, numero_fiscal=coalesce($nro_factura, numero_fiscal), fiscal_response_snapshot=$snapshot, verificacion_next_at=now() + interval '5 minutes', verificacion_attempts=0, emitted_at=coalesce(emitted_at, now()), updated_at=now() where facturador_id=$1 and id=$2 and deleted_at is null and document_uuid is null and cdc is null returning COLUMNAS_DOCUMENTO`.
- `fiscal_response_snapshot` lleva `{ action: "ADOPTED_FROM_IDEMPOTENCY", idempotency: <item FE>, requested_by }`.
- `insert into audit_events` con `event_type = 'FACTURA_EMISION_ADOPTADA'` (convencion en mayusculas de `FACTURA_EMISION_REINTENTO`), mismo formato que `retryPendingEmission`.
- Devuelve `null` si no actualizo fila. En ese caso el servicio responde `409` "El documento cambio mientras se procesaba. Recarga y verifica el estado."

### 2.4 Mock gateway

`MockFiscalGateway.reconcileByIdempotencyKeys` ya devuelve `NOT_IMPACTED`. No se cambia. Los tests usan gateways fake con respuestas controladas.

## 3. OpenAPI (`spec/openapi.yaml`)

- `DocumentoResponse`: agregar `puede_reintentar_emision: boolean`, con descripcion que referencie RN-01.
- `POST /facturas/{documentoId}/retry-emission`:
  - actualizar la descripcion con la confirmacion por idempotencia y la adopcion cuando es `IMPACTED`;
  - `200` documenta ambos resultados: `EMITIENDO` (encolado) o estado refrescado (adoptado);
  - `409` documenta no candidato, carrera y `REQUIERE_SOPORTE`;
  - agregar `503` (`details.motivo = CONFIRMACION_NO_DISPONIBLE`).

## 4. Frontend (`apps/web-operacion/src/main.tsx`)

- Tipo `DocumentoResponse`: agregar `puede_reintentar_emision?: boolean`.
- **Detalle, banner de accion:**
  - el boton `REINTENTAR` cambia la etiqueta a "Reintentar emision" y se renderiza solo si `acciones_sugeridas.includes("REINTENTAR") && selected.puede_reintentar_emision`;
  - nuevo boton "Verificar estado fiscal" (llama a `refreshSelectedStatus`) cuando `selected.estado in (EMITIENDO, PENDIENTE_SIFEN) && (selected.document_uuid || selected.cdc)`.
- **Detalle, "Opciones avanzadas":**
  - "Volver a verificar" pasa a "Reintentar emision" y se **renderiza** solo con `selected.puede_reintentar_emision`. No queda deshabilitado: directamente no aparece;
  - "Verificar estado fiscal" se habilita con `selected.document_uuid || selected.cdc`.
- **Pantalla posterior a emitir:**
  - "Consultar estado fiscal" pasa a "Verificar estado fiscal" y se habilita con `document_uuid || cdc`;
  - "Reintentar validacion" pasa a "Reintentar emision" y se renderiza solo con `emittedDocumento.puede_reintentar_emision`.
- **Mensajes despues del reintento** (`retrySelectedEmission` y `retryEmittedDocumento`): si `updated.estado === "EMITIENDO"` el mensaje es "Reintento de emision enviado."; si no, "La factura ya habia llegado a facturacion electronica. Actualizamos su estado." Los errores 409 y 503 muestran el `message` del backend, que es el comportamiento actual de `api.post`.

## 5. Pruebas

- Unitarias de `puedeReintentarEmision` y de `deriveAccion` (REINTENTAR solo con candidato).
- Servicio `retryDocumentoEmission` con gateway fake:
  - `NOT_IMPACTED` reencola;
  - `IMPACTED` adopta y refresca;
  - con refresh fallido devuelve el documento adoptado;
  - `DUPLICATE_CONFLICT` da 409;
  - error de gateway da 503 sin llamar a `retryPendingEmission`;
  - no candidato con UUID da 409 con el mensaje de verificar;
  - mas de 7 dias consulta las dos ventanas.
- Integracion con DB (patron de los `*.integration.test.ts` existentes): `adoptarDocumentoFiscalExistente` deja el outbox `DONE`, identidad persistida y `audit_event`.
- Playwright (`scripts/`) contra el stack de `bash scripts/deploy.sh` con FE mock, en mobile 390x844 y desktop 1280x800:
  - documento `PENDIENTE_SIFEN` con UUID: banner con "Verificar estado fiscal" y sin "Reintentar emision";
  - documento `ERROR_TEMPORAL` sin identidad: "Reintentar emision" visible, y tras presionarlo pasa a `EMITIENDO`;
  - grep de que no existen las etiquetas viejas (CA-06).

## 6. Riesgos Y Mitigaciones

| Riesgo | Mitigacion |
|---|---|
| Consumidor FE sin permiso `IDEMPOTENCY_RECONCILE`: el reintento responde siempre 503 | T0 verifica permisos en staging y prod antes del deploy; el mensaje 503 es claro y no reencola a ciegas |
| `fiscal_status.code` ausente en documentos viejos `ERROR_TEMPORAL` | Quedan no candidatos (no se muestra el boton) y siguen en el flujo de soporte de `deriveAccion`; es aceptable y seguro |
| Carrera worker/operador | `retryPendingEmission` ya excluye `PROCESSING`; la adopcion exige `document_uuid is null and cdc is null` |
| Ventana de 7 dias insuficiente | Se consultan dos ventanas (creacion y ultimos 7 dias) |

## Diseno Realmente Adoptado (2026-10-15)

- **Orden en `adoptarDocumentoFiscalExistente`:** primero el `update` de `facturas_operativas` con la guarda `document_uuid is null and cdc is null`. Solo si actualizo una fila se cierra el outbox y se audita. Asi una carrera con el worker no deja el outbox cerrado sobre un documento que no se adopto.
- **Ventanas:** `ventanasIdempotencia()` se exporta para probarla de forma aislada. Una respuesta de FE sin el item pedido se trata como no confirmable (503, `gateway_code = INVALID_RESPONSE`).
- **Frontend:** el tipo `DocumentoResponse` de `web-operacion` no tenia `document_uuid` aunque la API lo devuelve. Se agrego como opcional para habilitar "Verificar estado fiscal" por UUID.
- **Tests de ruta:** `facturas.routes.test.ts` solo prueba schemas y no hay infraestructura HTTP con fakes. La ruta se valido por HTTP sobre los contenedores (REC-006 y REC-012).
- **Fakes:** `apps/api/tsconfig.json` incluye solo `src`, asi que los fakes de los tests no se verifican contra la interfaz. Solo el fake de `facturas.service.test.ts` necesita los metodos nuevos. Los fakes de `entrega`, `verificacion.worker`, `notificaciones` y `auth.roles` no los usan y no se tocaron.
