# OPERACION Paridad con facturacion-electronica v0.1

**Versión:** 0.1
**Fecha:** 2026-09-25
**Estado:** VIGENTE
**Alineación:** `SPEC_PARIDAD_CONTRATO_FE_v0.1.md` (RN-07, RN-08), `AGENTS.md` (Límite de Dominio)

Inventario de la relación entre este SaaS y el contrato de `facturacion-electronica`: qué
consumimos, qué decidimos no consumir y por qué, y de qué dependemos fuera del contrato publicado.

---

## 1. El límite, en una frase

> Este stack implementa **solo lo que `facturacion-electronica` publica como consumible externo** en
> `facturacion-electronica-consumer-docs`. No modifica FE, y no absorbe complejidad que pertenece a su
> dominio.

De ahí se derivan las decisiones de §3. Un endpoint que existe no es, por sí solo, una razón para
consumirlo: tiene que resolver algo del **dominio funcional de este producto** — tenants, usuarios,
facturadores operativos, clientes, catálogo, emisión simple y entrega al cliente final.

---

## 2. El principio del `document_uuid`

Es la razón por la que varias consultas de FE no nos hacen falta, y conviene tenerlo explícito porque
no es obvio.

**Usamos `document_uuid` como identidad del documento, no el CDC.**

- El `document_uuid` es **estable**: lo asigna FE al crear el documento y no cambia nunca.
- El **CDC puede cambiar**: si FE rehace un documento (derivación, reintento sobre rechazo), el CDC
  nuevo reemplaza al anterior. Es una decisión de FE, dentro de su dominio.

Consecuencia práctica, y es la que importa para el cliente final: **el link público que le
compartimos apunta a nuestro documento, que resuelve por `uuid`**. Cada vez que el cliente lo abre,
obtiene el XML y el KUDE **vigentes**, aunque el CDC haya cambiado entre medio. No hay links rotos ni
comprobantes desactualizados, y no necesitamos rastrear reemplazos de CDC para lograrlo.

Por eso nuestras lecturas de artefactos y de estado van siempre por
`/documentos/{uuid}/...` y no por las variantes `/{cdc}`.

---

## 3. Endpoints del contrato que NO consumimos

Los 16 del contrato de consumidor que este stack no llama, cada uno con su motivo (RN-07: la ausencia
de un endpoint no puede ser un descubrimiento futuro).

| Endpoint | Motivo |
|---|---|
| `GET /documentos/{uuid}/lineage` | **No es necesario.** Con el `uuid` alcanza para resolver XML y KUDE vigentes (§2). El linaje de CDC es información del dominio de FE; nuestro `documento_relacionado_id` ya cubre la relación factura ↔ nota de crédito, que es la única que el operador necesita ver |
| `GET /consultar/{id}/lotes` | **No es necesario.** La mecánica de lotes es complejidad de FE. Nuestro operador necesita saber si su documento está emitido, no en qué lote viajó |
| `GET /consultar/{id}/lotes/{protocol}` | Ídem anterior. El diagnóstico de un lote atascado se hace desde el backoffice de FE, que es donde vive esa información |
| `GET /consultar/ruc/{ruc}` | **Ya resuelto de otra forma.** El `dnit-ruc-loader` mantiene `dnit_ruc_contribuyentes` con el padrón completo, disponible sin depender de FE ni de la latencia de SIFEN |
| `GET /consultar/comprobante/{cdc}` | Consulta por CDC. Usamos `/documentos/{uuid}/sifen`, que es estable (§2) |
| `GET /consultar/comprobanteSifen/{cdc}` | Ídem: consulta por CDC |
| `GET /consultar/comprobantexml/{cdc}` | Ídem: el XML se pide por `uuid` |
| `GET /consultar/evento/{cdc}` | Los eventos se consultan por `/documentos/{uuid}/eventos` |
| `GET /files/kude/{cdc}.pdf` | Artefacto por CDC; usamos la variante por `uuid` |
| `GET /files/ticket/{cdc}/raw` | Formato ticket: sin caso de uso. Entregamos KUDE PDF y link público |
| `GET /files/xml/{cdc}` | Artefacto por CDC; usamos la variante por `uuid` |
| `GET /documentos/{uuid}/files/ticket/raw` | Formato ticket: sin caso de uso |
| `GET /documentos/{uuid}` | El documento canónico de FE. Nuestro modelo operativo ya guarda el snapshot que el operador necesita |
| `GET /documentos/{uuid}/xml` | Duplicado funcional de `/documentos/{uuid}/files/xml`, que sí usamos |
| `POST /evento/inutilizacionnumfactura` | La inutilización de rangos se hace hoy por `/admin/.../void-number` (ver §4). Migrar a esta ruta del contrato es deuda declarada |
| `POST /conciliacion/idempotency/cancel-send` | Sin caso de uso: el `cancel-send` local no genera conflictos de idempotencia que requieran conciliación |
| `GET /recibos`, `PATCH /recibos/{id}`, `DELETE /recibos/{id}` | El ciclo de vida del recibo lo maneja este SaaS; a FE le pedimos emisión, anulación y artefactos |

