# PLAN Persistencia Tipo Servicio Factura v0.1

## Alineacion

- `docs/SPEC_PERSISTENCIA_TIPO_SERVICIO_FACTURA_v0.1.md`
- `AGENTS.md`
- `spec/openapi.yaml`

## Estrategia Tecnica

Cambio aditivo en tres capas, replicando exactamente el patron ya usado por `credito_plazo_dias`: columna en `actividad_punto_perfiles`, exposicion en `fiscal_context` via el contexto operativo, y consumo/reset en el frontend. Se agrega ademas un paso nuevo (sin precedente en `credito_plazo_dias`, que es de configuracion administrativa): escritura automatica de la columna tras cada emision exitosa de factura, para reflejar la ultima seleccion real del operador.

## Modelo De Datos

Migracion `db/migrations/0030_tipo_transaccion_default.sql`:

```sql
alter table actividad_punto_perfiles
  add column tipo_transaccion_default smallint not null default 2;

alter table actividad_punto_perfiles
  add constraint actividad_punto_perfiles_tipo_transaccion_default_check
  check (tipo_transaccion_default in (1, 2, 3));
```

Mismo patron que `credito_plazo_dias` (`db/migrations/0009_fiscal_context_effective_config.sql`): default seguro (`2`, igual al hardcode actual) evita backfill manual y preserva el comportamiento existente para todo `actividad_punto_perfil` ya cargado.

## Cambios De Contexto Operativo (Lectura)

- `apps/api/src/modules/context/context.types.ts:28` (bloque `fiscal_context`): agregar `tipo_transaccion_default: 1 | 2 | 3;` junto a `credito_plazo_dias`.
- `apps/api/src/modules/context/context.repository.ts`:
  - `ContextRow` (linea ~27): agregar `tipo_transaccion_default: number;`;
  - query principal (linea ~70): agregar `app.tipo_transaccion_default` al `select` junto a `app.credito_plazo_dias`;
  - mapeo de respuesta (linea ~163): agregar `tipo_transaccion_default: row.tipo_transaccion_default as 1 | 2 | 3,` dentro de `fiscal_context`.
- `spec/openapi.yaml`: agregar `tipo_transaccion_default` al schema de `fiscal_context` de la respuesta de contexto operativo.

## Escritura: Actualizar Ultima Seleccion Al Encolar

**Decision de arquitectura**: la emision de factura en este repo es asincrona via outbox. `enqueueFacturaEmission()` (`facturas.service.ts:988`) valida y encola (`repository.createQueuedEmission`); un worker separado (`processNextQueuedFiscalEmission()`, `facturas.service.ts:1023`) procesa la cola y confirma con `repository.completePendingEmission()`. Se actualiza `tipo_transaccion_default` en `enqueueFacturaEmission()`, no en `completePendingEmission()`: en el momento del encolado ya se cuenta con `context` completo (incluye el `actividad_punto_perfil` resuelto) y no hace falta propagar ningun id nuevo a traves del outbox/worker asincrono. El valor no se revierte si la emision fiscal falla despues.

- `apps/api/src/modules/context/context.repository.ts`: agregar metodo `updateTipoTransaccionDefault(actividadPuntoPerfilId: string, valor: 1 | 2 | 3): Promise<void>` — `update actividad_punto_perfiles set tipo_transaccion_default = $2, updated_at = now() where id = $1 and tipo_transaccion_default is distinct from $2`.
- `apps/api/src/modules/facturas/facturas.service.ts`, dentro de `enqueueFacturaEmission()` (linea ~988), inmediatamente despues de `repository.createQueuedEmission(...)` (linea ~1010) y antes del `return withAccion(created)`: invocar `await contextRepository.updateTipoTransaccionDefault(actividadPuntoPerfilId, resolvedInput.tipo_transaccion ?? 2)`. Envolver en `try/catch` que solo loguea (mejor esfuerzo), sin relanzar ni afectar la respuesta ya construida.
- **Nota de diseno a resolver en TASKS**: `fiscal_context` hoy no incluye el `id` de `actividad_punto_perfiles` (solo campos derivados como `establecimiento`, `punto_expedicion`). Agregar `actividad_punto_perfil_id` como campo interno de `OperationalContextResponse` (no documentado en `spec/openapi.yaml`, solo uso interno del backend), poblado en `context.repository.ts` (`app.id as actividad_punto_perfil_id` en el `select` de `getOperationalContext()`) — evita una query adicional por factura.
- `enqueueFacturaEmission()` y `processNextQueuedFiscalEmission()` requieren acceso a `ContextRepository`/`updateTipoTransaccionDefault`: revisar en TASKS como se inyecta esa dependencia sin acoplar `facturas.service.ts` directamente a la implementacion Postgres del modulo `context` (seguir el patron de inyeccion ya usado para `FacturaRepository`/`ClienteRepository` en la firma de `enqueueFacturaEmission`).

