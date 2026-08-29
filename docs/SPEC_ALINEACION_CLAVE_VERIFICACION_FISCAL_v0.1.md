# SPEC Alineacion De Clave En Verificacion Fiscal v0.1

## Alineacion

- `AGENTS.md`
- `docs/METODOLOGIA_SDD.md`
- `docs/SPEC_BACKOFFICE_ALINEACION_FE_v0.2.md` (F0: "FE usa dos claves, el cliente usa una")
- `docs/SPEC_VERIFICACION_FISCAL_AUTOMATICA_v0.1.md`
- `docs/PLAN_VERIFICACION_FISCAL_AUTOMATICA_v0.1.md`
- `docs/TASKS_VERIFICACION_FISCAL_AUTOMATICA_v0.1.md`

## Objetivo

Que el worker de verificacion fiscal automatica (F9) use la clave que el backend
fiscal exige para las rutas de consulta de estado, de modo que los documentos en
`PENDIENTE_SIFEN` vuelvan a resolverse solos, sin intervencion del operador.

## Problema

Incidente activo en produccion, verificado contra la VPS el 2026-08-28.

`facturacion-electronica` autentica con **dos sistemas de clave disjuntos**:

| Sistema | Middleware | Compara contra | Rutas |
| --- | --- | --- | --- |
| Clave compartida | `requireApiKey` | `env.API_KEY` del backend fiscal | `/documentos/*`, `/consultar/*`, `/files/*`, `/evento/*`, `/nota-credito` |
| Clave de consumidor | `requireApiConsumer` + `requireApiConsumerPermission` | tabla `api_consumers` (hash) + `api_consumer_permissions` | `/factura`, `/conciliacion/*`, `/recibos/*` |

Ninguno de los dos acepta la clave del otro: `requireApiKey` hace
`provided !== env.API_KEY` y `requireApiConsumer` resuelve estrictamente contra
`api_consumers`. No hay fallback en ninguna direccion.

`apps/api/src/modules/facturas/verificacion.worker.ts:41` hace:

```ts
const gateway = item.facturadorApiKey ? options.gatewayWithKey(item.facturadorApiKey) : options.gateway;
```

es decir, usa la **clave de consumidor** del facturador
(`facturadores.fe_consumer_api_key`) para llamar a
`GET /v1/documentos/:uuid/sifen`, que exige la **clave compartida**. El backend
responde `401 {"error":"UNAUTHORIZED","message":"API key invalida"}` en ~1 ms,
antes de tocar SIFEN.

Tener el permiso `SIFEN_STATUS_READ` en `api_consumer_permissions` no habilita
esa ruta: el permiso pertenece al otro sistema de autenticacion.

### Evidencia de la verificacion (2026-08-28, VPS Hetzner)

1. Codigo que realmente corre (no el checkout): el `dist` de `fe-prod-api-1` y de
   `fe-test-api-1` tiene `router.get('/documentos/:uuid/sifen', requireApiKey, ...)`
   y el middleware compilado compara contra `env.API_KEY`. El repo fiscal en la
   VPS esta en `ea261b7` (rama `main`), sin commits pendientes en su `origin`: no
   hay un fix aguas arriba esperando deploy.
2. Prueba funcional en vivo contra `fe-prod`, sobre un documento real de
   produccion varado en `PENDIENTE_SIFEN` (`9e4dd3a1-f812-4e06-8eab-d08b5781ddda`),
   con `refresh=false` para no disparar consulta a SIFEN:

   | Clave enviada | HTTP |
   | --- | --- |
   | Compartida (`API_KEY` del backend fiscal) | **200** |
   | De consumidor (`fe_consumer_api_key` del facturador) | **401** |
   | Sin clave | 401 |

3. Comparacion de claves en la VPS (sin exponer valores): `FE_API_KEY` del SaaS
   **coincide** con `API_KEY` del backend fiscal en staging y en produccion; las
   4 `fe_consumer_api_key` por facturador son **distintas** de esa compartida, en
   ambos ambientes.
4. Impacto medido en produccion: 103 fallos en 7 dias sobre 43 documentos
   distintos y 3 facturadores, desde `2026-08-26T05:55Z` (limite de retencion de
   los logs del contenedor) y continuando al momento de la verificacion. En
   paralelo, `POST /v1/factura` respondia 200 (25 emisiones en 24 h): **emitir
   funciona, confirmar el estado no**, lo que hace que el defecto pase
   desapercibido.
5. Estado de la cola en produccion: 44 documentos `PENDIENTE_SIFEN` en cola de
   verificacion (creados entre 2026-08-01 y 2026-08-29), todos con
   `document_uuid`; hasta 18 intentos acumulados en un mismo documento.

### Confirmacion del contrato (2026-08-28)

