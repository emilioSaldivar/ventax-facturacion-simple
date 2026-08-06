# SPEC Backoffice — Alineación con Facturación Electrónica v0.1

**Versión:** 0.1
**Fecha:** 2026-07-31
**Estado:** BORRADOR — mapeo de funcionalidades, pendiente de PLAN/TASKS

## Alineación

- `docs/facturacion-electronica-consumer-docs/GUIA_INTEGRACION_CONSUMIDORES_v0.2.md` (contenido v0.3, 2026-07-24 — modelo de dos claves, permisos por consumidor, recibos firmados)
- `docs/facturacion-electronica-consumer-docs/README.md` (endpoints incluidos/excluidos del contrato de consumidores)
- `docs/facturacion-electronica-consumer-docs/openapi.yaml` (auth real por endpoint: `ApiConsumerKeyAuth` vs `ApiKeyAuth`)
- `docs/TASKS_BACKOFFICE_ADMIN_v0.1.md` (implementado — ver sección 1)
- `apps/api/src/modules/fiscal-gateway/*` (cliente actual)
- `apps/api/src/modules/backoffice/*` + `apps/backoffice/*` (backoffice actual)

**Principio rector:** no romper lo que hoy funciona. Todo cambio de autenticación/config debe ser retrocompatible (fallback al comportamiento actual si las variables nuevas no están definidas).

---

## 1. Estado actual verificado (2026-07-31)

### 1.1 Backoffice

`TASKS_BACKOFFICE_ADMIN_v0.1` está **implementado** (la matriz del doc dice PENDIENTE pero quedó desactualizada):

- Backend completo: CRUD de tenants, facturadores, establecimientos, puntos, actividades, perfiles, contextos, usuarios + readiness + extras posteriores (`GET /backoffice/planes`, `PUT /backoffice/facturadores/:id/api-key`).
- Frontend completo con una desviación: las entidades hijas se editan inline dentro de `FacturadorDetailView` en vez de vistas de detalle dedicadas.
- Gaps: `updatePunto` importado pero sin uso (puntos no editables desde la UI); sin smoke script ni validación Playwright del backoffice.

### 1.2 Configuración de consumo de la API fiscal

| Pieza | Estado actual |
|---|---|
| Cliente | `fiscal-gateway.client.ts` único (~2000 líneas), modo `mock`/`real` |
| Base URL | `FE_API_BASE_URL` (default `https://fe-api.ventax.app/fcws` — legacy; staging ya migró a `/v1`, prod pendiente) |
| Clave global | `FE_API_KEY` (env, opcional) — **una sola clave para todos los endpoints** |
| Clave por facturador | `facturadores.fe_consumer_api_key` (migración 0016) — se setea vía `PUT /backoffice/facturadores/:id/api-key`; la UI solo muestra badge `has_api_key` |
| Uso de la clave por facturador | Emisión de facturas (outbox worker, `gatewayWithKey`) y todo el módulo recibos (`resolveGateway` por request) |
| Uso de la clave global | Todo lo demás: NCE, eventos, consultas, documentos, conciliación, y fallback cuando el facturador no tiene clave propia |
| Ambiente | `FE_API_ENV` (`test`/`prod`) global — no por facturador |

### 1.3 Desalineamientos detectados contra la doc FE v0.3

