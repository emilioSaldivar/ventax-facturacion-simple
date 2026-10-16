# PLAN Estado Fiscal Canonico v0.1

## Alineacion

- `docs/SPEC_ESTADO_FISCAL_CANONICO_v0.1.md` (RN-01 a RN-07, D-1 a D-4, CA-01 a CA-05)
- `AGENTS.md`

## Principios

- Un solo punto de cambio: `refreshFiscalStatusForDocumento()` (`facturas.service.ts`), que usan el boton manual, el worker F9 y la adopcion del reintento confirmado.
- La traduccion de estado vive en el gateway y parte del `status` canonico de FE. El servicio no interpreta codigos SIFEN.
- Sin migraciones.

## 1. Gateway (`apps/api/src/modules/fiscal-gateway/`)

**Tipos (`fiscal-gateway.types.ts`):**

```ts
export interface FiscalDocumentoCanonicoResponse {
  status: string | null;                 // DocumentStatus de FE, sin traducir
  estado: DocumentoEstadoFiscal | null;  // traduccion (§1.3); null si el status es desconocido
  current_cdc: string | null;
  nro_factura: string | null;
  raw: Record<string, unknown>;
}
```

`FiscalGateway` agrega `getDocumentoCanonico(documentUuid: string): Promise<FiscalDocumentoCanonicoResponse>`.

**Real (`RealFiscalGateway`):**
- `GET ${baseUrl}/documentos/${uuid}?env=${environment}` con `buildHeaders()`, es decir, la clave compartida, igual que `/documentos/{uuid}/sifen`.
- Si la respuesta no es OK, lanza `FiscalGatewayError` con la misma convencion que `refreshFacturaStatus` (`TIMEOUT` para 408/504 y `UPSTREAM_ERROR` para el resto).

**Traduccion (`mapDocumentStatusCanonico(status)`):** es la tabla de Definiciones del SPEC.
- `APPROVED` y `APPROVED_WITH_OBS` dan `EMITIDA`.
- `REJECTED` da `RECHAZADA`.
- `CANCELLED` y `VOIDED` dan `ANULADA`.
- Los estados en transito y `TRANSMISSION_FAILED` dan `PENDIENTE_SIFEN`.
- Un status desconocido o `null` da `null`, y el servicio conserva el estado actual.

**Mock (`MockFiscalGateway`):** devuelve `status: "APPROVED"`, para conservar el comportamiento actual del flujo mock (el refresh termina en `EMITIDA`).

**Refresh SIFEN:** `refreshFacturaStatus` se mantiene para obtener `result_code`/`result_message` (RN-02). Su campo `estado` deja de usarse para decidir el estado (CA-05). Se elimina `mapRefreshDocumentStatusWithCode`, y `estado` pasa a ser siempre `PENDIENTE_SIFEN` como valor neutro, documentado como "no usar para decidir". `isApprovedFiscalCode` queda solo para el mapeo de la respuesta de **emision**, que esta fuera de alcance.

## 2. Servicio (`refreshFiscalStatusForDocumento`)

1. Resolver `documentUuid`, igual que hoy: si falta, se busca por CDC.
2. **Paso SIFEN, best-effort:** `gateway.refreshFacturaStatus({ documentUuid })`. Si falla, se registra con `logger.warn` y se sigue, porque el paso canonico decide igual.
3. **Paso canonico, obligatorio:** `gateway.getDocumentoCanonico(documentUuid)`. Si falla, se propaga el error con la traduccion HTTP actual (504/502). Es el mismo comportamiento que hoy cuando falla la consulta.
4. Se calcula `estado = canonico.estado ?? documento.estado`.
5. `cdcActualizado` sale de `canonico.current_cdc ?? refreshed?.current_cdc`, solo si es distinto del actual (RN-03 vigente de la iniciativa de contrato canonico).
6. `repository.updateFiscalStatus({ estado, fiscalStatus: merge(snapshot, { canonical: canonico.raw, sifen: refreshed?.raw }), cdc, fiscalStatusRaw: canonico.status, sifenResultCode: refreshed?.result_code, sifenResultMessage: refreshed?.result_message })`.

## 3. Agenda sin huerfanos (RN-04)

En `updateFiscalStatus` (`facturas.repository.ts`):

```sql
verificacion_next_at = case
  when $3 in ('PENDIENTE_SIFEN', 'EMITIENDO') then coalesce(verificacion_next_at, now() + interval '5 minutes')
  else null
end
```