El reparto de claves fue confirmado explicitamente por el proveedor de
`facturacion-electronica`, en linea con lo verificado empiricamente:

> Para emitir, usas tu clave de facturador. Para consultar facturas y estados,
> usas la clave global que te entregamos aparte. Son dos claves distintas.

Es decir, el modelo de dos claves no es un detalle de implementacion observado
desde afuera: es el contrato declarado. El fix de esta iniciativa alinea el worker
con ese contrato.

### Por que staging no lo muestra

El `dist` de `fe-test` tiene exactamente el mismo guard, y sus claves por
facturador tambien difieren de la compartida. Staging no acusa el error solo
porque su cola tiene 1 documento y ninguno vencido. **El defecto esta latente en
staging, no resuelto.**

### Inventario de puntos de llamada (auditoria completa)

Se audito cada lugar del SaaS que construye un gateway con clave propia:

| Punto de llamada | Ruta FE | Clave que exige FE | Clave que envia | Estado |
| --- | --- | --- | --- | --- |
| `facturas.service.ts:1082` (outbox de emision) | `POST /factura` | consumidor | consumidor | Correcto |
| `recibos.routes.ts` (per-request) | `/recibos/*` | consumidor | consumidor | Correcto |
| `verificacion.worker.ts:41` | `GET /documentos/:uuid/sifen` | compartida | **consumidor** | **DEFECTO** |
| `verificacion.worker.ts:41` (camino interno) | `GET /documentos/by-cdc/:cdc` | compartida | **consumidor** | **DEFECTO** |
| `facturas.routes.ts:357` (refresh manual) | `GET /documentos/:uuid/sifen` | compartida | compartida | Correcto |
| Resto (artefactos, eventos, nota de credito, consultar) | varias | compartida | compartida | Correcto |

El defecto es unico y esta acotado al worker de verificacion. El segundo caso es
el mismo punto de llamada: `refreshFiscalStatusForDocumento` invoca
`resolveDocumentoByCdc` con el mismo gateway cuando el documento no tiene
`document_uuid` local.

## Alcance Funcional

### 1) Correccion del defecto

- El worker de verificacion fiscal usa la clave compartida para todas sus
  llamadas al backend fiscal, igual que el endpoint manual de refresh que hoy
  funciona.
- La clave por facturador deja de participar del camino de verificacion.

### 2) Prevencion de recurrencia

- Queda registrado en el codigo, en el punto de decision, cual clase de clave
  corresponde a cada familia de rutas, con referencia a este SPEC.
- Un test unitario fija el comportamiento: el worker no debe construir un gateway
  con la clave del facturador.

### 3) Recuperacion de los documentos en cola

- Los 44 documentos en cola de produccion se resuelven **solos** en la siguiente
  pasada del worker una vez corregida la clave. No requieren accion manual ni
  migracion de datos.
- La verificacion post-deploy debe confirmar que la cola drena y que los 401
  desaparecen de los logs.

## Fuera De Alcance

- **Los 101 documentos `PENDIENTE_SIFEN` retirados de la cola por el corte de 30
  dias** (creados entre 2026-05-23 y 2026-07-23, de los cuales 43 no tienen
  `document_uuid`). Son anteriores al despliegue del worker F9 en produccion
  (imagen del 2026-08-15) y por lo tanto no los causo este defecto: arrastran de
  cuando no existia verificacion automatica. Requieren una decision propia
  (barrido puntual, resolucion por CDC, o cierre administrativo) y van a
  `docs/BACKLOG.md` como iniciativa separada.
- Rediseñar el cliente fiscal para que resuelva la clase de clave por ruta de
  forma centralizada (alineacion durable de F0). Se registra en `docs/BACKLOG.md`.
- Pedir a `facturacion-electronica` que mueva `/documentos/:uuid/sifen` al sistema
  de consumidores. Es una decision del backend fiscal, fuera del limite de dominio
  declarado en `AGENTS.md`.
- Cualquier cambio en el backoff, el corte de 30 dias o las notificaciones de F9.

## Criterios De Aceptacion

1. El worker de verificacion llama a `GET /documentos/:uuid/sifen` con la clave
   compartida y obtiene 200 contra el backend fiscal real.
2. Tras el deploy, no aparecen nuevos `verificacion fiscal worker: fallo al
   refrescar estado` con `status: 401` en los logs del api.
3. La cola de verificacion de produccion (44 documentos) baja: los documentos
   pasan a estado terminal o quedan reagendados con `sifen_last_checked_at`
   actualizado.
4. La emision (`POST /v1/factura`) sigue usando la clave de consumidor y sigue
   respondiendo 200: cero regresion en el outbox de emision.
5. Los recibos siguen usando la clave de consumidor por facturador: cero
   regresion en `/recibos/*`.
6. Existe un test unitario que falla si el worker vuelve a usar la clave del
   facturador.