1. **Modelo de dos claves no implementado.** FE define: *clave de consumidor* (individual, con permisos y alcance por emisor) para `POST /factura`, `POST /conciliacion/idempotency*` y todo `/recibos/*`; *clave compartida* (global, sin alcance) para `POST /nota-credito`, `POST /evento/*`, `GET /consultar/*`, `GET /documentos/*`, `GET /files/*`. Nuestro cliente usa **una** clave (`config.apiKey`) para ambas clases. Consecuencia: según qué valor tenga `FE_API_KEY`, una mitad de la API falla con 401/403.
2. **El backoffice no registra qué permisos tiene la clave de cada facturador** (`FACTURA_EMIT`, `IDEMPOTENCY_RECONCILE`, `CANCEL_SEND`, `RECIBO_WRITE`, `RECIBO_READ`, `RECIBO_VOID`). El bloqueo actual de staging (recibos 401) es exactamente este caso, y hoy no hay forma de verlo ni diagnosticarlo desde el backoffice.
3. **La UI de API key no dice qué clave es.** El campo debería llamarse explícitamente "Clave de consumidor FE" y explicar su alcance (emisores/ambientes asignados por el admin de FE).
4. **Endpoints `/admin/emisores/*` fuera de contrato.** Nuestro cliente llama 6 endpoints admin (decision, validate-cdc-impact, retry-same-cdc, create-derived, cancel-send, void-number) que el paquete de consumidores **excluye explícitamente**. Funciona hoy, pero no hay contrato publicado que lo respalde — riesgo de rotura silenciosa en cualquier release de FE.
5. **Ambiente por facturador inexistente.** FE asigna consumidores a `test`, `prod` o ambos; nuestro `FE_API_ENV` es global.
6. **Sincronización de recibos no incremental.** FE recomienda `GET /recibos?updated_since=` (sección 16.10) para mantener la caché local; hoy no usamos `updated_since`.
7. **`GET /consultar/ruc/{ruc}` sin explotar.** Permite validar las actividades económicas declaradas/activas del emisor en FE — hoy las actividades del backoffice se cargan a mano sin validación, y un código no declarado produce `422 ACTIVITY_NOT_AVAILABLE` recién al emitir.

### 1.4 Lo que ya está alineado (no tocar)

- Emisión FE/NCE con `client_reference.idempotency_key`, `numbering.authority: SERVICE`, modos `SYNC`/`BATCH`/`AUTO`.
- `actividad_economica_codigo` en facturas, NCE y recibos.
- Contrato canónico por `document_uuid` (consultas, xml, kude, eventos, by-cdc).
- Recibos v0.5 delegados al backend fiscal con clave por facturador.
- Conciliación por idempotencia (`POST /conciliacion/idempotency`).

---

## 2. Mapeo de funcionalidades nuevas

### F1 — Soporte del modelo de dos claves (backend, retrocompatible)

- Nueva env `FE_SHARED_API_KEY` (opcional). El cliente selecciona clave por clase de endpoint: consumidor → `/factura`, `/conciliacion/*`, `/recibos/*`; compartida → `/nota-credito`, `/evento/*`, `/consultar/*`, `/documentos/*`, `/files/*`.
- Fallback: si `FE_SHARED_API_KEY` no está definida, comportamiento actual intacto (todo con `FE_API_KEY` / clave por facturador). Cero riesgo en deploy.
- Documentar en `.env.example` cuál es cuál, con los nombres de la guía FE (`consumer_api_key` / `shared_api_key`).

### F2 — Panel "Integración FE" por facturador (backoffice)

Reemplaza el campo suelto de API key por una sección clara en `FacturadorDetailView`:

- **Clave de consumidor FE**: estado (configurada/no), rotación (ya existe el PUT), etiquetada con el nombre correcto y ayuda contextual ("la entrega el admin de FE una sola vez; alcance limitado a los emisores/ambientes asignados").
- **Permisos declarados**: registro local (checkboxes) de los permisos que el admin de FE otorgó a esa clave (`FACTURA_EMIT`, `IDEMPOTENCY_RECONCILE`, `CANCEL_SEND`, `RECIBO_WRITE`, `RECIBO_READ`, `RECIBO_VOID`). Es metadato operativo nuestro (FE no expone introspección), pero da visibilidad inmediata de qué debería funcionar.
- **Ambiente(s) asignado(s)**: `test` / `prod` / ambos (metadato declarado).
- **Código de consumidor** (`consumer_code`): para tener a mano al escalar soporte con FE (la guía lo pide en la sección 17).

Requiere: columnas nuevas en `facturadores` (o tabla `facturador_fe_integracion`), endpoints PATCH, UI.

### F3 — Verificador de integración FE (diagnóstico activo)

Botón "Verificar integración" por facturador que ejecuta sondas de solo lectura contra FE y muestra un semáforo por capacidad:

- `GET /health` → conectividad.
- `GET /consultar/ruc/{ruc}` (clave compartida) → emisor dado de alta + lista de actividades.
- `GET /recibos?emisor_id=&limit=1` (clave de consumidor) → distingue 200 (OK) / 401 (clave inválida) / 403 (sin permiso `RECIBO_READ`).
- Resultado por capacidad: Facturación, Recibos, Conciliación, Consultas.

Esto habría diagnosticado el bloqueo de staging en segundos. Integrar el resultado al readiness existente del facturador.

### F4 — Validación de actividades económicas contra FE

- En el alta/edición de actividades del backoffice: botón "Validar contra FE" que consulta `GET /consultar/ruc/{ruc}` y marca cada actividad local como declarada-activa / no declarada en FE.
- Opcional: alta asistida (elegir de la lista que devuelve FE en vez de tipear el código).

### F5 — Gestión de usuarios: cierre de gaps

- Arreglar edición de puntos de expedición (hoy `updatePunto` está importado pero sin uso — los puntos no se pueden editar desde la UI).
- Mostrar la config operativa completa del usuario en `UserDetailView` con los nombres de las entidades (hoy ya existe parcialmente).
- Paginación/filtros reales en la lista de usuarios (el backend ya los soporta).
- Ayuda contextual en el form de config operativa explicando la cadena tenant → facturador → establecimiento → punto → actividad + perfil → contexto.

### F6 — Claridad de parámetros en la UI (qué configura quién)

Ayuda contextual (tooltips/leyendas) en cada parámetro del backoffice distinguiendo:

- **Lo asigna SET/DNIT y lo registra el admin de FE**: timbrado, fecha de inicio, establecimiento, punto de expedición, actividades del RUC.
- **Lo configuramos nosotros (espejo operativo)**: los mismos valores cargados en nuestro backoffice deben coincidir exactamente con lo registrado en FE — si difieren, la emisión falla.
- **Interno nuestro**: perfiles de emisión, contextos, alias operativos, usuarios.

### F7 — Decisión sobre endpoints `/admin/*` (riesgo de contrato)

La gestión avanzada de soporte usa 6 endpoints `/admin/emisores/*` excluidos del contrato de consumidores. Acordar con el equipo de FE: (a) incorporarlos al contrato publicado, (b) migrar a equivalentes del contrato canónico donde existan, o (c) documentar el acuerdo especial. Mientras tanto, marcar en el código que están fuera de contrato.

### F8 — Higiene

- Actualizar la matriz de `TASKS_BACKOFFICE_ADMIN_v0.1.md` a su estado real.
- Migrar `FE_API_BASE_URL` default y prod a `/v1` (staging ya está — ver memoria de migración).
- Sync incremental de recibos con `updated_since` (baja prioridad; hoy la lista se refresca completa).

---

## 3. Priorización sugerida

| Orden | Ítem | Motivo |
|---|---|---|
| 1 | F1 (dos claves) | Desbloquea la alineación real con el contrato FE; retrocompatible |
| 2 | F3 (verificador) | Diagnóstico del bloqueo actual de staging; valor operativo inmediato |
| 3 | F2 (panel integración) | Claridad de parámetros pedida; base de datos para F3 |
| 4 | F5 (usuarios) | Gestión clara de usuarios; gaps chicos |
| 5 | F6 (ayuda contextual) | Claridad sin riesgo |
| 6 | F4 (actividades) | Previene 422 en emisión |
| 7 | F7 (admin) | Conversación externa con FE |
| 8 | F8 (higiene) | Acompaña a los anteriores |

---

## 4. Fuera de alcance de esta SPEC

- Gestión de suscripciones, cobros, bloqueos por impago y reportes → registrado como iniciativa separada en `docs/INICIATIVA_SUSCRIPCIONES_COBROS_v0.1.md` (backlog, pendiente de refinamiento).
- Cambios en `web-operacion`.
- Cualquier cambio del lado de `facturacion-electronica` (solo consumimos su contrato).
