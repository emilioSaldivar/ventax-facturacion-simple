# SPEC Recibo de Dinero v0.5

## Alineacion

- `AGENTS.md`
- `docs/API_FACTURACION_ELECTRONICA/facturacion-electronica-consumer-docs/GUIA_INTEGRACION_CONSUMIDORES_v0.2.md` (seccion 16, "Recibos de Dinero Firmados Digitalmente")
- `docs/API_FACTURACION_ELECTRONICA/facturacion-electronica-consumer-docs/openapi.consumidor-v0.3.yaml` (schemas `ReciboDineroInput`, `ReciboDineroPatch`, `ReciboDineroResult`, `ReciboAnularInput`, `ReciboVerificacionResult`)
- `docs/PLAN_RECIBO_DINERO_v0.5.md`
- `docs/TASKS_RECIBO_DINERO_v0.5.md`
- `apps/api/src/modules/fiscal-gateway/*` (patron de integracion existente con el backend fiscal, usado hoy por `facturas`)
- Historial: `SPEC_RECIBO_DINERO_v0.1.md`..`v0.4.md` (modulo local, sin firma, que esta version reemplaza en su gestion/creacion)

---

## 1. Por que cambia el modulo

El modulo `recibos_dinero` (v0.1-v0.4) es hoy **100% local**: nuestro backend genera su propio numero correlativo, su propio PDF (`recibos.pdf.ts`) y no firma nada. El pie del PDF dice explicitamente "Documento no fiscal" — es un comprobante sin ningun valor legal propio, solo un recordatorio de cobro.

El 2026-07-24 se publico una nueva version de la guia de integracion del backend fiscal (`facturacion-electronica`) que agrega la seccion 16, **"Recibos de Dinero Firmados Digitalmente"**: un modulo ya construido en ese backend que emite recibos con **firma electronica cualificada bajo la Ley N.º 6822/2021**, firmados en XML (XMLDSig) y PDF (PAdES) con el mismo certificado `.p12` que el emisor ya tiene cargado para sus DE. Esto **no es un DE de SIFEN** (no tiene CDC, no se transmite a DNIT), pero **si tiene validez legal propia** — algo que nuestro recibo local nunca tuvo ni podia tener.

Mantener nuestra implementacion local, ahora que existe la version firmada legalmente valida, contradice la regla de dominio de `AGENTS.md`: *"no copiar logica fiscal SIFEN al frontend ni al backend SaaS si debe vivir en `facturacion-electronica`"* — y por extension, no debe reimplementarse localmente ninguna logica de firma/validez legal que el backend fiscal ya resuelve. `facturacion-electronica` es responsable de certificados, firma y numeracion; nuestro SaaS valida tenant/facturador/permisos y delega, exactamente como ya hace con `facturas`.

**Esta version cambia unicamente la gestion/creacion (backend).** La interfaz de usuario (`apps/web-operacion`) queda **fuera de alcance** de esta iteracion — ver seccion 9.

---

## 2. Bloqueante externo verificado (2026-07-24)

Antes de escribir esta SPEC se verifico en la VPS de produccion si el endpoint ya esta desplegado:

```
fe-test  (puerto 9988, base /v1):   GET /v1/health   -> 200
                                     GET /v1/recibos  -> 404 "Cannot GET /v1/recibos"
fe-prod  (puerto 9989, base /fcws): GET /fcws/recibos -> 404 "Cannot GET /fcws/recibos"
                                     GET /v1/recibos   -> 404 (tampoco existe con /v1 en prod)
```

Un `404 Cannot GET` (no `401`/`403`) confirma que la ruta **no existe** en los contenedores `fe-test-api-1` / `fe-prod-api-1` actualmente corriendo — es una capacidad documentada pero **aun no desplegada** en los entornos que este SaaS consume.

**Consecuencia para esta SPEC:** el desarrollo puede completarse y validarse contra `MockFiscalGateway` (igual que el resto del modulo `fiscal-gateway`), pero **no puede validarse end-to-end ni desplegarse a staging/produccion** hasta que:

1. El equipo de `facturacion-electronica` despliegue `/v1/recibos/*` en `fe-test` (y luego en el entorno que sirva a `fe-prod`).
2. La `fe_consumer_api_key` de cada facturador tenga los permisos `RECIBO_WRITE`, `RECIBO_READ` y `RECIBO_VOID` habilitados (administrado por el proveedor del servicio fiscal, fuera de este repositorio — ver `README.md` del paquete vendorizado).

Esto se registra como tarea bloqueada explicita en `TASKS_RECIBO_DINERO_v0.5.md` (no se asume disponibilidad).

---

## 3. Nuevo ciclo de vida

```
BORRADOR (remoto, mutable — creado YA en facturacion-electronica via POST /recibos)
   │  PATCH /v1/recibos/{id}   → sigue BORRADOR
   │  DELETE /v1/recibos/{id} → eliminado (soft delete remoto)
   │
   │  POST /v1/recibos/{id}/emitir
   ▼
EMITIDO (inmutable — numerado y firmado en XML+PDF por facturacion-electronica)
   │
   │  POST /v1/recibos/{id}/anular
   ▼
ANULADO (metadato sobre el EMITIDO original; el XML/PDF firmado original no cambia.
          Se genera un recibo de anulacion nuevo, tambien firmado, que referencia al original)
```

Diferencia clave con el modelo v0.1-v0.4: **`ANULADO` no existia** (hoy un recibo emitido no se puede anular, solo queda emitido para siempre). Esta version lo incorpora, delegado 100% al backend fiscal.

### 3.1 Diferencia de patron respecto a `facturas`

`facturas` mantiene el borrador 100% local (preview) y **solo llama al gateway fiscal al emitir**. `recibos` es distinto: segun el contrato de `facturacion-electronica`, **el `BORRADOR` ya es un recurso remoto** desde el primer `POST /recibos` — no existe un "preview" puramente local. Esto implica que en `recibos`, a diferencia de `facturas`, **toda operacion de escritura (crear, editar, eliminar, emitir, anular) llama al fiscal-gateway**, y la tabla local `recibos_dinero` pasa a ser una **cache/espejo local** de lo que ya existe en `facturacion-electronica` (fuente de verdad), no la fuente de verdad en si misma. Esto es consistente con la seccion 16.10 de la guia ("Si tu sistema mantiene su propia copia/cache de recibos... sincronizala con `GET /recibos?updated_since=...`").

Consecuencia de diseno: `recibos_dinero.id` en nuestra base **pasa a ser el mismo `id` que devuelve `facturacion-electronica`** (no se genera un id local independiente) — evita mantener un mapeo doble innecesario y simplifica sincronizacion futura.

---

## 4. Cuerpo (payload) de creacion — nuevo contrato

`POST /recibos` (nuestro endpoint SaaS, sin cambios de URL para el consumidor: sigue siendo `POST /api/v1/recibos`) pasa a construir y delegar este payload al backend fiscal:

```json
{
  "emisor_id": "<RUC del facturador, resuelto por el backend, no por el cliente>",
  "fecha_cobro": "YYYY-MM-DD",
  "pagador_nombre": "string, requerido",
  "pagador_documento_tipo": "RUC | CI | PASAPORTE | CEDULA_EXTRANJERA | NO_ESPECIFICADO | null",
  "pagador_documento": "string | null",
  "concepto": "string, requerido",
  "importe": "number > 0, requerido",
  "moneda": "PYG (fijo en esta version, el campo existe en el contrato fiscal pero no se expone eleccion de moneda al operador)",
  "forma_pago": "EFECTIVO | TRANSFERENCIA | CHEQUE | TARJETA_CREDITO | TARJETA_DEBITO | OTRO",
  "referencia_bancaria": "string | null",
  "referencia_documento_uuid": "uuid | null — document_uuid de una factura propia (reemplaza a factura_id)",
  "referencia_documento_numero_display": "string | null — reemplaza a factura_numero_display",
  "actividad_economica_codigo": "string | null — resuelto automaticamente, ver nota abajo",
  "client_reference": { "idempotency_key": "generado internamente, no lo decide el cliente HTTP de nuestra API publica" }
}
```