**Criterio común:** ninguno resuelve algo del dominio funcional de este producto que no esté ya
resuelto. Varios son variantes por CDC de endpoints que consumimos por `uuid`, y esa elección es
deliberada (§2).

---

## 4. Dependencias fuera del contrato de consumidor

Seis endpoints `/admin/emisores/{id}/facturas/{id}/*` que consumimos y que **no figuran en el contrato
de consumidor** de FE. Son superficie administrativa: requieren la clave compartida y su estabilidad
no está garantizada por el contrato publicado para integradores.

| Endpoint | Para qué lo usamos | ¿Equivalente publicado? | Riesgo |
|---|---|---|---|
| `POST .../cancel-send` | Cancelar el envío de un documento aún no transmitido | No | Medio: sin él, un documento encolado no se puede detener |
| `POST .../create-derived` | Crear un documento derivado tras un rechazo | No | Medio: es parte de la autogestión de rechazos |
| `GET .../decision` | Leer la decisión fiscal de un documento | No | Bajo: es diagnóstico de soporte |
| `POST .../retry-same-cdc` | Reintentar la emisión sobre el mismo CDC | No | Medio: recuperación de rechazos transitorios |
| `POST .../validate-cdc-impact` | Validar el impacto de un cambio antes de aplicarlo | No | Bajo: es una precaución previa a `create-derived` |
| `POST .../void-number` | Inutilizar un rango de numeración | **Sí**: `POST /evento/inutilizacionnumfactura` | Bajo: hay camino de migración |

**Todos están detrás del rol de soporte interno**, no del operador: un cliente nunca los alcanza.

**Riesgos declarados:**

1. **Estabilidad.** Si FE cambia o retira un endpoint administrativo, no hay contrato que nos proteja
   y nos enteraríamos en producción.
2. **Clave compartida.** Estos endpoints y `/documentos/{uuid}/sifen` exigen la clave compartida, no
   la del facturador. Ya produjo un `401` en la verificación fiscal automática de producción.
3. **Único equivalente disponible:** `void-number` → `/evento/inutilizacionnumfactura`. Migrarlo
   reduce la superficie administrativa de seis a cinco. Queda como deuda, no urgente.

**Qué corresponde hacer:** cuando FE publique equivalentes de consumidor para los cinco restantes, se
migran. Mientras tanto la dependencia queda declarada acá, que es mejor que descubrirla cuando falle.

---

## 5. Lo que sí consumimos

21 endpoints del contrato: emisión de facturas y notas de crédito, estado SIFEN por `uuid`, eventos,
artefactos KUDE y XML por `uuid`, cancelación, conciliación de idempotencia, `batch-pendientes`,
`facturalista`, recibos de dinero (crear, emitir, anular, PDF, XML), verificación pública de recibos y
`health`.

---

## 6. Qué NO hace este stack

- **No modifica `facturacion-electronica`.** Los problemas de su dominio se resuelven allá, con su
  propia cadena SDD. Ejemplo concreto: el documento `0000165` del emisor `80136968-1`, en `SENT_BATCH`
  desde el 2026-08-03, se resuelve en FE.
- **No replica lógica fiscal SIFEN** (`AGENTS.md`, Límite de Dominio).
- **No absorbe la mecánica de lotes**: nuestro operador necesita saber si su documento está emitido,
  no cómo viajó.