## Cambios En Frontend

`apps/web-operacion/src/main.tsx`:

- linea ~3704: reemplazar `useState<TipoTransaccionServicio>(2)` por `useState<TipoTransaccionServicio>(context?.fiscal_context.tipo_transaccion_default ?? 2)`, mismo patron que `creditoPlazoDias` (linea 3705).
- linea ~4420 (`createNuevaFactura()`): reemplazar `setTipoTransaccion(2)` por `setTipoTransaccion(context?.fiscal_context.tipo_transaccion_default ?? 2)`, mismo patron que `setCreditoPlazoDias(context?.fiscal_context.credito_plazo_dias ?? 30)` (linea 4421).
- tipo `fiscal_context` en frontend (linea ~128, ~204): agregar `tipo_transaccion_default: number;`.
- Sin cambios en el selector UI (`main.tsx:4540-4547`): mismas 3 opciones, solo cambia el valor inicial.

## Orden De Implementacion

1. Migracion `0030_tipo_transaccion_default.sql` + validar contra Postgres local.
2. Lectura: `context.types.ts`, `context.repository.ts` (query + mapeo), `spec/openapi.yaml`.
3. Resolver nota de diseno: exponer `actividad_punto_perfil_id` interno en `OperationalContextResponse` (o alternativa elegida en TASKS).
4. Escritura: `updateTipoTransaccionDefault()` en `context.repository.ts` + integracion en `facturas.service.ts` tras emision exitosa.
5. Frontend: `main.tsx` (estado inicial, reset post-creacion, tipo de `fiscal_context`).
6. Tests unitarios/integracion.
7. Validacion Playwright del flujo (mobile-first + un viewport desktop).

## Validaciones

- Backend: `npm run test --workspace @facturacion-simple/api`, `npm run typecheck --workspace @facturacion-simple/api`, `npm run lint --workspace @facturacion-simple/api`.
- Frontend: `npm run typecheck --workspace @facturacion-simple/web-operacion`, `npm run build --workspace @facturacion-simple/web-operacion`.
- Migracion validada contra Postgres real (no solo mocks), siguiendo la leccion ya registrada de la migracion 0028.
- Playwright: emitir factura con `1 - Venta de mercaderia`, recargar la pantalla (simulando nueva sesion) y confirmar que el selector parte en `1`; emitir con `3 - Mixto` y confirmar que el siguiente default es `3`.
- Deploy: `bash scripts/deploy.sh` antes de smoke test end-to-end si se requiere verificar contra el stack containerizado.

## Riesgos

- **Preferencia compartida entre operadores**: si dos operadores del mismo punto de expedicion facturan simultaneamente tipos distintos, el ultimo en emitir "gana" el default para el otro. Aceptado como comportamiento esperado (ver SPEC, Reglas De Negocio) porque es una preferencia del punto operativo, no del usuario; si en el futuro se necesita granularidad por usuario, es una iteracion nueva.
- **Escritura fallida silenciosa**: si `updateTipoTransaccionDefault()` falla y solo se loguea, un operador podria no notar por que el default no cambio. Mitigacion: log con nivel suficiente para deteccion en monitoreo, sin exponer el error al usuario (no es un fallo de la factura en si).
- **Concurrencia**: el `update ... where tipo_transaccion_default is distinct from $2` evita escrituras innecesarias pero no resuelve una carrera real entre dos emisiones simultaneas; se acepta "ultima escritura gana" (last-write-wins) como suficiente para una preferencia de UI, sin necesidad de locking.

## Estrategia De Testing

- Unit: `context.repository.ts` (`updateTipoTransaccionDefault` actualiza solo si el valor difiere), `facturas.service.ts` (`buildFiscalEmitRequest` sigue usando `input.tipo_transaccion ?? 2` sin cambios; `enqueueFacturaEmission` invoca `updateTipoTransaccionDefault` tras un encolado exitoso, y un fallo del `update` no rompe la respuesta de la factura encolada — mock del repositorio de contexto lanzando error para verificarlo).
- Integracion: `GET` contexto operativo devuelve `tipo_transaccion_default` actualizado tras encolar una factura previa con valor distinto (mock o DB real de test); confirmar que un fallo asincrono posterior del worker fiscal no revierte el valor.
- E2E/Playwright: flujo completo de emision con `tipo_transaccion=1`, recarga de pantalla, confirmar default `1` preseleccionado.