**Campos nuevos respecto a v0.4:** `moneda`, `referencia_documento_uuid`, `referencia_documento_numero_display` (generalizan `factura_id`/`factura_numero_display`, que hoy solo podian referenciar una factura *local*; ahora referencian el `document_uuid` canonico, igual que hace `facturas` con documentos propios).

**`emisor_id`, `idempotency_key` y `actividad_economica_codigo` no son responsabilidad del consumidor final** de nuestra API (el operador de `web-operacion`, o cualquier consumidor de nuestra API SaaS): el backend SaaS los resuelve/genera igual que ya hace para `facturas` — `emisor_id` sale del `facturador` del contexto operativo autenticado; `idempotency_key` se deriva de un header `Idempotency-Key` opcional + `facturador.id` con el mismo esquema `sha256(...).slice(0,32)` que usa `facturas.service.ts` (`buildExternalRef`); `actividad_economica_codigo` sale de `context.fiscal_context.actividad_economica_codigo` — el mismo valor que `facturas` ya usa para su propio `fiscal_context` (ver `RD5-025` en TASKS: bugfix post-deploy — `facturacion-electronica` usa este codigo para decidir que logo/rubro imprimir en el PDF firmado; si el facturador opera bajo una actividad no-principal y este campo no viaja, el PDF muestra el logo de la actividad principal por error).

### 4.1 Vincular un recibo a una factura propia (cobro de credito) — RD-010 actualizado

El flujo existente `POST /facturas/:documentoId/recibo` (RD-010) debe actualizarse para pasar `referencia_documento_uuid = document_uuid` de la factura (en vez del `factura_id` interno que usa hoy) y `referencia_documento_numero_display = numero_fiscal`. El backend fiscal valida que esa factura pertenezca al mismo emisor; si no, responde `422 INVALID_DOCUMENT_REFERENCE`.

---

## 5. Registro completo — nuevo modelo de datos

`ReciboRecord` (cache local, tabla `recibos_dinero`) incorpora las columnas fiscales, con el mismo criterio que `facturas_operativas`:

| Campo | Notas |
|---|---|
| `id` | uuid — **el mismo id devuelto por `facturacion-electronica`**, no generado localmente |
| `facturador_id` | FK, scoping de tenant/permiso (sin cambios) |
| `numero` | ya no lo asigna una secuencia local — viene de la respuesta de `POST /recibos/{id}/emitir` (`numero` como string numerico segun el contrato fiscal) |
| `estado` | `BORRADOR \| EMITIDO \| ANULADO` (se agrega `ANULADO`) |
| `moneda` | nuevo, default `PYG` |
| `referencia_documento_uuid`, `referencia_documento_numero_display` | reemplazan `factura_id`/`factura_numero_display` |
| `external_ref`, `idempotency_key` | nuevo — mismo patron que `facturas_operativas` para deduplicacion de creacion |
| `fiscal_request_snapshot`, `fiscal_response_snapshot` | nuevo, jsonb — payload enviado y respuesta cruda del backend fiscal en cada operacion relevante (create/emitir/anular), igual que `facturas_operativas` |
| `xml_hash`, `pdf_hash` | nuevo — hashes del XML/PDF firmados, devueltos al emitir |
| `anulacion_motivo` | nuevo — motivo capturado en `POST /recibos/{id}/anular` |
| `verification_token` | ya no se genera localmente — lo asigna `facturacion-electronica` al emitir (`null` mientras es BORRADOR) |
| (eliminado) `recibos_dinero_numeracion` | la tabla de secuencia local deja de usarse — la numeracion la asigna el backend fiscal |

Campos que **no cambian**: `fecha_cobro`, `pagador_nombre`, `pagador_documento_tipo`, `pagador_documento`, `concepto`, `importe`, `forma_pago`, `referencia_bancaria`, `emitido_at`, `created_at`, `updated_at`, `deleted_at`.

---

## 6. Endpoints — comportamiento nuevo (misma superficie HTTP hacia nuestros consumidores)

Los endpoints propios (`/api/v1/recibos*`) **no cambian de URL ni de forma de autenticacion para quien los consume** (siguen usando `requireAuth` de nuestro SaaS, JWT de usuario — el `X-Api-Key` del backend fiscal es interno, servidor-a-servidor, igual que en `facturas`). Cambia su implementacion interna:

| Endpoint propio | Detras delega a (`facturacion-electronica`) |
|---|---|
| `POST /recibos` | `POST /v1/recibos` — crea BORRADOR remoto + cache local |
| `GET /recibos` | **cache local** (no llama al gateway en cada listado — ver seccion 3.1) |
| `GET /recibos/:id` | **cache local** (refrescada por la ultima operacion de escritura conocida) |
| `PATCH /recibos/:id` | `PATCH /v1/recibos/{id}` (solo si `estado=BORRADOR`; si no, `409 RECIBO_NOT_EDITABLE`) |
| `DELETE /recibos/:id` | `DELETE /v1/recibos/{id}` (solo BORRADOR; si no, `409 RECIBO_NOT_DELETABLE`) |
| `POST /recibos/:id/emitir` | `POST /v1/recibos/{id}/emitir` — firma XML+PDF, asigna numero y `verification_token` |
| `GET /recibos/:id/pdf` | **proxy** a `GET /v1/recibos/{id}/pdf` (BORRADOR: preview sin firmar generado por el backend fiscal bajo demanda; EMITIDO/ANULADO: bytes firmados persistidos) — **se elimina `recibos.pdf.ts`**, ya no generamos PDF localmente en ningun estado |
| `GET /recibos/:id/xml` | **nuevo endpoint propio** — proxy a `GET /v1/recibos/{id}/xml` (solo disponible si `EMITIDO`/`ANULADO`) |
| `POST /recibos/:id/anular` | **nuevo endpoint propio** — proxy a `POST /v1/recibos/{id}/anular`, requiere `motivo` (string, max 500) |
| `GET /verificar/recibo/:token` | ver seccion 7 (hibrido, no simple proxy) |
| `GET /verificar/recibo/:token/pdf` | proxy a `GET /v1/verificar/recibo/{token}/pdf` (publico, sin auth) |

---

## 7. Verificacion publica — decision de diseno explicita

El endpoint publico del backend fiscal es **deliberadamente limitado**:

```json
{ "valido": true, "estado": "EMITIDO", "fecha_emision": "2026-07-24", "firmado_en": "2026-07-24T15:03:11.000Z" }
```

Nunca expone `importe`, `pagador` ni `concepto`. Nuestra pagina publica actual (`ReciboPublicaView` en `apps/web-operacion`) **si** muestra esos datos comerciales hoy — son datos que **nuestro propio dominio ya posee** (no son secretos fiscales; son los mismos que el operador ya comparte por WhatsApp/PDF). Cambiar nuestro endoint a un simple proxy rompería esa experiencia sin necesidad.

**Decision:** `GET /api/v1/verificar/recibo/:token` (nuestro endpoint propio) combina:
1. Llama a `GET /v1/verificar/recibo/{token}` del backend fiscal para obtener el **estado/validez legal real** (fuente de verdad).
2. Enriquece la respuesta con los datos comerciales que **ya tenemos en nuestra cache local** (`pagador_nombre`, `concepto`, `importe`, `forma_pago`, `fecha_cobro`) — igual que hoy, pero el campo `estado`/`valido` pasa a reflejar la fuente fiscal, no nuestra propia tabla.
3. Si el backend fiscal responde `404` (token inexistente) o `valido:false`, nuestro endpoint responde igual (`404`/`valido:false`) sin exponer datos comerciales.

Esto preserva el contrato actual de nuestro endpoint propio (por lo que el frontend publico **no se rompe**, aunque su actualizacion visual quede fuera de alcance) y usa la fuente de verdad legal para el estado.

---

## 8. Errores — mapeo nuevo