- Un documento no final que no tenia agenda queda agendado. Un documento final sale de la agenda.
- El worker sigue sobrescribiendo la agenda con su backoff despues del refresh (`scheduleNextVerificacion`), asi que su comportamiento no cambia.
- Un documento historico de mas de 30 dias solo entra a la agenda si un operador lo verifica a mano (RN-05). En ese caso el worker lo verifica una vez y lo vuelve a retirar por antiguedad.
- La causa exacta del caso staging `0000004` no se pudo reconstruir: solo tiene el audit de encolado. RN-04 cubre cualquier camino que deje un documento no final sin agenda tras un refresh.

## 4. Preparacion de produccion (D-4)

**Antes del deploy, con confirmacion explicita del usuario:**

```sql
update facturas_operativas set accion_notificada_at = now()
where fiscal_document_id = '2823'   -- 80044279-2 0000003, regularizada operativamente
  and accion_notificada_at is null;
```

- Efecto: la `0000003` de Ibanez pasa a "Rechazada" en la proxima verificacion agendada, porque es su estado real en FE, sin enviar correo (D-1, D-4).
- La `0000047` de `5057016-1` no se toca: es el caso de prueba y debe notificar.

## 5. Pruebas

- **Unitarias del gateway:** la tabla completa de `mapDocumentStatusCanonico`, incluidos el status desconocido y `null`.
- **Servicio, con fakes:**
  - `REJECTED` canonico con SIFEN `0420` da `RECHAZADA`, con `sifen_result_code` 0420 y `fiscal_status_raw = REJECTED`;
  - `APPROVED` canonico con SIFEN sin `0260`/`0422` da `EMITIDA`;
  - si el paso SIFEN falla y el canonico responde, actualiza igual;
  - si el canonico falla, da 502/504 sin actualizar;
  - con status desconocido, conserva el estado.
- **Worker:** un documento `REJECTED` notifica una sola vez; con `accion_notificada_at` ya marcado, no notifica.
- **Integracion con Postgres:** `updateFiscalStatus` agenda un `PENDIENTE_SIFEN` sin agenda y desagenda un `EMITIDA`.
- **Contenedores con Playwright** (FE mock en `REJECTED` para un documento sembrado), en mobile y desktop: el detalle muestra "Rechazada" con la causa del catalogo y no muestra "Reintentar emision" ni "Verificar estado fiscal" duplicado. El mock necesita poder devolver `REJECTED`: se agrega un selector por variable de entorno solo para el mock (`FE_MOCK_CANONICAL_STATUS`).

## 6. Despliegue

1. Staging: deploy y verificar la `0000004` de `4543629-0` (`REJECTED` en FE test, `0160`) con "Verificar estado fiscal". Debe quedar "Rechazada", con la causa "accion del usuario" del catalogo.
2. Produccion: el paso §4 con confirmacion, backup, deploy y readiness.
3. **Caso de prueba:** la `0000047` se verifica sola el 2026-10-16 13:34 UTC, o antes si el usuario presiona "Verificar estado fiscal". Se comprueba que queda "Rechazada", que `accion_notificada_at` queda marcado y que llega el correo.

## Riesgos

| Riesgo | Mitigacion |
|---|---|
| `GET /documentos/{uuid}` de FE no responde en algun ambiente | Smoke real en staging antes de prod, y el mismo chequeo sobre un documento de prod (solo lectura) antes del deploy |
| Un status nuevo de FE fuera del enum | La traduccion devuelve `null` y se conserva el estado; se loguea `warn` con el status |
| Un documento historico agendado cambia de estado y notifica | Solo 2 documentos historicos con agenda tienen discrepancia (D-4); el resto de la agenda ya coincide con FE |

## Diseno Realmente Adoptado (2026-10-15)

- **Snapshot fiscal:** se mantiene la respuesta SIFEN al nivel superior de `fiscal_status`, como hasta ahora, porque el frontend arma de ahi el resumen "Estado fiscal". El estado canonico va bajo la clave `canonical`. Es un desvio menor de §2.6, que proponia `{ canonical, sifen }`.
- **Mock:** `FE_MOCK_CANONICAL_STATUS` (default `APPROVED`) quedo en `env.ts`; el mock lo lee de `env`.
- **Presentacion:** un `RECHAZADA` se muestra al operador como "Requiere revision" con el aviso rojo de causa. Es la presentacion existente; no hubo cambios de frontend.