| HTTP (backend fiscal) | Codigo | Mapeo a `HttpError` propio |
|---|---|---|
| `404` | `RECIBO_NOT_FOUND` | `404 NOT_FOUND` |
| `409` | `RECIBO_NOT_EDITABLE` | `409 CONFLICT`, "No se puede modificar un recibo ya emitido." |
| `409` | `RECIBO_NOT_DELETABLE` | `409 CONFLICT`, "No se puede eliminar un recibo ya emitido." |
| `409` | `RECIBO_NOT_EMITTABLE` | `409 CONFLICT`, "El recibo no esta en borrador o hubo una emision concurrente." |
| `409` | `RECIBO_NOT_ANULABLE` | `409 CONFLICT`, "Solo se puede anular un recibo emitido." |
| `409` | `RECIBO_ALREADY_ANULADO` | `409 CONFLICT`, "El recibo ya fue anulado." |
| `422` | `CERTIFICATE_NOT_FOUND` / `CERTIFICATE_EXPIRED` | `422 VALIDATION_ERROR`, mensaje operativo ("El facturador no tiene certificado digital valido cargado; contactar soporte.") |
| `422` | `INVALID_DOCUMENT_REFERENCE` | `422 VALIDATION_ERROR`, "La factura referenciada no existe o no pertenece a este facturador." |
| `500` | `XML_SIGNATURE_FAILED` / `PDF_SIGNATURE_FAILED` | `502 INTERNAL_ERROR` — el recibo permanece en `BORRADOR` en origen, se puede reintentar `emitir` |
| timeout/red | — | `504 INTERNAL_ERROR` (igual que `facturas`, codigo gateway `TIMEOUT`) |
| otro/desconocido | — | `502 INTERNAL_ERROR`, codigo gateway `UPSTREAM_ERROR`/`UNAVAILABLE` |

Mismo criterio que `facturas.service.ts`: errores de `FiscalGatewayError` con `code !== "TIMEOUT"` en operaciones que no tienen un estado intermedio razonable (crear, editar, eliminar, anular) se propagan como error al consumidor (no hay equivalente a `PENDIENTE_SIFEN` para un recibo — no existe un estado "recibo pendiente de firma"; si la emision falla, el recibo **quedo en `BORRADOR`** segun el contrato fiscal, asi que el error se informa y el usuario puede reintentar `emitir`).

---

## 9. Fuera de alcance v0.5

- **Interfaz de usuario** (`apps/web-operacion`): el formulario y el listado de `RecibosView` **no se tocan** en esta iteracion. **Actualizacion (post-deploy, mismo dia):** al desplegar se detecto que el frontend seguia leyendo el campo viejo `factura_numero_display` (renombrado a `referencia_documento_numero_display`), y el usuario pidio explicitamente poder descargar el documento electronico firmado (XML) igual que en facturas — ambos se corrigieron/agregaron (RD5-020, RD5-021 en TASKS): fix del campo renombrado + badge `ANULADO` en la pagina publica + boton "Descargar documento electronico" en el detalle autenticado. El resto de la UI (selector de `moneda`, boton "Anular", rediseno completo de detalle/listado) sigue **fuera de alcance**, para `v0.6`.
- **Diseno visual del PDF**: desde que se elimino `recibos.pdf.ts` (RD5-011), el PDF lo genera integramente `facturacion-electronica` — no es modificable desde este repo. Los hallazgos de diseno (falta de logo del emisor, colores de marca, bloque de importe destacado, y un bug funcional de URL de verificacion mal armada en el pie del PDF) se documentaron para el equipo de esa app en `docs/REFINAMIENTO_PDF_RECIBO_FACTURACION_ELECTRONICA_v0.1.md`.
- Sincronizacion periodica en background via `GET /recibos?updated_since=...` (util solo si hubiera otro consumidor externo tocando los mismos recibos; con un unico consumidor, el cache local se mantiene actualizado por las propias operaciones de escritura de esta SPEC). Se deja como mejora futura si aparece necesidad real.
- Multi-moneda real (el campo `moneda` se persiste y se envia siempre `PYG`; no se agrega selector de moneda).
- Migracion de datos historicos: los recibos ya emitidos bajo v0.1-v0.4 (locales, no firmados) **no se migran retroactivamente** al backend fiscal — quedan como estan, marcados por ausencia de `xml_hash`/`pdf_hash`/`external_ref`. Su PDF historico sigue sirviendose desde la logica anterior si aun se descarga (a decidir en PLAN si se conserva un fallback de solo lectura para recibos pre-v0.5).
- Despliegue a staging/produccion: bloqueado hasta que `facturacion-electronica` publique `/v1/recibos/*` en los entornos reales (ver seccion 2). El codigo se valida contra `MockFiscalGateway`.
